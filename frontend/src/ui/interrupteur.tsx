import type { LucideIcon } from 'lucide-react';

import { useConnexionPerdue } from '../api';

/**
 * Switch (charte, « Interrupteur »): `role="switch"` + `aria-checked`; the whole 40 px line is the
 * target, Space and Enter toggle it (native button). It writes aloud: the caller saves at once and
 * reverts `coche` if that fails. Disabled while the connection is lost when it `ecrit`.
 */
export function Interrupteur({
  etiquette,
  icone: Icone,
  coche,
  onChange,
  disabled,
  ecrit,
}: {
  etiquette: string;
  icone?: LucideIcon;
  coche: boolean;
  onChange: (valeur: boolean) => void;
  disabled?: boolean;
  ecrit?: boolean;
}) {
  const perdue = useConnexionPerdue();
  const inactif = Boolean(disabled) || Boolean(ecrit && perdue);
  return (
    <button
      type="button"
      role="switch"
      className="interrupteur"
      aria-checked={coche}
      aria-disabled={inactif || undefined}
      onClick={() => {
        if (!inactif) onChange(!coche);
      }}
    >
      <span className="interrupteur-libelle">
        {Icone && <Icone size={14} strokeWidth={1.75} aria-hidden="true" />}
        {etiquette}
      </span>
      <span className="interrupteur-piste" aria-hidden="true">
        <span className="interrupteur-bouton" />
      </span>
    </button>
  );
}
