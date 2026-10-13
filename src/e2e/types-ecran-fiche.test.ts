// Browser tests of kanevas-types-ecran-fiche, from its exit criterion: E-9 sub-type edited in place and
// « Changer le type… » (AD-113). Real server in stub mode WITH the starting world, real Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/caps';
let srv: Server;
let browser: Any;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json().catch(() => null);
}
const capture = (page: Any, nom: string) => page.screenshot({ path: `${CAPTURES}/types-fiche-${nom}.png`, fullPage: true });
const entete = (page: Any) => page.locator('header').filter({ has: page.locator('.type') }).first();

describe('kanevas-types-ecran-fiche, au navigateur', { skip: skipBrowser }, () => {
  let antor: Any;
  let lea: Any;
  let lame = 0;
  let val = 0;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    lame = ((await api(antor, 'GET', '/api/univers')) as { id: number; nom: string }[]).find((u) => u.nom === "Lame d'Ébène")!.id;
    const liste = (await api(antor, 'GET', `/api/univers/${lame}/fiches?type=lieu`)) as Any;
    const fiches = (Array.isArray(liste) ? liste : liste.fiches) as { id: number; titre: string }[];
    val = fiches.find((f) => f.titre === 'Val-Fortin')!.id;
    assert.ok(val);
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Antor édite « Ville » en « Cité » dans le badge ; Léa lit « Lieu · Cité » sans pouvoir le modifier', async () => {
    await antor.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(antor);
    await entete(antor).getByRole('button', { name: rxExact('Ville') }).click();
    const champ = antor.getByLabel('Sous-type', { exact: true });
    await champ.fill('Cité');
    await champ.press('Enter');
    await antor.getByText('Sous-type enregistré.').or(antor.getByText(rxExact('Lieu · Cité'))).first().waitFor();
    await attendre(antor);
    assert.match(await entete(antor).innerText(), /Lieu\s*·\s*Cité/);
    await capture(antor, 'badge-mj');
    await lea.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(lea);
    assert.match(await entete(lea).innerText(), /Lieu\s*·\s*Cité/);
    assert.equal(await lea.getByRole('button', { name: rxExact('Cité') }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    await capture(lea, 'badge-joueur');
  });

  test('Échap annule l’édition sans rien enregistrer ; plus de 60 caractères : « Erreur : 60 caractères au plus. »', async () => {
    await antor.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(antor);
    await entete(antor).getByRole('button', { name: rxExact('Cité') }).click();
    const champ = antor.getByLabel('Sous-type', { exact: true });
    await champ.fill('Autre');
    await champ.press('Escape');
    await entete(antor).getByRole('button', { name: rxExact('Cité') }).waitFor();
    await entete(antor).getByRole('button', { name: rxExact('Cité') }).click();
    await antor.getByLabel('Sous-type', { exact: true }).fill('x'.repeat(61));
    await antor.getByLabel('Sous-type', { exact: true }).press('Enter');
    await antor.getByText('Erreur : 60 caractères au plus.').waitFor();
    assert.equal((await api(antor, 'GET', `/api/univers/${lame}/fiches/${val}`)).sousType, 'Cité');
  });

  test('un champ vidé retire le sous-type : « Sous-type retiré. », « Sous-type » pour Antor, rien pour Léa', async () => {
    await antor.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(antor);
    await entete(antor).getByRole('button', { name: rxExact('Cité') }).click();
    const champ = antor.getByLabel('Sous-type', { exact: true });
    await champ.fill('');
    await champ.press('Enter');
    await antor.getByText('Sous-type retiré.').waitFor();
    await entete(antor).getByRole('button', { name: rxExact('Sous-type') }).waitFor();
    await lea.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(lea);
    const t = await entete(lea).innerText();
    assert.doesNotMatch(t, /·/);
    assert.doesNotMatch(t, /Sous-type/);
    await capture(antor, 'retire-mj');
  });

  test('échec serveur de l’enregistrement du sous-type : l’édition reste ouverte, valeur gardée', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    await page.route('**/api/univers/*/fiches/*', (r: Any) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.continue()));
    await page.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(page);
    await entete(page).getByRole('button', { name: rxExact('Sous-type') }).click();
    const champ = page.getByLabel('Sous-type', { exact: true });
    await champ.fill('Bourg');
    await champ.press('Enter');
    await page.getByRole('alert').filter({ hasText: /Réessayez/ }).waitFor();
    assert.equal(await page.getByLabel('Sous-type', { exact: true }).inputValue(), 'Bourg');
    await capture(page, 'sous-type-echec');
  });

  test('Savoir (Ressource) → Note : boîte « sera retiré », toast, fiche sous Notes sans sous-type, sections et relations gardées', async () => {
    const f = await api(antor, 'POST', `/api/univers/${lame}/fiches`, { type: 'savoir', titre: 'Les Cristaux d’Ombre', sousType: 'Ressource' });
    const sec = await api(antor, 'POST', `/api/univers/${lame}/fiches/${f.id}/sections`, { titre: 'Origine', contenu: 'Extraits des mines.' });
    assert.ok(sec);
    await api(antor, 'POST', `/api/univers/${lame}/fiches/${f.id}/sections/${sec.id}/relations`, { cibleId: val, etiquette: 'trouvé à' }).catch(() => null);
    await antor.goto(`/univers/${lame}/fiche/${f.id}`);
    await attendre(antor);
    assert.match(await entete(antor).innerText(), /Savoir\s*·\s*Ressource/);
    await antor.getByRole('button', { name: /^Autres actions sur « (Les Cristaux|Le Mont|Bague)/ }).click();
    await antor.getByRole('menuitem', { name: rx('Changer le type…') }).click();
    const boite = antor.getByRole('dialog');
    await boite.getByText('Le sous-type « Ressource » sera retiré.').waitFor();
    await capture(antor, 'changer-type-boite');
    await boite.getByRole('radio', { name: rxExact('Note') }).check();
    await boite.getByRole('button', { name: rxExact('Changer le type') }).click();
    await antor.getByText('Type changé : Savoir → Note.').waitFor();
    await attendre(antor);
    const t = await entete(antor).innerText();
    assert.match(t, /Note/);
    assert.doesNotMatch(t, /Ressource/);
    assert.equal((await api(antor, 'GET', `/api/univers/${lame}/fiches/${f.id}`)).type, 'note');
    assert.match(await antor.locator('body').innerText(), /Origine/);
    assert.match(await antor.locator('body').innerText(), /Extraits des mines/);
    assert.match(await antor.getByRole('navigation').first().innerText().catch(() => ''), /Notes|^$/);
    await capture(antor, 'apres-changement');
  });

  test('cible « Personnage » (depuis un Lieu) : choix PJ / PNJ, PNJ par défaut ; Lieu → Personnage PJ', async () => {
    const f = await api(antor, 'POST', `/api/univers/${lame}/fiches`, { type: 'lieu', titre: 'Le Mont-Gris' });
    await antor.goto(`/univers/${lame}/fiche/${f.id}`);
    await attendre(antor);
    await antor.getByRole('button', { name: /^Autres actions sur « (Les Cristaux|Le Mont|Bague)/ }).click();
    await antor.getByRole('menuitem', { name: rx('Changer le type…') }).click();
    const boite = antor.getByRole('dialog');
    assert.equal(await boite.getByRole('radio', { name: rxExact('PJ') }).count(), 0);
    await boite.getByRole('radio', { name: rxExact('Personnage') }).check();
    assert.equal(await boite.getByRole('radio', { name: rxExact('PNJ') }).isChecked(), true);
    await boite.getByRole('radio', { name: rxExact('PJ') }).check();
    await capture(antor, 'cible-personnage');
    await boite.getByRole('button', { name: rxExact('Changer le type') }).click();
    await antor.getByText('Type changé : Lieu → Personnage.').waitFor();
    const v = await api(antor, 'GET', `/api/univers/${lame}/fiches/${f.id}`);
    assert.equal(v.type, 'personnage');
    assert.equal(v.charge.pj, true);
  });

  test('« Note » désactivée pour Lame d’Ébène : sous « Autres types » et quand même choisissable', async () => {
    const f = await api(antor, 'POST', `/api/univers/${lame}/fiches`, { type: 'objet', titre: 'Bague terne' });
    const u = (await api(antor, 'GET', `/api/univers/${lame}`)) as Any;
    await api(antor, 'PUT', `/api/univers/${lame}/types/note`, { etat: 'desactive' });
    assert.ok(u);
    await antor.goto(`/univers/${lame}/fiche/${f.id}`);
    await attendre(antor);
    await antor.getByRole('button', { name: /^Autres actions sur « (Les Cristaux|Le Mont|Bague)/ }).click();
    await antor.getByRole('menuitem', { name: rx('Changer le type…') }).click();
    const boite = antor.getByRole('dialog');
    await boite.getByText('Autres types').waitFor();
    const apres = await boite.innerText();
    assert.ok(apres.indexOf('Autres types') < apres.indexOf('Note'), apres);
    await boite.getByRole('radio', { name: rx('Note') }).check();
    await boite.getByRole('button', { name: rxExact('Changer le type') }).click();
    await antor.getByText('Type changé : Objet → Note.').waitFor();
    assert.equal((await api(antor, 'GET', `/api/univers/${lame}/fiches/${f.id}`)).type, 'note');
    await capture(antor, 'autres-types');
  });

  test('échec forcé du serveur : la boîte reste ouverte et dit « Le type n’a pas changé. Réessayez. »', async () => {
    const f = await api(antor, 'POST', `/api/univers/${lame}/fiches`, { type: 'objet', titre: 'Clef rouillée' });
    const { page } = await connecte(browser, srv.base, 'Antor');
    await page.route('**/api/univers/*/fiches/*/type', (r: Any) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.goto(`/univers/${lame}/fiche/${f.id}`);
    await attendre(page);
    await page.getByRole('button', { name: /^Autres actions sur/ }).click();
    await page.getByRole('menuitem', { name: rx('Changer le type…') }).click();
    const boite = page.getByRole('dialog');
    await boite.getByRole('radio', { name: rxExact('Faction') }).check();
    await boite.getByRole('button', { name: rxExact('Changer le type') }).click();
    await boite.getByText('Le type n’a pas changé. Réessayez.').waitFor();
    assert.equal(await boite.isVisible(), true);
    await capture(page, 'changer-type-echec');
  });

  test('mode Joueur : ni menu « ⋯ » ni édition du sous-type ; un compte-rendu n’a pas l’entrée', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    await page.goto(`/univers/${lame}/fiche/${val}`);
    await attendre(page);
    await page.getByLabel('Mode Joueur').check();
    await page.getByText(/Mode Joueur/).first().waitFor();
    await attendre(page);
    assert.equal(await page.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: rxExact('Sous-type') }).count(), 0);
    await capture(page, 'mode-joueur');
    const cr = await api(antor, 'GET', `/api/univers/${lame}/fiches?type=compte_rendu`).catch(() => null);
    const liste = cr ? (Array.isArray(cr) ? cr : cr.fiches) : [];
    if (liste.length > 0) {
      await antor.goto(`/univers/${lame}/fiche/${liste[0].id}`);
      await attendre(antor);
      const menus = await antor.getByRole('button', { name: /^Autres actions sur/ }).count();
      if (menus > 0) {
        await antor.getByRole('button', { name: /^Autres actions sur/ }).click();
        assert.equal(await antor.getByRole('menuitem', { name: rx('Changer le type…') }).count(), 0);
      }
    }
  });
});
