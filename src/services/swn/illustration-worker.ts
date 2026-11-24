// The worker thread of the illustration render (AD-carte-2): loads the Wasm core, draws one body, encodes it as WebP and
// posts the bytes back. It reads nothing but its `workerData`; a failure posts a bare marker, never the cause.
import { parentPort, workerData } from 'node:worker_threads';

import { chargerModule } from '../../wasm/charger.js';
import { encoderWebp } from './webp.js';

interface Coeur { dessiner_astre(aspect: string, cote: number, version: number, angle?: number, lumiere?: string): Uint8Array }

try {
  const { aspectJson, cote, versionRendu, angle, lumiere } = workerData as { aspectJson: string; cote: number; versionRendu: number; angle?: number; lumiere?: string };
  const coeur = await chargerModule<Coeur>('coeur');
  const rgba = coeur.dessiner_astre(aspectJson, cote, versionRendu, angle, lumiere);
  const webp = encoderWebp(rgba, cote, cote);
  const octets = new Uint8Array(webp.buffer, webp.byteOffset, webp.byteLength).slice();
  parentPort?.postMessage({ ok: true, octets }, [octets.buffer]);
} catch {
  parentPort?.postMessage({ ok: false });
}
