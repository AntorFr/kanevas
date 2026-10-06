import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** One line of a menu: an action, a group title or a separator. */
export type EntreeMenu =
  | { libelle: string; icone?: LucideIcon; onChoisir: () => void; danger?: boolean; impossible?: boolean }
  | { separateur: true }
  | { titre: string };

const estAction = (e: EntreeMenu): e is Extract<EntreeMenu, { libelle: string }> => 'libelle' in e;

/**
 * Next focused index in a menu of `n` entries for an arrow key (↑ ↓ wrap, Home, End); `null` for any
 * other key. Pure: the keyboard rule of the menu, testable without a DOM.
 */
export function indexSuivant(n: number, courant: number, touche: string): number | null {
  if (n <= 0) return null;
  if (touche === 'ArrowDown') return (courant + 1) % n;
  if (touche === 'ArrowUp') return (courant - 1 + n) % n;
  if (touche === 'Home') return 0;
  if (touche === 'End') return n - 1;
  return null;
}

/**
 * Menu (charte, « Menu »): a trigger with `aria-haspopup="menu"` / `aria-expanded`, a `role="menu"`
 * of `role="menuitem"`. Opened from the keyboard the focus goes to the first entry; ↑ ↓ move,
 * Escape closes and gives the focus back, a click outside closes. An impossible entry is
 * `aria-disabled`: visible, reachable, inert.
 */
export function Menu({
  etiquette,
  declencheur,
  icone,
  entrees,
  aligne = 'fin',
}: {
  /** Accessible name of the trigger. */
  etiquette: string;
  /** Content of the trigger (an avatar and a name, for instance); absent: an icon-only trigger. */
  declencheur?: ReactNode;
  icone?: LucideIcon;
  entrees: EntreeMenu[];
  aligne?: 'debut' | 'fin';
}) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const idMenu = useId();
  const Icone = icone;

  const items = () => Array.from(racine.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const fermer = (rendreFocus: boolean) => {
    setOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  };

  // Opened: the focus goes to the first entry (a menu is opened to be used).
  useEffect(() => {
    if (ouvert) items()[0]?.focus();
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('pointerdown', dehors);
    return () => document.removeEventListener('pointerdown', dehors);
  }, [ouvert]);

  const toucheMenu = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return fermer(true);
    }
    if (e.key === 'Tab') return fermer(false);
    const liste = items();
    const suivant = indexSuivant(liste.length, liste.indexOf(document.activeElement as HTMLElement), e.key);
    if (suivant !== null) {
      e.preventDefault();
      liste[suivant]?.focus();
    }
  };

  return (
    <div className={`menu-racine ${aligne}`} ref={racine}>
      <button
        ref={bouton}
        type="button"
        className={declencheur ? 'menu-declencheur' : 'bouton-icone'}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? idMenu : undefined}
        aria-label={declencheur ? undefined : etiquette}
        title={declencheur ? undefined : etiquette}
        onClick={() => setOuvert(!ouvert)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !ouvert) {
            e.preventDefault();
            setOuvert(true);
          }
        }}
      >
        {declencheur ?? (Icone && <Icone size={16} strokeWidth={1.75} aria-hidden="true" />)}
      </button>
      {ouvert && (
        <div className="menu" role="menu" id={idMenu} aria-label={etiquette} onKeyDown={toucheMenu}>
          {entrees.map((e, i) => {
            if ('separateur' in e) return <div key={i} className="menu-separateur" role="separator" />;
            if (!estAction(e)) {
              return (
                <div key={i} className="menu-titre" role="presentation">
                  {e.titre}
                </div>
              );
            }
            const I = e.icone;
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`menu-entree${e.danger ? ' danger' : ''}`}
                aria-disabled={e.impossible || undefined}
                onClick={() => {
                  if (e.impossible) return;
                  fermer(true);
                  e.onChoisir();
                }}
              >
                {I && <I size={16} strokeWidth={1.75} aria-hidden="true" />}
                {e.libelle}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
