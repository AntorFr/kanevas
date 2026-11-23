/** Drag gesture of the system map (charte, « System map »): the constants and pure rules, shared by the screen and its tests. */

/** Touch: a press this long (ms) turns the finger into a drag of the body; a plain drag always moves the view. */
export const APPUI_LONG_MS = 300;
/** Arrow keys on a selected body: one step in orbits and in hours, ×4 with Shift. */
export const PAS_FLECHE = 0.25;
export const FACTEUR_MAJ = 4;
/** Arrow presses are sent once this long (ms) after the last one; the announcement « <nom> déplacé » follows. */
export const DELAI_FLECHES_MS = 600;

/** Offset of an arrow key as `{orbite, heure}`; `null` for any other key. Up/right go outward and clockwise. */
export function pasFleche(touche: string, majuscule: boolean): { orbite: number; heure: number } | null {
  const k = majuscule ? FACTEUR_MAJ : 1;
  const p = PAS_FLECHE * k;
  switch (touche) {
    case 'ArrowUp': return { orbite: p, heure: 0 };
    case 'ArrowDown': return { orbite: -p, heure: 0 };
    case 'ArrowRight': return { orbite: 0, heure: p };
    case 'ArrowLeft': return { orbite: 0, heure: -p };
    default: return null;
  }
}

/** The line of the conversion form: « = Orbite 4 · 7 h », or « = — » when the entry is not valid. */
export function texteConversion(orbite: number | null, heure: number | null): string {
  if (orbite === null || heure === null || !Number.isFinite(orbite) || !Number.isFinite(heure)) return '= —';
  const n = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
  return `= Orbite ${n(orbite)} · ${n(heure)} h`;
}
