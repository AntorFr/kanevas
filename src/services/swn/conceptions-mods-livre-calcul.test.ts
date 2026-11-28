import assert from 'node:assert/strict';
import { test } from 'node:test';

// kanevas-concepteur-vaisseaux-mods-livre-calcul (H-9, H-10 (1), H-mods-1): the stored result, its reading, the sheet's text and the
// calculation of the assistant's door, on an invented catalogue. Expectations are hand-written.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const k = await import('./conceptions.js');
const c = await import('../catalogues.js');
const calc = await import('./calcul-vaisseau.js');

const OUTIL = 'swn/vaisseaux';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const fichier = (): any => ({
  catalogue: OUTIL, version: 'calcul-1',
  coques: [{ cle: 'fr', nom: 'FR', classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 400, masse: 400, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, emports: 6 }],
  moteurs: [], amenagements: [], defenses: [], armes: [], exemples: [],
  modifications: [{ cle: 'pre', nom: 'Pre', ...el, cout: 10000, composants: 2, composants_par_classe: 1 }],
});
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const compte = (n: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as any).id as number;
  const u = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const antor = { compteId: compte('antor') };
  const r = c.appliquerCatalogue(db, antor, { niveau: 'univers' as const, id: u }, OUTIL, fichier()) as any;
  assert.equal((r.refuses ?? r.refus ?? []).length, 0, JSON.stringify(r));
  const orak = (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u, "Vent d'Orak") as any).id as number;
  return { db, u, lea: { compteId: compte('lea') }, orak };
}
const texteSection = (w: any) => (w.db.prepare("SELECT contenu FROM sections WHERE fiche_id = ? AND gere_par IS NOT NULL").get(w.orak) as any).contenu as string;

test('quatre installations à 10 000, reparation 1, une refondue : chiffres du résultat, de la section, du calcul sans écriture ; prix inchangé par integre', () => {
  const w = monde();
  const cur: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  const choix = (integre: number) => [{ nature: 'modifications', cle: 'pre', quantite: 4, integre }];
  const v: any = k.enregistrerConception(w.db, w.lea, w.u, w.orak, { coque: 'fr', choix: choix(1), version: cur.version, reparation: 1 });
  const r = v.resultat;
  assert.equal(r.composants, 16);
  assert.deepEqual(r.installation, { jours: 8, joursChantier: 2 });
  assert.equal(r.maintenance, 3);
  assert.deepEqual(r.refonte, { cout: 50000, composants: 8 });
  assert.deepEqual(v.alertes.filter((a: any) => /depassee/.test(a.code)), []);
  const sec = texteSection(w);
  assert.ok(sec.includes('| Composants prétech | 16 |'), sec);
  assert.ok(sec.includes("| Installation | 8 jours d'équipage, 2 jours avec chantier |"), sec);
  assert.ok(sec.includes('| Maintenance | 3 |'), sec);
  assert.ok(/\| Refonte \| .*50.000.*cr, 8 composants \|/.test(sec), sec);
  // the same figures through the door that writes nothing
  const s: any = calc.calculerDepuisChoix(w.db, w.lea, w.u, { coque: 'fr', choix: choix(1), reparation: 1 });
  for (const cle of ['composants', 'installation', 'maintenance', 'refonte', 'prix']) assert.deepEqual(s.resultat[cle], r[cle], cle);
  // integre takes nothing off the first figure
  const s0: any = calc.calculerDepuisChoix(w.db, w.lea, w.u, { coque: 'fr', choix: choix(0), reparation: 1 });
  assert.equal(s0.resultat.prix, r.prix);
  assert.equal(s0.resultat.composants, 16);
  assert.equal(s0.resultat.alertes.find((a: any) => a.code === 'maintenance_depassee')?.texte, '4 mods entretenus, Maintenance 3');
});

test('mod_int_con −5 avec reparation 1 : Maintenance 0 par la porte du calcul ; integre 3 avec reparation 1 enregistre et lève refonte_depassee', () => {
  const w = monde();
  const s: any = calc.calculerDepuisChoix(w.db, w.lea, w.u, { coque: 'fr', choix: [], reparation: 1, mod_int_con: -5 });
  assert.equal(s.resultat.maintenance, 0);
  const cur: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  const v: any = k.enregistrerConception(w.db, w.lea, w.u, w.orak, { coque: 'fr', choix: [{ nature: 'modifications', cle: 'pre', quantite: 3, integre: 3 }], version: cur.version, reparation: 1 });
  assert.ok(v.alertes.some((a: any) => a.code === 'refonte_depassee' && a.niveau === 'a_surveiller'));
  assert.equal(k.lireConception(w.db, w.lea, w.u, w.orak).version, v.version);
});

test("un design sans modification : section sans les quatre lignes ; un résultat stocké d'avant la tranche se lit avec les clés à null", () => {
  const w = monde();
  const sec = texteSection(w);
  for (const m of ['Composants prétech', 'Installation', 'Maintenance', 'Refonte']) assert.ok(!sec.includes(m), m);
  const row = w.db.prepare('SELECT resultat FROM swn_conceptions WHERE fiche_id = ?').get(w.orak) as any;
  const r = JSON.parse(row.resultat);
  for (const cle of ['composants', 'installation', 'maintenance', 'refonte']) delete r[cle];
  w.db.prepare('UPDATE swn_conceptions SET resultat = ? WHERE fiche_id = ?').run(JSON.stringify(r), w.orak);
  const v: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  for (const cle of ['composants', 'installation', 'maintenance', 'refonte']) assert.equal(v.resultat[cle], null, cle);
  assert.equal(v.resultat.prix, r.prix);
});
