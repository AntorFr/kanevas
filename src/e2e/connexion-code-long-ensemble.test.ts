import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { attendreServeurPret, withStartupLock } from './harnais.test.js';

// Ensemble test of the Claude subscription connection with a real-length code (B-51, P-15, AD-112), written from
// the need only: « le code xxxx#yyyy (87 caractères) collé dans Code, puis Valider, pose le jeton ». The real
// server in stub mode, a real Chromium driven by Playwright. Screenshots go to $E2E_SHOTS (default: OS temp dir).

const require = createRequire(import.meta.url);
type PW = typeof import('playwright');
function chargerPlaywright(): PW | null {
  for (const chemin of ['playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try {
      return require(chemin) as PW;
    } catch {
      /* next */
    }
  }
  return null;
}
const pw = chargerPlaywright();
const raisonSaut = pw ? false : 'playwright introuvable (ni local ni global)';
type Browser = import('playwright').Browser;
type Page = import('playwright').Page;
let browser: Browser;
const SHOTS = process.env.E2E_SHOTS ?? join(tmpdir(), 'kanevas-e2e-shots');

// A code as claude.com renders it: 43 characters, « # », 43 characters (letters, digits, « - », « _ »).
const MOITIE_A = 'Qm9ydW5rZ0xhYV9TZWNyZXQtQ29kZS1BYmNkZTEyMzQ';
const MOITIE_B = 'Zk3_aB9-QwErTyUiOpAsDfGhJkLzXcVbNm0123456xy';
const CODE87 = `${MOITIE_A}#${MOITIE_B}`;
const CODE88 = `${MOITIE_A}#${MOITIE_B}z`;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function demarrer(): Promise<{ base: string; stop: () => void }> {
  return withStartupLock(async () => {
    const port = await freePort();
    const dossier = mkdtempSync(join(tmpdir(), 'kanevas-e2e-'));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      KANEVAS_STUB: '1',
      KANEVAS_SANS_SEMIS: '1',
      DB_PATH: join(dossier, 'kanevas.db'),
      SESSION_SECRET: 'e2e-secret-0123456789',
    };
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
    const base = `http://127.0.0.1:${port}`;
    const enfant: ChildProcess = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: 'ignore' });
    try {
      await attendreServeurPret(enfant, base, () => '');
    } catch (e) {
      enfant.kill('SIGKILL');
      throw e;
    }
    return {
      base,
      stop: () => {
        enfant.kill('SIGKILL');
        rmSync(dossier, { recursive: true, force: true });
      },
    };
  });
}

async function ouvrirPanneau(base: string, reponses: string[]) {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(10000);
  const page: Page = await ctx.newPage();
  page.on('response', async (r) => {
    if (r.url().includes('/api/instance/assistant')) reponses.push(await r.text().catch(() => ''));
  });
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: 'Se connecter en tant que Admin' }).click();
  await page.waitForURL((u) => !u.pathname.includes('connexion-bouchon'));
  await page.goto('/administration');
  const panneau = page.getByRole('region', { name: /Jeton de l.assistant/ });
  await panneau.getByText('Aucun jeton posé.').waitFor();
  await panneau.getByRole('button', { name: 'Connecter l’abonnement' }).click();
  await panneau.getByLabel('Code').waitFor();
  return { page, panneau };
}

describe('connexion à l’abonnement Claude : code réel de 87 caractères (B-51, P-15)', { skip: raisonSaut }, () => {
  before(async () => {
    browser = await withStartupLock(() => pw!.chromium.launch());
  });
  after(async () => {
    await browser?.close();
  });

  // Fails if code and Enter leave in one chunk again: the long code is swallowed, no « Jeton posé » ever shows.
  test('admin_colle_un_code_de_87_caracteres_et_le_jeton_est_pose_sans_fuite', async () => {
    assert.equal(CODE87.length, 87);
    const s = await demarrer();
    try {
      const reponses: string[] = [];
      const { page, panneau } = await ouvrirPanneau(s.base, reponses);
      await panneau.getByLabel('Code').fill(CODE87);
      await panneau.getByRole('button', { name: 'Valider' }).click();
      const jour = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      await panneau.getByText(`Jeton posé le ${jour}.`).waitFor({ timeout: 15000 });
      await panneau.getByText('L’assistant est disponible sur tous les univers.').waitFor();
      await page.screenshot({ path: join(SHOTS, 'code-long-pose.png'), fullPage: true });
      const dom = await page.content();
      for (const secret of ['oat01', CODE87, MOITIE_A]) {
        assert.equal(dom.includes(secret), false, `DOM has ${secret}`);
        assert.equal(reponses.some((r) => r.includes(secret)), false, `response has ${secret}`);
      }
    } finally {
      s.stop();
    }
  });

  // Fails if a code of 87 characters ends in the 60 s timeout instead of an answer, or if a refused long code poses a token.
  test('code_long_refuse_dit_echec_vite_et_ne_pose_rien_puis_le_code_court_bouchon_pose', async () => {
    assert.equal(CODE88.length, 88);
    const s = await demarrer();
    try {
      const reponses: string[] = [];
      const { page, panneau } = await ouvrirPanneau(s.base, reponses);
      const debut = Date.now();
      await panneau.getByLabel('Code').fill(CODE88);
      await panneau.getByRole('button', { name: 'Valider' }).click();
      await panneau.getByText('La connexion n’a pas abouti. Recommencez.').waitFor({ timeout: 15000 });
      assert.ok(Date.now() - debut < 15000, 'echec rendu avant le delai de 60 s');
      await panneau.getByText('Aucun jeton posé.').waitFor();
      await page.screenshot({ path: join(SHOTS, 'code-long-refuse.png'), fullPage: true });
      // second try with the short code still works
      await panneau.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await panneau.getByLabel('Code').fill('bouchon');
      await panneau.getByRole('button', { name: 'Valider' }).click();
      await panneau.getByText(/^Jeton posé le /).first().waitFor({ timeout: 15000 });
    } finally {
      s.stop();
    }
  });
});
