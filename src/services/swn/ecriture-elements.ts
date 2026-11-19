// The one writer of the elements of a system (AD-elements-1): the only file allowed to `INSERT INTO`, `UPDATE` or
// `DELETE FROM` `swn_elements`. It takes the frame of `ecriture-systeme.ts` (`ecrire`: one `BEGIN IMMEDIATE`
// transaction, the guard, the anchoring of a drawn system, the gesture, `apresEcriture`) and writes nothing of the
// bodies. An element placed on a body stores no place (`orbite` and `heure` null): it is derived from the body at each
// read, so the element follows the body and goes with it (the foreign key's CASCADE).
import type { Db } from '../../db/db.js';
import { ErreurService } from '../erreurs.js';
import type { Acteur } from '../types.js';
import {
  aChange, astreInconnu, descriptionValide, ecrire, ficheDeLUnivers, invalide, jetonDe, lirePlace, nomAncrageDe, nomValide, objet,
  present, repereDe, systemeInconnu, versionValide, cleNeuve,
  type Contexte, type JetonSysteme, type ResultatEcriture,
} from './ecriture-systeme.js';
import { aspectParDefaut, COULEURS_ELEMENT, GENRES_ELEMENT, ICONES_ELEMENT, type AspectElement, type GenreElement } from './elements-aspect.js';
import { lireInterieur } from './interieur.js';

interface LigneElement {
  id: number; systeme_id: number; cle: string; genre: GenreElement; nom: string; description: string | null;
  astre_id: number | null; orbite: number | null; heure: number | null; aspect: string; version: number;
}

const elementDe = (c: Contexte, cle: unknown): LigneElement => {
  const e = typeof cle === 'string'
    ? c.db.prepare('SELECT * FROM swn_elements WHERE systeme_id = ? AND cle = ?').get(c.systeme.id, cle) as LigneElement | undefined
    : undefined;
  // « Cet astre n'existe plus. » is what the screen says of any target that vanished meanwhile.
  if (!e) throw astreInconnu();
  return e;
};

function genreValide(v: unknown): GenreElement {
  if (typeof v !== 'string' || !(GENRES_ELEMENT as readonly string[]).includes(v)) {
    throw invalide('genre', 'Le genre : vaisseau, ville, station, base ou autre.');
  }
  return v as GenreElement;
}
function nomRequis(v: unknown): string {
  const n = typeof v === 'string' ? nomValide(v) : null;
  if (n === null) throw invalide('nom', 'Le nom : de 1 à 80 caractères.');
  return n;
}
/** `{icone, couleur}` among the server's lists; a missing key takes the default (`base`), the object has no other key. */
function aspectValide(v: unknown, base: AspectElement): string {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw invalide('aspect', "L'aspect : un objet.");
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (k !== 'icone' && k !== 'couleur') throw invalide('aspect', "L'aspect : une icône et une couleur.");
  const icone = present(o, 'icone') ? o.icone : base.icone;
  const couleur = present(o, 'couleur') ? o.couleur : base.couleur;
  if (typeof icone !== 'string' || !(ICONES_ELEMENT as readonly string[]).includes(icone)) throw invalide('aspect', 'Icône inconnue.');
  if (typeof couleur !== 'string' || !(COULEURS_ELEMENT as readonly string[]).includes(couleur)) throw invalide('aspect', 'Couleur inconnue.');
  return JSON.stringify({ icone, couleur });
}
function reserveValide(v: unknown): 0 | 1 {
  if (typeof v !== 'boolean') throw invalide('secret', 'Valeur invalide.');
  return v ? 1 : 0;
}

/** The body an element sits on: a body of this system only (never an element, a zone or a body of another system). */
function corpsDe(c: Contexte, cle: unknown): number {
  const a = typeof cle === 'string'
    ? c.db.prepare('SELECT id FROM swn_astres WHERE systeme_id = ? AND cle = ?').get(c.systeme.id, cle) as { id: number } | undefined
    : undefined;
  if (!a) throw astreInconnu();
  return a.id;
}

const FORMES_PLACE = ['orbite', 'heure', 'plan', 'galactique'];
/** The place a call asks for: a body (`sur`) or an orbit and an hour; both at once is a refusal. */
function placeDemandee(c: Contexte, e: Record<string, unknown>):
  { astreId: number } | { orbite?: number; heure?: number } | null {
  const surDonne = present(e, 'sur');
  if (surDonne && FORMES_PLACE.some((k) => present(e, k))) throw invalide('sur', 'Un astre ou une orbite, pas les deux.');
  if (surDonne) return { astreId: corpsDe(c, e.sur) };
  if (!FORMES_PLACE.some((k) => present(e, k))) return null;
  return lirePlace(e, false, () => repereDe(c));
}

const cleLibre = (c: Contexte, nom: string): string => {
  const prises = [
    ...(c.db.prepare('SELECT cle FROM swn_astres WHERE systeme_id = ?').all(c.systeme.id) as { cle: string }[]),
    ...(c.db.prepare('SELECT cle FROM swn_formations WHERE systeme_id = ?').all(c.systeme.id) as { cle: string }[]),
    ...(c.db.prepare('SELECT cle FROM swn_elements WHERE systeme_id = ?').all(c.systeme.id) as { cle: string }[]),
  ];
  return cleNeuve(nom, prises.map((x) => x.cle));
};

export interface ElementEntree extends JetonSysteme {
  genre?: unknown; nom?: unknown; description?: unknown; aspect?: unknown; secret?: unknown;
  sur?: unknown; orbite?: unknown; heure?: unknown; plan?: unknown; galactique?: unknown;
}

/** Adds an element. The place is a body (`sur`, its `cle`) or an orbit and an hour (default orbit 1, hour 0). */
export function ajouterElement(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  entree: ElementEntree): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const genre = genreValide(e.genre);
    const nom = nomRequis(e.nom);
    const description = present(e, 'description') ? descriptionValide(e.description) : null;
    const aspect = present(e, 'aspect') ? aspectValide(e.aspect, aspectParDefaut(genre)) : JSON.stringify(aspectParDefaut(genre));
    const reserve = present(e, 'secret') ? reserveValide(e.secret) : 0;
    const place = placeDemandee(c, e);
    let astreId: number | null = null, orbite: number | null = null, heure: number | null = null;
    if (place && 'astreId' in place) astreId = place.astreId;
    else { orbite = place?.orbite ?? 1; heure = place?.heure ?? 0; }
    const cle = cleLibre(c, nom);
    c.db.prepare(`INSERT INTO swn_elements (systeme_id, cle, genre, nom, description, astre_id, orbite, heure, aspect, secret)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.systeme.id, cle, genre, nom, description, astreId, orbite, heure, aspect, reserve);
    return { cle };
  }, systemeInconnu);
}

export interface ElementModification extends JetonSysteme { version?: unknown }

/** « Modifier… »: name, kind, description, aspect. The place, the secret and the link have their own gestures. */
export function modifierElement(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: ElementModification & Pick<ElementEntree, 'genre' | 'nom' | 'description' | 'aspect'>): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const el = elementDe(c, cle);
    if (versionValide('version', e.version) !== el.version) throw aChange();
    for (const k of [...FORMES_PLACE, 'sur', 'secret']) if (present(e, k)) throw invalide(k, 'Ce champ ne change pas ici.');
    const sets: string[] = [], vals: unknown[] = [];
    const poser = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
    const genre = present(e, 'genre') ? genreValide(e.genre) : el.genre;
    if (genre !== el.genre) poser('genre', genre);
    if (present(e, 'nom')) poser('nom', nomRequis(e.nom));
    if (present(e, 'description')) poser('description', descriptionValide(e.description));
    if (present(e, 'aspect')) poser('aspect', aspectValide(e.aspect, aspectParDefaut(genre)));
    if (sets.length === 0) throw invalide('nom', 'Rien à modifier.');
    c.db.prepare(`UPDATE swn_elements SET ${[...sets, 'version = version + 1'].join(', ')} WHERE id = ?`).run(...vals, el.id);
    return { cle: el.cle };
  }, systemeInconnu);
}

/** « Déplacer » / « Poser sur un astre »: `sur` (a body) or an orbit and an hour; an element on a body keeps no place of its own. */
export function deplacerElement(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: ElementModification & Pick<ElementEntree, 'sur' | 'orbite' | 'heure' | 'plan' | 'galactique'>): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const el = elementDe(c, cle);
    if (versionValide('version', e.version) !== el.version) throw aChange();
    const place = placeDemandee(c, e);
    if (!place) throw invalide('orbite', "Un astre ou une orbite et une heure.", 'orbite_invalide');
    if ('astreId' in place) {
      c.db.prepare('UPDATE swn_elements SET astre_id = ?, orbite = NULL, heure = NULL, version = version + 1 WHERE id = ?').run(place.astreId, el.id);
    } else {
      const orbite = place.orbite ?? el.orbite, heure = place.heure ?? el.heure;
      // An element on a body gives no half place to complete: both values are required.
      if (orbite === null || heure === null) throw invalide(orbite === null ? 'orbite' : 'heure', "L'orbite et l'heure.", 'orbite_invalide');
      c.db.prepare('UPDATE swn_elements SET astre_id = NULL, orbite = ?, heure = ?, version = version + 1 WHERE id = ?').run(orbite, heure, el.id);
    }
    return { cle: el.cle };
  }, systemeInconnu);
}

export function retirerElement(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: ElementModification): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const el = elementDe(c, cle);
    if (versionValide('version', e.version) !== el.version) throw aChange();
    c.db.prepare('DELETE FROM swn_elements WHERE id = ?').run(el.id);
    return { cle: el.cle };
  }, systemeInconnu);
}

/** « Réservé au MJ »: the one switch that hides an element (B-96). Setting the state it already has writes nothing. */
export function reserverElement(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: ElementModification & Pick<ElementEntree, 'secret'>): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const el = elementDe(c, cle);
    if (versionValide('version', e.version) !== el.version) throw aChange();
    const reserve = reserveValide(e.secret);
    const { changes } = c.db.prepare('UPDATE swn_elements SET secret = ?, version = version + 1 WHERE id = ? AND secret != ?').run(reserve, el.id, reserve);
    return changes === 0 ? { cle: el.cle, ecrit: false } : { cle: el.cle };
  }, systemeInconnu);
}

/** Links an element to a sheet; the rule of `lierAstre` (`ficheDeLUnivers`: `fiche_inconnue` for anything else). */
export function lierElement(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: ElementModification & { ficheId?: unknown }): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const el = elementDe(c, cle);
    if (versionValide('version', e.version) !== el.version) throw aChange();
    const ficheId = ficheDeLUnivers(c, e.ficheId);
    c.db.prepare('UPDATE swn_elements SET fiche_id = ?, version = version + 1 WHERE id = ?').run(ficheId, el.id);
    return { cle: el.cle };
  }, systemeInconnu);
}

export function delierElement(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, q: number, r: number,
  cle: string, entree: ElementModification): ResultatEcriture {
  const e = objet(entree);
  return ecrire(db, acteur, universId, galaxieId, q, r, jetonDe(e), nomAncrageDe(e), (c) => {
    const el = elementDe(c, cle);
    if (versionValide('version', e.version) !== el.version) throw aChange();
    c.db.prepare('UPDATE swn_elements SET fiche_id = NULL, version = version + 1 WHERE id = ?').run(el.id);
    return { cle: el.cle };
  }, systemeInconnu);
}

/**
 * What the removal dialog of a body counts besides its moons: the elements on it and on its moons, the reserved ones
 * included. For a GM outside Player mode only: anyone else gets what `lireInterieur` answers (`introuvable` for an
 * unreadable system) or `refuse`. `retirerAstre` is not changed: its dialog reads this number beside what it reads.
 */
export function elementsDuCorps(db: Db, acteur: Acteur, universId: number, galaxieId: number, q: number, r: number, cle: string): number {
  const vue = lireInterieur(db, acteur, universId, galaxieId, q, r);
  if (!vue.peutEcrire) throw new ErreurService('refuse', "Vous n'avez pas le droit de modifier ce système.");
  const ligne = db.prepare(`SELECT COUNT(*) AS n FROM swn_elements e JOIN swn_astres a ON a.id = e.astre_id
    JOIN swn_systemes s ON s.id = a.systeme_id JOIN swn_galaxies g ON g.id = s.galaxie_id
    LEFT JOIN swn_astres p ON p.id = a.parent_id
    WHERE g.id = ? AND s.q = ? AND s.r = ? AND (a.cle = ? OR p.cle = ?)`).get(galaxieId, q, r, cle, cle) as { n: number };
  if (!vue.astres.some((a) => a.cle === cle)) throw astreInconnu();
  return ligne.n;
}
