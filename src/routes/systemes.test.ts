import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });

async function monde(app: App) {
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');
  const admin = await connecter(app, 'admin');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  await appel(app, antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' });
  const mirU = (await appel(app, mira, 'POST', '/api/univers', { nom: 'Aube Secrète' })).json();
  const brume = (await appel(app, admin, 'POST', '/api/univers', { nom: 'Brume' })).json();
  return { antor, lea, teo, mira, admin, lame, mirU, brume };
}

test('sans session, chaque route répond 401', async () => {
  const app = await buildApp();
  const routes: [Parameters<typeof appel>[2], string][] = [
    ['GET', '/api/systemes'],
    ['POST', '/api/systemes'],
    ['PATCH', '/api/univers/1'],
    ['PUT', '/api/univers/1/systeme'],
    ['POST', '/api/univers/1/systeme-nouveau'],
    ['GET', '/api/univers/1/systeme'],
    ['POST', '/api/univers/1/systeme/gabarits'],
    ['PUT', '/api/univers/1/systeme/gabarits/1'],
  ];
  for (const [m, u] of routes) {
    assert.equal((await appel(app, null, m, u, {})).statusCode, 401, `${m} ${u}`);
  }
});

test('catalogue : couples (id, nom) seuls ; création ; nom pris 409 nom_pris', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const cree = await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'Epees & Sorts' });
  assert.equal(cree.statusCode, 201);
  assert.deepEqual(Object.keys(cree.json()).sort(), ['id', 'nom']);
  const mira = await appel(app, w.mira, 'POST', '/api/systemes', { nom: 'Cendres' });
  assert.equal(mira.statusCode, 201);
  assert.equal((await appel(app, w.admin, 'POST', '/api/systemes', { nom: 'Vapeur' })).statusCode, 201);

  const pris = await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'EPEES & sorts' });
  assert.equal(pris.statusCode, 409);
  assert.equal(pris.json().code, 'nom_pris');

  const liste = await appel(app, w.antor, 'GET', '/api/systemes');
  assert.equal(liste.statusCode, 200);
  assert.deepEqual(
    liste.json().map((s: object) => Object.keys(s).sort()),
    [['id', 'nom'], ['id', 'nom'], ['id', 'nom']],
  );
  assert.deepEqual(liste.json().map((s: { nom: string }) => s.nom), ['Cendres', 'Epees & Sorts', 'Vapeur']);

  // validation
  assert.equal((await appel(app, w.antor, 'POST', '/api/systemes', {})).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'POST', '/api/systemes', { nom: '  ' })).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'x'.repeat(81) })).statusCode, 400);
  // un compte qui n'est MJ nulle part ne lit ni ne crée
  assert.equal((await appel(app, w.teo, 'GET', '/api/systemes')).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'POST', '/api/systemes', { nom: 'Z' })).statusCode, 403);
});

test('PATCH univers : Antor oui, Léa 403, Teo 404', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const url = `/api/univers/${w.lame.id}`;
  const ok = await appel(app, w.antor, 'PATCH', url, { nom: 'Lame d’Ébène', description: 'Une lame.' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().nom, 'Lame d’Ébène');
  assert.equal(ok.json().description, 'Une lame.');
  assert.equal((await appel(app, w.lea, 'PATCH', url, { nom: 'X', description: '' })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'PATCH', url, { nom: 'X', description: '' })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'PATCH', url, { nom: '', description: '' })).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'PATCH', url, { nom: 'ok', description: 'x'.repeat(501) })).statusCode, 400);
  // refusé : rien n'a changé
  assert.equal((await appel(app, w.antor, 'GET', url)).json().nom, 'Lame d’Ébène');
});

test('rattacher, détacher, créer et rattacher ; droits', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const sys = (await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'Épées' })).json();
  const put = `/api/univers/${w.lame.id}/systeme`;
  const get = (h: H) => appel(app, h, 'GET', put);

  assert.equal((await get(w.antor)).statusCode, 404); // pas encore rattaché
  assert.equal((await appel(app, w.lea, 'PUT', put, { systemeId: sys.id })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'PUT', put, { systemeId: sys.id })).statusCode, 404);
  assert.equal((await get(w.antor)).statusCode, 404); // les refus n'ont rien rattaché
  assert.equal((await appel(app, w.antor, 'PUT', put, { systemeId: 99999 })).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'PUT', put, {})).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'PUT', put, { systemeId: '1' })).statusCode, 400);

  const r = await appel(app, w.antor, 'PUT', put, { systemeId: sys.id });
  assert.ok(r.statusCode === 200 || r.statusCode === 204);
  const vu = await get(w.antor);
  assert.equal(vu.statusCode, 200);
  assert.equal(vu.json().nom, 'Épées');
  assert.equal(vu.json().universUtilisateurs, 1);

  // Léa (joueuse) lit aussi
  assert.equal((await get(w.lea)).statusCode, 200);
  // Teo : 404
  assert.equal((await get(w.teo)).statusCode, 404);

  // détacher
  assert.ok((await appel(app, w.antor, 'PUT', put, { systemeId: null })).statusCode < 300);
  assert.equal((await get(w.antor)).statusCode, 404);

  // créer et rattacher
  const nv = await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Neuf' });
  assert.equal(nv.statusCode, 201);
  assert.equal((await get(w.antor)).json().nom, 'Neuf');
  // nom pris : 409 et le rattachement n'a pas changé
  const dup = await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Épées' });
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.json().code, 'nom_pris');
  assert.equal((await get(w.antor)).json().nom, 'Neuf');
  assert.equal((await appel(app, w.lea, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'L' })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'T' })).statusCode, 404);
});

test('lecture : 404 de corps identique (inconnu, sans rôle, non rattaché) ; pas de fuite de noms', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const sys = (await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'Commun' })).json();
  await appel(app, w.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: sys.id });
  await appel(app, w.mira, 'PUT', `/api/univers/${w.mirU.id}/systeme`, { systemeId: sys.id });
  await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme/gabarits`, { type: 'regle', nom: 'Initiative', contenu: 'd20' });

  const inconnu = await appel(app, w.antor, 'GET', '/api/univers/99999/systeme');
  const teo = await appel(app, w.teo, 'GET', `/api/univers/${w.lame.id}/systeme`);
  const admin = await appel(app, w.admin, 'GET', `/api/univers/${w.lame.id}/systeme`);
  const brume = await appel(app, w.admin, 'GET', `/api/univers/${w.brume.id}/systeme`);
  for (const r of [inconnu, teo, admin, brume]) assert.equal(r.statusCode, 404);
  for (const r of [teo, admin, brume]) assert.equal(r.body, inconnu.body);

  const vu = await appel(app, w.antor, 'GET', `/api/univers/${w.lame.id}/systeme`);
  assert.equal(vu.json().universUtilisateurs, 2);
  assert.equal(vu.json().gabarits.length, 1);
  assert.equal(vu.json().gabarits[0].nom, 'Initiative');
  const mira = await appel(app, w.mira, 'GET', `/api/univers/${w.mirU.id}/systeme`);
  assert.equal(mira.statusCode, 200);
  assert.equal(mira.json().gabarits.length, 1);
  assert.ok(!vu.body.includes('Aube Secrète'));
  assert.ok(!vu.body.includes('Brume'));
  assert.ok(!mira.body.includes('Lame'));
  // type inconnu / curseur invalide
  assert.equal((await appel(app, w.antor, 'GET', `/api/univers/${w.lame.id}/systeme?type=dragon`)).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'GET', `/api/univers/${w.lame.id}/systeme?curseur=%25%25`)).statusCode, 400);
});

test('gabarits : pagination par cent et curseur', async () => {
  const app = await buildApp();
  const w = await monde(app);
  await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Gros' });
  const post = `/api/univers/${w.lame.id}/systeme/gabarits`;
  for (let i = 0; i < 101; i++) {
    const r = await appel(app, w.antor, 'POST', post, { type: 'creature', nom: `Bête ${String(i).padStart(3, '0')}` });
    assert.equal(r.statusCode, 201);
  }
  const url = `/api/univers/${w.lame.id}/systeme?type=creature`;
  const p1 = (await appel(app, w.lea, 'GET', url)).json();
  assert.equal(p1.gabarits.length, 100);
  assert.ok(p1.suivant);
  assert.equal(p1.gabarits[0].nom, 'Bête 000');
  const p2 = (await appel(app, w.lea, 'GET', `${url}&curseur=${p1.suivant}`)).json();
  assert.equal(p2.gabarits.length, 1);
  assert.equal(p2.gabarits[0].nom, 'Bête 100');
  assert.equal(p2.suivant, null);
  // autre type : vide
  assert.equal((await appel(app, w.lea, 'GET', `/api/univers/${w.lame.id}/systeme?type=objet`)).json().gabarits.length, 0);
});

test('gabarits : écriture, droits, version périmée, système non utilisé', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const sA = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'A' })).json();
  await appel(app, w.mira, 'POST', `/api/univers/${w.mirU.id}/systeme-nouveau`, { nom: 'B' });
  assert.ok(sA.id);
  const post = `/api/univers/${w.lame.id}/systeme/gabarits`;

  const g = await appel(app, w.antor, 'POST', post, { type: 'regle', nom: 'Soin', contenu: 'v1' });
  assert.equal(g.statusCode, 201);
  assert.equal(g.json().version, 1);
  assert.equal((await appel(app, w.lea, 'POST', post, { type: 'regle', nom: 'L' })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'POST', post, { type: 'regle', nom: 'T' })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'POST', post, { type: 'regle', nom: 'soin' })).statusCode, 409);
  assert.equal((await appel(app, w.antor, 'POST', post, { type: 'monstre', nom: 'M' })).statusCode, 400);

  const put = `${post}/${g.json().id}`;
  const m = await appel(app, w.antor, 'PUT', put, { nom: 'Soin+', contenu: 'v2', version: 1 });
  assert.equal(m.statusCode, 200);
  assert.equal(m.json().version, 2);
  assert.equal(m.json().type, 'regle');
  const perime = await appel(app, w.antor, 'PUT', put, { nom: 'X', contenu: 'v3', version: 1 });
  assert.equal(perime.statusCode, 409);
  assert.equal(perime.json().code, 'gabarit_modifie');
  const lu = (await appel(app, w.antor, 'GET', `/api/univers/${w.lame.id}/systeme`)).json().gabarits[0];
  assert.equal(lu.contenu, 'v2');
  assert.equal(lu.nom, 'Soin+');
  assert.equal((await appel(app, w.lea, 'PUT', put, { nom: 'X', contenu: 'x', version: 2 })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'PUT', put, { nom: 'X', contenu: 'x', version: 2 })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'PUT', put, { nom: 'X', contenu: 'x' })).statusCode, 400);

  // Mira vise le gabarit d'Antor, via son propre univers : 404, rien d'écrit
  const mur = `/api/univers/${w.mirU.id}/systeme/gabarits/${g.json().id}`;
  assert.equal((await appel(app, w.mira, 'PUT', mur, { nom: 'Pirate', contenu: 'x', version: 2 })).statusCode, 404);
  // gabarit inexistant
  assert.equal((await appel(app, w.antor, 'PUT', `${post}/99999`, { nom: 'X', contenu: 'x', version: 1 })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'PUT', `${post}/abc`, { nom: 'X', contenu: 'x', version: 1 })).statusCode, 404);
  const apres = (await appel(app, w.antor, 'GET', `/api/univers/${w.lame.id}/systeme`)).json().gabarits[0];
  assert.equal(apres.nom, 'Soin+');
  assert.equal(apres.version, 2);
});

test('aucune route ne supprime', async () => {
  const app = await buildApp();
  const w = await monde(app);
  await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'S' });
  const g = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme/gabarits`, { type: 'objet', nom: 'Épée' })).json();
  for (const u of ['/api/systemes', `/api/univers/${w.lame.id}/systeme`, `/api/univers/${w.lame.id}/systeme/gabarits/${g.id}`]) {
    const r = await appel(app, w.antor, 'DELETE', u);
    assert.ok(r.statusCode >= 400, u);
  }
  assert.equal((await appel(app, w.antor, 'GET', `/api/univers/${w.lame.id}/systeme?type=objet`)).json().gabarits.length, 1);
});
