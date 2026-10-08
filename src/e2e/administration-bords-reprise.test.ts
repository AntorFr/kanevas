import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import Database from 'better-sqlite3';

// Second pass of black-box tests for B-6 / P-2 step 3 / E-5 / B-29 (kanevas-recours-admin), written
// from docs/parcours.md and docs/ecrans.md only: boundaries of the addresses and of the API, the
// admin kept out of the member-manager routes of E-4, a shared browser changing account, the admin
// joining as a Player, and the "long content" state (200 members, a very long identifier).
// Real server in stub mode, real Chromium through Playwright (looked up locally, then globally;
// skipped with a reason without it). Screenshots: $E2E_SHOTS or the OS temp dir.

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

const SECRET = 'Description secrète de la Lame';

/** Lame d'Ébène: antor MJ, lea Joueuse, mira has signed in once. */
async function monde(s: Serveur) {
  const antor = await connecter(s, 'antor');
  const lea = await connecter(s, 'lea');
  const mira = await connecter(s, 'mira');
  const lame = await creerUnivers(antor.ctx, "Lame d'Ébène", SECRET);
  await ajouter(antor.ctx, lame, 'lea', 'joueur');
  return { antor, lea, mira, lame };
}

describe('E-5 Administration : bords, exclusions et contenu long (B-6, B-29)', { skip: raisonSaut }, () => {
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

  // Fails if an unknown or malformed universe address stops answering "Page introuvable.".
  test('adresses_d_univers_inexistantes_ou_mal_formees_sont_page_introuvable', async () => {
    const s = await demarrer();
    try {
      const m = await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page, `/administration/univers/${m.lame}`);
      await page.getByText('Membres —').first().waitFor();
      for (const id of ['999999', '0', 'abc']) {
        await ouvrirAdmin(page, `/administration/univers/${id}`);
        await page.getByText('Page introuvable.').waitFor();
        assert.equal(await page.getByText('Membres —').count(), 0, `members zone for ${id}`);
      }
      await capture(page, 'bords-univers-inconnu');
    } finally {
      s.stop();
    }
  });

  // Fails if the instance API accepts a role other than MJ / Joueur, an empty body, or a member
  // that does not exist, or if one of them changes the list.
  test('api_instance_refuse_les_entrees_fausses_et_ne_change_rien', async () => {
    const s = await demarrer();
    try {
      const m = await monde(s);
      const { ctx } = await connecter(s, 'admin');
      const url = `/api/instance/univers/${m.lame}/membres`;
      const avant = (await (await ctx.request.get(url)).json()) as Array<{ username?: string; role: string }>;
      assert.equal(avant.length, 2);

      const roleFaux = await ctx.request.post(url, { data: { username: 'mira', role: 'dieu' } });
      assert.ok(roleFaux.status() >= 400 && roleFaux.status() < 500, `role dieu: ${roleFaux.status()}`);
      const sansCorps = await ctx.request.post(url, { data: {} });
      assert.ok(sansCorps.status() >= 400 && sansCorps.status() < 500, `empty body: ${sansCorps.status()}`);
      const inconnu = await ctx.request.post(url, { data: { username: 'nadia', role: 'joueur' } });
      assert.ok(inconnu.status() >= 400 && inconnu.status() < 500, `unknown account: ${inconnu.status()}`);
      const patch = await ctx.request.patch(`${url}/999999`, { data: { role: 'mj' } });
      assert.ok(patch.status() >= 400 && patch.status() < 500, `patch non-member: ${patch.status()}`);
      const del = await ctx.request.delete(`${url}/999999`);
      assert.ok(del.status() >= 400 && del.status() < 500, `delete non-member: ${del.status()}`);
      const horsUnivers = await ctx.request.get('/api/instance/univers/999999/membres');
      assert.equal(horsUnivers.status(), 404);

      const apres = (await (await ctx.request.get(url)).json()) as unknown[];
      assert.equal(apres.length, 2, 'list unchanged');
      assert.equal(JSON.stringify(apres), JSON.stringify(avant));
    } finally {
      s.stop();
    }
  });

  // Fails if the admin without a role in the universe can use the member routes of E-4, or read
  // the universe through the ordinary routes (B-6: the admin goes through E-5 and never reads).
  test('admin_sans_role_n_a_ni_les_routes_membres_d_e4_ni_le_contenu', async () => {
    const s = await demarrer();
    try {
      const m = await monde(s);
      const { ctx } = await connecter(s, 'admin');
      const ajout = await ctx.request.post(`/api/univers/${m.lame}/membres`, { data: { username: 'mira', role: 'mj' } });
      assert.equal(ajout.ok(), false, `E-4 add as admin: ${ajout.status()}`);
      const liste = await ctx.request.get(`/api/univers/${m.lame}/membres`);
      assert.equal(liste.ok(), false, `E-4 list as admin: ${liste.status()}`);
      const fiche = await ctx.request.get(`/api/univers/${m.lame}`);
      assert.equal(fiche.ok(), false, `universe read as admin: ${fiche.status()}`);
      assert.equal((await fiche.text()).includes(SECRET), false);
      const mienne = await ctx.request.get('/api/univers');
      assert.equal((await mienne.text()).includes("Lame d'Ébène"), false, 'not in "my universes"');
      // the instance list carries the name and the count, never the description
      const instance = await ctx.request.get('/api/instance/univers');
      const corps = await instance.text();
      assert.ok(corps.includes("Lame d'Ébène"));
      assert.equal(corps.includes(SECRET), false);
      // nothing was added by the refused attempt
      const membres = (await (await ctx.request.get(`/api/instance/univers/${m.lame}/membres`)).json()) as unknown[];
      assert.equal(membres.length, 2);
    } finally {
      s.stop();
    }
  });

  // Fails if the admin right (or the entry) survives a change of account in the same browser.
  test('apres_deconnexion_un_autre_compte_n_a_ni_entree_ni_page_d_administration', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { ctx, page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText('Univers de l’instance').or(page.getByText("Univers de l'instance")).first().waitFor();
      // The account menu (avatar, foot of the bar) carries « Se déconnecter ».
      await page.getByRole('button', { name: /admin/i }).first().click();
      await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
      await page.waitForLoadState('networkidle');
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: 'Se connecter en tant que Léa' }).click();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.getByText('Administration', { exact: true }).count(), 0, 'no sidebar entry');
      await ouvrirAdmin(page);
      await page.getByText('Page introuvable.').waitFor();
      assert.equal(await page.getByText("Lame d'Ébène").count(), 0);
      assert.equal((await ctx.request.get('/api/instance/univers')).status(), 404);
      await capture(page, 'bords-changement-de-compte');
    } finally {
      s.stop();
    }
  });

  // Fails if the admin who joins as a Player is shown as MJ to Antor, or cannot open the overview.
  test('admin_qui_s_ajoute_joueur_ouvre_l_univers_et_antor_le_voit_joueur', async () => {
    const s = await demarrer();
    try {
      const m = await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page, `/administration/univers/${m.lame}`);
      await page.getByText('2 membres').waitFor();
      await page.getByLabel('Identifiant du compte').fill('admin');
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByText('3 membres').first().waitFor();
      await page.getByRole('link', { name: 'Ouvrir' }).click();
      await page.waitForLoadState('networkidle');
      assert.match(page.url(), new RegExp(`/univers/${m.lame}$`));
      assert.equal(await page.getByText('Page introuvable.').count(), 0);

      await m.antor.page.goto(`/univers/${m.lame}/membres`);
      await m.antor.page.waitForLoadState('networkidle');
      const ligne = m.antor.page.getByText('admin', { exact: true }).locator('xpath=ancestor::*[.//select][1]');
      await ligne.waitFor();
      assert.equal(await ligne.locator('select option:checked').innerText(), 'Joueur');
      assert.equal(await ligne.getByRole('button', { name: 'Retirer' }).count(), 1);
      await capture(m.antor.page, 'bords-antor-voit-admin-joueur');
    } finally {
      s.stop();
    }
  });

  // Fails if a universe of 200 members breaks the list (no scrolling, page overflow) or if a very
  // long identifier is neither cut by an ellipsis nor given its tooltip.
  test('deux_cents_membres_et_identifiant_long_tronque_avec_infobulle', async () => {
    const s = await demarrer();
    try {
      const antor = await connecter(s, 'antor');
      const id = await creerUnivers(antor.ctx, 'Table géante');
      const long = `${'x'.repeat(70)}-identifiant-tres-long`;
      const db = new Database(s.dbPath);
      try {
        const cree = (db.prepare('SELECT cree_le FROM comptes WHERE username = ?').get('antor') as { cree_le: unknown }).cree_le;
        const insC = db.prepare('INSERT INTO comptes (username, cree_le) VALUES (?, ?)');
        const insM = db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, 'joueur')");
        db.transaction(() => {
          for (let i = 1; i <= 198; i++) {
            const c = insC.run(`joueur${String(i).padStart(3, '0')}`, cree);
            insM.run(id, c.lastInsertRowid);
          }
          insM.run(id, insC.run(long, cree).lastInsertRowid);
        })();
      } finally {
        db.close();
      }
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page, `/administration/univers/${id}`);
      await page.getByText('200 membres').first().waitFor();
      const dernier = page.getByRole('button', { name: 'Retirer joueur198' });
      await dernier.scrollIntoViewIfNeeded();
      assert.equal(await dernier.isVisible(), true, 'last of 200 members reachable by scrolling');
      const debordement = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.ok(debordement <= 0, `horizontal page overflow: ${debordement}px`);

      const cible = page.getByText(long, { exact: true }).first();
      await cible.scrollIntoViewIfNeeded();
      const mesure = await cible.evaluate((el) => {
        let n: Element | null = el;
        // the element carrying the ellipsis may be the text node's element or its parent
        for (let i = 0; i < 3 && n; i++, n = n.parentElement) {
          const st = getComputedStyle(n);
          if (st.textOverflow === 'ellipsis') {
            return { ellipsis: true, coupe: n.scrollWidth > n.clientWidth, titre: n.getAttribute('title') ?? el.getAttribute('title') };
          }
        }
        return { ellipsis: false, coupe: false, titre: el.getAttribute('title') };
      });
      assert.equal(mesure.ellipsis, true, 'long identifier truncated by an ellipsis');
      assert.equal(mesure.coupe, true, 'long identifier actually cut');
      assert.equal(mesure.titre, long, 'tooltip carries the full identifier');
      await capture(page, 'bords-200-membres');
    } finally {
      s.stop();
    }
  });
});
