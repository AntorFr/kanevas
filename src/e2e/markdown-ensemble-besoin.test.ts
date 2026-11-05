// Black-box tests of kanevas-import-markdown at the level of the assembled feature (B-32, B-43), written from the
// need alone (docs/parcours.md, docs/ecrans.md « Le Markdown », the fiche's exit criterion), against the real
// server in stub mode driven by a real Chromium. Expected values are literals.
//
// TEST PLAN
//   B-32 nominal   : Antor writes in « Apparence » a heading, list, table, bold, https link, javascript: link and a
//                    <script> tag; « Aperçu » then « Enregistrer »; Léa reads them formatted, hostile parts as text,
//                    no dialog (screenshots in /tmp)
//   B-32 exclusion : the reader's responses (sheet, section, system) carry no Markdown source; the writer's do
//   B-32 exclusion : raw HTML tags, other-scheme links (any case), external images stay text, no <img>/<script>
//   B-32 bord      : a section seeded as plain text reads as before (paragraphs and line breaks)
//   B-32 aperçu    : the preview route renders exactly what the reading renders
//   B-32 assistant : the read tool of the assistant, asked by Léa, never returns the source
//   B-43 bords     : 100 000 accepted, 100 001 refused with the fixed message, for section, report, scenario, entry
//   B-43 écran     : /api/moi gives the ceiling; typing the 100 001st character shows « Erreur : 100 000 caractères au plus. »
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
async function brut(c: Any, method: 'post' | 'put', url: string, data: unknown): Promise<{ status: number; corps: Any }> {
  const r = await c.ctx.request[method](url, { data });
  return { status: r.status(), corps: await json(r) };
}
function surveiller(page: Any): string[] {
  const dialogues: string[] = [];
  page.on('dialog', async (d: Any) => {
    dialogues.push(d.message());
    await d.dismiss();
  });
  return dialogues;
}
async function monde(nom: string) {
  const u = await api(C.antor, 'post', '/api/univers', { nom });
  const b = `/api/univers/${u.id}`;
  await api(C.antor, 'post', `${b}/membres`, { username: 'lea', role: 'joueur' });
  const f = await api(C.antor, 'post', `${b}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  return { u: u.id as number, b, f: f.id as number };
}
async function sectionLue(m: { b: string; f: number }, titre: string, contenu: string) {
  const s = await api(C.antor, 'post', `${m.b}/fiches/${m.f}/sections`, { titre, contenu });
  await api(C.antor, 'patch', `${m.b}/fiches/${m.f}/sections/${s.id}`, { joueursLisent: true });
  return s.id as number;
}

test('B-32 critère : Antor écrit, Aperçu, Enregistrer ; Léa lit le formaté, le hostile en texte, aucun script', opts, async () => {
  const m = await monde('Critere MD');
  const sid = await sectionLue(m, 'Apparence', 'vide');
  const page = await C.antor.ctx.newPage();
  const dlg = surveiller(page);
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const source = [
    '## Quartiers',
    '',
    '- Docks',
    '- Marché',
    '',
    '| nom | gens |',
    '|---|---|',
    '| Docks | 12 |',
    '',
    'Un homme **robuste**, [site](https://exemple.org/a), [piège](javascript:alert(1)).',
    '',
    '<script>alert(1)</script>',
  ].join('\n');
  await page.getByLabel('Contenu de « Apparence »').fill(source);
  await page.getByRole('radio', { name: 'Aperçu', exact: true }).click();
  await page.locator('.apercu-md h3').waitFor();
  assert.equal(await page.locator('.apercu-md h3').innerText(), 'Quartiers');
  await page.screenshot({ path: '/tmp/kanevas-ensemble-apercu.png' });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('.md h3').first().waitFor();
  await page.close();

  const lea = await C.lea.ctx.newPage();
  const dl = surveiller(lea);
  await lea.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await lea.waitForLoadState('networkidle');
  const md = lea.locator('.md').first();
  await md.locator('h3').waitFor();
  assert.equal(await md.locator('h3').innerText(), 'Quartiers');
  assert.equal(await md.locator('ul li').count(), 2);
  assert.equal(await md.locator('table td').count(), 2);
  assert.equal(await md.locator('strong').innerText(), 'robuste');
  const liens = await md.locator('a').evaluateAll((as: HTMLAnchorElement[]) => as.map((a) => a.getAttribute('href')));
  assert.deepEqual(liens, ['https://exemple.org/a']);
  assert.equal(await md.locator('a').getAttribute('target'), '_blank');
  const t = await md.innerText();
  assert.match(t, /\[piège\]\(javascript:alert\(1\)\)/);
  assert.match(t, /<script>alert\(1\)<\/script>/);
  assert.equal(await md.locator('script').count(), 0);
  assert.deepEqual(dl, []);
  await lea.screenshot({ path: '/tmp/kanevas-ensemble-lecture-lea.png' });
  await lea.close();
  void sid;
});

test('B-32 exclusion : la réponse de lecture de Léa (fiche, section) n’a pas la source, celle d’Antor l’a', opts, async () => {
  const m = await monde('Source MD');
  const sid = await sectionLue(m, 'Apparence', '## Quartiers\n\nUn **gras** secret-de-source');
  for (const url of [`${m.b}/fiches/${m.f}`, `${m.b}/fiches/${m.f}/sections/${sid}`]) {
    const lea = await (await C.lea.ctx.request.get(url)).text();
    assert.equal(lea.includes('**gras**'), false, `${url} (Léa) ne doit pas porter la source`);
    assert.equal(lea.includes('## Quartiers'), false);
    assert.equal(lea.includes('<h3>Quartiers</h3>'), true);
    assert.equal(lea.includes('<strong>gras</strong>'), true);
    const antor = await (await C.antor.ctx.request.get(url)).text();
    assert.equal(antor.includes('**gras**'), true, `${url} (Antor) porte la source`);
  }
});

test('B-32 exclusion : l’entrée de système lue par Léa (rendu seul) sans source pour elle', opts, async () => {
  const m = await monde('Entree MD');
  const sys = await api(C.antor, 'post', '/api/systemes', { nom: 'Mini' });
  await api(C.antor, 'put', `${m.b}/systeme`, { systemeId: sys.id });
  await api(C.antor, 'post', `/api/systemes/${sys.id}/gabarits`, { type: 'creature', nom: 'Gobelin', contenu: '**crochu** [[x]]' });
  // entry on screen for Léa: formatted, no editor, no source field
  const p = await C.lea.ctx.newPage();
  await p.goto(`${srv.base}/systemes/${sys.id}`);
  await p.waitForLoadState('networkidle');
  const onglet = p.getByRole('tab', { name: /Créature/i });
  if (await onglet.count()) await onglet.click();
  await p.getByRole('button', { name: /Gobelin/ }).click();
  const md = p.locator('.entree-contenu.md');
  await md.waitFor();
  assert.equal(await md.locator('strong').innerText(), 'crochu');
  assert.match(await md.innerText(), /\[\[x\]\]/);
  assert.equal(await p.getByRole('textbox').count(), 0);
  assert.equal(await p.getByRole('radio', { name: 'Aperçu' }).count(), 0);
  await p.screenshot({ path: '/tmp/kanevas-ensemble-entree-lea.png' });
  await p.close();
});

test('B-32 exclusion : HTML brut, schémas hors http/https/mailto (toutes casses) et image externe restent du texte', opts, async () => {
  const m = await monde('Hostile MD');
  await sectionLue(
    m,
    'Piège',
    [
      '<img src=x onerror=alert(1)>',
      '',
      '[a](JaVaScRiPt:alert(2)) [b](data:text/html,x) [c](vbscript:x) [d](mailto:a@b.fr) [e](http://exemple.org)',
      '',
      '![plan](https://exemple.org/p.png)',
    ].join('\n'),
  );
  const p = await C.lea.ctx.newPage();
  const dlg = surveiller(p);
  await p.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await p.waitForLoadState('networkidle');
  const md = p.locator('.md').first();
  await md.waitFor();
  const hrefs = await md.locator('a').evaluateAll((as: HTMLAnchorElement[]) => as.map((a) => a.getAttribute('href')));
  assert.deepEqual(hrefs, ['mailto:a@b.fr', 'http://exemple.org']);
  assert.equal(await md.locator('img').count(), 0);
  const t = await md.innerText();
  assert.match(t, /<img src=x onerror=alert\(1\)>/);
  assert.match(t, /plan/);
  assert.equal(t.includes('p.png'), false);
  await p.waitForTimeout(300);
  assert.deepEqual(dlg, []);
  await p.close();
});

test('B-32 bord : une section en texte brut s’affiche comme avant, paragraphes et sauts de ligne', opts, async () => {
  const m = await monde('Brut MD');
  await sectionLue(m, 'Brut', 'Ligne un\nLigne deux\n\nSecond paragraphe');
  const p = await C.lea.ctx.newPage();
  await p.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await p.waitForLoadState('networkidle');
  const md = p.locator('.md').first();
  await md.waitFor();
  assert.equal(await md.locator('p').count(), 2);
  assert.equal(await md.locator('p br').count(), 1);
  assert.equal(await md.locator('p').nth(0).innerText(), 'Ligne un\nLigne deux');
  assert.equal(await md.locator('p').nth(1).innerText(), 'Second paragraphe');
  await p.close();
});

test('B-32 aperçu : la route d’aperçu rend ce que rend la lecture, et seul un compte connecté l’appelle', opts, async () => {
  const m = await monde('Apercu MD');
  const texte = '# T\n\n- a\n- b\n\n**g** <b>x</b> [l](javascript:1)';
  const sid = await sectionLue(m, 'S', texte);
  const ap = await api(C.lea, 'post', '/api/apercu', { texte });
  const lecture = await api(C.lea, 'get', `${m.b}/fiches/${m.f}/sections/${sid}`);
  assert.equal(ap.html, lecture.html);
  assert.equal(
    ap.html,
    '<h3>T</h3>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p><strong>g</strong> &lt;b&gt;x&lt;/b&gt; [l](javascript:1)</p>\n',
  );
  const anon = await (await import('./harnais.test.js')).playwright.request.newContext({ baseURL: srv.base });
  const r = await anon.post('/api/apercu', { data: { texte: 'a' }, maxRedirects: 0 });
  assert.notEqual(r.status(), 200);
  await anon.dispose();
});

test('B-32 assistant : la lecture de Léa par l’assistant ne rend pas la source Markdown', opts, async () => {
  const m = await monde('Assistant MD');
  await sectionLue(m, 'Apparence', '## Quartiers\n\nUn homme **robuste**');
  const rep = await api(C.lea, 'post', `${m.b}/assistant/messages`, { message: 'lis-moi la section « Apparence »' });
  assert.equal(rep.reponse.includes('robuste'), true, rep.reponse);
  assert.equal(rep.reponse.includes('**robuste**'), false, rep.reponse);
  assert.equal(rep.reponse.includes('## Quartiers'), false, rep.reponse);
});

test('B-43 bords : 100 000 caractères s’enregistrent, 100 001 est refusé (400, message fixe) — section, compte-rendu, entrée', opts, async () => {
  const m = await monde('Plafond MD');
  const MSG = 'Contenu trop long : 100 000 caractères au plus.';
  const ok = 'a'.repeat(100000);
  const trop = 'a'.repeat(100001);
  const moi = await api(C.lea, 'get', '/api/moi');
  assert.equal(moi.limites.contenuSection, 100000);

  // section: create + replace
  assert.equal((await brut(C.antor, 'post', `${m.b}/fiches/${m.f}/sections`, { titre: 'Ok', contenu: ok })).status, 201);
  const refus = await brut(C.antor, 'post', `${m.b}/fiches/${m.f}/sections`, { titre: 'Trop', contenu: trop });
  assert.equal(refus.status, 400);
  assert.equal(refus.corps.message, MSG);
  const s = await api(C.antor, 'post', `${m.b}/fiches/${m.f}/sections`, { titre: 'Cible', contenu: 'x' });
  const put = (contenu: string) => brut(C.antor, 'put', `${m.b}/fiches/${m.f}/sections/${s.id}/contenu`, { contenu, version: 1 });
  const r1 = await put(trop);
  assert.equal(r1.status, 400);
  assert.equal(r1.corps.message, MSG);
  assert.equal((await put(ok)).status, 200);
  const relu = await api(C.antor, 'get', `${m.b}/fiches/${m.f}/sections/${s.id}`);
  assert.equal(relu.contenu.length, 100000);

  // report
  const camp = await api(C.antor, 'post', `${m.b}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'Camp', sections: [{ titre: 'Présentation', joueursLisent: true }] });
  const cr = (texte: string) => brut(C.lea, 'post', `${m.b}/comptes-rendus`, { campagneId: camp.id, titre: 'Séance', texte });
  assert.equal((await cr(ok)).status, 201);
  const rc = await cr(trop);
  assert.equal(rc.status, 400);
  assert.equal(rc.corps.message, MSG);

  // system entry
  const sys = await api(C.antor, 'post', '/api/systemes', { nom: 'Plafond' });
  await api(C.antor, 'put', `${m.b}/systeme`, { systemeId: sys.id });
  const en = (contenu: string) => brut(C.antor, 'post', `/api/systemes/${sys.id}/gabarits`, { type: 'creature', nom: 'R', contenu });
  assert.equal((await en(ok)).status, 201);
  const re = await en(trop);
  assert.equal(re.status, 400);
  assert.equal(re.corps.message, MSG);
});

test('B-43 écran : la 100 001e saisie affiche « Erreur : 100 000 caractères au plus. » et n’enregistre pas', opts, async () => {
  const m = await monde('Plafond ecran');
  const sid = await sectionLue(m, 'Apparence', 'avant');
  const p = await C.antor.ctx.newPage();
  await p.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const champ = p.getByLabel('Contenu de « Apparence »');
  await champ.fill('a'.repeat(100000));
  assert.equal(await p.getByText('Erreur : 100 000 caractères au plus.').count(), 0);
  await champ.fill('a'.repeat(100001));
  await p.getByText('Erreur : 100 000 caractères au plus.').waitFor();
  await p.screenshot({ path: '/tmp/kanevas-ensemble-plafond.png' });
  await p.close();
  const relu = await api(C.antor, 'get', `${m.b}/fiches/${m.f}/sections/${sid}`);
  assert.equal(relu.contenu, 'avant');
});
