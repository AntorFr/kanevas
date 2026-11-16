// Review tests of kanevas-synchro-cles-champs (E-9 key block, E-14 identifier field, B-99, B-100).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let uCle = '';
const fiches: Record<string, Any> = {};

async function api(page: Any, chemin: string, methode = 'GET', data?: Any) {
  const r = await page.request.fetch(srv.base + chemin, { method: methode, data });
  return { statut: r.status(), corps: await r.json().catch(() => null) };
}

describe('kanevas-synchro-cles-champs, clé de fiche et identifiant', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_STUB: '1', KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const u = (await api(antor, '/api/univers')).corps.find((x: Any) => x.nom === "Lame d'Ébène");
    U = u.id;
    uCle = u.cle;
    for (const q of ['Port-Sel', 'Sphères']) {
      const r = (await api(antor, `/api/univers/${U}/fiches?q=${encodeURIComponent(q)}`)).corps;
      for (const f of r.fiches) fiches[f.titre] = f;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const ouvrir = async (page: Any, largeur = 1280, th: 'light' | 'dark' = 'light') => {
    const ctx = await browser.newContext({ storageState: await page.context().storageState(), colorScheme: th, baseURL: srv.base, viewport: { width: largeur, height: 800 } });
    await ctx.addInitScript('window.__name = (f) => f;');
    return { ctx, p: await ctx.newPage() };
  };

  test('le MJ change la clé : adresse remplacée, « Enregistré. », ancienne clé ouvre encore ; inchangé = Enregistrer inactif', async () => {
    const id = fiches['Port-Sel'].id;
    const avant = (await api(antor, `/api/univers/${U}/fiches/${id}`)).corps.cle as string;
    const [type] = avant.split(':');
    const { ctx, p } = await ouvrir(antor);
    await p.goto(`/univers/${uCle}/${avant.replace(':', '/')}`);
    await p.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    await p.locator('code.cle-fiche-valeur').filter({ hasText: avant }).waitFor();
    await p.getByRole('button', { name: 'Copier' }).waitFor();
    await p.getByRole('button', { name: 'Modifier la clé…' }).click();
    const champ = p.getByLabel('Clé de la fiche');
    assert.equal(await champ.inputValue(), avant);
    assert.ok(await champ.evaluate((e: Any) => e === document.activeElement), 'focus dans le champ');
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true, 'inactif tant qu’inchangé');
    await p.getByText('ne la retrouveront plus par cette clé').waitFor();
    // Annuler ferme sans écrire
    await p.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await p.getByLabel('Clé de la fiche').count(), 0);
    assert.equal((await api(antor, `/api/univers/${U}/fiches/${id}`)).corps.cle, avant);
    // Enregistrer
    await p.getByRole('button', { name: 'Modifier la clé…' }).click();
    await p.getByLabel('Clé de la fiche').fill(`${type}:port-sel-neuf`);
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('Enregistré.').first().waitFor();
    await p.waitForFunction((a: string) => location.pathname === a, `/univers/${uCle}/${type}/port-sel-neuf`);
    await p.locator('code.cle-fiche-valeur').filter({ hasText: `${type}:port-sel-neuf` }).waitFor();
    assert.equal((await api(antor, `/api/univers/${U}/fiches/${id}`)).corps.cle, `${type}:port-sel-neuf`);
    // L'ancienne clé ouvre encore la fiche
    await p.goto(`/univers/${uCle}/${avant.replace(':', '/')}`);
    await p.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    await p.waitForFunction((a: string) => location.pathname === a, `/univers/${uCle}/${type}/port-sel-neuf`);
    await ctx.close();
  });

  test('clé prise et clé sans lettre : message sous le champ, saisie et focus gardés, rien d’écrit', async () => {
    const id = fiches['Les Sphères'].id;
    const prise = (await api(antor, `/api/univers/${U}/fiches/${fiches['Port-Sel'].id}`)).corps.cle as string;
    const avant = (await api(antor, `/api/univers/${U}/fiches/${id}`)).corps.cle as string;
    const { ctx, p } = await ouvrir(antor, 390, 'dark');
    await p.goto(`/univers/${U}/fiche/${id}`);
    await p.getByRole('heading', { level: 1, name: 'Les Sphères', exact: true }).waitFor();
    await p.getByRole('button', { name: 'Modifier la clé…' }).click();
    for (const [saisie, message] of [
      [prise, 'Cette clé existe déjà dans l’univers.'],
      ['12', 'Lettres minuscules, chiffres, - et _, un « : » au plus, avec au moins une lettre.'],
    ] as const) {
      await p.getByLabel('Clé de la fiche').fill(saisie);
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText(`Erreur : ${message}`).waitFor();
      assert.equal(await p.getByLabel('Clé de la fiche').inputValue(), saisie, 'saisie gardée');
      await p.waitForFunction(() => document.activeElement?.tagName === 'INPUT');
      assert.equal((await api(antor, `/api/univers/${U}/fiches/${id}`)).corps.cle, avant, 'rien écrit');
    }
    await p.screenshot({ path: '/tmp/cle-refus-dark-390.png' });
    await ctx.close();
  });

  test('une joueuse ne voit pas le bloc ; le MJ en mode Joueur non plus', async () => {
    const id = fiches['Port-Sel'].id;
    const l = await ouvrir(lea);
    await l.p.goto(`/univers/${U}/fiche/${id}`);
    await l.p.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    await l.p.waitForTimeout(500);
    assert.equal(await l.p.locator('.cle-fiche').count(), 0);
    assert.equal(await l.p.getByRole('button', { name: 'Modifier la clé…' }).count(), 0);
    await l.ctx.close();
    const { ctx, p } = await ouvrir(antor);
    await p.goto(`/univers/${U}/fiche/${id}`);
    await p.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    await p.locator('.cle-fiche').waitFor();
    const bascule = p.getByRole('button', { name: /mode joueur/i }).or(p.getByRole('switch', { name: /joueur/i })).or(p.getByLabel(/mode joueur/i));
    assert.ok(await bascule.count() > 0, 'bascule du mode Joueur trouvée');
    await bascule.first().click();
    await p.waitForFunction(() => document.querySelectorAll('.cle-fiche').length === 0);
    await ctx.close();
  });

  test('E-14 : identifiant prérempli, refus (forme, pris) sans rien enregistrer, puis changement : adresse remplacée, ancien mène encore', async () => {
    const autre = (await api(antor, '/api/univers')).corps.find((x: Any) => x.id !== U);
    const { ctx, p } = await ouvrir(antor);
    await p.goto(`/univers/${uCle}/parametres`);
    const ident = p.getByLabel('Identifiant', { exact: true });
    await ident.waitFor();
    assert.equal(await ident.inputValue(), uCle);
    const enreg = p.getByRole('button', { name: 'Enregistrer' }).first();
    assert.equal(await enreg.isDisabled(), true, 'inactif tant que tout est inchangé');
    const nom = p.getByLabel('Nom', { exact: true });
    const nomAvant = await nom.inputValue();
    // forme
    await nom.fill(nomAvant + ' X');
    await ident.fill('12');
    await enreg.click();
    await p.getByText('Erreur : Lettres minuscules, chiffres et tirets, 2 à 40, avec au moins une lettre.').waitFor();
    assert.equal(await ident.inputValue(), '12');
    assert.equal((await api(antor, `/api/univers/${U}`)).corps.nom, nomAvant, 'le nom n’est pas enregistré non plus');
    // pris
    if (autre?.cle) {
      await ident.fill(autre.cle);
      await enreg.click();
      await p.getByText('Erreur : Cet identifiant est déjà pris.').waitFor();
      assert.equal((await api(antor, `/api/univers/${U}`)).corps.nom, nomAvant);
    }
    // succès
    const neuf = 'lame-neuve';
    await ident.fill(neuf);
    await enreg.click();
    await p.getByText('Enregistré.').first().waitFor();
    await p.waitForFunction((a: string) => location.pathname === a, `/univers/${neuf}/parametres`);
    const u = (await api(antor, `/api/univers/${U}`)).corps;
    assert.equal(u.cle, neuf);
    assert.equal(u.nom, nomAvant + ' X');
    await p.goto(`/univers/${uCle}/parametres`);
    await p.getByLabel('Identifiant', { exact: true }).waitFor();
    assert.equal((await api(antor, `/api/univers/${uCle}`)).statut, 200, 'ancien identifiant mène encore');
    await ctx.close();
  });
});
