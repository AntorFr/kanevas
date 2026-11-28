// kanevas-systemes-jeu-api-socle: the level a token has on a game system (AD-155, AD-systemes-api-2 to 4), through the session routes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { niveauSysteme } = await import('../services/jetons.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
type Any = Record<string, any>;

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monde() {
  const app = await buildApp();
  const [antor, lea, admin] = [await connecter(app, 'antor'), await connecter(app, 'lea'), await connecter(app, 'admin')];
  const appel = (h: H, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: h, payload });
  const compte = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  // Zeta: antor is a GM, and an attached universe has lea as a player. Hidden: antor has no right on it.
  const lame = (await appel(antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const zeta = (await appel(antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, 'joueur')").run(lame.id, compte('lea'));
  // antor GM of a universe is not yet a GM of its system: the instance admin names the system's GMs (AD-157)
  assert.equal((await appel(admin, 'POST', `/api/instance/systemes/${zeta.id}/membres`, { username: 'antor' })).statusCode, 201);
  // Alpha: antor's universe is attached to it but he is no GM of the system; Prive: he has no right at all.
  const alpha = (await appel(antor, 'POST', '/api/systemes', { nom: 'Alpha' })).json();
  const autre = (await appel(antor, 'POST', '/api/systemes', { nom: 'Prive' })).json();
  const ualpha = (await appel(antor, 'POST', '/api/univers', { nom: 'UAlpha' })).json();
  assert.equal((await appel(antor, 'PUT', `/api/univers/${ualpha.id}/systeme`, { systemeId: alpha.id })).statusCode, 204);
  const tous = { tous: true, niveauTous: 'lecture' };
  const creer = (h: H, extra: object = {}) =>
    appel(h, 'POST', '/api/compte/jetons', { nom: 'j', dureeJours: 30, acces: tous, ...extra });
  const liste = async (h: H) => ((await appel(h, 'GET', '/api/compte/jetons')).json().jetons as Any[]);
  return { app, antor, lea, admin, appel, compte, zeta, alpha, autre, creer, liste, tous };
}

const refus = (r: { statusCode: number; json: () => Any }) => {
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'invalide');
  assert.equal(r.json().champ, 'systemes');
};

test('création : un MJ du système crée un jeton écriture, la liste le rend avec nom et plusLecteur', async () => {
  const w = await monde();
  const r = await w.creer(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  assert.equal(r.statusCode, 201, r.body);
  assert.deepEqual(r.json().jeton.systemes, [{ id: w.zeta.id, nom: 'Zeta', niveau: 'ecriture', plusLecteur: false }]);
  const l = await w.liste(w.antor);
  assert.deepEqual(l[0].systemes, [{ id: w.zeta.id, nom: 'Zeta', niveau: 'ecriture', plusLecteur: false }]);
  // lecture on a system read as a player is allowed
  const r2 = await w.creer(w.antor, { systemes: [{ id: w.alpha.id, niveau: 'lecture' }] });
  assert.equal(r2.statusCode, 201, r2.body);
  // a token with no key keeps an empty list
  assert.deepEqual((await w.creer(w.antor)).json().jeton.systemes, []);
  await w.app.close();
});

test('création : refus invalide/systemes — écriture en lecteur, système non lu, doublon, niveau, forme, outils seuls', async () => {
  const w = await monde();
  const n0 = (await w.liste(w.antor)).length;
  const cas: unknown[] = [
    [{ id: w.alpha.id, niveau: 'ecriture' }], // reader only
    [{ id: w.autre.id, niveau: 'lecture' }], // not read
    [{ id: 99999, niveau: 'lecture' }], // unknown
    [{ id: w.zeta.id, niveau: 'lecture' }, { id: w.zeta.id, niveau: 'ecriture' }], // duplicate
    [{ id: w.zeta.id, niveau: 'lecture' }, { id: w.zeta.id, niveau: 'lecture' }],
    [{ id: w.zeta.id, niveau: 'tous' }], // unknown level
    [{ id: w.zeta.id, niveau: 'aucun' }],
    [{ id: w.zeta.id }],
    [{ id: String(w.zeta.id), niveau: 'lecture' }],
    [{ id: 1.5, niveau: 'lecture' }],
    [null], ['x'], [[]],
    'zeta', {}, null, 3,
  ];
  for (const systemes of cas) refus(await w.creer(w.antor, { systemes }));
  // a tool-only token takes no system
  const outil = await w.appel(w.antor, 'GET', '/api/compte/jetons');
  const cle = (outil.json().outilsOffrables as Any[])[0]?.cle;
  if (cle) refus(await w.creer(w.antor, { contenu: false, outils: [cle], systemes: [{ id: w.zeta.id, niveau: 'lecture' }] }));
  // an empty list on a tool-only token is fine
  if (cle) assert.equal((await w.creer(w.antor, { contenu: false, outils: [cle], systemes: [] })).statusCode, 201);
  assert.equal((await w.liste(w.antor)).length, n0 + (cle ? 1 : 0), 'a refusal writes no token');
  await w.app.close();
});

test('PATCH : sans clé garde les lignes, [] les retire, un autre niveau les remplace ; refus sans écriture', async () => {
  const w = await monde();
  const { jeton } = (await w.creer(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }, { id: w.alpha.id, niveau: 'lecture' }] })).json();
  const url = `/api/compte/jetons/${jeton.id}`;
  const sys = async () => (await w.liste(w.antor)).find((j) => j.id === jeton.id)!.systemes.map((s: Any) => [s.id, s.niveau]);
  const avant = [[w.alpha.id, 'lecture'], [w.zeta.id, 'ecriture']].sort();
  assert.deepEqual((await sys()).sort(), avant);
  // no key: intact, whatever the access change
  const p1 = await w.appel(w.antor, 'PATCH', url, { acces: { tous: true, niveauTous: 'ecriture' } });
  assert.equal(p1.statusCode, 200, p1.body);
  assert.deepEqual((await sys()).sort(), avant);
  // another level replaces
  const p2 = await w.appel(w.antor, 'PATCH', url, { acces: w.tous, systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
  assert.equal(p2.statusCode, 200, p2.body);
  assert.deepEqual(await sys(), [[w.zeta.id, 'lecture']]);
  // raising back is allowed (GM)
  assert.equal((await w.appel(w.antor, 'PATCH', url, { acces: w.tous, systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] })).statusCode, 200);
  // a refusal changes nothing, access included
  refus(await w.appel(w.antor, 'PATCH', url, { acces: { tous: true, niveauTous: 'ecriture' }, systemes: [{ id: w.alpha.id, niveau: 'ecriture' }] }));
  assert.deepEqual(await sys(), [[w.zeta.id, 'ecriture']]);
  assert.equal((await w.liste(w.antor)).find((j) => j.id === jeton.id)!.niveauTous, 'lecture');
  // [] removes all
  const p3 = await w.appel(w.antor, 'PATCH', url, { acces: w.tous, systemes: [] });
  assert.deepEqual(p3.json().jeton.systemes, []);
  assert.deepEqual(await sys(), []);
  await w.app.close();
});

test('PATCH : un autre compte ne le voit pas ; l’admin change les lignes avec les choix du propriétaire', async () => {
  const w = await monde();
  const { jeton } = (await w.creer(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] })).json();
  const url = `/api/compte/jetons/${jeton.id}`;
  assert.equal((await w.appel(w.lea, 'PATCH', url, { acces: w.tous, systemes: [] })).statusCode, 404);
  const adm = `/api/instance/jetons/${jeton.id}`;
  // the owner is a GM of Zeta: the admin may raise it
  const ok = await w.appel(w.admin, 'PATCH', adm, { acces: w.tous, systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().jeton.systemes[0].niveau, 'ecriture');
  // the admin's own rights do not count: a system the owner does not read, a write on a system he reads as a player
  refus(await w.appel(w.admin, 'PATCH', adm, { acces: w.tous, systemes: [{ id: w.autre.id, niveau: 'lecture' }] }));
  refus(await w.appel(w.admin, 'PATCH', adm, { acces: w.tous, systemes: [{ id: w.alpha.id, niveau: 'ecriture' }] }));
  assert.equal((await w.appel(w.admin, 'PATCH', adm, { acces: w.tous, systemes: [{ id: w.alpha.id, niveau: 'lecture' }] })).statusCode, 200);
  // a plain member's call on the admin route is answered like an unknown one
  assert.equal((await w.appel(w.lea, 'PATCH', adm, { acces: w.tous, systemes: [] })).statusCode, 404);
  // GET instance: systems per owner, with right and peutEcrire
  const g = (await w.appel(w.admin, 'GET', '/api/instance/jetons')).json();
  const mien = g.systemesChoisissables[w.compte('antor')] as Any[];
  assert.ok(mien, JSON.stringify(g.systemesChoisissables));
  assert.deepEqual(mien.find((s) => s.id === w.zeta.id), { id: w.zeta.id, nom: 'Zeta', peutEcrire: true, droit: 'mj' });
  assert.deepEqual(mien.find((s) => s.id === w.alpha.id), { id: w.alpha.id, nom: 'Alpha', peutEcrire: false, droit: 'lecteur' });
  assert.ok(!mien.some((s) => s.id === w.autre.id), 'a system the owner does not read is not offered');
  assert.deepEqual(g.jetons.find((j: Any) => j.id === jeton.id).systemes.map((s: Any) => s.id), [w.alpha.id]);
  await w.app.close();
});

test('garde-fou d’un niveau porté : une ligne écriture gardée ou abaissée, jamais relevée après perte du droit', async () => {
  const w = await monde();
  const { jeton } = (await w.creer(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] })).json();
  const url = `/api/compte/jetons/${jeton.id}`;
  // antor loses his GM right but stays a player of an attached universe (Lame)
  assert.equal((await w.appel(w.admin, 'DELETE', `/api/instance/systemes/${w.zeta.id}/membres/${w.compte('antor')}`)).statusCode, 204);
  const l = (await w.liste(w.antor)).find((j) => j.id === jeton.id)!;
  assert.deepEqual(l.systemes.map((s: Any) => [s.niveau, s.plusLecteur]), [['ecriture', false]], 'no row changed, still a reader');
  assert.deepEqual(niveauSysteme(w.app.db, { id: jeton.id, compteId: w.compte('antor') }, w.zeta.id), { niveau: 'ecriture', droit: 'lecteur' });
  assert.equal((await w.appel(w.antor, 'PATCH', url, { acces: w.tous, systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] })).statusCode, 200, 'kept');
  assert.equal((await w.appel(w.antor, 'PATCH', url, { acces: w.tous, systemes: [{ id: w.zeta.id, niveau: 'lecture' }] })).statusCode, 200, 'lowered');
  refus(await w.appel(w.antor, 'PATCH', url, { acces: w.tous, systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] })); // raised again: no
  await w.app.close();
});

test('niveauSysteme : lecteur tant que le compte garde un univers rattaché, null sinon (deux bases)', async () => {
  // base 1: the system has an attached universe where antor is a member
  const a = await monde();
  const { jeton } = (await a.creer(a.antor, { systemes: [{ id: a.zeta.id, niveau: 'ecriture' }] })).json();
  const cj = { id: jeton.id, compteId: a.compte('antor') };
  assert.deepEqual(niveauSysteme(a.app.db, cj, a.zeta.id), { niveau: 'ecriture', droit: 'mj' });
  await a.appel(a.admin, 'DELETE', `/api/instance/systemes/${a.zeta.id}/membres/${a.compte('antor')}`);
  assert.deepEqual(niveauSysteme(a.app.db, cj, a.zeta.id), { niveau: 'ecriture', droit: 'lecteur' });
  assert.equal((a.app.db.prepare('SELECT COUNT(*) AS n FROM jetons_systemes WHERE jeton_id = ?').get(jeton.id) as Any).n, 1);
  // a system without a row: no level
  assert.deepEqual(niveauSysteme(a.app.db, cj, a.alpha.id), { niveau: 'aucun', droit: 'lecteur' });
  assert.deepEqual(niveauSysteme(a.app.db, cj, a.autre.id), { niveau: 'aucun', droit: null });
  await a.app.close();
  // base 2: a system with no universe
  const b = await monde();
  const seul = (await b.appel(b.antor, 'POST', '/api/systemes', { nom: 'Seul' })).json();
  assert.equal((await b.appel(b.admin, 'POST', `/api/instance/systemes/${seul.id}/membres`, { username: 'antor' })).statusCode, 201);
  const j2 = (await b.creer(b.antor, { systemes: [{ id: seul.id, niveau: 'ecriture' }] })).json().jeton;
  assert.equal((await b.appel(b.admin, 'DELETE', `/api/instance/systemes/${seul.id}/membres/${b.compte('antor')}`)).statusCode, 204);
  assert.deepEqual(niveauSysteme(b.app.db, { id: j2.id, compteId: b.compte('antor') }, seul.id), { niveau: 'ecriture', droit: null });
  const l = (await b.liste(b.antor)).find((j) => j.id === j2.id)!;
  assert.equal(l.systemes[0].plusLecteur, true);
  await b.app.close();
});

test('cascade : supprimer le jeton ou le système efface les lignes', async () => {
  const w = await monde();
  const { jeton } = (await w.creer(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] })).json();
  const n = () => (w.app.db.prepare('SELECT COUNT(*) AS n FROM jetons_systemes').get() as Any).n;
  assert.equal(n(), 1);
  w.app.db.prepare('DELETE FROM jetons_api WHERE id = ?').run(jeton.id);
  assert.equal(n(), 0);
  await w.app.close();
});
