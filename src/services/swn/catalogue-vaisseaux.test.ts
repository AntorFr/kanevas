import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-vaisseaux-donnees : migration, adaptateur des sept natures, format V-10, outil déclaré.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../../db/db.js');
const { assurerCompte } = await import('../comptes.js');
const { ajouterMembre } = await import('../membres.js');
const { creerEtRattacherSysteme } = await import('../systemes.js');
const { creerUnivers } = await import('../univers.js');
const o = await import('../outils.js');
const c = await import('../catalogues.js');
const { swn } = await import('../../outils/swn/index.js');
const { verifierDeclaration } = await import('../../outils/declaration.js');
const { verifierRegistre } = await import('../../outils/registre.js');
type Db = ReturnType<typeof openDb>;

const OUTIL = 'swn/vaisseaux';
const lire = (n: string) => JSON.parse(readFileSync(new URL(`../../outils/swn/exemples/${n}`, import.meta.url), 'utf8'));
const copie = () => lire('catalogue-essai.json');
const lancee = () => lire('catalogue-essai-univers.json');
const U = (id: number) => ({ niveau: 'univers' as const, id });
const S = (id: number) => ({ niveau: 'systeme' as const, id });
const A = (compteId: number) => ({ compteId });
const tot = (r: any, k: string) => Object.values(r.natures).reduce((s: number, x: any) => s + x[k], 0) as number;
const nb = (db: Db, t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n as number;
const TABLES = ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications', 'exemples'];
const total = (db: Db) => TABLES.reduce((s, t) => s + nb(db, `swn_catalogue_${t}`), 0);
function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string; champ?: string }; }
  return assert.fail('aucune erreur levée');
}
const versionSys = (db: Db, sys: number) =>
  (db.prepare('SELECT version_catalogue v FROM outils_systeme WHERE systeme_id = ? AND outil = ?').get(sys, OUTIL) as any)?.v ?? null;

/** Antor responsible MJ of Sys (u1, u2), Léa player of u1. */
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  assurerCompte(db, 'lea');
  const u1 = creerUnivers(db, antor, { nom: "Éneria d'essai" }).id;
  ajouterMembre(db, antor, u1, 'lea', 'joueur');
  const sys = creerEtRattacherSysteme(db, antor, u1, { nom: 'Sys' }).id;
  o.poserActivation(db, antor, U(u1), OUTIL, true);
  return { db, antor, u1, sys };
}

test('migration : neuf tables créées, lignes existantes intactes, foreign_key_check vide', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-vx-'));
  const db = openDb(':memory:');
  const source = new URL('../../db/migrations/', import.meta.url);
  for (const f of readdirSync(source)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 23) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', 'x')").run();
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', 'x')").run();
  db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 'lieu', 'F', '{}', 'x', 'x')").run();
  db.prepare("INSERT INTO swn_galaxies (univers_id, titre, graine) VALUES (1, 'G', 'g')").run();
  const snap = () => ['comptes', 'univers', 'fiches', 'swn_galaxies'].map((t) => db.prepare(`SELECT * FROM ${t}`).all());
  const avant = snap();
  const swn = () => db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'swn_%' AND type='table' ORDER BY name").all().map((r: any) => r.name as string);
  const tablesAvant = swn();
  const derniere = Math.max(...readdirSync(source).filter((f) => /^\d{4}-.+\.sql$/.test(f)).map((f) => Number(f.slice(0, 4))));
  assert.deepEqual(migrate(db), Array.from({ length: derniere - 23 }, (_, i) => 24 + i));
  assert.deepEqual(snap(), avant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const tables = swn().filter((t) => !tablesAvant.includes(t));
  assert.deepEqual(tables, ['swn_catalogue_amenagements', 'swn_catalogue_armes', 'swn_catalogue_coques', 'swn_catalogue_defenses',
    'swn_catalogue_exemples', 'swn_catalogue_modifications', 'swn_catalogue_moteurs', 'swn_catalogue_retraits',
    'swn_conceptions']);
});

test('migration : CHECK de bornes, masque réservé à l\'univers, unicité par niveau', () => {
  const { db, sys, u1 } = monde();
  const coque = (over: Record<string, unknown>, niveau: 'systeme' | 'univers' = 'systeme', cle = 'k') => {
    const r = { classe: 1, cout: 1, pv: 1, ca: 1, puissance: 1, masse: 1, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, masque: 0, ...over };
    db.prepare(`INSERT INTO swn_catalogue_coques (proprietaire, systeme_id, univers_id, cle, nom, ${Object.keys(r).join(',')}, version_catalogue)
      VALUES (?, ?, ?, ?, 'N', ${Object.keys(r).map(() => '?').join(',')}, 'v')`)
      .run(niveau, niveau === 'systeme' ? sys : null, niveau === 'univers' ? u1 : null, cle, ...Object.values(r));
  };
  assert.throws(() => coque({ classe: 5 }), /CHECK/);
  assert.throws(() => coque({ classe: 0 }), /CHECK/);
  assert.throws(() => coque({ facteur_cout: 0 }), /CHECK/);
  assert.throws(() => coque({ cout: -1 }), /CHECK/);
  assert.throws(() => coque({ cout: 1.5 }), /CHECK/);
  assert.throws(() => coque({ masque: 1 }), /CHECK/); // a system element is never masked
  coque({ classe: 4 }); // juste dans la borne
  assert.throws(() => coque({}), /UNIQUE/); // même clé, même niveau
  coque({}, 'univers'); // la même clé à l'autre niveau : la surcharge
  coque({ masque: 1 }, 'univers', 'm'); // masquer à l'univers est permis
  assert.throws(() => db.prepare(`INSERT INTO swn_catalogue_moteurs (proprietaire, systeme_id, cle, nom, niveau, cout, puissance, masse, pv, ca, limite,
    x_cout, x_puissance, x_masse, version_catalogue) VALUES ('systeme', ?, 'm', 'M', 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'v')`).run(sys), /CHECK/);
});

test('verifierDeclaration accepte le module swn et l\'outil vaisseaux ; le registre aussi', () => {
  verifierDeclaration(swn);
  verifierRegistre();
  const outil = swn.outils.find((x) => x.cle === OUTIL)!;
  assert.equal(outil.type, 'generateur');
  assert.deepEqual((outil as any).usages.map((u: any) => [u.nom, u.mjSeul]), [['concevoir', false], ['creer', true], ['generer', true]]);
  assert.deepEqual((outil as any).sections.map((s: any) => s.type), ['caracteristiques', 'regles-coques', 'regles-moteurs', 'regles-amenagements', 'regles-defenses', 'regles-armes', 'regles-modifications', 'exemples']);
  assert.deepEqual((outil as any).catalogue.natures.map((n: any) => n.nom), TABLES);
});

test('aperçu du catalogue d\'essai : 3/2/2/1/2/1/7 ajoutés, 0 refusé, rien d\'écrit ; application ; rejeu inchangé', () => {
  const { db, antor, sys } = monde();
  const r = c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, copie());
  assert.equal(r.apercu, true);
  assert.deepEqual(Object.fromEntries(Object.entries(r.natures).map(([k, v]: any) => [k, v.ajoutes])),
    { coques: 3, moteurs: 2, amenagements: 2, defenses: 1, armes: 2, modifications: 1, exemples: 7 });
  assert.equal(tot(r, 'refuses'), 0);
  assert.equal(total(db), 0);
  assert.equal(versionSys(db, sys), null);

  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, copie());
  assert.equal(total(db), 18);
  assert.equal(versionSys(db, sys), '2026-11-essai-vaisseaux');
  const r2 = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, copie());
  assert.equal(tot(r2, 'ajoutes'), 0);
  assert.equal(tot(r2, 'modifies'), 0);
  assert.equal(tot(r2, 'inchanges'), 18);
  assert.equal(versionSys(db, sys), '2026-11-essai-vaisseaux');
  // seule la version-étiquette change : rien ne bouge, la version non plus
  const g = copie(); g.version = 'autre';
  assert.equal(tot(c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, g), 'inchanges'), 18);
  assert.equal(versionSys(db, sys), '2026-11-essai-vaisseaux');
});

test('round-trip : les valeurs écrites sont celles du fichier, booléens et choix compris', () => {
  const { db, antor, sys, u1 } = monde();
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, copie());
  const par = (nature: string, cle: string) =>
    c.resoudreElements(db, u1, OUTIL, nature).find((e: any) => e.cle === cle) as any;
  const f = copie();
  const { cle: _c, ...cabines } = f.amenagements.find((a: any) => a.cle === 'cabines');
  assert.deepEqual(par('amenagements', 'cabines').donnees, cabines);
  assert.equal(par('amenagements', 'cabines').donnees.x_masse, true);
  assert.equal(par('amenagements', 'cabines').donnees.x_puissance, false);
  const ex = f.exemples.find((e: any) => e.cle === 'fregate-de-ligne');
  assert.deepEqual(par('exemples', 'fregate-de-ligne').donnees.choix, ex.choix);
  assert.equal(par('coques', 'croiseur').donnees.facteur_masse, 4);
  assert.equal(par('moteurs', 'moteur-2').donnees.niveau, 2);
});

test('laser sans masse : 11 ajoutés, 7 refusés dans l\'ordre — laser/masse puis les six exemples', () => {
  const { db, antor, sys } = monde();
  const f = copie();
  f.armes = f.armes.map((a: any) => a.cle === 'laser' ? (({ masse, ...r }) => r)(a) : a);
  const r = c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, f);
  assert.equal(tot(r, 'ajoutes'), 11);
  assert.equal(tot(r, 'refuses'), 7);
  assert.equal(r.refus.length, 7);
  assert.deepEqual(r.refus[0], { nature: 'armes', cle: 'laser', champ: 'masse', raison: 'nombre attendu' });
  const sixExemples = copie().exemples.filter((e: any) => e.choix.some((l: any) => l.cle === 'laser')).map((e: any) => e.cle).sort();
  assert.equal(sixExemples.length, 6);
  assert.deepEqual(r.refus.slice(1).map((x: any) => x.cle).sort(), sixExemples);
  for (const x of r.refus.slice(1)) {
    assert.equal(x.nature, 'exemples');
    assert.equal(x.champ, 'choix');
    assert.equal(x.raison, 'élément inconnu : armes/laser');
  }
  assert.equal(total(db), 0);
  const ap = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, f);
  assert.equal(ap.refusTotal, 7);
  assert.equal(total(db), 11);
  assert.equal(nb(db, 'swn_catalogue_exemples'), 1); // eclaireur-nu, le seul sans laser
});

test('un exemple nomme lance-d-essai : refusé au système, accepté à l\'univers une fois la lance importée', () => {
  const { db, antor, sys, u1 } = monde();
  const f = copie();
  f.exemples.push({ cle: 'avec-lance', nom: 'Avec lance', coque: 'eclaireur', choix: [{ nature: 'armes', cle: 'lance-d-essai', quantite: 1 }] });
  const r = c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, f);
  assert.equal(tot(r, 'refuses'), 1);
  assert.deepEqual(r.refus, [{ nature: 'exemples', cle: 'avec-lance', champ: 'choix', raison: 'élément inconnu : armes/lance-d-essai' }]);
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, copie());
  // univers : la lance n'est pas encore importée, dans le même fichier elle l'est
  const exU = { cle: 'avec-lance', nom: 'Avec lance', coque: 'eclaireur', choix: [{ nature: 'armes', cle: 'lance-d-essai', quantite: 1 }] };
  const seul = { catalogue: OUTIL, version: 'u', exemples: [exU] };
  assert.equal(c.previsualiserCatalogue(db, A(antor), U(u1), OUTIL, seul).refus[0]!.raison, 'élément inconnu : armes/lance-d-essai');
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, lancee());
  const r2 = c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, seul);
  assert.equal(r2.refusTotal, 0);
  assert.equal(tot(r2, 'ajoutes'), 1);
  // et la coque du système, vue de l'univers, se résout aussi (niveau système)
  assert.equal(nb(db, 'swn_catalogue_exemples'), 8);
});

test('une coque d\'exemple inconnue est refusée avec champ coque ; un exemple peut s\'appuyer sur un élément valide du même fichier', () => {
  const { db, antor, sys } = monde();
  const f = { catalogue: OUTIL, version: 'x',
    exemples: [{ cle: 'e1', nom: 'E', coque: 'fantome', choix: [] }] };
  assert.deepEqual(c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, f).refus,
    [{ nature: 'exemples', cle: 'e1', champ: 'coque', raison: 'élément inconnu : coques/fantome' }]);
  const g = copie();
  g.exemples = [{ cle: 'seul', nom: 'Seul', coque: 'eclaireur', choix: [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1 }] }];
  assert.equal(tot(c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, g), 'refuses'), 0);
});

test('un élément retiré de l\'univers n\'est plus résolu par un exemple d\'univers', () => {
  const { db, antor, sys, u1 } = monde();
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, copie());
  c.retirerElement(db, A(antor), u1, OUTIL, 'armes', 'canon-leger', { retire: true });
  const f = { catalogue: OUTIL, version: 'u', exemples: [
    { cle: 'a', nom: 'A', coque: 'eclaireur', choix: [{ nature: 'armes', cle: 'canon-leger', quantite: 1 }] },
    { cle: 'b', nom: 'B', coque: 'eclaireur', choix: [{ nature: 'armes', cle: 'laser', quantite: 1 }] }] };
  assert.deepEqual(c.previsualiserCatalogue(db, A(antor), U(u1), OUTIL, f).refus,
    [{ nature: 'exemples', cle: 'a', champ: 'choix', raison: 'élément inconnu : armes/canon-leger' }]);
});

test('refus avec leur champ : classe 5, facteur_cout 0, quantité 100, champ inconnu, champ manquant, nature de ligne inconnue', () => {
  const { db, antor, sys } = monde();
  const refus = (mod: (f: any) => void) => {
    const f = copie(); mod(f);
    const r = c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, f);
    assert.equal(tot(r, 'refuses') > 0, true);
    return r.refus[0]!;
  };
  const a = refus((f) => { f.coques[0].classe = 5; });
  assert.deepEqual([a.nature, a.cle, a.champ], ['coques', 'eclaireur', 'classe']);
  const b = refus((f) => { f.coques[1].facteur_cout = 0; });
  assert.deepEqual([b.nature, b.cle, b.champ], ['coques', 'fregate', 'facteur_cout']);
  const q = refus((f) => { f.exemples[0].choix[0].quantite = 100; });
  assert.equal(q.nature, 'exemples');
  assert.match(q.champ, /^choix/);
  assert.equal(refus((f) => { f.coques[0].classe = 0; }).champ, 'classe');
  assert.equal(refus((f) => { f.moteurs[0].niveau = 7; }).champ, 'niveau');
  assert.equal(refus((f) => { f.amenagements[0].x_cout = 'oui'; }).champ, 'x_cout');
  assert.equal(refus((f) => { f.armes[0].puissance = 1.5; }).champ, 'puissance');
  assert.equal(refus((f) => { f.armes[0].cout = -1; }).champ, 'cout');
  assert.equal(refus((f) => { delete f.armes[0].munitions; }).champ, 'munitions');
  // schéma strict : aucun champ inconnu
  const s = refus((f) => { f.defenses[0].surprise = 1; });
  assert.deepEqual([s.nature, s.cle], ['defenses', 'blindage']);
  const n = refus((f) => { f.exemples[0].choix[0].nature = 'coques'; });
  assert.match(n.champ, /^choix/);
  assert.equal(refus((f) => { f.exemples[0].choix[0].quantite = 0; }).nature, 'exemples');
  assert.equal(total(db), 0);
});

test('bornes acceptées : classe 4, niveau 6, quantité 99, facteur 1, valeurs 0', () => {
  const { db, antor, sys } = monde();
  const f = copie();
  f.coques[0].classe = 4;
  f.moteurs[0].niveau = 6;
  f.coques[1].facteur_cout = 1;
  f.amenagements[0].cout = 0;
  f.exemples[0].choix[0].quantite = 99;
  assert.equal(tot(c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, f), 'refuses'), 0);
});

test('masque : version périmée = conflit/donnee_modifiee, version lue = masqué ; masquer une coque du système = element_systeme', () => {
  const { db, antor, sys, u1 } = monde();
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, copie());
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, lancee());
  const lu = () => c.lireCatalogueGestion(db, A(antor), u1, OUTIL, { nature: 'armes' }).elements.find((e: any) => e.cle === 'lance-d-essai') as any;
  const v0 = lu().version as number;
  const m = c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'lance-d-essai', { masque: true, version: v0 });
  assert.equal(m.masque, true);
  assert.equal(m.version, v0 + 1);
  const e = err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'lance-d-essai', { masque: false, version: v0 }));
  assert.equal(e.code, 'conflit');
  assert.equal(e.detail, 'donnee_modifiee');
  assert.equal(lu().masque, true); // la tentative périmée n'a rien changé
  const s = err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'coques', 'eclaireur', { masque: true, version: 1 }));
  assert.equal(s.code, 'invalide');
  assert.equal(s.detail, 'element_systeme');
  assert.equal((db.prepare("SELECT masque FROM swn_catalogue_coques WHERE cle = 'eclaireur'").get() as any).masque, 0);
  assert.equal(err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'inconnue', { masque: true, version: 1 })).code, 'introuvable');
});

test('un réimport de l\'univers ne touche ni le masque ni les retraits (B-48)', () => {
  const { db, antor, sys, u1 } = monde();
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, copie());
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, lancee());
  c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'lance-d-essai', { masque: true, version: 1 });
  c.retirerElement(db, A(antor), u1, OUTIL, 'moteurs', 'moteur-1', { retire: true });
  const g = lancee(); g.armes[0].cout = 31000; g.version = 'u2';
  const r = c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, g);
  assert.equal(tot(r, 'modifies'), 1);
  assert.equal((db.prepare("SELECT masque FROM swn_catalogue_armes WHERE cle = 'lance-d-essai'").get() as any).masque, 1);
  assert.equal(nb(db, 'swn_catalogue_retraits'), 1);
});

test('une panne à la 10e écriture n\'écrit ni ligne ni version', () => {
  const { db, antor, sys } = monde();
  const st = (swn.outils.find((x) => x.cle === OUTIL) as any).catalogue.stockage;
  const orig = st.ecrire;
  let n = 0;
  st.ecrire = (...a: unknown[]) => { const r = orig(...a); if (++n === 10) throw new Error('panne'); return r; };
  try { assert.throws(() => c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, copie()), /panne/); }
  finally { st.ecrire = orig; }
  assert.equal(n, 10);
  assert.equal(total(db), 0);
  assert.equal(versionSys(db, sys), null);
});

test('le SQL de swn_catalogue_* et swn_conceptions ne vit que dans services/swn/', () => {
  const racine = new URL('../../', import.meta.url);
  const fautifs: string[] = [];
  for (const rel of readdirSync(racine, { recursive: true, encoding: 'utf8' })) {
    if (!rel.endsWith('.ts') || rel.endsWith('.test.ts') || rel.startsWith('services/swn/') || rel.startsWith('db/')) continue;
    if (/swn_catalogue_|swn_conceptions/.test(readFileSync(new URL(rel, racine), 'utf8'))) fautifs.push(rel);
  }
  assert.deepEqual(fautifs, []);
});
