// Harness shared by the black-box tests of kanevas-premiere-fiche (no test of its own).
// It starts the real server in stub mode (AD-55) on a throw-away SQLite file and drives it
// with a real Chromium through Playwright. Playwright is not a dependency of the repo: it is
// taken from the image (global install) and, when it or Chromium is missing, the browser
// tests are skipped with a message instead of failing.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

export function loadPlaywright(): Any | null {
  const roots = [process.cwd() + '/', '/usr/lib/node_modules/', '/usr/local/lib/node_modules/'];
  for (const r of roots) {
    try {
      return createRequire(r)('playwright');
    } catch {
      /* next */
    }
  }
  return null;
}

export const playwright = loadPlaywright();
export const skipBrowser: string | false = playwright
  ? false
  : 'playwright is not installed in this image: browser tests skipped';

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** Runs `npm run build` once if `dist/public` is missing; a stale `dist/` is not rebuilt (the server runs from dist/server.js). */
export function ensureBuilt(): void {
  if (existsSync('dist/public/index.html')) return;
  execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
}

export interface Server {
  base: string;
  stop: () => void;
}

export async function startServer(extraEnv: Record<string, string> = {}): Promise<Server> {
  ensureBuilt();
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-e2e-'));
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    KANEVAS_STUB: '1',
    DB_PATH: join(dir, 'k.db'),
    SESSION_SECRET: 'e2e-secret-e2e-secret-e2e',
  };
  for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
  Object.assign(env, extraEnv);
  for (const k of Object.keys(env)) if (env[k] === '') delete env[k];
  const child: ChildProcess = spawn('node', ['dist/server.js'], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const stop = () => {
    child.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/healthz`);
      return { base, stop };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  stop();
  throw new Error('server did not start');
}

/** Runs the server process and reports whether it exits by itself, and its stderr. */
export async function startExpectingExit(
  extraEnv: Record<string, string>,
): Promise<{ exited: boolean; code: number | null; stderr: string }> {
  ensureBuilt();
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-e2e-'));
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    DB_PATH: join(dir, 'k.db'),
    SESSION_SECRET: 'e2e-secret-e2e-secret-e2e',
  };
  for (const k of Object.keys(env)) if (k.startsWith('OIDC_') || k === 'KANEVAS_STUB') delete env[k];
  Object.assign(env, extraEnv);
  const child = spawn('node', ['dist/server.js'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', (d) => (stderr += String(d)));
  const result = await new Promise<{ exited: boolean; code: number | null }>((resolve) => {
    const t = setTimeout(() => resolve({ exited: false, code: null }), 6000);
    child.on('exit', (code) => {
      clearTimeout(t);
      resolve({ exited: true, code });
    });
  });
  child.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
  return { ...result, stderr };
}

export async function launch(): Promise<Any> {
  return playwright.chromium.launch({ args: ['--no-sandbox'] });
}

/** A fresh browser context signed in as the given stub account (antor, lea, teo, mira, admin). */
export async function connecte(browser: Any, base: string, compte: string): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({ baseURL: base });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte}$`, 'i') }).click();
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}

/** Regex matching `s` literally, tolerant to the typographic apostrophe (’ for '). */
export function rx(s: string, flags = ''): RegExp {
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
  return new RegExp(esc, flags);
}
export function rxExact(s: string): RegExp {
  return new RegExp('^' + rx(s).source + '$');
}

/** Visible text of the page, apostrophes normalised to ' . */
export async function texte(page: Any): Promise<string> {
  return ((await page.locator('body').innerText()) as string).replace(/’/g, "'");
}

export async function attendre(page: Any): Promise<void> {
  await page.waitForLoadState('networkidle');
}

// --- user gestures, after docs/ecrans.md (the doc's labels) ---

export async function ouvrirFormulaireUnivers(page: Any): Promise<void> {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  await attendre(page);
  await page.getByRole('link', { name: rxExact('Créer un univers') }).or(page.getByRole('button', { name: rxExact('Créer un univers') })).first().click();
  await page.getByLabel('Nom', { exact: true }).waitFor();
}

export async function creerUnivers(page: Any, nom: string, description = ''): Promise<void> {
  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill(nom);
  if (description) await page.getByLabel('Description').fill(description);
  await page.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await attendre(page);
}

export async function ouvrirUniversDepuisAccueil(page: Any, nom: string): Promise<void> {
  await page.goto('/');
  await attendre(page);
  await page.getByRole('link', { name: rx(nom) }).first().click();
  await attendre(page);
}

export async function allerMembres(page: Any): Promise<void> {
  await page.getByRole('link', { name: rxExact('Membres') }).click();
  await page.getByRole('heading', { name: 'Membres', level: 1 }).waitFor();
  await attendre(page);
}

export async function ajouterMembre(page: Any, identifiant: string, role: 'MJ' | 'Joueur' = 'Joueur'): Promise<void> {
  await page.getByLabel('Identifiant du compte').fill(identifiant);
  await page.getByLabel('Rôle', { exact: true }).selectOption({ label: role });
  await page.getByRole('button', { name: rxExact('Ajouter') }).click();
  await attendre(page);
}

export const TYPES: Record<string, { nav: string; nouveau: string }> = {
  personnage: { nav: 'Personnages', nouveau: 'Nouveau personnage' },
  lieu: { nav: 'Lieux', nouveau: 'Nouveau lieu' },
  faction: { nav: 'Factions', nouveau: 'Nouvelle faction' },
  objet: { nav: 'Objets', nouveau: 'Nouvel objet' },
  evenement: { nav: 'Événements', nouveau: 'Nouvel événement' },
  quete: { nav: 'Quêtes', nouveau: 'Nouvelle quête' },
};

export async function allerListe(page: Any, type: keyof typeof TYPES): Promise<void> {
  await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: rxExact(TYPES[type]!.nav) }).click();
  await attendre(page);
}

export async function creerFiche(page: Any, type: keyof typeof TYPES, titre: string, pj = false): Promise<void> {
  await allerListe(page, type);
  await page.getByRole('button', { name: rxExact(TYPES[type]!.nouveau) }).first().click();
  const fenetre = page.getByRole('dialog');
  await fenetre.getByLabel('Titre').fill(titre);
  if (type === 'personnage' && pj) await fenetre.getByLabel('PJ', { exact: true }).check();
  await fenetre.getByRole('button', { name: rxExact('Créer la fiche') }).click();
  await attendre(page);
}

export async function ajouterSection(page: Any, titre: string): Promise<void> {
  await page.getByLabel('Titre de la section').fill(titre);
  await page.getByRole('button', { name: rxExact('Ajouter une section') }).click();
  await section(page, titre).waitFor();
}

/** The panel of a section, found by its title. */
export function section(page: Any, titre: string): Any {
  return page.getByRole('region', { name: rx(titre) });
}

/** Waits until `s` is visible somewhere on the page (apostrophe-tolerant). */
export async function voit(page: Any, s: string): Promise<void> {
  await page.getByText(rx(s)).first().waitFor();
}

/** Sets an audience checkbox of a section and waits for the saved state to come back. */
export async function regler(page: Any, titre: string, reglage: string, actif: boolean): Promise<void> {
  const case_ = section(page, titre).getByLabel(rx(reglage));
  if ((await case_.isChecked()) === actif) return;
  await case_.click({ noWaitAfter: true });
  for (let i = 0; i < 50; i++) {
    if ((await case_.isChecked()) === actif) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`audience "${reglage}" of "${titre}" did not become ${actif}`);
}

export async function ecrireSection(page: Any, titre: string, contenu: string): Promise<void> {
  const s = section(page, titre);
  await s.getByRole('button', { name: rxExact('Modifier') }).click();
  await s.getByRole('textbox').fill(contenu);
  await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
}

/** Sections of the open fiche, in display order (title text only, without the "MJ seul" pill). */
export async function titresSections(page: Any): Promise<string[]> {
  const hs: string[] = await page
    .locator('main section h2')
    .evaluateAll((els: Element[]) => els.map((e) => e.firstChild?.textContent ?? ''));
  return hs.map((h) => h.replace(/’/g, "'").trim());
}
