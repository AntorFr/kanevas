// Reading of the atlas of a system (AD-atlas-2, AD-atlas-3): a pure function, no database, no write. It checks the
// shape and the bounds of the JSON body, collects EVERY refusal with its path, and returns the normalised items.
// What a type, an aspect or a formation may carry is decided by the Rust core (AD-140): nothing of its bounds is
// copied here. The resolution of `fiche` (a sheet's `cle_origine`) is the application's, not this file's.
import { DESCRIPTION_MAX, leCoeur, NOM_MAX, ORBITE_MAX, TAILLE_MAX } from './ecriture-systeme.js';

export const MAX_ETOILES = 8, MAX_CORPS = 80, MAX_LUNES = 24, MAX_ZONES_ATLAS = 40, MAX_POINTS = 40;
/** Refusals kept in the report; the rest is only counted (as the galaxy import's). */
export const MAX_REFUS_ATLAS = 1000;
/** Same pattern as the galaxy import's `cle`. */
const CLE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FICHE_MAX = 200;

export interface RefusAtlas { chemin: string; champ: string; raison: string }

export interface EtoileAtlas {
  cle: string; type: string; nom: string | null; rang: number; orbite: number; heure: number; taille: number;
  aspect: Record<string, unknown> | null; fiche: string | null;
}
export interface LuneAtlas {
  cle: string; type: string; nom: string | null; orbite: number; heure: number; taille: number;
  aspect: Record<string, unknown> | null; fiche: string | null; description: string | null;
}
export interface CorpsAtlas extends LuneAtlas {
  /** `cle` of the star the body orbits (never null: the main star when the file does not say). */
  etoile: string | null;
  lunes: LuneAtlas[];
}
export type PointAtlas = LuneAtlas;
export interface ZoneAtlas {
  cle: string; forme: 'anneau' | 'nuage'; nom: string | null; parametres: Record<string, unknown>;
  fiche: string | null; description: string | null;
}
export interface Atlas {
  /** `undefined`: the file says nothing (unchanged); `null`: the core's default radius. */
  transition?: number | null;
  etoiles: EtoileAtlas[];
  corps: CorpsAtlas[];
  zones: ZoneAtlas[];
  points: PointAtlas[];
}
export type LectureAtlas =
  | { ok: true; atlas: Atlas }
  | { ok: false; refus: RefusAtlas[]; refusTotal: number };

type Obj = Record<string, unknown>;
const objet = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const present = (o: Obj, k: string): boolean => Object.hasOwn(o, k) && o[k] !== undefined;

class Lecteur {
  readonly refus: RefusAtlas[] = [];
  total = 0;
  readonly cles = new Set<string>();

  refuser(chemin: string, champ: string, raison: string): void {
    this.total++;
    if (this.refus.length < MAX_REFUS_ATLAS) this.refus.push({ chemin, champ, raison });
  }

  /** Unknown keys are refused, each at its own path. */
  inconnues(o: Obj, permis: readonly string[], base: string): void {
    for (const k of Object.keys(o)) if (!permis.includes(k)) this.refuser(base + k, k, `Champ inconnu : ${k}.`);
  }

  /** The list under `cle`, or `[]` when absent; a wrong type or too many items is refused at the list's path. */
  liste(o: Obj, k: string, max: number, base: string): unknown[] {
    if (!present(o, k)) return [];
    const v = o[k];
    if (!Array.isArray(v)) { this.refuser(base + k, k, `${k} : une liste est attendue.`); return []; }
    if (v.length > max) {
      this.refuser(base + k, k, `${k} : ${max} éléments au plus.`);
      return v.slice(0, max);
    }
    return v;
  }

  cle(o: Obj, base: string): string {
    const v = o.cle;
    if (typeof v !== 'string' || !CLE.test(v)) {
      this.refuser(`${base}cle`, 'cle', 'La clé : minuscules, chiffres et tirets, 64 caractères au plus.');
      return '';
    }
    if (this.cles.has(v)) this.refuser(`${base}cle`, 'cle', 'Clé déjà utilisée dans ce système.');
    this.cles.add(v);
    return v;
  }

  nom(o: Obj, base: string): string | null {
    if (!present(o, 'nom') || o.nom === null) return null;
    if (typeof o.nom !== 'string' || o.nom.trim().length > NOM_MAX) {
      this.refuser(`${base}nom`, 'nom', `Le nom : ${NOM_MAX} caractères au plus.`);
      return null;
    }
    return o.nom.trim() || null;
  }

  description(o: Obj, base: string): string | null {
    if (!present(o, 'description') || o.description === null) return null;
    if (typeof o.description !== 'string' || o.description.length > DESCRIPTION_MAX) {
      this.refuser(`${base}description`, 'description', 'La description : 2 000 caractères au plus.');
      return null;
    }
    return o.description || null;
  }

  fiche(o: Obj, base: string): string | null {
    if (!present(o, 'fiche') || o.fiche === null) return null;
    if (typeof o.fiche !== 'string' || o.fiche === '' || o.fiche.length > FICHE_MAX) {
      this.refuser(`${base}fiche`, 'fiche', 'La fiche : la clé d\'une fiche déjà importée.');
      return null;
    }
    return o.fiche;
  }

  nombre(o: Obj, k: string, base: string, ok: (n: number) => boolean, raison: string, requis = true, defaut = 0): number {
    if (!present(o, k)) {
      if (requis) this.refuser(`${base}${k}`, k, `${k} : requis.`);
      return defaut;
    }
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || !ok(v)) {
      this.refuser(`${base}${k}`, k, raison);
      return defaut;
    }
    return v;
  }

  orbite(o: Obj, base: string, requis: boolean): number {
    return this.nombre(o, 'orbite', base, (n) => n >= 0 && n <= ORBITE_MAX, `L'orbite : de 0 à ${ORBITE_MAX}.`, requis);
  }
  heure(o: Obj, base: string, requis: boolean): number {
    return this.nombre(o, 'heure', base, (n) => n >= 0 && n < 12, "L'heure : de 0 incluse à 12 exclue.", requis);
  }
  taille(o: Obj, base: string): number {
    return this.nombre(o, 'taille', base, (n) => n > 0 && n <= TAILLE_MAX, `La taille : plus que 0 et ${TAILLE_MAX} au plus.`);
  }

  /** `type` against what the core emits for `genre`; `null` when refused (the aspect is then not judged). */
  type(o: Obj, base: string, genre: string): string | null {
    const v = o.type;
    if (typeof v !== 'string') { this.refuser(`${base}type`, 'type', 'Le type : requis.'); return null; }
    const connus = JSON.parse(leCoeur().types_astre(genre)) as string[];
    if (!connus.includes(v)) { this.refuser(`${base}type`, 'type', 'Type inconnu pour ce genre.'); return null; }
    return v;
  }

  /** Through the core's validator; it returns the aspect re-serialised, which is the normalised value. */
  aspect(o: Obj, base: string, type: string | null): Obj | null {
    if (!present(o, 'aspect') || o.aspect === null) return null;
    if (!objet(o.aspect)) { this.refuser(`${base}aspect`, 'aspect', "L'aspect : un objet."); return null; }
    if (type === null) return null;
    try {
      return JSON.parse(leCoeur().valider_aspect(type, JSON.stringify(o.aspect))) as Obj;
    } catch (e) {
      this.refuser(`${base}aspect`, 'aspect', e instanceof Error && e.message ? `Valeur refusée : ${e.message}` : 'Valeur refusée.');
      return null;
    }
  }
}

const COMMUNS = ['cle', 'type', 'nom', 'orbite', 'heure', 'taille', 'aspect', 'fiche'] as const;

function lireEtoile(l: Lecteur, o: unknown, i: number, rangs: Map<number, number>): EtoileAtlas | null {
  const base = `etoiles[${i}].`;
  if (!objet(o)) { l.refuser(`etoiles[${i}]`, 'etoiles', 'Une étoile est un objet.'); return null; }
  l.inconnues(o, [...COMMUNS, 'rang'], base);
  const cle = l.cle(o, base);
  const type = l.type(o, base, 'etoile');
  let rang = i;
  if (present(o, 'rang')) {
    if (!Number.isInteger(o.rang) || (o.rang as number) < 0) l.refuser(`${base}rang`, 'rang', 'Le rang : un entier positif ou nul.');
    else rang = o.rang as number;
  }
  const deja = rangs.get(rang);
  if (deja !== undefined) l.refuser(`${base}rang`, 'rang', `Rang déjà pris par etoiles[${deja}].`);
  else rangs.set(rang, i);
  const principale = rang === 0;
  const orbite = l.orbite(o, base, !principale);
  const heure = l.heure(o, base, !principale);
  const taille = l.taille(o, base);
  return { cle, type: type ?? '', nom: l.nom(o, base), rang, orbite, heure, taille, aspect: l.aspect(o, base, type), fiche: l.fiche(o, base) };
}

function lireLune(l: Lecteur, o: unknown, chemin: string, genre: 'lune' | 'comete'): LuneAtlas | null {
  if (!objet(o)) { l.refuser(chemin, chemin, 'Un objet est attendu.'); return null; }
  const base = `${chemin}.`;
  l.inconnues(o, [...COMMUNS, 'description'], base);
  const cle = l.cle(o, base);
  const type = l.type(o, base, genre);
  const orbite = l.orbite(o, base, true);
  const heure = l.heure(o, base, true);
  const taille = l.taille(o, base);
  return {
    cle, type: type ?? '', nom: l.nom(o, base), orbite, heure, taille, aspect: l.aspect(o, base, type),
    fiche: l.fiche(o, base), description: l.description(o, base),
  };
}

function etoileDe(l: Lecteur, o: Obj, base: string, etoiles: Set<string>, principale: string | null): string | null {
  if (!present(o, 'etoile') || o.etoile === null) return principale;
  if (typeof o.etoile !== 'string' || !etoiles.has(o.etoile)) {
    l.refuser(`${base}etoile`, 'etoile', 'Étoile inconnue dans cet atlas.');
    return null;
  }
  return o.etoile;
}

function lunesDe(l: Lecteur, o: Obj, chemin: string): LuneAtlas[] {
  const sortie: LuneAtlas[] = [];
  l.liste(o, 'lunes', MAX_LUNES, `${chemin}.`).forEach((m, j) => {
    const lune = lireLune(l, m, `${chemin}.lunes[${j}]`, 'lune');
    if (lune) sortie.push(lune);
  });
  return sortie;
}

function lireZone(l: Lecteur, o: unknown, i: number): ZoneAtlas | null {
  const base = `zones[${i}].`;
  if (!objet(o)) { l.refuser(`zones[${i}]`, 'zones', 'Une zone est un objet.'); return null; }
  l.inconnues(o, ['cle', 'forme', 'nom', 'parametres', 'fiche', 'description'], base);
  const cle = l.cle(o, base);
  let forme: 'anneau' | 'nuage' | null = null;
  if (o.forme === 'anneau' || o.forme === 'nuage') forme = o.forme;
  else l.refuser(`${base}forme`, 'forme', 'La forme : anneau ou nuage.');
  let parametres: Obj = {};
  if (!objet(o.parametres)) l.refuser(`${base}parametres`, 'parametres', 'Les paramètres : un objet.');
  else if (forme) {
    try {
      parametres = JSON.parse(leCoeur().valider_formation(forme, JSON.stringify(o.parametres))) as Obj;
    } catch (e) {
      l.refuser(`${base}parametres`, 'parametres', e instanceof Error && e.message ? `Valeur refusée : ${e.message}` : 'Valeur refusée.');
    }
  }
  return { cle, forme: forme ?? 'anneau', nom: l.nom(o, base), parametres, fiche: l.fiche(o, base), description: l.description(o, base) };
}

/**
 * Reads the body of an atlas. Either every item, normalised, or the list of every refusal (at most 1 000 kept,
 * `refusTotal` counts them all). Pure: it touches no base and resolves no `fiche`.
 */
export function lireAtlas(corps: unknown): LectureAtlas {
  const l = new Lecteur();
  if (!objet(corps)) {
    l.refuser('corps', 'corps', 'Le corps doit être un objet.');
    return { ok: false, refus: l.refus, refusTotal: l.total };
  }
  l.inconnues(corps, ['transition', 'etoiles', 'corps', 'zones', 'points'], '');

  let transition: number | null | undefined;
  if (present(corps, 'transition')) {
    if (corps.transition === null) transition = null;
    else transition = l.nombre(corps, 'transition', '', (n) => n >= 0, 'La transition : un réel positif ou nul, ou null.', false);
  }

  const rangs = new Map<number, number>();
  const etoiles = l.liste(corps, 'etoiles', MAX_ETOILES, '')
    .map((e, i) => lireEtoile(l, e, i, rangs)).filter((e): e is EtoileAtlas => e !== null);
  const cles = new Set(etoiles.map((e) => e.cle));
  const principale = etoiles.find((e) => e.rang === 0)?.cle ?? null;

  const listeCorps = l.liste(corps, 'corps', MAX_CORPS, '');
  const listePoints = l.liste(corps, 'points', MAX_POINTS, '');
  if ((listeCorps.length > 0 || listePoints.length > 0) && principale === null) {
    l.refuser('etoiles', 'etoiles', 'Une étoile principale (rang 0) est requise quand des corps sont listés.');
  }

  const lesCorps: CorpsAtlas[] = [];
  listeCorps.forEach((c, i) => {
    const chemin = `corps[${i}]`;
    if (!objet(c)) { l.refuser(chemin, 'corps', 'Un corps est un objet.'); return; }
    const base = `${chemin}.`;
    l.inconnues(c, [...COMMUNS, 'description', 'etoile', 'lunes'], base);
    const cle = l.cle(c, base);
    const type = l.type(c, base, 'planete');
    const orbite = l.orbite(c, base, true);
    const heure = l.heure(c, base, true);
    const taille = l.taille(c, base);
    lesCorps.push({
      cle, type: type ?? '', nom: l.nom(c, base), orbite, heure, taille, aspect: l.aspect(c, base, type),
      fiche: l.fiche(c, base), description: l.description(c, base),
      etoile: etoileDe(l, c, base, cles, principale), lunes: lunesDe(l, c, chemin),
    });
  });

  const points = listePoints
    .map((p, i) => lireLune(l, p, `points[${i}]`, 'comete')).filter((p): p is PointAtlas => p !== null);
  const zones = l.liste(corps, 'zones', MAX_ZONES_ATLAS, '')
    .map((z, i) => lireZone(l, z, i)).filter((z): z is ZoneAtlas => z !== null);

  if (l.total > 0) return { ok: false, refus: l.refus, refusTotal: l.total };
  const atlas: Atlas = { etoiles, corps: lesCorps, zones, points };
  if (transition !== undefined) atlas.transition = transition;
  return { ok: true, atlas };
}
