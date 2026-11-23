// Review of the fix « the map read by a player follows the played table's filter » (B-107, AD-battlemap-table-9): the map read
// (GET …/cartes/:cid) of a GM in Player mode, of a map without a table, and what a player must still see.
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

type Any = any;
const one = (app: Any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;

async function monde() {
  const app: Any = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-carte-lue-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'lea']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x: Any) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  poserActivation(app.db, one(app, 'SELECT id FROM comptes WHERE username = ?', 'antor').id, { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: string, who: string, url: string, payload?: Any) => app.inject({ method, url, headers: { cookie: h[who]! }, payload } as Any);
  const asset = (nom: string) => String(one(app, 'SELECT id FROM bm_assets WHERE univers_id = ? AND nom = ?', E, nom).id);
  return { R, req, asset };
}

async function preparer(w: Awaited<ReturnType<typeof monde>>, jouee: boolean) {
  const { id } = (await w.req('POST', 'antor', w.R, { titre: jouee ? 'Jouee' : 'Pas jouee', largeur: 12, hauteur: 8 })).json();
  assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true })).statusCode, 200);
  const T = `${w.R}/${id}/table`;
  if (jouee) assert.equal((await w.req('POST', 'antor', T)).statusCode, 201);
  const lot = await w.req('POST', 'antor', `${w.R}/${id}/commandes`, { version: 2, commandes: [
    { type: 'creer_calque', id: 'masque', nom: 'SECRET-CALQUE', genre: 'objet' },
    { type: 'poser_element', id: 'e-sous-brouillard', calque: 'objets', asset_id: w.asset('Coffre'), x: 9.5, y: 6.5 },
    { type: 'poser_element', id: 'e-masque', calque: 'masque', asset_id: w.asset('Tonneau'), x: 2.5, y: 1.5 },
    { type: 'poser_element', id: 'e-vu', calque: 'objets', asset_id: w.asset('Tonneau'), x: 3.5, y: 1.5 },
  ] });
  assert.equal(lot.statusCode, 200, lot.body);
  if (jouee) {
    const v = (await w.req('GET', 'antor', T)).json().version as number;
    const r = await w.req('POST', 'antor', `${T}/commandes`, { version: v, commandes: [
      { type: 'reveler_rect', x: 0, y: 0, l: 5, h: 3 }, { type: 'regler_calque_joueurs', calque: 'masque', montre: false }] });
    assert.equal(r.statusCode, 200, r.body);
  }
  return id as number;
}

test('B-107 : le MJ en mode Joueur lit la carte jouée comme un joueur ; le MJ lit tout ; l’élément visible reste', async () => {
  const w = await monde();
  const id = await preparer(w, true);
  for (const [qui, suffixe] of [['lea', ''], ['antor', '?mode=joueur']] as const) {
    const lu = await w.req('GET', qui, `${w.R}/${id}${suffixe}`);
    assert.equal(lu.statusCode, 200, lu.body);
    for (const s of ['SECRET-CALQUE', 'e-masque', 'e-sous-brouillard']) assert.equal(lu.body.includes(s), false, `${qui}${suffixe} : « ${s} » dans la carte lue`);
    assert.equal(lu.body.includes('e-vu'), true, `${qui}${suffixe} : l’élément révélé doit rester`);
  }
  const mj = await w.req('GET', 'antor', `${w.R}/${id}`);
  for (const s of ['SECRET-CALQUE', 'e-masque', 'e-sous-brouillard', 'e-vu']) assert.equal(mj.body.includes(s), true, `le MJ doit lire « ${s} »`);
});

test('B-107 : une carte sans table lue par un joueur garde son filtre de document (pas de brouillard, rien de retiré à tort)', async () => {
  const w = await monde();
  const id = await preparer(w, false);
  const lu = await w.req('GET', 'lea', `${w.R}/${id}`);
  assert.equal(lu.statusCode, 200, lu.body);
  for (const s of ['e-vu', 'e-sous-brouillard', 'e-masque']) assert.equal(lu.body.includes(s), true, `« ${s} » doit rester sur une carte non jouée`);
});
