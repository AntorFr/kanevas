import type { PionVu } from '../outils/battlemap/table/logique';

/** The smallest grab zone on screen, in pixels, at any zoom (charte, `PionTable`). */
export const ZONE_MIN_PX = 44;

/**
 * The handle of a token on a played map (charte, `PionTable`): the canvas draws the disc, its ring and the dashed target; this is
 * the keyboard and screen-reader door over it. Tab focuses it, Enter grabs, the arrows move it by one cell, Enter drops, Esc cancels.
 * It carries no rule of ownership: every visible token can be grabbed, the server decides on the drop.
 */
export function PionTable({ pion, echelle, ox, oy, sien, saisi, onSaisir, onDeplacer, onDeposer, onAnnuler }: {
  pion: PionVu; echelle: number; ox: number; oy: number; sien: boolean; saisi: boolean;
  onSaisir: () => void; onDeplacer: (dx: number, dy: number) => void; onDeposer: () => void; onAnnuler: () => void;
}) {
  const l = pion.l * echelle;
  const h = pion.h * echelle;
  const w = Math.max(l, ZONE_MIN_PX);
  const hh = Math.max(h, ZONE_MIN_PX);
  const style = { left: ox + pion.x * echelle - (w - l) / 2, top: oy + pion.y * echelle - (hh - h) / 2, width: w, height: hh };
  const FLECHES: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  function touche(ev: React.KeyboardEvent<HTMLButtonElement>) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (saisi) onDeposer(); else onSaisir();
    } else if (saisi && ev.key === 'Escape') {
      ev.preventDefault();
      onAnnuler();
    } else if (saisi && FLECHES[ev.key]) {
      ev.preventDefault();
      onDeplacer(...FLECHES[ev.key]!);
    }
  }

  return (
    <button
      type="button"
      className={`pion-table${sien ? ' sien' : ''}${saisi ? ' saisi' : ''}`}
      style={style}
      aria-label={sien ? `${pion.nom}, votre pion` : pion.nom}
      aria-pressed={saisi}
      onKeyDown={touche}
      onBlur={() => { if (saisi) onAnnuler(); }}
    />
  );
}
