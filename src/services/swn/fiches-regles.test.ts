import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-vaisseaux-regles-sections : table, sept sections gérées, produit « au niveau d'un joueur »,
// empreinte de la version, propositions sur masque/retrait, tenue de swn_fiches_generees. Attendus écrits en dur (R-1 à R-5, V-11).
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const c = await import('../catalogues.js');
const o = await import('../outils.js');
const sg = await import('../sections-gerees.js');
const { creerFiche } = await import('../fiches.js');
const { appliquerProposition } = await import('../propositions.js');
const calc = await import('./calcul-vaisseau.js');
const { swn } = await import('../../outils/swn/index.js');
const { verifierDeclaration } = await import('../../outils/declaration.js');
const { texteRegles } = await import('../../outils/swn/regles/texte-regles.js');
type Db = ReturnType<typeof openDb>;

const OUTIL = 'swn/vaisseaux';
const TYPES = ['regles-coques', 'regles-moteurs', 'regles-amenagements', 'regles-defenses', 'regles-armes', 'regles-modifications', 'exemples'];
const NB = '\u00A0';

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const compte = (n: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as any).id as number;
  const u = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  return { db, u, antor: { compteId: compte('antor') }, lea: { compteId: compte('lea') }, roxane: { compteId: compte('roxane') } };
}
function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string }; }
  return assert.fail('aucune erreur levée');
}
const decl = (type: string) => sg.declarationSection(OUTIL, type)!;
const ctx = (db: Db, u: number, a: any) => ({ db, acteur: a, universId: u, ficheId: 0, sectionId: null });
const produire = (db: Db, u: number, a: any, type: string) => decl(type).produire(ctx(db, u, a));
const vs = (db: Db, u: number, a: any, type: string) => decl(type).versionSource(ctx(db, u, a));
const masquer = (db: Db, a: any, u: number, nature: string, cle: string, masque = true) => {
  const ligne = c.lireCatalogueGestion(db, a, u, OUTIL, { nature }).elements.find((e: any) => e.cle === cle) as any;
  return c.masquerElement(db, a, u, OUTIL, nature, cle, { masque, version: ligne.version });
};
/** Writes the section of `type` on a new sheet, as the generation will (creation through poserSectionGeree). */
function generer(db: Db, u: number, a: any, type: string) {
  const f = creerFiche(db, a.compteId, u, { type: 'regle', titre: `Fiche ${type}`, sections: [] }).id;
  const p = produire(db, u, a, type);
  const s = sg.poserSectionGeree(db, a.compteId, u, { ficheId: f, outil: OUTIL, type, titre: 'Règles', audience: { joueursLisent: true },
    contenu: p.contenu, sourceVersion: p.sourceVersion, charge: p.charge });
  return { fiche: f, section: s.id as number, p };
}
const ligneTable = (db: Db, u: number, cle: string) => db.prepare('SELECT * FROM swn_fiches_generees WHERE univers_id = ? AND cle = ?').get(u, cle) as any;
const propositions = (db: Db, compte: number) => db.prepare('SELECT * FROM propositions WHERE demandeur_id = ? AND appliquee_le IS NULL').all(compte) as any[];
const canonniere = () => ({ catalogue: OUTIL, version: 'canonniere', exemples: [
  { cle: 'canonniere', nom: "Canonnière d'essai", coque: 'eclaireur', choix: [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1 }, { nature: 'armes', cle: 'lance-d-essai', quantite: 1 }] }] });

test('migration : sur un schéma précédent portant des lignes, la montée crée swn_fiches_generees sans les toucher', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-regles-'));
  const source = new URL('../../db/migrations/', import.meta.url);
  const numero = (f: string) => Number(f.slice(0, 4));
  const tous = readdirSync(source).filter((f) => /^\d{4}-.+\.sql$/.test(f));
  const [fichier] = tous.filter((f) => f.includes('swn-fiches-generees'));
  assert.ok(fichier);
  const n = numero(fichier!);
  const db = openDb(':memory:');
  for (const f of tous) if (numero(f) < n) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', 'x')").run();
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', 'x')").run();
  db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 1, 'lieu', 'L', '{}', 'x', 'x')").run();
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'swn_fiches_generees'").get(), undefined);
  migrate(db);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'swn_fiches_generees'").get());
  assert.equal((db.prepare('SELECT COUNT(*) n FROM fiches').get() as any).n, 1);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM swn_fiches_generees').get() as any).n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('verifierDeclaration accepte les huit sections ; produire(ctx).sourceVersion === versionSource(ctx) pour les sept', () => {
  verifierDeclaration(swn);
  const outil = swn.outils.find((x) => x.cle === OUTIL) as any;
  assert.deepEqual(outil.sections.map((s: any) => s.type), ['caracteristiques', ...TYPES]);
  for (const s of outil.sections.slice(1)) assert.deepEqual([s.usage, s.recalcul], ['generer', 'proposition']);
  assert.ok(outil.usages.some((u: any) => u.nom === 'generer' && u.mjSeul === true));
  const { db, u, antor } = monde();
  for (const t of TYPES) assert.equal(produire(db, u, antor, t).sourceVersion, vs(db, u, antor, t), t);
});

test('regles-armes pour Antor : les trois armes ; la lance masquée disparaît, même appelée par Antor ; aucun bloc :::mj', () => {
  const { db, u, antor, lea } = monde();
  const avant = produire(db, u, antor, 'regles-armes').contenu;
  assert.match(avant, /— 3 éléments/);
  for (const nom of ['Laser', 'Canon léger', "Lance d'essai (Univers)"]) assert.ok(avant.includes(nom), nom);
  assert.equal(avant, produire(db, u, lea, 'regles-armes').contenu, "Léa et Antor reçoivent le même texte");
  masquer(db, antor, u, 'armes', 'lance-d-essai');
  const apres = produire(db, u, antor, 'regles-armes').contenu;
  assert.ok(!apres.includes("Lance d'essai"));
  assert.match(apres, /— 2 éléments/);
  for (const t of TYPES) assert.ok(!produire(db, u, antor, t).contenu.includes(':::'), t);
});

test('regles-armes correspond à texteRegles(armes) des trois éléments résolus', () => {
  const { db, u, antor } = monde();
  const els = c.resoudreElements(db, u, OUTIL, 'armes', { inclureMasques: false }).map((r: any) => ({
    ...r.donnees, cle: r.cle, nom: r.nom, proprietaire: r.origine === 'univers' ? 'univers' : 'systeme' }));
  assert.equal(els.length, 3);
  assert.equal(produire(db, u, antor, 'regles-armes').contenu, texteRegles('armes', els as any));
});

test('exemples : huitième « Canonnière d\'essai » emporte la lance ; masquée, elle sort et les sept autres gardent leurs chiffres', () => {
  const { db, u, antor, lea } = monde();
  c.appliquerCatalogue(db, antor, { niveau: 'univers', id: u }, OUTIL, canonniere());
  const avant = produire(db, u, antor, 'exemples').contenu;
  assert.match(avant, /\*\*Exemples\*\* — 8/);
  assert.ok(avant.includes("### Canonnière d'essai"));
  masquer(db, antor, u, 'armes', 'lance-d-essai');
  const apres = produire(db, u, antor, 'exemples').contenu;
  assert.match(apres, /\*\*Exemples\*\* — 7/);
  assert.ok(!apres.includes('Canonnière'));
  assert.ok(!apres.includes("Lance d'essai"));
  assert.equal(apres, produire(db, u, lea, 'exemples').contenu);
  // mêmes chiffres que calculerDepuisChoix (V-11) : frégate de ligne 700 000 cr, éclaireur nu 25 000 cr
  assert.ok(apres.includes(`700${NB}000${NB}cr`));
  assert.ok(apres.includes(`25${NB}000${NB}cr`));
  const r = calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: [
    { nature: 'moteurs', cle: 'moteur-2', quantite: 1 }, { nature: 'amenagements', cle: 'cabines', quantite: 1 },
    { nature: 'amenagements', cle: 'soute', quantite: 1 }, { nature: 'armes', cle: 'laser', quantite: 2 }] }).resultat!;
  assert.equal(r.prix, 700000);
});

test('exemple dont une ligne est retirée du système : omis entier, sans trace', () => {
  const { db, u, antor } = monde();
  c.retirerElement(db, antor, u, OUTIL, 'moteurs', 'moteur-1', { retire: true });
  const t = produire(db, u, antor, 'exemples').contenu;
  assert.ok(!t.includes('Moteur 1'));
  assert.ok(!produire(db, u, antor, 'regles-moteurs').contenu.includes('Moteur 1'));
});

test('empreinte : change au masque de sa nature, pas à un second masque ni à un autre type ; exemples change pour toute nature', () => {
  const { db, u, antor } = monde();
  const v0 = Object.fromEntries(TYPES.map((t) => [t, vs(db, u, antor, t)]));
  masquer(db, antor, u, 'armes', 'lance-d-essai');
  const v1 = Object.fromEntries(TYPES.map((t) => [t, vs(db, u, antor, t)]));
  for (const t of TYPES) assert.equal(v1[t] !== v0[t], t === 'regles-armes' || t === 'exemples', t);
  // masquer deux fois (idempotent) ne bouge rien
  const ligne = c.lireCatalogueGestion(db, antor, u, OUTIL, { nature: 'armes' }).elements.find((e: any) => e.cle === 'lance-d-essai') as any;
  c.masquerElement(db, antor, u, OUTIL, 'armes', 'lance-d-essai', { masque: true, version: ligne.version });
  for (const t of TYPES) assert.equal(vs(db, u, antor, t), v1[t], `deux fois ${t}`);
  // retrait d'une clé du système puis rétablissement
  c.retirerElement(db, antor, u, OUTIL, 'moteurs', 'moteur-1', { retire: true });
  const v2 = Object.fromEntries(TYPES.map((t) => [t, vs(db, u, antor, t)]));
  for (const t of TYPES) assert.equal(v2[t] !== v1[t], t === 'regles-moteurs' || t === 'exemples', `retrait ${t}`);
  c.retirerElement(db, antor, u, OUTIL, 'moteurs', 'moteur-1', { retire: false });
  for (const t of TYPES) assert.equal(vs(db, u, antor, t), v1[t], `rétabli ${t}`);
  masquer(db, antor, u, 'armes', 'lance-d-essai', false);
  for (const t of TYPES) assert.equal(vs(db, u, antor, t), v0[t], `démasqué ${t}`);
});

test('portee_saut change la version de exemples, pas celle de regles-armes', () => {
  const { db, u, antor } = monde();
  const ex = vs(db, u, antor, 'exemples');
  const ar = vs(db, u, antor, 'regles-armes');
  const lu = o.lireLigneOutil(db, { niveau: 'univers', id: u }, 'swn')?.version_reglages ?? 0;
  o.poserReglages(db, antor, { niveau: 'univers', id: u }, 'swn', { version: lu, valeurs: { portee_saut: 7 } });
  assert.notEqual(vs(db, u, antor, 'exemples'), ex);
  assert.equal(vs(db, u, antor, 'regles-armes'), ar);
});

test('un masque d\'Antor propose une mise à jour pour lui, sur la section de la nature et les exemples seulement', () => {
  const { db, u, antor, roxane } = monde();
  const g = Object.fromEntries(['regles-armes', 'regles-moteurs', 'exemples'].map((t) => [t, generer(db, u, antor, t)]));
  assert.equal(propositions(db, antor.compteId).length, 0);
  masquer(db, antor, u, 'armes', 'lance-d-essai');
  const p = propositions(db, antor.compteId);
  assert.deepEqual(p.map((x) => x.section_id).sort(), [g['regles-armes']!.section, g['exemples']!.section].sort());
  assert.ok(!p.find((x) => x.section_id === g['regles-armes']!.section).contenu_propose.includes("Lance d'essai"));
  assert.equal(propositions(db, roxane.compteId).length, 0);
  // un geste sans effet n'en crée pas de nouvelle
  const n = db.prepare('SELECT COUNT(*) n FROM propositions').get() as any;
  const ligne = c.lireCatalogueGestion(db, antor, u, OUTIL, { nature: 'armes' }).elements.find((e: any) => e.cle === 'lance-d-essai') as any;
  c.masquerElement(db, antor, u, OUTIL, 'armes', 'lance-d-essai', { masque: true, version: ligne.version });
  assert.equal((db.prepare('SELECT COUNT(*) n FROM propositions').get() as any).n, n.n);
  // application : la ligne de la table suit
  const id = propositions(db, antor.compteId).find((x) => x.section_id === g['regles-armes']!.section).id;
  appliquerProposition(db, antor.compteId, u, id);
  assert.equal(ligneTable(db, u, 'regles-armes').source_version, vs(db, u, antor, 'regles-armes'));
});

test('un masque ne crée rien pour une section pas encore générée ; un retrait de clé du système propose aussi', () => {
  const { db, u, antor } = monde();
  masquer(db, antor, u, 'armes', 'lance-d-essai');
  assert.equal(propositions(db, antor.compteId).length, 0);
  const g = generer(db, u, antor, 'regles-moteurs');
  const e = generer(db, u, antor, 'exemples');
  c.retirerElement(db, antor, u, OUTIL, 'moteurs', 'moteur-2', { retire: true });
  assert.deepEqual(propositions(db, antor.compteId).map((x) => x.section_id).sort(), [g.section, e.section].sort());
});

test('poserSectionGeree : crée la ligne avec sa source_version, la réécriture la met à jour', () => {
  const { db, u, antor } = monde();
  const g = generer(db, u, antor, 'regles-armes');
  const l = ligneTable(db, u, 'regles-armes');
  assert.deepEqual([l.fiche_id, l.section_id, l.source_version], [g.fiche, g.section, g.p.sourceVersion]);
  masquer(db, antor, u, 'armes', 'lance-d-essai');
  const p = produire(db, u, antor, 'regles-armes');
  const v = (db.prepare('SELECT version FROM sections WHERE id = ?').get(g.section) as any).version;
  sg.poserSectionGeree(db, antor.compteId, u, { ficheId: g.fiche, outil: OUTIL, type: 'regles-armes', sectionId: g.section, version: v,
    contenu: p.contenu, sourceVersion: p.sourceVersion, charge: p.charge });
  assert.equal(ligneTable(db, u, 'regles-armes').source_version, p.sourceVersion);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM swn_fiches_generees WHERE cle = 'regles-armes'").get() as any).n, 1);
});

test('crochet qui lève : l\'écriture est annulée (charge sans clé)', () => {
  const { db, u, antor } = monde();
  const f = creerFiche(db, antor.compteId, u, { type: 'regle', titre: 'X', sections: [] }).id;
  const p = produire(db, u, antor, 'regles-armes');
  const avant = (db.prepare('SELECT COUNT(*) n FROM sections').get() as any).n;
  assert.ok(err(() => sg.poserSectionGeree(db, antor.compteId, u, { ficheId: f, outil: OUTIL, type: 'regles-armes', titre: 'R',
    contenu: p.contenu, sourceVersion: p.sourceVersion, charge: undefined })));
  assert.equal((db.prepare('SELECT COUNT(*) n FROM sections').get() as any).n, avant);
  assert.equal(ligneTable(db, u, 'regles-armes'), undefined);
});

test('un joueur qui pose une de ces sections : refuse (usage generer)', () => {
  const { db, u, antor, lea } = monde();
  const f = creerFiche(db, antor.compteId, u, { type: 'regle', titre: 'Y', sections: [] }).id;
  for (const t of TYPES) {
    const p = produire(db, u, antor, t);
    assert.equal(err(() => sg.poserSectionGeree(db, lea.compteId, u, { ficheId: f, outil: OUTIL, type: t, titre: 'R',
      contenu: p.contenu, sourceVersion: p.sourceVersion, charge: p.charge })).code, 'refuse', t);
  }
  assert.equal((db.prepare('SELECT COUNT(*) n FROM swn_fiches_generees').get() as any).n, 0);
});
