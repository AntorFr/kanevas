import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Standalone acceptance client: no server module, database, environment or stored token.
const keyed = z.object({ cle: z.string().min(1) }).passthrough();
const sheet = keyed.extend({ parent: z.string().nullable().optional() });
const sampleSchema = z.object({
  fichiers: z.array(z.object({
    cle: z.string(), chemin: z.string(), nom: z.string(),
    visibilite: z.enum(['joueurs', 'mj']),
  })).default([]),
  campagnes: z.array(keyed).default([]),
  fiches: z.array(sheet).default([]),
  relations: z.array(z.object({
    fiche: z.string(),
    // `{section, cible, nature?, qualificatif?}`; `type` is the deprecated name of `qualificatif` (AD-134).
    entrees: z.array(z.object({
      section: z.string(), cible: z.string(),
      nature: z.string().optional(), qualificatif: z.string().optional(), type: z.string().optional(),
    }).passthrough()),
  })).default([]),
  scenarios: z.array(keyed.extend({ campagne: z.string() })).default([]),
});

/** Stable parent-first order, preserving the deliberate late-link and report order. */
function parentFirst(sheets: z.infer<typeof sheet>[]) {
  const byKey = new Map(sheets.map((s) => [s.cle, s]));
  if (byKey.size !== sheets.length) throw new Error('Duplicate sheet key in sample.');
  const active = new Set<string>();
  const done = new Set<string>();
  const ordered: typeof sheets = [];
  const visit = (s: (typeof sheets)[number]) => {
    if (done.has(s.cle)) return;
    if (active.has(s.cle)) throw new Error('Parent cycle in sample.');
    active.add(s.cle);
    const parent = s.parent ? byKey.get(s.parent) : undefined;
    if (parent) visit(parent);
    active.delete(s.cle);
    done.add(s.cle);
    ordered.push(s);
  };
  sheets.forEach(visit);
  return ordered;
}

async function main() {
  const [address, universe, token, samplePath, ...extra] = process.argv.slice(2);
  if (!address || !universe || !token || extra.length || !/^\d+$/.test(universe) || Number(universe) < 1) {
    throw new Error('Usage: npm run import:echantillon -- <url> <universId> <jeton> [sample.json]');
  }
  const origin = new URL(address);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password
    || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('Expected an HTTP(S) application origin.');
  }
  const path = samplePath ? resolve(samplePath)
    : fileURLToPath(new URL('./echantillon/echantillon.json', import.meta.url));
  const sample = sampleSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const sheets = parentFirst(sample.fiches);
  // Read all local assets before opening a batch: a missing file must not leave partial work.
  const files = await Promise.all(sample.fichiers.map(async (f) => ({
    ...f, bytes: await readFile(resolve(dirname(path), f.chemin)),
  })));
  const base = new URL(`/api/import/v1/univers/${universe}`, origin).href;
  const request = async (route: string, method: string, body?: unknown, allowRefusal = false) => {
    let response: Response;
    try {
      response = await fetch(base + route, {
        method, redirect: 'error', signal: AbortSignal.timeout(120_000),
        headers: { Authorization: `Bearer ${token}`,
          ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
    } catch {
      throw new Error('Import connection failed; rerun to resume the open batch.');
    }
    if (!response.ok && !(allowRefusal && [400, 404, 413].includes(response.status))) {
      throw new Error(`Import request failed (HTTP ${response.status}); rerun to resume the open batch.`);
    }
    return response.json();
  };
  const batch = await request('/lots', 'POST') as { lotId: number };
  if (!Number.isSafeInteger(batch.lotId)) throw new Error('Invalid batch response.');
  const counted = (route: string) => `${route}?lot=${batch.lotId}`;
  const key = encodeURIComponent;
  for (const f of files) {
    const form = new FormData();
    form.set('visibilite', f.visibilite);
    form.set('nom', f.nom);
    form.set('fichier', new Blob([new Uint8Array(f.bytes)]), f.nom);
    await request(counted(`/fichiers/${key(f.cle)}`), 'PUT', form, true);
  }
  for (const { cle, ...body } of sample.campagnes) {
    await request(counted(`/campagnes/${key(cle)}`), 'PUT', body, true);
  }
  for (const { cle, ...body } of sheets) {
    await request(counted(`/fiches/${key(cle)}`), 'PUT', body, true);
  }
  for (const r of sample.relations) {
    await request(counted(`/fiches/${key(r.fiche)}/relations`), 'POST', r.entrees, true);
  }
  for (const { campagne, cle, ...body } of sample.scenarios) {
    await request(counted(`/campagnes/${key(campagne)}/scenarios/${key(cle)}`), 'PUT', body, true);
  }
  const report = await request(`/lots/${batch.lotId}/clore`, 'POST') as {
    compteurs: Record<string, { creees: number; mises_a_jour: number; inchangees: number; refusees: number }>;
    avertissements: number; enAttente: number;
    rapport: { cle: string; gravite: string; raison: string }[];
  };
  const names: Record<string, string> = {
    fiches: 'Fiches', fichiers: 'Fichiers', campagnes: 'Campagnes', scenarios: 'Scénarios', relations: 'Relations',
  };
  console.log(`Lot ${batch.lotId}`);
  let refused = 0;
  for (const [nature, c] of Object.entries(report.compteurs)) {
    const feminine = !['fichiers', 'scenarios'].includes(nature);
    const agreement = (word: string, n: number) => word + (feminine ? 'e' : '') + (n > 1 ? 's' : '');
    const updated = feminine ? (c.mises_a_jour > 1 ? 'mises' : 'mise') : 'mis';
    console.log(`${names[nature] ?? nature} : ${c.creees} ${agreement('créé', c.creees)}, ${c.mises_a_jour} ${updated} à jour, ${c.inchangees} ${agreement('inchangé', c.inchangees)}, ${c.refusees} ${agreement('refusé', c.refusees)}`);
    refused += c.refusees;
  }
  console.log(`Avertissements : ${report.avertissements} ; liens et références en attente : ${report.enAttente}`);
  for (const entry of report.rapport) {
    // Even an unexpected server message must not echo the supplied credential.
    console.log(`${entry.gravite} — ${entry.cle} : ${entry.raison}`.replaceAll(token, '[redacted]'));
  }
  if (refused) process.exitCode = 1;
}

main().catch((error: unknown) => {
  // Validation errors can contain arbitrary input: print only our own fixed diagnostics.
  const message = error instanceof z.ZodError || error instanceof SyntaxError
    ? 'Invalid sample JSON.' : error instanceof Error && !(error instanceof TypeError)
      && !('code' in error) ? error.message : 'Unable to read the sample or run the import.';
  const token = process.argv[4];
  console.error(token ? message.replaceAll(token, '[redacted]') : message);
  process.exitCode = 1;
});
