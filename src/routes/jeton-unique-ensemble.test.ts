// B-jeton-1 (kanevas-jeton-unique) : door-level tests of the cumulated permissions, written from the need
// (docs/parcours.md B-jeton-1 and P-jeton-unique-1, docs/ecrans.md E-23) and not from the code.
//
// TEST PLAN (need -> cases; every expectation is a literal)
//   nominal   : a token created by the route with contenu + swn/galaxie opens a content lot and a tool lot (201 each)
//   bords     : read level is shared by both permissions (403 lecture_seule on both writes, 200 on both reads);
//               the universe list is shared (another universe: 404 on both)
//   exclusion : permissions do not change after creation (PATCH with contenu/outils changes nothing);
//               the role decides at each use (a GM turned player no longer writes the tool, still reads)
//   échec     : nothing checked -> 400 invalide permissions (covered in jeton-unique-gardes.test.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');

const G = 'swn/galaxie';

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  const antor = { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
  const id = trouverCompte(app.db, 'antor')!.id;
  const univers = (nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const E = univers("Éneria d'essai");
  const L = univers("Lame d'Ébène");
  const creer = async (niveau: 'lecture' | 'ecriture', corps: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/compte/jetons', headers: antor,
      payload: { nom: 'Import Éneria', dureeJours: 30, acces: { tous: false, univers: [{ universId: E, niveau }] }, ...corps } });
    assert.equal(r.statusCode, 201, r.body);
    return { valeur: r.json().valeur as string, jeton: r.json().jeton as { id: number } };
  };
  const req = (valeur: string, method: 'GET' | 'POST' | 'PUT', univ: number, url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/v1/univers/${univ}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as never });
  return { app, antor, id, E, L, creer, req };
}

test('un jeton créé par la route avec contenu + swn/galaxie ouvre un lot de contenu et un lot d’outil (201 chacun)', async () => {
  const w = await monde();
  try {
    const { valeur } = await w.creer('ecriture', { contenu: true, outils: [G] });
    assert.equal((await w.req(valeur, 'POST', w.E, '/lots')).statusCode, 201);
    assert.equal((await w.req(valeur, 'POST', w.E, `/lots?outil=${G}`)).statusCode, 201);
  } finally { await w.app.close(); }
});

test('le niveau lecture vaut pour toutes les permissions : lit contenu et outil, écrit ni l’un ni l’autre (403 lecture_seule)', async () => {
  const w = await monde();
  try {
    const { valeur } = await w.creer('lecture', { contenu: true, outils: [G] });
    assert.equal((await w.req(valeur, 'GET', w.E, '')).statusCode, 200, 'lecture du contenu');
    assert.equal((await w.req(valeur, 'GET', w.E, '/outils/swn/galaxie/galaxies')).statusCode, 200, 'lecture de l’outil');
    for (const url of ['/lots', `/lots?outil=${G}`]) {
      const r = await w.req(valeur, 'POST', w.E, url);
      assert.equal(r.statusCode, 403, url + r.body);
      assert.equal(r.json().code, 'lecture_seule', url);
    }
  } finally { await w.app.close(); }
});

test('la liste d’univers vaut pour toutes les permissions : un autre univers répond 404 au contenu comme à l’outil', async () => {
  const w = await monde();
  try {
    const { valeur } = await w.creer('ecriture', { contenu: true, outils: [G] });
    assert.equal((await w.req(valeur, 'GET', w.L, '')).statusCode, 404, 'contenu');
    assert.equal((await w.req(valeur, 'GET', w.L, '/outils/swn/galaxie/galaxies')).statusCode, 404, 'outil');
  } finally { await w.app.close(); }
});

test('les permissions ne changent pas après la création : un PATCH qui porte contenu/outils ne change rien', async () => {
  const w = await monde();
  try {
    const contenuSeul = await w.creer('ecriture', { contenu: true });
    const outilSeul = await w.creer('ecriture', { contenu: false, outils: [G] });
    for (const [t, corps] of [[contenuSeul, { outils: [G] }], [outilSeul, { contenu: true, outils: [] }]] as const) {
      const acces = { tous: false, univers: [{ universId: w.E, niveau: 'ecriture' }] };
      await w.app.inject({ method: 'PATCH', url: `/api/compte/jetons/${t.jeton.id}`, headers: w.antor, payload: { acces, ...corps } });
    }
    const liste = (await w.app.inject({ method: 'GET', url: '/api/compte/jetons', headers: w.antor })).json().jetons as
      { id: number; contenu: boolean; outils: string[] }[];
    const c = liste.find((x) => x.id === contenuSeul.jeton.id)!;
    const o = liste.find((x) => x.id === outilSeul.jeton.id)!;
    assert.deepEqual([c.contenu, c.outils], [true, []]);
    assert.deepEqual([o.contenu, o.outils], [false, [G]]);
    assert.equal((await w.req(contenuSeul.valeur, 'GET', w.E, '/outils/swn/galaxie/galaxies')).statusCode, 401);
    assert.equal((await w.req(outilSeul.valeur, 'GET', w.E, '')).statusCode, 401);
  } finally { await w.app.close(); }
});

test('le rôle décide à chaque usage : un MJ devenu joueur lit encore avec son jeton cumulé et n’écrit plus l’outil', async () => {
  const w = await monde();
  try {
    const { valeur } = await w.creer('ecriture', { contenu: true, outils: [G] });
    assert.equal((await w.req(valeur, 'POST', w.E, `/lots?outil=${G}`)).statusCode, 201, 'MJ : ouvre le lot d’outil');
    w.app.db.prepare("UPDATE membres SET role = 'joueur' WHERE univers_id = ? AND compte_id = ?").run(w.E, w.id);
    assert.equal((await w.req(valeur, 'GET', w.E, '')).statusCode, 200, 'lit encore');
    const apres = await w.req(valeur, 'POST', w.E, `/lots?outil=${G}`);
    assert.ok(apres.statusCode === 403 || apres.statusCode === 404, `joueur : ${apres.statusCode}`);
  } finally { await w.app.close(); }
});
