// Ensemble test of kanevas-battlemap-table, B-109 and P-28 step 4 (« next Saturday he reopens the map: tokens and fog are as he
// left them »), written from the need alone. Its own file: the database must be a file shared by two starts of the application,
// and the path is read once per process. Real routes, database and core, stub login.
//
// TEST PLAN
//   B-109 nominal : tokens (a sheet, a disc), fog, shared view, hidden layer and an owner are exactly as left after the application
//                   is closed and started again on the same database file; « reinitialiser » then empties tokens, fog, view,
//                   hidden layers and owners (and the owner rows), the table itself stays
//   B-109 échec   : a write on the version of before the reopening is a 409 `version` and writes nothing
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'bm-table-reprise-')), 'kanevas.db');
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');
const { creerFiche } = await import('../../services/fiches.js');

type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Any = any;
const one = (app: Any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;
const code = (r: Any) => r.json().code ?? r.json().detail;
async function ouvrirMonde(semer: boolean) {
  const app: Any = await buildApp();
  if (semer) {
    assert.equal(semerBouchon(app.db), true);
    await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-table-ens-img-')));
  }
  const h: Record<string, string> = {};
  for (const c of ['antor', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x: Any) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const compte = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  if (semer) poserActivation(app.db, compte('antor'), { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: M, who: string | null, url: string, payload?: Any) =>
    app.inject({ method, url, headers: who ? { cookie: h[who]! } : {}, payload });
  const asset = (nom: string) => String(one(app, 'SELECT id FROM bm_assets WHERE univers_id = ? AND nom = ?', E, nom).id);
  const fiche = (titre: string, joueursLisent: boolean) =>
    String(creerFiche(app.db, compte('antor'), E, { type: 'objet', titre, charge: {}, sections: [{ titre: 'S', joueursLisent }] }).id);
  return { app, E, R, h, req, compte, asset, fiche };
}

const disque = (id: string, x: number, y: number, extra: Any = {}) => ({ type: 'ajouter_pion', id, nom: id.toUpperCase(), x, y, ...extra });
function revelees(b64: string, largeur: number, hauteur: number): string[] {
  const o = Buffer.from(b64, 'base64');
  const r: string[] = [];
  for (let i = 0; i < largeur * hauteur; i++) if ((o[i >> 3]! >> (i & 7)) & 1) r.push(`${i % largeur},${Math.floor(i / largeur)}`);
  return r;
}
const cellules = (x0: number, y0: number, l: number, h: number) => {
  const r: string[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + l; x++) r.push(`${x},${y}`);
  return r;
};

test('B-109 : l’état de la table survit à la fermeture de l’application ; « Réinitialiser » vide pions, brouillard, vue, calques masqués et propriétaires', async () => {
  const w = await ouvrirMonde(true);
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Soute', largeur: 12, hauteur: 8 })).json();
  assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true })).statusCode, 200);
  const c = { id: id as number, T: `${w.R}/${id}/table` };
  assert.equal((await w.req('POST', 'antor', c.T)).statusCode, 201);
  const cmd = async (commandes: Any[]) => w.req('POST', 'antor', `${c.T}/commandes`, { version: (await w.req('GET', 'antor', c.T)).json().version, commandes });
  const mira = w.fiche('Mira', true);
  const lot = [
    disque('mira', 1, 1, { nom: 'Mira', fiche_id: mira }), disque('garde', 6, 4),
    { type: 'reveler_rect', x: 0, y: 0, l: 3, h: 3 },
    { type: 'partager_vue', vue: { x: 0, y: 0, l: 6, h: 4 } },
    { type: 'regler_calque_joueurs', calque: 'objets', montre: false },
  ];
  assert.equal((await cmd(lot)).statusCode, 200);
  assert.equal((await w.req('PUT', 'antor', `${c.T}/pions/mira/proprietaire`, { compte_id: w.compte('lea') })).statusCode, 200);
  const avant = (await w.req('GET', 'antor', c.T)).json();
  await w.app.close(); // le MJ ferme
  const w2 = await ouvrirMonde(false); // il rouvre plus tard : même base
  const T = c.T;
  const apres = (await w2.req('GET', 'antor', T)).json();
  assert.deepEqual(apres, avant, 'tokens, brouillard, vue, calques masqués, propriétaires : tels qu’il les a laissés');
  assert.deepEqual(apres.etat.pions.map((p: Any) => p.id), ['mira', 'garde']);
  assert.deepEqual(revelees(apres.etat.brouillard, 12, 8).sort(), cellules(0, 0, 3, 3).sort());
  assert.deepEqual(apres.etat.vue, { x: 0, y: 0, l: 6, h: 4 });
  assert.deepEqual(apres.etat.calques_masques, ['objets']);
  assert.deepEqual(apres.proprietaires, { mira: w2.compte('lea') });
  // une version d’avant est refusée et n’écrit rien
  const perime = await w2.req('POST', 'antor', `${T}/commandes`, { version: apres.version - 1, commandes: [disque('zz', 8, 6)] });
  assert.equal(perime.statusCode, 409, perime.body);
  assert.equal(code(perime), 'version');
  assert.equal((await w2.req('GET', 'antor', T)).json().etat.pions.length, 2);
  // réinitialiser
  const rz = await w2.req('POST', 'antor', `${T}/commandes`, { version: apres.version, commandes: [{ type: 'reinitialiser' }] });
  assert.equal(rz.statusCode, 200, rz.body);
  const vide = (await w2.req('GET', 'antor', T)).json();
  assert.deepEqual(vide.etat.pions, []);
  assert.deepEqual(revelees(vide.etat.brouillard, 12, 8), []);
  assert.equal(vide.etat.vue, null);
  assert.deepEqual(vide.etat.calques_masques, []);
  assert.deepEqual(vide.proprietaires, {});
  assert.equal(one(w2.app, 'SELECT COUNT(*) n FROM bm_pions_proprietaires WHERE carte_id = ?', c.id).n, 0);
  assert.equal(vide.commencee, true, 'la table existe toujours, vide');
  await w2.app.close();
});

