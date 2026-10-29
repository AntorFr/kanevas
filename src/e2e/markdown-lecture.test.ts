// Black-box tests of kanevas-markdown-lecture (exit criterion): Markdown written through the API is read
// formatted on E-9 (section + report), E-7 (scenario), E-15 (entry) and E-12 (Rendu / Source), in a real
// Chromium against the real server in stub mode. Hostile text is shown as text and opens no dialog.
//
// TEST PLAN
//   E-9 lecteur   : Léa sees h3 + list + table + bold + web link (_blank), `javascript:` link and <script> as text,
//                   no dialog, no <script> in the DOM; plain text section unchanged; empty section keeps its empty state
//   E-9 CR        : the report of the same shape reads the same way on the sheet
//   E-7 / E-15    : scenario and entry read formatted (GM); the entry read by a player is formatted too
//   E-12          : proposal rendered; « Source » shows raw Markdown in both zones; « Rendu » returns
//   bord 375 px   : a 12-column table scrolls inside its frame, the page does not widen
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer, texte } from './harnais.test.js';
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

const MD = [
  '## Silhouette',
  '',
  '- grand',
  '- sombre',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  'Il est **robuste**, voir [le site](https://exemple.org/aldric) et [piège](javascript:alert(1)).',
  '',
  '<script>alert(1)</script>',
].join('\n');

async function api(c: Any, method: 'post' | 'put' | 'get' | 'patch', url: string, data?: unknown): Promise<Any> {
  const r = await c.ctx.request[method](url, data === undefined ? {} : { data });
  if (r.status() >= 300) throw new Error(`${method} ${url} -> ${r.status()} ${await r.text()}`);
  return json(r);
}

async function monde() {
  const u = await api(C.antor, 'post', '/api/univers', { nom: 'Lecture MD' });
  const b = `/api/univers/${u.id}`;
  await api(C.antor, 'post', `${b}/membres`, { username: 'lea', role: 'joueur' });
  const f = await api(C.antor, 'post', `${b}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  const s = await api(C.antor, 'post', `${b}/fiches/${f.id}/sections`, { titre: 'Apparence', contenu: MD });
  await api(C.antor, 'patch', `${b}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
  const brut = await api(C.antor, 'post', `${b}/fiches/${f.id}/sections`, { titre: 'Brut', contenu: 'Texte simple.\nDeux lignes.' });
  await api(C.antor, 'patch', `${b}/fiches/${f.id}/sections/${brut.id}`, { joueursLisent: true });
  return { u: u.id as number, f: f.id as number, b };
}

/** Collects dialogs; none must open. */
function surveiller(page: Any): string[] {
  const dialogues: string[] = [];
  page.on('dialog', async (d: Any) => {
    dialogues.push(d.message());
    await d.dismiss();
  });
  return dialogues;
}

async function verifierRendu(page: Any, zone: string): Promise<void> {
  const md = page.locator(zone);
  assert.equal(await md.locator('h3').count(), 1, 'intertitre');
  assert.equal(await md.locator('ul li').count(), 2, 'liste');
  assert.equal(await md.locator('table td').count(), 2, 'tableau');
  assert.equal(await md.locator('strong').innerText(), 'robuste');
  const lien = md.locator('a[href^="https://exemple.org"]');
  assert.equal(await lien.count(), 1, 'lien web');
  assert.equal(await lien.getAttribute('target'), '_blank');
  assert.match((await lien.getAttribute('rel')) ?? '', /noopener/);
  assert.equal(await md.locator('a[href^="javascript"]').count(), 0, 'pas de lien javascript:');
  assert.equal(await md.locator('script').count(), 0, 'pas de <script>');
  const t = await md.innerText();
  assert.match(t, /javascript:alert\(1\)/);
  assert.match(t, /<script>alert\(1\)<\/script>/);
}

test('E-9 : Léa lit la section en Markdown, le hostile en texte, aucun dialogue', opts, async () => {
  const m = await monde();
  const page = await C.lea.ctx.newPage();
  const dlg = surveiller(page);
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.waitForLoadState('networkidle');
  await page.locator('.md').first().waitFor();
  await verifierRendu(page, '.md >> nth=0');
  const brut = await texte(page);
  assert.match(brut, /Texte simple\./);
  // Rendered intertitle: 19px/500, strictly below the section title (22px).
  const tailles = await page.evaluate(() => {
    const h3 = getComputedStyle(document.querySelector('.md h3') as Element);
    const h2 = getComputedStyle(document.querySelector('.sec-tete h2') as Element);
    return { h3: h3.fontSize, poids: h3.fontWeight, h2: h2.fontSize };
  });
  assert.equal(tailles.h3, '19px');
  assert.equal(tailles.poids, '500');
  assert.equal(tailles.h2, '22px');
  assert.deepEqual(dlg, []);
  await page.close();
});

test('E-9 : le compte-rendu de même forme se lit mis en forme sur la fiche', opts, async () => {
  const m = await monde();
  const camp = await api(C.antor, 'post', `${m.b}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'Camp', sections: [{ titre: 'Présentation', joueursLisent: true }] });
  const cr = await api(C.antor, 'post', `${m.b}/comptes-rendus`, { campagneId: camp.id, titre: 'Séance 1', texte: MD });
  const lea = await api(C.lea, 'get', `${m.b}/fiches/${cr.id}`);
  assert.ok(lea.sections.length >= 1, JSON.stringify(lea));
  const page = await C.lea.ctx.newPage();
  const dlg = surveiller(page);
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${cr.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('.md').first().waitFor();
  await verifierRendu(page, '.md >> nth=0');
  assert.deepEqual(dlg, []);
  await page.close();
});

test('E-15 : une entrée de système écrite en Markdown se lit mise en forme', opts, async () => {
  const m = await monde();
  const sys = await api(C.antor, 'post', '/api/systemes', { nom: 'MD Mini' });
  await api(C.antor, 'put', `${m.b}/systeme`, { systemeId: sys.id });
  await api(C.antor, 'post', `/api/systemes/${sys.id}/gabarits`, { type: 'creature', nom: 'Gobelin', contenu: MD });
  for (const c of [C.antor, C.lea]) {
    const p = await c.ctx.newPage();
    const d = surveiller(p);
    await p.goto(`${srv.base}/systemes/${sys.id}`);
    await p.waitForLoadState('networkidle');
    const onglet = p.getByRole('tab', { name: /Créature/i });
    if (await onglet.count()) await onglet.click();
    await p.getByRole('button', { name: /Gobelin/ }).click();
    await p.locator('.entree-contenu.md').waitFor();
    await verifierRendu(p, '.entree-contenu.md');
    assert.deepEqual(d, []);
    await p.close();
  }
});

test('E-12 : proposition rendue, « Source » brut dans les deux zones, « Rendu » revient', opts, async () => {
  const u = await api(C.antor, 'post', '/api/univers', { nom: 'Prop MD' });
  const b = `/api/univers/${u.id}`;
  await api(C.antor, 'post', `${b}/membres`, { username: 'lea', role: 'joueur' });
  const f = await api(C.antor, 'post', `${b}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  await api(C.antor, 'post', `${b}/fiches/${f.id}/sections`, { titre: 'Vérité', contenu: '## Avant\n\n- un' });
  const camp = await api(C.antor, 'post', `${b}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'C', sections: [{ titre: 'Présentation', joueursLisent: true }] });
  await api(C.lea, 'post', `${b}/comptes-rendus`, { campagneId: camp.id, titre: 'Séance 3', texte: 'Aldric a livré la clef.' });
  const rep = await api(C.antor, 'post', `${b}/assistant/messages`, {
    message: 'Mets à jour la section « Vérité » de « Maître Aldric » d\'après le compte-rendu « Séance 3 »',
  });
  const pid = rep.evenements[0].cible.propositionId;
  const prop = await api(C.antor, 'get', `${b}/propositions/${pid}`);
  assert.match(prop.htmlActuel, /<h3>Avant<\/h3>/);
  assert.equal(typeof prop.htmlPropose, 'string');
  const player = await C.lea.ctx.request.get(`${srv.base}${b}/propositions/${pid}`);
  assert.equal(player.status(), 404);

  const page = await C.antor.ctx.newPage();
  await page.goto(`${srv.base}/univers/${u.id}/fiche/${f.id}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Demander à Kanevas/ }).click();
  await page.getByRole('textbox', { name: /Demander à Kanevas/ }).fill(
    'Mets à jour la section « Vérité » de « Maître Aldric » d\'après le compte-rendu « Séance 3 »',
  );
  await page.getByRole('button', { name: /^Envoyer$/ }).click();
  await page.getByText('Mise à jour proposée', { exact: true }).waitFor();
  const actuel = page.getByRole('region', { name: 'Actuel', exact: true });
  assert.equal(await actuel.locator('h3').innerText(), 'Avant');
  assert.equal(await actuel.locator('li').count(), 1);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const src = await actuel.innerText();
  assert.match(src, /## Avant/);
  assert.match(src, /- un/);
  assert.equal(await actuel.locator('h3').count(), 0);
  const propose = await page.getByRole('region', { name: 'Proposé', exact: true }).innerText();
  assert.equal(propose.includes(prop.contenuPropose.trim().split('\n')[0]), true);
  await page.getByRole('button', { name: 'Rendu', exact: true }).click();
  assert.equal(await actuel.locator('h3').count(), 1);
  await page.close();
});

test('bord 375 px : un tableau de 12 colonnes défile dans son cadre', opts, async () => {
  const m = await monde();
  const cols = Array.from({ length: 12 }, (_, i) => `colonne-${i}`);
  const tab = [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, `| ${cols.map(() => 'valeur longue').join(' | ')} |`].join('\n');
  const large = await api(C.antor, 'post', `${m.b}/fiches/${m.f}/sections`, { titre: 'Large', contenu: tab });
  await api(C.antor, 'patch', `${m.b}/fiches/${m.f}/sections/${large.id}`, { joueursLisent: true });
  const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 375, height: 800 }, storageState: await C.lea.ctx.storageState() });
  const page = await ctx.newPage();
  await page.goto(`/univers/${m.u}/fiche/${m.f}`);
  await page.waitForLoadState('networkidle');
  const table = page.locator('.md table', { hasText: 'colonne-0' });
  await table.waitFor();
  const mesures = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.md table')].find((x) => x.textContent?.includes('colonne-0')) as HTMLElement;
    return { de: document.documentElement.scrollWidth, vue: window.innerWidth, tw: t.scrollWidth, tc: t.clientWidth };
  });
  assert.ok(mesures.de <= mesures.vue, `page élargie: ${JSON.stringify(mesures)}`);
  assert.ok(mesures.tw > mesures.tc, `le tableau devrait défiler: ${JSON.stringify(mesures)}`);
  await ctx.close();
});
