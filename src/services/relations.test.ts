import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { assurerCompte } from './comptes.js';
import { ErreurService } from './erreurs.js';
import { creerFiche, listerFiches } from './fiches.js';
import { ajouterMembre } from './membres.js';
import { lireRelations, relierSection, retirerRelation } from './relations.js';
import { ajouterSection, changerAudience, ecrireContenu, retirerSection } from './sections.js';
import { creerUnivers } from './univers.js';

function err(fn: () => unknown): ErreurService | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurService) return e;
    throw e;
  }
  return null;
}
const nb = (db: Db, t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n;

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const marc = assurerCompte(db, 'marc');
  const lea = assurerCompte(db, 'lea');
  const u = creerUnivers(db, marc.id, { nom: 'U' });
  const u2 = creerUnivers(db, marc.id, { nom: 'Autre' });
  ajouterMembre(db, marc.id, u.id, 'lea', 'joueur');
  const a = creerFiche(db, marc.id, u.id, { type: 'personnage', titre: 'Aldric', charge: { pj: false } });
  const b = creerFiche(db, marc.id, u.id, { type: 'lieu', titre: 'Château', charge: {} });
  const x = creerFiche(db, marc.id, u2.id, { type: 'lieu', titre: 'Ailleurs', charge: {} });
  const sa = ajouterSection(db, marc.id, u.id, a.id, { titre: 'Liens', contenu: 'x' });
  const sb = ajouterSection(db, marc.id, u.id, b.id, { titre: 'Pub', contenu: 'y' });
  return { db, marc, lea, u, u2, a, b, x, sa, sb };
}
const pub = (db: Db, m: number, u: number, f: number, s: number) =>
  changerAudience(db, m, u, f, s, { joueursLisent: true });

test('migration 0005 sur base 0001+0002 peuplée : relations, index remplis, idempotente', () => {
  const db = openDb(':memory:');
  const dir = new URL('../db/migrations/', import.meta.url).pathname;
  db.exec(readFileSync(`${dir}0001-premiere-fiche.sql`, 'utf8'));
  db.exec(readFileSync(`${dir}0002-systemes.sql`, 'utf8').toString());
  db.exec('CREATE TABLE migrations (numero INTEGER PRIMARY KEY, nom TEXT NOT NULL, applique_le TEXT NOT NULL)');
  db.exec("INSERT INTO migrations VALUES (1,'0001-premiere-fiche.sql','x'),(2,'0002-systemes.sql','x')");
  db.prepare("INSERT INTO univers (nom, cree_le) VALUES ('u','x')").run();
  db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1,'lieu','Épée','{}','x','x')").run();
  db.prepare(
    "INSERT INTO sections (fiche_id, titre, ordre, contenu, version, modifie_le) VALUES (1,'Histoire',1,'dragon ancien',1,'x')",
  ).run();
  assert.deepEqual(migrate(db), [3, 4, 5]);
  assert.equal(nb(db, 'relations'), 0);
  assert.equal(nb(db, 'recherche_fiches'), 1);
  assert.equal(nb(db, 'recherche_sections'), 1);
  assert.deepEqual(db.prepare("SELECT rowid FROM recherche_sections WHERE recherche_sections MATCH 'dragon'").all(), [{ rowid: 1 }]);
  assert.deepEqual(migrate(db), []);
  assert.equal(nb(db, 'recherche_fiches'), 1);
});

test('MJ relie une section à une fiche de l’univers ; lue par le MJ', () => {
  const { db, marc, u, a, b, sa } = monde();
  const r = relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type: 'habite' });
  assert.equal(r.type, 'habite');
  assert.equal(r.cible.id, b.id);
  assert.deepEqual(lireRelations(db, { compteId: marc.id }, u.id, a.id, sa.id).map((x) => [x.type, x.cible.titre]), [['habite', 'Château']]);
});

test('refus : joueur, inconnu, autre univers, soi-même, doublon, type — rien n’est écrit', () => {
  const { db, marc, lea, u, a, b, x, sa } = monde();
  assert.ok(err(() => relierSection(db, lea.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type: 't' })));
  assert.ok(err(() => relierSection(db, marc.id, u.id, a.id, 9999, { cibleFicheId: b.id, type: 't' })));
  assert.ok(err(() => relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: 9999, type: 't' })));
  assert.ok(err(() => relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: x.id, type: 't' })));
  assert.equal(err(() => relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: a.id, type: 't' }))?.detail, 'auto_relation');
  for (const type of ['', '   ', 'x'.repeat(81)]) {
    assert.equal(err(() => relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type }))?.code, 'invalide');
  }
  assert.equal(nb(db, 'relations'), 0);
  relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type: 'x'.repeat(80) });
  relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type: 'y' });
  const d = err(() => relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type: 'y' }));
  assert.equal(d?.code, 'conflit');
  assert.equal(d?.detail, 'relation_existante');
  assert.equal(nb(db, 'relations'), 2);
});

test('limite : 100 relations par section, la 101e refusée', () => {
  const { db, marc, u, a, sa } = monde();
  for (let i = 0; i < 100; i++) {
    const f = creerFiche(db, marc.id, u.id, { type: 'lieu', titre: `L${i}`, charge: {} });
    relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: f.id, type: 'r' });
  }
  const f = creerFiche(db, marc.id, u.id, { type: 'lieu', titre: 'Dernier', charge: {} });
  const e = err(() => relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: f.id, type: 'r' }));
  assert.equal(e?.code, 'conflit');
  assert.equal(e?.detail, 'limite_relations');
  assert.equal(nb(db, 'relations'), 100);
});

test('deux gardes : section et cible lisibles, sans trace ni compte des autres', () => {
  const { db, marc, lea, u, a, b, sa, sb } = monde();
  const c = creerFiche(db, marc.id, u.id, { type: 'lieu', titre: 'Secret', charge: {} });
  ajouterSection(db, marc.id, u.id, c.id, { titre: 'S', contenu: 'z' });
  relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type: 'vers-b' });
  relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: c.id, type: 'vers-c' });
  const L = { compteId: lea.id };
  // section carrying not readable → not found
  assert.ok(err(() => lireRelations(db, L, u.id, a.id, sa.id)));
  pub(db, marc.id, u.id, a.id, sa.id);
  // target b unreadable still
  assert.deepEqual(lireRelations(db, L, u.id, a.id, sa.id), []);
  pub(db, marc.id, u.id, b.id, sb.id);
  assert.deepEqual(lireRelations(db, L, u.id, a.id, sa.id).map((r) => r.type), ['vers-b']);
  // GM in player mode: same as player
  assert.deepEqual(lireRelations(db, { compteId: marc.id, modeJoueur: true }, u.id, a.id, sa.id).map((r) => r.type), ['vers-b']);
  assert.deepEqual(lireRelations(db, { compteId: marc.id }, u.id, a.id, sa.id).map((r) => r.type), ['vers-b', 'vers-c']);
});

test('retirer une relation : MJ seulement ; retirer une section retire ses relations', () => {
  const { db, marc, lea, u, u2, a, b, sa } = monde();
  const r = relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type: 't' });
  assert.ok(err(() => retirerRelation(db, lea.id, u.id, r.id)));
  assert.ok(err(() => retirerRelation(db, marc.id, u2.id, r.id)));
  assert.equal(nb(db, 'relations'), 1);
  retirerRelation(db, marc.id, u.id, r.id);
  assert.equal(nb(db, 'relations'), 0);
  relierSection(db, marc.id, u.id, a.id, sa.id, { cibleFicheId: b.id, type: 't' });
  retirerSection(db, marc.id, u.id, a.id, sa.id);
  assert.equal(nb(db, 'relations'), 0);
});

const titres = (db: Db, acteur: { compteId: number; modeJoueur?: boolean }, u: number, recherche: string, type?: string) =>
  listerFiches(db, acteur, u, { recherche, type }).fiches.map((f) => f.titre);

test('recherche : titre, début de mot, casse, accents, tous les mots, ordre de la liste', () => {
  const { db, marc, u, a, b } = monde();
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'ald'), ['Aldric']);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'CHATEAU'), ['Château']);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'dric'), []);
  creerFiche(db, marc.id, u.id, { type: 'personnage', titre: 'Aldo Rémy', charge: { pj: false } });
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'ald'), ['Aldo Rémy', 'Aldric']);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'ald remy'), ['Aldo Rémy']);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'ald', 'lieu'), []);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'chat', 'lieu'), ['Château']);
  void a; void b;
});

test('recherche : contenu de section lue seulement ; reflet immédiat des modifications', () => {
  const { db, marc, lea, u, a, b, sa, sb } = monde();
  const L = { compteId: lea.id };
  pub(db, marc.id, u.id, b.id, sb.id);
  ecrireContenu(db, marc.id, u.id, a.id, sa.id, 'le traître Mordrain', 1);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'mordrain'), ['Aldric']);
  assert.deepEqual(titres(db, L, u.id, 'mordrain'), []);
  // sheet readable via another section, but the word is in an unreadable one
  const s2 = ajouterSection(db, marc.id, u.id, a.id, { titre: 'Pub', contenu: 'rien' });
  pub(db, marc.id, u.id, a.id, s2.id);
  assert.deepEqual(titres(db, L, u.id, 'mordrain'), []);
  assert.deepEqual(titres(db, L, u.id, 'traître mordrain'), []);
  // mode joueur du MJ
  assert.deepEqual(titres(db, { compteId: marc.id, modeJoueur: true }, u.id, 'mordrain'), []);
  // content change reflected
  pub(db, marc.id, u.id, a.id, sa.id);
  assert.deepEqual(titres(db, L, u.id, 'mordrain'), ['Aldric']);
  ecrireContenu(db, marc.id, u.id, a.id, sa.id, 'autre chose', 2);
  assert.deepEqual(titres(db, L, u.id, 'mordrain'), []);
  assert.deepEqual(titres(db, L, u.id, 'chose'), ['Aldric']);
  // section title matched, then section removed
  assert.deepEqual(titres(db, L, u.id, 'liens'), ['Aldric']);
  retirerSection(db, marc.id, u.id, a.id, sa.id);
  assert.deepEqual(titres(db, L, u.id, 'liens'), []);
  assert.deepEqual(titres(db, L, u.id, 'chose'), []);
});

test('recherche : un mot du titre d’une fiche non lisible ne fuit pas', () => {
  const { db, marc, lea, u } = monde();
  assert.deepEqual(titres(db, { compteId: lea.id }, u.id, 'aldric'), []);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'aldric'), ['Aldric']);
});

test('recherche : saisies hostiles sans erreur ni fuite ; vide et trop longue refusées', () => {
  const { db, marc, lea, u } = monde();
  for (const s of ['"', '*', '-', 'NEAR(a b)', 'AND', 'OR', 'NOT', 'a\0b', '"ald', 'ald*', '(', 'title:ald', '^ald', 'ald -x', '""']) {
    assert.ok(Array.isArray(titres(db, { compteId: lea.id }, u.id, s)), s);
    assert.deepEqual(titres(db, { compteId: lea.id }, u.id, s), [], s);
    titres(db, { compteId: marc.id }, u.id, s);
  }
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'a\0ld'), []);
  assert.equal(err(() => titres(db, { compteId: marc.id }, u.id, ''))?.code, 'invalide');
  assert.equal(err(() => titres(db, { compteId: marc.id }, u.id, '   '))?.code, 'invalide');
  assert.equal(err(() => titres(db, { compteId: marc.id }, u.id, 'a'.repeat(101)))?.code, 'invalide');
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'a'.repeat(100)), []);
});

test('titre de fiche modifié reflété dans l’index', () => {
  const { db, marc, u, a } = monde();
  db.prepare("UPDATE fiches SET titre = 'Zorg' WHERE id = ?").run(a.id);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'zorg'), ['Zorg']);
  assert.deepEqual(titres(db, { compteId: marc.id }, u.id, 'aldric'), []);
});
