import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { essai } = await import('../outils/essai/index.js');
const { catalogueDe } = await import('../services/assistant/catalogue.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

// A module route behind garde('essai/a'): the trial module declares none, the test adds one before the app is built.
essai.routes = async (app, garde) => {
  app.get('/api/univers/:id/outils/essai/a/sonde', { preHandler: garde('essai/a') }, async (request) => ({
    compteId: request.outil!.acteur.compteId, role: request.outil!.role, modeJoueur: request.outil!.modeJoueur,
    sansCarburant: request.outil!.resolution.reglages.sansChargesCarburant!.valeur,
  }));
};

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });
const idU = (app: App, nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
const idS = (app: App, nom: string) => (app.db.prepare('SELECT id FROM systemes_jeu WHERE nom = ?').get(nom) as { id: number }).id;
const compteId = (app: App, nom: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(nom) as { id: number }).id;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const [antor, mira, lea, teo] = await Promise.all(['antor', 'mira', 'lea', 'teo'].map((c) => connecter(app, c)));
  return { app, antor: antor!, mira: mira!, lea: lea!, teo: teo!,
    E: idU(app, "Éneria d'essai"), V: idU(app, 'Univers voisin'), A: idU(app, 'Univers ancien'),
    S: idS(app, "Système d'essai"), SA: idS(app, 'Système ancien') };
}
const base = (u: number) => `/api/univers/${u}/outils`;

test('sans session, chaque route des outils répond 401', async () => {
  const w = await monde();
  for (const [m, u] of [['GET', base(w.E) + '/entrees'], ['GET', base(w.E)], ['GET', `/api/systemes/${w.S}/outils`],
    ['GET', base(w.E) + '/essai/a/description'], ['PUT', base(w.E) + '/essai/a/activation'],
    ['POST', `/api/systemes/${w.S}/responsable`]] as const) {
    assert.equal((await appel(w.app, null, m, u, {})).statusCode, 401, `${m} ${u}`);
  }
});

test('entrées : activé et visible seulement, rien pour un non-membre (404)', async () => {
  const w = await monde();
  // Nothing enabled yet.
  assert.deepEqual((await appel(w.app, w.antor, 'GET', base(w.E) + '/entrees')).json(), []);
  assert.equal((await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/activation`, { active: true })).statusCode, 204);
  const attendu = [{ cle: 'essai/a', libelle: 'Essai A', icone: 'Map', chemin: `/univers/${w.E}/outils/essai/a` }];
  assert.deepEqual((await appel(w.app, w.antor, 'GET', base(w.E) + '/entrees')).json(), attendu);
  assert.deepEqual((await appel(w.app, w.lea, 'GET', base(w.E) + '/entrees')).json(), attendu);
  // MJ only: Léa has nothing, Antor keeps it; Antor in Player mode loses it too.
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/visibilite`, { mj: true, joueur: false });
  assert.deepEqual((await appel(w.app, w.lea, 'GET', base(w.E) + '/entrees')).json(), []);
  assert.deepEqual((await appel(w.app, w.antor, 'GET', base(w.E) + '/entrees')).json(), attendu);
  assert.deepEqual((await appel(w.app, w.antor, 'GET', base(w.E) + '/entrees?mode=joueur')).json(), []);
  // Not a member of that universe: 404, not an empty list.
  assert.equal((await appel(w.app, w.teo, 'GET', base(w.E) + '/entrees')).statusCode, 404);
});

test('description : 404 octet pour octet identique à une adresse inconnue (désactivé, caché, inconnu, non-membre)', async () => {
  const w = await monde();
  const inconnue = await appel(w.app, w.lea, 'GET', base(w.E) + '/nexiste/pas/description');
  assert.equal(inconnue.statusCode, 404);
  const memeReponse = (r: Awaited<ReturnType<typeof appel>>) => {
    assert.equal(r.statusCode, 404);
    assert.equal(r.body, inconnue.body);
    assert.equal(r.headers['content-type'], inconnue.headers['content-type']);
  };
  memeReponse(await appel(w.app, w.lea, 'GET', base(w.E) + '/essai/a/description')); // disabled
  memeReponse(await appel(w.app, w.lea, 'GET', base(w.E) + '/essai/inconnu/description')); // unknown tool
  memeReponse(await appel(w.app, w.teo, 'GET', base(w.E) + '/essai/a/description')); // non-member
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/activation`, { active: true });
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/visibilite`, { mj: true, joueur: false });
  memeReponse(await appel(w.app, w.lea, 'GET', base(w.E) + '/essai/a/description')); // hidden from the role
  memeReponse(await appel(w.app, w.antor, 'GET', base(w.E) + '/essai/a/description?mode=joueur'));
  memeReponse(await appel(w.app, w.lea, 'GET', base(w.E) + '/essai/a/description?x=1'.replace('a/', 'zz/')));
  memeReponse(await appel(w.app, w.lea, 'GET', base(w.E) + '/essai/a/description/extra'));
  // The GM who can use it reads it.
  const d = await appel(w.app, w.antor, 'GET', base(w.E) + '/essai/a/description');
  assert.equal(d.statusCode, 200);
  const j = d.json();
  assert.equal(j.libelle, 'Essai A');
  assert.equal(j.type, 'carte');
  assert.deepEqual(j.dependances, []);
  assert.deepEqual(j.usages, []);
  assert.equal(j.reglages[0].nom, 'sansChargesCarburant');
  assert.deepEqual(j.reglages[0].forme, { type: 'booleen' });
  assert.deepEqual(j.valeurs.sansChargesCarburant, { valeur: false, origine: 'defaut' });
  // Visible to players: Léa reads it as well.
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/visibilite`, { joueur: true });
  assert.equal((await appel(w.app, w.lea, 'GET', base(w.E) + '/essai/a/description')).statusCode, 200);
});

test('GET univers/outils : MJ seulement, tous les outils même désactivés, deux niveaux côte à côte', async () => {
  const w = await monde();
  assert.equal((await appel(w.app, w.lea, 'GET', base(w.E))).statusCode, 404);
  assert.equal((await appel(w.app, w.teo, 'GET', base(w.E))).statusCode, 404);
  assert.equal((await appel(w.app, w.antor, 'GET', base(w.E) + '?mode=joueur')).statusCode, 404);
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/reglages`, { version: 0, valeurs: { sansChargesCarburant: true } });
  await appel(w.app, w.antor, 'PUT', `${base(w.E)}/essai/a/reglages`, { version: 0, valeurs: { sansChargesCarburant: false } });
  for (const mj of [w.antor, w.mira]) {
    const r = await appel(w.app, mj, 'GET', base(w.E));
    assert.equal(r.statusCode, 200);
    const v = r.json();
    assert.equal(v.ecriture, true);
    assert.deepEqual(v.outils.map((o: any) => o.cle), ['essai/a', 'essai/b', 'essai/g']);
    const a = v.outils[0];
    assert.equal(a.systeme.active, false);
    assert.equal(a.systeme.versionReglages, 1);
    assert.deepEqual(a.systeme.valeurs, { sansChargesCarburant: true });
    assert.deepEqual(a.univers.valeurs, { sansChargesCarburant: false });
    assert.equal(a.univers.versionReglages, 1);
    assert.equal(a.univers.active, null);
    assert.equal(a.effectif.active, false);
    assert.deepEqual(a.effectif.reglages.sansChargesCarburant, { valeur: false, origine: 'univers' });
    assert.deepEqual(v.outils[1].dependances, ['essai/a']);
    assert.equal(v.communs[0].module, 'essai');
    assert.equal(v.communs[0].reglages[0].nom, 'portee');
  }
});

test('GET systemes/outils : responsable, ecriture false pour un MJ non responsable, 404 pour les autres', async () => {
  const w = await monde();
  const a = (await appel(w.app, w.antor, 'GET', `/api/systemes/${w.S}/outils`)).json();
  assert.deepEqual(a.responsable, { id: compteId(w.app, 'antor'), nom: 'antor', vousEtes: true });
  assert.equal(a.ecriture, true);
  const m = await appel(w.app, w.mira, 'GET', `/api/systemes/${w.S}/outils`);
  assert.equal(m.statusCode, 200);
  assert.equal(m.json().ecriture, false);
  assert.deepEqual(m.json().responsable, { id: compteId(w.app, 'antor'), nom: 'antor', vousEtes: false });
  assert.equal(m.json().outils.length, 3);
  for (const h of [w.lea, w.teo]) assert.equal((await appel(w.app, h, 'GET', `/api/systemes/${w.S}/outils`)).statusCode, 404);
  assert.equal((await appel(w.app, w.antor, 'GET', `/api/systemes/${w.S}/outils?mode=joueur`)).statusCode, 404);
  assert.equal((await appel(w.app, w.antor, 'GET', '/api/systemes/999999/outils')).statusCode, 404);
});

test('PUT système : responsable écrit, autre MJ 403, joueur et étranger 404, mode Joueur refusé sans écrire', async () => {
  const w = await monde();
  const url = `/api/systemes/${w.S}/outils/essai/a/activation`;
  const etat = () => (w.app.db.prepare("SELECT active FROM outils_systeme WHERE systeme_id = ? AND outil = 'essai/a'").get(w.S) as any)?.active;
  const r403 = await appel(w.app, w.mira, 'PUT', url, { active: true });
  assert.equal(r403.statusCode, 403);
  assert.equal(etat(), undefined);
  assert.equal((await appel(w.app, w.lea, 'PUT', url, { active: true })).statusCode, 404);
  assert.equal((await appel(w.app, w.teo, 'PUT', url, { active: true })).statusCode, 404);
  const mj = await appel(w.app, w.antor, 'PUT', url + '?mode=joueur', { active: true });
  assert.ok(mj.statusCode === 403 || mj.statusCode === 404, `mode Joueur : ${mj.statusCode}`);
  assert.equal(etat(), undefined);
  assert.equal((await appel(w.app, w.antor, 'PUT', url, { active: true })).statusCode, 204);
  assert.equal(etat(), 1);
  // Same for visibility and settings.
  for (const [chemin, corps] of [['visibilite', { joueur: false }], ['reglages', { version: 0, valeurs: { sansChargesCarburant: true } }]] as const) {
    const u = `/api/systemes/${w.S}/outils/essai/a/${chemin}`;
    assert.equal((await appel(w.app, w.mira, 'PUT', u, corps)).statusCode, 403, chemin);
    assert.equal((await appel(w.app, w.lea, 'PUT', u, corps)).statusCode, 404, chemin);
    assert.ok((await appel(w.app, w.antor, 'PUT', u + '?mode=joueur', corps)).statusCode >= 403, chemin);
  }
  assert.equal((await appel(w.app, w.antor, 'GET', `/api/systemes/${w.S}/outils`)).json().outils[0].systeme.versionReglages, 0);
});

test('PUT univers : MJ de l’univers, joueur 404, mode Joueur refusé', async () => {
  const w = await monde();
  const url = `${base(w.E)}/essai/a/activation`;
  assert.equal((await appel(w.app, w.lea, 'PUT', url, { active: true })).statusCode, 404);
  assert.equal((await appel(w.app, w.teo, 'PUT', url, { active: true })).statusCode, 404);
  assert.ok((await appel(w.app, w.antor, 'PUT', url + '?mode=joueur', { active: true })).statusCode >= 403);
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM outils_univers').get()!['n' as never], 0);
  assert.equal((await appel(w.app, w.mira, 'PUT', url, { active: true })).statusCode, 204); // a GM of the universe, not the system's owner
});

test('refus de C-3 et C-4 : code et champ dans le corps', async () => {
  const w = await monde();
  const sys = `/api/systemes/${w.S}/outils`;
  const b = await appel(w.app, w.antor, 'PUT', `${sys}/essai/b/activation`, { active: true });
  assert.equal(b.statusCode, 409);
  assert.equal(b.json().message, "Essai B demande Essai A : activez-le d'abord.");
  assert.equal(b.json().code, 'dependance');
  await appel(w.app, w.antor, 'PUT', `${sys}/essai/a/activation`, { active: true });
  await appel(w.app, w.antor, 'PUT', `${sys}/essai/b/activation`, { active: true });
  const off = await appel(w.app, w.antor, 'PUT', `${sys}/essai/a/activation`, { active: false });
  assert.equal(off.statusCode, 409);
  assert.equal(off.json().code, 'dependant');
  const mauvais = await appel(w.app, w.antor, 'PUT', `${sys}/essai/a/reglages`, { version: 0, valeurs: { sansChargesCarburant: 'oui' } });
  assert.equal(mauvais.statusCode, 400);
  assert.equal(mauvais.json().champ, 'sansChargesCarburant');
  assert.equal(mauvais.json().code, 'invalide');
  const inconnu = await appel(w.app, w.antor, 'PUT', `${sys}/essai/a/reglages`, { version: 0, valeurs: { zzz: 1 } });
  assert.equal(inconnu.statusCode, 400);
  assert.equal(inconnu.json().champ, 'zzz');
  await appel(w.app, w.antor, 'PUT', `${sys}/essai/a/reglages`, { version: 0, valeurs: { sansChargesCarburant: true } });
  const perime = await appel(w.app, w.antor, 'PUT', `${sys}/essai/a/reglages`, { version: 0, valeurs: { sansChargesCarburant: false } });
  assert.equal(perime.statusCode, 409);
  assert.equal(perime.json().code, 'version');
  // Overriding a universe-only setting at system level: invalid, naming the field.
  const niv = await appel(w.app, w.antor, 'PUT', `${sys}/essai/g/reglages`, { version: 0, valeurs: { marge: 5 } });
  assert.equal(niv.statusCode, 400);
  assert.equal(niv.json().champ, 'marge');
  // Corps absents ou de mauvais type : jamais un 500.
  for (const corps of [undefined, {}, { active: 'oui' }]) {
    const r = await appel(w.app, w.antor, 'PUT', `${sys}/essai/a/activation`, corps as object);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `activation ${JSON.stringify(corps)} → ${r.statusCode}`);
  }
  for (const corps of [undefined, {}, { version: 'x' }]) {
    const r = await appel(w.app, w.antor, 'PUT', `${sys}/essai/a/reglages`, corps as object);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `reglages ${JSON.stringify(corps)} → ${r.statusCode}`);
  }
  // Unknown tool and unknown id.
  assert.equal((await appel(w.app, w.antor, 'PUT', `${sys}/essai/zzz/activation`, { active: true })).statusCode, 404);
  assert.equal((await appel(w.app, w.antor, 'PUT', `/api/systemes/abc/outils/essai/a/activation`, { active: true })).statusCode, 404);
});

test('POST responsable : transfert, MJ rattaché seulement, 403 / 404, champ du refus', async () => {
  const w = await monde();
  const url = (s: number) => `/api/systemes/${s}/responsable`;
  assert.equal((await appel(w.app, w.mira, 'POST', url(w.S), { compteId: compteId(w.app, 'mira') })).statusCode, 403);
  assert.equal((await appel(w.app, w.lea, 'POST', url(w.S), { compteId: compteId(w.app, 'lea') })).statusCode, 404);
  assert.equal((await appel(w.app, w.teo, 'POST', url(w.S), { compteId: compteId(w.app, 'teo') })).statusCode, 404);
  const joueuse = await appel(w.app, w.antor, 'POST', url(w.S), { compteId: compteId(w.app, 'lea') });
  assert.equal(joueuse.statusCode, 400);
  assert.equal(joueuse.json().champ, 'compte');
  for (const corps of [{}, { compteId: 'x' }, undefined]) {
    const r = await appel(w.app, w.antor, 'POST', url(w.S), corps as object);
    assert.equal(r.statusCode, 400, JSON.stringify(corps));
  }
  assert.ok((await appel(w.app, w.antor, 'POST', url(w.S) + '?mode=joueur', { compteId: compteId(w.app, 'mira') })).statusCode >= 403);
  assert.equal((await appel(w.app, w.antor, 'POST', url(w.S), { compteId: compteId(w.app, 'mira') })).statusCode, 204);
  // Mira now writes at system level, Antor no longer, and keeps his universe level.
  assert.equal((await appel(w.app, w.mira, 'PUT', `/api/systemes/${w.S}/outils/essai/a/activation`, { active: true })).statusCode, 204);
  assert.equal((await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/activation`, { active: false })).statusCode, 403);
  assert.equal((await appel(w.app, w.antor, 'PUT', `${base(w.E)}/essai/a/activation`, { active: false })).statusCode, 204);
  assert.equal((await appel(w.app, w.antor, 'GET', `/api/systemes/${w.S}/outils`)).json().ecriture, false);
  // « Système ancien » has no stored owner: its GM writes as owner.
  assert.equal((await appel(w.app, w.mira, 'PUT', `/api/systemes/${w.SA}/outils/essai/a/activation`, { active: true })).statusCode, 204);
  assert.equal((await appel(w.app, w.mira, 'GET', `/api/systemes/${w.SA}/outils`)).json().ecriture, true);
});

test('garde(\'essai/a\') : 404 identique si désactivé ou caché, sinon acteur, rôle et résolution', async () => {
  const w = await monde();
  const sonde = `${base(w.E)}/essai/a/sonde`;
  const inconnue = await appel(w.app, w.lea, 'GET', `${base(w.E)}/essai/a/autre-chose-inconnue`);
  assert.equal(inconnue.statusCode, 404);
  const r0 = await appel(w.app, w.lea, 'GET', sonde);
  assert.equal(r0.statusCode, 404);
  assert.equal(r0.body, inconnue.body);
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/activation`, { active: true });
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/reglages`, { version: 0, valeurs: { sansChargesCarburant: true } });
  const ok = await appel(w.app, w.lea, 'GET', sonde);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json(), { compteId: compteId(w.app, 'lea'), role: 'joueur', modeJoueur: false, sansCarburant: true });
  const mj = await appel(w.app, w.antor, 'GET', sonde + '?mode=joueur');
  assert.deepEqual(mj.json(), { compteId: compteId(w.app, 'antor'), role: 'mj', modeJoueur: true, sansCarburant: true });
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/visibilite`, { joueur: false });
  const cache = await appel(w.app, w.lea, 'GET', sonde);
  assert.equal(cache.statusCode, 404);
  assert.equal(cache.body, inconnue.body);
  assert.equal((await appel(w.app, w.antor, 'GET', sonde)).statusCode, 200);
  assert.equal((await appel(w.app, w.antor, 'GET', sonde + '?mode=joueur')).statusCode, 404);
  assert.equal((await appel(w.app, w.teo, 'GET', sonde)).statusCode, 404);
  // Disabled for a universe that follows: the neighbour (forced on) keeps it.
  await appel(w.app, w.antor, 'PUT', `${base(w.V)}/essai/a/activation`, { active: true });
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/activation`, { active: false });
  assert.equal((await appel(w.app, w.antor, 'GET', sonde)).statusCode, 404);
  assert.equal((await appel(w.app, w.antor, 'GET', `${base(w.V)}/essai/a/sonde`)).statusCode, 200);
});

test('catalogueDe : essai_a_decrire pour Antor si activé et visible, pas pour Léa si MJ seul, jamais d’événement', async () => {
  const w = await monde();
  const noms = (u: number, c: string) => catalogueDe(w.app.db, compteId(w.app, c), u).outils.map((o) => o.nom);
  assert.ok(!noms(w.E, 'antor').includes('essai_a_decrire'));
  assert.ok(!noms(w.E, 'lea').includes('essai_a_decrire'));
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/activation`, { active: true });
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/visibilite`, { mj: true, joueur: false });
  assert.ok(noms(w.E, 'antor').includes('essai_a_decrire'));
  assert.ok(!noms(w.E, 'lea').includes('essai_a_decrire'));
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/visibilite`, { joueur: true });
  assert.ok(noms(w.E, 'lea').includes('essai_a_decrire'));
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/reglages`, { version: 0, valeurs: { sansChargesCarburant: true } });
  const outil = catalogueDe(w.app.db, compteId(w.app, 'lea'), w.E).outils.find((o) => o.nom === 'essai_a_decrire')!;
  const res = await outil.executer({}) as any;
  assert.equal(res.ok, true);
  assert.equal(res.evenement, undefined);
  assert.deepEqual(res.donnees, { libelle: 'Essai A', sansChargesCarburant: true });
  const mauvais = await outil.executer({ x: 1 }) as any;
  assert.equal(mauvais.ok, false);
  assert.equal(mauvais.evenement, undefined);
  // Not a member: no catalogue at all.
  assert.throws(() => catalogueDe(w.app.db, compteId(w.app, 'teo'), w.E));
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/a/activation`, { active: false });
  for (const c of ['antor', 'lea']) assert.ok(!noms(w.E, c).includes('essai_a_decrire'));
});

test('un jeton kvs_ n’ouvre aucune de ces routes (401)', async () => {
  const w = await monde();
  const h = { authorization: `Bearer ${JETON_BOUCHON}` };
  const essai1 = idU(w.app, 'Essai Kanka');
  for (const [method, url] of [['GET', `${base(essai1)}/entrees`], ['GET', base(essai1)], ['GET', `${base(essai1)}/essai/a/description`],
    ['PUT', `${base(essai1)}/essai/a/activation`], ['GET', `/api/systemes/${w.S}/outils`], ['POST', `/api/systemes/${w.S}/responsable`]] as const) {
    const r = await w.app.inject({ method, url, headers: h, payload: method === 'GET' ? undefined : {} });
    assert.equal(r.statusCode, 401, `${method} ${url}`);
  }
});
