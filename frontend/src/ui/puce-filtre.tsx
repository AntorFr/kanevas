import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

/** Filter chip (charte, « Puce de filtre »): a toggle button, several at once; the pressed state also shows a check, never colour alone. */
export function PuceFiltre({ actif, onChange, children }: { actif: boolean; onChange: (actif: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" className={`puce-filtre${actif ? ' actif' : ''}`} aria-pressed={actif} onClick={() => onChange(!actif)}>
      {actif && <Check size={12} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  );
}
