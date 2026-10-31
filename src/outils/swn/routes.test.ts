import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-galaxie-lire-api : routes de lecture G-6, liste des cartes G-8, outil G-9.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../../app.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');
const { JETON_BOUCHON, semerBouchon } = await import('../../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const get = (app: App, h: H | null, url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url, headers: { ...(h ?? {}), ...headers } });
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const [antor, lea, teo] = await Promise.all(['antor', 'lea', 'teo'].map((c) => connecter(app, c)));
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const V = one(app, 'SELECT id FROM univers WHERE nom = ?', 'Univers voisin').id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const cid = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  return { app, antor: antor!, lea: lea!, teo: teo!, E, V, S, g, cid, B: `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}` };
}

test('cinq réponses de la forme G-6, galaxie avec reference', async () => {
  const w = await monde();
  const gal = (await get(w.app, w.lea, w.B)).json();
  assert.equal(gal.titre, 'Galaxie d\'essai');
  assert.ok('reference' in gal, 'reference');
  const blocs = await get(w.app, w.lea, `${w.B}/blocs?de=-3,-3&a=3,3`);
  assert.equal(blocs.statusCode, 200);
  assert.deepEqual([blocs.json().systemes.length, blocs.json().routes.length], [3, 2]);
  const sys = await get(w.app, w.lea, `${w.B}/systemes/vael`);
  assert.equal(sys.statusCode, 200);
  assert.equal(JSON.stringify(sys.json()).includes('Vael'), true);
  const rech = await get(w.app, w.lea, `${w.B}/recherche?q=vael`);
  assert.equal(rech.statusCode, 200);
  assert.equal(rech.json().length, 1);
  const tr = await get(w.app, w.lea, `${w.B}/trajet?depart=port-sel&arrivee=vael&moteur=2&routes=publiques`);
  assert.equal(tr.statusCode, 200);
  assert.equal(tr.json().libelle, '7 cases · 4,5 jours');
});

test('Léa ne reçoit ni secret ni publique ni Station fantôme ; Antor oui', async () => {
  const w = await monde();
  for (const [h, voit] of [[w.lea, false], [w.antor, true]] as const) {
    const corps = (await get(w.app, h, `${w.B}/blocs?de=-3,-3&a=3,3`)).body
      + (await get(w.app, h, `${w.B}/recherche?q=fant`)).body;
    assert.equal(corps.includes('"secret":true'), voit);
    assert.equal(corps.includes('"publique":false'), voit);
    assert.equal(corps.includes('Station fantôme'), voit);
  }
  assert.equal((await get(w.app, w.antor, `${w.B}/systemes/station-fantome`)).statusCode, 200);
});

test('inconnu, caché à Léa, autre univers : 404 octet pour octet identique à une adresse inexistante', async () => {
  const w = await monde();
  const inconnue = await get(w.app, w.lea, `/api/univers/${w.E}/outils/swn/galaxie/nexiste`);
  assert.equal(inconnue.statusCode, 404);
  const pareil = (r: Awaited<ReturnType<typeof get>>, quoi: string) => {
    assert.equal(r.statusCode, 404, quoi);
    assert.equal(r.body, inconnue.body, quoi);
    assert.equal(r.headers['content-type'], inconnue.headers['content-type'], quoi);
  };
  pareil(await get(w.app, w.lea, `/api/univers/${w.E}/outils/swn/galaxie/galaxies/99999`), 'galaxie inconnue');
  pareil(await get(w.app, w.lea, `/api/univers/${w.E}/outils/swn/galaxie/galaxies/abc`), 'galaxie non numérique');
  pareil(await get(w.app, w.lea, `${w.B}/systemes/station-fantome`), 'système caché');
  pareil(await get(w.app, w.lea, `${w.B}/systemes/nexiste`), 'système inconnu');
  pareil(await get(w.app, w.lea, `${w.B}/trajet?depart=port-sel&arrivee=station-fantome`), 'trajet vers caché');
  pareil(await get(w.app, w.lea, `${w.B}/trajet?depart=port-sel&arrivee=nexiste`), 'trajet vers inconnu');
  pareil(await get(w.app, w.teo, `${w.B}/systemes/vael`), 'non-membre');
  pareil(await get(w.app, w.antor, `/api/univers/${w.V}/outils/swn/galaxie/galaxies/${w.g}`), 'autre univers');
  // Galaxy hidden from players.
  w.app.db.prepare('UPDATE swn_galaxies SET visible = 0 WHERE id = ?').run(w.g);
  for (const u of ['', '/blocs?de=0,0&a=1,1', '/systemes/vael', '/recherche?q=vael', '/trajet?depart=port-sel&arrivee=vael'])
    pareil(await get(w.app, w.lea, w.B + u), `galaxie cachée ${u}`);
  assert.equal((await get(w.app, w.antor, w.B)).statusCode, 200);
});

test('outil désactivé ou invisible du rôle : le même 404 sur les cinq routes', async () => {
  const w = await monde();
  const urls = ['', '/blocs?de=0,0&a=1,1', '/systemes/vael', '/recherche?q=vael', '/trajet?depart=port-sel&arrivee=vael'].map((u) => w.B + u);
  const inconnue = await get(w.app, w.lea, `/api/univers/${w.E}/outils/swn/galaxie/nexiste`);
  const put = (u: string, p: object) => w.app.inject({ method: 'PUT', url: u, headers: w.antor, payload: p });
  assert.equal((await put(`/api/systemes/${w.S}/outils/swn/galaxie/visibilite`, { mj: true, joueur: false })).statusCode, 204);
  for (const u of urls) {
    const r = await get(w.app, w.lea, u);
    assert.equal(r.statusCode, 404, u); assert.equal(r.body, inconnue.body, u);
    assert.equal((await get(w.app, w.antor, u)).statusCode, 200, `MJ ${u}`);
    assert.equal((await get(w.app, w.antor, u + (u.includes('?') ? '&' : '?') + 'mode=joueur')).statusCode, 404, `mode joueur ${u}`);
  }
  assert.equal((await put(`/api/systemes/${w.S}/outils/swn/galaxie/activation`, { active: false })).statusCode, 204);
  for (const u of urls) {
    const r = await get(w.app, w.antor, u);
    assert.equal(r.statusCode, 404, u); assert.equal(r.body, inconnue.body, u);
  }
});

test('rectangle : 12 × 12 blocs passe, au-delà est 400 invalide ; paramètres mal formés', async () => {
  const w = await monde();
  const ok = await get(w.app, w.lea, `${w.B}/blocs?de=0,0&a=11,11`);
  assert.equal(ok.statusCode, 200);
  for (const q of ['de=0,0&a=12,12', 'de=0,0&a=0,12', 'de=-6,-6&a=6,6', 'de=0,0', 'de=x,y&a=1,1', 'de=0,0&a=1,1,1', 'a=1,1&de=3,3']) {
    const r = await get(w.app, w.lea, `${w.B}/blocs?${q}`);
    assert.equal(r.statusCode, 400, q);
  }
  for (const q of ['moteur=0', 'moteur=7', 'moteur=2.5', 'moteur=abc', 'moteur=', 'routes=zzz', 'arrivee=port-sel']) {
    const r = await get(w.app, w.lea, `${w.B}/trajet?depart=port-sel&arrivee=vael&${q}`.replace('&arrivee=vael&arrivee', '&arrivee'));
    assert.equal(r.statusCode, 400, q);
  }
});

test('un jeton kvs_… n\'ouvre aucune route ; sans session 401', async () => {
  const w = await monde();
  for (const u of ['', '/blocs?de=0,0&a=1,1', '/systemes/vael', '/recherche?q=vael', '/trajet?depart=port-sel&arrivee=vael']) {
    const j = await get(w.app, null, w.B + u, { authorization: `Bearer ${JETON_BOUCHON}` });
    assert.equal(j.statusCode, 401, u);
    assert.equal((await get(w.app, null, w.B + u)).statusCode, 401, u);
    const aussi = await get(w.app, w.lea, w.B + u, { authorization: `Bearer ${JETON_BOUCHON}` });
    assert.equal(aussi.statusCode, 200, `cookie prime, ${u}`);
  }
  const imp = await get(w.app, null, `/api/import/v1/outils/swn/galaxie/galaxies/${w.g}`, { authorization: `Bearer ${JETON_BOUCHON}` });
  assert.equal(imp.statusCode, 404);
});

test('liste des cartes : « Galaxie d\'essai » en type outil, visible pour le MJ seulement', async () => {
  const w = await monde();
  const url = `/api/univers/${w.E}/cartes`;
  const att = (visible?: boolean) => ({ type: 'outil', id: w.g, universId: w.E, titre: "Galaxie d'essai", module: 'swn', outil: 'galaxie',
    adresse: `/univers/${w.E}/outils/swn/galaxie/${w.g}`, ...(visible === undefined ? {} : { visible }) });
  const o = (r: any) => r.json().cartes.filter((c: any) => c.type === 'outil');
  assert.deepEqual(o(await get(w.app, w.lea, url)), [att()]);
  assert.deepEqual(o(await get(w.app, w.antor, url)), [att(true)]);
  assert.deepEqual(o(await get(w.app, w.antor, url + '?mode=joueur')), [att()]);
  w.app.db.prepare('UPDATE swn_galaxies SET visible = 0 WHERE id = ?').run(w.g);
  assert.deepEqual(o(await get(w.app, w.lea, url)), []);
  assert.deepEqual(o(await get(w.app, w.antor, url)), [att(false)]);
  assert.equal((await get(w.app, w.teo, url)).statusCode, 404);
  // Disabled tool: gone for everyone.
  w.app.db.prepare('UPDATE swn_galaxies SET visible = 1 WHERE id = ?').run(w.g);
  await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/galaxie/activation`, headers: w.antor, payload: { active: false } });
  assert.deepEqual(o(await get(w.app, w.antor, url)), []);
});

test('outil swn_galaxie_trajet : catalogue, trajet identique à la route, refus sans événement', async () => {
  const w = await monde();
  const noms = (u: string) => catalogueDe(w.app.db, w.cid(u), w.E).outils.map((o) => o.nom);
  assert.ok(noms('antor').includes('swn_galaxie_trajet'));
  assert.ok(noms('lea').includes('swn_galaxie_trajet'));
  const run = (u: string, args: object) => catalogueDe(w.app.db, w.cid(u), w.E).outils.find((o) => o.nom === 'swn_galaxie_trajet')!.executer(args) as any;
  const viaRoute = (await get(w.app, w.lea, `${w.B}/trajet?depart=port-sel&arrivee=vael&moteur=2`)).json();
  const r = run('lea', { depart: 'Port-Sel', arrivee: 'Vael', moteur: 2 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.donnees, viaRoute);
  assert.equal('evenement' in r, false);
  for (const args of [{ depart: 'Port-Sel', arrivee: 'Station fantôme' }, { depart: 'Port-Sel', arrivee: 'Inconnu' }]) {
    const x = run('lea', args);
    assert.deepEqual(x, { ok: false, erreur: 'Introuvable.' });
  }
  assert.equal(run('antor', { depart: 'Port-Sel', arrivee: 'Station fantôme' }).ok, true);
  // Same name on two readable systems.
  const ins = w.app.db.prepare(`INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r) VALUES (?, ?, ?, 'Vael', ?, ?)`);
  ins.run(w.g, w.E, 'vael-bis', 2, 2);
  assert.deepEqual(run('lea', { depart: 'Port-Sel', arrivee: 'Vael' }), { ok: false, erreur: 'Plusieurs systèmes portent ce nom.' });
  // A second readable galaxy: `galaxie` is needed.
  w.app.db.prepare(`INSERT INTO swn_galaxies (univers_id, titre, visible, graine) VALUES (?, 'Autre', 1, 'x')`).run(w.E);
  assert.deepEqual(run('lea', { depart: 'Port-Sel', arrivee: 'Hesper' }), { ok: false, erreur: 'Précisez la galaxie.' });
  assert.equal(run('lea', { galaxie: "Galaxie d'essai", depart: 'Port-Sel', arrivee: 'Hesper' }).ok, true);
  // No readable galaxy for Léa.
  w.app.db.prepare('UPDATE swn_galaxies SET visible = 0').run();
  assert.deepEqual(run('lea', { depart: 'Port-Sel', arrivee: 'Hesper' }), { ok: false, erreur: 'Introuvable.' });
  // Tool disabled: in nobody's catalogue.
  await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/galaxie/activation`, headers: w.antor, payload: { active: false } });
  assert.ok(!noms('antor').includes('swn_galaxie_trajet'));
  assert.ok(!noms('lea').includes('swn_galaxie_trajet'));
});
