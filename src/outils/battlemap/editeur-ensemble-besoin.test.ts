// Ensemble tests of kanevas-battlemap-editeur, written from the need alone (fiche « Livre » + exit criterion,
// B-101, B-102, B-104, P-27 steps 1, 2 and 4, E-28, E-10, E-20, AD-154, AD-156, AD-163): the effects through their door
// (the routes the screen calls), real routes, database and core, stub login.
//
// TEST PLAN (expected values are written by hand from the need, never read back from the code)
//   B-101 nominal   : 30 × 20 map, three layers « Sol » « Murs » « Objets »; floor, two rooms and a door, two assets on
//                     « Objets », a trap room on a « MJ seul » layer; undo one wall by the returned inverse; link a sheet;
//                     re-read: everything is there
//   B-101 bords     : 200 × 200 accepted, 201 refused; 20 layers accepted, the 21st refused; resize: an element at x = 15.5
//                     stays in at width 16, is out at width 15 (refused, nothing changed)
//   B-101 échec     : the version of before is a conflict and writes nothing; an unknown asset refuses the whole batch
//   B-104 nominal   : the map is listed for E-10 with its size; a hidden map is not readable by a player; delete removes it
//   AD-156 exclusion: a player never reads the « MJ seul » layer, its elements, nor a sheet id he cannot read
//   B-110           : « Utilisé sur N cartes » counts a map once, however many elements; removing the asset keeps the elements
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

test('B-101 : Antor compose une carte 30 × 20 (sol, deux salles, porte, objets, salle piège), défait un mur, lie une fiche, la relit entière', async () => {
  const w = await monde();
  const id = await w.creer('Station Orak', 30, 20);
  const v1 = (await w.lire('antor', id)).json();
  assert.equal(v1.largeur, 30);
  assert.equal(v1.hauteur, 20);
  assert.deepEqual(v1.document.calques.map((c: Any) => c.nom), ['Sol', 'Murs', 'Objets']);
  assert.deepEqual(v1.document.calques.map((c: Any) => c.type), ['sol', 'mur', 'objet']);
  assert.equal(v1.document.elements.length, 0);

  const terminal = creerFiche(w.app.db, w.antorId, w.E, { type: 'objet', titre: 'Terminal', charge: {}, sections: [{ titre: 'Usage', joueursLisent: true }] }).id;
  const salle1 = [0, 1, 2, 3].map((i) => ({ x: i, y: 0, cote: 'h' }));
  const salle2 = [10, 11, 12].map((i) => ({ x: i, y: 5, cote: 'h' }));
  const lot1 = [
    { type: 'peindre_sol', calque: 'sol', cellules: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], asset_id: w.asset('Dalles') },
    { type: 'tracer_mur', calque: 'murs', segments: salle1, asset_id: w.asset('Mur de pierre') },
    { type: 'tracer_mur', calque: 'murs', segments: salle2, asset_id: w.asset('Mur de pierre') },
    { type: 'poser_porte', calque: 'murs', x: 1, y: 0, cote: 'h', porte: true },
    { type: 'poser_element', id: 'c1', calque: 'objets', asset_id: w.asset('Coffre'), x: 1.5, y: 1.5 },
    { type: 'poser_element', id: 'c2', calque: 'objets', asset_id: w.asset('Tonneau'), x: 2.5, y: 1.5 },
    { type: 'creer_calque', id: 'mj', nom: 'MJ seul', genre: 'objet', mj_seul: true },
    { type: 'poser_element', id: 'piege', calque: 'mj', asset_id: w.asset('Coffre piégé'), x: 11.5, y: 4.5 },
    { type: 'lier_fiche', id: 'c1', fiche_id: String(terminal) },
  ];
  const r1 = await w.ecrire(id, 1, lot1);
  assert.equal(r1.statusCode, 200, r1.body);
  assert.equal(r1.json().version, 2);
  assert.equal(r1.json().inverses.length, 9, 'une inverse par commande');

  // défaire un mur : un lot qui trace un mur de plus, puis on envoie ses inverses
  const faux = await w.ecrire(id, 2, [{ type: 'tracer_mur', calque: 'murs', segments: [{ x: 20, y: 15, cote: 'v' }], asset_id: w.asset('Mur de pierre') }]);
  assert.equal(faux.statusCode, 200, faux.body);
  const avant = JSON.stringify((await w.lire('antor', id)).json().document.murs);
  assert.ok(avant.includes('"x":20'));
  const undo = await w.ecrire(id, 3, faux.json().inverses);
  assert.equal(undo.statusCode, 200, undo.body);

  const fin = (await w.lire('antor', id)).json();
  assert.equal(fin.version, 4);
  const d = fin.document;
  assert.equal(d.sols.length >= 1, true, 'un sol');
  const brut = JSON.stringify(d.murs);
  assert.equal(brut.includes('"x":20'), false, 'le mur défait a disparu');
  assert.equal((brut.match(/"porte":true/g) ?? []).length, 1, 'une porte');
  assert.equal(d.murs.length >= 1, true);
  assert.equal(d.elements.length, 3, 'deux assets sur Objets + un sur MJ seul');
  assert.equal(d.elements.find((e: Any) => e.id === 'c1').fiche_id, String(terminal));
  assert.equal(d.elements.find((e: Any) => e.id === 'piege').calque, 'mj');
  const mj = d.calques.find((c: Any) => c.id === 'mj');
  assert.equal(mj.mj_seul, true);
  assert.equal(mj.nom, 'MJ seul');
  assert.equal(JSON.stringify(d).split('"type":"objet"').length - 1, 2, 'deux calques Objet : Objets et MJ seul');
});

test('B-101 bords : 200 × 200 accepté, 201 refusé, rien créé ; 20 calques acceptés, le 21e refusé', async () => {
  const w = await monde();
  const max = await w.req('POST', 'antor', w.R, { titre: 'Maxi', largeur: 200, hauteur: 200 });
  assert.equal(max.statusCode, 201, max.body);
  for (const [l, h] of [[201, 10], [10, 201], [0, 10]]) {
    const r = await w.req('POST', 'antor', w.R, { titre: 'Hors', largeur: l, hauteur: h });
    assert.equal(r.statusCode, 400, `${l}×${h} : ${r.body}`);
  }
  assert.equal(one(w.app, "SELECT COUNT(*) n FROM bm_cartes WHERE titre = 'Hors'").n, 0);

  const id = await w.creer('Calques');
  const calques = (n: number, de: number) => Array.from({ length: n }, (_, i) => ({ type: 'creer_calque', id: `k${de + i}`, nom: `K${de + i}`, genre: 'objet' }));
  const vingt = await w.ecrire(id, 1, calques(17, 0));
  assert.equal(vingt.statusCode, 200, vingt.body);
  assert.equal((await w.lire('antor', id)).json().document.calques.length, 20);
  const vingtEtUn = await w.ecrire(id, 2, calques(1, 99));
  assert.ok(vingtEtUn.statusCode >= 400 && vingtEtUn.statusCode < 500, vingtEtUn.body);
  const apres = (await w.lire('antor', id)).json();
  assert.equal(apres.document.calques.length, 20);
  assert.equal(apres.version, 2, 'le lot refusé n’écrit rien');
});

test('B-101 bords : redimensionner — un élément en x = 15.5 tient à 16 de large, pas à 15 ; refus : champ taille, rien de changé', async () => {
  const w = await monde();
  const id = await w.creer('Redim', 20, 20);
  assert.equal((await w.ecrire(id, 1, [{ type: 'poser_element', id: 'e', calque: 'objets', asset_id: w.asset('Tonneau'), x: 15.5, y: 3.5 }])).statusCode, 200);
  const non = await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, largeur: 15 });
  assert.equal(non.statusCode, 400, non.body);
  assert.equal(code(non), 'limite_depassee');
  assert.equal(non.json().champ, 'taille');
  const intact = (await w.lire('antor', id)).json();
  assert.equal(intact.largeur, 20);
  assert.equal(intact.version, 2);
  const oui = await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, largeur: 16 });
  assert.equal(oui.statusCode, 200, oui.body);
  assert.equal((await w.lire('antor', id)).json().largeur, 16);
});

test('B-101 échec : deux écritures sur la même version, la seconde est un conflit « version » et n’écrit rien ; un asset inconnu refuse tout le lot', async () => {
  const w = await monde();
  const id = await w.creer('Deux onglets');
  const un = (nom: string) => [{ type: 'poser_element', id: nom, calque: 'objets', asset_id: w.asset('Tonneau'), x: 1.5, y: 1.5 }];
  assert.equal((await w.ecrire(id, 1, un('premier'))).statusCode, 200);
  const second = await w.ecrire(id, 1, un('second'));
  assert.equal(second.statusCode, 409, second.body);
  assert.equal(code(second), 'version');
  const d = (await w.lire('antor', id)).json();
  assert.deepEqual(d.document.elements.map((e: Any) => e.id), ['premier']);
  const melange = await w.ecrire(id, 2, [...un('bon'), { type: 'poser_element', id: 'mauvais', calque: 'objets', asset_id: '999999', x: 2.5, y: 2.5 }]);
  assert.equal(melange.statusCode, 400, melange.body);
  assert.equal(code(melange), 'asset_inconnu');
  const apres = (await w.lire('antor', id)).json();
  assert.deepEqual(apres.document.elements.map((e: Any) => e.id), ['premier'], '« bon » n’est pas passé : le lot est refusé entier');
  assert.equal(apres.version, 2);
});

test('AD-156 : Léa ne lit ni le calque MJ seul, ni ses éléments, ni ses murs, ni l’id d’une fiche qu’elle ne peut pas lire ; aucun compte de ce qui est caché', async () => {
  const w = await monde();
  const id = await w.creer('Secrets');
  const lisible = creerFiche(w.app.db, w.antorId, w.E, { type: 'objet', titre: 'Fiche publique Zébulon', charge: {}, sections: [{ titre: 'S', joueursLisent: true }] }).id;
  const cachee = creerFiche(w.app.db, w.antorId, w.E, { type: 'objet', titre: 'Fiche cachée Vérité', charge: {}, sections: [{ titre: 'S', joueursLisent: false }] }).id;
  const lot = [
    { type: 'creer_calque', id: 'piege', nom: 'Salle piège Xyloglotte', genre: 'objet', mj_seul: true },
    { type: 'creer_calque', id: 'murmj', nom: 'Murs Cachés Quartz', genre: 'mur', mj_seul: true },
    { type: 'poser_element', id: 'vu', calque: 'objets', asset_id: w.asset('Tonneau'), x: 1.5, y: 1.5, fiche_id: String(lisible) },
    { type: 'poser_element', id: 'lie-cache', calque: 'objets', asset_id: w.asset('Coffre'), x: 2.5, y: 1.5, fiche_id: String(cachee) },
    { type: 'poser_element', id: 'secret-elem', calque: 'piege', asset_id: w.asset('Coffre piégé'), x: 5.5, y: 5.5 },
    { type: 'tracer_mur', calque: 'murmj', segments: [{ x: 7, y: 7, cote: 'h' }, { x: 8, y: 7, cote: 'h' }], asset_id: w.asset('Mur de pierre') },
  ];
  assert.equal((await w.ecrire(id, 1, lot)).statusCode, 200);
  assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, visible: true })).statusCode, 200);

  const mj = await w.lire('antor', id);
  assert.ok(mj.body.includes('Salle piège Xyloglotte') && mj.body.includes('secret-elem'), 'le MJ lit tout');
  assert.equal(mj.json().document.murs.length, 2);

  const lea = await w.lire('lea', id);
  assert.equal(lea.statusCode, 200, lea.body);
  for (const secret of ['Salle piège Xyloglotte', 'Murs Cachés Quartz', 'secret-elem', 'piege', 'murmj', 'lie-cache'.length ? `"fiche_id":"${cachee}"` : '', 'Fiche cachée Vérité']) {
    if (secret) assert.equal(lea.body.includes(secret), false, `fuite : ${secret}`);
  }
  const d = lea.json().document;
  assert.equal(d.murs.length, 0, 'aucun segment du calque MJ seul');
  assert.deepEqual(d.calques.map((c: Any) => c.nom), ['Sol', 'Murs', 'Objets']);
  assert.deepEqual(d.elements.map((e: Any) => e.id).sort(), ['lie-cache', 'vu']);
  assert.equal(d.elements.find((e: Any) => e.id === 'vu').fiche_id, String(lisible));
  assert.equal(d.elements.find((e: Any) => e.id === 'lie-cache').fiche_id, undefined, 'l’élément reste, le lien tombe');
  assert.equal(lea.json().peutEcrire, false);
});

test('B-104 : la carte composée est listée pour E-10 avec sa taille ; masquée, Léa ne la lit pas ; Léa n’écrit ni ne supprime ; DELETE la retire', async () => {
  const w = await monde();
  const id = await w.creer('Hangar', 40, 25);
  const liste = (await w.req('GET', 'antor', `/api/univers/${w.E}/cartes`)).json().cartes as Any[];
  const l = liste.find((c) => c.titre === 'Hangar')!;
  assert.equal(l.largeur, 40);
  assert.equal(l.hauteur, 25);
  assert.equal(l.adresse, `/univers/${w.E}/outils/battlemap/cartes/${id}`);
  assert.equal((await w.lire('lea', id)).statusCode, 404, 'masquée : introuvable');
  assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true })).statusCode, 200);
  assert.equal((await w.lire('lea', id)).statusCode, 200);
  assert.equal((await w.ecrire(id, 2, [{ type: 'creer_calque', id: 'x', nom: 'X', genre: 'objet' }], 'lea')).statusCode, 404);
  assert.equal((await w.req('DELETE', 'lea', `${w.R}/${id}`)).statusCode, 404);
  assert.equal((await w.lire('antor', id)).json().version, 2, 'Léa n’a rien écrit');
  assert.equal((await w.req('DELETE', 'antor', `${w.R}/${id}`)).statusCode, 204);
  assert.equal((await w.lire('antor', id)).statusCode, 404);
  const apres = (await w.req('GET', 'antor', `/api/univers/${w.E}/cartes`)).json().cartes as Any[];
  assert.equal(apres.some((c) => c.titre === 'Hangar'), false);
});

test('B-110 : un asset posé sur trois cartes est « utilisé sur 3 cartes » (une carte compte une fois) ; retiré, il laisse ses éléments dans le document', async () => {
  const w = await monde();
  const lampe = w.asset('Rocher');
  const ids: number[] = [];
  for (const t of ['A', 'B', 'C']) {
    const id = await w.creer(`Usage ${t}`);
    ids.push(id);
    const deux = [0, 1].map((i) => ({ type: 'poser_element', id: `s${i}`, calque: 'objets', asset_id: lampe, x: 1.5 + i, y: 1.5 }));
    assert.equal((await w.ecrire(id, 1, deux)).statusCode, 200);
  }
  const avant = await w.req('GET', 'antor', `${w.B}/assets/${lampe}/utilisation`);
  assert.equal(avant.json().cartes, 3);
  const del = await w.req('DELETE', 'antor', `${w.B}/assets`, { ids: [Number(lampe)] });
  assert.ok(del.statusCode < 300, del.body);
  const doc = (await w.lire('antor', ids[0]!)).json().document;
  assert.equal(doc.elements.length, 2, 'les éléments restent');
  assert.equal(doc.elements[0].asset_id, lampe, 'l’id de l’asset retiré reste dans le document');
  const apresJ = await w.req('GET', 'antor', `${w.B}/assets/${lampe}/utilisation`);
  assert.notEqual(apresJ.statusCode, 500);
});
