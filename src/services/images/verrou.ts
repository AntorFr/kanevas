/**
 * One engine at a time in the process (AD-88): calls queue in arrival order. A caller whose signal fires
 * while it waits leaves the queue without running.
 */
let queue: Promise<void> = Promise.resolve();

export async function sousVerrou<T>(signal: AbortSignal | undefined, tache: () => Promise<T>): Promise<T> {
  const precedent = queue;
  let liberer!: () => void;
  queue = new Promise<void>((r) => (liberer = r));
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
    precedent.then(liberer);
    throw e;
  }
  try {
    return await tache();
  } finally {
    liberer();
  }
}
