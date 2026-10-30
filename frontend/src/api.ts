import { useSyncExternalStore } from 'react';

/** Network state: true once a request failed to reach the server, until one succeeds again. */
let perdue = typeof navigator !== 'undefined' && navigator.onLine === false;
const abonnes = new Set<() => void>();

/** Counts the losses declared so far: an answer to a request sent before the last loss proves nothing. */
let pertes = 0;

let sonde: ReturnType<typeof setInterval> | undefined;

/** While the connection is lost, ping the public /healthz: any answer means the server is back. */
async function sonder() {
  const avant = pertes;
  try {
    await fetch('/healthz', { cache: 'no-store' });
    if (pertes === avant) definirPerdue(false);
  } catch {
    /* still unreachable: the next tick tries again */
  }
}

function definirPerdue(valeur: boolean) {
  // An in-flight response can arrive after `offline`; it cannot restore the connection.
  valeur = valeur || (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (perdue === valeur) return;
  perdue = valeur;
  if (valeur) {
    pertes++;
    sonde = setInterval(() => void sonder(), 3000);
  } else if (sonde !== undefined) {
    clearInterval(sonde);
    sonde = undefined;
  }
  abonnes.forEach((f) => f());
}

if (typeof window !== 'undefined') {
  if (perdue) sonde = setInterval(() => void sonder(), 3000);
  window.addEventListener('offline', () => definirPerdue(true));
  window.addEventListener('online', () => definirPerdue(false));
}

/** True while the connection is lost (banner shown, writing buttons disabled). */
export function useConnexionPerdue(): boolean {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => perdue,
  );
}

export class ErreurApi extends Error {
  constructor(
    public statut: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** JSON call to the backend. 401 means the session ended: go back through the sign-in. */
export async function appeler<T>(methode: string, chemin: string, corps?: unknown, delaiMs?: number): Promise<T> {
  let reponse: Response;
  const avant = pertes;
  const signal = delaiMs === undefined ? undefined : AbortSignal.timeout(delaiMs);
  try {
    reponse = await fetch(chemin, {
      method: methode,
      headers: corps === undefined ? undefined : { 'content-type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      credentials: 'same-origin',
      signal,
    });
  } catch {
    // A deadline we set ourselves is not a lost connection.
    if (signal?.aborted) throw new ErreurApi(0, 'Délai dépassé.');
    definirPerdue(true);
    throw new ErreurApi(0, 'Connexion perdue.');
  }
  // A reply that left the server before the connection dropped must not clear the loss declared since.
  if (pertes === avant) definirPerdue(false);
  if (reponse.status === 401) {
    window.location.assign('/'); // the server guard sends us to the sign-in
    throw new ErreurApi(401, 'Non authentifié.');
  }
  const texte = await reponse.text();
  let json: Record<string, unknown> = {};
  try {
    json = texte ? (JSON.parse(texte) as Record<string, unknown>) : {};
  } catch (erreur) {
    // Error pages may be HTML: preserve their HTTP status for the caller.
    if (reponse.ok) throw erreur;
  }
  if (!reponse.ok) {
    throw new ErreurApi(
      reponse.status,
      typeof json.message === 'string' ? json.message : 'Erreur.',
      typeof json.code === 'string' ? json.code : undefined,
    );
  }
  return json as T;
}

export const lire = <T,>(chemin: string) => appeler<T>('GET', chemin);

/**
 * Uploads one file (multipart, field « fichier ») with a progress callback — `fetch` cannot report an
 * upload. `annuler()` aborts it. A network failure lands in the shared « connexion perdue » state.
 */
export function envoyerFichier<T>(
  chemin: string,
  fichier: File,
  surProgres: (pourcent: number) => void,
  methode: 'PUT' | 'POST' = 'PUT',
  /** Form fields sent before the file: the server reads them before the stream. */
  champs: Record<string, string> = {},
): { promesse: Promise<T>; annuler: () => void } {
  const xhr = new XMLHttpRequest();
  const avant = pertes;
  const promesse = new Promise<T>((resolve, reject) => {
    xhr.open(methode, chemin);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) surProgres(Math.min(99, Math.floor((e.loaded / e.total) * 100)));
    };
    xhr.onerror = () => {
      definirPerdue(true);
      reject(new ErreurApi(0, 'Connexion perdue.'));
    };
    xhr.onabort = () => reject(new ErreurApi(-1, 'Envoi annulé.'));
    xhr.onload = () => {
      if (pertes === avant) definirPerdue(false);
      if (xhr.status === 401) {
        window.location.assign('/');
        return reject(new ErreurApi(401, 'Non authentifié.'));
      }
      let json: Record<string, unknown> = {};
      try {
        json = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : {};
      } catch {
        /* not JSON: the status speaks */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(json as T);
      reject(
        new ErreurApi(
          xhr.status,
          typeof json.message === 'string' ? json.message : 'Erreur.',
          typeof json.code === 'string' ? json.code : undefined,
        ),
      );
    };
    const corps = new FormData();
    for (const [nom, valeur] of Object.entries(champs)) corps.append(nom, valeur);
    corps.append('fichier', fichier);
    xhr.send(corps);
  });
  return { promesse, annuler: () => xhr.abort() };
}
