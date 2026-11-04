// kanevas-refonte-visuelle, ensemble level: written from the feature's « Livre », its critère de sortie,
// docs/ecrans.md (« Détail de kanevas-refonte-visuelle », barre latérale, états) and docs/charte.md,
// without reading the code. A real Chromium on the stub app (seeded world: Lame d'Ébène, Antor MJ,
// Léa joueuse). Captures: set CAPTURES_DIR, they stay out of the tree.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, attendre, launch, rx, rxExact, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
const CAPTURES = process.env['CAPTURES_DIR'];

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
}, { timeout: 120000 });
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

async function capture(page: Any, nom: string): Promise<void> {
  if (!CAPTURES) return;
  mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: `${CAPTURES}/${nom}.png` });
}

/** The stub's sign-in buttons carry the display name (Antor, Léa, Teo, Mira, Admin). */
const NOM_AFFICHE: Record<string, string> = { antor: 'Antor', lea: 'Léa', teo: 'Teo', mira: 'Mira', admin: 'Admin' };

/** A signed-in page, optionally on a phone-sized viewport and on another server than the shared one. */
async function session(compte: string, vue: { width: number; height: number } = { width: 1280, height: 900 }, base: string = srv.base): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({ baseURL: base, viewport: vue });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: rxExact(`Se connecter en tant que ${NOM_AFFICHE[compte]}`) }).click();
  await attendre(page);
  return { ctx, page };
}
/** Tests that write run on their own server so the shared world stays the seeded one. */
async function surServeurNeuf(f: (base: string) => Promise<void>): Promise<void> {
  const s = await startServer({ KANEVAS_SANS_SEMIS: '' });
  try {
    await f(s.base);
  } finally {
    s.stop();
  }
}
const TEL = { width: 390, height: 844 };

async function ouvrirAldric(page: Any): Promise<void> {
  await page.goto('/univers/1/fiches/personnages');
  await page.getByRole('link', { name: /Maître Aldric/ }).first().click();
  await page.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await attendre(page);
}
const barre = (page: Any) => page.getByRole('complementary', { name: 'Barre latérale' });
const pastilleApparence = (page: Any) => page.getByRole('button', { name: /régler l['’]audience de « Apparence »/ });
const sectionApparence = (page: Any) => page.getByRole('region', { name: /Apparence/ });
const fond = (loc: Any) => loc.evaluate((e: Element) => getComputedStyle(e).backgroundImage);

// ---------------------------------------------------------------------------------------------
// Critère de sortie
// ---------------------------------------------------------------------------------------------

test('critère : Antor coupe la lecture des joueurs sur « Apparence » : pastille « MJ seul », hachure ambre, toast ; durable ; Léa ne la voit plus', opts, async () => {
  // Fails if the audience badge no longer opens the setting, if the badge/hatching do not follow the setting,
  // if no toast confirms, if the cut is not written, or if the refonte opened what the MJ closed.
  await surServeurNeuf(async (base) => {
    const { ctx, page } = await session('antor', undefined, base);
    await ouvrirAldric(page);
    const url = page.url();
    await sectionApparence(page).waitFor();
    assert.match(await pastilleApparence(page).innerText(), /Lue des joueurs/);
    assert.equal(await fond(sectionApparence(page)), 'none', 'une section lue des joueurs n’est pas hachurée');
    await pastilleApparence(page).click();
    const boite = page.getByRole('dialog', { name: 'Qui voit « Apparence »' });
    await boite.waitFor();
    const lecture = boite.getByRole('switch', { name: /Les joueurs la lisent/ });
    assert.equal(await lecture.getAttribute('aria-checked'), 'true');
    await lecture.click();
    await page.getByRole('status').filter({ hasText: rx('Audience de « Apparence » enregistrée') }).waitFor();
    await page.getByRole('button', { name: /^MJ seul — régler l['’]audience de « Apparence »/ }).waitFor();
    assert.match(await pastilleApparence(page).innerText(), /MJ seul/);
    assert.match(await fond(sectionApparence(page)), /gradient/, 'la section MJ seul est hachurée');
    await capture(page, 'critere-apparence-mj-seul');
    await page.reload();
    await attendre(page);
    await page.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
    assert.match(await pastilleApparence(page).innerText(), /MJ seul/, 'durable après rechargement');
    await ctx.close();
    const lea = await session('lea', undefined, base);
    await lea.page.goto(url);
    await attendre(lea.page);
    const t = await texte(lea.page);
    assert.match(t, /Page introuvable\./, 'plus rien de lisible : la fiche répond comme une adresse inconnue');
    assert.doesNotMatch(t, /Maître Aldric|Apparence|Vérité/);
    await lea.ctx.close();
  });
});

// ---------------------------------------------------------------------------------------------
// Le thème : dans le menu de l'avatar, nulle part ailleurs
// ---------------------------------------------------------------------------------------------

const ECRANS_UNIVERS: Array<[string, string]> = [
  ['E-3', '/univers/1'],
  ['E-13', '/univers/1/comptes-rendus'],
  ['E-8', '/univers/1/fiches/personnages'],
  ['E-4', '/univers/1/membres'],
  ['E-14', '/univers/1/parametres'],
];

for (const [nom, adresse] of [['E-1', '/'], ...ECRANS_UNIVERS] as Array<[string, string]>) {
  test(`${nom} : le thème et la déconnexion ne sont que dans le menu de l’avatar`, opts, async () => {
    // Fails if the sidebar/page carries the theme or the logout outside the account menu, or if the menu lacks them.
    const { ctx, page } = await session('antor');
    await page.goto(adresse);
    await attendre(page);
    await page.getByRole('navigation').first().waitFor();
    const avant = await texte(page);
    assert.doesNotMatch(avant, /Se déconnecter/, 'déconnexion étalée hors du menu');
    for (const mot of ['Clair', 'Sombre', 'Système']) {
      // The content of a screen may have its own « Système » buttons (E-14, « Types de fiche »): only the frame is checked.
      const total = (await page.getByRole('radio', { name: mot }).count()) + (await page.getByRole('button', { name: rxExact(mot) }).count());
      const dansMain = (await page.locator('main').getByRole('radio', { name: mot }).count()) + (await page.locator('main').getByRole('button', { name: rxExact(mot) }).count());
      assert.equal(total - dansMain, 0, `${mot} étalé hors du menu`);
    }
    const compte = page.locator('[aria-haspopup="menu"]').filter({ hasText: 'antor' });
    await compte.click();
    const menu = page.getByRole('menu').filter({ hasText: 'Se déconnecter' });
    await menu.waitFor();
    assert.match(await menu.innerText(), /antor/, 'l’identifiant est dans le menu');
    for (const mot of ['Clair', 'Sombre', 'Système']) {
      assert.equal(await menu.getByRole('radio', { name: mot }).or(menu.getByRole('menuitemradio', { name: mot })).or(menu.getByRole('button', { name: mot })).count() > 0, true, `${mot} manque au menu`);
    }
    assert.equal(await menu.locator('svg').count() >= 4, true, 'le thème est en icônes (3) plus la déconnexion');
    await page.keyboard.press('Escape');
    await page.getByRole('menu').filter({ hasText: 'Se déconnecter' }).waitFor({ state: 'hidden' });
    await ctx.close();
  });
}

test('le thème se règle depuis le menu de l’avatar : Clair, Sombre, Système, et il est mémorisé', opts, async () => {
  // Fails if a choice does not apply (data-theme, page background), is not stored under kanevas-theme, or "Système" ignores the OS.
  const { ctx, page } = await session('antor');
  await page.emulateMedia({ colorScheme: 'dark' });
  await ouvrirAldric(page);
  const choisir = async (mot: string) => {
    await page.locator('[aria-haspopup="menu"]').filter({ hasText: 'antor' }).click();
    const menu = page.getByRole('menu').filter({ hasText: 'Se déconnecter' });
    await menu.getByRole('radio', { name: mot }).or(menu.getByRole('menuitemradio', { name: mot })).or(menu.getByRole('button', { name: mot })).first().click();
    await page.keyboard.press('Escape');
  };
  const etat = () => page.evaluate(() => ({
    theme: document.documentElement.dataset['theme'],
    bg: getComputedStyle(document.body).backgroundColor,
    stocke: localStorage.getItem('kanevas-theme'),
  }));
  await choisir('Clair');
  let e = await etat();
  assert.equal(e.theme, 'light');
  assert.equal(e.bg, 'rgb(252, 252, 253)');
  await capture(page, 'fiche-clair');
  await page.reload(); await attendre(page);
  assert.equal((await etat()).theme, 'light', 'le choix survit au rechargement');
  await choisir('Sombre');
  e = await etat();
  assert.equal(e.theme, 'dark');
  assert.equal(e.bg, 'rgb(18, 19, 23)');
  await capture(page, 'fiche-sombre');
  await page.emulateMedia({ colorScheme: 'light' });
  await choisir('Système');
  e = await etat();
  assert.equal(e.theme, 'light', 'Système suit l’OS (clair)');
  await ctx.close();
});

test('sans choix mémorisé, le thème suit le système', opts, async () => {
  // Fails if the default is not "Système".
  for (const [os, attendu] of [['dark', 'dark'], ['light', 'light']] as const) {
    const ctx = await browser.newContext({ baseURL: srv.base, colorScheme: os });
    const page = await ctx.newPage();
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
    await attendre(page);
    assert.equal(await page.evaluate(() => document.documentElement.dataset['theme']), attendu);
    await ctx.close();
  }
});

test('le menu de l’avatar : Échap le ferme et rend le focus au bouton ; « Se déconnecter » mène à la connexion', opts, async () => {
  // Fails if the menu is not keyboard-closable, loses focus, or logout does not end the session.
  const { ctx, page } = await session('antor');
  await page.goto('/univers/1');
  await attendre(page);
  const bouton = page.locator('[aria-haspopup="menu"]').filter({ hasText: 'antor' });
  assert.equal(await bouton.getAttribute('aria-expanded'), 'false');
  await bouton.click();
  assert.equal(await bouton.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await bouton.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup')), 'menu');
  await bouton.click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await page.waitForURL(/connexion-bouchon/);
  await page.goto('/univers/1');
  await attendre(page);
  assert.match(page.url(), /connexion-bouchon/, 'la session est bien terminée');
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------
// Le cadre : barre à icônes, barre haute, tiroir au téléphone
// ---------------------------------------------------------------------------------------------

for (const [nom, adresse] of ECRANS_UNIVERS) {
  test(`${nom} : le cadre d’univers (barre à icônes, item courant, barre haute, assistant)`, opts, async () => {
    // Fails if an item lacks its icon, the current item is not marked, or the frame differs on this screen.
    const { ctx, page } = await session('antor');
    await page.goto(adresse);
    await attendre(page);
    const nav = barre(page).getByRole('navigation');
    await nav.first().waitFor();
    const items = barre(page).getByRole('link');
    const n = await items.count();
    assert.ok(n >= 12, `${n} liens dans la barre`);
    for (let i = 0; i < n; i++) {
      const it = items.nth(i);
      const nomItem = (await it.innerText()).trim();
      if (['Vue d’ensemble', 'Comptes-rendus', 'Cartes', 'Personnages', 'Lieux', 'Factions', 'Objets', 'Événements', 'Quêtes', 'Membres', 'Paramètres'].includes(nomItem)) {
        assert.equal(await it.locator('svg').count(), 1, `${nomItem} sans icône`);
      }
    }
    assert.equal(await barre(page).locator('[aria-current="page"]').count(), 1, 'un seul item courant');
    const t = await texte(page);
    assert.match(t, /Lore/);
    assert.match(t, /Univers\n/);
    assert.equal(await page.getByRole('button', { name: /Demander à Kanevas/ }).count(), 1);
    assert.equal(await page.getByRole('navigation', { name: /Fil d.Ariane/ }).count() + await page.locator('nav[aria-label*="Ariane"]').count() > 0, true, 'fil d’Ariane');
    assert.doesNotMatch(await page.locator('body').innerText(), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'aucun émoji');
    await capture(page, `cadre-${nom}-bureau`);
    await ctx.close();
  });
}

for (const [nom, adresse] of [['E-1', '/'], ...ECRANS_UNIVERS] as Array<[string, string]>) {
  test(`${nom} au téléphone : la barre est un tiroir sous « Menu » ; Échap le ferme et rend le focus`, opts, async () => {
    // Fails if the sidebar stays on screen at 390 px, if "Menu" does not open it, or if Escape does not close it.
    const { ctx, page } = await session('antor', TEL);
    await page.goto(adresse);
    await attendre(page);
    const menu = page.getByRole('button', { name: /^Menu$/ });
    await menu.waitFor();
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    const lien = nom === 'E-1' ? page.getByRole('link', { name: 'Systèmes de jeu' }) : page.getByRole('link', { name: 'Personnages' });
    assert.equal(await lien.first().isVisible(), false, 'la barre est repliée');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await lien.first().waitFor({ state: 'visible' });
    await capture(page, `tiroir-${nom}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.equal(await lien.first().isVisible(), false, 'Échap ferme le tiroir');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Menu', 'le focus revient à « Menu »');
    const defile = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(defile <= 0, `pas de défilement horizontal (${defile})`);
    await ctx.close();
  });
}

test('au téléphone, le tiroir se ferme au toucher du voile et à l’ouverture d’une entrée', opts, async () => {
  // Fails if the scrim or choosing an entry leaves the drawer open.
  const { ctx, page } = await session('antor', TEL);
  await page.goto('/univers/1');
  await attendre(page);
  const menu = page.getByRole('button', { name: /^Menu$/ });
  await menu.click();
  await page.mouse.click(385, 400);
  await page.waitForTimeout(400);
  assert.equal(await menu.getAttribute('aria-expanded'), 'false', 'le voile ferme');
  await menu.click();
  await page.getByRole('link', { name: 'Lieux' }).click();
  await attendre(page);
  assert.match(page.url(), /fiches\/lieux/);
  await page.waitForTimeout(400);
  assert.equal(await menu.getAttribute('aria-expanded'), 'false', 'une entrée ferme');
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------
// E-9 : mode Joueur, rôle Joueur, menu « ⋯ », édition, toasts
// ---------------------------------------------------------------------------------------------

test('E-9 : Antor en mode Joueur voit le bandeau et ni pastille, ni hachure, ni menu « ⋯ », ni « Vérité »', opts, async () => {
  // Fails if player mode leaves a trace of the secret or of the MJ gestures.
  const { ctx, page } = await session('antor');
  await ouvrirAldric(page);
  assert.equal(await page.getByRole('button', { name: /régler l['’]audience/ }).count(), 2, 'le MJ voit ses pastilles');
  assert.equal(await page.getByRole('button', { name: /Autres actions sur/ }).count(), 3, 'et ses menus ⋯ (deux sections, plus celui de la fiche : renommer, supprimer)');
  const bascule = page.getByRole('radiogroup');
  assert.equal(await bascule.getByRole('radio').count(), 2);
  await bascule.getByRole('radio', { name: /Mode Joueur/ }).click();
  await page.getByRole('status').filter({ hasText: 'Mode Joueur : vous voyez ce que voit un joueur.' }).waitFor();
  await attendre(page);
  assert.equal(await page.getByRole('button', { name: /régler l['’]audience/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Autres actions sur/ }).count(), 0);
  assert.doesNotMatch(await texte(page), /Vérité|MJ seul/);
  assert.equal(await fond(sectionApparence(page)), 'none');
  assert.equal(await sectionApparence(page).getByRole('button', { name: 'Modifier' }).count(), 0, 'pas de « Modifier » sur ce que les joueurs ne font que lire');
  await capture(page, 'fiche-mode-joueur');
  await bascule.getByRole('radio', { name: /Mode MJ/ }).click();
  await page.getByRole('button', { name: /régler l['’]audience de « Apparence »/ }).waitFor();
  await ctx.close();
});

test('E-9 : Léa, Joueuse, voit « Apparence » seule, sans pastille, filet, menu ni bascule', opts, async () => {
  // Fails if a Joueur gets any MJ marker or the secret section's title.
  const { ctx, page } = await session('lea');
  await ouvrirAldric(page);
  const t = await texte(page);
  assert.match(t, /Apparence/);
  assert.doesNotMatch(t, /Vérité|MJ seul|Mode MJ|Mode Joueur|Qui voit/);
  assert.equal(await page.getByRole('button', { name: /régler l['’]audience|Autres actions/ }).count(), 0);
  assert.equal(await page.getByRole('radiogroup').count(), 0);
  assert.equal(await page.getByRole('button', { name: /Ajouter une section/ }).count(), 0);
  assert.equal(await fond(sectionApparence(page)), 'none');
  assert.equal(await page.getByRole('button', { name: /Demander à Kanevas/ }).count(), 1, 'l’assistant reste pour le Joueur');
  await capture(page, 'fiche-lea');
  await ctx.close();
});

test('E-9 : « Modifier » et « ⋯ » se révèlent au survol et au focus ; toujours visibles sans survol', opts, async () => {
  // Fails if the secondary actions are always shown on desktop or never shown on touch.
  const { ctx, page } = await session('antor');
  await ouvrirAldric(page);
  const modifier = sectionApparence(page).getByRole('button', { name: 'Modifier' });
  // effective opacity: the product along the ancestors (the actions may be hidden by a wrapper)
  const opacite = (loc: Any) => loc.evaluate((e: Element) => { let o = 1; for (let n: Element | null = e; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return String(Math.round(o * 100) / 100); });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300); // the fade (var(--duree)) must be over: the pointer may have been over the section when the sheet loaded
  assert.equal(await opacite(modifier), '0', 'caché au repos');
  await sectionApparence(page).hover();
  await page.waitForTimeout(300);
  assert.equal(await opacite(modifier), '1', 'visible au survol');
  await page.mouse.move(5, 5);
  await modifier.focus();
  await page.waitForTimeout(300);
  assert.equal(await opacite(modifier), '1', 'visible au focus');
  await ctx.close();
  const tactile = await browser.newContext({ baseURL: srv.base, hasTouch: true, isMobile: true, viewport: TEL });
  const p = await tactile.newPage();
  await p.goto('/connexion-bouchon');
  await p.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
  await attendre(p);
  await ouvrirAldric(p);
  assert.equal(await opacite(sectionApparence(p).getByRole('button', { name: 'Modifier' })), '1', 'toujours visible au tactile');
  assert.equal(await opacite(p.getByRole('button', { name: /Autres actions sur « Apparence »/ })), '1');
  await capture(p, 'fiche-telephone');
  await tactile.close();
});

test('E-9 : édition en place, compteur « n / 100 000 », Échap annule, Ctrl+Entrée enregistre avec un toast', opts, async () => surServeurNeuf(async (base) => {
  // Fails if the shortcuts do not do what "Annuler"/"Enregistrer" do, or the counter/hint are missing.
  const { ctx, page } = await session('antor', undefined, base);
  await ouvrirAldric(page);
  const apparence = sectionApparence(page);
  await apparence.hover();
  await apparence.getByRole('button', { name: 'Modifier' }).click();
  const champ = apparence.getByRole('textbox');
  await champ.waitFor();
  assert.match(await apparence.innerText(), /\d+\s\/\s100\s000/);
  assert.match((await apparence.innerText()).replace(/\s+/g, ' '), /Échap annuler · Ctrl ↵ enregistrer/);
  await champ.fill('Texte abandonné');
  assert.match(await apparence.innerText(), /15\s\/\s100\s000/);
  await page.keyboard.press('Escape');
  await champ.waitFor({ state: 'hidden' });
  assert.match(await apparence.innerText(), /Grand, voûté\. Il règne sur Port-Sel\./, 'Échap abandonne le texte saisi');
  assert.doesNotMatch(await apparence.innerText(), /Texte abandonné/);
  await apparence.hover();
  await apparence.getByRole('button', { name: 'Modifier' }).click();
  await apparence.getByRole('textbox').fill('Grand, voûté, la barbe grise.');
  await page.keyboard.press('Control+Enter');
  await page.getByRole('status').filter({ hasText: rx('« Apparence » enregistrée') }).first().waitFor();
  assert.match(await apparence.innerText(), /Grand, voûté, la barbe grise\./);
  assert.equal(await apparence.getByRole('textbox').count(), 0, 'l’édition est fermée');
  await page.reload(); await attendre(page);
  assert.match(await texte(page), /Grand, voûté, la barbe grise\./, 'écrit pour de bon');
  await ctx.close();
}));

test('E-9 : le 100 001e caractère : « Erreur : 100 000 caractères au plus. », Ctrl+Entrée ne part pas', opts, async () => {
  // Fails if the shortcut bypasses the size guard of the button.
  const { ctx, page } = await session('antor');
  await ouvrirAldric(page);
  const apparence = sectionApparence(page);
  await apparence.hover();
  await apparence.getByRole('button', { name: 'Modifier' }).click();
  const requetes: string[] = [];
  page.on('request', (r: Any) => { if (r.method() !== 'GET') requetes.push(r.url()); });
  await apparence.getByRole('textbox').fill('x'.repeat(100001));
  await apparence.getByText('Erreur : 100 000 caractères au plus.').waitFor();
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(500);
  assert.deepEqual(requetes, []);
  assert.equal(await apparence.getByRole('textbox').inputValue().then((v: string) => v.length), 100001, 'la saisie est gardée');
  await ctx.close();
});

test('E-9 : menu « ⋯ » : Monter, Descendre, Retirer la section ; la première ne monte pas ; Échap ferme', opts, async () => surServeurNeuf(async (base) => {
  // Fails if the menu lacks an entry, enables an impossible one, or reorder/removal does not work and confirm with a toast.
  const { ctx, page } = await session('antor', undefined, base);
  await ouvrirAldric(page);
  const ouvrir = (titre: string) => page.getByRole('button', { name: rx(`Autres actions sur « ${titre} »`) });
  await ouvrir('Apparence').click();
  const menu = page.getByRole('menu', { name: /Autres actions sur « Apparence »/ });
  assert.deepEqual((await menu.getByRole('menuitem').allInnerTexts()).map((s: string) => s.trim()), ['Monter', 'Descendre', 'Retirer la section']);
  assert.equal(await menu.getByRole('menuitem', { name: 'Monter' }).getAttribute('aria-disabled'), 'true');
  assert.equal(await ouvrir('Apparence').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Autres actions sur « Apparence »');
  await ouvrir('Apparence').click();
  await menu.getByRole('menuitem', { name: 'Descendre' }).click();
  await page.getByRole('status').filter({ hasText: rx('« Apparence » descendue d’un cran') }).waitFor();
  const titres = await page.locator('main h2').allInnerTexts();
  assert.deepEqual(titres.filter((t: string) => /Apparence|Vérité/.test(t)), ['Vérité — MJ seul', 'Apparence']);
  await ctx.close();
}));

test('E-9 : retirer une section : boîte de dialogue, « Annuler » prend le focus, toast « retirée »', opts, async () => surServeurNeuf(async (base) => {
  // Fails if the confirmation is not an alertdialog focused on Annuler, or the toast is missing.
  const { ctx, page } = await session('antor', undefined, base);
  await ouvrirAldric(page);
  await page.getByRole('button', { name: /Ajouter une section/ }).first().click();
  await page.getByLabel('Titre de la section').fill('Rumeurs entendues');
  await page.getByRole('button', { name: rxExact('Ajouter la section') }).click();
  await page.getByRole('status').filter({ hasText: rx('Section « Rumeurs entendues » ajoutée — fermée aux joueurs') }).waitFor();
  await page.getByRole('button', { name: /Autres actions sur « Rumeurs entendues »/ }).click();
  await page.getByRole('menuitem', { name: 'Retirer la section' }).click();
  const boite = page.getByRole('alertdialog');
  await boite.waitFor();
  assert.equal(await boite.getAttribute('aria-modal'), 'true');
  assert.match((await boite.innerText()).replace(/\s+/g, ' '), /Retirer la section « Rumeurs entendues » \? Son contenu sera perdu\./);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Annuler');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await boite.evaluate((e: Element) => e.contains(document.activeElement)), true, 'Tab boucle dans la boîte');
  await capture(page, 'fiche-boite-retrait');
  await page.keyboard.press('Escape');
  await boite.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('region', { name: /Rumeurs entendues/ }).count(), 1, 'Échap n’a rien retiré');
  await page.getByRole('button', { name: /Autres actions sur « Rumeurs entendues »/ }).click();
  await page.getByRole('menuitem', { name: 'Retirer la section' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Retirer la section' }).click();
  await page.getByRole('status').filter({ hasText: rx('Section « Rumeurs entendues » retirée') }).waitFor();
  assert.equal(await page.getByRole('region', { name: /Rumeurs entendues/ }).count(), 0);
  await ctx.close();
}));

test('E-9 : un changement d’audience qui échoue : l’interrupteur revient, message en ligne, pas de toast', opts, async () => {
  // Fails if a failure is shown as a toast, or the switch keeps the unsaved value.
  const { ctx, page } = await session('antor');
  await ouvrirAldric(page);
  await page.route('**/api/**', (route: Any) => (route.request().method() === 'GET' ? route.continue() : route.abort()));
  await pastilleApparence(page).click();
  const boite = page.getByRole('dialog', { name: 'Qui voit « Apparence »' });
  const ecrit = boite.getByRole('switch', { name: /Les joueurs l['’]écrivent/ });
  assert.equal(await ecrit.getAttribute('aria-checked'), 'false');
  await ecrit.click();
  await boite.getByText('L’action n’a pas abouti. Réessayez.').or(boite.getByText("L'action n'a pas abouti. Réessayez.")).waitFor();
  assert.equal(await ecrit.getAttribute('aria-checked'), 'false', 'revenu à sa valeur');
  assert.equal(await page.getByRole('status').filter({ hasText: /enregistrée/ }).count(), 0, 'pas de toast');
  await ctx.close();
});

test('toast : part seul après 4 s, a un bouton « Fermer », ne prend pas le focus, trois au plus empilés', opts, async () => surServeurNeuf(async (base) => {
  // Fails if a toast stays, steals focus, or stacks beyond three.
  const { ctx, page } = await session('antor', undefined, base);
  await ouvrirAldric(page);
  await pastilleApparence(page).click();
  const boite = page.getByRole('dialog', { name: /Qui voit/ });
  const ecrit = boite.getByRole('switch', { name: /Les joueurs l['’]écrivent/ });
  await ecrit.click();
  const toast = page.getByRole('status').filter({ hasText: /enregistrée/ });
  await toast.first().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'switch', 'le focus reste sur l’interrupteur');
  assert.equal(await toast.first().getByRole('button', { name: 'Fermer' }).count(), 1);
  await toast.first().getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Fermer' }).waitFor({ state: 'detached', timeout: 1500 });
  if ((await boite.count()) === 0) await pastilleApparence(page).click();
  // five quick actions: at most three toasts stand
  for (let i = 0; i < 5; i++) await ecrit.click();
  await page.waitForTimeout(500);
  const n = await page.getByRole('button', { name: 'Fermer' }).count();
  assert.ok(n >= 2 && n <= 3, `${n} toasts empilés (2 à 3 attendus pour 5 actions)`);
  await page.waitForTimeout(4600);
  assert.equal(await page.getByRole('button', { name: 'Fermer' }).count(), 0, 'ils partent seuls après 4 s');
  await ctx.close();
}));

// ---------------------------------------------------------------------------------------------
// B-29 : les six états de chaque écran
// ---------------------------------------------------------------------------------------------

const ECRANS_ETATS: Array<[string, string, RegExp]> = [
  ['E-1', '/', /Impossible de charger vos univers\./],
  ['E-3', '/univers/1', /Impossible de charger cette page\./],
  ['E-4', '/univers/1/membres', /Impossible de charger les membres\./],
  ['E-8', '/univers/1/fiches/personnages', /Impossible de charger les fiches\./],
  ['E-9', '/univers/1/fiche/1', /Impossible de charger cette fiche\./],
];

for (const [nom, adresse, message] of ECRANS_ETATS) {
  test(`B-29 ${nom} · erreur : « ${message.source.replace(/\\/g, '')} » et « Réessayer » qui relance`, opts, async () => {
    // Fails if the error state is missing, silent, or its retry does not reload.
    const { ctx, page } = await session('antor');
    let panne = true;
    await page.route(/\/api\/(?!moi)/, (route: Any) => (panne ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.continue()));
    await page.goto(adresse);
    await page.getByText(message).first().waitFor();
    assert.equal(await page.getByRole('alert').count() > 0 || (await page.getByText(message).count()) > 0, true);
    await capture(page, `etat-erreur-${nom}`);
    panne = false;
    await page.getByRole('button', { name: 'Réessayer' }).first().click();
    await attendre(page);
    assert.equal(await page.getByText(message).count(), 0, 'l’erreur disparaît après « Réessayer »');
    await ctx.close();
  });
}

for (const [nom, adresse, message, point] of [
  ['E-4', '/univers/1/membres', /Impossible de charger les membres\./, '/api/univers/1/membres'],
  ['E-9', '/univers/1/fiche/1', /Impossible de charger cette fiche\./, '/api/univers/1/fiches/1'],
] as Array<[string, string, RegExp, string]>) {
  test(`B-29 ${nom} · erreur de l’écran seul : le message, puis « Réessayer » rend le contenu`, opts, async () => {
    // Fails if the screen's own load error has no retry that recovers.
    const { ctx, page } = await session('antor');
    let panne = true;
    await page.route(`**${point}`, (route: Any) => (panne ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.continue()));
    await page.goto(adresse);
    await page.getByText(message).first().waitFor();
    panne = false;
    await page.getByRole('button', { name: 'Réessayer' }).first().click();
    await attendre(page);
    assert.equal(await page.getByText(message).count(), 0);
    assert.match(await texte(page), nom === 'E-4' ? /lea/ : /Grand, voûté\. Il règne sur Port-Sel\./);
    await ctx.close();
  });
}

const ECRANS_CHARGEMENT: Array<[string, string, RegExp]> = [
  ['E-1', '/', /Chargement de vos univers…/],
  ['E-3', '/univers/1', /Chargement…/],
  ['E-4', '/univers/1/membres', /Chargement des membres…/],
  ['E-8', '/univers/1/fiches/personnages', /Chargement des fiches…/],
  ['E-9', '/univers/1/fiche/1', /Chargement de la fiche…/],
];
for (const [nom, adresse, message] of ECRANS_CHARGEMENT) {
  test(`B-29 ${nom} · chargement : « ${message.source.replace(/\\/g, '')} » en role=status`, opts, async () => {
    // Fails if the loading state is absent or not announced.
    const { ctx, page } = await session('antor');
    let libere: () => void = () => {};
    const porte = new Promise<void>((r) => { libere = r; });
    await page.route(/\/api\/(?!moi)/, async (route: Any) => { await porte; await route.continue(); });
    await page.goto(adresse);
    const etat = page.getByRole('status').filter({ hasText: message });
    await etat.first().waitFor();
    await capture(page, `etat-chargement-${nom}`);
    libere();
    await attendre(page);
    assert.equal(await page.getByRole('status').filter({ hasText: message }).count(), 0, 'le chargement part avec les données');
    await ctx.close();
  });
}

for (const [nom, adresse] of [['E-1', '/'], ['E-3', '/univers/1'], ['E-4', '/univers/1/membres'], ['E-8', '/univers/1/fiches/personnages'], ['E-9', '/univers/1/fiche/1']] as Array<[string, string]>) {
  test(`B-29 ${nom} · connexion perdue : le bandeau, la page déjà chargée reste, il part au retour`, opts, async () => {
    // Fails if the offline banner is absent, wipes the screen, or stays after the connection comes back.
    const { ctx, page } = await session('antor');
    await page.goto(adresse);
    await attendre(page);
    const avant = await texte(page);
    await ctx.setOffline(true);
    const bandeau = page.getByText(/Connexion perdue\. Ce que vous voyez peut être dépassé/);
    await bandeau.first().waitFor();
    assert.match((await texte(page)).replace(/\s+/g, ' '), /Connexion perdue\. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas\./);
    assert.ok((await texte(page)).length > avant.length / 2, 'le contenu chargé reste affiché');
    await capture(page, `etat-hors-ligne-${nom}`);
    await ctx.setOffline(false);
    await bandeau.first().waitFor({ state: 'hidden' });
    await ctx.close();
  });
}

test('B-29 E-9 · connexion perdue : audience, ordre, retrait et ajout sont désactivés ; le thème reste réglable', opts, async () => {
  // Fails if a write gesture stays active offline, or the local theme choice stops working.
  const { ctx, page } = await session('antor');
  await ouvrirAldric(page);
  await ctx.setOffline(true);
  await page.getByText(/Connexion perdue\./).first().waitFor();
  await pastilleApparence(page).click();
  const boite = page.getByRole('dialog', { name: /Qui voit/ });
  for (const s of await boite.getByRole('switch').all()) assert.equal(await s.getAttribute('aria-disabled'), 'true');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Autres actions sur « Apparence »/ }).click();
  assert.equal(await page.getByRole('menuitem', { name: 'Retirer la section' }).getAttribute('aria-disabled'), 'true');
  await page.keyboard.press('Escape');
  await page.locator('[aria-haspopup="menu"]').filter({ hasText: 'antor' }).click();
  const menu = page.getByRole('menu').filter({ hasText: 'Se déconnecter' });
  await menu.getByRole('radio', { name: 'Clair' }).or(menu.getByRole('menuitemradio', { name: 'Clair' })).or(menu.getByRole('button', { name: 'Clair' })).first().click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset['theme']), 'light');
  assert.notEqual(await menu.getByRole('menuitem', { name: 'Se déconnecter' }).getAttribute('aria-disabled'), 'true');
  await ctx.close();
});

test('B-29 · refus : une fiche ou un univers illisible répond « Page introuvable. » avec « Mes univers », sans le nom', opts, async () => {
  // Fails if a refusal says "access denied", names the universe, or keeps a universe selector.
  const { ctx, page } = await session('teo');
  await page.goto('/univers/1');
  await attendre(page);
  const t = await texte(page);
  assert.match(t, /Page introuvable\./);
  assert.doesNotMatch(t, /Lame d'Ébène|refus|interdit/i);
  assert.equal(await page.getByRole('link', { name: 'Mes univers' }).count() > 0, true);
  assert.equal(await barre(page).getByText(/^Lore$/).count(), 0, 'pas la barre d’un univers');
  await capture(page, 'etat-refus-teo');
  await page.goto('/univers/1/fiche/1');
  await attendre(page);
  assert.match(await texte(page), /Page introuvable\./);
  await ctx.close();
  const lea = await session('lea');
  for (const adresse of ['/univers/1/membres', '/univers/1/parametres', '/univers/1/fiches/inconnu']) {
    await lea.page.goto(adresse);
    await attendre(lea.page);
    assert.match(await texte(lea.page), /Page introuvable\./, adresse);
  }
  assert.equal(await barre(lea.page).getByRole('link', { name: 'Membres' }).count(), 0);
  await lea.ctx.close();
});

test('B-29 E-1 · vide : Teo, compte neuf, voit les trois lignes et son identifiant', opts, async () => {
  // Fails if the empty state does not say what to do.
  const { ctx, page } = await session('teo');
  await page.goto('/');
  await attendre(page);
  const t = (await texte(page)).replace(/\s+/g, ' ');
  assert.match(t, /Aucun univers pour l'instant\./);
  assert.match(t, /Vous menez une partie \? Créez un univers\./);
  assert.match(t, /Vous êtes joueur \? Donnez votre identifiant à votre MJ : teo/);
  assert.match(t, /Connecté en tant que teo/);
  assert.doesNotMatch(t, /Lame d'Ébène|Landes grises/);
  assert.equal(await page.getByRole('button', { name: 'Créer un univers' }).or(page.getByRole('link', { name: 'Créer un univers' })).count() > 0, true);
  await capture(page, 'etat-vide-E-1');
  await ctx.close();
});

test('B-29 E-8 · vide : un type sans fiche dit « Aucune quête pour l’instant. » et propose « Nouvelle quête » au MJ ; au Joueur « à voir »', opts, async () => {
  // Fails if the empty text differs by role or the action is missing for the MJ.
  const mj = await session('antor');
  await mj.page.goto('/univers/1/fiches/quetes');
  await attendre(mj.page);
  assert.match((await texte(mj.page)).replace(/\s+/g, ' '), /Aucune quête pour l'instant\./);
  assert.equal(await mj.page.getByRole('button', { name: 'Nouvelle quête' }).count() > 0, true);
  await capture(mj.page, 'etat-vide-E-8');
  await mj.ctx.close();
  const j = await session('lea');
  await j.page.goto('/univers/1/fiches/quetes');
  await attendre(j.page);
  assert.match((await texte(j.page)).replace(/\s+/g, ' '), /Aucune quête à voir pour l'instant\./);
  assert.equal(await j.page.getByRole('button', { name: /Nouvelle quête/ }).count(), 0);
  await j.ctx.close();
});

test('B-29 · contenu long : un nom d’univers de 80 caractères est tronqué par « … » avec infobulle, sans défilement horizontal', opts, async () => {
  // Fails if a long name breaks the layout (card, selector, breadcrumb) or loses its tooltip.
  const long = 'Le Royaume des Mille et Une Brumes Éternelles Où Dorment Les Anciens Rois Oubliés'.slice(0, 80);
  const { ctx, page } = await session('mira');
  await page.goto('/univers/nouveau');
  await attendre(page);
  await page.getByLabel('Nom', { exact: true }).fill(long);
  await page.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await attendre(page);
  await page.goto('/');
  await attendre(page);
  const lien = page.getByRole('link', { name: rx(long.slice(0, 30)) }).first();
  await lien.waitFor();
  const titre = page.getByText(long, { exact: true }).first();
  assert.equal(await titre.getAttribute('title'), long, 'nom complet en infobulle');
  assert.equal(await titre.evaluate((e: Element) => getComputedStyle(e).textOverflow), 'ellipsis');
  for (const vue of [{ width: 1280, height: 900 }, TEL]) {
    await page.setViewportSize(vue);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, `défilement horizontal à ${vue.width}`);
  }
  await capture(page, 'etat-long-E-1');
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------
// La charte appliquée au code
// ---------------------------------------------------------------------------------------------

const TOKENS: Record<string, Record<string, string>> = {
  dark: {
    '--fond': '#121317', '--fond-lateral': '#0e0f12', '--surface': '#191a1f', '--surface-2': '#202128', '--surface-3': '#2a2b33',
    '--bord-champ': '#74757f', '--texte': '#ebecf0', '--texte-2': '#a6a7b0', '--texte-3': '#8b8c97', '--accent': '#8b9bf0',
    '--sur-accent': '#11142b', '--accent-texte': '#9aa6f5', '--mj': '#f2a33c', '--table': '#3fc79a', '--danger': '#ec7b6f',
    '--sur-danger': '#1a0c0a', '--focus': '#9aa6f5', '--duree': '160ms',
  },
  light: {
    '--fond': '#fcfcfd', '--fond-lateral': '#f4f5f7', '--surface': '#ffffff', '--surface-2': '#f1f2f5', '--surface-3': '#e8e9ee',
    '--bord-champ': '#808290', '--texte': '#1a1b22', '--texte-2': '#4a4c58', '--texte-3': '#646674', '--accent': '#3a4cc0',
    '--sur-accent': '#ffffff', '--accent-texte': '#3a4cc0', '--mj': '#8a5300', '--table': '#08694a', '--danger': '#b4352b',
    '--sur-danger': '#ffffff', '--focus': '#3a4cc0', '--duree': '160ms',
  },
};
for (const [theme, attendus] of Object.entries(TOKENS)) {
  test(`charte : les tokens du thème ${theme} ont les valeurs de docs/charte.md`, opts, async () => {
    // Fails if a token value drifts from the charte table.
    const { ctx, page } = await session('antor');
    await page.addInitScript((c: string) => localStorage.setItem('kanevas-theme', c), theme === 'dark' ? 'sombre' : 'clair');
    await page.goto('/');
    await attendre(page);
    const lus = await page.evaluate((noms: string[]) => Object.fromEntries(noms.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase().replace(/^\.16s$/, '160ms').replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3')])), Object.keys(attendus));
    assert.deepEqual(lus, attendus);
    await ctx.close();
  });
}

const typo = (page: Any) => page.evaluate(`(() => {
  const css = (s) => { const c = getComputedStyle(document.querySelector(s)); return { f: c.fontFamily, s: c.fontSize }; };
  const p = [...document.querySelectorAll('main p')].find((e) => /Grand, voûté\. Il règne/.test(e.textContent || ''));
  const cp = getComputedStyle(p);
  return { h1: css('main h1'), lecture: { f: cp.fontFamily, s: cp.fontSize }, nav: css('nav a') };
})()`);

test('charte, bureau : titre de fiche en Fraunces 40 px, texte à lire en Newsreader 18 px, interface en Inter 13 px', opts, async () => {
  // Fails if the document typography is not the charte's.
  const { ctx, page } = await session('antor');
  await ouvrirAldric(page);
  const r = await typo(page);
  assert.match(r.h1.f, /Fraunces/);
  assert.equal(r.h1.s, '40px');
  assert.match(r.lecture.f, /Newsreader/);
  assert.equal(r.lecture.s, '18px');
  assert.match(r.nav.f, /Inter/);
  assert.equal(r.nav.s, '13px');
  await ctx.close();
});

test('charte, téléphone (390 px) : titre de fiche 32 px, texte à lire 17 px', opts, async () => {
  // Fails if the phone sizes of the charte (--t-32 title, 17 px reading text) are not applied.
  const { ctx, page } = await session('antor', TEL);
  await ouvrirAldric(page);
  const r = await typo(page);
  assert.equal(r.h1.s, '32px', 'titre de fiche au téléphone');
  assert.equal(r.lecture.s, '17px', 'texte à lire au téléphone');
  await ctx.close();
});

test('charte : le filet d’audience vert pour une section lue, le hachuré ambre pour MJ seul, aucune teinte seule (icône + mot)', opts, async () => {
  // Fails if the two sections look alike or the badge carries colour alone.
  const { ctx, page } = await session('antor');
  await ouvrirAldric(page);
  const lue = page.getByRole('region', { name: /Apparence/ });
  const secret = page.getByRole('region', { name: /Vérité/ });
  assert.equal(await fond(lue), 'none');
  assert.match(await fond(secret), /gradient/);
  const bordGauche = (loc: Any) => loc.evaluate((e: Element) => { const c = getComputedStyle(e); const b = getComputedStyle(e, '::before'); return [c.borderLeftColor, c.borderLeftWidth, b.backgroundColor, b.backgroundImage, b.width].join('|'); });
  assert.notEqual(await bordGauche(lue), await bordGauche(secret), 'filets distincts');
  for (const [loc, mot] of [[lue, 'Lue des joueurs'], [secret, 'MJ seul']] as Array<[Any, string]>) {
    const p = loc.getByRole('button', { name: new RegExp(`^${mot} — régler`) });
    assert.ok((await p.locator('svg').count()) >= 1, `${mot} : icône`);
    assert.match(await p.innerText(), rx(mot), `${mot} : mot`);
  }
  assert.equal(await secret.evaluate((e: Element) => getComputedStyle(e).borderTopLeftRadius !== '0px' || getComputedStyle(e).borderTopRightRadius !== '0px'), true, 'section MJ seul : coins arrondis');
  await ctx.close();
});

test('charte : aucun hôte externe (polices, icônes) sur les écrans livrés', opts, async () => {
  // Fails if any screen fetches a font or icon from a CDN.
  const { ctx, page } = await session('antor');
  const externes: string[] = [];
  page.on('request', (r: Any) => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && u.origin !== new URL(srv.base).origin) externes.push(r.url()); });
  for (const a of ['/', '/univers/1', '/univers/1/comptes-rendus', '/univers/1/fiches/personnages', '/univers/1/fiche/1', '/univers/1/membres', '/univers/1/parametres']) {
    await page.goto(a);
    await attendre(page);
  }
  assert.deepEqual(externes, []);
  await ctx.close();
});

test('charte : l’anneau de focus (2 px, --focus) paraît au clavier sur les boutons et les liens de la barre', opts, async () => {
  // Fails if keyboard focus is invisible.
  const { ctx, page } = await session('antor');
  await page.addInitScript(() => localStorage.setItem('kanevas-theme', 'sombre'));
  await page.goto('/univers/1');
  await attendre(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const anneau = await page.evaluate(() => { const c = getComputedStyle(document.activeElement!); return { w: c.outlineWidth, s: c.outlineStyle, c: c.outlineColor, o: c.outlineOffset }; });
  assert.equal(anneau.s, 'solid');
  assert.equal(anneau.w, '2px');
  assert.equal(anneau.c, 'rgb(154, 166, 245)', '--focus sombre #9aa6f5');
  assert.equal(anneau.o, '2px');
  await ctx.close();
});

test('charte : les cibles font au moins 24 × 24 px au bureau et 36 px au téléphone sur les items de navigation', opts, async () => {
  // Fails if navigation targets are too small.
  const bureau = await session('antor');
  await bureau.page.goto('/univers/1');
  await attendre(bureau.page);
  const hauteur = async (page: Any) => page.evaluate(() => [...document.querySelectorAll('nav a')].filter((a) => a.getBoundingClientRect().height > 0 && ['Vue d’ensemble', 'Comptes-rendus', 'Cartes', 'Personnages', 'Lieux', 'Factions', 'Objets', 'Événements', 'Quêtes', 'Membres', 'Paramètres'].includes((a.textContent || '').trim())).map((a) => Math.round(a.getBoundingClientRect().height)));
  assert.ok((await hauteur(bureau.page)).every((h: number) => h >= 30), 'items de 30 px');
  await bureau.ctx.close();
  const tel = await session('antor', TEL);
  await tel.page.goto('/univers/1');
  await attendre(tel.page);
  await tel.page.getByRole('button', { name: /^Menu$/ }).click();
  assert.ok((await hauteur(tel.page)).every((h: number) => h >= 36), 'items d’au moins 36 px au téléphone');
  await tel.ctx.close();
});

// ---------------------------------------------------------------------------------------------
// E-2, E-4, E-13, E-14, E-15 : dans le même cadre, avec les mêmes composants
// ---------------------------------------------------------------------------------------------

test('E-14 : l’enregistrement réussi est un toast « Enregistré. », pas un message en ligne', opts, async () => {
  // Fails if the success is still inline or no toast shows.
  const { ctx, page } = await session('antor');
  await page.goto('/univers/1/parametres');
  await attendre(page);
  await page.getByRole('button', { name: /^Enregistrer/ }).first().click();
  await page.getByRole('status').filter({ hasText: 'Enregistré.' }).waitFor();
  await capture(page, 'e14-toast');
  await ctx.close();
});

test('E-2 : créer un univers : aperçu du sceau dès le nom saisi, « … » pendant l’envoi, puis E-3 dans le cadre', opts, async () => {
  // Fails if the preview, busy label, or landing frame is off.
  const { ctx, page } = await session('mira');
  await page.goto('/');
  await attendre(page);
  await page.getByRole('link', { name: 'Créer un univers' }).or(page.getByRole('button', { name: 'Créer un univers' })).first().click();
  await page.getByLabel('Nom', { exact: true }).waitFor();
  await page.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await page.getByText('Erreur : le nom est obligatoire.').waitFor();
  await page.getByLabel('Nom', { exact: true }).fill('Terres de Cendre');
  await page.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await page.getByRole('heading', { name: 'Terres de Cendre', level: 1 }).waitFor();
  assert.equal(await barre(page).getByRole('link', { name: 'Personnages' }).count(), 1, 'E-3 dans le cadre d’un univers');
  await ctx.close();
});

test('E-4 : retirer le seul MJ : confirmation sur place, puis « Impossible : l’univers doit garder au moins un MJ. » et liste inchangée', opts, async () => {
  // Fails if the sole MJ can be removed, or the refusal text/list changes.
  const { ctx, page } = await session('antor');
  await page.goto('/univers/1/membres');
  await attendre(page);
  await page.getByText('lea', { exact: true }).first().waitFor();
  await capture(page, 'e04-membres');
  const retirerAntor = page.getByRole('button', { name: /Retirer antor/ }).first();
  await retirerAntor.focus();
  await retirerAntor.press('Enter');
  const confirmer = page.getByRole('button', { name: /^Retirer antor$/ }).last();
  await confirmer.waitFor();
  await confirmer.click();
  await page.getByText('Impossible : l’univers doit garder au moins un MJ.').or(page.getByText("Impossible : l'univers doit garder au moins un MJ.")).waitFor();
  assert.equal(await page.getByText('antor', { exact: true }).count() > 0, true, 'la liste est inchangée');
  await ctx.close();
});
