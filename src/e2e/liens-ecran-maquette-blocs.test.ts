// Independent layout checks of the « Mentionnée dans » block and of the open « [[ » list, written from
// docs/maquettes/e09-fiche-importee.html (rules `.blocs-fiche` / `.bloc-fiche` / `.mentions`) and from E-9, not from the code.
//
// TEST PLAN
//   nominal    : Léa on « Maître Aldric »: the label sits left of the rows (desktop) or above them (phone), as in the mockup;
//                exactly one solid rule above the block (never the double rule)
//   bords      : phone 390: label above the rows, nothing wider than the viewport; Antor in the editor of « Histoire » with
//                the « [[ » list open: scrolled to the very bottom, « Enregistrer » and « Annuler » are not under the assistant
//                button, and the button does not hide any option of the list when the list is in view
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';
import { comptes } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;
let lame = 0;
let portSel = 0;
let aldric = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  C = await comptes(srv, browser);
  const r = await C.antor.ctx.request.get('/api/univers');
  lame = ((await r.json()) as { id: number; nom: string }[]).find((u) => u.nom === "Lame d'Ébène")!.id;
  const l = await (await C.antor.ctx.request.get(`/api/univers/${lame}/fiches?q=Port-Sel`)).json();
  portSel = l.fiches.find((f: Any) => f.titre === 'Port-Sel').id;
  const al = await (await C.antor.ctx.request.get(`/api/univers/${lame}/fiches?q=${encodeURIComponent('Maître Aldric')}`)).json();
  aldric = al.fiches.find((f: Any) => f.titre === 'Maître Aldric').id;
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test(`« Mentionnée dans » comme la maquette (${w}px) : étiquette ${w > 1000 ? 'à gauche' : 'au-dessus'} des lignes, un seul filet plein, rien ne déborde`, opts, async () => {
    const ctx = await browser.newContext({ storageState: await C.lea.ctx.storageState(), viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(`${srv.base}/univers/${lame}/fiche/${aldric}`);
    await page.waitForLoadState('networkidle');
    const m = page.getByRole('region', { name: 'Mentionnée dans' });
    await m.waitFor();
    const g = await m.evaluate((el: Element) => {
      const r = el.getBoundingClientRect();
      const lib = el.querySelector('h2,h3')!.getBoundingClientRect();
      const ligne = el.querySelector('li a')!.getBoundingClientRect();
      const art = (el.closest('article') ?? el.closest('main')!).getBoundingClientRect();
      // solid, wide, horizontal rules drawn between the last section's text and the end of the block
      const sec = [...document.querySelectorAll('section.sec')].pop()!;
      const haut = (sec.querySelector('p') ?? sec).getBoundingClientRect().bottom;
      const filets: string[] = [];
      for (const e of document.querySelectorAll('main *')) {
        const er = e.getBoundingClientRect();
        if (er.width < art.width * 0.5 || er.height === 0) continue;
        const cs = getComputedStyle(e);
        if (cs.borderTopWidth !== '0px' && cs.borderTopStyle === 'solid' && er.top >= haut - 1 && er.top <= r.bottom) filets.push(`top ${e.tagName}.${e.className}`);
        if (cs.borderBottomWidth !== '0px' && cs.borderBottomStyle === 'solid' && er.bottom >= haut - 1 && er.bottom <= r.bottom + 1) filets.push(`bottom ${e.tagName}.${e.className}`);
      }
      return { libDroite: lib.right, libBas: lib.bottom, libHaut: lib.top, ligneGauche: ligne.left, ligneHaut: ligne.top,
        debord: document.documentElement.scrollWidth > innerWidth, filets };
    });
    assert.equal(g.debord, false, 'rien ne dépasse la largeur de l’écran');
    if (w > 1000) {
      assert.ok(g.libDroite <= g.ligneGauche, `étiquette à gauche des lignes ${JSON.stringify(g)}`);
      assert.ok(Math.abs(g.libHaut - g.ligneHaut) < 24, 'étiquette et première ligne sur la même rangée');
    } else {
      assert.ok(g.libBas <= g.ligneHaut + 4, `étiquette au-dessus des lignes sur téléphone ${JSON.stringify(g)}`);
    }
    assert.equal(g.filets.length, 1, `exactement un filet plein au-dessus du bloc, obtenu ${JSON.stringify(g.filets)}`);
    await page.screenshot({ path: `/tmp/liens-ecran-maquette-blocs-${w}.png`, fullPage: true });
    await ctx.close();
  });
}

test('liste [[ ouverte, « Enregistrer » amené à l’écran (390px) : « Enregistrer » et « Annuler » libres, bouton de l’assistant ne cache aucune ligne visible', opts, async () => {
  const ctx = await browser.newContext({ storageState: await C.antor.ctx.storageState(), viewport: { width: 390, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(`${srv.base}/univers/${lame}/fiche/${portSel}`);
  await page.waitForLoadState('networkidle');
  const sec = page.locator('section.sec').filter({ has: page.getByRole('heading', { name: 'Histoire', exact: true }) }).last();
  await sec.getByRole('button', { name: 'Modifier', exact: true }).click();
  const champ = page.getByLabel('Contenu de « Histoire »');
  await champ.press('Control+End');
  await champ.pressSequentially(' [[');
  const liste = page.getByRole('listbox', { name: 'Fiches à lier' });
  await liste.waitFor();
  await liste.getByRole('option').nth(1).waitFor();
  await page.waitForTimeout(600);
  // a user brings the buttons into view the way the browser does when one tabs to them: the bottom of the page
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const ab = [...document.querySelectorAll('button')].find((b) => /Demander à Kanevas/.test(b.textContent ?? '') || b.getAttribute('aria-label') === 'Demander à Kanevas');
    const asst = ab?.getBoundingClientRect();
    if (!asst) return ['bouton de l’assistant introuvable'];
    for (const b of document.querySelectorAll('button')) {
      const t = b.textContent?.trim();
      if (t === 'Enregistrer' || t === 'Annuler') {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.left < asst.right && r.right > asst.left && r.top < asst.bottom && r.bottom > asst.top) out.push(`${t} sous le bouton de l'assistant`);
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!(top === b || b.contains(top))) out.push(`${t} recouvert par ${top?.tagName}`);
      }
    }
    const lb = document.querySelector('[role=listbox]')?.getBoundingClientRect();
    // the list scrolls inside itself: an option scrolled out of it is clipped, so it is not visible under the button
    [...document.querySelectorAll('[role=listbox] [role=option]')].forEach((o, i) => { const r = o.getBoundingClientRect(); if (lb && (r.bottom > lb.bottom || r.top < lb.top)) return; if (r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.left < asst.right && r.right > asst.left && r.top < asst.bottom && r.bottom > asst.top) out.push(`option ${i} sous le bouton de l'assistant`); });
    return out;
  });
  await page.screenshot({ path: '/tmp/liens-ecran-maquette-bas-390.png' });
  assert.deepEqual(bad, []);
  await ctx.close();
});
