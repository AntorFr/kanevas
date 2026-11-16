// Door of lot « acces » for `src/e2e/connexion-claude-com.test.ts`: the route describe, moved as it was (it never drove a browser).
// Black-box tests of `kanevas-connexion-claude-com`, written from the need only (B-51 / E-5 "Jeton de l'assistant",
// Livre of the triage: « Connecter » shows the sign-in address with the embedded CLI 2.1.287, whose address is on
// claude.com; any host outside claude.com / claude.ai / anthropic.com (and their subdomains) is refused as a
// start error; « Connecter » no longer answers 502 in production).
// The app is the real one (stub login, real routes, real built frontend); only the program behind « Connecter »
// is chosen by the test: the real embedded CLI, or a program printing a fixed output.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const BASE = '/api/instance/assistant/jeton';
const ADRESSE =
  'https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&scope=user%3Ainference&state=abc';
// Output of Claude Code 2.1.287: the address is wrapped in an OSC 8 hyperlink.
const SORTIE_CLI = `Welcome to Claude Code v2.1.287\r\nBrowser didn't open? Use the url below to sign in (c to copy)\r\n\u001b]8;id=7ud7zt;${ADRESSE}\u001b\\${ADRESSE}\u001b]8;;\u001b\\\r\nPaste code here if prompted >\r\n`;

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

function imprime(sortie: string) {
  return { commande: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(sortie)}); setTimeout(()=>{}, 60000)`] };
}

async function monter(): Promise<{ app: App; cookie: string }> {
  const app = await buildApp();
  aFermer.push(() => app.close());
  app.assistantDeps.config = { CLAUDE_CODE_OAUTH_TOKEN: '', KANEVAS_STUB: '1' } as Any;
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'compte=admin',
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { app, cookie: `kanevas_session=${c.value}` };
}

async function ouvrir(sortie: string) {
  const { app, cookie } = await monter();
  app.connexionClaude.options.programme = imprime(sortie);
  app.connexionClaude.options.delaiAdresse = 1500;
  const r = await app.inject({ method: 'POST', url: `${BASE}/connexion`, headers: { cookie } });
  return { app, cookie, r };
}

describe('kanevas-connexion-claude-com : « Connecter » avec une adresse sur claude.com (routes)', () => {
  // Panne visée : le filtre d'hôte écarte claude.com, « Connecter » répond 502.
  it('sortie du CLI 2.1.287 (OSC 8, claude.com) : 201 avec l’adresse exacte', async () => {
    const { r } = await ouvrir(SORTIE_CLI);
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().adresse, ADRESSE);
  });

  // Panne visée : seule la liste d'hôtes d'origine est acceptée, ou le sous-domaine de claude.com est refusé.
  for (const [hote, attendu] of [
    ['https://platform.claude.com/oauth/authorize?x=1', 201],
    ['https://claude.ai/oauth/authorize?x=1', 201],
    ['https://console.anthropic.com/oauth?x=1', 201],
    ['https://claude.com/a', 201],
  ] as const) {
    it(`adresse ${hote} acceptée`, async () => {
      const { r } = await ouvrir(`Sign in:\r\n${hote}\r\n`);
      assert.equal(r.statusCode, attendu, r.body);
      assert.equal(r.json().adresse, hote);
    });
  }

  // Panne visée : le filtre est élargi à tout hôte contenant « claude.com » (hameçonnage de l'admin).
  for (const mauvais of [
    'https://claude.com.evil.example/oauth',
    'https://notclaude.com/oauth',
    'https://evil.example/claude.com',
    'https://claude.com@evil.example/oauth',
    'http://claude.com/oauth',
    'https://claude.org/oauth',
  ]) {
    it(`adresse ${mauvais} refusée : connexion_impossible, 502`, async () => {
      const { r } = await ouvrir(`Sign in:\r\n${mauvais}\r\n`);
      assert.equal(r.statusCode, 502, r.body);
      assert.match(r.body, /connexion_impossible/);
      assert.ok(!r.body.includes('evil.example') && !r.body.includes('notclaude'), 'rien de l’adresse refusée dans la réponse');
    });
  }

  it('une adresse refusée suivie d’une adresse claude.com : la bonne est rendue', async () => {
    const { r } = await ouvrir(`https://evil.example/x\r\n${ADRESSE}\r\n`);
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().adresse, ADRESSE);
  });

  // Exclusion : hors du groupe admin, la route reste introuvable, même avec une adresse valide.
  it('un compte hors du groupe admin n’ouvre pas de connexion : 404', async () => {
    const app = await buildApp();
    aFermer.push(() => app.close());
    app.connexionClaude.options.programme = imprime(SORTIE_CLI);
    const res = await app.inject({
      method: 'POST',
      url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'compte=lea',
    });
    const cookie = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
    const r = await app.inject({ method: 'POST', url: `${BASE}/connexion`, headers: { cookie } });
    assert.equal(r.statusCode, 404);
  });
});
