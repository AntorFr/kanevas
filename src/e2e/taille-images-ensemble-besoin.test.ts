// Feature-level black-box tests of kanevas-taille-images (B-taille-1), written from the need alone
// (docs/parcours.md B-taille-1 and P-12 step 7, docs/ecrans.md « Image size and placement in a text »,
// docs/donnees.md rule), against the real server in stub mode driven by a real Chromium. Literal expectations.
//
// TEST PLAN (one server; each test builds its own universe)
//   nominal   : Antor, caret in the image, « Image » > Moyen then À droite, saves; the text holds `"moyen-droite"`;
//               Léa reads a right float at 40 % of the column (desktop, wrapped text) and a centred 70 % block at 390 px
//   bords     : the nine pairs give the widths 25/40/60 % and the phone widths 40/70/100 %; an image narrower than its
//               share is not enlarged; left/centre placements; first choice completes with moyen/centre
//   bords     : « Image » disabled (title « Placez le curseur sur une image ») with the caret outside; « Sans réglage »
//               removes the title; a hand-typed title shows selected in the menu; keyboard ↑ ↓ and Échap
//   échec     : titles that are no setting (real tooltip, uppercase, size alone, unknown placement) change nothing and stay in the text;
//               a closed/deleted reference with a setting keeps its frame, no class
//   exclusion : no « Image » button in player mode nor in a section Léa cannot write; Léa gets it where she writes
//   exclusion : the float never leaks out of its section; the reader's API answer carries the class and no source
//   aperçu    : « Aperçu » renders the setting
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { after, before, test } from 'node:test';
import { type Any, attendre, launch, skipBrowser, startServer } from './harnais.test.js';
import { comptes, json } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;

function pngDe(largeur: number, hauteur: number): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloc = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.alloc(largeur, 128)]);
  const brut = Buffer.concat(Array.from({ length: hauteur }, () => ligne));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(brut)),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}
const GRANDE = pngDe(2000, 1000);
const PETITE = pngDe(60, 30);

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

async function api(c: Any, method: 'post' | 'put' | 'get' | 'patch' | 'delete', url: string, data?: unknown): Promise<Any> {
  const r = await c.ctx.request[method](url, data === undefined ? {} : { data });
  if (r.status() >= 300) throw new Error(`${method} ${url} -> ${r.status()} ${await r.text()}`);
  return json(r);
}
async function televerser(b: string, sectionId: number, nom: string, buffer: Buffer): Promise<number> {
  const r = await C.antor.ctx.request.post(`${srv.base}${b}/fichiers`, {
    multipart: { section: String(sectionId), maniere: 'texte', fichier: { name: nom, mimeType: 'image/png', buffer } },
  });
  if (r.status() >= 300) throw new Error(`upload -> ${r.status()} ${await r.text()}`);
  return (await json(r)).id as number;
}
interface M { u: number; b: string; f: number; s: number; img: number; petite: number }
/** A universe, Léa player; one sheet whose section « Histoire » (read by players) holds one large and one small image. */
async function monde(nom: string, ecritureJoueurs = false): Promise<M> {
  const u = await api(C.antor, 'post', '/api/univers', { nom });
  const b = `/api/univers/${u.id}`;
  await api(C.antor, 'post', `${b}/membres`, { username: 'lea', role: 'joueur' });
  const f = await api(C.antor, 'post', `${b}/fiches`, { type: 'lieu', titre: 'Port-Sel', charge: { v: 1 } });
  const s = await api(C.antor, 'post', `${b}/fiches/${f.id}/sections`, { titre: 'Histoire', contenu: 'x' });
  await api(C.antor, 'patch', `${b}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true, ...(ecritureJoueurs ? { joueursEcrivent: true } : {}) });
  const img = await televerser(b, s.id, 'port.png', GRANDE);
  const petite = await televerser(b, s.id, 'icone.png', PETITE);
  return { u: u.id, b, f: f.id, s: s.id, img, petite };
}
const para = (n: number) => Array.from({ length: n }, (_, i) => `Le port de Port-Sel accueille des navires de toutes les côtes, ligne ${i}, avec ses quais, ses entrepôts et ses marins qui parlent fort.`).join(' ');
async function poser(m: M, contenu: string): Promise<void> {
  const cur = await api(C.antor, 'get', `${m.b}/fiches/${m.f}/sections/${m.s}`);
  await api(C.antor, 'put', `${m.b}/fiches/${m.f}/sections/${m.s}/contenu`, { contenu, version: cur.version });
}
const texteSection = async (m: M): Promise<string> => (await api(C.antor, 'get', `${m.b}/fiches/${m.f}/sections/${m.s}`)).contenu;
const url = (m: M) => `${srv.base}/univers/${m.u}/fiche/${m.f}`;
async function lire(c: Any, m: M, largeur = 1280) {
  const page = await c.ctx.newPage();
  await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(url(m));
  await attendre(page);
  return page;
}
/** Geometry of the first image of the section, relative to its `.md` container. */
async function geom(page: Any, sel = 'img'): Promise<{ w: number; col: number; flottant: string; marge: string; gauche: number; droite: number; colG: number; colD: number }> {
  const img = page.locator(`.md ${sel}`).first();
  await img.waitFor();
  await page.waitForFunction((s: string) => (document.querySelector(`.md ${s}`) as HTMLImageElement).complete, sel);
  return img.evaluate((e: HTMLElement) => {
    const md = e.closest('.md') as HTMLElement;
    const r = e.getBoundingClientRect();
    const c = md.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { w: r.width, col: c.width, flottant: cs.float, marge: cs.display, gauche: r.left, droite: r.right, colG: c.left, colD: c.right };
  });
}
const pct = (g: { w: number; col: number }) => (g.w / g.col) * 100;
const proche = (v: number, att: number, tol = 1.5) => assert.ok(Math.abs(v - att) <= tol, `${v.toFixed(2)} should be about ${att}`);

/** Open the editor of « Histoire », caret on the nth reference (index of `![`), return the section's textbox. */
async function editer(page: Any, ref = 0): Promise<Any> {
  const r = page.getByRole('region', { name: /Histoire/ });
  await r.getByRole('button', { name: 'Modifier', exact: true }).click();
  const champ = r.getByRole('textbox');
  await champ.waitFor();
  await caret(champ, ref);
  return champ;
}
async function caret(champ: Any, ref: number, decalage = 4): Promise<void> {
  await champ.evaluate((el: HTMLTextAreaElement, a: { ref: number; d: number }) => {
    let i = -1;
    for (let k = 0; k <= a.ref; k++) i = el.value.indexOf('![', i + 1);
    el.focus();
    el.setSelectionRange(i + a.d, i + a.d);
  }, { ref, d: decalage });
  // a real key press, as a user moving the caret
  await champ.press('ArrowRight');
  await champ.press('ArrowLeft');
}
const boutonImage = (page: Any) => page.getByRole('button', { name: 'Image', exact: true });
async function ouvrirMenu(page: Any): Promise<Any> {
  if ((await page.getByRole('menu').count()) === 0) await boutonImage(page).click();
  const menu = page.getByRole('menu');
  await menu.waitFor();
  return menu;
}
async function choisir(page: Any, ...noms: string[]): Promise<void> {
  for (const nom of noms) {
    const menu = await ouvrirMenu(page);
    await menu.getByRole('menuitemradio', { name: nom, exact: true }).click();
  }
}

test('B-taille-1 critère : Antor choisit Moyen puis À droite et enregistre ; Léa lit une image à droite de 40 % que le texte entoure, et un bloc centré de 70 % au téléphone', opts, async () => {
  const m = await monde('Taille nominal');
  await poser(m, `${para(3)}\n\n![le port](fichier:${m.img})\n\n${para(6)}`);
  const antor = await C.antor.ctx.newPage();
  await antor.goto(url(m));
  await attendre(antor);
  await editer(antor);
  await boutonImage(antor).click();
  await antor.getByRole('menu').waitFor();
  await antor.screenshot({ path: '/tmp/scr/taille-menu.png' });
  await antor.keyboard.press('Escape');
  await choisir(antor, 'Moyen');
  await choisir(antor, 'À droite');
  const champ = antor.getByRole('region', { name: /Histoire/ }).getByRole('textbox');
  assert.match(await champ.inputValue(), new RegExp(`!\\[le port\\]\\(fichier:${m.img} "moyen-droite"\\)`));
  await antor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await antor.locator('.md img').first().waitFor();
  assert.ok((await texteSection(m)).includes(`![le port](fichier:${m.img} "moyen-droite")`));
  await antor.close();

  const lea = await lire(C.lea, m);
  const g = await geom(lea);
  assert.equal(g.flottant, 'right');
  proche(pct(g), 40);
  assert.ok(Math.abs(g.droite - g.colD) <= 2, 'flush right of the column');
  // the paragraph after the image wraps beside it: some text line starts left of the image's left edge and lies at its height
  const entoure = await lea.evaluate(() => {
    const img = document.querySelector('.md img') as HTMLElement;
    const ir = img.getBoundingClientRect();
    let trouve = false;
    const w = document.createTreeWalker(document.querySelector('.md')!, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const q of r.getClientRects()) if (q.top < ir.bottom - 5 && q.bottom > ir.top + 5 && q.right <= ir.left + 2 && q.width > 30) trouve = true;
    }
    return trouve;
  });
  if (!entoure) await lea.screenshot({ path: '/tmp/scr/taille-debug.png' });
  assert.ok(entoure, 'text wraps the image');
  await lea.screenshot({ path: '/tmp/scr/taille-lea-bureau.png' });
  await lea.close();

  const tel = await lire(C.lea, m, 390);
  const t = await geom(tel);
  assert.equal(t.flottant, 'none');
  proche(pct(t), 70);
  proche((t.gauche + t.droite) / 2, (t.colG + t.colD) / 2, 2);
  assert.ok(await tel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');
  await tel.screenshot({ path: '/tmp/scr/taille-lea-tel.png' });
  await tel.close();
});

test('B-taille-1 bords : les neuf réglages donnent 25/40/60 % (bureau) et 40/70/100 % (téléphone), à la bonne place', opts, async () => {
  const m = await monde('Taille neuf');
  const tailles: Array<[string, number, number]> = [['petit', 25, 40], ['moyen', 40, 70], ['grand', 60, 100]];
  const places: Array<[string, string]> = [['gauche', 'left'], ['droite', 'right'], ['centre', 'none']];
  for (const [t, bureau, tel] of tailles) {
    for (const [p, flot] of places) {
      await poser(m, `${para(2)}\n\n![a](fichier:${m.img} "${t}-${p}")\n\n${para(3)}`);
      const page = await lire(C.lea, m);
      const g = await geom(page);
      assert.equal(g.flottant, flot, `${t}-${p} float`);
      proche(pct(g), bureau);
      if (p === 'gauche') assert.ok(Math.abs(g.gauche - g.colG) <= 2, `${t}-${p} left`);
      if (p === 'droite') assert.ok(Math.abs(g.droite - g.colD) <= 2, `${t}-${p} right`);
      if (p === 'centre') proche((g.gauche + g.droite) / 2, (g.colG + g.colD) / 2, 2);
      await page.close();
      const ptel = await lire(C.lea, m, 390);
      const gt = await geom(ptel);
      assert.equal(gt.flottant, 'none', `${t}-${p} phone: no float`);
      proche(pct(gt), tel);
      proche((gt.gauche + gt.droite) / 2, (gt.colG + gt.colD) / 2, 2);
      await ptel.close();
    }
  }
});

test('B-taille-1 bords : une image plus étroite que sa part n’est jamais agrandie ; sans réglage elle reste telle quelle', opts, async () => {
  const m = await monde('Taille etroite');
  await poser(m, `![i](fichier:${m.petite} "grand-centre")`);
  const page = await lire(C.lea, m);
  const g = await geom(page);
  proche(g.w, 60, 1);
  await page.close();
  await poser(m, `![i](fichier:${m.petite})\n\n![p](fichier:${m.img})`);
  const p2 = await lire(C.lea, m);
  const imgs = p2.locator('.md img');
  await imgs.nth(1).waitFor();
  assert.equal(await p2.locator('.md img.img-petit, .md img.img-moyen, .md img.img-grand').count(), 0);
  const g2 = await geom(p2, 'img:nth-of-type(1)');
  proche(g2.w, 60, 1);
  const g3 = await imgs.nth(1).evaluate((e: HTMLElement) => ({ w: e.getBoundingClientRect().width, col: (e.closest('.md') as HTMLElement).getBoundingClientRect().width, f: getComputedStyle(e).float }));
  assert.equal(g3.f, 'none');
  assert.ok(g3.w >= g3.col - 2, `an unset large image keeps the full column (${g3.w} / ${g3.col})`);
  await p2.close();
});

test('B-taille-1 bords : « Image » est grisé hors d’une image avec l’infobulle « Placez le curseur sur une image » ; actif dans l’image', opts, async () => {
  const m = await monde('Taille grise');
  await poser(m, `Un texte seul.\n\n![le port](fichier:${m.img})\n\nFin.`);
  const page = await C.antor.ctx.newPage();
  await page.goto(url(m));
  await attendre(page);
  const champ = await editer(page);
  const b = boutonImage(page);
  assert.equal(await b.isDisabled() || (await b.getAttribute('aria-disabled')) === 'true', false, 'active in the image');
  await champ.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(3, 3); });
  await champ.press('ArrowRight');
  await champ.press('ArrowLeft');
  await page.waitForFunction(() => {
    const e = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Image' || x.getAttribute('aria-label') === 'Image') as HTMLButtonElement | undefined;
    return !!e && (e.disabled || e.getAttribute('aria-disabled') === 'true');
  });
  assert.equal(await b.getAttribute('title'), 'Placez le curseur sur une image');
  await page.screenshot({ path: '/tmp/scr/taille-grise.png' });
  await page.close();
});

test('B-taille-1 bords : le premier choix complète l’autre groupe (Grand → grand-centre ; À gauche → moyen-gauche) ; « Sans réglage » retire le titre', opts, async () => {
  const m = await monde('Taille complete');
  await poser(m, `![le port](fichier:${m.img})\n\nFin.`);
  const page = await C.antor.ctx.newPage();
  await page.goto(url(m));
  await attendre(page);
  const champ = await editer(page);
  await choisir(page, 'Grand');
  assert.equal(await champ.inputValue(), `![le port](fichier:${m.img} "grand-centre")\n\nFin.`);
  await choisir(page, 'À gauche');
  assert.equal(await champ.inputValue(), `![le port](fichier:${m.img} "grand-gauche")\n\nFin.`);
  const menu = await ouvrirMenu(page);
  await menu.getByRole('menuitem', { name: 'Sans réglage' }).click();
  assert.equal(await champ.inputValue(), `![le port](fichier:${m.img})\n\nFin.`);
  await page.close();
  // placement first on a fresh image
  await poser(m, `![le port](fichier:${m.img})\n\nFin.`);
  const p2 = await C.antor.ctx.newPage();
  await p2.goto(url(m));
  await attendre(p2);
  const c2 = await editer(p2);
  await choisir(p2, 'À gauche');
  assert.equal(await c2.inputValue(), `![le port](fichier:${m.img} "moyen-gauche")\n\nFin.`);
  await p2.close();
});

test('B-taille-1 bords : un réglage tapé à la main s’affiche coché dans le menu ; le choix suivant change l’autre moitié sans toucher au reste du texte', opts, async () => {
  const m = await monde('Taille retour');
  await poser(m, `Avant ![a](fichier:${m.petite} "petit-gauche") milieu\n\n![le port](fichier:${m.img} "grand-droite") après`);
  const page = await C.antor.ctx.newPage();
  await page.goto(url(m));
  await attendre(page);
  const champ = await editer(page, 1);
  await boutonImage(page).click();
  const menu = page.getByRole('menu');
  await menu.waitFor();
  const coche = async (nom: string) => menu.getByRole('menuitemradio', { name: nom, exact: true }).getAttribute('aria-checked');
  assert.equal(await coche('Grand'), 'true');
  assert.equal(await coche('Petit'), 'false');
  assert.equal(await coche('À droite'), 'true');
  assert.equal(await coche('À gauche'), 'false');
  await page.screenshot({ path: '/tmp/scr/taille-menu-coche.png' });
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  // the focus is back in the field
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA');
  await choisir(page, 'Petit');
  assert.equal(await champ.inputValue(), `Avant ![a](fichier:${m.petite} "petit-gauche") milieu\n\n![le port](fichier:${m.img} "petit-droite") après`);
  // first image read back
  await page.keyboard.press('Escape');
  await caret(champ, 0);
  await ouvrirMenu(page);
  assert.equal(await menu.getByRole('menuitemradio', { name: 'À gauche', exact: true }).getAttribute('aria-checked'), 'true');
  await page.close();
});

test('B-taille-1 échec : un titre qui n’est pas un réglage ne change rien en lecture et reste intact dans le texte ; aucune option cochée', opts, async () => {
  const m = await monde('Taille titres');
  const titres = ['Le grand port', 'Moyen-Droite', 'moyen', 'moyen-milieu', 'enorme-droite', 'moyen_droite', 'moyen-droite-bas'];
  for (const t of titres) {
    await poser(m, `![a](fichier:${m.img} "${t}")`);
    const page = await lire(C.lea, m);
    const g = await geom(page);
    assert.equal(g.flottant, 'none', t);
    assert.equal(await page.locator('.md img[class*="img-"]').count(), 0, `${t}: no class`);
    assert.ok(g.w >= g.col - 2, `${t}: full column`);
    await page.close();
    assert.equal(await texteSection(m), `![a](fichier:${m.img} "${t}")`, `${t}: text untouched`);
  }
  await poser(m, `![a](fichier:${m.img} "Le grand port")`);
  const antor = await C.antor.ctx.newPage();
  await antor.goto(url(m));
  await attendre(antor);
  await editer(antor);
  await boutonImage(antor).click();
  const menu = antor.getByRole('menu');
  await menu.waitFor();
  for (const n of ['Petit', 'Moyen', 'Grand', 'À gauche', 'À droite', 'Centrée']) {
    assert.equal(await menu.getByRole('menuitemradio', { name: n, exact: true }).getAttribute('aria-checked'), 'false', n);
  }
  await antor.close();
});

test('B-taille-1 échec : une référence supprimée lit pareil avec ou sans réglage (le réglage est ignoré), et « Image » reste actif dessus', opts, async () => {
  const m = await monde('Taille supprimee');
  await api(C.antor, 'delete', `${m.b}/fichiers/${m.petite}`);
  const htmlDe = async (c: Any, contenu: string): Promise<string> => {
    await poser(m, contenu);
    return (await api(c, 'get', `${m.b}/fiches/${m.f}/sections/${m.s}`)).html;
  };
  for (const c of [C.lea, C.antor]) {
    const sans = await htmlDe(c, `![a](fichier:${m.petite})`);
    const avec = await htmlDe(c, `![a](fichier:${m.petite} "grand-droite")`);
    assert.equal(avec, sans);
    assert.doesNotMatch(avec, /img-/);
  }
  await poser(m, `![a](fichier:${m.petite} "grand-droite")\n\n![b](fichier:${m.img} "petit-gauche")`);
  const page = await lire(C.lea, m);
  const classes = await page.locator('.md img').evaluateAll((es: HTMLElement[]) => es.map((e) => e.className));
  assert.deepEqual(classes, ['img-petit img-gauche']);
  await page.screenshot({ path: '/tmp/scr/taille-supprimee.png' });
  await page.close();
  const antor = await C.antor.ctx.newPage();
  await antor.goto(url(m));
  await attendre(antor);
  await editer(antor, 0);
  assert.equal(await boutonImage(antor).isDisabled(), false);
  await choisir(antor, 'Petit');
  assert.equal((await antor.getByRole('region', { name: /Histoire/ }).getByRole('textbox').inputValue()).startsWith(`![a](fichier:${m.petite} "petit-droite")`), true);
  await antor.close();
});

test('B-taille-1 exclusions : le bouton « Image » est caché en mode Joueur, absent pour Léa là où elle ne peut pas écrire, présent là où elle écrit', opts, async () => {
  const m = await monde('Taille droits');
  await poser(m, `![a](fichier:${m.img})`);
  // Antor in player mode: no editor at all
  const mj = await C.antor.ctx.newPage();
  await mj.goto(url(m));
  await attendre(mj);
  await mj.getByLabel('Mode Joueur').click();
  await mj.waitForFunction(() => document.querySelector('[aria-label="Mode Joueur"]')?.getAttribute('aria-checked') === 'true');
  await attendre(mj);
  assert.equal(await boutonImage(mj).count(), 0);
  assert.equal(await mj.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
  await mj.close();
  // Léa, reader only
  const lea = await lire(C.lea, m);
  assert.equal(await lea.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
  assert.equal(await boutonImage(lea).count(), 0);
  await lea.close();
  // Léa where she may write
  const w = await monde('Taille droits ecriture', true);
  await poser(w, `![a](fichier:${w.img})`);
  const p = await C.lea.ctx.newPage();
  await p.goto(url(w));
  await attendre(p);
  await editer(p);
  assert.equal(await boutonImage(p).isDisabled(), false);
  await choisir(p, 'Petit');
  await choisir(p, 'À droite');
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await p.locator('.md img.img-petit.img-droite').waitFor();
  assert.equal(await texteSection(w), `![a](fichier:${w.img} "petit-droite")`);
  await p.screenshot({ path: '/tmp/scr/taille-lea-ecrit.png' });
  await p.close();
});

test('B-taille-1 exclusions : le flottant ne déborde pas de sa section ; la lecture porte les classes, jamais la source pour le lecteur', opts, async () => {
  const m = await monde('Taille fuite');
  const s2 = await api(C.antor, 'post', `${m.b}/fiches/${m.f}/sections`, { titre: 'Suite', contenu: `Court.` });
  await api(C.antor, 'patch', `${m.b}/fiches/${m.f}/sections/${s2.id}`, { joueursLisent: true });
  await poser(m, `![a](fichier:${m.img} "grand-droite")\n\nUne ligne.`);
  const page = await lire(C.lea, m);
  const r = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('.md')] as HTMLElement[];
    const img = secs[0]!.querySelector('img') as HTMLElement;
    const ir = img.getBoundingClientRect();
    return { imgBas: ir.bottom, mdBas: secs[0]!.getBoundingClientRect().bottom, suiteHaut: secs[1]!.getBoundingClientRect().top, n: secs.length };
  });
  assert.ok(r.mdBas >= r.imgBas - 1, `the section container contains the float (${r.mdBas} vs ${r.imgBas})`);
  assert.ok(r.suiteHaut >= r.imgBas - 1, `the next section starts below the image (${r.suiteHaut} vs ${r.imgBas})`);
  await page.screenshot({ path: '/tmp/scr/taille-fuite.png' });
  await page.close();
  const vue = await api(C.lea, 'get', `${m.b}/fiches/${m.f}/sections/${m.s}`);
  assert.match(vue.html, /<img[^>]*class="[^"]*img-grand[^"]*img-droite|<img[^>]*class="[^"]*img-droite[^"]*img-grand/);
  assert.equal(vue.contenu, undefined, 'the reader receives no source');
});

test('B-taille-1 aperçu : « Aperçu » rend le réglage comme la lecture', opts, async () => {
  const m = await monde('Taille apercu');
  await poser(m, `![le port](fichier:${m.img})\n\nFin.`);
  const page = await C.antor.ctx.newPage();
  await page.goto(url(m));
  await attendre(page);
  await editer(page);
  await choisir(page, 'Petit');
  await choisir(page, 'À gauche');
  await page.getByRole('radio', { name: 'Aperçu', exact: true }).click();
  const img = page.locator('.apercu-md img.img-petit.img-gauche');
  await img.waitFor({ timeout: 8000 });
  await page.waitForFunction(() => (document.querySelector('.apercu-md img') as HTMLImageElement).complete);
  const w = await img.evaluate((e: HTMLElement) => e.getBoundingClientRect().width / (e.closest('.apercu-md') as HTMLElement).getBoundingClientRect().width * 100);
  proche(w, 25);
  await page.screenshot({ path: '/tmp/scr/taille-apercu.png' });
  await page.close();
});

test('B-taille-1 : le réglage voyage comme du texte — écrit par l’API de section (import/export), il est lu et se relit à l’identique', opts, async () => {
  const m = await monde('Taille texte');
  const src = `![alt](fichier:${m.img} "moyen-centre")`;
  await poser(m, src);
  assert.equal(await texteSection(m), src);
  const vue = await api(C.antor, 'get', `${m.b}/fiches/${m.f}`);
  const sec = vue.sections.find((s: Any) => s.titre === 'Histoire');
  assert.equal(sec.contenu, src);
  assert.match(sec.html, /img-moyen/);
  assert.match(sec.html, /img-centre/);
});
