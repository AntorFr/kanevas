import type { Db } from '../../db/db.js';
import { contourValide } from '../../outils/swn/regles/zone.js';
import { cleDe } from '../../outils/swn/regles/cle.js';
import { TAILLE_BLOC } from '../../outils/swn/regles/generation.js';
import { distanceHex } from '../../outils/swn/regles/hex.js';
import { ErreurService } from '../erreurs.js';
import type { Acteur } from '../types.js';
import { lireBlocsGeneres } from './cache-blocs.js';
import { surSourceModifiee } from '../crochets-outils.js';
import { exigerEcritureGalaxie, OUTIL_GALAXIE, type LigneGalaxie, type LigneRoute, type LigneSysteme, type LigneZone } from './galaxies.js';

/**
 * Writes of the elements of a galaxy (T-2 to T-5): systems, routes, zones. Every write goes through
 * `exigerEcritureGalaxie` (T-1), checks the version the caller read, and bumps the row's own version only.
 */

export const COULEURS = ['accent', 'table', 'ambre', 'danger', 'neutre', 'clair'] as const;
/** The three sizes of the interface, stored as the column's integers. */
const TAILLES: Record<string, number> = { petite: 1, moyenne: 2, grande: 3 };
const BORNE = 100_000;
const NOTES_MAX = 2_000;

const acteurDe = (a: Acteur | number): Acteur => typeof a === 'number' ? { compteId: a } : a;
const invalideChamp = (champ: string, message: string) => new ErreurService('invalide', message, undefined, champ);
const PERIME = (quoi: string) => new ErreurService('conflit', `Ce ${quoi} a changé depuis que vous l'avez ouvert.`, 'donnee_modifiee');

let suspendu: { modifie: boolean } | null = null;
/**
 * Runs `fn` with the document signal held back, and says whether a write happened: the import signals once per
 * request, not per item (T-9). The caller signals with `apresEcriture` itself.
 */
export function sansSignal<T>(fn: () => T): { valeur: T; modifie: boolean } {
  const avant = suspendu;
  const mien = { modifie: false };
  suspendu = mien;
  try { return { valeur: fn(), modifie: mien.modifie }; } finally { suspendu = avant; }
}

/** Called after each write that changes the document's source: the writing GM gets a recalculation proposal (T-7). */
export function apresEcriture(db: Db, compteId: number, universId: number): void {
  if (suspendu) { suspendu.modifie = true; return; }
  surSourceModifiee.appeler(db, compteId, universId, OUTIL_GALAXIE);
}

function versionValide(version: unknown): number {
  if (!Number.isInteger(version) || (version as number) < 1) throw invalideChamp('version', 'Version invalide.');
  return version as number;
}
function nomValide(nom: unknown): string {
  const n = typeof nom === 'string' ? nom.trim() : '';
  if (n.length < 1 || n.length > 80) throw invalideChamp('nom', 'Le nom : de 1 à 80 caractères.');
  return n;
}
function coordonnee(champ: 'q' | 'r', v: unknown): number {
  if (!Number.isInteger(v) || Math.abs(v as number) > BORNE) throw invalideChamp(champ, `${champ} : un entier entre -100000 et 100000.`);
  return v as number;
}
function tailleValide(v: unknown): number {
  if (typeof v === 'string' && Object.hasOwn(TAILLES, v)) return TAILLES[v]!;
  if (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5) return v as number;
  throw invalideChamp('taille', 'Taille : petite, moyenne ou grande.');
}
function couleurValide(v: unknown): string {
  if (typeof v === 'string' && (COULEURS as readonly string[]).includes(v)) return v;
  throw invalideChamp('couleur', 'Couleur inconnue.');
}
function notesValides(v: unknown): string {
  if (typeof v !== 'string' || v.length > NOTES_MAX) throw invalideChamp('notes', 'Les notes : 2 000 caractères au plus.');
  return v;
}
/** A type of link: 1 to 40 characters after trimming; a blank string is refused, never turned into « none » (T-4). */
export function typeLienValide(v: unknown, champ = 'type_lien'): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (t.length < 1 || t.length > 40) throw invalideChamp(champ, 'Le type de lien fait 1 à 40 caractères.');
  return t;
}
function boolValide(champ: string, v: unknown): boolean {
  if (typeof v !== 'boolean') throw invalideChamp(champ, 'Valeur invalide.');
  return v;
}
function densiteValide(v: unknown): number | null {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw invalideChamp('densite', 'Densité : de 0 à 1.');
  return v;
}
function contourChoisi(v: unknown): [number, number][] {
  const r = contourValide(v);
  if (!r.ok) {
    throw invalideChamp('contour', r.code === 'contour_trop_court' ? 'Un territoire a au moins trois sommets.'
      : r.code === 'contour_croise' ? 'Le contour se croise.' : 'Contour invalide.');
  }
  return v as [number, number][];
}
const corps = (c: unknown): Record<string, unknown> => (c !== null && typeof c === 'object' && !Array.isArray(c) ? c as Record<string, unknown> : {});
const a = (c: Record<string, unknown>, k: string) => Object.hasOwn(c, k) && c[k] !== undefined;

function systemeDeCle(db: Db, g: LigneGalaxie, cle: string): LigneSysteme {
  const s = db.prepare('SELECT * FROM swn_systemes WHERE galaxie_id = ? AND cle = ?').get(g.id, cle) as LigneSysteme | undefined;
  if (!s) throw new ErreurService('introuvable', 'Page introuvable.');
  return s;
}
function zoneDeCle(db: Db, g: LigneGalaxie, cle: string): LigneZone {
  const z = db.prepare('SELECT * FROM swn_zones WHERE galaxie_id = ? AND cle = ?').get(g.id, cle) as LigneZone | undefined;
  if (!z) throw new ErreurService('introuvable', 'Page introuvable.');
  return z;
}
function routeDId(db: Db, g: LigneGalaxie, id: number): LigneRoute {
  const r = Number.isInteger(id)
    ? db.prepare('SELECT * FROM swn_routes WHERE galaxie_id = ? AND id = ?').get(g.id, id) as LigneRoute | undefined : undefined;
  if (!r) throw new ErreurService('introuvable', 'Page introuvable.');
  return r;
}
const clesDe = (db: Db, table: 'swn_systemes' | 'swn_zones', gid: number, sauf?: string): string[] =>
  (db.prepare(`SELECT cle FROM ${table} WHERE galaxie_id = ?`).all(gid) as { cle: string }[]).map((l) => l.cle).filter((c) => c !== sauf);

function caseLibre(db: Db, g: LigneGalaxie, q: number, r: number, sauf?: number): void {
  const pris = db.prepare('SELECT id FROM swn_systemes WHERE galaxie_id = ? AND q = ? AND r = ?').get(g.id, q, r) as { id: number } | undefined;
  if (pris && pris.id !== sauf) throw new ErreurService('conflit', 'Cet hexagone est déjà pris.', 'case_occupee');
}

/** True when the block of `(q, r)` holds a generated system there, read under the GM's level (G-4). */
function estGenere(db: Db, acteur: Acteur, universId: number, g: LigneGalaxie, q: number, r: number): boolean {
  const bx = Math.floor(q / TAILLE_BLOC), by = Math.floor(r / TAILLE_BLOC);
  const [bloc] = lireBlocsGeneres(db, acteur, universId, g.id, { bx, by }, { bx, by });
  return !!bloc && bloc.generes.some(([gq, gr]) => gq === q && gr === r);
}

export interface SystemeNormalise { nom: string; q: number; r: number; taille: number; couleur: string; notes: string; secret: boolean }
/** The fields of a system as written, defaults applied; `invalide` with the field otherwise. */
export function normaliserSysteme(entree: unknown): SystemeNormalise {
  const c = corps(entree);
  return {
    nom: nomValide(c.nom), q: coordonnee('q', c.q), r: coordonnee('r', c.r),
    taille: a(c, 'taille') ? tailleValide(c.taille) : TAILLES.moyenne!,
    couleur: a(c, 'couleur') ? couleurValide(c.couleur) : 'accent',
    notes: a(c, 'notes') ? notesValides(c.notes) : '',
    secret: a(c, 'secret') ? boolValide('secret', c.secret) : false,
  };
}
export interface ZoneNormalisee { nom: string; contour: [number, number][]; couleur: string; densite: number | null; secret: boolean }
export function normaliserZone(entree: unknown): ZoneNormalisee {
  const c = corps(entree);
  return {
    nom: nomValide(c.nom), contour: contourChoisi(c.contour),
    couleur: a(c, 'couleur') ? couleurValide(c.couleur) : 'accent',
    densite: a(c, 'densite') ? densiteValide(c.densite) : null,
    secret: a(c, 'secret') ? boolValide('secret', c.secret) : false,
  };
}
export function booleenImport(champ: string, v: unknown): boolean { return boolValide(champ, v); }
/** Routes whose length a move rewrote, by id: the import reads them to put the in-step ones back in step (T-9). */
export function routesDeSysteme(db: Db, systemeId: number): { id: number; version: number; version_importee: number | null }[] {
  return db.prepare('SELECT id, version, version_importee FROM swn_routes WHERE depuis_id = ? OR vers_id = ?').all(systemeId, systemeId) as
    { id: number; version: number; version_importee: number | null }[];
}

export interface SystemeEntree {
  nom: unknown; q: unknown; r: unknown; taille?: unknown; couleur?: unknown; notes?: unknown; secret?: unknown;
}
export interface ResultatSysteme { id: number; cle: string; version: number; promu: boolean }

export function placerSysteme(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, s: SystemeEntree,
  /** The import brings its own `cle` and knows nothing of generation (`promu` false), T-9. */
  importe?: { cle: string }): ResultatSysteme {
  const ac = acteurDe(acteur);
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const { nom, q, r, taille, couleur, notes, secret } = normaliserSysteme(s);
    caseLibre(db, g, q, r);
    const promu = importe ? false : estGenere(db, ac, universId, g, q, r);
    const cle = importe?.cle ?? cleDe(nom, clesDe(db, 'swn_systemes', g.id));
    const id = Number(db.prepare(`INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(g.id, universId, cle, nom, q, r, taille, couleur, notes, secret ? 1 : 0, promu ? 1 : 0).lastInsertRowid);
    apresEcriture(db, ac.compteId, universId);
    return { id, cle, version: 1, promu };
  })();
}

/** Rewrites the length of every route of a moved system; each one's version goes up (T-2). */
function recalculerRoutes(db: Db, systemeId: number): void {
  const routes = db.prepare(`SELECT ro.id, d.q AS dq, d.r AS dr, v.q AS vq, v.r AS vr FROM swn_routes ro
    JOIN swn_systemes d ON d.id = ro.depuis_id JOIN swn_systemes v ON v.id = ro.vers_id
    WHERE ro.depuis_id = ? OR ro.vers_id = ?`).all(systemeId, systemeId) as
    { id: number; dq: number; dr: number; vq: number; vr: number }[];
  const maj = db.prepare('UPDATE swn_routes SET longueur = ?, version = version + 1 WHERE id = ?');
  for (const ro of routes) maj.run(Math.max(1, distanceHex({ q: ro.dq, r: ro.dr }, { q: ro.vq, r: ro.vr })), ro.id);
}

export function modifierSysteme(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, cle: string,
  champs: Record<string, unknown> & { version?: unknown }): { version: number } {
  const ac = acteurDe(acteur);
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const s = systemeDeCle(db, g, cle);
    const c = corps(champs);
    const version = versionValide(c.version);
    const sets: string[] = [], vals: unknown[] = [];
    if (a(c, 'nom')) { sets.push('nom = ?'); vals.push(nomValide(c.nom)); }
    if (a(c, 'taille')) { sets.push('taille = ?'); vals.push(tailleValide(c.taille)); }
    if (a(c, 'couleur')) { sets.push('couleur = ?'); vals.push(couleurValide(c.couleur)); }
    if (a(c, 'notes')) { sets.push('notes = ?'); vals.push(notesValides(c.notes)); }
    if (a(c, 'secret')) { sets.push('secret = ?'); vals.push(boolValide('secret', c.secret) ? 1 : 0); }
    const q = a(c, 'q') ? coordonnee('q', c.q) : s.q, r = a(c, 'r') ? coordonnee('r', c.r) : s.r;
    const deplace = q !== s.q || r !== s.r;
    if (s.version !== version) throw PERIME('système');
    if (deplace) { caseLibre(db, g, q, r, s.id); sets.push('q = ?', 'r = ?'); vals.push(q, r); }
    db.prepare(`UPDATE swn_systemes SET ${[...sets, 'version = version + 1'].join(', ')} WHERE id = ?`).run(...vals, s.id);
    if (deplace) recalculerRoutes(db, s.id);
    apresEcriture(db, ac.compteId, universId);
    return { version: version + 1 };
  })();
}

export function retirerSysteme(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, cle: string, version: unknown): void {
  const ac = acteurDe(acteur);
  db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const s = systemeDeCle(db, g, cle);
    const v = versionValide(version);
    if (s.version !== v) throw PERIME('système');
    db.prepare('DELETE FROM swn_systemes WHERE id = ?').run(s.id); // routes: ON DELETE CASCADE
    apresEcriture(db, ac.compteId, universId);
  })();
}

export function tracerRoute(db: Db, acteur: Acteur | number, universId: number, galaxieId: number,
  entree: { depuis: unknown; vers: unknown; publique?: unknown; longueur?: unknown; type_lien?: unknown }): { id: number; longueur: number; version: number } {
  const ac = acteurDe(acteur);
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const c = corps(entree);
    if (a(c, 'longueur')) throw invalideChamp('longueur', 'La longueur est calculée.');
    const publique = a(c, 'publique') ? boolValide('publique', c.publique) : true;
    const typeLien = a(c, 'type_lien') && c.type_lien !== null ? typeLienValide(c.type_lien) : null;
    const bout = (champ: 'depuis' | 'vers'): LigneSysteme => {
      const cle = c[champ];
      const s = typeof cle === 'string'
        ? db.prepare('SELECT * FROM swn_systemes WHERE galaxie_id = ? AND cle = ?').get(g.id, cle) as LigneSysteme | undefined : undefined;
      if (!s) throw invalideChamp(champ, 'Système inconnu.');
      return s;
    };
    const d = bout('depuis'), v = bout('vers');
    if (d.id === v.id) throw invalideChamp('vers', 'Les deux extrémités doivent différer.');
    const deja = db.prepare(`SELECT id FROM swn_routes WHERE (depuis_id = ? AND vers_id = ?) OR (depuis_id = ? AND vers_id = ?)`)
      .get(d.id, v.id, v.id, d.id);
    if (deja) throw new ErreurService('conflit', 'Cette route existe déjà.', 'route_existante');
    const longueur = Math.max(1, distanceHex(d, v));
    const id = Number(db.prepare(`INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur, type_lien)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(g.id, universId, d.id, v.id, publique ? 1 : 0, longueur, typeLien).lastInsertRowid);
    apresEcriture(db, ac.compteId, universId);
    return { id, longueur, version: 1 };
  })();
}

export function modifierRoute(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, id: number,
  champs: Record<string, unknown>): { version: number } {
  const ac = acteurDe(acteur);
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const ro = routeDId(db, g, id);
    const c = corps(champs);
    for (const k of ['depuis', 'vers', 'longueur']) {
      if (a(c, k)) throw invalideChamp(k, k === 'longueur' ? 'La longueur est calculée.' : 'Les extrémités ne changent pas : retirez la route et tracez-la à nouveau.');
    }
    const publique = a(c, 'publique') ? boolValide('publique', c.publique) : ro.publique === 1;
    const typeLien = a(c, 'type_lien') ? (c.type_lien === null ? null : typeLienValide(c.type_lien)) : ro.type_lien;
    if (!a(c, 'publique') && !a(c, 'type_lien')) throw invalideChamp('publique', 'Rien à modifier : la visibilité ou le type de lien.');
    const version = versionValide(c.version);
    if (ro.version !== version) throw PERIME('route');
    db.prepare('UPDATE swn_routes SET publique = ?, type_lien = ?, version = version + 1 WHERE id = ?').run(publique ? 1 : 0, typeLien, ro.id);
    apresEcriture(db, ac.compteId, universId);
    return { version: version + 1 };
  })();
}

export function retirerRoute(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, id: number, version: unknown): void {
  const ac = acteurDe(acteur);
  db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const ro = routeDId(db, g, id);
    const v = versionValide(version);
    if (ro.version !== v) throw PERIME('route');
    db.prepare('DELETE FROM swn_routes WHERE id = ?').run(ro.id);
    apresEcriture(db, ac.compteId, universId);
  })();
}

export function dessinerZone(db: Db, acteur: Acteur | number, universId: number, galaxieId: number,
  z: { nom: unknown; contour: unknown; couleur?: unknown; densite?: unknown; secret?: unknown },
  /** The import brings its own `cle` (T-9). */
  importe?: { cle: string }): { id: number; cle: string; version: number } {
  const ac = acteurDe(acteur);
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const { nom, contour, couleur, densite, secret } = normaliserZone(z);
    const cle = importe?.cle ?? cleDe(nom, clesDe(db, 'swn_zones', g.id));
    const id = Number(db.prepare(`INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(g.id, universId, cle, nom, JSON.stringify(contour), couleur, densite, secret ? 1 : 0).lastInsertRowid);
    apresEcriture(db, ac.compteId, universId);
    return { id, cle, version: 1 };
  })();
}

export function modifierZone(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, cle: string,
  champs: Record<string, unknown>): { version: number } {
  const ac = acteurDe(acteur);
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const z = zoneDeCle(db, g, cle);
    const c = corps(champs);
    const version = versionValide(c.version);
    const sets: string[] = [], vals: unknown[] = [];
    if (a(c, 'nom')) { sets.push('nom = ?'); vals.push(nomValide(c.nom)); }
    if (a(c, 'contour')) { sets.push('contour = ?'); vals.push(JSON.stringify(contourChoisi(c.contour))); }
    if (a(c, 'couleur')) { sets.push('couleur = ?'); vals.push(couleurValide(c.couleur)); }
    if (a(c, 'densite')) { sets.push('densite = ?'); vals.push(densiteValide(c.densite)); }
    if (a(c, 'secret')) { sets.push('secret = ?'); vals.push(boolValide('secret', c.secret) ? 1 : 0); }
    if (z.version !== version) throw PERIME('territoire');
    db.prepare(`UPDATE swn_zones SET ${[...sets, 'version = version + 1'].join(', ')} WHERE id = ?`).run(...vals, z.id);
    apresEcriture(db, ac.compteId, universId);
    return { version: version + 1 };
  })();
}

export function retirerZone(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, cle: string, version: unknown): void {
  const ac = acteurDe(acteur);
  db.transaction(() => {
    const g = exigerEcritureGalaxie(db, ac, universId, galaxieId);
    const z = zoneDeCle(db, g, cle);
    const v = versionValide(version);
    if (z.version !== v) throw PERIME('territoire');
    db.prepare('DELETE FROM swn_zones WHERE id = ?').run(z.id);
    apresEcriture(db, ac.compteId, universId);
  })();
}
