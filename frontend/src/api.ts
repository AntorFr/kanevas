import { useSyncExternalStore } from 'react';

/** Network state: true once a request failed to reach the server, until one succeeds again. */
let perdue = typeof navigator !== 'undefined' && navigator.onLine === false;
const abonnes = new Set<() => void>();

let sonde: ReturnType<typeof setInterval> | undefined;

/** While the connection is lost, ping the public /healthz: any answer means the server is back. */
async function sonder() {
  try {
    await fetch('/healthz', { cache: 'no-store' });
    definirPerdue(false);
  } catch {
    /* still unreachable: the next tick tries again */
  }
}

function definirPerdue(valeur: boolean) {
  if (perdue === valeur) return;
  perdue = valeur;
  if (valeur) {
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
export async function appeler<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(chemin, {
      method: methode,
      headers: corps === undefined ? undefined : { 'content-type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      credentials: 'same-origin',
    });
  } catch {
    definirPerdue(true);
    throw new ErreurApi(0, 'Connexion perdue.');
  }
  definirPerdue(false);
  if (reponse.status === 401) {
    window.location.assign('/'); // the server guard sends us to the sign-in
    throw new ErreurApi(401, 'Non authentifié.');
  }
  const texte = await reponse.text();
  const json = texte ? (JSON.parse(texte) as Record<string, unknown>) : {};
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
): { promesse: Promise<T>; annuler: () => void } {
  const xhr = new XMLHttpRequest();
  const promesse = new Promise<T>((resolve, reject) => {
    xhr.open('PUT', chemin);
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
      definirPerdue(false);
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
    corps.append('fichier', fichier);
    xhr.send(corps);
  });
  return { promesse, annuler: () => xhr.abort() };
}
