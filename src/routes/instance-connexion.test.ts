import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { binaireClaude, tirerAdresse, tirerJeton } = await import('../services/assistant/connexion-claude.js');
type App = Awaited<ReturnType<typeof buildApp>>;

async function connecter(app: App, compte: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
type H = { cookie: string };
const appel = (app: App, h: H | undefined, method: 'POST' | 'DELETE' | 'GET', url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

const BASE = '/api/instance/assistant/jeton';
const fils = () =>
  readdirSync('/proc')
    .filter((d) => /^\d+$/.test(d))
    .filter((d) => {
      try {
        const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8');
        const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
        return cmd.split('\0').some((a) => a.endsWith('/faux-setup-token.mjs')) && !/^\d+ \(.*\) Z/.test(stat);
      } catch {
        return false;
      }
    });
const attendreMort = async () => {
  for (let i = 0; i < 100 && fils().length; i++) await new Promise((r) => setTimeout(r, 20));
  return fils();
};
async function monter() {
  const dir = join(mkdtempSync(join(tmpdir(), 'connexion-')), 'claude');
  const app = await buildApp();
  const admin = await connecter(app, 'admin');
  app.assistantDeps.config = { CLAUDE_DIR: dir, CLAUDE_CODE_OAUTH_TOKEN: '', KANEVAS_STUB: '1' } as any;
  return { app, admin, fichier: join(dir, 'oauth-token') };
}

test('connexion : pose par le bouchon, 201 puis 200, fichier écrit, rien du jeton ni du code dans les corps', async () => {
  const { app, admin, fichier } = await monter();
  const t0 = Date.now();
  const c = await appel(app, admin, 'POST', `${BASE}/connexion`);
  assert.equal(c.statusCode, 201);
  assert.equal(c.json().adresse, 'https://claude.ai/oauth/authorize?code=true&client_id=bouchon');
  const dur = Date.parse(c.json().expireLe) - t0;
  assert.ok(dur > 9.9 * 60e3 && dur <= 10 * 60e3 + 5e3, `expireLe à ${dur} ms`);
  assert.equal(fils().length, 1);
  const r = await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().pose, true);
  assert.equal(r.json().source, 'instance');
  assert.ok(existsSync(fichier));
  assert.equal(readFileSync(fichier, 'utf8').trim(), 'sk-ant-oat01-bouchon');
  assert.ok(!c.body.includes('sk-ant') && !r.body.includes('sk-ant') && !r.body.includes('oat01'));
  assert.deepEqual(await attendreMort(), []);
  assert.equal((await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' })).statusCode, 410);
  await app.close();
});

test('connexion : un autre code → 400 connexion_echouee, fichier d’avant intact, processus mort, puis 410', async () => {
  const { app, admin, fichier } = await monter();
  const { ecrireJeton } = await import('../services/assistant/jeton.js');
  ecrireJeton('sk-ant-oat01-AVANT', app.assistantDeps.config as any);
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  const r = await appel(app, admin, 'POST', `${BASE}/code`, { code: 'mauvais-code-secret' });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'connexion_echouee');
  assert.ok(!r.body.includes('mauvais-code-secret'));
  assert.equal(readFileSync(fichier, 'utf8'), 'sk-ant-oat01-AVANT');
  assert.deepEqual(await attendreMort(), []);
  const s = await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' });
  assert.equal(s.statusCode, 410);
  assert.equal(s.json().code, 'connexion_expiree');
  await app.close();
});

test('connexion : code invalide (absent, vide, trop long, non texte) → 400 sans tuer la session valide', async () => {
  const { app, admin } = await monter();
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  for (const body of [{}, { code: '' }, { code: '   ' }, { code: 'x'.repeat(501) }, { code: 42 }, { code: 'a\nb' }]) {
    const r = await appel(app, admin, 'POST', `${BASE}/code`, body);
    assert.equal(r.statusCode, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal(fils().length, 1);
  assert.equal((await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' })).statusCode, 200);
  await app.close();
});

test('connexion : horloge à 10 minutes → 410 connexion_expiree et plus de processus', async () => {
  const { app, admin, fichier } = await monter();
  let now = Date.now();
  app.connexionClaude.options.maintenant = () => now;
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  now += 10 * 60e3;
  const r = await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' });
  assert.equal(r.statusCode, 410);
  assert.equal(r.json().code, 'connexion_expiree');
  assert.deepEqual(await attendreMort(), []);
  assert.ok(!existsSync(fichier));
  await app.close();
});

test('connexion : une session juste avant l’échéance reste valable', async () => {
  const { app, admin } = await monter();
  let now = Date.now();
  app.connexionClaude.options.maintenant = () => now;
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  now += 10 * 60e3 - 1;
  assert.equal((await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' })).statusCode, 200);
  await app.close();
});

test('connexion : une seconde connexion remplace la première (un seul processus)', async () => {
  const { app, admin } = await monter();
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  const avant = fils();
  assert.equal(avant.length, 1);
  const c2 = await appel(app, admin, 'POST', `${BASE}/connexion`);
  assert.equal(c2.statusCode, 201);
  const apres = fils();
  assert.equal(apres.length, 1);
  assert.notEqual(apres[0], avant[0]);
  assert.equal((await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' })).statusCode, 200);
  await app.close();
});

test('connexion : DELETE → 204, processus mort, code suivant 410 ; DELETE sans session reste 204', async () => {
  const { app, admin } = await monter();
  assert.equal((await appel(app, admin, 'DELETE', `${BASE}/connexion`)).statusCode, 204);
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  assert.equal((await appel(app, admin, 'DELETE', `${BASE}/connexion`)).statusCode, 204);
  assert.deepEqual(await attendreMort(), []);
  assert.equal((await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' })).statusCode, 410);
  await app.close();
});

test('connexion : l’arrêt du serveur tue le processus', async () => {
  const { app, admin } = await monter();
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  assert.equal(fils().length, 1);
  await app.close();
  assert.deepEqual(await attendreMort(), []);
});

test('connexion : un compte hors parents reçoit 404 sur les trois routes, sans session 401', async () => {
  const { app, admin } = await monter();
  const lea = await connecter(app, 'lea');
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  const ref = await appel(app, lea, 'GET', '/api/adresse-inconnue');
  for (const [m, u, p] of [
    ['POST', `${BASE}/connexion`],
    ['POST', `${BASE}/code`, { code: 'bouchon' }],
    ['DELETE', `${BASE}/connexion`],
  ] as const) {
    const r = await appel(app, lea, m, u, p as any);
    assert.equal(r.statusCode, 404, `${m} ${u}`);
    assert.equal(r.body, ref.body);
    assert.equal((await appel(app, undefined, m, u, p as any)).statusCode, 401);
  }
  assert.equal(fils().length, 1, 'le refus ne touche pas la session de l’admin');
  await app.close();
});

test('connexion : programme absent ou sans adresse → 502 connexion_impossible sans détail, rien ne reste', async () => {
  const { app, admin } = await monter();
  for (const commande of ['/nexiste/pas', process.execPath]) {
    app.connexionClaude.options.programme = { commande, args: commande === '/nexiste/pas' ? [] : ['-e', 'console.log("rien")'] };
    app.connexionClaude.options.delaiAdresse = 300;
    const r = await appel(app, admin, 'POST', `${BASE}/connexion`);
    assert.equal(r.statusCode, 502, commande);
    assert.equal(r.json().code, 'connexion_impossible');
    assert.deepEqual(Object.keys(r.json()).sort(), ['code', 'message']);
    assert.ok(!r.body.includes('nexiste') && !r.body.includes('rien'));
    assert.equal((await appel(app, admin, 'POST', `${BASE}/code`, { code: 'x' })).statusCode, 410);
  }
  await app.close();
});

test('connexion : une adresse hors claude.ai / anthropic.com est refusée', async () => {
  const { app, admin } = await monter();
  app.connexionClaude.options.programme = {
    commande: process.execPath,
    args: ['-e', 'console.log("https://evil.example/claude.ai"); setTimeout(()=>{},5000)'],
  };
  app.connexionClaude.options.delaiAdresse = 300;
  assert.equal((await appel(app, admin, 'POST', `${BASE}/connexion`)).statusCode, 502);
  await app.close();
});

test('connexion : une session qui échoue à l’écriture du fichier rend connexion_echouee', async () => {
  const { app, admin } = await monter();
  // CLAUDE_DIR under a regular file: mkdir fails.
  const bloc = join(mkdtempSync(join(tmpdir(), 'connexion-bloc-')), 'f');
  (await import('node:fs')).writeFileSync(bloc, 'x');
  app.assistantDeps.config = { CLAUDE_DIR: join(bloc, 'sous'), CLAUDE_CODE_OAUTH_TOKEN: '', KANEVAS_STUB: '1' } as any;
  await appel(app, admin, 'POST', `${BASE}/connexion`);
  const r = await appel(app, admin, 'POST', `${BASE}/code`, { code: 'bouchon' });
  assert.equal(r.statusCode, 400);
  assert.deepEqual(await attendreMort(), []);
  await app.close();
});

test('connexion : extraction — adresse et jeton tirés d’une sortie de terminal (ANSI, retours chariot)', () => {
  assert.equal(
    tirerAdresse('\u001b[1mVisit\u001b[0m\r\nhttps://claude.ai/oauth/authorize?x=1&y=2\r\nPaste'),
    'https://claude.ai/oauth/authorize?x=1&y=2',
  );
  assert.equal(tirerAdresse('http://claude.ai/x'), null);
  assert.equal(tirerAdresse('https://notclaude.ai/x https://console.anthropic.com/a'), 'https://console.anthropic.com/a');
  assert.equal(tirerJeton('token:\u001b[32msk-ant-oat01-Ab_c-9\u001b[0m\r\n'), 'sk-ant-oat01-Ab_c-9');
  assert.equal(tirerJeton('rien'), null);
});

test('connexion : le programme réel (script + binaire du SDK) se résout', () => {
  const claude = binaireClaude();
  assert.ok(claude && existsSync(claude), 'binaire claude du SDK');
  execFileSync('script', ['--version']);
});
