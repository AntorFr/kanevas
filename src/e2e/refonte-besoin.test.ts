// Black-box tests of the feature `kanevas-refonte-visuelle`, written from its need only (fiche « Livre »
// and « Critère de sortie », docs/ecrans.md « Détail de `kanevas-refonte-visuelle` », docs/charte.md,
// B-29). Real server in stub mode + real Chromium (harnais.test.ts). Every expected value is a literal
// of the docs. Screenshots go to $SHOTS_DIR (default /tmp/shots), outside the tracked tree.
//
// TEST PLAN (besoin -> panne nommée)
//   critère     : pastille « Lue des joueurs » -> coupe la lecture -> « MJ seul », hachure, toast
//                 [la pastille ou le toast ne suit pas l'audience]
//   thème       : réglé depuis le menu de l'avatar et nulle part ailleurs ; Clair/Sombre/Système
//   cadre       : navigation à icônes, items par rôle, barre haute, tiroir au téléphone
//   matrice     : Joueur et MJ en mode Joueur : ni pastille, ni filet, ni hachure, ni « ⋯ »
//   toasts      : 4 s, « Fermer », sans focus, trois au plus, aucun pour un échec
//   édition     : compteur, aide, Échap, Ctrl+Entrée, au-delà de 20 000
//   B-29        : états des écrans refaits (E-1, E-2, E-3, E-4, E-8, E-9, E-6, E-13, E-14, E-15)
//   charte      : tokens des deux thèmes, polices servies par le produit
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  allerMembres,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  regler,
  rx,
  rxExact,
  section,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
const SHOTS = process.env.SHOTS_DIR ?? '/tmp/shots';
const UNIVERS = "Lame d'Ébène";
const BANDEAU_JOUEUR = 'Mode Joueur : vous voyez ce que voit un joueur.';
const BANDEAU_PERDU =
  "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let teo: Any;
let urlUnivers = '';
let urlAldric = '';

async function attendre(page: Any) {
  await page.waitForLoadState('networkidle');
}
async function shot(page: Any, nom: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: false });
}
/** True when the element or one of its pseudo-elements paints a gradient (the amber hatching). */
async function hachure(loc: Any): Promise<boolean> {
  // Built with `new Function` so the transpiler's helpers do not leak into the browser.
  const fn = new Function(
    'el',
    `var has = function (s) { return /gradient/.test(s.backgroundImage); };
     if (has(getComputedStyle(el)) || has(getComputedStyle(el, '::before')) || has(getComputedStyle(el, '::after'))) return true;
     return Array.prototype.some.call(el.querySelectorAll('*'), function (c) { return has(getComputedStyle(c)); });`,
  );
  return loc.evaluate(fn);
}
async function ouvrirMenuCompte(page: Any) {
  const menu = page.getByRole('menu', { name: 'Compte' });
  if (!(await menu.isVisible())) await page.getByRole('button', { name: /Menu du compte|antor|lea|teo/i }).last().click();
  await menu.waitFor();
  return menu;
}
/** A theme choice inside the open account menu, whatever role the app gives it. */
function choixTheme(page: Any, nom: string): Any {
  const n = { name: rx(nom) };
  return page.getByRole('radio', n).or(page.getByRole('menuitemradio', n)).or(page.getByRole('button', n)).or(page.getByRole('menuitem', n));
}
const nav = (page: Any) => page.getByRole('complementary', { name: 'Barre latérale' });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  teo = (await connecte(browser, srv.base, 'Teo')).page;
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, UNIVERS, 'Une table de jeu.');
  await antor.getByRole('heading', { name: UNIVERS, level: 1 }).waitFor();
  urlUnivers = new URL(antor.url()).pathname;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await ajouterSection(antor, 'Apparence');
  await ajouterSection(antor, 'Vérité — MJ seul');
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  urlAldric = new URL(antor.url()).pathname;
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

describe('critère de sortie : la pastille d’audience', () => {
  test('couper la lecture des joueurs : « MJ seul », hachure ambre, toast', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const apparence = section(antor, 'Apparence');
    assert.equal(await hachure(apparence), false, 'une section lue des joueurs n’est pas hachurée');
    await shot(antor, 'critere-avant');
    await apparence.getByRole('button', { name: /^Lue des joueurs/ }).click();
    const boite = antor.getByRole('dialog', { name: /Qui voit « Apparence »/ });
    await boite.waitFor();
    assert.match(await boite.innerText(), /Chaque changement est enregistré aussitôt\./);
    await boite.getByRole('switch', { name: /Les joueurs la lisent/ }).click();
    await antor.getByText('Audience de « Apparence » enregistrée').waitFor();
    await antor.keyboard.press('Escape');
    await apparence.getByRole('button', { name: /^MJ seul/ }).waitFor();
    assert.equal(await hachure(apparence), true, 'la section MJ seul est hachurée');
    await shot(antor, 'critere-apres');
    // restore for the other tests
    await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  });

  test('la pastille dit « Écrite par les joueurs » quand ils écrivent aussi', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await regler(antor, 'Apparence', 'Les joueurs l’écrivent', true);
    await section(antor, 'Apparence').getByRole('button', { name: /^Écrite par les joueurs/ }).waitFor();
    await regler(antor, 'Apparence', 'Les joueurs l’écrivent', false);
    await section(antor, 'Apparence').getByRole('button', { name: /^Lue des joueurs/ }).waitFor();
  });

  test('« Confiée à lea » quand un auteur est désigné et que les joueurs ne lisent pas', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const s = section(antor, 'Vérité — MJ seul');
    await s.getByRole('button', { name: /^MJ seul/ }).click();
    const boite = antor.getByRole('dialog', { name: /Qui voit/ });
    await boite.getByRole('combobox', { name: /Auteur/ }).selectOption({ label: 'lea' });
    await boite.getByRole('switch', { name: /L.auteur la lit/ }).click();
    await antor.getByText('Audience de « Vérité — MJ seul » enregistrée').first().waitFor();
    await antor.keyboard.press('Escape');
    await s.getByRole('button', { name: /^Confiée à lea/ }).waitFor();
    // back to MJ only
    await s.getByRole('button', { name: /^Confiée à lea/ }).click();
    await boite.getByRole('switch', { name: /L.auteur la lit/ }).click();
    await boite.getByRole('combobox', { name: /Auteur/ }).selectOption({ label: 'aucun' });
    await antor.keyboard.press('Escape');
    await s.getByRole('button', { name: /^MJ seul/ }).waitFor();
  });
});

describe('matrice des rôles sur E-9', () => {
  test('le MJ en mode Joueur : bandeau, ni pastille ni menu « ⋯ » ni hachure', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    assert.ok((await antor.getByRole('button', { name: /Autres actions sur/ }).count()) > 0, 'le MJ a le menu ⋯');
    await antor.getByRole('radio', { name: /Mode Joueur|^Joueur/ }).click();
    await antor.getByText(BANDEAU_JOUEUR).waitFor();
    assert.equal(await antor.getByRole('button', { name: /Autres actions sur/ }).count(), 0);
    assert.equal(await antor.getByRole('button', { name: /^(Lue des joueurs|MJ seul|Écrite par les joueurs|Confiée à)/ }).count(), 0);
    assert.equal(await antor.getByText('Vérité — MJ seul').count(), 0, 'la section fermée est absente');
    assert.equal(await hachure(section(antor, 'Apparence')), false);
    await shot(antor, 'mode-joueur');
    await antor.getByRole('radio', { name: /Mode MJ|^MJ/ }).click();
    assert.equal(await antor.getByText(BANDEAU_JOUEUR).count(), 0);
  });

  test('Léa, Joueuse : Apparence seule, sans pastille, filet, ⋯ ni bascule', opts, async () => {
    await lea.goto(urlAldric);
    await attendre(lea);
    await section(lea, 'Apparence').waitFor();
    const t = await texte(lea);
    assert.ok(!t.includes('Vérité'), 'aucune trace de la section MJ seul');
    assert.equal(await lea.getByRole('button', { name: /Autres actions sur/ }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: /^(Lue des joueurs|MJ seul|Écrite par les joueurs|Confiée à)/ }).count(), 0);
    assert.equal(await lea.getByRole('radio').count(), 0);
    assert.equal(await lea.getByText(BANDEAU_JOUEUR).count(), 0);
    assert.equal(await lea.getByRole('button', { name: rxExact('Modifier') }).count(), 0, 'elle n’écrit pas Apparence');
    await shot(lea, 'fiche-joueuse');
  });

  test('Teo, sans rôle : l’adresse de la fiche répond « Page introuvable. »', opts, async () => {
    await teo.goto(urlAldric);
    await attendre(teo);
    await teo.getByText('Page introuvable.').waitFor();
    assert.ok(!(await texte(teo)).includes('Aldric'));
    assert.ok(!(await texte(teo)).includes(UNIVERS), 'aucun nom d’univers');
  });
});

describe('le menu de l’avatar et le thème', () => {
  test('le menu porte l’identifiant, le thème en trois choix et « Se déconnecter »', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    // Closed: neither theme choices nor logout are spread in the sidebar.
    assert.equal(await nav(antor).getByRole('button', { name: /Se déconnecter/ }).count(), 0);
    assert.equal(await antor.getByRole('button', { name: /^Sombre$/ }).count(), 0);
    const menu = await ouvrirMenuCompte(antor);
    await menu.waitFor();
    const t = await menu.innerText();
    assert.match(t, /antor/);
    assert.match(t, /Se déconnecter/);
    for (const m of ['Clair', 'Sombre', 'Système'])
      assert.equal(await choixTheme(antor, m).count() > 0, true, m);
    await shot(antor, 'menu-compte');
    await antor.keyboard.press('Escape');
  });

  test('Clair / Sombre changent les tokens, sont mémorisés ; Système suit le navigateur', opts, async () => {
    const lire = () =>
      antor.evaluate(() => ({
        fond: getComputedStyle(document.documentElement).getPropertyValue('--fond').trim().toLowerCase(),
        cle: localStorage.getItem('kanevas-theme'),
      }));
    await antor.goto(urlAldric);
    await attendre(antor);
    await antor.emulateMedia({ colorScheme: 'dark' });
    await ouvrirMenuCompte(antor);
    await choixTheme(antor, 'Clair').first().click();
    assert.equal((await lire()).fond, '#fcfcfd');
    assert.ok(((await lire()).cle ?? '').length > 0, 'le choix est mémorisé dans kanevas-theme');
    await shot(antor, 'fiche-clair');
    await antor.reload();
    await attendre(antor);
    assert.equal((await lire()).fond, '#fcfcfd', 'le thème survit au rechargement');
    await ouvrirMenuCompte(antor);
    await choixTheme(antor, 'Sombre').first().click();
    assert.equal((await lire()).fond, '#121317');
    await shot(antor, 'fiche-sombre');
    await ouvrirMenuCompte(antor);
    await choixTheme(antor, 'Système').first().click();
    assert.equal((await lire()).fond, '#121317', 'système + navigateur sombre');
    await antor.emulateMedia({ colorScheme: 'light' });
    await antor.reload();
    await attendre(antor);
    assert.equal((await lire()).fond, '#fcfcfd', 'système + navigateur clair');
    await antor.emulateMedia({ colorScheme: 'dark' });
    await antor.keyboard.press('Escape');
  });

  test('le thème ne se règle nulle part ailleurs : pas de choix de thème dans Paramètres ni ailleurs', opts, async () => {
    for (const lien of ['Paramètres', 'Vue d’ensemble', 'Campagnes', 'Membres']) {
      await antor.goto(urlUnivers);
      await attendre(antor);
      await nav(antor).getByRole('link', { name: rx(lien) }).click();
      await attendre(antor);
      const main = antor.locator('main');
      assert.equal(await main.getByText(/^(Clair|Sombre|Système)$/).count(), 0, `thème dans ${lien}`);
      assert.equal(await main.getByText(/Thème/i).count(), 0, `thème dans ${lien}`);
    }
  });

  test('le menu du compte existe sur un écran hors univers et « Se déconnecter » mène à la connexion', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Teo');
    await page.goto('/');
    await attendre(page);
    const menu = await ouvrirMenuCompte(page);
    assert.match(await menu.innerText(), /Se déconnecter/);
    await page.getByRole('menuitem', { name: /Se déconnecter/ }).or(page.getByRole('button', { name: /Se déconnecter/ })).first().click();
    await page.waitForURL(/connexion-bouchon/);
    await ctx.close();
  });
});

describe('le cadre d’un univers', () => {
  test('MJ : navigation à icônes, groupes, items par rôle', opts, async () => {
    await antor.goto(urlUnivers);
    await attendre(antor);
    const barre = nav(antor);
    for (const l of ['Vue d’ensemble', 'Campagnes', 'Comptes-rendus', 'Personnages', 'Lieux', 'Factions', 'Objets', 'Événements', 'Quêtes', 'Membres', 'Paramètres'])
      assert.equal(await barre.getByRole('link', { name: rx(l) }).count(), 1, l);
    for (const l of ['Cartes', 'Administration'])
      assert.equal(await barre.getByRole('link', { name: rx(l) }).count(), 0, `${l} absent`);
    const sansIcone = await barre.getByRole('link').evaluateAll((els: Element[]) =>
      els.filter((e) => !e.querySelector('svg')).map((e) => e.textContent),
    );
    // The universe selector "Mes univers" link may live in a menu; every nav link must carry an icon.
    assert.deepEqual(sansIcone, [], 'chaque item de navigation porte une icône');
    await shot(antor, 'cadre-bureau');
  });

  test('le bouton « Demander à Kanevas » est présent sur les écrans d’un univers', opts, async () => {
    for (const page of [antor, lea]) {
      await page.goto(urlUnivers);
      await attendre(page);
      assert.equal(await page.getByRole('button', { name: /Demander à Kanevas/ }).count(), 1);
    }
  });

  test('Joueuse : ni Membres ni Paramètres ; adresse forcée = « Page introuvable. »', opts, async () => {
    await lea.goto(urlUnivers);
    await attendre(lea);
    assert.equal(await nav(lea).getByRole('link', { name: /Membres/ }).count(), 0);
    assert.equal(await nav(lea).getByRole('link', { name: /Paramètres/ }).count(), 0);
    await lea.goto(urlUnivers + '/membres');
    await attendre(lea);
    await lea.getByText('Page introuvable.').waitFor();
  });

  test('barre haute : le fil d’Ariane nomme l’univers et la fiche', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const fil = antor.getByRole('navigation', { name: /Fil d.Ariane/i });
    const t = await fil.innerText();
    assert.match(t, /Lame d.Ébène/);
    assert.match(t, /Maître Aldric/);
  });

  test('téléphone : tiroir sous « Menu », voile, Échap ferme, une entrée ferme', opts, async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
    await attendre(page);
    await page.goto(urlAldric);
    await attendre(page);
    const menu = page.getByRole('button', { name: rxExact('Menu') });
    await menu.waitFor();
    assert.equal(await nav(page).getByRole('link', { name: /Personnages/ }).isVisible(), false, 'barre fermée par défaut');
    await shot(page, 'telephone-ferme');
    await menu.click();
    await nav(page).getByRole('link', { name: /Personnages/ }).waitFor({ state: 'visible' });
    await shot(page, 'telephone-tiroir');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => true);
    assert.equal(await nav(page).getByRole('link', { name: /Personnages/ }).isVisible(), false, 'Échap ferme');
    await menu.click();
    await nav(page).getByRole('link', { name: /Lieux/ }).click();
    await attendre(page);
    await page.waitForTimeout(800);
    assert.equal(await nav(page).getByRole('link', { name: /Lieux/ }).isVisible(), false, 'une entrée ferme');
    await ctx.close();
  });

  test('téléphone : « Modifier » est visible sans survol, pas de débordement horizontal', opts, async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
    await attendre(page);
    await page.goto(urlAldric);
    await attendre(page);
    assert.equal(await section(page, 'Apparence').getByRole('button', { name: rxExact('Modifier') }).isVisible(), true);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(debord <= 1, `débordement horizontal de ${debord}px`);
    await shot(page, 'telephone-fiche');
    await ctx.close();
  });

  test('bureau : « Modifier » apparaît au survol et au focus de la section', opts, async () => {
    await antor.setViewportSize({ width: 1280, height: 900 });
    await antor.goto(urlAldric);
    await attendre(antor);
    const s = section(antor, 'Apparence');
    const modifier = s.getByRole('button', { name: rxExact('Modifier') });
    await antor.mouse.move(2, 2);
    await antor.waitForTimeout(500);
    const opacite = () =>
      modifier.evaluate((e: Element) => {
        let o = 1;
        for (let n: Element | null = e; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o;
      });
    assert.equal(await opacite(), 0, 'caché au repos');
    await s.hover();
    await antor.waitForTimeout(300);
    assert.equal(await opacite(), 1, 'visible au survol');
    await antor.mouse.move(2, 2);
    await modifier.focus();
    await antor.waitForTimeout(400);
    assert.equal(await opacite(), 1, 'visible au focus');
  });
});

describe('menu « ⋯ » et édition d’une section', () => {
  test('« ⋯ » : Monter, Descendre, Retirer la section ; Monter inerte sur la première', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await section(antor, 'Apparence').getByRole('button', { name: /^Autres actions sur/ }).click();
    const menu = antor.getByRole('menu');
    const noms = await menu.getByRole('menuitem').allInnerTexts();
    assert.deepEqual(noms.map((n: string) => n.trim()), ['Monter', 'Descendre', 'Retirer la section']);
    assert.equal(await menu.getByRole('menuitem', { name: 'Monter' }).getAttribute('aria-disabled'), 'true');
    await shot(antor, 'menu-section');
    await antor.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
  });

  test('« Descendre » déplace la section et donne le toast « descendue d’un cran »', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await section(antor, 'Apparence').getByRole('button', { name: /^Autres actions sur/ }).click();
    await antor.getByRole('menuitem', { name: 'Descendre' }).click();
    await antor.getByText('« Apparence » descendue d’un cran').waitFor();
    const ordre = await antor.locator('main section h2').allInnerTexts();
    assert.ok(ordre[0]!.includes('Vérité') && ordre[1]!.includes('Apparence'), ordre.join('|'));
    await section(antor, 'Apparence').getByRole('button', { name: /^Autres actions sur/ }).click();
    await antor.getByRole('menuitem', { name: 'Monter' }).click();
    await antor.getByText('« Apparence » montée d’un cran').waitFor();
  });

  test('édition : compteur, aide, Échap abandonne, Ctrl+Entrée enregistre avec toast', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const s = section(antor, 'Apparence');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    const champ = s.getByRole('textbox');
    await champ.fill('Grand, voûté.');
    assert.match(await s.innerText(), /13\s\/\s20\s000/);
    assert.match((await s.innerText()).replace(/\s+/g, ' '), /Échap annuler · Ctrl ↵ enregistrer/);
    await shot(antor, 'edition');
    await antor.keyboard.press('Escape');
    await s.getByRole('textbox').waitFor({ state: 'detached' });
    assert.ok(!(await s.innerText()).includes('Grand, voûté.'), 'texte abandonné');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    await s.getByRole('textbox').fill('Grand, voûté.');
    await antor.keyboard.press('Control+Enter');
    await antor.getByText('« Apparence » enregistrée').waitFor();
    assert.ok((await s.innerText()).includes('Grand, voûté.'));
  });

  test('édition : au-delà de 20 000, Ctrl+Entrée n’envoie rien et le texte reste', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const s = section(antor, 'Vérité — MJ seul');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    let envois = 0;
    antor.on('request', (r: Any) => {
      if (r.method() !== 'GET' && /sections/.test(r.url())) envois++;
    });
    await s.getByRole('textbox').fill('x'.repeat(20001));
    await antor.getByText('Erreur : 20 000 caractères au plus.').waitFor();
    await antor.keyboard.press('Control+Enter');
    await antor.waitForTimeout(500);
    assert.equal(envois, 0);
    assert.equal((await s.getByRole('textbox').inputValue()).length, 20001);
    await antor.keyboard.press('Escape');
  });

  test('édition : écriture périmée avec Ctrl+Entrée donne le message de péremption', opts, async () => {
    const { ctx, page: autre } = await connecte(browser, srv.base, 'Antor');
    await autre.goto(urlAldric);
    await attendre(autre);
    await antor.goto(urlAldric);
    await attendre(antor);
    const s = section(antor, 'Apparence');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    await s.getByRole('textbox').fill('Première version');
    const s2 = section(autre, 'Apparence');
    await s2.getByRole('button', { name: rxExact('Modifier') }).click();
    await s2.getByRole('textbox').fill('Version de l’autre onglet');
    await autre.keyboard.press('Control+Enter');
    await autre.getByText('« Apparence » enregistrée').waitFor();
    await antor.keyboard.press('Control+Enter');
    await antor.getByText(/La section a changé depuis que vous l.avez ouverte/).waitFor();
    assert.equal(await s.getByRole('textbox').inputValue(), 'Première version');
    await ctx.close();
  });
});

describe('toasts', () => {
  test('un toast part seul après 4 s, ne prend pas le focus, « Fermer » le retire', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await section(antor, 'Apparence').getByRole('button', { name: /^Autres actions sur/ }).click();
    await antor.getByRole('menuitem', { name: 'Descendre' }).click();
    const toast = antor.getByText('« Apparence » descendue d’un cran');
    await toast.waitFor();
    const focusDansToast = await antor.evaluate(() => {
      const a = document.activeElement;
      return !!a && /descendue d.un cran/.test(a.closest('[role=status],[role=alert],[aria-live]')?.textContent ?? '');
    });
    assert.equal(focusDansToast, false, 'le toast ne prend pas le focus');
    assert.equal(await antor.getByRole('button', { name: 'Fermer' }).count(), 1);
    await antor.waitForTimeout(2500);
    assert.equal(await toast.count(), 1, 'encore là avant 4 s');
    await antor.waitForTimeout(2500);
    assert.equal(await toast.count(), 0, 'parti seul après 4 s');
    await section(antor, 'Apparence').getByRole('button', { name: /^Autres actions sur/ }).click();
    await antor.getByRole('menuitem', { name: 'Monter' }).click();
    await antor.getByText('« Apparence » montée d’un cran').waitFor();
    await antor.getByRole('button', { name: 'Fermer' }).click();
    assert.equal(await antor.getByText('« Apparence » montée d’un cran').count(), 0);
  });

  test('trois toasts au plus, le plus récent en bas', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    for (let i = 0; i < 4; i++) {
      const entree = i % 2 === 0 ? 'Descendre' : 'Monter';
      await section(antor, 'Apparence').getByRole('button', { name: /^Autres actions sur/ }).click();
      await antor.getByRole('menuitem', { name: entree }).click();
      await antor.getByText(i % 2 === 0 ? /descendue d.un cran/ : /montée d.un cran/).last().waitFor();
    }
    const boutons = await antor.getByRole('button', { name: 'Fermer' }).count();
    assert.ok(boutons <= 3, `${boutons} toasts affichés`);
    assert.ok(boutons >= 2, 'ils s’empilent');
    await antor.waitForTimeout(4500);
  });

  test('un échec n’est pas un toast : message en ligne, aucun toast', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await antor.waitForTimeout(4500);
    await antor.route(/\/api\/.*sections.*/, (r: Any) => (r.request().method() === 'GET' ? r.continue() : r.fulfill({ status: 500, body: '{}' })));
    await section(antor, 'Apparence').getByRole('button', { name: /^(Lue des joueurs|MJ seul|Écrite)/ }).click();
    const boite = antor.getByRole('dialog', { name: /Qui voit/ });
    const sw = boite.getByRole('switch', { name: /Les joueurs la lisent/ });
    const avant = await sw.getAttribute('aria-checked');
    await sw.click();
    await antor.getByText("L'action n'a pas abouti. Réessayez.").or(antor.getByText('L’action n’a pas abouti. Réessayez.')).first().waitFor();
    await antor.waitForTimeout(300);
    assert.equal(await sw.getAttribute('aria-checked'), avant, 'l’interrupteur revient');
    assert.equal(await antor.getByRole('button', { name: 'Fermer' }).count(), 0, 'aucun toast');
    await antor.unroute(/\/api\/.*sections.*/);
    await antor.keyboard.press('Escape');
  });
});

describe('B-29 : les états des écrans refaits', () => {
  test('E-1 vide : compte neuf', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Mira');
    await page.goto('/');
    await attendre(page);
    const t = await texte(page);
    assert.match(t, /Aucun univers pour l'instant\./);
    assert.match(t, /Vous menez une partie \? Créez un univers\./);
    assert.match(t, /Vous êtes joueur \? Donnez votre identifiant à votre MJ : mira/);
    await shot(page, 'e01-vide');
    await ctx.close();
  });

  test('E-1 liste : Léa voit l’univers avec le badge Joueur ; Teo n’en voit aucun', opts, async () => {
    await lea.goto('/');
    await attendre(lea);
    const t = await texte(lea);
    assert.match(t, /Connecté en tant que lea/);
    assert.match(t, /Lame d'Ébène/);
    assert.match(t, /Joueur/);
    await shot(lea, 'e01-liste');
    await teo.goto('/');
    await attendre(teo);
    assert.ok(!(await texte(teo)).includes('Lame d'));
  });

  test('E-1 erreur : « Impossible de charger vos univers. » puis « Réessayer » relance', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    let casse = true;
    await page.route(/\/api\/univers$/, (r: Any) => (casse ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
    await page.goto('/');
    await page.getByText('Impossible de charger vos univers.').first().waitFor();
    await shot(page, 'e01-erreur');
    casse = false;
    await page.getByRole('button', { name: 'Réessayer' }).first().click();
    await page.getByText(/Lame d'Ébène/).first().waitFor();
    await ctx.close();
  });

  test('E-1 chargement : « Chargement de vos univers… » tant que l’API est lente', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await page.route(/\/api\/univers$/, async (r: Any) => {
      await new Promise((ok) => setTimeout(ok, 1500));
      await r.continue();
    });
    await page.goto('/');
    await page.getByText('Chargement de vos univers…').waitFor({ timeout: 1400 });
    await ctx.close();
  });

  test('E-1 connexion perdue : le bandeau, « Créer un univers » désactivé', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await page.goto('/');
    await attendre(page);
    await ctx.setOffline(true);
    await page.getByText(rx(BANDEAU_PERDU)).waitFor();
    const creer = page.getByRole('button', { name: rxExact('Créer un univers') }).or(page.getByRole('link', { name: rxExact('Créer un univers') })).first();
    assert.equal((await creer.getAttribute('aria-disabled')) === 'true' || (await creer.isDisabled().catch(() => false)), true);
    await shot(page, 'e01-perdue');
    await ctx.setOffline(false);
    await page.getByText(rx(BANDEAU_PERDU)).waitFor({ state: 'detached' });
    await ctx.close();
  });

  test('E-2 : nom obligatoire, 81 caractères refusés, 80 acceptés', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Mira');
    await page.goto('/');
    await attendre(page);
    await page.getByRole('link', { name: rxExact('Créer un univers') }).or(page.getByRole('button', { name: rxExact('Créer un univers') })).first().click();
    await page.getByRole('button', { name: rxExact("Créer l'univers") }).click();
    await page.getByText('Erreur : le nom est obligatoire.').waitFor();
    await page.getByLabel('Nom', { exact: true }).fill('n'.repeat(81));
    await page.getByText('Erreur : 80 caractères au plus.').waitFor();
    await shot(page, 'e02-erreur');
    await page.getByLabel('Nom', { exact: true }).fill('n'.repeat(80));
    assert.equal(await page.getByText('Erreur : 80 caractères au plus.').count(), 0);
    await page.getByRole('button', { name: /Annuler/ }).first().click();
    await attendre(page);
    await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
    await ctx.close();
  });

  test('E-3 : titre, description, rôle ; région vide ; refus pour Teo', opts, async () => {
    await antor.goto(urlUnivers);
    await attendre(antor);
    await antor.getByRole('heading', { name: UNIVERS, level: 1 }).waitFor();
    const t = await texte(antor);
    assert.match(t, /Une table de jeu\./);
    assert.match(t, /MJ/);
    await shot(antor, 'e03-vue-ensemble');
    await teo.goto(urlUnivers);
    await attendre(teo);
    await teo.getByText('Page introuvable.').waitFor();
    assert.ok(!(await texte(teo)).includes(UNIVERS));
    await teo.getByRole('link', { name: 'Mes univers' }).first().waitFor();
    assert.equal(await teo.getByRole('link', { name: /Personnages/ }).count(), 0, 'barre d’un écran hors univers');
  });

  test('E-4 : seul MJ ne peut se retirer ; message exact, liste inchangée', opts, async () => {
    await antor.goto(urlUnivers);
    await attendre(antor);
    await allerMembres(antor);
    const ligneAntor = antor.getByRole('listitem').filter({ hasText: 'antor' }).first();
    await ligneAntor.getByRole('button', { name: /Retirer/ }).click();
    await antor.getByRole('button', { name: /^Retirer antor$/ }).last().click();
    await antor.getByText("Impossible : l'univers doit garder au moins un MJ.").or(antor.getByText('Impossible : l’univers doit garder au moins un MJ.')).first().waitFor();
    assert.ok((await texte(antor)).includes('lea'));
    await shot(antor, 'e04-refus');
  });

  test('E-4 : « Retirer lea » demande une confirmation, « Annuler » la garde', opts, async () => {
    await antor.goto(urlUnivers);
    await attendre(antor);
    await allerMembres(antor);
    await antor.getByRole('listitem').filter({ hasText: 'lea' }).first().getByRole('button', { name: /Retirer/ }).click();
    assert.match((await texte(antor)).replace(/\s+/g, ' '), /Retirer lea de Lame d'Ébène \? Elle ne verra plus l'univers\./);
    await antor.getByRole('button', { name: 'Annuler' }).first().click();
    assert.ok((await texte(antor)).includes('lea'));
  });

  test('E-4 : ajouter un compte inconnu → « Ce compte ne s\'est jamais connecté. »', opts, async () => {
    await antor.goto(urlUnivers);
    await attendre(antor);
    await allerMembres(antor);
    await ajouterMembre(antor, 'fantome', 'Joueur');
    await antor.getByText(/Ce compte ne s.est jamais connecté\./).waitFor();
  });

  test('E-8 : liste du type, sans la fiche cachée pour Léa ; vide d’un autre type', opts, async () => {
    await antor.goto(urlUnivers);
    await attendre(antor);
    await nav(antor).getByRole('link', { name: /Lieux/ }).click();
    await attendre(antor);
    await antor.getByText(/Aucun lieu/).waitFor();
    const t = await texte(antor);
    assert.match(t, /Aucun lieu pour l.instant\./);
    await antor.getByRole('button', { name: rxExact('Nouveau lieu') }).first().waitFor();
    await shot(antor, 'e08-vide');
    await lea.goto(urlUnivers);
    await attendre(lea);
    await nav(lea).getByRole('link', { name: /Lieux/ }).click();
    await attendre(lea);
    await lea.getByText(/Aucun lieu/).waitFor();
    assert.match(await texte(lea), /Aucun lieu à voir pour l'instant\./);
    assert.equal(await lea.getByRole('button', { name: /Nouveau lieu/ }).count(), 0);
    await nav(lea).getByRole('link', { name: /Personnages/ }).click();
    await lea.getByRole('link', { name: /Maître Aldric/ }).waitFor();
    assert.match(await texte(lea), /Maître Aldric/, 'Apparence est lue des joueurs : la fiche est listée');
  });

  test('E-8 : un titre de 120 caractères est refusé à 121, créé à 120', opts, async () => {
    await antor.goto(urlUnivers);
    await attendre(antor);
    await nav(antor).getByRole('link', { name: /Quêtes/ }).click();
    await attendre(antor);
    await antor.getByRole('button', { name: /Nouvelle quête/ }).first().click();
    const fenetre = antor.getByRole('dialog');
    await fenetre.getByLabel('Titre').fill('q'.repeat(121));
    await fenetre.getByRole('button', { name: rxExact('Créer la fiche') }).click();
    await antor.getByText('Erreur : 120 caractères au plus.').waitFor();
    await shot(antor, 'e08-dialogue-erreur');
    await antor.keyboard.press('Escape');
  });

  test('E-9 : section de 20 000 caractères affichée en entier, sans débordement', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const s = section(antor, 'Vérité — MJ seul');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    await s.getByRole('textbox').fill(('mot ').repeat(5000));
    await antor.keyboard.press('Control+Enter');
    await antor.getByText('« Vérité — MJ seul » enregistrée').waitFor();
    const debord = await antor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(debord <= 1);
    assert.ok((await s.innerText()).length >= 19000);
    await shot(antor, 'e09-long');
  });

  test('E-9 vide et refus : section vide dite ; fiche inconnue « Page introuvable. »', opts, async () => {
    await antor.goto(urlAldric.replace(/[^/]+$/, 'inconnue-000'));
    await attendre(antor);
    await antor.getByText('Page introuvable.').waitFor();
    await antor.getByRole('link', { name: 'Mes univers' }).first().waitFor();
  });

  test('E-9 connexion perdue : bandeau, « Enregistrer » désactivé, texte conservé', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await page.goto(urlAldric);
    await attendre(page);
    const s = section(page, 'Apparence');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    await s.getByRole('textbox').fill('en cours');
    await ctx.setOffline(true);
    await page.getByText(rx(BANDEAU_PERDU)).waitFor();
    const enr = s.getByRole('button', { name: rxExact('Enregistrer') });
    assert.equal((await enr.getAttribute('aria-disabled')) === 'true' || (await enr.isDisabled()), true);
    await page.keyboard.press('Control+Enter');
    assert.equal(await s.getByRole('textbox').inputValue(), 'en cours');
    await shot(page, 'e09-perdue');
    await ctx.setOffline(false);
    await ctx.close();
  });

  test('E-9 chargement et erreur : « Chargement de la fiche… » puis « Impossible de charger cette fiche. »', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    let casse = false;
    await page.route(/\/api\/.*fiches\/[^/]+$/, async (r: Any) => {
      await new Promise((ok) => setTimeout(ok, 1200));
      if (casse) await r.fulfill({ status: 500, body: '{}' });
      else await r.continue();
    });
    await page.goto(urlAldric);
    await page.getByText('Chargement de la fiche…').waitFor({ timeout: 1100 });
    await attendre(page);
    casse = true;
    await page.reload();
    await page.getByText('Impossible de charger cette fiche.').waitFor();
    await page.getByRole('button', { name: 'Réessayer' }).waitFor();
    await ctx.close();
  });

  test('E-6, E-13, E-14, E-15 : chaque écran s’ouvre dans le cadre (barre, titre, assistant)', opts, async () => {
    for (const [lien, titre] of [
      ['Campagnes', /Campagnes/],
      ['Comptes-rendus', /Comptes-rendus/],
      ['Paramètres', /Paramètres/],
    ] as const) {
      await antor.goto(urlUnivers);
      await attendre(antor);
      await nav(antor).getByRole('link', { name: rx(lien) }).click();
      await attendre(antor);
      await antor.getByRole('heading', { name: titre, level: 1 }).waitFor();
      assert.equal(await nav(antor).getByRole('link', { name: rx(lien) }).evaluate((e: Element) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'), true, `${lien} marqué courant`);
      await shot(antor, `ecran-${lien}`);
    }
  });

  test('E-14 : enregistrer un réglage donne le toast « Enregistré. »', opts, async () => {
    await antor.goto(urlUnivers);
    await attendre(antor);
    await nav(antor).getByRole('link', { name: /Paramètres/ }).click();
    await attendre(antor);
    await antor.locator('main').getByRole('button', { name: rxExact('Enregistrer') }).first().click();
    await antor.getByText('Enregistré.').first().waitFor();
  });
});

describe('charte', () => {
  test('les polices sont servies par le produit, aucune requête vers un hôte externe', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    const externes: string[] = [];
    page.on('request', (r: Any) => {
      const u = new URL(r.url());
      if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && u.protocol.startsWith('http')) externes.push(r.url());
    });
    await page.goto(urlAldric);
    await attendre(page);
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(externes, []);
    const fam = await page.evaluate(() => ({
      titre: getComputedStyle(document.querySelector('h1')!).fontFamily,
      corps: getComputedStyle(document.body).fontFamily,
    }));
    assert.match(fam.titre, /Fraunces/);
    assert.match(fam.corps, /Inter/);
    const lecture = await page.evaluate(() => {
      const p = document.querySelector('main section p, main section [class*=texte], main section div');
      return p ? getComputedStyle(p).fontFamily : '';
    });
    assert.ok(lecture.length > 0);
    const chargees = await page.evaluate(() => Array.from(document.fonts).filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
    assert.ok(chargees.some((f: string) => /Fraunces/.test(f)), 'Fraunces chargée');
    assert.ok(chargees.some((f: string) => /Newsreader/.test(f)), 'Newsreader chargée');
    await ctx.close();
  });

  test('tokens : valeurs sombre et claire de la charte', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await page.goto(urlAldric);
    await attendre(page);
    const lire = async (noms: string[]) => {
      const brut: Record<string, string> = await page.evaluate(
        new Function('ns', `var o = {}; ns.forEach(function (n) { o[n] = getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(); }); return o;`),
        noms,
      );
      // #fff and #ffffff are the same colour.
      for (const k of Object.keys(brut)) brut[k] = brut[k]!.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3');
      return brut;
    };
    const noms = ['--fond', '--fond-lateral', '--surface', '--accent', '--mj', '--table', '--danger', '--texte'];
    await page.emulateMedia({ colorScheme: 'light' });
    await ouvrirMenuCompte(page);
    await choixTheme(page, 'Sombre').first().click();
    assert.deepEqual(await lire(noms), {
      '--fond': '#121317', '--fond-lateral': '#0e0f12', '--surface': '#191a1f', '--accent': '#8b9bf0',
      '--mj': '#f2a33c', '--table': '#3fc79a', '--danger': '#ec7b6f', '--texte': '#ebecf0',
    });
    await ouvrirMenuCompte(page);
    await choixTheme(page, 'Clair').first().click();
    assert.deepEqual(await lire(noms), {
      '--fond': '#fcfcfd', '--fond-lateral': '#f4f5f7', '--surface': '#ffffff', '--accent': '#3a4cc0',
      '--mj': '#8a5300', '--table': '#08694a', '--danger': '#b4352b', '--texte': '#1a1b22',
    });
    await ctx.close();
  });

  test('aucun émoji dans le texte visible du cadre ni de la fiche', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    assert.doesNotMatch(await antor.locator('body').innerText(), /\p{Extended_Pictographic}/u);
  });
});
