import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Besoins B-99, B-100, B-101, B-104 (kanevas-synchro-cles), written from the need: keys drawn at creation, stable across renames,
// former keys, section keys, universe identifiers. Expected values are literals.
const racine = mkdtempSync(join(tmpdir(), 'kanevas-cles-besoin-'));
writeFileSync(join(racine, 'index.html'), '<html><head><!--KANEVAS_BOUCHON--></head><body>SHELL</body></html>');
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = racine;
delete process.env.DB_PATH;
mkdirSync(join(racine, 'assets'), { recursive: true });

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monter(semer = false) {
  const app = await buildApp();
  if (semer) semerBouchon(app.db);
  const antor = await connecter(app, 'antor');
  const req = (h: H, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url, headers: h, payload });
  const u = (await req(antor, 'POST', '/api/univers', { nom: 'Eneria' })).json() as { id: number; cle: string };
  const base = `/api/univers/${u.id}`;
  const creer = async (type: string, titre: string) =>
    (await req(antor, 'POST', `${base}/fiches`, { type, titre })).json() as { id: number; cle: string };
  return { app, antor, req, u, base, creer };
}

test('B-99 : la clé se tire du titre (accents retirés), un titre identique reçoit -2, -3', async () => {
  const w = await monter();
  assert.equal((await w.creer('lieu', 'Ténébria')).cle, 'lieu:tenebria');
  assert.equal((await w.creer('lieu', 'Ténébria')).cle, 'lieu:tenebria-2');
  assert.equal((await w.creer('lieu', 'Tenebria')).cle, 'lieu:tenebria-3');
  assert.equal((await w.creer('faction', 'Les Veilleurs')).cle, 'faction:les-veilleurs');
  await w.app.close();
});

test('B-99 : renommer la fiche ou changer son type ne change pas la clé', async () => {
  const w = await monter();
  const f = await w.creer('lieu', 'Nyx');
  const r = await w.req(w.antor, 'PATCH', `${w.base}/fiches/${f.id}`, { titre: 'Nyx la Noire' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().cle, 'lieu:nyx');
  const t = await w.req(w.antor, 'POST', `${w.base}/fiches/${f.id}/type`, { type: 'faction' });
  assert.equal(t.statusCode, 200, t.body);
  const lue = (await w.req(w.antor, 'GET', `${w.base}/fiches/${f.id}`)).json();
  assert.equal(lue.titre, 'Nyx la Noire');
  assert.equal(lue.type, 'faction');
  assert.equal(lue.cle, 'lieu:nyx');
  await w.app.close();
});

test('B-99 : le propriétaire reprend son ancienne clé ; celle d’une autre fiche reste refusée ', async () => {
  const w = await monter();
  const a = await w.creer('lieu', 'Nyx');
  const b = await w.creer('lieu', 'Port');
  const patch = (id: number, cle: string) => w.req(w.antor, 'PATCH', `${w.base}/fiches/${id}`, { cle });
  assert.equal((await patch(a.id, 'lieu:nyx-2')).statusCode, 200);
  assert.equal((await patch(b.id, 'lieu:nyx')).statusCode, 409);
  assert.equal((await patch(a.id, 'lieu:nyx')).statusCode, 200);
  const lue = (await w.req(w.antor, 'GET', `${w.base}/fiches/lieu:nyx-2`)).json();
  assert.equal(lue.id, a.id);
  assert.equal(lue.cle, 'lieu:nyx');
  await w.app.close();
});

test('B-99 : une clé à 200 caractères est acceptée, à 201 refusée ; une clé à un seul caractère refusée', async () => {
  const w = await monter();
  const f = await w.creer('lieu', 'Nyx');
  const patch = (cle: string) => w.req(w.antor, 'PATCH', `${w.base}/fiches/${f.id}`, { cle });
  assert.equal((await patch('lieu:' + 'a'.repeat(195))).statusCode, 200);
  const trop = await patch('lieu:' + 'a'.repeat(196));
  assert.equal(trop.statusCode, 400);
  assert.equal(trop.json().champ, 'cle');
  const court = await patch('a');
  assert.equal(court.statusCode, 400);
  assert.equal((await patch('compte_rendu:seance-3')).statusCode, 200);
  await w.app.close();
});

test('B-104 : une section créée dans Kanevas reçoit une clé de son titre, stable au renommage ; doublon suffixé', async () => {
  const w = await monter();
  const f = await w.creer('lieu', 'Nyx');
  const s1 = (await w.req(w.antor, 'POST', `${w.base}/fiches/${f.id}/sections`, { titre: 'Histoire', contenu: 'x' })).json();
  const s2 = (await w.req(w.antor, 'POST', `${w.base}/fiches/${f.id}/sections`, { titre: 'Histoire', contenu: 'y' })).json();
  assert.equal(s1.cle, 'histoire');
  assert.equal(s2.cle, 'histoire-2');
  const ren = await w.req(w.antor, 'PATCH', `${w.base}/fiches/${f.id}/sections/${s1.id}`, { titre: 'Passé' });
  assert.equal(ren.statusCode, 200, ren.body);
  const lue = (await w.req(w.antor, 'GET', `${w.base}/fiches/${f.id}`)).json();
  const sec = lue.sections.find((s: { id: number }) => s.id === s1.id);
  assert.equal(sec.titre, 'Passé');
  assert.equal(sec.cle, 'histoire');
  await w.app.close();
});

test('B-104 : l’import adresse une section née dans Kanevas par sa clé : ni refus ni doublon', async () => {
  const w = await monter(true);
  const uid = (w.app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const f = (await w.req(w.antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'lieu', titre: 'Le Phare' })).json();
  await w.req(w.antor, 'POST', `/api/univers/${uid}/fiches/${f.id}/sections`, { titre: 'Histoire', contenu: 'ancien' });
  const r = await w.app.inject({
    method: 'PUT',
    url: `/api/import/v1/univers/${uid}/fiches/${encodeURIComponent('lieu:le-phare')}`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
    payload: { type: 'lieu', titre: 'Le Phare', sections: [{ cle: 'histoire', titre: 'Histoire', contenu: 'nouveau' }] },
  });
  assert.ok(r.statusCode === 200 || r.statusCode === 201, r.body);
  const lue = (await w.req(w.antor, 'GET', `/api/univers/${uid}/fiches/${f.id}`)).json();
  assert.equal(lue.sections.length, 1);
  // reached by its key: the import neither refuses it nor duplicates it; the text edited in Kanevas is protected, not overwritten
  assert.equal(lue.sections[0].cle, 'histoire');
  assert.equal(lue.sections[0].contenu, 'ancien');
  assert.match(r.body, /Histoire/);
  await w.app.close();
});

test('B-99 : creee_via vaut ecran pour une fiche créée à l’écran et import pour une fiche importée', async () => {
  const w = await monter(true);
  const uid = (w.app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const f = (await w.req(w.antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'lieu', titre: 'Écran' })).json();
  const r = await w.app.inject({
    method: 'PUT',
    url: `/api/import/v1/univers/${uid}/fiches/kanka-77`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
    payload: { type: 'lieu', titre: 'Importée', sections: [] },
  });
  assert.ok(r.statusCode === 200 || r.statusCode === 201, r.body);
  const via = (id: number) => (w.app.db.prepare('SELECT creee_via v FROM fiches WHERE id = ?').get(id) as { v: string }).v;
  assert.equal(via(f.id), 'ecran');
  assert.equal(via(r.json().id), 'import');
  assert.equal(r.json().cle ?? 'kanka-77', 'kanka-77');
  await w.app.close();
});

test('B-100 : l’identifiant d’univers se tire du nom (accents retirés), doublon suffixé, nom sans lettre = univers-<id>', async () => {
  const w = await monter();
  assert.equal(w.u.cle, 'eneria');
  const mk = async (nom: string) => (await w.req(w.antor, 'POST', '/api/univers', { nom })).json() as { id: number; cle: string };
  assert.equal((await mk('Éneria')).cle, 'eneria-2');
  assert.equal((await mk('Lame d’Ébène')).cle, 'lame-d-ebene');
  const sans = await mk('1234');
  assert.equal(sans.cle, `univers-${sans.id}`);
  await w.app.close();
});

test('B-100 : le propriétaire reprend l’ancien identifiant (eneria-v2 puis eneria) ; 40 caractères acceptés, 41 refusés', async () => {
  const w = await monter();
  const p = (cle: string) => w.req(w.antor, 'PATCH', `/api/univers/${w.u.id}`, { cle });
  assert.equal((await p('eneria-v2')).statusCode, 200);
  assert.equal((await p('eneria')).statusCode, 200);
  assert.equal((await w.req(w.antor, 'GET', '/api/univers/eneria-v2')).json().id, w.u.id);
  assert.equal((await p('a'.repeat(40))).statusCode, 200);
  const trop = await p('a'.repeat(41));
  assert.equal(trop.statusCode, 400);
  assert.equal(trop.json().champ, 'cle');
  assert.equal((await p('ab')).statusCode, 200);
  assert.equal((await p('a')).statusCode, 400);
  await w.app.close();
});

test('B-101 : l’adresse numérique d’une fiche née dans Kanevas répond 302 vers l’adresse lisible, et l’adresse lisible sert l’application', async () => {
  const w = await monter();
  const f = await w.creer('lieu', 'Nyx');
  const r = await w.app.inject({ method: 'GET', url: `/univers/${w.u.id}/fiche/${f.id}`, headers: w.antor });
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/univers/eneria/lieu/nyx');
  const ok = await w.app.inject({ method: 'GET', url: '/univers/eneria/lieu/nyx', headers: w.antor });
  assert.equal(ok.statusCode, 200);
  assert.match(ok.body, /SHELL/);
  await w.app.close();
});
