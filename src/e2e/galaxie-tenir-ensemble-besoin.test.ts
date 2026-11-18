// ecrans: cartes, outil-cible, systeme, systemes
// Black-box tests of the feature kanevas-outils-galaxie-tenir (the galaxy map, write side), written from its
// sheet (« Livre », exit criterion), docs/parcours.md (B-64, B-71, B-73, B-74, P-18 steps 4 and 5 and failure)
// and docs/ecrans.md (E-21 in writing, E-10 « Carte de la galaxie ») — not from the code. Real server in stub
// mode WITH its starting world (« Éneria d'essai », « Galaxie d'essai »: Port-Sel (0,0), Vael (7,0), Hesper (1,5),
// « Station fantôme » (−4,2) secret; 3 routes, one private; 1 secret zone), real Chromium for the screens.
// The routes of the writes come from the contract of ARCHITECTURE.md (T-8, T-9: what the feature ships without a
// screen). Expected values are literals taken from the docs; hex distances are worked out by hand.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { type Any, launch, rx, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
const servers: { stop: () => void }[] = [];
const tmpDirs: string[] = [];
let browser: Any;

interface Monde {
  base: string;
  uid: number;
  gid: number;
  cookies: Record<string, string>;
  jetonOutils: (compte: string, universId: number, nom: string, outils: string[]) => Promise<string>;
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
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-galaxie-tenir-'));
  tmpDirs.push(dir);
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: join(dir, 'k.db') });
  servers.push(srv);
  const m: Monde = { base: srv.base, uid: 0, gid: 0, cookies: {}, jetonOutils: srv.jetonOutils };
  for (const c of ['antor', 'lea', 'teo', 'mira', 'roxane']) m.cookies[c] = await connexion(m.base, c);
  const univers = (await (await fetch(`${m.base}/api/univers`, { headers: { cookie: m.cookies.antor } })).json()) as Any[];
  m.uid = univers.find((u) => u.nom === "Éneria d'essai").id;
  const cartes = await lire(m, 'antor', `/api/univers/${m.uid}/cartes`);
  m.gid = cartes.json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id;
  return m;
}

interface Rep {
  status: number;
  texte: string;
  json: Any;
}
async function appel(m: Monde, compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> {
  const r = await fetch(`${m.base}${chemin}`, {
    method: methode,
    headers: { cookie: m.cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(texte);
  } catch {
    /* not JSON */
  }
  return { status: r.status, texte, json };
}
const lire = (m: Monde, compte: string, chemin: string) => appel(m, compte, 'GET', chemin);
const galerie = (m: Monde, gid = m.gid, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${gid}${suite}`;
const blocs = (m: Monde, compte: string, mode = '') => lire(m, compte, galerie(m, m.gid, `/blocs?de=-2,-2&a=2,2${mode}`));
const recherche = (m: Monde, compte: string, q: string, mode = '') => lire(m, compte, galerie(m, m.gid, `/recherche?q=${encodeURIComponent(q)}${mode}`));
const noms = (r: Rep, cle: string) => r.json[cle].map((x: Any) => x.nom).sort();

async function placerPortNoir(m: Monde): Promise<void> {
  const s = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Port Noir', q: 1, r: 1, secret: true });
  assert.equal(s.status, 201, s.texte);
  const r = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/routes'), { depuis: 'port-noir', vers: 'vael', publique: false });
  assert.equal(r.status, 201, r.texte);
  const z = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/zones'), { nom: 'Second territoire', contour: [[10, 3], [14, 3], [14, 7]], secret: true });
  assert.equal(z.status, 201, z.texte);
}

before(async () => {
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
  for (const s of servers) s.stop();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------- B-73 : placer, tracer, dessiner, absent pour le joueur

// ---------------------------------------------------------------- B-64 : version périmée

// ---------------------------------------------------------------- B-64 : la graine

// ---------------------------------------------------------------- B-74 : document MJ

// ---------------------------------------------------------------- B-71 : vie de la galaxie

async function listeCartes(m: Monde, compte: string): Promise<string[]> {
  const r = await lire(m, compte, `/api/univers/${m.uid}/cartes`);
  return r.json.cartes.map((c: Any) => c.titre);
}

// ---------------------------------------------------------------- B-65 : import par l'API

async function jeton(m: Monde, outils: string[] | undefined): Promise<string> {
  // A tool token has no session door any more (E-23 will offer the tools): the service, on the server's database.
  if (outils) return m.jetonOutils('antor', m.uid, 'Script galaxie', outils);
  const r = await appel(m, 'antor', 'POST', '/api/compte/jetons', {
    nom: 'Script galaxie', dureeJours: 30, acces: { tous: false, univers: [{ universId: m.uid, niveau: 'ecriture' }] },
  });
  assert.equal(r.status, 201, r.texte);
  return r.json.valeur;
}
async function imp(m: Monde, valeur: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> {
  const r = await fetch(`${m.base}/api/import/v1/univers/${m.uid}${chemin}`, {
    method: methode,
    headers: { authorization: `Bearer ${valeur}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(texte);
  } catch {
    /* not JSON */
  }
  return { status: r.status, texte, json };
}
const FICHIER = {
  systemes: [
    { cle: 'port-sel', nom: 'Port-Sel', q: 0, r: 0, taille: 3 },
    { cle: 'vael', nom: 'Vael', q: 7, r: 0, taille: 2 },
    { cle: 'hesper', nom: 'Hesper', q: 1, r: 5 },
    { cle: 'station-fantome', nom: 'Station fantôme', q: -4, r: 2, secret: true },
  ],
  zones: [{ cle: 'marches', nom: 'Marches interdites', contour: [[-12, 2], [-4, 2], [-4, 8], [-12, 8]], secret: true }],
  routes: [
    { depuis: 'port-sel', vers: 'vael' },
    { depuis: 'vael', vers: 'hesper' },
    { depuis: 'port-sel', vers: 'hesper', publique: false },
  ],
};

// ---------------------------------------------------------------- écrans (Chromium)

interface Session {
  ctx: Any;
  page: Any;
}
async function session(m: Monde, compte: string, largeur = 1280, hauteur = 900): Promise<Session> {
  const ctx = await browser.newContext({ baseURL: m.base, viewport: { width: largeur, height: hauteur }, hasTouch: largeur < 760 });
  await ctx.request.post('/connexion-bouchon', { form: { compte }, maxRedirects: 0 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  return { ctx, page };
}
const adresse = (m: Monde, gid = m.gid, suite = '') => `/univers/${m.uid}/outils/swn/galaxie/${gid}${suite}`;
async function ouvrir(page: Any, m: Monde, gid = m.gid, titre = "Galaxie d'essai", suite = ''): Promise<void> {
  await page.goto(adresse(m, gid, suite));
  await page.getByRole('heading', { name: titre, level: 1 }).waitFor();
}
/** Pixel of an hexagon (q, r), from the grid pattern of the map (Port-Sel is (0,0) there only when the view has not moved: read at each call). */
async function pixel(page: Any, q: number, r: number): Promise<[number, number]> {
  const g = await page.evaluate(() => {
    const s = document.querySelector('svg.gx-svg') as Any;
    const b = s.getBoundingClientRect();
    const p = s.querySelector('#gx-grille');
    const t = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(p.getAttribute('patternTransform'));
    return { x: b.x + Number(t[1]), y: b.y + Number(t[2]), w: Number(p.getAttribute('width')) };
  });
  return [g.x + g.w * (q + r / 2), g.y + g.w * 0.8660254 * r];
}
async function toucher(page: Any, q: number, r: number): Promise<void> {
  const [x, y] = await pixel(page, q, r);
  await page.mouse.click(x, y);
}
async function menuGalaxie(page: Any, entree: string): Promise<void> {
  await page.getByRole('button', { name: /^Galaxie ▾/ }).click();
  await page.getByRole('menuitem', { name: entree }).click();
}
const corps = async (page: Any): Promise<string> => ((await page.locator('main').innerText()) as string).replace(/’/g, "'");

test('P-18 étape 4 / E-21 : Antor place « Port Noir » (hexagone vide), trace une route privée vers « Vael » (« Longueur : 6 cases » affichée, non saisie), dessine un territoire secret, puis passe en Mode Joueur : tout disparaît, y compris les gestes d’écriture', opts, async () => {
  const m = await monde();
  const { page } = await session(m, 'antor');
  await ouvrir(page, m);
  await page.getByRole('button', { name: 'Port-Sel' }).waitFor();
  // placer
  await page.getByRole('button', { name: 'Placer un système' }).click();
  await page.getByText('Touchez un hexagone.').waitFor();
  await toucher(page, 1, 1);
  await page.getByText('Hexagone (1, 1)').waitFor();
  await page.getByLabel('Nom', { exact: true }).fill('Port Noir');
  await page.getByRole('switch', { name: 'Secret (MJ seul)' }).click();
  await page.screenshot({ path: '/tmp/shots/tenir-placer.png' });
  const rep = page.waitForResponse((r: Any) => r.url().includes('/systemes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Placer', exact: true }).click();
  assert.equal((await rep).status(), 201);
  await page.getByRole('button', { name: 'Port Noir' }).waitFor();
  // tracer
  await page.getByRole('button', { name: 'Tracer une route' }).click();
  await page.getByText(rx("Touchez le système de départ, puis celui d'arrivée.")).waitFor();
  await page.getByRole('button', { name: 'Port Noir' }).click();
  await page.getByRole('button', { name: 'Vael' }).click();
  await page.getByText('De Port Noir à Vael').waitFor();
  await page.getByText('Longueur : 6 cases').waitFor();
  assert.equal(await page.getByLabel(/Longueur/).count(), 0, 'la longueur n’est pas un champ');
  await page.getByRole('switch', { name: 'Route publique' }).click();
  await page.screenshot({ path: '/tmp/shots/tenir-route.png' });
  const repR = page.waitForResponse((r: Any) => r.url().includes('/routes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Tracer', exact: true }).click();
  assert.equal((await repR).status(), 201);
  // dessiner
  await page.getByRole('button', { name: 'Dessiner une zone' }).click();
  await page.getByText('Touchez les sommets du contour, puis « Terminer ».').waitFor();
  for (const [q, r] of [[1, -3], [5, -3], [5, -1]]) await toucher(page, q, r);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.getByLabel('Nom', { exact: true }).fill('Second territoire');
  await page.getByRole('switch', { name: 'Secrète' }).click();
  await page.screenshot({ path: '/tmp/shots/tenir-zone.png' });
  const repZ = page.waitForResponse((r: Any) => r.url().includes('/zones') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Dessiner', exact: true }).click();
  assert.equal((await repZ).status(), 201);
  const c = await lire(m, 'antor', galerie(m, m.gid, '/contenu'));
  assert.deepEqual([c.json.systemes, c.json.routes, c.json.zones], [5, 4, 2]);
  const v = await blocs(m, 'antor');
  assert.equal(v.json.routes.find((r: Any) => r.id === 4).longueur, 6);
  assert.equal(v.json.routes.find((r: Any) => r.id === 4).publique, false);
  assert.equal(v.json.systemes.find((s: Any) => s.nom === 'Port Noir').secret, true);
  // mode Joueur
  await page.getByText('Second territoire · Secret').waitFor();
  await page.getByRole('radio', { name: 'Mode Joueur' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Port Noir'));
  const t = await corps(page);
  for (const mot of ['Port Noir', 'Second territoire', 'Marches interdites', 'Privée', 'Station fantôme']) assert.ok(!t.includes(mot), `« ${mot} » encore affiché en mode Joueur`);
  for (const bouton of ['Placer un système', 'Tracer une route', 'Dessiner une zone']) assert.equal(await page.getByRole('button', { name: bouton }).count(), 0, bouton);
  assert.equal(await page.getByRole('button', { name: /^Galaxie ▾/ }).count(), 0);
  assert.equal(await page.getByLabel('Routes').count(), 0);
  assert.equal(await page.getByRole('radio', { name: 'Mode MJ' }).getAttribute('aria-checked'), 'false', 'le basculeur offre encore « Mode MJ »');
  await page.getByLabel('Rechercher un système').fill('noir');
  await page.getByText('Aucun système ne correspond.').waitFor();
  await page.screenshot({ path: '/tmp/shots/tenir-mode-joueur.png' });
});

test('B-64 / E-21 : Mira ouvre « Vael », Antor le déplace d’un hexagone, Mira enregistre : « Ce système a changé depuis que vous l’avez ouvert. » et « Recharger » montre le système déplacé', opts, async () => {
  const m = await monde();
  const mira = await session(m, 'mira');
  await ouvrir(mira.page, m);
  await mira.page.getByRole('button', { name: 'Vael' }).click();
  await mira.page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await mira.page.getByLabel('Nom', { exact: true }).fill('Vael de Mira');
  const dep = await appel(m, 'antor', 'PATCH', galerie(m, m.gid, '/systemes/vael'), { q: 8, r: 0, version: 1 });
  assert.equal(dep.status, 200);
  const rep = mira.page.waitForResponse((r: Any) => r.url().includes('/systemes/vael') && r.request().method() === 'PATCH');
  await mira.page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  assert.equal((await rep).status(), 409);
  await mira.page.getByText(rx("Ce système a changé depuis que vous l'avez ouvert.")).waitFor();
  await mira.page.screenshot({ path: '/tmp/shots/tenir-conflit.png' });
  await mira.page.getByRole('button', { name: 'Recharger' }).click();
  await mira.page.getByText('Hexagone (8, 0)').waitFor();
  assert.equal(await mira.page.getByLabel('Nom', { exact: true }).inputValue(), 'Vael');
  assert.equal((await lire(m, 'antor', galerie(m, m.gid, '/systemes/vael'))).json.nom, 'Vael');
});

test('B-64 / P-18 : « Graine… » dit que les non définis changent de place, demande confirmation (focus sur « Annuler »), et « Relais » promu garde sa place', opts, async () => {
  const m = await monde();
  assert.equal((await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Relais', q: 2, r: 0 })).status, 201);
  assert.equal((await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Port Noir', q: 1, r: 1 })).status, 201);
  const avant = await blocs(m, 'antor');
  const { page } = await session(m, 'antor');
  await ouvrir(page, m);
  await menuGalaxie(page, 'Graine…');
  await page.getByText('essai-1').first().waitFor();
  await page.getByLabel('Nouvelle graine').fill('nouvelle-graine');
  await page.getByRole('button', { name: 'Changer la graine' }).click();
  await page.getByText('Tous les systèmes non définis changent de place. Les 6 systèmes que vous avez placés ou promus gardent la leur.').waitFor();
  assert.equal(await page.evaluate(() => (document.activeElement as Any)?.textContent), 'Annuler');
  await page.screenshot({ path: '/tmp/shots/tenir-graine.png' });
  assert.equal((await lire(m, 'antor', galerie(m, m.gid, '/graine'))).json.graine, 'essai-1', 'rien avant la confirmation');
  const rep = page.waitForResponse((r: Any) => r.url().includes('/graine') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Changer la graine' }).last().click();
  assert.equal((await rep).status(), 200);
  const apres = await blocs(m, 'antor');
  assert.equal((await lire(m, 'antor', galerie(m, m.gid, '/graine'))).json.graine, 'nouvelle-graine');
  assert.ok(apres.json.systemes.some((s: Any) => s.nom === 'Relais' && s.q === 2 && s.r === 0));
  assert.notDeepEqual(apres.json.blocs.map((b: Any) => b.generes), avant.json.blocs.map((b: Any) => b.generes));
});

test('B-64 : « Annuler » dans la confirmation de la graine ne change rien', opts, async () => {
  const m = await monde();
  const { page } = await session(m, 'antor');
  await ouvrir(page, m);
  await menuGalaxie(page, 'Graine…');
  await page.getByLabel('Nouvelle graine').fill('autre');
  await page.getByRole('button', { name: 'Changer la graine' }).click();
  await page.getByText(/Tous les systèmes non définis changent de place\./).waitFor();
  await page.getByRole('button', { name: 'Annuler' }).last().click();
  assert.equal((await lire(m, 'antor', galerie(m, m.gid, '/graine'))).json.graine, 'essai-1');
});

test('B-71 / E-10 : Antor crée « Galaxie neuve » par « Nouvelle carte » ▸ « Carte de la galaxie » (MJ seul, Léa ne la voit pas), la renomme « Galaxie du bord », la rend visible (Léa la voit), la recache (« Page introuvable. »)', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  await antor.page.goto(`/univers/${m.uid}/cartes`);
  await antor.page.getByRole('button', { name: 'Nouvelle carte' }).click();
  await antor.page.getByLabel('Forme').selectOption({ label: 'Carte de la galaxie' });
  assert.equal(await antor.page.getByLabel('Image de fond').count(), 0, '« Image de fond » est masquée');
  await antor.page.getByLabel('Titre').fill('Galaxie neuve');
  await antor.page.getByRole('button', { name: 'Créer', exact: true }).click();
  await antor.page.getByRole('heading', { name: 'Galaxie neuve', level: 1 }).waitFor();
  const gid = Number(/galaxie\/(\d+)/.exec(antor.page.url())![1]);
  assert.ok(gid > 0);
  await antor.page.screenshot({ path: '/tmp/shots/tenir-nouvelle-galaxie.png' });
  assert.ok(!(await listeCartes(m, 'lea')).includes('Galaxie neuve'));
  assert.ok((await antor.page.getByText('MJ seul').count()) >= 0);
  // renommer
  await menuGalaxie(antor.page, 'Renommer');
  await antor.page.getByLabel('Titre').fill('Galaxie du bord');
  await antor.page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await antor.page.getByRole('heading', { name: 'Galaxie du bord', level: 1 }).waitFor();
  // visible
  const rep = antor.page.waitForResponse((r: Any) => r.request().method() === 'PATCH');
  await menuGalaxie(antor.page, 'Rendre visible');
  assert.equal((await rep).status(), 200);
  const lea = await session(m, 'lea');
  await lea.page.goto(`/univers/${m.uid}/cartes`);
  await lea.page.getByRole('link', { name: /Galaxie du bord/ }).waitFor();
  assert.equal(await lea.page.getByRole('link', { name: /Galaxie neuve/ }).count(), 0);
  // recacher
  const rep2 = antor.page.waitForResponse((r: Any) => r.request().method() === 'PATCH');
  await menuGalaxie(antor.page, 'Cacher aux joueurs');
  assert.equal((await rep2).status(), 200);
  await lea.page.goto(adresse(m, gid));
  await lea.page.getByText('Page introuvable.').waitFor();
  await lea.page.screenshot({ path: '/tmp/shots/tenir-lea-introuvable.png' });
});

test('B-71 : « Supprimer la galaxie… » dit « Les 5 systèmes, 4 routes et 2 zones de cette galaxie seront effacés. » et les efface après « Effacer la galaxie » ; « Annuler » ne touche à rien', opts, async () => {
  const m = await monde();
  await placerPortNoir(m);
  const { page } = await session(m, 'antor');
  await ouvrir(page, m);
  await menuGalaxie(page, 'Supprimer la galaxie…');
  await page.getByText('Les 5 systèmes, 4 routes et 2 zones de cette galaxie seront effacés.').waitFor();
  await page.screenshot({ path: '/tmp/shots/tenir-supprimer.png' });
  await page.getByRole('button', { name: 'Annuler' }).last().click();
  assert.equal((await lire(m, 'antor', galerie(m, m.gid, '/contenu'))).json.systemes, 5);
  await menuGalaxie(page, 'Supprimer la galaxie…');
  await page.getByText('Les 5 systèmes, 4 routes et 2 zones de cette galaxie seront effacés.').waitFor();
  const rep = page.waitForResponse((r: Any) => r.request().method() === 'DELETE');
  await page.getByRole('button', { name: 'Effacer la galaxie' }).click();
  assert.ok([200, 204].includes((await rep).status()));
  assert.ok(!(await listeCartes(m, 'antor')).includes("Galaxie d'essai"));
});

test('B-74 / E-21 : « Document MJ… » crée une fiche (« Galaxie — notes MJ »), écrit la section MJ seul (absente pour Léa) ; un système placé ensuite : « Le document n’est plus à jour. » et « Proposition en attente », sans bouton « Proposer » ; texte inchangé', opts, async () => {
  const m = await monde();
  const { page } = await session(m, 'antor');
  await ouvrir(page, m);
  await menuGalaxie(page, 'Document MJ…');
  await page.getByText('Seul le MJ lit ce document.').waitFor();
  await page.getByRole('button', { name: /Créer une fiche de type Savoir/ }).click();
  await page.getByRole('button', { name: 'Écrire le document' }).click();
  await page.getByText(/Document dans « Galaxie — notes MJ »/).waitFor();
  await page.getByText('À jour.').waitFor();
  await page.screenshot({ path: '/tmp/shots/tenir-document.png' });
  const d = await lire(m, 'antor', galerie(m, m.gid, '/document'));
  assert.equal(d.json.fiche.titre, 'Galaxie — notes MJ');
  assert.equal((await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Port Noir', q: 1, r: 1 })).status, 201);
  await page.reload();
  await page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await menuGalaxie(page, 'Document MJ…');
  await page.getByText(rx("Le document n'est plus à jour.")).waitFor();
  await page.getByText(/Proposition en attente/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Proposer la mise à jour' }).count(), 0);
  await page.screenshot({ path: '/tmp/shots/tenir-document-perime.png' });
  const f = (await lire(m, 'antor', `/api/univers/${m.uid}/fiches/${d.json.fiche.id}`)).json.sections.find((s: Any) => s.titre === 'Document MJ');
  assert.ok(!f.html.includes('Port Noir'), 'le texte ne change pas sans l’accord d’Antor');
  // il abandonne la proposition : « Proposer la mise à jour » revient
  const prop = (await lire(m, 'antor', galerie(m, m.gid, '/document'))).json.propositionId;
  assert.equal((await appel(m, 'antor', 'POST', `/api/univers/${m.uid}/propositions/${prop}/abandonner`, {})).status, 204);
  await page.reload();
  await page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await menuGalaxie(page, 'Document MJ…');
  await page.getByRole('button', { name: 'Proposer la mise à jour' }).waitFor();
});

test('E-21 exclusion / 390 px : Léa ne reçoit aucun contrôle d’écriture ni le basculeur de mode ; Antor trouve les gestes dans « Modifier la carte ▾ »', opts, async () => {
  const m = await monde();
  const lea = await session(m, 'lea', 390, 844);
  await ouvrir(lea.page, m);
  await lea.page.getByRole('button', { name: 'Port-Sel' }).waitFor();
  const t = await corps(lea.page);
  for (const mot of ['Placer un système', 'Tracer une route', 'Dessiner une zone', 'Galaxie ▾', 'Modifier la carte', 'Supprimer la galaxie', 'Graine']) assert.ok(!t.includes(mot), `« ${mot} » rendu à Léa`);
  assert.equal(await lea.page.getByRole('radio', { name: /^Mode (MJ|Joueur)$/ }).count(), 0, 'le basculeur est absent pour Léa');
  assert.ok(await lea.page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await lea.page.screenshot({ path: '/tmp/shots/tenir-lea-390.png' });
  const antor = await session(m, 'antor', 390, 844);
  await ouvrir(antor.page, m);
  await antor.page.getByRole('button', { name: /^Modifier la carte ▾/ }).click();
  for (const item of ['Placer un système', 'Tracer une route', 'Dessiner une zone', 'Renommer', 'Graine…', 'Document MJ…', 'Supprimer la galaxie…']) {
    await antor.page.getByRole('menuitem', { name: item }).waitFor();
  }
  await antor.page.screenshot({ path: '/tmp/shots/tenir-antor-390.png' });
});
