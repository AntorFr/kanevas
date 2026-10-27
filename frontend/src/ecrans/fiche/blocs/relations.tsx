import { Plus, Waypoints, X } from 'lucide-react';
import { useState } from 'react';

import { appeler, ErreurApi } from '../../../api';
import { useCharge } from '../../../cadre-contexte';
import { BlocSection as BlocUi, Bouton, BoutonIcone, Champ, Chargement, ErreurChargement, LigneRelation, useToasts } from '../../../ui';
import { badgeFiche, iconeDuType, libelleDuType, typesActifs, useTypes } from '../../../types-contexte';
import type { BlocSection } from '../registre';
import { ListeRecherche } from '../liste-recherche';
import type { Fiche, PropsBlocSection } from '../types';
import './relations.css';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const LONGUEUR_TYPE = 80;

interface Relation {
  id: number;
  /** Key of the nature, '' for a free relation. */
  nature: string;
  qualificatif: string;
  cible: { id: number; titre: string; type: string };
}

/** Refusals of the service shown as they come (their message is the screen text). */
const REFUS = new Set(['auto_relation', 'relation_existante', 'limite_relations', 'nature_incompatible']);

/** A nature as `GET /api/univers/:id/natures` sends it (AD-128): the server owns the list. */
interface Nature {
  cle: string;
  libelleSource: string;
  typesSource: string[];
  typesCible: string[];
}

/**
 * E-9 block « Relations »: the relations carried by one section (B-10). The server already hides
 * the ones whose section or target the account cannot read (AD-64); a reader with nothing to see
 * gets no block at all. Only the GM relates and removes.
 */
function BlocRelations({ universId, fiche, section, role, suffixeMode = '' }: PropsBlocSection) {
  const { types } = useTypes();
  const mj = role === 'mj';
  const base = `/api/univers/${universId}/fiches/${fiche.id}/sections/${section.id}/relations`;
  const [etat, recharger] = useCharge<{ relations: Relation[] }>(`${base}${suffixeMode}`);
  const [etatNatures, rechargerNatures] = useCharge<{ natures: Nature[] }>(`/api/univers/${universId}/natures`);
  const natures = etatNatures.etat === 'ok' ? etatNatures.valeur.natures : [];
  const libelleNature = (cle: string) => natures.find((n) => n.cle === cle)?.libelleSource ?? '';
  const [ouvert, setOuvert] = useState(false);
  const [echec, setEchec] = useState<string>();
  const [retrait, setRetrait] = useState<number>();
  const { toast } = useToasts();

  if (etat.etat === 'chargement') return <Chargement texte="Chargement des relations…" />;
  if (etat.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les relations." onReessayer={recharger} />;
  }
  const { relations } = etat.valeur;
  const intitule = (r: Relation) => {
    const n = libelleNature(r.nature);
    return n ? (r.qualificatif ? `${n} · ${r.cible.titre} — ${r.qualificatif}` : `${n} · ${r.cible.titre}`) : `${r.qualificatif} → ${r.cible.titre}`;
  };
  if (!mj && relations.length === 0) return null;

  async function retirer(r: Relation) {
    if (retrait !== undefined) return;
    setRetrait(r.id);
    setEchec(undefined);
    try {
      await appeler('DELETE', `/api/univers/${universId}/fiches/relations/${r.id}`);
      recharger();
      toast(`Relation vers « ${r.cible.titre} » retirée`);
    } catch {
      setEchec(ECHEC);
    } finally {
      setRetrait(undefined);
    }
  }

  return (
    <BlocUi libelle="Relations" icone={Waypoints} vide={relations.length === 0 ? 'Aucune relation pour l’instant.' : undefined}>
      <div className="relations">
        {relations.length > 0 && (
          <ul className="liste-relations">
            {relations.map((r) => (
              <li key={r.id}>
                <LigneRelation
                  lien={libelleNature(r.nature) || r.qualificatif}
                  qualificatif={libelleNature(r.nature) ? r.qualificatif : undefined}
                  icone={iconeDuType(types, r.cible.type)}
                  cible={r.cible.titre}
                  type={libelleDuType(types, r.cible.type)}
                  vers={`/univers/${universId}/fiche/${r.cible.id}`}
                  actions={
                    mj && (
                      <BoutonIcone
                        etiquette={`Retirer la relation ${intitule(r)}`}
                        infobulle="Retirer"
                        icone={X}
                        danger
                        ecrit
                        disabled={retrait === r.id}
                        onClick={() => void retirer(r)}
                      />
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {echec && !ouvert && (
          <div className="alerte" role="alert">
            <span>{echec}</span>
          </div>
        )}
        {mj &&
          (ouvert ? (
            <FormulaireRelier
              universId={universId}
              url={base}
              typeFiche={fiche.type}
              natures={etatNatures.etat === 'ok' ? natures : undefined}
              erreurNatures={etatNatures.etat === 'erreur'}
              onReessayerNatures={rechargerNatures}
              onFerme={() => setOuvert(false)}
              onRelie={(titre) => {
                setOuvert(false);
                recharger();
                toast(`« ${section.titre} » reliée à « ${titre} »`);
              }}
            />
          ) : (
            <Bouton variante="fantome" petit ecrit icone={Plus} onClick={() => setOuvert(true)}>
              Relier à une fiche
            </Bouton>
          ))}
      </div>
    </BlocUi>
  );
}

function FormulaireRelier({
  universId,
  url,
  typeFiche: typeSource,
  natures,
  erreurNatures,
  onReessayerNatures,
  onFerme,
  onRelie,
}: {
  universId: number;
  url: string;
  typeFiche: string;
  /** Undefined while loading (or failed). */
  natures: Nature[] | undefined;
  erreurNatures: boolean;
  onReessayerNatures: () => void;
  onFerme: () => void;
  onRelie: (titre: string) => void;
}) {
  const [type, setType] = useState('');
  // '' is « Sans nature ». The first nature of the sheet's type is preselected until the user chooses.
  const proposees = (natures ?? []).filter((n) => n.typesSource.includes(typeSource));
  const [natureChoisie, setNatureChoisie] = useState<string>();
  const nature = natureChoisie !== undefined && (natureChoisie === '' || proposees.some((n) => n.cle === natureChoisie)) ? natureChoisie : (proposees[0]?.cle ?? '');
  const cibles = proposees.find((n) => n.cle === nature)?.typesCible;
  const { types: tous, etat: etatTypes, recharger: rechargerTypes } = useTypes();
  // The types one can relate to: the enabled ones, the session report (its own screen) aside.
  const choixTypes = typesActifs(tous).filter((t) => t.reglable && (cibles === undefined || cibles.includes(t.type)));
  const [typeChoisi, setTypeFiche] = useState('');
  const [recherche, setRecherche] = useState('');
  const [choixBrut, setChoix] = useState<Fiche>();
  // Changing the nature keeps the pick if its type still fits, else empties it.
  const choix = choixBrut && choixTypes.some((t) => t.type === choixBrut.type) ? choixBrut : undefined;
  const [erreurType, setErreurType] = useState<string>();
  const [erreurChoix, setErreurChoix] = useState<string>();
  const [refus, setRefus] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const typeFiche = choixTypes.some((t) => t.type === typeChoisi) ? typeChoisi : (choixTypes[0]?.type ?? '');
  const lore = choixTypes.find((t) => t.type === typeFiche);

  async function relier() {
    if (enCours) return;
    const t = type.trim();
    const eType = t === '' && nature === '' ? 'le qualificatif est obligatoire sans nature.' : t.length > LONGUEUR_TYPE ? `${LONGUEUR_TYPE} caractères au plus.` : undefined;
    const eChoix = choix === undefined ? 'choisissez une fiche.' : undefined;
    setErreurType(eType);
    setErreurChoix(eChoix);
    setRefus(undefined);
    if (eType || eChoix || choix === undefined) return;
    setEnCours(true);
    try {
      await appeler('POST', url, { cibleFicheId: choix.id, nature: nature === '' ? null : nature, qualificatif: t });
      onRelie(choix.titre);
    } catch (err) {
      setRefus(err instanceof ErreurApi && err.code && REFUS.has(err.code) ? err.message : ECHEC);
      setEnCours(false);
    }
  }

  return (
    <div className="formulaire-relation" role="group" aria-label="Relier à une fiche">
      {refus && (
        <div className="echec" role="alert">
          {refus}
        </div>
      )}
      {natures === undefined && !erreurNatures && <Chargement texte="Chargement…" />}
      {erreurNatures && <ErreurChargement texte="Impossible de charger les natures." onReessayer={onReessayerNatures} />}
      {natures !== undefined && proposees.length > 0 && (
        <Champ
          etiquette="Nature"
          liste
          value={nature}
          onChange={(e: { target: { value: string } }) => {
            setNatureChoisie(e.target.value);
            setRecherche('');
            setErreurType(undefined);
          }}
        >
          {proposees.map((n) => (
            <option key={n.cle} value={n.cle}>
              {n.libelleSource}
            </option>
          ))}
          <option value="">Sans nature</option>
        </Champ>
      )}
      <Champ
        etiquette="Type de fiche"
        liste
        value={typeFiche}
        onChange={(e: { target: { value: string } }) => {
          setTypeFiche(e.target.value);
          setRecherche('');
          setChoix(undefined);
        }}
      >
        {choixTypes.map((t) => (
          <option key={t.type} value={t.type}>
            {t.singulier}
          </option>
        ))}
      </Champ>
      {!lore && etatTypes === 'erreur' && <ErreurChargement texte="Impossible de charger les types." onReessayer={rechargerTypes} />}
      {!lore && etatTypes === 'chargement' && <Chargement texte="Chargement des types…" />}
      {lore && (
      <ListeRecherche
        universId={String(universId)}
        type={lore}
        recherche={recherche}
        onRecherche={(r) => {
          setRecherche(r);
          setChoix(undefined);
        }}
        videListe={<p>{lore.aucun} à relier.</p>}
        ligne={(f) => (
          <button
            type="button"
            className="choix-fiche"
            aria-pressed={choix?.id === f.id}
            onClick={() => {
              setChoix(f);
              setErreurChoix(undefined);
            }}
          >
            <span className="puce" aria-hidden="true" />
            <span className="titre-fiche" title={f.titre}>
              {f.titre}
            </span>
            <span className="badge-type">{badgeFiche(tous, f)}</span>
          </button>
        )}
      />
      )}
      <Champ
        etiquette="Qualificatif"
        placeholder="habite, capitaine…"
        value={type}
        onKeyDown={(e: { key: string; preventDefault: () => void }) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void relier();
          }
        }}
        erreur={erreurType}
        onChange={(e: { target: { value: string } }) => {
          setType(e.target.value);
          setErreurType(undefined);
        }}
      />
      {erreurChoix && <div className="erreur">Erreur : {erreurChoix}</div>}
      <div className="actions">
        <Bouton onClick={onFerme}>Annuler</Bouton>
        <Bouton variante="principal" ecrit enCours={enCours} disabled={choix === undefined} onClick={() => void relier()}>
          Relier
        </Bouton>
      </div>
    </div>
  );
}

export default { id: 'relations', roles: ['mj', 'joueur'], rang: 10, composant: BlocRelations } satisfies BlocSection;
