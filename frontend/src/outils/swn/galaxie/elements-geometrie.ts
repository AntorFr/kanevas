// Where the marks of the elements sit on the map (E-23, B-96): pure, no DOM. An element by orbit and hour sits on that orbit; one on a
// body turns in a small orbit around it (drawn still: the body's place is read, so the element follows it at the next answer).
import { rayonOrbite, type CorpsPlace, type Plan } from './carte-geometrie';
import type { ElementSysteme } from './types';

/** Side of a mark, in screen pixels: the ring and its hit target (at least 24 px). */
export const COTE_MARQUE = 28;
/** Gap between the edge of a body and the ring of an element in orbit around it. */
const ECART_CORPS = 6;
const PAR_COURONNE = 8;
/** Elements by orbit and hour at the same place sit side by side. */
const ECART_VOISINS = COTE_MARQUE + 4;

export interface MarquePlacee { cle: string; element: ElementSysteme; x: number; y: number }

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The screen position of each element: `ecran` maps a world point to the screen, `echelle` is the world-to-screen scale. */
export function placerMarques(
  elements: readonly ElementSysteme[], corps: readonly CorpsPlace[], plan: Plan,
  ecran: (x: number, y: number) => [number, number], echelle: number,
): MarquePlacee[] {
  const parCorps = new Map<string, number>();
  const nombreParCorps = new Map<string, number>();
  for (const e of elements) if (e.sur !== null) nombreParCorps.set(e.sur, (nombreParCorps.get(e.sur) ?? 0) + 1);
  const voisins = new Map<string, number>();
  return elements.map((e) => {
    const mere = e.sur === null ? undefined : corps.find((c) => c.cle === e.sur);
    if (mere) {
      const k = parCorps.get(mere.cle) ?? 0;
      parCorps.set(mere.cle, k + 1);
      const total = nombreParCorps.get(mere.cle) ?? 1;
      const couronne = Math.floor(k / PAR_COURONNE);
      const dansCouronne = Math.min(PAR_COURONNE, total - couronne * PAR_COURONNE);
      const angle = Math.PI / 4 + (2 * Math.PI * (k % PAR_COURONNE)) / dansCouronne + couronne * 0.4;
      const [cx, cy] = ecran(mere.x, mere.y);
      const distance = Math.max(4, mere.rayon * echelle) + ECART_CORPS + COTE_MARQUE / 2 + couronne * (COTE_MARQUE + 2);
      return { cle: e.cle, element: e, x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance };
    }
    const [wx, wy] = plan(rayonOrbite(Math.max(0, num(e.orbite))), num(e.heure));
    const [x, y] = ecran(wx, wy);
    const cle = `${num(e.orbite)}|${num(e.heure)}`;
    const j = voisins.get(cle) ?? 0;
    voisins.set(cle, j + 1);
    return { cle: e.cle, element: e, x: x + j * ECART_VOISINS, y };
  });
}
