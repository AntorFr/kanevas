import { LayoutGrid, ListTree, Plus } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { appeler, ErreurApi, lire } from '../api';
import { useCharge, useVue } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ, ErreurChargement, Fenetre, PageIntrouvable, VideIcone, useToasts } from '../ui';
import { MAX_SOUS_TYPE } from './fiche/sous-type';
import './ecrans.css';
import './fiche/fiche.css';
import './liste.css';
import { lireVue, memoriserVue, type VueListe } from './fiche/arbre';
import { etatDe } from './fiche/marque';
import { ListeRecherche } from './fiche/liste-recherche';
import { ChargementGrille } from './fiche/vignette';
import type { Fiche } from './fiche/types';
import { iconeDuType, typeParSlug, typesActifs, useTypes, type TypeVue } from '../types-contexte';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

/** E-8 Liste de fiches: one sheet type, 100 at a time; the GM creates. */
function ListeFiches() {
  const { id, type: slug } = useParams();
  return <Liste key={`${id}/${slug}`} universId={id!} slug={slug} />;
}

function Liste({ universId, slug }: { universId: string; slug: string | undefined }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [univers] = useCharge<UniversListe>(`/api/univers/${universId}`);
  const { types, etat: etatTypes, recharger: rechargerTypes } = useTypes();
  const [creation, setCreation] = useState(false);
  const { mode } = useVue();
  const [vues, setVues] = useState<Record<string, VueListe>>({});

  if (univers.etat === 'chargement' || (univers.etat === 'ok' && etatTypes === 'chargement')) {
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
  if (etatTypes === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les types." onReessayer={rechargerTypes} />;
  }
  const type = typeParSlug(types, slug);
  if (!type) return <PageIntrouvable />;
  const mj = univers.valeur.role === 'mj';
  const vue = vues[type.type] ?? lireVue(universId, type.type);
  const choisirVue = (v: VueListe) => {
    memoriserVue(universId, type.type, v);
    setVues((m) => ({ ...m, [type.type]: v }));
  };
  const nouveau = (
    <Bouton variante="principal" ecrit icone={Plus} title={type.nouveau} onClick={() => setCreation(true)}>
      <span className="lib-creer">{type.nouveau}</span>
    </Bouton>
  );

  return (
    <div className="page-liste page-grille">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <Glyphe type={type.type} />
        </span>
        <h1>{type.pluriel}</h1>
        {mj && type.active && nouveau}
      </header>
      {!type.active && <p className="note-type">Ce type est désactivé dans cet univers.</p>}
      <ListeRecherche
        universId={universId}
        type={type}
        vue={vue}
        suffixeMode={mj && mode === 'joueur' ? '&mode=joueur' : ''}
        bascule={<BasculeVue vue={vue} onChoix={choisirVue} />}
        recherche={params.get('q')?.trim() ?? ''}
        onRecherche={(q) => setParams((p) => majParam(p, 'q', q))}
        sousType={params.get('sousType') ?? ''}
        onSousType={(v) => setParams((p) => majParam(p, 'sousType', v))}
        etat={type.disparu ? etatDe(params.get('etat')) : ''}
        onEtat={(v) => setParams((p) => majParam(p, 'etat', v))}
        videListe={
          <VideIcone icone={iconeDuType(types, type.type)}>
            <p>{type.aucun} {mj ? 'pour l’instant.' : 'à voir pour l’instant.'}</p>
          </VideIcone>
        }
      />
      {creation && type.active && (
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

/** « Grille / Arbre » (E-8), kept per type in the browser. */
function BasculeVue({ vue, onChoix }: { vue: VueListe; onChoix: (v: VueListe) => void }) {
  return (
    <div className="bascule-vue" role="group" aria-label="Affichage">
      <button type="button" aria-pressed={vue === 'grille'} onClick={() => onChoix('grille')}>
        <LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />
        Grille
      </button>
      <button type="button" aria-pressed={vue === 'arbre'} onClick={() => onChoix('arbre')}>
        <ListTree size={16} strokeWidth={1.75} aria-hidden="true" />
        Arbre
      </button>
    </div>
  );
}

function majParam(p: URLSearchParams, cle: string, valeur: string) {
  const n = new URLSearchParams(p);
  if (valeur === '') n.delete(cle);
  else n.set(cle, valeur);
  return n;
}

function Glyphe({ type }: { type: string }) {
  const { types } = useTypes();
  const Icone = iconeDuType(types, type);
  return <Icone size={20} strokeWidth={1.75} />;
}


function FenetreCreation({
  universId,
  type: depart,
  onFermer,
  onCree,
}: {
  universId: string;
  type: TypeVue;
  onFermer: () => void;
  onCree: (f: Fiche) => void;
}) {
  const { types, recharger: rechargerTypes } = useTypes();
  const choix = typesActifs(types).filter((t) => t.reglable);
  const [typeChoisi, setTypeChoisi] = useState(depart.type);
  const type = choix.find((t) => t.type === typeChoisi) ?? choix[0] ?? depart;
  const [titre, setTitre] = useState('');
  const [sousType, setSousType] = useState('');
  const [deja, setDeja] = useState<string[]>([]);
  const [pj, setPj] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [erreurSousType, setErreurSousType] = useState<string>();
  const [echec, setEchec] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const { toast } = useToasts();
  const idListe = useId();

  // The sub-types already used for the chosen type, for the completion; a failure leaves the field free.
  useEffect(() => {
    let actif = true;
    setDeja([]);
    lire<{ sousTypes: { sousType: string }[] }>(`/api/univers/${universId}/sous-types?type=${type.type}`).then(
      (r) => actif && setDeja(r.sousTypes.map((s) => s.sousType)),
      () => {},
    );
    return () => {
      actif = false;
    };
  }, [universId, type.type]);

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const t = titre.trim();
    const st = sousType.trim();
    const eTitre = t === '' ? 'le titre est obligatoire.' : t.length > 120 ? '120 caractères au plus.' : undefined;
    const eSousType = Array.from(st).length > MAX_SOUS_TYPE ? `${MAX_SOUS_TYPE} caractères au plus.` : undefined;
    setErreur(eTitre);
    setErreurSousType(eSousType);
    if (eTitre || eSousType) return;
    setEchec(undefined);
    setEnCours(true);
    try {
      const f = await appeler<Fiche>('POST', `/api/univers/${universId}/fiches`, {
        type: type.type,
        titre: t,
        ...(st === '' ? {} : { sousType: st }),
        ...(type.type === 'personnage' ? { charge: { pj } } : {}),
      });
      toast(`« ${f.titre} » créée`);
      onCree(f);
    } catch (err) {
      if (err instanceof ErreurApi && err.code === 'type_desactive') {
        setEchec('Ce type est désactivé dans cet univers.');
        rechargerTypes();
      } else {
        setEchec(ECHEC);
      }
      setEnCours(false);
    }
  }

  return (
    <Fenetre titre={type.nouveau} onFermer={onFermer}>
      <form onSubmit={creer} noValidate>
        {echec && (
          <div className="echec" role="alert">
            {echec}
          </div>
        )}
        <Champ etiquette="Titre" value={titre} erreur={erreur} onChange={(e: { target: { value: string } }) => setTitre(e.target.value)} />
        <Champ
          etiquette="Type"
          liste
          value={type.type}
          onChange={(e: { target: { value: string } }) => {
            setTypeChoisi(e.target.value);
            setSousType('');
            setErreurSousType(undefined);
          }}
        >
          {choix.map((t) => (
            <option key={t.type} value={t.type}>
              {t.singulier}
            </option>
          ))}
        </Champ>
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
        <Champ
          etiquette="Sous-type"
          facultatif
          value={sousType}
          list={deja.length > 0 ? idListe : undefined}
          autoComplete="off"
          erreur={erreurSousType}
          onChange={(e: { target: { value: string } }) => {
            setSousType(e.target.value);
            setErreurSousType(undefined);
          }}
        />
        {deja.length > 0 && (
          <datalist id={idListe} title={`Sous-types de ${type.singulier.toLowerCase()} déjà employés`}>
            {deja.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
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
