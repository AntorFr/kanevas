import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { ouvrirLot, noterDansLot, cloreLot } = (await import('../services/lots.js')) as any;
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
  const lea = await connecter(app, 'lea');
  await connecter(app, 'teo');
  const u = (await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom: 'Lame' } })).json() as { id: number };
  for (const [username, role] of [['teo', 'mj'], ['lea', 'joueur']] as const) {
    const r = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/membres`, headers: antor, payload: { username, role } });
    assert.equal(r.statusCode, 201, r.body);
  }
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  return { app, antor, lea, u, id };
}

test('création : 201, valeur kvs_ une fois ; la liste et les lots ne la contiennent nulle part', async () => {
  const { app, antor, u } = await monter();
  const r = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/jetons`, headers: antor, payload: { nom: 'Script Kanka — Mac', dureeJours: 30 } });
  assert.equal(r.statusCode, 201, r.body);
  const { valeur, jeton } = r.json();
  assert.match(valeur, /^kvs_/);
  assert.equal(jeton.nom, 'Script Kanka — Mac');
  assert.equal(jeton.derniereUtilisationLe ?? jeton.deniereUtilisationLe ?? null, null);
  const l = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/jetons`, headers: antor });
  assert.equal(l.statusCode, 200);
  assert.ok(!l.body.includes(valeur));
  assert.equal(l.json().length, 1);
  const lots = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/lots`, headers: antor });
  assert.ok(!lots.body.includes(valeur));
});

test('nom vide ou durée hors liste : 400 invalide, aucun jeton créé', async () => {
  const { app, antor, u } = await monter();
  for (const payload of [{ nom: '', dureeJours: 30 }, { nom: '   ', dureeJours: 30 }, { dureeJours: 30 }, { nom: 'x', dureeJours: 15 }]) {
    const r = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/jetons`, headers: antor, payload });
    assert.equal(r.statusCode, 400, JSON.stringify(payload) + r.body);
  }
  const l = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/jetons`, headers: antor });
  assert.equal(l.json().length, 0);
});

test('nom vide : le message est « le nom est obligatoire. »', async () => {
  const { app, antor, u } = await monter();
  const r = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/jetons`, headers: antor, payload: { nom: '', dureeJours: 30 } });
  assert.match(r.json().message, /nom est obligatoire/i);
});

test('révocation : 204, la ligne passe revoquée et le jeton reçoit 401 sur l’API d’import', async () => {
  const { app, antor, u } = await monter();
  const c = (await app.inject({ method: 'POST', url: `/api/univers/${u.id}/jetons`, headers: antor, payload: { nom: 'x', dureeJours: 7 } })).json();
  const ok = await app.inject({ method: 'GET', url: `/api/import/v1/univers/${u.id}`, headers: { authorization: `Bearer ${c.valeur}` } });
  assert.equal(ok.statusCode, 200);
  const r = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/jetons/${c.jeton.id}/revoquer`, headers: antor });
  assert.equal(r.statusCode, 204, r.body);
  const l = (await app.inject({ method: 'GET', url: `/api/univers/${u.id}/jetons`, headers: antor })).json();
  assert.notEqual(l[0].revoqueLe, null);
  const ko = await app.inject({ method: 'GET', url: `/api/import/v1/univers/${u.id}`, headers: { authorization: `Bearer ${c.valeur}` } });
  assert.equal(ko.statusCode, 401);
});

test('Léa (Joueuse) : lire jetons et lots = 404 sans rien révéler ; écrire = refus, aucun jeton créé ni révoqué', async () => {
  const { app, antor, lea, u, id } = await monter();
  const { jeton } = creerJeton(app.db, id('antor'), u.id, { nom: 'Mac', dureeJours: 30 });
  for (const url of [`/api/univers/${u.id}/jetons`, `/api/univers/${u.id}/lots`]) {
    const r = await app.inject({ method: 'GET', url, headers: lea });
    assert.equal(r.statusCode, 404, url);
    assert.ok(!r.body.includes('Mac'));
  }
  const c = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/jetons`, headers: lea, payload: { nom: 'pirate', dureeJours: 30 } });
  assert.ok([403, 404].includes(c.statusCode), String(c.statusCode));
  const rv = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/jetons/${jeton.id}/revoquer`, headers: lea });
  assert.ok([403, 404].includes(rv.statusCode), String(rv.statusCode));
  const l = (await app.inject({ method: 'GET', url: `/api/univers/${u.id}/jetons`, headers: antor })).json();
  assert.equal(l.length, 1);
  assert.equal(l[0].revoqueLe, null);
});

test('un univers inconnu ou étranger : 404 pour le MJ d’un autre univers', async () => {
  const { app, antor, u } = await monter();
  const teoAutre = await connecter(app, 'mira');
  assert.equal((await app.inject({ method: 'GET', url: `/api/univers/${u.id}/jetons`, headers: teoAutre })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/univers/99999/jetons`, headers: antor })).statusCode, 404);
});

test('Mira MJ avec jeton rétrogradée Joueuse : la ligne reste, actif=false ; rétablie, actif=true', async () => {
  const { app, antor, u, id } = await monter();
  const mira = await connecter(app, 'mira');
  void mira;
  await app.inject({ method: 'POST', url: `/api/univers/${u.id}/membres`, headers: antor, payload: { username: 'mira', role: 'mj' } });
  creerJeton(app.db, id('mira'), u.id, { nom: 'Mira', dureeJours: 30 });
  const lire = async () => (await app.inject({ method: 'GET', url: `/api/univers/${u.id}/jetons`, headers: antor })).json();
  assert.equal((await lire())[0].actif, true);
  changerRoleNoyau(app.db, u.id, id('mira'), 'joueur');
  const l = await lire();
  assert.equal(l.length, 1);
  assert.equal(l[0].actif, false);
  changerRoleNoyau(app.db, u.id, id('mira'), 'mj');
  assert.equal((await lire())[0].actif, true);
});

test('B-46 : 25 jetons dont 22 actifs → les 22 actifs + 0 ; 25 dont 3 actifs → 3 + 17 anciens (20 en tout)', async () => {
  const { app, antor, u, id } = await monter();
  const t0 = Date.parse('2026-01-01T00:00:00Z');
  const H = (n: number) => new Date(t0 + n * 60_000);
  for (let i = 0; i < 22; i++) creerJeton(app.db, id('antor'), u.id, { nom: `a${i}`, dureeJours: 365 }, H(i));
  const actifs = (await app.inject({ method: 'GET', url: `/api/univers/${u.id}/jetons`, headers: antor })).json();
  assert.equal(actifs.length, 22);
  // revoke 19 of them, add 3 recent ones: 3 actifs, 22 revoked → capped at 20
  const l = actifs as { id: number; nom: string }[];
  for (const j of l.slice(0, 19)) revoquerJeton(app.db, id('antor'), u.id, j.id);
  const apres = (await app.inject({ method: 'GET', url: `/api/univers/${u.id}/jetons`, headers: antor })).json() as { revoqueLe: string | null }[];
  assert.equal(apres.length, 20);
  assert.equal(apres.filter((j) => j.revoqueLe === null).length, 3);
});

test('lots : 3 refus se listent avec clé et raison ; deux lots rejoués = 1 créée puis 1 inchangée ; au plus 20 lots', async () => {
  const { app, antor, u, id } = await monter();
  const { jeton } = creerJeton(app.db, id('antor'), u.id, { nom: 'Mac', dureeJours: 30 });
  const l1 = ouvrirLot(app.db, jeton).lot;
  noterDansLot(app.db, l1.lotId, 'fiches', 'creees');
  for (const k of ['a', 'b', 'c']) {
    noterDansLot(app.db, l1.lotId, 'fiches', 'refusees', [{ cle: `lieu:${k}`, gravite: 'refus', raison: `raison ${k}` }]);
  }
  cloreLot(app.db, jeton, l1.lotId);
  const l2 = ouvrirLot(app.db, jeton).lot;
  noterDansLot(app.db, l2.lotId, 'fiches', 'inchangees');
  cloreLot(app.db, jeton, l2.lotId);
  const r = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/lots`, headers: antor });
  assert.equal(r.statusCode, 200, r.body);
  const lots = r.json();
  assert.equal(lots.length, 2);
  assert.equal(lots[0].lotId, l2.lotId);
  assert.equal(lots[0].compteurs.fiches.inchangees, 1);
  assert.equal(lots[1].compteurs.fiches.creees, 1);
  assert.equal(lots[1].compteurs.fiches.refusees, 3);
  assert.deepEqual(lots[1].refus.map((e: { cle: string; raison: string }) => [e.cle, e.raison]), [['lieu:a', 'raison a'], ['lieu:b', 'raison b'], ['lieu:c', 'raison c']]);
  assert.equal(lots[1].jeton, 'Mac');
  for (let i = 0; i < 25; i++) { const x = ouvrirLot(app.db, jeton).lot; cloreLot(app.db, jeton, x.lotId); }
  const t = (await app.inject({ method: 'GET', url: `/api/univers/${u.id}/lots`, headers: antor })).json();
  assert.equal(t.length, 20);
});

test('B-50 : cleOrigine dans la fiche du MJ, jamais dans celle de Léa ni en mode Joueur', async () => {
  const { app, antor, lea, u } = await monter();
  const f = (await app.inject({ method: 'POST', url: `/api/univers/${u.id}/fiches`, headers: antor, payload: { type: 'lieu', titre: 'Port' } })).json();
  const s = f.sections?.[0];
  app.db.prepare('UPDATE fiches SET cle_origine = ? WHERE id = ?').run('lieu:port-sel', f.id);
  // make a section readable by players so Léa can open the sheet
  if (s) app.db.prepare('UPDATE sections SET joueurs_lisent = 1 WHERE id = ?').run(s.id);
  else {
    const r = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/fiches/${f.id}/sections`, headers: antor, payload: { titre: 'Description' } });
    const sid = r.json().id;
    app.db.prepare('UPDATE sections SET joueurs_lisent = 1 WHERE id = ?').run(sid);
  }
  const mj = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${f.id}`, headers: antor });
  assert.equal(mj.json().cleOrigine, 'lieu:port-sel');
  const mm = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${f.id}?mode=joueur`, headers: antor });
  assert.equal(mm.statusCode, 200, mm.body);
  assert.ok(!mm.body.includes('lieu:port-sel'));
  const j = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${f.id}`, headers: lea });
  assert.equal(j.statusCode, 200, j.body);
  assert.ok(!j.body.includes('cleOrigine'));
  assert.ok(!j.body.includes('lieu:port-sel'));
  const liste = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches`, headers: lea });
  assert.ok(!liste.body.includes('lieu:port-sel'));
  // a sheet without origin key: no field at all
  const g = (await app.inject({ method: 'POST', url: `/api/univers/${u.id}/fiches`, headers: antor, payload: { type: 'lieu', titre: 'Autre' } })).json();
  const rg = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${g.id}`, headers: antor });
  assert.ok(!('cleOrigine' in rg.json()));
});
