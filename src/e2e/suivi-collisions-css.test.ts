// Black-box tests of the CSS non-collision fixes of kanevas-rv-lore-suivi (A, C, D of the reopening).
// Panne visée : the global rules of liste.css / accueil.css leaking onto other screens —
// the E-1 column header (.tete-liste, --texte-3, 12px padding) overriding the h1 of list screens,
// the search label visible, the list margin pushing the E-3 rows down.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, creerFiche, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let page: Any;
let uid = '';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  const { connecte } = await import('./harnais.test.js');
  page = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(page, 'Collisions');
  await page.getByRole('heading', { name: 'Collisions', level: 1 }).waitFor();
  uid = new URL(page.url()).pathname.split('/').pop()!;
  await creerFiche(page, 'personnage', 'Fiche css');
  const c = await (await page.request.post(`/api/univers/${uid}/campagnes`, { data: { nom: 'Camp css' } })).json();
  await page.request.patch(`/api/campagnes/${c.id}`, { data: { statut: 'active' } });
  await page.request.post(`/api/campagnes/${c.id}/scenarios`, { data: { titre: 'Scén css' } });
  const ss = await (await page.request.get(`/api/campagnes/${c.id}/scenarios`)).json();
  const sid = (ss.scenarios ?? ss.items ?? ss)[0].id;
  await page.request.post(`/api/univers/${uid}/campagnes/${c.id}/comptes-rendus`, { data: { titre: 'CR css', contenu: 'x' } }).catch(() => undefined);
  urls.e7 = `/univers/${uid}/scenarios/${sid}`;
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

const urls: Record<string, string> = {};

async function h1(p: Any): Promise<{ color: string; ref: string; padding: string }> {
  return p.evaluate(() => {
    const el = document.querySelector('main h1') as HTMLElement;
    const probe = document.createElement('span');
    probe.style.color = 'var(--texte)';
    document.body.appendChild(probe);
    const ref = getComputedStyle(probe).color;
    probe.remove();
    
    return { color: getComputedStyle(el).color, ref, padding: getComputedStyle(el.parentElement as HTMLElement).paddingLeft };
  });
}

test('les h1 de E-4, E-7, E-8, E-13, E-14 sont en --texte et sans décalage de colonne', opts, async () => {
  const chemins = [
    ['E-8', `/univers/${uid}/fiches/personnages`],
    ['E-13', `/univers/${uid}/comptes-rendus`],
    ['E-4', `/univers/${uid}/membres`],
    ['E-14', `/univers/${uid}/parametres`],
    ['E-6', `/univers/${uid}/campagnes`],
    ['E-7', urls.e7!],
  ];
  for (const [nom, u] of chemins) {
    await page.goto(u!);
    await page.locator('main h1').first().waitFor();
    const r = await h1(page);
    assert.equal(r.color, r.ref, `${nom} : h1 en --texte`);
    assert.equal(r.padding, '0px', `${nom} : l'en-tête n'a pas le décalage de 12px de E-1`);
  }
});

test('E-8 : le libellé de la recherche n\'est pas visible, la loupe est dans le champ', opts, async () => {
  await page.goto(`/univers/${uid}/fiches/personnages`);
  await page.locator('main h1').first().waitFor();
  const lab = page.locator('.champ-recherche label.lib-champ');
  await lab.waitFor({ state: 'attached' });
  assert.equal(await lab.count(), 1);
  const b = await lab.evaluate((e: HTMLElement) => ({ r: e.getBoundingClientRect(), pos: getComputedStyle(e).position }));
  assert.ok(b.r.width <= 1 && b.r.height <= 1 && b.pos === 'absolute', 'label réduit à 1px');
  const loupe = await page.locator('.champ-recherche > svg').boundingBox();
  const champ = await page.locator('.champ-recherche textarea, .champ-recherche input').first().boundingBox();
  assert.ok(loupe.y >= champ.y && loupe.y + loupe.height <= champ.y + champ.height, 'loupe verticalement dans le champ');
  assert.ok(loupe.x >= champ.x && loupe.x < champ.x + champ.width, 'loupe horizontalement dans le champ');
});

test('E-3 : écart titre → première ligne sans marge de liste ; E-1 garde son en-tête de colonnes', opts, async () => {
  await page.goto(`/univers/${uid}`);
  await page.getByRole('heading', { name: 'Collisions', level: 1 }).waitFor();
  await page.locator('.bloc-ve .lignes').first().waitFor();
  const mt = await page.locator('.bloc-ve .lignes').first().evaluate((e: HTMLElement) => getComputedStyle(e).marginTop);
  assert.equal(mt, '0px');
  await page.goto('/');
  await page.getByText('1 univers').waitFor();
  const t = await page.locator('.tete-colonnes').first().evaluate((e: HTMLElement) => {
    const s = getComputedStyle(e);
    return { c: s.color, p: s.paddingLeft, d: s.display };
  });
  // E-1 is a grid of cards since kanevas-illustrations: `.accueil-cartes .tete-colonnes` aligns the header on the grid (0), not on the old 12px list rows.
  assert.equal(t.p, '0px');
  assert.equal(t.d, 'flex');
  assert.notEqual(t.c, await page.evaluate(() => { const x = document.createElement('i'); x.style.color = 'var(--texte)'; document.body.appendChild(x); const c = getComputedStyle(x).color; x.remove(); return c; }));
});
