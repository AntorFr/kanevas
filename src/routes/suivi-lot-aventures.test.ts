// Doors of the API effects that « aventures-suivi-ensemble » (and the follow-up screens) re-proved through the browser:
// tasks bounds and rights, report refusals, what a player reads of adventures, the assistant's creation.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

describe('Preparation tasks, rights and bounds', () => {
  test('a label of 1 to 200 characters is accepted, 0 and 201 refused; unknown category, non-adventure sheet and player: refused', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const s = await w.scenarioFerme(c.id, 'Acte II');
    const lieu = await w.creer(w.antor, { type: 'lieu', titre: 'Port' });
    const url = `${w.base}/fiches/${c.id}/taches`;
    const post = (u: string, h: typeof w.antor, corps: object) => w.appel(h, 'POST', u, corps);
    assert.equal((await post(url, w.antor, { categorie: 'autre', libelle: '' })).statusCode, 400);
    assert.equal((await post(url, w.antor, { categorie: 'autre', libelle: 'x'.repeat(201) })).statusCode, 400);
    assert.equal((await post(url, w.antor, { categorie: 'autre', libelle: 'x'.repeat(200) })).statusCode, 201);
    assert.equal((await post(url, w.antor, { categorie: 'dragons', libelle: 'a' })).statusCode, 400);
    assert.equal((await post(`${w.base}/fiches/${lieu.id}/taches`, w.antor, { categorie: 'autre', libelle: 'a' })).statusCode, 404);
    assert.equal((await post(`${w.base}/fiches/${s.id}/taches`, w.lea, { categorie: 'autre', libelle: 'a' })).statusCode, 404);
    assert.equal(w.n('taches_preparation'), 1, 'only the accepted one is written');
  });

  test('every category of the list is accepted; a blank label or an unknown category is refused (400)', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const url = `${w.base}/fiches/${c.id}/taches`;
    for (const cat of ['monstres', 'pnj', 'cartes', 'deroulements', 'autre']) {
      assert.equal((await w.appel(w.antor, 'POST', url, { categorie: cat, libelle: `Tâche ${cat}` })).statusCode, 201, cat);
    }
    for (const [cat, lib] of [['autre', '   '], ['magie', 'Un libellé']] as const) {
      assert.equal((await w.appel(w.antor, 'POST', url, { categorie: cat, libelle: lib })).statusCode, 400, `${cat}/${lib}`);
    }
    assert.equal(w.n('taches_preparation'), 5);
  });

  test('a GM of another universe, an unknown id, a non-adventure sheet and the path of another universe get the same 404 on tasks, nothing is written', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const lieu = await w.creer(w.antor, { type: 'lieu', titre: 'Port-Test' });
    await w.appel(w.antor, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: 'autre', libelle: 'Plan de la crypte' });
    const autre = (await w.appel(w.mira, 'POST', '/api/univers', { nom: 'Ailleurs' })).json();
    for (const [h, id] of [[w.lea, c.id], [w.mira, c.id], [w.antor, lieu.id], [w.antor, 999999]] as const) {
      const g = await w.appel(h, 'GET', `${w.base}/fiches/${id}/taches`);
      assert.equal(g.statusCode, 404);
      assert.ok(!g.body.includes('Plan de la crypte'));
      assert.equal((await w.appel(h, 'POST', `${w.base}/fiches/${id}/taches`, { categorie: 'autre', libelle: 'Intrus' })).statusCode, 404);
    }
    assert.equal((await w.appel(w.antor, 'GET', `/api/univers/${autre.id}/fiches/${c.id}/taches`)).statusCode, 404);
    assert.equal(w.n('taches_preparation'), 1);
  });

  test('a player lists and checks no task (404) and the task stays unchecked', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const t = (await w.appel(w.antor, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: 'pnj', libelle: 'Statistiques' })).json();
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/fiches/${c.id}/taches`)).statusCode, 404);
    assert.ok(!(await w.appel(w.lea, 'GET', `${w.base}/fiches/${c.id}/taches`)).body.includes('Statistiques'));
    assert.equal((await w.appel(w.lea, 'PUT', `/api/taches/${t.id}`, { faite: true })).statusCode, 404);
    const l = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${c.id}/taches`)).json().taches as { id: number; faite: boolean }[];
    assert.equal(l.find((x) => x.id === t.id)!.faite, false);
  });

  test('tasks belong to their own adventure: the list of one does not carry the task of another', async () => {
    const w = await monter();
    const a = await w.campagneOuverte('Couronne');
    const b = await w.campagneOuverte('Vieux Pacte');
    await w.appel(w.antor, 'POST', `${w.base}/fiches/${a.id}/taches`, { categorie: 'pnj', libelle: 'Statistiques du Gardien' });
    await w.appel(w.antor, 'POST', `${w.base}/fiches/${b.id}/taches`, { categorie: 'pnj', libelle: 'Choisir la musique' });
    const l = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${a.id}/taches`)).json().taches as { libelle: string }[];
    assert.deepEqual(l.map((x) => x.libelle), ['Statistiques du Gardien']);
  });
});

describe('Session reports, refusals and what a player reads', () => {
  test('a report under a non-adventure sheet, a sheet the player does not read or an unknown id is refused and nothing is written', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const fermee = await w.creer(w.antor, { type: 'aventure', titre: 'Cendres', sections: [{ titre: 'P', joueursLisent: false }] });
    const s = await w.scenarioFerme(c.id, 'Acte II');
    const lieu = await w.creer(w.antor, { type: 'lieu', titre: 'Port' });
    const avant = w.n('fiches');
    for (const id of [lieu.id, fermee.id, s.id, 999999]) {
      const r = await w.appel(w.lea, 'POST', `${w.base}/comptes-rendus`, { campagneId: id, titre: 'Pirate', texte: 'x' });
      assert.notEqual(r.statusCode, 201, String(id));
    }
    assert.equal(w.n('fiches'), avant);
    assert.ok(!(await w.appel(w.antor, 'GET', `${w.base}/comptes-rendus`)).body.includes('Pirate'));
  });

  test('the filter by adventure gives only its reports for a reader, and 404 for an adventure the caller cannot read (closed, other campaign)', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const acte = await w.scenarioFerme(c.id, 'Acte II');
    const fermee = await w.creer(w.antor, { type: 'aventure', titre: 'Brumes', sections: [{ titre: 'P', joueursLisent: false }] });
    await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance Couronne', texte: 'x' });
    await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: acte.id, titre: 'Séance Acte II', texte: 'x' });
    const ok = await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=${c.id}`);
    assert.equal(ok.statusCode, 200);
    const l = ok.json().comptesRendus as { campagneId: number }[];
    assert.ok(l.length >= 1 && l.every((x) => x.campagneId === c.id));
    assert.ok(!ok.body.includes('Séance Acte II'));
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=${acte.id}`)).statusCode, 404);
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=${fermee.id}`)).statusCode, 404);
  });

  test('a failed creation of a report leaves no trace in the list', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const r = await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: '', texte: 'Perdu ?' });
    assert.equal(r.statusCode, 400);
    assert.ok(!(await w.appel(w.antor, 'GET', `${w.base}/comptes-rendus`)).body.includes('Perdu ?'));
  });

  test('a player reads the open and the finished campaigns, never the one in preparation nor a scenario, in the list and in the search', async () => {
    const w = await monter();
    const cours = await w.campagneOuverte('La Couronne brisée');
    await w.scenarioFerme(cours.id, 'Acte II');
    const prep = await w.creer(w.antor, { type: 'aventure', titre: 'Les Cendres de Vaëlis', sections: [{ titre: 'Présentation', joueursLisent: false }] });
    const fin = await w.creer(w.antor, { type: 'aventure', titre: 'Le Vieux Pacte', sections: [{ titre: 'Présentation', joueursLisent: true }] });
    await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${fin.id}`, { statut: 'terminee' });
    const liste = async (qs: string) => ((await w.appel(w.lea, 'GET', `${w.base}/fiches?${qs}`)).json().fiches as { titre: string }[]).map((f) => f.titre).sort();
    assert.deepEqual(await liste('type=aventure'), ['La Couronne brisée', 'Le Vieux Pacte']);
    assert.deepEqual(await liste('q=Vaëlis'), []);
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/fiches/${prep.id}`)).statusCode, 404);
  });

  test('the report of a closed campaign: no « campagne » line, no name, no « Aventure supprimée » for a player, on the sheet or in the list', async () => {
    const w = await monter();
    const fermee = await w.creer(w.antor, { type: 'aventure', titre: 'Les Cendres de Vaëlis', sections: [{ titre: 'P', joueursLisent: false }] });
    const cr = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: fermee.id, titre: 'Séance 3', texte: 'x' })).json();
    for (const url of [`${w.base}/comptes-rendus`, `${w.base}/fiches/${cr.id}`]) {
      const corps = (await w.appel(w.lea, 'GET', url)).body;
      assert.doesNotMatch(corps, /Vaëlis|Aventure supprimée|campagneSupprimee/, url);
    }
  });

  test('a report written by a player under an open campaign names it; under a closed scenario by the GM it names nothing to the player, anywhere', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('La Couronne brisée');
    const s = await w.scenarioFerme(c.id, 'Acte II — Le sceau brisé');
    const ouvert = (await w.appel(w.lea, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 12', texte: 'x' })).json();
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/fiches/${ouvert.id}`)).json().campagneNom, 'La Couronne brisée');
    const cr = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s.id, titre: 'Acte II secret', texte: 'x' })).json();
    assert.equal((await w.appel(w.antor, 'GET', `${w.base}/fiches/${cr.id}`)).json().campagneNom, 'Acte II — Le sceau brisé');
    for (const url of [`${w.base}/comptes-rendus`, `${w.base}/fiches/${cr.id}`, `${w.base}/fiches?q=sceau`, `${w.base}/fiches?type=compte_rendu`]) {
      assert.doesNotMatch((await w.appel(w.lea, 'GET', url)).body, /Le sceau brisé/, url);
    }
  });
});

describe('Adventure status moves and the GM block', () => {
  test('the status of a scenario and of its campaign are independent and each filter lists the right ones', async () => {
    const w = await monter();
    const camp = await w.campagneOuverte('Couronne');
    const acte = await w.scenarioFerme(camp.id, 'Acte II');
    const filtre = async (statut: string) => ((await w.appel(w.antor, 'GET', `${w.base}/fiches?type=aventure&statut=${statut}`)).json().fiches as { titre: string }[]).map((f) => f.titre).filter((t) => ['Couronne', 'Acte II'].includes(t)).sort();
    assert.deepEqual(await filtre('en_cours'), ['Couronne']);
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${acte.id}`, { statut: 'en_cours' })).statusCode, 200);
    assert.deepEqual(await filtre('en_cours'), ['Acte II', 'Couronne']);
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${camp.id}`, { statut: 'terminee' })).statusCode, 200);
    assert.deepEqual(await filtre('en_cours'), ['Acte II']);
    assert.deepEqual(await filtre('terminee'), ['Couronne']);
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${camp.id}`, { statut: 'en_cours' })).statusCode, 200);
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${acte.id}`, { statut: 'en_preparation' })).statusCode, 200);
    assert.deepEqual(await filtre('en_cours'), ['Couronne']);
  });

  test('a scenario opened to the players does not leak its GM block, on the sheet, on the section or in the search', async () => {
    const w = await monter();
    const camp = await w.campagneOuverte('Couronne');
    const acte = await w.creer(w.antor, { type: 'aventure', titre: 'Acte II', parent: camp.id, sections: [{ titre: 'Scénario', joueursLisent: true }] });
    const f = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${acte.id}`)).json();
    const sec = f.sections[0];
    const maj = await w.appel(w.antor, 'PUT', `${w.base}/fiches/${acte.id}/sections/${sec.id}/contenu`, { contenu: 'Le sceau cède.\n\n:::mj\nOrrin est le traître.\n:::\n', version: sec.version });
    assert.equal(maj.statusCode, 200, maj.body);
    for (const url of [`${w.base}/fiches/${acte.id}`, `${w.base}/fiches/${acte.id}/sections/${sec.id}`, `${w.base}/fiches?q=Orrin`]) {
      const r = await w.appel(w.lea, 'GET', url);
      assert.doesNotMatch(r.body, /Orrin|traître/, url);
    }
    assert.match((await w.appel(w.antor, 'GET', `${w.base}/fiches/${acte.id}`)).body, /Orrin/, 'the GM keeps it');
  });
});

describe('Assistant and the campaigns', () => {
  test('« Crée une campagne » creates an aventure sheet « en_preparation » for the GM, nothing for a player; no « liste les campagnes »', async () => {
    const w = await monter();
    const avant = ((await w.appel(w.antor, 'GET', `${w.base}/fiches?type=aventure`)).json().fiches as unknown[]).length;
    const url = `${w.base}/assistant/messages`;
    const r = await w.appel(w.antor, 'POST', url, { message: 'Crée une campagne « La Reine rouge »', historique: [] });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().reponse, 'Campagne « La Reine rouge » créée.');
    assert.deepEqual(r.json().evenements.map((e: { type: string; libelle: string }) => [e.type, e.libelle]), [['fiche_creee', 'Fiche « La Reine rouge » créée']]);
    const fiches = (await w.appel(w.antor, 'GET', `${w.base}/fiches?type=aventure`)).json().fiches as { titre: string; charge: { statut: string } }[];
    assert.equal(fiches.length, avant + 1);
    assert.equal(fiches.find((x) => x.titre === 'La Reine rouge')!.charge.statut, 'en_preparation');
    const q = await w.appel(w.antor, 'POST', url, { message: 'Liste les campagnes de l’univers', historique: [] });
    assert.match(q.body, /Je ne sais répondre qu/);
    const l = await w.appel(w.lea, 'POST', url, { message: 'Crée une campagne « Pirate »', historique: [] });
    assert.deepEqual(l.json().evenements, []);
    assert.match(l.json().reponse, /creer_fiche/);
    assert.equal(((await w.appel(w.antor, 'GET', `${w.base}/fiches?type=aventure`)).json().fiches as unknown[]).length, avant + 1);
  });
});
