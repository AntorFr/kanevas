// Doors of the effects that the screens « aventure-fiche-statut-critere », « aventures-liste-critere »,
// « aventures-suivi-bilan », « aventures-suivi-bords-ensemble » used to re-prove through the browser (lot aventures).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

describe('Adventure status and tree', () => {
  test('a status set from the sheet is read back, in the list filter and under its parent, the other sections untouched', async () => {
    const w = await monter();
    const camp = await w.campagneOuverte('Couronne');
    const scen = await w.scenarioFerme(camp.id, 'Acte');
    assert.equal((await w.appel(w.antor, 'GET', `${w.base}/fiches/${camp.id}`)).json().charge.statut, 'en_cours');
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${camp.id}`, { statut: 'prete' })).statusCode, 200);
    const lue = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${camp.id}`)).json();
    assert.equal(lue.charge.statut, 'prete');
    assert.equal(lue.sections.length, 1, 'the status write leaves the sections alone');
    const filtre = (await w.appel(w.antor, 'GET', `${w.base}/fiches?type=aventure&statut=prete`)).json();
    assert.ok(filtre.fiches.some((f: { id: number }) => f.id === camp.id));
    assert.ok(!filtre.fiches.some((f: { id: number }) => f.id === scen.id), 'the scenario keeps its own status');
    const enfants = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${camp.id}/enfants`)).json();
    assert.deepEqual(enfants.enfants.map((e: { id: number }) => e.id), [scen.id]);
  });

  test('moving a scenario under another campaign changes its ancestor and the « Contient » of both', async () => {
    const w = await monter();
    const camp = await w.campagneOuverte('Couronne');
    const autre = await w.campagneOuverte('Landes');
    const scen = await w.scenarioFerme(camp.id, 'Acte');
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${scen.id}`, { parent: autre.id })).statusCode, 200);
    const lue = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${scen.id}`)).json();
    assert.equal(lue.ancetres.at(-1)?.id, autre.id);
    const ids = async (id: number) => (await w.appel(w.antor, 'GET', `${w.base}/fiches/${id}/enfants`)).json().enfants.map((e: { id: number }) => e.id);
    assert.deepEqual(await ids(autre.id), [scen.id]);
    assert.deepEqual(await ids(camp.id), []);
  });

  test('a player reads the open campaign « En cours » without the closed scenario; the GM in player mode too; neither writes the status', async () => {
    const w = await monter();
    const camp = await w.campagneOuverte('Couronne');
    const scen = await w.scenarioFerme(camp.id, 'Acte');
    const lue = (await w.appel(w.lea, 'GET', `${w.base}/fiches/${camp.id}`)).json();
    assert.equal(lue.charge.statut, 'en_cours');
    const contient = async (h: typeof w.lea, mode = '') => (await w.appel(h, 'GET', `${w.base}/fiches/${camp.id}/enfants${mode}`)).json().enfants.map((e: { id: number }) => e.id);
    assert.deepEqual(await contient(w.lea), []);
    assert.deepEqual(await contient(w.antor, '?mode=joueur'), []);
    assert.deepEqual(await contient(w.antor), [scen.id]);
    assert.equal((await w.appel(w.lea, 'PATCH', `${w.base}/fiches/${camp.id}`, { statut: 'terminee' })).statusCode, 403);
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${camp.id}?mode=joueur`, { statut: 'terminee' })).statusCode, 403);
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/fiches/${scen.id}`)).statusCode, 404);
  });

  test('the player search and the list carry the status of an open campaign and never the closed scenario', async () => {
    const w = await monter();
    const camp = await w.campagneOuverte('Couronne brisée');
    await w.scenarioFerme(camp.id, 'Acte Couronne');
    const liste = (await w.appel(w.lea, 'GET', `${w.base}/fiches?type=aventure&q=Couronne`)).json();
    const noms = liste.fiches.map((f: { titre: string }) => f.titre);
    assert.ok(noms.includes('Couronne brisée'));
    assert.ok(!noms.includes('Acte Couronne'));
    assert.equal(liste.fiches.find((f: { titre: string }) => f.titre === 'Couronne brisée').charge.statut, 'en_cours');
  });

  test('creation: born « en_preparation » with its first section closed to the players, one write only', async () => {
    const w = await monter();
    const avant = w.n('fiches');
    const r = await w.appel(w.antor, 'POST', `${w.base}/fiches`, { type: 'aventure', titre: 'Couronne', sousType: 'Campagne', sections: [{ titre: 'Présentation', joueursLisent: false }] });
    assert.equal(r.statusCode, 201);
    assert.equal(w.n('fiches'), avant + 1);
    const lue = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${r.json().id}`)).json();
    assert.equal(lue.charge.statut, 'en_preparation');
    assert.equal(lue.sections.find((s: { titre: string }) => s.titre === 'Présentation').audience.joueursLisent, false);
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/fiches/${r.json().id}`)).statusCode, 404);
  });

  test('a player cannot create an adventure (403) and nothing is written; the four statuses each list the one adventure alone', async () => {
    const w = await monter();
    await w.campagneOuverte('Couronne');
    const avant = w.n('fiches');
    assert.equal((await w.appel(w.lea, 'POST', `${w.base}/fiches`, { type: 'aventure', titre: 'Pirate' })).statusCode, 403);
    assert.equal(w.n('fiches'), avant);
    const id = (await w.creer(w.antor, { type: 'aventure', titre: 'Quatre' })).id;
    const statuts = ['prete', 'en_cours', 'terminee', 'en_preparation'];
    const titres = async (statut: string) =>
      ((await w.appel(w.antor, 'GET', `${w.base}/fiches?type=aventure&statut=${statut}`)).json().fiches as { titre: string }[]).map((f) => f.titre);
    for (const valeur of statuts) {
      assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${id}`, { statut: valeur })).statusCode, 200);
      assert.ok((await titres(valeur)).includes('Quatre'), valeur);
      for (const autre of statuts.filter((x) => x !== valeur)) assert.ok(!(await titres(autre)).includes('Quatre'), `${valeur} / ${autre}`);
    }
  });

  test('a deactivated type keeps writing the status of its existing adventure', async () => {
    const w = await monter();
    const camp = await w.campagneOuverte('Couronne');
    assert.equal((await w.appel(w.antor, 'PUT', `${w.base}/types/aventure`, { etat: 'desactive' })).statusCode, 200);
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${camp.id}`, { statut: 'prete' })).statusCode, 200);
    assert.equal((await w.appel(w.antor, 'GET', `${w.base}/fiches/${camp.id}`)).json().charge.statut, 'prete');
    assert.ok((await w.appel(w.antor, 'POST', `${w.base}/fiches`, { type: 'aventure', titre: 'Refusée' })).statusCode >= 400);
    assert.equal((await w.appel(w.antor, 'PUT', `${w.base}/types/aventure`, { etat: 'suivre' })).statusCode, 200);
  });
});

describe('Deleting an adventure', () => {
  test('the deletion balance counts sections, tasks, scenarios and reports; deleting lifts the scenario and leaves the reports', async () => {
    const w = await monter();
    const camp = await w.campagneOuverte('Couronne');
    const acte = await w.scenarioFerme(camp.id, 'Acte');
    for (const [id, libelle] of [[camp.id, 'a'], [camp.id, 'b'], [camp.id, 'c'], [acte.id, 'd']] as const) {
      assert.equal((await w.appel(w.antor, 'POST', `${w.base}/fiches/${id}/taches`, { categorie: 'pnj', libelle })).statusCode, 201);
    }
    for (const [id, titre] of [[camp.id, 'Un'], [camp.id, 'Deux'], [acte.id, 'Sceau']] as const) {
      assert.equal((await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: id, titre, texte: 'T' })).statusCode, 201);
    }
    const sceau = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${acte.id}/suppression`)).json();
    assert.deepEqual([sceau.taches, sceau.comptesRendus, sceau.scenarios ?? 0], [1, 1, 0]);
    const bilan = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${camp.id}/suppression`)).json();
    assert.deepEqual([bilan.taches, bilan.scenarios, bilan.comptesRendus], [3, 1, 2]);
    assert.equal((await w.appel(w.antor, 'GET', `${w.base}/fiches/${acte.id}`)).statusCode, 200);
    assert.equal((await w.appel(w.antor, 'DELETE', `${w.base}/fiches/${camp.id}`)).statusCode, 204);
    assert.equal((await w.appel(w.antor, 'GET', `${w.base}/fiches/${acte.id}`)).json().ancetres.length, 0, 'the scenario is at the root');
    const crs = (await w.appel(w.antor, 'GET', `${w.base}/comptes-rendus`)).json().comptesRendus as { titre: string; campagneSupprimee?: boolean; campagneNom?: string }[];
    assert.equal(crs.find((c) => c.titre === 'Un')!.campagneSupprimee, true);
    assert.equal(crs.find((c) => c.titre === 'Sceau')!.campagneNom, 'Acte');
    const lea = (await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus`)).json().comptesRendus as Record<string, unknown>[];
    assert.ok(lea.every((c) => !('campagneSupprimee' in c)), 'a player never learns « deleted »');
  });

  test('the retired addresses are no API either: campagnes and scenarios answer 404', async () => {
    const w = await monter();
    for (const chemin of ['campagnes', 'scenarios', 'campagnes/1', 'scenarios/1']) {
      assert.equal((await w.appel(w.antor, 'GET', `${w.base}/${chemin}`)).statusCode, 404, chemin);
    }
  });
});

describe('Session reports, bounds', () => {
  test('a text of 100 000 characters is accepted, 100 001 is refused (400) and nothing is created', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const cr = (titre: string, n: number) => w.appel(w.lea, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre, texte: 'a'.repeat(n) });
    assert.equal((await cr('Pile', 100000)).statusCode, 201);
    const avant = w.n('fiches');
    assert.equal((await cr('Trop long', 100001)).statusCode, 400);
    assert.equal(w.n('fiches'), avant);
    const liste = (await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus`)).json().comptesRendus as { titre: string }[];
    assert.ok(!liste.some((x) => x.titre === 'Trop long'));
  });

  test('a title is required, a report opens with its campaign and comes first in the list and in the filter by campaign', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    assert.equal((await w.appel(w.lea, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: '' })).statusCode, 400);
    const cr = (await w.appel(w.lea, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 12', texte: 'Le sceau est brisé.' })).json();
    const lue = (await w.appel(w.lea, 'GET', `${w.base}/fiches/${cr.id}`)).json();
    assert.equal(lue.campagneNom, 'Couronne');
    assert.equal(lue.campagneId, c.id);
    const l = (await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=${c.id}`)).json().comptesRendus as { titre: string }[];
    assert.equal(l[0]!.titre, 'Séance 12');
  });

  test('a report of a closed scenario names it to the GM only: the player has no campaign key at all', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const s = await w.scenarioFerme(c.id, 'Acte II secret');
    const cr = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s.id, titre: 'Acte II secret CR', texte: 'x' })).json();
    const mj = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${cr.id}`)).json();
    assert.equal(mj.campagneNom, 'Acte II secret');
    const joueur = (await w.appel(w.lea, 'GET', `${w.base}/fiches/${cr.id}`)).json();
    assert.ok(!('campagneNom' in joueur) && !('campagneId' in joueur));
    assert.ok(!(await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus`)).body.includes('"Acte II secret"'));
  });

  test('more than 100 reports: a page of 100, a cursor for the rest, no duplicate', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    for (let i = 1; i <= 101; i++) await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: `Séance numéro ${i}`, texte: 'x' });
    const p1 = (await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=${c.id}`)).json();
    assert.equal(p1.comptesRendus.length, 100);
    assert.ok(p1.suivant, 'a cursor for the rest');
    assert.ok(!p1.comptesRendus.some((x: { titre: string }) => x.titre === 'Séance numéro 1'), 'the oldest comes on the next page');
    const p2 = (await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=${c.id}&curseur=${encodeURIComponent(p1.suivant)}`)).json();
    assert.deepEqual(p2.comptesRendus.map((x: { titre: string }) => x.titre), ['Séance numéro 1']);
    assert.ok(!p2.suivant);
  });
});
