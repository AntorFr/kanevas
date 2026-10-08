import type { Db } from '../db/db.js';
import { exigerMJ } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { LIMITE_LISTE } from './fiches.js';
import type { Role } from './types.js';

export const TYPES_GABARIT = ['regle', 'creature', 'objet'] as const;
export type TypeGabarit = (typeof TYPES_GABARIT)[number];

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
  entrees: { regle: number; creature: number; objet: number };
  mesUnivers: UniversDuCompte[];
  /** Whether the caller is GM of at least one universe using the system (AD-94). */
  peutEcrire: boolean;
}

export interface Gabarit {
  id: number;
  systemeId: number;
  type: TypeGabarit;
  nom: string;
  contenu: string;
  version: number;
  creeLe: string;
  modifieLe: string;
}

interface GabaritRow {
  id: number;
  systeme_id: number;
  type: TypeGabarit;
  nom: string;
  contenu: string;
  version: number;
  cree_le: string;
  modifie_le: string;
}

const versGabarit = (r: GabaritRow): Gabarit => ({
  id: r.id,
  systemeId: r.systeme_id,
  type: r.type,
  nom: r.nom,
  contenu: r.contenu,
  version: r.version,
  creeLe: r.cree_le,
  modifieLe: r.modifie_le,
});

const nomPris = () => new ErreurService('conflit', 'Un système porte déjà ce nom.', 'nom_pris');
const gabaritPris = (type: TypeGabarit) =>
  new ErreurService(
    'conflit',
    `${{ regle: 'Une règle', creature: 'Une créature', objet: 'Un objet' }[type]} porte déjà ce nom.`,
    'nom_pris',
  );

function validerNomSysteme(nom: string): string {
  const n = nom.trim();
  if (n.length < 1 || n.length > 80) throw invalide('Le nom doit faire de 1 à 80 caractères.');
  return n;
}

function estMJQuelquePart(db: Db, compteId: number): boolean {
  return !!db.prepare("SELECT 1 FROM membres WHERE compte_id = ? AND role = 'mj' LIMIT 1").get(compteId);
}

/** Inserts a system; the NOCASE unique index is the final arbiter of "name taken". */
function insererSysteme(db: Db, nom: string): SystemeCatalogue {
  const pris = db.prepare('SELECT 1 FROM systemes_jeu WHERE nom = ?').get(nom);
  if (pris) throw nomPris();
  const info = db
    .prepare('INSERT INTO systemes_jeu (nom, cree_le) VALUES (?, ?)')
    .run(nom, new Date().toISOString());
  return { id: Number(info.lastInsertRowid), nom };
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
  return db.transaction(() => insererSysteme(db, nom))();
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
    const s = insererSysteme(db, nom);
    db.prepare('UPDATE univers SET systeme_id = ? WHERE id = ?').run(s.id, universId);
    return s;
  })();
}

function vueDe(db: Db, compteId: number, systeme: SystemeCatalogue): SystemeVue {
  const mesUnivers = db
    .prepare(
      `SELECT u.id, u.nom, m.role FROM univers u JOIN membres m ON m.univers_id = u.id
       WHERE u.systeme_id = ? AND m.compte_id = ? ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all(systeme.id, compteId) as UniversDuCompte[];
  const n = db.prepare('SELECT COUNT(*) AS n FROM univers WHERE systeme_id = ?').get(systeme.id) as {
    n: number;
  };
  const entrees = { regle: 0, creature: 0, objet: 0 };
  const lignes = db
    .prepare('SELECT type, COUNT(*) AS n FROM gabarits WHERE systeme_id = ? GROUP BY type')
    .all(systeme.id) as { type: TypeGabarit; n: number }[];
  for (const l of lignes) entrees[l.type] = l.n;
  return {
    id: systeme.id,
    nom: systeme.nom,
    nbUnivers: n.n,
    entrees,
    mesUnivers,
    peutEcrire: mesUnivers.some((u) => u.role === 'mj'),
  };
}

/** The systems attached to a universe the caller is a member of, by name (AD-94). */
export function listerSystemes(db: Db, compteId: number): SystemeVue[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT s.id, s.nom FROM systemes_jeu s
       JOIN univers u ON u.systeme_id = s.id
       JOIN membres m ON m.univers_id = u.id
       WHERE m.compte_id = ? ORDER BY s.nom COLLATE NOCASE, s.id`,
    )
    .all(compteId) as SystemeCatalogue[];
  return rows.map((r) => vueDe(db, compteId, r));
}

/** Unknown system or none of the caller's universes uses it: the same "not found" (AD-22, AD-94). */
function systemeVisible(db: Db, compteId: number, systemeId: number): SystemeVue {
  const s = db.prepare('SELECT id, nom FROM systemes_jeu WHERE id = ?').get(systemeId) as
    | SystemeCatalogue
    | undefined;
  if (!s) throw introuvable();
  const vue = vueDe(db, compteId, s);
  if (vue.mesUnivers.length === 0) throw introuvable();
  return vue;
}

/** The system seen from its own address: name, counts, the caller's universes only (AD-84, AD-94). */
export function lireSysteme(db: Db, compteId: number, systemeId: number): SystemeVue {
  return systemeVisible(db, compteId, systemeId);
}

export interface PageGabarits {
  gabarits: Gabarit[];
  suivant: string | null;
}

/** Templates of one type, by name without case, 100 per page with an opaque cursor; any member reads. */
export function listerGabarits(
  db: Db,
  compteId: number,
  systemeId: number,
  options: { type: string; curseur?: string; limite?: number },
): PageGabarits {
  systemeVisible(db, compteId, systemeId);
  if (!(TYPES_GABARIT as readonly string[]).includes(options.type)) {
    throw invalide('Type de gabarit inconnu.');
  }
  const limite = Math.min(Math.max(Math.trunc(options.limite ?? LIMITE_LISTE), 1), LIMITE_LISTE);
  const where = ['systeme_id = ?', 'type = ?'];
  const params: (string | number)[] = [systemeId, options.type];
  if (options.curseur !== undefined) {
    let c: { t: string; i: number };
    try {
      c = JSON.parse(Buffer.from(options.curseur, 'base64url').toString('utf8'));
      if (typeof c.t !== 'string' || !Number.isInteger(c.i)) throw new Error();
    } catch {
      throw invalide('Curseur invalide.');
    }
    where.push('(nom COLLATE NOCASE > ? OR (nom COLLATE NOCASE = ? AND id > ?))');
    params.push(c.t, c.t, c.i);
  }
  const rows = db
    .prepare(`SELECT * FROM gabarits WHERE ${where.join(' AND ')} ORDER BY nom COLLATE NOCASE, id LIMIT ?`)
    .all(...params, limite + 1) as GabaritRow[];
  const page = rows.slice(0, limite);
  const dernier = page[page.length - 1];
  const suivant =
    rows.length > limite && dernier
      ? Buffer.from(JSON.stringify({ t: dernier.nom, i: dernier.id })).toString('base64url')
      : null;
  return { gabarits: page.map(versGabarit), suivant };
}

function validerGabarit(nom: string, contenu: string): string {
  const n = nom.trim();
  if (n.length < 1 || n.length > 120) throw invalide('Le nom doit faire de 1 à 120 caractères.');
  if (contenu.length > 20000) throw invalide('Le contenu doit faire 20 000 caractères au plus.');
  return n;
}

/** Write access: GM of at least one universe using the system; a reader only is refused (AD-94). */
function exigerEcritureGabarits(db: Db, compteId: number, systemeId: number): number {
  if (!systemeVisible(db, compteId, systemeId).peutEcrire) throw refuse();
  return systemeId;
}

/** The GM of an attached universe adds a template; its type is fixed from now on. Version starts at 1. */
export function creerGabarit(
  db: Db,
  compteId: number,
  sid: number,
  entree: { type: string; nom: string; contenu?: string },
): Gabarit {
  const systemeId = exigerEcritureGabarits(db, compteId, sid);
  if (!(TYPES_GABARIT as readonly string[]).includes(entree.type)) {
    throw invalide('Type de gabarit inconnu.');
  }
  const type = entree.type as TypeGabarit;
  const contenu = entree.contenu ?? '';
  const nom = validerGabarit(entree.nom, contenu);
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM gabarits WHERE systeme_id = ? AND type = ? AND nom = ?').get(systemeId, type, nom)) {
      throw gabaritPris(type);
    }
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO gabarits (systeme_id, type, nom, contenu, version, cree_le, modifie_le)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(systemeId, type, nom, contenu, now, now);
    return versGabarit(
      db.prepare('SELECT * FROM gabarits WHERE id = ?').get(Number(info.lastInsertRowid)) as GabaritRow,
    );
  })();
}

/**
 * Rewrites name and content with the version the caller read (AD-85). A stale
 * version is a conflict `gabarit_modifie` and nothing is written. The type
 * never changes; a template of a system the universe does not use is not found.
 */
export function modifierGabarit(
  db: Db,
  compteId: number,
  sid: number,
  gabaritId: number,
  entree: { nom: string; contenu: string; version: number },
): Gabarit {
  const systemeId = exigerEcritureGabarits(db, compteId, sid);
  const nom = validerGabarit(entree.nom, entree.contenu);
  return db.transaction(() => {
    const g = db
      .prepare('SELECT * FROM gabarits WHERE id = ? AND systeme_id = ?')
      .get(gabaritId, systemeId) as GabaritRow | undefined;
    if (!g) throw introuvable();
    if (g.version !== entree.version) {
      throw new ErreurService('conflit', 'Le gabarit a changé.', 'gabarit_modifie');
    }
    const autre = db
      .prepare('SELECT 1 FROM gabarits WHERE systeme_id = ? AND type = ? AND nom = ? AND id <> ?')
      .get(systemeId, g.type, nom, gabaritId);
    if (autre) throw gabaritPris(g.type);
    db.prepare(
      'UPDATE gabarits SET nom = ?, contenu = ?, version = version + 1, modifie_le = ? WHERE id = ?',
    ).run(nom, entree.contenu, new Date().toISOString(), gabaritId);
    return versGabarit(db.prepare('SELECT * FROM gabarits WHERE id = ?').get(gabaritId) as GabaritRow);
  })();
}
