import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { creerJeton } = await import('../services/jetons.js');
const { ouvrirLot, noterDansLot, cloreLot } = (await import('../services/lots.js')) as any;
const { trouverCompte } = await import('../services/comptes.js');
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

test('Léa (Joueuse) : lire les lots = 404 sans rien révéler', async () => {
  const { app, lea, u, id } = await monter();
  const { jeton } = creerJeton(app.db, id('antor'), u.id, { nom: 'Mac', dureeJours: 30 });
  ouvrirLot(app.db, jeton);
  const r = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/lots`, headers: lea });
  assert.equal(r.statusCode, 404);
  assert.ok(!r.body.includes('Mac'));
});

test('un univers inconnu ou étranger : 404 pour les lots d’un MJ d’un autre univers', async () => {
  const { app, antor, u } = await monter();
  const autre = await connecter(app, 'mira');
  assert.equal((await app.inject({ method: 'GET', url: `/api/univers/${u.id}/lots`, headers: autre })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/univers/99999/lots`, headers: antor })).statusCode, 404);
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
  app.db.prepare("UPDATE fiches SET cle = ?, creee_via = 'import' WHERE id = ?").run('lieu:port-sel', f.id);
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
  // a sheet made on screen (its key is drawn, not an origin key): no field at all
  const g = (await app.inject({ method: 'POST', url: `/api/univers/${u.id}/fiches`, headers: antor, payload: { type: 'lieu', titre: 'Autre' } })).json();
  const rg = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${g.id}`, headers: antor });
  assert.ok(!('cleOrigine' in rg.json()));
});
