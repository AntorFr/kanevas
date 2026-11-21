import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-concepteur-vaisseaux-capacites-equipage-donnees (H-5, H-10 (5), B-94): `pj` and `robots` of a design are validated
// (integers 0 to 100 000, `champ`), stored, read back by GET conception and by POST calcul's path, and a design from before reads 0.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const k = await import('./conceptions.js');
const c = await import('../catalogues.js');

const OUTIL = 'swn/vaisseaux';
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const compte = (n: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as any).id as number;
  const u = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const orak = (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u, "Vent d'Orak") as any).id as number;
  const aube = (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u, 'Aube de Sel') as any).id as number;
  return { db, u, orak, aube, antor: { compteId: compte('antor') }, lea: { compteId: compte('lea') } };
}
function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string; champ?: string }; }
  return assert.fail('aucune erreur levée');
}
const rangee = (db: any, f: number) => db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ?').get(f);
const choixDe = (v: any) => v.lignes.map((l: any) => ({ nature: l.nature, cle: l.cle, quantite: l.quantite }));

test('création avec pj 2 et robots 3 : stockés, relus, rendus par GET conception ; sans eux, 0', () => {
  const { db, u, aube, orak: orakId, antor, lea } = monde();
  const v = k.creerConception(db, antor, u, { ficheId: aube, coque: 'eclaireur', pj: 2, robots: 3 });
  assert.deepEqual([v.pj, v.robots], [2, 3]);
  assert.deepEqual([rangee(db, aube).pj, rangee(db, aube).robots], [2, 3]);
  const relu = k.lireConception(db, antor, u, aube);
  assert.deepEqual([relu.pj, relu.robots], [2, 3]);
  const liste = k.listerConceptions(db, antor, u);
  assert.ok(liste.conceptions.length >= 1);
  // an existing design is read at 0
  const orak = k.lireConception(db, lea, u, orakId);
  assert.deepEqual([orak.pj, orak.robots], [0, 0]);
});

test('création sans pj ni robots, ou à null : 0, 0', () => {
  for (const extra of [{}, { pj: null, robots: null }, { pj: undefined }]) {
    const { db, u, aube, antor } = monde();
    const v = k.creerConception(db, antor, u, { ficheId: aube, coque: 'eclaireur', ...extra });
    assert.deepEqual([v.pj, v.robots], [0, 0]);
    assert.deepEqual([rangee(db, aube).pj, rangee(db, aube).robots], [0, 0]);
  }
});

test('création : pj / robots négatifs, décimaux, texte, trop grands refusés avec champ, rien d\'écrit', () => {
  for (const champ of ['pj', 'robots'] as const) {
    for (const x of [-1, 1.5, '2', true, [], {}, Number.NaN, 100001]) {
      const { db, u, aube, antor } = monde();
      const e = err(() => k.creerConception(db, antor, u, { ficheId: aube, coque: 'eclaireur', [champ]: x }));
      assert.equal(e.code, 'invalide', `${champ} ${JSON.stringify(x)}`);
      assert.equal(e.champ, champ, `${champ} ${JSON.stringify(x)}`);
      assert.equal(rangee(db, aube), undefined);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM sections WHERE fiche_id = ? AND gere_par IS NOT NULL").get(aube).n, 0);
    }
  }
  const { db, u, aube, antor } = monde();
  const v = k.creerConception(db, antor, u, { ficheId: aube, coque: 'eclaireur', pj: 0, robots: 100000 });
  assert.deepEqual([v.pj, v.robots], [0, 100000]);
});

test('enregistrement : pj / robots changés sont stockés, la version avance ; refus de -1 sans rien écrire', () => {
  const { db, u, orak, antor, lea } = monde();
  const cur = k.lireConception(db, lea, u, orak);
  const base = { coque: cur.coque.cle, choix: choixDe(cur) };
  const v1 = k.enregistrerConception(db, antor, u, orak, { ...base, version: cur.version, pj: 2, robots: 3 });
  assert.deepEqual([v1.pj, v1.robots], [2, 3]);
  assert.equal(v1.version, cur.version + 1);
  assert.deepEqual([rangee(db, orak).pj, rangee(db, orak).robots], [2, 3]);
  assert.deepEqual([k.lireConception(db, lea, u, orak).pj, k.lireConception(db, lea, u, orak).robots], [2, 3]);
  // only pj moves, the robots fall back to 0 as the body states none (the design is replaced whole, like equipage)
  const v2 = k.enregistrerConception(db, antor, u, orak, { ...base, version: v1.version, pj: 5, robots: 3 });
  assert.deepEqual([v2.pj, v2.robots], [5, 3]);
  const avant = JSON.stringify(rangee(db, orak));
  for (const champ of ['pj', 'robots']) {
    const e = err(() => k.enregistrerConception(db, antor, u, orak, { ...base, version: v2.version, [champ]: -1 }));
    assert.deepEqual([e.code, e.champ], ['invalide', champ]);
  }
  assert.equal(JSON.stringify(rangee(db, orak)), avant);
  // back to zero: removing the value is a change like the others
  const v3 = k.enregistrerConception(db, antor, u, orak, { ...base, version: v2.version, pj: 0, robots: 0 });
  assert.deepEqual([v3.pj, v3.robots], [0, 0]);
  assert.deepEqual([rangee(db, orak).pj, rangee(db, orak).robots], [0, 0]);
});

test('enregistrement sans pj ni robots : valeurs à 0 (l\'écran qui ne les envoie pas ne garde rien d\'ancien en silence ? — attendu de la tâche : défaut 0)', () => {
  const { db, u, orak, antor, lea } = monde();
  const cur = k.lireConception(db, lea, u, orak);
  const base = { coque: cur.coque.cle, choix: choixDe(cur) };
  const v1 = k.enregistrerConception(db, antor, u, orak, { ...base, version: cur.version, pj: 2, robots: 1 });
  const v2 = k.enregistrerConception(db, antor, u, orak, { ...base, version: v1.version });
  assert.deepEqual([v2.pj, v2.robots], [0, 0]);
});

test('POST calcul accepte pj et robots, les valide avec champ, et n\'écrit rien', () => {
  const { db, u, orak, antor, lea } = monde();
  const cur = k.lireConception(db, lea, u, orak);
  const r0 = JSON.stringify(rangee(db, orak));
  const ok: any = k.calculerConception(db, lea, u, { coque: cur.coque.cle, choix: choixDe(cur), ficheId: orak, pj: 2, robots: 1 });
  assert.ok(ok.resultat);
  for (const champ of ['pj', 'robots']) {
    const e = err(() => k.calculerConception(db, lea, u, { coque: cur.coque.cle, choix: choixDe(cur), [champ]: -1 }));
    assert.deepEqual([e.code, e.champ], ['invalide', champ]);
  }
  assert.equal(JSON.stringify(rangee(db, orak)), r0);
});

test('un aménagement support_automatisation à limite 1 : une conception qui en porte deux est bloquée comme les autres effets uniques', () => {
  const { db, u, aube, antor, lea } = monde();
  const f = { catalogue: OUTIL, version: 'auto-1', amenagements: [{ cle: 'auto', nom: 'Auto', cout: 10, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false,
    pv: 0, ca: 0, limite: 1, effet: 'support_automatisation' }] };
  assert.equal(c.appliquerCatalogue(db, antor, { niveau: 'univers', id: u }, OUTIL, f).refusTotal, 0);
  const un = k.creerConception(db, antor, u, { ficheId: aube, coque: 'eclaireur' });
  const ok = k.enregistrerConception(db, antor, u, aube, { coque: 'eclaireur', choix: [{ nature: 'amenagements', cle: 'auto', quantite: 1 }], version: un.version });
  assert.ok(!ok.alertes.some((a) => a.niveau === 'bloquante'));
  const e = err(() => k.enregistrerConception(db, antor, u, aube, { coque: 'eclaireur', choix: [{ nature: 'amenagements', cle: 'auto', quantite: 2 }], version: ok.version }));
  assert.deepEqual([e.code, e.detail], ['invalide', 'conception_bloquee']);
  const calc: any = k.calculerConception(db, lea, u, { coque: 'eclaireur', choix: [{ nature: 'amenagements', cle: 'auto', quantite: 2 }] });
  assert.ok(calc.alertes.some((a: any) => a.code === 'limite_depassee' && a.niveau === 'bloquante'));
  // two lines of the same element are not allowed either
  const deux = err(() => k.enregistrerConception(db, antor, u, aube, { coque: 'eclaireur', version: ok.version,
    choix: [{ nature: 'amenagements', cle: 'auto', quantite: 1 }, { nature: 'amenagements', cle: 'auto', quantite: 1 }] }));
  assert.equal(deux.code, 'invalide');
});
