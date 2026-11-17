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
const { creerFiche } = await import('../../services/fiches.js');

type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Any = any;
const one = (app: Any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-ens-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'lea']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const antorId = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  const B = `/api/univers/${E}/outils/battlemap`;
  const R = `${B}/cartes`;
  const req = (method: M, who: string, url: string, payload?: Any) =>
    app.inject({ method, url, headers: { cookie: h[who]! }, payload });
  const asset = (nom: string) => String(one(app, 'SELECT id FROM bm_assets WHERE univers_id = ? AND nom = ?', E, nom).id);
  const creer = async (titre: string, largeur?: number, hauteur?: number) => {
    const r = await req('POST', 'antor', R, { titre, largeur, hauteur });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().id as number;
  };
  const lire = async (who: string, id: number) => (await req('GET', who, `${R}/${id}`));
  const ecrire = (id: number, version: number, commandes: Any[], who = 'antor') =>
    req('POST', who, `${R}/${id}/commandes`, { version, commandes });
  return { app, E, antorId, B, R, req, asset, creer, lire, ecrire };
}

const code = (r: Any) => r.json().code ?? r.json().detail;

// Complements of the ensemble tests, written from the need alone (B-101, B-102, AD-163): the editor's comforts through their door.
//
// TEST PLAN (expected values are written by hand from the need)
//   B-102 nominal  : duplicate two elements with an offset of (1, 0): the copies stand one cell to the right, originals stay
//   B-102 bords    : scale 0.25 and 4 accepted, 0.2 and 4.5 refused; rotation 270 accepted, 45 refused; refused batch writes nothing
//   B-102 calques  : rename, order, hide + lock; deleting a layer removes its elements, its inverse brings them back
//   B-102 gomme    : « Gomme » removes a floor cell and a wall segment, leaves the others
//   B-102 exclusion: making an existing layer GM-only hides its elements from Léa at once; the editor's eye (visible: false) does not
//   AD-163 bords   : 5 000 elements accepted, the 5 001st refused `carte_pleine`, nothing written
test('B-102 : dupliquer deux éléments avec un décalage de (1, 0) pose les copies une case à droite, les originaux restent', async () => {
  const w = await monde();
  const id = await w.creer('Duplication', 20, 20);
  const pose = [
    { type: 'poser_element', id: 'a', calque: 'objets', asset_id: w.asset('Coffre'), x: 2.5, y: 3.5 },
    { type: 'poser_element', id: 'b', calque: 'objets', asset_id: w.asset('Tonneau'), x: 6.5, y: 3.5 },
  ];
  assert.equal((await w.ecrire(id, 1, pose)).statusCode, 200);
  const r = await w.ecrire(id, 2, [{ type: 'dupliquer_elements', ids: ['a', 'b'], nouveaux_ids: ['a2', 'b2'], dx: 1, dy: 0 }]);
  assert.equal(r.statusCode, 200, r.body);
  const els = (await w.lire('antor', id)).json().document.elements;
  assert.equal(els.length, 4);
  const pos = (i: string) => { const e = els.find((x: Any) => x.id === i); return [e.x, e.y]; };
  assert.deepEqual(pos('a'), [2.5, 3.5]);
  assert.deepEqual(pos('b'), [6.5, 3.5]);
  assert.deepEqual(pos('a2'), [3.5, 3.5]);
  assert.deepEqual(pos('b2'), [7.5, 3.5]);
  assert.equal(els.find((x: Any) => x.id === 'b2').asset_id, w.asset('Tonneau'));
  // défaire : les inverses retirent les copies
  assert.equal((await w.ecrire(id, 3, r.json().inverses)).statusCode, 200);
  assert.deepEqual((await w.lire('antor', id)).json().document.elements.map((e: Any) => e.id).sort(), ['a', 'b']);
});

test('B-102 bords : échelle 0,25 et 4 acceptées, 0,2 et 4,5 refusées ; rotation 270 acceptée, 45 refusée ; un lot refusé n’écrit rien', async () => {
  const w = await monde();
  const id = await w.creer('Bornes', 20, 20);
  assert.equal((await w.ecrire(id, 1, [{ type: 'poser_element', id: 'e', calque: 'objets', asset_id: w.asset('Coffre'), x: 5.5, y: 5.5 }])).statusCode, 200);
  let v = 2;
  for (const echelle of [0.25, 4]) {
    const r = await w.ecrire(id, v, [{ type: 'mettre_a_echelle', id: 'e', echelle }]);
    assert.equal(r.statusCode, 200, `échelle ${echelle} : ${r.body}`);
    v++;
    assert.equal((await w.lire('antor', id)).json().document.elements[0].echelle, echelle);
  }
  for (const echelle of [0.2, 4.5]) {
    const r = await w.ecrire(id, v, [{ type: 'mettre_a_echelle', id: 'e', echelle }]);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `échelle ${echelle} : ${r.statusCode} ${r.body}`);
  }
  const ok = await w.ecrire(id, v, [{ type: 'pivoter_element', id: 'e', rotation: 270 }]);
  assert.equal(ok.statusCode, 200, ok.body);
  v++;
  const non = await w.ecrire(id, v, [{ type: 'pivoter_element', id: 'e', rotation: 45 }]);
  assert.ok(non.statusCode >= 400 && non.statusCode < 500, `rotation 45 : ${non.statusCode} ${non.body}`);
  const fin = (await w.lire('antor', id)).json();
  assert.equal(fin.version, v, 'les lots refusés n’ont rien écrit');
  assert.equal(fin.document.elements[0].echelle, 4);
  assert.equal(fin.document.elements[0].rotation, 270);
});

test('B-102 : renommer, ordonner, masquer et verrouiller un calque ; en supprimer un retire ses éléments, l’inverse les rend', async () => {
  const w = await monde();
  const id = await w.creer('Calques', 20, 20);
  const lot = [
    { type: 'creer_calque', id: 'salle', nom: 'Salle', genre: 'objet' },
    { type: 'poser_element', id: 's1', calque: 'salle', asset_id: w.asset('Coffre'), x: 1.5, y: 1.5 },
    { type: 'poser_element', id: 's2', calque: 'salle', asset_id: w.asset('Tonneau'), x: 2.5, y: 1.5 },
    { type: 'poser_element', id: 'o1', calque: 'objets', asset_id: w.asset('Tonneau'), x: 4.5, y: 1.5 },
    { type: 'renommer_calque', id: 'salle', nom: 'Cantine' },
    { type: 'regler_calque', id: 'salle', visible: false, verrouille: true },
    { type: 'ordonner_calque', id: 'salle', index: 0 },
  ];
  assert.equal((await w.ecrire(id, 1, lot)).statusCode, 200);
  const d = (await w.lire('antor', id)).json().document;
  assert.deepEqual(d.calques.map((c: Any) => c.id), ['salle', 'sol', 'murs', 'objets']);
  const c = d.calques[0];
  assert.equal(c.nom, 'Cantine');
  assert.equal(c.visible, false);
  assert.equal(c.verrouille, true);

  const sup = await w.ecrire(id, 2, [{ type: 'supprimer_calque', id: 'salle' }]);
  assert.equal(sup.statusCode, 200, sup.body);
  const apres = (await w.lire('antor', id)).json().document;
  assert.deepEqual(apres.calques.map((x: Any) => x.id), ['sol', 'murs', 'objets']);
  assert.deepEqual(apres.elements.map((e: Any) => e.id), ['o1'], 'les deux éléments du calque ont disparu avec lui');

  assert.equal((await w.ecrire(id, 3, sup.json().inverses)).statusCode, 200);
  const rendu = (await w.lire('antor', id)).json().document;
  assert.deepEqual(rendu.calques.map((x: Any) => x.id), ['salle', 'sol', 'murs', 'objets']);
  assert.deepEqual(rendu.elements.map((e: Any) => e.id).sort(), ['o1', 's1', 's2']);
  assert.equal(rendu.elements.find((e: Any) => e.id === 's2').calque, 'salle');
});

test('B-102 : la gomme retire une cellule de sol et un segment de mur, pas les autres', async () => {
  const w = await monde();
  const id = await w.creer('Gomme', 20, 20);
  const lot = [
    { type: 'peindre_sol', calque: 'sol', cellules: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], asset_id: w.asset('Dalles') },
    { type: 'tracer_mur', calque: 'murs', segments: [{ x: 0, y: 0, cote: 'h' }, { x: 1, y: 0, cote: 'h' }], asset_id: w.asset('Mur de pierre') },
  ];
  assert.equal((await w.ecrire(id, 1, lot)).statusCode, 200);
  const avant = (await w.lire('antor', id)).json().document;
  const nSol = JSON.stringify(avant.sols).split('"x":').length - 1;
  assert.equal(nSol, 3);
  assert.equal(avant.murs.length, 2);
  const r = await w.ecrire(id, 2, [
    { type: 'gommer', calque: 'sol', cellules: [{ x: 1, y: 0 }] },
    { type: 'gommer', calque: 'murs', segments: [{ x: 0, y: 0, cote: 'h' }] },
  ]);
  assert.equal(r.statusCode, 200, r.body);
  const fin = (await w.lire('antor', id)).json().document;
  assert.equal(JSON.stringify(fin.sols).split('"x":').length - 1, 2);
  assert.equal(fin.murs.length, 1);
  assert.equal(fin.murs[0].x, 1);
});

test('AD-156 exclusion : rendre un calque existant « MJ seul » cache ses éléments à Léa tout de suite ; l’œil de l’éditeur ne les cache pas', async () => {
  const w = await monde();
  const id = await w.creer('Bascule', 20, 20);
  assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true })).statusCode, 200);
  const lot = [
    { type: 'creer_calque', id: 'k', nom: 'Réserve', genre: 'objet' },
    { type: 'poser_element', id: 'caisse', calque: 'k', asset_id: w.asset('Coffre'), x: 3.5, y: 3.5 },
  ];
  assert.equal((await w.ecrire(id, 2, lot)).statusCode, 200);
  assert.deepEqual((await w.lire('lea', id)).json().document.elements.map((e: Any) => e.id), ['caisse']);

  assert.equal((await w.ecrire(id, 3, [{ type: 'regler_calque', id: 'k', visible: false }])).statusCode, 200);
  assert.deepEqual((await w.lire('lea', id)).json().document.elements.map((e: Any) => e.id), ['caisse'], 'l’œil est un réglage du MJ');

  assert.equal((await w.ecrire(id, 4, [{ type: 'regler_calque', id: 'k', mj_seul: true }])).statusCode, 200);
  const lea = await w.lire('lea', id);
  assert.equal(lea.json().document.elements.length, 0);
  assert.equal(lea.body.includes('caisse'), false);
  assert.equal(lea.body.includes('Réserve'), false);
  assert.equal((await w.lire('antor', id)).json().document.elements.length, 1);
});

test('AD-163 bords : 5 000 éléments acceptés, le 5 001e refusé « carte_pleine », rien écrit', async () => {
  const w = await monde();
  const id = await w.creer('Pleine', 200, 200);
  const a = w.asset('Tonneau');
  const lot = (de: number, n: number) => Array.from({ length: n }, (_, i) => ({ type: 'poser_element', id: `e${de + i}`, calque: 'objets', asset_id: a, x: (de + i) % 200 + 0.5, y: Math.floor((de + i) / 200) + 0.5 }));
  const plein = await w.ecrire(id, 1, lot(0, 5000));
  assert.equal(plein.statusCode, 200, plein.body.slice(0, 300));
  const trop = await w.ecrire(id, 2, lot(5000, 1));
  assert.equal(trop.statusCode, 409, trop.body.slice(0, 300));
  assert.equal(code(trop), 'carte_pleine');
  const fin = (await w.lire('antor', id)).json();
  assert.equal(fin.version, 2);
  assert.equal(fin.document.elements.length, 5000);
});
