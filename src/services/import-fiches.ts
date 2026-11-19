import { avecContexte } from './historique.js';
import { creerCompteRendu, TITRE_SECTION_COMPTE_RENDU } from './comptes_rendus.js';
import type { Db } from '../db/db.js';
import { exigerMJ } from './droits.js';
import { cleValide } from './import.js';
import { ErreurService } from './erreurs.js';
import {
  etiquetageDe,
  LONGUEUR_ALIAS,
  LONGUEUR_ETIQUETTE,
  MAX_ALIAS,
  MAX_ETIQUETTES,
  nettoyer,
  poserEtiquetage,
} from './etiquettes.js';
import {
  changerStatutFiche,
  changerSousType,
  changerTypeFiche,
  creerFiche,
  deplacerFiche,
  renommerFiche,
  marquerDisparu,
  supprimerFiche,
  validerSousType,
} from './fiches.js';
import type { JetonRequete as Jeton } from './jetons.js';
import {
  choisirIllustration,
  fichierDeCle,
  jointsDe,
  joindreParImport,
  MAX_FICHIERS_JOINTS,
  noterAttente,
  oublierAttenteIllustration,
  retirerIllustration,
} from './fichiers.js';
import { preparerContenu } from './liens.js';
import { resoudreFiche } from './cles.js';
import { lireFicheApi } from './lecture-api.js';
import { lirePrecondition, sousPrecondition, type CompteLot, type Precondition } from './precondition.js';
import { extraireClesFichier } from './markdown.js';
import { lireLot, noterDansLot, type EntreeRapport, type Issue } from './lots.js';
import {
  ajouterSection,
  changerAudience,
  ecrireContenu,
  MAX_CONTENU_SECTION,
  renommerSection,
  reordonnerSections,
  resoudreClesEnAttente,
} from './sections.js';
import type { SectionRow } from './types.js';
import { CHARGES, STATUT_AVENTURE, TYPES, porteMarqueDisparu, typeActif } from './types-fiche.js';

/** Every product sheet type is accepted by the import. */
export const TYPES_IMPORT: readonly string[] = TYPES.map((t) => t.type);
type TypeImport = string;

export type EtatImport = 'creee' | 'mise_a_jour' | 'inchangee';

export interface ResultatFiche {
  id: number;
  etat: EtatImport;
  avertissements: string[];
  /** Fingerprints of the sheet and of its header after the write (AD-139). */
  empreinte: string;
  empreinteEnTete: string;
}

export interface SectionEntree {
  cle: string;
  titre: string;
  /** `undefined`: the request says nothing (an existing section keeps it; a new one starts empty). */
  contenu?: string;
  /** `undefined`: the request says nothing (an existing section keeps it; a new one is closed to players). */
  joueursLisent?: boolean;
  joueursEcrivent?: boolean;
  /** Origin keys of the files joined to the section; `undefined`: the request says nothing. */
  fichiers?: string[];
}

interface FicheEntree {
  type: TypeImport;
  titre: string;
  /** Absent: leave an existing adventure's status alone. */
  statut?: string;
  /** `undefined`: the request says nothing (left as is); `null`: no sub-type wanted. */
  sousType?: string | null;
  /** `undefined`: the request says nothing (left as is; a new character is not a PC). */
  pj?: boolean;
  /** Absent on types without the mark, or when the request says nothing (left as is). */
  disparu?: boolean;
  campagne?: string;
  campagneId?: number;
  /** `undefined`: the request says nothing (left as is). Cleaned, bounds not yet checked. */
  alias?: string[];
  etiquettes?: string[];
  /** Origin key of the wanted parent; `null`: no parent; `undefined`: the request says nothing. */
  parent?: string | null;
  /** Origin key of the image that illustrates the sheet; `null`: none; `undefined`: the request says nothing. */
  illustration?: string | null;
  creeLe?: string;
  modifieLe?: string;
  sections: SectionEntree[];
}

/** A refusal of the request before anything is written (400 `invalide` with `champ`). */
class Refus extends Error {
  constructor(
    readonly champ: string,
    readonly objet: string,
    readonly raison: string,
    readonly code?: string,
  ) {
    super(raison);
  }
}

const milliers = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export { cleValide } from './import.js';

function texte(v: unknown, champ: string, objet: string, min: number, max: number, quoi: string): string {
  if (typeof v !== 'string') throw new Refus(champ, objet, `${quoi} manquant`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw new Refus(champ, objet, `${quoi} : de ${min} à ${max} caractères`);
  return t;
}

function date(v: unknown, champ: string, maintenant: Date): string | undefined {
  if (v === undefined || v === null) return undefined;
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  if (Number.isNaN(ms)) throw new Refus(champ, 'fiche', `${champ} : date invalide`);
  if (ms > maintenant.getTime()) throw new Refus(champ, 'fiche', `${champ} : date dans le futur`);
  return new Date(ms).toISOString();
}

function booleen(v: unknown, champ: string, objet: string): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new Refus(champ, objet, `${champ} : un booléen est attendu`);
  return v;
}

function lireCorps(corps: unknown, maintenant: Date): FicheEntree {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    throw new Refus('corps', 'fiche', 'corps de la requête : un objet est attendu');
  }
  const c = corps as Record<string, unknown>;
  const type = c.type;
  if (typeof type !== 'string') throw new Refus('type', 'fiche', 'type manquant');
  if (!TYPES_IMPORT.includes(type)) {
    throw new Refus('type', 'fiche', `type « ${type} » inconnu de Kanevas`);
  }
  let statut: string | undefined;
  if (c.statut !== undefined) {
    const valeur = STATUT_AVENTURE.safeParse(c.statut);
    if (type !== 'aventure' || !valeur.success) {
      throw new Refus('statut', 'fiche', `statut : réservé aux aventures, parmi ${STATUT_AVENTURE.options.join(', ')}`);
    }
    statut = valeur.data;
  }
  let campagne: string | undefined;
  if (type === 'compte_rendu') {
    if (typeof c.campagne !== 'string' || !cleValide(c.campagne)) {
      throw new Refus('campagne', 'fiche', `campagne inconnue : ${typeof c.campagne === 'string' ? c.campagne : ''}`);
    }
    campagne = c.campagne;
  }
  const titre = texte(c.titre, 'titre', 'fiche', 1, 120, 'titre');
  const creeLe = date(c.creeLe, 'creeLe', maintenant);
  const modifieLe = date(c.modifieLe, 'modifieLe', maintenant);
  if (creeLe && modifieLe && modifieLe < creeLe) {
    throw new Refus('modifieLe', 'fiche', 'modifieLe : antérieure à creeLe');
  }
  const pj = booleen(c.pj, 'pj', 'fiche');
  const marqueDisparu = porteMarqueDisparu(type);
  if (!marqueDisparu && Object.hasOwn(c, 'disparu')) {
    throw new Refus('disparu', 'fiche', 'disparu : champ inconnu pour ce type', 'champ_inconnu');
  }
  const disparu = marqueDisparu ? booleen(c.disparu, 'disparu', 'fiche') : undefined;
  let sousType: string | null | undefined;
  if (c.sousType !== undefined && c.sousType !== null) {
    try {
      sousType = validerSousType(c.sousType);
    } catch {
      throw new Refus('sousType', 'fiche', 'sousType : de 1 à 60 caractères');
    }
  } else sousType = c.sousType;
  const ensemble = (v: unknown, champ: string): string[] | undefined => {
    if (v === undefined || v === null) return undefined;
    try {
      return nettoyer(v, champ);
    } catch {
      throw new Refus(champ, 'fiche', `${champ} : une liste de textes est attendue`);
    }
  };
  const alias = ensemble(c.alias, 'alias');
  const etiquettes = ensemble(c.etiquettes, 'etiquettes');
  let parent: string | null | undefined;
  if (c.parent !== undefined && c.parent !== null) {
    if (typeof c.parent !== 'string' || !cleValide(c.parent)) {
      throw new Refus('parent', 'fiche', "parent : clé d'origine absente ou invalide");
    }
    parent = c.parent;
  } else parent = c.parent;
  let illustration: string | null | undefined;
  if (c.illustration !== undefined && c.illustration !== null) {
    if (typeof c.illustration !== 'string' || !cleValide(c.illustration)) {
      throw new Refus('illustration', 'fiche', "illustration : clé d'origine absente ou invalide");
    }
    illustration = c.illustration;
  } else illustration = c.illustration;
  const brutes = c.sections ?? [];
  if (!Array.isArray(brutes)) throw new Refus('sections', 'fiche', 'sections : une liste est attendue');
  const vues = new Set<string>();
  const sections = brutes.map((b: unknown, i): SectionEntree => {
    const ch = `sections[${i}]`;
    if (typeof b !== 'object' || b === null || Array.isArray(b)) {
      throw new Refus(ch, 'section', `${ch} : un objet est attendu`);
    }
    const s = b as Record<string, unknown>;
    if (typeof s.cle !== 'string' || !cleValide(s.cle)) {
      throw new Refus(`${ch}.cle`, 'section', `${ch} : clé d'origine absente ou invalide`);
    }
    if (vues.has(s.cle)) throw new Refus(`${ch}.cle`, 'section', `section « ${s.cle} » : clé en double`);
    vues.add(s.cle);
    const titreS = texte(s.titre, `${ch}.titre`, 'section', 1, 80, `section « ${s.cle} » : titre`);
    const contenu = s.contenu;
    if (contenu !== undefined && typeof contenu !== 'string') {
      throw new Refus(`${ch}.contenu`, 'section', `section « ${titreS} » : contenu en texte attendu`);
    }
    if (contenu !== undefined && contenu.length > MAX_CONTENU_SECTION) {
      throw new Refus(
        `${ch}.contenu`,
        'section',
        `section « ${titreS} » : ${milliers(contenu.length)} caractères, ${milliers(MAX_CONTENU_SECTION)} au plus`,
      );
    }
    let fichiers: string[] | undefined;
    if (s.fichiers !== undefined && s.fichiers !== null) {
      if (!Array.isArray(s.fichiers)) {
        throw new Refus(`${ch}.fichiers`, 'section', `section « ${titreS} » : fichiers : une liste de clés est attendue`);
      }
      if (s.fichiers.length > MAX_FICHIERS_JOINTS) {
        throw new Refus(
          'fichiers',
          'section',
          `section « ${titreS} » : ${s.fichiers.length} fichiers joints, ${MAX_FICHIERS_JOINTS} au plus`,
        );
      }
      if (s.fichiers.some((k) => typeof k !== 'string' || !cleValide(k))) {
        throw new Refus(`${ch}.fichiers`, 'section', `section « ${titreS} » : fichiers : clé d'origine absente ou invalide`);
      }
      fichiers = [...new Set(s.fichiers as string[])];
    }
    return {
      cle: s.cle,
      titre: titreS,
      contenu,
      fichiers,
      joueursLisent: booleen(s.joueursLisent, `${ch}.joueursLisent`, 'section'),
      joueursEcrivent: booleen(s.joueursEcrivent, `${ch}.joueursEcrivent`, 'section'),
    };
  });
  if (type === 'compte_rendu' && sections[0]) sections[0].titre = TITRE_SECTION_COMPTE_RENDU;
  return { type, titre, statut, sousType, pj, disparu, campagne, alias, etiquettes, parent, illustration, creeLe, modifieLe, sections };
}

interface FicheLue {
  id: number;
  cree_le: string;
  type: string;
  titre: string;
  charge: string;
  sous_type: string | null;
}

const desactive = (type: string) => `type_desactive : le type « ${type} » est désactivé dans cet univers`;

const pjDe = (type: string, charge: string): boolean | null =>
  type === 'personnage' ? (JSON.parse(charge) as { pj?: boolean }).pj === true : null;


const ISSUE: Record<EtatImport, Issue> = {
  creee: 'creees',
  mise_a_jour: 'mises_a_jour',
  inchangee: 'inchangees',
};

/**
 * « Assurer » a sheet by origin key (AD-104, B-47, AD-138): creates it, updates it, or does nothing.
 * Everything goes through the write services with the token's account as actor (AD-2). Each field the
 * body carries that differs from the current rows is written (Kanevas keeps no memory of the import);
 * nothing is deleted by omission; a section without origin key is never touched.
 * A refused request writes nothing but, with a batch, counts « 1 refusée » in it.
 */
export function assurerFiche(
  db: Db,
  jeton: Jeton,
  lotId: number | null,
  cle: string,
  corps: unknown,
  maintenant: Date = new Date(),
  entetes: Record<string, string | string[] | undefined> = {},
): ResultatFiche {
  // The import writes as a GM only (B-46): a player's token never reaches a section, a file join included.
  exigerMJ(db, jeton.universId, jeton.compteId);
  if (lotId !== null) {
    const lot = lireLot(db, jeton, lotId, maintenant);
    if (lot.closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
  }
  const refuser = (r: Refus): never => {
    if (lotId !== null) {
      noterDansLot(
        db,
        lotId,
        'fiches',
        'refusees',
        [{ cle, objet: r.objet, raison: r.raison, gravite: 'refus' }],
        maintenant,
      );
    }
    throw new ErreurService('invalide', r.raison, r.code, r.champ);
  };

  let entree: FicheEntree;
  let precondition: Precondition = {};
  try {
    try {
      precondition = lirePrecondition(entetes, { creation: true });
    } catch (e) {
      if (e instanceof ErreurService) throw new Refus(e.champ ?? 'if_match', 'fiche', e.message);
      throw e;
    }
    if (!cleValide(cle)) throw new Refus('cle', 'fiche', "clé d'origine invalide");
    // A key of digits only would read as an id (AD-146): the sheet needs a letter in its key.
    if (!/\p{L}/u.test(cle)) throw new Refus('cle', 'fiche', "clé d'origine invalide : au moins une lettre");
    entree = lireCorps(corps, maintenant);
    if (entree.campagne !== undefined) {
      // The key of the adventure sheet this report names (AD-125 (2)): a sheet of `aventure` type of the token's universe.
      const campagne = db
        .prepare("SELECT id FROM fiches WHERE univers_id = ? AND cle = ? AND type = 'aventure'")
        .get(jeton.universId, entree.campagne) as { id: number } | undefined;
      if (!campagne) throw new Refus('campagne', 'fiche', `campagne inconnue : ${entree.campagne}`);
      entree.campagneId = campagne.id;
    }
  } catch (e) {
    if (e instanceof Refus) return refuser(e);
    throw e;
  }
  // A known document cannot be an illustration: refused before anything of the sheet is written.
  if (typeof entree.illustration === 'string') {
    const f = fichierDeCle(db, jeton.universId, entree.illustration);
    if (f && !f.type.startsWith('image/')) {
      return refuser(
        new Refus('illustration', 'fiche', `illustration : « ${entree.illustration} » n'est pas une image`, 'pas_une_image'),
      );
    }
  }

  // A key that is the key of a managed section of the sheet: refused before the transaction (AD-127).
  // The sheet is reached by its key or a former one (AD-146): never a second sheet for a renamed key.
  const atteinte = resoudreFiche(db, jeton.universId, cle);
  const gerees = db
    .prepare('SELECT s.cle FROM sections s WHERE s.fiche_id = ? AND s.gere_par IS NOT NULL')
    .all(atteinte?.id ?? 0) as { cle: string }[];
  if (gerees.length > 0) {
    const cles = new Set(gerees.map((g) => g.cle));
    const i = entree.sections.findIndex((s) => cles.has(s.cle));
    if (i >= 0) {
      return refuser(
        new Refus(`sections[${i}]`, 'section', `section « ${entree.sections[i]!.titre} » : gérée par un outil, non modifiable`, 'section_geree'),
      );
    }
  }

  const compte: CompteLot = { lotId, nature: 'fiches', cle, objet: 'fiche', maintenant };
  try {
    return sousPrecondition(
      db,
      precondition,
      compte,
      () => {
        const res = resoudreFiche(db, jeton.universId, cle);
        return res ? lireFicheApi(db, { compteId: jeton.compteId }, jeton.universId, String(res.id)).empreinte : null;
      },
      () =>
        avecContexte(db, { compteId: jeton.compteId, jetonId: jeton.id, origine: 'import', lotId }, (): ResultatFiche => {
          const avert: EntreeRapport[] = [];
          const prevenir = (objet: string, raison: string) =>
            avert.push({ cle, objet, raison, gravite: 'avertissement' });
          const resultat = ecrire(db, jeton, cle, entree, prevenir);
          if (lotId !== null) noterDansLot(db, lotId, 'fiches', ISSUE[resultat.etat], avert, maintenant);
          const f = lireFicheApi(db, { compteId: jeton.compteId }, jeton.universId, String(resultat.id));
          return {
            ...resultat,
            avertissements: avert.map((a) => a.raison),
            empreinte: f.empreinte,
            empreinteEnTete: f.empreinteEntete,
          };
        }),
    );
  } catch (e) {
    // A bare id that points nowhere: the whole request is refused, nothing of it is written.
    if (e instanceof ErreurService && e.detail === 'lien_illisible') {
      return refuser(new Refus('sections', 'section', 'lien [[<id>]] vers une fiche absente ou illisible'));
    }
    throw e;
  }
}


function ecrire(
  db: Db,
  jeton: Jeton,
  cle: string,
  e: FicheEntree,
  prevenir: (objet: string, raison: string) => void,
): { id: number; etat: EtatImport } {
  const { universId, compteId } = jeton;
  const res = resoudreFiche(db, universId, cle);
  const existante = res
    ? (db.prepare('SELECT id, type, titre, charge, sous_type, cree_le FROM fiches WHERE id = ?').get(res.id) as FicheLue)
    : undefined;
  const charge = e.type === 'aventure'
    ? CHARGES.aventure.parse({ v: 1, statut: e.statut })
    : e.type === 'personnage' && e.pj !== undefined ? { pj: e.pj } : {};

  if (!existante) {
    if (!typeActif(db, universId, e.type)) prevenir('fiche', desactive(e.type));
    const alias = ensembleVoulu(e.alias, MAX_ALIAS, LONGUEUR_ALIAS, 'alias', prevenir);
    const etiquettes = ensembleVoulu(e.etiquettes, MAX_ETIQUETTES, LONGUEUR_ETIQUETTE, 'étiquettes', prevenir);
    const origine = { cle, creeLe: e.creeLe, modifieLe: e.modifieLe };
    const fiche = e.type === 'compte_rendu'
      ? creerCompteRendu(db, compteId, universId, e.campagneId!, {
          titre: e.titre, texte: e.sections[0]?.contenu, origine,
        })
      : creerFiche(db, compteId, universId, {
      type: e.type,
      titre: e.titre,
      sousType: e.sousType ?? null,
      charge: e.type === 'personnage' ? { pj: e.pj ?? false } : charge,
      origine,
    });
    if (e.disparu !== undefined) marquerDisparu(db, { compteId }, universId, fiche.id, e.disparu);
    if (e.type === 'compte_rendu' && e.sousType) changerSousType(db, compteId, universId, fiche.id, e.sousType);
    // The sheets that waited for this key now point at it, in this transaction (AD-116).
    resoudreClesEnAttente(db, universId, cle, fiche.id);
    if (alias?.length || etiquettes?.length) {
      poserEtiquetage(db, { compteId }, universId, fiche.id, { alias: alias ?? [], etiquettes: etiquettes ?? [] });
    }
    const premiere = e.type === 'compte_rendu'
      ? db.prepare('SELECT id, version FROM sections WHERE fiche_id = ? ORDER BY ordre LIMIT 1').get(fiche.id) as { id: number; version: number }
      : undefined;
    e.sections.forEach((s, i) => creerSection(db, jeton, fiche.id, s, prevenir, i === 0 ? premiere : undefined));
    if (e.parent !== undefined) poserParent(db, jeton, fiche.id, e.parent, null, prevenir);
    if (e.illustration !== undefined) poserIllustration(db, jeton, fiche.id, e.illustration, prevenir);
    // Adding sections touched the sheet with « now »; a date given by the source is the sheet's.
    if (e.modifieLe) db.prepare('UPDATE fiches SET modifie_le = ? WHERE id = ?').run(e.modifieLe, fiche.id);
    return { id: fiche.id, etat: 'creee' };
  }

  if (e.creeLe && e.creeLe !== existante.cree_le) prevenir('fiche', 'creeLe non modifiable, ignorée');
  if (e.type === 'compte_rendu' && e.campagneId !== (JSON.parse(existante.charge) as { campagne_id?: number }).campagne_id) {
    prevenir('fiche', 'campagne non modifiable, ignorée');
  }
  // What the body carries is compared with the rows as they are now (B-47, AD-138): each field sent that
  // differs is written, a field not sent is left, nothing is removed by omission.
  let ecrit = false;

  if (existante.titre !== e.titre) {
    renommerFiche(db, compteId, universId, existante.id, e.titre);
    ecrit = true;
  }

  // Type (and PJ, for a character) are one unit.
  const pjCourant = pjDe(existante.type, existante.charge);
  const pjChange = e.type === 'personnage' && e.pj !== undefined && pjCourant !== e.pj;
  if (existante.type !== e.type || pjChange) {
    if (e.type === 'compte_rendu' || existante.type === 'compte_rendu') {
      prevenir('fiche', 'type : un compte rendu ne change pas de type, ignoré');
    } else {
      if (!typeActif(db, universId, e.type)) prevenir('fiche', desactive(e.type));
      changerTypeFiche(db, compteId, universId, existante.id, e.type, charge);
      ecrit = true;
    }
  }

  const apresType = db.prepare('SELECT type, charge FROM fiches WHERE id = ?').get(existante.id) as {
    type: string; charge: string;
  };
  if (porteMarqueDisparu(apresType.type) && e.disparu !== undefined) {
    const courant = (JSON.parse(apresType.charge) as { disparu?: boolean }).disparu === true;
    if (courant !== e.disparu) {
      marquerDisparu(db, { compteId }, universId, existante.id, e.disparu);
      ecrit = true;
    }
  }

  // Read the effective type: a refused type change must not write a status.
  if (e.type === 'aventure' && e.statut !== undefined && apresType.type === 'aventure') {
    const statut = (JSON.parse(apresType.charge) as { statut: string }).statut;
    if (statut !== e.statut) {
      changerStatutFiche(db, { compteId }, universId, existante.id, e.statut);
      ecrit = true;
    }
  }

  if (e.sousType !== undefined) {
    const courant = (
      db.prepare('SELECT sous_type FROM fiches WHERE id = ?').get(existante.id) as { sous_type: string | null }
    ).sous_type;
    if (courant !== e.sousType) {
      changerSousType(db, compteId, universId, existante.id, e.sousType);
      ecrit = true;
    }
  }

  // Aliases and labels: each set is compared as a set (no case, no order) and replaced when it differs.
  const courant = etiquetageDe(db, existante.id);
  const aEcrire = { alias: courant.alias, etiquettes: courant.etiquettes };
  let etiquetage = false;
  const ensembles = [
    { champ: 'alias' as const, nom: 'alias', max: MAX_ALIAS, longueur: LONGUEUR_ALIAS, voulu: e.alias },
    {
      champ: 'etiquettes' as const,
      nom: 'étiquettes',
      max: MAX_ETIQUETTES,
      longueur: LONGUEUR_ETIQUETTE,
      voulu: e.etiquettes,
    },
  ];
  for (const x of ensembles) {
    const voulu = ensembleVoulu(x.voulu, x.max, x.longueur, x.nom, prevenir);
    if (voulu === null || memeEnsemble(courant[x.champ], voulu)) continue;
    aEcrire[x.champ] = voulu;
    etiquetage = true;
  }
  if (etiquetage) {
    poserEtiquetage(db, { compteId }, universId, existante.id, aEcrire);
    ecrit = true;
  }

  // Parent: written through `deplacerFiche` (AD-99).
  if (e.parent !== undefined) {
    const courantParent = (
      db.prepare('SELECT parent_id FROM fiches WHERE id = ?').get(existante.id) as { parent_id: number | null }
    ).parent_id;
    if (poserParent(db, jeton, existante.id, e.parent, courantParent, prevenir)) ecrit = true;
  }

  if (e.illustration !== undefined && poserIllustration(db, jeton, existante.id, e.illustration, prevenir)) ecrit = true;

  // Sections, by origin key.
  const lignes = db
    .prepare('SELECT * FROM sections WHERE fiche_id = ? ORDER BY ordre')
    .all(existante.id) as SectionRow[];
  const parCle = new Map(lignes.filter((l) => l.cle !== null).map((l) => [l.cle!, l]));
  const demandes: number[] = [];
  let nouvelle = false;
  for (const s of e.sections) {
    const ligne = parCle.get(s.cle);
    if (!ligne) {
      demandes.push(creerSection(db, jeton, existante.id, s, prevenir));
      nouvelle = true;
      ecrit = true;
      continue;
    }
    demandes.push(ligne.id);
    if (majSection(db, jeton, existante.id, ligne, s, prevenir)) ecrit = true;
  }
  if (nouvelle) {
    // Imported sections follow the order of the list, before those born in Kanevas.
    const voulu = [...demandes, ...lignes.map((l) => l.id).filter((id) => !demandes.includes(id))];
    const actuel = (
      db.prepare('SELECT id FROM sections WHERE fiche_id = ? ORDER BY ordre').all(existante.id) as { id: number }[]
    ).map((r) => r.id);
    if (voulu.some((id, i) => id !== actuel[i])) reordonnerSections(db, compteId, universId, existante.id, voulu);
  }

  return { id: existante.id, etat: ecrit ? 'mise_a_jour' : 'inchangee' };
}

/**
 * Sets the illustration the request names (`null`: none). A key the universe does not know yet waits
 * (`fichiers_attente`) and the batch is warned. True when the sheet's illustration changed.
 */
function poserIllustration(
  db: Db,
  jeton: Jeton,
  ficheId: number,
  voulu: string | null,
  prevenir: (objet: string, raison: string) => void,
): boolean {
  const { universId, compteId } = jeton;
  const courant = (
    db.prepare('SELECT illustration_fichier_id AS id FROM fiches WHERE id = ?').get(ficheId) as { id: number | null }
  ).id;
  const fichier = voulu === null ? undefined : fichierDeCle(db, universId, voulu);
  if (fichier && fichier.id === courant) {
    oublierAttenteIllustration(db, ficheId);
    return false;
  }
  oublierAttenteIllustration(db, ficheId);
  if (voulu === null) {
    if (courant === null) return false;
    retirerIllustration(db, { compteId }, universId, ficheId);
    return true;
  }
  if (!fichier) {
    noterAttente(db, universId, voulu, { ficheId, maniere: 'illustration' });
    prevenir('fiche', `fichier « ${voulu} » inconnu : illustration en attente`);
    return false;
  }
  choisirIllustration(db, { compteId }, universId, ficheId, fichier.id);
  return true;
}

/**
 * Joins the files the request names to a section, by origin key: a key the universe does not know waits;
 * the 101st is not joined. Nothing is unjoined by omission. True when a file was joined.
 */
function poserJoints(
  db: Db,
  universId: number,
  section: { id: number; titre: string },
  voulu: string[] | undefined,
  prevenir: (objet: string, raison: string) => void,
): boolean {
  if (voulu === undefined) return false;
  const actuel = new Set(jointsDe(db, section.id));
  let ecrit = false;
  for (const cle of voulu) {
    const f = fichierDeCle(db, universId, cle);
    if (!f) {
      noterAttente(db, universId, cle, { sectionId: section.id, maniere: 'joint' });
      prevenir('section', `section « ${section.titre} » : fichier « ${cle} » inconnu : référence en attente`);
    } else if (actuel.has(f.id)) {
      continue;
    } else if (joindreParImport(db, section.id, f.id)) {
      ecrit = true;
    } else {
      prevenir('section', `section « ${section.titre} » : ${MAX_FICHIERS_JOINTS} fichiers joints au plus, « ${cle} » non joint`);
    }
  }
  return ecrit;
}

/** Warns, once per key, of the `fichier:cle:` references a stored text still carries (they wait for their file). */
function prevenirTexte(contenu: string, titre: string, prevenir: (objet: string, raison: string) => void): void {
  for (const cle of new Set(extraireClesFichier(contenu))) {
    prevenir('section', `section « ${titre} » : fichier « ${cle} » inconnu : référence en attente`);
  }
}


/**
 * Puts the sheet under the parent the request names (`null`: the root). A parent unknown or that would
 * make a cycle leaves the parent as it is and warns (AD-141). True when the parent changed.
 */
function poserParent(
  db: Db,
  jeton: Jeton,
  ficheId: number,
  voulu: string | null,
  courant: number | null,
  prevenir: (objet: string, raison: string) => void,
): boolean {
  const { universId, compteId } = jeton;
  const cible =
    voulu === null
      ? null
      : ((
          db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle = ?').get(universId, voulu) as
            | { id: number }
            | undefined
        )?.id ?? undefined);
  if (cible === undefined) {
    prevenir('fiche', `parent ${voulu} inconnu : parent laissé tel quel`);
    return false;
  }
  if (cible === courant) return false;
  try {
    deplacerFiche(db, { compteId }, universId, ficheId, cible);
  } catch (err) {
    if (err instanceof ErreurService && err.detail === 'cycle') {
      prevenir('fiche', `parent ${voulu} ferait un cycle : parent laissé tel quel`);
      return false;
    }
    if (err instanceof ErreurService && err.detail === 'trop_profond') {
      prevenir('fiche', `parent ${voulu} : hiérarchie trop profonde : parent laissé tel quel`);
      return false;
    }
    throw err;
  }
  return true;
}

/** The audience a section is created with: what is sent, closed to players otherwise. */
const audienceDe = (s: SectionEntree) => ({
  joueursLisent: s.joueursLisent ?? false,
  joueursEcrivent: s.joueursEcrivent ?? false,
});

/** Appends an imported section; returns its id. */
export function creerSection(
  db: Db,
  jeton: Jeton,
  ficheId: number,
  s: SectionEntree,
  prevenir: (objet: string, raison: string) => void,
  existante?: { id: number; version: number },
): number {
  const { universId, compteId } = jeton;
  const v = existante ?? ajouterSection(db, compteId, universId, ficheId, { titre: s.titre, contenu: s.contenu ?? '' });
  if (existante || s.joueursLisent || s.joueursEcrivent) {
    changerAudience(db, compteId, universId, ficheId, v.id, audienceDe(s));
  }
  prevenirTexte(preparerContenu(db, universId, compteId, s.contenu ?? ''), s.titre, prevenir);
  poserJoints(db, universId, { id: v.id, titre: s.titre }, s.fichiers, prevenir);
  db.prepare('UPDATE sections SET cle = ? WHERE id = ?').run(s.cle, v.id);
  return v.id;
}

/** Updates one imported section, field by field, against its current row; true when something was written. */
export function majSection(
  db: Db,
  jeton: Jeton,
  ficheId: number,
  ligne: SectionRow,
  s: SectionEntree,
  prevenir: (objet: string, raison: string) => void,
): boolean {
  const { universId, compteId } = jeton;
  let ecrit = false;

  if (ligne.titre !== s.titre) {
    renommerSection(db, compteId, universId, ficheId, ligne.id, s.titre);
    ecrit = true;
  }

  const lisent = s.joueursLisent ?? ligne.joueurs_lisent === 1;
  const ecrivent = s.joueursEcrivent ?? ligne.joueurs_ecrivent === 1;
  if (lisent !== (ligne.joueurs_lisent === 1) || ecrivent !== (ligne.joueurs_ecrivent === 1)) {
    changerAudience(db, compteId, universId, ficheId, ligne.id, { joueursLisent: lisent, joueursEcrivent: ecrivent });
    ecrit = true;
  }

  if (poserJoints(db, universId, ligne, s.fichiers, prevenir)) ecrit = true;

  // The text is compared once the known keys are resolved (AD-104): a link already resolved is « inchangée ».
  const voulu = s.contenu === undefined ? ligne.contenu : preparerContenu(db, universId, compteId, s.contenu);
  if (ligne.contenu !== voulu) {
    const courant = db.prepare('SELECT version FROM sections WHERE id = ?').get(ligne.id) as { version: number };
    ecrireContenu(db, compteId, universId, ficheId, ligne.id, voulu, courant.version);
    ecrit = true;
  }
  prevenirTexte(voulu, ligne.titre, prevenir);
  return ecrit;
}

const cle1 = (x: string) => x.toLowerCase();
const memeEnsemble = (a: string[], b: string[]) => {
  const k = new Set(a.map(cle1));
  return k.size === new Set(b.map(cle1)).size && b.every((x) => k.has(cle1(x)));
};

/** The set to write, or null when absent from the request or out of bounds (the batch is warned). */
function ensembleVoulu(
  voulu: string[] | undefined,
  max: number,
  longueur: number,
  nom: string,
  prevenir: (objet: string, raison: string) => void,
): string[] | null {
  if (voulu === undefined) return null;
  if (voulu.length > max || voulu.some((v) => v.length > longueur)) {
    prevenir('fiche', `${nom} hors bornes (${max} au plus, ${longueur} caractères au plus chacun) : non importés`);
    return null;
  }
  return voulu;
}


/**
 * `DELETE /fiches/:cle` (AD-119 (4)): the same service function as the screen, with the token's actor,
 * found by origin key. An unknown key writes nothing and counts nothing. Counted « supprimée » in the batch.
 */
export function supprimerFicheImport(
  db: Db,
  jeton: Jeton,
  lotId: number | null,
  cle: string,
  maintenant: Date = new Date(),
): void {
  if (lotId !== null) {
    const lot = lireLot(db, jeton, lotId, maintenant);
    if (lot.closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
  }
  if (!cleValide(cle)) return;
  avecContexte(db, { compteId: jeton.compteId, jetonId: jeton.id, origine: 'import', lotId }, () => {
    const f = db
      .prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle = ?')
      .get(jeton.universId, cle) as { id: number } | undefined;
    if (!f) return;
    supprimerFiche(db, { compteId: jeton.compteId }, jeton.universId, f.id);
    if (lotId !== null) noterDansLot(db, lotId, 'fiches', 'supprimees', [], maintenant);
  });
}

/** Reads the `?lot=` of a write: absent → no batch; otherwise an id. */
export function lotDeRequete(brut: unknown): number | null {
  if (brut === undefined) return null;
  if (typeof brut !== 'string' || !/^\d+$/.test(brut)) {
    throw new ErreurService('invalide', 'Lot invalide.', undefined, 'lot');
  }
  return Number(brut);
}