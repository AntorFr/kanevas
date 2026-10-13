import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function connecter(app: App, compte: string): Promise<Hote> {
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
const appel = (app: App, h: Hote, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  const fiche = async (type: string, titre: string, charge?: object) =>
    (await appel(app, antor, 'POST', `${base}/fiches`, { type, titre, charge })).json() as { id: number };
  const section = async (f: number, titre: string, contenu: string, ouverte: boolean) => {
    const s = (await appel(app, antor, 'POST', `${base}/fiches/${f}/sections`, { titre, contenu })).json();
    if (ouverte) {
      const r = await appel(app, antor, 'PATCH', `${base}/fiches/${f}/sections/${s.id}`, { joueursLisent: true });
      assert.equal(r.statusCode, 200, r.body);
    }
    return s as { id: number };
  };
  const aldric = await fiche('personnage', 'Maître Aldric', { pj: false });
  const apparence = await section(aldric.id, 'Apparence', 'Un vieil homme voûté.', true);
  const verite = await section(aldric.id, 'Vérité — MJ seul', 'Il est le roi déchu.', false);
  const grises = await fiche('faction', 'Lames Grises');
  const gs = await section(grises.id, 'Présentation', 'Des lames.', true);
  const cendres = await fiche('faction', 'Cercle des Cendres');
  await section(cendres.id, 'Secret', 'Rien.', false);
  const rel = `${base}/fiches/${aldric.id}/sections/${apparence.id}/relations`;
  return { app, antor, lea, base, aldric, apparence, verite, grises, gs, cendres, rel };
}

test('recherche : « vérité » rend Aldric au MJ, une page vide à Léa identique à un mot inconnu', async () => {
  const { app, antor, lea, base, aldric } = await monter();
  const url = (q: string, extra = '') => `${base}/fiches?type=personnage&q=${encodeURIComponent(q)}${extra}`;
  const mj = await appel(app, antor, 'GET', url('vérité'));
  assert.equal(mj.statusCode, 200);
  assert.deepEqual(mj.json().fiches.map((f: { id: number }) => f.id), [aldric.id]);
  const l = await appel(app, lea, 'GET', url('vérité'));
  const rien = await appel(app, lea, 'GET', url('zzqxw'));
  assert.equal(l.statusCode, 200);
  assert.equal(l.body, rien.body);
  assert.ok(!l.body.includes('Aldric'));
  for (const q of ['apparence', 'aldric']) {
    for (const h of [antor, lea]) {
      const r = await appel(app, h, 'GET', url(q));
      assert.deepEqual(r.json().fiches.map((f: { id: number }) => f.id), [aldric.id], q);
    }
  }
});

test('recherche : 100 caractères passent, 101 reçoivent 400, q non chaîne 400', async () => {
  const { app, antor, base } = await monter();
  assert.equal((await appel(app, antor, 'GET', `${base}/fiches?q=${'a'.repeat(100)}`)).statusCode, 200);
  assert.equal((await appel(app, antor, 'GET', `${base}/fiches?q=${'a'.repeat(101)}`)).statusCode, 400);
  assert.equal((await appel(app, antor, 'GET', `${base}/fiches?q=a&q=b`)).statusCode, 400);
});

test('recherche : garde les cent par page et le curseur', async () => {
  const { app, antor, base } = await monter();
  for (let i = 0; i < 105; i++) {
    await appel(app, antor, 'POST', `${base}/fiches`, { type: 'lieu', titre: `Dragon ${i}` });
  }
  const p1 = (await appel(app, antor, 'GET', `${base}/fiches?q=dragon`)).json();
  assert.equal(p1.fiches.length, 100);
  assert.ok(p1.suivant);
  const p2 = (await appel(app, antor, 'GET', `${base}/fiches?q=dragon&curseur=${encodeURIComponent(p1.suivant)}`)).json();
  assert.equal(p2.fiches.length, 5);
  const ids = new Set([...p1.fiches, ...p2.fiches].map((f: { id: number }) => f.id));
  assert.equal(ids.size, 105);
});

test('relations : le MJ relie, Léa ne voit que la cible lisible, sans fuite ni compte', async () => {
  const { app, antor, lea, rel, grises, cendres, base, gs } = await monter();
  const a = await appel(app, antor, 'POST', rel, { cibleFicheId: grises.id, type: 'membre de' });
  assert.equal(a.statusCode, 201, a.body);
  assert.deepEqual(
    { type: a.json().type, cible: a.json().cible },
    { type: 'membre de', cible: { id: grises.id, titre: 'Lames Grises', type: 'faction' } },
  );
  const b = await appel(app, antor, 'POST', rel, { cibleFicheId: cendres.id, type: 'membre de' });
  assert.equal(b.statusCode, 201);
  const mj = await appel(app, antor, 'GET', rel);
  assert.equal(mj.json().relations.length, 2);
  const l = await appel(app, lea, 'GET', rel);
  assert.equal(l.statusCode, 200);
  assert.deepEqual(l.json().relations.map((r: { cible: { id: number } }) => r.cible.id), [grises.id]);
  assert.ok(!l.body.includes('Cendres'));
  assert.ok(!l.body.includes(String(cendres.id) + ',') && !l.body.includes(`"id":${cendres.id}}`));
  assert.deepEqual(Object.keys(l.json()), ['relations']);
  // Player mode of the GM gives what Léa gets.
  const mode = await appel(app, antor, 'GET', `${rel}?mode=joueur`);
  assert.equal(mode.body, l.body);
  // Closing the target to players hides the relation.
  await appel(app, antor, 'PATCH', `${base}/fiches/${grises.id}/sections/${gs.id}`, { joueursLisent: false });
  const apres = await appel(app, lea, 'GET', rel);
  assert.deepEqual(apres.json().relations, []);
});

test('relations : Léa reçoit 404 en reliant ou retirant, rien n’est écrit', async () => {
  const { app, antor, lea, rel, grises, base } = await monter();
  const r = await appel(app, lea, 'POST', rel, { cibleFicheId: grises.id, type: 'membre de' });
  assert.equal(r.statusCode, 404);
  assert.deepEqual((await appel(app, antor, 'GET', rel)).json().relations, []);
  const a = (await appel(app, antor, 'POST', rel, { cibleFicheId: grises.id, type: 'membre de' })).json();
  assert.equal((await appel(app, lea, 'DELETE', `${base}/fiches/relations/${a.id}`)).statusCode, 404);
  assert.equal((await appel(app, antor, 'GET', rel)).json().relations.length, 1);
  assert.equal((await appel(app, antor, 'DELETE', `${base}/fiches/relations/${a.id}`)).statusCode, 204);
  assert.equal((await appel(app, antor, 'DELETE', `${base}/fiches/relations/${a.id}`)).statusCode, 404);
});

test('relations : doublon 409, auto-relation 400, 101e 409, entrées fausses 400, rien n’est écrit', async () => {
  const { app, antor, rel, grises, aldric } = await monter();
  await appel(app, antor, 'POST', rel, { cibleFicheId: grises.id, type: 'membre de' });
  const d = await appel(app, antor, 'POST', rel, { cibleFicheId: grises.id, type: 'membre de' });
  assert.equal(d.statusCode, 409);
  assert.equal(d.json().code, 'relation_existante');
  const s = await appel(app, antor, 'POST', rel, { cibleFicheId: aldric.id, type: 'ami' });
  assert.equal(s.statusCode, 400);
  assert.equal(s.json().code, 'auto_relation');
  assert.equal((await appel(app, antor, 'POST', rel, { cibleFicheId: grises.id })).statusCode, 400);
  assert.equal((await appel(app, antor, 'POST', rel, { cibleFicheId: '5', type: 'x' })).statusCode, 400);
  assert.equal((await appel(app, antor, 'POST', rel, { cibleFicheId: 999999, type: 'x' })).statusCode, 404);
  assert.equal((await appel(app, antor, 'GET', rel)).json().relations.length, 1);
  for (let i = 1; i < 100; i++) {
    const r = await appel(app, antor, 'POST', rel, { cibleFicheId: grises.id, type: `lien ${i}` });
    assert.equal(r.statusCode, 201, `${i} ${r.body}`);
  }
  const trop = await appel(app, antor, 'POST', rel, { cibleFicheId: grises.id, type: 'de trop' });
  assert.equal(trop.statusCode, 409);
  assert.equal(trop.json().code, 'limite_relations');
  assert.equal((await appel(app, antor, 'GET', rel)).json().relations.length, 100);
});

test('relations : retirer une section retire ses relations', async () => {
  const { app, antor, rel, grises, base, aldric, apparence } = await monter();
  await appel(app, antor, 'POST', rel, { cibleFicheId: grises.id, type: 'membre de' });
  const r = await appel(app, antor, 'DELETE', `${base}/fiches/${aldric.id}/sections/${apparence.id}`);
  assert.ok(r.statusCode === 204 || r.statusCode === 200, r.body);
  assert.equal((await appel(app, antor, 'GET', rel)).statusCode, 404);
});
