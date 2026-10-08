import { useSyncExternalStore } from 'react';

/**
 * The assistant is mounted beside the router, in its own React root (one file, no edit of the
 * shell). It therefore reads the address itself and navigates the way the router listens to:
 * a history entry, then a `popstate` that the router takes as a navigation.
 */
const EVENEMENT = 'kanevas:adresse';

if (typeof window !== 'undefined') {
  for (const methode of ['pushState', 'replaceState'] as const) {
    const origine = window.history[methode].bind(window.history);
    window.history[methode] = (...args: Parameters<History['pushState']>) => {
      origine(...args);
      window.dispatchEvent(new Event(EVENEMENT));
    };
  }
}

function abonner(f: () => void) {
  window.addEventListener('popstate', f);
  window.addEventListener(EVENEMENT, f);
  return () => {
    window.removeEventListener('popstate', f);
    window.removeEventListener(EVENEMENT, f);
  };
}

export const useChemin = () => useSyncExternalStore(abonner, () => window.location.pathname);

/** The universe an address is inside, or null. */
export function universDe(chemin: string): number | null {
  const m = /^\/univers\/(\d+)(?:\/|$)/.exec(chemin);
  return m ? Number(m[1]) : null;
}

export function aller(url: string) {
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
