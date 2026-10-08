import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

// Black-box tests of B-6, P-2 step 3, E-5, B-29 (kanevas-recours-admin), written from
// docs/parcours.md and docs/ecrans.md only: the real server in stub mode (KANEVAS_STUB=1),
// a real Chromium driven by Playwright. Expected values are literals taken from the docs.
// Playwright is not a dependency of the repo: it is looked up locally, then in the global
// node_modules of the image; without it the suite is skipped (and says why).
// Screenshots go to $E2E_SHOTS (default: the OS temp dir), never into the tree.

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

/** Signs in as a stub account in a fresh browser context. */
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

/** Lame d'Ébène: antor MJ, lea Joueuse; mira and teo have signed in once. */
async function monde(s: Serveur) {
  const antor = await connecter(s, 'antor');
  const lea = await connecter(s, 'lea');
  const mira = await connecter(s, 'mira');
  const teo = await connecter(s, 'teo');
  const lame = await creerUnivers(antor.ctx, "Lame d'Ébène", 'Description secrète de la Lame');
  await ajouter(antor.ctx, lame, 'lea', 'joueur');
  return { antor, lea, mira, teo, lame };
}

/** Docs write a straight apostrophe, the UI may typeset a curly one: accept both. */
function t(texte: string, entier = true): RegExp {
  const echappe = texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['\u2019]");
  return new RegExp(entier ? `^${echappe}$` : echappe);
}

async function capture(page: Page, nom: string) {
  await page.screenshot({ path: join(SHOTS, `${nom}.png`), fullPage: true });
}

async function ouvrirAdmin(page: Page) {
  await page.goto('/administration');
  await page.waitForLoadState('networkidle');
}

describe('E-5 Administration (B-6, P-2 étape 3)', { skip: raisonSaut }, () => {
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

  // Fails if the admin list drops members, their role, or leaks the description.
  test('admin_sans_role_voit_univers_et_membres_sans_description', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.waitForLoadState('networkidle');
      await page.getByText('2 membres').waitFor();
      await page.getByText('antor', { exact: true }).waitFor();
      await page.getByText('lea', { exact: true }).waitFor();
      assert.equal(await page.getByText('Description secrète').count(), 0);
      assert.equal(await page.getByText('Sélectionné').count(), 1);
      await capture(page, 'admin-voit-membres');
      // no role: the universe overview is "Page introuvable."
      const id = page.url().match(/\/administration\/univers\/(\d+)/)?.[1];
      assert.ok(id, 'selection puts the universe id in the address');
      await page.goto(`/univers/${id}`);
      await page.getByText('Page introuvable.').waitFor();
      assert.equal(await page.getByText('Description secrète').count(), 0);
    } finally {
      s.stop();
    }
  });

  // Fails if adding someone else opens the content, or if self-add does not open it / hide from the MJ.
  test('admin_ajoute_mira_puis_se_ajoute_et_antor_le_voit', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByText('2 membres').waitFor();
      await page.getByLabel('Identifiant du compte').fill('mira');
      await page.getByRole('combobox').last().selectOption({ label: 'MJ' });
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByText('mira', { exact: true }).waitFor();
      await page.goto(`/univers/${w.lame}`);
      await page.getByText('Page introuvable.').waitFor();
      // now self-add as MJ
      await page.goto(`/administration/univers/${w.lame}`);
      await page.getByLabel('Identifiant du compte').fill('admin');
      await page.getByRole('combobox').last().selectOption({ label: 'MJ' });
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByRole('button', { name: 'Retirer admin' }).waitFor();
      await page.goto(`/univers/${w.lame}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('heading', { name: "Lame d'Ébène" }).waitFor();
      await capture(page, 'admin-devenu-membre-vue-ensemble');
      // Antor, on E-4, sees admin in the member list
      await w.antor.page.goto(`/univers/${w.lame}`);
      await w.antor.page.getByRole('link', { name: 'Membres' }).click();
      await w.antor.page.getByText('admin', { exact: true }).waitFor();
      await capture(w.antor.page, 'antor-voit-admin-membre');
    } finally {
      s.stop();
    }
  });

  // Fails if the Administration entry or the route is open to non-admins.
  test('joueuse_n_a_ni_entree_administration_ni_page', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      await w.lea.page.goto(`/univers/${w.lame}`);
      await w.lea.page.waitForLoadState('networkidle');
      assert.equal(await w.lea.page.getByText('Administration').count(), 0);
      await w.lea.page.goto('/');
      await w.lea.page.waitForLoadState('networkidle');
      assert.equal(await w.lea.page.getByText('Administration').count(), 0);
      await ouvrirAdmin(w.lea.page);
      await w.lea.page.getByText('Page introuvable.').waitFor();
      assert.equal(await w.lea.page.getByText("Lame d'Ébène").count(), 0);
      await capture(w.lea.page, 'lea-administration-introuvable');
    } finally {
      s.stop();
    }
  });

  // Fails if the API for non-admins answers anything but "unknown address".
  test('api_instance_ferme_aux_non_admins', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      for (const chemin of ['/api/instance/univers', `/api/instance/univers/${w.lame}/membres`]) {
        const rep = await w.lea.ctx.request.get(chemin);
        assert.equal(rep.status(), 404, chemin);
        assert.equal(await rep.text().then((t) => t.includes("Lame d'Ébène")), false);
      }
      const ajout = await w.lea.ctx.request.post(`/api/instance/univers/${w.lame}/membres`, {
        data: { username: 'teo', role: 'joueur' },
      });
      assert.equal(ajout.status(), 404);
    } finally {
      s.stop();
    }
  });

  // Fails if the last-MJ guard is not applied to the admin's gesture.
  test('admin_ne_retire_pas_le_seul_mj', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const landes = await creerUnivers(w.mira.ctx, 'Les Landes grises');
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText('Les Landes grises').click();
      await page.getByText('1 membre', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Retirer mira' }).click();
      const confirmer = page.getByRole('button', { name: 'Retirer mira' });
      await confirmer.last().click();
      await page.getByText(t("Impossible : l'univers doit garder au moins un MJ.")).waitFor();
      assert.equal(await page.getByText('mira', { exact: true }).count(), 1);
      await page.getByText('1 membre', { exact: true }).waitFor();
      await capture(page, 'admin-dernier-mj-refuse');
      assert.ok(landes > 0);
    } finally {
      s.stop();
    }
  });

  // Fails if the member count of the universe list does not follow an add or a removal.
  test('compte_de_membres_suit_ajout_et_retrait', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByText('2 membres').waitFor();
      await page.getByLabel('Identifiant du compte').fill('mira');
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByText('mira', { exact: true }).waitFor();
      await page.getByText('3 membres').waitFor({ timeout: 3000 });
      await page.getByRole('button', { name: 'Retirer mira' }).click();
      await page.getByRole('button', { name: 'Retirer mira' }).last().click();
      await page.getByText('mira', { exact: true }).waitFor({ state: 'detached' });
      await page.getByText('2 membres').waitFor({ timeout: 3000 });
    } finally {
      s.stop();
    }
  });

  // Fails if an account that never signed in can be added.
  test('admin_ne_peut_ajouter_un_compte_jamais_connecte', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByText('2 membres').waitFor();
      await page.getByLabel('Identifiant du compte').fill('nadia');
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByText(t('Ce compte ne s\'est jamais connecté.')).waitFor();
      await page.getByText('2 membres').waitFor();
      assert.equal(await page.getByText('nadia', { exact: true }).count(), 0);
    } finally {
      s.stop();
    }
  });

  // Fails if a duplicate member is accepted.
  test('admin_ne_peut_ajouter_un_compte_deja_membre', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByText('2 membres').waitFor();
      await page.getByLabel('Identifiant du compte').fill('lea');
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByText(t('Ce compte est déjà membre.')).waitFor();
      await page.getByText('2 membres').waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if the "Ouvrir" link is shown for universes without a role, or missing for member ones.
  test('lien_ouvrir_seulement_sur_univers_dont_admin_est_membre', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { ctx, page } = await connecter(s, 'admin');
      await creerUnivers(ctx, 'Brume');
      await ouvrirAdmin(page);
      await page.getByText('Brume').first().waitFor();
      assert.equal(await page.getByRole('link', { name: /Ouvrir/ }).count(), 1);
      await capture(page, 'admin-lien-ouvrir');
      // Brume: admin is the only member, MJ: removing self is refused, the link stays
      await page.getByText('Brume').first().click();
      await page.getByRole('button', { name: 'Retirer admin' }).click();
      await page.getByRole('button', { name: 'Retirer admin' }).last().click();
      await page.getByText(t("Impossible : l'univers doit garder au moins un MJ.")).waitFor();
      assert.equal(await page.getByRole('link', { name: /Ouvrir/ }).count(), 1);
      await page.getByRole('link', { name: /Ouvrir/ }).click();
      await page.getByRole('heading', { name: 'Brume' }).waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if self-removal drags the admin off E-5, or leaves the universe on his home page.
  test('admin_membre_qui_se_retire_reste_sur_e5_et_perd_l_univers', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { ctx, page } = await connecter(s, 'admin');
      await ajouter(w.antor.ctx, w.lame, 'admin', 'mj');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByRole('button', { name: 'Retirer admin' }).waitFor();
      assert.equal(await page.getByRole('link', { name: /Ouvrir/ }).count(), 1);
      await page.getByRole('button', { name: 'Retirer admin' }).click();
      await page.getByRole('button', { name: 'Retirer admin' }).last().click();
      await page.getByRole('button', { name: 'Retirer admin' }).first().waitFor({ state: 'detached' });
      assert.ok(page.url().includes('/administration'));
      assert.equal(await page.getByRole('link', { name: /Ouvrir/ }).count(), 0);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      assert.equal(await page.getByText("Lame d'Ébène").count(), 0);
      await page.getByText(t('Aucun univers pour l\'instant.')).waitFor();
      void ctx;
    } finally {
      s.stop();
    }
  });

  // Fails if the admin cannot remove a plain member (with the confirmation).
  test('admin_retire_un_membre_avec_confirmation', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByText('2 membres').waitFor();
      await page.getByRole('button', { name: 'Retirer lea' }).click();
      await page.getByText(t("Retirer lea de Lame d'Ébène ?")).waitFor();
      await page.getByRole('button', { name: 'Annuler' }).click();
      await page.getByText('2 membres').waitFor();
      await page.getByRole('button', { name: 'Retirer lea' }).click();
      await page.getByRole('button', { name: 'Retirer lea' }).last().click();
      await page.getByRole('button', { name: 'Retirer lea' }).first().waitFor({ state: 'detached' });
      assert.equal(await page.getByText('lea', { exact: true }).count(), 0);
      // lea no longer sees the universe
      await w.lea.page.goto(`/univers/${w.lame}`);
      await w.lea.page.getByText('Page introuvable.').waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if the role change does not apply, or if the sole MJ can be demoted.
  test('admin_change_un_role_et_ne_retrograde_pas_le_seul_mj', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByRole('combobox', { name: 'Rôle de lea' }).selectOption({ label: 'MJ' });
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page.getByRole('combobox', { name: 'Rôle de lea' }).waitFor();
      assert.equal(await page.getByRole('combobox', { name: 'Rôle de lea' }).inputValue(), 'mj');
      // lea is now MJ: she sees the Membres item
      await w.lea.page.goto(`/univers/${w.lame}`);
      await w.lea.page.getByRole('link', { name: 'Membres' }).waitFor();
      // demote both MJs back: the last one is refused
      await page.getByRole('combobox', { name: 'Rôle de lea' }).selectOption({ label: 'Joueur' });
      await page.waitForLoadState('networkidle');
      await page.getByRole('combobox', { name: 'Rôle de antor' }).selectOption({ label: 'Joueur' });
      await page.getByText(t("Impossible : l'univers doit garder au moins un MJ.")).waitFor();
      assert.equal(await page.getByRole('combobox', { name: 'Rôle de antor' }).inputValue(), 'mj');
    } finally {
      s.stop();
    }
  });

  // Fails if the list is not by name (case-insensitive) or the empty/unselected texts are wrong.
  test('liste_triee_sans_casse_et_textes_vide_et_sans_selection', async () => {
    const s = await demarrer();
    try {
      const { ctx, page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText(t("Aucun univers sur l'instance pour l'instant.")).waitFor();
      await capture(page, 'admin-aucun-univers');
      for (const nom of ['zèbre', 'Alpha', 'beta']) await creerUnivers(ctx, nom);
      await ouvrirAdmin(page);
      await page.getByText('Choisissez un univers pour voir ses membres.').waitFor();
      const texte = await page.locator('main').innerText();
      const pos = ['Alpha', 'beta', 'zèbre'].map((n) => texte.indexOf(n));
      assert.ok(pos.every((p) => p >= 0), texte);
      assert.ok(pos[0] < pos[1] && pos[1] < pos[2], `order in: ${texte}`);
    } finally {
      s.stop();
    }
  });

  // Fails if an unknown universe is not "Page introuvable.".
  test('univers_inconnu_dans_administration_est_page_introuvable', async () => {
    const s = await demarrer();
    try {
      const { page } = await connecter(s, 'admin');
      await page.goto('/administration/univers/99999');
      await page.getByText('Page introuvable.').waitFor();
      await page.getByRole('link', { name: 'Mes univers' }).first().waitFor();
    } finally {
      s.stop();
    }
  });

  // Same address, but on an instance that has universes.
  test('univers_inconnu_parmi_d_autres_est_page_introuvable', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { page } = await connecter(s, 'admin');
      await page.goto('/administration/univers/99999');
      await page.getByText('Page introuvable.').waitFor();
      await page.getByRole('link', { name: 'Mes univers' }).first().waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if the list of universes failing to load shows no error or no retry.
  test('erreur_de_chargement_des_univers_puis_reessayer', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { ctx, page } = await connecter(s, 'admin');
      let casse = true;
      await ctx.route('**/api/instance/univers', (route) => (casse ? route.abort() : route.continue()));
      await ouvrirAdmin(page);
      await page.getByText('Impossible de charger les univers.').waitFor();
      await capture(page, 'admin-erreur-univers');
      casse = false;
      await page.getByRole('button', { name: 'Réessayer' }).click();
      await page.getByText("Lame d'Ébène").first().waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if a failing member list shows no error, or if a failing write shows no message.
  test('erreur_de_chargement_des_membres_et_echec_d_ecriture', async () => {
    const s = await demarrer();
    try {
      const w = await monde(s);
      const { ctx, page } = await connecter(s, 'admin');
      let casse = true;
      await ctx.route(`**/api/instance/univers/${w.lame}/membres`, (route) =>
        casse ? route.abort() : route.continue(),
      );
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByText('Impossible de charger les membres.').waitFor();
      casse = false;
      await page.getByRole('button', { name: 'Réessayer' }).click();
      await page.getByText('lea', { exact: true }).waitFor();
      casse = true;
      await page.getByLabel('Identifiant du compte').fill('mira');
      await page.getByRole('button', { name: 'Ajouter' }).click();
      await page.getByText(t("L'action n'a pas abouti. Réessayez.")).waitFor();
      await capture(page, 'admin-echec-ecriture');
      assert.equal(await page.getByText('mira', { exact: true }).count(), 0);
    } finally {
      s.stop();
    }
  });

  // Fails if offline does not show the banner and disable the writing buttons.
  test('connexion_perdue_bandeau_et_boutons_desactives', async () => {
    const s = await demarrer();
    try {
      await monde(s);
      const { ctx, page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      await page.getByText("Lame d'Ébène").first().click();
      await page.getByText('lea', { exact: true }).waitFor();
      await ctx.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await page
        .getByText(t("Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.", false))
        .waitFor();
      assert.equal(await page.getByRole('button', { name: 'Ajouter' }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Retirer lea' }).isDisabled(), true);
      await page.getByText('lea', { exact: true }).waitFor();
      await capture(page, 'admin-connexion-perdue');
    } finally {
      s.stop();
    }
  });

  // Fails if the 100-by-100 pagination or the long-name truncation is missing.
  test('trois_cents_univers_cent_a_la_fois_puis_charger_la_suite', async () => {
    const s = await demarrer();
    try {
      const { ctx, page } = await connecter(s, 'admin');
      for (let i = 0; i < 300; i++) {
        await creerUnivers(ctx, `Univers ${String(i).padStart(3, '0')}`);
      }
      await creerUnivers(ctx, 'Z'.repeat(80));
      await ouvrirAdmin(page);
      assert.equal(await page.getByText(/^Univers \d{3}$/).count(), 100);
      await page.getByRole('button', { name: 'Charger la suite' }).click();
      await page.waitForFunction(() => document.body.innerText.includes('Univers 199'));
      assert.equal(await page.getByText(/^Univers \d{3}$/).count(), 200);
      await page.getByRole('button', { name: 'Charger la suite' }).click();
      await page.waitForFunction(() => document.body.innerText.includes('Univers 299'));
      assert.equal(await page.getByText(/^Univers \d{3}$/).count(), 300);
      await capture(page, 'admin-contenu-long');
    } finally {
      s.stop();
    }
  });
});
