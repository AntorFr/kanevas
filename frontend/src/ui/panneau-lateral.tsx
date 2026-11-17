import { X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Side panel (charte, « Panneau latéral », promoted from the file panel of E-19): a named `aside` with an icon label and a
 * « Fermer » button; a full-screen sheet on a phone. Escape closes (unless `echap` is false, a dialog being open above it)
 * and the focus goes back to what opened it.
 */
export function PanneauLateral({
  nom,
  libelle,
  icone: Icone,
  onFermer,
  echap = true,
  classe,
  children,
}: {
  /** Accessible name of the `aside`. */
  nom: string;
  libelle: string;
  icone: LucideIcon;
  onFermer: () => void;
  echap?: boolean;
  /** An extra class of the `aside` (the screen's own hook, `med-panneau` for E-19). */
  classe?: string;
  children: ReactNode;
}) {
  const ouvrant = useRef<HTMLElement | null>(null);
  const racine = useRef<HTMLElement>(null);
  if (ouvrant.current === null && typeof document !== 'undefined') ouvrant.current = document.activeElement as HTMLElement | null;
  useEffect(() => {
    // Focus enters the panel so that Escape reaches it; a field already focused inside keeps it.
    if (racine.current && !racine.current.contains(document.activeElement)) racine.current.focus({ preventScroll: true });
    const o = ouvrant.current;
    return () => {
      queueMicrotask(() => o?.isConnected && o.focus());
    };
  }, []);
  return (
    <aside ref={racine} tabIndex={-1} className={`panneau-lateral${classe ? ` ${classe}` : ''}`} aria-label={nom} onKeyDown={(e) => e.key === 'Escape' && echap && onFermer()}>
      <div className="panneau-lateral-tete">
        <span className="panneau-lateral-libelle"><Icone size={14} strokeWidth={1.75} aria-hidden="true" />{libelle}</span>
        <button type="button" className="bouton-icone" aria-label="Fermer" title="Fermer" onClick={onFermer}>
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {children}
    </aside>
  );
}
