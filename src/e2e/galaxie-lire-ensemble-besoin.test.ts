// ecrans: cartes, outil-cible, systeme
// Black-box tests of the feature kanevas-outils-galaxie-lire (the galaxy map, read side), written from its
// sheet (« Livre », exit criterion), docs/parcours.md (B-68 to B-72, P-18 steps 1 to 3) and docs/ecrans.md
// (E-21, E-10) — not from the code. Real server in stub mode WITH its starting world (« Éneria d'essai »,
// « Galaxie d'essai »: Port-Sel, Vael, Hesper, « Station fantôme » secret; 3 routes, one private; 1 secret zone),
// real Chromium at 390 px for the phone scenarios. Expected values are literals taken from the docs.
// Data setups that no screen of this slice offers (hide the galaxy, remove the secret zone) go straight to the
// SQLite file of the throw-away server.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import Database from 'better-sqlite3';
import { attendre, type Any, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
const tmpDirs: string[] = [];
const servers: { stop: () => void }[] = [];
let browser: Any;

interface Monde {
  base: string;
  dbPath: string;
  uid: number;
  gid: number;
  sid: number; // the game system « Système d'essai »
  cookies: Record<string, string>;
}

async function monde(): Promise<Monde> {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-galaxie-'));
  tmpDirs.push(dir);
  const dbPath = join(dir, 'k.db');
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
  servers.push(srv);
  const m: Monde = { base: srv.base, dbPath, uid: 0, gid: 0, sid: 0, cookies: {} };
  for (const c of ['antor', 'lea', 'teo', 'mira', 'roxane']) m.cookies[c] = await connexion(m.base, c);
  const univers = (await (await fetch(`${m.base}/api/univers`, { headers: { cookie: m.cookies.antor } })).json()) as Any[];
  const eneria = univers.find((u) => u.nom === "Éneria d'essai");
  m.uid = eneria.id;
  m.sid = eneria.systeme.id;
  const cartes = (await (await fetch(`${m.base}/api/univers/${m.uid}/cartes`, { headers: { cookie: m.cookies.antor } })).json()) as Any;
  m.gid = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id;
  return m;
}

async function connexion(base: string, compte: string): Promise<string> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ compte }).toString(),
  });
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

interface Rep {
  status: number;
  texte: string;
  json: Any;
}
async function lire(m: Monde, compte: string, chemin: string): Promise<Rep> {
  const r = await fetch(`${m.base}${chemin}`, { headers: { cookie: m.cookies[compte] } });
  const texte = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(texte);
  } catch {
    /* not JSON */
  }
  return { status: r.status, texte, json };
}
const api = (m: Monde, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${m.gid}${suite}`;
const trajet = (m: Monde, compte: string, de: string, vers: string, moteur: number, routes: string) =>
  lire(m, compte, api(m, `/trajet?depart=${de}&arrivee=${vers}&moteur=${moteur}&routes=${routes}`));
const blocs = (m: Monde, compte: string, de: string, a: string, mode = '') =>
  lire(m, compte, api(m, `/blocs?de=${de}&a=${a}${mode}`));
function blocDe(rep: Rep, bx: number, by: number): Any {
  return rep.json.blocs.find((b: Any) => b.bx === bx && b.by === by);
}
async function put(m: Monde, compte: string, chemin: string, corps: unknown): Promise<number> {
  const r = await fetch(`${m.base}${chemin}`, {
    method: 'PUT',
    headers: { cookie: m.cookies[compte], 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  });
  return r.status;
}
function sql(m: Monde, requete: string): void {
  const db = new Database(m.dbPath);
  try {
    db.exec(requete);
  } finally {
    db.close();
  }
}

before(async () => {
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
  for (const s of servers) s.stop();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------- B-72 : trajet

// ---------------------------------------------------------------- recherche (P-18 échec, E-21)

// ---------------------------------------------------------------- B-71 : blocs, droits, stabilité

// ---------------------------------------------------------------- B-68 : système et lien

// ---------------------------------------------------------------- droits : galaxie cachée, outil désactivé

// ---------------------------------------------------------------- B-69 : outil d'assistant

// ---------------------------------------------------------------- écran, navigateur

interface Session {
  ctx: Any;
  page: Any;
  assets: string[];
}
async function session(m: Monde, compte: string, largeur = 390, hauteur = 844): Promise<Session> {
  const ctx = await browser.newContext({
    baseURL: m.base,
    viewport: { width: largeur, height: hauteur },
    hasTouch: largeur < 760,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.request.post('/connexion-bouchon', { form: { compte }, maxRedirects: 0 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const assets: string[] = [];
  page.on('request', (r: Any) => {
    const u = new URL(r.url());
    if (/^\/assets\/.*\.js$/.test(u.pathname)) assets.push(u.pathname);
  });
  return { ctx, page, assets };
}
const adresse = (m: Monde, suite = '') => `/univers/${m.uid}/outils/swn/galaxie/${m.gid}${suite}`;
async function ouvrirGalaxie(s: Session, m: Monde, suite = ''): Promise<void> {
  await s.page.goto(adresse(m, suite));
  await s.page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  if (suite === '') await s.page.getByRole('button', { name: 'Port-Sel' }).waitFor();
  else await s.page.locator('svg [role=button]').first().waitFor();
}
const texteDe = async (page: Any): Promise<string> => ((await page.locator('main').innerText()) as string).replace(/’/g, "'");
const trajetBloc = (page: Any) => page.getByRole('region', { name: 'Trajet' });
async function choisir(page: Any, champ: string, saisie: string, nom: string): Promise<void> {
  await page.getByLabel(champ, { exact: true }).fill(saisie);
  await trajetBloc(page).getByRole('button', { name: nom, exact: true }).click();
}
async function calculer(page: Any): Promise<void> {
  const reponse = page.waitForResponse((r: Any) => r.url().includes('/trajet?') && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await reponse;
}
async function dezoomer(page: Any, fois = 2): Promise<void> {
  for (let i = 0; i < fois; i++) await page.getByRole('button', { name: 'Zoom arrière' }).click();
}

test('P-18 1-2 / critère : Léa à 390 px ouvre « Galaxie d’essai » depuis Cartes, appuie sur « Vael » (panneau sous la carte), calcule Port-Sel vers Vael, moteur 2 : « 7 cases · 4,5 jours »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await page.goto(`/univers/${m.uid}/cartes`);
  await page.getByRole('link', { name: /Galaxie d'essai/ }).click();
  await page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Port-Sel' }).waitFor();
  assert.equal(new URL(page.url()).pathname, adresse(m));

  await dezoomer(page);
  const vael = page.getByRole('button', { name: 'Vael' });
  await vael.waitFor();
  await vael.tap();
  await page.getByText('7 cases depuis Port-Sel').waitFor();
  const t = await texteDe(page);
  assert.match(t, /Vael/);
  assert.match(t, /7 cases depuis Port-Sel/);
  const carte = await page.getByRole('img', { name: 'Carte de la galaxie' }).boundingBox();
  const bouton = await page.getByRole('button', { name: 'Trajet depuis ici' }).boundingBox();
  assert.ok(bouton.y > carte.y + carte.height - 1, 'le panneau s’ouvre sous la carte');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'pas de débordement horizontal à 390 px');
  await page.screenshot({ path: '/tmp/shots/galaxie-vael-390.png' });

  await choisir(page, 'Départ', 'Port', 'Port-Sel');
  await choisir(page, 'Arrivée', 'Vae', 'Vael');
  await page.getByLabel('Moteur').selectOption('2');
  assert.equal(await page.getByLabel('Routes').count(), 0, 'Léa n’a pas le choix « Routes » (absent, non désactivé)');
  await calculer(page);
  await page.getByText('7 cases · 4,5 jours').waitFor();
  await page.screenshot({ path: '/tmp/shots/galaxie-trajet-390.png' });
  await s.ctx.close();
});

test('P-18 / critère : Port-Sel vers Hesper, Antor (« Toutes ») lit 6 cases · 4 jours, Léa 13 cases · 8,5 jours', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor', 1200, 800);
  await ouvrirGalaxie(antor, m);
  await choisir(antor.page, 'Départ', 'Port', 'Port-Sel');
  await choisir(antor.page, 'Arrivée', 'Hes', 'Hesper');
  await antor.page.getByLabel('Routes').selectOption({ label: 'Toutes' });
  await calculer(antor.page);
  await antor.page.getByText('6 cases · 4 jours').waitFor();
  await antor.page.screenshot({ path: '/tmp/shots/galaxie-antor-hesper.png' });

  const lea = await session(m, 'lea');
  await ouvrirGalaxie(lea, m);
  await choisir(lea.page, 'Départ', 'Port', 'Port-Sel');
  await choisir(lea.page, 'Arrivée', 'Hes', 'Hesper');
  await calculer(lea.page);
  await lea.page.getByText('13 cases · 8,5 jours').waitFor();
  assert.ok(!(await texteDe(lea.page)).includes('6 cases'));
  await antor.ctx.close();
  await lea.ctx.close();
});

test('E-21 états : même système « Choisissez deux systèmes différents. » ; « Calculer » inactif tant qu’une extrémité manque', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  await ouvrirGalaxie(s, m);
  const calc = s.page.getByRole('button', { name: 'Calculer' });
  assert.equal(await calc.getAttribute('aria-disabled'), 'true');
  await choisir(s.page, 'Départ', 'Port', 'Port-Sel');
  assert.equal(await calc.getAttribute('aria-disabled'), 'true');
  await choisir(s.page, 'Arrivée', 'Port', 'Port-Sel');
  await calc.click();
  await s.page.getByText('Choisissez deux systèmes différents.').waitFor();
  assert.ok(!(await texteDe(s.page)).includes('cases ·'));
  await s.ctx.close();
});

test('P-18 échec / critère : Léa tape « fant » : « Aucun système ne correspond. », rien de caché sur la carte ni dans la page', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  await ouvrirGalaxie(s, m);
  await s.page.getByLabel('Rechercher un système', { exact: true }).first().fill('fant');
  await s.page.getByText('Aucun système ne correspond.').waitFor();
  const t = await texteDe(s.page);
  for (const mot of ['fantôme', 'Station', 'masqué', 'Marches', 'Secret', 'Privée']) {
    assert.ok(!t.includes(mot), `« ${mot} » absent de la page de Léa`);
  }
  assert.equal(await s.page.getByRole('button', { name: /Station/ }).count(), 0);
  await s.page.screenshot({ path: '/tmp/shots/galaxie-recherche-fant.png' });
  // une seule lettre : aucun message, aucun résultat
  await s.page.getByLabel('Rechercher un système', { exact: true }).first().fill('v');
  await attendre(s.page);
  assert.ok(!(await texteDe(s.page)).includes('Aucun système ne correspond.'));
  await s.ctx.close();
});

test('E-21 : Antor (MJ) voit « Station fantôme », « Marches interdites · Secret », la route « Privée » et le choix « Routes »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'antor', 1200, 800);
  await ouvrirGalaxie(s, m);
  const t = await texteDe(s.page);
  assert.match(t, /Station fantôme/);
  assert.match(t, /Marches interdites · Secret/);
  assert.match(t, /Privée/);
  assert.equal(await s.page.getByLabel('Routes').count(), 1);
  await s.ctx.close();
});

test('P-18 / B-73 : Antor passe en mode Joueur : plus de système secret, de route privée, de zone, ni de choix « Routes »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'antor', 1200, 800);
  await ouvrirGalaxie(s, m);
  await s.page.getByText('Mode Joueur', { exact: true }).click();
  await s.page.waitForFunction(() => !document.querySelector('main')?.textContent?.includes('Station fantôme'));
  const t = await texteDe(s.page);
  for (const mot of ['Station fantôme', 'Marches', 'Privée', 'Secret']) assert.ok(!t.includes(mot), mot);
  assert.equal(await s.page.getByLabel('Routes').count(), 0);
  await s.page.screenshot({ path: '/tmp/shots/galaxie-antor-mode-joueur.png' });
  await s.ctx.close();
});

test('E-21 mesure : la souris sur « Hesper », « Vael » étant le départ : l’étiquette « Hesper · 6 cases »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea', 1200, 800);
  await ouvrirGalaxie(s, m, '?systeme=vael');
  await s.page.getByRole('button', { name: 'Trajet depuis ici' }).click();
  // the legend covers the lower left of the map: pan the map so that Hesper leaves it
  await s.page.mouse.move(600, 300);
  await s.page.mouse.down();
  await s.page.mouse.move(700, 200, { steps: 8 });
  await s.page.mouse.up();
  await s.page.getByRole('button', { name: 'Hesper' }).hover();
  await s.page.getByRole('tooltip', { name: 'Hesper · 6 cases' }).waitFor();
  await s.ctx.close();
});

test('E-21 gestes : glisser la carte déplace Port-Sel ; « Recentrer » le remet', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea', 1200, 800);
  await ouvrirGalaxie(s, m);
  const pos = async () => (await s.page.getByRole('button', { name: 'Port-Sel' }).boundingBox()).x as number;
  const x0 = await pos();
  await s.page.mouse.move(500, 600);
  await s.page.mouse.down();
  await s.page.mouse.move(400, 600, { steps: 8 });
  await s.page.mouse.up();
  const x1 = await pos();
  assert.ok(Math.abs(x1 - (x0 - 100)) < 8, `déplacé d’environ −100 px (avant ${x0}, après ${x1})`);
  await s.page.getByRole('button', { name: 'Recentrer' }).click();
  await s.page.waitForFunction((x: number) => true, x0);
  const x2 = await pos();
  assert.ok(Math.abs(x2 - x0) < 8, `recentré (avant ${x0}, après ${x2})`);
  await s.ctx.close();
});

test('B-68 : le lien ?systeme=vael ouvre la carte, le panneau de « Vael » ouvert ; « Copier le lien » dit « Lien copié » et copie l’adresse', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  await ouvrirGalaxie(s, m, '?systeme=vael');
  await s.page.getByText('7 cases depuis Port-Sel').waitFor();
  await s.page.getByRole('button', { name: /Copier le lien/ }).click();
  await s.page.getByText('Lien copié').waitFor();
  const presse = await s.page.evaluate(() => navigator.clipboard.readText());
  assert.ok(presse.endsWith(adresse(m, '?systeme=vael')), presse);
  assert.ok(!/coordonn|"q"|nom=/.test(presse), 'aucun contenu dans l’adresse');
  await s.page.screenshot({ path: '/tmp/shots/galaxie-lien.png' });
  await s.ctx.close();
});

test('B-68 / E-21 : ?systeme=station-fantome donne « Page introuvable. » à Léa, et Antor l’ouvre', opts, async () => {
  const m = await monde();
  const lea = await session(m, 'lea');
  await lea.page.goto(adresse(m, '?systeme=station-fantome'));
  await lea.page.getByText('Page introuvable.').waitFor();
  assert.ok(!(await lea.page.locator('body').innerText()).includes('fantôme'));
  const antor = await session(m, 'antor', 1200, 800);
  await ouvrirGalaxie(antor, m, '?systeme=station-fantome');
  await antor.page.getByRole('heading', { name: 'Station fantôme' }).waitFor();
  await lea.ctx.close();
  await antor.ctx.close();
});

test('B-70 / E-21 : Teo (sans rôle), Léa sur galaxie cachée, Léa outil désactivé : « Page introuvable. » et le code de la carte n’est jamais demandé', opts, async () => {
  const m = await monde();
  // référence : le code que charge la carte pour Léa
  const ref = await session(m, 'lea');
  await ouvrirGalaxie(ref, m);
  const dedans = new Set(ref.assets);
  await ref.ctx.close();
  const vide = await session(m, 'teo');
  await vide.page.goto(adresse(m));
  await vide.page.getByText('Page introuvable.').waitFor();
  await vide.page.waitForLoadState('networkidle');
  const commun = new Set(vide.assets);
  const code = [...dedans].filter((a) => !commun.has(a));
  assert.ok(code.length > 0, 'la carte charge au moins un fichier de code propre pour un compte autorisé');
  await vide.ctx.close();

  sql(m, 'UPDATE swn_galaxies SET visible = 0');
  const cachee = await session(m, 'lea');
  await cachee.page.goto(adresse(m));
  await cachee.page.getByText('Page introuvable.').waitFor();
  await cachee.page.waitForLoadState('networkidle');
  for (const a of code) assert.ok(!cachee.assets.includes(a), `galaxie cachée : ${a} demandé`);
  await cachee.ctx.close();

  sql(m, 'UPDATE swn_galaxies SET visible = 1');
  assert.equal(await put(m, 'antor', `/api/systemes/${m.sid}/outils/swn/galaxie/activation`, { active: false }), 204);
  const off = await session(m, 'lea');
  await off.page.goto(adresse(m));
  await off.page.getByText('Page introuvable.').waitFor();
  await off.page.waitForLoadState('networkidle');
  for (const a of code) assert.ok(!off.assets.includes(a), `outil désactivé : ${a} demandé`);
  await off.page.screenshot({ path: '/tmp/shots/galaxie-outil-desactive.png' });
  await off.ctx.close();
});

test('E-10 / B-71 : la liste Cartes porte « Galaxie d’essai » avec « Galaxie » ; cachée : « MJ seul » pour Antor, absente pour Léa', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor', 1200, 800);
  await antor.page.goto(`/univers/${m.uid}/cartes`);
  await antor.page.getByRole('link', { name: /Galaxie d'essai/ }).waitFor();
  let t = await texteDe(antor.page);
  assert.match(t, /Galaxie d'essai/);
  assert.match(t, /Galaxie\b/);
  assert.ok(!t.includes('MJ seul'));
  sql(m, 'UPDATE swn_galaxies SET visible = 0');
  await antor.page.reload();
  await antor.page.getByRole('link', { name: /Galaxie d'essai/ }).waitFor();
  t = await texteDe(antor.page);
  assert.match(t, /MJ seul/);
  await antor.page.screenshot({ path: '/tmp/shots/e10-antor-cachee.png' });
  const lea = await session(m, 'lea');
  await lea.page.goto(`/univers/${m.uid}/cartes`);
  await lea.page.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
  await lea.page.waitForLoadState('networkidle');
  assert.ok(!(await texteDe(lea.page)).includes("Galaxie d'essai"));
  await antor.ctx.close();
  await lea.ctx.close();
});

test('E-21 refus : Antor en mode Joueur sur une galaxie cachée : « Cette carte n’est pas visible des joueurs. »', opts, async () => {
  const m = await monde();
  sql(m, 'UPDATE swn_galaxies SET visible = 0');
  const s = await session(m, 'antor', 1200, 800);
  await s.page.goto(adresse(m));
  await s.page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await s.page.getByText('Mode Joueur', { exact: true }).click();
  await s.page.getByText("Cette carte n'est pas visible des joueurs.").or(s.page.getByText('Cette carte n’est pas visible des joueurs.')).waitFor();
  await s.page.screenshot({ path: '/tmp/shots/galaxie-mode-joueur-cachee.png' });
  await s.ctx.close();
});

test('E-21 état vide : Léa, aucun système lisible : « Rien à voir sur cette carte pour l’instant. »', opts, async () => {
  const m = await monde();
  sql(m, 'UPDATE swn_systemes SET secret = 1');
  const s = await session(m, 'lea');
  await s.page.goto(adresse(m));
  await s.page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await s.page.getByText(/Rien à voir sur cette carte pour l.instant\./).waitFor();
  await s.page.screenshot({ path: '/tmp/shots/galaxie-vide.png' });
  await s.ctx.close();
});

test('E-21 hors ligne : la vue reste, « Connexion perdue. », « Calculer » et la recherche inactifs, « Copier le lien » reste actif', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  await ouvrirGalaxie(s, m, '?systeme=vael');
  await s.page.getByText('7 cases depuis Port-Sel').waitFor();
  await choisir(s.page, 'Départ', 'Port', 'Port-Sel');
  await choisir(s.page, 'Arrivée', 'Vae', 'Vael');
  await s.ctx.setOffline(true);
  await s.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await s.page.getByText('Connexion perdue.', { exact: true }).waitFor();
  assert.equal(await s.page.getByRole('button', { name: 'Calculer' }).getAttribute('aria-disabled'), 'true');
  const champ = s.page.getByLabel('Rechercher un système', { exact: true }).first();
  assert.ok((await champ.isDisabled()) || (await champ.getAttribute('aria-disabled')) === 'true');
  assert.ok(await s.page.getByRole('button', { name: 'Vael' }).first().isVisible(), 'la vue affichée reste');
  await s.page.getByRole('button', { name: /Copier le lien/ }).click();
  await s.page.getByText('Lien copié').waitFor();
  await s.page.screenshot({ path: '/tmp/shots/galaxie-hors-ligne.png' });
  await s.ctx.close();
});
