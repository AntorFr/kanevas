import { Search, SearchX, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

import { lire, useConnexionPerdue } from '../../api';
import { useCharge } from '../../cadre-contexte';
import { Bouton, Champ, ChargementListe, ErreurChargement, PageIntrouvable, VideIcone } from '../../ui';
import '../liste.css';
import type { Fiche, PageFiches } from './types';
import type { TypeVue } from '../../types-contexte';
import { CarteFiche, ChargementGrille } from './vignette';

/** Longest search the server accepts (B-11). */
export const LONGUEUR_RECHERCHE = 100;

const dans = (type: TypeVue) => `les ${type.pluriel.toLowerCase()}`;

interface Props {
  universId: string;
  type: TypeVue;
  /** The sub-type filter in force (E-8); with `onSousType` the filter is offered. */
  sousType?: string;
  onSousType?: (sousType: string) => void;
  /** The search in force (empty = the whole list). The caller owns it: address, local state… */
  recherche: string;
  onRecherche: (recherche: string) => void;
  /** Content of one row of a plain list; by default the grid of cards (E-8). */
  ligne?: (f: Fiche) => ReactNode;
  /** Shown between the field and the results, except on the empty plain list (`videListe` holds it then). */
  action?: ReactNode;
  /** The plain list (no search) has no sheet. */
  videListe: ReactNode;
}

/** The list of one lore type with its search field (E-8); reused by the « Relier » form of E-9. */
export function ListeRecherche({ universId, type, recherche, onRecherche, sousType = '', onSousType, ligne, action, videListe }: Props) {
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
  const avecSousType = sousType === '' ? base : `${base}&sousType=${encodeURIComponent(sousType)}`;
  const chemin = recherche === '' ? avecSousType : `${avecSousType}&q=${encodeURIComponent(recherche)}`;
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
        {onSousType && <FiltreSousType universId={universId} type={type} valeur={sousType} onChoix={onSousType} />}
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
        sousType={sousType}
        onSousType={onSousType}
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
  sousType = '',
  onSousType,
  ligne,
  action,
  videListe,
  onEffacer,
}: Pick<Props, 'universId' | 'type' | 'recherche' | 'sousType' | 'onSousType' | 'ligne' | 'action' | 'videListe'> & {
  chemin: string;
  onEffacer: () => void;
}) {
  const perdue = useConnexionPerdue();
  const [page, recharger] = useCharge<PageFiches>(chemin);
  const [suite, setSuite] = useState<{ fiches: Fiche[]; suivant: string | null } | null>(null);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const cherche = recherche !== '';

  if (page.etat === 'chargement') {
    const texte = cherche ? 'Recherche…' : 'Chargement des fiches…';
    return ligne ? <ChargementListe texte={texte} /> : <ChargementGrille texte={texte} />;
  }
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
      {fiches.length === 0 && !cherche && sousType !== '' ? (
        <VideIcone icone={SearchX}>
          <p>Aucune fiche de ce sous-type.</p>
          <Bouton onClick={() => onSousType?.('')}>Voir tous {dans(type)}</Bouton>
        </VideIcone>
      ) : fiches.length === 0 && !cherche ? (
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
            <ul className={ligne ? 'liste-fiches' : 'grille-fiches'}>
              {fiches.map((f) => (
                <li key={f.id}>{ligne ? ligne(f) : <CarteFiche universId={universId} fiche={f} />}</li>
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

interface SousTypeCompte {
  sousType: string;
  nb: number;
}

const compte = (n: number) => (n > 9999 ? '9 999+' : String(n));

/** The « Sous-type » filter of E-8: the sub-types of the sheets of the type the reader sees, with their count. */
function FiltreSousType({
  universId,
  type,
  valeur,
  onChoix,
}: {
  universId: string;
  type: TypeVue;
  valeur: string;
  onChoix: (sousType: string) => void;
}) {
  const [etat] = useCharge<{ sousTypes: SousTypeCompte[] }>(`/api/univers/${universId}/sous-types?type=${type.type}`);
  if (etat.etat === 'chargement') {
    return (
      <div className="filtre-sous-type">
        <Champ etiquette="Sous-type" liste disabled value="" onChange={() => {}}>
          <option value="">Sous-type : …</option>
        </Champ>
      </div>
    );
  }
  if (etat.etat === 'erreur') {
    return (
      <div className="filtre-sous-type">
        <p className="indispo" role="status">
          Sous-types indisponibles.
        </p>
      </div>
    );
  }
  const liste = etat.valeur.sousTypes;
  // Hidden when no readable sheet carries one — unless one is filtered (it must stay clearable).
  if (liste.length === 0 && valeur === '') return null;
  const inconnu = valeur !== '' && !liste.some((s) => s.sousType === valeur);
  return (
    <div className="filtre-sous-type">
      <Champ etiquette="Sous-type" liste value={valeur} onChange={(e: { target: { value: string } }) => onChoix(e.target.value)}>
        <option value="">Tous</option>
        {inconnu && <option value={valeur}>{valeur}</option>}
        {liste.map((s) => (
          <option key={s.sousType} value={s.sousType} title={s.sousType}>
            {s.sousType} ({compte(s.nb)})
          </option>
        ))}
      </Champ>
    </div>
  );
}
