// The one writer of the interior of a system (AD-edition-1): the only file allowed to `INSERT INTO`, `UPDATE` or
// `DELETE FROM` `swn_astres` and `swn_formations` (a source-scan test fails otherwise). Each function opens one
// `BEGIN IMMEDIATE` transaction: guard, anchoring of a drawn system, gesture, `apresEcriture`. A refusal rolls
// everything back, anchoring included. The core decides what a body or a zone may carry (AD-140): this file only
// converts the three coordinate systems to `(orbite, heure)` and validates through it.
import type { Db } from '../../db/db.js';
import { cleDe } from '../../outils/swn/regles/cle.js';
import { chargerModule } from '../../wasm/charger.js';
import { randomBytes } from 'node:crypto';
import { ErreurService, introuvable } from '../erreurs.js';
import type { Acteur } from '../types.js';
import { apresEcriture, placerSysteme, sansSignal } from './ecriture-carte.js';
import { exigerEcritureGalaxie, type LigneGalaxie, type LigneSysteme } from './galaxies.js';
import { estMasque } from './lisibilite.js';
import { lireInterieur, lireTire, type AstreVue, type FormationVue, type InterieurVue } from './interieur.js';

interface Coeur {
  plan_vers_orbite_heure(x: number, y: number): Float64Array;
  galactique_vers_orbite_heure(dq: number, dr: number, rayon: number): Float64Array;
  types_astre(genre: string): string;
  valider_aspect(type: string, json: string): string;
  valider_formation(forme: string, json: string): string;
  catalogue_aspects(): string;
}

// Loaded once at import so that the writer stays synchronous; a failed load makes every write throw the generic error.
let coeur: Coeur | undefined;
try {
  coeur = await chargerModule<Coeur>('coeur');
} catch {
  coeur = undefined;
}
function leCoeur(): Coeur {
  if (!coeur) throw new Error('Wasm module "coeur" is missing or unreadable.');
  return coeur;
}

const ORBITE_MAX = 1000;
const NOM_MAX = 80;
const DESCRIPTION_MAX = 2000;
const TAILLE_MAX = 100;
const CODE_ORBITE = 'orbite_invalide';

const invalide = (champ: string, message: string, detail?: string) => new ErreurService('invalide', message, detail, champ);
const aChange = () => new ErreurService('conflit', "Cet astre a changé depuis que vous l'avez ouvert.", 'a_change');
const astreInconnu = () => new ErreurService('introuvable', 'Astre introuvable.', 'astre_inconnu');
const acteurDe = (a: Acteur | number): Acteur => (typeof a === 'number' ? { compteId: a } : a);
const objet = (v: unknown): Record<string, unknown> =>
  (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const present = (c: Record<string, unknown>, k: string): boolean => Object.hasOwn(c, k) && c[k] !== undefined;
const arrondi2 = (v: number): number => Math.floor(v * 100 + 0.5) / 100;

// ---------------------------------------------------------------------------------------------------------------
// Fields

function nombreFini(champ: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw invalide(champ, `${champ} : un nombre.`);
  return v;
}
function versionValide(champ: string, v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 1) throw invalide(champ, 'Version invalide.');
  return v as number;
}
/** null or 1 to 80 characters once trimmed; an empty string is « no name ». */
function nomValide(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw invalide('nom', 'Le nom : de 1 à 80 caractères.');
  const n = v.trim();
  if (n.length > NOM_MAX) throw invalide('nom', 'Le nom : de 1 à 80 caractères.');
  return n === '' ? null : n;
}
function descriptionValide(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== 'string' || v.length > DESCRIPTION_MAX) throw invalide('description', 'La description : 2 000 caractères au plus.');
  return v === '' ? null : v;
}
function tailleValide(v: unknown): number {
  const t = nombreFini('taille', v);
  if (t <= 0 || t > TAILLE_MAX) throw invalide('taille', 'La taille : plus que 0 et 100 au plus.');
  return t;
}
function rangValide(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 0) throw invalide('etoile_rang', 'Le rang de l\'étoile : un entier positif ou nul.');
  return v as number;
}
function orbiteValide(v: unknown): number {
  const o = nombreFini('orbite', v);
  if (o < 0 || o > ORBITE_MAX) throw invalide('orbite', "L'orbite : de 0 à 1 000.", CODE_ORBITE);
  return o;
}
function heureValide(v: unknown): number {
  const h = nombreFini('heure', v);
  if (h < 0 || h >= 12) throw invalide('heure', "L'heure : de 0 incluse à 12 exclue.", CODE_ORBITE);
  return h;
}

/** The core's refusal, turned into `invalide` with the field; its message names no content. */
function parLeCoeur<T>(champ: string, appel: () => T): T {
  try {
    return appel();
  } catch (e) {
    throw invalide(champ, e instanceof Error && e.message ? `Valeur refusée : ${e.message}` : 'Valeur refusée.');
  }
}

function typesDe(genre: string): string[] {
  return JSON.parse(leCoeur().types_astre(genre)) as string[];
}
function typeValide(genre: string, v: unknown): string {
  if (typeof v !== 'string' || !typesDe(genre).includes(v)) throw invalide('type', 'Type inconnu pour ce genre.');
  return v;
}
/** The default aspect of a type: its entry of the core's catalogue. */
function aspectParDefaut(type: string): string {
  const cat = JSON.parse(leCoeur().catalogue_aspects()) as { types: Record<string, unknown> };
  return JSON.stringify(cat.types[type] ?? {});
}
function aspectValide(type: string, v: unknown): string {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw invalide('aspect', "L'aspect : un objet.");
  return parLeCoeur('aspect', () => leCoeur().valider_aspect(type, JSON.stringify(v)));
}
function parametresValides(forme: string, v: unknown): string {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw invalide('parametres', 'Les paramètres : un objet.');
  return parLeCoeur('parametres', () => leCoeur().valider_formation(forme, JSON.stringify(v)));
}

// ---------------------------------------------------------------------------------------------------------------
// Places: three coordinate systems in, one stored (AD-edition-4)

interface Repere { q0: number; r0: number; rayon: number }
/** What the call gave of the place: the stored values it sets (`orbite` and `heure` independently for the first form). */
interface Place { orbite?: number; heure?: number }

function paire(champ: string, v: unknown, a: string, b: string): [number, number] {
  const o = objet(v);
  if (!present(o, a) || !present(o, b) || Object.keys(o).length !== 2) throw invalide(champ, `${champ} : les deux valeurs ${a} et ${b}.`);
  return [nombreFini(`${champ}.${a}`, o[a]), nombreFini(`${champ}.${b}`, o[b])];
}
/** The point `(orbite, heure)` of the converted result, validated as if it had been typed. */
function resultat(o: number, h: number): Place {
  const heure = arrondi2(h) >= 12 ? 0 : arrondi2(h);
  return { orbite: orbiteValide(arrondi2(o)), heure: heureValide(heure) };
}

/** Exactly one form among `orbite` / `heure`, `plan: {x, y}` and `galactique: {q, r}`; a moon takes the first only. */
function lirePlace(c: Record<string, unknown>, lune: boolean, repere: () => Repere): Place {
  const formes = [present(c, 'plan'), present(c, 'galactique'), present(c, 'orbite') || present(c, 'heure')];
  if (formes.filter(Boolean).length > 1) throw invalide('plan', 'Une seule forme de position : orbite et heure, plan ou hexagone.');
  if (lune && (formes[0] || formes[1])) {
    throw invalide(formes[0] ? 'plan' : 'galactique', 'Une lune se place par orbite et heure seules.');
  }
  if (formes[0]) {
    const [x, y] = paire('plan', c.plan, 'x', 'y');
    const [o, h] = leCoeur().plan_vers_orbite_heure(x, y);
    return resultat(o!, h!);
  }
  if (formes[1]) {
    const [q, r] = paire('galactique', c.galactique, 'q', 'r');
    const p = repere();
    const [o, h] = parLeCoeur('galactique', () => leCoeur().galactique_vers_orbite_heure(q - p.q0, r - p.r0, p.rayon));
    return resultat(o!, h!);
  }
  const place: Place = {};
  if (present(c, 'orbite')) place.orbite = orbiteValide(c.orbite);
  if (present(c, 'heure')) place.heure = heureValide(c.heure);
  return place;
}

// ---------------------------------------------------------------------------------------------------------------
// Anchoring and the common frame

interface LigneAstre {
  id: number; systeme_id: number; cle: string; genre: AstreVue['genre']; parent_id: number | null; etoile_rang: number;
  type: string; nom: string | null; description: string | null; orbite: number | null; heure: number; taille: number;
  aspect: string; version: number;
}
interface LigneFormation {
  id: number; systeme_id: number; cle: string; forme: FormationVue['forme']; etoile_rang: number; nom: string | null;
  description: string | null; parametres: string; version: number;
}

/** The token of the system a write was composed on: see AD-edition-2. */
export interface JetonSysteme { versionSysteme?: unknown }

const systemeDe = (db: Db, g: LigneGalaxie, q: number, r: number): LigneSysteme | undefined =>
  db.prepare('SELECT * FROM swn_systemes WHERE galaxie_id = ? AND q = ? AND r = ?').get(g.id, q, r) as LigneSysteme | undefined;

/** Colour of a system from the class letter of its star (the six names of the palette) and size from its size. */
const COULEUR_LETTRE: Record<string, string> = { M: 'danger', K: 'ambre', G: 'ambre', F: 'clair', A: 'clair', B: 'accent' };
const tailleSysteme = (t: number): number => (t < 1.0 ? 1 : t < 1.6 ? 2 : 3);

/**
 * Anchors the drawn system of `(q, r)`: the `swn_systemes` row (E-21's promotion, `placerSysteme`) and the drawn
 * bodies and zones exactly as the core returned them (same `cle`, same values, `version` 1), so the neighbours'
 * draw does not move (AD-138). The token must be the galaxy's `version` at reading, else `a_change`.
 */
function ancrerTire(db: Db, ac: Acteur, universId: number, g: LigneGalaxie, q: number, r: number,
  jeton: unknown, nom: string | null, inconnu: () => ErreurService = introuvable): LigneSysteme {
  const tire = lireTire(db, g, 'mj', q, r);
  if (!tire) throw inconnu();
  if (jeton === undefined || jeton === null) throw invalide('versionSysteme', 'Version du système requise.');
  if (versionValide('versionSysteme', jeton) !== g.version) throw aChange();
  // One signal per call, sent by the caller after the gesture (`sansSignal` holds back the one of `placerSysteme`).
  const { valeur } = sansSignal(() => placerSysteme(db, ac, universId, g.id, {
    nom: nom ?? `Système (${q}, ${r})`, q, r,
    taille: tailleSysteme(tire.etoile.taille), couleur: COULEUR_LETTRE[tire.etoile.lettre] ?? 'accent',
  }));
  const ids = new Map<string, number>();
  const insererAstre = db.prepare(`INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  // Planets and stars first: a moon's `parent_id` needs its planet's row.
  for (const a of [...tire.astres.filter((x) => x.genre !== 'lune'), ...tire.astres.filter((x) => x.genre === 'lune')]) {
    const parent = a.parent_cle === null ? null : ids.get(a.parent_cle);
    if (a.parent_cle !== null && parent === undefined) throw new Error('Drawn moon without its planet.');
    ids.set(a.cle, Number(insererAstre.run(valeur.id, a.cle, a.genre, parent ?? null, a.etoile_rang, a.type, a.nom,
      a.orbite, a.heure, a.taille, JSON.stringify(a.aspect)).lastInsertRowid));
  }
  const insererFormation = db.prepare(`INSERT INTO swn_formations (systeme_id, cle, forme, etoile_rang, nom, parametres) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const f of tire.formations) insererFormation.run(valeur.id, f.cle, f.forme, f.etoile_rang, f.nom, JSON.stringify(f.parametres));
  return systemeDe(db, g, q, r)!;
}

export interface ResultatEcriture {
  /** The system as `lireInterieur` renders it now, for the GM who wrote. */
  interieur: InterieurVue;
  /** The `cle` of the body or zone the call created, changed or removed. */
  cle?: string;
  /** `retirerAstre`: the moons that went with their planet (what the dialog counted before writing). */
  lunesRetirees?: number;
  /** `retirerAstre`: bodies removed in all (the body and its moons). */
  retires?: number;
}

interface Contexte {
  db: Db; ac: Acteur; universId: number; g: LigneGalaxie; systeme: LigneSysteme; q: number; r: number;
  /** True when this call anchored the system (its token was already checked against the galaxy's `version`). */
  ancre: boolean;
}

/**
 * The guard of every write. A caller who may not write gets what the read would answer first: a hidden system is
 * `introuvable`, the same body as `lireInterieur`; an ordinary hexagon stays `refuse`.
 */
function garde(db: Db, ac: Acteur, universId: number, galaxieId: number, q: unknown, r: unknown): LigneGalaxie {
  try {
    return exigerEcritureGalaxie(db, ac, universId, galaxieId);
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'refuse') {
      try { lireInterieur(db, ac, universId, galaxieId, q as number, r as number); } catch (lecture) {
        if (lecture instanceof ErreurService && lecture.code === 'introuvable') throw lecture;
      }
    }
    throw e;
  }
}

/** The frame of every write: one immediate transaction, the guard, the anchoring if drawn, the gesture, the signal. */
function ecrire(
  db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: unknown, r: unknown,
  jeton: unknown, nomAncrage: string | null, geste: (c: Contexte) => Omit<ResultatEcriture, 'interieur'> & { ecrit?: false },
  /** What an hexagon with neither row nor drawn star answers once the caller may write (default: the plain `introuvable`). */
  inconnu?: () => ErreurService,
): ResultatEcriture {
  const ac = acteurDe(acteur);
  return db.transaction((): ResultatEcriture => {
    const g = garde(db, ac, universId, galaxieId, q, r);
    if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) throw introuvable();
    const qq = q as number, rr = r as number;
    let systeme = systemeDe(db, g, qq, rr);
    let ancre = false;
    if (!systeme) {
      systeme = ancrerTire(db, ac, universId, g, qq, rr, jeton, nomAncrage, inconnu);
      ancre = true;
    }
    const { ecrit, ...sortie } = geste({ db, ac, universId, g, systeme, q: qq, r: rr, ancre });
    if (ancre || ecrit !== false) apresEcriture(db, ac.compteId, universId);
    return { ...sortie, interieur: lireInterieur(db, ac, universId, galaxieId, qq, rr) };
  }).immediate();
}

/**
 * A key never reused (AD-edition-3): the slug of the name and a random suffix. Nothing is stored to remember the
 * removed keys (no migration), so the suffix is what keeps a removed `mere` from coming back.
 */
function cleNeuve(nom: string, existantes: readonly string[]): string {
  const base = cleDe(nom, []);
  for (;;) {
    const cle = `${base}-${randomBytes(3).toString('hex')}`;
    if (!existantes.includes(cle)) return cle;
  }
}

const jetonDe = (entree: unknown): unknown => objet(entree).versionSysteme;
/** The name the anchoring dialog typed, carried by the first write of a drawn system (`nomAncrage`; `ancrer` reads `nom`). */
const nomAncrageDe = (entree: unknown): string | null => {
  const e = objet(entree);
  if (!present(e, 'nomAncrage')) return null;
  try { return nomValide(e.nomAncrage); } catch { throw invalide('nomAncrage', 'Le nom : de 1 à 80 caractères.'); }
};

const astreDe = (c: Contexte, cle: unknown): LigneAstre => {
  const a = typeof cle === 'string'
    ? c.db.prepare('SELECT * FROM swn_astres WHERE systeme_id = ? AND cle = ?').get(c.systeme.id, cle) as LigneAstre | undefined
    : undefined;
  if (!a) throw astreInconnu();
  return a;
};
const formationDe = (c: Contexte, cle: unknown): LigneFormation => {
  const f = typeof cle === 'string'
    ? c.db.prepare('SELECT * FROM swn_formations WHERE systeme_id = ? AND cle = ?').get(c.systeme.id, cle) as LigneFormation | undefined
    : undefined;
  if (!f) throw astreInconnu();
  return f;
};
const etoileExiste = (c: Contexte, rang: number): boolean =>
  !!c.db.prepare("SELECT 1 FROM swn_astres WHERE systeme_id = ? AND genre = 'etoile' AND etoile_rang = ?").get(c.systeme.id, rang);

/** The transition circle of the system, where the hexagon form puts the neighbours (AD-edition-4). */
function repereDe(c: Contexte): Repere {
  const vue = lireInterieur(c.db, c.ac, c.universId, c.g.id, c.q, c.r);
  return { q0: c.q, r0: c.r, rayon: vue.transition };
}

// ---------------------------------------------------------------------------------------------------------------
// The gestures

/** « Ancrer » alone: step 2 and nothing else. On a defined system it answers it unchanged. */
export function ancrer(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  entree: JetonSysteme & { nom?: unknown } = {}): ResultatEcriture {
  const nom = present(objet(entree), 'nom') ? nomValide(objet(entree).nom) : null;
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(entree), nom, () => ({ ecrit: false }));
}

const DEFAUT_TAILLE: Record<string, number> = { planete: 0.105, lune: 0.05, comete: 0.05 };
const DEFAUT_TYPE: Record<string, string> = { planete: 'tellurique', lune: 'rocheux', comete: 'comete' };
const GENRES_AJOUT = ['planete', 'lune', 'comete'];

export interface AstreEntree extends JetonSysteme {
  genre?: unknown; nom?: unknown; description?: unknown; type?: unknown; taille?: unknown; aspect?: unknown;
  etoile_rang?: unknown; parent_cle?: unknown; orbite?: unknown; heure?: unknown; plan?: unknown; galactique?: unknown;
}

export function ajouterAstre(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  entree: AstreEntree): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const genre = e.genre;
    if (typeof genre !== 'string' || !GENRES_AJOUT.includes(genre)) {
      throw invalide('genre', 'Le genre : planète, lune ou comète (une étoile ne s\'ajoute pas).');
    }
    const nom = present(e, 'nom') ? nomValide(e.nom) : null;
    const description = present(e, 'description') ? descriptionValide(e.description) : null;
    const type = present(e, 'type') ? typeValide(genre, e.type) : (typesDe(genre).includes(DEFAUT_TYPE[genre]!) ? DEFAUT_TYPE[genre]! : typesDe(genre)[0]!);
    const taille = present(e, 'taille') ? tailleValide(e.taille) : DEFAUT_TAILLE[genre]!;
    const aspect = present(e, 'aspect') ? aspectValide(type, e.aspect) : aspectParDefaut(type);
    let parentId: number | null = null;
    let rang = present(e, 'etoile_rang') ? rangValide(e.etoile_rang) : 0;
    if (genre === 'lune') {
      const parent = typeof e.parent_cle === 'string'
        ? c.db.prepare("SELECT id, etoile_rang FROM swn_astres WHERE systeme_id = ? AND cle = ? AND genre = 'planete'")
          .get(c.systeme.id, e.parent_cle) as { id: number; etoile_rang: number } | undefined
        : undefined;
      if (!parent) throw astreInconnu();
      parentId = parent.id;
      rang = parent.etoile_rang;
    } else {
      if (present(e, 'parent_cle') && e.parent_cle !== null) throw invalide('parent_cle', 'Seule une lune a une planète.');
      if (!etoileExiste(c, rang)) throw astreInconnu();
    }
    const place = lirePlace(e, genre === 'lune', () => repereDe(c));
    const orbite = place.orbite ?? 1, heure = place.heure ?? 0;
    const existantes = (c.db.prepare('SELECT cle FROM swn_astres WHERE systeme_id = ?').all(c.systeme.id) as { cle: string }[]).map((x) => x.cle);
    const cle = cleNeuve(nom ?? genre, existantes);
    c.db.prepare(`INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, description, orbite, heure, taille, aspect)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.systeme.id, cle, genre, parentId, rang, type, nom, description, orbite, heure, taille, aspect);
    return { cle };
  });
}

export interface AstreModification extends AstreEntree { version?: unknown }

/** « Déplacer » is this function with `orbite` / `heure` (or `plan`, `galactique`) alone. */
export function modifierAstre(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: AstreModification): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const a = astreDe(c, cle);
    if (versionValide('version', e.version) !== a.version) throw aChange();
    for (const k of ['genre', 'parent_cle', 'etoile_rang']) if (present(e, k)) throw invalide(k, 'Ce champ ne change pas.');
    const sets: string[] = [], vals: unknown[] = [];
    const poser = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
    if (present(e, 'nom')) poser('nom', nomValide(e.nom));
    if (present(e, 'description')) poser('description', descriptionValide(e.description));
    let type = a.type;
    if (present(e, 'type')) {
      type = typeValide(a.genre, e.type);
      if (type !== a.type) {
        poser('type', type);
        // A new type brings its own aspect unless the call gives one.
        if (!present(e, 'aspect')) poser('aspect', aspectParDefaut(type));
      }
    }
    if (present(e, 'aspect')) poser('aspect', aspectValide(type, e.aspect));
    if (present(e, 'taille')) poser('taille', tailleValide(e.taille));
    const place = lirePlace(e, a.genre === 'lune', () => repereDe(c));
    if (place.orbite !== undefined) poser('orbite', place.orbite);
    if (place.heure !== undefined) poser('heure', place.heure);
    if (sets.length === 0) throw invalide('nom', 'Rien à modifier.');
    c.db.prepare(`UPDATE swn_astres SET ${[...sets, 'version = version + 1'].join(', ')} WHERE id = ?`).run(...vals, a.id);
    return { cle: a.cle };
  });
}

/** Removes a body; a planet's moons go with it (the foreign key's CASCADE) and their number comes back. */
export function retirerAstre(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: JetonSysteme & { version?: unknown }): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const a = astreDe(c, cle);
    if (versionValide('version', e.version) !== a.version) throw aChange();
    if (a.genre === 'etoile') {
      throw new ErreurService('refuse', a.etoile_rang === 0 ? "L'étoile principale ne se retire pas." : 'Une étoile ne se retire pas.',
        a.etoile_rang === 0 ? 'etoile_principale' : 'etoile_compagne');
    }
    const { n } = c.db.prepare('SELECT COUNT(*) AS n FROM swn_astres WHERE parent_id = ?').get(a.id) as { n: number };
    c.db.prepare('DELETE FROM swn_astres WHERE id = ?').run(a.id);
    return { cle: a.cle, lunesRetirees: n, retires: n + 1 };
  });
}

export interface ZoneEntree extends JetonSysteme {
  forme?: unknown; nom?: unknown; description?: unknown; parametres?: unknown; etoile_rang?: unknown;
}

const PARAMETRES_DEFAUT: Record<string, Record<string, unknown>> = {
  anneau: { de: 4, a: 5 },
  nuage: { orbite: 5, heure: 0, centres: [[5, 0, 1]] },
};

export function ajouterZone(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  entree: ZoneEntree): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const forme = e.forme;
    if (forme !== 'anneau' && forme !== 'nuage') throw invalide('forme', 'La forme : anneau ou nuage.');
    const nom = present(e, 'nom') ? nomValide(e.nom) : null;
    const description = present(e, 'description') ? descriptionValide(e.description) : null;
    const rang = present(e, 'etoile_rang') ? rangValide(e.etoile_rang) : 0;
    const parametres = parametresValides(forme, present(e, 'parametres') ? e.parametres : PARAMETRES_DEFAUT[forme]);
    if (!etoileExiste(c, rang)) throw astreInconnu();
    const existantes = (c.db.prepare('SELECT cle FROM swn_formations WHERE systeme_id = ?').all(c.systeme.id) as { cle: string }[]).map((x) => x.cle);
    const cle = cleNeuve(nom ?? forme, existantes);
    c.db.prepare(`INSERT INTO swn_formations (systeme_id, cle, forme, etoile_rang, nom, description, parametres) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(c.systeme.id, cle, forme, rang, nom, description, parametres);
    return { cle };
  });
}

export function modifierZone(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: ZoneEntree & { version?: unknown }): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const f = formationDe(c, cle);
    if (versionValide('version', e.version) !== f.version) throw aChange();
    for (const k of ['etoile_rang']) if (present(e, k)) throw invalide(k, 'Ce champ ne change pas.');
    if (present(e, 'forme') && e.forme !== f.forme) throw invalide('forme', 'La forme ne change pas.');
    const sets: string[] = [], vals: unknown[] = [];
    const poser = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
    if (present(e, 'nom')) poser('nom', nomValide(e.nom));
    if (present(e, 'description')) poser('description', descriptionValide(e.description));
    if (present(e, 'parametres')) poser('parametres', parametresValides(f.forme, e.parametres));
    if (sets.length === 0) throw invalide('nom', 'Rien à modifier.');
    c.db.prepare(`UPDATE swn_formations SET ${[...sets, 'version = version + 1'].join(', ')} WHERE id = ?`).run(...vals, f.id);
    return { cle: f.cle };
  });
}

export function retirerZone(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: JetonSysteme & { version?: unknown }): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const f = formationDe(c, cle);
    if (versionValide('version', e.version) !== f.version) throw aChange();
    c.db.prepare('DELETE FROM swn_formations WHERE id = ?').run(f.id);
    return { cle: f.cle };
  });
}

/**
 * The radius of the transition zone: a number from 0 to 1 000, or null to return to the core's default. The token
 * is the system's (a drawn system: the galaxy's `version` at reading, a defined one: the row's own `version`).
 */
export function poserTransition(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  entree: JetonSysteme & { transition?: unknown }): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    if (!present(e, 'transition')) throw invalide('transition', 'Le rayon : un nombre ou null.');
    let rayon: number | null = null;
    if (e.transition !== null) {
      rayon = nombreFini('transition', e.transition);
      if (rayon < 0 || rayon > ORBITE_MAX) throw invalide('transition', 'Le rayon : entre 0 et 1 000.');
    }
    // A system defined before the call compares the token with its own row; a drawn one was checked by the anchoring.
    if (!c.ancre && versionValide('versionSysteme', jetonDe(e)) !== c.systeme.version) throw aChange();
    c.db.prepare('UPDATE swn_systemes SET transition = ?, version = version + 1 WHERE id = ?').run(rayon, c.systeme.id);
    return {};
  });
}

const systemeInconnu = () => new ErreurService('introuvable', 'Système introuvable.', 'systeme_inconnu');

/**
 * « Secret (MJ seul) » (B-97, AD-masquer-1): hides or shows a whole system. A drawn system is anchored first, in the
 * same transaction and by the same function as every other write (`promu` true, the neighbours' draw unchanged), then
 * flagged; the token is the one of `poserTransition`. An hexagon with no system at all is `systeme_inconnu` (introuvable).
 */
export function masquerSysteme(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  entree: JetonSysteme & { secret?: unknown; nomAncrage?: unknown }): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    if (typeof e.secret !== 'boolean') throw invalide('secret', 'Valeur invalide.');
    // A system defined before the call compares the token with its own row; a drawn one was checked by the anchoring.
    if (!c.ancre && versionValide('versionSysteme', jetonDe(e)) !== c.systeme.version) {
      throw new ErreurService('conflit', "Ce système a changé depuis que vous l'avez ouvert.", 'a_change');
    }
    if (estMasque(c.systeme) === e.secret) return c.ancre ? {} : { ecrit: false };
    c.db.prepare('UPDATE swn_systemes SET secret = ?, version = version + 1 WHERE id = ?').run(e.secret ? 1 : 0, c.systeme.id);
    return {};
  }, systemeInconnu);
}

/**
 * The GM's own read of the state (the badge and the switch of E-21): `{secret, promu}` of the defined system at `(q, r)`,
 * `{secret: false, promu: false}` of a drawn one. Reserved to a GM outside Player mode; anyone else gets what
 * `lireInterieur` answers (the same `introuvable` for an unreadable hexagon, `refuse` otherwise).
 */
export function etatMasque(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number):
  { secret: boolean; promu: boolean; versionSysteme: number } {
  const ac = acteurDe(acteur);
  const g = garde(db, ac, universId, galaxieId, q, r);
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) throw introuvable();
  const ligne = systemeDe(db, g, q, r);
  if (ligne) return { secret: estMasque(ligne), promu: ligne.promu === 1, versionSysteme: ligne.version };
  if (!lireTire(db, g, 'mj', q, r)) throw systemeInconnu();
  return { secret: false, promu: false, versionSysteme: g.version };
}
