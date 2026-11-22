// Ensemble tests of kanevas-battlemap-distance, second file, written from the need alone (B-108, E-29 player, AD-159, AD-160,
// AD-163): what the player's read says about her (mesPions, deplacement), what a refusal does not say, a mixed batch, the fog
// that does not limit a destination, the GM in Player mode. Real routes, database and core, stub login, table « Cantine de la
// station » (Mira: Léa's, Vox: Roxane's, Garde: nobody's, under the fog).
//
// TEST PLAN (expected values written by hand from the need)
//   nominal   : Léa reads mesPions = ['mira'], deplacement true; the second player (no token) reads mesPions = [], deplacement false
//   bords     : Mira hidden by the GM: not in Léa's mesPions, deplacement false, her drop refused like an unknown token
//               Mira dropped under the fog: accepted, Antor reads her there, Léa no longer sees her nor lists her in mesPions
//   échec     : a batch mixing a move and a reveal by Léa: refused entirely, nothing written
//   exclusions: Léa's read never names Roxane's token as hers and never carries the owner of another token
//               the GM in Player mode: mesPions [], deplacement false, his command is refused with mode_joueur, nothing written
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


const proprietaireDe = (w: Any, p: string) => one(w.app,
  'SELECT c.username u FROM bm_pions_proprietaires o JOIN comptes c ON c.id = o.compte_id JOIN bm_cartes k ON k.id = o.carte_id WHERE o.pion_id = ? AND k.id = ?', p, w.id)?.u as string | undefined;

test('B-108 nominal : Léa lit mesPions = [mira] et deplacement vrai ; la joueuse sans pion lit mesPions = [] et deplacement faux', async () => {
  const w = await monde();
  const lea = await w.lire('lea');
  assert.deepEqual(lea.mesPions, ['mira']);
  assert.equal(lea.deplacement, true);
  const teo = await w.lire('teo');
  assert.deepEqual(teo.mesPions, []);
  assert.equal(teo.deplacement, false);
  await w.app.close();
});

test('B-108 exclusion : la lecture de Léa ne porte le propriétaire d’aucun autre pion', async () => {
  const w = await monde();
  const u = proprietaireDe(w, 'vox');
  assert.ok(u, 'Vox a un propriétaire dans la graine');
  const brut = (await w.req('GET', 'lea', w.T)).body;
  assert.ok(!brut.includes(`"${u}"`), `le nom du propriétaire de Vox (${u}) ne doit pas paraître`);
  assert.ok(!(await w.lire('lea')).mesPions.includes('vox'));
  await w.app.close();
});

test('B-108 bords : Mira cachée par le MJ : hors de mesPions, deplacement faux, son dépôt refusé comme un pion inconnu', async () => {
  const w = await monde();
  assert.equal((await w.cmd('antor', [{ type: 'regler_pion', id: 'mira', visible: false }])).statusCode, 200);
  const lea = await w.lire('lea');
  assert.deepEqual(lea.mesPions, []);
  assert.equal(lea.deplacement, false);
  const a = await w.cmd('lea', [w.deplacer('mira', 5, 4)]);
  const b = await w.cmd('lea', [w.deplacer('fantome', 5, 4)]);
  assert.equal(a.statusCode, 403, a.body);
  assert.equal(a.body, b.body);
  assert.deepEqual(await w.pos('mira'), [3, 3]);
  await w.app.close();
});

test('B-108 bords : Mira déposée sous le brouillard : acceptée, le MJ la lit là, Léa ne la voit plus ni ne la liste', async () => {
  const w = await monde();
  const r = await w.cmd('lea', [w.deplacer('mira', 15, 15)]);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(await w.pos('mira'), [15, 15]);
  assert.equal(await w.posVue('lea', 'mira'), null);
  assert.deepEqual((await w.lire('lea')).mesPions, []);
  await w.app.close();
});

test('B-108 échec : un lot de Léa mêlant un déplacement et une révélation est refusé entier, rien d’écrit', async () => {
  const w = await monde();
  const v = await w.version();
  const r = await w.cmd('lea', [w.deplacer('mira', 5, 4), { type: 'reveler_rect', x: 14, y: 15, l: 4, h: 1 }], v);
  assert.equal(r.statusCode, 403, r.body);
  assert.deepEqual(await w.pos('mira'), [3, 3]);
  assert.equal(await w.version(), v);
  await w.app.close();
});

test('B-108 exclusion : le MJ en mode joueur reste lecteur : mesPions vide, deplacement faux, sa commande refusée mode_joueur', async () => {
  const w = await monde();
  const lu = (await w.req('GET', 'antor', `${w.T}?mode=joueur`)).json();
  assert.deepEqual(lu.mesPions, []);
  assert.equal(lu.deplacement, false);
  const v = await w.version();
  const r = await w.req('POST', 'antor', `${w.T}/commandes?mode=joueur`, { version: v, commandes: [w.deplacer('mira', 5, 4)] });
  assert.equal(r.statusCode, 403, r.body);
  assert.ok(r.body.includes('mode_joueur'), r.body);
  assert.deepEqual(await w.pos('mira'), [3, 3]);
  await w.app.close();
});
