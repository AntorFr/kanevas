// Browser proof of kanevas-scenarios-suivi-bilan, written from its exit criterion: the whole journey of the slice in
// Antor's hands on adventures seeded through the routes (stub server, real Chromium). Order matters: one story.
//
// Test plan (critère -> case -> proof):
//  E-14 nominal   « Aventure » off: the entry leaves the bar, « Nouvelle aventure » is gone, an adventure opened by
//                 its address keeps its status menu and its « Préparation » / « Comptes-rendus » blocks, E-3 still
//                 lists « La Couronne brisée » under « Campagnes en cours »; turned on again, the entry is back
//  E-9 nominal    deleting the campaign announces 3 tasks, 1 scenario to the root, 2 reports left without adventure
//  E-9 bords      « Acte II » (a scenario, no child, one task, one report) announces them, no scenario line;
//                 nothing is deleted by « Annuler »
//  AD-119         after the deletion: « Acte II » is at the root of the tree, E-3 no longer lists the campaign,
//                 the report says « Aventure supprimée » to Antor and nothing to Léa
//  adresses       the old addresses (campagnes, scenarios) answer « Page introuvable. »
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { type Any, attendre, connecte, launch, rxExact, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 240000 };
const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/caps';
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = 0;
let couronne = 0;
let acte2 = 0;

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(srv.base + path, { method, data });
  return { status: r.status() as number, body: await r.json().catch(() => null) };
}
const shot = (page: Any, nom: string) => page.screenshot({ path: `${CAPTURES}/bilan-${nom}.png`, fullPage: true });
const barre = (page: Any) => page.getByRole('complementary', { name: 'Barre latérale' });
const ligne = async (page: Any, titre: string): Promise<string> =>
  (await page.locator('main li').filter({ hasText: titre }).first().innerText()).replace(/\s+/g, ' ').trim();
const typeAventure = (page: Any) => page.locator('li[data-type="aventure"]');

async function reglerType(etat: 'Désactivé' | 'Activé') {
  const r = antor.waitForResponse((x: Any) => x.url().includes(`/api/univers/${uid}/types/aventure`) && x.request().method() === 'PUT');
  await typeAventure(antor).getByRole('radio', { name: rxExact(etat) }).click();
  if (etat === 'Désactivé') await antor.getByRole('alertdialog').getByRole('button', { name: rxExact('Désactiver') }).click();
  assert.equal((await r).status(), 200);
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  const u = await api(antor, 'POST', '/api/univers', { nom: 'Bilan', description: '' });
  assert.equal(u.status, 201);
  uid = u.body.id;
  assert.equal((await api(antor, 'POST', `/api/univers/${uid}/membres`, { username: 'lea', role: 'joueur' })).status, 201);
  const c = await api(antor, 'POST', `/api/univers/${uid}/fiches`, {
    type: 'aventure', sousType: 'Campagne', titre: 'La Couronne brisée', sections: [{ titre: 'Présentation', joueursLisent: true }],
  });
  couronne = c.body.id;
  assert.equal((await api(antor, 'PATCH', `/api/univers/${uid}/fiches/${couronne}`, { statut: 'en_cours' })).status, 200);
  const s = await api(antor, 'POST', `/api/univers/${uid}/fiches`, {
    type: 'aventure', sousType: 'Scénario', titre: 'Acte II', parent: couronne, sections: [{ titre: 'Scénario', joueursLisent: false }],
  });
  acte2 = s.body.id;
  for (const [fiche, libelle] of [[couronne, 'Dessiner la carte'], [couronne, 'Préparer Aldric'], [couronne, 'Choisir la musique'], [acte2, 'Tracer le sceau']] as const) {
    const t = await api(antor, 'POST', `/api/univers/${uid}/fiches/${fiche}/taches`, { categorie: 'pnj', libelle });
    assert.equal(t.status, 201, JSON.stringify(t.body));
  }
  for (const [camp, titre] of [[couronne, 'Séance un'], [couronne, 'Séance deux'], [acte2, 'Séance du sceau']] as const) {
    const r = await api(antor, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: camp, titre, texte: 'Texte.' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await new Promise((res) => setTimeout(res, 1100));
  }
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('type « Aventure » désactivé : l’entrée et « Nouvelle aventure » partent, l’aventure garde ses blocs et son menu, E-3 la liste ; réactivé, tout revient', opts, async () => {
  await antor.goto(`/univers/${uid}/parametres`);
  await typeAventure(antor).waitFor();
  await reglerType('Désactivé');
  await antor.getByText(/Aventure : désactivé dans Bilan\./).waitFor();
  await shot(antor, 'e14-desactive');

  // The bar is read after the page has loaded the types: wait for that answer, then assert on the main navigation.
  const types = antor.waitForResponse((r: Any) => r.url().includes(`/api/univers/${uid}/types`) && r.request().method() === 'GET');
  await antor.goto(`/univers/${uid}`);
  await types;
  await barre(antor).getByRole('link', { name: rxExact('Cartes') }).waitFor();
  assert.equal(await barre(antor).getByRole('link', { name: rxExact('Aventures') }).count(), 0, 'plus d’entrée « Aventures »');
  // E-3 lists the campaign anyway.
  await antor.getByRole('heading', { name: 'Campagnes en cours' }).waitFor();
  await antor.getByRole('link', { name: /La Couronne brisée/ }).first().waitFor();
  await shot(antor, 'e3-type-desactive');

  // « Nouvelle aventure » is not offered (list address and any button of the page).
  await antor.goto(`/univers/${uid}/fiches/aventures`);
  await antor.getByRole('link', { name: /La Couronne brisée/ }).first().waitFor();
  assert.equal(await antor.getByRole('button', { name: /Nouvelle aventure/ }).count(), 0, 'plus de « Nouvelle aventure »');

  // The adventure by its address: status menu, both blocks.
  await antor.goto(`/univers/${uid}/fiche/${couronne}`);
  await antor.getByRole('button', { name: /changer le statut de « La Couronne brisée »/ }).waitFor();
  await antor.getByRole('heading', { name: 'Préparation' }).waitFor();
  await antor.getByRole('heading', { name: 'Comptes-rendus' }).waitFor();
  await antor.getByText('Dessiner la carte').waitFor();
  await shot(antor, 'fiche-type-desactive');
  assert.equal((await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'aventure', titre: 'Refusée' })).status >= 400, true);

  // Re-activation.
  await antor.goto(`/univers/${uid}/parametres`);
  await typeAventure(antor).waitFor();
  await reglerType('Activé');
  await antor.getByText(/Aventure : activé dans Bilan\./).waitFor();
  const types2 = antor.waitForResponse((r: Any) => r.url().includes(`/api/univers/${uid}/types`) && r.request().method() === 'GET');
  await antor.goto(`/univers/${uid}/fiches/aventures`);
  await types2;
  await barre(antor).getByRole('link', { name: rxExact('Aventures') }).waitFor();
  await antor.getByRole('button', { name: /Nouvelle aventure/ }).first().waitFor();
  await shot(antor, 'e14-reactive');
});

test('adresses retirées : campagnes/ et scenarios/ répondent « Page introuvable. »', opts, async () => {
  for (const chemin of ['campagnes', `campagnes/${couronne}`, `scenarios/${acte2}`]) {
    await antor.goto(`/univers/${uid}/${chemin}`);
    await antor.getByText('Page introuvable.').waitFor();
  }
});

test('« Acte II » : « Annuler » ne supprime rien ; la boîte annonce sa tâche et son CR, aucun scénario', opts, async () => {
  await antor.goto(`/univers/${uid}/fiche/${acte2}`);
  await antor.getByRole('heading', { name: 'Acte II' }).waitFor();
  await antor.getByRole('button', { name: /Autres actions sur « Acte II »/ }).click();
  await antor.getByRole('menuitem', { name: 'Supprimer la fiche…' }).click();
  const d = antor.getByRole('alertdialog');
  await d.getByText(/1 tâche de préparation supprimée/).waitFor();
  const t = (await d.innerText()).replace(/\s+/g, ' ');
  assert.ok(t.includes('1 section ; 1 tâche de préparation supprimée.'), t);
  assert.ok(!/scénario/.test(t.replace('Supprimer « Acte II »', '')), `aucun scénario annoncé : ${t}`);
  assert.ok(t.includes('1 compte-rendu restera sans aventure.'), t); // « Séance du sceau » is on Acte II
  await shot(antor, 'e9-acte2');
  await d.getByRole('button', { name: rxExact('Annuler') }).click();
  await d.waitFor({ state: 'detached' });
  assert.equal((await api(antor, 'GET', `/api/univers/${uid}/fiches/${acte2}`)).status, 200);
});

test('suppression de « La Couronne brisée » : annonce 3 tâches, 1 scénario à la racine, 2 CR ; puis l’arbre, E-3 et E-13 le disent', opts, async () => {
  await antor.goto(`/univers/${uid}/fiche/${couronne}`);
  await antor.getByRole('heading', { name: 'La Couronne brisée' }).waitFor();
  await antor.getByRole('button', { name: /Autres actions sur « La Couronne brisée »/ }).click();
  await antor.getByRole('menuitem', { name: 'Supprimer la fiche…' }).click();
  const d = antor.getByRole('alertdialog');
  await d.getByText(/3 tâches de préparation supprimées/).waitFor();
  const t = (await d.innerText()).replace(/\s+/g, ' ');
  assert.ok(t.includes('1 section ; 3 tâches de préparation supprimées.'), t);
  assert.ok(t.includes('1 scénario passe à la racine.'), t);
  assert.ok(t.includes('2 comptes-rendus resteront sans aventure.'), t);
  assert.ok(!t.includes('enfant'), `le scénario n'est pas aussi compté comme enfant : ${t}`);
  await shot(antor, 'e9-couronne');
  const suppr = antor.waitForResponse((r: Any) => r.request().method() === 'DELETE' && r.url().endsWith(`/fiches/${couronne}`));
  await d.getByRole('button', { name: rxExact('Supprimer la fiche') }).click();
  assert.equal((await suppr).status(), 204);

  // « Acte II » is at the root of the tree.
  await antor.goto(`/univers/${uid}/fiches/aventures`);
  const arbre = antor.getByRole('tree', { name: 'Aventures' });
  await arbre.getByRole('treeitem', { level: 1 }).first().waitFor();
  assert.equal(await arbre.getByRole('treeitem', { level: 1 }).count(), 1);
  assert.match(await arbre.getByRole('treeitem', { level: 1 }).first().innerText(), /Acte II/);
  assert.equal(await arbre.getByRole('treeitem', { level: 2 }).count(), 0);
  await shot(antor, 'arbre-racine');

  // E-3: no more campaign; the reports say « Aventure supprimée » to the GM.
  await antor.goto(`/univers/${uid}`);
  await antor.getByRole('heading', { name: 'Derniers comptes-rendus' }).waitFor();
  await antor.getByRole('link', { name: /Séance un/ }).waitFor();
  await attendre(antor);
  const e3 = await texte(antor);
  assert.ok(!e3.includes('La Couronne brisée'), 'E-3 ne nomme plus la campagne supprimée');
  assert.ok(e3.includes('Aventure supprimée'), 'E-3 : « Aventure supprimée » pour le MJ');
  await shot(antor, 'e3-apres');

  // E-13: GM sees it, Léa sees nothing; the surviving adventure still names itself.
  await antor.goto(`/univers/${uid}/comptes-rendus`);
  await antor.getByRole('link', { name: /Séance un/ }).waitFor();
  await attendre(antor);
  assert.match(await ligne(antor, 'Séance un'), /Aventure supprimée/);
  assert.match(await ligne(antor, 'Séance deux'), /Aventure supprimée/);
  await shot(antor, 'e13-antor');
  await lea.goto(`/univers/${uid}/comptes-rendus`);
  await lea.getByRole('link', { name: /Séance un/ }).waitFor();
  await attendre(lea);
  assert.ok(!(await texte(lea)).includes('Aventure supprimée'), 'Léa ne voit pas « Aventure supprimée »');
  assert.ok(!(await texte(lea)).includes('La Couronne brisée'));
  assert.ok(!(await ligne(lea, 'Séance un')).includes('—'), 'colonne vide pour Léa');
  await shot(antor, 'e13-lea');

  // The fiche of a report: the « Campagne » line is silent for Léa, says it to Antor.
  const crs = (await api(antor, 'GET', `/api/univers/${uid}/fiches?type=compte_rendu`)).body.fiches as { id: number; titre: string }[];
  const un = crs.find((c) => c.titre === 'Séance un')!;
  await lea.goto(`/univers/${uid}/fiche/${un.id}`);
  await lea.getByRole('heading', { name: 'Séance un' }).waitFor();
  await attendre(lea);
  assert.ok(!(await texte(lea)).includes('Aventure supprimée'));
  await antor.goto(`/univers/${uid}/fiche/${un.id}`);
  await antor.getByRole('heading', { name: 'Séance un' }).waitFor();
  await antor.getByText('Aventure supprimée').first().waitFor();
  await shot(antor, 'fiche-cr-antor');
});
