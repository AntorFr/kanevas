import type { Db } from '../db/db.js';
import { exigerMJ } from './droits.js';
import { ErreurService, introuvable } from './erreurs.js';
import {
  etiquetageDe,
  LONGUEUR_ALIAS,
  LONGUEUR_ETIQUETTE,
  MAX_ALIAS,
  MAX_ETIQUETTES,
  nettoyer,
  poserEtiquetage,
} from './etiquettes.js';
import { changerAventureDuCompteRendu } from './comptes_rendus.js';
import { champsDeCharge } from './empreintes.js';
import {
  changerSousType,
  changerStatutFiche,
  changerTypeFiche,
  deplacerFiche,
  marquerDisparu,
  poserCreeLe,
  renommerFiche,
  validerSousType,
} from './fiches.js';
import { choisirIllustration, fichierDeCle, retirerIllustration } from './fichiers.js';
import { estId } from './cles-forme.js';
import { resoudreFiche } from './cles.js';
import { avecContexte } from './historique.js';
import type { JetonRequete as Jeton } from './jetons.js';
import { lireFicheApi } from './lecture-api.js';
import { lireLot, noterDansLot, type Issue } from './lots.js';
import { lirePrecondition, sousPrecondition, type CompteLot } from './precondition.js';
import { estTypeFiche, porteMarqueDisparu, STATUT_AVENTURE } from './types-fiche.js';
import { cleValide } from './import.js';
import { estImage } from './fichiers-lecture.js';

/** The header fields of a sheet that `PATCH /fiches/:cle` (and the full `PUT`) may carry (AD-ecriture-1). */
export const CHAMPS_ENTETE = [
  'titre', 'type', 'sousType', 'pj', 'parent', 'alias', 'etiquettes', 'illustration', 'creeLe', 'statut', 'disparu', 'campagne',
] as const;

/**
 * The header fields of a request once their shape is checked (`undefined`: not sent, left as is). `parent` and
 * `illustration` are origin keys here, resolved inside the transaction.
 */
export interface ChampsEntete {
  titre?: string;
  type?: string;
  sousType?: string | null;
  pj?: boolean;
  parent?: string | null;
  alias?: string[];
  etiquettes?: string[];
  illustration?: string | null;
  creeLe?: string;
  statut?: string;
  disparu?: boolean;
  /** Origin key of the adventure a session report belongs to. */
  campagne?: string;
}

export type EtatEntete = 'mise_a_jour' | 'inchangee';

export interface ResultatEntete {
  id: number;
  etat: EtatEntete;
  empreinteEnTete: string;
  empreinte: string;
}

const invalide = (champ: string, message: string, detail?: string) =>
  new ErreurService('invalide', message, detail, champ);

/**
 * Checks the shape of the body (400 `invalide` with `champ`, before any transaction). An unknown field is refused,
 * never ignored. What depends on the sheet (the fields its type declares) is checked by `ecrireEnTete`.
 */
export function validerEnTete(corps: unknown, maintenant: Date): ChampsEntete {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    throw invalide('corps', 'Corps de la requête : un objet est attendu.');
  }
  const c = corps as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (!(CHAMPS_ENTETE as readonly string[]).includes(k)) throw invalide(k, `${k} : champ inconnu.`, 'champ_inconnu');
  }
  const champs: ChampsEntete = {};
  if (c.titre !== undefined) {
    const t = typeof c.titre === 'string' ? c.titre.trim() : '';
    if (t.length < 1 || t.length > 120) throw invalide('titre', 'titre : de 1 à 120 caractères.');
    champs.titre = t;
  }
  if (c.type !== undefined) {
    if (typeof c.type !== 'string' || !estTypeFiche(c.type)) {
      throw invalide('type', `type « ${String(c.type)} » inconnu de Kanevas.`);
    }
    champs.type = c.type;
  }
  if (c.sousType !== undefined) {
    if (c.sousType === null) champs.sousType = null;
    else {
      try {
        champs.sousType = validerSousType(c.sousType);
      } catch {
        throw invalide('sousType', 'sousType : de 1 à 60 caractères.');
      }
    }
  }
  for (const k of ['pj', 'disparu'] as const) {
    if (c[k] === undefined) continue;
    if (typeof c[k] !== 'boolean') throw invalide(k, `${k} : un booléen est attendu.`);
    champs[k] = c[k] as boolean;
  }
  if (c.statut !== undefined) {
    const s = STATUT_AVENTURE.safeParse(c.statut);
    if (!s.success) throw invalide('statut', `statut : parmi ${STATUT_AVENTURE.options.join(', ')}.`);
    champs.statut = s.data;
  }
  for (const [k, max, longueur] of [
    ['alias', MAX_ALIAS, LONGUEUR_ALIAS],
    ['etiquettes', MAX_ETIQUETTES, LONGUEUR_ETIQUETTE],
  ] as const) {
    if (c[k] === undefined) continue;
    let liste: string[];
    try {
      liste = nettoyer(c[k], k);
    } catch {
      throw invalide(k, `${k} : une liste de textes est attendue.`);
    }
    if (liste.length > max || liste.some((v) => v.length > longueur)) {
      throw invalide(k, `${k} : ${max} au plus, ${longueur} caractères au plus chacun.`);
    }
    champs[k] = liste;
  }
  if (c.campagne !== undefined) {
    if (typeof c.campagne !== 'string' || !cleValide(c.campagne)) {
      throw invalide('campagne', "campagne : clé d'origine absente ou invalide.");
    }
    champs.campagne = c.campagne;
  }
  for (const k of ['parent', 'illustration'] as const) {
    if (c[k] === undefined) continue;
    if (c[k] !== null && (typeof c[k] !== 'string' || !cleValide(c[k] as string))) {
      throw invalide(k, `${k} : clé d'origine absente ou invalide.`);
    }
    champs[k] = c[k] as string | null;
  }
  if (c.creeLe !== undefined) {
    const ms = typeof c.creeLe === 'string' ? Date.parse(c.creeLe) : NaN;
    if (Number.isNaN(ms)) throw invalide('creeLe', 'creeLe : date invalide.');
    if (ms > maintenant.getTime()) throw invalide('creeLe', 'creeLe : date dans le futur.');
    champs.creeLe = new Date(ms).toISOString();
  }
  return champs;
}

interface Ligne {
  id: number;
  type: string;
  titre: string;
  charge: string;
  sous_type: string | null;
  parent_id: number | null;
  cree_le: string;
  illustration_fichier_id: number | null;
}

const lire = (db: Db, id: number) =>
  db
    .prepare(
      'SELECT id, type, titre, charge, sous_type, parent_id, cree_le, illustration_fichier_id FROM fiches WHERE id = ?',
    )
    .get(id) as Ligne;

const memeEnsemble = (a: readonly string[], b: readonly string[]) => {
  const k = new Set(a.map((x) => x.toLowerCase()));
  return k.size === new Set(b.map((x) => x.toLowerCase())).size && b.every((x) => k.has(x.toLowerCase()));
};

export interface ContexteEntete {
  compteId: number;
  universId: number;
  /**
   * Set by the full `PUT` (AD-141): a parent or an illustration that cannot be had is warned of and left as it
   * is. Absent (the `PATCH`): it is a 400 with `champ`.
   */
  avertir?: (objet: string, raison: string) => void;
}

/**
 * Writes the header fields that differ from the sheet's current rows, field by field, through the write services
 * (AD-2, AD-99): a field not sent is left, `alias` and `etiquettes` replace their list, `parent: null` lifts to
 * the root. To be called inside the write's transaction; a refusal throws, and the caller's transaction rolls
 * everything back. Returns whether something was written.
 */
export function ecrireEnTete(db: Db, contexte: ContexteEntete, ficheId: number, champs: ChampsEntete): boolean {
  const { compteId, universId } = contexte;
  const acteur = { compteId };
  let ecrit = false;
  let cur = lire(db, ficheId);
  const typeFinal = champs.type ?? cur.type;
  const porte = new Set(champsDeCharge(typeFinal));

  // What the type declares (AD-120): the list is the registry's, never copied.
  if (champs.pj !== undefined && !porte.has('pj')) throw invalide('pj', 'pj : champ inconnu pour ce type.', 'champ_inconnu');
  if (champs.statut !== undefined && !porte.has('statut')) {
    throw invalide('statut', 'statut : réservé aux aventures.');
  }
  if (champs.disparu !== undefined && !porteMarqueDisparu(typeFinal)) {
    throw invalide('disparu', 'disparu : champ inconnu pour ce type.', 'champ_inconnu');
  }
  if (champs.campagne !== undefined && typeFinal !== 'compte_rendu') {
    throw invalide('campagne', 'campagne : champ inconnu pour ce type.', 'champ_inconnu');
  }
  let campagneId: number | undefined;
  if (champs.campagne !== undefined) {
    const res = estId(champs.campagne) ? null : resoudreFiche(db, universId, champs.campagne);
    const a = res
      ? (db.prepare("SELECT id FROM fiches WHERE id = ? AND univers_id = ? AND type = 'aventure'").get(res.id, universId) as
          | { id: number }
          | undefined)
      : undefined;
    if (!a) throw invalide('campagne', `campagne : « ${champs.campagne} » n'est pas une aventure de l'univers.`);
    campagneId = a.id;
  }

  // Type (and PJ, for a character) are one unit.
  const pjCourant = (JSON.parse(cur.charge) as { pj?: boolean }).pj === true;
  const typeChange = champs.type !== undefined && champs.type !== cur.type;
  const pjChange = typeFinal === 'personnage' && champs.pj !== undefined && (typeChange || champs.pj !== pjCourant);
  if (typeChange || pjChange) {
    try {
      changerTypeFiche(db, compteId, universId, ficheId, typeFinal, champs.pj !== undefined ? { pj: champs.pj } : undefined);
    } catch (e) {
      if (e instanceof ErreurService && e.code === 'invalide') throw invalide('type', e.message, e.detail);
      throw e;
    }
    ecrit = true;
  }

  if (champs.titre !== undefined && champs.titre !== cur.titre) {
    renommerFiche(db, compteId, universId, ficheId, champs.titre);
    ecrit = true;
  }

  cur = lire(db, ficheId);
  if (champs.sousType !== undefined && champs.sousType !== cur.sous_type) {
    changerSousType(db, compteId, universId, ficheId, champs.sousType);
    ecrit = true;
  }

  const charge = JSON.parse(cur.charge) as { disparu?: boolean; statut?: string };
  if (champs.disparu !== undefined && (charge.disparu === true) !== champs.disparu) {
    marquerDisparu(db, acteur, universId, ficheId, champs.disparu);
    ecrit = true;
  }
  if (champs.statut !== undefined && charge.statut !== champs.statut) {
    changerStatutFiche(db, acteur, universId, ficheId, champs.statut);
    ecrit = true;
  }

  if (champs.alias !== undefined || champs.etiquettes !== undefined) {
    const courant = etiquetageDe(db, ficheId);
    const alias = champs.alias ?? courant.alias;
    const etiquettes = champs.etiquettes ?? courant.etiquettes;
    if (!memeEnsemble(courant.alias, alias) || !memeEnsemble(courant.etiquettes, etiquettes)) {
      poserEtiquetage(db, acteur, universId, ficheId, { alias, etiquettes });
      ecrit = true;
    }
  }

  if (campagneId !== undefined) {
    const courantId = (JSON.parse(lire(db, ficheId).charge) as { campagne_id?: number }).campagne_id;
    if (courantId !== campagneId) {
      changerAventureDuCompteRendu(db, acteur, universId, ficheId, campagneId);
      ecrit = true;
    }
  }

  if (champs.parent !== undefined && poserParent(db, contexte, ficheId, champs.parent, cur.parent_id)) ecrit = true;

  if (champs.illustration !== undefined && poserIllustration(db, contexte, ficheId, champs.illustration, cur.illustration_fichier_id)) {
    ecrit = true;
  }

  if (champs.creeLe !== undefined && champs.creeLe !== cur.cree_le) {
    poserCreeLe(db, compteId, universId, ficheId, champs.creeLe);
    ecrit = true;
  }
  return ecrit;
}

/** `parent_id` moves only through `deplacerFiche` (AD-99). True when the parent changed. */
function poserParent(db: Db, c: ContexteEntete, ficheId: number, voulu: string | null, courant: number | null): boolean {
  let cible: number | null = null;
  if (voulu !== null) {
    const res = estId(voulu) ? null : resoudreFiche(db, c.universId, voulu);
    if (res === null) {
      if (c.avertir) {
        c.avertir('fiche', `parent ${voulu} inconnu : parent laissé tel quel`);
        return false;
      }
      throw invalide('parent', `parent « ${voulu} » inconnu.`, 'parent_inconnu');
    }
    cible = res.id;
  }
  if (cible === courant) return false;
  try {
    deplacerFiche(db, { compteId: c.compteId }, c.universId, ficheId, cible);
  } catch (e) {
    if (e instanceof ErreurService && (e.detail === 'cycle' || e.detail === 'trop_profond')) {
      if (c.avertir) {
        c.avertir('fiche', `parent ${voulu} refusé (${e.detail}) : parent laissé tel quel`);
        return false;
      }
      throw invalide('parent', e.message, e.detail);
    }
    throw e;
  }
  return true;
}

/** The illustration by file key (`null`: none). A key the library does not hold, or not an image, is a 400 `champ: illustration`. */
function poserIllustration(db: Db, c: ContexteEntete, ficheId: number, voulu: string | null, courant: number | null): boolean {
  if (voulu === null) {
    if (courant === null) return false;
    retirerIllustration(db, { compteId: c.compteId }, c.universId, ficheId);
    return true;
  }
  const f = fichierDeCle(db, c.universId, voulu);
  if (!f) {
    if (c.avertir) {
      c.avertir('fiche', `fichier « ${voulu} » inconnu : illustration laissée telle quelle`);
      return false;
    }
    throw invalide('illustration', `illustration : fichier « ${voulu} » inconnu.`, 'fichier_inconnu');
  }
  if (!estImage(f.type)) throw invalide('illustration', `illustration : « ${voulu} » n'est pas une image.`, 'pas_une_image');
  if (f.id === courant) return false;
  choisirIllustration(db, { compteId: c.compteId }, c.universId, ficheId, f.id);
  return true;
}

const ISSUE: Record<EtatEntete, Issue> = { mise_a_jour: 'mises_a_jour', inchangee: 'inchangees' };

/**
 * `PATCH /fiches/:cle` (B-82, AD-ecriture-1): the order of refusals is the contract's — GM guard, body shape (400),
 * then in one transaction the sheet by key or former key (404), the `If-Match` header fingerprint (412), the write.
 * With a batch the outcome is counted under `fiches` (« 1 mise à jour », « 1 inchangée » or « 1 refusée »).
 */
export function modifierEnTete(
  db: Db,
  jeton: Jeton,
  lotId: number | null,
  reference: string,
  corps: unknown,
  entetes: Record<string, string | string[] | undefined>,
  maintenant: Date = new Date(),
): ResultatEntete {
  const { universId, compteId } = jeton;
  exigerMJ(db, universId, compteId);
  if (lotId !== null) {
    const lot = lireLot(db, jeton, lotId, maintenant);
    if (lot.closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
  }
  const compte: CompteLot = { lotId, nature: 'fiches', cle: reference, objet: 'fiche', maintenant };
  try {
    const precondition = lirePrecondition(entetes);
    const champs = validerEnTete(corps, maintenant);
    let id = 0;
    return sousPrecondition(
      db,
      precondition,
      compte,
      () => {
        const res = estId(reference) ? null : resoudreFiche(db, universId, reference);
        if (res === null) throw introuvable();
        id = res.id;
        return lireFicheApi(db, { compteId }, universId, String(id)).empreinteEntete;
      },
      () =>
        avecContexte(db, { compteId, jetonId: jeton.id, origine: 'import', lotId }, (): ResultatEntete => {
          const ecrit = ecrireEnTete(db, { compteId, universId }, id, champs);
          const etat: EtatEntete = ecrit ? 'mise_a_jour' : 'inchangee';
          if (lotId !== null) noterDansLot(db, lotId, 'fiches', ISSUE[etat], [], maintenant);
          const f = lireFicheApi(db, { compteId }, universId, String(id));
          return { id, etat, empreinteEnTete: f.empreinteEntete, empreinte: f.empreinte };
        }),
    );
  } catch (e) {
    if (e instanceof ErreurService && e.detail !== 'empreinte_perimee' && lotId !== null) {
      noterDansLot(db, lotId, 'fiches', 'refusees', [
        { cle: reference, objet: 'fiche', raison: e.message, gravite: 'refus', ...(e.detail ? { code: e.detail } : {}) },
      ], maintenant);
    }
    throw e;
  }
}
