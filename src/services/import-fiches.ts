import type { Db } from '../db/db.js';
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
import { changerSousType, changerTypeFiche, creerFiche, renommerFiche, validerSousType } from './fiches.js';
import type { Jeton } from './jetons.js';
import { preparerContenu } from './liens.js';
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

/** The thirteen settable types the import accepts; a session report waits for its campaign. */
export const TYPES_IMPORT: readonly string[] = TYPES.filter((t) => t.reglable).map((t) => t.type);
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
}

interface FicheEntree {
  type: TypeImport;
  titre: string;
  /** `undefined`: the request says nothing (left as is); `null`: no sub-type wanted. */
  sousType?: string | null;
  pj: boolean;
  /** `undefined`: the request says nothing (left as is). Cleaned, bounds not yet checked. */
  alias?: string[];
  etiquettes?: string[];
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
  ) {
    super(raison);
  }
}

const milliers = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** An origin key: 1 to 200 characters, no `|`, `]` nor line break (contract of the import API). */
export function cleValide(cle: string): boolean {
  return cle.length >= 1 && cle.length <= 200 && !/[|\]\r\n]/.test(cle);
}

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
  if (type === 'compte_rendu') {
    throw new Refus('type', 'fiche', 'type « compte_rendu » : pas accepté par cette version');
  }
  if (!TYPES_IMPORT.includes(type)) {
    throw new Refus('type', 'fiche', `type « ${type} » inconnu de Kanevas`);
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
    return {
      cle: s.cle,
      titre: titreS,
      contenu,
      joueursLisent: booleen(s.joueursLisent, `${ch}.joueursLisent`, 'section'),
      joueursEcrivent: booleen(s.joueursEcrivent, `${ch}.joueursEcrivent`, 'section'),
    };
  });
  return { type, titre, sousType, pj, alias, etiquettes, creeLe, modifieLe, sections };
}

interface FicheLue {
  id: number;
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
}

interface MarqueSection {
  titre?: string;
  joueursLisent?: boolean;
  joueursEcrivent?: boolean;
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
    throw new ErreurService('invalide', r.raison, undefined, r.champ);
  };

  let entree: FicheEntree;
  try {
    if (!cleValide(cle)) throw new Refus('cle', 'fiche', "clé d'origine invalide");
    entree = lireCorps(corps, maintenant);
  } catch (e) {
    if (e instanceof Refus) return refuser(e);
    throw e;
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
    .prepare('SELECT id, type, titre, charge, sous_type, dernier_import FROM fiches WHERE univers_id = ? AND cle_origine = ?')
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
    const fiche = creerFiche(db, compteId, universId, {
      type: e.type,
      titre: e.titre,
      sousType: e.sousType ?? null,
      charge,
      origine: { cle, creeLe: e.creeLe, modifieLe: e.modifieLe, dernierImport: marque },
    });
    // The sheets that waited for this key now point at it, in this transaction (AD-116).
    resoudreClesEnAttente(db, universId, cle, fiche.id);
    if (alias?.length || etiquettes?.length) {
      poserEtiquetage(db, { compteId }, universId, fiche.id, { alias: alias ?? [], etiquettes: etiquettes ?? [] });
    }
    for (const s of e.sections) creerSection(db, jeton, fiche.id, s);
    // Adding sections touched the sheet with « now »; a date given by the source is the sheet's.
    if (e.modifieLe) db.prepare('UPDATE fiches SET modifie_le = ? WHERE id = ?').run(e.modifieLe, fiche.id);
    return { id: fiche.id, etat: 'creee' };
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
  } else if (di && di.type === existante.type && (di.pj ?? null) === pjCourant) {
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
      demandes.push(creerSection(db, jeton, existante.id, s));
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
function creerSection(db: Db, jeton: Jeton, ficheId: number, s: SectionEntree): number {
  const { universId, compteId } = jeton;
  const v = ajouterSection(db, compteId, universId, ficheId, { titre: s.titre, contenu: s.contenu });
  if (s.joueursLisent || s.joueursEcrivent) {
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

  let versionImportee = ligne.version_importee;
  // The text is compared once the known keys are resolved (AD-104): a link already resolved is « inchangée ».
  const voulu = preparerContenu(db, universId, compteId, s.contenu);
  if (ligne.contenu !== voulu) {
    if (ligne.version_importee !== null && ligne.version === ligne.version_importee) {
      const v = ecrireContenu(db, compteId, universId, ficheId, ligne.id, voulu, ligne.version);
      versionImportee = v.version;
      ecrit = true;
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

/** Reads the `?lot=` of a write: absent → no batch; otherwise an id. */
export function lotDeRequete(brut: unknown): number | null {
  if (brut === undefined) return null;
  if (typeof brut !== 'string' || !/^\d+$/.test(brut)) {
    throw new ErreurService('invalide', 'Lot invalide.', undefined, 'lot');
  }
  return Number(brut);
}
