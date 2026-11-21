// Doors of the lot « outils » for `src/e2e/outils-cadre-besoin.test.ts` (docs/tests-ecran/lot-outils.md): who cannot reach the tools API,
// in-process (`inject`, no browser). The rest of the frame (visibility, hidden tool = unknown address, 401) is `src/routes/outils.test.ts`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monter } from './monde-lot-ecrans.js';

test('a account with no attached universe and the instance admin get 404 on every tools route of the trial system, reads and write alike; no session gets 401', async () => {
  const m = await monter({ semis: true });
  const id = (t: string, nom: string) => (m.app.db.prepare(`SELECT id FROM ${t} WHERE nom = ?`).get(nom) as { id: number }).id;
  const SYS = id('systemes_jeu', "Système d'essai");
  const ENERIA = id('univers', "Éneria d'essai");
  for (const h of [m.teo, m.admin]) {
    for (const u of [`/api/systemes/${SYS}/outils`, `/api/systemes/${SYS}/responsable`, `/api/univers/${ENERIA}/outils`, `/api/univers/${ENERIA}/outils/entrees`]) {
      assert.equal((await m.dire(h, 'GET', u)).status, 404, u);
    }
    assert.equal((await m.dire(h, 'PUT', `/api/systemes/${SYS}/outils/essai/a/activation`, { active: false })).status, 404);
  }
  assert.equal((await m.dire(undefined, 'GET', `/api/univers/${ENERIA}/outils/entrees`)).status, 401);
  assert.equal((await m.dire(undefined, 'PUT', `/api/systemes/${SYS}/outils/essai/a/activation`, { active: false })).status, 401);
});

test('the universe forces « Désactivé » over a system that activates: the entry goes for that universe only, and « null » gives the system value back', async () => {
  const m = await monter({ semis: true });
  const id = (nom: string) => (m.app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const S = (m.app.db.prepare('SELECT id FROM systemes_jeu WHERE nom = ?').get("Système d'essai") as { id: number }).id;
  const [E, V] = [id("Éneria d'essai"), id('Univers voisin')];
  const cles = async (u: number, h = m.lea) => ((await m.dire(h, 'GET', `/api/univers/${u}/outils/entrees`)).corps as { cle: string }[]).map((x) => x.cle);
  assert.equal((await m.dire(m.antor, 'PUT', `/api/systemes/${S}/outils/essai/a/activation`, { active: true })).status, 204);
  assert.ok((await cles(E)).includes('essai/a'));
  assert.equal((await m.dire(m.antor, 'PUT', `/api/univers/${E}/outils/essai/a/activation`, { active: false })).status, 204);
  assert.ok(!(await cles(E)).includes('essai/a'));
  assert.ok((await cles(V, m.antor)).includes('essai/a'), 'the other universe is untouched');
  assert.equal((await m.dire(m.antor, 'PUT', `/api/univers/${E}/outils/essai/a/activation`, { active: null })).status, 204);
  assert.ok((await cles(E)).includes('essai/a'));
});

test('AD-135: deleting the universe « Éneria d’essai » leaves no swn_* row for it, a wrong name erases nothing, « Univers voisin » and the system catalogue stay', async () => {
  const m = await monter({ semis: true });
  const db = m.app.db;
  const id = (nom: string) => (db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const [E, V] = [id("Éneria d'essai"), id('Univers voisin')];
  const tables = (motif: string) => (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ? ESCAPE '\\' ORDER BY name`).all(motif) as { name: string }[]).map((t) => t.name);
  const toutes = () => tables('swn\\_%').map((t) => `${t}=${JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())}`).join('\n');
  const delUnivers = (u: number) =>
    tables('swn\\_%').filter((t) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === 'univers_id'))
      .reduce((n, t) => n + (db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE univers_id = ?`).get(u) as { n: number }).n, 0);
  assert.ok(delUnivers(E) > 0);
  const avant = toutes();
  assert.equal((await m.dire(m.antor, 'DELETE', `/api/univers/${E}`, { nom: 'Autre' })).status, 400);
  assert.equal(toutes(), avant);
  assert.equal((await m.dire(m.antor, 'DELETE', `/api/univers/${E}`, { nom: "Éneria d'essai" })).status, 204);
  assert.equal(delUnivers(E), 0);
  const titres = db.prepare('SELECT f.titre t FROM swn_conceptions c JOIN fiches f ON f.id = c.fiche_id WHERE c.univers_id = ? ORDER BY f.titre').all(V) as { t: string }[];
  assert.deepEqual(titres.map((r) => r.t), ['Sentinelle du voisin']);
  let n = 0;
  for (const t of tables('swn\\_catalogue\\_%').filter((x) => x !== 'swn_catalogue_retraits')) n += (db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE systeme_id = 3 AND univers_id IS NULL`).get() as { n: number }).n;
  assert.equal(n, 18, "the system's catalogue outlives the universe");
});
