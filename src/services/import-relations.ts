import { avecContexte } from './historique.js';
import type { Db } from '../db/db.js';
import { exigerMJ } from './droits.js';
import { ErreurService, introuvable } from './erreurs.js';
import { cleValide } from './import.js';
import type { JetonRequete as Jeton } from './jetons.js';
import { lireLot, noterDansLot, type EntreeRapport, type Issue } from './lots.js';
import { estId } from './cles-forme.js';
import { lireFicheApi } from './lecture-api.js';
import { lirePrecondition, sousPrecondition, type CompteLot } from './precondition.js';
import {
  empreinteDeRelation,
  lireRelationLisible,
  lireRelationParId,
  modifierRelation,
  relierSection,
  retirerRelation,
  trouverRelationExistante,
} from './relations.js';

export interface ResultatRelationImport {
  section?: string;
  cible?: string;
  nature?: string;
  qualificatif?: string;
  /** Deprecated spelling of `qualificatif`, echoed as sent. */
  type?: string;
  /** The field a refusal is about, when it is one (`nature`). */
  champ?: string;
  id?: number;
  /** Fingerprint of the relation (AD-139), for `creee` and `inchangee`. */
  empreinte?: string;
  etat: 'creee' | 'inchangee' | 'ignoree' | 'refusee';
  code?: string;
  avertissements: string[];
  raison?: string;
}

/** Each entry commits independently: a refused neighbour cannot undo a successful relation (AD-121). */
export function assurerRelations(
  db: Db, jeton: Jeton, lotId: number | null, cle: string, corps: unknown, maintenant: Date = new Date(),
): ResultatRelationImport[] {
  const { universId, compteId } = jeton;
  exigerMJ(db, universId, compteId);
  if (lotId !== null && lireLot(db, jeton, lotId, maintenant).closLe !== null) {
    throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
  }
  if (!cleValide(cle)) throw new ErreurService('invalide', "clé d'origine invalide", undefined, 'cle');
  if (!Array.isArray(corps)) throw new ErreurService('invalide', 'relations : une liste est attendue', undefined, 'corps');
  const source = db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle = ?')
    .get(universId, cle) as { id: number } | undefined;
  if (!source) throw introuvable();

  return corps.map((brut: unknown) => avecContexte(db, { compteId: jeton.compteId, jetonId: jeton.id, origine: 'import', lotId }, (): ResultatRelationImport => {
    const b = typeof brut === 'object' && brut !== null && !Array.isArray(brut)
      ? brut as Record<string, unknown> : {};
    const entree = {
      section: typeof b.section === 'string' ? b.section : undefined,
      cible: typeof b.cible === 'string' ? b.cible : undefined,
      nature: typeof b.nature === 'string' ? b.nature.trim() : undefined,
      qualificatif: typeof b.qualificatif === 'string' ? b.qualificatif.trim() : undefined,
      type: typeof b.type === 'string' ? b.type.trim() : undefined,
    };
    const champsTextes = ['nature', 'qualificatif', 'type'].every((k) => b[k] === undefined || b[k] === null || typeof b[k] === 'string');
    // `type` is the deprecated name of `qualificatif` (AD-134): read as such when it is alone.
    const deprecie = entree.type !== undefined && entree.qualificatif === undefined;
    const qualificatif = deprecie ? entree.type : entree.qualificatif;
    const nature = entree.nature ?? '';
    const noter = (issue: Issue | null, raison?: string, code?: string) => {
      const rapport: EntreeRapport[] = raison ? [{
        cle, objet: 'relation', raison, ...(code ? { code } : {}),
        gravite: issue === 'refusees' ? 'refus' : 'avertissement',
      }] : [];
      if (lotId !== null) noterDansLot(db, lotId, 'relations', issue, rapport, maintenant);
    };
    const refuser = (raison: string, code = 'invalide', champ?: string): ResultatRelationImport => {
      noter('refusees', raison, code);
      return { ...entree, etat: 'refusee', code, raison, ...(champ ? { champ } : {}), avertissements: [] };
    };
    // Answered to the script only: the deprecation does not weigh on the batch's warning count.
    const AVERTISSEMENT_TYPE = 'type est déprécié, utilisez qualificatif';
    const avertissements = deprecie ? [AVERTISSEMENT_TYPE] : [];
    if (!entree.section || !cleValide(entree.section) || !entree.cible || !cleValide(entree.cible)
      || !champsTextes || (entree.type !== undefined && entree.qualificatif !== undefined)
      || (qualificatif !== undefined && qualificatif.length > 80)
      || (nature === '' && !qualificatif)) {
      return refuser('relation : clés de section et cible valides, nature connue ou qualificatif de 1 à 80 caractères attendus');
    }
    const section = db.prepare('SELECT id FROM sections WHERE fiche_id = ? AND cle = ?')
      .get(source.id, entree.section) as { id: number } | undefined;
    const cible = db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle = ?')
      .get(universId, entree.cible) as { id: number } | undefined;
    if (!section || !cible) {
      const raison = !section ? `section inconnue : ${entree.section}` : `cible inconnue : ${entree.cible}`;
      noter(null, raison);
      return { ...entree, etat: 'ignoree', avertissements: [raison] };
    }
    try {
      const relation = relierSection(db, compteId, universId, source.id, section.id,
        { cibleFicheId: cible.id, nature, qualificatif: qualificatif ?? '' });
      noter('creees');
      const lue = lireRelationParId(db, universId, relation.id);
      return { ...entree, id: relation.id, ...(lue ? { empreinte: empreinteDeRelation(db, lue) } : {}), etat: 'creee', avertissements };
    } catch (e) {
      if (!(e instanceof ErreurService)) throw e;
      if (e.detail === 'relation_existante') {
        noter('inchangees');
        const existante = trouverRelationExistante(db, universId, source.id, section.id, cible.id, nature, qualificatif ?? '');
        return {
          ...entree,
          ...(existante ? { id: existante.id, empreinte: empreinteDeRelation(db, existante) } : {}),
          etat: 'inchangee',
          avertissements,
        };
      }
      if (e.detail === 'nature_incompatible') return refuser(e.message, e.detail, 'nature');
      if (e.detail === 'auto_relation' || e.detail === 'limite_relations') return refuser(e.message, e.detail);
      throw e;
    }
  }));
}

export interface ResultatRelationModifiee {
  id: number;
  etat: 'mise_a_jour' | 'inchangee';
  nature: string;
  qualificatif: string;
  /** Fingerprint of the relation, then of the sheet that carries it (AD-139). */
  empreinte: string;
  empreinteFiche: string;
}

type EnTetes = Record<string, string | string[] | undefined>;

const invalideChamp = (champ: string, message: string, detail?: string) =>
  new ErreurService('invalide', message, detail, champ);

/** The body of `PATCH /relations/:rid`: `{nature?, qualificatif?}`, at least one (400 `invalide` with `champ`). */
function validerChangement(corps: unknown): { nature?: string | null; qualificatif?: string } {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    throw invalideChamp('corps', 'Corps de la requête : un objet est attendu.');
  }
  const c = corps as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (k !== 'nature' && k !== 'qualificatif') throw invalideChamp(k, `${k} : champ inconnu.`, 'champ_inconnu');
  }
  if (c.nature === undefined && c.qualificatif === undefined) {
    throw invalideChamp('corps', 'nature ou qualificatif : au moins un champ est attendu.');
  }
  const changement: { nature?: string | null; qualificatif?: string } = {};
  if (c.nature !== undefined) {
    if (c.nature !== null && typeof c.nature !== 'string') throw invalideChamp('nature', 'nature : un texte est attendu.');
    changement.nature = c.nature === null ? null : c.nature.trim();
  }
  if (c.qualificatif !== undefined) {
    if (typeof c.qualificatif !== 'string' || c.qualificatif.trim().length > 80) {
      throw invalideChamp('qualificatif', 'qualificatif : 80 caractères au plus.');
    }
    changement.qualificatif = c.qualificatif.trim();
  }
  return changement;
}

function exigerLotOuvert(db: Db, jeton: Jeton, lotId: number | null, maintenant: Date): void {
  if (lotId === null) return;
  if (lireLot(db, jeton, lotId, maintenant).closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
}

const idRelation = (rid: string): number | null => (estId(rid) ? Number(rid) : null);

/**
 * `PATCH /relations/:rid` (B-84, AD-ecriture-1): changes the nature and/or the qualifier sent. A relation of another
 * universe, or one whose section or target the account cannot read (AD-64), is the same 404 as an unknown id.
 * Counted under `relations` (`mises_a_jour`, `inchangees`, or `refusees` with the id).
 */
export function modifierRelationImport(
  db: Db, jeton: Jeton, lotId: number | null, rid: string, corps: unknown, entetes: EnTetes, maintenant: Date = new Date(),
): ResultatRelationModifiee {
  const { universId, compteId } = jeton;
  exigerMJ(db, universId, compteId);
  exigerLotOuvert(db, jeton, lotId, maintenant);
  const compte: CompteLot = { lotId, nature: 'relations', cle: rid, objet: 'relation', maintenant };
  try {
    const precondition = lirePrecondition(entetes);
    const changement = validerChangement(corps);
    const id = idRelation(rid);
    return sousPrecondition(
      db,
      precondition,
      compte,
      () => {
        if (id === null) throw introuvable();
        return empreinteDeRelation(db, lireRelationLisible(db, { compteId }, universId, id));
      },
      () =>
        avecContexte(db, { compteId, jetonId: jeton.id, origine: 'import', lotId }, (): ResultatRelationModifiee => {
          let res;
          try {
            res = modifierRelation(db, compteId, universId, id!, changement);
          } catch (e) {
            if (e instanceof ErreurService && e.code === 'invalide' && !e.champ) {
              throw new ErreurService('invalide', e.message, e.detail, e.detail === 'nature_incompatible' ? 'nature' : 'qualificatif');
            }
            throw e;
          }
          const etat = res.ecrit ? 'mise_a_jour' : 'inchangee';
          if (lotId !== null) noterDansLot(db, lotId, 'relations', res.ecrit ? 'mises_a_jour' : 'inchangees', [], maintenant);
          const lue = lireRelationParId(db, universId, id!)!;
          const fiche = lireFicheApi(db, { compteId }, universId, String(lue.ficheId));
          return {
            id: id!, etat, nature: res.relation.nature, qualificatif: res.relation.qualificatif,
            empreinte: empreinteDeRelation(db, lue), empreinteFiche: fiche.empreinte,
          };
        }),
    );
  } catch (e) {
    if (e instanceof ErreurService && e.detail !== 'empreinte_perimee' && lotId !== null) {
      noterDansLot(db, lotId, 'relations', 'refusees', [
        { cle: rid, objet: 'relation', raison: e.message, gravite: 'refus', ...(e.detail ? { code: e.detail } : {}) },
      ], maintenant);
    }
    throw e;
  }
}

/**
 * `DELETE /relations/:rid` (B-84): removes the relation; 204 also for an unknown id or one that is not readable by the
 * account (idempotent). Counts its sheet as `mises_a_jour` under `fiches`.
 */
export function retirerRelationImport(
  db: Db, jeton: Jeton, lotId: number | null, rid: string, entetes: EnTetes, maintenant: Date = new Date(),
): void {
  const { universId, compteId } = jeton;
  exigerMJ(db, universId, compteId);
  exigerLotOuvert(db, jeton, lotId, maintenant);
  const compte: CompteLot = { lotId, nature: 'relations', cle: rid, objet: 'relation', maintenant };
  const id = idRelation(rid);
  const lisible = () => {
    try {
      return id === null ? null : lireRelationLisible(db, { compteId }, universId, id);
    } catch (e) {
      if (e instanceof ErreurService && e.code === 'introuvable') return null;
      throw e;
    }
  };
  try {
    const precondition = lirePrecondition(entetes);
    sousPrecondition(
      db,
      precondition,
      compte,
      () => {
        const r = lisible();
        return r === null ? null : empreinteDeRelation(db, r);
      },
      () =>
        avecContexte(db, { compteId, jetonId: jeton.id, origine: 'import', lotId }, () => {
          const r = lisible();
          if (r === null) return;
          retirerRelation(db, compteId, universId, r.id);
          if (lotId !== null) noterDansLot(db, lotId, 'fiches', 'mises_a_jour', [], maintenant);
        }),
    );
  } catch (e) {
    if (e instanceof ErreurService && e.detail !== 'empreinte_perimee' && lotId !== null) {
      noterDansLot(db, lotId, 'relations', 'refusees', [
        { cle: rid, objet: 'relation', raison: e.message, gravite: 'refus', ...(e.detail ? { code: e.detail } : {}) },
      ], maintenant);
    }
    throw e;
  }
}
