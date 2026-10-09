// Black-box tests of `kanevas-refonte-visuelle`, second pass from the need only (fiche « Livre »,
// docs/ecrans.md « Détail de `kanevas-refonte-visuelle` », docs/charte.md). Complements
// refonte-besoin.test.ts with what it leaves out: the audience margin line, the badge's accessible
// name and focus return, the connection banner above the player-mode banner, the phone and long
// breadcrumb, current-item and drawer semantics, and reduced motion. Real server in stub mode + real
// Chromium (harnais.test.ts). Every expected value is a literal of the docs.
// Screenshots go to $SHOTS_DIR (default /tmp/shots), outside the tracked tree.
//
// TEST PLAN (besoin -> panne nommée)
//   pastille  : name « Lue des joueurs — régler l'audience de « Apparence » » ; Échap rend le focus
//               [on retire l'étiquette d'état ou le retour de focus]
//   filet     : « confiée » = pointillé, « lue » = pas de pointillé
//               [le filet ne suit pas le réglage / est absent]
//   bandeaux  : connexion perdue au-dessus du bandeau du mode Joueur, et part au retour
//               [l'ordre des bandeaux s'inverse, ou le bandeau reste]
//   fil       : téléphone = titre seul ; bureau, noms longs = pas de débordement, nom tronqué en infobulle
//               [le fil déborde / perd son dernier maillon]
//   cadre     : item courant aria-current, « Menu » aria-expanded + focus rendu, bouton du compte aria-haspopup
//   mouvement : prefers-reduced-motion -> durée 0 ; sinon 160 ms
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  allerMembres,
  choisirAuteur,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  regler,
  rx,
  section,
  skipBrowser,
  startServer,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
const SHOTS = process.env.SHOTS_DIR ?? '/tmp/shots';
const UNIVERS = "Lame d'Ébène";
const BANDEAU_JOUEUR = 'Mode Joueur : vous voyez ce que voit un joueur.';
const BANDEAU_PERDU =
  "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";
const NOM_80 = 'Les Marches Oubliées du Royaume des Brumes Éternelles et des Cendres Dorées'.padEnd(80, '!');
const TITRE_45 = 'Maître Aldric Vaelin de Brumecombe-sur-Mer'.padEnd(45, '!');
const TITRE_120 =
  'Maître Aldric Vaelin de Brumecombe, gardien des Sept Clés du Royaume Englouti, protecteur des Marches.'.padEnd(120, '!');

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let urlAldric = '';
let urlLong = '';
let urlMoyen = '';

async function attendre(page: Any) {
  await page.waitForLoadState('networkidle');
}
async function shot(page: Any, nom: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: false });
}
/** Number of boxes (element, pseudo-elements, descendants) that paint a dashed or dotted border or outline. */
async function pointille(loc: Any): Promise<number> {
  const fn = new Function(
    'el',
    `var bad = function (s) {
       return ['Top','Right','Bottom','Left'].some(function (c) { return /dashed|dotted/.test(s['border' + c + 'Style']) && parseFloat(s['border' + c + 'Width']) > 0; })
         || (/dashed|dotted/.test(s.outlineStyle) && parseFloat(s.outlineWidth) > 0);
     };
     var all = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
     return all.reduce(function (k, n) { return k + [getComputedStyle(n), getComputedStyle(n, '::before'), getComputedStyle(n, '::after')].filter(bad).length; }, 0);`,
  );
  return loc.evaluate(fn);
}
const nav = (page: Any) => page.getByRole('complementary', { name: 'Barre latérale' });

async function telephone(compte: string): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte}$`, 'i') }).click();
  await attendre(page);
  return { ctx, page };
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  await (await connecte(browser, srv.base, 'Léa')).page.close();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, UNIVERS, 'Une table de jeu.');
  await antor.getByRole('heading', { name: UNIVERS, level: 1 }).waitFor();
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await ajouterSection(antor, 'Apparence');
  await ajouterSection(antor, 'Vérité — MJ seul');
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  urlAldric = new URL(antor.url()).pathname;
  // A second universe with a 80-character name and a 120-character sheet title (« contenu long »: 80 and 120 characters exactly).
  await antor.goto('/');
  await attendre(antor);
  await creerUnivers(antor, NOM_80, '');
  await antor.getByRole('heading', { name: NOM_80, level: 1 }).waitFor();
  await creerFiche(antor, 'personnage', TITRE_120);
  await antor.getByRole('heading', { level: 1, name: TITRE_120 }).waitFor();
  urlLong = new URL(antor.url()).pathname;
  await antor.goto(urlLong.replace(/\/fiche\/\d+$/, '') + '/fiches/personnages');
  await attendre(antor);
  await creerFiche(antor, 'personnage', TITRE_45);
  await antor.getByRole('heading', { level: 1, name: TITRE_45 }).waitFor();
  urlMoyen = new URL(antor.url()).pathname;
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

describe('pastille d’audience : nom accessible et focus', () => {
  test('son nom dit l’état et le geste', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const pastille = section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ });
    const nom = ((await pastille.getAttribute('aria-label')) ?? (await pastille.innerText())).replace(/’/g, "'");
    assert.equal(nom, "Lue des joueurs — régler l'audience de « Apparence »");
  });

  test('ouvert à la souris, le réglage se ferme à Échap', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ }).click();
    const boite = antor.getByRole('dialog', { name: /Qui voit « Apparence »/ });
    await boite.waitFor();
    await antor.keyboard.press('Escape');
    await boite.waitFor({ state: 'detached', timeout: 2000 });
  });

  test('Échap pressé dans le réglage le ferme et rend le focus à la pastille', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const pastille = section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ });
    await pastille.click();
    const boite = antor.getByRole('dialog', { name: /Qui voit « Apparence »/ });
    await boite.waitFor();
    await boite.getByRole('switch', { name: /Les joueurs la lisent/ }).focus();
    await antor.keyboard.press('Escape');
    await boite.waitFor({ state: 'detached', timeout: 2000 });
    const focusNom = await antor.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? '').replace(/’/g, "'"));
    assert.equal(focusNom, "Lue des joueurs — régler l'audience de « Apparence »");
  });

  test('ouvert au clavier, Échap ferme le réglage et rend le focus à la pastille', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const pastille = section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ });
    await pastille.focus();
    await antor.keyboard.press('Enter');
    const boite = antor.getByRole('dialog', { name: /Qui voit « Apparence »/ });
    await boite.waitFor();
    await antor.keyboard.press('Escape');
    await boite.waitFor({ state: 'detached', timeout: 2000 });
    const focusNom = await antor.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? '').replace(/’/g, "'"));
    assert.equal(focusNom, "Lue des joueurs — régler l'audience de « Apparence »");
  });
});

describe('filet d’audience dans la marge', () => {
  /** What the margin line of a section paints: its dashed gradient, if any, and its solid colour. */
  async function filet(loc: Any): Promise<{ pointille: boolean; plein: string }> {
    const fn = new Function(
      'el',
      `var all = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
       var pointille = false, plein = '';
       all.forEach(function (n) {
         ['::before', '::after'].forEach(function (ps) {
           var c = getComputedStyle(n, ps);
           if (/repeating-linear-gradient/.test(c.backgroundImage) && parseFloat(c.width) <= 4) pointille = true;
           if (c.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(c.width) <= 4 && parseFloat(c.height) > 20) plein = c.backgroundColor;
         });
       });
       return { pointille: pointille, plein: plein };`,
    );
    return loc.evaluate(fn);
  }

  test('lue des joueurs : filet plein vert ; confiée : filet pointillé ; MJ seul : ni l’un ni l’autre', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const lue = await filet(section(antor, 'Apparence'));
    assert.equal(lue.pointille, false, 'lue des joueurs : pas de pointillé');
    const m = /rgba?\((\d+), (\d+), (\d+)/.exec(lue.plein);
    assert.ok(m, `lue des joueurs : un filet plein est peint (obtenu « ${lue.plein} »)`);
    assert.ok(+m[2] > +m[1] && +m[2] > +m[3], `le filet plein est vert (obtenu « ${lue.plein} »)`);
    assert.equal((await filet(section(antor, 'Vérité — MJ seul'))).pointille, false, 'MJ seul : pas de pointillé');
    await choisirAuteur(antor, 'Vérité — MJ seul', 'lea');
    const verite = section(antor, 'Vérité — MJ seul');
    await verite.getByRole('button', { name: /régler l['’]audience de/ }).click();
    const boite = antor.getByRole('dialog', { name: /Qui voit/ });
    await boite.getByRole('switch', { name: rx('L’auteur la lit') }).click();
    await verite.getByRole('button', { name: /^Confiée à lea/ }).waitFor();
    await antor.keyboard.press('Escape');
    await boite.waitFor({ state: 'detached' });
    assert.equal((await filet(verite)).pointille, true, 'confiée : filet pointillé');
    await shot(antor, 'filet-confiee');
    // back to MJ only: the dotted line goes away with the setting
    await verite.getByRole('button', { name: /^Confiée à lea/ }).click();
    await boite.getByRole('switch', { name: rx('L’auteur la lit') }).click();
    await boite.getByRole('combobox', { name: /Auteur/ }).selectOption({ label: 'aucun' });
    await antor.keyboard.press('Escape');
    await verite.getByRole('button', { name: /^MJ seul/ }).waitFor();
    assert.equal((await filet(verite)).pointille, false, 'MJ seul : le pointillé est parti avec le réglage');
  });
});

describe('bandeaux sous la barre haute', () => {
  test('connexion perdue au-dessus du bandeau du mode Joueur, et part au retour', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await page.goto(urlAldric);
    await attendre(page);
    await page.getByRole('radio', { name: /Mode Joueur|^Joueur/ }).click();
    await page.getByText(BANDEAU_JOUEUR).waitFor();
    await ctx.setOffline(true);
    await page.getByText(rx(BANDEAU_PERDU)).waitFor();
    const yPerdu = (await page.getByText(rx(BANDEAU_PERDU)).first().boundingBox()).y;
    const yJoueur = (await page.getByText(BANDEAU_JOUEUR).first().boundingBox()).y;
    assert.ok(yPerdu < yJoueur, `connexion perdue (y=${yPerdu}) doit être au-dessus du mode Joueur (y=${yJoueur})`);
    await shot(page, 'bandeaux-empiles');
    await ctx.setOffline(false);
    await page.getByText(rx(BANDEAU_PERDU)).waitFor({ state: 'detached' });
    assert.equal(await page.getByText(BANDEAU_JOUEUR).count(), 1, 'le bandeau du mode Joueur reste');
    await ctx.close();
  });
});

describe('fil d’Ariane', () => {
  /** Texts of the leaf elements the user can actually see (a label squeezed to 1 px is not seen). */
  const textesVus = (loc: Any): Promise<string[]> =>
    loc.evaluate((nav: Any) =>
      Array.prototype.slice
        .call(nav.querySelectorAll('*'))
        .filter((e: Any) => e.children.length === 0 && (e.textContent || '').trim() && e.getBoundingClientRect().width > 4)
        .map((e: Any) => e.textContent.trim()),
    );

  test('au téléphone : l’icône du type et le titre seul, ni le nom de l’univers ni le mot du type', opts, async () => {
    const { ctx, page } = await telephone('Antor');
    await page.goto(urlAldric);
    await attendre(page);
    const fil = page.getByRole('navigation', { name: /Fil d.Ariane/i });
    assert.deepEqual(await textesVus(fil), ['Maître Aldric']);
    await shot(page, 'fil-telephone');
    await ctx.close();
  });

  test('bureau : un titre moyen reste entier dans le fil, les maillons d’avant cèdent d’abord', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(urlMoyen);
    await attendre(page);
    const fil = page.getByRole('navigation', { name: /Fil d.Ariane/i });
    const dernier = fil.getByText(TITRE_45).first();
    const coupe = await dernier.evaluate((e: Any) => e.scrollWidth > e.clientWidth + 1);
    assert.equal(coupe, false, `le dernier maillon (« ${TITRE_45} ») est coupé alors que les autres pouvaient céder`);
    await shot(page, 'fil-moyen-bureau');
    await ctx.close();
  });

  test('bureau, nom d’univers de 80 caractères et titre de 120 : rien ne déborde, le nom et le titre ont leur texte entier en infobulle', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(urlLong);
    await attendre(page);
    const fil = page.getByRole('navigation', { name: /Fil d.Ariane/i });
    const infobulle = (texte: string) =>
      fil.getByText(texte).first().evaluate((e: Any) => {
        for (let n = e; n && n.tagName !== 'NAV'; n = n.parentElement) if (n.getAttribute('title')) return n.getAttribute('title');
        return '';
      });
    assert.equal(await infobulle(NOM_80), NOM_80);
    assert.equal(await infobulle(TITRE_120), TITRE_120);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'aucun débordement horizontal');
    await shot(page, 'fil-long-bureau');
    await ctx.close();
  });

  test('téléphone, mêmes noms longs : aucun débordement horizontal', opts, async () => {
    const { ctx, page } = await telephone('Antor');
    await page.goto(urlLong);
    await attendre(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await shot(page, 'fil-long-telephone');
    await ctx.close();
  });
});

describe('cadre : sémantique de la navigation', () => {
  test('l’item courant porte aria-current="page" et lui seul', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await nav(antor).getByRole('link', { name: /^Personnages$/ }).click();
    await attendre(antor);
    const courants = await nav(antor).locator('[aria-current="page"]').allInnerTexts();
    assert.equal(courants.length, 1);
    assert.match(courants[0], /Personnages/);
  });

  test('le bouton du compte annonce un menu ; au téléphone « Menu » annonce son état et récupère le focus à Échap', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await antor.getByRole('button', { name: /Menu du compte|antor/i }).last().waitFor();
    assert.equal(await antor.getByRole('button', { name: /Menu du compte|antor/i }).last().getAttribute('aria-haspopup'), 'menu');
    const { ctx, page } = await telephone('Antor');
    await page.goto(urlAldric);
    await attendre(page);
    const menu = page.getByRole('button', { name: /^Menu$/ });
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') === 'false');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim()), 'Menu');
    await ctx.close();
  });
});

describe('mouvement', () => {
  test('la durée des transitions vaut 160 ms, et 0 sous prefers-reduced-motion', opts, async () => {
    const lire = (p: Any) => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--duree').trim());
    await antor.goto(urlAldric);
    await attendre(antor);
    assert.match(await lire(antor), /^(160ms|0?\.16s)$/);
    const ctx = await browser.newContext({ baseURL: srv.base, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
    await attendre(page);
    await page.goto(urlAldric);
    await attendre(page);
    assert.match(await lire(page), /^0(ms|s)?$/);
    await ctx.close();
  });
});
