// The illustration of a body (AD-carte-2): one read under the guard of `lireInterieur`, then a WebP drawn by the Wasm core in
// a worker thread (never on the request thread), two renders at a time, kept in a derived cache on the volume (AD-142).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import { cacheAstresDir } from '../../config/env.js';
import type { Db } from '../../db/db.js';
import { chargerModule } from '../../wasm/charger.js';
import { ErreurService, introuvable } from '../erreurs.js';
import { ecrireDerive } from '../stockage.js';
import type { Acteur } from '../types.js';
import { lireInterieur } from './interieur.js';

export const COTE_MIN = 64;
export const COTE_MAX = 2048;
/** Renders in progress at once; the next ones wait their turn (no error). */
export const RENDUS_SIMULTANES = 2;
const DELAI_RENDU_MS = 60_000;

interface Coeur { version_rendu(): number }

let coeur: Coeur | undefined;
try {
  coeur = await chargerModule<Coeur>('coeur');
} catch {
  coeur = undefined;
}

/** Draws `aspectJson` at `cote` pixels and returns the WebP bytes; rejects on any failure. */
export type Rendeur = (aspectJson: string, cote: number, versionRendu: number) => Promise<Uint8Array>;

export interface DepsIllustration {
  /** Replaces the worker (tests). It still runs under the queue. */
  rendre?: Rendeur;
  /** Replaces the cache directory (tests). */
  racine?: string;
  /** Replaces the version of the renderer (tests). */
  versionRendu?: number;
}

export interface IllustrationVue {
  /** The value of the `ETag` header, quoted. */
  etag: string;
  type: 'image/webp';
  /** The image; `null` when the caller already holds it (`siEtag` matches): nothing was read nor rendered. */
  octets: Buffer | null;
}

/** The worker: a thread of its own per render, so a crash or a hang costs only that render. */
const rendreParWorker: Rendeur = (aspectJson, cote, versionRendu) => new Promise((resolve, reject) => {
  const ici = fileURLToPath(import.meta.url);
  const fichier = pathToFileURL(join(dirname(ici), `illustration-worker${ici.endsWith('.ts') ? '.ts' : '.js'}`)).href;
  // `eval` so that one call serves the compiled server and the sources: from `.ts` (tests, `npm run dev`) the thread registers tsx first.
  const charge = ici.endsWith('.ts')
    ? `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify(fichier)}); })`
    : `import(${JSON.stringify(fichier)})`;
  const worker = new Worker(charge, { eval: true, workerData: { aspectJson, cote, versionRendu } });
  let fini = false;
  const finir = (fn: () => void) => {
    if (fini) return;
    fini = true;
    clearTimeout(minuteur);
    void worker.terminate();
    fn();
  };
  const minuteur = setTimeout(() => finir(() => reject(new Error('timeout'))), DELAI_RENDU_MS);
  worker.once('message', (m: { ok: boolean; octets?: Uint8Array }) => finir(() => (m.ok && m.octets ? resolve(m.octets) : reject(new Error('render')))));
  worker.once('error', () => finir(() => reject(new Error('render'))));
  worker.once('exit', () => finir(() => reject(new Error('render'))));
});

// A queue shared by the process: at most `RENDUS_SIMULTANES` renders run, whatever renderer does the work.
let enCours = 0;
const attente: Array<() => void> = [];
async function sousFile<T>(travail: () => Promise<T>): Promise<T> {
  if (enCours >= RENDUS_SIMULTANES) await new Promise<void>((suite) => attente.push(suite));
  else enCours++;
  try {
    return await travail();
  } finally {
    const suivant = attente.shift();
    if (suivant) suivant(); // the slot passes to the next one
    else enCours--;
  }
}

// The same picture asked twice at once is rendered once.
const enVol = new Map<string, Promise<Buffer>>();

/** JSON with the keys sorted at every level: the same aspect always gives the same text. */
function canonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonique(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

const indisponible = () => new ErreurService('indisponible', 'Illustration indisponible.', 'indisponible');

/** Whether a `If-None-Match` header names this entity tag (`*`, a list, weak or strong). */
export function etagCorrespond(siAucune: string | undefined, etag: string): boolean {
  if (!siAucune) return false;
  return siAucune.split(',').map((t) => t.trim().replace(/^W\//, '')).some((t) => t === '*' || t === etag);
}

/**
 * The picture of the body `cle` of the system at `(q, r)`, `cote` pixels wide. The guards are those of `lireInterieur`
 * (unknown hexagon, hidden system, unknown `cle`: the same `introuvable`); a `cote` that is not an integer in [64, 2048] is
 * `invalide` (`champ: 'cote'`). A render that fails is `indisponible`, with no cause and no half file.
 */
export async function illustrationAstre(
  db: Db, acteur: Acteur, universId: number, galaxieId: number, q: number, r: number, cle: string, cote: number,
  options: { siEtag?: string } = {}, deps: DepsIllustration = {},
): Promise<IllustrationVue> {
  const interieur = lireInterieur(db, acteur, universId, galaxieId, q, r);
  const astre = interieur.astres.find((a) => a.cle === cle);
  if (!astre) throw introuvable();
  if (!Number.isInteger(cote) || cote < COTE_MIN || cote > COTE_MAX) {
    throw new ErreurService('invalide', `La taille de l'illustration doit être un entier entre ${COTE_MIN} et ${COTE_MAX}.`, undefined, 'cote');
  }
  const version = deps.versionRendu ?? coeur?.version_rendu();
  if (version === undefined) throw indisponible();
  const aspect = { type: astre.type, taille: astre.taille, aspect: astre.aspect };
  const hash = createHash('sha256').update(`${version}\n${canonique(aspect)}\n${cote}`).digest('hex');
  const etag = `"${hash}"`;
  if (etagCorrespond(options.siEtag, etag)) return { etag, type: 'image/webp', octets: null };

  const racine = deps.racine ?? cacheAstresDir;
  const nom = `${hash}.webp`;
  try {
    return { etag, type: 'image/webp', octets: await octetsDe(racine, nom, JSON.stringify(aspect), cote, version, deps.rendre ?? rendreParWorker) };
  } catch {
    throw indisponible();
  }
}

async function octetsDe(racine: string, nom: string, aspectJson: string, cote: number, version: number, rendre: Rendeur): Promise<Buffer> {
  try {
    return await readFile(join(racine, nom));
  } catch {
    // Not cached (or unreadable): render it.
  }
  const cle = join(racine, nom);
  const deja = enVol.get(cle);
  if (deja) return deja;
  const travail = sousFile(async () => {
    const octets = Buffer.from(await rendre(aspectJson, cote, version));
    await ecrireDerive(racine, nom, octets);
    return octets;
  }).finally(() => enVol.delete(cle));
  enVol.set(cle, travail);
  return travail;
}
