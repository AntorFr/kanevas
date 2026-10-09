import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import Database from 'better-sqlite3';

// E-5 add-member form on a phone (arbitration 2026-10-09): the identifier field keeps at least 12rem
// (192 px) so the label and placeholder stay whole and the form wraps (role + button on the next
// line); on a desktop the form stays on one line (maquette e05).
const require = createRequire(import.meta.url);
type PW = typeof import('playwright');
function chargerPlaywright(): PW | null {
  for (const chemin of ['playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try {
      return require(chemin) as PW;
    } catch {
      /* try the next one */
    }
  }
  return null;
}
const pw = chargerPlaywright();
const raisonSaut = pw ? false : 'playwright introuvable (ni local ni global)';

type Browser = import('playwright').Browser;
type BrowserContext = import('playwright').BrowserContext;
type Page = import('playwright').Page;

let browser: Browser;
const SHOTS = process.env.E2E_SHOTS ?? join(tmpdir(), 'kanevas-e2e-shots');

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

interface Serveur {
  base: string;
  dbPath: string;
  stop: () => void;
}

async function demarrer(): Promise<Serveur> {
  const port = await freePort();
  const dossier = mkdtempSync(join(tmpdir(), 'kanevas-e2e-'));
  const dbPath = join(dossier, 'kanevas.db');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    KANEVAS_STUB: '1',
    KANEVAS_SANS_SEMIS: '1', // these tests build their own world
    DB_PATH: dbPath,
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
        dbPath,
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

const NOMS: Record<string, string> = { antor: 'Antor', lea: 'Léa', teo: 'Teo', mira: 'Mira', admin: 'Admin' };

async function connecter(s: Serveur, compte: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: s.base, viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: `Se connecter en tant que ${NOMS[compte]}` }).click();
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}

async function creerUnivers(ctx: BrowserContext, nom: string, description = ''): Promise<number> {
  const rep = await ctx.request.post('/api/univers', { data: { nom, description } });
  assert.equal(rep.status(), 201, 'seed: create universe');
  return ((await rep.json()) as { id: number }).id;
}

async function ajouter(ctx: BrowserContext, univers: number, username: string, role: 'mj' | 'joueur') {
  const rep = await ctx.request.post(`/api/univers/${univers}/membres`, { data: { username, role } });
  assert.equal(rep.status(), 201, `seed: add ${username}`);
}

async function ouvrirAdmin(page: Page, chemin = '/administration') {
  await page.goto(chemin);
  await page.waitForLoadState('networkidle');
}

async function capture(page: Page, nom: string) {
  await page.screenshot({ path: join(SHOTS, `${nom}.png`), fullPage: true });
}


describe('E-5 formulaire d\'ajout de membre : repli à 390 px, une ligne au bureau', { skip: raisonSaut }, () => {
  before(async () => {
    if (!existsSync(join(process.cwd(), 'dist/public/index.html'))) {
      const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
      assert.equal(r.status, 0, 'npm run build');
    }
    browser = await pw!.chromium.launch();
  });
  after(async () => {
    await browser?.close();
  });

  async function mesurer(largeur: number) {
    const s = await demarrer();
    try {
      const antor = await connecter(s, 'antor');
      const lame = await creerUnivers(antor.ctx, "Lame d'Ébène");
      const { page } = await connecter(s, 'admin');
      await page.setViewportSize({ width: largeur, height: 900 });
      await ouvrirAdmin(page, `/administration/univers/${lame}`);
      const form = page.getByRole('form', { name: 'Ajouter un membre' });
      await form.waitFor();
      const mesures = await page.evaluate(() => {
        const f = document.querySelector('form[aria-label="Ajouter un membre"]') as HTMLElement;
        const champs = Array.from(f.querySelectorAll('input, select')) as HTMLElement[];
        const bouton = f.querySelector('button[type=submit]') as HTMLElement;
        const input = f.querySelector('input') as HTMLInputElement;
        return {
          largeurIdentifiant: input.getBoundingClientRect().width,
          dessus: champs.map((c) => Math.round(c.getBoundingClientRect().top)),
          topBouton: Math.round(bouton.getBoundingClientRect().top),
          scroll: document.documentElement.scrollWidth,
          fenetre: window.innerWidth,
          placeholderTronque: input.scrollWidth > input.clientWidth,
          // header « Rôle » vs the first role pill of the member list (E-5 alignment)
          enteteRole: Math.round((document.querySelector('.entetes-membres span:nth-child(2)') as HTMLElement).getBoundingClientRect().left),
          pastille: Math.round((document.querySelector('.liste-membres .liste-statut') as HTMLElement).getBoundingClientRect().left),
        };
      });
      await capture(page, `formulaire-ajout-${largeur}`);
      return mesures;
    } finally {
      s.stop();
    }
  }

  // Fails if the identifier field shrinks again below 12rem on a phone, if the form no longer wraps
  // (role + button on the next line), or if the page overflows horizontally.
  test('telephone_champ_identifiant_assez_large_et_formulaire_replie', async () => {
    const m = await mesurer(390);
    assert.ok(m.largeurIdentifiant >= 190, `identifier field is ${m.largeurIdentifiant}px, expected >= 192`);
    assert.ok(!m.placeholderTronque, 'placeholder cut');
    assert.ok(m.topBouton > m.dessus[0], 'role and button wrap below the identifier');
    assert.equal(m.scroll, m.fenetre, 'no horizontal overflow');
  });

  // Fails if the « Rôle » header stops sitting over the role pills (it used to be a fixed 96 px).
  test('entete_role_aligne_sur_les_pastilles', async () => {
    for (const largeur of [1280, 390]) {
      const m = await mesurer(largeur);
      assert.ok(Math.abs(m.enteteRole - m.pastille) <= 8, `${largeur}px: header at ${m.enteteRole}, pill at ${m.pastille}`);
    }
  });

  // Fails if the desktop form stops being a single line.
  test('bureau_formulaire_sur_une_ligne', async () => {
    const m = await mesurer(1280);
    assert.ok(m.largeurIdentifiant >= 190);
    const tops = [...m.dessus, m.topBouton];
    assert.ok(Math.max(...tops) - Math.min(...tops) <= 12, `tops differ: ${tops}`);
    assert.equal(m.scroll, m.fenetre);
  });
});

// Static guard of the rule itself, runnable without a browser.
describe('E-5 formulaire d\'ajout : règle CSS du champ identifiant', () => {
  const css = readFileSync(join(process.cwd(), 'frontend/src/ecrans/administration.css'), 'utf8');
  test('identifiant_min_width_12rem_et_wrap_sous_760px', () => {
    const m = /\.formulaire-ligne \.champ:first-child\s*\{([^}]*)\}/.exec(css);
    assert.ok(m, 'rule for the identifier field');
    const mw = /min-width:\s*([\d.]+)rem/.exec(m[1]);
    assert.ok(mw && Number(mw[1]) >= 12, 'min-width >= 12rem');
    assert.match(css, /@media \(max-width: 760px\)\s*\{[^}]*\.formulaire-ligne\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});
