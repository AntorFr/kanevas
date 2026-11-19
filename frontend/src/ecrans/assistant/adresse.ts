import { useEffect, useState, useSyncExternalStore } from 'react';

import { lire } from '../../api';

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

/** The universe reference of an address (an id or a readable key, B-101), or null outside a universe. */
export function refUniversDe(chemin: string): string | null {
  const m = /^\/univers\/([^/]+)(?:\/|$)/.exec(chemin);
  return m && m[1] !== 'nouveau' ? decodeURIComponent(m[1]!) : null;
}

/** The universe an address is inside, or null (a key waits for the list of universes, B-101). */
export function universDe(chemin: string): number | null {
  const ref = refUniversDe(chemin);
  return ref !== null && /^\d+$/.test(ref) ? Number(ref) : null;
}

/**
 * The id of the universe the address is in. A readable address carries the universe's key: the assistant,
 * mounted beside the router, resolves it through the account's list (`GET /api/univers`), read again when the
 * key is not in the list it has (a key just changed).
 */
export function useUniversId(chemin: string): number | null {
  const ref = refUniversDe(chemin);
  const direct = universDe(chemin);
  const [trouves, setTrouves] = useState<Record<string, number>>({});
  useEffect(() => {
    if (ref === null || direct !== null || trouves[ref] !== undefined) return;
    let actif = true;
    lire<{ id: number; cle?: string }[]>('/api/univers').then(
      (liste) => {
        if (!actif) return;
        const u = liste.find((x) => x.cle === ref);
        if (u) setTrouves((t) => ({ ...t, [ref]: u.id }));
      },
      () => undefined,
    );
    return () => {
      actif = false;
    };
  }, [ref, direct, trouves]);
  return direct ?? (ref !== null ? (trouves[ref] ?? null) : null);
}

export function aller(url: string) {
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
