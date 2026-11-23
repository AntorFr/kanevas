import assert from 'node:assert/strict';
import { test } from 'node:test';

// kanevas-concepteur-vaisseaux-mods-livre-donnees (B-93, B-94, H-9, H-mods-1 (1), (5), (7)): the data of a modification and of a design,
// from the import to the fingerprint. The invented catalogue is written here; expectations are hand-written.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const k = await import('./conceptions.js');
const c = await import('../catalogues.js');

const OUTIL = 'swn/vaisseaux';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
function fichier(version: string, mods: any[], exemples: any[] = []): any {
  return {
    catalogue: OUTIL, version,
    coques: [{ cle: 'fr', nom: 'FR', classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 40, masse: 40, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, emports: 6 }],
    moteurs: [], amenagements: [], defenses: [], armes: [], modifications: mods, exemples,
  };
}
const mod = (cle: string, extra: Record<string, unknown> = {}) => ({ cle, nom: cle, ...el, ...extra });
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const compte = (n: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as any).id as number;
  const u = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const antor = { compteId: compte('antor') };
  const cible = { niveau: 'univers' as const, id: u };
  const appliquer = (f: unknown) => c.appliquerCatalogue(db, antor, cible, OUTIL, f) as any;
  const ligne = (cle: string) => db.prepare('SELECT * FROM swn_catalogue_modifications WHERE univers_id = ? AND cle = ?').get(u, cle) as any;
  const orak = (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u, "Vent d'Orak") as any).id as number;
  return { db, u, antor, lea: { compteId: compte('lea') }, orak, appliquer, ligne };
}
const refus = (r: any) => (r.refuses ?? r.refus ?? []) as any[];

const bilan = (r: any, nature: string) => r.natures[nature];
const exemples = (w: any) => c.lireCatalogueGestion(w.db, w.antor, w.u, OUTIL, { nature: 'exemples' } as any).elements as any[];

test('modification : composants 2 et composants_par_classe 1 créés, inchangés au rejeu ; un fichier sans eux se lit 0', () => {
  const w = monde();
  const f = fichier('m1', [mod('pre', { composants: 2, composants_par_classe: 1 }), mod('nu')]);
  const r = w.appliquer(f);
  assert.equal(refus(r).length, 0, JSON.stringify(r));
  assert.equal(w.ligne('pre').composants, 2);
  assert.equal(w.ligne('pre').composants_par_classe, 1);
  assert.equal(w.ligne('nu').composants, 0);
  assert.equal(w.ligne('nu').composants_par_classe, 0);
  const avant = JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_modifications ORDER BY cle').all());
  const r2 = w.appliquer(f);
  assert.equal(JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_modifications ORDER BY cle').all()), avant);
  assert.deepEqual([bilan(r2, 'modifications').modifies, bilan(r2, 'modifications').inchanges], [0, 2]);
});

test('modification : composants 100 ou -1 et composants_par_classe 2 sont refusés avec leur champ ; 0 et 99 passent', () => {
  const w = monde();
  const r = w.appliquer(fichier('m2', [mod('a', { composants: 100 }), mod('b', { composants: -1 }), mod('c', { composants_par_classe: 2 }),
    mod('d', { composants: 99, composants_par_classe: 1 }), mod('e', { composants: 0 })]));
  const par = Object.fromEntries(refus(r).map((x) => [x.cle, x.champ]));
  assert.deepEqual(par, { a: 'composants', b: 'composants', c: 'composants_par_classe' }, JSON.stringify(refus(r)));
  assert.ok(w.ligne('d') && w.ligne('e'));
  assert.equal(w.ligne('a'), undefined);
});

test("empreinte du catalogue : changer composants ou composants_par_classe est un changement au rejeu, et la version du catalogue bouge", () => {
  const w = monde();
  w.appliquer(fichier('m3', [mod('p', { composants: 2, composants_par_classe: 0 })]));
  let r = w.appliquer(fichier('m3', [mod('p', { composants: 3, composants_par_classe: 0 })]));
  assert.equal(bilan(r, 'modifications').modifies, 1, JSON.stringify(r));
  assert.equal(w.ligne('p').composants, 3);
  r = w.appliquer(fichier('m3', [mod('p', { composants: 3, composants_par_classe: 1 })]));
  assert.equal(bilan(r, 'modifications').modifies, 1, JSON.stringify(r));
  assert.equal(w.ligne('p').composants_par_classe, 1);
  r = w.appliquer(fichier('m3', [mod('p', { composants: 3, composants_par_classe: 1 })]));
  assert.equal(bilan(r, 'modifications').inchanges, 1, JSON.stringify(r));
});

const ex = (cle: string, integre: unknown, extra: Record<string, unknown> = {}) =>
  ({ cle, nom: cle, coque: 'fr', choix: [{ nature: 'modifications', cle: 'pre', quantite: 3, ...(integre === undefined ? {} : { integre }) }], ...extra });
const BASE = () => [mod('pre', { composants: 2 })];

test('exemple (conception importée) : integre 2 sur quantité 3 est créé, relu, exporté, inchangé au rejeu ; sans integre il se lit sans', () => {
  const w = monde();
  const r = w.appliquer(fichier('x1', BASE(), [ex('ok', 2), ex('nu', undefined)]));
  assert.equal(refus(r).length, 0, JSON.stringify(r));
  const lu = (cle: string) => exemples(w).find((e) => e.cle === cle);
  assert.equal(lu('ok').donnees.choix[0].integre, 2);
  assert.equal(lu('nu').donnees.choix[0].integre, undefined);
  const avant = JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_exemples ORDER BY cle').all());
  const r2 = w.appliquer(fichier('x1', BASE(), [ex('ok', 2), ex('nu', undefined)]));
  assert.equal(bilan(r2, 'exemples').inchanges, 2, JSON.stringify(r2));
  assert.equal(JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_exemples ORDER BY cle').all()), avant);
  // the export re-imported gives the same fingerprint (nothing changes), and integre 1 is a change
  const r3 = w.appliquer(fichier('x1', BASE(), [{ cle: 'ok', ...lu('ok').donnees }]));
  assert.equal(bilan(r3, 'exemples').inchanges, 1, JSON.stringify(r3));
  const r4 = w.appliquer(fichier('x1', BASE(), [ex('ok', 1)]));
  assert.equal(bilan(r4, 'exemples').modifies, 1, JSON.stringify(r4));
});

test('exemple : integre 4 sur quantité 3, -1, 1.5, "2" refusés (champ integre)', () => {
  const w = monde();
  const r = w.appliquer(fichier('x2', BASE(), [ex('b4', 4), ex('bm', -1), ex('bf', 1.5), ex('bs', '2'), ex('b3', 3), ex('b0', 0)]));
  const par = Object.fromEntries(refus(r).map((x) => [x.cle, x.champ]));
  assert.deepEqual(par, { b4: 'integre', bm: 'integre', bf: 'integre', bs: 'integre' }, JSON.stringify(refus(r)));
  assert.ok(exemples(w).some((e) => e.cle === 'b3') && exemples(w).some((e) => e.cle === 'b0'));
});

test('exemple (conception importée) : mod_int_con -1 est créé, relu, exporté ; 11 et -11 refusés (champ mod_int_con) ; sans lui, 0 sans refus', () => {
  const w = monde();
  const r = w.appliquer(fichier('x3', BASE(), [ex('ok', 2, { mod_int_con: -1 }), ex('nu', undefined), ex('h11', 1, { mod_int_con: 11 }), ex('b11', 1, { mod_int_con: -11 })]));
  const par = Object.fromEntries(refus(r).map((x) => [x.cle, x.champ]));
  assert.deepEqual(par, { h11: 'mod_int_con', b11: 'mod_int_con' }, JSON.stringify(refus(r)));
  assert.ok(!refus(r).some((x) => /inconnu/.test(x.raison)), JSON.stringify(refus(r)));
  const lu = (cle: string) => exemples(w).find((e) => e.cle === cle);
  assert.equal(lu('ok').donnees.mod_int_con, -1);
  assert.equal(lu('ok').donnees.choix[0].integre, 2);
  // fingerprint: the export re-imported is unchanged, another mod_int_con is a change
  const r2 = w.appliquer(fichier('x3', BASE(), [{ cle: 'ok', ...lu('ok').donnees }]));
  assert.equal(bilan(r2, 'exemples').inchanges, 1, JSON.stringify(r2));
  const r3 = w.appliquer(fichier('x3', BASE(), [ex('ok', 2, { mod_int_con: 0 })]));
  assert.equal(bilan(r3, 'exemples').modifies, 1, JSON.stringify(r3));
});

test('conception stockée : mod_int_con -1 et integre 2/3 enregistrés, relus ; 11, -11, integre 4 et -1 refusés avant toute écriture', () => {
  const w = monde();
  w.appliquer(fichier('s1', BASE()));
  const cur: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  assert.equal(cur.modIntCon, 0);
  const rangee = () => JSON.stringify(w.db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ?').get(w.orak));
  const r0 = rangee();
  const essai = (choix: unknown[], extra: Record<string, unknown>) => {
    try { k.enregistrerConception(w.db, w.lea, w.u, w.orak, { coque: 'fr', choix, version: cur.version, ...extra }); return null; } catch (x: any) { return x; }
  };
  const ligne = (integre: unknown) => [{ nature: 'modifications', cle: 'pre', quantite: 3, integre }];
  for (const [e, code, champ] of [[essai(ligne(4), {}), 'integre_invalide', 'integre'], [essai(ligne(-1), {}), 'integre_invalide', 'integre'],
    [essai(ligne(1), { mod_int_con: 11 }), 'mod_int_con_invalide', 'mod_int_con'], [essai(ligne(1), { mod_int_con: -11 }), 'mod_int_con_invalide', 'mod_int_con']] as const) {
    assert.deepEqual([e?.code, e?.detail, e?.champ], ['invalide', code, champ]);
  }
  assert.equal(rangee(), r0);
  const v: any = k.enregistrerConception(w.db, w.lea, w.u, w.orak, { coque: 'fr', choix: ligne(2), version: cur.version, mod_int_con: -1 });
  assert.equal(v.modIntCon, -1);
  assert.equal(v.lignes[0].integre, 2);
  const relu: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  assert.deepEqual([relu.modIntCon, relu.lignes[0].integre, relu.version], [-1, 2, v.version]);
  assert.equal((w.db.prepare('SELECT mod_int_con FROM swn_conceptions WHERE fiche_id = ?').get(w.orak) as any).mod_int_con, -1);
});

test("conception d'avant : integre 0 et mod_int_con 0 à la relecture sans écriture ; un integre stocké de 5 sur quantité 3 se relit 3", () => {
  const w = monde();
  w.appliquer(fichier('s2', BASE()));
  const cur: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  k.enregistrerConception(w.db, w.lea, w.u, w.orak, { coque: 'fr', choix: [{ nature: 'modifications', cle: 'pre', quantite: 3 }], version: cur.version });
  const rangee = () => JSON.stringify(w.db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ?').get(w.orak));
  const r0 = rangee();
  const v: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  assert.deepEqual([v.modIntCon, v.lignes[0].integre], [0, 0]);
  assert.equal(rangee(), r0);
  // stored above the quantity, by hand (what no write can produce)
  const row = w.db.prepare('SELECT choix, resultat FROM swn_conceptions WHERE fiche_id = ?').get(w.orak) as any;
  const choix = JSON.parse(row.choix); choix[0].integre = 5;
  w.db.prepare('UPDATE swn_conceptions SET choix = ? WHERE fiche_id = ?').run(JSON.stringify(choix), w.orak);
  const r1 = rangee();
  const p: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  assert.equal(p.lignes[0].integre, 3);
  assert.equal(rangee(), r1);
});
