import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-spatiale-outils (amended 2026-11-12), the clause « un jeton dont le créateur n'est plus MJ
// reçoit `jeton_invalide` », played against the stub MCP server (KANEVAS_STUB=1) from the need, not from the behaviour.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { cleDeUnivers } = await import('../services/cles.js');
const { changerRole } = await import('../services/membres.js');

async function monter() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const cle = cleDeUnivers(app.db, E)!;
  const brut = (valeur: string, method: string, params: object = {}) => fetch(`${base}/mcp/${cle}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${valeur}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return { app, E, id, brut };
}

test('un jeton dont le créateur MJ est devenu joueur reçoit 401 jeton_invalide, listage comme écriture', async () => {
  const m = await monter();
  try {
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'mj');
    const { valeur } = creerJeton(m.app.db, m.id('mira'), { nom: 'Agent', dureeJours: 30, acces: { tous: true, niveauTous: 'ecriture' } } as never, m.app.horloge());
    assert.equal((await m.brut(valeur, 'tools/list')).status, 200, 'tant que le créateur est MJ, le jeton passe');

    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'joueur');
    const liste = await m.brut(valeur, 'tools/list');
    assert.equal(liste.status, 401);
    assert.equal((await liste.json() as any).code, 'jeton_invalide');
    const ecrit = await m.brut(valeur, 'tools/call', { name: 'swn_placer_astre', arguments: { q: 40, r: -7, genre: 'planete', orbite: 3, heure: 3 } });
    assert.equal(ecrit.status, 401);
    assert.equal((await ecrit.json() as any).code, 'jeton_invalide');
  } finally { await m.app.close(); }
});
