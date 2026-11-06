import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-format-evolue-masses (B-80) : une masse est un multiple de 0,5, du fichier à l'écran.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const calc = await import('./calcul-vaisseau.js');
const c = await import('../catalogues.js');
const { texteMasse } = await import('../../outils/swn/regles/masse.js');
const { texteVaisseau } = await import('../../outils/swn/regles/texte-vaisseau.js');
const fmt = await import('../../../frontend/src/outils/swn/vaisseaux/format.js');
type Db = ReturnType<typeof openDb>;

const OUTIL = 'swn/vaisseaux';
const NB = '\u00A0';
const TABLES = ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications'];

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const antor = (db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as any).id as number;
  const u = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  return { db, u, a: { compteId: antor } };
}
const U = (id: number) => ({ niveau: 'univers' as const, id });
const element = (masse: unknown, extra: Record<string, unknown> = {}) => ({
  cle: 'demi-d-essai', nom: 'Demi d\'essai', cout: 1000, puissance: 0, masse, x_cout: false, x_puissance: false, x_masse: false,
  pv: 0, ca: 0, limite: 0, ...extra,
});
const fichier = (el: unknown) => ({ catalogue: OUTIL, version: 'masses-essai', amenagements: [el] });
const lire = (db: Db, u: number) => (c.resoudreElements(db, u, OUTIL, 'amenagements') as any[]).find((e) => e.cle === 'demi-d-essai');
const nb = (db: Db) => TABLES.reduce((s, t) => s + (db.prepare(`SELECT COUNT(*) n FROM swn_catalogue_${t}`).get() as any).n as number, 0);
const choix = (q: number, coque = 'eclaireur') => ({ coque, choix: [{ nature: 'amenagements', cle: 'demi-d-essai', quantite: q }] });

test('une masse de 0,5 est créée, puis inchangée au rejeu ; 0,3 est refusée avec champ masse et rien ne change', () => {
  const { db, u, a } = monde();
  const r = c.appliquerCatalogue(db, a, U(u), OUTIL, fichier(element(0.5)));
  assert.equal(r.natures.amenagements.ajoutes, 1);
  assert.equal(lire(db, u).donnees.masse, 0.5);
  const r2 = c.appliquerCatalogue(db, a, U(u), OUTIL, fichier(element(0.5)));
  assert.equal(r2.natures.amenagements.inchanges, 1);
  assert.equal(r2.natures.amenagements.modifies, 0);

  const avant = nb(db);
  const p = c.previsualiserCatalogue(db, a, U(u), OUTIL, fichier(element(0.3, { cle: 'tiers' })));
  assert.deepEqual(p.refus[0], { nature: 'amenagements', cle: 'tiers', champ: 'masse', raison: 'multiple de 0,5 attendu' });
  const ap = c.appliquerCatalogue(db, a, U(u), OUTIL, fichier(element(0.3, { cle: 'tiers' })));
  assert.equal(ap.refusTotal, 1);
  assert.equal(nb(db), avant);
  assert.equal(lire(db, u).donnees.masse, 0.5);
});

test('masses refusées : 0,25, 1e-9, négative, 1 000 000,5, texte, null ; acceptées : 0, 1,5, 1 000 000', () => {
  const { db, u, a } = monde();
  for (const m of [0.25, 1e-9, -0.5, -1, 1_000_000.5, 1_000_001, '0.5', null, NaN]) {
    const p = c.previsualiserCatalogue(db, a, U(u), OUTIL, fichier(element(m)));
    assert.equal(p.refus.length, 1, String(m));
    assert.equal(p.refus[0].champ, 'masse', String(m));
  }
  for (const m of [0, 1.5, 1_000_000, 8]) {
    const p = c.previsualiserCatalogue(db, a, U(u), OUTIL, fichier(element(m)));
    assert.equal(p.refus.length, 0, String(m));
  }
  // une coque aussi
  const coque = { cle: 'k', nom: 'K', classe: 1, cout: 1, pv: 1, ca: 1, puissance: 1, masse: 0.3, emports: 0, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
  const p = c.previsualiserCatalogue(db, a, U(u), OUTIL, { catalogue: OUTIL, version: 'x', coques: [coque] });
  assert.equal(p.refus[0].champ, 'masse');
  assert.equal(c.previsualiserCatalogue(db, a, U(u), OUTIL, { catalogue: OUTIL, version: 'x', coques: [{ ...coque, masse: 2.5 }] }).refus.length, 0);
});

test('le CHECK de la base refuse une masse hors multiple de 0,5 et accepte 0,5', () => {
  const { db, u } = monde();
  const ins = (m: number) => db.prepare(`INSERT INTO swn_catalogue_amenagements (proprietaire, univers_id, cle, nom, cout, puissance, masse, pv, ca, x_cout, x_puissance, x_masse, limite, version_catalogue)
    VALUES ('univers', ?, 'k${m}', 'n', 0, 0, ?, 0, 0, 0, 0, 0, 0, 'v')`).run(u, m);
  ins(0.5);
  assert.throws(() => ins(0.3), /CHECK/);
  assert.throws(() => ins(-0.5), /CHECK/);
});

test('quantité 3 de 0,5 : masse utilisée 1,5 et masseLibre === coque.masse − 1,5 ; l\'alerte tombe exactement sous zéro', () => {
  const { db, u, a } = monde();
  c.appliquerCatalogue(db, a, U(u), OUTIL, fichier(element(0.5)));
  const s = calc.calculerDepuisChoix(db, a, u, choix(3, 'fregate'));
  assert.equal(s.resultat!.masseLibre, 20 - 1.5);
  assert.ok(s.resultat!.masseLibre === 18.5);
  const rend = (q: number) => calc.calculerDepuisChoix(db, a, u, choix(q));
  const zero = rend(16); // éclaireur : masse 8
  assert.ok(zero.resultat!.masseLibre === 0);
  assert.ok(!zero.alertes.some((x) => x.code === 'masse_insuffisante'));
  assert.ok(!rend(15).alertes.some((x) => x.code === 'masse_insuffisante'));
  const neg = rend(17);
  assert.ok(neg.resultat!.masseLibre === -0.5);
  const al = neg.alertes.find((x) => x.code === 'masse_insuffisante')!;
  assert.equal(al.niveau, 'bloquante');
  assert.equal(al.texte, 'Masse insuffisante : −0,5');
  // le texte du vaisseau
  assert.match(texteVaisseau(neg.resultat as any, 'vaisseau' as any), /\| Masse libre \| −0,5 \|/);
  assert.match(texteVaisseau(s.resultat as any, 'vaisseau' as any), /\| Masse libre \| 18,5 \|/);
});

test('x_masse multiplie par le facteur de la coque sans écart : 0,5 × facteur 4 × 3', () => {
  const { db, u, a } = monde();
  c.appliquerCatalogue(db, a, U(u), OUTIL, fichier(element(0.5, { x_masse: true })));
  const s = calc.calculerDepuisChoix(db, a, u, choix(3, 'croiseur'));
  const coque = (c.resoudreElements(db, u, OUTIL, 'coques') as any[]).find((e) => e.cle === 'croiseur').donnees;
  assert.ok(s.resultat!.masseLibre === coque.masse - 0.5 * coque.facteur_masse * 3);
});

test('texteMasse et son jumeau du navigateur écrivent les mêmes chaînes', () => {
  const cas: [number, string][] = [[1.5, '1,5'], [7, '7'], [-0.5, '−0,5'], [0, '0'], [0.5, '0,5'], [-3, '−3'],
    [1234.5, `1${NB}234,5`], [1_000_000, `1${NB}000${NB}000`], [-1000.5, `−1${NB}000,5`], [999.5, '999,5']];
  for (const [n, att] of cas) {
    assert.equal(texteMasse(n), att);
    assert.equal(fmt.masse(n), att);
  }
});

test('montée : un élément de masse 8 (semis) reste lisible et inchangé, comptes identiques, foreign_key_check vide', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-masses-'));
  const db = openDb(':memory:');
  const source = new URL('../../db/migrations/', import.meta.url);
  const fichiers = readdirSync(source).filter((f) => /^\d{4}-.+\.sql$/.test(f));
  for (const f of fichiers) if (Number(f.slice(0, 4)) <= 25) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  semerBouchon(db);
  const snap = () => TABLES.map((t) => db.prepare(`SELECT * FROM swn_catalogue_${t} ORDER BY rowid`).all());
  const idx = () => db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name LIKE 'swn_catalogue_%' ORDER BY name").all();
  const avant = snap();
  const indexAvant = idx();
  assert.ok(avant.flat().length > 0);
  assert.ok((avant[0] as any[]).some((r) => r.masse === 8));
  assert.deepEqual(migrate(db), fichiers.map((f) => Number(f.slice(0, 4))).filter((n) => n > 25));
  assert.deepEqual(snap(), avant);
  assert.deepEqual(idx(), indexAvant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  for (const t of TABLES) {
    const col = (db.prepare(`PRAGMA table_info(swn_catalogue_${t})`).all() as any[]).find((x) => x.name === 'masse');
    assert.equal(col.type, 'REAL', t);
  }
  assert.ok(db.prepare("SELECT 1 FROM swn_catalogue_coques WHERE masse = 8").get());
});

test('fiches de règles et résumé d\'élément : la masse s\'écrit « 1,5 » / « 8 »', async () => {
  const { texteRegles } = await import('../../outils/swn/regles/texte-regles.js');
  const essai = JSON.parse((await import('node:fs')).readFileSync(new URL('../../outils/swn/exemples/catalogue-essai.json', import.meta.url), 'utf8'));
  const demi = { ...essai.amenagements[0], cle: 'demi', nom: 'Demi', masse: 1.5 };
  const t = texteRegles('amenagements', [demi, { ...demi, cle: 'neg', nom: 'Entier', masse: 8 }] as any);
  const lignes = t.split('\n').filter((l) => l.startsWith('|'));
  const iMasse = lignes[0]!.split('|').map((x) => x.trim()).indexOf('Masse');
  assert.ok(iMasse > 0);
  const cell = (nom: string) => lignes.find((l) => l.includes(nom))!.split('|').map((x) => x.trim())[iMasse];
  assert.equal(cell('Demi'), '1,5');
  assert.equal(cell('Entier'), '8');
  const { db, u, a } = monde();
  c.appliquerCatalogue(db, a, U(u), OUTIL, fichier(element(1.5)));
  const l = c.lireCatalogue(db, a, U(u), OUTIL, { nature: "amenagements" });
  const rows = Array.isArray(l) ? l : l.elements ?? l.lignes;
  assert.match(rows.find((r: any) => r.cle === 'demi-d-essai').resume, /masse 1,5$/);
});
