import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { assurerCompte } from './comptes.js';
import { ErreurService } from './erreurs.js';
import { creerFiche, lireFiche, listerFiches } from './fiches.js';
import { ajouterMembre, changerRole, retirerMembre } from './membres.js';
import {
  ajouterSection,
  changerAudience,
  ecrireContenu,
  lireSection,
  reordonnerSections,
  retirerSection,
} from './sections.js';
import { creerUnivers, lireUnivers, listerUnivers } from './univers.js';

function base(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurService) return e.code;
    throw e;
  }
  return 'aucune';
}

/** MJ Marc, joueuse Léa, étrangère Zoé (aucun rôle), un univers, une fiche, deux sections. */
function monde() {
  const db = base();
  const marc = assurerCompte(db, 'marc');
  const lea = assurerCompte(db, 'lea');
  const zoe = assurerCompte(db, 'zoe');
  const u = creerUnivers(db, marc.id, { nom: 'Lame d’Ébène' });
  ajouterMembre(db, marc.id, u.id, 'lea', 'joueur');
  const f = creerFiche(db, marc.id, u.id, { type: 'personnage', titre: 'Aldric', charge: { pj: false } });
  const pub = ajouterSection(db, marc.id, u.id, f.id, { titre: 'Apparence', contenu: 'Grand' });
  const sec = ajouterSection(db, marc.id, u.id, f.id, { titre: 'Vérité', contenu: 'Traître' });
  return { db, marc, lea, zoe, u, f, pub, sec };
}

test('migration: tables, sept types, clés étrangères, idempotente', () => {
  const db = openDb(':memory:');
  assert.deepEqual(migrate(db), [1, 2]);
  assert.deepEqual(migrate(db), []);
  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations' ORDER BY name").all() as { name: string }[]
  ).map((r) => r.name);
  assert.deepEqual(tables, ['comptes', 'fiches', 'gabarits', 'membres', 'sections', 'systemes_jeu', 'univers']);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.equal((db.prepare('SELECT count(*) n FROM migrations').get() as { n: number }).n, 2);
  assert.throws(() => db.prepare("INSERT INTO membres VALUES (99, 99, 'mj')").run());
  db.prepare("INSERT INTO univers (nom, cree_le) VALUES ('u', 'x')").run();
  for (const t of ['personnage', 'lieu', 'faction', 'objet', 'evenement', 'quete', 'compte_rendu']) {
    db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, ?, 't', '{\"v\":1}', 'x', 'x')").run(t);
  }
  assert.throws(() =>
    db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 'carte', 't', '{}', 'x', 'x')").run(),
  );
});

test('migration: seconde exécution ne change pas les données', () => {
  const { db } = monde();
  assert.deepEqual(migrate(db), []);
  assert.equal((db.prepare('SELECT count(*) n FROM fiches').get() as { n: number }).n, 1);
});

test('compte sans rôle : aucune lecture d’univers, de fiche ni de section', () => {
  const { db, zoe, u, f, pub } = monde();
  assert.deepEqual(listerUnivers(db, zoe.id), []);
  assert.equal(code(() => lireUnivers(db, zoe.id, u.id)), 'introuvable');
  assert.equal(code(() => lireFiche(db, { compteId: zoe.id }, u.id, f.id)), 'introuvable');
  assert.equal(code(() => listerFiches(db, { compteId: zoe.id }, u.id)), 'introuvable');
  assert.equal(code(() => lireSection(db, { compteId: zoe.id }, u.id, f.id, pub.id)), 'introuvable');
});

test('joueur ne voit que les sections ouvertes à la lecture des joueurs', () => {
  const { db, marc, lea, u, f, pub } = monde();
  const L = { compteId: lea.id };
  assert.equal(code(() => lireFiche(db, L, u.id, f.id)), 'introuvable'); // tout fermé
  assert.equal(listerFiches(db, L, u.id).fiches.length, 0);
  changerAudience(db, marc.id, u.id, f.id, pub.id, { joueursLisent: true });
  const vue = lireFiche(db, L, u.id, f.id);
  assert.deepEqual(vue.sections.map((s) => s.titre), ['Apparence']);
  assert.equal(vue.sections[0].audience, undefined);
  assert.equal(listerFiches(db, L, u.id).fiches.length, 1);
  assert.equal(lireFiche(db, { compteId: marc.id }, u.id, f.id).sections.length, 2);
});

test('lecture de l’auteur : seul l’auteur lit, pas un autre joueur', () => {
  const { db, marc, lea, u, f, sec } = monde();
  const jo = assurerCompte(db, 'jo');
  ajouterMembre(db, marc.id, u.id, 'jo', 'joueur');
  changerAudience(db, marc.id, u.id, f.id, sec.id, { auteurId: lea.id, auteurLit: true });
  assert.equal(lireSection(db, { compteId: lea.id }, u.id, f.id, sec.id).contenu, 'Traître');
  assert.equal(code(() => lireSection(db, { compteId: jo.id }, u.id, f.id, sec.id)), 'introuvable');
  // le mode Joueur : le MJ ou l’auteur lit comme un non-auteur
  assert.equal(code(() => lireSection(db, { compteId: lea.id, modeJoueur: true }, u.id, f.id, sec.id)), 'introuvable');
  assert.equal(code(() => lireFiche(db, { compteId: lea.id, modeJoueur: true }, u.id, f.id)), 'introuvable');
  assert.equal(listerFiches(db, { compteId: lea.id, modeJoueur: true }, u.id).fiches.length, 0);
});

test('mode Joueur du MJ : rend ce que rend un joueur non auteur', () => {
  const { db, marc, u, f, pub, sec } = monde();
  const M = { compteId: marc.id, modeJoueur: true };
  assert.equal(code(() => lireFiche(db, M, u.id, f.id)), 'introuvable');
  assert.equal(listerFiches(db, M, u.id).fiches.length, 0);
  changerAudience(db, marc.id, u.id, f.id, pub.id, { joueursLisent: true });
  const vue = lireFiche(db, M, u.id, f.id);
  assert.deepEqual(vue.sections.map((s) => s.id), [pub.id]);
  assert.equal(vue.sections[0].audience, undefined);
  assert.equal(vue.sections[0].peutEcrire, false);
  assert.equal(code(() => lireSection(db, M, u.id, f.id, sec.id)), 'introuvable');
});

test('écriture : joueurs, auteur, MJ toujours ; sinon refusé', () => {
  const { db, marc, lea, u, f, pub, sec } = monde();
  const jo = assurerCompte(db, 'jo');
  ajouterMembre(db, marc.id, u.id, 'jo', 'joueur');
  // section lisible mais non inscriptible : refus, contenu intact
  changerAudience(db, marc.id, u.id, f.id, pub.id, { joueursLisent: true });
  assert.equal(code(() => ecrireContenu(db, lea.id, u.id, f.id, pub.id, 'X', 1)), 'refuse');
  assert.equal(lireSection(db, { compteId: marc.id }, u.id, f.id, pub.id).contenu, 'Grand');
  // section cachée : introuvable
  assert.equal(code(() => ecrireContenu(db, lea.id, u.id, f.id, sec.id, 'X', 1)), 'introuvable');
  // écriture des joueurs
  changerAudience(db, marc.id, u.id, f.id, pub.id, { joueursEcrivent: true });
  assert.equal(ecrireContenu(db, jo.id, u.id, f.id, pub.id, 'Par jo', 1).contenu, 'Par jo');
  // écriture de l'auteur seul
  changerAudience(db, marc.id, u.id, f.id, sec.id, { auteurId: lea.id, auteurLit: true, auteurEcrit: true });
  assert.equal(ecrireContenu(db, lea.id, u.id, f.id, sec.id, 'Par lea', 1).contenu, 'Par lea');
  assert.notEqual(code(() => ecrireContenu(db, jo.id, u.id, f.id, sec.id, 'Par jo', 2)), 'aucune');
  // le MJ écrit toujours, même section fermée
  changerAudience(db, marc.id, u.id, f.id, sec.id, { auteurEcrit: false, auteurLit: false });
  assert.equal(ecrireContenu(db, marc.id, u.id, f.id, sec.id, 'Par marc', 2).contenu, 'Par marc');
  assert.equal(code(() => ecrireContenu(db, lea.id, u.id, f.id, sec.id, 'Y', 3)), 'introuvable');
});

test('compte sans rôle ne peut rien écrire', () => {
  const { db, zoe, u, f, pub } = monde();
  assert.equal(code(() => ecrireContenu(db, zoe.id, u.id, f.id, pub.id, 'X', 1)), 'introuvable');
  assert.equal(code(() => creerFiche(db, zoe.id, u.id, { type: 'lieu', titre: 'Z' })), 'introuvable');
  assert.equal(code(() => ajouterSection(db, zoe.id, u.id, f.id, { titre: 'Z' })), 'introuvable');
});

test('joueur ne peut pas créer fiche, section, ni changer l’audience', () => {
  const { db, lea, u, f, pub } = monde();
  assert.equal(code(() => creerFiche(db, lea.id, u.id, { type: 'lieu', titre: 'Z' })), 'refuse');
  assert.equal(code(() => ajouterSection(db, lea.id, u.id, f.id, { titre: 'Z' })), 'refuse');
  assert.equal(code(() => changerAudience(db, lea.id, u.id, f.id, pub.id, { joueursLisent: true })), 'refuse');
  assert.equal(code(() => ajouterMembre(db, lea.id, u.id, 'zoe', 'joueur')), 'refuse');
});

test('auteur : doit être Joueur de l’univers (ni MJ, ni étranger, ni inconnu)', () => {
  const { db, marc, zoe, u, f, pub } = monde();
  for (const id of [marc.id, zoe.id, 9999]) {
    assert.equal(code(() => changerAudience(db, marc.id, u.id, f.id, pub.id, { auteurId: id })), 'invalide');
  }
  assert.equal(lireSection(db, { compteId: marc.id }, u.id, f.id, pub.id).audience!.auteurId, null);
});

test('section naît fermée : quatre bascules à faux, sans auteur', () => {
  const { db, marc, u, f, pub } = monde();
  assert.deepEqual(lireSection(db, { compteId: marc.id }, u.id, f.id, pub.id).audience, {
    joueursLisent: false,
    joueursEcrivent: false,
    auteurId: null,
    auteurLit: false,
    auteurEcrit: false,
  });
  assert.equal(pub.version, 1);
});

test('ajout d’un compte jamais connecté refusé avec la raison exacte', () => {
  const { db, marc, u } = monde();
  try {
    ajouterMembre(db, marc.id, u.id, 'fantome', 'joueur');
    assert.fail('devait refuser');
  } catch (e) {
    assert.ok(e instanceof ErreurService);
    assert.equal(e.message, 'Ce compte ne s\'est jamais connecté.');
  }
  assert.equal(
    (db.prepare('SELECT count(*) n FROM membres WHERE univers_id = ?').get(u.id) as { n: number }).n,
    2,
  );
});

test('seul MJ : ni retiré ni rétrogradé, avec la raison ; avec deux MJ c’est permis', () => {
  const { db, marc, lea, u } = monde();
  for (const fn of [
    () => retirerMembre(db, marc.id, u.id, marc.id),
    () => changerRole(db, marc.id, u.id, marc.id, 'joueur'),
  ]) {
    try {
      fn();
      assert.fail('devait refuser');
    } catch (e) {
      assert.ok(e instanceof ErreurService);
      assert.equal(e.code, 'invalide');
      assert.match(e.message, /au moins un MJ/);
    }
  }
  changerRole(db, marc.id, u.id, lea.id, 'mj');
  changerRole(db, marc.id, u.id, marc.id, 'joueur');
  // Léa est maintenant la seule MJ
  assert.equal(code(() => retirerMembre(db, lea.id, u.id, lea.id)), 'invalide');
  retirerMembre(db, lea.id, u.id, marc.id);
});

test('retirer un membre efface son auteur_id', () => {
  const { db, marc, lea, u, f, sec } = monde();
  changerAudience(db, marc.id, u.id, f.id, sec.id, { auteurId: lea.id, auteurLit: true, auteurEcrit: true });
  retirerMembre(db, marc.id, u.id, lea.id);
  const a = lireSection(db, { compteId: marc.id }, u.id, f.id, sec.id).audience!;
  assert.equal(a.auteurId, null);
  assert.equal(a.auteurLit, false);
  assert.equal(a.auteurEcrit, false);
});

test('version périmée : refus, rien d’écrit ; version courante : incrémente', () => {
  const { db, marc, u, f, pub } = monde();
  const v2 = ecrireContenu(db, marc.id, u.id, f.id, pub.id, 'Un', 1);
  assert.equal(v2.version, 2);
  const avant = db.prepare('SELECT modifie_le FROM fiches WHERE id = ?').get(f.id);
  try {
    ecrireContenu(db, marc.id, u.id, f.id, pub.id, 'Deux', 1);
    assert.fail('devait refuser');
  } catch (e) {
    assert.ok(e instanceof ErreurService);
    assert.equal(e.code, 'conflit');
  }
  const s = lireSection(db, { compteId: marc.id }, u.id, f.id, pub.id);
  assert.equal(s.contenu, 'Un');
  assert.equal(s.version, 2);
  assert.deepEqual(db.prepare('SELECT modifie_le FROM fiches WHERE id = ?').get(f.id), avant);
  assert.equal(code(() => ecrireContenu(db, marc.id, u.id, f.id, pub.id, 'Futur', 3)), 'conflit');
  assert.equal(ecrireContenu(db, marc.id, u.id, f.id, pub.id, 'Trois', 2).version, 3);
});

test('une fiche ou une section d’un autre univers n’existe pas ici', () => {
  const { db, marc, u, f, pub } = monde();
  const u2 = creerUnivers(db, marc.id, { nom: 'Autre' });
  assert.equal(code(() => lireFiche(db, { compteId: marc.id }, u2.id, f.id)), 'introuvable');
  assert.equal(code(() => ecrireContenu(db, marc.id, u2.id, f.id, pub.id, 'X', 1)), 'introuvable');
  assert.equal(lireUnivers(db, marc.id, u.id).role, 'mj');
});

test('retirer / réordonner les sections renumérote de 1 à n', () => {
  const { db, marc, u, f, pub, sec } = monde();
  const c = ajouterSection(db, marc.id, u.id, f.id, { titre: 'Trois' });
  reordonnerSections(db, marc.id, u.id, f.id, [c.id, pub.id, sec.id]);
  const ordres = () =>
    lireFiche(db, { compteId: marc.id }, u.id, f.id).sections.map((s) => [s.id, s.ordre]);
  assert.deepEqual(ordres(), [[c.id, 1], [pub.id, 2], [sec.id, 3]]);
  assert.equal(code(() => reordonnerSections(db, marc.id, u.id, f.id, [c.id, pub.id])), 'invalide');
  retirerSection(db, marc.id, u.id, f.id, pub.id);
  assert.deepEqual(ordres(), [[c.id, 1], [sec.id, 2]]);
});

test('création : titre et type validés, charge par type', () => {
  const { db, marc, u } = monde();
  assert.equal(code(() => creerFiche(db, marc.id, u.id, { type: 'carte', titre: 'X' })), 'invalide');
  assert.equal(code(() => creerFiche(db, marc.id, u.id, { type: 'lieu', titre: '  ' })), 'invalide');
  assert.equal(code(() => creerFiche(db, marc.id, u.id, { type: 'lieu', titre: 'x'.repeat(121) })), 'invalide');
  assert.equal(creerFiche(db, marc.id, u.id, { type: 'lieu', titre: 'x'.repeat(120) }).titre.length, 120);
  assert.equal(code(() => creerUnivers(db, marc.id, { nom: 'x'.repeat(81) })), 'invalide');
  assert.deepEqual(creerFiche(db, marc.id, u.id, { type: 'lieu', titre: 'Ville' }).charge, { v: 1 });
  assert.deepEqual(creerFiche(db, marc.id, u.id, { type: 'personnage', titre: 'P', charge: { pj: true } }).charge, { v: 1, pj: true });
});

test('un nouveau compte n’a aucun univers ; le créateur devient MJ', () => {
  const db = base();
  const a = assurerCompte(db, 'ana');
  assert.deepEqual(listerUnivers(db, a.id), []);
  const u = creerUnivers(db, a.id, { nom: 'Mon univers' });
  assert.equal(listerUnivers(db, a.id)[0].role, 'mj');
  assert.equal(assurerCompte(db, 'ana').id, a.id);
  assert.equal(u.nom, 'Mon univers');
});
