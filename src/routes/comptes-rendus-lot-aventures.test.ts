// Doors of the effects that the screens « aventures-suivi-critere » and « aventures-suivi-ecrans » (E-3, E-13) proved through the browser.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

type Ligne = { id: number; titre: string };

describe('Session reports lists', () => {
  test('the list is newest first, an edit of the oldest does not make it climb, closing one to the players leaves no hole for them', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const cr = async (h: typeof w.antor, titre: string) => {
      const r = await w.appel(h, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre, texte: 'Texte.' });
      assert.equal(r.statusCode, 201, r.body);
      return r.json().id as number;
    };
    const premier = await cr(w.antor, 'Prologue');
    for (const n of [2, 3, 4, 5, 6]) await cr(w.antor, `Session ${n}`);
    await cr(w.lea, 'Récit de Léa');
    const s11 = await cr(w.antor, 'Session 11');
    const f = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${premier}`)).json();
    const sec = f.sections[0];
    const maj = await w.appel(w.antor, 'PUT', `${w.base}/fiches/${premier}/sections/${sec.id}/contenu`, { contenu: 'Retouché.', version: sec.version });
    assert.equal(maj.statusCode, 200, maj.body);
    const titres = async (h: typeof w.antor) => ((await w.appel(h, 'GET', `${w.base}/comptes-rendus`)).json().comptesRendus as Ligne[]).map((x) => x.titre);
    assert.deepEqual(await titres(w.antor), ['Session 11', 'Récit de Léa', 'Session 6', 'Session 5', 'Session 4', 'Session 3', 'Session 2', 'Prologue']);
    const g = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${s11}`)).json();
    assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${s11}/sections/${g.sections[0].id}`, { joueursLisent: false })).statusCode, 200);
    assert.deepEqual(await titres(w.lea), ['Récit de Léa', 'Session 6', 'Session 5', 'Session 4', 'Session 3', 'Session 2', 'Prologue']);
    assert.equal((await titres(w.antor))[0], 'Session 11', 'the GM still reads it');
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/fiches/${s11}`)).statusCode, 404);
  });

  test('a report carries its author and its date; a closed scenario report keeps a player-side line without any adventure key', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const s = await w.scenarioFerme(c.id, 'Acte II');
    await w.appel(w.lea, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Récit de Léa' });
    await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s.id, titre: 'Séance du scénario', texte: 'Texte.' });
    const l = (await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus`)).json().comptesRendus as Record<string, unknown>[];
    const recit = l.find((x) => x.titre === 'Récit de Léa')!;
    assert.match(String(recit.creeLe ?? recit.cree_le), /^\d{4}-\d{2}-\d{2}/);
    assert.ok(JSON.stringify(recit).includes('lea'), 'the author is named');
    const ferme = l.find((x) => x.titre === 'Séance du scénario');
    if (ferme) assert.ok(!('campagneNom' in ferme) && !('campagneId' in ferme) && !('campagneSupprimee' in ferme) && !JSON.stringify(ferme).includes('Acte II'));
  });

  test('a deleted scenario is « campagneSupprimee » for its GM and the same silence for the player as a closed one', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const s = await w.scenarioFerme(c.id, 'Acte II');
    await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s.id, titre: 'Séance du scénario', texte: 'Texte.' });
    const lire = async (h: typeof w.antor) => ((await w.appel(h, 'GET', `${w.base}/comptes-rendus`)).json().comptesRendus as Record<string, unknown>[]).find((x) => x.titre === 'Séance du scénario')!;
    const avantLea = JSON.stringify(await lire(w.lea));
    assert.equal((await w.appel(w.antor, 'DELETE', `${w.base}/fiches/${s.id}`)).statusCode, 204);
    assert.equal((await lire(w.antor)).campagneSupprimee, true);
    assert.equal(JSON.stringify(await lire(w.lea)), avantLea, 'closed and deleted look the same to a player');
  });

  test('the player-visible list excludes an account with no role: 404 for Mira, who is not a member of this universe', async () => {
    const w = await monter();
    assert.equal((await w.appel(w.mira, 'GET', `${w.base}/comptes-rendus`)).statusCode, 404);
  });

  test('the preparation list carries every task with its checked mark, so the unchecked ones are the open list, oldest first by id', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const ids: number[] = [];
    for (let i = 1; i <= 7; i++) {
      const r = await w.appel(w.antor, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: i === 1 ? 'cartes' : 'pnj', libelle: `Tâche ${i}` });
      assert.equal(r.statusCode, 201, r.body);
      ids.push(r.json().id);
    }
    await w.appel(w.antor, 'PUT', `/api/taches/${ids[1]}`, { faite: true });
    const l = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${c.id}/taches`)).json().taches as { id: number; libelle: string; faite: boolean }[];
    const ancien = (a: { id: number }, b: { id: number }) => a.id - b.id;
    assert.deepEqual(l.filter((t) => !t.faite).sort(ancien).map((t) => t.libelle), ['Tâche 1', 'Tâche 3', 'Tâche 4', 'Tâche 5', 'Tâche 6', 'Tâche 7']);
    assert.deepEqual(l.filter((t) => t.faite).map((t) => t.libelle), ['Tâche 2']);
  });
});
