// Reading of the atlas of a system (AD-atlas-2, AD-atlas-3): a pure function, no database, no write. It checks the
// shape and the bounds of the JSON body, collects EVERY refusal with its path, and returns the normalised items.
// What a type, an aspect or a formation may carry is decided by the Rust core (AD-140): nothing of its bounds is
// copied here. The resolution of `fiche` (a sheet's `cle_origine`) is the application's (`appliquerAtlas`, below), which
// writes through the functions of `ecriture-systeme.ts` only (AD-edition-1): no `INSERT` / `UPDATE` of the system's tables here.
import type { Db } from '../../db/db.js';
import { peutVoirFiche, roleDe } from '../droits.js';
import { ErreurService } from '../erreurs.js';
import type { Acteur } from '../types.js';
import { apresEcriture, sansSignal } from './ecriture-carte.js';
import {
  ajouterAstre, ajouterEtoile, ajouterZone, DESCRIPTION_MAX, leCoeur, lierAstre, lierZone, modifierAstre, modifierZone, NOM_MAX,
  ORBITE_MAX, poserTransition, TAILLE_MAX,
} from './ecriture-systeme.js';
import { exigerEcritureGalaxie } from './galaxies.js';
import { HORS_SYNCHRO } from './import-galaxie.js';

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

// ---------------------------------------------------------------------------------------------------------------
// Application (AD-atlas-3): all or nothing, idempotent, never overwriting.

export type NatureAtlas = 'systemes' | 'etoiles' | 'corps' | 'points' | 'formations';
export const NATURES_ATLAS: NatureAtlas[] = ['systemes', 'etoiles', 'corps', 'points', 'formations'];
export interface CompteursAtlas { creees: number; mises_a_jour: number; inchangees: number; refusees: number }
export interface RefusApplique extends RefusAtlas { nature: NatureAtlas; code?: string }
export interface RapportAtlas {
  appliquee: boolean;
  natures: Record<NatureAtlas, CompteursAtlas>;
  refus: RefusApplique[];
  refusTotal: number;
}

const vide = (): Record<NatureAtlas, CompteursAtlas> => Object.fromEntries(
  NATURES_ATLAS.map((n) => [n, { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 }])) as Record<NatureAtlas, CompteursAtlas>;

/** The nature a refusal path counts under. */
function natureDe(chemin: string): NatureAtlas {
  if (chemin.startsWith('etoiles')) return 'etoiles';
  if (chemin.startsWith('corps')) return 'corps';
  if (chemin.startsWith('points')) return 'points';
  if (chemin.startsWith('zones')) return 'formations';
  return 'systemes';
}

function rapportRefuse(refus: RefusAtlas[], total: number, codes: Record<string, string> = {}): RapportAtlas {
  const natures = vide();
  const liste: RefusApplique[] = refus.map((r) => ({ ...r, nature: natureDe(r.chemin), ...(codes[r.chemin] ? { code: codes[r.chemin] } : {}) }));
  for (const r of liste) natures[r.nature].refusees++;
  // Refusals past the cap are only counted, under the nature of the request as a whole.
  natures.systemes.refusees += Math.max(0, total - liste.length);
  return { appliquee: false, natures, refus: liste, refusTotal: total };
}

interface LigneAstreAtlas {
  id: number; cle: string; genre: string; parent_id: number | null; etoile_rang: number; type: string; nom: string | null;
  description: string | null; orbite: number | null; heure: number; taille: number; aspect: string; fiche_id: number | null;
  version: number; version_importee: number | null;
}
interface LigneFormationAtlas {
  id: number; cle: string; forme: string; nom: string | null; description: string | null; parametres: string;
  fiche_id: number | null; version: number; version_importee: number | null;
}
interface LigneSystemeAtlas { id: number; q: number; r: number; transition: number | null; version: number; version_importee: number | null }

/** Thrown inside the transaction to undo the whole request once the refusals are collected. */
class Annulation extends Error {}

const json = (v: unknown): string => JSON.stringify(v);
const memeJson = (stocke: string, v: unknown): boolean => json(JSON.parse(stocke)) === json(v);

/**
 * Applies the atlas of the system `cleSysteme` of a galaxy, as the token's account, in one transaction: either every
 * item is written (or recognised unchanged) or nothing is, and the report names every refusal. Unknown galaxy:
 * `introuvable`; unknown system: refused `systeme_inconnu` in the report (200, `appliquee: false`).
 */
export function appliquerAtlas(db: Db, acteur: Acteur, universId: number, galaxieId: number, cleSysteme: string,
  corps: unknown): RapportAtlas {
  const g = exigerEcritureGalaxie(db, acteur, universId, galaxieId);
  const depart = db.prepare('SELECT id FROM swn_systemes WHERE galaxie_id = ? AND cle = ?').get(g.id, cleSysteme) as { id: number } | undefined;
  if (!depart) {
    return rapportRefuse([{ chemin: 'systeme', champ: 'systeme', raison: 'Système inconnu.' }], 1, { systeme: 'systeme_inconnu' });
  }
  const lecture = lireAtlas(corps);
  if (!lecture.ok) return rapportRefuse(lecture.refus, lecture.refusTotal);
  const atlas = lecture.atlas;

  // The sheets: the `cle_origine` of a sheet already imported, readable by the token's account.
  const role = roleDe(db, universId, acteur.compteId);
  const fiches = new Map<string, number | null>();
  const fichesRefus: RefusAtlas[] = [];
  const resoudre = (cle: string | null, chemin: string): number | null => {
    if (cle === null) return null;
    if (!fiches.has(cle)) {
      const ligne = db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle_origine = ?').get(universId, cle) as { id: number } | undefined;
      fiches.set(cle, ligne && role !== null && peutVoirFiche(db, role, ligne.id, acteur) ? ligne.id : null);
    }
    const id = fiches.get(cle)!;
    if (id === null) fichesRefus.push({ chemin: `${chemin}.fiche`, champ: 'fiche', raison: 'Fiche inconnue.' });
    return id;
  };

  interface Element { chemin: string; ficheId: number | null }
  const ficheDe = (chemin: string, cle: string | null): Element => ({ chemin, ficheId: resoudre(cle, chemin) });
  const etoiles = atlas.etoiles.map((e, i) => ({ e, ...ficheDe(`etoiles[${i}]`, e.fiche) }));
  const lesCorps = atlas.corps.map((c, i) => ({
    c, ...ficheDe(`corps[${i}]`, c.fiche),
    lunes: c.lunes.map((l, j) => ({ l, ...ficheDe(`corps[${i}].lunes[${j}]`, l.fiche) })),
  }));
  const points = atlas.points.map((p, i) => ({ p, ...ficheDe(`points[${i}]`, p.fiche) }));
  const zones = atlas.zones.map((z, i) => ({ z, ...ficheDe(`zones[${i}]`, z.fiche) }));
  if (fichesRefus.length > 0) return rapportRefuse(fichesRefus, fichesRefus.length);

  const natures = vide();
  const refus: RefusApplique[] = [];
  let refusTotal = 0;
  const refuser = (nature: NatureAtlas, chemin: string, champ: string, raison: string, code?: string): void => {
    natures[nature].refusees++;
    refusTotal++;
    if (refus.length < MAX_REFUS_ATLAS) refus.push({ nature, chemin, champ, raison, ...(code ? { code } : {}) });
  };
  const sys = (): LigneSystemeAtlas => db.prepare('SELECT id, q, r, transition, version, version_importee FROM swn_systemes WHERE id = ?').get(depart.id) as LigneSystemeAtlas;
  const { q, r } = sys();
  const astre = (cle: string) => db.prepare('SELECT * FROM swn_astres WHERE systeme_id = ? AND cle = ?').get(depart.id, cle) as LigneAstreAtlas | undefined;
  const formation = (cle: string) => db.prepare('SELECT * FROM swn_formations WHERE systeme_id = ? AND cle = ?').get(depart.id, cle) as LigneFormationAtlas | undefined;
  const horsSynchro = (l: { version: number; version_importee: number | null }) => l.version !== l.version_importee;

  /** One item in its own savepoint; a service refusal is a refusal of the request, collected and reported by path. */
  const item = (nature: NatureAtlas, chemin: string, corpsItem: () => keyof CompteursAtlas | { refus: string; champ: string; code?: string }): boolean => {
    try {
      const issue = db.transaction(corpsItem)();
      if (typeof issue === 'string') { natures[nature][issue]++; return true; }
      refuser(nature, chemin, issue.champ, issue.refus, issue.code);
      return false;
    } catch (e) {
      if (!(e instanceof ErreurService) || (e.code !== 'invalide' && e.code !== 'conflit' && e.code !== 'introuvable')) throw e;
      refuser(nature, chemin, e.champ ?? nature, e.message, e.detail);
      return false;
    }
  };
  const refusSynchro = (champ: string) => ({ refus: HORS_SYNCHRO, champ, code: 'hors_synchro' });

  /** A body (star, planet, moon, comet): creates, leaves alone, updates, or reports. */
  const poserAstre = (nature: NatureAtlas, chemin: string, genre: string, cle: string, rang: number, parentCle: string | null,
    voulu: { type: string; nom: string | null; orbite: number; heure: number; taille: number; aspect: Record<string, unknown> | null; description?: string | null },
    ficheId: number | null): boolean => item(nature, chemin, () => {
    const ligne = astre(cle);
    if (!ligne) {
      const commun = { cle, importee: true, type: voulu.type, nom: voulu.nom, taille: voulu.taille, orbite: voulu.orbite, heure: voulu.heure,
        ...(voulu.aspect ? { aspect: voulu.aspect } : {}) };
      if (genre === 'etoile') ajouterEtoile(db, acteur, universId, g.id, q, r, { ...commun, etoile_rang: rang });
      else {
        ajouterAstre(db, acteur, universId, g.id, q, r, {
          ...commun, genre, description: voulu.description, etoile_rang: rang, ...(parentCle ? { parent_cle: parentCle } : {}),
        });
      }
      if (ficheId !== null) lierAstre(db, acteur, universId, g.id, q, r, cle, { ficheId, version: 1, importee: true });
      return 'creees';
    }
    if (ligne.genre !== genre) return { refus: 'Cette clé désigne déjà un autre genre de corps.', champ: 'cle' };
    if (ligne.etoile_rang !== rang) return { refus: genre === 'etoile' ? 'Le rang ne change pas.' : "L'étoile ne change pas.", champ: genre === 'etoile' ? 'rang' : 'etoile' };
    if (parentCle !== null) {
      const parent = db.prepare('SELECT cle FROM swn_astres WHERE id = ?').get(ligne.parent_id) as { cle: string } | undefined;
      if (parent?.cle !== parentCle) return { refus: 'La planète ne change pas.', champ: 'cle' };
    }
    // An absent optional field (null) says nothing: what Kanevas holds stays (nothing is ever cleared by the import).
    const champs: Record<string, unknown> = {};
    if (ligne.type !== voulu.type) champs.type = voulu.type;
    if (voulu.nom !== null && ligne.nom !== voulu.nom) champs.nom = voulu.nom;
    if (ligne.orbite !== voulu.orbite && !(genre === 'etoile' && ligne.orbite === null && voulu.orbite === 0)) champs.orbite = voulu.orbite;
    if (ligne.heure !== voulu.heure) champs.heure = voulu.heure;
    if (ligne.taille !== voulu.taille) champs.taille = voulu.taille;
    if (voulu.aspect !== null && !memeJson(ligne.aspect, voulu.aspect)) champs.aspect = voulu.aspect;
    if (genre !== 'etoile' && voulu.description != null && ligne.description !== voulu.description) champs.description = voulu.description;
    const lier = ficheId !== null && ligne.fiche_id !== ficheId;
    if (Object.keys(champs).length === 0 && !lier) return 'inchangees';
    if (horsSynchro(ligne)) return refusSynchro(Object.keys(champs)[0] ?? 'fiche');
    let version = ligne.version;
    if (Object.keys(champs).length > 0) {
      modifierAstre(db, acteur, universId, g.id, q, r, cle, { ...champs, version, importee: true });
      version = astre(cle)!.version;
    }
    if (lier) lierAstre(db, acteur, universId, g.id, q, r, cle, { ficheId, version, importee: true });
    return 'mises_a_jour';
  });

  const poserZone = (chemin: string, z: ZoneAtlas, ficheId: number | null): void => {
    item('formations', chemin, () => {
      const ligne = formation(z.cle);
      if (!ligne) {
        ajouterZone(db, acteur, universId, g.id, q, r, {
          cle: z.cle, importee: true, forme: z.forme, nom: z.nom, description: z.description, parametres: z.parametres,
        });
        if (ficheId !== null) lierZone(db, acteur, universId, g.id, q, r, z.cle, { ficheId, version: 1, importee: true });
        return 'creees';
      }
      if (ligne.forme !== z.forme) return { refus: 'La forme ne change pas.', champ: 'forme' };
      const champs: Record<string, unknown> = {};
      if (z.nom !== null && ligne.nom !== z.nom) champs.nom = z.nom;
      if (z.description !== null && ligne.description !== z.description) champs.description = z.description;
      if (!memeJson(ligne.parametres, z.parametres)) champs.parametres = z.parametres;
      const lier = ficheId !== null && ligne.fiche_id !== ficheId;
      if (Object.keys(champs).length === 0 && !lier) return 'inchangees';
      if (horsSynchro(ligne)) return refusSynchro(Object.keys(champs)[0] ?? 'fiche');
      let version = ligne.version;
      if (Object.keys(champs).length > 0) {
        modifierZone(db, acteur, universId, g.id, q, r, z.cle, { ...champs, version, importee: true });
        version = formation(z.cle)!.version;
      }
      if (lier) lierZone(db, acteur, universId, g.id, q, r, z.cle, { ficheId, version, importee: true });
      return 'mises_a_jour';
    });
  };

  let modifie = false;
  try {
    const { modifie: signal } = sansSignal(() => db.transaction(() => {
      // The transition (the `systemes` nature counts nothing else).
      if (atlas.transition !== undefined) {
        item('systemes', 'transition', () => {
          const s = sys();
          if (s.transition === atlas.transition) return 'inchangees';
          if (horsSynchro(s)) return refusSynchro('transition');
          poserTransition(db, acteur, universId, g.id, q, r, { transition: atlas.transition, versionSysteme: s.version, importee: true });
          return 'mises_a_jour';
        });
      }
      for (const { e, chemin, ficheId } of etoiles) {
        poserAstre('etoiles', chemin, 'etoile', e.cle, e.rang, null, e, ficheId);
      }
      const rangDe = (cle: string | null): number => atlas.etoiles.find((e) => e.cle === cle)?.rang ?? 0;
      for (const { c, chemin, ficheId } of lesCorps) {
        poserAstre('corps', chemin, 'planete', c.cle, rangDe(c.etoile), null, c, ficheId);
      }
      for (const { c, lunes } of lesCorps) {
        // A moon whose planet was refused is not tried: the planet's refusal already names the request.
        if (!astre(c.cle)) continue;
        for (const { l, chemin, ficheId } of lunes) poserAstre('corps', chemin, 'lune', l.cle, rangDe(c.etoile), c.cle, l, ficheId);
      }
      for (const { p, chemin, ficheId } of points) poserAstre('points', chemin, 'comete', p.cle, 0, null, p, ficheId);
      for (const { z, chemin, ficheId } of zones) poserZone(chemin, z, ficheId);
      if (refusTotal > 0) throw new Annulation();
    }).immediate());
    modifie = signal;
  } catch (e) {
    if (!(e instanceof Annulation)) throw e;
    // Nothing was written: only the refusals count.
    const refusees = Object.fromEntries(NATURES_ATLAS.map((n) => [n, natures[n].refusees]));
    const rien = vide();
    for (const n of NATURES_ATLAS) rien[n].refusees = refusees[n]!;
    return { appliquee: false, natures: rien, refus, refusTotal };
  }
  // The document's recalculation proposal, once for the request (T-7, AD-atlas-3).
  if (modifie) apresEcriture(db, acteur.compteId, universId);
  return { appliquee: true, natures, refus, refusTotal };
}
