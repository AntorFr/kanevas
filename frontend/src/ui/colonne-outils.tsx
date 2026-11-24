import type { LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import './carte-editeur.css';

export interface EntreeOutil<T extends string> { valeur: T; libelle: string; touche: string; icone: LucideIcon }

/**
 * Tool column (charte, « Colonne d'outils »): a vertical `toolbar` of 40 px cells, one tab stop (the active tool), ↑ ↓ move
 * and select, wrapping. The active state is `aria-checked` and the outline, not the tint alone.
 */
export function ColonneOutils<T extends string>({
  outils, actif, onChoisir, pied,
}: {
  outils: readonly EntreeOutil<T>[];
  actif: T;
  onChoisir: (valeur: T) => void;
  /** Below the tools: the « Aimanter » switch. */
  pied?: ReactNode;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const courant = Math.max(0, outils.findIndex((o) => o.valeur === actif));

  function touche(ev: React.KeyboardEvent) {
    const pas = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
    if (!pas) return;
    ev.preventDefault();
    const suivant = (courant + pas + outils.length) % outils.length;
    onChoisir(outils[suivant]!.valeur);
    racine.current?.querySelectorAll<HTMLElement>('[role="radio"]')[suivant]?.focus();
  }

  return (
    <div ref={racine} className="colonne-outils" role="toolbar" aria-orientation="vertical" aria-label="Outils de la carte" onKeyDown={touche}>
      {outils.map((o, i) => (
        <button
          key={o.valeur}
          type="button"
          role="radio"
          aria-checked={o.valeur === actif}
          aria-label={o.libelle}
          title={`${o.libelle} (${o.touche})`}
          tabIndex={i === courant ? 0 : -1}
          className={`outil-cellule${o.valeur === actif ? ' actif' : ''}`}
          onClick={() => onChoisir(o.valeur)}
        >
          <o.icone size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
      {pied && <div className="colonne-outils-pied">{pied}</div>}
    </div>
  );
}
