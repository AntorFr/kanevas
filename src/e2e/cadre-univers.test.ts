// Black-box tests of kanevas-rv-cadre: the frame of a universe screen (docs/ecrans.md § Barre
// latérale, § Détail de `kanevas-refonte-visuelle`, « États des composants du cadre »).
//
// TEST PLAN
//   compte        : the sidebar carries neither the theme nor « Se déconnecter »; the avatar menu carries both
//                   (3 theme choices), the theme applies, « Se déconnecter » signs out
//   connexion perdue : the account menu opens, the theme changes, « Se déconnecter » stays enabled;
//                   the lost banner sits above the player-mode banner
//   barre haute   : breadcrumb universe › Personnages › sheet, last crumb is the page; long title truncated with a tooltip
//   bascule       : GM sees « Mode MJ »/« Mode Joueur » + the banner in player mode; a player sees neither
//   tiroir        : at 390 px the bar is hidden behind « Menu »; Escape, the veil or an entry close it
//   hors univers  : reduced bar (« Mes univers », account), no selector, no « Menu » drawer content of a universe
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  attendre,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
const PERDU = /Connexion perdue\. Ce que vous voyez peut être dépassé ; rien n['’]est enregistré tant qu['’]elle ne revient pas\./;
const JOUEUR = 'Mode Joueur : vous voyez ce que voit un joueur.';
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let urlUnivers = '';
let urlFiche = '';
let urlLongue = '';
const LONG = 'Maître Aldric ' + 'le très long '.repeat(6).trim();

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  await creerUnivers(antor, 'Lame d’Ébène');
  urlUnivers = '/univers/1'; // fresh database
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await creerFiche(antor, 'personnage', LONG);
  await antor.getByText(LONG).first().waitFor();
  // fresh database: the sheets are #1 and #2 of the universe
  urlFiche = `${urlUnivers}/fiche/1`;
  urlLongue = `${urlUnivers}/fiche/2`;
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const barre = (p: Any) => p.getByRole('complementary', { name: 'Barre latérale' });
/** Opens the account menu if it is not open yet (choosing a theme may or may not close it). */
const ouvrirCompte = async (p: Any) => {
  if ((await p.getByRole('menuitemradio').count()) > 0) return;
  await barre(p).getByRole('button', { name: /antor|lea|léa/i }).click();
};
const sur = async (p: Any, url: string) => {
  await p.goto(url);
  await attendre(p);
};

test('compte : la barre ne porte ni thème ni déconnexion, le menu de l’avatar porte les deux', opts, async () => {
  await sur(antor, urlFiche);
  const b = barre(antor);
  assert.equal(await b.getByText(/Se déconnecter/).count(), 0);
  assert.equal(await b.getByRole('button', { name: /^(Clair|Sombre|Système)$/ }).count(), 0);
  await b.getByRole('button', { name: /antor|lea|léa/i }).click();
  const menu = antor.getByRole('menu');
  await menu.getByText('antor').first().waitFor();
  assert.equal(await menu.getByRole('menuitemradio').count(), 3);
  for (const t of ['Clair', 'Sombre', 'Système']) await menu.getByRole('menuitemradio', { name: t }).waitFor();
  await menu.getByRole('menuitem', { name: 'Se déconnecter' }).waitFor();
});

test('compte : choisir Clair puis Sombre change le thème de la page', opts, async () => {
  await sur(antor, urlFiche);
  await ouvrirCompte(antor);
  await antor.getByRole('menuitemradio', { name: 'Clair' }).click();
  assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'light');
  await ouvrirCompte(antor);
  await antor.getByRole('menuitemradio', { name: 'Sombre' }).click();
  assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'dark');
});

test('compte : « Se déconnecter » ferme la session', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Antor');
  await sur(page, urlUnivers);
  await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('button', { name: /antor|lea|léa/i }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await page.waitForURL((u: URL) => !u.pathname.startsWith('/univers'));
  const r = await ctx.request.get(srv.base + '/api/moi');
  assert.equal(r.status(), 401);
  await ctx.close();
});

test('barre haute : fil univers › Personnages › fiche, la fiche est la page courante', opts, async () => {
  await sur(antor, urlFiche);
  const fil = antor.getByRole('navigation', { name: /Ariane/ });
  const t = (await fil.innerText()).replace(/\s+/g, ' ');
  assert.match(t, /Lame d’Ébène.*Personnages.*Maître Aldric/);
  assert.equal(await fil.locator('[aria-current="page"]').innerText(), 'Maître Aldric');
  await fil.getByRole('link', { name: /Personnages/ }).waitFor();
  assert.equal(await fil.getByRole('link', { name: /Maître Aldric/ }).count(), 0);
});

test('barre haute : un titre trop long est coupé, le texte entier en infobulle', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await sur(antor, urlLongue);
  const dernier = antor.locator('.ariane [aria-current="page"]');
  assert.equal(await dernier.getAttribute('title'), LONG);
  const coupe = await dernier.locator('.tronque').evaluate((e: HTMLElement) => e.scrollWidth > e.clientWidth || e.clientWidth > 0);
  assert.ok(coupe);
  const dansBarre = await dernier.evaluate((e: HTMLElement) => e.getBoundingClientRect().right <= window.innerWidth);
  assert.ok(dansBarre, 'the last crumb stays inside the window');
  assert.equal(await antor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
});

test('bascule : le MJ la voit sur la fiche, le mode Joueur montre le bandeau, rien sur la liste', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await sur(antor, urlFiche);
  const bascule = antor.getByRole('radiogroup');
  await bascule.getByRole('radio', { name: 'Mode MJ' }).waitFor();
  assert.equal(await antor.getByText(JOUEUR).count(), 0);
  await bascule.getByRole('radio', { name: 'Mode Joueur' }).click();
  await antor.getByText(JOUEUR).waitFor();
  assert.equal(await antor.getByRole('radio', { name: 'Mode Joueur' }).getAttribute('aria-checked'), 'true');
  // leaving the screen withdraws the toggle and the banner
  await antor.getByRole('link', { name: rxExact('Vue d’ensemble') }).click();
  await attendre(antor);
  await antor.getByRole('heading', { level: 1 }).first().waitFor();
  await antor.getByRole('radiogroup').waitFor({ state: 'detached' });
  assert.equal(await antor.getByText(JOUEUR).count(), 0);
  // and coming back, the mode is MJ again
  await sur(antor, urlFiche);
  assert.equal(await antor.getByRole('radio', { name: 'Mode MJ' }).getAttribute('aria-checked'), 'true');
});

test('bascule : un Joueur ne voit ni bascule ni bandeau', opts, async () => {
  await sur(lea, urlFiche);
  assert.equal(await lea.getByRole('radiogroup').count(), 0);
  assert.equal(await lea.getByText(JOUEUR).count(), 0);
  assert.equal(await lea.getByRole('radio', { name: /Mode/ }).count(), 0);
});

test('bascule : au téléphone les libellés sont « MJ » et « Joueur »', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await sur(antor, urlFiche);
  const t = (await antor.getByRole('radiogroup').innerText()).replace(/\s+/g, ' ').trim();
  assert.equal(t, 'MJ Joueur');
  await antor.setViewportSize({ width: 1440, height: 900 });
});

test('connexion perdue : le bandeau passe au-dessus de celui du mode Joueur ; le menu du compte reste utilisable', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await sur(antor, urlFiche);
  await antor.getByRole('radio', { name: 'Mode Joueur' }).click();
  await antor.getByText(JOUEUR).waitFor();
  try {
    await antor.context().setOffline(true);
    await antor.getByText(PERDU).waitFor({ timeout: 30000 });
    const yPerdu = (await antor.getByText(PERDU).boundingBox()).y;
    const yJoueur = (await antor.getByText(JOUEUR).boundingBox()).y;
    assert.ok(yPerdu < yJoueur, 'lost banner above the player-mode banner');
    const haute = (await antor.locator('header').first().boundingBox()) as { y: number; height: number };
    assert.ok(yPerdu >= haute.y + haute.height - 1, 'banners sit under the top bar');
    await ouvrirCompte(antor);
    assert.equal(await antor.getByRole('menuitem', { name: 'Se déconnecter' }).isDisabled(), false);
    await antor.getByRole('menuitemradio', { name: 'Clair' }).click();
    assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'light');
  } finally {
    await antor.context().setOffline(false);
  }
  await antor.getByText(PERDU).waitFor({ state: 'detached', timeout: 30000 });
  await antor.getByText(JOUEUR).waitFor();
  await ouvrirCompte(antor);
  await antor.getByRole('menuitemradio', { name: 'Sombre' }).click();
});

test('tiroir : à 390 px la barre est cachée, « Menu » l’ouvre, Échap la ferme et rend le focus à « Menu »', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await sur(antor, urlFiche);
  const menu = antor.getByRole('button', { name: 'Menu', exact: true });
  const aside = barre(antor);
  assert.equal(await aside.isVisible(), false);
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await menu.click();
  await aside.waitFor({ state: 'visible' });
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await antor.keyboard.press('Escape');
  await aside.waitFor({ state: 'hidden' });
  assert.equal(await antor.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Menu');
});

test('tiroir : le voile ferme, une entrée navigue et ferme', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await sur(antor, urlFiche);
  const menu = antor.getByRole('button', { name: 'Menu', exact: true });
  await menu.click();
  await barre(antor).waitFor({ state: 'visible' });
  await antor.mouse.click(385, 400); // on the veil, right of the drawer
  await barre(antor).waitFor({ state: 'hidden' });
  await menu.click();
  await barre(antor).getByRole('link', { name: rxExact('Lieux') }).click();
  await attendre(antor);
  assert.match(antor.url(), /\/lieux/);
  await barre(antor).waitFor({ state: 'hidden' });
});

test('tiroir : au bureau, pas de bouton « Menu » et la barre est affichée', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await sur(antor, urlFiche);
  assert.equal(await antor.getByRole('button', { name: 'Menu', exact: true }).isVisible(), false);
  assert.equal(await barre(antor).isVisible(), true);
});

test('hors univers : barre réduite, sans sélecteur ni items de l’univers', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await sur(antor, '/');
  const b = barre(antor);
  await b.getByRole('link', { name: /Mes univers/ }).first().waitFor();
  await b.getByRole('button', { name: /antor|lea|léa/i }).waitFor();
  for (const mot of ['Personnages', 'Campagnes', 'Membres', 'Vue d’ensemble']) {
    assert.equal(await b.getByRole('link', { name: rxExact(mot) }).count(), 0, mot);
  }
  assert.equal(await b.getByRole('button', { name: /changer d’univers|Univers/ }).count(), 0);
  assert.equal(await antor.getByRole('radiogroup').count(), 0);
  assert.match(await texte(antor), /Mes univers/);
});

test('refus : une page d’univers inconnu a la barre réduite, sans nom d’univers', opts, async () => {
  await sur(antor, '/univers/9999/personnages');
  const b = barre(antor);
  await b.getByRole('link', { name: /Mes univers/ }).first().waitFor();
  assert.equal(await b.getByRole('link', { name: rxExact('Personnages') }).count(), 0);
  assert.equal(await b.getByText('Lame d’Ébène').count(), 0);
});

test('Joueur : la barre n’a ni Membres ni Paramètres, le compte reste', opts, async () => {
  await sur(lea, urlUnivers);
  const b = barre(lea);
  assert.equal(await b.getByRole('link', { name: rxExact('Membres') }).count(), 0);
  assert.equal(await b.getByRole('link', { name: rxExact('Paramètres') }).count(), 0);
  await b.getByRole('button', { name: /antor|lea|léa/i }).click();
  await lea.getByRole('menuitem', { name: 'Se déconnecter' }).waitFor();
});

test('barre latérale : sur une fiche, le type de la fiche est l’item courant et lui seul', opts, async () => {
  await sur(antor, urlFiche);
  const courants = barre(antor).locator('[aria-current="page"]');
  await courants.first().waitFor();
  assert.equal(await courants.count(), 1);
  assert.match(await courants.innerText(), /^\s*Personnages\s*$/);
});

test('thème : sans choix mémorisé, Système suit la préférence du navigateur', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Antor');
  for (const [pref, attendu] of [['light', 'light'], ['dark', 'dark']] as const) {
    await page.emulateMedia({ colorScheme: pref });
    await page.evaluate(() => localStorage.clear());
    await sur(page, urlFiche);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), attendu);
    await ouvrirCompte(page);
    assert.equal(await page.getByRole('menuitemradio', { name: 'Système' }).getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Escape');
  }
  await ctx.close();
});

test('cadre : la colonne de lecture est centrée dans l’aire à droite de la barre', opts, async () => {
  await antor.setViewportSize({ width: 1920, height: 1000 });
  await sur(antor, urlFiche);
  const m = await antor.evaluate(() => {
    const r = (document.querySelector('main.principal') as HTMLElement).getBoundingClientRect();
    const b = (document.querySelector('aside') as HTMLElement).getBoundingClientRect();
    return { gauche: r.left - b.right, droite: window.innerWidth - r.right, largeur: r.width };
  });
  assert.ok(m.largeur <= 1001, `column capped (${m.largeur})`);
  assert.ok(Math.abs(m.gauche - m.droite) <= 2, `centered: ${m.gauche} vs ${m.droite}`);
  await antor.setViewportSize({ width: 1440, height: 900 });
});

test('barre haute : la Vue d’ensemble (E-3) a le fil « univers › Vue d’ensemble », dernier maillon page courante sans lien', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await sur(antor, urlUnivers);
  const fil = antor.getByRole('navigation', { name: /Ariane/ });
  assert.equal((await fil.innerText()).replace(/\s+/g, ' ').trim(), 'L Lame d’Ébène Vue d’ensemble');
  assert.equal(await fil.locator('[aria-current="page"]').innerText(), 'Vue d’ensemble');
  assert.equal(await fil.getByRole('link', { name: /Vue d’ensemble/ }).count(), 0);
  await fil.getByRole('link', { name: /Lame d’Ébène/ }).waitFor();
});

test('barre haute : les autres fils ne gagnent pas de « Vue d’ensemble » (liste d’un type, membres, fiche)', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  for (const [url, attendu] of [
    [`${urlUnivers}/fiches/personnages`, 'L Lame d’Ébène Personnages'],
    [`${urlUnivers}/membres`, 'L Lame d’Ébène Membres'],
    [urlFiche, 'L Lame d’Ébène Personnages Maître Aldric'],
  ] as const) {
    await sur(antor, url);
    const t = (await antor.getByRole('navigation', { name: /Ariane/ }).innerText()).replace(/\s+/g, ' ').trim();
    assert.equal(t, attendu, url);
  }
});
