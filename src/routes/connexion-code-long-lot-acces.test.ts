// Doors of lot « acces » for `src/e2e/connexion-code-long-ensemble.test.ts` (B-51, P-15, AD-112): a real-length code
// (87 characters, `xxxx#yyyy`) pasted in the panel poses the token without leaking it; one more character is refused fast
// and poses nothing; the short stub code still works afterwards. The route is driven with `inject`, no browser.
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;

const MOITIE_A = 'Qm9ydW5rZ0xhYV9TZWNyZXQtQ29kZS1BYmNkZTEyMzQ';
const MOITIE_B = 'Zk3_aB9-QwErTyUiOpAsDfGhJkLzXcVbNm0123456xy';
const CODE87 = `${MOITIE_A}#${MOITIE_B}`;
const CODE88 = `${CODE87}z`;
const BASE = '/api/instance/assistant/jeton';

/**
 * A private copy of the stub `setup-token` script under another name: `instance-connexion.test.ts` counts the processes of the
 * original by name over the whole machine, so a test of this file that spawned it could fail that one when both run together.
 */
function fauxProgramme() {
  const copie = join(mkdtempSync(join(tmpdir(), 'faux-lot-acces-')), 'faux-lot-acces.mjs');
  copyFileSync(fileURLToPath(new URL('../../scripts/faux-setup-token.mjs', import.meta.url)), copie);
  return { commande: process.execPath, args: [copie] };
}

async function monter() {
  const dir = join(mkdtempSync(join(tmpdir(), 'connexion-code-long-')), 'claude');
  const app: App = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=admin' });
  const admin = { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.assistantDeps.config = { CLAUDE_DIR: dir, CLAUDE_CODE_OAUTH_TOKEN: '', KANEVAS_STUB: '1' } as any;
  app.connexionClaude.options.programme = fauxProgramme();
  const ouvrir = async () => (await app.inject({ method: 'POST', url: `${BASE}/connexion`, headers: admin })).json().connexionId as string;
  const code = (connexionId: string, c: string) => app.inject({ method: 'POST', url: `${BASE}/code`, headers: admin, payload: { connexionId, code: c } });
  return { app, admin, fichier: join(dir, 'oauth-token'), ouvrir, code };
}

test('B-51 long code > a code of 87 characters poses the token, and neither the code nor the token is in any answer', async () => {
  assert.equal(CODE87.length, 87);
  const { app, admin, fichier, ouvrir, code } = await monter();
  const id = await ouvrir();
  const r = await code(id, CODE87);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().pose, true);
  assert.ok(existsSync(fichier), 'the token file is posed');
  const etat = await app.inject({ method: 'GET', url: BASE, headers: admin });
  for (const secret of ['oat01', CODE87, MOITIE_A]) {
    assert.equal(r.body.includes(secret), false, `the answer has ${secret}`);
    assert.equal(etat.body.includes(secret), false, `the state has ${secret}`);
  }
  await app.close();
});

test('B-51 long code > a code of 88 characters says the failure fast and poses nothing, then the short stub code poses the token', async () => {
  assert.equal(CODE88.length, 88);
  const { app, fichier, ouvrir, code } = await monter();
  const id = await ouvrir();
  const debut = Date.now();
  const r = await code(id, CODE88);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'connexion_echouee');
  assert.ok(Date.now() - debut < 15000, 'failure answered before the 60 s timeout');
  assert.equal(existsSync(fichier), false, 'nothing posed');
  const id2 = await ouvrir();
  const ok = await code(id2, 'bouchon');
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(readFileSync(fichier, 'utf8').trim(), 'sk-ant-oat01-bouchon');
  await app.close();
});
