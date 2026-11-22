import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-spatiale-elements-service (B-96, AD-elements-1): the routes under …/interieur/:q/:r/elements,
// under the tool's guard, cookie only; each write answers the system as the read gives it.
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
const PUIS = '42/43';
async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  app.db.prepare('UPDATE swn_galaxies SET visible = 1 WHERE id = ?').run(g);
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  const ouvert = app.db.prepare(
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)")
    .run(g, E, 'int-ouvert', 'Ouvert', 42, 43).lastInsertRowid as number;
  const astre = (cle: string, genre: string, type: string, orbite: number, heure: number) =>
    app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?)').run(ouvert, cle, genre, type, orbite, heure, 1);
  astre('etoile', 'etoile', 'naine_jaune', 0, 0); astre('mere', 'planete', 'rocheux', 2, 4);
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}`;
  const req = (who: string | null, method: 'GET' | 'PUT' | 'DELETE' | 'POST' | 'PATCH', path: string, payload?: unknown) =>
    app.inject({ method, url: `${base}/${path}`, headers: who ? h[who] : {}, ...(payload === undefined ? {} : { payload: payload as object }) });
  const lire = async (who: string) => { const r = await req(who, 'GET', `interieur/${PUIS}`); assert.equal(r.statusCode, 200, who + ' ' + r.body.slice(0, 200)); return r.json(); };
  return { app, E, g, req, lire, ouvert };
}

test('élément : ajout 201, déplacement, réservation, retrait ; chaque réponse est le système relu', async () => {
  const w = await monde();
  let v = await w.lire('antor');
  const jv = v.versionSysteme;
  const add = await w.req('antor', 'POST', `interieur/${PUIS}/elements`, { genre: 'vaisseau', nom: 'Aube-Brisée', sur: 'mere', versionSysteme: jv });
  assert.equal(add.statusCode, 201, add.body);
  v = await w.lire('antor');
  assert.deepEqual(add.json(), v);
  const el = () => v.elements[0];
  assert.deepEqual([el().nom, el().sur, el().orbite, el().heure, el().reserve], ['Aube-Brisée', 'mere', 2, 4, false]);
  assert.equal(one(w.app, 'SELECT orbite o FROM swn_elements').o, null);
  const etape = async (res: any) => { assert.equal(res.statusCode, 200, res.body); const relu = await w.lire('antor'); assert.deepEqual(res.json(), relu); v = relu; };
  const c = el().cle;
  await etape(await w.req('antor', 'PUT', `interieur/${PUIS}/elements/${c}/place`, { orbite: 5, heure: 6, version: el().version, versionSysteme: v.versionSysteme }));
  assert.deepEqual([el().sur, el().orbite, el().heure], [null, 5, 6]);
  await etape(await w.req('antor', 'PUT', `interieur/${PUIS}/elements/${c}/secret`, { secret: true, version: el().version, versionSysteme: v.versionSysteme }));
  assert.equal(el().reserve, true);
  assert.deepEqual((await w.lire('lea')).elements, []);
  await etape(await w.req('antor', 'PATCH', `interieur/${PUIS}/elements/${c}`, { nom: 'Renommée', version: el().version, versionSysteme: v.versionSysteme }));
  assert.equal(el().nom, 'Renommée');
  const stale = await w.req('antor', 'PATCH', `interieur/${PUIS}/elements/${c}`, { nom: 'Z', version: 1, versionSysteme: v.versionSysteme });
  assert.deepEqual([stale.statusCode, stale.json().code], [409, 'a_change']);
  const bad = await w.req('antor', 'PUT', `interieur/${PUIS}/elements/${c}/place`, { orbite: 1, heure: 12, version: el().version, versionSysteme: v.versionSysteme });
  assert.deepEqual([bad.statusCode, bad.json().code], [400, 'orbite_invalide']);
  const sur = await w.req('antor', 'PUT', `interieur/${PUIS}/elements/${c}/place`, { sur: c, version: el().version, versionSysteme: v.versionSysteme });
  assert.deepEqual([sur.statusCode, sur.json().code], [404, 'astre_inconnu']);
  const rm = await w.req('antor', 'DELETE', `interieur/${PUIS}/elements/${c}?version=${el().version}&versionSysteme=${v.versionSysteme}`);
  assert.equal(rm.statusCode, 200, rm.body);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 0);
});

test('élément : la joueuse, le MJ sans cookie et un outil inconnu n’écrivent pas ; l’aperçu du retrait est au MJ seul', async () => {
  const w = await monde();
  const v = await w.lire('antor');
  const add = await w.req('antor', 'POST', `interieur/${PUIS}/elements`, { genre: 'ville', nom: 'Port', sur: 'mere', versionSysteme: v.versionSysteme });
  assert.equal(add.statusCode, 201);
  await w.req('antor', 'POST', `interieur/${PUIS}/elements`, { genre: 'base', nom: 'Cache', sur: 'mere', secret: true });
  const compte = async (who: string | null) => (await w.req(who, 'GET', `interieur/${PUIS}/astres/mere/elements`));
  const mj = await compte('antor');
  assert.deepEqual([mj.statusCode, mj.json()], [200, { elements: 2 }]);
  assert.equal((await compte('lea')).statusCode, 403);
  assert.notEqual((await compte(null)).statusCode, 200);
  assert.equal((await w.req('antor', 'GET', `interieur/${PUIS}/astres/fantome/elements`)).statusCode, 404);
  const avant = one(w.app, 'SELECT count(*) n FROM swn_elements').n;
  for (const who of ['lea', null]) {
    const r = await w.req(who, 'POST', `interieur/${PUIS}/elements`, { genre: 'ville', nom: 'Pirate' });
    assert.ok([401, 403, 404].includes(r.statusCode), String(r.statusCode));
  }
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, avant);
  // the lists the screen reads
  const cat = await w.req('antor', 'GET', 'elements/aspects');
  assert.equal(cat.statusCode, 200);
  assert.deepEqual(cat.json().genres, ['vaisseau', 'ville', 'station', 'base', 'autre']);
  assert.ok(cat.json().icones.includes('vaisseau') && cat.json().couleurs.length > 0);
});
