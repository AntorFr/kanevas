import assert from 'node:assert/strict';
import { test } from 'node:test';

// Whole-feature tests (second batch) of kanevas-carte-spatiale-carte at the doors of E-23, written from the sheet,
// docs/parcours.md (B-88, B-89) and docs/ecrans.md (E-23 criteria): the Player mode of the GM, the conditional
// request of the illustration, the same map for the GM and the Player, the hour of each exit.
// Real routes, real database, stub login. Expected values are literals.
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
  const sys = (cle: string, q: number, r: number, secret: number) =>
    app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)")
      .run(g, E, cle, cle, q, r, secret).lastInsertRowid as number;
  const astre = (sid: number, cle: string, type: string) =>
    app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?)')
      .run(sid, cle, 'planete', type, 2, 4, 1, '{}');
  const route = (de: number, vers: number, publique: number) =>
    app.db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?,?,?,?,?,3)').run(g, E, de, vers, publique);
  const get = (who: string, q: number, r: number, suite: string, entetes: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur/${q}/${r}${suite}`, headers: { ...h[who], ...entetes } });
  return { app, E, g, sys, astre, route, get };
}
const liste = (r: { json(): any }) => (Array.isArray(r.json()) ? r.json() : r.json().sorties) as Array<{ q: number; r: number; heure: number }>;

test('B-88 : le MJ en mode joueur reçoit pour un système masqué la même introuvable que la joueuse, illustration et sorties', async () => {
  const w = await monde();
  const s = w.sys('port-secret', 110, 111, 1);
  w.astre(s, 'p1', 'rocheux');
  w.route(s, w.sys('port-voisin', 111, 111, 0), 1);
  const lea = await w.get('lea', 110, 111, '/astres/p1/illustration?cote=96');
  const mjJoueur = await w.get('antor', 110, 111, '/astres/p1/illustration?cote=96&mode=joueur');
  assert.equal(lea.statusCode, 404);
  assert.equal(mjJoueur.statusCode, 404);
  assert.equal(mjJoueur.body, lea.body);
  const sLea = await w.get('lea', 110, 111, '/sorties');
  const sMj = await w.get('antor', 110, 111, '/sorties?mode=joueur');
  assert.equal(sMj.statusCode, 404);
  assert.equal(sMj.body, sLea.body);
  // hors mode joueur, le MJ lit le système masqué
  assert.equal((await w.get('antor', 110, 111, '/astres/p1/illustration?cote=96')).statusCode, 200);
});

test('E-23 : le MJ en mode joueur ne voit aucune sortie privée ni cachée, comme la joueuse', async () => {
  const w = await monde();
  const c = w.sys('mj-centre', 112, 111, 0);
  w.astre(c, 'p1', 'rocheux');
  w.route(c, w.sys('mj-pub', 113, 111, 0), 1);
  w.route(c, w.sys('mj-priv', 112, 112, 0), 0);
  w.route(c, w.sys('mj-cache', 111, 112, 1), 1);
  const mj = await w.get('antor', 112, 111, '/sorties?mode=joueur');
  assert.equal(mj.statusCode, 200);
  assert.deepEqual(liste(mj).map((x) => `${x.q},${x.r}`), ['113,111']);
  const lea = await w.get('lea', 112, 111, '/sorties');
  assert.deepEqual(liste(lea).map((x) => `${x.q},${x.r}`), ['113,111']);
});

test('E-23 : chaque sortie est à l\'heure de son voisin (12 en haut, 3 à droite) pour les six voisins', async () => {
  const w = await monde();
  const c = w.sys('heure-centre', 120, 120, 0);
  w.astre(c, 'p1', 'rocheux');
  // axes d'Éneria : x = √3 (q + r/2), y = 1,5 r (y vers le bas) : l'est est à 3 h, l'ouest à 9 h
  const voisins: Array<[number, number, number]> = [[1, 0, 3], [0, 1, 5], [-1, 1, 7], [-1, 0, 9], [0, -1, 11], [1, -1, 1]];
  for (const [dq, dr] of voisins) w.route(c, w.sys(`heure-${dq}-${dr}`, 120 + dq, 120 + dr, 0), 1);
  const r = await w.get('lea', 120, 120, '/sorties');
  assert.equal(r.statusCode, 200);
  const lus = liste(r).map((x) => [x.q - 120, x.r - 120, x.heure]).sort();
  assert.deepEqual(lus, [...voisins].sort());
});

test('B-89 : requête conditionnelle : l\'ETag rend 304 sans image, un aspect modifié change l\'ETag ; Cache-Control privé', async () => {
  const w = await monde();
  w.astre(w.sys('port-etag', 130, 131, 0), 'p1', 'lave');
  const a = await w.get('lea', 130, 131, '/astres/p1/illustration?cote=96');
  assert.equal(a.statusCode, 200);
  assert.match(String(a.headers['cache-control']), /private/);
  assert.match(String(a.headers['cache-control']), /no-cache/);
  const etag = String(a.headers.etag);
  assert.ok(etag.length > 2);
  const b = await w.get('lea', 130, 131, '/astres/p1/illustration?cote=96', { 'if-none-match': etag });
  assert.equal(b.statusCode, 304);
  assert.equal(b.rawPayload.length, 0);
  w.app.db.prepare('UPDATE swn_astres SET aspect=? WHERE cle=?').run(JSON.stringify({ palette: ['#112233', '#445566', '#778899'] }), 'p1');
  const c = await w.get('lea', 130, 131, '/astres/p1/illustration?cote=96', { 'if-none-match': etag });
  assert.equal(c.statusCode, 200);
  assert.notEqual(String(c.headers.etag), etag);
});
