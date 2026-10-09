// Black-box tests of kanevas-il-systemes-ecrans, written from docs/ecrans.md « Systèmes de jeu, hors des
// univers » and « E-1 en cartes » (critères), not from the code. Real server in stub mode WITH its starting
// world + real Chromium. Expected values are literals from the doc. Screenshots go to /tmp.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-systemes-shots';
const opts = { skip: skipBrowser, timeout: 90000 };
let srv: Server;
let browser: Any;
let antor: Any, lea: Any, mira: Any, teo: Any;
const ids: Record<string, number> = {};

async function api(page: Any, url: string): Promise<Any> {
  const r = await page.request.fetch(srv.base + url);
  return { statut: r.status(), corps: await r.text() };
}
async function va(page: Any, url: string): Promise<string> {
  await page.goto(url);
  await attendre(page);
  await page.waitForTimeout(400);
  return texte(page);
}
async function cliqueEntete(carte: Any): Promise<void> {
  const b = await carte.locator('.entete-dessin').boundingBox();
  await carte.page().mouse.click(b.x + 40, b.y + 40); // a real pointer: the card's stretched link must catch it
}
const photo = (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png` });

describe('kanevas-il-systemes-ecrans', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    mira = (await connecte(browser, srv.base, 'Mira')).page;
    teo = (await connecte(browser, srv.base, 'Teo')).page;
    const us = await (await antor.request.fetch(srv.base + '/api/univers')).json();
    for (const u of us.univers ?? us) ids[u.nom] = u.id;
    const ss = await (await antor.request.fetch(srv.base + '/api/systemes')).json();
    for (const s of ss.systemes ?? ss) ids[s.nom] = s.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Mira ne voit que son univers sur E-16 et E-15, Lame d’Ébène nulle part', opts, async () => {
    const t = await va(mira, '/systemes');
    assert.match(t, /CoF Mini/);
    assert.match(t, /Utilisé par 2 univers/);
    assert.match(t, /Les Landes grises/);
    assert.doesNotMatch(t, /Lame d'Ébène/);
    await photo(mira, 'mira-e16');
    const t2 = await va(mira, `/systemes/${ids['CoF Mini']}`);
    assert.match(t2, /utilisé par 2 univers/);
    assert.doesNotMatch(t2, /Lame d'Ébène/);
    assert.match(t2, /Les Landes grises/);
  });

  test('Antor ouvre CoF Mini depuis E-16 : fil, barre réduite, item courant', opts, async () => {
    await va(antor, '/systemes');
    await antor.getByRole('link', { name: /CoF Mini/ }).first().click();
    await attendre(antor);
    await antor.getByRole('heading', { level: 1, name: 'CoF Mini' }).waitFor();
    assert.match(antor.url(), new RegExp(`/systemes/${ids['CoF Mini']}`));
    const fil = (await antor.getByRole('navigation', { name: /Fil d.Ariane/ }).innerText()).replace(/\s+/g, ' ');
    assert.match(fil, /Systèmes de jeu CoF Mini/);
    const courant = antor.locator('[aria-current="page"]');
    assert.match(await courant.allInnerTexts().then((a: string[]) => a.join('|')), /Systèmes de jeu/);
    assert.equal(await antor.getByRole('link', { name: 'Personnages' }).count(), 0);
    await photo(antor, 'antor-e15');
  });

  test('Antor : E-3 « Ouvrir le système » mène à E-15, le menu du sélecteur propose Systèmes de jeu', opts, async () => {
    await va(antor, `/univers/${ids["Lame d'Ébène"]}`);
    await antor.getByRole('link', { name: /Ouvrir le système/ }).click();
    await attendre(antor);
    assert.match(antor.url(), new RegExp(`/systemes/${ids['CoF Mini']}$`));
    await va(antor, `/univers/${ids["Lame d'Ébène"]}`);
    await antor.getByRole('button', { name: /Lame d'Ébène/ }).first().click();
    assert.ok(await antor.getByRole('menuitem', { name: /Systèmes de jeu/ }).or(antor.getByRole('link', { name: /^Systèmes de jeu$/ })).first().isVisible());
    await photo(antor, 'antor-selecteur');
  });

  test('Léa : lecture seule, Joueur, aucun geste d’écriture, POST 403', opts, async () => {
    const t = await va(lea, '/systemes');
    assert.match(t, /CoF Mini/);
    assert.match(t, /Lame d'Ébène/);
    assert.match(t, /Joueur/);
    assert.match(t, /Lecture seule/);
    const e = await va(lea, `/systemes/${ids['CoF Mini']}`);
    assert.doesNotMatch(e, /Ajouter une créature/);
    assert.equal(await lea.getByRole('button', { name: /Modifier/ }).count(), 0);
    const r = await lea.request.fetch(`${srv.base}/api/systemes/${ids['CoF Mini']}/gabarits`, { method: 'POST', data: { type: 'creature', nom: 'X', contenu: 'x' } });
    assert.equal(r.status(), 403);
    await photo(lea, 'lea-e15');
  });

  test('Antor : deux systèmes, « Lecture seule » sur le second seulement', opts, async () => {
    await va(antor, '/systemes');
    const cartes = antor.locator('.carte-dessin');
    assert.equal(await cartes.count(), 2);
    const cof = cartes.filter({ hasText: /CoF Mini/ });
    const chro = cartes.filter({ hasText: /Chroniques Oubliées Fantasy/ });
    assert.equal(await chro.filter({ hasText: 'Lecture seule' }).count(), 1);
    assert.equal(await cof.filter({ hasText: 'Lecture seule' }).count(), 0);
    await photo(antor, 'antor-e16');
  });

  test('Teo : E-16 vide, adresse de CoF Mini introuvable, API 404 au corps d’un inconnu', opts, async () => {
    const t = await va(teo, '/systemes');
    assert.match(t, /Aucun système de jeu pour l'instant\./);
    assert.match(t, /Les systèmes de vos univers apparaîtront ici quand leur MJ en rattachera un\./);
    const p = await va(teo, `/systemes/${ids['CoF Mini']}`);
    assert.match(p, /Page introuvable\./);
    assert.ok(await teo.getByRole('link', { name: 'Systèmes de jeu' }).count() > 0);
    const a = await api(teo, `/api/systemes/${ids['CoF Mini']}`);
    const b = await api(teo, '/api/systemes/999999');
    assert.equal(a.statut, 404);
    assert.equal(a.corps, b.corps);
    await photo(teo, 'teo-e16-vide');
  });

  test('ancienne adresse /univers/:id/systeme redirige vers /systemes/:sid ; sinon introuvable', opts, async () => {
    await va(antor, `/univers/${ids["Lame d'Ébène"]}/systeme`);
    assert.match(antor.url(), new RegExp(`/systemes/${ids['CoF Mini']}`));
    const t = await va(teo, `/univers/${ids["Lame d'Ébène"]}/systeme`);
    assert.match(t, /Page introuvable\./);
  });

  test('E-1 : deux cartes par nom, rôle, système, 2 membres ; Teo vide', opts, async () => {
    await va(antor, '/');
    const cartes = antor.locator('.carte-dessin');
    assert.equal(await cartes.count(), 2);
    const t0 = await cartes.nth(0).innerText();
    const t1 = await cartes.nth(1).innerText();
    assert.match(t0, /Lame d'Ébène/); assert.match(t0, /MJ/); assert.match(t0, /CoF Mini/); assert.match(t0, /2 membres/);
    assert.match(t1, /Les Cendres de Vaëlis/); assert.match(t1, /Joueur/); assert.match(t1, /Chroniques Oubliées Fantasy/); assert.match(t1, /2 membres/);
    await photo(antor, 'antor-e1');
    await cartes.nth(0).click();
    await attendre(antor);
    assert.match(antor.url(), new RegExp(`/univers/${ids["Lame d'Ébène"]}$`));
    const t = await va(teo, '/');
    assert.match(t, /Aucun univers pour l'instant\./);
  });

  test('détaché pendant la lecture : Léa voit Page introuvable et le bloc disparaît', opts, async () => {
    await va(lea, `/univers/${ids["Lame d'Ébène"]}`);
    const d2 = await antor.request.fetch(`${srv.base}/api/univers/${ids["Lame d'Ébène"]}/systeme`, { method: 'PUT', data: { systemeId: null } });
    assert.equal(d2.status(), 204);
    await lea.getByRole('link', { name: /Ouvrir le système/ }).click();
    await lea.getByText('Page introuvable.').waitFor();
    assert.ok(await lea.getByRole('link', { name: 'Systèmes de jeu' }).count() > 0);
    const t = await va(lea, `/univers/${ids["Lame d'Ébène"]}`);
    assert.doesNotMatch(t, /Ouvrir le système/);
    const l = await va(lea, '/systemes');
    assert.doesNotMatch(l, /CoF Mini/);
  });


  test('toute la carte mène à sa cible : clic sur l’en-tête dessiné de E-16 et de E-1', opts, async () => {
    await va(antor, '/systemes');
    await cliqueEntete(antor.locator('.carte-dessin').filter({ hasText: /Chroniques/ }));
    await antor.waitForURL(/\/systemes\/\d+$/);
    assert.match(antor.url(), new RegExp(`/systemes/${ids['Chroniques Oubliées Fantasy']}$`));
    await va(antor, '/');
    await cliqueEntete(antor.locator('.carte-dessin').first());
    await antor.waitForURL(/\/univers\/\d+$/);
    assert.match(antor.url(), /\/univers\/\d+$/);
  });

  test('erreur : E-16 et E-1 disent leur message et « Réessayer » relance', opts, async () => {
    for (const [url, api, msg] of [['/systemes', '**/api/systemes', 'Impossible de charger les systèmes de jeu.'], ['/', '**/api/univers', 'Impossible de charger vos univers.']] as const) {
      let casse = true;
      await antor.route(api, (r: Any) => (casse ? r.fulfill({ status: 500, body: '{}' }) : r.continue().catch(() => undefined)));
      await antor.goto(url);
      await antor.getByText(msg).waitFor();
      await photo(antor, `erreur${url.replace('/', '-')}`);
      casse = false;
      await antor.getByRole('button', { name: 'Réessayer' }).click();
      await attendre(antor);
      assert.ok((await antor.locator('.carte-dessin').count()) > 0);
      await antor.unroute(api);
    }
  });

  test('chargement : trois squelettes et « Chargement des systèmes… »', opts, async () => {
    await antor.route('**/api/systemes', async (r: Any) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue().catch(() => undefined); });
    await antor.goto('/systemes');
    await antor.getByRole('status').filter({ hasText: 'Chargement des systèmes…' }).waitFor();
    assert.equal(await antor.locator('.squelette-carte').count(), 3);
    await photo(antor, 'chargement-e16');
    await antor.getByRole('status').filter({ hasText: 'Chargement des systèmes…' }).waitFor({ state: 'detached' });
    await antor.unroute('**/api/systemes');
  });

  test('connexion perdue : la grille chargée reste, bandeau, « Créer un univers » désactivé', opts, async () => {
    await va(antor, '/');
    await antor.context().setOffline(true);
    await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
    await antor.getByText(/Connexion perdue/).first().waitFor();
    assert.equal(await antor.locator('.carte-dessin').count(), 2);
    const b = antor.getByRole('button', { name: /Créer un univers/ }).or(antor.getByRole('link', { name: /Créer un univers/ })).first();
    assert.ok((await b.isDisabled()) || (await b.getAttribute('aria-disabled')) === 'true');
    await photo(antor, 'hors-ligne-e1');
    await antor.context().setOffline(false);
    await antor.evaluate(() => window.dispatchEvent(new Event('online')));
  });

  test('téléphone : E-16 et E-1 en une colonne sans débordement', opts, async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto('/connexion-bouchon');
    await p.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
    await attendre(p);
    for (const u of ['/systemes', '/']) {
      await va(p, u);
      const w = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(w <= 0, `${u} déborde de ${w}px`);
      const xs = await p.locator('.carte-dessin').evaluateAll((els: Element[]) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
      assert.equal(new Set(xs).size, 1, `${u} colonnes: ${xs}`);
      await p.screenshot({ path: `${SHOTS}/tel${u.replace('/', '-')}.png` });
    }
    await ctx.close();
  });

  test('E-1 : la méta d\'une carte tient sur une ligne à 1024, 1280 et 1440, le nom de système long coupé par « … »', opts, async () => {
    const long = 'Système des Cendres et des Brumes '.repeat(3).trim().slice(0, 80);
    const u = await antor.request.fetch(`${srv.base}/api/univers`, { method: 'POST', data: { nom: 'Les Cendres de Méta' } });
    const idU = (await u.json()).id;
    const sys = await antor.request.fetch(`${srv.base}/api/systemes`, { method: 'POST', data: { nom: long } });
    const idS = (await sys.json()).id;
    assert.equal((await antor.request.fetch(`${srv.base}/api/univers/${idU}/systeme`, { method: 'PUT', data: { systemeId: idS } })).status(), 204);
    for (const w of [1024, 1280, 1440]) {
      await antor.setViewportSize({ width: w, height: 900 });
      await va(antor, '/');
      const m = await antor.locator('.carte-dessin', { hasText: 'Les Cendres de Méta' }).locator('.meta-u').evaluate((el: Element) => {
        const tops = Array.from(el.children).map((c) => Math.round(c.getBoundingClientRect().top));
        const t = el.querySelector('.sys-u .t') as HTMLElement;
        return { tops, coupe: t.scrollWidth > t.clientWidth, h: el.getBoundingClientRect().height, texte: el.textContent };
      });
      assert.equal(new Set(m.tops).size, 1, `${w}px : méta sur plusieurs lignes ${m.tops}`);
      assert.match(m.texte ?? '', /1 membre\b/);
      assert.ok(m.coupe, `${w}px : nom du système non coupé`);
      await photo(antor, `meta-e1-${w}`);
    }
    await antor.setViewportSize({ width: 1280, height: 720 });
  });

  test('E-15 et E-8 : le titre h1 a la couleur du texte principal, icône et titre alignés sur la colonne', opts, async () => {
    const frais = await connecte(browser, srv.base, 'Antor'); // own context: earlier tests leave the shared page offline
    const pg = frais.page;
    const e8 = `/univers/${ids["Lame d'Ébène"]}/fiches/personnages`;
    await va(pg, '/systemes'); // earlier tests detach systems: take one E-16 still lists
    const e15 = new URL(await pg.locator('a[href^="/systemes/"]').first().evaluate((a: HTMLAnchorElement) => a.href)).pathname;
    for (const w of [1280, 390]) {
      await pg.setViewportSize({ width: w, height: 800 });
      for (const url of [e15, e8]) {
        await va(pg, url);
        assert.ok(await pg.locator('header.tete-liste h1').count(), url + ' : ' + (await texte(pg)).slice(0, 200));
        const m = await pg.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--texte)';
          document.body.appendChild(probe);
          const texte = getComputedStyle(probe).color;
          probe.remove();
          const h1 = document.querySelector('header.tete-liste h1') as HTMLElement;
          const hdr = document.querySelector('header.tete-liste') as HTMLElement;
          const col = document.querySelector('.page-liste, .page-grille') as HTMLElement;
          const g = document.querySelector('header.tete-liste .glyphe-type') as HTMLElement | null;
          return {
            texte, h1: getComputedStyle(h1).color, pad: getComputedStyle(hdr).paddingLeft,
            xHdr: hdr.getBoundingClientRect().left, xCol: col.getBoundingClientRect().left,
            xGlyphe: g ? g.getBoundingClientRect().left : null,
          };
        });
        assert.equal(m.h1, m.texte, `${w}px ${url} : titre pas à la couleur du texte`);
        assert.equal(m.pad, '0px', `${w}px ${url} : en-tête décalé`);
        assert.equal(m.xHdr, m.xCol);
        if (m.xGlyphe !== null) assert.equal(m.xGlyphe, m.xCol, `${w}px ${url} : icône décalée`);
      }
    }
    await photo(pg, 'titre-e15-tel');
    await frais.ctx.close();
  });

  test('E-15 au bureau 1440 : onglets avec compteurs, « Ajouter une créature » à droite sur la ligne des onglets sous le filet, colonne de 688 px', opts, async () => {
    const frais = await connecte(browser, srv.base, 'Antor');
    const pg = frais.page;
    await pg.setViewportSize({ width: 1440, height: 900 });
    // own system (3 rules, 5 creatures, 2 objects as in the maquette): earlier tests detach the seeded one
    const post = async (url: string, data: Any) => (await pg.request.fetch(srv.base + url, { method: 'POST', data })).json();
    const idU = (await post('/api/univers', { nom: 'Univers des compteurs' })).id;
    const idS = (await post('/api/systemes', { nom: 'Système compté' })).id;
    assert.equal((await pg.request.fetch(`${srv.base}/api/univers/${idU}/systeme`, { method: 'PUT', data: { systemeId: idS } })).status(), 204);
    const quoi: [string, number][] = [['regle', 3], ['creature', 5], ['objet', 2]];
    for (const [type, k] of quoi) for (let i = 1; i <= k; i++) await post(`/api/systemes/${idS}/gabarits`, { type, nom: `${type} ${i}`, contenu: 'x' });
    const e15 = `/systemes/${idS}`;
    await va(pg, e15);
    const tabs = (await pg.getByRole('tab').allInnerTexts()).map((t: string) => t.replace(/\s+/g, ' ').trim());
    assert.deepEqual(tabs, ['Règles 3', 'Créatures 5', 'Objets 2']);
    const m = await pg.evaluate(() => {
      let bouton: Element | null = null;
      for (const x of Array.from(document.querySelectorAll('button'))) if (/^Ajouter une créature/.test(x.textContent ?? '')) bouton = x;
      const onglets = document.querySelector('[role=tablist]');
      const tete = document.querySelector('.entete-sys, header.tete-liste');
      const col = document.querySelector('.page-liste');
      const b = bouton ? bouton.getBoundingClientRect() : null, o = onglets ? onglets.getBoundingClientRect() : null, c = col ? col.getBoundingClientRect() : null;
      return b && o && c && tete ? {
        bx: b.left, br: b.right, by: b.top + b.height / 2, oy: o.top + o.height / 2, or: o.right, cw: c.width, cr: c.right,
        filet: getComputedStyle(tete).borderBottomWidth, teteBas: tete.getBoundingClientRect().bottom, oTop: o.top,
      } : null;
    });
    assert.ok(m, 'bouton, onglets ou colonne introuvables');
    assert.equal(Math.round(m.cw), 688, 'colonne de contenu');
    assert.ok(Math.abs(m.by - m.oy) <= 12, `bouton pas sur la ligne des onglets (${m.by} vs ${m.oy})`);
    assert.ok(m.bx > m.or, 'bouton pas à droite des onglets');
    assert.ok(Math.abs(m.br - m.cr) <= 1, 'bouton pas calé à droite de la colonne');
    assert.ok(m.oTop >= m.teteBas, 'onglets au-dessus du filet');
    assert.equal(m.filet, '1px');
    await photo(pg, 'e15-1440');
    // the count follows an add
    await pg.getByRole('tab', { name: /^Créatures/ }).click();
    await pg.getByRole('button', { name: /^Ajouter une créature/ }).click();
    await pg.getByLabel(/Nom/).first().fill('Veilleur compté');
    await pg.getByRole('button', { name: /^Ajouter$/ }).click();
    await pg.getByRole('tab', { name: 'Créatures 6' }).waitFor();
    await frais.ctx.close();
  });

  test('E-16 au bureau 1440 : colonne de contenu x 334-1358, trois cartes de 325 px', opts, async () => {
    const frais = await connecte(browser, srv.base, 'Antor');
    const pg = frais.page;
    await pg.setViewportSize({ width: 1440, height: 900 });
    await va(pg, '/systemes');
    const m = await pg.evaluate(() => {
      const g = document.querySelector('.grille-cartes') as HTMLElement;
      const gr = g.getBoundingClientRect();
      const cs = Array.from(g.children).map((c) => Math.round(c.getBoundingClientRect().width));
      return { x: Math.round(gr.left), r: Math.round(gr.right), cs, top: Math.round((g.children[0] as HTMLElement).getBoundingClientRect().top) };
    });
    assert.equal(m.x, 334);
    assert.equal(m.r, 1358);
    assert.ok(m.cs.length >= 1);
    for (const w of m.cs) assert.ok(Math.abs(w - 325) <= 1, `carte de ${w} px`);
    await photo(pg, 'e16-1440');
    await frais.ctx.close();
  });
});
