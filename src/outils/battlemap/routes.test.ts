// Review tests of kanevas-battlemap-assets-api: the routes of the library and of the art direction, and the stub seed.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { JETON_BOUCHON, semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');
const { pngPlat } = await import('../../bouchon/png-plat.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monde(activer = true) {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-routes-')));
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'mira', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const antor = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  // the seed already switches the tool on for the system of « Éneria d'essai »
  poserActivation(app.db, antor, { niveau: 'systeme', id: S }, 'battlemap/assets', activer);
  const R = `/api/univers/${E}/outils/battlemap`;
  const req = (method: M, who: string | null, url: string, payload?: any, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...(who ? h[who] : {}), ...headers }, payload });
  /** A multipart body with one file (and optional fields before it). */
  const multi = (nom: string, octets: Buffer, champs: Record<string, string> = {}) => {
    const b = '----bmtest';
    const parts: Buffer[] = [];
    for (const [k, v] of Object.entries(champs)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(octets, Buffer.from(`\r\n--${b}--\r\n`));
    return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
  };
  const envoyer = (who: string, url: string, nom: string, octets: Buffer, champs?: Record<string, string>) => {
    const m = multi(nom, octets, champs);
    return app.inject({ method: 'POST', url, headers: { ...h[who], ...m.headers }, payload: m.payload });
  };
  return { app, E, S, R, req, h, envoyer };
}
const png = (n: number) => pngPlat([n, 10, 10], 8);

test('le semis : 9 assets dont 1 MJ seul, une direction, une référence dans « Éneria d’essai »', async () => {
  const w = await monde();
  const essai = w.E;
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_assets WHERE univers_id = ?', essai).n, 9);
  assert.equal(one(w.app, "SELECT COUNT(*) n FROM bm_assets a JOIN fichiers f ON f.id=a.fichier_id WHERE a.univers_id = ? AND f.visibilite='mj'", essai).n, 1);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_direction_images WHERE univers_id = ?', essai).n, 1);
  assert.ok(one(w.app, 'SELECT texte FROM bm_direction WHERE univers_id = ?', essai).texte.length > 0);
  const tags = one(w.app, "SELECT tags FROM bm_assets WHERE univers_id = ? AND nom = 'Tonneau'", essai).tags;
  assert.equal(JSON.parse(tags).length, 2);
});

test('joueur : lit seulement les assets visibles, écrit et lit la direction → 404', async () => {
  const w = await monde();
  // trois images objet : trois assets
  for (const n of [1, 2, 3]) {
    const r = await w.envoyer('antor', `${w.R}/assets`, `o${n}.png`, png(n), { categorie: 'objet' });
    assert.equal(r.statusCode, 201, r.body);
  }
  const cachee = (await w.envoyer('antor', `${w.R}/assets`, 'secret.png', png(50), { categorie: 'objet' })).json();
  assert.equal((await w.req('PATCH', 'antor', `${w.R}/assets`, { ids: [cachee.id], visible: false })).statusCode, 200);
  const toutes = (await w.req('GET', 'antor', `${w.R}/assets`)).json();
  const lea = await w.req('GET', 'lea', `${w.R}/assets`);
  assert.equal(lea.statusCode, 200, lea.body);
  const noms = (j: any) => (j.assets ?? j.elements ?? []).map((a: any) => a.nom);
  assert.ok(noms(toutes).includes('secret'));
  assert.ok(!noms(lea.json()).includes('secret'));
  // 9 seeded (1 GM-only) + 4 added (1 hidden): 13 for the GM, 11 for the player
  assert.equal(noms(toutes).length, 13);
  assert.equal(noms(lea.json()).length, 11);
  assert.ok(!noms(lea.json()).includes('Coffre piégé'));
  const avant = one(w.app, 'SELECT COUNT(*) n FROM bm_assets').n;
  const ecritures: [M, string, any][] = [
    ['PATCH', `${w.R}/assets`, { ids: [cachee.id], visible: true }], ['DELETE', `${w.R}/assets`, { ids: [cachee.id] }],
    ['POST', `${w.R}/assets/depuis-fichier`, { fichierId: 1 }], ['GET', `${w.R}/direction`, undefined],
    ['PUT', `${w.R}/direction`, { texte: 'x', version: 0 }], ['GET', `${w.R}/assets/fichiers-disponibles`, undefined],
    ['DELETE', `${w.R}/direction/images`, { fichierId: 1 }], ['PATCH', `${w.R}/direction/images/1`, { legende: 'x' }],
  ];
  const inconnu = await w.req('GET', 'lea', `${w.R}/nexiste-pas`);
  for (const [m, url, b] of ecritures) {
    const r = await w.req(m, 'lea', url, b);
    assert.equal(r.statusCode, 404, `${m} ${url} ${r.body}`);
  }
  for (const url of [`${w.R}/assets`, `${w.R}/direction/images`]) {
    const r = await w.envoyer('lea', url, 'x.png', png(9));
    assert.equal(r.statusCode, 404, url);
  }
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_assets').n, avant);
  assert.equal(inconnu.statusCode, 404);
});

test('un PDF est refusé avec son nom, les autres requêtes passent', async () => {
  const w = await monde();
  const avant = one(w.app, 'SELECT COUNT(*) n FROM bm_assets').n;
  const bad = await w.envoyer('antor', `${w.R}/assets`, 'plan.pdf', Buffer.from('%PDF-1.4 rien'), { categorie: 'objet' });
  assert.equal(bad.statusCode, 400, bad.body);
  assert.match(bad.body, /plan\.pdf/);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_assets').n, avant);
  const ok = await w.envoyer('antor', `${w.R}/assets`, 'bon.png', png(77), { categorie: 'objet' });
  assert.equal(ok.statusCode, 201, ok.body);
  const badRef = await w.envoyer('antor', `${w.R}/direction/images`, 'ref.pdf', Buffer.from('%PDF-1.4 rien'));
  assert.equal(badRef.statusCode, 400);
  assert.match(badRef.body, /ref\.pdf/);
});

test('PATCH règle l’empreinte 2×1 ; DELETE retire ; utilisation compte les cartes', async () => {
  const w = await monde();
  const a = (await w.envoyer('antor', `${w.R}/assets`, 'a.png', png(31), { categorie: 'objet' })).json();
  const p = await w.req('PATCH', 'antor', `${w.R}/assets`, { ids: [a.id], largeur: 2, hauteur: 1 });
  assert.equal(p.statusCode, 200, p.body);
  const row = one(w.app, 'SELECT largeur, hauteur FROM bm_assets WHERE id = ?', a.id);
  assert.deepEqual([row.largeur, row.hauteur], [2, 1]);
  const u = await w.req('GET', 'antor', `${w.R}/assets/${a.id}/utilisation`);
  assert.equal(u.statusCode, 200);
  assert.equal(u.json().cartes, 0);
  const bad = await w.req('PATCH', 'antor', `${w.R}/assets`, { ids: [], largeur: 2 });
  assert.equal(bad.statusCode, 400);
  const badEmp = await w.req('PATCH', 'antor', `${w.R}/assets`, { ids: [a.id], largeur: 99, hauteur: 1 });
  assert.equal(badEmp.statusCode, 400);
  const d = await w.req('DELETE', 'antor', `${w.R}/assets`, { ids: [a.id] });
  assert.equal(d.statusCode, 200, d.body);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_assets WHERE id = ?', a.id).n, 0);
});

test('fichiers-disponibles : seulement les images sans asset ; référence depuis un fichier → MJ seul, légende, 9e refusée', async () => {
  const w = await monde();
  const { ajouterFichier } = await import('../../services/fichiers.js');
  const { Readable } = await import('node:stream');
  const antor = { compteId: one(w.app, "SELECT id FROM comptes WHERE username='antor'").id };
  const f = async (nom: string, oct: Buffer) => (await ajouterFichier(w.app.db, antor, w.E, Readable.from([oct]), nom, { ou: 'mediatheque' })).id as number;
  const i1 = await f('libre.png', png(61));
  const i2 = await f('autre.png', png(62));
  await w.envoyer('antor', `${w.R}/assets`, 'adosse.png', png(63), { categorie: 'sol' });
  const dispo = (await w.req('GET', 'antor', `${w.R}/assets/fichiers-disponibles`)).json().fichiers.map((x: any) => x.id);
  assert.ok(dispo.includes(i1) && dispo.includes(i2));
  const adosses = new Set(w.app.db.prepare('SELECT fichier_id id FROM bm_assets').all().map((r: any) => r.id));
  assert.ok(dispo.every((id: number) => !adosses.has(id)));
  const r = await w.req('POST', 'antor', `${w.R}/direction/images/depuis-fichier`, { fichierId: i1 });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(one(w.app, 'SELECT visibilite v FROM fichiers WHERE id = ?', i1).v, 'mj');
  const l = await w.req('PATCH', 'antor', `${w.R}/direction/images/${i1}`, { legende: 'Mon style' });
  assert.equal(l.statusCode, 200, l.body);
  assert.equal(one(w.app, 'SELECT legende FROM bm_direction_images WHERE fichier_id = ?', i1).legende, 'Mon style');
  // la référence déposée est elle-même adossée ? elle ne doit plus être "disponible" comme asset n'est pas requis ; on remplit à 8
  let n = one(w.app, 'SELECT COUNT(*) n FROM bm_direction_images WHERE univers_id = ?', w.E).n as number;
  for (let k = 0; n < 8; k++, n++) {
    const ok = await w.envoyer('antor', `${w.R}/direction/images`, `r${k}.png`, png(100 + k));
    assert.equal(ok.statusCode, 201, ok.body);
  }
  const neuf = await w.envoyer('antor', `${w.R}/direction/images`, 'r9.png', png(200));
  assert.equal(neuf.statusCode, 409, neuf.body);
  const neufFichier = await w.req('POST', 'antor', `${w.R}/direction/images/depuis-fichier`, { fichierId: i2 });
  assert.equal(neufFichier.statusCode, 409, neufFichier.body);
});

test('direction : PUT versionné, conflit de version ; mode Joueur → 403 en écriture, 404 en lecture direction', async () => {
  const w = await monde();
  const d0 = (await w.req('GET', 'antor', `${w.R}/direction`)).json();
  const put = await w.req('PUT', 'antor', `${w.R}/direction`, { texte: 'Nouveau', version: d0.version });
  assert.equal(put.statusCode, 200, put.body);
  const perime = await w.req('PUT', 'antor', `${w.R}/direction`, { texte: 'Autre', version: d0.version });
  assert.equal(perime.statusCode, 409, perime.body);
  const j = '?mode=joueur';
  for (const [m, url, b] of [
    ['PUT', 'direction', { texte: 'x', version: 99 }], ['PATCH', 'assets', { ids: [1], visible: false }], ['DELETE', 'assets', { ids: [1] }],
    ['GET', 'assets/fichiers-disponibles', undefined], ['POST', 'assets/depuis-fichier', { fichierId: 1 }],
  ] as [M, string, any][]) {
    const r = await w.req(m, 'antor', `${w.R}/${url}${j}`, b);
    assert.equal(r.statusCode, 403, `${m} ${url} ${r.body}`);
  }
  const lecture = await w.req('GET', 'antor', `${w.R}/direction${j}`);
  assert.equal(lecture.statusCode, 404, lecture.body);
  assert.ok(!JSON.stringify((await w.req('GET', 'antor', `${w.R}/assets/fichiers-disponibles${j}`)).body).includes('"jeton"'));
});

test('le 5 001e asset répond 409 bibliotheque_pleine', async () => {
  const w = await monde();
  const n = one(w.app, 'SELECT COUNT(*) n FROM bm_assets WHERE univers_id = ?', w.E).n as number;
  const mj = one(w.app, "SELECT id FROM comptes WHERE username='antor'").id;
  const fic = w.app.db.prepare("INSERT INTO fichiers (univers_id, nom, type, taille, disque, visibilite, ajoute_par, ajoute_le) VALUES (?, 'f', 'image/png', 1, ?, 'joueurs', ?, 'x')");
  const ass = w.app.db.prepare("INSERT INTO bm_assets (univers_id, fichier_id, nom, categorie, largeur, hauteur, cree_le) VALUES (?, ?, 'a', 'objet', 1, 1, 'x')");
  w.app.db.transaction(() => { for (let i = n; i < 5000; i++) ass.run(w.E, Number(fic.run(w.E, `d${i}`, mj).lastInsertRowid)); })();
  const r = await w.envoyer('antor', `${w.R}/assets`, 'trop.png', png(222), { categorie: 'objet' });
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().code, 'bibliotheque_pleine');
});

test('outil désactivé, étranger, et jeton : comme un chemin non enregistré', async () => {
  const w = await monde(false);
  const ref = await w.req('GET', 'antor', `${w.R}/nexiste-pas`);
  for (const [m, url] of [['GET', 'assets'], ['GET', 'direction'], ['GET', 'assets/fichiers-disponibles']] as [M, string][]) {
    const r = await w.req(m, 'antor', `${w.R}/${url}`);
    assert.equal(r.statusCode, 404);
    assert.equal(r.body, ref.body, 'outil désactivé');
  }
  const w2 = await monde();
  const ref2 = await w2.req('GET', 'antor', `${w2.R}/nexiste-pas`);
  const teo = await w2.req('GET', 'teo', `${w2.R}/assets`);
  assert.equal(teo.statusCode, 404);
  assert.equal(teo.body, ref2.body);
  const anon = await w2.req('GET', null, `${w2.R}/assets`);
  assert.notEqual(anon.statusCode, 200);
  const bearer = await w2.req('GET', null, `${w2.R}/assets`, undefined, { authorization: `Bearer ${JETON_BOUCHON}` });
  assert.notEqual(bearer.statusCode, 200);
  const imp = await w2.req('GET', null, `/api/import/v1/univers/${w2.E}/outils/battlemap/assets`, undefined, { authorization: `Bearer ${JETON_BOUCHON}` });
  assert.equal(imp.statusCode, 404);
});
