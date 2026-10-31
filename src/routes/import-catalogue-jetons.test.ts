import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { changerRoleNoyau } = await import('../services/membres.js');

const EXEMPLE = JSON.parse(readFileSync(new URL('../outils/essai/exemples/catalogue-essai.json', import.meta.url), 'utf8'));
const fautif = () => {
  const f = structuredClone(EXEMPLE);
  f.armes = f.armes.map((a: any) => a.cle === 'laser-lourd' ? (({ masse, ...r }) => r)(a) : a);
  return f;
};
const G = 'essai/g';

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session')!;
  return { cookie: `kanevas_session=${c.value}` };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = await connecter(app, 'antor');
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const K = un('SELECT id FROM univers WHERE nom = ?', 'Essai Kanka').id as number;
  const S = un('SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const tok = (compte: string, outils?: string[], univers = E) =>
    creerJeton(app.db, id(compte), univers, { nom: 'T', dureeJours: 30, outils }, app.horloge()).valeur;
  const req = (valeur: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as any });
  const nb = (t: string) => un(`SELECT COUNT(*) n FROM ${t}`).n as number;
  return { app, antor, id, E, K, S, tok, req, nb, un };
}
const CAT = `/outils/${G}/catalogue`;

test('jeton d\'outil : fichier fautif en univers dans un lot d\'outil, compteurs par nature, rejeu inchangé', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]);
  const lot = await w.req(t, 'POST', `/lots?outil=${G}`);
  assert.equal(lot.statusCode, 201);
  const lid = lot.json().lotId;
  const r = await w.req(t, 'PUT', `${CAT}?niveau=univers&lot=${lid}`, fautif());
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, [{ nature: 'armes', cle: 'laser-lourd', champ: 'masse', raison: 'nombre attendu' }]);
  const l = (await w.req(t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.coques.creees, 4);
  assert.equal(l.compteurs.armes.creees, 7);
  assert.equal(l.compteurs.armes.refusees, 1);
  assert.ok(l.rapport.some((e: any) => e.cle === 'laser-lourd'));
  const r2 = await w.req(t, 'PUT', `${CAT}?lot=${lid}`, fautif());
  assert.equal(r2.statusCode, 200);
  const l2 = (await w.req(t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l2.compteurs.coques.inchangees, 4);
  assert.equal(l2.compteurs.armes.inchangees, 7);
  assert.equal(l2.compteurs.coques.creees, 4);
});

test('portée : le jeton d\'outil n\'ouvre ni lot de contenu, ni PUT fiche, ni autre outil, ni outil inconnu', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]);
  const refus = async (r: Promise<any>) => {
    const x = await r;
    assert.equal(x.statusCode, 401);
    assert.deepEqual(x.json(), { message: 'Jeton invalide.', code: 'jeton_invalide' });
  };
  await refus(w.req(t, 'POST', '/lots'));
  await refus(w.req(t, 'PUT', '/fiches/x', { titre: 'X', type: 'personnage' }));
  await refus(w.req(t, 'PUT', '/outils/essai/h/catalogue', EXEMPLE));
  await refus(w.req(t, 'PUT', '/outils/nimporte/quoi/catalogue', EXEMPLE));
  await refus(w.req(t, 'POST', '/outils/essai/h/catalogue/apercu', EXEMPLE));
  await refus(w.req(t, 'POST', '/lots?outil=essai/h'));
  await refus(w.req(t, 'GET', ''));
  assert.equal(w.nb('lots_import'), 0);
});

test('portée : le jeton de contenu est refusé sur les routes d\'outil et ouvre toujours PUT fiche', async () => {
  const w = await monde();
  const t = w.tok('antor');
  for (const [m, u] of [['PUT', CAT], ['POST', `${CAT}/apercu`], ['POST', `/lots?outil=${G}`]] as const) {
    const r = await w.req(t, m, u, EXEMPLE);
    assert.equal(r.statusCode, 401, u);
    assert.equal(r.json().code, 'jeton_invalide');
  }
  assert.equal(w.nb('lots_import'), 0);
  const ok = await w.req(t, 'PUT', '/fiches/cle1', { titre: 'Une fiche', type: 'personnage' });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal((await w.req(t, 'POST', '/lots')).statusCode, 201);
});

test('niveau système : responsable écrit, MJ non responsable 403 refuse, responsable devenu Joueur 401', async () => {
  const w = await monde();
  const lignes = () => w.nb('essai_catalogue_elements');
  const ta = w.tok('antor', [G]);
  const a = await w.req(ta, 'PUT', `${CAT}?niveau=systeme`, fautif());
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(lignes(), 11);
  const tm = w.tok('mira', [G]);
  const m = await w.req(tm, 'PUT', `${CAT}?niveau=systeme`, { ...fautif(), version: 'autre' });
  assert.equal(m.statusCode, 403);
  assert.equal(lignes(), 11);
  const mp = await w.req(tm, 'POST', `${CAT}/apercu?niveau=systeme`, EXEMPLE);
  assert.equal(mp.statusCode, 403);
  changerRoleNoyau(w.app.db, w.E, w.id('antor'), 'joueur');
  const j = await w.req(ta, 'PUT', `${CAT}?niveau=systeme`, fautif());
  assert.equal(j.statusCode, 401);
});

test('niveau invalide : 400 ; système sans système : introuvable', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]);
  const r = await w.req(t, 'PUT', `${CAT}?niveau=monde`, EXEMPLE);
  assert.equal(r.statusCode, 400);
  assert.equal(w.nb('essai_catalogue_elements'), 0);
});

test('lots : clos 409 lot_clos, lot de contenu 400, rien d\'écrit', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]);
  const lid = (await w.req(t, 'POST', `/lots?outil=${G}`)).json().lotId;
  assert.equal((await w.req(t, 'POST', `/lots/${lid}/clore`)).statusCode, 200);
  const c = await w.req(t, 'PUT', `${CAT}?lot=${lid}`, EXEMPLE);
  assert.equal(c.statusCode, 409);
  assert.equal(c.json().code, 'lot_clos');
  assert.equal(w.nb('essai_catalogue_elements'), 0);
  // Lot de contenu (jeton de contenu du même MJ), utilisé par un jeton d'outil.
  const tc = w.tok('antor');
  const lc = (await w.req(tc, 'POST', '/lots')).json().lotId;
  const x = await w.req(t, 'PUT', `${CAT}?lot=${lc}`, EXEMPLE);
  assert.equal(x.statusCode, 400);
  assert.equal(w.nb('essai_catalogue_elements'), 0);
});

test('sans lot l\'import ne laisse de trace que sa réponse ; l\'aperçu n\'écrit ni ne compte', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]);
  const ap = await w.req(t, 'POST', `${CAT}/apercu`, fautif());
  assert.equal(ap.statusCode, 200);
  assert.equal(ap.json().apercu, true);
  assert.equal(w.nb('essai_catalogue_elements'), 0);
  const r = await w.req(t, 'PUT', CAT, fautif());
  assert.equal(r.statusCode, 200);
  assert.equal(w.nb('lots_import'), 0);
  assert.equal(w.nb('essai_catalogue_elements'), 11);
});

test('fichier de plus de 8 Mio : 413 fichier_trop_gros sur les deux routes', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]);
  const gros = JSON.stringify({ ...EXEMPLE, remplissage: 'x'.repeat(8 * 1024 * 1024 + 10) });
  for (const u of [CAT, `${CAT}/apercu`]) {
    const r = await w.app.inject({ method: u === CAT ? 'PUT' : 'POST', url: `/api/import/v1/univers/${w.E}${u}`,
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, payload: gros });
    assert.equal(r.statusCode, 413, u);
    assert.equal(r.json().code, 'fichier_trop_gros');
  }
  assert.equal(w.nb('essai_catalogue_elements'), 0);
});

test('panne injectée à l\'application : rien d\'écrit, rien de compté', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]);
  const lid = (await w.req(t, 'POST', `/lots?outil=${G}`)).json().lotId;
  // Fait échouer le comptage dans la transaction d'application.
  w.app.db.exec(`CREATE TRIGGER panne BEFORE UPDATE ON lots_import BEGIN SELECT RAISE(ABORT, 'panne'); END`);
  const r = await w.req(t, 'PUT', `${CAT}?lot=${lid}`, EXEMPLE);
  assert.ok(r.statusCode >= 500, String(r.statusCode));
  w.app.db.exec('DROP TRIGGER panne');
  assert.equal(w.nb('essai_catalogue_elements'), 0);
  const l = (await w.req(t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.coques.creees, 0);
});

test('toute route du scope d\'import déclare une portée', async () => {
  const w = await monde();
  const src = readFileSync(new URL('./import.ts', import.meta.url), 'utf8');
  const decl = src.match(/scope\.(get|post|put|delete)\(/g) ?? [];
  const configs = src.match(/config: \{ portee: '(contenu|outil|ouverture|lot)'/g) ?? [];
  assert.ok(decl.length >= 12);
  assert.equal(configs.length, decl.length);
  // Une route sans portée serait refusée : le 404 d'un chemin inconnu reste celui du serveur.
  const t = w.tok('antor');
  assert.equal((await w.req(t, 'GET', '/inconnu')).statusCode, 404);
});

test('creerJeton : outil sans catalogue, inconnu ou non applicable, ou sans système → invalide champ outils', async () => {
  const w = await monde();
  for (const outils of [['essai/h'], ['rien/du/tout'], [G, 'essai/h'], 'essai/g', [3]] as unknown[]) {
    assert.throws(() => creerJeton(w.app.db, w.id('antor'), w.E, { nom: 'T', dureeJours: 30, outils }),
      (e: any) => e.code === 'invalide' && e.champ === 'outils' || (e.champ === 'outils'), JSON.stringify(outils));
  }
  assert.throws(() => creerJeton(w.app.db, w.id('antor'), w.K, { nom: 'T', dureeJours: 30, outils: [G] }),
    (e: any) => e.champ === 'outils');
  assert.equal(w.nb('jetons_outils'), 0);
});

test('routes de session : POST/GET jetons avec outils, jetons/outils, lots avec outil et natures, suppression', async () => {
  const w = await monde();
  const h = w.antor;
  const c = await w.app.inject({ method: 'POST', url: `/api/univers/${w.E}/jetons`, headers: h,
    payload: { nom: 'Outil', dureeJours: 30, outils: [G] } });
  assert.equal(c.statusCode, 201, c.body);
  const l = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/jetons`, headers: h });
  assert.deepEqual(l.json().jetons?.[0]?.outils ?? l.json()[0]?.outils, [{ cle: G, libelle: 'Essai G' }]);
  const bad = await w.app.inject({ method: 'POST', url: `/api/univers/${w.E}/jetons`, headers: h,
    payload: { nom: 'Mauvais', dureeJours: 30, outils: ['essai/h'] } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().champ, 'outils');
  const p = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/jetons/outils`, headers: h });
  assert.equal(p.statusCode, 200);
  assert.deepEqual(p.json().map((o: any) => ({ cle: o.cle, libelle: o.libelle })), [{ cle: G, libelle: 'Essai G' }]);
  assert.equal(typeof p.json()[0].module, 'string');
  const pk = await w.app.inject({ method: 'GET', url: `/api/univers/${w.K}/jetons/outils`, headers: h });
  assert.deepEqual(pk.json(), []);
  // Joueur : refusé.
  const lea = await connecter(w.app, 'lea');
  assert.notEqual((await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/jetons/outils`, headers: lea })).statusCode, 200);

  const valeur = c.json().valeur;
  const lot = await w.req(valeur, 'POST', `/lots?outil=${G}`);
  assert.equal(lot.statusCode, 201);
  const ls = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/lots`, headers: h });
  const corps = ls.json();
  const premier = (Array.isArray(corps) ? corps : corps.lots)[0];
  assert.deepEqual(premier.outil, { cle: G, libelle: 'Essai G' });
  assert.deepEqual(premier.natures, [{ nom: 'coques', libelle: 'Coques' }, { nom: 'armes', libelle: 'Armes' }]);

  const idJ = (await w.app.inject({ method: 'POST', url: `/api/univers/${w.E}/jetons`, headers: h,
    payload: { nom: 'À supprimer', dureeJours: 30, outils: [G] } })).json().jeton.id;
  assert.equal(w.un('SELECT COUNT(*) n FROM jetons_outils WHERE jeton_id = ?', idJ).n, 1);
  // Supprimer un jeton supprime ses lignes de jetons_outils (cascade de la base).
  w.app.db.prepare('DELETE FROM jetons_api WHERE id = ?').run(idJ);
  assert.equal(w.un('SELECT COUNT(*) n FROM jetons_outils WHERE jeton_id = ?', idJ).n, 0);
  void revoquerJeton; void JETON_BOUCHON;
});

test('niveau système, MJ non responsable : le corps porte le code refuse (comme la route de session)', async () => {
  const w = await monde();
  const m = await w.req(w.tok('mira', [G]), 'PUT', `${CAT}?niveau=systeme`, fautif());
  assert.equal(m.statusCode, 403);
  assert.equal(m.json().code, 'refuse', m.body);
});
