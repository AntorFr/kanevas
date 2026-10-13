// Black-box test of E-6 section rhythm (charte: 32 px between sections, no rule) and of the
// scenario icon tile (.mono, like the reports).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let page: Any;
let uid = '';
let cid = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  page = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(page, 'Rythme');
  await page.getByRole('heading', { name: 'Rythme', level: 1 }).waitFor();
  uid = new URL(page.url()).pathname.split('/').pop()!;
  const c = await (await page.request.post(`/api/univers/${uid}/campagnes`, { data: { nom: 'Camp rythme' } })).json();
  cid = c.id;
  await page.request.post(`/api/campagnes/${cid}/scenarios`, { data: { titre: 'Scénario un' } });
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-6 bureau : 32 px entre les sections, aucun filet au-dessus des titres', opts, async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/univers/${uid}/campagnes/${cid}`);
  await page.getByRole('heading', { name: 'Comptes-rendus' }).waitFor();
  const mesure = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('.panneaux-suivi > .panneau')] as HTMLElement[];
    return ps.map((p) => {
      const h = p.querySelector('h2')!;
      const cs = getComputedStyle(p);
      return {
        titre: (h.textContent ?? '').trim(),
        mj: p.classList.contains('reserve-mj'),
        hautTitre: h.getBoundingClientRect().top,
        bas: p.getBoundingClientRect().bottom,
        bordHaut: cs.borderTopWidth,
        padHaut: cs.paddingTop,
        padBas: cs.paddingBottom,
      };
    });
  });
  assert.ok(mesure.length >= 3, `sections: ${JSON.stringify(mesure)}`);
  const cr = mesure.findIndex((m: Any) => m.titre.startsWith('Comptes-rendus'));
  const prep = mesure.findIndex((m: Any) => m.titre.startsWith('Préparation'));
  assert.ok(cr > 0 && prep >= 0, JSON.stringify(mesure));
  for (const m of mesure) if (!m.mj) assert.equal(m.bordHaut, '0px', `filet sur ${m.titre}`);
  // distance from the previous section's visible edge (the hatched box for GM-only ones) to the next title
  const i = cr;
  const prev = mesure[i - 1];
  const ecart = mesure[i].hautTitre - prev.bas;
  assert.ok(ecart >= 31 && ecart <= 33, `écart ${ecart} entre « ${prev.titre} » et « ${mesure[i].titre} » : ${JSON.stringify(mesure)}`);
});

test('E-6 : l’icône de chaque scénario est dans une tuile .mono', opts, async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/univers/${uid}/campagnes/${cid}`);
  const lien = page.getByRole('link', { name: 'Scénario un' });
  await lien.waitFor();
  const r = await lien.evaluate((a: Element) => {
    const t = a.querySelector('.mono');
    const b = t?.getBoundingClientRect();
    return { tuile: !!t, svg: !!t?.querySelector('svg'), w: b?.width, h: b?.height, bg: t ? getComputedStyle(t).backgroundColor : '' };
  });
  assert.ok(r.tuile && r.svg, JSON.stringify(r));
  assert.equal(Math.round(r.w!), 28);
  assert.equal(Math.round(r.h!), 28);
  assert.notEqual(r.bg, 'rgba(0, 0, 0, 0)');
});
