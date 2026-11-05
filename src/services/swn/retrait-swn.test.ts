import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const o = await import('../outils.js');
const d = await import('../outils-donnees.js');
const { lireCatalogue } = await import('../catalogues.js');
const { supprimerUnivers } = await import('../univers.js');
const { poserDocumentMJ } = await import('./document.js');
type Db = ReturnType<typeof openDb>;

const VAISSEAUX = 'swn/vaisseaux';
const GALAXIE = 'swn/galaxie';

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const un = (sql: string, ...a: unknown[]) => q(sql, ...a)[0];
  const compte = (n: string) => un('SELECT id FROM comptes WHERE username = ?', n).id as number;
  const univers = (n: string) => un('SELECT id FROM univers WHERE nom = ?', n).id as number;
  return {
    db, q, un, antor: compte('antor'), mira: compte('mira'), lea: compte('lea'),
    eneria: univers("Éneria d'essai"), voisin: univers('Univers voisin'),
    sys: un("SELECT id FROM systemes_jeu WHERE nom = ?", "Système d'essai").id as number,
  };
}
const U = (universId: number) => ({ niveau: 'univers' as const, universId });
const S = (systemeId: number) => ({ niveau: 'systeme' as const, systemeId });
const lignes = (r: { efface: { cle: string; nombre: number }[] }) => r.efface.map((l) => `${l.cle}:${l.nombre}`).sort();

/** Row count of every `swn_*` table, the sheets and the sections. */
function comptes(db: Db): Record<string, number> {
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'swn\\_%' ESCAPE '\\' ORDER BY name`)
    .all() as { name: string }[]).map((t) => t.name);
  return Object.fromEntries([...tables, 'sections', 'fiches', 'outils_univers', 'outils_systeme']
    .map((t) => [t, (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));
}
const nb = (db: Db, table: string, universId: number) =>
  (db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE univers_id = ?`).get(universId) as { n: number }).n;
const TABLES_CATALOGUE = ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications', 'exemples'].map((n) => `swn_catalogue_${n}`);
const nbCatalogueUnivers = (db: Db, u: number) =>
  TABLES_CATALOGUE.reduce((n, t) => n + (db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE univers_id = ?`).get(u) as { n: number }).n, 0)
  + nb(db, 'swn_catalogue_retraits', u);
const nbCatalogueSysteme = (db: Db, s: number) =>
  TABLES_CATALOGUE.reduce((n, t) => n + (db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE systeme_id = ?`).get(s) as { n: number }).n, 0);

test('semis : le résumé du concepteur d’Éneria dit 2 conceptions, 2 éléments locaux de catalogue', () => {
  const w = monde();
  const r = d.resumeSuppression(w.db, { compteId: w.antor }, U(w.eneria), VAISSEAUX);
  assert.deepEqual(lignes(r), ['catalogue:2', 'conceptions:2']);
  assert.equal(r.total, 4);
  const cat = r.efface.find((l) => l.cle === 'catalogue')!;
  assert.equal(cat.pluriel, 'éléments locaux de catalogue');
  assert.equal(r.efface.find((l) => l.cle === 'conceptions')!.pluriel, 'conceptions');
  assert.equal(r.encoreUtilise, null);
  // Les titres des deux conceptions du semis.
  assert.deepEqual(w.q(`SELECT f.titre FROM swn_conceptions c JOIN fiches f ON f.id = c.fiche_id WHERE c.univers_id = ? ORDER BY f.titre`, w.eneria)
    .map((x) => x.titre), ['Vent d\'Orak', 'Étoile du soir']);
  assert.equal(nb(w.db, 'swn_conceptions', w.voisin), 1);
});

test('semis : activation de départ du concepteur (système Activé, Éneria suit, Voisin force Activé)', () => {
  const w = monde();
  assert.equal(w.un('SELECT active FROM outils_systeme WHERE systeme_id = ? AND outil = ?', w.sys, VAISSEAUX).active, 1);
  assert.equal(w.un('SELECT active FROM outils_univers WHERE univers_id = ? AND outil = ?', w.eneria, VAISSEAUX).active, null);
  assert.equal(w.un('SELECT active FROM outils_univers WHERE univers_id = ? AND outil = ?', w.voisin, VAISSEAUX).active, 1);
  assert.equal(o.resoudreOutil(w.db, w.eneria, VAISSEAUX).active, true);
  assert.equal(o.resoudreOutil(w.db, w.voisin, VAISSEAUX).active, true);
});

test('supprimerDonneesOutil (Éneria) : conceptions, fiches générées et catalogue local effacés, Voisin intact, fiches gardées et non gérées', () => {
  const w = monde();
  const fiches = w.q(`SELECT f.id, f.titre FROM swn_conceptions c JOIN fiches f ON f.id = c.fiche_id WHERE c.univers_id = ?`, w.eneria);
  const caracs = (u: number) => w.q(`SELECT s.id, s.fiche_id, s.contenu, s.contenu_public, s.version, s.gere_par, s.source_version FROM sections s
    JOIN fiches f ON f.id = s.fiche_id WHERE f.univers_id = ? AND s.gere_par LIKE 'swn/vaisseaux/%' ORDER BY s.id`, u);
  const avant = caracs(w.eneria);
  assert.ok(avant.length >= 2, 'le semis pose des sections gérées de conception');
  const voisinAvant = { conceptions: w.q('SELECT * FROM swn_conceptions WHERE univers_id = ?', w.voisin), gerees: caracs(w.voisin),
    catalogue: nbCatalogueUnivers(w.db, w.voisin), systeme: nbCatalogueSysteme(w.db, w.sys) };
  assert.ok(nbCatalogueUnivers(w.db, w.eneria) > 0);
  assert.ok(voisinAvant.systeme > 0);

  const vu = d.resumeSuppression(w.db, { compteId: w.antor }, U(w.eneria), VAISSEAUX).efface;
  const efface = d.supprimerDonneesOutil(w.db, { compteId: w.antor }, U(w.eneria), VAISSEAUX, vu);
  assert.deepEqual(efface.map((l) => `${l.cle}:${l.nombre}`).sort(), ['catalogue:2', 'conceptions:2']);

  assert.equal(nb(w.db, 'swn_conceptions', w.eneria), 0);
  assert.equal(nb(w.db, 'swn_fiches_generees', w.eneria), 0);
  assert.equal(nbCatalogueUnivers(w.db, w.eneria), 0);
  // Univers voisin et le système : intacts.
  assert.deepEqual(w.q('SELECT * FROM swn_conceptions WHERE univers_id = ?', w.voisin), voisinAvant.conceptions);
  assert.deepEqual(caracs(w.voisin), voisinAvant.gerees);
  assert.equal(nbCatalogueUnivers(w.db, w.voisin), voisinAvant.catalogue);
  assert.equal(nbCatalogueSysteme(w.db, w.sys), voisinAvant.systeme);
  // Les fiches existent, leur texte est identique, la section n'est plus gérée.
  for (const f of fiches) assert.ok(w.un('SELECT id FROM fiches WHERE id = ?', f.id), `fiche ${f.titre} gardée`);
  const apres = w.q(`SELECT id, fiche_id, contenu, contenu_public, version, gere_par, source_version FROM sections WHERE id IN (${avant.map(() => '?').join(',')}) ORDER BY id`,
    ...avant.map((s) => s.id));
  assert.equal(apres.length, avant.length);
  for (const [i, s] of apres.entries()) {
    assert.equal(s.gere_par, null);
    assert.equal(s.source_version, null);
    assert.equal(s.contenu, avant[i].contenu);
    assert.equal(s.contenu_public, avant[i].contenu_public);
    assert.equal(s.version, avant[i].version);
  }
  // L'activation reste.
  assert.equal(w.un('SELECT active FROM outils_univers WHERE univers_id = ? AND outil = ?', w.eneria, VAISSEAUX).active, null);
  // Le recomptage est vide : le même vu rejoué est un conflit, le vu relu réussit à zéro.
  assert.equal((() => { try { d.supprimerDonneesOutil(w.db, { compteId: w.antor }, U(w.eneria), VAISSEAUX, vu); } catch (e: any) { return e.detail; } })(), 'contenu_change');
  assert.deepEqual(d.supprimerDonneesOutil(w.db, { compteId: w.antor }, U(w.eneria), VAISSEAUX, []), []);
});

test('un vu qui oublie un élément du catalogue (2 conceptions seules) est un conflit sans écriture', () => {
  const w = monde();
  const avant = comptes(w.db);
  let detail: string | undefined;
  try { d.supprimerDonneesOutil(w.db, { compteId: w.antor }, U(w.eneria), VAISSEAUX, [{ cle: 'conceptions', nombre: 2 }]); } catch (e: any) { detail = e.detail; }
  assert.equal(detail, 'contenu_change');
  assert.deepEqual(comptes(w.db), avant);
});

test('un MJ non responsable, un joueur : ni résumé ni effacement des données du concepteur au niveau système', () => {
  const w = monde();
  const avant = comptes(w.db);
  for (const compteId of [w.mira, w.lea]) {
    assert.throws(() => d.resumeSuppression(w.db, { compteId }, S(w.sys), VAISSEAUX));
    assert.throws(() => d.supprimerDonneesOutil(w.db, { compteId }, S(w.sys), VAISSEAUX, []));
  }
  assert.throws(() => d.supprimerDonneesOutil(w.db, { compteId: w.lea }, U(w.eneria), VAISSEAUX, []));
  assert.deepEqual(comptes(w.db), avant);
});

test('système : encoreUtilise ajoute Univers voisin (forcé Activé) avec sa conception, et seules les lignes du système partent', () => {
  const w = monde();
  // Antor désactive le concepteur au système : Éneria (qui suit) le perd, Voisin (qui l'a forcé) le garde.
  o.poserActivation(w.db, w.antor, { niveau: 'systeme', id: w.sys }, VAISSEAUX, false);
  const r = d.resumeSuppression(w.db, { compteId: w.antor }, S(w.sys), VAISSEAUX);
  assert.deepEqual(r.encoreUtilise!.univers.map((u) => u.nom), ['Univers voisin']);
  assert.deepEqual(r.encoreUtilise!.lignes.map((l) => `${l.cle}:${l.nombre}`), ['conceptions:1']);
  assert.deepEqual(r.efface.map((l) => l.cle), ['catalogue']);
  assert.equal(r.efface[0].pluriel, 'éléments du catalogue du système');

  const avant = {
    eneria: nbCatalogueUnivers(w.db, w.eneria), voisin: nbCatalogueUnivers(w.db, w.voisin),
    conceptions: nb(w.db, 'swn_conceptions', w.eneria) + nb(w.db, 'swn_conceptions', w.voisin),
  };
  d.supprimerDonneesOutil(w.db, { compteId: w.antor }, S(w.sys), VAISSEAUX, r.efface);
  assert.equal(nbCatalogueSysteme(w.db, w.sys), 0);
  assert.equal(nbCatalogueUnivers(w.db, w.eneria), avant.eneria);
  assert.equal(nbCatalogueUnivers(w.db, w.voisin), avant.voisin);
  assert.equal(nb(w.db, 'swn_conceptions', w.eneria) + nb(w.db, 'swn_conceptions', w.voisin), avant.conceptions);
});

test('système actif : Éneria et Voisin comptent tous deux dans encoreUtilise (2 + 1 conceptions)', () => {
  const w = monde();
  const r = d.resumeSuppression(w.db, { compteId: w.antor }, S(w.sys), VAISSEAUX);
  assert.deepEqual(r.encoreUtilise!.univers.map((u) => u.nom).sort(), ["Univers voisin", "Éneria d'essai"].sort());
  assert.deepEqual(r.encoreUtilise!.lignes.map((l) => `${l.cle}:${l.nombre}`), ['conceptions:3']);
});

test('outil de la galaxie : le résumé dit 4 systèmes, 3 routes, 1 zone, l’effacement les supprime et libère la section du document MJ', () => {
  const w = monde();
  // Le semis ne pose pas de document : on en pose un, comme le MJ le ferait.
  const gid = w.un('SELECT id, version FROM swn_galaxies WHERE univers_id = ?', w.eneria);
  poserDocumentMJ(w.db, w.antor, w.eneria, gid.id, { creer: { titre: 'Galaxie — notes MJ' } }, gid.version);
  const r = d.resumeSuppression(w.db, { compteId: w.antor }, U(w.eneria), GALAXIE);
  assert.deepEqual(lignes(r), ['routes:3', 'systemes:4', 'zones:1']);
  assert.equal(r.sectionsGerees, 1);
  const g = w.un('SELECT id, fiche_id, section_id FROM swn_galaxies WHERE univers_id = ?', w.eneria);
  assert.ok(g.section_id !== null);
  const avant = w.un('SELECT contenu, version, gere_par FROM sections WHERE id = ?', g.section_id);
  assert.match(avant.gere_par, /^swn\/galaxie\//);
  d.supprimerDonneesOutil(w.db, { compteId: w.antor }, U(w.eneria), GALAXIE, r.efface);
  for (const t of ['swn_galaxies', 'swn_systemes', 'swn_routes', 'swn_zones']) assert.equal(nb(w.db, t, w.eneria), 0, t);
  const apres = w.un('SELECT contenu, version, gere_par, source_version FROM sections WHERE id = ?', g.section_id);
  assert.equal(apres.gere_par, null);
  assert.equal(apres.source_version, null);
  assert.equal(apres.contenu, avant.contenu);
  assert.equal(apres.version, avant.version);
  assert.ok(w.un('SELECT id FROM fiches WHERE id = ?', g.fiche_id));
  // Les conceptions ne sont pas touchées par l'outil de la galaxie.
  assert.equal(nb(w.db, 'swn_conceptions', w.eneria), 2);
});

test('outil de la galaxie au niveau système : aucune donnée, 404 (introuvable)', () => {
  const w = monde();
  assert.throws(() => d.resumeSuppression(w.db, { compteId: w.antor }, S(w.sys), GALAXIE), (e: any) => e.code === 'introuvable');
});

test('supprimer « Éneria d’essai » : zéro ligne swn_* pour lui, Voisin garde les siennes, foreign_key_check vide', () => {
  const w = monde();
  supprimerUnivers(w.db, { compteId: w.antor }, w.eneria, "Éneria d'essai");
  const tables = (w.q(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'swn\\_%' ESCAPE '\\'`) as { name: string }[]).map((t) => t.name);
  for (const t of tables) {
    const colonnes = (w.q(`PRAGMA table_info(${t})`) as { name: string }[]).map((c) => c.name);
    if (colonnes.includes('univers_id')) assert.equal(nb(w.db, t, w.eneria), 0, t);
  }
  assert.equal(nb(w.db, 'outils_univers', w.eneria), 0);
  assert.equal(nb(w.db, 'swn_conceptions', w.voisin), 1);
  assert.equal(nbCatalogueSysteme(w.db, w.sys) > 0, true);
  assert.deepEqual(w.q('PRAGMA foreign_key_check'), []);
});

test('D-6 sur le semis : désactiver le concepteur d’Éneria puis du système ne change aucun décompte swn_*, la réactivation rend les mêmes conceptions', () => {
  const w = monde();
  const avant = comptes(w.db);
  const sections = w.q('SELECT id, gere_par, contenu, version FROM sections ORDER BY id');
  o.poserActivation(w.db, w.antor, { niveau: 'univers', id: w.eneria }, VAISSEAUX, false);
  assert.deepEqual({ ...comptes(w.db), outils_univers: 0 }, { ...avant, outils_univers: 0 });
  assert.equal(nb(w.db, 'swn_conceptions', w.eneria), 2);
  o.poserActivation(w.db, w.antor, { niveau: 'univers', id: w.eneria }, VAISSEAUX, null);
  assert.deepEqual(comptes(w.db), { ...avant });
  o.poserActivation(w.db, w.antor, { niveau: 'systeme', id: w.sys }, VAISSEAUX, false);
  assert.deepEqual(comptes(w.db), avant);
  o.poserActivation(w.db, w.antor, { niveau: 'systeme', id: w.sys }, VAISSEAUX, true);
  assert.deepEqual(comptes(w.db), avant);
  assert.deepEqual(w.q('SELECT id, gere_par, contenu, version FROM sections ORDER BY id'), sections);
});

test('système désactivé par le responsable : Éneria (qui suit) ne lit plus le catalogue du système, Voisin (qui l’a forcé) le lit, aucune ligne changée', () => {
  const w = monde();
  const origines = (universId: number) => lireCatalogue(w.db, { compteId: w.antor }, { niveau: 'univers', id: universId }, VAISSEAUX).elements
    .map((e) => e.origine);
  const avantVoisin = lireCatalogue(w.db, { compteId: w.antor }, { niveau: 'univers', id: w.voisin }, VAISSEAUX).elements.length;
  assert.ok(avantVoisin > 0);
  assert.ok(origines(w.eneria).includes('systeme'));
  const avant = comptes(w.db);
  o.poserActivation(w.db, w.antor, { niveau: 'systeme', id: w.sys }, VAISSEAUX, false);
  // Éneria suit le système désactivé : l'outil n'y est plus accessible, donc plus aucune ligne du système n'y est rendue.
  let lues: (string | undefined)[] = [];
  try { lues = origines(w.eneria); } catch (e: any) { assert.equal(e.code, 'introuvable'); }
  assert.ok(!lues.includes('systeme'));
  const voisin = lireCatalogue(w.db, { compteId: w.antor }, { niveau: 'univers', id: w.voisin }, VAISSEAUX).elements;
  assert.equal(voisin.length, avantVoisin);
  assert.ok(voisin.some((e) => e.origine === 'systeme'));
  assert.deepEqual(comptes(w.db), avant);
});
