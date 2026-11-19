// Geometry of the system map (AD-carte-3): pure, no DOM. World units are pixels at the fitted view (zoom 1); the plan
// position of an orbit and an hour is the core's (`orbite_heure_vers_plan`, AD-143), injected as `plan`.
import type { AstreSysteme, FormationSysteme, InterieurSysteme } from './types';
import type { GenreCorps, Obstacle } from './etiquettes';

/** `plan(rayon, heure)` → `[x, y]` (12 at the top, 3 at the right): the core's function. */
export type Plan = (rayon: number, heure: number) => [number, number];

/** World pixels per orbit unit. */
export const U = 44;
/** Radius of an orbit in world pixels: regularly spaced, the first ones tighter (the mockup's scale). */
export const rayonOrbite = (orbite: number): number => (orbite < 1 ? 1.5 * U * orbite : U * (orbite + 0.5));

/** Inverse of `rayonOrbite`: the orbit whose circle has this radius in world pixels. */
export const orbiteDepuisRayon = (rayon: number): number => (rayon < 1.5 * U ? rayon / (1.5 * U) : rayon / U - 0.5);

const arrondi2 = (n: number) => Math.round(n * 100) / 100;
const ORBITE_MAX = 1000;

/** The stored place (orbit, hour) of a point of the plane relative to a centre, in world pixels: 12 at the top, 3 at the right (the core's convention, AD-143). */
export function placeDepuisPoint(x: number, y: number): { orbite: number; heure: number } {
  const heure = arrondi2((((Math.atan2(x, -y) * 180) / Math.PI / 30) % 12 + 12) % 12);
  return { orbite: Math.min(ORBITE_MAX, Math.max(0, arrondi2(orbiteDepuisRayon(Math.hypot(x, y))))), heure: heure >= 12 ? 0 : heure };
}

/** One arrow press on a place: the orbit stays within 0 to 1 000, the hour wraps around 12; a moon has no orbit to move. */
export function placeApresPas(orbite: number | null, heure: number, pas: { orbite: number; heure: number }, lune: boolean): { orbite: number | null; heure: number } {
  const h = arrondi2((((heure + pas.heure) % 12) + 12) % 12);
  return {
    orbite: lune || orbite === null ? orbite : Math.min(ORBITE_MAX, Math.max(0, arrondi2(orbite + pas.orbite))),
    heure: h >= 12 ? 0 : h,
  };
}

const RAYON_MIN = 5;
const RAYON_MAX = 64;
/** Disc radius of a body in world pixels, from its `taille` (an orbit-unit radius): bounded so no body hides the map. */
export const rayonCorps = (a: Pick<AstreSysteme, 'taille' | 'genre'>): number =>
  Math.min(RAYON_MAX, Math.max(RAYON_MIN, (Number.isFinite(a.taille) ? a.taille : 0.1) * U * 4.5));

/** Part of the half-side of a sprite that the disc of its family takes (see the renderer): the rest is atmosphere or corona. */
function fraction(a: AstreSysteme): number {
  if (a.genre === 'etoile') return 0.4;
  if (a.genre === 'comete') return 0.35;
  if (a.type === 'anomalie' || a.type === 'nebuleuse' || a.type === 'ceinture' || a.type === 'asteroides') return 0.8;
  return 0.78;
}

/** The head of a comet sits at (±0.3, −0.22) of its picture (the renderer): the sprite is shifted so the head is on the body. */
function decalageDe(a: AstreSysteme): [number, number] {
  if (a.genre !== 'comete') return [0, 0];
  const sens = typeof a.aspect?.sens === 'number' && a.aspect.sens < 0 ? -1 : 1;
  return [-sens * 0.3, 0.22];
}

/** A body placed in the world. `cote` is the side of its sprite in world pixels. */
export interface CorpsPlace {
  cle: string; genre: GenreCorps; nom: string | null; astre: AstreSysteme; x: number; y: number; rayon: number; cote: number;
  /** The aspect JSON `dessiner` takes (the same object the illustration route draws, AD-carte-2). */
  aspect: string;
  /** Shift of the sprite from the body's centre, as a fraction of its side (a comet's head is not at the middle of its picture). */
  decalage: [number, number];
}

export interface ZonePlacee {
  cle: string; forme: 'anneau' | 'nuage'; nom: string | null; formation: FormationSysteme; ancre: [number, number];
}

export interface Disposition { corps: CorpsPlace[]; zones: ZonePlacee[]; etendue: number; transition: number }

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function aspectDe(a: AstreSysteme): string {
  return JSON.stringify({ type: a.type, taille: a.taille, aspect: a.aspect ?? {} });
}

const genreDe = (a: AstreSysteme): GenreCorps =>
  a.genre === 'etoile' ? (a.etoile_rang > 0 ? 'compagne' : 'etoile') : a.genre === 'lune' ? 'lune'
    : a.genre === 'comete' ? 'comete' : a.type === 'anomalie' ? 'anomalie' : 'planete';

/** Where every body and zone sits, and how far the system extends (a very high orbit extends it). */
export function disposer(s: InterieurSysteme, plan: Plan): Disposition {
  const corps: CorpsPlace[] = [];
  const parCle = new Map<string, CorpsPlace>();
  const place = (a: AstreSysteme, x: number, y: number) => {
    const rayon = rayonCorps(a);
    const c: CorpsPlace = { cle: a.cle, genre: genreDe(a), nom: a.nom, astre: a, x, y, rayon, cote: (rayon * 2) / fraction(a), aspect: aspectDe(a), decalage: decalageDe(a) };
    corps.push(c);
    parCle.set(a.cle, c);
  };
  // The central star, then everything that hangs on the centre; moons after their planet.
  for (const a of s.astres) {
    if (a.genre === 'lune') continue;
    if (a.genre === 'etoile' && a.etoile_rang === 0) { place(a, 0, 0); continue; }
    const [x, y] = plan(rayonOrbite(Math.max(0, num(a.orbite))), num(a.heure));
    place(a, x, y);
  }
  const rang = new Map<string, number>();
  for (const a of s.astres) {
    if (a.genre !== 'lune') continue;
    const mere = a.parent_cle === null ? undefined : parCle.get(a.parent_cle);
    const k = rang.get(a.parent_cle ?? '') ?? 0;
    rang.set(a.parent_cle ?? '', k + 1);
    const r = rayonCorps(a);
    const [dx, dy] = plan((mere ? mere.rayon : 0) + r + 9 + 11 * k, num(a.heure));
    place(a, (mere?.x ?? 0) + dx, (mere?.y ?? 0) + dy);
  }
  // Keep the answer's order (the list's order, and the keyboard's).
  const ordre = new Map(s.astres.map((a, i) => [a.cle, i]));
  corps.sort((p, q) => (ordre.get(p.cle) ?? 0) - (ordre.get(q.cle) ?? 0));

  const zones: ZonePlacee[] = s.formations.map((f) => {
    const p = f.parametres;
    if (f.forme === 'anneau') {
      const mid = rayonOrbite((num(p.de) + num(p.a)) / 2);
      return { cle: f.cle, forme: f.forme, nom: f.nom, formation: f, ancre: plan(mid, 6) };
    }
    const centres = centresNuage(f);
    const c = centres[0];
    return { cle: f.cle, forme: f.forme, nom: f.nom, formation: f, ancre: c ? plan(rayonOrbite(c[0]), c[1]) : plan(rayonOrbite(num(p.orbite)), num(p.heure)) };
  });

  const transition = rayonOrbite(Math.max(0, num(s.transition, 0)));
  let etendue = Math.max(transition, 3 * U);
  for (const c of corps) etendue = Math.max(etendue, Math.hypot(c.x, c.y) + c.rayon);
  // An element by orbit and hour extends the system as a body does; one on a body is already inside it.
  for (const e of s.elements ?? []) if (e.sur === null) etendue = Math.max(etendue, rayonOrbite(Math.max(0, num(e.orbite))) + 14);
  for (const z of zones) {
    if (z.forme === 'anneau') etendue = Math.max(etendue, rayonOrbite(num(z.formation.parametres.a)) + 8);
    else for (const c of centresNuage(z.formation)) etendue = Math.max(etendue, rayonOrbite(c[0]) + c[2] * U);
  }
  return { corps, zones, etendue, transition };
}

/** The `[orbite, heure, taille]` centres of a cloud (its own parameters, else one centre at its orbit and hour). */
export function centresNuage(f: FormationSysteme): [number, number, number][] {
  const p = f.parametres;
  const liste = Array.isArray(p.centres) ? p.centres : [];
  const out: [number, number, number][] = [];
  for (const c of liste) {
    if (Array.isArray(c) && c.length >= 3) out.push([num(c[0]), num(c[1]), Math.max(0.1, num(c[2], 1))]);
  }
  return out.length > 0 ? out : [[num(p.orbite), num(p.heure), 1]];
}

/** The side, in pixels, the sprite of a body is asked at: the screen side rounded up to 32, 64, 96… (AD-carte-3). */
export function coteDemande(cotePx: number, dpr = 1, max = 512): number {
  const v = Math.ceil(Math.max(1, cotePx * dpr) / 32) * 32;
  return Math.min(max, Math.max(32, v));
}

/** Deterministic stream in [0, 1) for the grains of a zone (never `Math.random`: the same zone, the same grains). */
export function flux(graine: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < graine.length; i++) { h ^= graine.charCodeAt(i); h = Math.imul(h, 16777619); }
  let e = h >>> 0;
  return () => {
    e = (e + 0x6d2b79f5) >>> 0;
    let t = e;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Grain { x: number; y: number; r: number; l: number }
/** The grains of a ring: a band over its orbit range, in world pixels. */
export function grainsAnneau(f: FormationSysteme, plan: Plan): Grain[] {
  const de = rayonOrbite(num(f.parametres.de));
  const a = Math.max(de + 3, rayonOrbite(num(f.parametres.a)));
  const n = Math.min(700, Math.round(180 + Math.max(0, num(f.parametres.rochers, 0.8)) * 220));
  const g = flux(f.cle);
  const out: Grain[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = plan(de + (a - de) * g(), g() * 12);
    out.push({ x, y, r: 0.5 + g() * 1.4, l: 0.45 + g() * 0.55 });
  }
  return out;
}

/** Part of a star sprite's half-side its glow reaches (the renderer's corona fades out between 0.85 and 1): labels stay outside it. */
export const PORTEE_COURONNE = 0.9;

/** What a comet's two tails cover on screen, as `queue` obstacles (the renderer's geometry: the head on the body, tails fading out
 *  by ~3/4 of their length). `cote` is the sprite side in screen pixels. */
export function queuesComete(x: number, y: number, cote: number, aspect: Record<string, unknown> | undefined): Extract<Obstacle, { type: 'queue' }>[] {
  const num = (k: string, d: number, lo: number, hi: number) => {
    const v = aspect?.[k];
    return Math.min(hi, Math.max(lo, typeof v === 'number' && Number.isFinite(v) ? v : d));
  };
  const sens = typeof aspect?.sens === 'number' && aspect.sens < 0 ? -1 : 1;
  const longueur = num('longueur', 0.55, 0.1, 1);
  const ouv = num('ouverture', 0.25, 0.02, 0.8);
  const tete = num('tete', 1.2, 0.3, 3);
  const courb = num('courbure', 0.45, 0, 1);
  const long = (0.3 + longueur) * cote * 0.95;
  const rn = Math.max(1.2, cote * 0.022 * tete);
  const angleGaz = Math.atan2(0.6, -sens * 0.8);
  const queue = (angle: number, longK: number, large: number, courbe: number) => {
    const l = longK * 0.75;
    return { type: 'queue' as const, x, y, dx: Math.cos(angle), dy: Math.sin(angle), longueur: l,
      r0: 1.2 * rn * 1.1, r1: 1.2 * (rn * 1.1 + large * l) + 0.25 * courbe * l * l / longK };
  };
  return [
    queue(angleGaz, long * 1.05, ouv * 0.38, 0),
    queue(angleGaz - sens * courb * 0.3, long * 0.85, ouv * 1.1, courb * 0.9),
  ];
}
