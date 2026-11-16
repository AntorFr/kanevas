// Label placement of the system map (AD-carte-4, B-89, E-23): one pure pass, no DOM — the text measurer is an argument.
// Bodies and labels are rectangles / discs in screen pixels; a placed label never meets a body disc nor another label.

export type GenreCorps = 'etoile' | 'planete' | 'comete' | 'anomalie' | 'compagne' | 'lune' | 'zone';

/** A body of the map in screen pixels: `x`, `y` its centre, `rayon` its disc (0 for a zone, which only anchors its label). */
export interface CorpsEtiquette { cle: string; genre: GenreCorps; nom: string; x: number; y: number; rayon: number }

/** The view: its size in px and its zoom (1 = the fitted view); moons and zones collapse first when zooming out. */
export interface VueEtiquettes { largeur: number; hauteur: number; zoom?: number }

export interface Mesure { largeur: number; hauteur: number }
export type Mesureur = (texte: string) => Mesure;

/** `x`, `y`: top-left corner of the rectangle; `texte` is the text drawn (cut, shortened); empty and `visible: false` when collapsed. */
export interface EtiquettePlacee { cle: string; x: number; y: number; largeur: number; hauteur: number; texte: string; visible: boolean }

export const LONGUEUR_MAX = 80;
/** Zoom under which the labels of moons, then of zones, collapse. */
export const ZOOM_LUNES = 1;
export const ZOOM_ZONES = 0.75;
const DISTANCES = [4, 14];
const MARGE = 1;

const PRIORITE: Record<GenreCorps, number> = { etoile: 0, planete: 1, comete: 1, anomalie: 1, compagne: 2, lune: 3, zone: 4 };

interface Rect { x: number; y: number; largeur: number; hauteur: number }

const coupe = (nom: string) => {
  const c = [...nom.replace(/\s+/g, ' ').trim()];
  return c.length > LONGUEUR_MAX ? `${c.slice(0, LONGUEUR_MAX - 1).join('')}…` : c.join('');
};

/** The text cut to `n` characters, with « … » (n counts the ellipsis). */
const raccourci = (texte: string, n: number) => `${[...texte].slice(0, n - 1).join('').trimEnd()}…`;

const coupeLeDisque = (r: Rect, c: CorpsEtiquette) => {
  const px = Math.max(r.x, Math.min(c.x, r.x + r.largeur));
  const py = Math.max(r.y, Math.min(c.y, r.y + r.hauteur));
  const d = Math.hypot(px - c.x, py - c.y);
  return c.rayon > 0 ? d < c.rayon + MARGE : d === 0;
};

const sechevauchent = (a: Rect, b: Rect) =>
  a.x < b.x + b.largeur + MARGE && b.x < a.x + a.largeur + MARGE && a.y < b.y + b.hauteur + MARGE && b.y < a.y + a.hauteur + MARGE;

/** Rectangles of the four sides of a body, at one distance: below, above, right, left. */
const candidats = (c: CorpsEtiquette, m: Mesure, d: number): Rect[] => {
  const { largeur: l, hauteur: h } = m;
  return [
    { x: c.x - l / 2, y: c.y + c.rayon + d, largeur: l, hauteur: h },
    { x: c.x - l / 2, y: c.y - c.rayon - d - h, largeur: l, hauteur: h },
    { x: c.x + c.rayon + d, y: c.y - h / 2, largeur: l, hauteur: h },
    { x: c.x - c.rayon - d - l, y: c.y - h / 2, largeur: l, hauteur: h },
  ];
};

/** The label of every body, placed by priority; same arguments, same result. Input order is the final tie-break. */
export function placerEtiquettes(corps: CorpsEtiquette[], vue: VueEtiquettes, mesurer: Mesureur): EtiquettePlacee[] {
  const zoom = vue.zoom ?? 1;
  const ordre = corps.map((c, i) => ({ c, i })).sort((a, b) => PRIORITE[a.c.genre] - PRIORITE[b.c.genre] || a.i - b.i);
  const placees: Rect[] = [];
  const resultat = new Map<string, EtiquettePlacee>();

  const libre = (r: Rect) =>
    r.x >= 0 && r.y >= 0 && r.x + r.largeur <= vue.largeur && r.y + r.hauteur <= vue.hauteur &&
    !corps.some((c) => coupeLeDisque(r, c)) && !placees.some((p) => sechevauchent(r, p));

  for (const { c } of ordre) {
    const replie = (c.genre === 'lune' && zoom < ZOOM_LUNES) || (c.genre === 'zone' && zoom < ZOOM_ZONES);
    const plein = coupe(c.nom);
    let trouve: EtiquettePlacee | null = null;
    if (!replie && plein) {
      const longueurs = [...Array(Math.max(0, [...plein].length - 2)).keys()].map((k) => [...plein].length - k);
      for (let k = 0; k < longueurs.length && !trouve; k++) {
        const texte = k === 0 ? plein : raccourci(plein, longueurs[k] ?? 2);
        const m = mesurer(texte);
        for (const d of DISTANCES) {
          const r = candidats(c, m, d).find(libre);
          if (r) { trouve = { cle: c.cle, ...r, texte, visible: true }; placees.push(r); break; }
        }
      }
      if (!trouve && [...plein].length <= 2) {
        const m = mesurer(plein);
        for (const d of DISTANCES) {
          const r = candidats(c, m, d).find(libre);
          if (r) { trouve = { cle: c.cle, ...r, texte: plein, visible: true }; placees.push(r); break; }
        }
      }
    }
    resultat.set(c.cle, trouve ?? { cle: c.cle, x: c.x, y: c.y, largeur: 0, hauteur: 0, texte: '', visible: false });
  }
  return corps.map((c) => resultat.get(c.cle)!);
}
