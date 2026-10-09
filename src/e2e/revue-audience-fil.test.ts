// Black-box tests of the re-verification of `kanevas-refonte-visuelle`, from the need only
// (docs/charte.md « Échap le ferme et rend le focus à la pastille »; docs/ecrans.md « le fil garde son
// dernier maillon entier », E-3 « univers › Vue d'ensemble »). Real stub server + Chromium (harnais.test.ts).
//
// TEST PLAN
//   A. Échap, boîte « Qui voit » ouverte depuis la pastille
//      - focus resté sur la pastille (rien d'autre touché)     -> boîte fermée, pastille aria-expanded=false, focus sur la pastille
//      - focus sur un interrupteur de la boîte                  -> boîte fermée, focus rendu à la pastille
//      - exclusion : Échap sans boîte ouverte ne change rien (la fiche reste, aucune boîte)
//   B. Fil d'Ariane, dernier maillon entier
//      - nom d'univers très long + titre court : le titre est lu en entier, le nom d'univers est coupé (infobulle = texte entier)
//      - titre long ET nom long : le dernier maillon garde au moins autant de place que le précédent
//   C. E-3 : « univers › Vue d'ensemble » (le test de cadre-univers couvre le nominal ; ici l'univers au nom long)
//      - le dernier maillon « Vue d'ensemble » reste entier quand le nom d'univers est long
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, ajouterSection, attendre, connecte, creerFiche, creerUnivers, launch, section, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
const NOM_LONG = 'Les Chroniques Oubliées de la Lame d’Ébène et des Sept Royaumes Brisés';
let urlUnivers = '';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  antor.setDefaultTimeout(8000);
  await creerUnivers(antor, NOM_LONG);
  urlUnivers = '/univers/1';
  await creerFiche(antor, 'personnage', 'Aldric');
  await antor.getByRole('heading', { name: 'Aldric', level: 1 }).waitFor();
  await ajouterSection(antor, 'Apparence');
  await creerFiche(antor, 'personnage', 'Aldric le Grand Pourfendeur des Ombres de la Marche Grise');
  await antor.getByRole('heading', { level: 1 }).waitFor();
}, { timeout: 120000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const fil = (p: Any) => p.getByRole('navigation', { name: /Ariane/ });

async function versFiche(titre: string) {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await antor.goto(urlUnivers + '/fiches/personnages');
  await attendre(antor);
  await antor.getByRole('link', { name: titre }).first().click();
  await antor.getByRole('heading', { name: titre, level: 1 }).waitFor();
  await attendre(antor);
}

test('A : Échap avec le focus resté sur la pastille ferme la boîte « Qui voit »', opts, async () => {
  await versFiche('Aldric');
  const pastille = section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ });
  await pastille.click();
  const boite = antor.getByRole('dialog', { name: 'Qui voit « Apparence »' });
  await boite.waitFor();
  assert.equal(await pastille.getAttribute('aria-expanded'), 'true');
  await pastille.focus();
  await antor.keyboard.press('Escape');
  await boite.waitFor({ state: 'detached' });
  assert.equal(await pastille.getAttribute('aria-expanded'), 'false');
  assert.equal(await antor.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), await pastille.getAttribute('aria-label'));
});

test('A : Échap avec le focus sur un interrupteur de la boîte la ferme et rend le focus à la pastille', opts, async () => {
  await versFiche('Aldric');
  const pastille = section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ });
  await pastille.click();
  const boite = antor.getByRole('dialog', { name: 'Qui voit « Apparence »' });
  await boite.waitFor();
  await boite.getByRole('switch').first().focus();
  await antor.keyboard.press('Escape');
  await boite.waitFor({ state: 'detached' });
  assert.equal(await pastille.getAttribute('aria-expanded'), 'false');
  assert.equal(await antor.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), await pastille.getAttribute('aria-label'));
});

test('A : la boîte se rouvre après Échap, et Échap la referme encore', opts, async () => {
  await versFiche('Aldric');
  const pastille = section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ });
  const boite = antor.getByRole('dialog', { name: 'Qui voit « Apparence »' });
  for (let i = 0; i < 2; i++) {
    await pastille.click();
    await boite.waitFor();
    await antor.keyboard.press('Escape');
    await boite.waitFor({ state: 'detached' });
  }
});

test('A : Échap sans boîte ouverte ne change rien à la fiche', opts, async () => {
  await versFiche('Aldric');
  await antor.keyboard.press('Escape');
  assert.equal(await antor.getByRole('dialog').count(), 0);
  await antor.getByRole('heading', { name: 'Aldric', level: 1 }).waitFor();
  await section(antor, 'Apparence').waitFor();
});

/** Right edge of the visible text of each crumb vs the left edge of the next one: texts must never overlap. */
const chevauchements = (nav: Any) =>
  nav.evaluate((n: HTMLElement) => {
    const boites = Array.from(n.querySelectorAll('.maillon')).filter((m) => m.getBoundingClientRect().width > 0);
    const res: string[] = [];
    for (let i = 0; i < boites.length - 1; i++) {
      const txt = boites[i]!.querySelector('.tronque:not(.lib-ariane)') ?? boites[i]!.querySelector('.tronque');
      if (!txt) continue;
      const r = txt.getBoundingClientRect();
      const suivant = boites[i + 1]!.getBoundingClientRect();
      const propre = boites[i]!.getBoundingClientRect();
      // the text box (clipped by an ellipsis) must end inside its own crumb
      if (r.right > propre.right + 1) res.push(`crumb ${i}: text ends at ${r.right}, crumb ends at ${propre.right}`);
      if (r.right > suivant.left + 1 && r.width > 0) res.push(`crumb ${i}: text ends at ${r.right}, next starts at ${suivant.left}`);
    }
    return res;
  });

test('B : nom d’univers très long, titre court : le titre est lu en entier, le nom d’univers cède', opts, async () => {
  await versFiche('Aldric');
  await antor.setViewportSize({ width: 780, height: 900 });
  const dernier = fil(antor).locator('[aria-current="page"]');
  assert.equal((await dernier.innerText()).trim(), 'Aldric');
  const entier = await dernier.locator('.tronque').evaluate((e: HTMLElement) => e.scrollWidth <= e.clientWidth);
  assert.ok(entier, 'the last crumb is not cut');
  const univers = fil(antor).getByRole('link', { name: new RegExp(NOM_LONG.slice(0, 20)) });
  assert.equal(await univers.getAttribute('title'), NOM_LONG);
  assert.deepEqual(await chevauchements(fil(antor)), []);
});

test('B : nom et titre longs : le dernier maillon reste lisible, les précédents ne le recouvrent pas', opts, async () => {
  await versFiche('Aldric le Grand Pourfendeur des Ombres de la Marche Grise');
  await antor.setViewportSize({ width: 1100, height: 900 });
  const dernier = fil(antor).locator('[aria-current="page"] .tronque');
  assert.ok(await dernier.evaluate((e: HTMLElement) => e.scrollWidth <= e.clientWidth), 'the last crumb is not cut');
  assert.deepEqual(await chevauchements(fil(antor)), []);
  assert.equal(await antor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
});

test('C : Vue d’ensemble d’un univers au nom long : « Vue d’ensemble » reste entier, sans lien', opts, async () => {
  await antor.setViewportSize({ width: 780, height: 900 });
  await antor.goto(urlUnivers);
  await attendre(antor);
  const dernier = fil(antor).locator('[aria-current="page"]');
  assert.equal((await dernier.innerText()).trim(), 'Vue d’ensemble');
  assert.ok(await dernier.locator('.tronque').evaluate((e: HTMLElement) => e.scrollWidth <= e.clientWidth));
  assert.equal(await fil(antor).getByRole('link', { name: /Vue d’ensemble/ }).count(), 0);
});
