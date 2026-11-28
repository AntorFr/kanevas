import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One engine at a time in the process (AD-88): calls queue in arrival order. A caller whose signal fires
 * while it waits leaves the queue without running.
 */
let queue: Promise<void> = Promise.resolve();

/** Who holds the engine and how many wait: what the screen derives « moteur occupé » from (AD-battlemap-generation-3). */
let titulaire: string | undefined;
let attendants = 0;
const origine = new AsyncLocalStorage<string>();

/** Runs `f` so that any lock it takes is labelled `nom` (the batch runner is `lot`). */
export const sousOrigine = <T>(nom: string, f: () => T): T => origine.run(nom, f);

/** `par` is the label of the holder (`autre` when nobody labelled it); null while nobody holds the engine. */
export const etatVerrou = (): { occupe: boolean; par: string | null; attendants: number } =>
  ({ occupe: titulaire !== undefined, par: titulaire ?? null, attendants });

export async function sousVerrou<T>(signal: AbortSignal | undefined, tache: () => Promise<T>): Promise<T> {
  const precedent = queue;
  const nom = origine.getStore() ?? 'autre';
  let liberer!: () => void;
  queue = new Promise<void>((r) => (liberer = r));
  attendants += 1;
  try {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const onAbort = () => reject(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      precedent.then(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      });
    });
  } catch (e) {
    // We never ran: pass the turn on once the previous holder is done.
    attendants -= 1;
    precedent.then(liberer);
    throw e;
  }
  attendants -= 1;
  titulaire = nom;
  try {
    return await tache();
  } finally {
    titulaire = undefined;
    liberer();
  }
}
