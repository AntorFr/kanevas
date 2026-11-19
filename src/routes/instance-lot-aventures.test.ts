// Doors of « recours-admin-ensemble » (routes /api/instance, « sans écran »): the instance routes and the admin without a role.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

async function monde() {
  const w = await monter();
  const admin = await w.app.inject({
    method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=admin',
  });
  const hAdmin = { cookie: `kanevas_session=${admin.cookies.find((c) => c.name === 'kanevas_session')!.value}` };
  const landes = (await w.appel(w.mira, 'POST', '/api/univers', { nom: 'Les Landes grises', description: 'Des tourbières.' })).json();
  await w.appel(w.mira, 'POST', `/api/univers/${landes.id}/membres`, { username: 'teo', role: 'joueur' });
  const lameId = Number(w.base.split('/').pop());
  return { ...w, hAdmin, landes: landes.id as number, lameId };
}

describe('Instance routes', () => {
  test('without a session 401; Léa, Antor and Teo (not instance admins): 404 with the body of an unknown address, and Teo gains nothing', async () => {
    const m = await monde();
    for (const chemin of ['/api/instance/univers', `/api/instance/univers/${m.lameId}/membres`]) {
      assert.equal((await m.app.inject({ url: chemin })).statusCode, 401, chemin);
    }
    const inconnu = await m.appel(m.lea, 'GET', '/api/instance/rien-du-tout');
    assert.equal(inconnu.statusCode, 404);
    for (const [cle, h] of [['lea', m.lea], ['antor', m.antor], ['teo', m.teo]] as const) {
      for (const [methode, chemin, payload] of [
        ['GET', '/api/instance/univers', undefined],
        ['GET', `/api/instance/univers/${m.lameId}/membres`, undefined],
        ['POST', `/api/instance/univers/${m.lameId}/membres`, { username: cle, role: 'mj' }],
        ['DELETE', `/api/instance/univers/${m.landes}/membres/1`, undefined],
      ] as const) {
        const r = await m.appel(h, methode, chemin, payload);
        assert.equal(r.statusCode, 404, `${cle} ${methode} ${chemin}`);
        assert.equal(r.body, inconnu.body, `${cle} ${methode} ${chemin}: same body`);
      }
    }
    const rm = await m.appel(m.mira, 'GET', `/api/univers/${m.landes}/membres`);
    assert.equal(rm.json().length, 2);
  });

  test('GET /api/instance/univers gives only id, name and member count; members: identifier and role, no description, no content', async () => {
    const m = await monde();
    const r = await m.appel(m.hAdmin, 'GET', '/api/instance/univers');
    assert.equal(r.statusCode, 200);
    assert.ok(!r.body.includes('Tourbières') && !r.body.includes('tourbières') && !/description/i.test(r.body));
    const liste = (r.json() as Record<string, unknown>[]).filter((u) => u.nom === 'Lame' || u.nom === 'Les Landes grises');
    assert.equal(liste.length, 2);
    for (const u of liste) assert.equal(Object.keys(u).length, 3, `three fields: ${Object.keys(u)}`);
    const rm = await m.appel(m.hAdmin, 'GET', `/api/instance/univers/${m.lameId}/membres`);
    assert.equal(rm.statusCode, 200);
    const membres = rm.json() as Record<string, unknown>[];
    assert.ok(membres.some((x) => JSON.stringify(x).includes('antor') && JSON.stringify(x).includes('mj')));
    assert.ok(membres.some((x) => JSON.stringify(x).includes('lea') && JSON.stringify(x).includes('joueur')));
  });

  test('the admin without a role: no content route of the universe answers other than 404 and the admin\'s own list holds no universe', async () => {
    const m = await monde();
    const f = await m.creer(m.antor, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
    for (const chemin of [`/api/univers/${m.lameId}`, `/api/univers/${m.lameId}/fiches`, `/api/univers/${m.lameId}/fiches/${f.id}`, `/api/univers/${m.lameId}/membres`]) {
      const r = await m.appel(m.hAdmin, 'GET', chemin);
      assert.equal(r.statusCode, 404, chemin);
      assert.ok(!r.body.includes('Maître Aldric'), chemin);
    }
    assert.deepEqual((await m.appel(m.hAdmin, 'GET', '/api/univers')).json(), [], 'no universe in the admin\'s own list');
  });
});

describe('Consequences of an admin repair', () => {
  const compteId = (m: Awaited<ReturnType<typeof monde>>, username: string) =>
    (m.app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(username) as { id: number }).id;

  test('the admin replaces the GM: the new GM reads the sheets, the former one no longer finds the universe (404)', async () => {
    const m = await monde();
    await m.creer(m.antor, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
    const base = `/api/instance/univers/${m.lameId}/membres`;
    assert.equal((await m.appel(m.hAdmin, 'POST', base, { username: 'mira', role: 'mj' })).statusCode, 201);
    assert.equal((await m.appel(m.hAdmin, 'DELETE', `${base}/${compteId(m, 'antor')}`)).statusCode, 204);
    const fiches = await m.appel(m.mira, 'GET', `${m.base}/fiches`);
    assert.equal(fiches.statusCode, 200);
    assert.match(fiches.body, /Maître Aldric/);
    assert.equal((await m.appel(m.antor, 'GET', m.base)).statusCode, 404);
    const liste = (await m.appel(m.hAdmin, 'GET', '/api/instance/univers')).json() as { id: number; nbMembres: number }[];
    assert.equal(liste.find((u) => u.id === m.lameId)!.nbMembres, 3, 'antor out, mira in: lea, teo, mira');
  });

  test('an admin who joins as a player then is promoted GM is seen so by the GM; before joining he reads nothing', async () => {
    const m = await monde();
    for (const chemin of [m.base, `${m.base}/fiches`, `${m.base}/membres`]) {
      assert.equal((await m.appel(m.hAdmin, 'GET', chemin)).statusCode, 404, `${chemin} before joining`);
    }
    const base = `/api/instance/univers/${m.lameId}/membres`;
    assert.equal((await m.appel(m.hAdmin, 'POST', base, { username: 'admin', role: 'joueur' })).statusCode, 201);
    const roles = async () => ((await m.appel(m.antor, 'GET', `${m.base}/membres`)).json() as { username: string; role: string }[]).filter((x) => x.username === 'admin').map((x) => x.role);
    assert.deepEqual(await roles(), ['joueur']);
    assert.equal((await m.appel(m.hAdmin, 'GET', m.base)).statusCode, 200);
    assert.equal((await m.appel(m.hAdmin, 'PATCH', `${base}/${compteId(m, 'admin')}`, { role: 'mj' })).statusCode, 200);
    assert.deepEqual(await roles(), ['mj']);
  });

  test('the admin without a role: the search of the universe is 404 and its own list holds no universe of the instance', async () => {
    const m = await monde();
    assert.equal((await m.appel(m.hAdmin, 'GET', `${m.base}/fiches?recherche=Aldric`)).statusCode, 404);
    assert.ok(!JSON.stringify((await m.appel(m.hAdmin, 'GET', '/api/univers')).json()).includes('Lame'));
  });
});
