import { Search, SearchX, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { lire, useConnexionPerdue } from '../../api';
import { useCharge } from '../../cadre-contexte';
import { Bouton, Champ, ChargementListe, ErreurChargement, PageIntrouvable, VideIcone } from '../../ui';
import '../liste.css';
import type { Fiche, PageFiches } from './types';
import { badgeFiche, type TypeLore } from './types-fiche';

/** Longest search the server accepts (B-11). */
export const LONGUEUR_RECHERCHE = 100;

const articles: Record<string, string> = {
  personnage: 'les personnages',
  lieu: 'les lieux',
  faction: 'les factions',
  objet: 'les objets',
  evenement: 'les événements',
  quete: 'les quêtes',
};
const dans = (type: TypeLore) => articles[type.type] ?? type.pluriel.toLowerCase();

interface Props {
  universId: string;
  type: TypeLore;
  /** The search in force (empty = the whole list). The caller owns it: address, local state… */
  recherche: string;
  onRecherche: (recherche: string) => void;
  /** Content of one row; by default a link to the sheet with its badge. */
  ligne?: (f: Fiche) => ReactNode;
  /** Shown between the field and the results, except on the empty plain list (`videListe` holds it then). */
  action?: ReactNode;
  /** The plain list (no search) has no sheet. */
  videListe: ReactNode;
}

/** The list of one lore type with its search field (E-8); reused by the « Relier » form of E-9. */
export function ListeRecherche({ universId, type, recherche, onRecherche, ligne, action, videListe }: Props) {
  const perdue = useConnexionPerdue();
  const [saisie, setSaisie] = useState(recherche);
  const [erreur, setErreur] = useState<string>();

  // The search in force changed from outside (back button): the field follows.
  useEffect(() => {
    setSaisie(recherche);
    setErreur(undefined);
  }, [recherche]);

  function chercher(e?: FormEvent) {
    e?.preventDefault();
    if (perdue) return;
    const t = saisie.trim();
    if (t.length > LONGUEUR_RECHERCHE) return setErreur(`${LONGUEUR_RECHERCHE} caractères au plus.`);
    setErreur(undefined);
    if (t === '') setSaisie('');
    onRecherche(t);
  }

  function effacer() {
    setSaisie('');
    setErreur(undefined);
    onRecherche('');
  }

  function touche(e: KeyboardEvent) {
    if (e.key === 'Enter') chercher(e as unknown as FormEvent);
  }

  const base = `/api/univers/${universId}/fiches?type=${type.type}`;
  const chemin = recherche === '' ? base : `${base}&q=${encodeURIComponent(recherche)}`;
  const etiquette = `Chercher dans ${dans(type)}`;

  return (
    <>
      <form className="recherche" onSubmit={chercher} noValidate role="search">
        <div className="champ-recherche">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <Champ
            etiquette={etiquette}
            zone
            rows={1}
            placeholder={etiquette}
            value={saisie}
            erreur={erreur}
            onChange={(e: { target: { value: string } }) => setSaisie(e.target.value)}
            onKeyDown={touche}
          />
        </div>
        <div className="actions">
          <Bouton type="submit" disabled={perdue}>
            Chercher
          </Bouton>
          {recherche !== '' && (
            <Bouton variante="fantome" icone={X} onClick={effacer}>
              Effacer la recherche
            </Bouton>
          )}
        </div>
      </form>
      <Resultats
        key={chemin}
        chemin={chemin}
        universId={universId}
        type={type}
        recherche={recherche}
        ligne={ligne}
        action={action}
        videListe={videListe}
        onEffacer={effacer}
      />
    </>
  );
}

function Resultats({
  chemin,
  universId,
  type,
  recherche,
  ligne,
  action,
  videListe,
  onEffacer,
}: Pick<Props, 'universId' | 'type' | 'recherche' | 'ligne' | 'action' | 'videListe'> & {
  chemin: string;
  onEffacer: () => void;
}) {
  const perdue = useConnexionPerdue();
  const [page, recharger] = useCharge<PageFiches>(chemin);
  const [suite, setSuite] = useState<{ fiches: Fiche[]; suivant: string | null } | null>(null);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const cherche = recherche !== '';

  if (page.etat === 'chargement') return <ChargementListe texte={cherche ? 'Recherche…' : 'Chargement des fiches…'} />;
  if (page.etat === 'erreur' && page.statut === 404) return <PageIntrouvable />;
  if (page.etat === 'erreur') {
    return (
      <ErreurChargement
        texte={cherche ? 'Impossible de lancer la recherche.' : 'Impossible de charger les fiches.'}
        onReessayer={recharger}
      />
    );
  }
  const fiches = [...page.valeur.fiches, ...(suite?.fiches ?? [])];
  const suivant = suite ? suite.suivant : page.valeur.suivant;

  async function chargerSuite() {
    if (suiteEnCours || suivant === null) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageFiches>(`${chemin}&curseur=${encodeURIComponent(suivant)}`);
      setSuite((s) => ({ fiches: [...(s?.fiches ?? []), ...p.fiches], suivant: p.suivant }));
    } catch {
      setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  return (
    <>
      {fiches.length === 0 && !cherche ? (
        videListe
      ) : (
        <>
          {action}
          {fiches.length === 0 ? (
            <VideIcone icone={SearchX}>
              <p>
                Aucun résultat pour « {recherche} » dans {dans(type)}.
              </p>
              <Bouton onClick={onEffacer}>Effacer la recherche</Bouton>
            </VideIcone>
          ) : (
            <ul className="liste-fiches">
              {fiches.map((f) => (
                <li key={f.id}>
                  {ligne ? (
                    ligne(f)
                  ) : (
                    <Link to={`/univers/${universId}/fiche/${f.id}`} data-initiale={[...f.titre][0]?.toUpperCase()}>
                      <span className="titre-fiche" title={f.titre}>
                        {f.titre}
                      </span>
                      <span className="badge-type">{badgeFiche(f)}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {suiteEchec && (
        <div className="echec" role="alert">
          Impossible de charger la suite.
        </div>
      )}
      {suivant !== null && (
        <Bouton ecrit={false} enCours={suiteEnCours} onClick={chargerSuite} disabled={perdue}>
          Charger la suite
        </Bouton>
      )}
    </>
  );
}
