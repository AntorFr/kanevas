// Complements to the black-box tests of kanevas-outils-galaxie-lire, written from its sheet (« Livre », exit
// criterion), docs/parcours.md (B-70 to B-72, P-18) and docs/ecrans.md (E-21) — not from the code. Same world as
// galaxie-lire-ensemble-besoin.test.ts: real server in stub mode WITH its starting world, real Chromium. It covers
// what that file leaves out: the configured jump range (B-72), the generated-system panel, the empty hexagon,
// the zoom limit, the legend, the 760 px layout, the long name, the loading / block-error / server-error states.
// Expected values are literals taken from the docs and worked out by hand (comments).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import Database from 'better-sqlite3';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
const tmpDirs: string[] = [];
const servers: { stop: () => void }[] = [];
let browser: Any;

interface Monde {
  base: string;
  dbPath: string;
  uid: number;
  gid: number;
  sid: number;
  cookies: Record<string, string>;
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

async function monde(): Promise<Monde> {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-galaxie-compl-'));
  tmpDirs.push(dir);
  const dbPath = join(dir, 'k.db');
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
  servers.push(srv);
  const m: Monde = { base: srv.base, dbPath, uid: 0, gid: 0, sid: 0, cookies: {} };
  for (const c of ['antor', 'lea']) m.cookies[c] = await connexion(m.base, c);
  const univers = (await (await fetch(`${m.base}/api/univers`, { headers: { cookie: m.cookies.antor } })).json()) as Any[];
  const eneria = univers.find((u) => u.nom === "Éneria d'essai");
  m.uid = eneria.id;
  m.sid = eneria.systeme.id;
  const cartes = (await (await fetch(`${m.base}/api/univers/${m.uid}/cartes`, { headers: { cookie: m.cookies.antor } })).json()) as Any;
  m.gid = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id;
  return m;
}

const api = (m: Monde, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${m.gid}${suite}`;
async function lire(m: Monde, compte: string, chemin: string): Promise<{ status: number; json: Any }> {
  const r = await fetch(`${m.base}${chemin}`, { headers: { cookie: m.cookies[compte] } });
  const t = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(t);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json };
}
const trajet = (m: Monde, compte: string, de: string, vers: string, moteur: number, routes: string) =>
  lire(m, compte, api(m, `/trajet?depart=${de}&arrivee=${vers}&moteur=${moteur}&routes=${routes}`));

/** The module's common setting « portée de saut » (cases per engine level), set the way a GM does it. */
async function poserPortee(m: Monde, valeur: number): Promise<void> {
  const r = await fetch(`${m.base}/api/systemes/${m.sid}/outils/swn/reglages`, {
    method: 'PUT',
    headers: { cookie: m.cookies.antor, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 0, valeurs: { portee_saut: valeur } }),
  });
  assert.equal(r.status, 204, 'le réglage de portée de saut est posé par un MJ');
}

before(async () => {
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
  for (const s of servers) s.stop();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------- B-72 : portée de saut configurée

// Fails if the jump range setting were ignored (default 5 would make every case below usable).
test('B-72 portée 1 : portée d’une étape = 1 × (moteur + 1) ; moteur 2 (portée 3) : aucun tronçon de 6 ou 7 cases n’est utilisable', async () => {
  const m = await monde();
  await poserPortee(m, 1);
  const r = await trajet(m, 'lea', 'port-sel', 'vael', 2, 'publiques');
  assert.equal(r.status, 200);
  assert.equal(r.json.trouve, false);
  const a = await trajet(m, 'antor', 'port-sel', 'hesper', 2, 'toutes');
  assert.equal(a.json.trouve, false, 'même pour un MJ : la portée vaut pour tous les comptes');
});

test('B-72 bord : portée 1, moteur 6 → portée d’une étape 7 : la route de 7 cases est utilisable (« 7 cases · 2,2 jours », 7 ÷ 6 + 1 = 2,17) ; moteur 5 → 6 : elle ne l’est plus', async () => {
  const m = await monde();
  await poserPortee(m, 1);
  const six = await trajet(m, 'lea', 'port-sel', 'vael', 6, 'publiques');
  assert.equal(six.json.trouve, true);
  assert.equal(six.json.libelle, '7 cases · 2,2 jours');
  const cinq = await trajet(m, 'lea', 'port-sel', 'vael', 5, 'publiques');
  assert.equal(cinq.json.trouve, false);
});

test('B-72 bord : portée 2, moteur 2 → 6 : le tronçon de 6 cases passe (Antor, Port-Sel vers Hesper : « 6 cases · 4 jours »), celui de 7 non (Léa, Port-Sel vers Vael)', async () => {
  const m = await monde();
  await poserPortee(m, 2);
  const a = await trajet(m, 'antor', 'port-sel', 'hesper', 2, 'toutes');
  assert.equal(a.json.libelle, '6 cases · 4 jours'); // 6 ÷ 2 + 1
  const l = await trajet(m, 'lea', 'port-sel', 'vael', 2, 'publiques');
  assert.equal(l.json.trouve, false);
});

test('B-72 : portée 3, moteur 1 → 6 : Antor, Port-Sel vers Hesper, « 6 cases · 7 jours » (6 ÷ 1 + 1)', async () => {
  const m = await monde();
  await poserPortee(m, 3);
  const a = await trajet(m, 'antor', 'port-sel', 'hesper', 1, 'toutes');
  assert.equal(a.json.libelle, '6 cases · 7 jours');
});

// ---------------------------------------------------------------- écran, navigateur

interface Session {
  ctx: Any;
  page: Any;
}
async function session(m: Monde, compte: string, largeur = 390, hauteur = 844): Promise<Session> {
  const ctx = await browser.newContext({
    baseURL: m.base,
    viewport: { width: largeur, height: hauteur },
    hasTouch: largeur < 760,
  });
  await ctx.request.post('/connexion-bouchon', { form: { compte }, maxRedirects: 0 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  return { ctx, page };
}
const adresse = (m: Monde, suite = '') => `/univers/${m.uid}/outils/swn/galaxie/${m.gid}${suite}`;
async function ouvrir(page: Any, m: Monde): Promise<void> {
  await page.goto(adresse(m));
  await page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Port-Sel' }).waitFor();
}
const trajetBloc = (page: Any) => page.getByRole('region', { name: 'Trajet' });
async function choisir(page: Any, champ: string, saisie: string, nom: string): Promise<void> {
  await page.getByLabel(champ, { exact: true }).fill(saisie);
  await trajetBloc(page).getByRole('button', { name: nom, exact: true }).click();
}
async function deuxFrames(page: Any): Promise<void> {
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(null)))));
}
type Point = [number, number, number, boolean];
/** Circles drawn inside the map's visible area: centre x, centre y, width, belongs to a defined system. */
async function cercles(page: Any): Promise<Point[]> {
  return page.getByRole('img', { name: 'Carte de la galaxie' }).evaluate((el: Any) => {
    const r = el.getBoundingClientRect();
    return Array.from(el.querySelectorAll('circle'))
      .map((c: Any) => {
        const b = c.getBoundingClientRect();
        return [b.x + b.width / 2, b.y + b.height / 2, b.width, !!c.closest('[role=button]')];
      })
      .filter((a: Any) => a[0] > r.x + 60 && a[0] < r.x + r.width - 60 && a[1] > r.y + 20 && a[1] < r.y + r.height - 90);
  });
}
const hexDistance = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

test('E-21 : toucher un système généré ouvre « Système non défini » avec ses coordonnées et sa distance, sans « Trajet depuis ici »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  const gen = (await cercles(page)).find((c) => !c[3]);
  assert.ok(gen, 'un système généré est visible à l’ouverture');
  await page.touchscreen.tap(gen[0], gen[1]);
  await page.getByText('Système non défini').waitFor();
  const t = ((await page.locator('main').innerText()) as string).replace(/\n+/g, ' ');
  const mm = /Coordonnées (-?\d+), (-?\d+)/.exec(t);
  assert.ok(mm, `coordonnées affichées : ${t}`);
  const q = Number(mm![1]);
  const r = Number(mm![2]);
  // the coordinates are those of a generated position of the block that holds them (the server's own answer)
  const bx = Math.floor(q / 5);
  const by = Math.floor(r / 5);
  const bl = await lire(m, 'lea', api(m, `/blocs?de=${bx},${by}&a=${bx},${by}`));
  assert.ok(bl.json.blocs[0].generes.some(([a, b]: number[]) => a === q && b === r), `(${q}, ${r}) est un système généré`);
  assert.ok(t.includes(`Distance ${hexDistance(q, r)} cases depuis Port-Sel`), `distance ${hexDistance(q, r)} attendue : ${t}`);
  assert.equal(await page.getByRole('button', { name: 'Trajet depuis ici' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Copier le lien' }).count(), 0, 'pas de lien : un système non défini n’a pas d’identité');
  await page.screenshot({ path: '/tmp/shots/galaxie-non-defini-390.png' });
  await s.ctx.close();
});

test('E-21 : toucher un hexagone vide ne sélectionne rien', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  const pts = await cercles(page);
  const zone = await page.getByRole('img', { name: 'Carte de la galaxie' }).boundingBox();
  // a point of the map at least 30 px from every circle (hexagons are about 25 px wide at this zoom)
  let cible: [number, number] | null = null;
  for (let x = zone.x + 70; x < zone.x + zone.width - 70 && !cible; x += 9) {
    for (let y = zone.y + 30; y < zone.y + zone.height - 100; y += 9) {
      if (pts.every((p) => Math.hypot(p[0] - x, p[1] - y) > 30)) {
        cible = [x, y];
        break;
      }
    }
  }
  assert.ok(cible, 'un point de la carte loin de tout système');
  await page.touchscreen.tap(cible![0], cible![1]);
  await deuxFrames(page);
  const t = (await page.locator('main').innerText()) as string;
  assert.ok(!t.includes('Système non défini'));
  assert.equal(await page.getByRole('button', { name: 'Trajet depuis ici' }).count(), 0);
  assert.ok(!page.url().includes('systeme='));
  await s.ctx.close();
});

test('E-21 : zoomé au plus loin, « Zoom arrière » est inactif et « Zoom avant » reste actif', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  const moins = page.getByRole('button', { name: 'Zoom arrière' });
  for (let i = 0; i < 30 && (await moins.isEnabled()); i++) await moins.click();
  assert.equal(await moins.isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Zoom avant' }).isEnabled(), true);
  await page.screenshot({ path: '/tmp/shots/galaxie-zoom-limite-390.png' });
  await s.ctx.close();
});

test('E-21 : à 390 px la légende se replie dans un bouton « Légende » qui l’ouvre', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  const bouton = page.getByRole('button', { name: 'Légende' });
  await bouton.waitFor();
  await bouton.tap();
  // legend entries named by the docs: system, selected, departure/arrival, route, zone
  for (const mot of ['Système', 'Sélectionné', 'Route', 'Zone']) {
    await page.getByText(new RegExp(mot, 'i')).first().waitFor();
  }
  await page.screenshot({ path: '/tmp/shots/galaxie-legende-390.png' });
  await s.ctx.close();
});

test('E-21 : à 1280 px la carte est à gauche et, à droite (320 px), recherche, panneau du système et « Trajet » se suivent de haut en bas', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea', 1280, 800);
  const { page } = s;
  await ouvrir(page, m);
  await page.getByRole('button', { name: 'Vael' }).click();
  await page.getByRole('button', { name: 'Trajet depuis ici' }).waitFor();
  const carte = await page.getByRole('img', { name: 'Carte de la galaxie' }).boundingBox();
  const recherche = await page.getByLabel('Rechercher un système').boundingBox();
  const panneau = await page.getByRole('button', { name: 'Trajet depuis ici' }).boundingBox();
  const bloc = await trajetBloc(page).boundingBox();
  assert.ok(recherche.x >= carte.x + carte.width - 1, 'la recherche est à droite de la carte');
  assert.ok(panneau.x >= carte.x + carte.width - 1 && bloc.x >= carte.x + carte.width - 1);
  assert.ok(recherche.y < panneau.y && panneau.y < bloc.y, 'ordre : recherche, panneau, trajet');
  assert.ok(bloc.width >= 288 && bloc.width <= 321, `colonne d’environ 320 px, obtenu ${bloc.width}`);
  assert.ok(carte.width > 600, `la carte prend le reste de la largeur, obtenu ${carte.width}`);
  await page.screenshot({ path: '/tmp/shots/galaxie-bureau-1280.png' });
  await s.ctx.close();
});

test('E-21 : un nom de 80 caractères est tronqué sur la carte et entier dans le panneau', opts, async () => {
  const m = await monde();
  const nom = 'Vael-' + 'abcdefghij'.repeat(7) + 'XYZWV'; // 5 + 70 + 5 = 80
  assert.equal(nom.length, 80);
  const db = new Database(m.dbPath);
  try {
    db.prepare("UPDATE swn_systemes SET nom = ? WHERE cle = 'vael'").run(nom);
  } finally {
    db.close();
  }
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  const etiquettes = (await page.locator('svg text').evaluateAll((els: Any[]) => els.map((e) => e.textContent as string))) as string[];
  const long = etiquettes.find((t: string) => t.startsWith('Vael-abc'));
  assert.ok(long, `étiquette de Vael sur la carte : ${JSON.stringify(etiquettes)}`);
  assert.ok(long!.length <= 25 && long!.length < 80, `étiquette tronquée à 24 caractères, obtenu ${long!.length}`);
  await page.getByRole('button', { name: /^Vael-abc/ }).tap();
  await page.getByRole('button', { name: 'Trajet depuis ici' }).waitFor();
  const panneau = ((await page.locator('main').innerText()) as string).replace(/\n/g, '');
  assert.ok(panneau.includes(nom), 'le nom entier dans le panneau');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'pas de débordement horizontal à 390 px');
  await page.screenshot({ path: '/tmp/shots/galaxie-nom-80-390.png' });
  await s.ctx.close();
});

test('E-21 recherche : « hesp » (casse et fin de nom) trouve « Hesper », le choisir ouvre son panneau ; une lettre ne liste rien', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  const champ = page.getByLabel('Rechercher un système');
  await champ.fill('H');
  await deuxFrames(page);
  assert.equal(await page.getByRole('button', { name: 'Hesper', exact: true }).count(), 1, 'seul le bouton de la carte porte ce nom');
  assert.ok(!((await page.locator('main').innerText()) as string).includes('Aucun système ne correspond.'), 'sous 2 caractères : rien du tout');
  await champ.fill('hesp');
  const resultat = page.getByRole('button', { name: 'Hesper', exact: true }).nth(1);
  await resultat.waitFor();
  await resultat.click();
  await page.getByRole('button', { name: 'Trajet depuis ici' }).waitFor();
  const t = (await page.locator('main').innerText()) as string;
  assert.match(t, /Hesper/);
  // hex distance of Hesper (1, 5) from Port-Sel (0, 0) = (1 + 5 + 6) / 2 = 6
  assert.match(t, /6 cases depuis Port-Sel/);
  await s.ctx.close();
});

test('E-21 trajet, portée : portée 1, moteur 2, Port-Sel vers Vael : « Aucun trajet avec ce moteur. », rien de surligné ; « Effacer » vide un résultat', opts, async () => {
  const m = await monde();
  await poserPortee(m, 1);
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  await choisir(page, 'Départ', 'Port', 'Port-Sel');
  await choisir(page, 'Arrivée', 'Vae', 'Vael');
  const rep = page.waitForResponse((r: Any) => r.url().includes('/trajet?'));
  await page.getByRole('button', { name: 'Calculer' }).click();
  await rep;
  await page.getByText('Aucun trajet avec ce moteur.').waitFor();
  assert.ok(!((await page.locator('main').innerText()) as string).includes('cases ·'));
  await page.screenshot({ path: '/tmp/shots/galaxie-aucun-trajet-390.png' });
  // moteur 6 : portée d’une étape 7, the result appears, then « Effacer » clears it
  await page.getByLabel('Moteur').selectOption('6');
  const rep2 = page.waitForResponse((r: Any) => r.url().includes('/trajet?') && r.url().includes('moteur=6'));
  await page.getByRole('button', { name: 'Calculer' }).click();
  await rep2;
  await page.getByText('7 cases · 2,2 jours').waitFor();
  await page.getByRole('button', { name: 'Effacer' }).click();
  await page.getByText('7 cases · 2,2 jours').waitFor({ state: 'hidden' });
  await s.ctx.close();
});

test('E-21 trajet : le moteur propose 1 à 6, 2 par défaut', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  const options = await page.getByLabel('Moteur').locator('option').allInnerTexts();
  assert.deepEqual(options, ['1', '2', '3', '4', '5', '6']);
  assert.equal(await page.getByLabel('Moteur').inputValue(), '2');
  await s.ctx.close();
});

test('E-21 état « chargement » : « Chargement de la carte… » tant que les blocs n’arrivent pas, puis disparaît', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await page.route(/\/blocs\?/, async (route: Any) => {
    await new Promise((ok) => setTimeout(ok, 2500));
    await route.continue();
  });
  await page.goto(adresse(m));
  await page.getByText('Chargement de la carte…').waitFor();
  await page.screenshot({ path: '/tmp/shots/galaxie-chargement-390.png' });
  await page.getByRole('button', { name: 'Port-Sel' }).waitFor();
  assert.ok(!((await page.locator('main').innerText()) as string).includes('Chargement de la carte…'));
  await s.ctx.close();
});

test('E-21 état « erreur » : blocs qui n’arrivent pas : « Impossible de charger une partie de la carte. » et « Réessayer » ramène la carte', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await page.route(/\/blocs\?/, (route: Any) => route.abort());
  await page.goto(adresse(m));
  await page.getByText('Impossible de charger une partie de la carte.').waitFor();
  await page.screenshot({ path: '/tmp/shots/galaxie-erreur-blocs-390.png' });
  await page.unroute(/\/blocs\?/);
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await page.getByRole('button', { name: 'Port-Sel' }).waitFor();
  await s.ctx.close();
});

test('E-21 état « erreur serveur » du trajet : « Le calcul a échoué. » avec « Réessayer », qui relance le calcul', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  await choisir(page, 'Départ', 'Port', 'Port-Sel');
  await choisir(page, 'Arrivée', 'Vae', 'Vael');
  await page.route(/\/trajet\?/, (route: Any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await page.getByRole('button', { name: 'Calculer' }).click();
  await page.getByText('Le calcul a échoué.').waitFor();
  await page.screenshot({ path: '/tmp/shots/galaxie-calcul-echoue-390.png' });
  await page.unroute(/\/trajet\?/);
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await page.getByText('7 cases · 4,5 jours').waitFor();
  await s.ctx.close();
});

test('E-21 état « erreur serveur » de la recherche : « La recherche a échoué. » avec « Réessayer »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await ouvrir(page, m);
  await page.route(/\/recherche\?/, (route: Any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await page.getByLabel('Rechercher un système').fill('Vael');
  await page.getByText('La recherche a échoué.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Réessayer' }).count(), 1);
  await s.ctx.close();
});
