import { ecrire } from './historique.js';
import type { Db } from '../db/db.js';
import { baseCleFiche, baseCleUnivers, cleFicheValide, cleUniversValide, CLE_FICHE_MAX, CLE_UNIVERS_MAX, estId, slug, suffixer } from './cles-forme.js';
import { exigerRole, peutVoirFiche, roleDe } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import { estTypeFiche } from './types-fiche.js';
import type { Acteur } from './types.js';

/**
 * Keys of universes, sheets and sections (AD-146, B-99, B-100, B-104). The only place that draws, changes and
 * resolves keys, and the only reader and writer of `cles_anciennes` / `univers_cles_anciennes` (AD-2). The creation
 * of a universe, sheet or section stores the key drawn here, and the import stores the key it carries; no other
 * code draws or changes one.
 * A key is drawn at creation, a GM may change it, the former one keeps resolving; a numeric-only
 * reference is an id (no key is, a key has a letter).
 */

export type CreeeVia = 'ecran' | 'assistant' | 'import' | 'mcp';

// ---- drawing at creation ----

/** `type:title` of a new sheet, suffixed `-2`, `-3`… while another key or former key of the universe holds it. */
export function tirerCleFiche(db: Db, universId: number, type: string, titre: string): string {
  const prise = db.prepare(
    `SELECT 1 FROM fiches WHERE univers_id = ? AND cle = ?
     UNION ALL SELECT 1 FROM cles_anciennes WHERE univers_id = ? AND cle = ?`,
  );
  return suffixer(baseCleFiche(type, titre, 'sans-titre'), CLE_FICHE_MAX, (c) => prise.get(universId, c, universId, c) !== undefined);
}

/** Key of a new section, from its title, unique within the sheet. */
export function tirerCleSection(db: Db, ficheId: number, titre: string): string {
  const prise = db.prepare('SELECT 1 FROM sections WHERE fiche_id = ? AND cle = ?');
  return suffixer(slug(titre) || 'section', CLE_FICHE_MAX, (c) => prise.get(ficheId, c) !== undefined);
}

/** Key of a new universe, from its name, unique on the instance. `id` is the one the row has (or will have). */
export function tirerCleUnivers(db: Db, nom: string, id: number): string {
  const prise = db.prepare(
    'SELECT 1 FROM univers WHERE cle = ? UNION ALL SELECT 1 FROM univers_cles_anciennes WHERE cle = ?',
  );
  return suffixer(baseCleUnivers(nom, id), CLE_UNIVERS_MAX, (c) => prise.get(c, c) !== undefined);
}

// ---- change by a GM ----

const cleInvalide = (message: string) => new ErreurService('invalide', message, undefined, 'cle');
const clePrise = () => new ErreurService('conflit', 'Cette clé est déjà prise.', 'cle_prise');

function exigerMJHorsModeJoueur(db: Db, acteur: Acteur, universId: number): void {
  const role = exigerRole(db, universId, acteur.compteId);
  // A player does not know there is anything to change here (AD-22).
  if (role !== 'mj') throw introuvable();
  if (acteur.modeJoueur) throw refuse();
}

/**
 * The GM gives a sheet another key. The old one keeps resolving (`cles_anciennes`); a key held by
 * another sheet, or the former key of another sheet, is `cle_prise`; the sheet's own former key may
 * be taken back (its row goes). Returns the key now carried and the one it replaced (`null` if unchanged).
 */
export function changerCleFiche(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  cle: unknown,
): { cle: string; ancienne: string | null } {
  exigerMJHorsModeJoueur(db, acteur, universId);
  const fiche = db.prepare('SELECT cle FROM fiches WHERE id = ? AND univers_id = ?').get(ficheId, universId) as
    | { cle: string }
    | undefined;
  if (!fiche) throw introuvable();
  // A bare type word (`lieu`) is not a key: a key is `type:name` or a name of its own, never the word of a type.
  if (typeof cle !== 'string' || !cleFicheValide(cle) || estTypeFiche(cle)) {
    throw cleInvalide('Clé : minuscules, chiffres, « - » et « _ », au plus un « : », de 2 à 200 caractères, avec au moins une lettre.');
  }
  if (cle === fiche.cle) return { cle, ancienne: null };
  return ecrire(db, acteur.compteId, () => {
    const autre = db.prepare('SELECT 1 FROM fiches WHERE univers_id = ? AND cle = ? AND id <> ?').get(universId, cle, ficheId);
    const ancienne = db.prepare('SELECT fiche_id FROM cles_anciennes WHERE univers_id = ? AND cle = ?').get(universId, cle) as
      | { fiche_id: number }
      | undefined;
    if (autre !== undefined || (ancienne !== undefined && ancienne.fiche_id !== ficheId)) throw clePrise();
    if (ancienne !== undefined) db.prepare('DELETE FROM cles_anciennes WHERE univers_id = ? AND cle = ?').run(universId, cle);
    db.prepare('UPDATE fiches SET cle = ? WHERE id = ?').run(cle, ficheId);
    db.prepare('INSERT OR REPLACE INTO cles_anciennes (univers_id, cle, fiche_id) VALUES (?, ?, ?)').run(universId, fiche.cle, ficheId);
    return { cle, ancienne: fiche.cle };
  });
}

/** Same for a universe: unique on the instance, its form is narrower (2 to 40, lowercase letters, digits, hyphens). */
export function changerCleUnivers(
  db: Db,
  acteur: Acteur,
  universId: number,
  cle: unknown,
): { cle: string; ancienne: string | null } {
  exigerMJHorsModeJoueur(db, acteur, universId);
  const univers = db.prepare('SELECT cle FROM univers WHERE id = ?').get(universId) as { cle: string } | undefined;
  if (!univers) throw introuvable();
  if (typeof cle !== 'string' || !cleUniversValide(cle)) {
    throw cleInvalide('Identifiant : minuscules, chiffres et « - », de 2 à 40 caractères, avec au moins une lettre.');
  }
  if (cle === univers.cle) return { cle, ancienne: null };
  return db.transaction(() => {
    const autre = db.prepare('SELECT 1 FROM univers WHERE cle = ? AND id <> ?').get(cle, universId);
    const ancienne = db.prepare('SELECT univers_id FROM univers_cles_anciennes WHERE cle = ?').get(cle) as
      | { univers_id: number }
      | undefined;
    if (autre !== undefined || (ancienne !== undefined && ancienne.univers_id !== universId)) throw clePrise();
    if (ancienne !== undefined) db.prepare('DELETE FROM univers_cles_anciennes WHERE cle = ?').run(cle);
    db.prepare('UPDATE univers SET cle = ? WHERE id = ?').run(cle, universId);
    db.prepare('INSERT OR REPLACE INTO univers_cles_anciennes (cle, univers_id) VALUES (?, ?)').run(univers.cle, universId);
    return { cle, ancienne: univers.cle };
  })();
}

// ---- resolution (no right check: the caller reads the target under its own guards) ----

export interface Resolution {
  id: number;
  /** The current key of the target. */
  cle: string;
  /** The reference was a former key: the caller may redirect to `cle`. */
  ancienne: boolean;
}

/** A sheet of the universe from an id (digits only), its key, or a former key; `null` if none. */
export function resoudreFiche(db: Db, universId: number, reference: string): Resolution | null {
  if (estId(reference)) {
    const f = db.prepare('SELECT id, cle FROM fiches WHERE id = ? AND univers_id = ?').get(Number(reference), universId) as
      | { id: number; cle: string }
      | undefined;
    return f ? { ...f, ancienne: false } : null;
  }
  const f = db.prepare('SELECT id, cle FROM fiches WHERE univers_id = ? AND cle = ?').get(universId, reference) as
    | { id: number; cle: string }
    | undefined;
  if (f) return { ...f, ancienne: false };
  const a = db
    .prepare(
      `SELECT f.id, f.cle FROM cles_anciennes a JOIN fiches f ON f.id = a.fiche_id
       WHERE a.univers_id = ? AND a.cle = ?`,
    )
    .get(universId, reference) as { id: number; cle: string } | undefined;
  return a ? { ...a, ancienne: true } : null;
}

/** A universe from an id (digits only), its key, or a former key; `null` if none. */
export function resoudreUnivers(db: Db, reference: string): Resolution | null {
  if (estId(reference)) {
    const u = db.prepare('SELECT id, cle FROM univers WHERE id = ?').get(Number(reference)) as
      | { id: number; cle: string }
      | undefined;
    return u ? { ...u, ancienne: false } : null;
  }
  const u = db.prepare('SELECT id, cle FROM univers WHERE cle = ?').get(reference) as { id: number; cle: string } | undefined;
  if (u) return { ...u, ancienne: false };
  const a = db
    .prepare(
      `SELECT u.id, u.cle FROM univers_cles_anciennes a JOIN univers u ON u.id = a.univers_id WHERE a.cle = ?`,
    )
    .get(reference) as { id: number; cle: string } | undefined;
  return a ? { ...a, ancienne: true } : null;
}

/** Key of a sheet by id (for the services that name it), no right check. */
export function cleDeFiche(db: Db, ficheId: number): string | null {
  return (db.prepare('SELECT cle FROM fiches WHERE id = ?').get(ficheId) as { cle: string } | undefined)?.cle ?? null;
}

/**
 * The key of a sheet of the universe for a member who reads it (the redirection of a numeric address, B-101);
 * `null` for an unknown sheet, one the account cannot read and a non-member alike.
 */
export function cleDeFicheLue(db: Db, compteId: number, universId: number, ficheId: number): string | null {
  const role = roleDe(db, universId, compteId);
  if (role === null) return null;
  const f = db.prepare('SELECT cle FROM fiches WHERE id = ? AND univers_id = ?').get(ficheId, universId) as { cle: string } | undefined;
  return f && peutVoirFiche(db, role, ficheId, { compteId, modeJoueur: false }) ? f.cle : null;
}

/** Key of an universe by id, no right check. */
export function cleDeUnivers(db: Db, universId: number): string | null {
  return (db.prepare('SELECT cle FROM univers WHERE id = ?').get(universId) as { cle: string } | undefined)?.cle ?? null;
}
