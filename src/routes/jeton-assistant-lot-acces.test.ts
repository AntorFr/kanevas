// Doors of lot « acces » for `src/e2e/jeton-assistant-*.test.ts` (kanevas-import-jeton-assistant, B-51, P-15, E-5, AD-112,
// AD-86): the token file, the availability, the leaks, the refusals and the player's 404 are proved through `inject`.
// The token value is never written here but the stub's own (`bouchon`).
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { disponibilite } = await import('../services/assistant/disponibilite.js');
const { jetonEffectif } = await import('../services/assistant/jeton.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };

const ROUTE = '/api/instance/assistant/jeton';
const VALEUR_BOUCHON = 'sk-ant-oat01-bouchon';
const VALEUR_DEPLOIEMENT = 'sk-ant-oat01-secret-du-deploiement';

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

/**
 * A private copy of the stub `setup-token` script under another name: `instance-connexion.test.ts` counts the processes of the
 * original by name over the whole machine, so a test of this file that spawned it could fail that one when both run together.
 */
function fauxProgramme() {
  const copie = join(mkdtempSync(join(tmpdir(), 'faux-lot-acces-')), 'faux-lot-acces.mjs');
  copyFileSync(fileURLToPath(new URL('../../scripts/faux-setup-token.mjs', import.meta.url)), copie);
  return { commande: process.execPath, args: [copie] };
}

async function monter(env: { deploiement?: string } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'jeton-lot-acces-')), 'claude');
  const app = await buildApp();
  const admin = await connecter(app, 'admin');
  const lea = await connecter(app, 'lea');
  const config = { CLAUDE_DIR: dir, CLAUDE_CODE_OAUTH_TOKEN: env.deploiement ?? '', KANEVAS_STUB: '1' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.assistantDeps.config = config as any;
  app.connexionClaude.options.programme = fauxProgramme();
  const corps: string[] = [];
  const appel = async (h: H, methode: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) => {
    const r = await app.inject({ method: methode, url, headers: h, payload });
    corps.push(r.body);
    return r;
  };
  const ouvrir = async () => (await appel(admin, 'POST', `${ROUTE}/connexion`)).json().connexionId as string;
  const code = (connexionId: string, c: string) => appel(admin, 'POST', `${ROUTE}/code`, { connexionId, code: c });
  const etat = async () => (await appel(admin, 'GET', ROUTE)).json();
  return { app, admin, lea, config, dir, fichier: join(dir, 'oauth-token'), corps, appel, ouvrir, code, etat };
}

test('B-51 token file > the posed token is a 0600 file of the volume, in a 0700 folder', async () => {
  const m = await monter();
  assert.equal(existsSync(m.fichier), false);
  assert.equal((await m.code(await m.ouvrir(), 'bouchon')).statusCode, 200);
  assert.equal(existsSync(m.fichier), true);
  assert.equal((statSync(m.fichier).mode & 0o777).toString(8), '600');
  assert.equal((statSync(dirname(m.fichier)).mode & 0o777).toString(8), '700');
  assert.ok(readFileSync(m.fichier, 'utf8').trim().length > 0);
  await m.app.close();
});

test('B-51 availability > the assistant becomes available (claude-agent) without restart, the posed file wins over the variable, the variable takes over without the file', async () => {
  const m = await monter({ deploiement: VALEUR_DEPLOIEMENT });
  assert.equal(disponibilite({ CLAUDE_DIR: join(m.dir, 'ailleurs'), CLAUDE_CODE_OAUTH_TOKEN: '' }), 'aucune');
  assert.equal((await m.code(await m.ouvrir(), 'bouchon')).statusCode, 200);
  assert.equal(disponibilite({ CLAUDE_DIR: m.dir, CLAUDE_CODE_OAUTH_TOKEN: '' }), 'claude-agent');
  assert.equal(jetonEffectif({ CLAUDE_DIR: m.dir, CLAUDE_CODE_OAUTH_TOKEN: VALEUR_DEPLOIEMENT }), VALEUR_BOUCHON, 'the posed token wins over the variable');
  const apres = await m.etat();
  assert.equal(apres.source, 'instance');
  assert.equal(apres.pose, true);
  rmSync(m.fichier);
  assert.equal(jetonEffectif({ CLAUDE_DIR: m.dir, CLAUDE_CODE_OAUTH_TOKEN: VALEUR_DEPLOIEMENT }), VALEUR_DEPLOIEMENT, 'without the file the variable takes over');
  const etat = await m.etat();
  assert.equal(etat.pose, true);
  assert.equal(etat.source, 'deploiement');
  await m.app.close();
});

test('B-51 leaks > no answer of the routes carries the token value (posed, from the deployment, failed)', async () => {
  const m = await monter({ deploiement: VALEUR_DEPLOIEMENT });
  await m.etat();
  assert.equal((await m.code(await m.ouvrir(), 'mauvais-code')).statusCode, 400);
  assert.equal((await m.code(await m.ouvrir(), 'bouchon')).statusCode, 200);
  await m.etat();
  await m.appel(m.admin, 'POST', `${ROUTE}/code`, { connexionId: 'inconnue', code: 'mauvais' });
  assert.ok(m.corps.length >= 5, `answers captured: ${m.corps.length}`);
  for (const corps of m.corps) {
    assert.ok(!corps.includes('sk-ant'), `value in an answer: ${corps}`);
    assert.ok(!corps.includes(VALEUR_DEPLOIEMENT));
  }
  await m.app.close();
});

test('B-51 refused code > without a token nothing is posed and a second valid attempt works; with a token already posed the old state and file stay unchanged', async () => {
  const m = await monter();
  const r = await m.code(await m.ouvrir(), 'pas-le-bon-code');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'connexion_echouee');
  assert.equal(existsSync(m.fichier), false);
  assert.equal((await m.etat()).pose, false);
  assert.equal((await m.code(await m.ouvrir(), 'bouchon')).statusCode, 200);
  const avant = { contenu: readFileSync(m.fichier, 'utf8'), mtime: statSync(m.fichier).mtimeMs };
  assert.equal((await m.code(await m.ouvrir(), 'faux')).statusCode, 400);
  assert.equal((await m.etat()).pose, true, 'the old state stays');
  assert.equal(readFileSync(m.fichier, 'utf8'), avant.contenu);
  assert.equal(statSync(m.fichier).mtimeMs, avant.mtime);
  await m.app.close();
});

test('B-51 cancel > cancelling closes the connection: the code is no longer accepted (410 connexion_expiree) and nothing is posed; DELETE answers 204', async () => {
  const m = await monter();
  const id = await m.ouvrir();
  assert.equal((await m.appel(m.admin, 'DELETE', `${ROUTE}/connexion`)).statusCode, 204);
  const r = await m.code(id, 'bouchon');
  assert.equal(r.statusCode, 410);
  assert.equal(r.json().code, 'connexion_expiree');
  assert.equal(existsSync(m.fichier), false);
  assert.equal((await m.appel(m.admin, 'DELETE', `${ROUTE}/connexion`)).statusCode, 204, 'twice is still 204');
  await m.app.close();
});

test('B-51 replaced connection > a new connection replaces the old one, whose code says 410 connexion_expiree and poses nothing; the new one poses', async () => {
  const m = await monter();
  const ancienne = await m.ouvrir();
  const nouvelle = await m.ouvrir();
  const r = await m.code(ancienne, 'bouchon');
  assert.equal(r.statusCode, 410);
  assert.equal(r.json().code, 'connexion_expiree');
  assert.equal(existsSync(m.fichier), false, 'nothing posed by the old connection');
  assert.equal((await m.etat()).pose, false);
  assert.equal((await m.code(nouvelle, 'bouchon')).statusCode, 200);
  await m.app.close();
});

test('B-51 connexionId > an unknown id says 410 without posing nor ending the current connection; an absent or empty id says 400 and poses nothing', async () => {
  const m = await monter();
  const id = await m.ouvrir();
  assert.equal((await m.code('inconnue', 'bouchon')).statusCode, 410);
  assert.equal((await m.appel(m.admin, 'POST', `${ROUTE}/code`, { code: 'bouchon' })).statusCode, 400);
  assert.equal((await m.code('', 'bouchon')).statusCode, 400);
  assert.equal(existsSync(m.fichier), false);
  assert.equal((await m.code(id, 'bouchon')).statusCode, 200, 'the current connection is intact');
  await m.app.close();
});

test('B-51 deployment token > a token given by the deployment is listed as such, and the pose replaces it by a posed token', async () => {
  const m = await monter({ deploiement: VALEUR_DEPLOIEMENT });
  const avant = await m.etat();
  assert.equal(avant.pose, true);
  assert.equal(avant.source, 'deploiement');
  assert.equal((await m.code(await m.ouvrir(), 'bouchon')).statusCode, 200);
  const apres = await m.etat();
  assert.equal(apres.source, 'instance');
  assert.equal(apres.pose, true);
  await m.app.close();
});

test('AD-86 player > Léa (outside the parents group) gets 404 on every route of the panel and poses nothing; the admin still sees no token', async () => {
  const m = await monter();
  const req = (methode: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) => m.app.inject({ method: methode, url, headers: m.lea, payload });
  assert.equal((await req('GET', ROUTE)).statusCode, 404);
  assert.equal((await req('POST', `${ROUTE}/connexion`)).statusCode, 404);
  assert.equal((await req('POST', `${ROUTE}/code`, { connexionId: 'inconnue', code: 'bouchon' })).statusCode, 404);
  assert.equal((await req('POST', `${ROUTE}/code`, {})).statusCode, 404);
  assert.equal((await req('DELETE', `${ROUTE}/connexion`)).statusCode, 404);
  const etat = await m.etat();
  assert.equal(etat.pose, false);
  assert.equal(etat.source, null);
  assert.equal(existsSync(m.fichier), false);
  assert.equal((await m.code('inconnue', 'bouchon')).statusCode, 410, 'Léa opened no connection');
  await m.app.close();
});
