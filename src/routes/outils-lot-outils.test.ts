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
