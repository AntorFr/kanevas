import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-masquer-lecture (B-97), through the routes the screen calls: the GM hides a drawn
// system, a player's reads of it are byte for byte those of an address nobody holds, a player's write is refused.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { plagesDe } = await import('./regles/forme.js');
const GALAXIE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const TIRE = '-49/-48'; // a drawn system of the neutral seed
const VIDE = '-49/-47';

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
  for (const c of ['antor', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run('kanevas-neutre-1', GALAXIE.densites.defaut, g);
  for (const z of GALAXIE.densites.zones) {
    app.db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, E, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}`;
  const appeler = (who: string, method: 'GET' | 'PUT', path: string, payload?: unknown) =>
    app.inject({ method, url: `${base}/${path}`, headers: h[who] ?? {}, ...(payload === undefined ? {} : { payload: payload as object }) });
  const jeton = async () => (await appeler('antor', 'GET', `interieur/${TIRE}`)).json().versionSysteme as number;
  return { app, appeler, jeton, g };
}

test('le MJ masque le système tiré : 200, ancré et secret ; la joueuse le lit comme une adresse vide, sans fuite', async () => {
  const w = await monde();
  const lea = (p: string) => w.appeler('lea', 'GET', p);
  const vide = await lea(`interieur/${VIDE}`);
  assert.equal((await lea(`interieur/${TIRE}`)).statusCode, 200, 'tiré et lisible avant');
  const res = await w.appeler('antor', 'PUT', `interieur/${TIRE}/secret`, { secret: true, versionSysteme: await w.jeton() });
  assert.equal(res.statusCode, 200, res.body);
  const l = one(w.app, 'SELECT * FROM swn_systemes WHERE q=-49 AND r=-48');
  assert.equal(l.secret, 1); assert.equal(l.promu, 1);
  const apres = await lea(`interieur/${TIRE}`);
  assert.equal(apres.statusCode, vide.statusCode);
  assert.equal(apres.body, vide.body);
  for (const p of [`interieur/${TIRE}/sorties`, `interieur/${TIRE}/astres/etoile/illustration?cote=128`, `systemes/${l.cle}`, `interieur/${TIRE}/secret`]) {
    const r = await lea(p);
    const inconnu = await lea(p.replace(TIRE, VIDE).replace(l.cle, 'nulle-part'));
    assert.equal(r.statusCode, inconnu.statusCode, p);
    assert.equal(r.body, inconnu.body, p);
    assert.ok(r.statusCode === 404 || r.statusCode === 403, `${p} : ${r.statusCode}`);
  }
  const rech = await lea(`recherche?q=${encodeURIComponent(l.nom)}`);
  assert.ok(!rech.body.includes(l.cle) && !rech.body.includes(l.nom));
  const blocs = await lea('blocs?de=-11,-11&a=-8,-8');
  assert.ok(!blocs.body.includes(l.nom));
  // GM: reads the flag; démasqué: everything comes back.
  const etat = await w.appeler('antor', 'GET', `interieur/${TIRE}/secret`);
  assert.equal(etat.statusCode, 200);
  assert.equal(etat.json().secret, true); assert.equal(etat.json().promu, true);
  const re = await w.appeler('antor', 'PUT', `interieur/${TIRE}/secret`, { secret: false, versionSysteme: etat.json().versionSysteme });
  assert.equal(re.statusCode, 200, re.body);
  assert.equal((await lea(`interieur/${TIRE}`)).statusCode, 200);
});

test('écritures refusées : joueuse, étranger, sans session ; jeton périmé 409 ; hexagone vide 404 systeme_inconnu', async () => {
  const w = await monde();
  const jeton = await w.jeton();
  for (const who of ['lea', 'teo', 'inconnu']) {
    const r = await w.appeler(who, 'PUT', `interieur/${TIRE}/secret`, { secret: true, versionSysteme: jeton });
    assert.ok([302, 401, 403, 404].includes(r.statusCode), `${who} : ${r.statusCode}`);
  }
  assert.equal(one(w.app, 'SELECT count(*) AS n FROM swn_systemes').n, 0, 'rien d\'ancré');
  const vieux = await w.appeler('antor', 'PUT', `interieur/${TIRE}/secret`, { secret: true, versionSysteme: jeton + 7 });
  assert.equal(vieux.statusCode, 409); assert.equal(vieux.json().code ?? vieux.json().detail, 'a_change');
  const vide = await w.appeler('antor', 'PUT', `interieur/${VIDE}/secret`, { secret: true, versionSysteme: jeton });
  assert.equal(vide.statusCode, 404);
  assert.ok(JSON.stringify(vide.json()).includes('systeme_inconnu'), vide.body);
  const mauvais = await w.appeler('antor', 'PUT', `interieur/${TIRE}/secret`, { secret: 'oui', versionSysteme: jeton });
  assert.equal(mauvais.statusCode, 400);
  assert.equal(one(w.app, 'SELECT count(*) AS n FROM swn_systemes').n, 0);
});
