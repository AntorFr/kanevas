import { creerCompteRendu, TITRE_SECTION_COMPTE_RENDU } from './comptes_rendus.js';
import type { Db } from '../db/db.js';
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
  changerSousType,
  changerTypeFiche,
  creerFiche,
  deplacerFiche,
  renommerFiche,
  supprimerFiche,
  validerSousType,
} from './fiches.js';
import type { Jeton } from './jetons.js';
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
import { TYPES, typeActif } from './types-fiche.js';

/** Every product sheet type is accepted by the import. */
export const TYPES_IMPORT: readonly string[] = TYPES.map((t) => t.type);
type TypeImport = string;

export type EtatImport = 'creee' | 'mise_a_jour' | 'inchangee';

export interface ResultatFiche {
  id: number;
  etat: EtatImport;
  avertissements: string[];
}

interface SectionEntree {
  cle: string;
  titre: string;
  contenu: string;
  joueursLisent: boolean;
  joueursEcrivent: boolean;
  /** Origin keys of the files joined to the section; `undefined`: the request says nothing. */
  fichiers?: string[];
}

interface FicheEntree {
  type: TypeImport;
  titre: string;
  /** `undefined`: the request says nothing (left as is); `null`: no sub-type wanted. */
  sousType?: string | null;
  pj: boolean;
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

function booleen(v: unknown, champ: string, objet: string): boolean {
  if (v === undefined) return false;
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
    const contenu = s.contenu === undefined ? '' : s.contenu;
    if (typeof contenu !== 'string') {
      throw new Refus(`${ch}.contenu`, 'section', `section « ${titreS} » : contenu en texte attendu`);
    }
    if (contenu.length > MAX_CONTENU_SECTION) {
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
  return { type, titre, sousType, pj, campagne, alias, etiquettes, parent, illustration, creeLe, modifieLe, sections };
}

interface FicheLue {
  id: number;
  cree_le: string;
  type: string;
  titre: string;
  charge: string;
  sous_type: string | null;
  dernier_import: string | null;
}

interface SectionLue extends SectionRow {
  cle_origine: string | null;
  version_importee: number | null;
  dernier_import: string | null;
}

interface MarqueFiche {
  titre?: string;
  type?: string;
  pj?: boolean | null;
  sousType?: string | null;
  alias?: string[];
  etiquettes?: string[];
  /** `demande`: the key asked; `ecrit`: id of the parent the import left (null: none). AD-115 (4). */
  parent?: { demande: string | null; ecrit: number | null };
  /** `demande`: the key asked; `ecrit`: id of the illustration the import left (null: none). B-48. */
  illustration?: { demande: string | null; ecrit: number | null };
}

interface MarqueSection {
  titre?: string;
  joueursLisent?: boolean;
  joueursEcrivent?: boolean;
  /** Ids of the files the import has joined (B-48): one a human unjoined since is not joined again. */
  fichiers?: { ecrits: number[] };
}

const desactive = (type: string) => `type_desactive : le type « ${type} » est désactivé dans cet univers`;

const lireJson = <T>(brut: string | null): T | null => (brut === null ? null : (JSON.parse(brut) as T));
const pjDe = (type: string, charge: string): boolean | null =>
  type === 'personnage' ? (JSON.parse(charge) as { pj?: boolean }).pj === true : null;

const ISSUE: Record<EtatImport, Issue> = {
  creee: 'creees',
  mise_a_jour: 'mises_a_jour',
  inchangee: 'inchangees',
};

/**
 * « Assurer » a sheet by origin key (AD-104, B-47, B-48): creates it, updates it, or does nothing.
 * Everything goes through the write services with the token's account as actor (AD-2). A field the
 * import wrote and a human changed since (`dernier_import`, `version_importee`) is left alone and
 * the batch is warned. Nothing is deleted by omission; a section without origin key is never touched.
 * A refused request writes nothing but, with a batch, counts « 1 refusée » in it.
 */
export function assurerFiche(
  db: Db,
  jeton: Jeton,
  lotId: number | null,
  cle: string,
  corps: unknown,
  maintenant: Date = new Date(),
): ResultatFiche {
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
  try {
    if (!cleValide(cle)) throw new Refus('cle', 'fiche', "clé d'origine invalide");
    entree = lireCorps(corps, maintenant);
    if (entree.campagne !== undefined) {
      // The key of the adventure sheet this report names (AD-125 (2)): a sheet of `aventure` type of the token's universe.
      const campagne = db
        .prepare("SELECT id FROM fiches WHERE univers_id = ? AND cle_origine = ? AND type = 'aventure'")
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

  try {
    return db.transaction((): ResultatFiche => {
      const avert: EntreeRapport[] = [];
      const prevenir = (objet: string, raison: string) =>
        avert.push({ cle, objet, raison, gravite: 'avertissement' });
      const resultat = ecrire(db, jeton, cle, entree, prevenir);
      if (lotId !== null) noterDansLot(db, lotId, 'fiches', ISSUE[resultat.etat], avert, maintenant);
      return { ...resultat, avertissements: avert.map((a) => a.raison) };
    })();
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
  const existante = db
    .prepare('SELECT id, type, titre, charge, sous_type, dernier_import, cree_le FROM fiches WHERE univers_id = ? AND cle_origine = ?')
    .get(universId, cle) as FicheLue | undefined;
  const charge = e.type === 'personnage' ? { pj: e.pj } : {};

  if (!existante) {
    const marque: MarqueFiche = {
      titre: e.titre,
      type: e.type,
      pj: pjDe(e.type, JSON.stringify(charge)),
      sousType: e.sousType ?? null,
    };
    if (!typeActif(db, universId, e.type)) prevenir('fiche', desactive(e.type));
    const alias = ensembleVoulu(e.alias, MAX_ALIAS, LONGUEUR_ALIAS, 'alias', prevenir);
    const etiquettes = ensembleVoulu(e.etiquettes, MAX_ETIQUETTES, LONGUEUR_ETIQUETTE, 'étiquettes', prevenir);
    if (alias) marque.alias = alias;
    if (etiquettes) marque.etiquettes = etiquettes;
    const origine = { cle, creeLe: e.creeLe, modifieLe: e.modifieLe, dernierImport: marque };
    const fiche = e.type === 'compte_rendu'
      ? creerCompteRendu(db, compteId, universId, e.campagneId!, {
          titre: e.titre, texte: e.sections[0]?.contenu, origine,
        })
      : creerFiche(db, compteId, universId, {
      type: e.type,
      titre: e.titre,
      sousType: e.sousType ?? null,
      charge,
      origine,
    });
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
    if (e.parent !== undefined) {
      const m = poserParent(db, jeton, fiche.id, cle, e.parent, null, undefined, prevenir);
      if (m) {
        marque.parent = m;
        db.prepare('UPDATE fiches SET dernier_import = ? WHERE id = ?').run(JSON.stringify(marque), fiche.id);
      }
    }
    if (e.illustration !== undefined) {
      const m = poserIllustration(db, jeton, fiche.id, e.illustration, undefined, prevenir);
      if (m) {
        marque.illustration = m;
        db.prepare('UPDATE fiches SET dernier_import = ? WHERE id = ?').run(JSON.stringify(marque), fiche.id);
      }
    }
    // Adding sections touched the sheet with « now »; a date given by the source is the sheet's.
    if (e.modifieLe) db.prepare('UPDATE fiches SET modifie_le = ? WHERE id = ?').run(e.modifieLe, fiche.id);
    return { id: fiche.id, etat: 'creee' };
  }

  if (e.creeLe && e.creeLe !== existante.cree_le) prevenir('fiche', 'creeLe non modifiable, ignorée');
  if (e.type === 'compte_rendu' && e.campagneId !== (JSON.parse(existante.charge) as { campagne_id?: number }).campagne_id) {
    prevenir('fiche', 'campagne non modifiable, ignorée');
  }
  let ecrit = false;
  const di = lireJson<MarqueFiche>(existante.dernier_import);
  const marque: MarqueFiche = { ...(di ?? {}) };

  // Title.
  if (existante.titre === e.titre) marque.titre = e.titre;
  else if (di?.titre === existante.titre) {
    renommerFiche(db, compteId, universId, existante.id, e.titre);
    marque.titre = e.titre;
    ecrit = true;
  } else prevenir('fiche', 'titre modifié dans Kanevas : non écrasé');

  // Type (and PJ, for a character) are one unit.
  const pjCourant = pjDe(existante.type, existante.charge);
  const pjVoulu = e.type === 'personnage' ? e.pj : null;
  if (existante.type === e.type && pjCourant === pjVoulu) {
    marque.type = e.type;
    marque.pj = pjVoulu;
  } else if (di && di.type === existante.type && (di.pj ?? null) === pjCourant
    && e.type !== 'compte_rendu' && existante.type !== 'compte_rendu') {
    if (!typeActif(db, universId, e.type)) prevenir('fiche', desactive(e.type));
    changerTypeFiche(db, compteId, universId, existante.id, e.type, charge);
    marque.type = e.type;
    marque.pj = pjVoulu;
    // A type change clears the sub-type of the sheet: the one the import wrote goes with it.
    if (existante.type !== e.type) marque.sousType = null;
    ecrit = true;
  } else prevenir('fiche', 'type modifié dans Kanevas : non écrasé');

  // Sub-type, with the same protection: what a human changed since the last import is left alone.
  if (e.sousType !== undefined) {
    const courant = (
      db.prepare('SELECT sous_type FROM fiches WHERE id = ?').get(existante.id) as { sous_type: string | null }
    ).sous_type;
    const voulu = e.sousType;
    if (courant === voulu) marque.sousType = voulu;
    else if ((marque.sousType ?? null) === courant) {
      changerSousType(db, compteId, universId, existante.id, voulu);
      marque.sousType = voulu;
      ecrit = true;
    } else prevenir('fiche', 'sous-type modifié dans Kanevas : non écrasé');
  }

  // Aliases and labels: each set is compared as a set (no case, no order) against the last import.
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
    if (voulu === null) continue;
    const actuel = courant[x.champ];
    const ecritAvant = marque[x.champ];
    if (memeEnsemble(actuel, voulu)) {
      if (!ecritAvant || !memeEnsemble(ecritAvant, voulu)) marque[x.champ] = voulu;
    } else if (memeEnsemble(ecritAvant ?? [], actuel)) {
      aEcrire[x.champ] = voulu;
      marque[x.champ] = voulu;
      etiquetage = true;
    } else prevenir('fiche', x.champ === 'alias' ? 'alias modifiés dans Kanevas : non écrasés' : 'étiquettes modifiées dans Kanevas : non écrasées');
  }
  if (etiquetage) {
    poserEtiquetage(db, { compteId }, universId, existante.id, aEcrire);
    ecrit = true;
  }

  // Parent: written through `deplacerFiche`, protected like the other fields (AD-115 (4)).
  if (e.parent !== undefined) {
    const courantParent = (
      db.prepare('SELECT parent_id FROM fiches WHERE id = ?').get(existante.id) as { parent_id: number | null }
    ).parent_id;
    const m = poserParent(db, jeton, existante.id, cle, e.parent, courantParent, di?.parent, prevenir);
    if (m) {
      if (m.ecrit !== courantParent) ecrit = true;
      marque.parent = m;
    }
  }

  // Illustration: protected like the parent, an image set by a human is not replaced (B-48).
  if (e.illustration !== undefined) {
    const courantIll = (
      db.prepare('SELECT illustration_fichier_id AS id FROM fiches WHERE id = ?').get(existante.id) as { id: number | null }
    ).id;
    const m = poserIllustration(db, jeton, existante.id, e.illustration, di?.illustration, prevenir);
    if (m) {
      if (m.ecrit !== courantIll) ecrit = true;
      marque.illustration = m;
    }
  }

  // Sections, by origin key.
  const lignes = db
    .prepare('SELECT * FROM sections WHERE fiche_id = ? ORDER BY ordre')
    .all(existante.id) as SectionLue[];
  const parCle = new Map(lignes.filter((l) => l.cle_origine !== null).map((l) => [l.cle_origine!, l]));
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

  const json = JSON.stringify(marque);
  if (json !== (existante.dernier_import ?? null)) {
    db.prepare('UPDATE fiches SET dernier_import = ? WHERE id = ?').run(json, existante.id);
  }
  return { id: existante.id, etat: ecrit ? 'mise_a_jour' : 'inchangee' };
}

/**
 * Sets the illustration the request names, unless a human changed it since the import (B-48). A key the universe
 * does not know yet waits (`fichiers_attente`) and warns the batch. Returns the new `dernier_import.illustration`,
 * or undefined to leave it as it was.
 */
function poserIllustration(
  db: Db,
  jeton: Jeton,
  ficheId: number,
  voulu: string | null,
  avant: { demande: string | null; ecrit: number | null } | undefined,
  prevenir: (objet: string, raison: string) => void,
): { demande: string | null; ecrit: number | null } | undefined {
  const { universId, compteId } = jeton;
  const courant = (
    db.prepare('SELECT illustration_fichier_id AS id FROM fiches WHERE id = ?').get(ficheId) as { id: number | null }
  ).id;
  const fichier = voulu === null ? undefined : fichierDeCle(db, universId, voulu);
  if (fichier && fichier.id === courant) {
    oublierAttenteIllustration(db, ficheId);
    return { demande: voulu, ecrit: courant };
  }
  if (courant !== (avant?.ecrit ?? null)) {
    prevenir('fiche', 'illustration modifiée dans Kanevas : non écrasée');
    return undefined;
  }
  oublierAttenteIllustration(db, ficheId);
  if (voulu === null) {
    if (courant !== null) retirerIllustration(db, { compteId }, universId, ficheId);
    return { demande: null, ecrit: null };
  }
  if (!fichier) {
    noterAttente(db, universId, voulu, { ficheId, maniere: 'illustration' });
    prevenir('fiche', `fichier « ${voulu} » inconnu : illustration en attente`);
    return { demande: voulu, ecrit: courant };
  }
  choisirIllustration(db, { compteId }, universId, ficheId, fichier.id);
  return { demande: voulu, ecrit: fichier.id };
}

/**
 * Joins the files the request names to a section, by origin key (B-48): a key the universe does not know
 * waits; a file a human unjoined since is not joined again; the 101st is not joined. Returns the new
 * `dernier_import.fichiers`, or undefined when the request says nothing.
 */
function poserJoints(
  db: Db,
  universId: number,
  section: { id: number; titre: string },
  voulu: string[] | undefined,
  avant: number[] | undefined,
  prevenir: (objet: string, raison: string) => void,
): { marque: { ecrits: number[] }; ecrit: boolean } | undefined {
  if (voulu === undefined) return undefined;
  const actuel = new Set(jointsDe(db, section.id));
  const ecrits = new Set(avant ?? []);
  let ecrit = false;
  let retire = false;
  for (const cle of voulu) {
    const f = fichierDeCle(db, universId, cle);
    if (!f) {
      noterAttente(db, universId, cle, { sectionId: section.id, maniere: 'joint' });
      prevenir('section', `section « ${section.titre} » : fichier « ${cle} » inconnu : référence en attente`);
    } else if (actuel.has(f.id)) {
      ecrits.add(f.id);
    } else if (ecrits.has(f.id)) {
      retire = true;
    } else if (joindreParImport(db, section.id, f.id)) {
      ecrits.add(f.id);
      ecrit = true;
    } else {
      prevenir('section', `section « ${section.titre} » : ${MAX_FICHIERS_JOINTS} fichiers joints au plus, « ${cle} » non joint`);
    }
  }
  if (retire) prevenir('section', `section « ${section.titre} » : fichiers joints modifiés dans Kanevas : non rétablis`);
  return { marque: { ecrits: [...ecrits].sort((a, b) => a - b) }, ecrit };
}

/** Warns, once per key, of the `fichier:cle:` references a stored text still carries (they wait for their file). */
function prevenirTexte(contenu: string, titre: string, prevenir: (objet: string, raison: string) => void): void {
  for (const cle of new Set(extraireClesFichier(contenu))) {
    prevenir('section', `section « ${titre} » : fichier « ${cle} » inconnu : référence en attente`);
  }
}

/**
 * Puts the sheet under the parent the request names, unless a human moved it since the import.
 * Returns the new `dernier_import.parent`, or undefined to leave it as it was.
 */
function poserParent(
  db: Db,
  jeton: Jeton,
  ficheId: number,
  cle: string,
  voulu: string | null,
  courant: number | null,
  avant: { demande: string | null; ecrit: number | null } | undefined,
  prevenir: (objet: string, raison: string) => void,
): { demande: string | null; ecrit: number | null } | undefined {
  const { universId, compteId } = jeton;
  const cible =
    voulu === null
      ? null
      : ((
          db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle_origine = ?').get(universId, voulu) as
            | { id: number }
            | undefined
        )?.id ?? undefined);
  // Already where it should be.
  if (cible !== undefined && cible === courant) return { demande: voulu, ecrit: courant };
  // What the import left is what is there now, else a human moved it (B-48).
  if (courant !== (avant?.ecrit ?? null)) {
    prevenir('fiche', 'parent modifié dans Kanevas : non écrasé');
    return undefined;
  }
  if (cible === undefined) {
    prevenir('fiche', `parent ${voulu} inconnu : fiche écrite sans parent`);
    return { demande: voulu, ecrit: courant };
  }
  try {
    deplacerFiche(db, { compteId }, universId, ficheId, cible);
  } catch (err) {
    if (err instanceof ErreurService && err.detail === 'cycle') {
      prevenir('fiche', `parent ${voulu} ferait un cycle : non posé`);
      return { demande: voulu, ecrit: courant };
    }
    if (err instanceof ErreurService && err.detail === 'trop_profond') {
      prevenir('fiche', `parent ${voulu} : hiérarchie trop profonde : non posé`);
      return { demande: voulu, ecrit: courant };
    }
    throw err;
  }
  return { demande: voulu, ecrit: cible };
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

/** Appends an imported section; returns its id. */
function creerSection(
  db: Db,
  jeton: Jeton,
  ficheId: number,
  s: SectionEntree,
  prevenir: (objet: string, raison: string) => void,
  existante?: { id: number; version: number },
): number {
  const { universId, compteId } = jeton;
  const v = existante ?? ajouterSection(db, compteId, universId, ficheId, { titre: s.titre, contenu: s.contenu });
  if (existante || s.joueursLisent || s.joueursEcrivent) {
    changerAudience(db, compteId, universId, ficheId, v.id, {
      joueursLisent: s.joueursLisent,
      joueursEcrivent: s.joueursEcrivent,
    });
  }
  const marque: MarqueSection = {
    titre: s.titre,
    joueursLisent: s.joueursLisent,
    joueursEcrivent: s.joueursEcrivent,
  };
  prevenirTexte(preparerContenu(db, universId, compteId, s.contenu), s.titre, prevenir);
  const joints = poserJoints(db, universId, { id: v.id, titre: s.titre }, s.fichiers, undefined, prevenir);
  if (joints) marque.fichiers = joints.marque;
  db.prepare('UPDATE sections SET cle_origine = ?, version_importee = ?, dernier_import = ? WHERE id = ?').run(
    s.cle,
    v.version,
    JSON.stringify(marque),
    v.id,
  );
  return v.id;
}

/** Updates one imported section, field by field; true when something was written. */
function majSection(
  db: Db,
  jeton: Jeton,
  ficheId: number,
  ligne: SectionLue,
  s: SectionEntree,
  prevenir: (objet: string, raison: string) => void,
): boolean {
  const { universId, compteId } = jeton;
  let ecrit = false;
  const di = lireJson<MarqueSection>(ligne.dernier_import);
  const marque: MarqueSection = { ...(di ?? {}) };

  if (ligne.titre === s.titre) marque.titre = s.titre;
  else if (di?.titre === ligne.titre) {
    renommerSection(db, compteId, universId, ficheId, ligne.id, s.titre);
    marque.titre = s.titre;
    ecrit = true;
  } else prevenir('section', `section « ${ligne.titre} » : titre modifié dans Kanevas : non écrasé`);

  const lisent = ligne.joueurs_lisent === 1;
  const ecrivent = ligne.joueurs_ecrivent === 1;
  if (lisent === s.joueursLisent && ecrivent === s.joueursEcrivent) {
    marque.joueursLisent = lisent;
    marque.joueursEcrivent = ecrivent;
  } else if (di && di.joueursLisent === lisent && di.joueursEcrivent === ecrivent) {
    changerAudience(db, compteId, universId, ficheId, ligne.id, {
      joueursLisent: s.joueursLisent,
      joueursEcrivent: s.joueursEcrivent,
    });
    marque.joueursLisent = s.joueursLisent;
    marque.joueursEcrivent = s.joueursEcrivent;
    ecrit = true;
  } else {
    prevenir('section', `section « ${ligne.titre} » : audience modifiée dans Kanevas : non écrasée`);
  }

  const joints = poserJoints(db, universId, ligne, s.fichiers, di?.fichiers?.ecrits, prevenir);
  if (joints) {
    marque.fichiers = joints.marque;
    if (joints.ecrit) ecrit = true;
  }

  let versionImportee = ligne.version_importee;
  // The text is compared once the known keys are resolved (AD-104): a link already resolved is « inchangée ».
  const voulu = preparerContenu(db, universId, compteId, s.contenu);
  if (ligne.contenu === voulu) prevenirTexte(voulu, ligne.titre, prevenir);
  else {
    if (ligne.version_importee !== null && ligne.version === ligne.version_importee) {
      const v = ecrireContenu(db, compteId, universId, ficheId, ligne.id, voulu, ligne.version);
      versionImportee = v.version;
      ecrit = true;
      prevenirTexte(voulu, ligne.titre, prevenir);
    } else {
      prevenir('section', `section « ${ligne.titre} » modifiée dans Kanevas depuis le dernier import : non écrasée`);
    }
  }

  const json = JSON.stringify(marque);
  if (json !== ligne.dernier_import || versionImportee !== ligne.version_importee) {
    db.prepare('UPDATE sections SET dernier_import = ?, version_importee = ? WHERE id = ?').run(
      json,
      versionImportee,
      ligne.id,
    );
  }
  return ecrit;
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
  db.transaction(() => {
    const f = db
      .prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle_origine = ?')
      .get(jeton.universId, cle) as { id: number } | undefined;
    if (!f) return;
    supprimerFiche(db, { compteId: jeton.compteId }, jeton.universId, f.id);
    if (lotId !== null) noterDansLot(db, lotId, 'fiches', 'supprimees', [], maintenant);
  })();
}

/** Reads the `?lot=` of a write: absent → no batch; otherwise an id. */
export function lotDeRequete(brut: unknown): number | null {
  if (brut === undefined) return null;
  if (typeof brut !== 'string' || !/^\d+$/.test(brut)) {
    throw new ErreurService('invalide', 'Lot invalide.', undefined, 'lot');
  }
  return Number(brut);
}
