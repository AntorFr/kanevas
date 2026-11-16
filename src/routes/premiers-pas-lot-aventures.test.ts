// Doors of the effects that « besoins-ensemble » (kanevas-premiere-fiche) proved through the browser: the session guard on
// pages and API, the shape of /api/moi, a no-role account answering as an unknown address, a closed section leaking nothing.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

describe('Session guard', () => {
  test('without a session every page redirects to the sign-in and every API answers 401 with no data; the public routes stay open', async () => {
    const w = await monter();
    const id = w.base.split('/').pop();
    for (const chemin of ['/', `/univers/${id}`, `/univers/${id}/fiche/1`, '/nimporte/quoi']) {
      const r = await w.app.inject({ url: chemin });
      assert.ok([301, 302, 303, 307].includes(r.statusCode), `${chemin} -> ${r.statusCode}`);
      assert.ok(String(r.headers.location).includes('connexion'), chemin);
    }
    for (const chemin of ['/api/univers', '/api/moi', `/api/univers/${id}`, `/api/univers/${id}/membres`, `/api/univers/${id}/fiches`]) {
      const r = await w.app.inject({ url: chemin });
      assert.equal(r.statusCode, 401, chemin);
      assert.ok(!r.body.includes('Lame'), chemin);
    }
    const h = await w.app.inject({ url: '/healthz' });
    assert.equal(h.statusCode, 200);
    assert.match(h.body, /^kanevas \S+$/, 'name and version only');
    assert.notEqual((await w.app.inject({ url: '/assets/' })).statusCode, 200);
    const forge = await w.app.inject({ url: '/api/univers', headers: { cookie: 'kanevas_session=1.forge; session=1' } });
    assert.equal(forge.statusCode, 401);
  });

  test('/api/moi gives the account, its groups and the section ceiling; the instance admin gets the group, an ordinary account none', async () => {
    const w = await monter();
    const admin = await w.app.inject({
      method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=admin',
    });
    const cookie = `kanevas_session=${admin.cookies.find((c) => c.name === 'kanevas_session')!.value}`;
    assert.deepEqual((await w.appel({ cookie }, 'GET', '/api/moi')).json(), { username: 'admin', groups: ['parents'], limites: { contenuSection: 100000 } });
    assert.deepEqual((await w.appel(w.lea, 'GET', '/api/moi')).json(), { username: 'lea', groups: [], limites: { contenuSection: 100000 } });
    const sortie = await w.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    assert.ok(sortie.statusCode < 400, String(sortie.statusCode));
  });
});

describe('No role, closed content', () => {
  test('an account with no role gets the same answer for the universe and its members as for an unknown universe', async () => {
    const w = await monter();
    const id = w.base.split('/').pop();
    const inconnue = await w.appel(w.mira, 'GET', '/api/univers/999999');
    const refus = await w.appel(w.mira, 'GET', `/api/univers/${id}`);
    assert.equal(refus.statusCode, inconnue.statusCode);
    assert.equal(refus.body, inconnue.body);
    const membres = await w.appel(w.mira, 'GET', `${w.base}/membres`);
    assert.equal(membres.statusCode, (await w.appel(w.mira, 'GET', '/api/univers/999999/membres')).statusCode);
    assert.ok(!membres.body.includes('Lame'));
    const f1 = await w.appel(w.mira, 'GET', `${w.base}/fiches/1`);
    const f2 = await w.appel(w.mira, 'GET', '/api/univers/987654/fiches/1');
    assert.equal(f1.statusCode, f2.statusCode);
    assert.equal(f1.body, f2.body);
  });

  test('the instance admin with no role reads no sheet of the universe', async () => {
    const w = await monter();
    const f = await w.creer(w.antor, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false }, sections: [{ titre: 'Apparence', joueursLisent: true }] });
    const admin = await w.app.inject({
      method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=admin',
    });
    const cookie = { cookie: `kanevas_session=${admin.cookies.find((c) => c.name === 'kanevas_session')!.value}` };
    const r = await w.appel(cookie, 'GET', `${w.base}/fiches/${f.id}`);
    assert.equal(r.statusCode, 404);
    assert.ok(!r.body.includes('Apparence'));
  });

  test('a player receives the open section only: the GM-only section, its title and its text are absent from the sheet', async () => {
    const w = await monter();
    const f = await w.creer(w.antor, {
      type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false },
      sections: [{ titre: 'Apparence', joueursLisent: true }, { titre: 'Vérité — MJ seul', joueursLisent: false }],
    });
    const lue = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${f.id}`)).json();
    for (const s of lue.sections) {
      const texte = s.titre === 'Apparence' ? 'Un vieil homme au regard clair.' : 'Il est le traître.';
      assert.equal((await w.appel(w.antor, 'PUT', `${w.base}/fiches/${f.id}/sections/${s.id}/contenu`, { contenu: texte, version: s.version })).statusCode, 200);
    }
    const r = await w.appel(w.lea, 'GET', `${w.base}/fiches/${f.id}`);
    assert.equal(r.statusCode, 200);
    assert.ok(r.body.includes('Apparence'));
    assert.ok(!r.body.includes('Vérité') && !r.body.includes('traître'));
  });
});
