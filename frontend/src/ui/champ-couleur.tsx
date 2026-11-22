import { Champ } from './composants';

const FORME = /^#[0-9a-f]{6}$/i;

/** Whether the text is a `#rrggbb` colour. */
export const couleurValide = (texte: string): boolean => FORME.test(texte);

/**
 * Colour field (charte, « Champ couleur »): a 30 px square filled with the typed colour, then a monospace
 * `Champ` that always shows the hex (the square is decoration, colour is never alone). An invalid entry
 * leaves the square empty and gives « Couleur invalide : #rrggbb. » unless the caller sends its own `erreur`.
 */
export function ChampCouleur({
  etiquette,
  valeur,
  onChange,
  erreur,
  disabled,
}: {
  etiquette: string;
  valeur: string;
  onChange: (valeur: string) => void;
  erreur?: string;
  disabled?: boolean;
}) {
  const ok = couleurValide(valeur);
  const message = erreur ?? (valeur !== '' && !ok ? 'Couleur invalide : #rrggbb.' : undefined);
  return (
    <div className="champ-couleur">
      <span className={`pastille-couleur${ok ? '' : ' vide'}`} aria-hidden="true" style={ok ? { background: valeur } : undefined} />
      <Champ
        etiquette={etiquette}
        erreur={message}
        value={valeur}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        maxLength={7}
        placeholder="#rrggbb"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.currentTarget.value)}
      />
    </div>
  );
}
