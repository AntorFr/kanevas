import { Plus, Waypoints, X } from 'lucide-react';
import { useState } from 'react';

import { appeler, ErreurApi } from '../../../api';
import { useCharge } from '../../../cadre-contexte';
import { BlocSection as BlocUi, Bouton, BoutonIcone, Champ, Chargement, ErreurChargement, LigneRelation, useToasts } from '../../../ui';
import { iconeDuType } from '../types-fiche';
import type { BlocSection } from '../registre';
import { ListeRecherche } from '../liste-recherche';
import type { Fiche, PropsBlocSection } from '../types';
import { badgeFiche, TYPES_LORE } from '../types-fiche';
import './relations.css';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const LONGUEUR_TYPE = 80;

interface Relation {
  id: number;
  type: string;
  cible: { id: number; titre: string; type: string };
}

/** Refusals of the service shown as they come (their message is the screen text). */
const REFUS = new Set(['auto_relation', 'relation_existante', 'limite_relations']);

/**
 * E-9 block « Relations »: the relations carried by one section (B-10). The server already hides
 * the ones whose section or target the account cannot read (AD-64); a reader with nothing to see
 * gets no block at all. Only the GM relates and removes.
 */
function BlocRelations({ universId, fiche, section, role, suffixeMode = '' }: PropsBlocSection) {
  const mj = role === 'mj';
  const base = `/api/univers/${universId}/fiches/${fiche.id}/sections/${section.id}/relations`;
  const [etat, recharger] = useCharge<{ relations: Relation[] }>(`${base}${suffixeMode}`);
  const [ouvert, setOuvert] = useState(false);
  const [echec, setEchec] = useState<string>();
  const [retrait, setRetrait] = useState<number>();
  const { toast } = useToasts();

  if (etat.etat === 'chargement') return <Chargement texte="Chargement des relations…" />;
  if (etat.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les relations." onReessayer={recharger} />;
  }
  const { relations } = etat.valeur;
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
                  lien={r.type}
                  icone={iconeDuType(r.cible.type)}
                  cible={r.cible.titre}
                  type={badgeFiche(r.cible as Fiche)}
                  vers={`/univers/${universId}/fiche/${r.cible.id}`}
                  actions={
                    mj && (
                      <BoutonIcone
                        etiquette={`Retirer la relation ${r.type} → ${r.cible.titre}`}
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
  onFerme,
  onRelie,
}: {
  universId: number;
  url: string;
  onFerme: () => void;
  onRelie: (titre: string) => void;
}) {
  const [type, setType] = useState('');
  const [typeFiche, setTypeFiche] = useState(TYPES_LORE[0]!.type);
  const [recherche, setRecherche] = useState('');
  const [choix, setChoix] = useState<Fiche>();
  const [erreurType, setErreurType] = useState<string>();
  const [erreurChoix, setErreurChoix] = useState<string>();
  const [refus, setRefus] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const lore = TYPES_LORE.find((t) => t.type === typeFiche)!;

  async function relier() {
    if (enCours) return;
    const t = type.trim();
    const eType = t === '' ? 'le type de relation est obligatoire.' : t.length > LONGUEUR_TYPE ? `${LONGUEUR_TYPE} caractères au plus.` : undefined;
    const eChoix = choix === undefined ? 'choisissez une fiche.' : undefined;
    setErreurType(eType);
    setErreurChoix(eChoix);
    setRefus(undefined);
    if (eType || eChoix || choix === undefined) return;
    setEnCours(true);
    try {
      await appeler('POST', url, { cibleFicheId: choix.id, type: t });
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
      <Champ
        etiquette="Type de relation"
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
      <label className="champ">
        <span>Type de fiche</span>
        <select
          value={typeFiche}
          onChange={(e) => {
            setTypeFiche(e.target.value);
            setRecherche('');
            setChoix(undefined);
          }}
        >
          {TYPES_LORE.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
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
            <span className="badge-type">{badgeFiche(f)}</span>
          </button>
        )}
      />
      {erreurChoix && <div className="erreur">Erreur : {erreurChoix}</div>}
      <div className="actions">
        <Bouton variante="principal" ecrit enCours={enCours} disabled={choix === undefined} onClick={() => void relier()}>
          Relier
        </Bouton>
        <Bouton onClick={onFerme}>Annuler</Bouton>
      </div>
    </div>
  );
}

export default { id: 'relations', roles: ['mj', 'joueur'], rang: 10, composant: BlocRelations } satisfies BlocSection;
