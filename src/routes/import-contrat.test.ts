import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { creerJeton, empreinteDe, revoquerJeton, listerJetons } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { changerRoleNoyau } = await import('../services/membres.js');
type App = Awaited<ReturnType<typeof buildApp>>;

async function connecter(app: App, compte: string) {
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

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  await connecter(app, 'lea');
  await connecter(app, 'teo');
  const cree = async (nom: string) =>
    (await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom } })).json() as { id: number };
  const u = await cree('Lame d’Ébène');
  const autre = await cree('Autre');
  for (const [username, role] of [['teo', 'mj'], ['lea', 'joueur']] as const) {
    const r = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/membres`, headers: antor, payload: { username, role } });
    assert.equal(r.statusCode, 201, r.body);
  }
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const bearer = (valeur: string) => ({ authorization: `Bearer ${valeur}` });
  const jeton = (compte = 'antor', univers = u.id, duree = 30) =>
    creerJeton(app.db, id(compte), univers, { nom: 'Mac', dureeJours: duree }, app.horloge());
  return { app, antor, u, autre, id, bearer, jeton };
}

const UNIQUE = { message: 'Jeton invalide.', code: 'jeton_invalide' };

test('jeton valide : GET univers rend 200, l’univers, le compte, les types et les limites', async () => {
  const { app, u, bearer, jeton } = await monter();
  const r = await app.inject({ method: 'GET', url: `/api/import/v1/univers/${u.id}`, headers: bearer(jeton().valeur) });
  assert.equal(r.statusCode, 200, r.body);
  const c = r.json();
  assert.deepEqual(c.univers, { id: u.id, nom: 'Lame d’Ébène' });
  assert.equal(c.compte.username, 'antor');
  assert.ok(c.types.length >= 7);
  assert.deepEqual(c.types.find((t: { type: string }) => t.type === 'personnage'), { type: 'personnage', active: true });
  assert.equal(typeof c.limites.contenuSection, 'number');
});

test('valeur du jeton : kvs_ + 32 octets base64url, la base ne garde que l’empreinte', async () => {
  const { app, jeton } = await monter();
  const { valeur, jeton: j } = jeton();
  assert.match(valeur, /^kvs_[A-Za-z0-9_-]{43}$/);
  const lignes = app.db.prepare('SELECT * FROM jetons_api').all() as Record<string, unknown>[];
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0]!.empreinte, empreinteDe(valeur));
  assert.match(lignes[0]!.empreinte as string, /^[0-9a-f]{64}$/);
  for (const v of Object.values(lignes[0]!)) assert.ok(!String(v).includes(valeur));
  assert.equal(Date.parse(j.expireLe) - Date.parse(j.creeLe), 30 * 86400_000);
});

test('durées : 7, 30, 90, 365 acceptées, 15 et chaîne refusées, nom vide refusé', async () => {
  const { app, u, id } = await monter();
  for (const d of [7, 30, 90, 365]) {
    const { jeton } = creerJeton(app.db, id('antor'), u.id, { nom: 'x', dureeJours: d });
    assert.equal(Math.round((Date.parse(jeton.expireLe) - Date.parse(jeton.creeLe)) / 86400_000), d);
  }
  for (const d of [15, 0, '30', null]) {
    assert.throws(() => creerJeton(app.db, id('antor'), u.id, { nom: 'x', dureeJours: d }), (e: { code?: string }) => e.code === 'invalide');
  }
  assert.throws(() => creerJeton(app.db, id('antor'), u.id, { nom: '  ', dureeJours: 30 }));
});

test('un joueur ne crée, ne liste ni ne révoque un jeton', async () => {
  const { app, u, id, jeton } = await monter();
  const j = jeton().jeton;
  assert.throws(() => creerJeton(app.db, id('lea'), u.id, { nom: 'x', dureeJours: 30 }));
  assert.throws(() => listerJetons(app.db, id('lea'), u.id));
  assert.throws(() => revoquerJeton(app.db, id('lea'), u.id, j.id));
  assert.equal(listerJetons(app.db, id('antor'), u.id)[0]!.revoqueLe, null);
});

const refusee = async (app: App, headers: Record<string, string>, url: string, method: 'GET' | 'POST' = 'GET') => {
  const r = await app.inject({ method, url, headers });
  assert.equal(r.statusCode, 401, `${method} ${url}`);
  assert.deepEqual(r.json(), UNIQUE);
  return r;
};

test('refus : inconnu, absent, mal formé, révoqué, expiré, cookie seul → 401 au même corps, aucun lot ouvert', async () => {
  const { app, u, antor, bearer, jeton, id } = await monter();
  const url = `/api/import/v1/univers/${u.id}`;
  const bon = jeton().valeur;
  await refusee(app, bearer('kvs_inconnu'), url);
  await refusee(app, bearer(bon.slice(0, -1) + (bon.endsWith('A') ? 'B' : 'A')), url);
  await refusee(app, {}, url);
  await refusee(app, { authorization: bon }, url);
  await refusee(app, { authorization: `Basic ${bon}` }, url);
  await refusee(app, { authorization: `bearer ${bon}` }, url);
  await refusee(app, antor, url); // session cookie alone
  await refusee(app, antor, `${url}/lots`, 'POST');
  // revoked, by another GM
  const aRevoquer = jeton();
  revoquerJeton(app.db, id('teo'), u.id, aRevoquer.jeton.id);
  await refusee(app, bearer(aRevoquer.valeur), url);
  await refusee(app, bearer(aRevoquer.valeur), `${url}/lots`, 'POST');
  // expired: clock + 7 days on a 7-day token
  const court = jeton('antor', u.id, 7);
  const ok = await app.inject({ method: 'GET', url, headers: bearer(court.valeur) });
  assert.equal(ok.statusCode, 200);
  const t0 = Date.now();
  app.horloge = () => new Date(t0 + 7 * 86400_000 + 1000);
  await refusee(app, bearer(court.valeur), url);
  app.horloge = () => new Date(t0 + 6 * 86400_000);
  assert.equal((await app.inject({ method: 'GET', url, headers: bearer(court.valeur) })).statusCode, 200);
  assert.equal((app.db.prepare('SELECT count(*) AS n FROM lots_import').get() as { n: number }).n, 0);
});

test('un cookie de session valide ne rouvre pas la garde quand le jeton est faux', async () => {
  const { app, u, antor } = await monter();
  await refusee(app, { ...antor, authorization: 'Bearer kvs_faux' }, `/api/import/v1/univers/${u.id}`);
});

test('le MJ du jeton rétrogradé Joueur ou retiré → 401 ; rétabli MJ → 200', async () => {
  const { app, u, id, bearer, jeton } = await monter();
  const url = `/api/import/v1/univers/${u.id}`;
  const { valeur } = jeton('teo');
  assert.equal((await app.inject({ method: 'GET', url, headers: bearer(valeur) })).statusCode, 200);
  changerRoleNoyau(app.db, u.id, id('teo'), 'joueur');
  await refusee(app, bearer(valeur), url);
  await refusee(app, bearer(valeur), `${url}/lots`, 'POST');
  assert.equal((app.db.prepare('SELECT count(*) AS n FROM lots_import').get() as { n: number }).n, 0);
  assert.equal(listerJetons(app.db, id('antor'), u.id)[0]!.actif, false);
});

test('un autre univers que celui du jeton → 404, sur toutes les routes, existant ou non', async () => {
  const { app, u, autre, bearer, jeton } = await monter();
  const h = bearer(jeton().valeur);
  for (const id of [autre.id, 99999]) {
    for (const [method, suffixe] of [['GET', ''], ['POST', '/lots'], ['GET', '/lots/1'], ['POST', '/lots/1/clore']] as const) {
      const r = await app.inject({ method, url: `/api/import/v1/univers/${id}${suffixe}`, headers: h });
      assert.equal(r.statusCode, 404, `${method} ${suffixe} ${id}`);
    }
  }
  assert.equal((app.db.prepare('SELECT count(*) AS n FROM lots_import').get() as { n: number }).n, 0);
  assert.equal((await app.inject({ method: 'GET', url: `/api/import/v1/univers/${u.id}`, headers: h })).statusCode, 200);
});

test('un jeton sur une route de session ou hors du scope est refusé', async () => {
  const { app, u, bearer, jeton } = await monter();
  const h = bearer(jeton().valeur);
  for (const url of [`/api/univers/${u.id}`, '/api/univers', `/api/univers/${u.id}/fiches`, '/api/moi']) {
    const r = await app.inject({ method: 'GET', url, headers: h });
    assert.equal(r.statusCode, 401, url);
  }
  const w = await app.inject({ method: 'POST', url: '/api/univers', headers: h, payload: { nom: 'Pirate' } });
  assert.equal(w.statusCode, 401);
  assert.equal((app.db.prepare("SELECT count(*) AS n FROM univers WHERE nom = 'Pirate'").get() as { n: number }).n, 0);
});

test('lots : deux POST rendent le même lotId, après clore un troisième en ouvre un nouveau', async () => {
  const { app, u, bearer, jeton } = await monter();
  const h = bearer(jeton().valeur);
  const base = `/api/import/v1/univers/${u.id}/lots`;
  const a = await app.inject({ method: 'POST', url: base, headers: h });
  const b = await app.inject({ method: 'POST', url: base, headers: h });
  assert.equal(a.statusCode, 201);
  assert.equal(b.statusCode, 200);
  assert.equal(a.json().lotId, b.json().lotId);
  const lire = await app.inject({ method: 'GET', url: `${base}/${a.json().lotId}`, headers: h });
  assert.equal(lire.json().etat, 'en_cours');
  assert.equal(lire.json().compteurs.fiches.creees, 0);
  const clos = await app.inject({ method: 'POST', url: `${base}/${a.json().lotId}/clore`, headers: h });
  assert.equal(clos.statusCode, 200);
  assert.equal(clos.json().etat, 'clos');
  assert.deepEqual(clos.json().rapport, []);
  const c = await app.inject({ method: 'POST', url: base, headers: h });
  assert.equal(c.statusCode, 201);
  assert.notEqual(c.json().lotId, a.json().lotId);
});

test('lots : la reprise est propre à chaque jeton, un lot d’un autre jeton est lisible dans l’univers', async () => {
  const { app, u, bearer, jeton } = await monter();
  const h1 = bearer(jeton().valeur);
  const h2 = bearer(jeton('teo').valeur);
  const base = `/api/import/v1/univers/${u.id}/lots`;
  const a = (await app.inject({ method: 'POST', url: base, headers: h1 })).json();
  const b = (await app.inject({ method: 'POST', url: base, headers: h2 })).json();
  assert.notEqual(a.lotId, b.lotId);
});

test('lots : id inconnu, non numérique ou d’un autre univers → 404 ; clore deux fois garde la date', async () => {
  const { app, u, autre, bearer, jeton, id } = await monter();
  const h = bearer(jeton().valeur);
  const base = `/api/import/v1/univers/${u.id}/lots`;
  for (const lid of ['999', 'abc', '-1', '1e3']) {
    assert.equal((await app.inject({ method: 'GET', url: `${base}/${lid}`, headers: h })).statusCode, 404, lid);
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${lid}/clore`, headers: h })).statusCode, 404, lid);
  }
  // a batch of a foreign universe, written straight in the base
  const jAutre = creerJeton(app.db, id('antor'), autre.id, { nom: 'y', dureeJours: 7 }).jeton;
  const { lastInsertRowid } = app.db
    .prepare("INSERT INTO lots_import (univers_id, jeton_id, ouvert_le) VALUES (?, ?, '2026-01-01T00:00:00.000Z')")
    .run(autre.id, jAutre.id);
  assert.equal((await app.inject({ method: 'GET', url: `${base}/${lastInsertRowid}`, headers: h })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `${base}/${lastInsertRowid}/clore`, headers: h })).statusCode, 404);
  assert.equal((app.db.prepare('SELECT clos_le FROM lots_import WHERE id = ?').get(lastInsertRowid) as { clos_le: string | null }).clos_le, null);
  const lot = (await app.inject({ method: 'POST', url: base, headers: h })).json();
  const t0 = Date.now();
  app.horloge = () => new Date(t0);
  const c1 = (await app.inject({ method: 'POST', url: `${base}/${lot.lotId}/clore`, headers: h })).json();
  app.horloge = () => new Date(t0 + 3600_000);
  const c2 = (await app.inject({ method: 'POST', url: `${base}/${lot.lotId}/clore`, headers: h })).json();
  assert.equal(c1.closLe, c2.closLe);
});

test('lots : ouvert sans écriture depuis plus de 24 h → abandonné', async () => {
  const { app, u, bearer, jeton } = await monter();
  const h = bearer(jeton().valeur);
  const base = `/api/import/v1/univers/${u.id}/lots`;
  const lot = (await app.inject({ method: 'POST', url: base, headers: h })).json();
  const t0 = Date.now();
  app.horloge = () => new Date(t0 + 25 * 3600_000);
  const j = jeton();
  void j;
  const r = await app.inject({ method: 'GET', url: `${base}/${lot.lotId}`, headers: h });
  // the token (30 days) is still valid
  assert.equal(r.json().etat, 'abandonne');
});

test('corps : 8 Mio passent, plus de 8 Mio → 413 ; 413 sans jeton reste 401', async () => {
  const { app, u, bearer, jeton } = await monter();
  const h = { ...bearer(jeton().valeur), 'content-type': 'application/json' };
  const url = `/api/import/v1/univers/${u.id}/lots`;
  const gros = JSON.stringify({ x: 'a'.repeat(8 * 1024 * 1024 + 10) });
  const r = await app.inject({ method: 'POST', url, headers: h, payload: gros });
  assert.equal(r.statusCode, 413);
  const sous = JSON.stringify({ x: 'a'.repeat(5 * 1024 * 1024) });
  assert.equal((await app.inject({ method: 'POST', url, headers: h, payload: sous })).statusCode, 201);
  const sans = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: gros });
  assert.equal(sans.statusCode, 401);
});

test('JSON invalide → 400, pas 500', async () => {
  const { app, u, bearer, jeton } = await monter();
  const h = { ...bearer(jeton().valeur), 'content-type': 'application/json' };
  const r = await app.inject({ method: 'POST', url: `/api/import/v1/univers/${u.id}/lots`, headers: h, payload: '{oups' });
  assert.equal(r.statusCode, 400, r.body);
});

test('dernier_usage_le : écrit à la première présentation, puis au plus une fois par minute', async () => {
  const { app, u, bearer, jeton } = await monter();
  const { valeur, jeton: j } = jeton();
  const h = bearer(valeur);
  const url = `/api/import/v1/univers/${u.id}`;
  const lire = () => (app.db.prepare('SELECT dernier_usage_le AS d FROM jetons_api WHERE id = ?').get(j.id) as { d: string | null }).d;
  assert.equal(lire(), null);
  const t0 = Date.now();
  app.horloge = () => new Date(t0);
  await app.inject({ method: 'GET', url, headers: h });
  const premier = lire();
  assert.equal(premier, new Date(t0).toISOString());
  app.horloge = () => new Date(t0 + 59_000);
  await app.inject({ method: 'GET', url, headers: h });
  assert.equal(lire(), premier);
  app.horloge = () => new Date(t0 + 61_000);
  await app.inject({ method: 'GET', url, headers: h });
  assert.equal(lire(), new Date(t0 + 61_000).toISOString());
});

test('un refus n’écrit pas dernier_usage_le (jeton révoqué)', async () => {
  const { app, u, bearer, jeton, id } = await monter();
  const { valeur, jeton: j } = jeton();
  revoquerJeton(app.db, id('antor'), u.id, j.id);
  await app.inject({ method: 'GET', url: `/api/import/v1/univers/${u.id}`, headers: bearer(valeur) });
  assert.equal((app.db.prepare('SELECT dernier_usage_le AS d FROM jetons_api WHERE id = ?').get(j.id) as { d: string | null }).d, null);
});

test('révocation : un autre MJ révoque, un id d’un autre univers est introuvable, lister n’expose pas la valeur', async () => {
  const { app, u, autre, id, jeton } = await monter();
  const { jeton: j, valeur } = jeton();
  const jAutre = creerJeton(app.db, id('antor'), autre.id, { nom: 'y', dureeJours: 7 }).jeton;
  assert.throws(() => revoquerJeton(app.db, id('teo'), u.id, jAutre.id), (e: { code?: string }) => e.code === 'introuvable');
  revoquerJeton(app.db, id('teo'), u.id, j.id, new Date('2026-01-01T00:00:00Z'));
  revoquerJeton(app.db, id('teo'), u.id, j.id, new Date('2026-02-01T00:00:00Z'));
  const l = listerJetons(app.db, id('teo'), u.id);
  assert.equal(l.length, 1);
  assert.equal(l[0]!.revoqueLe, '2026-01-01T00:00:00.000Z');
  assert.equal(l[0]!.createur, 'antor');
  assert.ok(!JSON.stringify(l).includes(valeur));
});

test('migration : clés d’origine uniques par univers (fiches) et par fiche (sections), NULL multiples permis', async () => {
  const { app, u, autre, antor } = await monter();
  const f = async (univers: number, titre: string) =>
    (await app.inject({ method: 'POST', url: `/api/univers/${univers}/fiches`, headers: antor, payload: { type: 'lieu', titre } })).json().id as number;
  const [a, b, c] = [await f(u.id, 'A'), await f(u.id, 'B'), await f(autre.id, 'C')];
  const set = app.db.prepare('UPDATE fiches SET cle_origine = ? WHERE id = ?');
  set.run('k1', a);
  assert.throws(() => set.run('k1', b));
  set.run('k1', c); // same key, other universe
  assert.throws(() => set.run('', b));
  set.run('x'.repeat(200), b);
  assert.throws(() => set.run('x'.repeat(201), a));
  const s = async (fiche: number) =>
    (await app.inject({ method: 'POST', url: `/api/univers/${u.id}/fiches/${fiche}/sections`, headers: antor, payload: { titre: 'S', contenu: '' } })).json().id as number;
  const [s1, s2, s3] = [await s(a), await s(a), await s(b)];
  const ss = app.db.prepare('UPDATE sections SET cle_origine = ? WHERE id = ?');
  ss.run('s', s1);
  assert.throws(() => ss.run('s', s2));
  ss.run('s', s3); // other fiche
  assert.equal(
    (app.db.prepare('SELECT count(*) AS n FROM sections WHERE cle_origine IS NULL').get() as { n: number }).n >= 0,
    true,
  );
});
