import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Revue de kanevas-outils-format-vaisseaux-fiches-calcul (F-2, F-3, F-4 part V-6, F-5, F-8) : catalogue d'essai inventé écrit par le test,
// importé par la route, calculé par POST calcul, enregistré, recalculé. Attendus écrits en dur, calculés à la main (F-8).
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { encoderSession, SESSION_COOKIE } = await import('../../services/session.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');
const { migrate, openDb } = await import('../../db/db.js');

const T = 'swn/vaisseaux';
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 10, pv: 5, ca: 10, puissance: 10, masse: 8, emports: 2, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
function catalogue(version: string, equipageMin = 6): any {
  return {
    catalogue: T, version,
    coques: [
      { cle: 'fregate-r', nom: 'Frégate R', ...coque, vitesse: 3, armure: 5, equipage_min: equipageMin, equipage_max: 20 },
      { cle: 'c3', nom: 'Classe trois', ...coque, classe: 3 },
      { cle: 'c4', nom: 'Classe quatre', ...coque, classe: 4 },
      { cle: 'nue', nom: 'Nue', ...coque },
    ],
    moteurs: [{ cle: 'm1', nom: 'M1', niveau: 1, ...el }],
    amenagements: [
      { cle: 'salle', nom: 'Salle', ...el, classe_min: 2, classe_max: 3 },
      { cle: 'hangar', nom: 'Hangar', ...el, classe_min: 3 },
      { cle: 'pile', nom: 'Pile', ...el, classe_min: 2, classe_max: 2 },
      { cle: 'plafond', nom: 'Plafond', ...el, classe_max: 3 },
    ],
    defenses: [{ cle: 'voiles', nom: 'Voiles', ...el, bonus_vitesse: 1 }],
    armes: [{ cle: 'canon-r', nom: 'Canon R', emport: 1, munitions: 0, cout_munition: 0, ...el, classe_min: 4 }],
    modifications: [], exemples: [],
  };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const one = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const cid = (u: string) => one('SELECT id FROM comptes WHERE username = ?', u).id as number;
  const h = (u: string) => ({ cookie: `${SESSION_COOKIE}=${app.signCookie(encoderSession({ id: cid(u), groups: [] }))}` });
  const E = one('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const fiche = (t: string) => one('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?', E, t).id as number;
  const B = `/api/univers/${E}/outils/swn/vaisseaux`;
  const req = (u: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: h(u), ...(payload ? { payload: payload as any } : {}) });
  const importer = (c: any) => req('antor', 'POST', `/api/univers/${E}/outils/${T}/catalogue/application`, c);
  const r0 = await importer(catalogue('v1'));
  assert.equal(r0.statusCode, 200, r0.body);
  const calcul = async (corps: object) => (await req('antor', 'POST', `${B}/calcul`, corps));
  const ok = async (corps: object) => { const r = await calcul(corps); assert.equal(r.statusCode, 200, r.body); return r.json().resultat; };
  const sec = (f: number) => one('SELECT * FROM sections WHERE fiche_id = ? AND gere_par IS NOT NULL', f);
  const ligne = (f: number) => one('SELECT * FROM swn_conceptions WHERE fiche_id = ?', f);
  return { app, E, B, req, importer, calcul, ok, sec, ligne, cid, one, orak: fiche("Vent d'Orak"), aube: fiche('Aube de Sel') };
}
const L = (nature: string, cle: string, quantite = 1) => ({ nature, cle, quantite });
const codes = (r: any, niveau?: string) => r.alertes.filter((a: any) => !niveau || a.niveau === niveau).map((a: any) => a.code);

test('F-3 : frégate-r rend vitesse 3, armure 5, équipage 6 (min 6, max 20) ; les voiles portent la vitesse à 4', async () => {
  const w = await monde();
  const r = await w.ok({ coque: 'fregate-r', choix: [] });
  assert.equal(r.vitesse, 3); assert.equal(r.armure, 5);
  assert.deepEqual(r.equipage, { choisi: 6, min: 6, max: 20 });
  assert.deepEqual(codes(r).filter((c: string) => c.startsWith('equipage') || c === 'classe_inadaptee'), []);
  const v = await w.ok({ coque: 'fregate-r', choix: [L('defenses', 'voiles')] });
  assert.equal(v.vitesse, 4);
  assert.equal((await w.ok({ coque: 'fregate-r', choix: [L('defenses', 'voiles', 3)] })).vitesse, 6);
});

test("F-3 : coque sans vitesse → null (un bonus seul ne donne rien), sans armure → null, équipage hors bornes de coque non vérifié", async () => {
  const w = await monde();
  const r = await w.ok({ coque: 'nue', choix: [L('defenses', 'voiles')] });
  assert.equal(r.vitesse, null); assert.equal(r.armure, null);
  assert.equal(r.equipage, null);
  const e = await w.ok({ coque: 'nue', choix: [], equipage: 5 });
  assert.deepEqual(e.equipage, { choisi: 5, min: null, max: null });
  assert.deepEqual(codes(e).filter((c: string) => c.startsWith('equipage')), []);
});

test('F-3 : équipage 6 et 20 ne lèvent rien (bornes exactes), 5 et 21 lèvent une alerte à surveiller aux textes de F-3', async () => {
  const w = await monde();
  for (const n of [6, 20]) {
    const r = await w.ok({ coque: 'fregate-r', choix: [], equipage: n });
    assert.deepEqual(codes(r).filter((c: string) => c.startsWith('equipage')), [], String(n));
  }
  const bas = await w.ok({ coque: 'fregate-r', choix: [], equipage: 5 });
  const a = bas.alertes.find((x: any) => x.code === 'equipage_insuffisant');
  assert.equal(a.niveau, 'a_surveiller'); assert.equal(a.texte, 'Équipage insuffisant : 5 sur 6 au moins.');
  const haut = await w.ok({ coque: 'fregate-r', choix: [], equipage: 21 });
  const b = haut.alertes.find((x: any) => x.code === 'equipage_excessif');
  assert.equal(b.niveau, 'a_surveiller'); assert.equal(b.texte, 'Équipage excessif : 21 sur 20 au plus.');
  assert.deepEqual(codes(bas, 'bloquante'), []);
  // équipage 0 : valeur dite, pas « absent »
  assert.deepEqual((await w.ok({ coque: 'fregate-r', choix: [], equipage: 0 })).equipage, { choisi: 0, min: 6, max: 20 });
});

test("F-3 : classe_inadaptee bloquante, une par ligne, textes de F-3 ; une arme n'en lève jamais", async () => {
  const w = await monde();
  const h2 = await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'hangar')] });
  const a = h2.alertes.find((x: any) => x.code === 'classe_inadaptee');
  assert.deepEqual([a.niveau, a.texte, a.ligne], ['bloquante', '« Hangar » : classe de coque 3 au moins.', 0]);
  assert.deepEqual(codes(await w.ok({ coque: 'c3', choix: [L('amenagements', 'hangar')] })), ['moteur_absent']);
  assert.deepEqual(codes(await w.ok({ coque: 'c3', choix: [L('amenagements', 'salle')] })), ['moteur_absent']);
  const s4 = await w.ok({ coque: 'c4', choix: [L('amenagements', 'salle')] });
  assert.equal(s4.alertes.find((x: any) => x.code === 'classe_inadaptee').texte, '« Salle » : classe de coque 3 au plus.');
  const pile = await w.ok({ coque: 'c3', choix: [L('amenagements', 'pile')] });
  assert.equal(pile.alertes.find((x: any) => x.code === 'classe_inadaptee').texte, '« Pile » : classe de coque 2 seulement.');
  assert.deepEqual(codes(await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'pile')] })), ['moteur_absent']);
  // plafond seul (pas de classe_min)
  assert.equal((await w.ok({ coque: 'c4', choix: [L('amenagements', 'plafond')] })).alertes.find((x: any) => x.code === 'classe_inadaptee').texte,
    '« Plafond » : classe de coque 3 au plus.');
  // une arme de classe_min 4 sur une coque de classe 2 : jamais classe_inadaptee
  assert.ok(!codes(await w.ok({ coque: 'fregate-r', choix: [L('armes', 'canon-r')] })).includes('classe_inadaptee'));
  // une alerte par ligne fautive, indexée, et après moteur_multiple
  const m = await w.ok({ coque: 'fregate-r', choix: [L('moteurs', 'm1', 2), L('amenagements', 'salle'), L('amenagements', 'hangar')] });
  assert.deepEqual(m.alertes.filter((x: any) => x.niveau === 'bloquante').map((x: any) => [x.code, x.ligne ?? null]),
    [['moteur_multiple', null], ['classe_inadaptee', 2]]);
});

test('F-2 : équipage hors 0 à 100 000 ou non entier → refus champ equipage ; 0 et 100 000 acceptés', async () => {
  const w = await monde();
  for (const v of [-1, 100001, 1.5, '6']) {
    const r = await w.calcul({ coque: 'fregate-r', choix: [], equipage: v });
    assert.ok([400, 422].includes(r.statusCode), `${v} → ${r.statusCode}`);
    assert.equal(r.json().champ, 'equipage', String(v));
  }
  assert.equal((await w.ok({ coque: 'fregate-r', choix: [], equipage: 100000 })).equipage.choisi, 100000);
  // enregistrement : même refus, rien n'est écrit
  const c = await w.req('antor', 'POST', `${w.B}/conceptions`, { ficheId: w.aube, coque: 'fregate-r' });
  assert.equal(c.statusCode, 201, c.body);
  const v = c.json().version;
  const bad = await w.req('antor', 'PUT', `${w.B}/conceptions/${w.aube}`, { coque: 'fregate-r', choix: [], version: v, equipage: -1 });
  assert.equal(bad.json().champ, 'equipage');
  assert.equal(w.ligne(w.aube).version, v);
});

test("F-2 : l'équipage est résolu à l'enregistrement, stocké, et survit à un import qui change le minimum de la coque", async () => {
  const w = await monde();
  const c = await w.req('antor', 'POST', `${w.B}/conceptions`, { ficheId: w.aube, coque: 'fregate-r' });
  assert.equal(c.statusCode, 201, c.body);
  assert.equal(w.ligne(w.aube).equipage, 6); // défaut : minimum de la coque
  assert.equal(c.json().resultat.equipage.choisi, 6);
  // équipage 5 : alerte à surveiller, la conception reste enregistrable
  const p = await w.req('antor', 'PUT', `${w.B}/conceptions/${w.aube}`, { coque: 'fregate-r', choix: [], version: c.json().version, equipage: 5 });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(w.ligne(w.aube).equipage, 5);
  assert.deepEqual(p.json().resultat.equipage, { choisi: 5, min: 6, max: 20 });
  assert.ok(codes(p.json().resultat).includes('equipage_insuffisant'));
  // sans équipage dans la requête : le minimum de la coque (pas de report implicite)
  const q = await w.req('antor', 'PUT', `${w.B}/conceptions/${w.aube}`, { coque: 'fregate-r', choix: [], version: p.json().version });
  assert.equal(q.json().resultat.equipage.choisi, 6);
  assert.equal(w.ligne(w.aube).equipage, 6);
  const r5 = await w.req('antor', 'PUT', `${w.B}/conceptions/${w.aube}`, { coque: 'fregate-r', choix: [], version: q.json().version, equipage: 5 });
  assert.equal(r5.statusCode, 200);
  // classe inadaptée : refus à l'enregistrement
  const bloc = await w.req('antor', 'PUT', `${w.B}/conceptions/${w.aube}`,
    { coque: 'fregate-r', choix: [L('amenagements', 'hangar')], version: r5.json().version, equipage: 5 });
  assert.equal(bloc.statusCode, 422);
  assert.equal(bloc.json().alertes.find((a: any) => a.code === 'classe_inadaptee').texte, '« Hangar » : classe de coque 3 au moins.');
  // import : le minimum devient 8
  const imp = await w.importer(catalogue('v2', 8));
  assert.equal(imp.statusCode, 200, imp.body);
  const lu = (await w.req('antor', 'GET', `${w.B}/conceptions/${w.aube}`)).json();
  assert.equal(lu.perime, true);
  assert.equal(w.ligne(w.aube).equipage, 5);
  const rc = await w.req('antor', 'POST', `/api/univers/${w.E}/fiches/${w.aube}/sections/${w.sec(w.aube).id}/recalcul`, { version: w.sec(w.aube).version });
  assert.equal(rc.statusCode, 200, rc.body);
  const apres = w.ligne(w.aube);
  assert.equal(apres.equipage, 5);
  assert.deepEqual(JSON.parse(apres.resultat).equipage, { choisi: 5, min: 8, max: 20 });
  assert.ok(JSON.parse(apres.resultat).alertes.some((a: any) => a.code === 'equipage_insuffisant' && a.texte === 'Équipage insuffisant : 5 sur 8 au moins.'));
});

test('F-4 : le texte gagne Vitesse, Armure, Équipage entre Portée de saut et Puissance libre ; rien de dit → octet pour octet comme avant', async () => {
  const w = await monde();
  const avant = w.sec(w.orak).contenu as string;
  const c = await w.req('antor', 'POST', `${w.B}/conceptions`, { ficheId: w.aube, coque: 'fregate-r' });
  assert.equal(c.statusCode, 201, c.body);
  const txt = w.sec(w.aube).contenu as string;
  assert.match(txt, /\| Portée de saut \| — \|\n\| Vitesse \| 3 \|\n\| Armure \| 5 \|\n\| Équipage \| 6 \|\n\| Puissance libre \| /);
  // conception du catalogue d'essai antérieur : aucune ligne nouvelle, texte identique après recalcul
  assert.ok(!/Vitesse|Armure|Équipage/.test(avant));
  const rc = await w.req('antor', 'POST', `/api/univers/${w.E}/fiches/${w.orak}/sections/${w.sec(w.orak).id}/recalcul`, { version: w.sec(w.orak).version });
  assert.equal(rc.statusCode, 200, rc.body);
  assert.equal(w.sec(w.orak).contenu, avant);
});

test('F-3 : un résultat enregistré avant la tranche (sans les trois clés, équipage NULL) se lit sans erreur, clés à null', async () => {
  const w = await monde();
  const r = JSON.parse(w.ligne(w.orak).resultat);
  delete r.vitesse; delete r.armure; delete r.equipage;
  w.app.db.prepare('UPDATE swn_conceptions SET resultat = ?, equipage = NULL WHERE fiche_id = ?').run(JSON.stringify(r), w.orak);
  const g = await w.req('lea', 'GET', `${w.B}/conceptions/${w.orak}`);
  assert.equal(g.statusCode, 200, g.body);
  const v = g.json().resultat;
  assert.equal(v.vitesse, null); assert.equal(v.armure, null); assert.equal(v.equipage, null);
  assert.equal(v.prix, r.prix);
  const liste = await w.req('lea', 'GET', `${w.B}/conceptions`);
  assert.equal(liste.statusCode, 200);
  // « Recalculer » d'une conception sans équipage stocké garde l'absence d'équipage
  const rc = await w.req('antor', 'POST', `/api/univers/${w.E}/fiches/${w.orak}/sections/${w.sec(w.orak).id}/recalcul`, { version: w.sec(w.orak).version });
  assert.equal(rc.statusCode, 200, rc.body);
  assert.equal(w.ligne(w.orak).equipage, null);
});

test("F-5 : l'outil de l'assistant rend les mêmes valeurs que POST calcul et accepte equipage", async () => {
  const w = await monde();
  const outil = catalogueDe(w.app.db, w.cid('antor'), w.E).outils.find((t) => t.nom === 'swn_vaisseau_calculer')!;
  const corps = { coque: 'fregate-r', choix: [L('defenses', 'voiles')], equipage: 21 };
  const http = await w.ok({ coque: 'fregate-r', choix: [L('defenses', 'voiles')], equipage: 21 });
  const a: any = await outil.executer({ coque: 'Frégate R', choix: [{ nature: 'defenses', nom: 'Voiles' }], equipage: 21 });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.donnees.resultat.vitesse, 4); assert.equal(http.vitesse, 4);
  assert.equal(a.donnees.resultat.armure, 5);
  assert.deepEqual(a.donnees.resultat.equipage, { choisi: 21, min: 6, max: 20 });
  assert.deepEqual(a.donnees.resultat, http);
  assert.ok(codes(a.donnees.resultat).includes('equipage_excessif'));
  void corps;
  const mauvais: any = await outil.executer({ coque: 'Frégate R', equipage: 1.5 });
  assert.equal(mauvais.ok, false);
  const defaut: any = await outil.executer({ coque: 'Frégate R' });
  assert.equal(defaut.donnees.resultat.equipage.choisi, 6);
  // une conception enregistrée n'accepte pas equipage en plus
  const double: any = await outil.executer({ conception: "Vent d'Orak", equipage: 5 });
  assert.equal(double.ok, false);
});

test('0030 : montée depuis 0029 avec le semis, conceptions gardées, equipage NULL, CHECK 0 à 100 000', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-0030-'));
  const db = openDb(':memory:');
  const source = new URL('../../db/migrations/', import.meta.url);
  for (const f of readdirSync(source).filter((x) => /^\d{4}-.+\.sql$/.test(x))) if (Number(f.slice(0, 4)) <= 29) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  db.exec('ALTER TABLE swn_conceptions ADD COLUMN equipage INTEGER');
  semerBouchon(db);
  db.exec('ALTER TABLE swn_conceptions DROP COLUMN equipage');
  const n = () => (db.prepare('SELECT COUNT(*) n FROM swn_conceptions').get() as any).n as number;
  const avant = db.prepare('SELECT fiche_id, coque_cle, choix, resultat, version FROM swn_conceptions ORDER BY fiche_id').all();
  assert.ok(n() >= 2);
  assert.deepEqual(migrate(db), [30]);
  assert.deepEqual(db.prepare('SELECT fiche_id, coque_cle, choix, resultat, version FROM swn_conceptions ORDER BY fiche_id').all(), avant);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM swn_conceptions WHERE equipage IS NOT NULL').get() as any).n, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  for (const bad of [-1, 100001, 1.5]) assert.throws(() => db.prepare('UPDATE swn_conceptions SET equipage = ?').run(bad), /CHECK/, String(bad));
  db.prepare('UPDATE swn_conceptions SET equipage = 100000').run();
  db.prepare('UPDATE swn_conceptions SET equipage = 0').run();
});
