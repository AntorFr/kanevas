// E-23, the forms of the GM's writes (AD-edition-3, AD-edition-4): pure reading, bounds and conversions.
// The core converts in the browser for the « = Orbite 4 · 7 h » line; the server converts again and stores orbit and hour only.
import { nombre } from './systeme-libelles';
import type { AstreSysteme, FormationSysteme, InterieurSysteme } from './types';

export const ORBITE_MAX = 1000;
export const NOM_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const DESCRIPTION_COMPTEUR = 1800;
export const TAILLE_MAX = 100;
export const GRAINE_MAX = 4_294_967_295;
export const MSG_ORBITE = 'Orbite invalide.';
export const MSG_POSITION = 'Position invalide.';
export const MSG_NOMBRE = 'Nombre attendu.';

export type Repere = 'orbite' | 'plan' | 'hexagone';

/** A number typed in a field (French comma accepted, typographic minus too): a value, or « Nombre attendu. ». */
export function lireNombre(texte: string): { valeur?: number; erreur?: string } {
  const t = texte.trim().replace(',', '.').replace('−', '-');
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return { erreur: MSG_NOMBRE };
  return { valeur: Number(t) };
}

/** An integer typed in a field. */
export function lireEntier(texte: string): { valeur?: number; erreur?: string } {
  const t = texte.trim().replace('−', '-');
  if (!/^-?\d+$/.test(t)) return { erreur: MSG_NOMBRE };
  return { valeur: Number(t) };
}

/** The bounds of a stored place: an orbit from 0 to 1 000, an hour from 0 to under 12. */
export const placeValide = (orbite: number, heure: number): boolean =>
  orbite >= 0 && orbite <= ORBITE_MAX && heure >= 0 && heure < 12;

/** What the converter of the core offers the form (injected: the form's tests give a fake). */
export interface ConvertisseurCoeur {
  planVersOrbiteHeure: (x: number, y: number) => Promise<[number, number]>;
  galactiqueVersOrbiteHeure: (dq: number, dr: number, rayon: number) => Promise<[number, number]>;
}

export type Conversion = { ok: true; orbite: number; heure: number } | { ok: false; erreur: string };

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

/** Orbit and hour of what is typed in the chosen `repere`; `systeme` is the hexagon of the system, `rayon` its transition radius. */
export async function convertir(
  repere: Repere, a: string, b: string, systeme: { q: number; r: number }, rayon: number, coeur: ConvertisseurCoeur,
): Promise<Conversion> {
  const na = lireNombre(a), nb = lireNombre(b);
  if (na.valeur === undefined) return { ok: false, erreur: na.erreur! };
  if (nb.valeur === undefined) return { ok: false, erreur: nb.erreur! };
  let orbite = na.valeur, heure = nb.valeur;
  if (repere !== 'orbite') {
    try {
      if (repere === 'plan') {
        [orbite, heure] = await coeur.planVersOrbiteHeure(na.valeur, nb.valeur);
      } else {
        const dq = na.valeur - systeme.q, dr = nb.valeur - systeme.r;
        if (dq === 0 && dr === 0) return { ok: false, erreur: MSG_POSITION };
        [orbite, heure] = await coeur.galactiqueVersOrbiteHeure(dq, dr, rayon);
      }
    } catch {
      return { ok: false, erreur: MSG_POSITION };
    }
    orbite = arrondi2(orbite);
    heure = arrondi2(heure);
    if (heure >= 12) heure = 0;
  }
  if (!placeValide(orbite, heure)) return { ok: false, erreur: repere === 'orbite' ? MSG_ORBITE : MSG_POSITION };
  return { ok: true, orbite, heure };
}

/** « = Orbite 4 · 7 h » (the same words as the panel's place), « = — » while the pair is invalid or empty. */
export const ligneConversion = (c: Conversion | null): string =>
  c === null ? '= …' : c.ok ? `= Orbite ${nombre(c.orbite)} · ${nombre(c.heure)} h` : '= —';

/** The orbit one beyond the outermost of the system (default of « Ajouter un astre »), at hour 0. */
export function orbiteParDefaut(i: InterieurSysteme): number {
  let max = 0;
  for (const a of i.astres) if (a.genre !== 'lune' && typeof a.orbite === 'number') max = Math.max(max, a.orbite);
  for (const f of i.formations) {
    const p = f.parametres;
    for (const k of ['a', 'orbite']) if (typeof p[k] === 'number') max = Math.max(max, p[k] as number);
  }
  return Math.min(ORBITE_MAX, Math.ceil(max) + 1);
}

/** The default ring and cloud of « Ajouter une zone »: the free range around the outermost orbit. */
export function parametresZoneParDefaut(i: InterieurSysteme, forme: 'anneau' | 'nuage'): Record<string, unknown> {
  const o = orbiteParDefaut(i);
  return forme === 'anneau' ? { de: o, a: Math.min(ORBITE_MAX, o + 1) } : { orbite: o, heure: 0, centres: [[o, 0, 1]] };
}

// ---- Aspect: the presets of a type come from the catalogue of the core (`variantes`), « Personnalisé » is a typed value.

export type Aspect = Record<string, unknown>;
export const PERSONNALISE = '__personnalise';
export const PAR_DEFAUT = '__defaut';

/** The names of the presets of a type's default aspect (its `variantes`). */
export const nomsPreregles = (defaut: Aspect | undefined): string[] =>
  defaut && typeof defaut.variantes === 'object' && defaut.variantes !== null ? Object.keys(defaut.variantes as object) : [];

/** The aspect a preset gives: the default of the type with the preset's keys laid over it (without `variantes`). */
export function aspectPreregle(defaut: Aspect, nom: string): Aspect {
  const v = (defaut.variantes as Record<string, Aspect> | undefined)?.[nom];
  const { variantes: _v, ...base } = defaut;
  return { ...base, ...(v ?? {}) };
}

/** Which preset an aspect is: « défaut » when it is the type's default, a preset's name, else « Personnalisé ». */
export function presetDe(aspect: Aspect, defaut: Aspect | undefined): string {
  if (!defaut) return PERSONNALISE;
  const sans = (a: Aspect) => { const { graine: _g, variantes: _v, ...r } = a; return JSON.stringify(Object.entries(r).sort(([x], [y]) => x.localeCompare(y))); };
  if (sans(aspect) === sans(defaut)) return PAR_DEFAUT;
  for (const n of nomsPreregles(defaut)) if (sans(aspect) === sans(aspectPreregle(defaut, n))) return n;
  return PERSONNALISE;
}

/** The JSON the thumbnail draws: the engine's `{type, taille, aspect}` of `aspectDe`. */
export const aspectApercu = (type: string, taille: number, aspect: Aspect): string => JSON.stringify({ type, taille, aspect });

/** The seed of the surface: an integer from 0 to 2³²−1, or « Nombre attendu. » / the bound. */
export function lireGraine(texte: string): { valeur?: number; erreur?: string } {
  const r = lireEntier(texte);
  if (r.valeur === undefined) return r;
  if (r.valeur < 0 || r.valeur > GRAINE_MAX) return { erreur: `Entre 0 et ${GRAINE_MAX.toLocaleString('fr-FR')}.` };
  return r;
}

/** « Taille »: greater than 0, at most 100. */
export function lireTaille(texte: string): { valeur?: number; erreur?: string } {
  const r = lireNombre(texte);
  if (r.valeur === undefined) return r;
  if (r.valeur <= 0 || r.valeur > TAILLE_MAX) return { erreur: 'Entre 0 et 100.' };
  return r;
}

/** An orbit field: 0 to 1 000. */
export function lireOrbite(texte: string): { valeur?: number; erreur?: string } {
  const r = lireNombre(texte);
  if (r.valeur === undefined) return r;
  return r.valeur < 0 || r.valeur > ORBITE_MAX ? { erreur: MSG_ORBITE } : r;
}
/** An hour field: 0 to under 12 (the server's `orbite_invalide`, said the same). */
export function lireHeure(texte: string): { valeur?: number; erreur?: string } {
  const r = lireNombre(texte);
  if (r.valeur === undefined) return r;
  return r.valeur < 0 || r.valeur >= 12 ? { erreur: MSG_ORBITE } : r;
}

export const texteNombre = (n: number): string => String(n).replace('.', ',');
export const nomLongueurOk = (nom: string): boolean => [...nom.trim()].length <= NOM_MAX;

// ---- Zones: the parameters of a ring and of a cloud as typed.

export interface ChampsAnneau { de: string; a: string; arcTout: boolean; debut: string; fin: string }
export interface ChampsNuage { orbite: string; heure: string; etendue: string }

export function champsAnneau(p: Record<string, unknown>): ChampsAnneau {
  const arc = Array.isArray(p.arc) ? (p.arc as number[]) : null;
  return {
    de: texteNombre(typeof p.de === 'number' ? p.de : 0), a: texteNombre(typeof p.a === 'number' ? p.a : 1),
    arcTout: arc === null, debut: texteNombre(arc?.[0] ?? 0), fin: texteNombre(arc?.[1] ?? 6),
  };
}
export function champsNuage(p: Record<string, unknown>): ChampsNuage {
  const c0 = Array.isArray(p.centres) && Array.isArray((p.centres as unknown[])[0]) ? (p.centres as number[][])[0]! : null;
  return {
    orbite: texteNombre(typeof p.orbite === 'number' ? p.orbite : c0?.[0] ?? 0),
    heure: texteNombre(typeof p.heure === 'number' ? p.heure : c0?.[1] ?? 0),
    etendue: texteNombre(c0?.[2] ?? 1),
  };
}

export interface ErreursZone { [champ: string]: string | undefined }

/** The ring's parameters over the zone's existing ones (`rochers`, `materiaux` stay), or the errors by field. */
export function parametresAnneau(c: ChampsAnneau, base: Record<string, unknown>): { parametres?: Record<string, unknown>; erreurs: ErreursZone } {
  const de = lireOrbite(c.de), a = lireOrbite(c.a);
  const erreurs: ErreursZone = { de: de.erreur, a: a.erreur };
  if (de.valeur !== undefined && a.valeur !== undefined && de.valeur >= a.valeur) erreurs.de = 'De doit être inférieur à À.';
  const p: Record<string, unknown> = { ...base, de: de.valeur, a: a.valeur };
  if (c.arcTout) delete p.arc;
  else {
    const d = lireHeure(c.debut), f = lireHeure(c.fin);
    erreurs.debut = d.erreur; erreurs.fin = f.erreur;
    if (d.valeur !== undefined && f.valeur !== undefined && d.valeur === f.valeur) erreurs.fin = 'Deux heures différentes.';
    p.arc = [d.valeur, f.valeur];
  }
  return Object.values(erreurs).some(Boolean) ? { erreurs } : { parametres: p, erreurs };
}

/** The cloud's parameters: the first centre follows « Centre » and « Étendue »; the other centres stay as they are. */
export function parametresNuage(c: ChampsNuage, base: Record<string, unknown>): { parametres?: Record<string, unknown>; erreurs: ErreursZone } {
  const o = lireOrbite(c.orbite), h = lireHeure(c.heure), e = lireTaille(c.etendue);
  const erreurs: ErreursZone = { orbite: o.erreur, heure: h.erreur, etendue: e.erreur };
  if (o.valeur !== undefined && e.valeur !== undefined && o.valeur + e.valeur > ORBITE_MAX) erreurs.etendue = 'Entre 0 et 1 000, dans l’étendue du système.';
  if (Object.values(erreurs).some(Boolean)) return { erreurs };
  const autres = Array.isArray(base.centres) ? (base.centres as number[][]).slice(1) : [];
  return { parametres: { ...base, orbite: o.valeur, heure: h.valeur, centres: [[o.valeur, h.valeur, e.valeur], ...autres] }, erreurs };
}

/** The value a form of a body sends for its description: empty is « no description ». */
export const descriptionDe = (a: AstreSysteme | FormationSysteme): string =>
  typeof (a as { description?: unknown }).description === 'string' ? (a as { description: string }).description : '';
