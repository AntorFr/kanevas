import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };

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

const appel = (app: App, h: Hote | null, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const admin = await connecter(app, 'admin');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  const c = (await appel(app, antor, 'POST', `${base}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'La Couronne brisée' })).json();
  return { app, antor, lea, admin, base, c };
}

const SCEN = 'Crée un scénario « Acte III — La crypte » dans « La Couronne brisée »';

test('critère : disponibilité par rôle', async () => {
  const { app, antor, lea, base } = await monter();
  assert.deepEqual((await appel(app, antor, 'GET', `${base}/assistant`)).json(), { disponible: true, catalogue: 'mj' });
  assert.deepEqual((await appel(app, lea, 'GET', `${base}/assistant`)).json(), { disponible: true, catalogue: 'joueur' });
});

test('AD-126 : Antor crée une campagne puis un scénario ; Léa reçoit « absent » sans rien créer', async () => {
  const { app, antor, lea, base } = await monter();
  const nb = () => (app.db.prepare('SELECT count(*) n FROM fiches').get() as { n: number }).n;
  const dit = (h: typeof antor, message: string) => appel(app, h, 'POST', `${base}/assistant/messages`, { message });
  const avant = nb();
  const c = await dit(antor, 'Crée une campagne « Les Cendres »');
  assert.equal(c.statusCode, 200, c.body);
  assert.equal(c.json().reponse, 'Campagne « Les Cendres » créée.');
  assert.equal(c.json().evenements[0].type, 'fiche_creee');
  const s = await dit(antor, 'Crée un scénario « Le Creuset » dans « Les Cendres »');
  assert.equal(s.json().reponse, 'Scénario « Le Creuset » créé dans Les Cendres.');
  assert.equal(nb(), avant + 2);
  const apres = nb();
  for (const message of ['Crée un scénario « Zed » dans « Les Cendres »', 'Crée une campagne « Zut »']) {
    const r = await dit(lea, message);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().evenements, []);
    assert.match(r.json().reponse, /creer_fiche/);
  }
  assert.equal(nb(), apres);
});

test('bords : message vide, 2001 caractères, historique de 21 : 400 ; 2000 et 20 passent', async () => {
  const { app, antor, base } = await monter();
  const post = (b: object) => appel(app, antor, 'POST', `${base}/assistant/messages`, b);
  assert.equal((await post({ message: '' })).statusCode, 400);
  assert.equal((await post({ message: '   ' })).statusCode, 400);
  assert.equal((await post({})).statusCode, 400);
  assert.equal((await post({ message: 'a'.repeat(2001) })).statusCode, 400);
  assert.equal((await post({ message: 'a'.repeat(2000) })).statusCode, 200);
  const h = (n: number) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' }));
  assert.equal((await post({ message: 'salut', historique: h(21) })).statusCode, 400);
  assert.equal((await post({ message: 'salut', historique: h(20) })).statusCode, 200);
});

test('exclusions : sans rôle (Admin compris) et univers inconnu : 404 ; sans session : 401', async () => {
  const { app, admin, base } = await monter();
  for (const url of [`${base}/assistant`, '/api/univers/9999/assistant']) {
    assert.equal((await appel(app, admin, 'GET', url)).statusCode, 404);
  }
  for (const url of [`${base}/assistant/messages`, '/api/univers/9999/assistant/messages']) {
    assert.equal((await appel(app, admin, 'POST', url, { message: 'x' })).statusCode, 404);
  }
  assert.equal((await appel(app, null, 'GET', `${base}/assistant`)).statusCode, 401);
  assert.equal((await appel(app, null, 'POST', `${base}/assistant/messages`, { message: 'x' })).statusCode, 401);
});

test('échec : « échec » rend 502 assistant_erreur sans événement ni fuite', async () => {
  const { app, antor, base } = await monter();
  const r = await appel(app, antor, 'POST', `${base}/assistant/messages`, { message: 'échec' });
  assert.equal(r.statusCode, 502);
  assert.equal(r.json().code, 'assistant_erreur');
  assert.equal(r.json().evenements, undefined);
});

test('indisponible : sans jeton hors bouchon, GET disponible:false et POST 503', async () => {
  const { app, antor, base } = await monter();
  app.assistantDeps.config = { KANEVAS_STUB: undefined, CLAUDE_CODE_OAUTH_TOKEN: '' };
  const g = await appel(app, antor, 'GET', `${base}/assistant`);
  assert.equal(g.json().disponible, false);
  const p = await appel(app, antor, 'POST', `${base}/assistant/messages`, { message: SCEN });
  assert.equal(p.statusCode, 503);
  assert.equal(p.json().code, 'assistant_indisponible');
});

test('concurrence : la seconde demande du même compte reçoit 429, la première aboutit, le verrou se libère', async () => {
  const { app, antor, lea, base } = await monter();
  let libere!: () => void;
  const porte = new Promise<void>((r) => (libere = r));
  app.assistantDeps.transport = { nom: 'lent', repondre: async () => (await porte, 'ok') };
  const url = `${base}/assistant/messages`;
  const premiere = appel(app, antor, 'POST', url, { message: 'un' });
  await new Promise((r) => setTimeout(r, 50));
  const seconde = await appel(app, antor, 'POST', url, { message: 'deux' });
  assert.equal(seconde.statusCode, 429);
  assert.equal(seconde.json().code, 'assistant_occupe');
  const autre = appel(app, lea, 'POST', url, { message: 'trois' });
  libere();
  assert.equal((await premiere).statusCode, 200);
  assert.equal((await autre).statusCode, 200);
  assert.equal((await appel(app, antor, 'POST', url, { message: 'quatre' })).statusCode, 200);
});

test('délai : un transport qui ne rend rien rend 502 et libère le verrou', async () => {
  const { app, antor, base } = await monter();
  app.assistantDeps.delaiMs = 30;
  app.assistantDeps.transport = { nom: 'bloque', repondre: () => new Promise<string>(() => {}) };
  const url = `${base}/assistant/messages`;
  assert.equal((await appel(app, antor, 'POST', url, { message: 'x' })).statusCode, 502);
  assert.equal((await appel(app, antor, 'POST', url, { message: 'x' })).statusCode, 502);
});

test('fuite : le jeton et les identifiants de compte ne sortent pas', async () => {
  const { app, antor, base } = await monter();
  app.assistantDeps.config = { CLAUDE_CODE_OAUTH_TOKEN: 'sk-secret-jeton' };
  app.assistantDeps.transport = { nom: 'casse', repondre: async () => { throw new Error('sk-secret-jeton'); } };
  const r = await appel(app, antor, 'POST', `${base}/assistant/messages`, { message: 'x' });
  assert.equal(r.statusCode, 502);
  assert.ok(!r.body.includes('sk-secret-jeton'));
  const g = await appel(app, antor, 'GET', `${base}/assistant`);
  assert.deepEqual(Object.keys(g.json()).sort(), ['catalogue', 'disponible']);
});
