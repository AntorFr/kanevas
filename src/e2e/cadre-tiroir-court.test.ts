// Black-box re-check of kanevas-rv-cadre, finding « E-9 MJ, 390×526, clair et sombre : le tiroir s'arrête à
// « Membres », « Paramètres » est sous le pied » (docs/ecrans.md § Barre latérale: the MJ's bar ends with
// « Paramètres »; on a phone the bar is a drawer under « Menu »).
//
// TEST PLAN (expected values are written by hand, from the need)
//   nominal   : MJ on a sheet (E-9), 390×526, light theme and dark theme: after scrolling the drawer, « Paramètres »
//               is inside the viewport and is the topmost element at its centre (not under the foot)
//   bords     : heights 480 (shorter), 640 (limit of the short-phone rule) and 641 (just above it): « Paramètres »
//               reachable too; width 390 only
//   exclusion : no entry of the navigation hides in a small inner scroll window above the foot at 526
//   joueur    : a player's bar has no « Paramètres »; its last entry « Quêtes » is reachable at 390×526
//   panne visée : the nav scrolls alone under a foot that stays put, so the last entry sits under the foot
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

test('tiroir MJ sombre 390×526 : aucune entrée ne se cache dans une petite fenêtre défilante au-dessus du pied', opts, async () => {
  await choisirTheme(antor, 'Sombre');
  await ouvrirTiroir(antor, 526);
  const caches = await barre(antor).locator('nav').first().evaluate((el: Any) => el.scrollHeight - el.clientHeight);
  assert.ok(caches <= 1, `${caches} px de navigation cachés dans le nav`);
});

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

// Reopening « le pied n'est plus ancré, la liste s'arrête net sans indice de suite » : at the opening of the drawer on
// a short phone, the foot sits on the bottom edge of the screen, a fade above it hints that the list goes on, and once
// scrolled to the end « Paramètres » is above the foot, not under it.
async function mesuresPied(p: Any) {
  return barre(p).evaluate((b: Any) => {
    const pied = b.querySelector('.pied');
    const r = pied.getBoundingClientRect();
    const f = getComputedStyle(pied, '::before');
    return { bas: r.bottom, haut: r.top, vh: window.innerHeight, fondu: f.backgroundImage, hFondu: f.height, defile: b.scrollHeight - b.clientHeight };
  });
}

for (const theme of ['Clair', 'Sombre'] as const) {
  test(`tiroir MJ ${theme}, 390×526 à l'ouverture : pied ancré en bas de l'écran et fondu qui montre la suite`, opts, async () => {
    await choisirTheme(antor, theme);
    await ouvrirTiroir(antor, 526);
    const m = await mesuresPied(antor);
    assert.ok(m.defile > 40, `la barre devrait défiler (${m.defile} px) : ce test suppose une liste plus haute que l'écran`);
    assert.ok(m.vh - m.bas <= 13, `pied non ancré en bas : ${JSON.stringify(m)}`);
    assert.match(m.fondu, /linear-gradient/, `aucun fondu au-dessus du pied : ${JSON.stringify(m)}`);
    assert.equal(m.hFondu, '20px');
    // scrolled to the end: the foot is still on the bottom edge and « Paramètres » ends above its top
    await barre(antor).evaluate((b: Any) => { b.scrollTop = b.scrollHeight; });
    const fin = await mesuresPied(antor);
    assert.ok(fin.vh - fin.bas <= 13, `pied décroché après défilement : ${JSON.stringify(fin)}`);
    const bas = await barre(antor).getByRole('link', { name: rxExact('Paramètres') }).evaluate((el: Any) => el.getBoundingClientRect().bottom);
    assert.ok(bas <= fin.haut + 1, `Paramètres (bas ${bas}) passe sous le pied (haut ${fin.haut})`);
    // nothing of the list shows through the strip left under the foot (the bar's padding)
    const dessous = await barre(antor).evaluate((b: Any) => {
      const t = document.elementFromPoint(150, window.innerHeight - 4);
      return t && t !== b && !!t.closest('nav') ? t.outerHTML.slice(0, 80) : '';
    });
    assert.equal(dessous, '', `la liste se voit sous le pied : ${dessous}`);
    await antor.waitForTimeout(500); // the slide-in ends
    await antor.screenshot({ path: `/tmp/tiroir-pied-${theme}.png` });
  });
}

test('tiroir MJ 390×900 : quand tout tient, le pied reste en bas du tiroir et la barre ne défile pas', opts, async () => {
  await ouvrirTiroir(antor, 900);
  const m = await mesuresPied(antor);
  assert.ok(m.vh - m.bas <= 13, `pied non ancré : ${JSON.stringify(m)}`);
  assert.ok(m.defile <= 1, `la barre défile alors que tout tient : ${JSON.stringify(m)}`);
});
