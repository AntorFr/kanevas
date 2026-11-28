// ecrans: jetons, administration
// E-23 / E-5 bloc « Systèmes de jeu » (kanevas-systemes-jeu-api-ecran), written from the critère de sortie, not from the code.
// The real app runs in stub mode on an in-memory SQLite, driven by a real Chromium. Captures: $JETONS_SYS_CAPTURES.
//
// TEST PLAN (need → cases; expectations are literals)
//   nominal   : Antor opens « Créer un jeton »: « Stars Without Number » and « Chroniques Oubliées Fantasy » at « — »,
//               « Écriture » only on the first; create with Écriture → line « Systèmes : Stars Without Number : écriture »,
//               GET /api/compte/jetons carries it; « Modifier les accès » reopens it and lowers it to Lecture (row niveau lecture)
//   exclusion : a GM removed from the system → « lecture seule, vous n'êtes plus MJ du système », Écriture disabled;
//               a system no longer read → « (plus lecteur) » and « Écriture » disabled
//   refus     : the right moves while the box is open → 400 champ systemes: name kept, line says « Vous n'êtes plus MJ de ce système. »
//   chargement: GET /api/systemes fails → « Réessayer », form usable, no `systemes` key sent, rows of an existing token intact
//   absent    : « Contenu » unchecked → no block; Teo (no system) → no block
//   admin     : E-5 box shows the owner's systems (not the admin's)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser } from './harnais.test.js';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

const opts = { skip: skipBrowser };
const CAP = process.env.JETONS_SYS_CAPTURES ?? '/tmp/jetons-sys-captures';
let browser: Any;
const ouverts: Array<{ close: () => Promise<unknown> }> = [];
before(async () => {
  mkdirSync(CAP, { recursive: true });
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
  for (const a of ouverts) await a.close().catch(() => {});
});

async function monde() {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db));
  ouverts.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const sys = (nom: string) => (app.db.prepare('SELECT id FROM systemes_jeu WHERE nom = ?').get(nom) as { id: number }).id;
  const antor = (app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id;
  return { app, base, antor, swn: sys('Stars Without Number'), chro: sys('Chroniques Oubliées Fantasy') };
}
const SWN = 'Stars Without Number';
const ligne = (page: Any, nom: string) => page.getByRole('list', { name: 'Systèmes de jeu' }).getByRole('listitem').filter({ hasText: nom });
const radio = (page: Any, nom: string, v: string) => ligne(page, nom).getByRole('radio', { name: v, exact: true });
async function ouvrir(page: Any) {
  await page.goto('/compte/jetons');
  await attendre(page);
}
async function ouvrirCreation(page: Any, nom: string) {
  await page.getByRole('button', { name: 'Créer un jeton' }).first().click();
  await page.getByLabel('Nom').fill(nom);
}
async function creerAvecEcriture(page: Any, nom: string) {
  await ouvrirCreation(page, nom);
  await radio(page, SWN, 'Écriture').click();
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  await page.locator('code').first().waitFor();
  await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
}
const lignesDe = (app: Any, nom: string) =>
  app.db
    .prepare('SELECT s.systeme_id AS id, s.niveau FROM jetons_systemes s JOIN jetons_api j ON j.id = s.jeton_id WHERE j.nom = ? ORDER BY 1')
    .all(nom) as Array<{ id: number; niveau: string }>;

test('nominal : deux lignes à « — », Écriture sur le MJ seulement, créer, ligne du jeton, API, abaisser', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Antor');
  await ouvrir(page);
  await ouvrirCreation(page, 'Script SWN');
  await ligne(page, SWN).waitFor();
  await ligne(page, 'Chroniques Oubliées Fantasy').waitFor();
  assert.equal(await radio(page, SWN, '—').getAttribute('aria-checked'), 'true');
  assert.equal(await radio(page, 'Chroniques Oubliées Fantasy', '—').getAttribute('aria-checked'), 'true');
  assert.equal(await radio(page, SWN, 'Écriture').count(), 1);
  assert.equal(await radio(page, 'Chroniques Oubliées Fantasy', 'Écriture').count(), 0, 'pas d’Écriture pour un lecteur');
  assert.equal(await radio(page, 'Chroniques Oubliées Fantasy', 'Lecture').count(), 1);
  await page.screenshot({ path: `${CAP}/creer.png` });
  await radio(page, SWN, 'Écriture').click();
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  await page.locator('code').first().waitFor();
  await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
  const l = page.locator('.ligne-jeton').filter({ hasText: 'Script SWN' });
  await l.waitFor();
  assert.match((await l.textContent()) ?? '', /Systèmes : Stars Without Number : écriture/);
  assert.equal(await page.getByText('Chroniques Oubliées Fantasy : ').count(), 0, 'le système laissé à « — » n’y est pas');
  assert.deepEqual(lignesDe(m.app, 'Script SWN'), [{ id: m.swn, niveau: 'ecriture' }]);
  const j = (await page.evaluate(() => fetch('/api/compte/jetons').then((r) => r.json()))) as Any;
  const mien = (j.jetons ?? j).find((x: Any) => x.nom === 'Script SWN');
  assert.deepEqual(mien.systemes.map((s: Any) => [s.nom, s.niveau]), [[SWN, 'ecriture']]);
  await page.screenshot({ path: `${CAP}/ligne.png` });

  await page.getByRole('button', { name: 'Modifier les accès de Script SWN' }).click();
  assert.equal(await radio(page, SWN, 'Écriture').getAttribute('aria-checked'), 'true');
  await radio(page, SWN, 'Lecture').click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Accès enregistrés.').waitFor();
  await attendre(page);
  assert.deepEqual(lignesDe(m.app, 'Script SWN'), [{ id: m.swn, niveau: 'lecture' }]);
  assert.match((await page.locator('.ligne-jeton').filter({ hasText: 'Script SWN' }).textContent()) ?? '', /Stars Without Number : lecture/);
  await ctx.close();
});

test('exclusion : plus MJ du système, puis plus lecteur', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Antor');
  await ouvrir(page);
  await creerAvecEcriture(page, 'Jeton fragile');
  // Antor stops being GM of SWN's space but reads it through an attached universe.
  const espace = (m.app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(m.swn) as { id: number }).id;
  m.app.db.prepare("UPDATE membres SET role = 'joueur' WHERE univers_id = ? AND compte_id = ?").run(espace, m.antor);
  m.app.db.prepare("UPDATE univers SET systeme_id = ? WHERE nom = 'Les Cendres de Vaëlis'").run(m.swn);
  await page.reload();
  await attendre(page);
  const lj = page.locator('.ligne-jeton').filter({ hasText: 'Jeton fragile' });
  assert.match((await lj.textContent()) ?? '', /Stars Without Number : écriture.*lecture seule, vous n’êtes plus MJ du système/);
  await page.getByRole('button', { name: 'Modifier les accès de Jeton fragile' }).click();
  await ligne(page, SWN).waitFor();
  assert.match((await ligne(page, SWN).textContent()) ?? '', /lecture seule, vous n’êtes plus MJ du système/);
  assert.equal(await radio(page, SWN, 'Écriture').isDisabled(), true);
  await page.screenshot({ path: `${CAP}/plus-mj.png` });
  await page.getByRole('button', { name: 'Annuler' }).click();

  // Antor no longer reads SWN at all.
  m.app.db.prepare('UPDATE univers SET systeme_id = NULL WHERE nom = ?').run('Les Cendres de Vaëlis');
  m.app.db.prepare('DELETE FROM membres WHERE univers_id = ? AND compte_id = ?').run(espace, m.antor);
  await page.reload();
  await attendre(page);
  assert.match((await page.locator('.ligne-jeton').filter({ hasText: 'Jeton fragile' }).textContent()) ?? '', /Stars Without Number : écriture.*\(plus lecteur\)/);
  await page.getByRole('button', { name: 'Modifier les accès de Jeton fragile' }).click();
  await ligne(page, SWN).waitFor();
  assert.match((await ligne(page, SWN).textContent()) ?? '', /\(plus lecteur\)/);
  assert.equal(await radio(page, SWN, 'Écriture').isDisabled(), true);
  await radio(page, SWN, 'Lecture').click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Accès enregistrés.').waitFor();
  assert.deepEqual(lignesDe(m.app, 'Jeton fragile'), [{ id: m.swn, niveau: 'lecture' }], 'abaissé, la ligne reste');
  await ctx.close();
});

test('refus : le droit bouge pendant la boîte, le nom et la durée sont gardés', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Antor');
  await ouvrir(page);
  await ouvrirCreation(page, 'Garde mon nom');
  await page.getByRole('radio', { name: '90 jours' }).click().catch(() => {});
  await ligne(page, SWN).waitFor();
  await radio(page, SWN, 'Écriture').click();
  const espace = (m.app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(m.swn) as { id: number }).id;
  m.app.db.prepare("UPDATE membres SET role = 'joueur' WHERE univers_id = ? AND compte_id = ?").run(espace, m.antor);
  m.app.db.prepare("UPDATE univers SET systeme_id = ? WHERE nom = 'Les Cendres de Vaëlis'").run(m.swn);
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  await page.getByText('Vous n’êtes plus MJ de ce système.').waitFor();
  assert.equal(await page.getByLabel('Nom').inputValue(), 'Garde mon nom');
  assert.equal(await page.locator('code').count(), 0, 'aucune valeur montrée');
  assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM jetons_api WHERE nom = ?').get('Garde mon nom') as { n: number }).n, 0);
  await page.screenshot({ path: `${CAP}/refus.png` });
  await ctx.close();
});

test('chargement en erreur : Réessayer, formulaire utilisable, aucune clé systemes, lignes intactes', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Antor');
  await ouvrir(page);
  await creerAvecEcriture(page, 'Jeton existant');
  let panne = true;
  await page.route('**/api/systemes', (r: Any) => (panne ? r.abort() : r.continue()));
  const corps: string[] = [];
  page.on('request', (r: Any) => {
    if (r.method() !== 'GET' && r.url().includes('/api/compte/jetons')) corps.push(`${r.method()} ${r.postData()}`);
  });
  await page.getByRole('button', { name: 'Modifier les accès de Jeton existant' }).click();
  await page.getByText('Impossible de charger les systèmes.').waitFor();
  await page.screenshot({ path: `${CAP}/erreur.png` });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Accès enregistrés.').waitFor();
  assert.equal(corps.length, 1);
  assert.ok(!corps[0].includes('systemes'), corps[0]);
  assert.deepEqual(lignesDe(m.app, 'Jeton existant'), [{ id: m.swn, niveau: 'ecriture' }], 'rien effacé');
  // creation with the error: usable, no key sent
  await ouvrirCreation(page, 'Sans liste');
  await page.getByText('Impossible de charger les systèmes.').waitFor();
  panne = false;
  await page.getByRole('button', { name: 'Réessayer' }).first().click();
  await ligne(page, SWN).waitFor();
  assert.equal(await page.getByText('Impossible de charger les systèmes.').count(), 0);
  await ctx.close();
});

test('absent : « Contenu » décoché, compte sans système', opts, async () => {
  const m = await monde();
  const a = await connecte(browser, m.base, 'Antor');
  await ouvrir(a.page);
  await ouvrirCreation(a.page, 'x');
  await ligne(a.page, SWN).waitFor();
  const outil = a.page.getByRole('group', { name: 'Ce que le jeton peut faire' }).getByRole('checkbox');
  if ((await outil.count()) > 1) await outil.nth(1).check();
  await a.page.getByRole('checkbox', { name: /^Contenu/ }).uncheck();
  assert.equal(await a.page.locator('#lib-systemes').count(), 0, 'bloc masqué');
  await a.page.getByRole('checkbox', { name: /^Contenu/ }).check();
  await ligne(a.page, SWN).waitFor();
  await a.ctx.close();
  const t = await connecte(browser, m.base, 'Teo');
  await ouvrir(t.page);
  await ouvrirCreation(t.page, 'y');
  await t.page.getByRole('button', { name: 'Créer le jeton' }).waitFor();
  await t.page.getByRole('status', { name: 'Chargement des systèmes' }).waitFor({ state: 'detached' }); // the label shows while loading
  assert.equal(await t.page.locator('#lib-systemes').count(), 0, 'aucun bloc sans système lu');
  await t.ctx.close();
});

test('admin : la boîte d’E-5 montre les systèmes du propriétaire', opts, async () => {
  const m = await monde();
  const a = await connecte(browser, m.base, 'Antor');
  await ouvrir(a.page);
  await creerAvecEcriture(a.page, 'Jeton d’Antor');
  await a.ctx.close();
  const { ctx, page } = await connecte(browser, m.base, 'Admin');
  await page.goto('/administration');
  await attendre(page);
  const l = page.getByRole('row').filter({ hasText: 'Jeton d’Antor' });
  assert.match((await l.textContent()) ?? '', /Systèmes : Stars Without Number : écriture/);
  await l.getByRole('button', { name: /Modifier les accès/ }).click();
  await ligne(page, SWN).waitFor();
  assert.equal(await radio(page, SWN, 'Écriture').getAttribute('aria-checked'), 'true');
  assert.equal(await radio(page, SWN, 'Écriture').isDisabled(), false, 'Antor est MJ : Écriture offerte (pas l’admin)');
  await page.screenshot({ path: `${CAP}/admin.png` });
  await radio(page, SWN, 'Lecture').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Accès enregistrés.').waitFor();
  assert.deepEqual(lignesDe(m.app, 'Jeton d’Antor'), [{ id: m.swn, niveau: 'lecture' }]);
  await ctx.close();
});

test('mise en page : la ligne « Systèmes » de deux systèmes tient sur une ligne à 1440 px, actions flottantes', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Antor');
  await page.setViewportSize({ width: 1440, height: 900 });
  await ouvrir(page);
  await ouvrirCreation(page, 'Deux systèmes');
  await radio(page, SWN, 'Écriture').click();
  await radio(page, 'Chroniques Oubliées Fantasy', 'Lecture').click();
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  await page.locator('code').first().waitFor();
  await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
  const l = page.locator('.ligne-jeton').filter({ hasText: 'Deux systèmes' });
  await l.waitFor();
  const acces = l.locator('.ligne-jeton-acces.secondaire');
  assert.match((await acces.textContent()) ?? '', /Chroniques Oubliées Fantasy : lecture · Stars Without Number : écriture/);
  const lignes = await acces.evaluate((e: Element) => {
    const r = document.createRange();
    r.selectNodeContents(e);
    return new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top / 4))).size;
  });
  assert.equal(lignes, 1, 'le texte tient sur une seule ligne');
  assert.equal(await l.locator('.ligne-jeton-actions').evaluate((e: Element) => getComputedStyle(e).position), 'absolute');
  await l.hover();
  await page.screenshot({ path: `${CAP}/ligne-deux-systemes-1440.png` });
  await ctx.close();
});
