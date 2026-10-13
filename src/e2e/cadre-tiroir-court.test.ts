// Black-box re-check of kanevas-rv-cadre, finding « E-9 MJ, 390×526, clair et sombre : le tiroir s'arrête à
// « Membres », « Paramètres » est sous le pied » (docs/ecrans.md § Barre latérale: the MJ's bar ends with
// « Paramètres »; on a phone the bar is a drawer under « Menu »).
//
// TEST PLAN (expected values are written by hand, from the need)
//   nominal   : MJ on a sheet (E-9), 390×526, light theme and dark theme: after scrolling the drawer, « Paramètres »
//               is inside the viewport and is the topmost element at its centre (not under the foot)
//   bords     : heights 480 (shorter), 640 (limit of the short-phone rule) and 641 (just above it): « Paramètres »
//               reachable too; width 390 only
//   exclusion : the whole bar never scrolls (the foot would slide); no entry is covered by the foot, at 480/526/568/664/800
//   joueur    : a player's bar has no « Paramètres »; its last entry « Quêtes » is reachable at 390×526
//   panne visée : a sticky foot laid over a scrolling list covers the last entry at rest (« Paramètres » at 664)
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
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
const FICHE = '/univers/1/fiche/1';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  await creerUnivers(antor, 'Lame d’Ébène');
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const barre = (p: Any) => p.getByRole('complementary', { name: 'Barre latérale' });

async function ouvrirTiroir(p: Any, hauteur: number): Promise<void> {
  await p.setViewportSize({ width: 390, height: hauteur });
  await p.goto(FICHE);
  await attendre(p);
  await p.getByRole('button', { name: 'Menu', exact: true }).click();
  await barre(p).waitFor({ state: 'visible' });
}

async function choisirTheme(p: Any, nom: 'Clair' | 'Sombre'): Promise<void> {
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(FICHE);
  await attendre(p);
  await barre(p).getByRole('button', { name: /antor|lea|léa/i }).click();
  await p.getByRole('menuitemradio', { name: nom }).click();
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), nom === 'Clair' ? 'light' : 'dark');
}

/** Scrolls the entry into view, then says whether it is on screen and topmost at its centre. */
async function atteignable(p: Any, nom: string): Promise<{ ok: boolean; info: string }> {
  const lien = barre(p).getByRole('link', { name: rxExact(nom) });
  await lien.scrollIntoViewIfNeeded();
  const e = await lien.evaluate((el: Any) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { haut: r.top, bas: r.bottom, vh: window.innerHeight, dessus: !!t && (el === t || el.contains(t)) };
  });
  return { ok: e.haut >= 0 && e.bas <= e.vh && e.dessus, info: JSON.stringify(e) };
}

for (const [theme, hauteur] of [['Clair', 526], ['Sombre', 526], ['Sombre', 480], ['Clair', 640], ['Sombre', 640], ['Sombre', 641], ['Clair', 641]] as const) {
  test(`tiroir MJ ${theme}, 390×${hauteur} : « Paramètres » atteignable et non masqué par le pied`, opts, async () => {
    await choisirTheme(antor, theme);
    await ouvrirTiroir(antor, hauteur);
    const r = await atteignable(antor, 'Paramètres');
    assert.ok(r.ok, `Paramètres inatteignable : ${r.info}`);
    const membres = await atteignable(antor, 'Membres');
    assert.ok(membres.ok, `Membres inatteignable : ${membres.info}`);
    if (hauteur === 526) await antor.screenshot({ path: `/tmp/tiroir-${theme}-${hauteur}.png` });
  });
}

test('tiroir MJ sombre 390×526 : le compte du pied reste atteignable', opts, async () => {
  await choisirTheme(antor, 'Sombre');
  await ouvrirTiroir(antor, 526);
  const compte = barre(antor).getByRole('button', { name: /antor/i });
  await compte.scrollIntoViewIfNeeded();
  assert.equal(await compte.isVisible(), true);
});

test('tiroir Joueur 390×526 : pas de « Paramètres », la dernière entrée « Quêtes » est atteignable', opts, async () => {
  await ouvrirTiroir(lea, 526);
  assert.equal(await barre(lea).getByRole('link', { name: rxExact('Paramètres') }).count(), 0);
  const r = await atteignable(lea, 'Quêtes');
  assert.ok(r.ok, `Quêtes inatteignable : ${r.info}`);
});

// Reopening « Paramètres (593–633) is covered by the foot (604–644) at 390×664 »: in the drawer the nav is the only thing
// that scrolls, in the room left above the foot, which is a flex item below it (never sticky over the list).
async function mesuresPied(p: Any) {
  return barre(p).evaluate((b: Any) => {
    const pied = b.querySelector('.pied').getBoundingClientRect();
    const nav = b.querySelector('nav');
    const n = nav.getBoundingClientRect();
    const f = getComputedStyle(b.querySelector('.pied'), '::before');
    const liens = [...nav.querySelectorAll('a')].map((a: Any) => a.getBoundingClientRect());
    return {
      piedHaut: pied.top, piedBas: pied.bottom, navBas: n.bottom, vh: window.innerHeight,
      cache: nav.scrollHeight - nav.clientHeight, fondu: f.backgroundImage, hFondu: f.height,
      // an entry is "covered" when its box, clipped by the nav window, still dips into the foot
      chevauche: liens.filter((r: Any) => Math.min(r.bottom, n.bottom) > pied.top + 1 && r.top < pied.bottom && r.bottom > pied.top + 1 && r.top < n.bottom).length,
      barreDefile: b.scrollHeight - b.clientHeight,
    };
  });
}

for (const [theme, hauteur] of [['Clair', 480], ['Sombre', 526], ['Clair', 568], ['Sombre', 664], ['Clair', 664], ['Sombre', 800]] as const) {
  test(`tiroir MJ ${theme}, 390×${hauteur} : la nav défile au-dessus du pied, aucune entrée ne le chevauche`, opts, async () => {
    await choisirTheme(antor, theme);
    await ouvrirTiroir(antor, hauteur);
    const m = await mesuresPied(antor);
    assert.ok(m.vh - m.piedBas <= 13, `pied non ancré en bas : ${JSON.stringify(m)}`);
    assert.ok(m.navBas <= m.piedHaut + 1, `la nav passe sous le pied : ${JSON.stringify(m)}`);
    assert.ok(m.barreDefile <= 1, `la barre entière défile (le pied glisserait) : ${JSON.stringify(m)}`);
    assert.equal(m.chevauche, 0, `une entrée est recouverte par le pied à l'ouverture : ${JSON.stringify(m)}`);
    if (m.cache > 1) {
      assert.match(m.fondu, /linear-gradient/, `la nav défile sans fondu : ${JSON.stringify(m)}`);
      assert.equal(m.hFondu, '20px');
    }
    // scrolled to the end: « Paramètres » is whole inside the nav window, above the foot, topmost at its centre
    await barre(antor).locator('nav').first().evaluate((el: Any) => { el.scrollTop = el.scrollHeight; });
    const fin = await mesuresPied(antor);
    assert.equal(fin.chevauche, 0, `après défilement : ${JSON.stringify(fin)}`);
    const r = await atteignable(antor, 'Paramètres');
    assert.ok(r.ok, `Paramètres inatteignable : ${r.info}`);
    const bas = await barre(antor).getByRole('link', { name: rxExact('Paramètres') }).evaluate((el: Any) => el.getBoundingClientRect().bottom);
    assert.ok(bas <= fin.piedHaut + 1, `Paramètres (bas ${bas}) passe sous le pied (haut ${fin.piedHaut})`);
    // the first entry is reachable again by scrolling back
    const premier = await barre(antor).locator('nav a').first();
    await premier.scrollIntoViewIfNeeded();
    assert.equal(await premier.isVisible(), true);
  });
}

test('tiroir MJ 390×900 : quand tout tient, le pied reste en bas du tiroir et rien ne défile', opts, async () => {
  await ouvrirTiroir(antor, 900);
  const m = await mesuresPied(antor);
  assert.ok(m.vh - m.piedBas <= 13, `pied non ancré : ${JSON.stringify(m)}`);
  assert.ok(m.cache <= 1 && m.barreDefile <= 1, `défilement alors que tout tient : ${JSON.stringify(m)}`);
});

// « More below » cue (arbitrated 13/10: not an acceptance criterion, but it exists and must follow the scroll):
// the chevron chip is shown (nav[data-plus]) while entries are hidden below, absent once scrolled to the end,
// and absent when everything fits.
const plusVisible = (p: Any) =>
  barre(p).locator('nav').first().evaluate((el: Any) => {
    const chip = el.querySelector('.plus-bas svg');
    return { attr: el.hasAttribute('data-plus'), affiche: !!chip && getComputedStyle(el.querySelector('.plus-bas')).display !== 'none' };
  });

for (const theme of ['Clair', 'Sombre'] as const) {
  test(`tiroir MJ ${theme}, 390×480 : la pastille « plus bas » suit le défilement`, opts, async () => {
    await choisirTheme(antor, theme);
    await ouvrirTiroir(antor, 480);
    const nav = barre(antor).locator('nav').first();
    const debut = await plusVisible(antor);
    assert.deepEqual(debut, { attr: true, affiche: true }, 'des entrées sont cachées : la pastille doit être là');
    await nav.evaluate((el: Any) => { el.scrollTop = el.scrollHeight; });
    await antor.waitForFunction(() => !document.querySelector('.barre nav[data-plus]'));
    assert.deepEqual(await plusVisible(antor), { attr: false, affiche: false }, 'fin de liste : plus de pastille');
    await nav.evaluate((el: Any) => { el.scrollTop = 0; });
    await antor.waitForFunction(() => !!document.querySelector('.barre nav[data-plus]'));
    assert.equal((await plusVisible(antor)).affiche, true, 'retour en haut : la pastille revient');
  });
}

test('tiroir MJ 390×900 : tout tient, pas de pastille', opts, async () => {
  await ouvrirTiroir(antor, 900);
  assert.deepEqual(await plusVisible(antor), { attr: false, affiche: false });
});

test('bureau 1440×900 : jamais de pastille', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await antor.goto(FICHE);
  await attendre(antor);
  assert.equal((await plusVisible(antor)).affiche, false);
});
