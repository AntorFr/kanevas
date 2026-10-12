import type { Db } from '../db/db.js';
import { ErreurService } from './erreurs.js';
import { changerTypeFiche, creerFiche, renommerFiche } from './fiches.js';
import type { Jeton } from './jetons.js';
import { lireLot, noterDansLot, type EntreeRapport, type Issue } from './lots.js';
import {
  ajouterSection,
  changerAudience,
  ecrireContenu,
  MAX_CONTENU_SECTION,
  renommerSection,
  reordonnerSections,
} from './sections.js';
import type { SectionRow } from './types.js';

/** The six types the import accepts in this version; a session report waits for its campaign. */
export const TYPES_IMPORT = ['personnage', 'lieu', 'faction', 'objet', 'evenement', 'quete'] as const;
type TypeImport = (typeof TYPES_IMPORT)[number];

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
  pj: boolean;
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
  if (!(TYPES_IMPORT as readonly string[]).includes(type)) {
    throw new Refus('type', 'fiche', `type « ${type} » inconnu de Kanevas`);
  }
  const titre = texte(c.titre, 'titre', 'fiche', 1, 120, 'titre');
  const creeLe = date(c.creeLe, 'creeLe', maintenant);
  const modifieLe = date(c.modifieLe, 'modifieLe', maintenant);
  if (creeLe && modifieLe && modifieLe < creeLe) {
    throw new Refus('modifieLe', 'fiche', 'modifieLe : antérieure à creeLe');
  }
  const pj = booleen(c.pj, 'pj', 'fiche');
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
  return { type: type as TypeImport, titre, pj, creeLe, modifieLe, sections };
}

interface FicheLue {
  id: number;
  type: string;
  titre: string;
  charge: string;
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
}

interface MarqueSection {
  titre?: string;
  joueursLisent?: boolean;
  joueursEcrivent?: boolean;
}

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

  return db.transaction((): ResultatFiche => {
    const avert: EntreeRapport[] = [];
    const prevenir = (objet: string, raison: string) =>
      avert.push({ cle, objet, raison, gravite: 'avertissement' });
    const resultat = ecrire(db, jeton, cle, entree, prevenir);
    if (lotId !== null) noterDansLot(db, lotId, 'fiches', ISSUE[resultat.etat], avert, maintenant);
    return { ...resultat, avertissements: avert.map((a) => a.raison) };
  })();
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
    .prepare('SELECT id, type, titre, charge, dernier_import FROM fiches WHERE univers_id = ? AND cle_origine = ?')
    .get(universId, cle) as FicheLue | undefined;
  const charge = e.type === 'personnage' ? { pj: e.pj } : {};

  if (!existante) {
    const marque: MarqueFiche = { titre: e.titre, type: e.type, pj: pjDe(e.type, JSON.stringify(charge)) };
    const fiche = creerFiche(db, compteId, universId, {
      type: e.type,
      titre: e.titre,
      charge,
      origine: { cle, creeLe: e.creeLe, modifieLe: e.modifieLe, dernierImport: marque },
    });
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
    changerTypeFiche(db, compteId, universId, existante.id, e.type, charge);
    marque.type = e.type;
    marque.pj = pjVoulu;
    ecrit = true;
  } else prevenir('fiche', 'type modifié dans Kanevas : non écrasé');

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
  if (ligne.contenu !== s.contenu) {
    if (ligne.version_importee !== null && ligne.version === ligne.version_importee) {
      const v = ecrireContenu(db, compteId, universId, ficheId, ligne.id, s.contenu, ligne.version);
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
