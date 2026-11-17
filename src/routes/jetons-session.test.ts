import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { trouverCompte } = await import('../services/comptes.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
type Any = Record<string, any>;

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

const appel = (app: App, h: H | undefined, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

/** antor owns « Lame » (teo GM, lea player) ; mira owns « Brume » ; admin is the instance admin. */
async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const teo = await connecter(app, 'teo');
  const lea = await connecter(app, 'lea');
  const mira = await connecter(app, 'mira');
  const admin = await connecter(app, 'admin');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json() as Any;
  for (const [username, role] of [['teo', 'mj'], ['lea', 'joueur']] as const) {
    assert.equal((await appel(app, antor, 'POST', `/api/univers/${lame.id}/membres`, { username, role })).statusCode, 201);
  }
  const brume = (await appel(app, mira, 'POST', '/api/univers', { nom: 'Brume' })).json() as Any;
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const tous = { tous: true, niveauTous: 'lecture' };
  const creer = (h: H, payload: object = { nom: 'Script', dureeJours: 30, acces: tous }) => appel(app, h, 'POST', '/api/compte/jetons', payload);
  return { app, antor, teo, lea, mira, admin, lame, brume, id, tous, creer };
}

test('compte : création 201 avec la valeur, une seule fois ; la liste la retrouve sans valeur', async () => {
  const m = await monter();
  const r = await m.creer(m.antor);
  assert.equal(r.statusCode, 201, r.body);
  const { jeton, valeur } = r.json();
  assert.match(valeur, /^kvs_/);
  assert.equal(jeton.nom, 'Script');
  assert.equal(jeton.compteId, m.id('antor'));
  const l = await appel(m.app, m.antor, 'GET', '/api/compte/jetons');
  assert.equal(l.statusCode, 200);
  assert.ok(!l.body.includes(valeur), 'no value in the list');
  assert.ok(!(await appel(m.app, m.antor, 'GET', '/api/instance/jetons')).body.includes(valeur));
  assert.equal(l.json().jetons.length, 1);
  assert.equal(l.json().jetons[0].id, jeton.id);
  assert.equal(l.json().jetons[0].etat, 'actif');
  const p = await appel(m.app, m.antor, 'PATCH', `/api/compte/jetons/${jeton.id}`, { acces: m.tous });
  const d = await appel(m.app, m.antor, 'DELETE', `/api/compte/jetons/${jeton.id}`);
  assert.ok(!p.body.includes(valeur) && !d.body.includes(valeur), 'nor in the change nor the revocation');
});

test('compte : la liste rend les univers choisissables (id, clé, nom, rôle), ceux du propriétaire seuls', async () => {
  const m = await monter();
  const u = (await appel(m.app, m.teo, 'GET', '/api/compte/jetons')).json().univers as Any[];
  assert.deepEqual(u.map((x) => Object.keys(x).sort()), [['cle', 'id', 'nom', 'role']]);
  assert.equal(u[0]!.nom, 'Lame');
  assert.equal(u[0]!.role, 'mj');
  assert.equal(u[0]!.id, m.lame.id);
  assert.equal(typeof u[0]!.cle, 'string');
  const lea = (await appel(m.app, m.lea, 'GET', '/api/compte/jetons')).json().univers as Any[];
  assert.deepEqual(lea.map((x) => x.role), ['joueur']);
  assert.ok(!JSON.stringify(u).includes('Brume'), 'an universe the account is not in is not offered');
});

test('compte : changer les accès, puis lire le résultat', async () => {
  const m = await monter();
  const { jeton } = (await m.creer(m.antor)).json();
  const acces = { tous: false, univers: [{ universId: m.lame.id, niveau: 'ecriture' }] };
  const r = await appel(m.app, m.antor, 'PATCH', `/api/compte/jetons/${jeton.id}`, { acces });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().jeton.tous, false);
  assert.deepEqual(r.json().jeton.univers.map((u: Any) => [u.universId, u.niveau]), [[m.lame.id, 'ecriture']]);
  assert.equal(r.json().jeton.modifieParAdmin, null);
  const l = (await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons[0];
  assert.equal(l.tous, false);
});

test('compte : révocation, puis 401 jeton_invalide sur /api/v1/univers/<clé> et 409 jeton_revoque sur un nouveau changement', async () => {
  const m = await monter();
  const { jeton, valeur } = (await m.creer(m.antor)).json();
  const h = { authorization: `Bearer ${valeur}` };
  const cle = m.lame.cle;
  const avant = await m.app.inject({ method: 'GET', url: `/api/v1/univers/${cle}`, headers: h });
  assert.equal(avant.statusCode, 200, avant.body);
  const r = await appel(m.app, m.antor, 'DELETE', `/api/compte/jetons/${jeton.id}`);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().jeton.revoquePar, m.id('antor'));
  assert.ok(r.json().jeton.revoqueLe);
  const apres = await m.app.inject({ method: 'GET', url: `/api/v1/univers/${cle}`, headers: h });
  assert.equal(apres.statusCode, 401);
  assert.equal(apres.json().code, 'jeton_invalide');
  const p = await appel(m.app, m.antor, 'PATCH', `/api/compte/jetons/${jeton.id}`, { acces: m.tous });
  assert.equal(p.statusCode, 409);
  assert.equal(p.json().code, 'jeton_revoque', 'the code leaves in `code`');
  assert.equal((await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons[0].etat, 'revoque');
});

test('compte : le jeton d’un autre est 404 en changement et en révocation, sans effet — admin compris', async () => {
  const m = await monter();
  const { jeton, valeur } = (await m.creer(m.antor)).json();
  for (const h of [m.mira, m.teo, m.admin]) {
    assert.equal((await appel(m.app, h, 'PATCH', `/api/compte/jetons/${jeton.id}`, { acces: m.tous })).statusCode, 404);
    assert.equal((await appel(m.app, h, 'DELETE', `/api/compte/jetons/${jeton.id}`)).statusCode, 404);
    assert.equal((await appel(m.app, h, 'GET', '/api/compte/jetons')).json().jetons.length, 0, 'not in their list');
  }
  assert.equal((await m.app.inject({ method: 'GET', url: `/api/v1/univers/${m.lame.cle}`, headers: { authorization: `Bearer ${valeur}` } })).statusCode, 200);
  assert.equal((await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons[0].modifieParAdmin, null);
});

test('compte : un MJ de l’univers ne voit ni ne révoque les jetons qui l’atteignent', async () => {
  const m = await monter();
  const { jeton } = (await m.creer(m.antor)).json();
  assert.equal((await appel(m.app, m.teo, 'GET', '/api/compte/jetons')).json().jetons.length, 0);
  assert.equal((await appel(m.app, m.teo, 'DELETE', `/api/compte/jetons/${jeton.id}`)).statusCode, 404);
  assert.equal((await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons[0].etat, 'actif');
});

test('compte : identifiant inconnu ou illisible → 404 ; sans session → 401', async () => {
  const m = await monter();
  for (const id of ['99999', 'abc']) {
    assert.equal((await appel(m.app, m.antor, 'DELETE', `/api/compte/jetons/${id}`)).statusCode, 404, id);
    assert.equal((await appel(m.app, m.antor, 'PATCH', `/api/compte/jetons/${id}`, { acces: m.tous })).statusCode, 404, id);
  }
  for (const [method, url] of [['GET', '/api/compte/jetons'], ['POST', '/api/compte/jetons'], ['DELETE', '/api/compte/jetons/1'], ['GET', '/api/instance/jetons']] as const) {
    assert.equal((await appel(m.app, undefined, method, url, {})).statusCode, 401, `${method} ${url}`);
  }
});

test('compte : saisie invalide → 400 avec `champ`, aucun jeton créé', async () => {
  const m = await monter();
  const cas: [object, string][] = [
    [{ nom: '', dureeJours: 30, acces: m.tous }, 'nom'],
    [{ nom: '   ', dureeJours: 30, acces: m.tous }, 'nom'],
    [{ dureeJours: 30, acces: m.tous }, 'nom'],
    [{ nom: 'x', dureeJours: 15, acces: m.tous }, 'duree'],
    [{ nom: 'x', acces: m.tous }, 'duree'],
    [{ nom: 'x', dureeJours: 30 }, 'acces'],
    [{ nom: 'x', dureeJours: 30, acces: { tous: true } }, 'acces'],
    [{ nom: 'x', dureeJours: 30, acces: { tous: true, niveauTous: 'aucun' } }, 'acces'],
    [{ nom: 'x', dureeJours: 30, acces: { tous: false, univers: [] } }, 'acces'],
    [{ nom: 'x', dureeJours: 30, acces: { tous: false, univers: [{ universId: 1, niveau: 'aucun' }] } }, 'acces'],
    [{ nom: 'x', dureeJours: 30, acces: 'tous' }, 'acces'],
    [{ nom: 'x', dureeJours: 30, acces: { tous: false, univers: [{ universId: m.brume.id, niveau: 'lecture' }] } }, 'acces'],
    [{ nom: 'x', dureeJours: 30, acces: { tous: false, univers: [{ universId: m.lame.id, niveau: 'lecture' }, { universId: m.lame.id, niveau: 'ecriture' }] } }, 'acces'],
  ];
  for (const [payload, champ] of cas) {
    const r = await m.creer(m.antor, payload);
    assert.equal(r.statusCode, 400, JSON.stringify(payload) + r.body);
    assert.equal(r.json().champ, champ, JSON.stringify(payload));
  }
  assert.equal((await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons.length, 0);
});

test('compte : un changement invalide est 400 avec `champ` et laisse les accès', async () => {
  const m = await monter();
  const { jeton } = (await m.creer(m.antor)).json();
  const r = await appel(m.app, m.antor, 'PATCH', `/api/compte/jetons/${jeton.id}`, { acces: { tous: false, univers: [{ universId: m.brume.id, niveau: 'ecriture' }] } });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().champ, 'acces');
  assert.equal((await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons[0].tous, true);
});

test('instance : un non-admin reçoit 404 identique à une adresse inconnue, toute méthode, avant toute validation', async () => {
  const m = await monter();
  const { jeton } = (await m.creer(m.antor)).json();
  const inconnue = await appel(m.app, m.antor, 'GET', '/api/instance/nexiste-pas');
  const cas: ['GET' | 'PATCH' | 'DELETE' | 'POST', string, object?][] = [
    ['GET', '/api/instance/jetons'],
    ['GET', '/api/instance/jetons?proprietaire=abc'],
    ['PATCH', `/api/instance/jetons/${jeton.id}`, { acces: m.tous }],
    ['PATCH', `/api/instance/jetons/${jeton.id}`, { acces: 'n’importe quoi' }],
    ['PATCH', '/api/instance/jetons/abc', {}],
    ['DELETE', `/api/instance/jetons/${jeton.id}`],
    ['DELETE', '/api/instance/jetons/abc'],
    ['POST', '/api/instance/jetons', {}],
  ];
  for (const h of [m.antor, m.teo, m.lea]) {
    for (const [method, url, payload] of cas) {
      const r = await appel(m.app, h, method, url, payload);
      assert.equal(r.statusCode, 404, `${method} ${url}`);
      assert.equal(r.body, inconnue.body, `${method} ${url}: same body as an unknown path`);
    }
  }
  const apres = (await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons[0];
  assert.equal(apres.etat, 'actif');
  assert.equal(apres.modifieParAdmin, null);
});

test('instance : l’admin liste tous les jetons, filtre par propriétaire, avec les univers de chaque propriétaire', async () => {
  const m = await monter();
  const a = (await m.creer(m.antor, { nom: 'A', dureeJours: 30, acces: m.tous })).json().jeton;
  const b = (await m.creer(m.mira, { nom: 'B', dureeJours: 7, acces: m.tous })).json().jeton;
  const l = await appel(m.app, m.admin, 'GET', '/api/instance/jetons');
  assert.equal(l.statusCode, 200, l.body);
  const jetons = l.json().jetons as Any[];
  assert.deepEqual(jetons.map((j) => j.id).sort(), [a.id, b.id].sort());
  assert.deepEqual(Object.keys(l.json().univers).sort(), [String(m.id('antor')), String(m.id('mira'))].sort());
  assert.deepEqual(l.json().univers[m.id('mira')].map((u: Any) => u.nom), ['Brume']);
  assert.ok(!l.json().univers[m.id('mira')].some((u: Any) => u.nom === 'Lame'));
  const f = (await appel(m.app, m.admin, 'GET', `/api/instance/jetons?proprietaire=${m.id('mira')}`)).json();
  assert.deepEqual(f.jetons.map((j: Any) => j.id), [b.id]);
  assert.equal(f.jetons[0].proprietaire, 'mira');
  assert.equal((await appel(m.app, m.admin, 'GET', '/api/instance/jetons?proprietaire=99999')).json().jetons.length, 0);
});

test('instance : l’admin change les accès d’un jeton d’autrui (« modifié par l’admin »), puis le propriétaire qui enregistre efface la marque', async () => {
  const m = await monter();
  const { jeton } = (await m.creer(m.antor)).json();
  const acces = { tous: false, univers: [{ universId: m.lame.id, niveau: 'lecture' }] };
  const r = await appel(m.app, m.admin, 'PATCH', `/api/instance/jetons/${jeton.id}`, { acces });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().jeton.modifieParAdmin.par, m.id('admin'));
  assert.equal(r.json().jeton.compteId, m.id('antor'), 'still the owner\'s');
  const vu = (await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons[0];
  assert.equal(vu.modifieParAdmin.par, m.id('admin'), 'visible in the owner’s list');
  assert.equal(vu.tous, false);
  const rendu = await appel(m.app, m.antor, 'PATCH', `/api/compte/jetons/${jeton.id}`, { acces });
  assert.equal(rendu.json().jeton.modifieParAdmin, null);
  // the admin may only choose among universes the OWNER belongs to
  const hors = await appel(m.app, m.admin, 'PATCH', `/api/instance/jetons/${jeton.id}`, { acces: { tous: false, univers: [{ universId: m.brume.id, niveau: 'lecture' }] } });
  assert.equal(hors.statusCode, 400);
  assert.equal(hors.json().champ, 'acces');
});

test('instance : l’admin révoque (« révoqué par l’admin »), le jeton reçoit 401 jeton_invalide ; jeton inconnu 404, saisie invalide 400', async () => {
  const m = await monter();
  const { jeton, valeur } = (await m.creer(m.antor)).json();
  assert.equal((await appel(m.app, m.admin, 'DELETE', '/api/instance/jetons/99999')).statusCode, 404);
  assert.equal((await appel(m.app, m.admin, 'PATCH', `/api/instance/jetons/${jeton.id}`, { acces: 3 })).statusCode, 400);
  const r = await appel(m.app, m.admin, 'DELETE', `/api/instance/jetons/${jeton.id}`);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().jeton.revoquePar, m.id('admin'));
  const vu = (await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons[0];
  assert.equal(vu.etat, 'revoque');
  assert.equal(vu.revoquePar, m.id('admin'), 'the owner sees who revoked it');
  const apres = await m.app.inject({ method: 'GET', url: `/api/v1/univers/${m.lame.cle}`, headers: { authorization: `Bearer ${valeur}` } });
  assert.equal(apres.statusCode, 401);
  assert.equal(apres.json().code, 'jeton_invalide');
  assert.equal((await appel(m.app, m.admin, 'PATCH', `/api/instance/jetons/${jeton.id}`, { acces: m.tous })).json().code, 'jeton_revoque');
});

test('les routes d’E-18 par univers sont retirées ; les lots restent', async () => {
  const m = await monter();
  const u = m.lame.id;
  const inconnue = (await appel(m.app, m.antor, 'GET', `/api/univers/${u}/nexiste-pas`)).statusCode;
  for (const [method, url] of [
    ['GET', `/api/univers/${u}/jetons`],
    ['GET', `/api/univers/${u}/jetons/outils`],
    ['POST', `/api/univers/${u}/jetons`],
    ['POST', `/api/univers/${u}/jetons/1/revoquer`],
  ] as const) {
    const r = await appel(m.app, m.antor, method, url, { nom: 'x', dureeJours: 30 });
    assert.equal(r.statusCode, inconnue, `${method} ${url}`);
  }
  assert.equal((await appel(m.app, m.antor, 'GET', `/api/univers/${u}/lots`)).statusCode, 200);
  assert.equal((await appel(m.app, m.lea, 'GET', `/api/univers/${u}/lots`)).statusCode, 404);
});

test('B-46 : les actifs tous, puis les révoqués jusqu’à 20 en tout (compte) ; l’instance garde 20 inactifs en plus', async () => {
  const m = await monter();
  for (let i = 0; i < 25; i++) assert.equal((await m.creer(m.antor, { nom: `j${i}`, dureeJours: 30, acces: m.tous })).statusCode, 201);
  const l = (await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons as Any[];
  assert.equal(l.length, 25, 'the 25 active ones, even past 20');
  for (const j of l.slice(0, 22)) assert.equal((await appel(m.app, m.antor, 'DELETE', `/api/compte/jetons/${j.id}`)).statusCode, 200);
  const apres = (await appel(m.app, m.antor, 'GET', '/api/compte/jetons')).json().jetons as Any[];
  assert.equal(apres.length, 20, '3 active + 17 revoked');
  assert.equal(apres.filter((j) => j.etat === 'actif').length, 3);
  const inst = (await appel(m.app, m.admin, 'GET', '/api/instance/jetons')).json().jetons as Any[];
  assert.equal(inst.length, 23, '3 active + the 20 latest revoked');
});
