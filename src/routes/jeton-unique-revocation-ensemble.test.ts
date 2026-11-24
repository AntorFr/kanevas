// B-jeton-1 (kanevas-jeton-unique) : a cumulated token is one key, so revoking it closes every permission at once.
// Written from docs/parcours.md B-jeton-1 / P-jeton-unique-1, not from the code.
//   nominal   : before revocation the same key reads the content and the galaxy tool (200, 200)
//   exclusion : after revocation neither door opens (401 jeton_invalide on both, and on /mcp)
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

test('un jeton contenu + swn/galaxie révoqué ferme le contenu, l’outil et /mcp d’un coup (401 jeton_invalide)', async () => {
  const app = await buildApp();
  try {
    assert.equal(semerBouchon(app.db), true);
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
    const cookie = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
    const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as { id: number }).id;
    const c = await app.inject({ method: 'POST', url: '/api/compte/jetons', headers: { cookie },
      payload: { nom: 'Import Éneria', dureeJours: 30, acces: { tous: false, univers: [{ universId: E, niveau: 'ecriture' }] }, contenu: true, outils: ['swn/galaxie'] } });
    assert.equal(c.statusCode, 201, c.body);
    const valeur = c.json().valeur as string;
    const id = c.json().jeton.id as number;
    const get = (url: string) => app.inject({ method: 'GET', url: `/api/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${valeur}` } });
    const mcp = () => app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${valeur}`,
      'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    assert.equal((await get('')).statusCode, 200);
    assert.equal((await get('/outils/swn/galaxie/galaxies')).statusCode, 200);
    const d = await app.inject({ method: 'DELETE', url: `/api/compte/jetons/${id}`, headers: { cookie } });
    assert.ok(d.statusCode < 300, d.body);
    for (const r of [await get(''), await get('/outils/swn/galaxie/galaxies'), await mcp()]) {
      assert.equal(r.statusCode, 401);
      assert.equal(r.json().code, 'jeton_invalide');
    }
  } finally { await app.close(); }
});
