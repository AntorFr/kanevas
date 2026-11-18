/**
 * The live client of a played map (AD-159, AD-battlemap-table-6), shared by the GM's table (E-29) and the display (E-30).
 *
 * It opens the `…/flux` stream (an `EventSource`, which sends `Last-Event-ID` itself when it reconnects). The frames carry only
 * versions and a count, so each `maj` is a signal to refetch the filtered state with `recharger`. The server sends a `maj` on
 * opening and a named `battement` every 20 s: a stream that gives no initial `maj` within 4 s, or nothing at all for 30 s,
 * is closed and replaced by a poll of `recharger` every 3 s, for the rest of the page's life. A healthy but quiet stream never falls back.
 */

export type EtatConnexion = 'connexion' | 'direct' | 'sondage' | 'perdue';

/** The part of `EventSource` used here (a fake one in the tests). */
export interface SourceFlux {
  addEventListener(type: string, ecouteur: (e: { data?: string }) => void): void;
  close(): void;
  onerror: ((e: unknown) => void) | null;
}

export interface Minuteries {
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(f: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface OptionsDirect {
  /** `/api/univers/:id/outils/battlemap/cartes/:cid/flux` (with `?role=affichage` for the display). */
  url: string;
  /** Refetches the filtered state (`GET …/table`); a rejection means the server is unreachable. */
  recharger: () => Promise<unknown> | unknown;
  surEtat?: (etat: EtatConnexion) => void;
  /** GM only: the number of display streams open. */
  surPresence?: (affichages: number) => void;
  fabrique?: (url: string) => SourceFlux;
  minuteries?: Minuteries;
}

export interface Direct {
  fermer(): void;
  etat(): EtatConnexion;
}

export const DELAI_MAJ_INITIAL = 4000;
export const DELAI_SILENCE = 30000;
export const PERIODE_SONDAGE = 3000;

const minuteriesDuNavigateur: Minuteries = {
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (f, ms) => setInterval(f, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

export function ouvrirDirect(o: OptionsDirect): Direct {
  const m = o.minuteries ?? minuteriesDuNavigateur;
  const fabrique = o.fabrique ?? ((url: string) => new EventSource(url) as unknown as SourceFlux);
  let etat: EtatConnexion = 'connexion';
  let ferme = false;
  let source: SourceFlux | null = null;
  let delaiInitial: unknown = null;
  let silence: unknown = null;
  let sondage: unknown = null;
  let enCours = false;
  let encore = false;

  const changer = (e: EtatConnexion) => {
    if (etat === e) return;
    etat = e;
    o.surEtat?.(e);
  };

  /** One refetch at a time; a signal that arrives meanwhile asks for one more (the state read may be older than it). */
  async function recharger(): Promise<boolean> {
    if (enCours) { encore = true; return true; }
    enCours = true;
    let ok = true;
    try {
      do {
        encore = false;
        try { await o.recharger(); } catch { ok = false; }
      } while (encore && !ferme);
    } finally {
      enCours = false;
    }
    return ok;
  }

  const armerSilence = () => {
    if (silence !== null) m.clearTimeout(silence);
    silence = m.setTimeout(basculer, DELAI_SILENCE);
  };

  function basculer(): void {
    if (ferme || sondage !== null) return;
    if (delaiInitial !== null) { m.clearTimeout(delaiInitial); delaiInitial = null; }
    if (silence !== null) { m.clearTimeout(silence); silence = null; }
    source?.close();
    source = null;
    changer('sondage');
    sondage = m.setInterval(() => {
      void recharger().then((ok) => { if (!ferme) changer(ok ? 'sondage' : 'perdue'); });
    }, PERIODE_SONDAGE);
    void recharger();
  }

  function ouvrir(): void {
    const s = fabrique(o.url);
    source = s;
    delaiInitial = m.setTimeout(basculer, DELAI_MAJ_INITIAL);
    armerSilence();
    const vivant = () => { if (ferme || source !== s) return false; armerSilence(); return true; };
    s.addEventListener('maj', () => {
      if (!vivant()) return;
      if (delaiInitial !== null) { m.clearTimeout(delaiInitial); delaiInitial = null; }
      changer('direct');
      void recharger().then((ok) => { if (!ferme && !ok) changer('perdue'); });
    });
    s.addEventListener('battement', () => { vivant(); });
    s.addEventListener('presence', (e) => {
      if (!vivant()) return;
      try {
        const n = (JSON.parse(e.data ?? '{}') as { affichages?: unknown }).affichages;
        if (typeof n === 'number') o.surPresence?.(n);
      } catch { /* a malformed frame says nothing */ }
    });
    // The browser reconnects by itself (and sends `Last-Event-ID`); the server's `maj` on opening then refetches everything.
    s.onerror = () => { if (!ferme && source === s && sondage === null) changer('perdue'); };
  }

  ouvrir();
  return {
    etat: () => etat,
    fermer() {
      ferme = true;
      if (delaiInitial !== null) m.clearTimeout(delaiInitial);
      if (silence !== null) m.clearTimeout(silence);
      if (sondage !== null) m.clearInterval(sondage);
      source?.close();
      source = null;
    },
  };
}

/** What `avecReprise` raises on a second `conflit`: the screen says « Cette table a changé » with « Recharger ». */
export class TableChangee extends Error {
  constructor() { super('Cette table a changé'); }
}

/**
 * A GM's write: the commands are absolute (set a position, reveal a rect), so on `conflit` the state is refetched and the batch
 * sent once more at the new version; a second `conflit` is `TableChangee`. `envoyer` gets the version to write at.
 */
export async function avecReprise<T>(envoyer: () => Promise<T>, recharger: () => Promise<unknown>): Promise<T> {
  const conflit = (e: unknown) => typeof e === 'object' && e !== null && (e as { statut?: unknown }).statut === 409;
  try {
    return await envoyer();
  } catch (e) {
    if (!conflit(e)) throw e;
  }
  await recharger();
  try {
    return await envoyer();
  } catch (e) {
    if (conflit(e)) throw new TableChangee();
    throw e;
  }
}
