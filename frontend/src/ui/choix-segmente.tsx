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
}: {
  /** Visible label above the choice. */
  legende?: string;
  /** Accessible name when there is no visible label. */
  etiquette?: string;
  options: readonly { valeur: T; libelle: string }[];
  valeur: T;
  onChange: (valeur: T) => void;
  petit?: boolean;
  disabled?: boolean;
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
    let cible: number | null = null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') cible = (courant + 1) % options.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') cible = (courant - 1 + options.length) % options.length;
    else if (ev.key === 'Home') cible = 0;
    else if (ev.key === 'End') cible = options.length - 1;
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
        onKeyDown={touche}
      >
        {options.map((o, i) => (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={o.valeur === valeur}
            tabIndex={i === courant ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.valeur)}
          >
            {o.libelle}
          </button>
        ))}
      </div>
    </div>
  );
}
