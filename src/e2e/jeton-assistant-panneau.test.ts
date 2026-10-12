import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

// Black-box tests of the E-5 panel « Jeton de l'assistant » (B-51, P-15, B-29), written from
// docs/parcours.md and docs/ecrans.md: the real server in stub mode, a real Chromium driven by
// Playwright. Server answers the stub cannot produce are simulated with page.route.
// Playwright is looked up locally then globally; without it the suite is skipped.
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
  /** Kills the process and starts another on the same port and database. */
  redemarrer: () => Promise<void>;
}

async function demarrer(): Promise<Serveur> {
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
  let child: ChildProcess;
  const lancer = async () => {
    child = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: 'ignore' });
    for (let i = 0; i < 150; i++) {
      try {
        await fetch(`${base}/healthz`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    child.kill('SIGKILL');
    throw new Error('server did not start');
  };
  await lancer();
  return {
    base,
    stop: () => {
      child.kill('SIGKILL');
      rmSync(dossier, { recursive: true, force: true });
    },
    redemarrer: async () => {
      child.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 300));
      await lancer();
    },
  };
}

const NOMS: Record<string, string> = { antor: 'Antor', lea: 'Léa', admin: 'Admin' };

async function connecter(s: Serveur, compte: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: s.base, viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: `Se connecter en tant que ${NOMS[compte]}` }).click();
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}

/** Docs write a straight apostrophe, the UI may typeset a curly one: accept both. */
function t(texte: string): RegExp {
  const echappe = texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['\u2019]");
  return new RegExp(echappe);
}

async function capture(page: Page, nom: string) {
  await page.screenshot({ path: join(SHOTS, `jeton-${nom}.png`), fullPage: true });
}

async function ouvrirAdmin(page: Page) {
  await page.goto('/administration');
  await page.waitForLoadState('networkidle');
}

const panneau = (page: Page) => page.getByRole('region', { name: t('Jeton de l\'assistant') });
const BASE = '**/api/instance/assistant/jeton';

describe('E-5 panneau « Jeton de l\'assistant » (B-51, P-15)', { skip: raisonSaut }, () => {
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

  // Fails if the panel is missing, the empty state wrong, focus not on « Code », « Valider » enabled when empty,
  // the date wrong, the button label not swapped, or the token value reaches a response or the DOM.
  test('admin_connecte_labonnement_en_bouchon_et_ne_voit_jamais_le_jeton', async () => {
    const s = await demarrer();
    try {
      const { page } = await connecter(s, 'admin');
      const corps: string[] = [];
      page.on('response', async (r) => {
        if (r.url().includes('/api/instance/assistant')) corps.push(await r.text().catch(() => ''));
      });
      await ouvrirAdmin(page);
      const p = panneau(page);
      await p.getByText('Aucun jeton posé.').waitFor();
      // stub: the assistant already answers, so the unavailable note is absent
      assert.equal(await page.getByText(/L.assistant est indisponible/).count(), 0);
      await capture(page, 'vide');
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      const champ = p.getByLabel('Code');
      await champ.waitFor();
      assert.ok(await p.getByText(/https:\/\/claude\.ai\/oauth\/authorize/).count() >= 1, 'address shown');
      await p.getByRole('link', { name: 'Ouvrir' }).waitFor();
      assert.equal(await p.getByRole('link', { name: 'Ouvrir' }).getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await p.getByRole('link', { name: 'Ouvrir' }).getAttribute('target'), '_blank');
      await p.getByRole('button', { name: 'Copier' }).waitFor();
      assert.equal(await champ.evaluate((n) => document.activeElement === n), true, 'focus on Code');
      assert.equal(await p.getByRole('button', { name: 'Valider' }).isDisabled(), true);
      await p.getByText(/Cette connexion expire dans 10 minutes\./).waitFor();
      await p.getByText(/Reste 10 min\./).waitFor();
      await capture(page, 'connexion');
      await champ.fill('bouchon');
      assert.equal(await p.getByRole('button', { name: 'Valider' }).isEnabled(), true);
      await p.getByRole('button', { name: 'Valider' }).click();
      const jour = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      await p.getByText(`Jeton posé le ${jour}.`).waitFor();
      assert.equal(await p.getByLabel('Code').count(), 0, 'field gone');
      await p.getByRole('button', { name: 'Reconnecter l’abonnement' }).waitFor();
      assert.equal(await p.getByRole('button', { name: 'Connecter l’abonnement', exact: true }).count(), 0);
      await p.getByText('L’assistant est disponible sur tous les univers.').waitFor();
      await capture(page, 'pose');
      // reload: state read, no address, no field, still posed
      await ouvrirAdmin(page);
      await panneau(page).getByText(`Jeton posé le ${jour}.`).waitFor();
      assert.equal(await panneau(page).getByLabel('Code').count(), 0);
      const dom = await page.content();
      for (const secret of ['sk-ant-oat01-bouchon', 'oat01']) {
        assert.equal(dom.includes(secret), false, `DOM has ${secret}`);
        assert.equal(corps.some((c) => c.includes(secret)), false, `response has ${secret}`);
      }
    } finally {
      s.stop();
    }
  });

  // Fails if a wrong code poses something, drops the previous state, or blocks a second attempt.
  test('un_autre_code_dit_echec_garde_letat_et_un_second_essai_valide_marche', async () => {
    const s = await demarrer();
    try {
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      const p = panneau(page);
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await p.getByLabel('Code').fill('nimporte');
      await p.getByRole('button', { name: 'Valider' }).click();
      await p.getByText('La connexion n’a pas abouti. Recommencez.').waitFor();
      await p.getByText('Aucun jeton posé.').waitFor();
      assert.equal(await p.getByLabel('Code').count(), 0);
      // focus back on the connect button
      const focus = await page.evaluate(() => document.activeElement?.textContent);
      assert.match(focus ?? '', /Connecter l.abonnement/);
      await capture(page, 'echec');
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      assert.equal(await p.getByLabel('Code').inputValue(), '', 'field emptied');
      await p.getByLabel('Code').fill('bouchon');
      await p.getByRole('button', { name: 'Valider' }).click();
      await p.getByText(/^Jeton posé le /).first().waitFor();
      // a wrong code over a posed token keeps the posed state
      await p.getByRole('button', { name: 'Reconnecter l’abonnement' }).click();
      await p.getByLabel('Code').fill('faux');
      await p.getByRole('button', { name: 'Valider' }).click();
      await p.getByText('La connexion n’a pas abouti. Recommencez.').waitFor();
      await p.getByText(/Jeton posé le /).waitFor();
      await p.getByRole('button', { name: 'Reconnecter l’abonnement' }).waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if a server restart during a connection does not surface as « expiré », or the old state is lost.
  test('serveur_redemarre_pendant_la_connexion_dit_expiree', async () => {
    const s = await demarrer();
    try {
      const { page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      const p = panneau(page);
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await p.getByLabel('Code').waitFor();
      await s.redemarrer();
      await p.getByLabel('Code').fill('bouchon');
      await p.getByRole('button', { name: 'Valider' }).click();
      await p.getByText('La connexion a expiré. Recommencez.').waitFor();
      await p.getByText('Aucun jeton posé.').waitFor();
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).waitFor();
      await capture(page, 'expiree');
    } finally {
      s.stop();
    }
  });

  // Fails if the remaining time never goes down, or at 0 the field is not replaced by the expiry sentence.
  test('temps_restant_descend_et_a_zero_la_phrase_dexpiration_remplace_le_champ', async () => {
    const s = await demarrer();
    try {
      const { ctx } = await connecter(s, 'admin');
      const page = await ctx.newPage();
      await page.clock.install();
      await page.goto('/administration');
      await page.waitForLoadState('networkidle');
      const p = panneau(page);
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await p.getByText('Reste 10 min.').waitFor();
      await page.clock.fastForward(90_000);
      await p.getByText('Reste 9 min.').waitFor();
      await page.clock.fastForward(8 * 60_000 + 20_000);
      await p.getByText('Reste moins d’une minute.').waitFor();
      await page.clock.fastForward(60_000);
      await p.getByText('La connexion a expiré. Recommencez.').waitFor();
      assert.equal(await p.getByLabel('Code').count(), 0);
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if selecting another universe remounts the panel and drops the open connection.
  test('changer_dunivers_selectionne_ne_ferme_pas_la_connexion', async () => {
    const s = await demarrer();
    try {
      const { ctx, page } = await connecter(s, 'admin');
      for (const nom of ['Alpha', 'Beta']) {
        const r = await ctx.request.post('/api/univers', { data: { nom, description: '' } });
        assert.equal(r.status(), 201);
      }
      await ouvrirAdmin(page);
      const p = panneau(page);
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await p.getByLabel('Code').fill('bou');
      await page.getByText('Alpha', { exact: true }).first().click();
      await page.waitForURL(/\/administration\/univers\/\d+/);
      assert.equal(await p.getByLabel('Code').inputValue(), 'bou');
      await page.getByText('Beta', { exact: true }).first().click();
      await page.waitForLoadState('networkidle');
      assert.equal(await p.getByLabel('Code').inputValue(), 'bou');
      await p.getByText(/https:\/\/claude\.ai/).first().waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if the write buttons stay enabled offline.
  test('reseau_coupe_desactive_connecter_valider_annuler_et_les_reactive_au_retour', async () => {
    const s = await demarrer();
    try {
      const { ctx, page } = await connecter(s, 'admin');
      await ouvrirAdmin(page);
      const p = panneau(page);
      await ctx.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await page.getByText(/Connexion perdue/).first().waitFor();
      assert.equal(await p.getByRole('button', { name: 'Connecter l’abonnement' }).isDisabled(), true);
      await capture(page, 'hors-ligne');
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).and(page.locator(':enabled')).waitFor();
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await p.getByLabel('Code').fill('x');
      await ctx.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await page.getByText(/Connexion perdue/).first().waitFor();
      assert.equal(await p.getByRole('button', { name: 'Valider' }).isDisabled(), true);
      assert.equal(await p.getByRole('button', { name: 'Annuler' }).isDisabled(), true);
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await p.getByRole('button', { name: 'Valider' }).and(page.locator(':enabled')).waitFor();
    } finally {
      s.stop();
    }
  });

  // Fails if a non-admin sees the panel, or the panel routes answer anything but 404 to them.
  test('lea_voit_page_introuvable_et_404_sur_les_routes_du_panneau', async () => {
    const s = await demarrer();
    try {
      const { ctx, page } = await connecter(s, 'lea');
      await ouvrirAdmin(page);
      await page.getByText('Page introuvable.').waitFor();
      assert.equal(await page.getByText(/Jeton de l.assistant/).count(), 0);
      for (const [m, u] of [
        ['GET', '/api/instance/assistant/jeton'],
        ['POST', '/api/instance/assistant/jeton/connexion'],
        ['POST', '/api/instance/assistant/jeton/code'],
        ['DELETE', '/api/instance/assistant/jeton/connexion'],
      ] as const) {
        const r = await ctx.request.fetch(u, { method: m, data: m === 'POST' ? { code: 'bouchon' } : undefined });
        assert.equal(r.status(), 404, `${m} ${u}`);
      }
    } finally {
      s.stop();
    }
  });

  // Simulated answers: states the stub does not produce.
  describe('états simulés', () => {
    let s: Serveur;
    before(async () => {
      s = await demarrer();
    });
    after(() => s.stop());

    async function admin() {
      const { page } = await connecter(s, 'admin');
      return page;
    }

    // Fails if the loading text is missing while the state is read.
    test('chargement_de_letat', async () => {
      const page = await admin();
      await page.route(BASE, async (r) => {
        await new Promise((x) => setTimeout(x, 1500));
        await r.continue();
      });
      await page.goto('/administration');
      await page.getByText('Chargement de l’état du jeton…').waitFor();
      await capture(page, 'chargement');
      await panneau(page).getByText('Aucun jeton posé.').waitFor();
    });

    // Fails if a read error hides the rest of the page, or « Réessayer » does not reload.
    test('erreur_de_lecture_puis_reessayer', async () => {
      const page = await admin();
      let n = 0;
      await page.route(BASE, async (r) => {
        if (r.request().method() === 'GET' && n++ === 0) return r.fulfill({ status: 500, body: '{}', contentType: 'application/json' });
        return r.continue();
      });
      await page.goto('/administration');
      await page.getByText('Impossible de charger l’état du jeton.').waitFor();
      await page.getByText('Aucun univers sur l’instance pour l’instant.').waitFor(); // the rest of the page stays usable
      await capture(page, 'erreur-lecture');
      await panneau(page).getByRole('button', { name: 'Réessayer' }).click();
      await panneau(page).getByText('Aucun jeton posé.').waitFor();
    });

    // Fails if a start failure shows technical detail or loses the old state.
    test('erreur_de_demarrage_sans_detail_technique', async () => {
      const page = await admin();
      await page.route(`${BASE}/connexion`, (r) =>
        r.request().method() === 'POST'
          ? r.fulfill({ status: 502, body: '{"erreur":"spawn script ENOENT /usr/bin/script"}', contentType: 'application/json' })
          : r.continue(),
      );
      await ouvrirAdmin(page);
      await panneau(page).getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await panneau(page).getByText('La connexion n’a pas pu démarrer. Réessayez.').waitFor();
      assert.equal(await page.getByText(/ENOENT/).count(), 0);
      await panneau(page).getByText('Aucun jeton posé.').waitFor();
      await capture(page, 'erreur-demarrage');
    });

    // Fails if the in-progress states (starting, validating) do not disable and announce.
    test('connexion_en_cours_validation_en_cours_puis_echec_autre_garde_la_connexion', async () => {
      const page = await admin();
      await ouvrirAdmin(page);
      const p = panneau(page);
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await p.getByLabel('Code').waitFor();
      let liberer!: () => void;
      const porte = new Promise<void>((x) => (liberer = x));
      await page.route(`${BASE}/code`, async (r) => {
        await porte;
        await r.fulfill({ status: 503, body: '{}', contentType: 'application/json' });
      });
      await p.getByLabel('Code').fill('abc');
      await p.getByRole('button', { name: 'Valider' }).click();
      await p.getByText('Validation…').waitFor();
      assert.equal(await p.getByLabel('Code').isDisabled(), true);
      assert.equal(await p.getByRole('button', { name: 'Valider' }).isDisabled(), true);
      assert.equal(await p.getByRole('button', { name: 'Annuler' }).isDisabled(), true);
      await capture(page, 'validation');
      liberer();
      await p.getByText('L’action n’a pas abouti. Réessayez.').waitFor();
      // the connection stays open, the field is emptied
      assert.equal(await p.getByLabel('Code').inputValue(), '');
      await p.getByRole('button', { name: 'Annuler' }).click();
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).waitFor();
      assert.equal(await p.getByLabel('Code').count(), 0);
    });

    // Fails if « Annuler » leaves the field or the Escape key does nothing.
    test('annuler_ferme_la_connexion_et_rend_le_focus', async () => {
      const page = await admin();
      await ouvrirAdmin(page);
      const p = panneau(page);
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await p.getByLabel('Code').press('Escape');
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).waitFor();
      assert.equal(await p.getByLabel('Code').count(), 0);
      assert.match((await page.evaluate(() => document.activeElement?.textContent)) ?? '', /Connecter l.abonnement/);
    });

    // Fails if the deployment-provided token reads as « Aucun jeton » or offers « Connecter ».
    test('jeton_fourni_par_le_deploiement', async () => {
      const page = await admin();
      await page.route(BASE, (r) =>
        r.request().method() === 'GET'
          ? r.fulfill({ json: { pose: true, poseLe: null, source: 'deploiement', assistant: 'claude-agent' } })
          : r.continue(),
      );
      await ouvrirAdmin(page);
      const p = panneau(page);
      await p.getByText('Jeton fourni par le déploiement.').waitFor();
      await p.getByRole('button', { name: 'Reconnecter l’abonnement' }).waitFor();
      await p.getByText('L’assistant est disponible sur tous les univers.').waitFor();
      await capture(page, 'deploiement');
    });

    // Fails if the unavailable note is missing when the assistant has no means at all.
    test('vide_sans_aucun_moyen_affiche_la_note_indisponible', async () => {
      const page = await admin();
      await page.route(BASE, (r) =>
        r.request().method() === 'GET'
          ? r.fulfill({ json: { pose: false, poseLe: null, source: null, assistant: 'aucune' } })
          : r.continue(),
      );
      await ouvrirAdmin(page);
      await panneau(page).getByText('L’assistant est indisponible tant qu’aucun jeton n’est posé.').waitFor();
    });

    // Fails if a very long address widens the page or is not wrapped in a bounded scrolling zone,
    // or the Code field accepts more than 500 characters.
    test('adresse_tres_longue_replie_sans_elargir_et_code_limite_a_500', async () => {
      const page = await admin();
      const longue = `https://claude.ai/oauth/authorize?code=true&state=${'a'.repeat(900)}`;
      await page.route(`${BASE}/connexion`, (r) =>
        r.request().method() === 'POST'
          ? r.fulfill({ status: 201, json: { adresse: longue, expireLe: new Date(Date.now() + 600_000).toISOString() } })
          : r.continue(),
      );
      await page.setViewportSize({ width: 390, height: 800 });
      await ouvrirAdmin(page);
      const p = panneau(page);
      await p.getByRole('button', { name: 'Connecter l’abonnement' }).click();
      await p.getByLabel('Code').waitFor();
      const debord = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(debord, false, 'page does not scroll horizontally');
      await capture(page, 'adresse-longue');
      await p.getByLabel('Code').fill('z'.repeat(600));
      assert.equal((await p.getByLabel('Code').inputValue()).length, 500);
    });
  });
});
