// Doors of `fiche-refonte` (lot « écrans »): what the section audience and the section text write, read back through the API (E-9),
// in-process. The screen file keeps the toast, the hatching and the visible result of each gesture.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

test('l’audience s’écrit à chaque changement : lue puis écrite par les joueurs, relue telle quelle ; le texte enregistré se relit', async () => {
  const m = await monter();
  const u = await m.univers('Sections ecrans', ['lea']);
  const f = await m.creer(m.antor, u.base, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } });
  const s = await m.dire(m.antor, 'POST', `${u.base}/fiches/${f.id}/sections`, { titre: 'Temporaire', contenu: 'Avant.' });
  const url = `${u.base}/fiches/${f.id}/sections/${s.corps.id}`;
  assert.equal((await m.dire(m.antor, 'PATCH', url, { joueursLisent: true })).status, 200);
  assert.equal((await m.dire(m.antor, 'PATCH', url, { joueursEcrivent: true })).status, 200);
  const lue = (await m.dire(m.antor, 'GET', `${u.base}/fiches/${f.id}`)).corps.sections.find((x: Any) => x.id === s.corps.id);
  assert.equal(lue.audience.joueursLisent, true);
  assert.equal(lue.audience.joueursEcrivent, true);
  // a player who may write saves her text: it is read back by the GM
  const cur = (await m.dire(m.lea, 'GET', url)).corps;
  const put = await m.dire(m.lea, 'PUT', `${url}/contenu`, { contenu: 'On dit qu’Aldric boite.', version: cur.version });
  assert.equal(put.status, 200, JSON.stringify(put.corps));
  assert.equal((await m.dire(m.antor, 'GET', url)).corps.contenu, 'On dit qu’Aldric boite.');
  // removing the read right makes the section « MJ seul » again
  assert.equal((await m.dire(m.antor, 'PATCH', url, { joueursLisent: false })).status, 200);
  assert.equal((await m.dire(m.lea, 'GET', url)).status, 404);
});
