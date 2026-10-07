import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { appeler } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ, ErreurChargement, Fenetre, PageIntrouvable, VideIcone, useToasts } from '../ui';
import './ecrans.css';
import './fiche/fiche.css';
import './liste.css';
import { ListeRecherche } from './fiche/liste-recherche';
import { ChargementGrille } from './fiche/vignette';
import type { Fiche } from './fiche/types';
import { iconeDuType, typeParSlug } from './fiche/types-fiche';

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
  const [params, setParams] = useSearchParams();
  const [univers] = useCharge<UniversListe>(`/api/univers/${universId}`);
  const [creation, setCreation] = useState(false);

  if (univers.etat === 'chargement') {
    return (
      <div className="page-liste page-grille">
        <ChargementGrille texte="Chargement des fiches…" />
      </div>
    );
  }
  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les fiches." onReessayer={() => window.location.reload()} />;
  }
  const mj = univers.valeur.role === 'mj';
  const nouveau = (
    <Bouton variante="principal" ecrit icone={Plus} onClick={() => setCreation(true)}>
      {type.nouveau}
    </Bouton>
  );

  return (
    <div className="page-liste page-grille">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <Glyphe type={type.type} />
        </span>
        <h1>{type.pluriel}</h1>
        {mj && nouveau}
      </header>
      <ListeRecherche
        universId={universId}
        type={type}
        recherche={params.get('q')?.trim() ?? ''}
        onRecherche={(q) => setParams(q === '' ? {} : { q })}
        videListe={
          <VideIcone icone={iconeDuType(type.type)}>
            <p>{type.aucun} {mj ? 'pour l’instant.' : 'à voir pour l’instant.'}</p>
          </VideIcone>
        }
      />
      {creation && (
        <FenetreCreation
          universId={universId}
          type={type}
          onFermer={() => setCreation(false)}
          onCree={(f) => navigate(`/univers/${universId}/fiche/${f.id}`)}
        />
      )}
    </div>
  );
}

function Glyphe({ type }: { type: string }) {
  const Icone = iconeDuType(type);
  return <Icone size={20} strokeWidth={1.75} />;
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
  const { toast } = useToasts();

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
      toast(`« ${f.titre} » créée`);
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
