// ecrans: acces-api, fiche
// Browser checks of the E-18 / E-9 alignment on the mock-ups (docs/maquettes/e18-acces-api.html, e09-fiche-importee.html).
//
// TEST PLAN
//   E-18 à plat   : the Lots section is not a card (no .panneau)
//   lot replié    : the « N refusées » count is in the danger colour, the « Clos » pill carries an icon
//   E-9 menu ⋯    : « Importée · clé … · créée le … » holds on one line (desktop), clé not split from its « · »
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JETON_BOUCHON } from '../bouchon/depart.js';
import { type Any, avecServeur, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let ficheId = 0;

// Every test body runs under the server's watch: a server that dies mid-file fails the running test at once,
// with its exit (code or signal) and the tail of its output, instead of a mute 30 s page timeout.
const cas = (nom: string, o: typeof opts, corps: () => Promise<void>) => test(nom, o, () => avecServeur(srv, corps));

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  const us = await (await antor.request.get('/api/univers')).json();
  uid = us.find((u: Any) => u.nom === 'Essai Kanka').id;
  const base = `/api/import/v1/univers/${uid}`;
  const h = { authorization: `Bearer ${JETON_BOUCHON}` };
  const lot = (await (await fetch(srv.base + base + '/lots', { method: 'POST', headers: h })).json()).lotId;
  const put = (cle: string, body: unknown) =>
    fetch(`${srv.base}${base}/fiches/${encodeURIComponent(cle)}?lot=${lot}`, { method: 'PUT', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ok = await put('lieu:port-sel', { type: 'lieu', titre: 'Port-Sel', sections: [{ cle: 'desc', titre: 'Description', contenu: 'Un port.', joueursLisent: true }] });
  assert.equal(ok.status, 200);
  for (const k of ['compte-rendu:seance-1', 'monstre:x', 'mauvais:c']) await put(k, { type: 'inconnu', titre: 'x' });
  await fetch(`${srv.base}${base}/lots/${lot}/clore`, { method: 'POST', headers: h });
  const fiches = (await (await antor.request.get(`/api/univers/${uid}/fiches`)).json()).fiches;
  ficheId = fiches.find((f: Any) => f.titre === 'Port-Sel').id;
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

cas('E-18 : sections à plat, refusées en rouge, pastille Clos avec icône', opts, async () => {
  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('heading', { name: 'Lots d’import' }).waitFor();
  assert.equal(await antor.locator('.page-acces-api .panneau').count(), 0);
  const refus = antor.locator('.compteurs .refus-n').first();
  await refus.waitFor();
  assert.match(await refus.innerText(), /refusée/);
  const rouge = await refus.evaluate((e: Element) => getComputedStyle(e).color);
  const gris = await antor.locator('.compteurs').first().evaluate((e: Element) => getComputedStyle(e).color);
  assert.notEqual(rouge, gris);
  const pastilleClos = antor.locator('.pastille', { hasText: 'Clos' }).first();
  await pastilleClos.waitFor();
  assert.equal(await pastilleClos.locator('svg').count(), 1, 'la pastille Clos porte une icône');
});

cas('E-18 : au téléphone la clé d’origine d’un lot déplié reste entière', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('heading', { name: 'Lots d’import' }).waitFor();
  await antor.locator('.lot-tete').first().click();
  const cle = antor.locator('.probleme .cle', { hasText: 'compte-rendu:seance-1' }).first();
  await cle.waitFor();
  const { h, lh, w, sw } = await cle.evaluate((e: Element) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight), w: e.getBoundingClientRect().width, sw: e.scrollWidth }));
  assert.ok(h <= lh * 1.2, `clé coupée sur plusieurs lignes: ${h} > ${lh}`);
  assert.ok(sw <= Math.ceil(w), 'clé tronquée');
});

cas('E-9 : la ligne « Importée » du menu ⋯ tient sur une ligne', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/fiche/${ficheId}`);
  await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  const ligne = antor.locator('.info-fiche span').first();
  await ligne.waitFor();
  assert.match(await ligne.innerText(), /^Importée · créée le/);
  const { h, lh } = await ligne.evaluate((e: Element) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) }));
  assert.ok(h <= lh * 1.2, `ligne sur plusieurs lignes: ${h} > ${lh}`);
});

cas('E-9 : au téléphone le menu ⋯ garde 12 px de marge de chaque côté', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/fiche/${ficheId}`);
  await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  const menu = antor.locator('.menu:has(.info-fiche)');
  await menu.waitFor();
  const r = await menu.evaluate((e: Element) => e.getBoundingClientRect().toJSON());
  assert.ok(r.left >= 12 && r.right <= 390 - 12, `menu sans marge de 12 px: ${r.left}..${r.right}`);
});

cas('E-18 : lot déplié — les raisons des refus partagent la même abscisse (grille de la maquette)', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('heading', { name: 'Lots d’import' }).waitFor();
  await antor.locator('.lot-tete').first().click();
  const lignes = antor.locator('.probleme.refus');
  await lignes.first().waitFor();
  const mesures = await lignes.evaluateAll((els: Element[]) => els.map((e) => ({
    texte: (e.querySelector('.cle') as HTMLElement).innerText,
    cleLeft: e.querySelector('.cle')!.getBoundingClientRect().left,
    raisonLeft: e.querySelector('.raison')!.getBoundingClientRect().left,
  })));
  assert.ok(mesures.length >= 3, `3 refus attendus, ${mesures.length} lus`);
  assert.ok(new Set(mesures.map((m: Any) => m.texte.length)).size > 1, 'clés de longueurs différentes');
  assert.equal(new Set(mesures.map((m: Any) => Math.round(m.cleLeft))).size, 1, 'clés alignées à gauche');
  assert.equal(new Set(mesures.map((m: Any) => Math.round(m.raisonLeft))).size, 1,
    `raisons non alignées : ${JSON.stringify(mesures.map((m: Any) => m.raisonLeft))}`);
});

cas('E-9 : le menu ⋯ est à l’extrémité droite de l’en-tête et ne recouvre pas le titre', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/fiche/${ficheId}`);
  const bouton = antor.getByRole('button', { name: /^Autres actions sur/ }).first();
  await bouton.waitFor();
  const r = await bouton.evaluate((e: Element) => {
    const tete = e.closest('.tete-ligne')!.getBoundingClientRect();
    const b = e.getBoundingClientRect();
    return { droite: tete.right - b.right, titre: (() => { const h = document.querySelector('h1')!; const rg = document.createRange(); rg.selectNodeContents(h); return rg.getBoundingClientRect().toJSON(); })() };
  });
  assert.ok(r.droite >= 0 && r.droite <= 8, `bouton à ${r.droite}px du bord droit de l’en-tête`);
  await bouton.click();
  const menu = antor.locator('.menu:has(.info-fiche)');
  await menu.waitFor();
  const m = await menu.evaluate((e: Element) => e.getBoundingClientRect().toJSON());
  const bb = await bouton.evaluate((e: Element) => e.getBoundingClientRect().toJSON());
  assert.ok(Math.abs(m.right - bb.right) <= 2, `menu non aligné sur le bord droit du bouton : ${m.right} vs ${bb.right}`);
  const h1 = r.titre;
  const recouvre = m.left < h1.right && m.right > h1.left && m.top < h1.bottom && m.bottom > h1.top;
  assert.ok(!recouvre, `le menu recouvre le texte du titre : menu ${m.left}..${m.right}, titre ${h1.left}..${h1.right}`);
  await antor.keyboard.press('Escape');
});
