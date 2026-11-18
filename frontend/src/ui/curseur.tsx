import { CircleAlert } from 'lucide-react';
import { useId } from 'react';

/**
 * Slider (charte, « Curseur »), twin of `Champ`: visible label with the value beside it, the native range
 * input dressed (`.curseur` in ui.css), the error under it prefixed « Erreur : » and linked by `aria-describedby`.
 * The browser gives the arrows and the Page keys; `pas` defaults to 0.05.
 */
export function Curseur({
  etiquette,
  valeur,
  min,
  max,
  pas = 0.05,
  onChange,
  erreur,
  disabled,
  affichage,
}: {
  etiquette: string;
  valeur: number;
  min: number;
  max: number;
  pas?: number;
  onChange: (valeur: number) => void;
  erreur?: string;
  disabled?: boolean;
  /** How the value is written beside the label (default: the number as is). */
  affichage?: (valeur: number) => string;
}) {
  const id = useId();
  const idErreur = `${id}-e`;
  const part = max > min ? Math.min(100, Math.max(0, ((valeur - min) / (max - min)) * 100)) : 0;
  return (
    <div className="champ champ-curseur">
      <label className="lib-champ" htmlFor={id}>
        {etiquette}
        <output className="valeur-curseur" htmlFor={id}>
          {affichage ? affichage(valeur) : String(valeur)}
        </output>
      </label>
      <input
        id={id}
        className="curseur"
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        style={{ '--part': `${part}%` } as React.CSSProperties}
        disabled={disabled}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? idErreur : undefined}
        onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
      />
      {erreur && (
        <div className="pied-champ">
          <div className="erreur" id={idErreur}>
            <CircleAlert size={12} strokeWidth={2} aria-hidden="true" />
            <span>Erreur : {erreur}</span>
          </div>
        </div>
      )}
    </div>
  );
}
