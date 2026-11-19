import assert from 'node:assert/strict';
import { test } from 'node:test';

// Whole-feature tests of kanevas-carte-spatiale-carte at the doors of E-23 (B-88, B-89, B-87 drawing):
// GET …/interieur/:q/:r/astres/:cle/illustration?cote=N and GET …/interieur/:q/:r/sorties. Real routes, real database, stub login.
// Written from the sheet, docs/parcours.md (B-88, B-89) and docs/ecrans.md (E-23 criteria), not from the code.
// Expected values are literals (status codes, texts of the need); no expectation is computed by the code under test.
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
  const astre = (sid: number, cle: string, type: string, taille: number, aspect = '{}') =>
    app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?)')
      .run(sid, cle, 'planete', type, 2, 4, taille, aspect);
  const route = (de: number, vers: number, publique: number) =>
    app.db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?,?,?,?,?,3)').run(g, E, de, vers, publique);
  const get = (who: string | null, q: number | string, r: number | string, suite: string) =>
    app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur/${q}/${r}${suite}`, headers: who ? h[who] : {} });
  return { app, E, g, sys, astre, route, get };
}
const octets = (r: { rawPayload: Buffer }) => r.rawPayload.toString('hex');

test('B-89 : un même corps rendu deux fois (deux serveurs, deux caches) donne la même image, à l\'octet près', async () => {
  const a = await monde(); const b = await monde();
  for (const w of [a, b]) w.astre(w.sys('ens-a', 70, 71, 0), 'p1', 'tellurique', 1);
  const ra = await a.get('lea', 70, 71, '/astres/p1/illustration?cote=96');
  const rb = await b.get('lea', 70, 71, '/astres/p1/illustration?cote=96');
  assert.equal(ra.statusCode, 200); assert.equal(rb.statusCode, 200);
  assert.equal(ra.headers['content-type'], 'image/webp');
  assert.ok(ra.rawPayload.length > 200, 'une image réelle, pas un fichier vide');
  assert.equal(octets(ra), octets(rb));
});

test('B-89 : deux corps d\'aspect identique donnent la même image ; un type ou un côté changés en donnent une autre', async () => {
  const w = await monde();
  const s = w.sys('ens-b', 72, 73, 0);
  w.astre(s, 'ref', 'rocheux', 1); w.astre(s, 'jumeau', 'rocheux', 1);
  w.astre(s, 'lave', 'lave', 1);
  const img = async (cle: string, cote = 96) => octets(await w.get('lea', 72, 73, `/astres/${cle}/illustration?cote=${cote}`));
  const ref = await img('ref');
  assert.equal(await img('jumeau'), ref);
  assert.notEqual(await img('lave'), ref);
  assert.notEqual(await img('ref', 128), ref);
});

test('B-89 : un aspect modifié (palette au choix du MJ) donne une autre image', async () => {
  const w = await monde();
  const s = w.sys('ens-c', 74, 75, 0);
  w.astre(s, 'p', 'glace', 1);
  const avant = octets(await w.get('lea', 74, 75, '/astres/p/illustration?cote=96'));
  w.app.db.prepare('UPDATE swn_astres SET aspect=? WHERE cle=?').run(JSON.stringify({ palette: ['#ff0000', '#00ff00', '#0000ff'] }), 'p');
  const apres = octets(await w.get('lea', 74, 75, '/astres/p/illustration?cote=96'));
  assert.notEqual(apres, avant);
});

test('B-88/E-23 : système masqué, hexagone inconnu, identifiant inconnu : la même réponse introuvable, pour la joueuse', async () => {
  const w = await monde();
  w.astre(w.sys('ens-secret', 76, 77, 1), 'p1', 'rocheux', 1);
  w.astre(w.sys('ens-ouvert', 78, 79, 0), 'p1', 'rocheux', 1);
  const masque = await w.get('lea', 76, 77, '/astres/p1/illustration?cote=96');
  const inconnuHex = await w.get('lea', 90, 91, '/astres/p1/illustration?cote=96');
  const inconnuCle = await w.get('lea', 78, 79, '/astres/nexistepas/illustration?cote=96');
  assert.equal(masque.statusCode, 404);
  for (const r of [inconnuHex, inconnuCle]) {
    assert.equal(r.statusCode, 404);
    assert.equal(r.body, masque.body);
    assert.equal(r.headers['content-type'], masque.headers['content-type']);
  }
  assert.match(masque.body, /introuvable/);
  assert.doesNotMatch(masque.body, /ens-secret/);
});

test('B-88 : le MJ lit l\'illustration du système masqué ; la joueuse jamais, même avec un If-None-Match valide', async () => {
  const w = await monde();
  w.astre(w.sys('ens-secret2', 80, 81, 1), 'p1', 'rocheux', 1);
  const mj = await w.get('antor', 80, 81, '/astres/p1/illustration?cote=96');
  assert.equal(mj.statusCode, 200);
  const lea = await w.get('lea', 80, 81, '/astres/p1/illustration?cote=96');
  assert.equal(lea.statusCode, 404);
  assert.equal(octets(lea).includes('52494646'), false, 'aucune image dans la réponse');
  const cond = await w.app.inject({ method: 'GET', headers: { cookie: (await connecter(w.app, 'lea')).cookie, 'if-none-match': String(mj.headers.etag) },
    url: `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.g}/interieur/80/81/astres/p1/illustration?cote=96` });
  assert.equal(cond.statusCode, 404);
});

test('B-89 : sans session, pas d\'image ; côté hors bornes ou non entier : refus, bords 64 et 2048 acceptés', async () => {
  const w = await monde();
  w.astre(w.sys('ens-d', 82, 83, 0), 'p1', 'gazeuse', 1);
  const sans = await w.get(null, 82, 83, '/astres/p1/illustration?cote=96');
  assert.ok(sans.statusCode === 401 || sans.statusCode === 302 || sans.statusCode === 403 || sans.statusCode === 404);
  assert.notEqual(sans.headers['content-type'], 'image/webp');
  for (const cote of ['63', '2049', 'abc', '96.5', '-64', '']) {
    const r = await w.get('lea', 82, 83, `/astres/p1/illustration?cote=${cote}`);
    assert.equal(r.statusCode, 400, `cote=${cote}`);
  }
  assert.equal((await w.get('lea', 82, 83, '/astres/p1/illustration?cote=64')).statusCode, 200);
  const grande = await w.get('lea', 82, 83, '/astres/p1/illustration?cote=2048');
  assert.equal(grande.statusCode, 200);
  assert.equal(grande.headers['content-type'], 'image/webp');
});

test('B-88 : la lune et l\'étoile ont chacune leur illustration, une comète aussi', async () => {
  const w = await monde();
  const s = w.sys('ens-e', 84, 85, 0);
  const ins = w.app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?)');
  ins.run(s, 'e0', 'etoile', null, 'jaune', 0, 0, 0.3);
  const p = ins.run(s, 'p', 'planete', null, 'tellurique', 2, 4, 1).lastInsertRowid;
  ins.run(s, 'l', 'lune', p, 'rocheux', null, 9, 0.1);
  ins.run(s, 'c', 'comete', null, 'comete', 6, 1, 0.1);
  const vus = new Set<string>();
  for (const cle of ['e0', 'p', 'l', 'c']) {
    const r = await w.get('lea', 84, 85, `/astres/${cle}/illustration?cote=96`);
    assert.equal(r.statusCode, 200, cle);
    assert.equal(r.rawPayload.subarray(8, 12).toString('latin1'), 'WEBP');
    vus.add(octets(r));
  }
  assert.equal(vus.size, 4, 'quatre corps de quatre types : quatre images');
});

test('E-23 : une route privée ou un voisin masqué ne donne aucune sortie à la joueuse, ni trou, ni compte ; le MJ les voit', async () => {
  const w = await monde();
  const centre = w.sys('ens-centre', 86, 87, 0);
  const pub = w.sys('ens-pub', 87, 87, 0);
  const priv = w.sys('ens-priv', 88, 87, 0);
  const cache = w.sys('ens-cache', 86, 88, 1);
  for (const s of [centre, pub, priv, cache]) w.astre(s, 'p1', 'rocheux', 1);
  w.route(centre, pub, 1); w.route(centre, priv, 0); w.route(centre, cache, 1);
  const lea = await w.get('lea', 86, 87, '/sorties');
  assert.equal(lea.statusCode, 200);
  const corpsLea = lea.json();
  const liste = Array.isArray(corpsLea) ? corpsLea : corpsLea.sorties;
  assert.deepEqual(liste.map((x: any) => `${x.q},${x.r}`), ['87,87']);
  assert.doesNotMatch(lea.body, /88,|"r":88|ens-priv|ens-cache/);
  const mj = await w.get('antor', 86, 87, '/sorties');
  const lm = Array.isArray(mj.json()) ? mj.json() : mj.json().sorties;
  assert.deepEqual(lm.map((x: any) => `${x.q},${x.r}`).sort(), ['86,88', '87,87', '88,87']);
});

test('E-23 : les sorties d\'un système masqué ou inconnu répondent la même introuvable, pour la joueuse', async () => {
  const w = await monde();
  w.astre(w.sys('ens-m', 92, 93, 1), 'p1', 'rocheux', 1);
  const a = await w.get('lea', 92, 93, '/sorties');
  const b = await w.get('lea', 99, 99, '/sorties');
  assert.equal(a.statusCode, 404);
  assert.equal(b.statusCode, 404);
  assert.equal(a.body, b.body);
});
