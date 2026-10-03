import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { appeler, lire, useConnexionPerdue } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ, Chargement, ErreurChargement, Fenetre, PageIntrouvable } from '../ui';
import './ecrans.css';
import './fiche/fiche.css';
import type { Fiche, PageFiches } from './fiche/types';
import { badgeFiche, typeParSlug } from './fiche/types-fiche';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

/** E-8 Liste de fiches: one lore type, 100 at a time; the GM creates. */
function ListeFiches() {
  const { id, type: slug } = useParams();
  const typeLore = typeParSlug(slug);
  if (!typeLore) return <PageIntrouvable />;
  return <Liste key={`${id}/${slug}`} universId={id!} type={typeLore} />;
}

function Liste({ universId, type }: { universId: string; type: NonNullable<ReturnType<typeof typeParSlug>> }) {
  const navigate = useNavigate();
  const perdue = useConnexionPerdue();
  const [univers] = useCharge<UniversListe>(`/api/univers/${universId}`);
  const base = `/api/univers/${universId}/fiches?type=${type.type}`;
  const [page, recharger] = useCharge<PageFiches>(base);
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [suivant, setSuivant] = useState<string | null>(null);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const [creation, setCreation] = useState(false);

  useEffect(() => {
    if (page.etat === 'ok') {
      setFiches(page.valeur.fiches);
      setSuivant(page.valeur.suivant);
    }
  }, [page]);

  if (page.etat === 'chargement' || univers.etat === 'chargement') return <Chargement texte="Chargement des fiches…" />;
  if (
    (page.etat === 'erreur' && page.statut === 404) ||
    (univers.etat === 'erreur' && univers.statut === 404)
  ) {
    return <PageIntrouvable />;
  }
  if (page.etat === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les fiches." onReessayer={recharger} />;
  }
  const mj = univers.valeur.role === 'mj';

  async function chargerSuite() {
    if (suiteEnCours || suivant === null) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageFiches>(`${base}&curseur=${encodeURIComponent(suivant)}`);
      setFiches((l) => [...l, ...p.fiches]);
      setSuivant(p.suivant);
    } catch {
      setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  return (
    <>
      <div className="entete-liste">
        <h1>{type.pluriel}</h1>
        {mj && fiches.length > 0 && (
          <Bouton variante="principal" ecrit onClick={() => setCreation(true)}>
            {type.nouveau}
          </Bouton>
        )}
      </div>
      {fiches.length === 0 ? (
        <div className="etat">
          <p>{type.aucun} {mj ? 'pour l’instant.' : 'à voir pour l’instant.'}</p>
          {mj && (
            <Bouton variante="principal" ecrit onClick={() => setCreation(true)}>
              {type.nouveau}
            </Bouton>
          )}
        </div>
      ) : (
        <ul className="liste-fiches">
          {fiches.map((f) => (
            <li key={f.id}>
              <Link to={`/univers/${universId}/fiche/${f.id}`}>
                <span className="titre-fiche" title={f.titre}>
                  {f.titre}
                </span>
                <span className="badge-type">{badgeFiche(f)}</span>
              </Link>
            </li>
          ))}
        </ul>
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
      {creation && (
        <FenetreCreation
          universId={universId}
          type={type}
          onFermer={() => setCreation(false)}
          onCree={(f) => navigate(`/univers/${universId}/fiche/${f.id}`)}
        />
      )}
    </>
  );
}

function FenetreCreation({
  universId,
  type,
  onFermer,
  onCree,
}: {
  universId: string;
  type: NonNullable<ReturnType<typeof typeParSlug>>;
  onFermer: () => void;
  onCree: (f: Fiche) => void;
}) {
  const [titre, setTitre] = useState('');
  const [pj, setPj] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [echec, setEchec] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const t = titre.trim();
    if (t === '') return setErreur('le titre est obligatoire.');
    if (t.length > 120) return setErreur('120 caractères au plus.');
    setErreur(undefined);
    setEchec(false);
    setEnCours(true);
    try {
      const f = await appeler<Fiche>('POST', `/api/univers/${universId}/fiches`, {
        type: type.type,
        titre: t,
        ...(type.type === 'personnage' ? { charge: { pj } } : {}),
      });
      onCree(f);
    } catch {
      setEchec(true);
      setEnCours(false);
    }
  }

  return (
    <Fenetre titre={type.nouveau} onFermer={onFermer}>
      <form onSubmit={creer} noValidate>
        {echec && (
          <div className="echec" role="alert">
            {ECHEC}
          </div>
        )}
        <Champ etiquette="Titre" value={titre} erreur={erreur} onChange={(e: { target: { value: string } }) => setTitre(e.target.value)} />
        {type.type === 'personnage' && (
          <div className="choix" role="radiogroup" aria-label="Nature du personnage">
            <label>
              <input type="radio" name="nature" checked={pj} onChange={() => setPj(true)} /> PJ
            </label>
            <label>
              <input type="radio" name="nature" checked={!pj} onChange={() => setPj(false)} /> PNJ
            </label>
          </div>
        )}
        <div className="actions">
          <Bouton type="submit" variante="principal" ecrit enCours={enCours}>
            Créer la fiche
          </Bouton>
          <Bouton onClick={onFermer}>Annuler</Bouton>
        </div>
      </form>
    </Fenetre>
  );
}

export default { chemin: '/univers/:id/fiches/:type', composant: ListeFiches } satisfies Ecran;
