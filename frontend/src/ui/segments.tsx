import { useRef } from 'react';

/**
 * Segmented choice (charte, « Segments »): one exclusive choice among a few, `role="radiogroup"`
 * labelled by a legend, one `role="radio"` per segment, a single tab stop (the checked segment),
 * arrows move and select. Colours only through tokens (`.segments` in ui.css).
 */
export function Segments<T extends string>({
  legende,
  options,
  valeur,
  onChange,
  disabled,
}: {
  legende: string;
  options: readonly { valeur: T; libelle: string; /** Variant « compte »: a number after the label. */ compte?: number }[];
  valeur: T;
  onChange: (valeur: T) => void;
  disabled?: boolean;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const courant = Math.max(0, options.findIndex((o) => o.valeur === valeur));

  function touche(ev: React.KeyboardEvent) {
    const pas = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
    if (!pas || disabled) return;
    ev.preventDefault();
    const suivant = (courant + pas + options.length) % options.length;
    onChange(options[suivant]!.valeur);
    racine.current?.querySelectorAll<HTMLElement>('[role="radio"]')[suivant]?.focus();
  }

  return (
    <fieldset className="segments-groupe">
      <legend>{legende}</legend>
      <div ref={racine} className="segments" role="radiogroup" aria-label={legende} onKeyDown={touche}>
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
            {o.compte !== undefined && <span className="segment-compte">{o.compte}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
