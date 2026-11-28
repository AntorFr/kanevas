import { useId, useRef } from 'react';

/**
 * Segmented choice (charte, « Choix segmenté »): one exclusive choice among a few, `role="radiogroup"` named by a
 * visible label (or by `etiquette` when the surrounding text already says it), one `role="radio"` per segment,
 * a single tab stop, ← → move and select, Home/End go to the ends. `petit` is the 26 px version of a list line.
 */
export function ChoixSegmente<T extends string>({
  legende,
  etiquette,
  options,
  valeur,
  onChange,
  petit,
  disabled,
  decritPar,
}: {
  /** Visible label above the choice. */
  legende?: string;
  /** Accessible name when there is no visible label. */
  etiquette?: string;
  options: readonly { valeur: T; libelle: string; /** This segment cannot be picked (it stays shown, checked if it is the value). */ desactive?: boolean }[];
  valeur: T;
  onChange: (valeur: T) => void;
  petit?: boolean;
  disabled?: boolean;
  /** Id of the text that qualifies the group (a refusal under its line). */
  decritPar?: string;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const idLegende = useId();
  const courant = Math.max(0, options.findIndex((o) => o.valeur === valeur));

  function aller(i: number) {
    onChange(options[i]!.valeur);
    racine.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
  }
  function touche(ev: React.KeyboardEvent) {
    if (disabled) return;
    const n = options.length;
    // A disabled segment is skipped over.
    const pas = (depuis: number, sens: 1 | -1): number | null => {
      for (let k = 1; k <= n; k++) {
        const i = (((depuis + sens * k) % n) + n) % n;
        if (!options[i]!.desactive) return i;
      }
      return null;
    };
    let cible: number | null = null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') cible = pas(courant, 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') cible = pas(courant, -1);
    else if (ev.key === 'Home') cible = options[0]!.desactive ? pas(0, 1) : 0;
    else if (ev.key === 'End') cible = options[n - 1]!.desactive ? pas(n - 1, -1) : n - 1;
    if (cible === null) return;
    ev.preventDefault();
    aller(cible);
  }

  return (
    <div className="choix-segmente-groupe">
      {legende && (
        <span className="choix-segmente-legende" id={idLegende}>
          {legende}
        </span>
      )}
      <div
        ref={racine}
        className={`choix-segmente${petit ? ' petit' : ''}`}
        role="radiogroup"
        aria-labelledby={legende ? idLegende : undefined}
        aria-label={legende ? undefined : etiquette}
        aria-describedby={decritPar}
        onKeyDown={touche}
      >
        {options.map((o, i) => (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={o.valeur === valeur}
            tabIndex={i === courant ? 0 : -1}
            disabled={disabled || o.desactive}
            onClick={() => onChange(o.valeur)}
          >
            {o.libelle}
          </button>
        ))}
      </div>
    </div>
  );
}
