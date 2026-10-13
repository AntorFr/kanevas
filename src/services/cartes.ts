import type { Readable } from 'node:stream';

import { attachmentsDir } from '../config/env.js';
import type { Db } from '../db/db.js';
import { peutLireSection, peutVoirFiche, roleDe, vueMJ } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { chargerFiche, LIMITE_LISTE, validerTitre } from './fiches.js';
import { typeParSignature } from './pieces-jointes.js';
import { lireRelations } from './relations.js';
import {
  abandonner,
  ecrireFlux,
  lireFichier,
  promouvoir,
  supprimerFichier,
} from './stockage.js';
import type { Acteur, Role, SectionRow, TypeFiche } from './types.js';

/** At most this many elements per map (AD-72). */
export const MAX_ELEMENTS_PAR_CARTE = 100;
/** A background is at most 25 MB (AD-69). */
export const MAX_FOND = 25 * 1024 * 1024;
const MAX_TITRE = 80;

export type FormeCarte = 'illustree' | 'graphe';
type Flux = Readable | AsyncIterable<Buffer | Uint8Array>;

interface CarteRow {
  id: number;
  univers_id: number;
  titre: string;
  forme: FormeCarte;
  visible: number;
  fond: string | null;
  fond_type: string | null;
  cree_le: string;
}

export interface CarteVue {
  id: number;
  universId: number;
  titre: string;
  forme: FormeCarte;
  /** Only rendered to the GM outside player mode: a player is never told the state (E-10). */
  visible?: boolean;
  /** Whether a background exists; the file name on disk is never exposed (AD-35). */
  fond: boolean;
}

export interface ElementVue {
  id: number;
  ficheId: number;
  titre: string;
  type: TypeFiche;
  /** Absent on a graph. */
  x?: number;
  y?: number;
}

export interface LienVue {
  /** Sheet the relation comes from, sheet it points to, and the free label. */
  de: number;
  vers: number;
  type: string;
}

export interface CarteLue {
  carte: CarteVue;
  /** True when the caller may write this map (GM outside player mode). */
  peutEcrire: boolean;
  elements: ElementVue[];
  /** Graphs only, already filtered for this reader (AD-41, AD-64, AD-68). */
  liens?: LienVue[];
}

export interface PageCartes {
  cartes: CarteVue[];
  suivant: string | null;
}

const refus = (code: string, message: string, kind: 'invalide' | 'conflit' = 'invalide') =>
  new ErreurService(kind, message, code);

function charger(db: Db, carteId: number): CarteRow | undefined {
  return db.prepare('SELECT * FROM cartes WHERE id = ?').get(carteId) as CarteRow | undefined;
}

function vueCarte(c: CarteRow, avecVisible: boolean): CarteVue {
  const v: CarteVue = {
    id: c.id,
    universId: c.univers_id,
    titre: c.titre,
    forme: c.forme,
    fond: c.fond !== null,
  };
  if (avecVisible) v.visible = c.visible === 1;
  return v;
}

/**
 * Read gate (AD-68): the GM outside player mode reads every map of their
 * universe, anyone else only a visible one. Anything else — no role, unknown
 * id, hidden map — is the same "not found" (AD-22). A GM in player mode on a
 * hidden map gets a refusal of their own (AD-39).
 */
function porteLecture(db: Db, acteur: Acteur, carteId: number): { c: CarteRow; role: Role } {
  const c = charger(db, carteId);
  if (!c) throw introuvable();
  const role = roleDe(db, c.univers_id, acteur.compteId);
  if (!role) throw introuvable();
  if (c.visible !== 1) {
    if (role !== 'mj') throw introuvable();
    if (acteur.modeJoueur) {
      throw new ErreurService(
        'refuse',
        'Les joueurs ne voient pas cette carte : elle n\'est pas visible.',
        'mode_joueur',
      );
    }
  }
  return { c, role };
}

/**
 * Write gate (AD-72): only the GM outside player mode. A map the caller may
 * not read does not exist for them (404); one they read but may not write is
 * refused (403), a refusal distinct from the read one.
 */
function porteEcriture(db: Db, compteId: number, modeJoueur: boolean, carteId: number): CarteRow {
  const c = charger(db, carteId);
  if (!c) throw introuvable();
  const role = roleDe(db, c.univers_id, compteId);
  if (!role) throw introuvable();
  if (role !== 'mj' && c.visible !== 1) throw introuvable();
  if (role !== 'mj' || modeJoueur) throw refuse('Seul le MJ peut modifier une carte.');
  return c;
}

/** Limits a stream to the background size, failing as soon as it is exceeded. */
async function* limiter(flux: Flux): AsyncGenerator<Buffer | Uint8Array> {
  let n = 0;
  for await (const morceau of flux) {
    n += morceau.length;
    if (n > MAX_FOND) {
      throw refus('fond_trop_lourd', "L'image dépasse 25 Mo.");
    }
    yield morceau;
  }
}

/** Writes a background to `tmp/` and checks it is an image; leaves nothing behind on a refusal. */
async function ecrireFond(
  flux: Flux,
  racine: string,
): Promise<{ temporaire: string; type: string }> {
  const ecrit = await ecrireFlux(limiter(flux), racine);
  const type = ecrit.taille === 0 ? '' : typeParSignature(ecrit.debut);
  if (!type.startsWith('image/')) {
    await abandonner(ecrit.temporaire, racine);
    throw refus('fond_invalide', "Ce fichier n'est pas une image (PNG, JPEG, GIF ou WebP).");
  }
  return { temporaire: ecrit.temporaire, type };
}

/**
 * The GM creates a map, never visible at first (B-12). An illustrated map may
 * come with a background, written by `stockage.ts`; a graph has none. Rights
 * are checked before the stream is read, then again in the transaction.
 */
export async function creerCarte(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  universId: number,
  entree: { titre: string; forme: FormeCarte; fond?: Flux },
  racine: string = attachmentsDir,
): Promise<CarteVue> {
  const verifier = () => {
    const role = roleDe(db, universId, compteId);
    if (!role) throw introuvable();
    if (role !== 'mj' || modeJoueur) throw refuse('Seul le MJ peut créer une carte.');
  };
  verifier();
  const titre = validerTitre(String(entree.titre ?? ''), MAX_TITRE, 'Le titre');
  if (entree.forme !== 'illustree' && entree.forme !== 'graphe') {
    throw invalide('La forme : « illustree » ou « graphe ».');
  }
  if (entree.fond !== undefined && entree.forme === 'graphe') {
    throw refus('fond_invalide', "Un graphe n'a pas de fond.");
  }
  const ecrit = entree.fond === undefined ? null : await ecrireFond(entree.fond, racine);
  let fichier: string | null = null;
  try {
    const id = db.transaction(() => {
      verifier();
      if (ecrit) fichier = promouvoir(ecrit.temporaire, racine);
      const info = db
        .prepare(
          `INSERT INTO cartes (univers_id, titre, forme, visible, fond, fond_type, cree_le)
           VALUES (?, ?, ?, 0, ?, ?, ?)`,
        )
        .run(universId, titre, entree.forme, fichier, ecrit?.type ?? null, new Date().toISOString());
      return Number(info.lastInsertRowid);
    })();
    return vueCarte(charger(db, id)!, true);
  } catch (e) {
    if (ecrit) await abandonner(ecrit.temporaire, racine);
    if (fichier) supprimerFichier(fichier, racine);
    throw e;
  }
}

/** The GM renames a map and/or makes it visible or hidden. The form never changes. */
export function reglerCarte(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  carteId: number,
  reglage: { titre?: string; visible?: boolean },
): CarteVue {
  return db.transaction(() => {
    const c = porteEcriture(db, compteId, modeJoueur, carteId);
    const titre =
      reglage.titre === undefined ? c.titre : validerTitre(String(reglage.titre), MAX_TITRE, 'Le titre');
    const visible = reglage.visible === undefined ? c.visible : reglage.visible ? 1 : 0;
    db.prepare('UPDATE cartes SET titre = ?, visible = ? WHERE id = ?').run(titre, visible, c.id);
    return vueCarte(charger(db, c.id)!, true);
  })();
}

/**
 * Replaces (or sets) the background of an illustrated map (AD-69): writes the
 * new file, changes the row, then deletes the old file. No removal alone.
 */
export async function remplacerFond(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  carteId: number,
  flux: Flux,
  racine: string = attachmentsDir,
): Promise<CarteVue> {
  const avant = porteEcriture(db, compteId, modeJoueur, carteId);
  if (avant.forme === 'graphe') throw refus('fond_invalide', "Un graphe n'a pas de fond.");
  const ecrit = await ecrireFond(flux, racine);
  let fichier: string | null = null;
  let ancien: string | null = null;
  try {
    db.transaction(() => {
      const c = porteEcriture(db, compteId, modeJoueur, carteId);
      ancien = c.fond;
      fichier = promouvoir(ecrit.temporaire, racine);
      db.prepare('UPDATE cartes SET fond = ?, fond_type = ? WHERE id = ?').run(
        fichier,
        ecrit.type,
        c.id,
      );
    })();
  } catch (e) {
    await abandonner(ecrit.temporaire, racine);
    if (fichier) supprimerFichier(fichier, racine);
    throw e;
  }
  if (ancien) supprimerFichier(ancien, racine);
  return vueCarte(charger(db, carteId)!, true);
}

/**
 * Opens the background under the same read rules as `lireCarte`, with the
 * caller's real rights: no mode parameter (AD-69).
 */
export async function ouvrirFond(
  db: Db,
  compteId: number,
  carteId: number,
  racine: string = attachmentsDir,
): Promise<{ flux: Readable; type: string; taille: number }> {
  const { c } = porteLecture(db, { compteId }, carteId);
  if (c.fond === null || c.fond_type === null) throw introuvable();
  const f = await lireFichier(c.fond, racine);
  if (!f) throw introuvable();
  return { flux: f.flux, type: c.fond_type, taille: f.taille };
}

/**
 * The maps of a universe the caller reads: all for the GM, only visible ones
 * for a player or a GM in player mode. By title without case, then creation,
 * at most 100 per page (E-10).
 */
export function listerCartes(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  universId: number,
  page: { curseur?: string; limite?: number } = {},
): PageCartes {
  const role = roleDe(db, universId, compteId);
  if (!role) throw introuvable();
  const mj = role === 'mj' && !modeJoueur;
  const limite = Math.min(Math.max(Math.trunc(page.limite ?? LIMITE_LISTE), 1), LIMITE_LISTE);
  const where = ['univers_id = ?'];
  const params: (string | number)[] = [universId];
  if (!mj) where.push('visible = 1');
  if (page.curseur !== undefined) {
    let k: { t: string; i: number };
    try {
      k = JSON.parse(Buffer.from(page.curseur, 'base64url').toString('utf8'));
      if (typeof k.t !== 'string' || !Number.isInteger(k.i)) throw new Error();
    } catch {
      throw invalide('Curseur invalide.');
    }
    where.push('(titre COLLATE NOCASE > ? OR (titre COLLATE NOCASE = ? AND id > ?))');
    params.push(k.t, k.t, k.i);
  }
  const rows = db
    .prepare(
      `SELECT * FROM cartes WHERE ${where.join(' AND ')}
       ORDER BY titre COLLATE NOCASE, id LIMIT ?`,
    )
    .all(...params, limite + 1) as CarteRow[];
  const lot = rows.slice(0, limite);
  const dernier = lot[lot.length - 1];
  const suivant =
    rows.length > limite && dernier
      ? Buffer.from(JSON.stringify({ t: dernier.titre, i: dernier.id })).toString('base64url')
      : null;
  return { cartes: lot.map((c) => vueCarte(c, mj)), suivant };
}

interface ElementRow {
  id: number;
  fiche_id: number;
  x: number | null;
  y: number | null;
  titre: string;
  type: TypeFiche;
}

const SELECT_ELEMENTS = `SELECT e.id, e.fiche_id, e.x, e.y, f.titre, f.type
  FROM elements_carte e JOIN fiches f ON f.id = e.fiche_id`;

function vueElement(r: ElementRow): ElementVue {
  const v: ElementVue = { id: r.id, ficheId: r.fiche_id, titre: r.titre, type: r.type };
  if (r.x !== null && r.y !== null) {
    v.x = r.x;
    v.y = r.y;
  }
  return v;
}

/**
 * THE read of a map (AD-68): the map, its elements and, for a graph, its
 * links, all already filtered for this caller and mode. An element is rendered
 * only if its sheet is readable (AD-38); a link only if its relation reads
 * under both guards (AD-64, through `lireRelations`) and both ends are
 * rendered. Nothing says how many were left out.
 */
export function lireCarte(db: Db, compteId: number, modeJoueur: boolean, carteId: number): CarteLue {
  const acteur: Acteur = { compteId, modeJoueur };
  const { c, role } = porteLecture(db, acteur, carteId);
  const mj = vueMJ(role, acteur);
  const rows = db
    .prepare(`${SELECT_ELEMENTS} WHERE e.carte_id = ? ORDER BY e.id`)
    .all(c.id) as ElementRow[];
  const rendus = mj ? rows : rows.filter((r) => peutVoirFiche(db, role, r.fiche_id, acteur));
  const lue: CarteLue = {
    carte: vueCarte(c, mj),
    peutEcrire: mj,
    elements: rendus.map(vueElement),
  };
  if (c.forme === 'graphe') {
    const bouts = new Set(rendus.map((r) => r.fiche_id));
    const vus = new Set<string>();
    const liens: LienVue[] = [];
    const sectionsDe = db.prepare('SELECT * FROM sections WHERE fiche_id = ? ORDER BY ordre, id');
    for (const r of rendus) {
      for (const s of sectionsDe.all(r.fiche_id) as SectionRow[]) {
        if (!peutLireSection(role, s, acteur)) continue;
        for (const rel of lireRelations(db, acteur, c.univers_id, r.fiche_id, s.id)) {
          if (!bouts.has(rel.cible.id)) continue;
          const cle = `${r.fiche_id}|${rel.cible.id}|${rel.type}`;
          if (vus.has(cle)) continue;
          vus.add(cle);
          liens.push({ de: r.fiche_id, vers: rel.cible.id, type: rel.type });
        }
      }
    }
    lue.liens = liens;
  }
  return lue;
}

/** A position in percent, clamped to the frame then rounded to two decimals (AD-70). */
function position(c: CarteRow, x: unknown, y: unknown): { x: number; y: number } | null {
  const absent = (v: unknown) => v === undefined || v === null;
  if (c.forme === 'graphe') {
    if (!absent(x) || !absent(y)) {
      throw refus('position_invalide', "Un nœud de graphe n'a pas de position.");
    }
    return null;
  }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw refus('position_invalide', 'La position : deux nombres, de 0 à 100.');
  }
  const net = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
  return { x: net(x), y: net(y) };
}

function elementDe(db: Db, id: number): ElementVue {
  return vueElement(db.prepare(`${SELECT_ELEMENTS} WHERE e.id = ?`).get(id) as ElementRow);
}

/** The GM places a sheet of the map's universe on it (AD-72). */
export function ajouterElement(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  carteId: number,
  entree: { ficheId: number; x?: number; y?: number },
): ElementVue {
  return db.transaction(() => {
    const c = porteEcriture(db, compteId, modeJoueur, carteId);
    try {
      chargerFiche(db, c.univers_id, entree.ficheId);
    } catch {
      throw refus('fiche_inconnue', 'Cette fiche est introuvable dans cet univers.');
    }
    const p = position(c, entree.x, entree.y);
    const deja = db
      .prepare('SELECT 1 FROM elements_carte WHERE carte_id = ? AND fiche_id = ?')
      .get(c.id, entree.ficheId);
    if (deja) throw refus('fiche_deja_placee', 'Cette fiche est déjà sur la carte.', 'conflit');
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM elements_carte WHERE carte_id = ?')
      .get(c.id) as { n: number };
    if (n >= MAX_ELEMENTS_PAR_CARTE) {
      throw refus(
        'carte_pleine',
        `Cette carte porte déjà ${MAX_ELEMENTS_PAR_CARTE} fiches.`,
        'conflit',
      );
    }
    const info = db
      .prepare(
        'INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (?, ?, ?, ?, ?)',
      )
      .run(c.id, entree.ficheId, p?.x ?? null, p?.y ?? null, new Date().toISOString());
    return elementDe(db, Number(info.lastInsertRowid));
  })();
}

/** The GM moves a token of an illustrated map; last write wins (AD-70). */
export function deplacerElement(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  carteId: number,
  elementId: number,
  pos: { x: number; y: number },
): ElementVue {
  return db.transaction(() => {
    const c = porteEcriture(db, compteId, modeJoueur, carteId);
    const e = db
      .prepare('SELECT id FROM elements_carte WHERE id = ? AND carte_id = ?')
      .get(elementId, c.id);
    if (!e) throw introuvable();
    const p = position(c, pos?.x, pos?.y);
    if (!p) throw refus('position_invalide', "Un nœud de graphe n'a pas de position.");
    db.prepare('UPDATE elements_carte SET x = ?, y = ? WHERE id = ?').run(p.x, p.y, elementId);
    return elementDe(db, elementId);
  })();
}

/** The GM removes an element: its row goes, the sheet stays (AD-72). */
export function retirerElement(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  carteId: number,
  elementId: number,
): void {
  db.transaction(() => {
    const c = porteEcriture(db, compteId, modeJoueur, carteId);
    const info = db
      .prepare('DELETE FROM elements_carte WHERE id = ? AND carte_id = ?')
      .run(elementId, c.id);
    if (info.changes === 0) throw introuvable();
  })();
}
