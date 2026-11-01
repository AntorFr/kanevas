// Feature-level browser tests of kanevas-outils-catalogue: E-20 (catalogue block, import dialog, « Voir les éléments »)
// and E-18 (scope of a token), written from docs/ecrans.md and the feature's exit criterion. Stub world with the seed.
// Screenshots: /tmp/cap-catalogue-verif (proofs of the moment, not committed).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-catalogue-verif';
mkdirSync(SHOTS, { recursive: true });

const coque = (cle: string, nom: string, masse: number, cout: number) => ({ cle, nom, masse, cout });
const arme = (cle: string, nom: string, masse: number, cout: number, portee: string) => ({ cle, nom, masse, cout, portee });
function fichier12(): Any {
  return {
    catalogue: 'essai/g', version: '2026-11-essai',
    coques: [coque('corvette', 'Corvette', 12, 100), coque('cargo', 'Cargo', 20, 80), coque('fregate', 'Frégate', 35, 240), coque('patrouilleur', 'Patrouilleur', 8, 60)],
    armes: [
      arme('laser', 'Laser à impulsion', 2, 12, 'courte'), { cle: 'laser-lourd', nom: 'Laser lourd', cout: 28, portee: 'longue' },
      arme('canon-leger', 'Canon léger', 3, 9, 'courte'), arme('mitrailleuse', 'Mitrailleuse', 1, 5, 'courte'),
      arme('torpille', 'Torpille', 4, 18, 'longue'), arme('missile', 'Missile', 2, 14, 'longue'),
      arme('brouilleur', 'Brouilleur', 1, 10, 'courte'), arme('harpon', 'Harpon', 3, 7, 'courte'),
    ],
  };
}
/** The dialog creates its file input on click: the file goes through the file chooser, like a user's pick. */
async function choisir(page: Any, dlg: Any, fichier: Any): Promise<void> {
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    dlg.getByRole('button', { name: /^(Choisir un fichier JSON|Choisir un autre fichier)$/ }).first().click(),
  ]);
  await fc.setFiles(fichier);
}
const fichierJson = (nom: string, contenu: unknown) => ({ name: nom, mimeType: 'application/json', buffer: Buffer.from(typeof contenu === 'string' ? contenu : JSON.stringify(contenu)) });

describe('E-20 catalogue: écrans', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  // One fresh seeded server per scenario: scenarios share no state.
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });
  beforeEach(async () => { srv = await startServer({ KANEVAS_SANS_SEMIS: '' }); });
  afterEach(() => srv?.stop());

  async function ids(page: Any) {
    const us = (await (await page.request.get('/api/univers')).json()) as Any[];
    const E = us.find((u) => u.nom === "Éneria d'essai");
    return { E: E.id as number, V: us.find((u) => u.nom === 'Univers voisin').id as number, S: E.systeme.id as number };
  }
  const liste = async (page: Any, chemin: string, nature: string) => ((await (await page.request.get(`${chemin}?nature=${nature}`)).json()) as Any).elements as Any[];
  async function ouvrirOutilsSysteme(page: Any, S: number) {
    await page.goto(`/systemes/${S}`);
    await page.getByRole('tab', { name: /^Outils/ }).click();
    const carte = page.locator('section, article, div').filter({ hasText: 'Essai G' }).filter({ has: page.getByRole('button', { name: /Voir les éléments/ }) }).last();
    await carte.getByRole('button', { name: /Voir les éléments/ }).waitFor();
    return carte;
  }

  it('Antor, responsable: aperçu 11 ajoutés / 1 refusé, rien d’écrit, application, rejeu 11 inchangés', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    const { E, S } = await ids(page);
    for (const u of [E]) await page.request.put(`/api/univers/${u}/outils/essai/g/activation`, { data: { active: true } });
    const carte = await ouvrirOutilsSysteme(page, S);
    assert.match(await carte.innerText(), /aucun catalogue importé/);
    await carte.getByRole('button', { name: /Importer un catalogue/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText('Importer le catalogue du système').waitFor();
    await dlg.getByText(/Choisissez un fichier de catalogue \(JSON\)\./).waitFor();
    await choisir(page, dlg, fichierJson('catalogue-essai.json', fichier12()));
    await dlg.getByText(/11 ajoutés, 0 modifié, 1 refusé/).waitFor();
    const t = await dlg.innerText();
    assert.match(t, /catalogue-essai\.json/);
    assert.match(t, /2026-11-essai/);
    assert.match(t, /laser-lourd/);
    assert.match(t, /champ\s+masse\s*:\s*nombre attendu/);
    assert.match(t, /Cet élément n['’]est pas appliqué\./);
    assert.match(t, /Les éléments qui ne sont plus dans le fichier restent dans le catalogue\./);
    assert.equal(await dlg.getByRole('button', { name: 'Appliquer (11 éléments)' }).isEnabled(), true);
    await page.screenshot({ path: `${SHOTS}/apercu.png`, fullPage: true });
    assert.equal((await liste(page, `/api/univers/${E}/outils/essai/g/catalogue`, 'armes')).length, 0, 'nothing written before « Appliquer »');
    assert.match(await carte.innerText(), /aucun catalogue importé/, 'the card still says nothing is imported');

    await dlg.getByRole('button', { name: 'Appliquer (11 éléments)' }).click();
    await dlg.getByText(/Catalogue appliqué · version 2026-11-essai/).waitFor();
    assert.match(await dlg.innerText(), /11 ajoutés, 0 modifié, 1 refusé/);
    await page.screenshot({ path: `${SHOTS}/applique.png`, fullPage: true });
    await dlg.getByRole('button', { name: 'Fermer' }).first().click();
    await carte.getByText(/4 coques · 7 armes/).waitFor();
    assert.match(await carte.innerText(), /2026-11-essai/);
    assert.equal((await liste(page, `/api/univers/${E}/outils/essai/g/catalogue`, 'armes')).length, 7);

    await carte.getByRole('button', { name: /Importer un catalogue/ }).click();
    await choisir(page, dlg, fichierJson('catalogue-essai.json', fichier12()));
    await dlg.getByText(/0 ajouté, 0 modifié, 11 inchangés/).waitFor();
    assert.equal((await liste(page, `/api/univers/${E}/outils/essai/g/catalogue`, 'armes')).length, 7, 'replay: no duplicate');
    await page.screenshot({ path: `${SHOTS}/rejeu.png`, fullPage: true });
  });

  it('fichier illisible: « Ce fichier n’est pas un catalogue valide. », pas de bouton Appliquer', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    const { S } = await ids(page);
    const carte = await ouvrirOutilsSysteme(page, S);
    await carte.getByRole('button', { name: /Importer un catalogue/ }).click();
    const dlg = page.getByRole('dialog');
    await choisir(page, dlg, fichierJson('notes.json', 'ceci n’est pas du JSON'));
    await dlg.getByText("Ce fichier n'est pas un catalogue valide.").or(dlg.getByText('Ce fichier n’est pas un catalogue valide.')).waitFor();
    assert.equal(await dlg.getByRole('button', { name: /^Appliquer/ }).count(), 0);
    await dlg.getByRole('button', { name: 'Choisir un autre fichier' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/illisible.png`, fullPage: true });
    // wrong tool: the cause is shown
    await choisir(page, dlg, fichierJson('autre.json', { catalogue: 'essai/a', version: 'v', coques: [] }));
    await dlg.getByText(/Ce catalogue est pour « Essai A », pas pour « Essai G »\.|Ce catalogue est pour « Essai G », pas pour « Essai A »\./).waitFor();
  });

  it('coupure pendant « Appliquer »: rien n’est appliqué à moitié, le message le dit, « Appliquer » revient', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    const { E, S } = await ids(page);
    await page.request.put(`/api/univers/${E}/outils/essai/g/activation`, { data: { active: true } });
    const carte = await ouvrirOutilsSysteme(page, S);
    await carte.getByRole('button', { name: /Importer un catalogue/ }).click();
    const dlg = page.getByRole('dialog');
    await choisir(page, dlg, fichierJson('c.json', fichier12()));
    await dlg.getByText(/11 ajoutés, 0 modifié, 1 refusé/).waitFor();
    await page.route('**/catalogue/application', (r: Any) => r.abort('connectionreset'));
    await dlg.getByRole('button', { name: 'Appliquer (11 éléments)' }).click();
    await dlg.getByText(/Connexion perdue pendant l.application\. Rien n.est appliqué à moitié/).waitFor();
    await page.screenshot({ path: `${SHOTS}/coupure.png`, fullPage: true });
    // docs/ecrans.md (E-20, « connection lost », during the application): the dialog keeps the preview, « Appliquer » is enabled again
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => /^Appliquer \(11 éléments\)$/.test((x.textContent ?? '').trim()));
      return !!b && !(b as HTMLButtonElement).disabled;
    }, undefined, { timeout: 20000 });
    await page.screenshot({ path: `${SHOTS}/coupure-reprise.png`, fullPage: true });
    await page.unroute('**/catalogue/application');
    assert.equal((await liste(page, `/api/univers/${E}/outils/essai/g/catalogue`, 'armes')).length, 0, 'nothing written');
    assert.equal((await liste(page, `/api/univers/${E}/outils/essai/g/catalogue`, 'coques')).length, 0);
  });

  it('300 refus: 50 listés, « 250 autres refus… », « Voir tout » les déplie', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    const { S } = await ids(page);
    const carte = await ouvrirOutilsSysteme(page, S);
    await carte.getByRole('button', { name: /Importer un catalogue/ }).click();
    const dlg = page.getByRole('dialog');
    const faux = Array.from({ length: 300 }, (_, i) => ({ cle: `faux-${i}`, nom: `Faux ${i}`, cout: 1 }));
    await choisir(page, dlg, fichierJson('faux.json', { catalogue: 'essai/g', version: 'faux', coques: faux, armes: [] }));
    await dlg.getByText(/0 ajouté, 0 modifié, 300 refusés/).waitFor();
    await dlg.getByText(/250 autres refus…/).waitFor();
    assert.equal(await dlg.getByText(/champ\s+masse\s*:\s*nombre attendu/).count(), 50);
    assert.equal(await dlg.getByRole('button', { name: /^Appliquer/ }).isEnabled().catch(() => false), false, '« Appliquer » absent or disabled with nothing to apply');
    await page.screenshot({ path: `${SHOTS}/300-refus.png`, fullPage: true });
    await dlg.getByRole('button', { name: 'Voir tout' }).click();
    await dlg.getByText(/faux-299/).waitFor();
    assert.equal(await dlg.getByText(/champ\s+masse\s*:\s*nombre attendu/).count(), 300);
  });

  it('Mira, MJ non responsable: ligne du catalogue et « Voir les éléments », ni « Importer »; Léa n’a pas l’onglet', async () => {
    const antor = await connecte(browser, srv.base, 'Antor');
    const { E, S } = await ids(antor.page);
    await antor.page.request.post(`/api/systemes/${S}/outils/essai/g/catalogue/application`, { data: fichier12() });
    const { page } = await connecte(browser, srv.base, 'Mira');
    const carte = await ouvrirOutilsSysteme(page, S);
    assert.match(await carte.innerText(), /4 coques · 7 armes/);
    assert.equal(await carte.getByRole('button', { name: /Importer un catalogue/ }).count(), 0);
    await carte.getByText('Seul le responsable du système importe le catalogue.').waitFor();
    await carte.getByRole('button', { name: /Voir les éléments/ }).click();
    await page.getByText(/Lecture seule : seul le responsable importe\./).waitFor();
    assert.equal(await page.getByRole('button', { name: /Masquer aux joueurs|Retirer de cet univers|Rétablir|Rendre visible/ }).count(), 0);
    await page.screenshot({ path: `${SHOTS}/mira-systeme.png`, fullPage: true });
    // Léa, player: forced address of the tool catalogue is 404
    const lea = await connecte(browser, srv.base, 'Léa');
    const r = await lea.page.request.get(`/api/systemes/${S}/outils/essai/g/catalogue`);
    assert.equal(r.status(), 404);
    void E;
  });

  it('universe: « dont 1 remplace », masquer/rendre visible, retirer/rétablir, depuis « Voir les éléments »', async () => {
    const antor = await connecte(browser, srv.base, 'Antor');
    const page = antor.page;
    const { E, V, S } = await ids(page);
    await page.request.post(`/api/systemes/${S}/outils/essai/g/catalogue/application`, { data: fichier12() });
    await page.request.put(`/api/univers/${E}/outils/essai/g/activation`, { data: { active: true } });
    await page.goto(`/univers/${E}/parametres`);
    await page.getByRole('tab', { name: /^Outils/ }).click();
    const carte = page.locator('section, article, div').filter({ hasText: 'Essai G' }).filter({ has: page.getByRole('button', { name: /Voir les éléments/ }) }).last();
    await carte.getByRole('button', { name: /Importer un catalogue/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText('Importer le catalogue de l’univers').or(dlg.getByText("Importer le catalogue de l'univers")).waitFor();
    const fu = { catalogue: 'essai/g', version: '2026-12-orak', coques: [], armes: [arme('laser', 'Laser d’Éneria', 9, 99, 'longue'), arme('lance', "Lance d'essai", 3, 30, 'courte')] };
    await choisir(page, dlg, fichierJson('univers.json', fu));
    await dlg.getByText(/dont 1 remplace un élément du système/).waitFor();
    await dlg.getByRole('button', { name: /^Appliquer/ }).click();
    await dlg.getByText(/Catalogue appliqué/).waitFor();
    await dlg.getByRole('button', { name: 'Fermer' }).first().click();
    await page.request.put(`/api/univers/${V}/outils/essai/g/activation`, { data: { active: true } });
    assert.equal((await liste(page, `/api/univers/${V}/outils/essai/g/catalogue`, 'armes')).find((e) => e.cle === 'laser')?.nom, 'Laser à impulsion', 'Univers voisin still reads the system element');

    await carte.getByRole('button', { name: /Voir les éléments/ }).click();
    const panneau = page.locator('section, div').filter({ hasText: /Éléments · Essai G/ }).last();
    await panneau.getByText(/Éléments · Essai G/).first().waitFor();
    await panneau.getByRole('tab', { name: /^Armes/ }).click();
    const ligne = (nom: string) => panneau.locator('li, tr, [role=row], article').filter({ hasText: nom }).last();
    await ligne("Lance d'essai").waitFor();
    assert.match(await ligne("Lance d'essai").innerText(), /Univers/);
    assert.match(await ligne('Laser d’Éneria').innerText(), /Remplacé pour l.univers/);
    assert.equal(await ligne('Laser d’Éneria').getByRole('button', { name: /Retirer de cet univers/ }).count(), 0, 'a replaced row has no withdrawal');
    assert.equal(await ligne('Torpille').getByRole('button', { name: /Masquer aux joueurs/ }).count(), 0, 'no gesture hides a system element');
    await page.screenshot({ path: `${SHOTS}/elements-armes.png`, fullPage: true });

    // hide « Lance d'essai »: Léa no longer reads it, no trace
    const lea = await connecte(browser, srv.base, 'Léa');
    const urlLea = `/api/univers/${E}/outils/essai/g/catalogue?nature=armes`;
    assert.match(await (await lea.page.request.get(urlLea)).text(), /Lance d'essai/);
    await ligne("Lance d'essai").getByRole('button', { name: 'Masquer aux joueurs' }).click();
    await ligne("Lance d'essai").getByText('MJ seul').waitFor();
    await ligne("Lance d'essai").getByRole('button', { name: 'Rendre visible' }).waitFor();
    const corps = await (await lea.page.request.get(urlLea)).text();
    assert.ok(!/Lance d'essai|"lance"/.test(corps), 'Léa does not read the masked weapon');
    await page.screenshot({ path: `${SHOTS}/elements-masque.png`, fullPage: true });
    await ligne("Lance d'essai").getByRole('button', { name: 'Rendre visible' }).click();
    await ligne("Lance d'essai").getByText('Visible des joueurs').waitFor();
    assert.match(await (await lea.page.request.get(urlLea)).text(), /Lance d'essai/);

    // withdraw the system hull « Corvette » from this universe, then restore it
    await panneau.getByRole('tab', { name: /^Coques/ }).click();
    await ligne('Corvette').getByRole('button', { name: 'Retirer de cet univers' }).click();
    await ligne('Corvette').getByText('Retiré de l’univers').or(ligne('Corvette').getByText("Retiré de l'univers")).waitFor();
    await ligne('Corvette').getByRole('button', { name: 'Rétablir' }).waitFor();
    const coquesLea = await (await lea.page.request.get(`/api/univers/${E}/outils/essai/g/catalogue?nature=coques`)).text();
    assert.ok(!/Corvette/.test(coquesLea));
    await page.screenshot({ path: `${SHOTS}/elements-retire.png`, fullPage: true });
    await ligne('Corvette').getByRole('button', { name: 'Rétablir' }).click();
    await ligne('Corvette').getByRole('button', { name: 'Retirer de cet univers' }).waitFor();
    assert.match(await (await lea.page.request.get(`/api/univers/${E}/outils/essai/g/catalogue?nature=coques`)).text(), /Corvette/);
  });

  it('E-18: portée « Outils » — « Cochez au moins un outil. », ligne « Portée : Essai G », contenu par défaut', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    const { E } = await ids(page);
    await page.goto(`/univers/${E}/acces-api`);
    await page.getByRole('button', { name: /Nouveau jeton/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nom').fill('Script catalogue');
    assert.equal(await dlg.getByLabel('Contenu de l’univers').or(dlg.getByLabel("Contenu de l'univers")).isChecked(), true, 'content is the default scope');
    await dlg.getByLabel('Outils').check();
    await dlg.getByText('Cochez au moins un outil.').waitFor();
    assert.equal(await dlg.getByRole('button', { name: 'Créer le jeton' }).isDisabled(), true);
    await dlg.getByLabel(/Essai G/).check();
    assert.equal(await dlg.getByRole('button', { name: 'Créer le jeton' }).isDisabled(), false);
    await dlg.getByText(/Un jeton d.outil n.écrit que le catalogue des outils cochés\. Il n.ouvre ni fiches ni fichiers\./).waitFor();
    await dlg.getByRole('button', { name: 'Créer le jeton' }).click();
    const valeur = (await dlg.getByLabel('Jeton', { exact: true }).textContent())!.trim();
    assert.match(valeur, /^kvs_/);
    await dlg.getByRole('button', { name: /J.ai copié le jeton/ }).click();
    await page.locator('[data-jeton="Script catalogue"]').getByText('Portée : Essai G').waitFor();
    await page.screenshot({ path: `${SHOTS}/e18-portee.png`, fullPage: true });
    // the script's import comes back as a batch named after the tool, counted by nature
    const lot = await page.request.post(`/api/import/v1/univers/${E}/lots?outil=essai/g`, { headers: { authorization: `Bearer ${valeur}` } });
    const { lotId } = (await lot.json()) as Any;
    await page.request.put(`/api/import/v1/univers/${E}/outils/essai/g/catalogue?niveau=univers&lot=${lotId}`, { headers: { authorization: `Bearer ${valeur}`, 'content-type': 'application/json' }, data: fichier12() });
    await page.reload();
    await page.getByText('Coques : 4 créés').waitFor();
    assert.match(await page.locator('body').innerText(), /Armes : 7 créés, 1 refusé/);
    await page.getByText('Essai G').first().waitFor();
    await page.screenshot({ path: `${SHOTS}/e18-lot-outil.png`, fullPage: true });
  });
});
