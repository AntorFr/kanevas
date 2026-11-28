import assert from 'node:assert/strict';
import { test } from 'node:test';

// Whole-feature tests of kanevas-carte-rendu-habillage-sorties (B-115, E-23) at the door the screen calls:
// `GET …/interieur/:q/:r/sorties` gives, for every readable neighbour, the route's distance (in cases) and type,
// and nothing for a neighbour or a route the reader does not read. Written from the sheet and docs/ecrans.md
// (« Jump points and transition halo »). Real routes, real database, stub login. Expected values are literals.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const sys = (q: number, r: number, secret = 0, nom = 'Sys') =>
    app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.5,NULL,'',?,0)")
      .run(g, E, `hab-${q}-${r}`, nom, q, r, secret).lastInsertRowid as number;
  const route = (de: number, vers: number, publique: number, longueur: number, type: string | null) =>
    app.db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur, type_lien) VALUES (?,?,?,?,?,?,?)')
      .run(g, E, de, vers, publique, longueur, type);
  const url = (q: number, r: number, suite = '') => `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur/${q}/${r}/sorties${suite}`;
  const get = (who: string | null, q: number, r: number, suite = '') =>
    app.inject({ method: 'GET', url: url(q, r, suite), headers: who ? h[who] : {} });
  return { app, E, g, sys, route, get };
}
const lire = (r: { json(): any }) => r.json() as Array<{ q: number; r: number; heure: number; nom: string | null; distance: number; type_lien: string | null }>;
const ordre = <T extends { q: number; r: number }>(l: T[]) => [...l].sort((a, b) => a.q - b.q || a.r - b.r);

test('B-115 : Léa lit, pour un voisin à 3 cases par une route pirate, sa distance 3 et son type « pirate »', async () => {
  const w = await monde();
  const c = w.sys(200, 200, 0, 'Centre');
  w.route(c, w.sys(201, 200, 0, 'Hesper'), 1, 3, 'pirate');
  const r = await w.get('lea', 200, 200);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(lire(r), [{ q: 201, r: 200, heure: 3, nom: 'Hesper', distance: 3, type_lien: 'pirate' }]);
});

test('B-115 bords : distance 1 et distance 12, type absent rendu null, route écrite dans l’autre sens', async () => {
  const w = await monde();
  const c = w.sys(210, 210, 0, 'Centre');
  w.route(c, w.sys(211, 210, 0, 'Proche'), 1, 1, 'Publique');
  w.route(c, w.sys(209, 210, 0, 'Loin'), 1, 12, null);
  w.route(w.sys(210, 209, 0), c, 1, 5, 'Contrebande'); // stored from the neighbour towards the centre
  const r = await w.get('lea', 210, 210);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(ordre(lire(r)).map((s) => [s.q, s.r, s.nom, s.distance, s.type_lien]), [
    [209, 210, 'Loin', 12, null],
    [210, 209, 'Sys', 5, 'Contrebande'],
    [211, 210, 'Proche', 1, 'Publique'],
  ]);
});

test('B-115 exclusion : une route privée ou un voisin masqué n’ajoute rien à la réponse de Léa, ni type, ni distance, ni compte', async () => {
  const w = await monde();
  const c = w.sys(220, 220, 0, 'Centre');
  w.route(c, w.sys(221, 220, 0, 'Visible'), 1, 3, 'pirate');
  const sans = await w.get('lea', 220, 220);
  w.route(c, w.sys(220, 219, 0, 'Route privée'), 0, 7, 'Privée');
  w.route(c, w.sys(219, 220, 1, 'Voisin caché'), 1, 9, 'pirate');
  w.route(c, w.sys(220, 221, 1, 'Caché et privé'), 0, 4, 'public');
  const avec = await w.get('lea', 220, 220);
  assert.equal(avec.statusCode, 200);
  assert.equal(avec.body, sans.body);
  assert.deepEqual(lire(avec).map((s) => s.nom), ['Visible']);
  for (const motif of ['Route privée', 'Voisin caché', 'Caché et privé', '"distance":7', '"distance":9', '"distance":4', 'Privée'])
    assert.ok(!avec.body.includes(motif), `la réponse de Léa contient « ${motif} »`);
});

test('B-115 : le MJ lit la route privée et le voisin masqué avec leur distance et leur type ; en mode joueur il ne les lit plus', async () => {
  const w = await monde();
  const c = w.sys(230, 230, 0, 'Centre');
  w.route(c, w.sys(231, 230, 0, 'Visible'), 1, 3, 'pirate');
  w.route(c, w.sys(230, 229, 0, 'Privée'), 0, 7, 'Privée');
  w.route(c, w.sys(229, 230, 1, 'Cachée'), 1, 9, 'Pirate');
  const mj = await w.get('antor', 230, 230);
  assert.deepEqual(ordre(lire(mj)).map((s) => [s.nom, s.distance, s.type_lien]), [
    ['Cachée', 9, 'Pirate'], ['Privée', 7, 'Privée'], ['Visible', 3, 'pirate'],
  ]);
  const modeJoueur = await w.get('antor', 230, 230, '?mode=joueur');
  const lea = await w.get('lea', 230, 230);
  assert.equal(modeJoueur.body, lea.body);
  assert.deepEqual(lire(lea).map((s) => s.nom), ['Visible']);
});

test('B-115 échec : un système d’origine masqué répond à Léa comme une adresse inconnue ; sans session, aucune sortie', async () => {
  const w = await monde();
  const c = w.sys(240, 240, 1, 'Origine cachée');
  w.route(c, w.sys(241, 240, 0, 'Voisin'), 1, 3, 'pirate');
  const cachee = await w.get('lea', 240, 240);
  const inconnue = await w.get('lea', 299, 299);
  assert.equal(cachee.statusCode, 404);
  assert.equal(cachee.statusCode, inconnue.statusCode);
  assert.equal(cachee.body, inconnue.body);
  assert.ok(!cachee.body.includes('pirate'));
  const sansSession = await w.get(null, 241, 240);
  assert.notEqual(sansSession.statusCode, 200);
  assert.ok(!sansSession.body.includes('distance'));
});

test('B-115 bord : un système sans route rend une liste vide, pas une erreur', async () => {
  const w = await monde();
  w.sys(250, 250, 0, 'Isolé');
  const r = await w.get('lea', 250, 250);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), []);
});
