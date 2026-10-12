// Browser checks of the E-18 / E-9 alignment on the mock-ups (docs/maquettes/e18-acces-api.html, e09-fiche-importee.html).
//
// TEST PLAN
//   E-18 à plat   : Jetons and Lots sections are not cards (no .panneau); a token row has a transparent background
//   lot replié    : the « N refusées » count is in the danger colour, the « Clos » pill carries an icon
//   E-9 menu ⋯    : « Importée · clé … · créée le … » holds on one line (desktop), clé not split from its « · »
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JETON_BOUCHON } from '../bouchon/depart.js';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let ficheId = 0;

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

test('E-18 : sections à plat, refusées en rouge, pastille Clos avec icône', opts, async () => {
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

test('E-18 : la clé d’un jeton est dans une tuile 28 px bordée, estompée si révoqué', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  const tuile = antor.locator('.jeton .ic-ligne').first();
  await tuile.waitFor();
  const t = await tuile.evaluate((e: Element) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return { w: r.width, h: r.height, ombre: c.boxShadow, fond: c.backgroundColor }; });
  assert.equal(Math.round(t.w), 28);
  assert.equal(Math.round(t.h), 28);
  assert.notEqual(t.ombre, 'none');
  assert.notEqual(t.fond, 'rgba(0, 0, 0, 0)', 'un jeton actif a une tuile pleine');
});

test('E-18 : au téléphone la clé d’origine d’un lot déplié reste entière', opts, async () => {
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

test('E-9 : la ligne « Importée » du menu ⋯ tient sur une ligne', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/fiche/${ficheId}`);
  await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  const ligne = antor.locator('.info-fiche span').first();
  await ligne.waitFor();
  assert.match(await ligne.innerText(), /^Importée · clé\s+lieu:port-sel\s+· créée le/);
  const { h, lh } = await ligne.evaluate((e: Element) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) }));
  assert.ok(h <= lh * 1.2, `ligne sur plusieurs lignes: ${h} > ${lh}`);
});

test('E-9 : au téléphone le menu ⋯ garde 12 px de marge de chaque côté', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/fiche/${ficheId}`);
  await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  const menu = antor.locator('.menu:has(.info-fiche)');
  await menu.waitFor();
  const r = await menu.evaluate((e: Element) => e.getBoundingClientRect().toJSON());
  assert.ok(r.left >= 12 && r.right <= 390 - 12, `menu sans marge de 12 px: ${r.left}..${r.right}`);
});

test('E-18 : boîte du jeton montré — nom, valeur seule, encadré d’avertissement avec icône, Copier avant « J’ai copié »', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('button', { name: /Nouveau jeton/ }).first().click();
  const boite = antor.getByRole('dialog');
  await boite.getByRole('textbox', { name: /Nom/ }).fill('Script boîte');
  await boite.getByRole('button', { name: 'Créer le jeton' }).click();
  const face = antor.locator('.face-jeton');
  await face.waitFor();
  assert.equal((await face.locator('.lib').innerText()).trim(), 'Script boîte');
  const valeur = face.locator('code.valeur');
  const v = await valeur.evaluate((e: Element) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, lh: parseFloat(getComputedStyle(e).lineHeight) }; });
  assert.ok(v.h <= v.lh * 1.2 + 14, `valeur sur plusieurs lignes: ${v.h}`);
  assert.equal(await face.locator('.unefois svg').count(), 1, 'encadré avec icône');
  assert.match(await face.locator('.unefois').innerText(), /Il ne sera plus jamais affiché/);
  const fond = await face.locator('.unefois').evaluate((e: Element) => getComputedStyle(e).backgroundColor);
  assert.notEqual(fond, 'rgba(0, 0, 0, 0)', 'encadré avec fond');
  const noms = await face.locator('.boite-actions button').allInnerTexts();
  assert.deepEqual(noms.map((n: string) => n.trim()), ['Copier', 'J’ai copié le jeton']);
  assert.equal(await face.locator('.boite-actions button').first().locator('svg').count(), 1, 'Copier porte son icône');
  await face.getByRole('button', { name: 'J’ai copié le jeton' }).click();
});

test('E-18 : « Révoqué » en teinte danger, mentions d’une ligne séparées par « · »', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  const ligne = antor.locator('li[data-jeton="Script boîte"]');
  await ligne.waitFor();
  const sep = await ligne.locator('.meta > span').evaluateAll((els: Element[]) => els.map((e) => getComputedStyle(e, '::after').content));
  assert.ok(sep.length >= 2);
  assert.deepEqual(sep.slice(0, -1), sep.slice(0, -1).map(() => '"·"'), 'un « · » après chaque mention sauf la dernière');
  assert.equal(sep[sep.length - 1], 'none');
  await ligne.getByRole('button', { name: /Révoquer/ }).click();
  await antor.getByRole('alertdialog').getByRole('button', { name: 'Révoquer le jeton' }).click();
  const rev = ligne.locator('.pastille', { hasText: 'Révoqué' });
  await rev.waitFor();
  const couleur = (sel: Any) => sel.evaluate((e: Element) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor]; });
  const [rc, rf] = await couleur(rev);
  const [nc, nf] = await couleur(antor.locator('.pastille', { hasText: 'Clos' }).first());
  assert.notEqual(rc, nc, 'texte Révoqué ≠ pastille neutre');
  assert.notEqual(rf, nf, 'fond Révoqué ≠ pastille neutre');
  const danger = await antor.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--danger)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  assert.equal(rc, danger, 'Révoqué utilise --danger');
});

test('E-18 : lot déplié — les raisons des refus partagent la même abscisse (grille de la maquette)', opts, async () => {
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

test('E-18 : au téléphone les mentions d’un jeton sont en colonne, sans « · » pendant', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  const meta = antor.locator('.jeton .meta').first();
  await meta.waitFor();
  assert.equal(await meta.evaluate((e: Element) => getComputedStyle(e).flexDirection), 'column');
  const m = await meta.locator('> span').evaluateAll((els: Element[]) => els.map((e) => ({ after: getComputedStyle(e, '::after').content, top: e.getBoundingClientRect().top, left: e.getBoundingClientRect().left })));
  assert.ok(m.length >= 2, 'au moins deux mentions');
  assert.ok(m.every((x: Any) => x.after === 'none' || x.after === 'normal'), `séparateur rendu: ${JSON.stringify(m)}`);
  assert.ok(m.every((x: Any, i: number) => i === 0 || x.top > m[i - 1].top), 'mentions empilées');
  assert.equal(new Set(m.map((x: Any) => Math.round(x.left))).size, 1, 'mentions alignées à gauche');
});

test('E-18 : boîte « Nouveau jeton » — tuile de clé, titre sans empattement, champs espacés une fois, bascule de durée sans puce cernée', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('button', { name: /Nouveau jeton/ }).first().click();
  const boite = antor.getByRole('dialog');
  await boite.locator('h2').waitFor();
  assert.equal(await boite.locator('.tuile-jeton svg').count(), 1, 'tuile avec l’icône clé');
  const titre = await boite.locator('h2').evaluate((e: Element) => getComputedStyle(e).fontFamily);
  assert.ok(!/Fraunces|serif/i.test(titre.replace(/sans-serif/gi, '')), `titre en police à empattement : ${titre}`);
  const g = await boite.locator('form').evaluate((f: Element) => {
    const champs = [...f.querySelectorAll('.champ')] as HTMLElement[];
    return { gap: parseFloat(getComputedStyle(f).rowGap), margins: champs.map((c) => parseFloat(getComputedStyle(c).marginBottom) + parseFloat(getComputedStyle(c).marginTop)) };
  });
  assert.equal(g.gap, 16, 'écart de 16 px de la maquette');
  assert.ok(g.margins.every((m: number) => m === 0), `marges de champ en plus du gap : ${g.margins}`);
  const choisi = boite.locator('.segments label:has(input:checked)');
  const c = await choisi.evaluate((e: Element) => {
    const s = getComputedStyle(e);
    return { fond: s.backgroundColor, ombre: s.boxShadow, rayon: parseFloat(s.borderTopLeftRadius), h: e.getBoundingClientRect().height };
  });
  assert.notEqual(c.fond, 'rgba(0, 0, 0, 0)', 'segment choisi plein');
  assert.ok(c.ombre.includes('1px'), `segment choisi sans cerne : ${c.ombre}`);
  assert.equal(c.h, 28);
  assert.ok(c.rayon < 14, `puce arrondie (${c.rayon}px)`);
  await boite.getByRole('button', { name: /Annuler/ }).click();
});

test('E-9 : le menu ⋯ est à l’extrémité droite de l’en-tête et ne recouvre pas le titre', opts, async () => {
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
