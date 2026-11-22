import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-outils (amended 2026-11-21), clause « un jeton dont le créateur n'est plus MJ ne tient
// plus que ce que son compte peut : tools/list ne liste que swn_lire_systeme, une écriture répond « Introuvable. » ; le 401
// jeton_invalide reste celui d'un jeton inconnu, révoqué ou expiré ». Played in JSON-RPC against the stub server (KANEVAS_STUB=1).
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { cleDeUnivers } = await import('../services/cles.js');
const { changerRole } = await import('../services/membres.js');

const FS = JSON.parse(readFileSync(fileURLToPath(new URL('../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
const tire = { q: FS.systemes[0].entree.q as number, r: FS.systemes[0].entree.r as number };

const ECRITURES = [
  'swn_placer_astre', 'swn_deplacer_astre', 'swn_completer_astre', 'swn_tracer_formation', 'swn_ancrer_systeme',
  'swn_placer_element', 'swn_completer_element', 'swn_masquer_systeme', 'swn_retirer',
];

async function monter() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const g = (app.db.prepare('SELECT id FROM swn_galaxies WHERE univers_id = (SELECT id FROM univers WHERE nom = ?)').get("Éneria d'essai") as any).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=? WHERE id=?').run(FS.graine, g);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const cle = cleDeUnivers(app.db, E)!;
  const jeton = (compte: string) =>
    creerJeton(app.db, id(compte), { nom: 'Agent', dureeJours: 30, acces: { tous: true, niveauTous: 'ecriture' } } as never, app.horloge());
  const brut = (valeur: string, method: string, params: object = {}) => fetch(`${base}/mcp/${cle}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${valeur}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const noms = async (valeur: string) => {
    const r = await brut(valeur, 'tools/list');
    assert.equal(r.status, 200);
    const j = await r.json() as any;
    return (j.result.tools as { name: string }[]).map((t) => t.name).filter((n) => n.startsWith('swn_')).sort();
  };
  const compte = (t: string) => (app.db.prepare(`SELECT count(*) n FROM ${t}`).get() as any).n as number;
  return { app, E, id, jeton, brut, noms, compte };
}

test('créateur MJ : le jeton liste les dix outils swn_* ; rétrogradé joueur, il liste seulement swn_lire_systeme (200, pas de 401)', async () => {
  const m = await monter();
  try {
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'mj');
    const { valeur } = m.jeton('mira');
    assert.deepEqual(await m.noms(valeur), ['swn_lire_systeme', ...ECRITURES].sort());
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'joueur');
    assert.deepEqual(await m.noms(valeur), ['swn_lire_systeme']);
  } finally { await m.app.close(); }
});

test('créateur rétrogradé : chaque écriture swn répond « Introuvable. » et n’écrit rien ; la lecture continue', async () => {
  const m = await monter();
  try {
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'mj');
    const { valeur } = m.jeton('mira');
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'joueur');
    const avant = ['swn_systemes', 'swn_astres', 'swn_elements', 'swn_formations'].map((t) => m.compte(t));
    for (const name of ECRITURES) {
      const r = await m.brut(valeur, 'tools/call', { name, arguments: { q: 40, r: -7, genre: 'planete', orbite: 3, heure: 3 } });
      assert.equal(r.status, 200, name);
      const res = (await r.json() as any).result;
      assert.equal(res.isError, true, name);
      assert.equal(res.content[0].text, 'Introuvable.', name);
    }
    assert.deepEqual(['swn_systemes', 'swn_astres', 'swn_elements', 'swn_formations'].map((t) => m.compte(t)), avant);
    const lu = await m.brut(valeur, 'tools/call', { name: 'swn_lire_systeme', arguments: tire });
    assert.equal(lu.status, 200);
    const res = (await lu.json() as any).result;
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(JSON.parse(res.content[0].text).etat, 'tire');
  } finally { await m.app.close(); }
});

test('le 401 jeton_invalide reste celui d’un jeton inconnu, révoqué ou expiré, et d’aucun autre', async () => {
  const m = await monter();
  try {
    const code401 = async (valeur: string) => {
      const r = await m.brut(valeur, 'tools/list');
      assert.equal(r.status, 401);
      assert.equal((await r.json() as any).code, 'jeton_invalide');
    };
    await code401('kvs_inconnu0000000000000000000000000000');
    const rev = m.jeton('antor');
    revoquerJeton(m.app.db, { compteId: m.id('antor'), admin: false }, rev.jeton.id);
    await code401(rev.valeur);
    const exp = m.jeton('antor');
    m.app.db.prepare("UPDATE jetons_api SET cree_le = '2019-01-01T00:00:00.000Z', expire_le = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(exp.jeton.id);
    await code401(exp.valeur);
    // Exclusion : a demoted creator is not one of these cases.
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'mj');
    const { valeur } = m.jeton('mira');
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'joueur');
    assert.equal((await m.brut(valeur, 'tools/list')).status, 200);
  } finally { await m.app.close(); }
});
