import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-spatiale-reglages-routes (AD-reglages-8, AD-edition-5): the four routes of the settings and
// of the aspect catalogue, played through `inject`. Expected values are written by hand; the body of a success is `lireReglages`
// read again after the call.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const cookie: Record<string, string> = {};
  for (const c of ['antor', 'lea', 'teo']) cookie[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}`;
  const appeler = (who: string, method: 'GET' | 'POST' | 'PUT', path: string, payload?: unknown, extra: Record<string, string> = {}, galaxie = g) =>
    app.inject({ method, url: `${base.replace(`/galaxies/${g}`, `/galaxies/${galaxie}`)}/${path}`,
      headers: { cookie: cookie[who] ?? '', ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const version = () => one(app, 'SELECT version FROM swn_galaxies WHERE id=?', g).version as number;
  const lignes = () => ({
    reglages: one(app, 'SELECT count(*) n FROM swn_reglages').n as number,
    aspects: one(app, 'SELECT count(*) n FROM swn_aspects').n as number,
  });
  return { app, appeler, version, lignes, g, E, cookie };
}

const COMETE = { frequences: { comete: 1 } };

test('GET /reglages : 200, la lecture complète des défauts', async () => {
  const w = await monde();
  const res = await w.appeler('antor', 'GET', 'reglages');
  assert.equal(res.statusCode, 200, res.body);
  const b = res.json();
  assert.equal(b.version, w.version());
  assert.equal(b.par_defaut, true);
  assert.deepEqual(b.surcharge, {});
  assert.deepEqual(b.valeurs, b.defauts);
  assert.ok(b.versions_connues.includes(b.version_generateur));
  assert.equal(typeof b.densite_defaut, 'number');
  assert.ok(Array.isArray(b.aspects) && b.aspects.length > 0);
  for (const a of b.aspects) assert.deepEqual([a.surcharge, a.version], [{}, 0], a.type);
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 0 });
});

test('POST /reglages/apercu : 200 avec le décompte, rien d’écrit ; reglage_invalide porte champ et borne', async () => {
  const w = await monde();
  const v = w.version();
  const res = await w.appeler('antor', 'POST', 'reglages/apercu', { valeurs: COMETE });
  assert.equal(res.statusCode, 200, res.body);
  const b = res.json();
  assert.ok(b.tires_changent > 0, 'comète à 1 déplace des intérieurs');
  assert.equal(typeof b.definis_inchangent, 'number');
  assert.ok(b.etendue.largeur > 0 && b.etendue.hauteur > 0);
  assert.equal(w.version(), v);
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 0 });

  const mauvais = await w.appeler('antor', 'POST', 'reglages/apercu', { valeurs: { frequences: { comete: 2 } } });
  assert.equal(mauvais.statusCode, 400);
  assert.equal(mauvais.json().code, 'reglage_invalide');
  assert.equal(mauvais.json().champ, 'frequences.comete');
  assert.equal(mauvais.json().message, 'Entre 0 et 1.');
});

test('PUT /reglages : succès (corps = GET relu), version +1 ; confirmation_requise, reglage_invalide et a_change sans écriture', async () => {
  const w = await monde();
  const v = w.version();

  const sans = await w.appeler('antor', 'PUT', 'reglages', { version: v, valeurs: COMETE });
  assert.equal(sans.statusCode, 400);
  assert.deepEqual([sans.json().code, sans.json().champ], ['confirmation_requise', 'confirme']);

  const hors = await w.appeler('antor', 'PUT', 'reglages', { version: v, valeurs: { frequences: { comete: 2 } }, confirme: true });
  assert.equal(hors.statusCode, 400);
  assert.deepEqual([hors.json().code, hors.json().champ], ['reglage_invalide', 'frequences.comete']);

  const perime = await w.appeler('antor', 'PUT', 'reglages', { version: v + 5, valeurs: COMETE, confirme: true });
  assert.equal(perime.statusCode, 409);
  assert.equal(perime.json().code, 'a_change');

  const sansVersion = await w.appeler('antor', 'PUT', 'reglages', { valeurs: COMETE, confirme: true });
  assert.equal(sansVersion.statusCode, 400);
  assert.equal(sansVersion.json().champ, 'version');

  assert.equal(w.version(), v);
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 0 });

  const ok = await w.appeler('antor', 'PUT', 'reglages', { version: v, valeurs: COMETE, confirme: true });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(w.version(), v + 1);
  assert.deepEqual(w.lignes(), { reglages: 1, aspects: 0 });
  const relu = await w.appeler('antor', 'GET', 'reglages');
  assert.deepEqual(ok.json(), relu.json());
  assert.equal(ok.json().version, v + 1);
  assert.deepEqual(ok.json().surcharge, COMETE);
  assert.equal(ok.json().par_defaut, false);
  assert.equal(ok.json().valeurs.frequences.comete, 1);

  // Replaying the same token is now stale.
  const rejeu = await w.appeler('antor', 'PUT', 'reglages', { version: v, valeurs: COMETE, confirme: true });
  assert.equal(rejeu.statusCode, 409);

  // Back to the defaults.
  const retour = await w.appeler('antor', 'PUT', 'reglages', { version: v + 1, valeurs: null, confirme: true });
  assert.equal(retour.statusCode, 200, retour.body);
  assert.equal(retour.json().par_defaut, true);
  assert.equal(retour.json().version, v + 2);
});

test('PUT /aspects/:type : succès (corps = lireReglages), version de la ligne, galaxie inchangée ; a_change, type inconnu, borne', async () => {
  const w = await monde();
  const v = w.version();
  const type = (await w.appeler('antor', 'GET', 'reglages')).json().aspects[0].type as string;

  const hors = await w.appeler('antor', 'PUT', `aspects/${type}`, { version: 0, parametres: { cle_inconnue: 1 } });
  assert.equal(hors.statusCode, 400, hors.body);
  assert.equal(hors.json().code, 'reglage_invalide');
  assert.ok(hors.json().champ);

  const inconnu = await w.appeler('antor', 'PUT', 'aspects/nexiste-pas', { version: 0, parametres: null });
  assert.equal(inconnu.statusCode, 400);
  assert.equal(inconnu.json().champ, 'type');

  const parametres = (await w.appeler('antor', 'GET', 'reglages')).json().aspects.find((a: any) => a.type === type).defaut as Record<string, unknown>;
  const ok = await w.appeler('antor', 'PUT', `aspects/${type}`, { version: 0, parametres });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(w.version(), v, 'la version de la galaxie ne bouge pas');
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 1 });
  const relu = (await w.appeler('antor', 'GET', 'reglages')).json();
  assert.deepEqual(ok.json(), relu);
  const ligne = relu.aspects.find((a: any) => a.type === type);
  assert.deepEqual([ligne.surcharge, ligne.version], [parametres, 1]);

  const perime = await w.appeler('antor', 'PUT', `aspects/${type}`, { version: 0, parametres });
  assert.equal(perime.statusCode, 409);
  assert.equal(perime.json().code, 'a_change');

  const retire = await w.appeler('antor', 'PUT', `aspects/${type}`, { version: 1, parametres: null });
  assert.equal(retire.statusCode, 200, retire.body);
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 0 });
});

test('indisponible : un décompte qui dépasse son délai répond 503 `indisponible`, rien d’écrit', async () => {
  const w = await monde();
  const v = w.version();
  const vrai = Date.now;
  // `compter` reads the clock once for its deadline, then at each block: from its second reading on, the clock is an hour ahead.
  let lectures = 0;
  const horsDelai = () => (new Error().stack ?? '').includes('at compter ') && ++lectures > 1 ? vrai() + 3_600_000 : vrai();
  Date.now = horsDelai;
  try {
    const apercu = await w.appeler('antor', 'POST', 'reglages/apercu', { valeurs: COMETE });
    assert.equal(apercu.statusCode, 503, apercu.body);
    assert.equal(apercu.json().code, undefined);
    assert.equal(apercu.json().message, "Le décompte n'est pas disponible.");
    lectures = 0;
    const ecriture = await w.appeler('antor', 'PUT', 'reglages', { version: v, valeurs: COMETE, confirme: true });
    assert.equal(ecriture.statusCode, 503, ecriture.body);
  } finally { Date.now = vrai; }
  assert.equal(w.version(), v);
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 0 });
});

test('un en-tête Authorization est ignoré : seul le cookie ouvre les routes', async () => {
  const w = await monde();
  const bearer = { authorization: 'Bearer kvs_nimporte-quoi' };
  // Valid cookie + junk bearer: still answered as the cookie's account.
  assert.equal((await w.appeler('antor', 'GET', 'reglages', undefined, bearer)).statusCode, 200);
  // Bearer alone, no cookie: no session, never an import-token path.
  for (const [m, p, body] of [['GET', 'reglages'], ['POST', 'reglages/apercu', {}], ['PUT', 'reglages', {}], ['PUT', 'aspects/x', {}]] as const) {
    const r = await w.appeler('anonyme', m, p, body, bearer);
    assert.notEqual(r.statusCode, 200, `${m} ${p}`);
    assert.ok(r.statusCode === 401 || r.statusCode === 302 || r.statusCode === 404, `${m} ${p}: ${r.statusCode}`);
  }
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 0 });
});

test('une joueuse, un non-membre : le corps d’une galaxie inconnue, octet pour octet, sur les quatre routes ; rien d’écrit', async () => {
  const w = await monde();
  const v = w.version();
  const routes = [
    ['GET', 'reglages', undefined], ['POST', 'reglages/apercu', { valeurs: COMETE }],
    ['PUT', 'reglages', { version: v, valeurs: COMETE, confirme: true }],
    ['PUT', 'aspects/etoile', { version: 0, parametres: null }],
  ] as const;
  for (const [m, p, body] of routes) {
    const ref = await w.appeler('antor', m, p, body, {}, 999999);
    assert.equal(ref.statusCode, 404, `${m} ${p} inconnue`);
    for (const qui of ['lea', 'teo']) {
      const r = await w.appeler(qui, m, p, body);
      assert.equal(r.statusCode, ref.statusCode, `${qui} ${m} ${p}`);
      assert.equal(r.body, ref.body, `${qui} ${m} ${p}`);
    }
  }
  assert.equal(w.version(), v);
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 0 });
});

test('le MJ en mode joueur lit ; toute écriture et l’aperçu rendent refuse / mode_joueur, rien d’écrit', async () => {
  const w = await monde();
  const v = w.version();
  const lecture = await w.appeler('antor', 'GET', 'reglages?mode=joueur');
  assert.equal(lecture.statusCode, 200, lecture.body);
  assert.deepEqual(lecture.json(), (await w.appeler('antor', 'GET', 'reglages')).json());
  for (const [m, p, body] of [
    ['POST', 'reglages/apercu', { valeurs: COMETE }],
    ['PUT', 'reglages', { version: v, valeurs: COMETE, confirme: true }],
    ['PUT', 'aspects/etoile', { version: 0, parametres: null }],
  ] as const) {
    const r = await w.appeler('antor', m, `${p}?mode=joueur`, body);
    assert.equal(r.statusCode, 403, `${m} ${p}: ${r.body}`);
    assert.equal(r.json().code, 'mode_joueur');
  }
  assert.equal(w.version(), v);
  assert.deepEqual(w.lignes(), { reglages: 0, aspects: 0 });
});
