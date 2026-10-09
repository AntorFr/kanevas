import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

// Third layer of E-5 tests (B-6, P-2 step 3, B-29), written from docs/parcours.md and
// docs/ecrans.md only: what the two other files leave out (the P-2 repair story end to end,
// default role, loading states, phone layout, an admin who is only a Joueur, non-admin MJ).
// Black box: real server in stub mode, real Chromium. Screenshots: $E2E_SHOTS or the OS temp dir.
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
    KANEVAS_SANS_SEMIS: '1', // these tests build their own world
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


describe('E-5 Administration : recours, états et exclusions complémentaires (B-6, B-29)', { skip: raisonSaut }, () => {
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

  // Fails if the repair story of P-2 step 3 breaks: the only MJ has left, the admin adds an MJ
  // who has signed in, removes the absent one; the new MJ must read the universe and manage members.
  test('admin_repare_univers_sans_mj_joignable_et_la_nouvelle_mj_y_entre', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const mira = await connecter(s, 'mira');
      const { page } = w.admin;
      await page.goto(`/administration/univers/${w.lame}`);
      await page.getByText('2 membres').waitFor();
      await page.getByLabel('Identifiant du compte').fill('mira');
      await page.getByRole('combobox', { name: 'Rôle', exact: true }).selectOption({ label: 'MJ' });
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByText('3 membres').waitFor();
      assert.equal(await page.getByRole('combobox', { name: 'Rôle de mira' }).inputValue(), 'mj');
      await page.getByRole('button', { name: 'Retirer antor' }).click();
      await page.getByRole('button', { name: 'Retirer antor' }).last().click();
      await page.getByText('2 membres').waitFor();
      assert.equal(await page.getByText('antor', { exact: true }).count(), 0);
      await mira.page.goto(`/univers/${w.lame}`);
      await mira.page.waitForLoadState('networkidle');
      await mira.page.getByRole('heading', { name: "Lame d'Ébène" }).waitFor();
      await capture(mira.page, 'recours-nouvelle-mj');
      await mira.page.getByRole('link', { name: 'Membres' }).waitFor();
      await w.antor.page.goto(`/univers/${w.lame}`);
      await w.antor.page.getByText('Page introuvable.').waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if the role field does not default to Joueur (E-4/E-5: "Joueur par défaut").
  test('ajout_sans_toucher_au_role_donne_joueur', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { page } = w.admin;
      await page.goto(`/administration/univers/${w.lame}`);
      await page.getByText('2 membres').waitFor();
      await page.getByLabel('Identifiant du compte').fill('mira');
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByText('3 membres').waitFor();
      assert.equal(await page.getByRole('combobox', { name: 'Rôle de mira' }).inputValue(), 'joueur');
    } finally {
      s.stop();
    }
  });

  // Fails if the loading texts of E-5 are missing (B-29, "chargement").
  test('textes_de_chargement_des_univers_et_des_membres', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { ctx, page } = w.admin;
      await ctx.route('**/api/instance/univers', async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });
      await ctx.route(`**/api/instance/univers/${w.lame}/membres`, async (route) => {
        if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });
      await page.goto(`/administration/univers/${w.lame}`);
      await page.getByText('Chargement des univers…').waitFor();
      await capture(page, 'recours-chargement-univers');
      await page.getByText('Chargement des membres…').waitFor();
      await page.getByText('2 membres').waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if on a phone the members panel is not under the list of universes (or the page
  // scrolls sideways).
  test('telephone_membres_sous_la_liste_des_univers', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const ctx = await browser.newContext({ baseURL: s.base, viewport: { width: 390, height: 800 } });
      ctx.setDefaultTimeout(8000);
      const page = await ctx.newPage();
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: 'Se connecter en tant que Admin' }).click();
      await page.waitForLoadState('networkidle');
      await page.goto(`/administration/univers/${w.lame}`);
      await page.getByText('2 membres').waitFor();
      const titre = await page.getByText("Lame d'Ébène").first().boundingBox();
      const membres = await page.getByRole('button', { name: 'Retirer lea' }).boundingBox();
      assert.ok(titre && membres && membres.y > titre.y, 'members are below the universe list');
      const ok = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      assert.equal(ok, true);
      await capture(page, 'recours-telephone');
    } finally {
      s.stop();
    }
  });

  // Fails if being in the group while only a Joueur of the universe gives MJ powers (AD-9):
  // no "Membres" item, the members address is "Page introuvable.", the universe routes refuse.
  test('admin_simple_joueur_n_a_pas_les_droits_de_mj_sur_l_univers', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      await ajouter(w.antor.ctx, w.lame, 'admin', 'joueur');
      const { ctx, page } = w.admin;
      await page.goto(`/univers/${w.lame}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('heading', { name: "Lame d'Ébène" }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Membres' }).count(), 0);
      await page.goto(`/univers/${w.lame}/membres`);
      await page.getByText('Page introuvable.').waitFor();
      const rep = await ctx.request.post(`/api/univers/${w.lame}/membres`, { data: { username: 'mira', role: 'mj' } });
      assert.ok(rep.status() >= 400 && rep.status() < 500, `joueur cannot add via the universe route, got ${rep.status()}`);
      // ...but E-5 stays his repair door
      await page.goto(`/administration/univers/${w.lame}`);
      await page.getByText('3 membres').waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if an MJ who is not in the group reaches E-5 or its API, or changes a member through it.
  test('mj_non_admin_n_a_ni_page_ni_api_d_administration', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { ctx, page } = w.antor;
      await page.goto(`/administration/univers/${w.lame}`);
      await page.getByText('Page introuvable.').waitFor();
      assert.equal(await page.getByRole('link', { name: 'Administration' }).count(), 0);
      const liste = await ctx.request.get('/api/instance/univers');
      assert.equal(liste.status(), 404);
      const ajout = await ctx.request.post(`/api/instance/univers/${w.lame}/membres`, { data: { username: 'mira', role: 'mj' } });
      assert.equal(ajout.status(), 404);
      await page.goto(`/univers/${w.lame}/membres`);
      await page.getByText('2 membres').or(page.getByRole('button', { name: 'Retirer lea' })).first().waitFor();
      assert.equal(await page.getByText('mira', { exact: true }).count(), 0);
    } finally {
      s.stop();
    }
  });

  // Fails if E-5 offers any action on the universe itself (name, description): "jamais le contenu".
  test('e5_n_offre_aucun_champ_de_description_ni_de_nom', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { page } = w.admin;
      await page.goto(`/administration/univers/${w.lame}`);
      await page.getByText('2 membres').waitFor();
      assert.equal(await page.getByText(SECRET).count(), 0);
      assert.equal(await page.getByRole('textbox').count(), 1, 'only the member identifier field');
      await page.getByText('Pour lire le contenu, l’admin s’ajoute lui-même', { exact: false }).or(
        page.getByText("Pour lire le contenu, l'admin s'ajoute lui-même", { exact: false }),
      ).first().waitFor();
    } finally {
      s.stop();
    }
  });
});
