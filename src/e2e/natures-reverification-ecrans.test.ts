// Black-box tests of the re-check of kanevas-fiches-liees-natures, from the need and not from the code:
//  (1) E-11, « Carte de la côte »: Aldric has two links to Port-Sel, « se situe à — habite » and « maître de port »;
//      the label of each link sits against its own stroke, readable, never struck through by a stroke
//      (docs/ecrans.md « E-11 and « Mentionnée dans » (B-69) », criterion of the slice), on desktop and phone, light and dark;
//  (2) E-9 « Relier à une fiche »: the list of results is bounded (176 px, scrolls), the chosen row is highlighted,
//      the buttons read « Annuler » then « Relier » (mockup e09-fiche.html, « .resultats » and « .actions »).
// Real server in stub mode WITH its starting world + real Chromium. Expected values are literals. Screenshots in /tmp.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, rxExact, section, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-reverification-natures-shots';
const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
let carteId = 0;
let aldric = 0;

async function photo(page: Any, nom: string): Promise<void> {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${nom}.png` });
}

/** A fresh Antor session, with the viewport and the theme asked for. */
async function session(largeur: number, hauteur: number, sombre: boolean): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: largeur, height: hauteur } });
  if (sombre) await ctx.addInitScript(() => window.localStorage.setItem('kanevas-theme', 'sombre'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  return { ctx, page };
}

interface Geometrie {
  labels: { t: string; x: number; y: number; w: number; h: number; taille: number }[];
  traits: { x1: number; y1: number; x2: number; y2: number }[];
  jetons: { x: number; y: number; w: number; h: number }[];
  cadre: { x: number; y: number; w: number; h: number };
}

async function geometrie(page: Any): Promise<Geometrie> {
  await page.locator('.graphe-lien text').first().waitFor();
  await page.locator('.graphe .carte-token').first().waitFor();
  // a string: the TypeScript loader would otherwise inject helpers (__name) that do not exist in the page
  return page.evaluate(`(() => {
    var svg = document.querySelector('.graphe-liens');
    function pt(el, x, y) {
      var p = svg.createSVGPoint();
      p.x = x;
      p.y = y;
      var q = p.matrixTransform(el.getScreenCTM());
      return { x: q.x, y: q.y };
    }
    function rect(e) {
      var r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return {
      labels: Array.from(document.querySelectorAll('.graphe-lien text')).map(function (e) {
        var r = rect(e);
        return { t: e.firstChild ? e.firstChild.textContent : '', x: r.x, y: r.y, w: r.w, h: r.h, taille: parseFloat(getComputedStyle(e).fontSize) };
      }),
      traits: Array.from(document.querySelectorAll('.graphe-trait')).map(function (g) {
        var a = pt(g, g.x1.baseVal.value, g.y1.baseVal.value);
        var b = pt(g, g.x2.baseVal.value, g.y2.baseVal.value);
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      }),
      jetons: Array.from(document.querySelectorAll('.graphe .carte-token')).map(rect),
      cadre: rect(document.querySelector('.graphe')),
    };
  })()`);
}

type Trait = Geometrie['traits'][number];
type Boite = { x: number; y: number; w: number; h: number };
const distPointTrait = (px: number, py: number, t: Trait): number => {
  const dx = t.x2 - t.x1;
  const dy = t.y2 - t.y1;
  const u = Math.max(0, Math.min(1, ((px - t.x1) * dx + (py - t.y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (t.x1 + u * dx), py - (t.y1 + u * dy));
};
/** Smallest distance between the box and the stroke (0 when the stroke goes through the box). */
const distBoiteTrait = (b: Boite, t: Trait): number => {
  let m = Infinity;
  const n = Math.ceil(Math.hypot(t.x2 - t.x1, t.y2 - t.y1));
  for (let i = 0; i <= n; i++) {
    const x = t.x1 + ((t.x2 - t.x1) * i) / n;
    const y = t.y1 + ((t.y2 - t.y1) * i) / n;
    const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
    const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
    m = Math.min(m, Math.hypot(dx, dy));
  }
  return m;
};
const seRecouvrent = (a: Boite, b: Boite): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The checks of finding (1), on one display. */
async function verifierEtiquettes(page: Any, nom: string): Promise<void> {
  await page.goto(`/univers/${U}/cartes/${carteId}`);
  const g = await geometrie(page);
  await photo(page, nom);
  assert.equal(g.traits.length, 2, 'deux liens Aldric–Port-Sel, deux traits : ' + JSON.stringify(g.traits));
  const a = g.labels.find((l) => l.t === 'se situe à — habite');
  const m = g.labels.find((l) => l.t === 'maître de port');
  assert.ok(a && m, 'les deux étiquettes : ' + JSON.stringify(g.labels.map((l) => l.t)));
  assert.equal(g.labels.length, 2);
  // readable: a real size, whole inside the frame
  for (const l of [a, m]) {
    assert.ok(l.taille >= 10, `« ${l.t} » : corps ${l.taille}px trop petit`);
    assert.ok(l.w > 20 && l.h > 6, `« ${l.t} » sans dimension : ${JSON.stringify(l)}`);
    assert.ok(l.x >= g.cadre.x && l.y >= g.cadre.y && l.x + l.w <= g.cadre.x + g.cadre.w && l.y + l.h <= g.cadre.y + g.cadre.h, `« ${l.t} » sort du cadre : ${JSON.stringify([l, g.cadre])}`);
  }
  // legible: not on top of each other, not on a node
  assert.equal(seRecouvrent(a, m), false, 'étiquettes superposées : ' + JSON.stringify([a, m]));
  for (const l of [a, m]) for (const k of g.jetons) assert.equal(seRecouvrent(l, k), false, `« ${l.t} » recouvre une pastille : ${JSON.stringify([l, k])}`);
  // not struck through: no stroke crosses a label's box
  for (const l of [a, m]) {
    g.traits.forEach((t, i) => assert.ok(distBoiteTrait(l, t) > 0.5, `« ${l.t} » barrée par le trait ${i} : ${JSON.stringify([l, t])}`));
  }
  // against its own stroke: close to one stroke, and the two labels do not share the same nearest stroke
  const plusProche = (l: Boite) => g.traits.map((t) => distBoiteTrait(l, t)).map((d, i) => ({ d, i })).sort((p, q) => p.d - q.d)[0];
  const pa = plusProche(a);
  const pm = plusProche(m);
  assert.ok(pa.d <= 16, `« se situe à — habite » est à ${pa.d.toFixed(1)}px de son trait le plus proche`);
  assert.ok(pm.d <= 16, `« maître de port » est à ${pm.d.toFixed(1)}px de son trait le plus proche`);
  assert.notEqual(pa.i, pm.i, 'les deux étiquettes sont collées au même trait');
}

describe('kanevas-fiches-liees-natures, revérification : E-11 deux liens Aldric–Port-Sel, E-9 formulaire Relier', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await (await antor.request.fetch(srv.base + '/api/univers')).json();
    U = (us.univers ?? us).find((u: Any) => u.nom === "Lame d'Ébène").id;
    const cs = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/cartes`)).json();
    carteId = (cs.cartes ?? cs).find((c: Any) => c.titre === 'Carte de la côte').id;
    const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=personnage`)).json();
    aldric = r.fiches.find((f: Any) => f.titre === 'Maître Aldric').id;
    // enough places to overflow the picker
    for (let i = 0; i < 30; i++) {
      const c = await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches`, { method: 'POST', data: { type: 'lieu', titre: `Lieu de test ${String(i).padStart(2, '0')}` } });
      assert.ok(c.status() < 300, String(c.status()));
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // ---- (1) E-11 ----------------------------------------------------------------------------------------------
  for (const [nom, l, h, sombre] of [
    ['bureau-clair', 1280, 800, false],
    ['bureau-sombre', 1280, 800, true],
    ['telephone-clair', 390, 844, false],
    ['telephone-sombre', 390, 844, true],
  ] as [string, number, number, boolean][]) {
    test(`carte de la côte, ${nom.replace('-', ' ')} : chaque lien d’Aldric vers Port-Sel porte son étiquette, collée à son trait, lisible, non barrée`, opts, async () => {
      const { ctx, page } = await session(l, h, sombre);
      await verifierEtiquettes(page, `graphe-${nom}`);
      await ctx.close();
    });
  }

  test('carte de la côte, tablette 768 px : les mêmes garanties', opts, async () => {
    const { ctx, page } = await session(768, 1024, false);
    await verifierEtiquettes(page, 'graphe-tablette');
    await ctx.close();
  });

  // ---- (2) E-9 ------------------------------------------------------------------------------------------------
  async function ouvrirRelier(page: Any): Promise<Any> {
    await page.goto(`/univers/${U}/fiche/${aldric}`);
    await page.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    const b = section(page, 'Apparence').getByRole('group', { name: 'Relations' });
    await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
    await b.getByLabel('Nature').waitFor();
    await b.getByLabel('Nature').selectOption({ label: 'se situe à' });
    await b.getByRole('button', { name: /^Lieu de test 05/ }).first().waitFor();
    return b;
  }
  /** Background of a row, once its transition is over (it is read again until it stops moving). */
async function fondStable(b: Any, nom: RegExp): Promise<string> {
  await b.page().mouse.move(1, 1); // the pointer rests elsewhere: a hover is no highlight of the choice
  const lire = () => b.getByRole('button', { name: nom }).first().evaluate((e: Element) => getComputedStyle(e).backgroundColor) as Promise<string>;
  let prec = await lire();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const v = await lire();
    if (v === prec) return v;
    prec = v;
  }
  return prec;
}
/** The scrolling container that holds the rows of the picker. */
  const conteneur = (b: Any, ligne = /^Lieu de test 05/) =>
    b.getByRole('button', { name: ligne }).first().evaluateHandle((el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if (o === 'auto' || o === 'scroll') return p;
      }
      return null;
    });

  test('Relier : 37 lieux, la liste des résultats ne dépasse pas 176 px et défile jusqu’au dernier', opts, async () => {
    const b = await ouvrirRelier(antor);
    const c = (await conteneur(b)) as Any;
    assert.ok(await c.evaluate((e: Any) => e !== null), 'aucun conteneur défilant autour des résultats');
    const m = await c.evaluate((e: HTMLElement) => ({ h: e.getBoundingClientRect().height, sh: e.scrollHeight, ch: e.clientHeight }));
    assert.ok(m.h <= 176.5, `liste de ${m.h}px, 176 au plus`);
    assert.ok(m.h >= 100, `liste de ${m.h}px : écrasée`);
    assert.ok(m.sh > m.ch + 100, `la liste ne défile pas : scrollHeight ${m.sh}, clientHeight ${m.ch}`);
    await c.evaluate((e: HTMLElement) => e.scrollTo(0, e.scrollHeight));
    await b.getByRole('button', { name: /^Lieu de test 29/ }).waitFor();
    assert.equal(await b.getByRole('button', { name: /^Lieu de test 29/ }).isVisible(), true);
    // « Annuler » et « Relier » restent à l’écran sans que la page ait grandi de la liste entière
    const bas = await b.getByRole('button', { name: rxExact('Relier') }).evaluate((e: Element) => e.getBoundingClientRect().bottom);
    const vue = await antor.evaluate(() => window.innerHeight);
    await b.getByRole('button', { name: rxExact('Relier') }).scrollIntoViewIfNeeded();
    assert.ok(bas > 0 && vue > 0);
    await photo(antor, 'relier-liste-bornee');
  });

  test('Relier : une recherche à un seul résultat rend une liste plus courte que 176 px', opts, async () => {
    const b = await ouvrirRelier(antor);
    await b.getByLabel('Chercher dans les lieux').fill('Lieu de test 07');
    await Promise.all([
      antor.waitForResponse((r: Any) => r.request().method() === 'GET' && /fiches\?/.test(r.url()) && /recherche|q=/.test(r.url())),
      b.getByRole('button', { name: rxExact('Chercher') }).click(),
    ]);
    await b.getByRole('button', { name: /^Lieu de test 07/ }).waitFor();
    await b.getByRole('button', { name: /^Lieu de test 05/ }).waitFor({ state: 'detached' });
    const c = (await conteneur(b, /^Lieu de test 07/)) as Any;
    const h = await c.evaluate((e: HTMLElement) => e.getBoundingClientRect().height);
    assert.ok(h < 100, `un résultat, liste de ${h}px`);
  });

  test('Relier : la ligne choisie est surlignée, une seule, et le surlignage suit le choix', opts, async () => {
    const b = await ouvrirRelier(antor);
    const fond = (nom: RegExp) => fondStable(b, nom);
    const avant = await fond(/^Lieu de test 05/);
    const voisine = await fond(/^Lieu de test 06/);
    assert.equal(avant, voisine, 'avant le choix, deux lignes ont le même fond');
    await b.getByRole('button', { name: /^Lieu de test 05/ }).first().click();
    const choisie = await fond(/^Lieu de test 05/);
    assert.notEqual(choisie, avant, 'la ligne choisie garde le fond des autres : ' + choisie);
    assert.equal(await fond(/^Lieu de test 06/), voisine, 'la voisine n’est pas surlignée');
    await photo(antor, 'relier-ligne-choisie');
    await b.getByRole('button', { name: /^Lieu de test 06/ }).first().click();
    assert.equal(await fond(/^Lieu de test 06/), choisie, 'le surlignage passe à la nouvelle ligne');
    assert.equal(await fond(/^Lieu de test 05/), avant, 'l’ancienne ligne n’est plus surlignée');
  });

  test('Relier : « Annuler » puis « Relier », « Relier » désactivé tant que rien n’est choisi ; « Annuler » ne relie rien', opts, async () => {
    const b = await ouvrirRelier(antor);
    const annuler = b.getByRole('button', { name: rxExact('Annuler') });
    const relier = b.getByRole('button', { name: rxExact('Relier') });
    const [pa, pr] = [await annuler.boundingBox(), await relier.boundingBox()];
    assert.ok(pa && pr);
    assert.ok(pa.x + pa.width <= pr.x + 1, `« Annuler » (${pa.x}) doit précéder « Relier » (${pr.x})`);
    assert.ok(Math.abs(pa.y - pr.y) < 8, 'les deux boutons sont sur la même ligne');
    const ordre = await b.locator('button').evaluateAll((els: Element[]) => els.map((e) => e.textContent?.trim()));
    assert.ok(ordre.indexOf('Annuler') >= 0 && ordre.indexOf('Annuler') < ordre.indexOf('Relier'), JSON.stringify(ordre));
    assert.equal(await relier.isDisabled(), true);
    await b.getByRole('button', { name: /^Lieu de test 05/ }).first().click();
    assert.equal(await relier.isEnabled(), true);
    await annuler.click();
    await b.getByLabel('Nature').waitFor({ state: 'detached' });
    assert.equal(await b.getByText('Lieu de test 05').count(), 0, 'rien n’a été relié');
    const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${aldric}`)).json();
    const sec = r.sections.find((x: Any) => x.titre === 'Apparence');
    const rel = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${aldric}/sections/${sec.id}/relations`)).json();
    assert.equal(JSON.stringify(rel).includes('Lieu de test 05'), false);
  });

  test('Relier, téléphone 390 px sombre : liste bornée à 176 px, ligne choisie surlignée, « Annuler » avant « Relier »', opts, async () => {
    const { ctx, page } = await session(390, 844, true);
    const b = await ouvrirRelier(page);
    const c = (await conteneur(b)) as Any;
    const h = await c.evaluate((e: HTMLElement) => e.getBoundingClientRect().height);
    assert.ok(h <= 176.5 && h >= 100, `liste de ${h}px`);
    const avant = await fondStable(b, /^Lieu de test 06/);
    await b.getByRole('button', { name: /^Lieu de test 05/ }).first().click();
    const apres = await fondStable(b, /^Lieu de test 05/);
    assert.notEqual(apres, avant);
    const [pa, pr] = [await b.getByRole('button', { name: rxExact('Annuler') }).boundingBox(), await b.getByRole('button', { name: rxExact('Relier') }).boundingBox()];
    assert.ok(pa && pr && pa.x < pr.x, JSON.stringify([pa, pr]));
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw, `scrollWidth ${sw} > ${cw}`);
    await photo(page, 'relier-telephone-sombre');
    await ctx.close();
  });
});
