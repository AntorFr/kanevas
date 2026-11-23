import { useRef, type ReactNode } from 'react';

/**
 * Selection bar (charte, « Barre de sélection »): `role="toolbar"`, « N sélectionné » on the left, the controls in
 * `children`. It exists only with a selection (the caller does not mount it otherwise) and never for a player. Left/right
 * arrows move between the controls, Escape clears the selection.
 */
export function BarreSelection({ nombre, onVider, children }: { nombre: number; onVider: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  function touche(ev: React.KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      return onVider();
    }
    const pas = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!pas) return;
    const cibles = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
    const i = cibles.indexOf(document.activeElement as HTMLElement);
    if (i < 0 || (document.activeElement as HTMLElement).tagName === 'INPUT') return;
    ev.preventDefault();
    cibles[(i + pas + cibles.length) % cibles.length]?.focus();
  }

  return (
    <div ref={ref} className="barre-selection" role="toolbar" aria-label="Sélection d’assets" onKeyDown={touche}>
      <span className="barre-selection-nombre" role="status">{nombre} sélectionné{nombre > 1 ? 's' : ''}</span>
      <div className="barre-selection-controles">{children}</div>
    </div>
  );
}
