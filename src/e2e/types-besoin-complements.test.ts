// Black-box complements for kanevas-import-types, written from the need only (docs/parcours.md B-42, B-52,
// P-13, P-14 step 2; docs/ecrans.md « Les types » and E-14/E-15/E-9). They add what types-besoin-verification
// leaves out: refusal of the non-GM and of `compte_rendu` on the settings routes, the empty sidebar, a link
// to a sheet of a disabled type, « Changer le type » toward Personnage (PJ / PNJ) with sections kept, and
// the E-15 list of thirteen types. Real server in stub mode WITH the seeded world, real Chromium.
// Expected values are literals taken from the docs.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, creerFiche, creerUnivers, launch, rx, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

const REGLABLES = [
  'personnage', 'lieu', 'faction', 'famille', 'objet', 'evenement', 'quete', 'creature', 'race', 'vaisseau', 'savoir',
  'recit', 'regle', 'note', 'aventure',
];

describe('kanevas-import-types : compléments au besoin', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const fetchAs = async (page: Any, method: string, url: string, data?: unknown) => {
    const r = await page.request.fetch(srv.base + url, { method, data });
    return { status: r.status() as number, corps: (await r.json().catch(() => null)) as Any };
  };

  const idDe = async (page: Any, nom: string): Promise<string> => {
    const mine = (await fetchAs(page, 'GET', '/api/univers')).corps as { id: number; nom: string }[];
    return String(mine.find((u) => u.nom === nom)!.id);
  };

  test('exclusion B-42 : le compte-rendu n’est pas réglable (400 type_non_reglable), les quinze autres le sont', async () => {
    // Panne visée : `compte_rendu` devient désactivable, ce qui cacherait les comptes-rendus d’une campagne.
    const antor = await connecte(browser, srv.base, 'antor');
    const r = await fetchAs(antor.page, 'PUT', '/api/univers/1/types/compte_rendu', { etat: 'desactive' });
    assert.equal(r.status, 400);
    assert.equal(r.corps.code, 'type_non_reglable');
    const liste = await fetchAs(antor.page, 'GET', '/api/univers/1/types');
    const reglables = (liste.corps as Any[]).filter((t) => t.reglable).map((t) => t.type);
    assert.deepEqual(reglables, REGLABLES);
    await antor.ctx.close();
  });

  test('exclusion B-42 : Léa (Joueuse) ne règle ni l’univers ni le système, rien ne bouge', async () => {
    // Panne visée : la garde MJ manque sur une des deux routes de réglage.
    const antor = await connecte(browser, srv.base, 'antor');
    const lea = await connecte(browser, srv.base, 'Léa');
    const avant = (await fetchAs(antor.page, 'GET', '/api/univers/1/types')).corps;
    const systemes = (await fetchAs(antor.page, 'GET', '/api/systemes')).corps as { id: number; nom: string }[];
    const cof = systemes.find((s) => s.nom === 'CoF Mini')!.id;
    const u = await fetchAs(lea.page, 'PUT', '/api/univers/1/types/vaisseau', { etat: 'desactive' });
    assert.ok(u.status >= 400 && u.status < 500, `univers: ${u.status}`);
    const s = await fetchAs(lea.page, 'PUT', `/api/systemes/${cof}/types/vaisseau`, { active: false });
    assert.ok(s.status >= 400 && s.status < 500, `système: ${s.status}`);
    const apres = (await fetchAs(antor.page, 'GET', '/api/univers/1/types')).corps;
    assert.deepEqual(apres, avant);
    await antor.ctx.close();
    await lea.ctx.close();
  });

  test('B-42 échec : tous les types désactivés, la barre dit « Aucun type de fiche activé. » et le MJ a « Régler les types »', async () => {
    // Panne visée : la section Lore reste vide sans un mot, ou le lien du MJ manque.
    const antor = await connecte(browser, srv.base, 'antor');
    await creerUnivers(antor.page, 'Tout éteint');
    const id = await idDe(antor.page, 'Tout éteint');
    for (const t of REGLABLES) {
      const r = await fetchAs(antor.page, 'PUT', `/api/univers/${id}/types/${t}`, { etat: 'desactive' });
      assert.equal(r.status, 200, t);
    }
    await antor.page.goto(`/univers/${id}`);
    await attendre(antor.page);
    const barre = antor.page.getByRole('complementary', { name: 'Barre latérale' });
    await barre.getByText('Aucun type de fiche activé.').waitFor();
    await barre.getByRole('link', { name: 'Régler les types' }).waitFor();
    assert.equal(await barre.getByRole('link', { name: 'Personnages', exact: true }).count(), 0);
    await antor.page.screenshot({ path: '/tmp/shots/aucun-type.png' });
    await antor.ctx.close();
  });

  test('B-42 exclusion : une fiche d’un type désactivé reste atteinte par son adresse', async () => {
    // Panne visée : désactiver un type rend ses fiches introuvables.
    const antor = await connecte(browser, srv.base, 'antor');
    await creerUnivers(antor.page, 'Lien vers lieu éteint');
    await creerFiche(antor.page, 'lieu', 'Port-Lien');
    await antor.page.getByRole('heading', { level: 1, name: 'Port-Lien' }).waitFor();
    const adresse = new URL(antor.page.url()).pathname;
    const id = adresse.split('/')[2];
    assert.equal((await fetchAs(antor.page, 'PUT', `/api/univers/${id}/types/lieu`, { etat: 'desactive' })).status, 200);
    await antor.page.goto(adresse);
    await attendre(antor.page);
    await antor.page.getByRole('heading', { level: 1, name: 'Port-Lien' }).waitFor();
    await antor.ctx.close();
  });

  test('B-42 échec : créer une fiche d’un type désactivé par l’API est refusé, rien n’est créé', async () => {
    // Panne visée : l’activation n’est qu’un habillage de l’interface, l’API crée quand même.
    const antor = await connecte(browser, srv.base, 'antor');
    await creerUnivers(antor.page, 'Création refusée');
    const id = await idDe(antor.page, 'Création refusée');
    await fetchAs(antor.page, 'PUT', `/api/univers/${id}/types/vaisseau`, { etat: 'desactive' });
    const r = await fetchAs(antor.page, 'POST', `/api/univers/${id}/fiches`, { type: 'vaisseau', titre: 'Aube' });
    assert.ok(r.status >= 400 && r.status < 500, `statut ${r.status} ${JSON.stringify(r.corps)}`);
    const liste = await fetchAs(antor.page, 'GET', `/api/univers/${id}/fiches?type=vaisseau`);
    const fiches = (Array.isArray(liste.corps) ? liste.corps : (liste.corps?.fiches ?? liste.corps?.items)) as Any[];
    assert.ok(Array.isArray(fiches), JSON.stringify(liste));
    assert.equal(fiches.length, 0);
    await antor.ctx.close();
  });

  test('E-15 : l’onglet « Types de fiche » de CoF Mini liste treize types, sans compte-rendu', async () => {
    // Panne visée : le compte-rendu apparaît avec un interrupteur, ou un type manque.
    const antor = await connecte(browser, srv.base, 'antor');
    const systemes = (await fetchAs(antor.page, 'GET', '/api/systemes')).corps as { id: number; nom: string }[];
    const cof = systemes.find((s) => s.nom === 'CoF Mini')!.id;
    await antor.page.goto(`/systemes/${cof}`);
    await attendre(antor.page);
    await antor.page.getByRole('tab', { name: 'Types de fiche' }).click();
    await antor.page.getByText(/Utilisé par \d+ univers?\./).waitFor();
    const t = await texte(antor.page);
    for (const nom of ['Personnage', 'Lieu', 'Faction', 'Objet', 'Événement', 'Quête', 'Créature', 'Race', 'Vaisseau', 'Savoir', 'Récit', 'Règle', 'Note']) {
      assert.match(t, new RegExp(nom), nom);
    }
    assert.doesNotMatch(t, /Compte-rendu|Compte rendu/i);
    await antor.page.screenshot({ path: '/tmp/shots/e15-types.png', fullPage: true });
    await antor.ctx.close();
  });

  test('P-14 : « Changer le type » vers Personnage propose PJ / PNJ (PNJ par défaut) et garde les sections', async () => {
    // Panne visée : le changement de type perd les sections, ou ne laisse pas choisir PJ / PNJ.
    const antor = await connecte(browser, srv.base, 'antor');
    await creerUnivers(antor.page, 'Changement de type');
    await creerFiche(antor.page, 'lieu', 'Port-Change');
    await antor.page.getByRole('heading', { level: 1, name: 'Port-Change' }).waitFor();
    await antor.page.getByRole('button', { name: 'Ajouter une section' }).first().click();
    await antor.page.getByLabel('Titre de la section').fill('Histoire');
    await antor.page.keyboard.press('Enter');
    await antor.page.getByRole('heading', { name: 'Histoire' }).waitFor();
    await antor.page.getByRole('button', { name: /^Autres actions sur « Port-Change/ }).click();
    await antor.page.getByRole('menuitem', { name: /Changer le type/ }).click();
    const boite = antor.page.getByRole('dialog', { name: /Changer le type de/ });
    await boite.waitFor();
    await boite.getByRole('radio', { name: /Personnage/ }).click();
    assert.equal(await boite.getByRole('radio', { name: 'PNJ', exact: true }).isChecked(), true);
    assert.equal(await boite.getByRole('radio', { name: 'PJ', exact: true }).isChecked(), false);
    await antor.page.screenshot({ path: '/tmp/shots/changer-perso.png' });
    await boite.getByRole('button', { name: 'Changer le type', exact: true }).click();
    await antor.page.getByText(rx('Type changé : Lieu → Personnage.')).waitFor();
    await antor.page.getByRole('heading', { name: 'Histoire' }).waitFor();
    await antor.ctx.close();
  });
});
