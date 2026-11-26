import type { Db } from '../db/db.js';

/**
 * The live fan-out of a played map (AD-159, AD-battlemap-table-6): in memory, one process. It holds the open streams per map with
 * their kind (`jeu` or `affichage`) and whether the reader is a GM; what it sends is only versions and a count of displays, never
 * a piece of state — the client refetches the filtered state. The GM-ness is decided by the caller from the role read in
 * `membres`, never from the query.
 */

export type GenreFlux = 'jeu' | 'affichage';

interface Flux { genre: GenreFlux; mj: boolean; ecrire: (octets: string) => void; fermer: () => void }

const ouverts = new Map<number, Set<Flux>>();
let minuteur: NodeJS.Timeout | null = null;
let periodeBattement = 20_000;

/** Heartbeat period (ms), 20 s by default — below any proxy's idle timeout. Tests shorten it. */
export function reglerBattement(ms: number): void {
  periodeBattement = ms;
  if (minuteur) { clearInterval(minuteur); minuteur = null; armer(); }
}

/** A named event, not a `:` comment: a browser `EventSource` never surfaces a comment. */
export const TRAME_BATTEMENT = 'event: battement\ndata: {}\n\n';

export function trameMaj(carte: number, table: number | null): string {
  return `id: ${table ?? carte}\nevent: maj\ndata: ${JSON.stringify({ carte, table })}\n\n`;
}

const trameAffichages = (n: number) => `event: presence\ndata: ${JSON.stringify({ affichages: n })}\n\n`;

function envoyer(f: Flux, trame: string): void {
  try { f.ecrire(trame); } catch { f.fermer(); }
}

function armer(): void {
  if (minuteur || ouverts.size === 0) return;
  minuteur = setInterval(() => {
    for (const set of [...ouverts.values()]) for (const f of [...set]) envoyer(f, TRAME_BATTEMENT);
  }, periodeBattement);
  minuteur.unref();
}

/** Number of display streams open on a map. */
export function affichagesOuverts(carteId: number): number {
  let n = 0;
  for (const f of ouverts.get(carteId) ?? []) if (f.genre === 'affichage') n++;
  return n;
}

function diffuserPresence(carteId: number): void {
  const n = affichagesOuverts(carteId);
  for (const f of ouverts.get(carteId) ?? []) if (f.mj && f.genre === 'jeu') envoyer(f, trameAffichages(n));
}

/** Versions of a map and of its table now; `carte: null` once the map is gone. */
function versions(db: Db, carteId: number): { carte: number; table: number | null } | null {
  const c = db.prepare('SELECT version FROM bm_cartes WHERE id = ?').get(carteId) as { version: number } | undefined;
  if (!c) return null;
  const t = db.prepare('SELECT version FROM bm_tables WHERE carte_id = ?').get(carteId) as { version: number } | undefined;
  return { carte: c.version, table: t?.version ?? null };
}

/**
 * Registers a stream: sends the initial `maj` (and, for a GM's play stream, the current count of displays), returns its release.
 * `v` are the versions read by the caller under its guards.
 */
export function ouvrirFlux(carteId: number, v: { carte: number; table: number | null }, genre: GenreFlux, mj: boolean,
  ecrire: (octets: string) => void, fermer: () => void): () => void {
  const f: Flux = { genre, mj, ecrire, fermer };
  let set = ouverts.get(carteId);
  if (!set) { set = new Set(); ouverts.set(carteId, set); }
  set.add(f);
  armer();
  envoyer(f, trameMaj(v.carte, v.table));
  if (genre === 'affichage') diffuserPresence(carteId);
  else if (mj) envoyer(f, trameAffichages(affichagesOuverts(carteId)));
  return () => {
    const s = ouverts.get(carteId);
    if (!s || !s.delete(f)) return;
    if (s.size === 0) ouverts.delete(carteId);
    if (ouverts.size === 0 && minuteur) { clearInterval(minuteur); minuteur = null; }
    if (genre === 'affichage') diffuserPresence(carteId);
  };
}

/**
 * Announces a write of the map's document or of its table (or the map's disappearance: both versions are then the last ones the
 * streams knew — the client refetches and gets `introuvable`). Called by the services once the write is done.
 */
export function annoncer(db: Db, carteId: number): void {
  const set = ouverts.get(carteId);
  if (!set || set.size === 0) return;
  const v = versions(db, carteId);
  if (!v) { for (const f of [...set]) { envoyer(f, `event: maj\ndata: ${JSON.stringify({ carte: null, table: null })}\n\n`); } return; }
  const trame = trameMaj(v.carte, v.table);
  for (const f of [...set]) envoyer(f, trame);
}

/** Closes every stream (server shutdown). */
export function fermerTout(): void {
  for (const set of [...ouverts.values()]) for (const f of [...set]) { try { f.fermer(); } catch { /* already closed */ } }
  ouverts.clear();
  if (minuteur) { clearInterval(minuteur); minuteur = null; }
}
