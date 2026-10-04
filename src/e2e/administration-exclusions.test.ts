import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

// Complements administration.test.ts (B-6, P-2 step 3, E-5, B-29): the exclusions of the design
// (the admin never reads content, the entry exists only for the admin) and the states that file
// leaves out (writing in progress, long name). Black box: real server in stub mode, real Chromium.
// Expected values are literals from docs/parcours.md and docs/ecrans.md. Screenshots: $E2E_SHOTS.

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
  stop: () => void;
}

async function demarrer(): Promise<Serveur> {
  const port = await freePort();
  const dossier = mkdtempSync(join(tmpdir(), 'kanevas-e2e-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    KANEVAS_STUB: '1',
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

async function capture(page: Page, nom: string) {
  await page.screenshot({ path: join(SHOTS, `${nom}.png`), fullPage: true });
}

const SECRET = 'Description secrète de la Lame';

/** Lame d'Ébène: antor MJ (description SECRET), lea Joueuse; admin and mira have signed in once. */
async function monde(s: Serveur) {
  const antor = await connecter(s, 'antor');
  const lea = await connecter(s, 'lea');
  const admin = await connecter(s, 'admin');
  await connecter(s, 'mira');
  const lame = await creerUnivers(antor.ctx, "Lame d'Ébène", SECRET);
  await ajouter(antor.ctx, lame, 'lea', 'joueur');
  return { antor, lea, admin, lame };
}

describe('E-5 Administration : exclusions et états (B-6, B-29)', { skip: raisonSaut }, () => {
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

  // Fails if the admin API carries the description, or if a content/universe route opens for a
  // group member who has no role (B-6: "sans jamais en lire le contenu"; AD-9).
  test('admin_sans_role_ne_lit_aucun_contenu_ni_description_par_l_api', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { ctx } = w.admin;
      const liste = await ctx.request.get('/api/instance/univers');
      assert.equal(liste.status(), 200);
      const corps = await liste.text();
      assert.ok(corps.includes("Lame d'Ébène"), 'admin sees the universe name');
      assert.equal(corps.includes(SECRET), false, 'no description in the instance list');
      const membres = await ctx.request.get(`/api/instance/univers/${w.lame}/membres`);
      assert.equal(membres.status(), 200);
      assert.equal((await membres.text()).includes(SECRET), false, 'no description in the member list');
      for (const chemin of [`/api/univers/${w.lame}`, `/api/univers/${w.lame}/membres`]) {
        const rep = await ctx.request.get(chemin);
        assert.equal(rep.status(), 404, `${chemin} is unknown to a no-role account`);
        assert.equal((await rep.text()).includes(SECRET), false, chemin);
      }
      const mien = await ctx.request.get('/api/univers');
      assert.equal(await mien.text().then((x) => x.includes("Lame d'Ébène")), false, 'not in the admin own universes');
      // no-role admin cannot use the member routes of an universe he is not in either
      const ajout = await ctx.request.post(`/api/univers/${w.lame}/membres`, { data: { username: 'mira', role: 'mj' } });
      assert.equal(ajout.status(), 404);
    } finally {
      s.stop();
    }
  });

  // Fails if the E-1 home of the admin lists an universe he is not a member of.
  test('accueil_admin_sans_role_ne_liste_pas_l_univers_mais_porte_l_entree_administration', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { page } = w.admin;
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.getByRole('link', { name: 'Administration' }).waitFor();
      assert.equal(await page.getByText("Lame d'Ébène").count(), 0);
      await capture(page, 'admin-accueil-entree-administration');
      await page.getByRole('link', { name: 'Administration' }).click();
      await page.getByText('Choisissez un univers pour voir ses membres.').waitFor();
      await page.getByText("Lame d'Ébène").first().waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if the "Instance" section is shown to a non-admin MJ, or missing for an admin member.
  test('section_instance_dans_un_univers_seulement_pour_l_admin_membre', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      await ajouter(w.antor.ctx, w.lame, 'admin', 'joueur');
      const { page } = w.admin;
      await page.goto(`/univers/${w.lame}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('heading', { name: "Lame d'Ébène" }).waitFor();
      await page.getByText('Instance', { exact: true }).waitFor();
      await page.getByRole('link', { name: 'Administration' }).waitFor();
      await capture(page, 'admin-membre-section-instance');
      await page.getByRole('link', { name: 'Administration' }).click();
      await page.getByText('Choisissez un univers pour voir ses membres.').waitFor();
      // MJ non admin: neither the section nor the entry
      await w.antor.page.goto(`/univers/${w.lame}`);
      await w.antor.page.waitForLoadState('networkidle');
      await w.antor.page.getByRole('heading', { name: "Lame d'Ébène" }).waitFor();
      assert.equal(await w.antor.page.getByText('Instance', { exact: true }).count(), 0);
      assert.equal(await w.antor.page.getByRole('link', { name: 'Administration' }).count(), 0);
    } finally {
      s.stop();
    }
  });

  // Fails if /administration is served, or its API answers, without a session (B-28).
  test('administration_sans_session_ne_sert_rien', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const ctx = await browser.newContext({ baseURL: s.base });
      const api = await ctx.request.get('/api/instance/univers', { maxRedirects: 0 });
      assert.notEqual(api.status(), 200);
      assert.equal((await api.text()).includes("Lame d'Ébène"), false);
      const page = await ctx.newPage();
      await page.goto(`/administration/univers/${w.lame}`);
      await page.waitForLoadState('networkidle');
      assert.equal(await page.getByText("Lame d'Ébène").count(), 0);
      assert.equal(await page.getByText('antor', { exact: true }).count(), 0);
    } finally {
      s.stop();
    }
  });

  // Fails if "Ajouter" is not disabled with "…" while the request is in flight, or if a double
  // click sends the add twice (ecrans.md: "Écriture en cours").
  test('ajout_en_cours_affiche_points_de_suspension_et_ne_part_qu_une_fois', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { ctx, page } = w.admin;
      let envois = 0;
      await ctx.route(`**/api/instance/univers/${w.lame}/membres`, async (route) => {
        if (route.request().method() === 'POST') {
          envois++;
          await new Promise((r) => setTimeout(r, 1500));
        }
        await route.continue();
      });
      await page.goto(`/administration/univers/${w.lame}`);
      await page.waitForLoadState('networkidle');
      await page.getByText('2 membres').waitFor();
      await page.getByLabel('Identifiant du compte').fill('mira');
      await page.getByRole('button', { name: 'Ajouter' }).dblclick();
      const enCours = page.getByRole('button', { name: '…' });
      await enCours.waitFor();
      assert.equal(await enCours.isDisabled(), true);
      await capture(page, 'admin-ecriture-en-cours');
      await page.getByText('mira', { exact: true }).waitFor();
      await page.getByText('3 membres').waitFor();
      assert.equal(envois, 1);
    } finally {
      s.stop();
    }
  });

  // Fails if a 80-character universe name is not cut by "…" with the full name as tooltip, or if
  // it makes the page scroll sideways.
  test('nom_de_80_caracteres_est_tronque_avec_infobulle', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const long = `${'Long'.repeat(19)}Fin!`;
      assert.equal(long.length, 80);
      await creerUnivers(w.antor.ctx, long);
      const { page } = w.admin;
      await page.goto('/administration');
      await page.waitForLoadState('networkidle');
      const cible = page.locator(`[title="${long}"]`).first();
      await cible.waitFor();
      // the tooltip sits on the link; the cut is done by the element that holds the visible name
      const mesures = await cible.evaluate((el) => {
        const coupes = [el, ...el.querySelectorAll('*')].filter(
          (e) => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth,
        );
        return {
          coupe: coupes.length > 0,
          page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        };
      });
      assert.deepEqual(mesures, { coupe: true, page: true });
      await capture(page, 'admin-nom-long');
    } finally {
      s.stop();
    }
  });
});
