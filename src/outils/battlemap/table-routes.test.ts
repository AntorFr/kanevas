// Review tests of kanevas-battlemap-table-service (B-104, AD-162, AD-battlemap-table-5, 8, 9): the routes of the game table and the
// stub table of « Cantine de la station », read as the browser would receive them (bytes included).
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

type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type App = Awaited<ReturnType<typeof buildApp>>;
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-table-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'mira', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const antorId = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  poserActivation(app.db, antorId, { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: M, who: string | null, url: string, payload?: any) =>
    app.inject({ method, url, headers: who ? { cookie: h[who] } : {}, payload });
  const cantine = one(app, "SELECT id FROM bm_cartes WHERE titre = 'Cantine de la station'").id as number;
  const compte = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  return { app, E, R, req, cantine, compte };
}
const code = (r: any) => r.json().code ?? r.json().detail;
const pion = (id: string, x: number, y: number, extra: any = {}) => ({ type: 'ajouter_pion', id, nom: id.toUpperCase(), x, y, ...extra });

async function nouvelle(w: Awaited<ReturnType<typeof monde>>, visible = true) {
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Soute', largeur: 12, hauteur: 8 })).json();
  if (visible) assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true })).statusCode, 200);
  return { id, T: `${w.R}/${id}/table` };
}

test('le MJ crée la table (201 puis 200), la relit, applique un lot (version 2) ; la version d’avant est 409 version', async () => {
  const w = await monde();
  const { T } = await nouvelle(w);
  assert.deepEqual((await w.req('GET', 'antor', T)).json(), { commencee: false, peutEcrire: true });
  const c = await w.req('POST', 'antor', T);
  assert.equal(c.statusCode, 201, c.body);
  assert.equal(c.json().version, 1);
  assert.equal((await w.req('POST', 'antor', T)).statusCode, 200);
  const ok = await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [pion('a', 1, 1)] });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().version, 2);
  const rejeu = await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [pion('b', 2, 2)] });
  assert.equal(rejeu.statusCode, 409);
  assert.equal(code(rejeu), 'version');
  const lu = (await w.req('GET', 'antor', T)).json();
  assert.deepEqual([lu.version, lu.etat.pions.length, lu.peutEcrire], [2, 1, true]);
});

test('limite_depassee est 422 sur /table/commandes (pion hors carte) ; table_pleine est 409 ; version absente 400', async () => {
  const w = await monde();
  const { T } = await nouvelle(w);
  await w.req('POST', 'antor', T);
  const r = await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [pion('a', 50, 50)] });
  assert.equal(r.statusCode, 422, r.body);
  assert.equal(r.json().code, 'limite_depassee');
  assert.equal((await w.req('GET', 'antor', T)).json().version, 1);
  assert.equal((await w.req('POST', 'antor', `${T}/commandes`, { commandes: [pion('a', 1, 1)] })).statusCode, 400);
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Grande', largeur: 30, hauteur: 20 })).json();
  const G = `${w.R}/${id}/table`;
  await w.req('POST', 'antor', G);
  const lot = (de: number, n: number) => Array.from({ length: n }, (_, i) => pion(`p${de + i}`, (de + i) % 30, Math.floor((de + i) / 30)));
  assert.equal((await w.req('POST', 'antor', `${G}/commandes`, { version: 1, commandes: lot(0, 200) })).statusCode, 200);
  const pleine = await w.req('POST', 'antor', `${G}/commandes`, { version: 2, commandes: lot(200, 1) });
  assert.equal(pleine.statusCode, 409);
  assert.equal(code(pleine), 'table_pleine');
});

test('un joueur : vue filtrée sans propriétaires ni peutEcrire, {commencee:false} sans table, commande et création refusées', async () => {
  const w = await monde();
  const { T } = await nouvelle(w);
  const vide = await w.req('GET', 'lea', T);
  assert.equal(vide.statusCode, 200);
  assert.deepEqual(vide.json(), { commencee: false });
  assert.equal((await w.req('POST', 'lea', T)).statusCode, 403);
  await w.req('POST', 'antor', T);
  await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [pion('a', 1, 1), { type: 'reveler_rect', x: 0, y: 0, l: 3, h: 3 }] });
  const p = await w.req('PUT', 'antor', `${T}/pions/a/proprietaire`, { compte_id: w.compte('lea') });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(p.json().version, 3);
  const v = await w.req('GET', 'lea', T);
  const j = v.json();
  assert.equal(j.commencee, true);
  assert.deepEqual(j.pions.map((x: any) => x.id), ['a']);
  for (const k of ['peutEcrire', 'proprietaires', 'etat']) assert.equal(k in j, false, k);
  assert.equal(v.body.includes('propri'), false);
  const refus = await w.req('POST', 'lea', `${T}/commandes`, { version: 3, commandes: [pion('z', 2, 2)] });
  assert.equal(refus.statusCode, 403, refus.body);
  assert.equal((await w.req('PUT', 'lea', `${T}/pions/a/proprietaire`, { compte_id: null })).statusCode, 403);
  assert.equal((await w.req('GET', 'antor', T)).json().etat.pions.length, 1);
});

test('carte cachée : 404 pour un joueur, un non-membre, un visiteur sans session ; même corps qu’une carte inconnue', async () => {
  const w = await monde();
  const { id, T } = await nouvelle(w, false);
  await w.req('POST', 'antor', T);
  const inconnue = await w.req('GET', 'lea', `${w.R}/99999/table`);
  assert.equal(inconnue.statusCode, 404);
  const r = await w.req('GET', 'lea', T);
  assert.equal(r.statusCode, 404);
  assert.equal(r.body, inconnue.body);
  assert.equal((await w.req('POST', 'lea', `${T}/commandes`, { version: 1, commandes: [pion('x', 1, 1)] })).statusCode, 404);
  assert.equal((await w.req('PUT', 'lea', `${T}/pions/a/proprietaire`, { compte_id: null })).statusCode, 404);
  assert.equal((await w.req('GET', null, T)).statusCode >= 400, true);
  assert.equal((await w.req('GET', 'antor', T)).statusCode, 200);
  assert.ok(id);
});

test('propriétaire : un non-membre est 400, un membre passe, null efface ; pion inconnu 404', async () => {
  const w = await monde();
  const { T } = await nouvelle(w);
  await w.req('POST', 'antor', T);
  await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [pion('a', 1, 1)] });
  const nonMembre = one(w.app, "INSERT INTO comptes (username, cree_le) VALUES ('etranger', 'x') RETURNING id").id;
  const bad = await w.req('PUT', 'antor', `${T}/pions/a/proprietaire`, { compte_id: nonMembre });
  assert.equal(bad.statusCode, 400, bad.body);
  assert.equal((await w.req('PUT', 'antor', `${T}/pions/a/proprietaire`, { compte_id: 'lea' })).statusCode, 400);
  assert.equal((await w.req('PUT', 'antor', `${T}/pions/a/proprietaire`, {})).statusCode, 400);
  assert.equal((await w.req('PUT', 'antor', `${T}/pions/zz/proprietaire`, { compte_id: null })).statusCode, 404);
  assert.equal((await w.req('PUT', 'antor', `${T}/pions/a/proprietaire`, { compte_id: w.compte('lea') })).statusCode, 200);
  assert.equal((await w.req('GET', 'antor', T)).json().proprietaires.a, w.compte('lea'));
  assert.equal((await w.req('PUT', 'antor', `${T}/pions/a/proprietaire`, { compte_id: null })).statusCode, 200);
  assert.deepEqual((await w.req('GET', 'antor', T)).json().proprietaires, {});
});

test('rogner une carte jouée par PATCH : 400 limite_depassee/taille si un pion sortirait, sinon le brouillard suit', async () => {
  const w = await monde();
  const { id, T } = await nouvelle(w);
  await w.req('POST', 'antor', T);
  await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [pion('loin', 10, 6)] });
  const r = await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, largeur: 8 });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(code(r), 'limite_depassee');
  assert.equal(r.json().champ, 'taille');
  assert.equal((await w.req('GET', 'antor', T)).json().version, 2);
  await w.req('POST', 'antor', `${T}/commandes`, { version: 2, commandes: [{ type: 'deplacer_pion', id: 'loin', x: 1, y: 1 }] });
  const ok = await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, largeur: 8 });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(Buffer.from((await w.req('GET', 'antor', T)).json().etat.brouillard, 'base64').length, Math.ceil(8 * 8 / 8));
});

test('supprimer la carte supprime sa table et ses propriétaires', async () => {
  const w = await monde();
  const { id, T } = await nouvelle(w);
  await w.req('POST', 'antor', T);
  await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [pion('a', 1, 1)] });
  await w.req('PUT', 'antor', `${T}/pions/a/proprietaire`, { compte_id: w.compte('lea') });
  const avant = one(w.app, 'SELECT COUNT(*) n FROM bm_pions_proprietaires').n;
  const d = await w.req('DELETE', 'antor', `${w.R}/${id}`);
  assert.equal(d.statusCode, 204, d.body);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_tables WHERE carte_id = ?', id).n, 0);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_pions_proprietaires').n, avant - 1);
});

test('semis : la Cantine a une table à trois pions, dont deux avec propriétaire (lea, roxane) ; Garde sous le brouillard', async () => {
  const w = await monde();
  const t = (await w.req('GET', 'antor', `${w.R}/${w.cantine}/table`)).json();
  assert.equal(t.commencee, true);
  assert.equal(t.etat.pions.length, 3);
  assert.deepEqual(Object.keys(t.proprietaires).sort(), ['mira', 'vox']);
  assert.equal(t.proprietaires.mira, w.compte('lea'));
  assert.equal(t.proprietaires.vox, w.compte('roxane'));
  assert.equal(t.etat.pions.find((p: any) => p.id === 'garde').nom, 'Garde');
  // vue d'une joueuse : Garde, sous le brouillard, n'est pas rendue
  const j = await w.req('GET', 'lea', `${w.R}/${w.cantine}/table`);
  assert.equal(j.statusCode, 200);
  assert.equal(j.body.includes('Garde'), false);
  assert.deepEqual(j.json().pions.map((p: any) => p.id).sort(), ['mira', 'vox']);
});
