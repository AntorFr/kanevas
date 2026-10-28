// Black-box tests of `kanevas-connexion-claude-com`, written from the need only (B-51 / E-5 "Jeton de l'assistant",
// Livre of the triage: « Connecter » shows the sign-in address with the embedded CLI 2.1.287, whose address is on
// claude.com; any host outside claude.com / claude.ai / anthropic.com (and their subdomains) is refused as a
// start error; « Connecter » no longer answers 502 in production).
// The app is the real one (stub login, real routes, real built frontend); only the program behind « Connecter »
// is chosen by the test: the real embedded CLI, or a program printing a fixed output.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, launch, rx, rxExact, skipBrowser } from './harnais.test.ts';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = `${process.cwd()}/dist/public`;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { programmeScript, binaireClaude } = await import('../services/assistant/connexion-claude.js');
type App = Awaited<ReturnType<typeof buildApp>>;

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

  // Panne visée : le CLI embarqué réel n'est plus reconnu (le vrai cas de production), sans réseau.
  it('CLI embarqué réel : « Connecter » rend une adresse https sur claude.com, annulable (204)', { skip: binaireClaude() ? false : 'binaire claude du SDK absent' }, async () => {
    const { app, cookie } = await monter();
    app.connexionClaude.options.programme = programmeScript();
    app.connexionClaude.options.delaiAdresse = 30000;
    const r = await app.inject({ method: 'POST', url: `${BASE}/connexion`, headers: { cookie } });
    assert.equal(r.statusCode, 201, `${r.body} — cause : ${app.connexionClaude.derniereCause ?? 'inconnue'}`);
    const u = new URL(r.json().adresse);
    assert.equal(u.protocol, 'https:');
    assert.match(u.hostname, /^(.+\.)?(claude\.com|claude\.ai|anthropic\.com)$/);
    const d = await app.inject({ method: 'DELETE', url: `${BASE}/connexion`, headers: { cookie } });
    assert.equal(d.statusCode, 204);
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

describe('kanevas-connexion-claude-com : panneau « Jeton de l’assistant » (navigateur)', { skip: skipBrowser }, () => {
  async function serveur(sortie: string) {
    const app = await buildApp();
    app.assistantDeps.config = { CLAUDE_CODE_OAUTH_TOKEN: '', KANEVAS_STUB: '1' } as Any;
    app.connexionClaude.options.programme = imprime(sortie);
    app.connexionClaude.options.delaiAdresse = 1500;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const browser = await launch();
    aFermer.push(async () => {
      await browser.close();
      await app.close();
    });
    const ctx = await browser.newContext({ baseURL: base });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que admin$/i }).click();
    await page.goto('/administration');
    await page.getByRole('region', { name: rx("Jeton de l'assistant") }).waitFor();
    return page;
  }

  // Panne visée : l'adresse claude.com n'apparaît pas dans le panneau (502 → message d'erreur à la place).
  it('Connecter : l’adresse claude.com et le champ Code apparaissent, lien « Ouvrir » vers cette adresse', async () => {
    const page = await serveur(SORTIE_CLI);
    const panneau = page.getByRole('region', { name: rx("Jeton de l'assistant") });
    await panneau.getByRole('button', { name: rxExact("Connecter l'abonnement") }).click();
    await page.getByLabel('Code', { exact: true }).waitFor();
    const t = ((await panneau.innerText()) as string).replace(/\s+/g, '');
    assert.ok(t.includes(ADRESSE), 'adresse visible dans le panneau');
    assert.equal(await panneau.getByRole('link', { name: rxExact('Ouvrir') }).getAttribute('href'), ADRESSE);
    assert.equal(await page.getByText(/La connexion n.a pas pu démarrer/).count(), 0);
    await page.screenshot({ path: '/tmp/connexion-claude-com.png', fullPage: true });
  });

  // Panne visée : un hôte hors liste est montré à l'admin au lieu d'être écarté.
  it('hôte hors liste : « La connexion n’a pas pu démarrer. Réessayez. », pas de champ Code, pas d’adresse', async () => {
    const page = await serveur('https://claude.com.evil.example/oauth\r\n');
    const panneau = page.getByRole('region', { name: rx("Jeton de l'assistant") });
    await panneau.getByRole('button', { name: rxExact("Connecter l'abonnement") }).click();
    await page.getByText(rx("La connexion n'a pas pu démarrer. Réessayez.")).first().waitFor();
    assert.equal(await page.getByLabel('Code', { exact: true }).count(), 0);
    assert.ok(!((await panneau.innerText()) as string).includes('evil.example'));
    await page.screenshot({ path: '/tmp/connexion-hote-refuse.png', fullPage: true });
  });
});
