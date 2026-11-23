// Review tests of kanevas-battlemap-assistant-direction: POST direction/annuler and the source / peutAnnuler of the direction read (B-98).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { JETON_BOUCHON, semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');
const { pngPlat } = await import('../../bouchon/png-plat.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monde(activer = true) {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-routes-')));
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'mira', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const antor = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  // the seed already switches the tool on for the system of « Éneria d'essai »
  // the seed also switches generation on, which depends on the library: off before it, on after it
  if (!activer) poserActivation(app.db, antor, { niveau: 'systeme', id: S }, 'battlemap/generation', false);
  poserActivation(app.db, antor, { niveau: 'systeme', id: S }, 'battlemap/assets', activer);
  const R = `/api/univers/${E}/outils/battlemap`;
  const req = (method: M, who: string | null, url: string, payload?: any, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...(who ? h[who] : {}), ...headers }, payload });
  /** A multipart body with one file (and optional fields before it). */
  const multi = (nom: string, octets: Buffer, champs: Record<string, string> = {}) => {
    const b = '----bmtest';
    const parts: Buffer[] = [];
    for (const [k, v] of Object.entries(champs)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(octets, Buffer.from(`\r\n--${b}--\r\n`));
    return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
  };
  const envoyer = (who: string, url: string, nom: string, octets: Buffer, champs?: Record<string, string>) => {
    const m = multi(nom, octets, champs);
    return app.inject({ method: 'POST', url, headers: { ...h[who], ...m.headers }, payload: m.payload });
  };
  return { app, E, S, R, req, h, envoyer };
}
const png = (n: number) => pngPlat([n, 10, 10], 8);

const { ecrireDirection } = await import('../../services/battlemap-direction.js');

test('POST direction/annuler : rétablit le texte précédent, source mj, version +1, lecture à jour', async () => {
  const w = await monde();
  const antor = { compteId: one(w.app, "SELECT id FROM comptes WHERE username='antor'").id as number };
  const d0 = (await w.req('GET', 'antor', `${w.R}/direction`)).json();
  assert.deepEqual([d0.source, d0.peutAnnuler].length, 2);
  const avant = d0.texte as string;
  const v = ecrireDirection(w.app.db, antor, w.E, 'Texte de l’assistant', d0.version, 'assistant');
  const lu = (await w.req('GET', 'antor', `${w.R}/direction`)).json();
  assert.deepEqual([lu.source, lu.peutAnnuler, lu.texte], ['assistant', true, 'Texte de l’assistant']);
  const r = await w.req('POST', 'antor', `${w.R}/direction/annuler`, { version: v.version });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual([r.json().texte, r.json().source, r.json().peutAnnuler, r.json().version], [avant, 'mj', false, v.version + 1]);
  const row = one(w.app, 'SELECT texte, texte_precedent, source, version FROM bm_direction WHERE univers_id = ?', w.E);
  assert.deepEqual(row, { texte: avant, texte_precedent: null, source: 'mj', version: v.version + 1 });
  const second = await w.req('POST', 'antor', `${w.R}/direction/annuler`, { version: v.version + 1 });
  assert.equal(second.statusCode, 409, second.body);
  assert.equal(second.json().code, 'rien_a_retablir');
});

test('POST direction/annuler : version périmée 409 (champ version), corps sans version 4xx, rien ne bouge', async () => {
  const w = await monde();
  const antor = { compteId: one(w.app, "SELECT id FROM comptes WHERE username='antor'").id as number };
  const d0 = (await w.req('GET', 'antor', `${w.R}/direction`)).json();
  const v = ecrireDirection(w.app.db, antor, w.E, 'Par l’assistant', d0.version, 'assistant');
  const perime = await w.req('POST', 'antor', `${w.R}/direction/annuler`, { version: v.version - 1 });
  assert.equal(perime.statusCode, 409, perime.body);
  assert.equal(perime.json().champ, 'version');
  for (const payload of [{}, { version: 'x' }, undefined]) {
    const r = await w.req('POST', 'antor', `${w.R}/direction/annuler`, payload);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `${JSON.stringify(payload)} ${r.statusCode}`);
  }
  const row = one(w.app, 'SELECT texte, source, version FROM bm_direction WHERE univers_id = ?', w.E);
  assert.deepEqual([row.texte, row.source, row.version], ['Par l’assistant', 'assistant', v.version]);
});

test('PUT du MJ à la main repasse source à mj ; la lecture le dit', async () => {
  const w = await monde();
  const antor = { compteId: one(w.app, "SELECT id FROM comptes WHERE username='antor'").id as number };
  const d0 = (await w.req('GET', 'antor', `${w.R}/direction`)).json();
  const v = ecrireDirection(w.app.db, antor, w.E, 'Assistant', d0.version, 'assistant');
  const put = await w.req('PUT', 'antor', `${w.R}/direction`, { texte: 'Assistant retouché', version: v.version });
  assert.equal(put.statusCode, 200, put.body);
  assert.deepEqual([put.json().source, put.json().peutAnnuler, put.json().textePrecedent], ['mj', true, 'Assistant']);
});

test('POST direction/annuler : joueur, étranger à l’univers, anonyme → 404 ; MJ en mode joueur → 403 ; rien ne bouge', async () => {
  const w = await monde();
  const antor = { compteId: one(w.app, "SELECT id FROM comptes WHERE username='antor'").id as number };
  const d0 = (await w.req('GET', 'antor', `${w.R}/direction`)).json();
  const v = ecrireDirection(w.app.db, antor, w.E, 'Assistant', d0.version, 'assistant');
  const url = `${w.R}/direction/annuler`;
  for (const who of ['lea', 'teo']) assert.equal((await w.req('POST', who, url, { version: v.version })).statusCode, 404, who);
  const anonyme = await w.req('POST', null, url, { version: v.version });
  assert.ok(anonyme.statusCode === 401 || anonyme.statusCode === 302 || anonyme.statusCode === 404, String(anonyme.statusCode));
  const mode = await w.req('POST', 'antor', `${url}?mode=joueur`, { version: v.version });
  assert.equal(mode.statusCode, 403, mode.body);
  const row = one(w.app, 'SELECT texte, source, version FROM bm_direction WHERE univers_id = ?', w.E);
  assert.deepEqual([row.texte, row.source, row.version], ['Assistant', 'assistant', v.version]);
});

test('POST direction/annuler : outil désactivé → introuvable, comme un chemin qui n’existe pas', async () => {
  const w = await monde(false);
  const r = await w.req('POST', 'antor', `${w.R}/direction/annuler`, { version: 1 });
  const nu = await w.req('POST', 'antor', `${w.R}/direction/nexistepas`, { version: 1 });
  assert.equal(r.statusCode, 404);
  assert.equal(r.body, nu.body);
});
