import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Review of kanevas-concepteur-vaisseaux-import-conceptions-route (B-95, I-1, K-6, C-5): the designs import door, by `inject`.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserActivation } = await import('../services/outils.js');

const T = 'swn/vaisseaux';
const ex = (nom: string) => JSON.parse(readFileSync(new URL(`../outils/swn/exemples/${nom}`, import.meta.url), 'utf8'));

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const K = un('SELECT id FROM univers WHERE nom = ?', 'Univers voisin').id as number;
  poserActivation(app.db, antor, { niveau: 'univers', id: E }, T, true);
  const tok = (outils?: string[], univers = E) => creerJeton(app.db, antor, univers, { nom: 'T', dureeJours: 30, outils }, app.horloge());
  const t = tok([T]).valeur;
  const req = (valeur: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, univers = E, prefixe = '/api/import/v1') =>
    app.inject({ method, url: `${prefixe}/univers/${univers}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as any });
  const ouvrir = async (valeur = t) => (await req(valeur, 'POST', `/lots?outil=${T}`)).json().lotId as number;
  const put = (valeur: string, corps: unknown, lot?: number, prefixe = '/api/import/v1', univers = E) =>
    req(valeur, 'PUT', `/outils/${T}/vaisseaux/conceptions${lot ? `?lot=${lot}` : ''}`, corps, univers, prefixe);
  const catalogue = async (lot: number) => {
    for (const f of ['catalogue-essai.json', 'catalogue-essai-conceptions.json']) {
      const r = await req(t, 'PUT', `/outils/${T}/catalogue?niveau=univers&lot=${lot}`, ex(f));
      assert.equal(r.statusCode, 200, r.body);
    }
  };
  const nb = (s: string) => un(`SELECT COUNT(*) n FROM ${s}`).n as number;
  const c = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  const cookie = `kanevas_session=${c.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  return { app, antor, E, K, t, tok, req, put, ouvrir, catalogue, nb, un, cookie };
}
type M = Awaited<ReturnType<typeof monde>>;

test('un lot : le catalogue puis 4 conceptions = 4 créées ; rejeu = 4 inchangées ; l\'alias donne la même réponse', async () => {
  const w = await monde();
  const lot = await w.ouvrir();
  await w.catalogue(lot);
  const r = await w.put(w.t, ex('conceptions-essai.json'), lot);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().natures.conceptions, { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });
  const l = (await w.req(w.t, 'GET', `/lots/${lot}`)).json();
  assert.deepEqual(l.compteurs.conceptions, { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });
  const r2 = await w.put(w.t, ex('conceptions-essai.json'), lot);
  assert.deepEqual(r2.json().natures.conceptions, { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
  const fiches = w.nb("fiches WHERE type = 'vaisseau'");
  // same file through the other prefix: identical answer
  const r3 = await w.put(w.t, ex('conceptions-essai.json'), lot, '/api/v1');
  assert.equal(r3.statusCode, 200, r3.body);
  assert.deepEqual(r3.json(), r2.json());
  assert.equal(w.nb("fiches WHERE type = 'vaisseau'"), fiches);
  assert.equal((await w.req(w.t, 'GET', `/lots/${lot}`)).json().compteurs.conceptions.inchangees, 8);
});

test('la sortie d\'une conception importée est celle de la même conception saisie à l\'écran (POST calcul)', async () => {
  const w = await monde();
  const lot = await w.ouvrir();
  await w.catalogue(lot);
  const f = ex('conceptions-essai.json');
  assert.equal((await w.put(w.t, f, lot)).statusCode, 200);
  for (const cc of f.conceptions) {
    const fiche = w.un('SELECT id FROM fiches WHERE univers_id = ? AND cle = ?', w.E, cc.cle).id as number;
    const stocke = JSON.parse(w.un('SELECT resultat FROM swn_conceptions WHERE fiche_id = ?', fiche).resultat);
    const corps = { coque: cc.coque, choix: cc.choix, equipage: cc.equipage, pj: cc.pj, robots: cc.robots, reparation: cc.reparation };
    for (const k of Object.keys(corps)) if ((corps as any)[k] === undefined) delete (corps as any)[k];
    const calc = await w.app.inject({ method: 'POST', url: `/api/univers/${w.E}/outils/${T}/calcul`, headers: { cookie: w.cookie }, payload: corps as any });
    assert.equal(calc.statusCode, 200, calc.body);
    assert.deepEqual(stocke, calc.json().resultat, cc.cle);
  }
  // hand-written anchor: the cruiser's price
  const cr = JSON.parse(w.un('SELECT resultat FROM swn_conceptions c JOIN fiches f ON f.id = c.fiche_id WHERE f.cle = ?', 'essai-croiseur-complet').resultat);
  assert.equal(cr.prix, 1862000);
});

test('plus de 1 000 refus : le rapport en garde 1 000, les compteurs restent exacts', async () => {
  const w = await monde();
  const lot = await w.ouvrir();
  await w.catalogue(lot);
  const lot3 = (n: number) => ({ conceptions: Array.from({ length: 500 }, (_, i) => ({ cle: `r${n}-${i}`, titre: 'x', coque: 'inconnue', choix: [] })) });
  for (const n of [1, 2, 3]) {
    const r = await w.put(w.t, lot3(n), lot);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().natures.conceptions.refusees, 500);
  }
  const l = (await w.req(w.t, 'GET', `/lots/${lot}`)).json();
  assert.equal(l.compteurs.conceptions.refusees, 1500);
  const refus = (l.rapport ?? l.refus ?? []).filter((e: any) => e.gravite ? e.gravite === 'refus' : true);
  assert.equal(refus.length, 1000);
});

test('portées : contenu, swn/galaxie, révoqué → 401 jeton_invalide sans lot ouvert', async () => {
  const w = await monde();
  const lots0 = w.nb('lots_import');
  const non = async (valeur: string) => {
    for (const p of ['/api/import/v1', '/api/v1']) {
      const x = await w.put(valeur, ex('conceptions-essai.json'), undefined, p);
      assert.equal(x.statusCode, 401);
      assert.equal(x.json().code, 'jeton_invalide');
    }
    assert.equal((await w.req(valeur, 'POST', `/lots?outil=${T}`)).statusCode, 401);
  };
  await non(w.tok().valeur);
  await non(w.tok(['swn/galaxie']).valeur);
  const rev = w.tok([T]);
  revoquerJeton(w.app.db, w.antor, w.E, (rev.jeton as any).id);
  await non(rev.valeur);
  assert.equal(w.nb('lots_import'), lots0);
  assert.equal(w.nb("fiches WHERE type = 'vaisseau' AND cle LIKE 'essai-%'"), 0);
});

test('lot clos 409 ; plus de 500 éléments 400 sans écriture ; autre univers 404 ; sans ?lot= rien n\'est compté', async () => {
  const w = await monde();
  const lot = await w.ouvrir();
  await w.catalogue(lot);
  // sans lot : rien compté
  const sans = await w.put(w.t, ex('conceptions-essai.json'));
  assert.equal(sans.statusCode, 200, sans.body);
  assert.equal(sans.json().natures.conceptions.creees, 4);
  const l0 = (await w.req(w.t, 'GET', `/lots/${lot}`)).json();
  assert.equal(l0.compteurs.conceptions?.creees ?? 0, 0);
  // > 500
  const avant = w.nb("fiches WHERE type = 'vaisseau'");
  const gros = { conceptions: Array.from({ length: 501 }, (_, i) => ({ cle: `g${i}`, titre: 'x', coque: 'eclaireur', choix: [] })) };
  const g = await w.put(w.t, gros, lot);
  assert.equal(g.statusCode, 400, g.body);
  assert.equal(w.nb("fiches WHERE type = 'vaisseau'"), avant);
  assert.equal((await w.req(w.t, 'GET', `/lots/${lot}`)).json().compteurs.conceptions?.refusees ?? 0, 0);
  // autre univers
  assert.equal((await w.put(w.t, ex('conceptions-essai.json'), undefined, '/api/import/v1', w.K)).statusCode, 404);
  // lot clos
  assert.equal((await w.req(w.t, 'POST', `/lots/${lot}/clore`)).statusCode, 200);
  const clos = await w.put(w.t, ex('conceptions-essai.json'), lot);
  assert.equal(clos.statusCode, 409);
  assert.equal(clos.json().code, 'lot_clos');
});

test('outil désactivé : répond comme un chemin inconnu ; aucune valeur de fiche ni jeton dans la réponse ou le journal', async () => {
  const w = await monde();
  poserActivation(w.app.db, w.antor, { niveau: 'univers', id: w.E }, T, false);
  const inconnu = await w.req(w.t, 'PUT', `/outils/${T}/vaisseaux/nimportequoi`, {});
  const off = await w.put(w.t, ex('conceptions-essai.json'));
  assert.equal(off.statusCode, 404);
  assert.equal(off.statusCode, inconnu.statusCode);
  assert.equal(off.body, inconnu.body);
  assert.equal(w.nb("fiches WHERE type = 'vaisseau' AND cle LIKE 'essai-%'"), 0);
});

test('refus : la réponse porte le champ et pas la valeur ; le jeton n\'y est pas', async () => {
  const w = await monde();
  const lot = await w.ouvrir();
  await w.catalogue(lot);
  const secret = 'SECRET-TITRE-ZZ';
  const r = await w.put(w.t, { conceptions: [{ cle: 'x1', titre: secret, coque: 'COQUE-QUI-NEXISTE-PAS', choix: [] }] }, lot);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().refus[0].champ, 'conceptions[0].coque');
  const l = await w.req(w.t, 'GET', `/lots/${lot}`);
  for (const b of [r.body, l.body]) { assert.ok(!b.includes(secret)); assert.ok(!b.includes(w.t)); }
  assert.equal(w.nb("fiches WHERE cle = 'x1'"), 0);
});
