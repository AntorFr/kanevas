import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
type Any = Record<string, any>;

const EXEMPLE = JSON.parse(readFileSync(new URL('../outils/essai/exemples/catalogue-essai.json', import.meta.url), 'utf8'));
const G = 'essai/g';

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = await connecter(app, 'antor');
  const admin = await connecter(app, 'admin');
  const lea = await connecter(app, 'lea');
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id, cle FROM univers WHERE nom = ?', "Éneria d'essai") as { id: number; cle: string };
  const K = un('SELECT id, cle FROM univers WHERE nom = ?', 'Essai Kanka') as { id: number; cle: string };
  const appel = (h: { cookie: string }, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: h, payload });
  const creer = (h: { cookie: string }, payload: object) => appel(h, 'POST', '/api/compte/jetons', payload);
  const v1 = (valeur: string, method: 'GET' | 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/v1/univers/${E.cle}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as any });
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const sur = (u: { id: number }, niveau = 'ecriture') => ({ tous: false, univers: [{ universId: u.id, niveau }] });
  return { app, antor, admin, lea, E, K, appel, creer, v1, id, sur, un };
}

test('outils : un jeton {outils:[essai/g]} écrit le catalogue de cet outil et rien d’autre', async () => {
  const w = await monde();
  const r = await w.creer(w.antor, { nom: 'Outil', dureeJours: 30, acces: w.sur(w.E), outils: [G] });
  assert.equal(r.statusCode, 201, r.body);
  const { jeton, valeur } = r.json();
  assert.deepEqual(jeton.outils, [G]);
  const put = await w.v1(valeur, 'PUT', `/outils/${G}/catalogue`, EXEMPLE);
  assert.equal(put.statusCode, 200, put.body);
  const fiche = await w.v1(valeur, 'PUT', '/fiches/x', { titre: 'X', type: 'personnage' });
  assert.equal(fiche.statusCode, 401);
  assert.equal(fiche.json().code, 'jeton_invalide');
  assert.equal((await w.v1(valeur, 'PUT', '/outils/essai/h/catalogue', EXEMPLE)).statusCode, 401);
  const l = (await w.appel(w.antor, 'GET', '/api/compte/jetons')).json();
  assert.deepEqual(l.jetons[0].outils, [G]);
  assert.ok(!JSON.stringify(l).includes(valeur));
});

test('outils : la liste offre les outils des univers où le compte est MJ, avec les univers ; un joueur n’en a pas', async () => {
  const w = await monde();
  const o = (await w.appel(w.antor, 'GET', '/api/compte/jetons')).json().outilsOffrables as Any[];
  const g = o.find((x) => x.cle === G);
  assert.ok(g, JSON.stringify(o));
  assert.deepEqual(Object.keys(g).sort(), ['cle', 'libelle', 'libelleModule', 'module', 'type', 'univers'].sort());
  assert.ok(g.univers.includes(w.E.id));
  assert.ok(!g.univers.includes(w.K.id), 'Essai Kanka has no system');
  const lea = (await w.appel(w.lea, 'GET', '/api/compte/jetons')).json();
  assert.deepEqual(lea.outilsOffrables, []);
  const r = await w.creer(w.lea, { nom: 'x', dureeJours: 30, acces: { tous: true, niveauTous: 'lecture' }, outils: [G] });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().champ, 'outils');
});

test('outils : saisie invalide → 400 champ outils, aucun jeton créé', async () => {
  const w = await monde();
  const avant = (await w.appel(w.antor, 'GET', '/api/compte/jetons')).json().jetons.length;
  const base = { nom: 'T', dureeJours: 30, acces: w.sur(w.E) };
  const cas: unknown[] = [[], 'essai/g', [3], ['rien/du/tout'], ['essai/h'], [G, 'essai/h'], null, {}];
  for (const outils of cas) {
    const r = await w.creer(w.antor, { ...base, outils });
    assert.equal(r.statusCode, 400, JSON.stringify(outils));
    assert.equal(r.json().champ, 'outils', JSON.stringify(outils));
  }
  // the outil is offered in Éneria only: a token that does not reach it cannot carry it
  for (const acces of [w.sur(w.K)]) {
    const r = await w.creer(w.antor, { nom: 'T', dureeJours: 30, acces, outils: [G] });
    assert.equal(r.statusCode, 400, JSON.stringify(acces));
    assert.equal(r.json().champ, 'outils');
  }
  assert.equal((await w.appel(w.antor, 'GET', '/api/compte/jetons')).json().jetons.length, avant);
  assert.equal(w.un('SELECT COUNT(*) n FROM jetons_outils').n, 0);
});

test('outils : sans « outils », jeton de contenu ordinaire (outils vides, PUT catalogue refusé) ; doublons dédupliqués', async () => {
  const w = await monde();
  const c = (await w.creer(w.antor, { nom: 'C', dureeJours: 30, acces: w.sur(w.E) })).json();
  assert.deepEqual(c.jeton.outils ?? [], []);
  assert.equal((await w.v1(c.valeur, 'PUT', `/outils/${G}/catalogue`, EXEMPLE)).statusCode, 401);
  const d = (await w.creer(w.antor, { nom: 'D', dureeJours: 30, acces: w.sur(w.E), outils: [G, G] })).json();
  assert.equal(d.jeton.outils.length, 1);
  assert.equal(w.un('SELECT COUNT(*) n FROM jetons_outils WHERE jeton_id = ?', d.jeton.id).n, 1);
});

test('outils : l’admin voit les outils de chaque jeton et ceux que chaque propriétaire peut offrir ; un non-admin 404', async () => {
  const w = await monde();
  const c = (await w.creer(w.antor, { nom: 'O', dureeJours: 30, acces: w.sur(w.E), outils: [G] })).json();
  const i = (await w.appel(w.admin, 'GET', '/api/instance/jetons')).json();
  assert.deepEqual(i.jetons.find((j: Any) => j.id === c.jeton.id).outils, [G]);
  assert.ok(i.outilsOffrables[String(w.id('antor'))].some((o: Any) => o.cle === G));
  assert.ok(!JSON.stringify(i).includes(c.valeur));
  assert.equal((await w.appel(w.antor, 'GET', '/api/instance/jetons')).statusCode, 404);
});

test('outils : un jeton d’outil révoqué perd la porte du catalogue', async () => {
  const w = await monde();
  const c = (await w.creer(w.antor, { nom: 'O', dureeJours: 30, acces: w.sur(w.E), outils: [G] })).json();
  assert.equal((await w.appel(w.antor, 'DELETE', `/api/compte/jetons/${c.jeton.id}`)).statusCode, 200);
  const r = await w.v1(c.valeur, 'PUT', `/outils/${G}/catalogue`, EXEMPLE);
  assert.equal(r.statusCode, 401);
  assert.equal(r.json().code, 'jeton_invalide');
});
