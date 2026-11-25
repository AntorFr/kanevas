// ecrans: outil
// E-21, kanevas-carte-rendu-galaxie-systemes-ecran: the « Étoile » group of a system's dialogue (class, continuous size, free colour)
// and the star in the panel. Written by the tester from the exit criterion. The effect (refusals, value read back) is proved at the
// door in `src/routes/systemes-classe-taille-couleur.test.ts`; here only what the user sees. Screenshots in /tmp.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-galaxie-etoile-dialogue';
mkdirSync(SHOTS, { recursive: true });

describe('E-21 le dialogue d’un système règle son étoile, le panneau la montre', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let adresse = '';
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const fondCarte = (page: Any, nom: string) => systeme(page, nom).locator('.gx-point').evaluate((c: Element) => getComputedStyle(c).fill);
  /** The map redraws after the save: wait (on the page) for the fill to settle on what is expected. */
  const fondAtteint = async (page: Any, nom: string, attendu: string, message: string) => {
    await page.waitForFunction(([n, f]: string[]) => {
      const c = document.querySelector(`g.gx-systeme[aria-label="${n}"] .gx-point`);
      return c !== null && getComputedStyle(c).fill === f;
    }, [nom, attendu], { timeout: 10000 }).catch(() => undefined);
    assert.equal(await fondCarte(page, nom), attendu, message);
  };
  const fondApercu = (form: Any) => form.locator('.apercu-etoile circle').evaluate((c: Element) => getComputedStyle(c).fill);

  const ouvre = async (compte: string, largeur = 1280) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: largeur, height: 900 });
    await c.page.goto(adresse);
    await systeme(c.page, 'Vael').waitFor();
    return c;
  };
  const modifier = async (page: Any, nom: string) => {
    await systeme(page, nom).click();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    const form = page.getByRole('region', { name: 'Modifier le système' });
    await form.waitFor();
    return form;
  };
  const enregistrer = async (page: Any, form: Any) => {
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await form.waitFor({ state: 'detached' });
  };

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: join(mkdtempSync(join(tmpdir(), 'kanevas-gxe-')), 'k.db') });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    const E = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${E}/cartes`)).json()) as Any;
    adresse = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
    await a.ctx.close();
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('le groupe Étoile : Classe en liste native (« Tirée de la clé » puis les sept classes), Taille 0–1 au pas 0,01, Couleur facultative, aperçu', async () => {
    const { page, ctx } = await ouvre('Antor');
    const form = await modifier(page, 'Vael');
    const groupe = form.getByRole('group', { name: 'Étoile' });
    await groupe.waitFor();
    const classe = groupe.getByLabel('Classe');
    assert.equal(await classe.evaluate((e: Element) => e.tagName), 'SELECT', 'liste native');
    const options = await classe.locator('option').allTextContents();
    assert.equal(options[0], 'Tirée de la clé');
    assert.equal(options.length, 8, `une option vide et sept classes : ${options.join(' | ')}`);
    const curseur = groupe.locator('input[type=range]');
    assert.deepEqual(await curseur.evaluate((e: HTMLInputElement) => [e.min, e.max, e.step]), ['0', '1', '0.01']);
    assert.equal(await groupe.getByLabel('Couleur').count(), 1);
    assert.equal(await groupe.locator('.apercu-etoile').count(), 1);
    assert.equal(await form.getByRole('radiogroup', { name: 'Taille' }).count(), 0, 'plus de trois boutons');
    await page.screenshot({ path: `${SHOTS}/dialogue-1280.png`, fullPage: true });
    await ctx.close();
  });

  it('une couleur libre teinte l’aperçu puis l’étoile de la carte ; « Effacer la couleur » rend l’étoile à sa classe', async () => {
    const { page, ctx } = await ouvre('Antor');
    let form = await modifier(page, 'Vael');
    await form.getByLabel('Couleur').fill('#d8352a');
    assert.equal(await fondApercu(form), 'rgb(216, 53, 42)', 'l’aperçu prend la couleur posée en direct');
    await page.screenshot({ path: `${SHOTS}/couleur-posee.png`, fullPage: true });
    await enregistrer(page, form);
    await fondAtteint(page, 'Vael', 'rgb(216, 53, 42)', 'la carte la dessine');
    // reread: the dialogue reopens on what was stored
    form = await modifier(page, 'Vael');
    assert.equal(await form.getByLabel('Couleur').inputValue(), '#d8352a');
    assert.equal(await fondApercu(form), 'rgb(216, 53, 42)');
    await form.getByRole('button', { name: 'Effacer la couleur' }).click();
    assert.equal(await form.getByLabel('Couleur').inputValue(), '');
    assert.equal(await form.getByRole('button', { name: 'Effacer la couleur' }).count(), 0);
    assert.notEqual(await fondApercu(form), 'rgb(216, 53, 42)', 'l’aperçu revient à la couleur de la classe');
    const deClasse = await fondApercu(form);
    await enregistrer(page, form);
    await fondAtteint(page, 'Vael', deClasse, 'la carte dessine la couleur de la classe, celle de l’aperçu');
    form = await modifier(page, 'Vael');
    assert.equal(await form.getByLabel('Couleur').inputValue(), '', 'rien n’est resté enregistré');
    await ctx.close();
  });

  it('une classe choisie fixe la classe de l’étoile de la carte et celle du panneau', async () => {
    const { page, ctx } = await ouvre('Antor');
    const form = await modifier(page, 'Hesper');
    await form.getByLabel('Classe').selectOption({ index: 3 });
    const lettre = await form.getByLabel('Classe').inputValue();
    assert.match(lettre, /^[MKGFABV]$/);
    const libelle = (await form.getByLabel('Classe').locator('option:checked').textContent())!;
    await enregistrer(page, form);
    assert.equal(await systeme(page, 'Hesper').locator('.gx-point').getAttribute('data-classe'), lettre);
    await systeme(page, 'Hesper').click();
    const panneau = page.getByRole('region', { name: 'Système sélectionné' });
    assert.ok(await panneau.getByRole('img', { name: `Étoile de classe ${libelle}` }).count() === 1, `panneau : Étoile de classe ${libelle}`);
    await ctx.close();
  });

  it('un refus « couleur » du serveur s’affiche sous le champ, le dialogue reste ouvert et rien n’est enregistré', async () => {
    const { page, ctx } = await ouvre('Antor');
    const avant = await fondCarte(page, 'Port-Sel');
    const form = await modifier(page, 'Port-Sel');
    await page.route('**/galaxie/galaxies/*/systemes/*', (r: Any) => (r.request().method() === 'PATCH'
      ? r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalide', champ: 'couleur', message: 'Couleur : #rrggbb en minuscules.' }) })
      : r.continue()));
    await form.getByLabel('Couleur').fill('#123456');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const champ = form.locator('.champ-couleur');
    await champ.getByText('Couleur : #rrggbb en minuscules.').waitFor();
    assert.equal(await form.count(), 1, 'le dialogue reste ouvert');
    assert.equal(await form.getByLabel('Couleur').inputValue(), '#123456', 'la saisie est gardée');
    await page.screenshot({ path: `${SHOTS}/refus-couleur.png`, fullPage: true });
    await page.unroute('**/galaxie/galaxies/*/systemes/*');
    await form.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await fondCarte(page, 'Port-Sel'), avant, 'la carte n’a pas bougé');
    await ctx.close();
  });

  it('la taille posée au bout du curseur est celle qui est relue (1,00 reste la plus grande étoile)', async () => {
    const { page, ctx } = await ouvre('Antor');
    let form = await modifier(page, 'Port-Sel');
    await form.locator('input[type=range]').fill('1');
    const rayonApercu = await form.locator('.apercu-etoile circle').getAttribute('r');
    await enregistrer(page, form);
    const rayonCarte = await systeme(page, 'Port-Sel').locator('.gx-point').getAttribute('r');
    assert.equal(Number(rayonCarte), 12, `la carte dessine la plus grande étoile (aperçu : ${rayonApercu}, carte : ${rayonCarte})`);
    form = await modifier(page, 'Port-Sel');
    assert.ok(Number(await form.locator('input[type=range]').inputValue()) >= 0.99, 'le curseur se rouvre en haut');
    await ctx.close();
  });

  it('le panneau montre l’étoile avec son libellé de classe à une joueuse, sans aucun champ', async () => {
    const { page, ctx } = await ouvre('Léa');
    await systeme(page, 'Vael').click();
    const panneau = page.getByRole('region', { name: 'Système sélectionné' });
    const image = panneau.getByRole('img', { name: /^Étoile de classe / });
    await image.waitFor();
    const libelle = (await image.getAttribute('aria-label'))!.replace('Étoile de classe ', '');
    assert.ok(libelle.length > 0);
    await panneau.getByText(`Classe ${libelle}`).waitFor();
    const taille = await image.boundingBox();
    assert.deepEqual([Math.round(taille.width), Math.round(taille.height)], [56, 56]);
    assert.equal(await panneau.locator('select, input[type=range], textarea').count(), 0, 'aucun champ de l’étoile');
    assert.equal(await panneau.getByLabel('Classe', { exact: true }).count(), 0);
    assert.equal(await panneau.getByLabel('Couleur', { exact: true }).count(), 0);
    assert.equal(await panneau.getByText('Taille', { exact: true }).count(), 0, 'plus de ligne « Taille » en petite/moyenne/grande');
    await page.screenshot({ path: `${SHOTS}/panneau-lea.png`, fullPage: true });
    await ctx.close();
  });

  it('à 390 px les trois champs s’empilent, cibles de 44 px, sans débordement', async () => {
    const { page, ctx } = await ouvre('Antor', 390);
    const form = await modifier(page, 'Vael');
    const groupe = form.getByRole('group', { name: 'Étoile' });
    await groupe.waitFor();
    await form.getByLabel('Couleur').fill('#d8352a');
    const b = async (loc: Any) => loc.boundingBox();
    const classe = await b(groupe.getByLabel('Classe'));
    const curseur = await b(groupe.locator('input[type=range]'));
    const couleur = await b(groupe.getByLabel('Couleur'));
    assert.ok(curseur.y >= classe.y + classe.height - 1, 'Taille sous Classe');
    assert.ok(couleur.y >= curseur.y + curseur.height - 1, 'Couleur sous Taille');
    for (const [nom, boite] of [['Classe', classe], ['Taille', curseur], ['Couleur', couleur]] as [string, Any][]) {
      assert.ok(boite.height >= 44 - 1, `${nom} : cible de ${boite.height} px`);
    }
    const effacer = await b(groupe.getByRole('button', { name: 'Effacer la couleur' }));
    assert.ok(effacer.height >= 44 - 1, `Effacer la couleur : ${effacer.height} px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'aucun débordement horizontal');
    await page.screenshot({ path: `${SHOTS}/dialogue-390.png`, fullPage: true });
    await ctx.close();
  });
});
