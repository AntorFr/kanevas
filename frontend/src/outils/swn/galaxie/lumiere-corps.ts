// The light of a body (AD-aspects-socle-1, E-23): pure, no DOM. `angleVersEtoile` is the one function that turns the
// place of a body and its star into the `angle` the core and the illustration route take (quantised to 5°, so a body
// draws at most 72 sprites); `lumiereDeEtoile` is the `#rrggbb` of the star's light.
import { catalogueAspects } from '../../../wasm/coeur';
import type { AstreSysteme } from './types';

/** Colour of a light when the star gives none. */
export const LUMIERE_DEFAUT = '#fff4e0';
const PAS = 5;

/** Anything with a place on the plane: `x`, `y` in world units (y down, as the screen). */
export interface Point { x: number; y: number }

/**
 * Direction on the screen from `corps` toward `etoile`, in degrees, x to the right and y up (the engine's convention:
 * a body at the right of its star looks left at it, 180°; above it, 270°). Rounded to 5° then wrapped into [0, 360):
 * 358° gives 0, never 360. `null` without a star, or when both sit on the same point.
 */
export function angleVersEtoile(corps: Point, etoile: Point | null | undefined): number | null {
  if (!etoile) return null;
  const dx = etoile.x - corps.x;
  const dy = corps.y - etoile.y; // screen y goes down, the engine's goes up
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const arrondi = Math.round(deg / PAS) * PAS;
  return ((arrondi % 360) + 360) % 360;
}

/** The colour of each star class, read from the core's catalogue (`catalogue_aspects().types`): its middle palette colour. */
let classes: Record<string, string> = {};

/** Fills the class colours from the catalogue JSON of the core (`{ types: { <type>: { palette } } }`). */
export function poserClasses(catalogueJson: string): void {
  const sortie: Record<string, string> = {};
  try {
    const types = (JSON.parse(catalogueJson) as { types?: Record<string, { palette?: unknown } | null> }).types ?? {};
    for (const [t, a] of Object.entries(types)) {
      const p = a?.palette;
      if (Array.isArray(p) && p.length > 0) {
        const c = p[Math.min(1, p.length - 1)];
        if (estCouleur(c)) sortie[t] = c.toLowerCase();
      }
    }
  } catch { /* an unreadable catalogue leaves the default light */ }
  classes = sortie;
}

const estCouleur = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** The star's light: its own `couleur` when it carries one, else the colour of its class, else `#fff4e0`. */
export function lumiereDeEtoile(etoile: Pick<AstreSysteme, 'type' | 'aspect'> | null | undefined, couleurSysteme?: string | null): string {
  if (!etoile) return LUMIERE_DEFAUT;
  if (estCouleur(couleurSysteme)) return couleurSysteme.toLowerCase();
  const posee = etoile.aspect?.couleur;
  if (estCouleur(posee)) return posee.toLowerCase();
  return classes[etoile.type] ?? LUMIERE_DEFAUT;
}

/** The star a body is lit by: a planet or a comet the star of its `etoile_rang`, a moon its planet's; a star lights itself (`null`). */
export function etoileDe(astre: AstreSysteme, astres: AstreSysteme[]): AstreSysteme | null {
  const parCle = new Map(astres.map((a) => [a.cle, a]));
  let a: AstreSysteme | undefined = astre;
  if (a.genre === 'lune') a = a.parent_cle === null ? undefined : parCle.get(a.parent_cle);
  if (!a || a.genre === 'etoile') return null;
  // A body of a companion: `etoile_rang` names the star it circles.
  return astres.find((s) => s.genre === 'etoile' && s.etoile_rang === a!.etoile_rang) ?? null;
}

/** Reads the class colours from the core once (the browser holds no list of its own). Never rejects. */
export async function chargerClasses(): Promise<void> {
  try { poserClasses(await catalogueAspects()); } catch { /* default light */ }
}

/** What a sprite takes to be lit: both absent for a body with no star. */
export interface Eclairage { angle?: number; lumiere?: string }

/** The light of every body of a layout, by key: the angle toward its star and the colour of that star's light. */
export function eclairages(corps: { cle: string; astre: AstreSysteme; x: number; y: number }[]): Map<string, Eclairage> {
  const astres = corps.map((c) => c.astre);
  const place = new Map(corps.map((c) => [c.cle, c]));
  const sortie = new Map<string, Eclairage>();
  for (const c of corps) {
    const e = etoileDe(c.astre, astres);
    const pe = e ? place.get(e.cle) : undefined;
    const angle = pe ? angleVersEtoile(c, pe) : null;
    if (e && angle !== null) sortie.set(c.cle, { angle, lumiere: lumiereDeEtoile(e) });
  }
  return sortie;
}

/** The key of a sprite: the body and how it is lit, so a new light never shows an old picture. */
export const cleSprite = (cle: string, e: Eclairage | undefined): string => (e ? `${cle}@${e.angle}@${e.lumiere}` : cle);
