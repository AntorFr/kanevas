import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-vaisseaux-regles-generer (R-6, B-77) : attendus écrits en dur.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const c = await import('../catalogues.js');
const o = await import('../outils.js');
const { etatFichesRegles, genererFichesRegles } = await import('./fiches-regles.js');
const { appliquerProposition, lireProposition } = await import('../propositions.js');
const { ecrireContenu, retirerSection, lireSection } = await import('../sections.js');
const { supprimerFiche, listerFiches, lireFiche } = await import('../fiches.js');
type Db = ReturnType<typeof openDb>;

const OUTIL = 'swn/vaisseaux';
const CLES = ['regles-coques', 'regles-moteurs', 'regles-amenagements', 'regles-defenses', 'regles-armes', 'regles-modifications', 'exemples'];
const TITRES = ['Règles — Coques', 'Règles — Moteurs', 'Règles — Aménagements', 'Règles — Défenses', 'Règles — Armes', 'Règles — Modifications', 'Exemples de vaisseaux'];

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const compte = (n: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as any).id as number;
  const u = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const inconnu = Number((db.prepare("INSERT INTO comptes (username, cree_le) VALUES ('sans-role', 'x')").run()).lastInsertRowid);
  return { db, u, antor: { compteId: compte('antor') }, lea: { compteId: compte('lea') }, roxane: { compteId: compte('roxane') }, inconnu: { compteId: inconnu } };
}
function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string }; }
  return assert.fail('aucune erreur levée');
}
const fichesRegle = (db: Db, u: number) => db.prepare("SELECT * FROM fiches WHERE univers_id = ? AND type = 'regle' ORDER BY id").all(u) as any[];
const sections = (db: Db) => db.prepare('SELECT id, fiche_id, version, contenu, source_version FROM sections WHERE gere_par IS NOT NULL ORDER BY id').all() as any[];
const arme = (nom: string) => ({ cle: 'laser', nom, emport: 1, munitions: 0, cout_munition: 0, cout: 25000, puissance: 2, masse: 1,
  x_cout: true, x_puissance: true, x_masse: false, pv: 0, ca: 0, limite: 0 });
const importer = (db: Db, a: any, u: number, nom: string) =>
  c.appliquerCatalogue(db, a, { niveau: 'univers', id: u }, OUTIL, { catalogue: OUTIL, version: 'v-' + nom, armes: [arme(nom)] });

test('génération : sept fiches regle nommées, section gérée lisible par Léa, non modifiable ; relance inchangée sans rien bouger ; GET a_jour', () => {
  const { db, u, antor, lea } = monde();
  assert.deepEqual(etatFichesRegles(db, antor, u).map((e) => [e.cle, e.etat, e.ficheId]), CLES.map((k) => [k, 'absente', null]));
  const r = genererFichesRegles(db, antor, u);
  assert.deepEqual([r.creees, r.misesAJour, r.inchangees], [7, 0, 0]);
  const fiches = fichesRegle(db, u);
  assert.deepEqual(fiches.map((f) => f.titre), TITRES);
  for (const f of r.fiches) {
    const s = lireSection(db, lea, u, f.ficheId, f.sectionId);
    assert.ok(s.html.length > 0);
    assert.equal((s as any).contenu, undefined);
    const e = err(() => ecrireContenu(db, antor.compteId, u, f.ficheId, f.sectionId, 'x', s.version));
    assert.deepEqual([e.code, e.detail], ['refuse', 'section_geree']);
  }
  assert.deepEqual(etatFichesRegles(db, antor, u).map((e) => [e.cle, e.etat, e.propositionId]), CLES.map((k) => [k, 'a_jour', null]));
  const avantF = db.prepare('SELECT id, modifie_le, titre FROM fiches').all();
  const avantS = sections(db);
  const r2 = genererFichesRegles(db, antor, u);
  assert.deepEqual([r2.creees, r2.misesAJour, r2.inchangees], [0, 0, 7]);
  assert.equal(fichesRegle(db, u).length, 7);
  assert.deepEqual(db.prepare('SELECT id, modifie_le, titre FROM fiches').all(), avantF);
  assert.deepEqual(sections(db), avantS);
});

test('import avec arme modifiée : sept périmées, propositionId d\'Antor seul ; texte de Léa inchangé ; relance = 7 mises à jour, propositions périmées', () => {
  const { db, u, antor, lea } = monde();
  const g = genererFichesRegles(db, antor, u);
  const armes = g.fiches.find((f) => f.cle === 'regles-armes')!;
  const avantLea = lireSection(db, lea, u, armes.ficheId, armes.sectionId).html;
  importer(db, antor, u, 'Laser renforcé');
  const etat = etatFichesRegles(db, antor, u);
  assert.deepEqual(etat.map((e) => e.etat), Array(7).fill('perimee'));
  const pa = etat.find((e) => e.cle === 'regles-armes')!.propositionId;
  assert.ok(typeof pa === 'number');
  assert.ok(db.prepare('SELECT COUNT(*) n FROM propositions').get() as any);
  assert.equal(lireSection(db, lea, u, armes.ficheId, armes.sectionId).html, avantLea);
  assert.ok(!avantLea.includes('Laser renforcé'));
  // Léa ne voit pas la proposition d'Antor ; l'outil lui est refusé
  assert.equal(err(() => etatFichesRegles(db, lea, u)).code, 'refuse');
  const r = genererFichesRegles(db, antor, u);
  assert.deepEqual([r.creees, r.misesAJour, r.inchangees], [0, 7, 0]);
  assert.ok(lireSection(db, lea, u, armes.ficheId, armes.sectionId).html.includes('Laser renforcé'));
  assert.deepEqual(etatFichesRegles(db, antor, u).map((e) => [e.etat, e.propositionId]), Array(7).fill(['a_jour', null]));
  if (typeof pa === 'number') assert.equal(lireProposition(db, antor.compteId, u, pa).etat, 'perimee');
});

test('appliquer la proposition à la place : texte et table à jour, l\'état redevient a_jour', () => {
  const { db, u, antor, lea } = monde();
  const g = genererFichesRegles(db, antor, u);
  const armes = g.fiches.find((f) => f.cle === 'regles-armes')!;
  importer(db, antor, u, 'Laser renforcé');
  const pid = etatFichesRegles(db, antor, u).find((e) => e.cle === 'regles-armes')!.propositionId!;
  appliquerProposition(db, antor.compteId, u, pid);
  assert.ok(lireSection(db, lea, u, armes.ficheId, armes.sectionId).html.includes('Laser renforcé'));
  const e = etatFichesRegles(db, antor, u).find((x) => x.cle === 'regles-armes')!;
  assert.deepEqual([e.etat, e.propositionId], ['a_jour', null]);
  const r = genererFichesRegles(db, antor, u);
  assert.equal(r.fiches.find((f) => f.cle === 'regles-armes')!.resultat, 'inchangee');
});

test('catalogue vide : sept fiches, « Aucun élément dans le catalogue. » ×6 et « Aucun exemple. »', () => {
  const { db, u, antor, lea } = monde();
  for (const n of ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications', 'exemples']) db.exec(`DELETE FROM swn_catalogue_${n}`);
  for (const n of ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications', 'exemples']) {
    assert.equal(c.resoudreElements(db, u, OUTIL, n).length, 0, n);
  }
  const r = genererFichesRegles(db, antor, u);
  assert.equal(r.creees, 7);
  for (const f of r.fiches) {
    const txt = (lireSection(db, antor, u, f.ficheId, f.sectionId, 'markdown') as any).contenu as string;
    assert.ok(txt.includes(f.cle === 'exemples' ? 'Aucun exemple.' : 'Aucun élément dans le catalogue.'), f.cle + ' : ' + txt);
  }
});

test('fiche supprimée : recréée ; section retirée à la main : nouvelle fiche, l\'ancienne intacte', () => {
  const { db, u, antor } = monde();
  const g = genererFichesRegles(db, antor, u);
  const moteurs = g.fiches.find((f) => f.cle === 'regles-moteurs')!;
  supprimerFiche(db, antor, u, moteurs.ficheId);
  const r = genererFichesRegles(db, antor, u);
  assert.deepEqual([r.creees, r.inchangees], [1, 6]);
  const nv = r.fiches.find((f) => f.cle === 'regles-moteurs')!;
  assert.notEqual(nv.ficheId, moteurs.ficheId);
  assert.equal(fichesRegle(db, u).length, 7);
  // section retirée à la main
  const coques = g.fiches.find((f) => f.cle === 'regles-coques')!;
  retirerSection(db, antor.compteId, u, coques.ficheId, coques.sectionId);
  const r2 = genererFichesRegles(db, antor, u);
  assert.deepEqual([r2.creees, r2.inchangees], [1, 6]);
  const nc = r2.fiches.find((f) => f.cle === 'regles-coques')!;
  assert.notEqual(nc.ficheId, coques.ficheId);
  assert.ok(db.prepare('SELECT id FROM fiches WHERE id = ?').get(coques.ficheId), 'ancienne fiche conservée');
  assert.equal(fichesRegle(db, u).length, 8);
});

test('panne à la quatrième écriture : aucune fiche, aucune section, aucune ligne', () => {
  const { db, u, antor } = monde();
  db.exec(`CREATE TRIGGER panne BEFORE INSERT ON sections WHEN (SELECT COUNT(*) FROM sections WHERE gere_par IS NOT NULL) >= 3
    BEGIN SELECT RAISE(ABORT, 'panne injectée'); END`);
  const avant = fichesRegle(db, u).length;
  const sAvant = (db.prepare('SELECT COUNT(*) n FROM sections WHERE gere_par IS NOT NULL').get() as any).n;
  assert.throws(() => genererFichesRegles(db, antor, u));
  assert.equal(fichesRegle(db, u).length, avant);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM swn_fiches_generees').get() as any).n, 0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM sections WHERE gere_par IS NOT NULL').get() as any).n, sAvant);
});

test('droits : Roxane et Léa refuse ; sans rôle introuvable ; outil désactivé introuvable ; MJ en mode joueur refuse', () => {
  const { db, u, antor, lea, roxane, inconnu } = monde();
  for (const f of [etatFichesRegles, genererFichesRegles]) {
    assert.equal(err(() => f(db, lea, u)).code, 'refuse');
    assert.equal(err(() => f(db, roxane, u)).code, 'refuse');
    assert.equal(err(() => f(db, inconnu, u)).code, 'introuvable');
    assert.equal(err(() => f(db, { ...antor, modeJoueur: true }, u)).code, 'refuse');
  }
  assert.equal(fichesRegle(db, u).length, 0);
  o.poserActivation(db, antor, { niveau: 'univers', id: u }, OUTIL, false);
  assert.equal(err(() => genererFichesRegles(db, antor, u)).code, 'introuvable');
  assert.equal(err(() => etatFichesRegles(db, antor, u)).code, 'introuvable');
});

test('lecture : Léa et Roxane lisent les fiches et les trouvent par la recherche ; le compte sans rôle non', () => {
  const { db, u, antor, lea, roxane, inconnu } = monde();
  const r = genererFichesRegles(db, antor, u);
  const armes = r.fiches.find((f) => f.cle === 'regles-armes')!;
  for (const a of [lea, roxane]) {
    assert.equal(lireFiche(db, a, u, armes.ficheId).titre, 'Règles — Armes');
    const trouve = listerFiches(db, a, u, { recherche: 'Canon léger' }).fiches.map((f: any) => f.titre);
    assert.ok(trouve.includes('Règles — Armes'), JSON.stringify(trouve));
  }
  assert.ok(err(() => lireFiche(db, inconnu, u, armes.ficheId)));
  assert.ok(err(() => listerFiches(db, inconnu, u, { recherche: 'Canon léger' })));
});

test('masque d\'une arme : GET rend regles-armes et exemples périmées, propositionId d\'Antor seul, les cinq autres à jour', () => {
  const { db, u, antor, lea } = monde();
  genererFichesRegles(db, antor, u);
  const ligne = c.lireCatalogueGestion(db, antor, u, OUTIL, { nature: 'armes' }).elements.find((e: any) => e.cle === 'lance-d-essai') as any;
  c.masquerElement(db, antor, u, OUTIL, 'armes', 'lance-d-essai', { masque: true, version: ligne.version });
  const etat = etatFichesRegles(db, antor, u);
  assert.deepEqual(etat.map((e) => [e.cle, e.etat]), CLES.map((k) => [k, k === 'regles-armes' || k === 'exemples' ? 'perimee' : 'a_jour']));
  for (const e of etat) assert.equal(typeof e.propositionId, e.etat === 'perimee' ? 'number' : 'object', e.cle);
  const pid = etat.find((e) => e.cle === 'regles-armes')!.propositionId!;
  assert.equal(lireProposition(db, antor.compteId, u, pid).etat, 'en_attente');
  assert.equal(err(() => lireProposition(db, lea.compteId, u, pid)).code, 'introuvable');
  const r = genererFichesRegles(db, antor, u);
  assert.deepEqual([r.creees, r.misesAJour, r.inchangees], [0, 2, 5]);
  assert.equal(lireProposition(db, antor.compteId, u, pid).etat, 'perimee');
});
