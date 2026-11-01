// Browser tests of the E-9 rework of kanevas-types-ecran-fiche (docs/maquettes/e09-fiche-importee.html):
// drawn sub-type list (combobox/listbox), « (actuel) » in the change-type box, badge on one line at 390 px.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rxExact, skipBrowser, startServer, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/caps';
let srv: Server;
let browser: Any;
const entete = (page: Any) => page.locator('header').filter({ has: page.locator('.type') }).first();

describe('kanevas-types-ecran-fiche, reprise E-9', { skip: skipBrowser }, () => {
  let antor: Any;
  let lame = 0;
  let val = 0;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const r = await antor.request.fetch(`${srv.base}/api/univers`);
    lame = ((await r.json()) as { id: number; nom: string }[]).find((u) => u.nom === "Lame d'Ébène")!.id;
    const l = await (await antor.request.fetch(`${srv.base}/api/univers/${lame}/fiches?type=lieu`)).json();
    val = ((Array.isArray(l) ? l : l.fiches) as { id: number; titre: string }[]).find((f) => f.titre === 'Val-Fortin')!.id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('sous-type en place : liste dessinée (listbox), titre, coche sur la valeur courante, pas de datalist', async () => {
    await antor.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(antor);
    await entete(antor).getByRole('button', { name: rxExact('Sous-type : Ville. Modifier le sous-type') }).click();
    const champ = antor.getByRole('combobox', { name: 'Sous-type' });
    const liste = antor.getByRole('listbox');
    await liste.waitFor();
    await liste.getByRole('option').first().waitFor();
    assert.match(await liste.getAttribute('aria-label'), /^Sous-types de lieu déjà employés$/);
    assert.equal(await antor.locator('datalist').count(), 0);
    assert.ok((await liste.getByRole('option').count()) >= 1);
    assert.equal(await liste.getByRole('option', { name: /Ville/ }).locator('[aria-label="sous-type actuel"]').count(), 1);
    await champ.fill('zzzz-aucun');
    assert.equal(await liste.getByRole('option').count(), 0);
    await champ.press('Escape');
    await entete(antor).getByRole('button', { name: rxExact('Sous-type : Ville. Modifier le sous-type') }).waitFor();
  });

  test('sous-type en place : choisir une option à la flèche + Entrée l’enregistre', async () => {
    await antor.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(antor);
    await entete(antor).getByRole('button', { name: rxExact('Sous-type : Ville. Modifier le sous-type') }).click();
    const liste = antor.getByRole('listbox');
    await antor.getByRole('combobox', { name: 'Sous-type' }).fill('');
    await liste.getByRole('option').nth(1).waitFor();
    const noms = (await liste.getByRole('option').allInnerTexts()).map((s: string) => s.trim());
    const champ = antor.getByRole('combobox', { name: 'Sous-type' });
    await champ.press('ArrowDown');
    await champ.press('Enter');
    await antor.getByText('Sous-type enregistré.').waitFor();
    assert.match(await entete(antor).innerText(), new RegExp(`Lieu\\s*·\\s*${noms[0]}`));
    await antor.request.fetch(`${srv.base}/api/univers/${lame}/fiches/${val}`, { method: 'PATCH', data: { sousType: 'Ville' } });
  });

  test('« Changer le type… » : type courant listé et marqué « (actuel) », non choisissable comme cible, champ avant « sera retiré »', async () => {
    await antor.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(antor);
    await antor.getByRole('button', { name: /^Autres actions sur « Val-Fortin/ }).click();
    await antor.getByRole('menuitem', { name: /Changer le type/ }).click();
    const boite = antor.getByRole('dialog');
    await boite.getByText('(actuel)').waitFor();
    assert.equal(await boite.getByText('(actuel)').count(), 1);
    const courant = boite.locator('label', { hasText: '(actuel)' });
    assert.match(await courant.innerText(), /Lieu/);
    assert.equal(await courant.locator('input[type=radio]').isChecked(), true);
    assert.equal(await boite.getByRole('button', { name: rxExact('Changer le type') }).isDisabled(), true);
    // kanevas-sous-type-dialogue: on the current type no « sera retiré » line; it appears with another type.
    assert.equal(await boite.getByText(/sera retiré/).count(), 0);
    await boite.getByRole('radio', { name: rxExact('Faction') }).check();
    const yChamp = (await boite.getByLabel('Sous-type').boundingBox()).y;
    const yRetrait = (await boite.getByText(/sera retiré/).boundingBox()).y;
    assert.ok(yChamp < yRetrait, 'le champ « Sous-type » précède la ligne « sera retiré »');
    await antor.screenshot({ path: `${CAPTURES}/types-fiche-actuel.png` });
    await antor.keyboard.press('Escape');
  });

  for (const th of ['light', 'dark'] as const) {
    test(`badge à 390 px (${th}) : édition du sous-type sans « · » orphelin, titre sous le badge, pas de débordement`, async () => {
      const ctx = await browser.newContext({ storageState: await antor.context().storageState(), colorScheme: th, viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();
      await p.goto(`${srv.base}/univers/${lame}/fiche/${val}`);
      await attendre(p);
      await entete(p).getByRole('button', { name: rxExact('Sous-type : Ville. Modifier le sous-type') }).click();
      const champ = p.getByRole('combobox', { name: 'Sous-type' });
      await champ.waitFor();
      const badge = p.locator('.type').filter({ has: champ }).first();
      const b = await badge.boundingBox();
      const c = await champ.boundingBox();
      const ic = await badge.locator('svg').first().boundingBox();
      // icon, type, « · » and the field share one line (same vertical band)
      assert.ok(Math.abs(c.y + c.height / 2 - (ic.y + ic.height / 2)) < 14, `champ et icône sur une ligne (${c.y} vs ${ic.y})`);
      assert.ok(b.height < 60, `badge d'au plus ~une ligne (hauteur ${b.height})`);
      assert.ok(c.x + c.width <= 390 + 1 && b.x + b.width <= 390 + 1, 'pas de débordement horizontal');
      assert.ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
      const titre = await p.locator('h1').first().boundingBox();
      assert.ok(titre.y >= b.y + b.height - 1, 'le titre est sous le badge');
      await p.screenshot({ path: `${CAPTURES}/types-fiche-390-${th}.png` });
      await ctx.close();
    });
  }
});
