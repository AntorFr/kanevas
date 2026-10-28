// Black-box tests of kanevas-markdown-editeur (exit criterion), real Chromium, real server in stub mode.
//
// TEST PLAN
//   nominal   : Antor edits « Apparence », types hostile Markdown, Ctrl+B wraps the selected word, « Aperçu »
//               shows the rendering, « Écrire » gives the text back, saves; Léa reads it formatted, hostile as text
//   bords     : 100 000 chars save in section / scenario / entry / report window (counter « 100 000 / 100 000 »);
//               100 001: « Enregistrer » aria-disabled + error, no /api/apercu call; E-6 window: error on click
//   échec     : empty preview « Rien à prévisualiser. »; preview API cut: message + « Réessayer », field intact
//   exclusion : the report window (E-6) has no toolbar, no preview
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';
import { comptes, json } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  C = await comptes(srv, browser);
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

async function api(c: Any, method: 'post' | 'put' | 'get' | 'patch', url: string, data?: unknown): Promise<Any> {
  const r = await c.ctx.request[method](url, data === undefined ? {} : { data });
  if (r.status() >= 300) throw new Error(`${method} ${url} -> ${r.status()} ${await r.text()}`);
  return json(r);
}

async function monde(nom: string) {
  const u = await api(C.antor, 'post', '/api/univers', { nom });
  const b = `/api/univers/${u.id}`;
  await api(C.antor, 'post', `${b}/membres`, { username: 'lea', role: 'joueur' });
  const f = await api(C.antor, 'post', `${b}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  const s = await api(C.antor, 'post', `${b}/fiches/${f.id}/sections`, { titre: 'Apparence', contenu: 'Un vieil homme.' });
  await api(C.antor, 'patch', `${b}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
  return { u: u.id as number, f: f.id as number, s: s.id as number, b };
}

const plat = (s: string) => s.replace(/\s/g, ' ');
const COMPTEUR_PLEIN = '100 000 / 100 000';

function surveiller(page: Any): string[] {
  const dialogues: string[] = [];
  page.on('dialog', async (d: Any) => {
    dialogues.push(d.message());
    await d.dismiss();
  });
  return dialogues;
}

function compterApercus(page: Any): { n: number } {
  const c = { n: 0 };
  page.on('request', (r: Any) => {
    if (r.url().endsWith('/api/apercu')) c.n += 1;
  });
  return c;
}

test('nominal : Antor écrit, Ctrl+B, Aperçu, Écrire, Enregistrer ; Léa lit le rendu, le hostile en texte', opts, async () => {
  const m = await monde('Editeur nominal');
  const page = await C.antor.ctx.newPage();
  const dlg = surveiller(page);
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const champ = page.getByLabel('Contenu de « Apparence »');
  const source = [
    '## Silhouette',
    '',
    '- grand',
    '- sombre',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    'Un mot robuste, **gras**, voir https://exemple.org/aldric et [piège](javascript:alert(1)).',
    '',
    '<script>alert(1)</script>',
  ].join('\n');
  await champ.fill(source);
  // select the word « robuste » and press Ctrl+B
  const debut = source.indexOf('robuste');
  await champ.evaluate((el: HTMLTextAreaElement, [a, b]: number[]) => {
    el.focus();
    el.setSelectionRange(a, b);
  }, [debut, debut + 'robuste'.length]);
  await page.keyboard.press('Control+b');
  assert.equal((await champ.inputValue()).includes('Un mot **robuste**, **gras**'), true);
  await page.screenshot({ path: '/tmp/kanevas-md-editeur-ecrire.png' });

  await page.getByRole('radio', { name: 'Aperçu', exact: true }).click();
  const apercu = page.locator('.apercu-md');
  await apercu.locator('h3').waitFor();
  assert.equal(await apercu.locator('ul li').count(), 2);
  assert.equal(await apercu.locator('table td').count(), 2);
  assert.equal(await apercu.locator('strong').count(), 2);
  assert.equal(await apercu.locator('a[href^="javascript"]').count(), 0);
  assert.equal(await apercu.locator('script').count(), 0);
  assert.match(await apercu.innerText(), /<script>alert\(1\)<\/script>/);
  assert.equal(await champ.isVisible(), false);
  await page.screenshot({ path: '/tmp/kanevas-md-editeur-apercu.png' });

  await page.getByRole('radio', { name: 'Écrire', exact: true }).click();
  assert.equal(await champ.inputValue(), source.replace('robuste', '**robuste**'));
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('.md h3').first().waitFor();
  assert.deepEqual(dlg, []);
  await page.close();

  const lea = await C.lea.ctx.newPage();
  const dl = surveiller(lea);
  await lea.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await lea.waitForLoadState('networkidle');
  const md = lea.locator('.md').first();
  await md.locator('h3').waitFor();
  assert.equal(await md.locator('ul li').count(), 2);
  assert.equal(await md.locator('table td').count(), 2);
  assert.equal(await md.locator('a[href^="javascript"]').count(), 0);
  assert.equal(await md.locator('script').count(), 0);
  assert.match(await md.innerText(), /javascript:alert\(1\)/);
  assert.match(await md.innerText(), /<script>alert\(1\)<\/script>/);
  assert.deepEqual(dl, []);
  await lea.close();
});

test('raccourcis : Ctrl+I sans sélection, Ctrl+Entrée enregistre, Échap annule', opts, async () => {
  const m = await monde('Editeur clavier');
  const page = await C.antor.ctx.newPage();
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const champ = page.getByLabel('Contenu de « Apparence »');
  await champ.fill('');
  await page.keyboard.press('Control+i');
  await page.keyboard.type('ital');
  assert.equal(await champ.inputValue(), '*ital*');
  await page.keyboard.press('Escape');
  await champ.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  assert.equal(await champ.inputValue(), 'Un vieil homme.');
  await champ.fill('Enregistré au clavier');
  await page.keyboard.press('Control+Enter');
  await champ.waitFor({ state: 'detached' });
  const lu = await api(C.antor, 'get', `${m.b}/fiches/${m.f}`);
  assert.equal(JSON.stringify(lu).includes('Enregistré au clavier'), true);
  await page.close();
});

test('aperçu : champ vide, API coupée avec Réessayer (champ intact), puis rétabli', opts, async () => {
  const m = await monde('Editeur apercu');
  const page = await C.antor.ctx.newPage();
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const champ = page.getByLabel('Contenu de « Apparence »');
  await champ.fill('');
  const compte = compterApercus(page);
  await page.getByRole('radio', { name: 'Aperçu', exact: true }).click();
  await page.getByText('Rien à prévisualiser.', { exact: true }).waitFor();
  assert.equal(compte.n, 0, 'un champ vide n’appelle pas l’aperçu');
  await page.getByRole('radio', { name: 'Écrire', exact: true }).click();

  await champ.fill('Texte **à garder**');
  let coupe = true;
  await page.route('**/api/apercu', (r: Any) => (coupe ? r.abort() : r.continue()));
  await page.getByRole('radio', { name: 'Aperçu', exact: true }).click();
  await page.getByText(/L.aperçu n.a pas abouti\. Réessayez\./).waitFor();
  await page.screenshot({ path: '/tmp/kanevas-md-editeur-echec.png' });
  coupe = false;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.locator('.apercu-md strong').waitFor();
  assert.equal(await page.locator('.apercu-md strong').innerText(), 'à garder');
  await page.getByRole('radio', { name: 'Écrire', exact: true }).click();
  assert.equal(await champ.inputValue(), 'Texte **à garder**');
  await page.close();
});

test('bords section : 100 000 s’enregistre (compteur plein) ; 100 001 grise Enregistrer, erreur, aucun aperçu', opts, async () => {
  const m = await monde('Editeur plafond section');
  const page = await C.antor.ctx.newPage();
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const champ = page.getByLabel('Contenu de « Apparence »');
  const compte = compterApercus(page);
  await champ.fill('a'.repeat(100001));
  const enr = page.getByRole('button', { name: 'Enregistrer', exact: true });
  await page.getByText('Erreur : 100 000 caractères au plus.').waitFor();
  assert.equal(await enr.getAttribute('aria-disabled'), 'true');
  await page.getByRole('radio', { name: 'Aperçu', exact: true }).click();
  await page.getByText('Erreur : 100 000 caractères au plus.').waitFor();
  assert.equal(await page.getByRole('radio', { name: 'Aperçu', exact: true }).getAttribute('aria-checked'), 'false');
  assert.equal(compte.n, 0);
  await page.screenshot({ path: '/tmp/kanevas-md-editeur-trop-long.png' });

  await champ.fill('a'.repeat(100000));
  assert.match(plat(await page.locator('.compteur-md').innerText()), new RegExp(COMPTEUR_PLEIN));
  assert.equal(await page.getByText('Erreur : 100 000 caractères au plus.').count(), 0);
  await enr.click();
  await champ.waitFor({ state: 'detached' });
  const lu = await api(C.antor, 'get', `${m.b}/fiches/${m.f}`);
  assert.equal(JSON.stringify(lu).includes('a'.repeat(100000)), true);
  await page.close();
});

test('bords entrée de système : 100 000 s’enregistre ; 100 001 grise Enregistrer, erreur, aucun aperçu', opts, async () => {
  const m = await monde('Editeur plafond entree');
  const sys = await api(C.antor, 'post', '/api/systemes', { nom: 'Plafond MD' });
  await api(C.antor, 'put', `${m.b}/systeme`, { systemeId: sys.id });
  await api(C.antor, 'post', `/api/systemes/${sys.id}/gabarits`, { type: 'creature', nom: 'Gobelin', contenu: 'x' });
  const page = await C.antor.ctx.newPage();
  await page.goto(`${srv.base}/systemes/${sys.id}`);
  await page.waitForLoadState('networkidle');
  const onglet = page.getByRole('tab', { name: /Créature/i });
  if (await onglet.count()) await onglet.click();
  await page.getByRole('button', { name: /Gobelin/ }).click();
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const champ = page.getByLabel('Contenu', { exact: true });
  const compte = compterApercus(page);
  await champ.fill('a'.repeat(100001));
  await page.getByText('Erreur : 100 000 caractères au plus.').waitFor();
  const enr = page.getByRole('button', { name: 'Enregistrer', exact: true });
  assert.equal(await enr.getAttribute('aria-disabled'), 'true');
  await enr.click({ force: true });
  await page.getByRole('radio', { name: 'Aperçu', exact: true }).click();
  assert.equal(compte.n, 0);
  assert.equal(await champ.inputValue().then((v: string) => v.length), 100001, 'le clic sur un bouton grisé n’enregistre pas');
  await champ.fill('a'.repeat(100000));
  assert.match(plat(await page.locator('.compteur-md').innerText()), new RegExp(COMPTEUR_PLEIN));
  await enr.click();
  await champ.waitFor({ state: 'detached' });
  await page.reload();
  await page.waitForLoadState('networkidle');
  if (await onglet.count()) await onglet.click();
  await page.getByRole('button', { name: /Gobelin/ }).click();
  await page.locator('.entree-contenu.md').waitFor();
  assert.equal((await page.locator('.entree-contenu.md').innerText()).length >= 100000, true);
  await page.close();
});
