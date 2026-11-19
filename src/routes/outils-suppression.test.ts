import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { essaiB } = await import('../outils/essai/b.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

const EXEMPLE = JSON.parse(readFileSync(new URL('../outils/essai/exemples/catalogue-essai.json', import.meta.url), 'utf8'));

// Essai B (no catalogue) is given universe-level data only: on the system route it must stay unknown (D-2, D-5).
essaiB.donnees = { compter: () => [], effacer: () => {} };

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const idU = (app: App, nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
const idS = (app: App, nom: string) => (app.db.prepare('SELECT id FROM systemes_jeu WHERE nom = ?').get(nom) as { id: number }).id;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const [antor, mira, lea, teo] = await Promise.all(['antor', 'mira', 'lea', 'teo'].map((c) => connecter(app, c)));
  const ap = (h: H | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...(h ?? {}), ...extra }, payload: payload as any });
  return { app, ap, antor: antor!, mira: mira!, lea: lea!, teo: teo!,
    E: idU(app, "Éneria d'essai"), S: idS(app, "Système d'essai") };
}
type W = Awaited<ReturnType<typeof monde>>;
const G = 'essai/g';
const U = (w: W, o = G) => `/api/univers/${w.E}/outils/${o}/suppression`;
const SY = (w: W, o = G) => `/api/systemes/${w.S}/outils/${o}/suppression`;
const compte = (w: W) => (w.app.db.prepare('SELECT COUNT(*) n FROM essai_catalogue_elements').get() as any).n as number;
const charger = async (w: W) => {
  assert.equal((await w.ap(w.antor, 'PUT', `/api/systemes/${w.S}/outils/${G}/activation`, { active: true })).statusCode, 204);
  assert.equal((await w.ap(w.antor, 'POST', `/api/systemes/${w.S}/outils/${G}/catalogue/application`, EXEMPLE)).statusCode, 200);
  assert.equal((await w.ap(w.antor, 'POST', `/api/univers/${w.E}/outils/${G}/catalogue/application`, EXEMPLE)).statusCode, 200);
};

test('sans session : 401 ; un jeton kvs_ n\'ouvre aucune route de suppression', async () => {
  const w = await monde();
  for (const [m, u] of [['GET', U(w)], ['POST', U(w)], ['GET', SY(w)], ['POST', SY(w)]] as const) {
    assert.equal((await w.ap(null, m, u, { vu: [] })).statusCode, 401, `${m} ${u} sans session`);
    const r = await w.ap(null, m, u, m === 'GET' ? undefined : { vu: [] }, { authorization: `Bearer ${JETON_BOUCHON}` });
    assert.equal(r.statusCode, 401, `${m} ${u} jeton`);
  }
});

test('univers : Antor lit le résumé puis supprime avec le vu lu, outil désactivé compris', async () => {
  const w = await monde();
  await charger(w);
  const univers = (w.app.db.prepare("SELECT COUNT(*) n FROM essai_catalogue_elements WHERE niveau = 'univers'").get() as any).n as number;
  assert.ok(univers > 0);
  const systeme = compte(w) - univers;
  assert.ok(systeme > 0);
  // Disabled: deleting stays possible (AD-135).
  assert.equal((await w.ap(w.antor, 'PUT', `/api/systemes/${w.S}/outils/${G}/activation`, { active: false })).statusCode, 204);
  const lu = await w.ap(w.antor, 'GET', U(w));
  assert.equal(lu.statusCode, 200);
  const r = lu.json();
  assert.equal(r.niveau, 'univers');
  assert.equal(r.outil.cle, G);
  assert.equal(r.total, univers);
  assert.ok(r.efface.length > 0);
  const del = await w.ap(w.antor, 'POST', U(w), { vu: r.efface.map((l: any) => ({ cle: l.cle, nombre: l.nombre })) });
  assert.equal(del.statusCode, 200);
  assert.equal(del.json().total, univers);
  assert.deepEqual(del.json().efface, r.efface);
  assert.equal(compte(w), systeme, 'seul le niveau univers est effacé');
  assert.equal((await w.ap(w.antor, 'GET', U(w))).json().total, 0);
});

test('vu périmé : 409 contenu_change et rien n\'est effacé ; vu mal formé : 400', async () => {
  const w = await monde();
  await charger(w);
  const avant = compte(w);
  const r = (await w.ap(w.antor, 'GET', U(w))).json();
  const perime = r.efface.map((l: any, i: number) => ({ cle: l.cle, nombre: l.nombre + (i === 0 ? 1 : 0) }));
  const res = await w.ap(w.antor, 'POST', U(w), { vu: perime });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, 'contenu_change');
  assert.equal((await w.ap(w.antor, 'POST', U(w), { vu: [] })).statusCode, 409);
  assert.equal(compte(w), avant);
  assert.equal((await w.ap(w.antor, 'POST', U(w), {})).statusCode, 400);
  assert.equal((await w.ap(w.antor, 'POST', U(w), { vu: 'x' })).statusCode, 400);
  assert.equal(compte(w), avant);
});

test('univers : Léa et un étranger reçoivent le 404 d\'une adresse inconnue ; Antor en mode joueur 403', async () => {
  const w = await monde();
  await charger(w);
  const avant = compte(w);
  const inconnue = await w.ap(w.lea, 'GET', `/api/univers/${w.E}/outils/nexiste/pas/suppression`);
  assert.equal(inconnue.statusCode, 404);
  for (const h of [w.lea, w.teo]) {
    for (const [m, p] of [['GET', undefined], ['POST', { vu: [] }]] as const) {
      const r = await w.ap(h, m, U(w), p);
      assert.equal(r.statusCode, 404);
      assert.equal(r.body, inconnue.body);
      assert.equal(r.headers['content-type'], inconnue.headers['content-type']);
    }
  }
  const joueur = await w.ap(w.antor, 'GET', U(w) + '?mode=joueur');
  assert.equal(joueur.statusCode, 403);
  assert.equal((await w.ap(w.antor, 'POST', U(w) + '?mode=joueur', { vu: [] })).statusCode, 403);
  // An unknown tool is the same silence for the GM.
  assert.equal((await w.ap(w.antor, 'GET', U(w, 'essai/zz'))).body, inconnue.body);
  assert.equal(compte(w), avant);
});

test('système : responsable passe, MJ non responsable 403 sans détail, Léa 404', async () => {
  const w = await monde();
  await charger(w);
  const lu = await w.ap(w.antor, 'GET', SY(w));
  assert.equal(lu.statusCode, 200);
  const r = lu.json();
  assert.equal(r.niveau, 'systeme');
  assert.ok(r.total > 0);
  assert.ok(Array.isArray(r.encoreUtilise.univers));

  const mira = await w.ap(w.mira, 'GET', SY(w));
  assert.equal(mira.statusCode, 403);
  assert.deepEqual(Object.keys(mira.json()).sort(), ['code', 'message']);
  assert.equal(mira.json().code, 'refuse');
  const avant = compte(w);
  assert.equal((await w.ap(w.mira, 'POST', SY(w), { vu: r.efface })).statusCode, 403);
  assert.equal(compte(w), avant);
  const inconnue = await w.ap(w.lea, 'GET', `/api/systemes/${w.S}/outils/nexiste/pas/suppression`);
  const lea = await w.ap(w.lea, 'GET', SY(w));
  assert.equal(lea.statusCode, 404);
  assert.equal(lea.body, inconnue.body);

  const del = await w.ap(w.antor, 'POST', SY(w), { vu: r.efface.map((l: any) => ({ cle: l.cle, nombre: l.nombre })) });
  assert.equal(del.statusCode, 200);
  assert.equal(del.json().total, r.total);
  assert.equal(compte(w), avant - r.total);
});

test('outil sans catalogue de système : 404 sur la route du système, pas de supprimable', async () => {
  const w = await monde();
  const inconnue = await w.ap(w.antor, 'GET', `/api/systemes/${w.S}/outils/nexiste/pas/suppression`);
  const r = await w.ap(w.antor, 'GET', SY(w, 'essai/b'));
  assert.equal(r.statusCode, 404);
  assert.equal(r.body, inconnue.body);
  assert.equal((await w.ap(w.antor, 'POST', SY(w, 'essai/b'), { vu: [] })).statusCode, 404);
  const outils = (await w.ap(w.antor, 'GET', `/api/systemes/${w.S}/outils`)).json().outils as any[];
  const b = outils.find((o) => o.cle === 'essai/b');
  assert.ok(b);
  assert.equal('supprimable' in b, false);
  // …but its universe level exists (donnees declared) and is deletable.
  assert.equal((await w.ap(w.antor, 'GET', U(w, 'essai/b'))).statusCode, 200);
  const vu = ((await w.ap(w.antor, 'GET', `/api/univers/${w.E}/outils`)).json().outils as any[]).find((o) => o.cle === 'essai/b');
  assert.equal(vu.supprimable, true);
});

test('supprimable dans GET …/outils : Antor oui, Mira et Léa non ; absent pour un outil sans rien à supprimer', async () => {
  const w = await monde();
  const cle = (r: any, k: string) => (r.json().outils as any[]).find((o) => o.cle === k);
  const antorU = await w.ap(w.antor, 'GET', `/api/univers/${w.E}/outils`);
  assert.equal(antorU.statusCode, 200);
  assert.equal(cle(antorU, G).supprimable, true);
  assert.equal('supprimable' in cle(antorU, 'essai/a'), false);
  const antorS = await w.ap(w.antor, 'GET', `/api/systemes/${w.S}/outils`);
  assert.equal(cle(antorS, G).supprimable, true);
  const miraS = await w.ap(w.mira, 'GET', `/api/systemes/${w.S}/outils`);
  assert.equal(miraS.statusCode, 200);
  for (const o of miraS.json().outils as any[]) assert.equal('supprimable' in o, false, o.cle);
  const leaU = await w.ap(w.lea, 'GET', `/api/univers/${w.E}/outils`);
  if (leaU.statusCode === 200) for (const o of leaU.json().outils as any[]) assert.equal('supprimable' in o, false, o.cle);
  // Antor in Player mode cannot delete either.
  const mj = await w.ap(w.antor, 'GET', `/api/univers/${w.E}/outils?mode=joueur`);
  if (mj.statusCode === 200) for (const o of mj.json().outils as any[]) assert.equal('supprimable' in o, false, o.cle);
});
