import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

// E-5 (docs/ecrans.md, maquette e05): in the « Membres » zone, the add form is a field « Identifiant du
// compte », a role (Joueur by default) and « Ajouter ». Re-verification of the 390 px gap: the identifier
// field was cut. Expectations are literal and come from the need (whole prompt readable, everything
// reachable without sideways scroll), not from the CSS.
const require = createRequire(import.meta.url);
type PW = typeof import('playwright');
function chargerPlaywright(): PW | null {
  for (const c of ['playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try {
      return require(c) as PW;
    } catch {
      /* next */
    }
  }
  return null;
}
const pw = chargerPlaywright();
let browser: import('playwright').Browser;

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

async function demarrer() {
  const port = await freePort();
  const dossier = mkdtempSync(join(tmpdir(), 'kanevas-ordre-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    KANEVAS_STUB: '1',
    KANEVAS_SANS_SEMIS: '1',
    DB_PATH: join(dossier, 'kanevas.db'),
    SESSION_SECRET: 'e2e-secret-0123456789',
  };
  for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
  const child: ChildProcess = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try {
      await fetch(`${base}/healthz`);
      return {
        base,
        stop: () => {
          child.kill('SIGKILL');
          rmSync(dossier, { recursive: true, force: true });
        },
      };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill('SIGKILL');
  throw new Error('server did not start');
}


// E-5 (docs/ecrans.md, maquette e05 l.77-80): members list, then the add form, then the note. E-4 (Membres
// of a universe) keeps its form on top. Order is read from the rendered page, by vertical position.
async function ordre(largeur: number) {
  const s = await demarrer();
  try {
    const login = async (nom: string) => {
      const ctx = await browser.newContext({ baseURL: s.base, viewport: { width: largeur, height: 900 } });
      ctx.setDefaultTimeout(8000);
      const page = await ctx.newPage();
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: `Se connecter en tant que ${nom}` }).click();
      await page.waitForLoadState('networkidle');
      return { ctx, page };
    };
    const antor = await login('Antor');
    const rep = await antor.ctx.request.post('/api/univers', { data: { nom: "Lame d'Ébène", description: '' } });
    assert.equal(rep.status(), 201);
    const id = ((await rep.json()) as { id: number }).id;
    await login('Léa'); // an account exists only once it has signed in
    const ajout = await antor.ctx.request.post(`/api/univers/${id}/membres`, { data: { username: 'lea', role: 'joueur' } });
    assert.ok(ajout.status() < 300, `seed lea: ${ajout.status()}`);
    const haut = async (page: import('playwright').Page) => {
      await page.getByPlaceholder('Identifiant du compte').waitFor();
      await page.locator('li', { hasText: 'lea' }).first().waitFor();
      await page.waitForLoadState('networkidle');
      return page.evaluate(`(function () {
        var top = function (el) { return el ? el.getBoundingClientRect().top + window.scrollY : NaN; };
        var lis = Array.prototype.filter.call(document.querySelectorAll('li'), function (li) { return /lea/.test(li.textContent || ''); });
        return { ligne: top(lis[0] || null), form: top(document.querySelector('form[aria-label="Ajouter un membre"]')) };
      })()`) as Promise<{ ligne: number; form: number }>;
    };
    const { page } = await login('Admin');
    await page.goto(`/administration/univers/${id}`);
    const e5 = await haut(page);
    await antor.page.goto(`/univers/${id}/membres`);
    const e4 = await haut(antor.page);
    return { e5, e4 };
  } finally {
    s.stop();
  }
}

describe('E-5 ordre : liste, puis formulaire d\'ajout (E-4 inchangé)', { skip: pw ? false : 'playwright introuvable' }, () => {
  before(async () => {
    browser = await pw!.chromium.launch();
  });
  after(async () => {
    await browser?.close();
  });
  for (const w of [1280, 390]) {
    test(`${w} px : la ligne de lea précède le formulaire en E-5, le suit en E-4`, async () => {
      const { e5, e4 } = await ordre(w);
      assert.ok(e5.ligne < e5.form, `E-5 ${JSON.stringify(e5)}`);
      assert.ok(e4.form < e4.ligne, `E-4 ${JSON.stringify(e4)}`);
    });
  }
});
