import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerGalaxie } = await import('../services/swn/galaxies.js');
const { modifierSysteme } = await import('../services/swn/ecriture-carte.js');

const G = 'swn/galaxie';
const fichier = () => ({
  systemes: [
    { cle: 'vael', nom: 'Vael', q: 0, r: 0 },
    { cle: 'oran', nom: 'Oran', q: 3, r: 0 },
    { cle: 'kess', nom: 'Kess', q: 0, r: 4 },
    { cle: 'dune', nom: 'Dune', q: 6, r: 6, secret: true },
  ],
  zones: [{ cle: 'bord', nom: 'Le bord', contour: [[-2, -2], [8, -2], [8, 8]] }],
  routes: [
    { depuis: 'vael', vers: 'oran' },
    { depuis: 'vael', vers: 'kess' },
    { depuis: 'oran', vers: 'dune', publique: false },
  ],
});

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const K = un('SELECT id FROM univers WHERE nom = ?', 'Univers voisin').id as number;
  const gal = creerGalaxie(app.db, id('antor'), E, { titre: 'Galaxie du bord' }).id;
  const tok = (compte: string, outils?: string[], univers = E) =>
    creerJeton(app.db, id(compte), univers, { nom: 'T', dureeJours: 30, outils }, app.horloge());
  const req = (valeur: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, univers = E) =>
    app.inject({ method, url: `/api/import/v1/univers/${univers}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as any });
  const put = (valeur: string, corps: unknown, lot?: number, g = gal) =>
    req(valeur, 'PUT', `/outils/swn/galaxie/galaxies/${g}${lot ? `?lot=${lot}` : ''}`, corps);
  const ouvrir = async (valeur: string) => (await req(valeur, 'POST', `/lots?outil=${G}`)).json().lotId as number;
  const nb = (t: string) => un(`SELECT COUNT(*) n FROM ${t}`).n as number;
  const sys = (cle: string) => un('SELECT * FROM swn_systemes WHERE galaxie_id = ? AND cle = ?', gal, cle);
  const versions = () => app.db.prepare(`SELECT 's'||id k, version FROM swn_systemes UNION ALL SELECT 'r'||id, version FROM swn_routes
    UNION ALL SELECT 'z'||id, version FROM swn_zones ORDER BY 1`).all();
  return { app, id, E, K, gal, tok, req, put, ouvrir, nb, un, sys, versions };
}
const total = (n: any, k: string) => Object.values(n).reduce((a: number, c: any) => a + c[k], 0);

test('4 systèmes + 1 zone + 3 routes créés dans un lot, rejeu : 8 inchangées sans version montée', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]).valeur;
  const lid = await w.ouvrir(t);
  const r = await w.put(t, fichier(), lid);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().refusTotal, 0);
  assert.deepEqual([r.json().natures.systemes.creees, r.json().natures.zones.creees, r.json().natures.routes.creees], [4, 1, 3]);
  const l = (await w.req(t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.systemes.creees, 4);
  assert.equal(l.compteurs.zones.creees, 1);
  assert.equal(l.compteurs.routes.creees, 3);
  assert.equal(l.compteurs.systemes.refusees ?? 0, 0);
  const avant = w.versions();
  const r2 = await w.put(t, fichier(), lid);
  assert.equal(total(r2.json().natures, 'inchangees'), 8);
  assert.equal(total(r2.json().natures, 'creees') + total(r2.json().natures, 'mises_a_jour') + total(r2.json().natures, 'refusees'), 0);
  assert.deepEqual(w.versions(), avant);
  const l2 = (await w.req(t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l2.compteurs.systemes.inchangees, 4);
});

test('déplacer Vael : système + ses routes mis à jour, longueurs recalculées, rejeu tout inchangé', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]).valeur;
  await w.put(t, fichier());
  const longueurs = () => w.app.db.prepare('SELECT id, longueur FROM swn_routes WHERE galaxie_id = ? ORDER BY id').all(w.gal) as any[];
  const avant = longueurs();
  const f = fichier();
  f.systemes[0] = { cle: 'vael', nom: 'Vael', q: 1, r: 0 };
  const r = await w.put(t, f);
  assert.equal(r.json().refusTotal, 0, r.body);
  assert.equal(r.json().natures.systemes.mises_a_jour, 1);
  assert.equal(r.json().natures.routes.mises_a_jour, 2);
  assert.equal(r.json().natures.routes.inchangees, 1);
  assert.notDeepEqual(longueurs().slice(0, 2), avant.slice(0, 2));
  assert.deepEqual(longueurs()[2], avant[2]);
  const r2 = await w.put(t, f);
  assert.equal(total(r2.json().natures, 'inchangees'), 8);
  assert.equal(r2.json().refusTotal, 0);
});

test('remis à l\'identique par Antor : inchangé ; modifié par Antor puis fichier différent : 1 refusée, le reste passe', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]).valeur;
  await w.put(t, fichier());
  const A = { compteId: w.id('antor') };
  const v = () => w.sys('oran').version as number;
  modifierSysteme(w.app.db, A, w.E, w.gal, 'oran', { nom: 'Autre', version: v() });
  modifierSysteme(w.app.db, A, w.E, w.gal, 'oran', { nom: 'Oran', version: v() });
  assert.notEqual(w.sys('oran').version, w.sys('oran').version_importee);
  const r = await w.put(t, fichier());
  assert.equal(r.json().natures.systemes.inchangees, 4);
  assert.equal(r.json().refusTotal, 0);
  modifierSysteme(w.app.db, A, w.E, w.gal, 'oran', { nom: 'Modifié', version: v() });
  const f = fichier();
  f.systemes[1]!.nom = 'Oran II';
  f.systemes[2]!.nom = 'Kess II';
  const lid = await w.ouvrir(t);
  const r2 = await w.put(t, f, lid);
  assert.equal(r2.json().natures.systemes.refusees, 1);
  assert.equal(r2.json().natures.systemes.mises_a_jour, 1);
  assert.equal(r2.json().refus[0].raison, 'Modifié dans Kanevas depuis le dernier import.');
  assert.equal(w.sys('oran').nom, 'Modifié');
  assert.equal(w.sys('kess').nom, 'Kess II');
  const l = (await w.req(t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.systemes.refusees, 1);
});

test('refus par élément avec champ : extrémité inconnue, longueur, hexagone tenu par une autre clé', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]).valeur;
  const f: any = fichier();
  f.routes = [{ depuis: 'vael', vers: 'oran' }, { depuis: 'vael', vers: 'kess' }, { depuis: 'vael', vers: 'nulle-part' },
    { depuis: 'oran', vers: 'kess', longueur: 3 }];
  const r = await w.put(t, f);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().natures.routes.creees, 2);
  assert.equal(r.json().natures.routes.refusees, 2);
  assert.deepEqual(r.json().refus.map((x: any) => x.champ), ['routes[2].vers', 'routes[3].longueur']);
  const f2: any = fichier();
  f2.systemes.push({ cle: 'double', nom: 'Double', q: 0, r: 0 });
  const r2 = await w.put(t, f2);
  assert.equal(r2.json().natures.systemes.refusees, 1);
  assert.equal(r2.json().refus[0].champ, 'systemes[4].q');
  assert.equal(w.nb('swn_systemes'), 4 + w.un('SELECT COUNT(*) n FROM swn_systemes WHERE galaxie_id <> ?', w.gal).n);
});

test('lot clos : 409 lot_clos ; sans lot : aucun lot créé, rapport dans la réponse', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]).valeur;
  const lid = await w.ouvrir(t);
  await w.req(t, 'POST', `/lots/${lid}/clore`);
  const r = await w.put(t, fichier(), lid);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'lot_clos');
  assert.equal(w.nb('swn_systemes') > 0 && w.un('SELECT COUNT(*) n FROM swn_systemes WHERE galaxie_id = ?', w.gal).n, 0);
  const avant = w.nb('lots_import');
  const s = await w.put(t, fichier());
  assert.equal(s.statusCode, 200);
  assert.equal(w.nb('lots_import'), avant);
  assert.equal(s.json().natures.systemes.creees, 4);
});

test('portées : contenu, autre outil, révoqué, expiré, plus MJ → 401 sans lot ; autre univers → 404', async () => {
  const w = await monde();
  const lots0 = w.nb('lots_import');
  const non = async (valeur: string) => {
    const x = await w.put(valeur, fichier());
    assert.equal(x.statusCode, 401);
    assert.equal(x.json().code, 'jeton_invalide');
    assert.equal((await w.req(valeur, 'POST', `/lots?outil=${G}`)).statusCode, 401);
  };
  await non(w.tok('antor').valeur);
  await non(w.tok('antor', ['essai/g']).valeur);
  const rev = w.tok('antor', [G]);
  revoquerJeton(w.app.db, w.id("antor"), w.E, (rev as any).jeton?.id ?? (rev as any).id);
  await non(rev.valeur);
  const exp = creerJeton(w.app.db, w.id('antor'), w.E, { nom: 'E', dureeJours: 7, outils: [G] }, w.app.horloge());
  const vieux = w.app.horloge();
  const apres = new Date(vieux.getTime() + 30 * 86400000);
  const ancienne = w.app.horloge;
  (w.app as any).horloge = () => apres;
  await non(exp.valeur);
  (w.app as any).horloge = ancienne;
  const mira = w.tok('mira', [G]).valeur;
  w.app.db.prepare("UPDATE membres SET role = 'joueur' WHERE compte_id = ? AND univers_id = ?").run(w.id('mira'), w.E);
  await non(mira);
  assert.equal(w.nb('lots_import'), lots0);
  const t = w.tok('antor', [G]).valeur;
  const autre = await w.req(t, 'PUT', `/outils/swn/galaxie/galaxies/${w.gal}`, fichier(), w.K);
  assert.notEqual(autre.statusCode, 200);
  const g2 = creerGalaxie(w.app.db, w.id('antor'), w.E, { titre: 'Autre' }).id;
  const ok = await w.put(t, fichier(), undefined, g2 + 999);
  assert.equal(ok.statusCode, 404);
});

test('liste GET …/galaxies : {id, titre} ; GET jetons/outils propose swn/galaxie', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]).valeur;
  const l = await w.req(t, 'GET', '/outils/swn/galaxie/galaxies');
  assert.equal(l.statusCode, 200);
  assert.ok(l.json().some((g: any) => g.id === w.gal && g.titre === 'Galaxie du bord'));
  for (const g of l.json()) assert.deepEqual(Object.keys(g).sort(), ['id', 'titre']);
  const c = await (async () => {
    const res = await w.app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
    return `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  })();
  const p = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/jetons/outils`, headers: { cookie: c } });
  assert.ok(p.json().some((o: any) => o.cle === G));
});

test('galaxie d\'un autre univers : 404 ; corps non objet : 400', async () => {
  const w = await monde();
  const t = w.tok('antor', [G]).valeur;
  const gk = creerGalaxie(w.app.db, w.id('antor'), w.K, { titre: 'Ailleurs' }).id;
  const x = await w.put(t, fichier(), undefined, gk);
  assert.equal(x.statusCode, 404);
  assert.equal(w.un('SELECT COUNT(*) n FROM swn_systemes WHERE galaxie_id = ?', gk).n, 0);
  const y = await w.put(t, [1, 2]);
  assert.equal(y.statusCode, 400);
});
