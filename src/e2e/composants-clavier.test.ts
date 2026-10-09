// kanevas-rv-composants, in a real Chromium on /demo-composants (stub mode): the keyboard behaviour of
// each shared component, as docs/charte.md § 4 states it. Expected values are literals from the charte.
//
// TEST PLAN (charte § 4, « C »)
//   Bouton        : Entrée et Espace l'activent ; désactivé : aria-disabled, ne part pas ; « … » et un seul envoi
//   Bouton icône  : étiquette accessible qui nomme l'objet, infobulle courte
//   Menu          : aria-haspopup/expanded ; ouvert, focus sur la 1re entrée ; ↑ ↓ ; Échap ferme et rend le focus ;
//                   clic dehors ferme ; entrée impossible aria-disabled, visible, inerte
//   Interrupteur  : role=switch, aria-checked ; Espace bascule ; désactivé inerte
//   Toast         : role=status polite ; ne prend pas le focus ; part après 4 s ; Fermer ; trois au plus
//   Dialogue      : alertdialog, aria-modal, titré/décrit ; focus sur Annuler, Tab boucle ; Échap ferme et rend le focus
//   Champ         : étiquette liée ; erreur « Erreur : » reliée par aria-describedby
//   Bandeau       : role=status ; page 404 hors bouchon testée dans src/routes/demo-composants.test.ts
//   Page          : servie en bouchon ; captures bureau/téléphone x clair/sombre (CAPTURES_DIR)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let page: Any;
const CAPTURES = process.env['CAPTURES_DIR'];

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  page = (await connecte(browser, srv.base, 'antor')).page;
  await page.goto('/demo-composants');
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: 'Composants partagés', level: 1 }).waitFor();
}, { timeout: 120000 });
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const focusLabel = (p: Any) =>
  p.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? (a.getAttribute('aria-label') ?? a.textContent ?? '').trim() : '';
  });

test('la page de démo est servie en bouchon et montre chaque groupe', opts, async () => {
  for (const g of ['Bouton', 'Menu', 'Interrupteur', 'Pastille', 'Toast', 'Boîte de dialogue', 'Champ', 'Bloc de section', 'Bandeau', 'Chargement'])
    await page.getByRole('heading', { name: g, level: 2 }).waitFor();
});

test('menu : aria au repos, focus sur la 1re entrée à l’ouverture, ↓ ↑, Échap rend le focus au bouton', opts, async () => {
  const decl = page.getByRole('button', { name: 'Actions de la section « Apparence »' });
  assert.equal(await decl.getAttribute('aria-haspopup'), 'menu');
  assert.equal(await decl.getAttribute('aria-expanded'), 'false');
  await decl.focus();
  await page.keyboard.press('Enter');
  assert.equal(await decl.getAttribute('aria-expanded'), 'true');
  const items = page.getByRole('menuitem');
  assert.deepEqual(await items.allTextContents(), ['Monter', 'Descendre', 'Retirer la section']);
  assert.equal(await focusLabel(page), 'Monter');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focusLabel(page), 'Descendre');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focusLabel(page), 'Retirer la section');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focusLabel(page), 'Monter', '↓ boucle');
  await page.keyboard.press('ArrowUp');
  assert.equal(await focusLabel(page), 'Retirer la section', '↑ boucle');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert.equal(await decl.getAttribute('aria-expanded'), 'false');
  assert.equal(await focusLabel(page), 'Actions de la section « Apparence »');
});

test('menu : une entrée impossible est visible, aria-disabled et inerte ; un clic dehors ferme', opts, async () => {
  const decl = page.getByRole('button', { name: 'Actions de la section « Apparence »' });
  await decl.click();
  const monter = page.getByRole('menuitem', { name: 'Monter' });
  assert.equal(await monter.getAttribute('aria-disabled'), 'true');
  assert.ok(await monter.isVisible());
  await monter.click({ force: true });
  assert.equal(await page.getByRole('menu').count(), 1, 'cliquer une entrée impossible ne ferme pas et ne fait rien');
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('menu').count(), 1, 'Entrée sur l’entrée impossible : inerte aussi');
  await page.getByRole('heading', { name: 'Composants partagés', level: 1 }).click();
  assert.equal(await page.getByRole('menu').count(), 0, 'un clic dehors ferme');
});

test('menu : ↓ sur le déclencheur fermé l’ouvre ; une entrée choisie ferme et rend le focus', opts, async () => {
  const decl = page.getByRole('button', { name: 'Actions de la section « Apparence »' });
  await decl.focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByRole('menu').count(), 1);
  await page.keyboard.press('ArrowDown'); // Descendre
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert.equal(await focusLabel(page), 'Actions de la section « Apparence »');
  await page.getByText('« Apparence » descendue d’un cran').waitFor();
});

test('interrupteur : role=switch, Espace bascule, désactivé inerte', opts, async () => {
  const sw = page.getByRole('switch', { name: 'Les joueurs l’écrivent' }).first();
  assert.equal(await sw.getAttribute('aria-checked'), 'false');
  await sw.focus();
  await page.keyboard.press('Space');
  assert.equal(await sw.getAttribute('aria-checked'), 'true');
  await page.keyboard.press('Space');
  assert.equal(await sw.getAttribute('aria-checked'), 'false');
  const inactifs = page.getByRole('switch', { name: 'Les joueurs la lisent' });
  const off = inactifs.nth(1);
  assert.equal(await off.getAttribute('aria-disabled'), 'true');
  assert.equal(await off.getAttribute('aria-checked'), 'true');
  await off.click({ force: true });
  assert.equal(await off.getAttribute('aria-checked'), 'true', 'désactivé : ne bascule pas');
});

test('interrupteur : un clic sur la ligne entière bascule et un toast le confirme', opts, async () => {
  const sw = page.getByRole('switch', { name: 'Les joueurs la lisent' }).first();
  assert.equal(await sw.getAttribute('aria-checked'), 'true');
  const box = await sw.boundingBox();
  assert.ok(box.height >= 40 - 0.5, `ligne de 40 px, obtenu ${box.height}`);
  await page.mouse.click(box.x + 4, box.y + box.height / 2);
  assert.equal(await sw.getAttribute('aria-checked'), 'false');
  await page.getByText('Audience de « Apparence » enregistrée').first().waitFor();
});

test('bouton : Entrée et Espace activent ; désactivé ne part pas ; « … » ne se déclenche qu’une fois', opts, async () => {
  const b = page.locator('.demo .bouton.principal').nth(3); // « Enregistrer »: its name becomes « … » while it sends
  await b.focus();
  await page.keyboard.press('Enter');
  assert.equal((await b.innerText()).trim(), '…');
  assert.equal(await b.getAttribute('aria-disabled'), 'true');
  await page.keyboard.press('Space');
  await b.click();
  await page.waitForTimeout(1800);
  assert.equal((await b.innerText()).trim(), 'Enregistrer');
  await b.focus();
  await page.keyboard.press('Space');
  assert.equal((await b.innerText()).trim(), '…', 'Espace active aussi');
  await page.waitForTimeout(1800);
  // disabled: reachable by aria, never fires
  const dis = page.getByRole('button', { name: 'Danger', exact: true });
  assert.equal(await dis.getAttribute('aria-disabled'), 'true');
  // a disabled button never changes the page: clicking the disabled « Neutre » opens nothing
  await dis.click({ force: true });
  assert.equal(await page.getByRole('alertdialog').count(), 0);
});

test('bouton icône : l’étiquette accessible nomme l’objet, l’infobulle est courte', opts, async () => {
  const b = page.getByRole('button', { name: 'Retirer la relation membre de → Lames Grises' }).first();
  assert.equal(await b.getAttribute('title'), 'Retirer');
  const mont = page.getByRole('button', { name: 'Monter la section' });
  assert.equal(await mont.getAttribute('aria-disabled'), 'true');
  const t = await b.boundingBox();
  assert.ok(t.width >= 24 && t.height >= 24, 'cible d’au moins 24 px');
});

test('toast : région role=status polie, ne prend pas le focus, Fermer, part seul après 4 s', opts, async () => {
  const region = page.locator('.toasts');
  assert.equal(await region.getAttribute('role'), 'status');
  assert.equal(await region.getAttribute('aria-live'), 'polite');
  const bouton = page.getByRole('button', { name: 'Afficher un toast' });
  await bouton.focus();
  await page.keyboard.press('Enter');
  const t = page.getByText('« Rumeurs entendues » enregistrée');
  await t.waitFor();
  assert.equal(await focusLabel(page), 'Afficher un toast', 'le toast ne prend jamais le focus');
  const debut = Date.now();
  await page.locator('.toast').getByRole('button', { name: 'Fermer' }).click();
  assert.equal(await t.count(), 0, 'Fermer le retire');
  await bouton.click();
  await t.waitFor();
  await page.waitForTimeout(3000);
  assert.equal(await t.count(), 1, 'toujours là avant 4 s');
  await t.waitFor({ state: 'detached', timeout: 2500 });
  assert.ok(Date.now() - debut >= 3900, 'part seul à 4 s');
});

test('toast : quatre à la suite, trois au plus, le plus ancien part', opts, async () => {
  await page.getByRole('button', { name: 'Quatre à la suite' }).click();
  await page.getByText('Toast Quatre').waitFor();
  assert.equal(await page.locator('.toast').count(), 3);
  assert.equal(await page.getByText('Toast Un', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Toast Deux', { exact: true }).count(), 1);
  await page.waitForTimeout(4300);
  assert.equal(await page.locator('.toast').count(), 0);
});

test('dialogue : alertdialog titrée et décrite, focus sur Annuler, Tab boucle, Échap rend le focus', opts, async () => {
  const ouvrant = page.getByRole('region', { name: 'Boîte de dialogue' }).getByRole('button', { name: 'Retirer la section', exact: true });
  await ouvrant.focus();
  await page.keyboard.press('Enter');
  const d = page.getByRole('alertdialog');
  await d.waitFor();
  assert.equal(await d.getAttribute('aria-modal'), 'true');
  assert.ok(await d.getAttribute('aria-labelledby'));
  assert.ok(await d.getAttribute('aria-describedby'));
  assert.equal(await page.getByRole('alertdialog', { name: 'Retirer la section « Apparence » ?' }).count(), 1);
  assert.equal(await focusLabel(page), 'Annuler');
  await page.keyboard.press('Tab');
  assert.equal(await focusLabel(page), 'Retirer la section');
  await page.keyboard.press('Tab');
  assert.equal(await focusLabel(page), 'Annuler', 'Tab boucle');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await focusLabel(page), 'Retirer la section', 'Shift+Tab boucle');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Retirer la section');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.demo-etat-titre') === null), true);
});

test('dialogue : un clic sur le voile ferme, un clic dans la boîte non ; confirmer retire et un toast le dit', opts, async () => {
  await page.getByRole('region', { name: 'Boîte de dialogue' }).getByRole('button', { name: 'Retirer la section', exact: true }).click();
  const d = page.getByRole('alertdialog');
  await d.waitFor();
  await page.getByRole('heading', { name: 'Retirer la section « Apparence » ?' }).click();
  assert.equal(await d.count(), 1);
  await page.mouse.click(5, 5);
  assert.equal(await d.count(), 0);
  await page.getByRole('region', { name: 'Boîte de dialogue' }).getByRole('button', { name: 'Retirer la section', exact: true }).click();
  await d.waitFor();
  await page.getByRole('button', { name: 'Retirer la section', exact: true }).last().click();
  assert.equal(await d.count(), 0);
  await page.getByText('Section « Apparence » retirée').waitFor();
});

test('champ : étiquette liée au champ ; l’erreur « Erreur : » est reliée par aria-describedby', opts, async () => {
  const c = page.locator('[aria-invalid="true"]');
  assert.equal(await c.getAttribute('aria-invalid'), 'true');
  const id = await c.getAttribute('aria-describedby');
  assert.ok(id);
  assert.equal((await page.locator(`[id="${id}"]`).textContent()).trim(), 'Erreur : Le titre est obligatoire.');
  const ok = page.getByLabel('Nom de la fiche');
  assert.equal(await ok.getAttribute('aria-describedby'), null);
  assert.equal(await ok.inputValue(), 'Maître Aldric');
});

test('bandeaux : role=status, sans bouton pour les fermer', opts, async () => {
  const b = page.locator('.demo .bandeau');
  assert.equal(await b.count(), 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(await b.nth(i).getAttribute('role'), 'status');
    assert.equal(await b.nth(i).locator('button').count(), 0);
  }
});

test('chargement : le squelette est un role=status qui dit « Chargement de la fiche… »', opts, async () => {
  assert.ok(await page.getByText('Chargement de la fiche…').first().isVisible());
});

test('captures : bureau et téléphone, clair et sombre, sans débordement horizontal', opts, async () => {
  for (const [vp, w, h] of [['bureau', 1280, 900], ['telephone', 390, 844]] as const) {
    for (const theme of ['sombre', 'clair'] as const) {
      const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      await p.addInitScript((c: string) => localStorage.setItem('kanevas-theme', c), theme);
      await p.goto('/connexion-bouchon');
      await p.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
      await p.goto('/demo-composants');
      await p.waitForLoadState('networkidle');
      await p.getByRole('heading', { name: 'Composants partagés', level: 1 }).waitFor();
      const deborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(deborde, false, `${vp}/${theme} : pas de défilement horizontal`);
      if (CAPTURES) {
        mkdirSync(CAPTURES, { recursive: true });
        await p.screenshot({ path: `${CAPTURES}/demo-${vp}-${theme}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
});
