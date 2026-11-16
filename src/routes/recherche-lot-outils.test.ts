// Doors of the lot « outils » for `src/e2e/recherche-ensemble-verif.test.ts` (docs/tests-ecran/lot-outils.md): the assistant searching by alias for
// a player, and the import of aliases and labels (creee / inchangee, warning, a set edited in Kanevas not overwritten), in-process (no browser).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-mediatheque.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';

async function monde() {
  const m = await monter();
  const essai = (m.app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as Any).id as number;
  const imp = async (methode: 'PUT' | 'POST' | 'GET', chemin: string, payload?: object) => {
    const r = await m.app.inject({ method: methode, url: `/api/import/v1/univers/${essai}${chemin}`, headers: { authorization: `Bearer ${JETON}` }, payload });
    return { status: r.statusCode, json: r.json() as Any, body: r.body };
  };
  const corps = (extra: Record<string, unknown> = {}) => ({
    type: 'lieu',
    titre: 'Port-Sel',
    sections: [{ cle: 'desc', titre: 'Description', contenu: 'Un port de sel.', joueursLisent: true }],
    ...extra,
  });
  return { ...m, essai, imp, corps };
}

test('E-17: the assistant of a player searching « Salport » answers with « Port-Sel » through its alias and quotes nothing of the GM block', async () => {
  const m = await monter();
  const lame = (m.app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as Any).id;
  const r = await m.app.inject({ method: 'POST', url: `/api/univers/${lame}/assistant/messages`, headers: m.lea, payload: { message: 'que sait-on de Salport ?', historique: [] } });
  assert.equal(r.statusCode, 200, r.body);
  assert.match(r.json().reponse, /Port-Sel/);
  assert.doesNotMatch(r.json().reponse, /sous-main/);
});

test('B-38: importing a sheet with aliases and labels creates it, the replay (order and case aside) is inchangee, and the player finds it by alias', async () => {
  const w = await monde();
  const donnees = { alias: ['Salport', 'Port-aux-Sels'], etiquettes: ['Côte des Brumes'] };
  const un = await w.imp('PUT', '/fiches/lieu:importe-sel', w.corps({ titre: 'Sel-Importé', ...donnees }));
  assert.equal(un.status, 200);
  assert.equal(un.json.etat, 'creee');
  assert.equal((await w.imp('PUT', '/fiches/lieu:importe-sel', w.corps({ titre: 'Sel-Importé', ...donnees }))).json.etat, 'inchangee');
  const trois = await w.imp('PUT', '/fiches/lieu:importe-sel', w.corps({ titre: 'Sel-Importé', alias: ['port-aux-sels', 'SALPORT'], etiquettes: ['côte des brumes'] }));
  assert.equal(trois.json.etat, 'inchangee');
  const trouves = await w.app.inject({ method: 'GET', url: `/api/univers/${w.essai}/fiches?q=port-aux-sels`, headers: w.lea });
  assert.equal(trouves.statusCode, 200);
  assert.ok((trouves.json().fiches as Any[]).some((f) => f.titre === 'Sel-Importé'));
});

test('B-38: an alias of 121 characters does not refuse the sheet and warns', async () => {
  const w = await monde();
  const r = await w.imp('PUT', '/fiches/lieu:alias-trop-long', w.corps({ titre: 'Alias-Long', alias: ['x'.repeat(121)] }));
  assert.equal(r.status, 200);
  assert.equal(r.json.etat, 'creee');
  assert.ok(Array.isArray(r.json.avertissements) && r.json.avertissements.length >= 1, JSON.stringify(r.json));
});

test('B-48: a set of aliases edited in Kanevas is not overwritten by the replay of the import, which reports it, and the search finds the added alias', async () => {
  const w = await monde();
  const un = await w.imp('PUT', '/fiches/lieu:modifie-ailleurs', w.corps({ titre: 'Modifié-Ailleurs', alias: ['Premier'] }));
  assert.equal(un.json.etat, 'creee');
  const ecrit = await w.app.inject({ method: 'PUT', url: `/api/univers/${w.essai}/fiches/${un.json.id}/etiquetage`, headers: w.antor, payload: { alias: ['Premier', 'Ajouté dans Kanevas'], etiquettes: [] } });
  assert.equal(ecrit.statusCode, 200);
  const { lotId } = (await w.imp('POST', '/lots')).json;
  const deux = await w.imp('PUT', `/fiches/lieu:modifie-ailleurs?lot=${lotId}`, w.corps({ titre: 'Modifié-Ailleurs', alias: ['Premier'] }));
  assert.equal(deux.status, 200);
  assert.match((await w.imp('GET', `/lots/${lotId}`)).body, /alias modifiés dans Kanevas/);
  const q = await w.app.inject({ method: 'GET', url: `/api/univers/${w.essai}/fiches?q=${encodeURIComponent('Ajouté dans Kanevas')}`, headers: w.antor });
  assert.ok((q.json().fiches as Any[]).some((f) => f.titre === 'Modifié-Ailleurs'));
});
