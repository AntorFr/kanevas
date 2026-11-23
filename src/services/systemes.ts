import type { Db } from '../db/db.js';
import { exigerMJ, lectureSysteme } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import type { Role } from './types.js';

export interface SystemeCatalogue {
  id: number;
  nom: string;
}

/** The universe of the caller that uses a system, with the caller's role in it (AD-84, AD-94). */
export interface UniversDuCompte {
  id: number;
  nom: string;
  role: Role;
}

/** What a member of an attached universe learns: never another universe's name or id (AD-84). */
export interface SystemeVue {
  id: number;
  nom: string;
  nbUnivers: number;
  mesUnivers: UniversDuCompte[];
  /** Whether the caller is a GM of the system itself (a `membres` row of its space, AD-152). */
  peutEcrire: boolean;
}

const nomPris = () => new ErreurService('conflit', 'Un système porte déjà ce nom.', 'nom_pris');

function validerNomSysteme(nom: string): string {
  const n = nom.trim();
  if (n.length < 1 || n.length > 80) throw invalide('Le nom doit faire de 1 à 80 caractères.');
  return n;
}

function estMJQuelquePart(db: Db, compteId: number): boolean {
  // A GM of a system's space is not a GM of a universe (AD-152).
  return !!db
    .prepare(
      `SELECT 1 FROM membres m JOIN univers u ON u.id = m.univers_id
       WHERE m.compte_id = ? AND m.role = 'mj' AND u.espace_systeme_id IS NULL LIMIT 1`,
    )
    .get(compteId);
}

/** Inserts a system; the NOCASE unique index is the final arbiter of "name taken". */
function insererSysteme(db: Db, nom: string, compteId: number): SystemeCatalogue {
  const pris = db.prepare('SELECT 1 FROM systemes_jeu WHERE nom = ?').get(nom);
  if (pris) throw nomPris();
  const info = db
    .prepare('INSERT INTO systemes_jeu (nom, cree_le, responsable_id) VALUES (?, ?, ?)')
    .run(nom, new Date().toISOString(), compteId);
  const id = Number(info.lastInsertRowid);
  creerEspaceSysteme(db, id, nom);
  return { id, nom };
}

const aColonneEspace = (db: Db): boolean =>
  (db.prepare('PRAGMA table_info(univers)').all() as { name: string }[]).some((c) => c.name === 'espace_systeme_id');

let espacesDifferes = false;

/**
 * Seed only: runs `fn` without creating the spaces of the systems it makes, so that the universes keep the ids the
 * starting data have always had; `creerEspacesManquants` then gives each system its space.
 */
export function differerEspaces<T>(fn: () => T): T {
  espacesDifferes = true;
  try {
    return fn();
  } finally {
    espacesDifferes = false;
  }
}

/** Gives a space to every system that has none (the seed's end; the migration does the same in SQL). */
export function creerEspacesManquants(db: Db): void {
  if (!aColonneEspace(db)) return;
  const rows = db
    .prepare(
      'SELECT id, nom FROM systemes_jeu WHERE id NOT IN (SELECT espace_systeme_id FROM univers WHERE espace_systeme_id IS NOT NULL) ORDER BY id',
    )
    .all() as { id: number; nom: string }[];
  const sauve = espacesDifferes;
  espacesDifferes = false;
  try {
    for (const r of rows) creerEspaceSysteme(db, r.id, r.nom);
  } finally {
    espacesDifferes = sauve;
  }
}

/**
 * The hidden space of a system (AD-151): a technical `univers` row, never listed, with no member until the admin
 * names the system's GMs (AD-152). The key is technical and never drawn for a real universe.
 */
export function creerEspaceSysteme(db: Db, systemeId: number, nom: string): number | null {
  if (espacesDifferes) return null;
  // A base held short of 0051 (the migration tests seed an old schema, then climb) has no space column: the migration
  // creates the spaces of the systems already there.
  if (!aColonneEspace(db)) return null;
  const info = db
    .prepare('INSERT INTO univers (nom, description, cree_le, cle, espace_systeme_id) VALUES (?, ?, ?, ?, ?)')
    .run(nom, '', new Date().toISOString(), `espace-systeme-${systemeId}-x`, systemeId);
  return Number(info.lastInsertRowid);
}

/** The catalogue (id, name only), for an account that is GM of at least one universe (AD-25). */
export function listerCatalogue(db: Db, compteId: number): SystemeCatalogue[] {
  if (!estMJQuelquePart(db, compteId)) throw refuse();
  return db
    .prepare('SELECT id, nom FROM systemes_jeu ORDER BY nom COLLATE NOCASE, id')
    .all() as SystemeCatalogue[];
}

/** Any GM of any universe creates a system, detached. A taken name (case ignored) is a conflict `nom_pris`. */
export function creerSysteme(db: Db, compteId: number, entree: { nom: string }): SystemeCatalogue {
  if (!estMJQuelquePart(db, compteId)) throw refuse();
  const nom = validerNomSysteme(entree.nom);
  return db.transaction(() => insererSysteme(db, nom, compteId))();
}

/** Attaches the universe to a system, or detaches it with `null`. GM only; unknown system → invalid. */
export function rattacherSysteme(
  db: Db,
  compteId: number,
  universId: number,
  systemeId: number | null,
): void {
  exigerMJ(db, universId, compteId);
  if (systemeId !== null) {
    const ok = db.prepare('SELECT 1 FROM systemes_jeu WHERE id = ?').get(systemeId);
    if (!ok) throw invalide('Système inconnu.');
  }
  db.prepare('UPDATE univers SET systeme_id = ? WHERE id = ?').run(systemeId, universId);
}

/** Creates the system and attaches the universe in one transaction: a taken name does neither. */
export function creerEtRattacherSysteme(
  db: Db,
  compteId: number,
  universId: number,
  entree: { nom: string },
): SystemeCatalogue {
  exigerMJ(db, universId, compteId);
  const nom = validerNomSysteme(entree.nom);
  return db.transaction(() => {
    const s = insererSysteme(db, nom, compteId);
    db.prepare('UPDATE univers SET systeme_id = ? WHERE id = ?').run(s.id, universId);
    return s;
  })();
}

export function vueDe(db: Db, compteId: number, systeme: SystemeCatalogue): SystemeVue {
  const mesUnivers = db
    .prepare(
      `SELECT u.id, u.nom, m.role FROM univers u JOIN membres m ON m.univers_id = u.id
       WHERE u.systeme_id = ? AND m.compte_id = ? ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all(systeme.id, compteId) as UniversDuCompte[];
  const n = db.prepare('SELECT COUNT(*) AS n FROM univers WHERE systeme_id = ?').get(systeme.id) as {
    n: number;
  };
  return {
    id: systeme.id,
    nom: systeme.nom,
    nbUnivers: n.n,
    mesUnivers,
    peutEcrire: lectureSysteme(db, compteId, systeme.id)?.role === 'mj',
  };
}

/** The systems the caller reads: a member of an attached universe or a GM of the system (AD-152), by name. */
export function listerSystemes(db: Db, compteId: number): SystemeVue[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT s.id, s.nom FROM systemes_jeu s
       WHERE EXISTS (SELECT 1 FROM univers u JOIN membres m ON m.univers_id = u.id
                     WHERE u.systeme_id = s.id AND m.compte_id = ?)
          OR EXISTS (SELECT 1 FROM univers e JOIN membres m ON m.univers_id = e.id
                     WHERE e.espace_systeme_id = s.id AND m.compte_id = ? AND m.role = 'mj')
       ORDER BY s.nom COLLATE NOCASE, s.id`,
    )
    .all(compteId, compteId) as SystemeCatalogue[];
  return rows.map((r) => vueDe(db, compteId, r));
}

/** Unknown system, or the caller neither GM of it nor member of an attached universe: the same "not found" (AD-22, AD-152). */
function systemeVisible(db: Db, compteId: number, systemeId: number): SystemeVue {
  const s = db.prepare('SELECT id, nom FROM systemes_jeu WHERE id = ?').get(systemeId) as
    | SystemeCatalogue
    | undefined;
  if (!s) throw introuvable();
  const vue = vueDe(db, compteId, s);
  if (lectureSysteme(db, compteId, systemeId) === null) throw introuvable();
  return vue;
}

/** The system seen from its own address: name, counts, the caller's universes only (AD-84, AD-94). */
export function lireSysteme(db: Db, compteId: number, systemeId: number): SystemeVue {
  return systemeVisible(db, compteId, systemeId);
}
