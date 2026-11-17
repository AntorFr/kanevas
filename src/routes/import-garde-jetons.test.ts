import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { changerRoleNoyau, ajouterMembreNoyau, retirerMembreNoyau } = await import('../services/membres.js');
const { cleDeUnivers } = await import('../services/cles.js');

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
  const res = await app.inject({
    method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  await connecter(app, 'lea');
  const cree = async (nom: string) =>
    (await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom } })).json() as { lotId: number };
  const u = await cree('Alpha');
  const v = await cree('Beta');
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const cle = (x: { id: number }) => cleDeUnivers(app.db, x.id)!;
  const bearer = (valeur: string) => ({ authorization: `Bearer ${valeur}` });
  const jeton = (acces: Parameters<typeof creerJeton>[2], compte = 'antor') =>
    creerJeton(app.db, id(compte), { nom: 'T', dureeJours: 30, acces } as never, app.horloge());
  return { app, antor, u, v, id, cle, bearer, jeton };
}

const INVALIDE = { message: 'Jeton invalide.', code: 'jeton_invalide' };
const PREFIXES = (u: string) => [`/api/v1/univers/${u}`, `/api/import/v1/univers/${u}`];

test('lecture : GET contexte 200 par clé et par id, sous les deux préfixes', async () => {
  const { app, u, cle, bearer, jeton } = await monter();
  const { valeur } = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'lecture' }] } as never);
  for (const ref of [cle(u), String(u.id)]) {
    for (const base of PREFIXES(ref)) {
      const r = await app.inject({ method: 'GET', url: base, headers: bearer(valeur) });
      assert.equal(r.statusCode, 200, `${base}: ${r.body}`);
      assert.equal(r.json().univers.id, u.id);
    }
  }
});

test('lecture : PUT fichier, POST lots, PUT fiche, DELETE → 403 lecture_seule sous les deux préfixes, rien n’est écrit', async () => {
  const { app, u, cle, bearer, jeton } = await monter();
  const { valeur } = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'lecture' }] } as never);
  for (const base of PREFIXES(cle(u))) {
    for (const [method, suite] of [
      ['PUT', '/fichiers/abc'], ['POST', '/lots'], ['PUT', '/fiches/x'], ['DELETE', '/fiches/x'],
      ['POST', '/fiches/x/relations'], ['POST', '/lots/1/clore'],
    ] as const) {
      const r = await app.inject({ method, url: base + suite, headers: bearer(valeur), payload: method === 'PUT' && suite.startsWith('/fiches') ? { titre: 'T', type: 'personnage' } : undefined });
      assert.equal(r.statusCode, 403, `${method} ${base}${suite}: ${r.body}`);
      assert.equal(r.json().code, 'lecture_seule');
    }
  }
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM lots_import').get() as { n: number }).n, 0);
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(u.id) as { n: number }).n, 0);
});

test('écriture : POST lots 201 sous les deux préfixes', async () => {
  const { app, u, cle, bearer, jeton } = await monter();
  const { valeur } = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never);
  const r = await app.inject({ method: 'POST', url: `/api/v1/univers/${cle(u)}/lots`, headers: bearer(valeur) });
  assert.equal(r.statusCode, 201, r.body);
  const r2 = await app.inject({ method: 'POST', url: `/api/import/v1/univers/${u.id}/lots`, headers: bearer(valeur) });
  assert.ok([200, 201].includes(r2.statusCode), r2.body);
});

test('tous : un univers où le compte devient membre après la création est atteint ; exception aucun → 404 pour lui seul', async () => {
  const { app, u, v, cle, bearer, jeton } = await monter();
  const { valeur } = jeton({ tous: true, niveauTous: 'lecture' } as never, 'lea');
  const avant = await app.inject({ method: 'GET', url: `/api/v1/univers/${cle(u)}`, headers: bearer(valeur) });
  assert.equal(avant.statusCode, 404);
  ajouterMembreNoyau(app.db, u.id, 'lea', 'joueur');
  const apres = await app.inject({ method: 'GET', url: `/api/v1/univers/${cle(u)}`, headers: bearer(valeur) });
  assert.equal(apres.statusCode, 200, apres.body);
  // exception
  const ex = jeton({ tous: true, niveauTous: 'ecriture', univers: [{ universId: u.id, niveau: 'aucun' }] } as never, 'antor');
  const h = bearer(ex.valeur);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/univers/${cle(u)}`, headers: h })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/import/v1/univers/${u.id}`, headers: h })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/univers/${cle(v)}`, headers: h })).statusCode, 200);
});

test('403 lecture_seule avant tout service, 404 avant 403 : univers inconnu ou hors d’atteinte reste 404 même en écriture', async () => {
  const { app, bearer, jeton, u } = await monter();
  const { valeur } = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'lecture' }] } as never);
  for (const ref of ['zzz-inconnu', '999999']) {
    const r = await app.inject({ method: 'POST', url: `/api/v1/univers/${ref}/lots`, headers: bearer(valeur) });
    assert.equal(r.statusCode, 404, r.body);
  }
});

test('jeton révoqué, expiré, inconnu, sans en-tête, cookie seul : 401 jeton_invalide identique, sous les deux préfixes', async () => {
  const { app, antor, u, id, cle, bearer, jeton } = await monter();
  const acces = { tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never;
  const rev = jeton(acces);
  revoquerJeton(app.db, { compteId: id('antor') }, rev.jeton.id);
  const exp = jeton(acces);
  app.db.prepare('UPDATE jetons_api SET cree_le = ?, expire_le = ? WHERE id = ?').run('1999-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z', exp.jeton.id);
  for (const base of PREFIXES(cle(u))) {
    for (const headers of [bearer(rev.valeur), bearer(exp.valeur), bearer('kvs_inconnu'), {}, antor, { authorization: 'Basic abc' }] as Record<string, string>[]) {
      const r = await app.inject({ method: 'GET', url: base, headers });
      assert.equal(r.statusCode, 401);
      assert.deepEqual(r.json(), INVALIDE);
    }
  }
});

test('compte devenu joueur avec un jeton écriture : pas de 5xx, refus d’écriture d’import, lecture de joueur', async () => {
  const { app, u, id, cle, bearer, jeton } = await monter();
  ajouterMembreNoyau(app.db, u.id, 'lea', 'mj');
  const { valeur } = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never, 'lea');
  changerRoleNoyau(app.db, u.id, id('lea'), 'joueur');
  const g = await app.inject({ method: 'GET', url: `/api/v1/univers/${cle(u)}`, headers: bearer(valeur) });
  assert.equal(g.statusCode, 200, g.body);
  for (const [method, suite] of [['POST', '/lots'], ['PUT', '/fiches/x'], ['PUT', '/fichiers/x']] as const) {
    const r = await app.inject({ method, url: `/api/v1/univers/${cle(u)}${suite}`, headers: bearer(valeur), payload: method === 'PUT' && suite === '/fiches/x' ? { titre: 'T', type: 'personnage' } : undefined });
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `${method} ${suite}: ${r.statusCode} ${r.body}`);
  }
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(u.id) as { n: number }).n, 0);
});

test('un jeton qui perd son rôle dans un univers : 404 là, 200 ailleurs', async () => {
  const { app, u, v, id, cle, bearer, jeton } = await monter();
  ajouterMembreNoyau(app.db, u.id, 'lea', 'mj');
  ajouterMembreNoyau(app.db, v.id, 'lea', 'mj');
  const { valeur } = jeton({ tous: true, niveauTous: 'ecriture' } as never, 'lea');
  retirerMembreNoyau(app.db, u.id, id('lea'));
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/univers/${cle(u)}`, headers: bearer(valeur) })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/univers/${cle(u)}/lots`, headers: bearer(valeur) })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/univers/${cle(v)}`, headers: bearer(valeur) })).statusCode, 200);
});

test('jeton d’outils : 401 jeton_invalide sur /api/v1/univers/<clé>/ et sur l’alias ', async () => {
  const { app, u, cle, bearer, jeton } = await monter();
  const { valeur, jeton: j } = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never);
  app.db.prepare('INSERT INTO jetons_outils (jeton_id, outil) VALUES (?, ?)').run(j.id, 'swn/galaxie');
  for (const base of PREFIXES(cle(u))) {
    const r = await app.inject({ method: 'GET', url: base, headers: bearer(valeur) });
    assert.equal(r.statusCode, 401, r.body);
    assert.deepEqual(r.json(), INVALIDE);
  }
});

test('lot : un jeton de joueur ne lit ni ne clôt le lot du MJ (404), le MJ et le jeton propriétaire le font', async () => {
  const { app, u, cle, bearer, jeton } = await monter();
  const base = `/api/v1/univers/${cle(u)}`;
  const mj = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never);
  const lot = (await app.inject({ method: 'POST', url: `${base}/lots`, headers: bearer(mj.valeur) })).json() as { lotId: number };
  ajouterMembreNoyau(app.db, u.id, 'lea', 'joueur');
  const joueur = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never, 'lea');
  const lu = await app.inject({ method: 'GET', url: `${base}/lots/${lot.lotId}`, headers: bearer(joueur.valeur) });
  assert.equal(lu.statusCode, 404, lu.body);
  const clos = await app.inject({ method: 'POST', url: `${base}/lots/${lot.lotId}/clore`, headers: bearer(joueur.valeur) });
  assert.equal(clos.statusCode, 404, clos.body);
  assert.equal((app.db.prepare('SELECT clos_le FROM lots_import WHERE id = ?').get(lot.lotId) as { clos_le: string | null }).clos_le, null);
  // même silence qu'un lot inconnu
  const inconnu = await app.inject({ method: 'GET', url: `${base}/lots/999999`, headers: bearer(joueur.valeur) });
  assert.equal(inconnu.statusCode, 404);
  assert.equal(inconnu.body, lu.body);
  // le propriétaire et un autre jeton MJ lisent
  assert.equal((await app.inject({ method: 'GET', url: `${base}/lots/${lot.lotId}`, headers: bearer(mj.valeur) })).statusCode, 200);
  const autreMj = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'lecture' }] } as never);
  assert.equal((await app.inject({ method: 'GET', url: `${base}/lots/${lot.lotId}`, headers: bearer(autreMj.valeur) })).statusCode, 200);
});

test('lot : un MJ devenu joueur relit le lot que son jeton a ouvert', async () => {
  const { app, u, id, cle, bearer, jeton } = await monter();
  const base = `/api/v1/univers/${cle(u)}`;
  ajouterMembreNoyau(app.db, u.id, 'lea', 'mj');
  const t = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never, 'lea');
  const lot = (await app.inject({ method: 'POST', url: `${base}/lots`, headers: bearer(t.valeur) })).json() as { lotId: number };
  changerRoleNoyau(app.db, u.id, id('lea'), 'joueur');
  assert.equal((await app.inject({ method: 'GET', url: `${base}/lots/${lot.lotId}`, headers: bearer(t.valeur) })).statusCode, 200);
});

test('fiche existante : un jeton de joueur en écriture ne la modifie pas par PUT /fiches/:cle, fichiers joints à une section MJ compris', async () => {
  const { app, u, cle, bearer, jeton } = await monter();
  const base = `/api/v1/univers/${cle(u)}`;
  const mj = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never);
  const section = { cle: 'sec', titre: 'Secret', contenu: 'x', joueursLisent: false, joueursEcrivent: false };
  const p = await app.inject({ method: 'PUT', url: `${base}/fiches/pnj`, headers: bearer(mj.valeur), payload: { titre: 'Original', type: 'personnage', sections: [section] } });
  assert.ok(p.statusCode < 300, p.body);
  ajouterMembreNoyau(app.db, u.id, 'lea', 'joueur');
  const joueur = jeton({ tous: false, univers: [{ universId: u.id, niveau: 'ecriture' }] } as never, 'lea');
  for (const payload of [
    { titre: 'Pris', type: 'personnage' },
    { titre: 'Original', type: 'personnage', sections: [{ ...section, fichiers: ['portrait'] }] },
  ]) {
    const r = await app.inject({ method: 'PUT', url: `${base}/fiches/pnj`, headers: bearer(joueur.valeur), payload });
    assert.equal(r.statusCode, 403, r.body);
  }
  assert.equal((app.db.prepare('SELECT titre FROM fiches WHERE univers_id = ?').get(u.id) as { titre: string }).titre, 'Original');
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fichiers_attente WHERE univers_id = ?').get(u.id) as { n: number }).n, 0);
});
