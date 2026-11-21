import assert from 'node:assert/strict';
import { test } from 'node:test';

// kanevas-concepteur-vaisseaux-regles-calcul-regles (B-94, H-7): a design saved before a weapon's classe_min rose is read with
// the blocking alert, with no new version and no rewrite; `POST calcul` computes afresh and writes nothing.
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
  return { db, u, orak, antor: { compteId: compte('antor') }, lea: { compteId: compte('lea') } };
}
const laser = (classe_min: number) => ({
  cle: 'laser', nom: 'Laser', emport: 1, munitions: 0, cout_munition: 0, cout: 25000, puissance: 2, masse: 1,
  x_cout: true, x_puissance: true, x_masse: false, pv: 0, ca: 0, limite: 0, classe_min,
});
const rangee = (db: any, f: number) => JSON.stringify(db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ?').get(f));
const section = (db: any, f: number) => JSON.stringify(db.prepare('SELECT * FROM sections WHERE fiche_id = ? AND gere_par IS NOT NULL').get(f));
const bloquantes = (v: { alertes: any[] }) => v.alertes.filter((a) => a.code === 'classe_inadaptee');

test("conception d'avant (laser sur la frégate, classe 2) : relue avec l'alerte quand le laser exige la classe 3, sans réécriture ni version", () => {
  const { db, u, orak, antor, lea } = monde();
  const avant = k.lireConception(db, lea, u, orak);
  assert.deepEqual(bloquantes(avant), []);
  const r0 = rangee(db, orak), s0 = section(db, orak);
  c.appliquerCatalogue(db, antor, { niveau: 'univers', id: u }, OUTIL, { catalogue: OUTIL, version: 'classe-laser', armes: [laser(3)] });
  const apres = k.lireConception(db, lea, u, orak);
  assert.deepEqual(bloquantes(apres).map((a) => [a.niveau, a.texte]), [['bloquante', '« Laser » : classe de coque 3 au moins.']]);
  assert.equal(apres.version, avant.version);
  assert.equal(rangee(db, orak), r0);
  assert.equal(section(db, orak), s0);
});

test("l'enregistrement d'une conception à arme de classe trop basse est refusé, sans rien écrire", () => {
  const { db, u, orak, antor, lea } = monde();
  const cur = k.lireConception(db, lea, u, orak);
  c.appliquerCatalogue(db, antor, { niveau: 'univers', id: u }, OUTIL, { catalogue: OUTIL, version: 'classe-laser', armes: [laser(3)] });
  const r0 = rangee(db, orak);
  const choix = cur.lignes.map((l: any) => ({ nature: l.nature, cle: l.cle, quantite: l.quantite }));
  const e = (() => { try { k.enregistrerConception(db, lea, u, orak, { coque: cur.coque.cle, choix, version: cur.version }); } catch (x: any) { return x; } })();
  assert.deepEqual([e?.code, e?.detail], ['invalide', 'conception_bloquee']);
  assert.equal(rangee(db, orak), r0);
});

test('POST calcul rend le résultat neuf avec l’alerte et n’écrit rien', () => {
  const { db, u, orak, antor, lea } = monde();
  const cur = k.lireConception(db, lea, u, orak);
  c.appliquerCatalogue(db, antor, { niveau: 'univers', id: u }, OUTIL, { catalogue: OUTIL, version: 'classe-laser', armes: [laser(3)] });
  const r0 = rangee(db, orak), s0 = section(db, orak);
  const choix = cur.lignes.map((l: any) => ({ nature: l.nature, cle: l.cle, quantite: l.quantite }));
  const neuf: any = k.calculerConception(db, lea, u, { coque: cur.coque.cle, choix, ficheId: orak });
  assert.equal(bloquantes(neuf).length, 1);
  assert.equal(rangee(db, orak), r0);
  assert.equal(section(db, orak), s0);
});
