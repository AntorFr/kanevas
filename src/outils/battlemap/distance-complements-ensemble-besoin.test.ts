// Ensemble tests of kanevas-battlemap-distance, third file, written from the need alone (fiche « Livre » + exit criterion, B-108, P-29,
// E-29 player, E-20 « Jeu à distance », AD-156, AD-159, AD-160, AD-163): the effects through their door (the routes the screens
// call), real routes, database and core, stub login, on the seeded table « Cantine de la station »
// (Mira: Léa's, Vox: Roxane's, Garde: nobody's, under the fog). The screens are proved in src/e2e/.
//
// TEST PLAN (expected values written by hand from the need, E-29 player « A token that is not hers »)
//   échec     : the GM gives Mira to the second player meanwhile: Léa's drop is refused pion_non_proprietaire, Mira stays;
//               the new owner's drop passes (the screen holds no rule, the server decides)
//   échec     : the GM deletes Mira meanwhile: Léa's drop gets the same refusal, the same body, as for an unknown token
//   exclusion : the GM hides Mira meanwhile: Léa's drop is refused with the same body as for another's token
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');
const { ajouterMembre } = await import('../../services/membres.js');

type Any = any;
const one = (app: Any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;

async function monde() {
  const app: Any = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-dist-ens-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x: Any) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const antorId = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  poserActivation(app.db, antorId, { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
  ajouterMembre(app.db, antorId, E, 'teo', 'joueur'); // the second player watching (the stub has no login for Roxane)
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: string, who: string, url: string, payload?: Any) =>
    app.inject({ method, url, headers: { cookie: h[who]! }, payload });
  const id = one(app, "SELECT c.id FROM bm_cartes c WHERE c.univers_id = ? AND c.titre = 'Cantine de la station'", E)?.id as number;
  assert.ok(id, 'la carte « Cantine de la station » est semée');
  const T = `${R}/${id}/table`;
  const lire = async (who: string) => (await req('GET', who, T)).json();
  const version = async () => (await lire('antor')).version as number;
  const cmd = async (who: string, commandes: Any[], v?: number) =>
    req('POST', who, `${T}/commandes`, { version: v ?? await version(), commandes });
  const pos = async (p: string) => {
    const q = (await lire('antor')).etat.pions.find((x: Any) => x.id === p);
    return [q.x, q.y];
  };
  const posVue = async (who: string, p: string) => {
    const q = (await lire(who)).pions.find((x: Any) => x.id === p);
    return q ? [q.x, q.y] : null;
  };
  // E-20 : l'interrupteur « Jeu à distance » écrit les réglages communs du module au niveau de l'univers.
  const regler = async (valeur: boolean) => {
    const v = one(app, "SELECT version_reglages v FROM outils_univers WHERE univers_id = ? AND outil = 'battlemap/cartes'", E)?.v ?? 0;
    return req('PUT', 'antor', `/api/univers/${E}/outils/battlemap/cartes/reglages`, { version: v, valeurs: { jeu_a_distance: valeur } });
  };
  const deplacer = (p: string, x: number, y: number) => ({ type: 'deplacer_pion', id: p, x, y });
  return { app, E, R, id, T, req, lire, version, cmd, pos, posVue, regler, deplacer };
}

test('E-29 joueuse : le MJ donne Mira à Teo entre-temps : le dépôt de Léa est refusé, celui de Teo passe', async () => {
  const w = await monde();
  const teo = one(w.app, "SELECT id FROM comptes WHERE username = 'teo'").id;
  assert.equal((await w.req('PUT', 'antor', `${w.T}/pions/mira/proprietaire`, { compte_id: teo })).statusCode, 200);
  const r = await w.cmd('lea', [w.deplacer('mira', 6, 3)]);
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.json().code, 'pion_non_proprietaire');
  assert.deepEqual(await w.pos('mira'), [3, 3]);
  assert.equal((await w.cmd('teo', [w.deplacer('mira', 6, 3)])).statusCode, 200);
  assert.deepEqual(await w.pos('mira'), [6, 3]);
  await w.app.close();
});

test('E-29 joueuse : le MJ retire Mira entre-temps, ou la cache : le même refus, au même corps que pour le pion d’autrui', async () => {
  const w = await monde();
  const autrui = await w.cmd('lea', [w.deplacer('garde', 21, 6)]);
  assert.equal(autrui.statusCode, 403);
  assert.equal((await w.cmd('antor', [{ type: 'regler_pion', id: 'mira', visible: false }])).statusCode, 200);
  const cachee = await w.cmd('lea', [w.deplacer('mira', 6, 3)]);
  assert.equal(cachee.statusCode, 403);
  assert.equal(cachee.body, autrui.body);
  assert.equal((await w.cmd('antor', [{ type: 'retirer_pion', id: 'mira' }])).statusCode, 200);
  const retiree = await w.cmd('lea', [w.deplacer('mira', 6, 3)]);
  assert.equal(retiree.statusCode, 403);
  assert.equal(retiree.body, autrui.body);
  await w.app.close();
});
