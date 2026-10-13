// Layout tests of kanevas-liens-ecran after the visual fixes (verify): « Mentionnée dans » is a row like Relations with
// a single rule, and the floating assistant button never covers « Enregistrer » nor a row of the open « [[ » list.
//
// TEST PLAN
//   nominal    : Léa on « Maître Aldric » (no relation): no empty .blocs, label left of the chip, chip bordered, one rule
//   bords      : desktop 1440 and phone 390, light and dark: with the list open, « Enregistrer » and each option are the
//                top element at their centre (nothing, the assistant button included, covers them)
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';
import { comptes } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;
let lame = 0;
const id: Record<string, number> = {};

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  C = await comptes(srv, browser);
  const r = await C.antor.ctx.request.get('/api/univers');
  lame = ((await r.json()) as { id: number; nom: string }[]).find((u) => u.nom === "Lame d'Ébène")!.id;
  for (const nom of ['Maître Aldric', 'Port-Sel']) {
    const l = await (await C.antor.ctx.request.get(`/api/univers/${lame}/fiches?q=${encodeURIComponent(nom)}`)).json();
    id[nom] = l.fiches.find((f: Any) => f.titre === nom).id;
  }
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

test('Mentionnée dans : rangée à étiquette à gauche, puce de jeton, un seul filet, pas de .blocs vide', opts, async () => {
  const page = await C.lea.ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${srv.base}/univers/${lame}/fiche/${id['Maître Aldric']}`);
  await page.waitForLoadState('networkidle');
  const bloc = page.getByRole('region', { name: 'Mentionnée dans' });
  await bloc.waitFor();
  const vides = await page.evaluate(() =>
    [...document.querySelectorAll('.blocs')].filter((e) => e.getBoundingClientRect().height > 0 && (e.children.length === 0 || !e.textContent?.trim())).length);
  const dbg = await page.evaluate(() => [...document.querySelectorAll(".blocs")].map((e) => e.outerHTML.slice(0, 200) + " h=" + e.getBoundingClientRect().height));
  assert.equal(vides, 0, `aucun .blocs vide ${JSON.stringify(dbg)}`);
  const g = await page.evaluate(() => {
    const b = document.querySelector('.bloc-mentions')!;
    const lib = b.querySelector('h2')!.getBoundingClientRect();
    const jeton = b.querySelector('li a')!;
    const j = jeton.getBoundingClientRect();
    const note = b.querySelector('.pourquoi')!.getBoundingClientRect();
    const cs = getComputedStyle(jeton);
    return { libDroite: lib.right, jetonGauche: j.left, jetonHaut: j.top, libHaut: lib.top, noteGauche: note.left, jetonDroite: j.right,
      fond: cs.backgroundColor, filets: [...document.querySelectorAll('.fiche .blocs, .bloc-mentions')].filter((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).borderTopWidth !== '0px').length };
  });
  assert.ok(g.libDroite <= g.jetonGauche, 'étiquette à gauche de la puce');
  assert.ok(Math.abs(g.jetonHaut - g.libHaut) < 24, 'même rangée');
  assert.notEqual(g.fond, 'rgba(0, 0, 0, 0)', 'puce posée comme celles de Relations (fond de jeton)');
  assert.ok(g.noteGauche >= g.jetonDroite, 'note à côté de la puce');
  assert.ok(g.filets <= 1, `un seul filet (obtenu ${g.filets})`);
  await page.screenshot({ path: '/tmp/liens-ecran-mep-mentions.png' });
  await page.close();
});

for (const [l, h, th] of [[1440, 900, 'light'], [1440, 900, 'dark'], [390, 844, 'light'], [390, 844, 'dark']] as const) {
  test(`liste [[ ouverte (${l}px, ${th}) : « Enregistrer » et chaque ligne ne sont pas recouverts`, opts, async () => {
    const ctx = await browser.newContext({ storageState: await C.antor.ctx.storageState(), colorScheme: th, viewport: { width: l, height: h } });
    const page = await ctx.newPage();
    await page.goto(`${srv.base}/univers/${lame}/fiche/${id['Port-Sel']}`);
    await page.waitForLoadState('networkidle');
    const article = page.locator('section.sec').filter({ has: page.getByRole('heading', { name: 'Histoire', exact: true }) }).last();
    await article.getByRole('button', { name: 'Modifier', exact: true }).click();
    const champ = page.getByLabel('Contenu de « Histoire »');
    await champ.press('Control+End');
    await champ.pressSequentially(' [[a');
    const liste = page.getByRole('listbox', { name: 'Fiches à lier' });
    await liste.waitFor();
    await liste.getByRole('option').nth(1).waitFor();
    await page.waitForTimeout(600);
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      const cibles = [...document.querySelectorAll('[role=listbox] [role=option]')].map((e, i) => [`option ${i}`, e] as const);
      for (const b of document.querySelectorAll('button')) if (b.textContent?.trim() === 'Enregistrer') cibles.push(['Enregistrer', b]);
      for (const [nom, e] of cibles) {
        const r = e.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const top = document.elementFromPoint(x, y);
        if (y < 0 || y > innerHeight || !top || !(e === top || e.contains(top))) out.push(`${nom} @${Math.round(x)},${Math.round(y)} recouvert par ${top?.tagName}.${top?.className} ${top?.getAttribute('aria-label') ?? ''}`);
      }
      const asst = document.querySelector('.asst-bouton')?.getBoundingClientRect();
      if (asst) for (const [nom, e] of cibles) {
        const r = e.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight && r.left < asst.right && r.right > asst.left && r.top < asst.bottom && r.bottom > asst.top) out.push(`${nom} intersecte le bouton de l'assistant`);
      }
      return out;
    });
    await page.screenshot({ path: `/tmp/liens-ecran-mep-${l}-${th}.png` });
    assert.deepEqual(bad, []);
    await ctx.close();
  });
}

for (const th of ['light', 'dark'] as const) {
  test(`Mentionnée dans (390px, ${th}) : chaque raison est sous sa puce, alignée à gauche, jamais seule`, opts, async () => {
    const ctx = await browser.newContext({ storageState: await C.antor.ctx.storageState(), colorScheme: th, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${srv.base}/univers/${lame}/fiche/${id['Maître Aldric']}`);
    await page.waitForLoadState('networkidle');
    const bloc = page.getByRole('region', { name: 'Mentionnée dans' });
    await bloc.waitFor();
    await bloc.scrollIntoViewIfNeeded();
    const rows = await page.evaluate(() => [...document.querySelectorAll('.bloc-mentions .mention')].map((li) => {
      const j = li.querySelector('a')!.getBoundingClientRect();
      const p = li.querySelector('.pourquoi')!.getBoundingClientRect();
      return { jg: Math.round(j.left), pg: Math.round(p.left), jb: Math.round(j.bottom), pt: Math.round(p.top), pd: Math.round(p.right), w: innerWidth };
    }));
    assert.ok(rows.length >= 3, `au moins 3 mentions (obtenu ${rows.length})`);
    for (const r of rows) {
      assert.ok(Math.abs(r.jg - r.pg) <= 1, `raison alignée sur sa puce ${JSON.stringify(r)}`);
      assert.ok(r.pt >= r.jb, `raison sous sa puce ${JSON.stringify(r)}`);
      assert.ok(r.pd <= r.w, `raison dans l'écran ${JSON.stringify(r)}`);
    }
    await page.screenshot({ path: `/tmp/liens-ecran-mep-mentions-390-${th}.png` });
    await ctx.close();
  });
}
