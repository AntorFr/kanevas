import type { Readable } from 'node:stream';

import { attachmentsDir } from '../config/env.js';
import type { Db } from '../db/db.js';
import { peutLireSection, peutVoirFiche, roleDe, vueMJ } from './droits.js';
import { rendreMarkdown, contenuPublic } from './markdown.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { chargerFiche, LIMITE_LISTE, validerTitre } from './fiches.js';
import { curseurApi, PAGE_LECTURE_API, typeParSignature } from './fichiers.js';
import { empreinteCarte } from './empreintes.js';
import { fondCarteMaxMo } from './reglages.js';
import { libelleRelation } from './natures.js';
import { lireRelations } from './relations.js';
import {
  abandonner,
  ecrireFlux,
  lireFichier,
  promouvoir,
  sha256Stocke,
  supprimerFichier,
} from './stockage.js';
import type { Acteur, Role, SectionRow, TypeFiche } from './types.js';

/** At most this many elements per map (AD-72). */
export const MAX_ELEMENTS_PAR_CARTE = 100;
/** A background over the instance ceiling (AD-143): the limit rides with the refusal, in MB. */
export class ErreurFondTropLourd extends ErreurService {
  constructor(readonly limiteMo: number) {
    super('invalide', `Image trop lourde : ${limiteMo} Mo au plus.`, 'fond_trop_lourd');
    this.name = 'ErreurFondTropLourd';
  }
}
const MAX_TITRE = 80;

export type { CarteRow };
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
  cle_origine: string | null;
  fiche_id: number | null;
  texte: string;
  texte_public: string;
  version: number;
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
  /** HTML of the text for this reader: the full text for the GM outside player mode, else its public copy (AD-114, AD-142). */
  html: string;
  /** The source, GM blocks included: the GM outside player mode only (never shipped to a reader). */
  texte?: string;
  /** Version of the text, to send back with a write (AD-59's rule): the GM outside player mode only. */
  version?: number;
  /** Origin key given by the import: the GM outside player mode only (B-50). */
  cleOrigine?: string | null;
  /** The attached sheet: `null` for the GM when there is none; absent for a reader who does not read it (AD-38). */
  fiche?: { id: number; titre: string; type: TypeFiche } | null;
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
  /** Key of the nature, '' for a free relation. */
  nature: string;
  qualificatif: string;
  /** The nature's label with the qualifier after « — », or the qualifier alone when free. */
  libelle: string;
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

/** At most this many characters in a map's text (AD-142). */
export const MAX_TEXTE_CARTE = 5000;

const refus = (code: string, message: string, kind: 'invalide' | 'conflit' = 'invalide') =>
  new ErreurService(kind, message, code);

function charger(db: Db, carteId: number): CarteRow | undefined {
  return db.prepare('SELECT * FROM cartes WHERE id = ?').get(carteId) as CarteRow | undefined;
}

/**
 * The map as this reader sees it: the text rendered by the shared renderer without any active link (AD-142),
 * the source and the version for the GM outside player mode only, the attached sheet only when readable (AD-38).
 */
function vueCarte(db: Db, c: CarteRow, role: Role, acteur: Acteur): CarteVue {
  const mj = vueMJ(role, acteur);
  const v: CarteVue = {
    id: c.id,
    universId: c.univers_id,
    titre: c.titre,
    forme: c.forme,
    fond: c.fond !== null,
    html: rendreMarkdown(mj ? c.texte : c.texte_public, { nature: 'section', reglagesImage: false }),
  };
  if (mj) {
    v.visible = c.visible === 1;
    v.texte = c.texte;
    v.version = c.version;
    v.cleOrigine = c.cle_origine;
  }
  if (c.fiche_id === null) {
    if (mj) v.fiche = null;
  } else if (mj || peutVoirFiche(db, role, c.fiche_id, acteur)) {
    const f = db.prepare('SELECT id, titre, type FROM fiches WHERE id = ?').get(c.fiche_id) as
      { id: number; titre: string; type: TypeFiche } | undefined;
    if (f) v.fiche = f;
  }
  return v;
}

const MJ_SORTI: Acteur = Object.freeze({ compteId: 0, modeJoueur: false }) as Acteur;
/** The view returned by a GM's own write: the GM outside player mode, which the write gates guarantee. */
const vueDuMJ = (db: Db, c: CarteRow) => vueCarte(db, c, 'mj', MJ_SORTI);

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
async function* limiter(flux: Flux, limiteMo: number): AsyncGenerator<Buffer | Uint8Array> {
  let n = 0;
  for await (const morceau of flux) {
    n += morceau.length;
    if (n > limiteMo * 1024 * 1024) throw new ErreurFondTropLourd(limiteMo);
    yield morceau;
  }
}

/** Writes a background to `tmp/` and checks it is an image; leaves nothing behind on a refusal. */
export async function ecrireFond(
  db: Db,
  flux: Flux,
  racine: string,
): Promise<{ temporaire: string; type: string; empreinte: string }> {
  const ecrit = await ecrireFlux(limiter(flux, fondCarteMaxMo(db)), racine);
  const type = ecrit.taille === 0 ? '' : typeParSignature(ecrit.debut);
  if (!type.startsWith('image/')) {
    await abandonner(ecrit.temporaire, racine);
    throw refus('fond_invalide', "Ce fichier n'est pas une image (PNG, JPEG, GIF ou WebP).");
  }
  return { temporaire: ecrit.temporaire, type, empreinte: ecrit.empreinte };
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
  const ecrit = entree.fond === undefined ? null : await ecrireFond(db, entree.fond, racine);
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
    return vueDuMJ(db, charger(db, id)!);
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
    return vueDuMJ(db, charger(db, c.id)!);
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
  const ecrit = await ecrireFond(db, flux, racine);
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
  return vueDuMJ(db, charger(db, carteId)!);
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
  const acteur: Acteur = { compteId, modeJoueur };
  const mj = vueMJ(role, acteur);
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
  return { cartes: lot.map((c) => vueCarte(db, c, role, acteur)), suivant };
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
    carte: vueCarte(db, c, role, acteur),
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
          const cle = `${r.fiche_id}|${rel.cible.id}|${rel.nature}|${rel.qualificatif}`;
          if (vus.has(cle)) continue;
          vus.add(cle);
          liens.push({
            de: r.fiche_id,
            vers: rel.cible.id,
            nature: rel.nature,
            qualificatif: rel.qualificatif,
            libelle: libelleRelation(rel.nature, rel.qualificatif),
          });
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

/**
 * Write gate of the attachment and the text (AD-142): only a GM of the map's universe, outside player
 * mode. Anyone else — a player, no role, an unknown id — gets "not found"; a GM in player mode is refused.
 */
function porteMJ(db: Db, compteId: number, modeJoueur: boolean, carteId: number): CarteRow {
  const c = charger(db, carteId);
  if (!c) throw introuvable();
  if (roleDe(db, c.univers_id, compteId) !== 'mj') throw introuvable();
  if (modeJoueur) throw refuse('Seul le MJ peut modifier une carte.');
  return c;
}

/** The GM attaches the map to a sheet of its universe that they read; a map has one sheet at most (AD-142). */
export function rattacherCarte(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  carteId: number,
  ficheId: number,
): CarteVue {
  return db.transaction(() => {
    const c = porteMJ(db, compteId, modeJoueur, carteId);
    const inconnue = () => new ErreurService('invalide', 'Cette fiche est introuvable dans cet univers.', undefined, 'fiche');
    if (!Number.isInteger(ficheId)) throw inconnue();
    try {
      chargerFiche(db, c.univers_id, ficheId);
    } catch {
      throw inconnue();
    }
    if (!peutVoirFiche(db, 'mj', ficheId, { compteId, modeJoueur })) throw inconnue();
    db.prepare('UPDATE cartes SET fiche_id = ? WHERE id = ?').run(ficheId, c.id);
    return vueDuMJ(db, charger(db, c.id)!);
  })();
}

/** The GM detaches the map from its sheet; a map already free stays so. */
export function detacherCarte(db: Db, compteId: number, modeJoueur: boolean, carteId: number): CarteVue {
  return db.transaction(() => {
    const c = porteMJ(db, compteId, modeJoueur, carteId);
    db.prepare('UPDATE cartes SET fiche_id = NULL WHERE id = ?').run(c.id);
    return vueDuMJ(db, charger(db, c.id)!);
  })();
}

/**
 * The GM writes the text of a map: `texte_public` goes with `texte` and `version` moves (AD-114, AD-142).
 * `versionLue` is what the screen read: stale → 409 `carte_modifiee`; absent (the import, which does not
 * see the version) → no check. No `[[…]]` link of the text is stored.
 */
export function ecrireTexteCarte(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  carteId: number,
  texte: string,
  versionLue?: number,
): CarteVue {
  if (typeof texte !== 'string') {
    throw new ErreurService('invalide', 'Le texte doit être une chaîne.', undefined, 'texte');
  }
  if (texte.length > MAX_TEXTE_CARTE) {
    throw new ErreurService('invalide', 'Le texte : 5 000 caractères au plus.', undefined, 'texte');
  }
  return db.transaction(() => {
    const c = porteMJ(db, compteId, modeJoueur, carteId);
    if (versionLue !== undefined && versionLue !== c.version) {
      throw new ErreurService('conflit', 'Le texte a changé depuis votre lecture.', 'carte_modifiee');
    }
    db.prepare('UPDATE cartes SET texte = ?, texte_public = ?, version = version + 1 WHERE id = ?').run(
      texte,
      contenuPublic(texte),
      c.id,
    );
    return vueDuMJ(db, charger(db, c.id)!);
  })();
}

/**
 * The maps attached to a sheet that this reader reads (block « Cartes » of E-9): every one for the GM
 * outside player mode, the visible ones for anyone else; none is counted when hidden. The sheet must
 * be readable by the reader, else "not found".
 */
export function cartesDeFiche(db: Db, acteur: Acteur, universId: number, ficheId: number): CarteVue[] {
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) throw introuvable();
  chargerFiche(db, universId, ficheId);
  if (!peutVoirFiche(db, role, ficheId, acteur)) throw introuvable();
  const mj = vueMJ(role, acteur);
  const rows = db
    .prepare(
      `SELECT * FROM cartes WHERE univers_id = ? AND fiche_id = ?${mj ? '' : ' AND visible = 1'}
       ORDER BY titre COLLATE NOCASE, id`,
    )
    .all(universId, ficheId) as CarteRow[];
  return rows.map((c) => vueCarte(db, c, role, acteur));
}

export interface CarteApi {
  id: number;
  titre: string;
  forme: FormeCarte;
  visible: boolean;
  /** SHA-256 of the background, null when the map has none. */
  sha256Fond: string | null;
  empreinte: string;
  /** The text: the GM's source, else its public copy (no `:::mj` block, AD-114). */
  texte: string;
  /** The attached sheet when the caller reads it, else null (never a hint of a hidden one). */
  fiche: { id: number; cle: string; titre: string } | null;
}

function ficheLue(db: Db, role: Role, compteId: number, ficheId: number | null): CarteApi['fiche'] {
  if (ficheId === null || !peutVoirFiche(db, role, ficheId, { compteId })) return null;
  return db.prepare('SELECT id, cle, titre FROM fiches WHERE id = ?').get(ficheId) as CarteApi['fiche'];
}

/**
 * The maps the caller reads, in id order, a thousand per page (B-90, AD-149): every map for a GM, the
 * visible ones for anyone else; a hidden map is neither listed nor counted. Metadata only: the elements
 * and links of a map stay with `lireCarte` (AD-68).
 */
export async function listerCartesApi(
  db: Db,
  compteId: number,
  universId: number,
  apres: unknown,
): Promise<{ cartes: CarteApi[]; suivant: number | null }> {
  const role = roleDe(db, universId, compteId);
  if (!role) throw introuvable();
  const curseur = curseurApi(apres);
  const rows = db
    .prepare(
      `SELECT * FROM cartes WHERE univers_id = ? AND id > ?${role === 'mj' ? '' : ' AND visible = 1'}
       ORDER BY id LIMIT ?`,
    )
    .all(universId, curseur, PAGE_LECTURE_API + 1) as CarteRow[];
  const page = rows.slice(0, PAGE_LECTURE_API);
  const cartes: CarteApi[] = [];
  for (const c of page) {
    const sha256Fond = c.fond === null ? null : await sha256Stocke(c.fond);
    const visible = c.visible === 1;
    cartes.push({
      id: c.id,
      titre: c.titre,
      forme: c.forme,
      visible,
      sha256Fond,
      empreinte: empreinteCarte({ titre: c.titre, forme: c.forme, visible, sha256Fond }),
      texte: role === 'mj' ? c.texte : c.texte_public,
      fiche: ficheLue(db, role, compteId, c.fiche_id),
    });
  }
  return { cartes, suivant: rows.length > PAGE_LECTURE_API ? page[page.length - 1]!.id : null };
}
