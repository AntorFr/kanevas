import { WifiOff } from 'lucide-react';

/**
 * The « Reconnexion… » pill of a played map (charte, `PastilleConnexion`), shared by E-30 and the player's E-29: shown while the
 * stream is down, neither focusable nor clickable. `classe` replaces the pill's own look (E-30 keeps its corner badge); `icone` is the Lucide `wifi-off` of the player's pill.
 */
export function PastilleConnexion({ classe = 'pastille-connexion', icone = true }: { classe?: string; icone?: boolean }) {
  return (
    <p className={classe} role="status">
      {icone && <WifiOff size={12} strokeWidth={1.75} aria-hidden="true" />}
      Reconnexion…
    </p>
  );
}
