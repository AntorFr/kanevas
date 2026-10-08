import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { changerStatutCampagne, creerCampagne, listerCampagnes } from './campagnes.js';
import { assurerCompte } from './comptes.js';
import { creerCompteRendu, listerComptesRendus } from './comptes_rendus.js';
import { ErreurService } from './erreurs.js';
import { creerFiche } from './fiches.js';
import { ajouterMembre } from './membres.js';
import { ajouterTache, cocherTache, listerTaches } from './preparation.js';
import { creerScenario, ecrireScenario, lireScenario, listerScenarios } from './scenarios.js';
import { creerUnivers } from './univers.js';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurService) return e.code;
    throw e;
  }
  assert.fail('aucune erreur levée');
}
const n = (db: Db, t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n;

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const marc = assurerCompte(db, 'marc'); // MJ u1
  const lea = assurerCompte(db, 'lea'); // joueur u1
  const paul = assurerCompte(db, 'paul'); // MJ u2
  const u1 = creerUnivers(db, marc.id, { nom: 'U1' });
  const u2 = creerUnivers(db, paul.id, { nom: 'U2' });
  ajouterMembre(db, marc.id, u1.id, 'lea', 'joueur');
  const c1 = creerCampagne(db, marc.id, u1.id, { nom: 'Camp 1' });
  const c2 = creerCampagne(db, paul.id, u2.id, { nom: 'Camp 2' });
  return { db, marc, lea, paul, u1, u2, c1, c2 };
}

test('migration 0003 : base à jour de 0002, tables créées, seconde exécution sans effet', () => {
  const db = openDb(':memory:');
  const dir = new URL('../db/migrations/', import.meta.url).pathname;
  db.exec(readFileSync(`${dir}0001-premiere-fiche.sql`, 'utf8'));
  db.exec('CREATE TABLE migrations (numero INTEGER PRIMARY KEY, nom TEXT NOT NULL, applique_le TEXT NOT NULL)');
  db.exec("INSERT INTO migrations VALUES (1,'0001-premiere-fiche.sql','x')");
  assert.deepEqual(migrate(db), [2, 3, 4, 5, 6]);
  for (const t of ['campagnes', 'scenarios', 'taches_preparation']) assert.equal(n(db, t), 0);
  assert.deepEqual(migrate(db), []);
});

test('contraintes SQL : statut, catégorie, cohérence faite / faite_le', () => {
  const { db, c1, u1 } = monde();
  assert.throws(() => db.prepare("INSERT INTO campagnes (univers_id, nom, statut, cree_le) VALUES (?, 'x', 'zzz', 'x')").run(u1.id));
  assert.throws(() => db.prepare("INSERT INTO taches_preparation (campagne_id, categorie, libelle, cree_le) VALUES (?, 'zzz', 'x', 'x')").run(c1.id));
  assert.throws(() => db.prepare("INSERT INTO taches_preparation (campagne_id, categorie, libelle, faite, cree_le) VALUES (?, 'pnj', 'x', 1, 'x')").run(c1.id));
  assert.throws(() => db.prepare("INSERT INTO scenarios (campagne_id, titre, contenu, cree_le, modifie_le) VALUES (?, 'x', ?, 'x', 'x')").run(c1.id, 'a'.repeat(20001)));
});

test('campagne : En préparation, nom 1–80, plusieurs Active sans toucher aux autres', () => {
  const { db, marc, lea, u1, u2, c1, c2 } = monde();
  assert.equal(c1.statut, 'en_preparation');
  assert.equal(code(() => creerCampagne(db, marc.id, u1.id, { nom: '' })), 'invalide');
  assert.equal(code(() => creerCampagne(db, marc.id, u1.id, { nom: 'x'.repeat(81) })), 'invalide');
  creerCampagne(db, marc.id, u1.id, { nom: 'x'.repeat(80) });
  assert.notEqual(code(() => creerCampagne(db, lea.id, u1.id, { nom: 'J' })), undefined);
  assert.notEqual(code(() => creerCampagne(db, marc.id, u2.id, { nom: 'Etranger' })), undefined);
  const c3 = creerCampagne(db, marc.id, u1.id, { nom: 'Camp 3' });
  changerStatutCampagne(db, marc.id, c1.id, 'active');
  changerStatutCampagne(db, marc.id, c3.id, 'active');
  const l = listerCampagnes(db, lea.id, u1.id);
  assert.equal(l.filter((c) => c.statut === 'active').length, 2);
  assert.equal(l.find((c) => c.nom === 'x'.repeat(80))!.statut, 'en_preparation');
  assert.equal(listerCampagnes(db, (assurerCompte(db, 'paul')).id, u2.id)[0]!.statut, 'en_preparation');
  assert.equal(c2.statut, 'en_preparation');
  assert.equal(code(() => changerStatutCampagne(db, lea.id, c1.id, 'terminee')), 'introuvable');
  assert.equal(code(() => changerStatutCampagne(db, marc.id, c1.id, 'bof')), 'invalide');
  assert.equal(code(() => changerStatutCampagne(db, marc.id, c2.id, 'active')), 'introuvable');
});

test('scénarios : Joueur, MJ étranger et id inconnu reçoivent la même réponse, rien écrit', () => {
  const { db, marc, lea, paul, c1 } = monde();
  const s = creerScenario(db, marc.id, c1.id, { titre: 'Acte 1', contenu: 'a' });
  assert.equal(s.version, 1);
  const refus = code(() => lireScenario(db, 99999, 99999));
  for (const who of [lea.id, paul.id]) {
    assert.equal(code(() => lireScenario(db, who, s.id)), refus);
    assert.equal(code(() => listerScenarios(db, who, c1.id)), refus);
    assert.equal(code(() => creerScenario(db, who, c1.id, { titre: 'x' })), refus);
    assert.equal(code(() => ecrireScenario(db, who, s.id, { titre: 'H', contenu: 'H' }, 1)), refus);
  }
  assert.equal(code(() => listerScenarios(db, marc.id, 99999)), refus);
  assert.equal(code(() => creerScenario(db, lea.id, 99999, { titre: 'x' })), refus);
  assert.equal(n(db, 'scenarios'), 1);
  assert.equal(lireScenario(db, marc.id, s.id).contenu, 'a');
});

test('scénarios : bornes titre/contenu et version', () => {
  const { db, marc, c1 } = monde();
  assert.equal(code(() => creerScenario(db, marc.id, c1.id, { titre: '' })), 'invalide');
  assert.equal(code(() => creerScenario(db, marc.id, c1.id, { titre: 'x'.repeat(121) })), 'invalide');
  assert.equal(code(() => creerScenario(db, marc.id, c1.id, { titre: 'x', contenu: 'a'.repeat(20001) })), 'invalide');
  assert.equal(n(db, 'scenarios'), 0);
  const s = creerScenario(db, marc.id, c1.id, { titre: 'x'.repeat(120), contenu: 'a'.repeat(20000) });
  assert.equal(code(() => ecrireScenario(db, marc.id, s.id, { titre: '', contenu: 'b' }, 1)), 'invalide');
  assert.equal(code(() => ecrireScenario(db, marc.id, s.id, { titre: 't', contenu: 'a'.repeat(20001) }, 1)), 'invalide');
  const v2 = ecrireScenario(db, marc.id, s.id, { titre: 't', contenu: 'b' }, 1);
  assert.equal(v2.version, 2);
  // stale version: conflict, nothing written
  const e = (() => {
    try {
      ecrireScenario(db, marc.id, s.id, { titre: 'périmé', contenu: 'périmé' }, 1);
    } catch (x) {
      return x as ErreurService;
    }
    return assert.fail('pas de conflit');
  })();
  assert.equal(e.code, 'conflit');
  const apres = lireScenario(db, marc.id, s.id);
  assert.deepEqual([apres.titre, apres.contenu, apres.version], ['t', 'b', 2]);
  // future version too
  assert.equal(code(() => ecrireScenario(db, marc.id, s.id, { titre: 'f', contenu: 'f' }, 3)), 'conflit');
  assert.equal(lireScenario(db, marc.id, s.id).version, 2);
});

test('tâches : droits, validation, coche datée et vidée à la décoche', () => {
  const { db, marc, lea, paul, c1 } = monde();
  const t = ajouterTache(db, marc.id, c1.id, { categorie: 'pnj', libelle: 'Le forgeron' });
  assert.equal(t.faite, false);
  assert.equal(t.faiteLe, null);
  const refus = code(() => cocherTache(db, 99999, 99999, true));
  for (const who of [lea.id, paul.id]) {
    assert.equal(code(() => ajouterTache(db, who, c1.id, { categorie: 'pnj', libelle: 'x' })), refus);
    assert.equal(code(() => listerTaches(db, who, c1.id)), refus);
    assert.equal(code(() => cocherTache(db, who, t.id, true)), refus);
  }
  assert.equal(n(db, 'taches_preparation'), 1);
  assert.equal(listerTaches(db, marc.id, c1.id)[0]!.faite, false);
  assert.equal(code(() => ajouterTache(db, marc.id, c1.id, { categorie: 'zzz', libelle: 'x' })), 'invalide');
  assert.equal(code(() => ajouterTache(db, marc.id, c1.id, { categorie: 'pnj', libelle: '' })), 'invalide');
  assert.equal(code(() => ajouterTache(db, marc.id, c1.id, { categorie: 'pnj', libelle: 'x'.repeat(201) })), 'invalide');
  for (const c of ['monstres', 'pnj', 'cartes', 'deroulements', 'autre']) {
    ajouterTache(db, marc.id, c1.id, { categorie: c, libelle: 'x'.repeat(200) });
  }
  const f = cocherTache(db, marc.id, t.id, true);
  assert.equal(f.faite, true);
  assert.ok(f.faiteLe && !Number.isNaN(Date.parse(f.faiteLe)));
  const d = cocherTache(db, marc.id, t.id, false);
  assert.equal(d.faite, false);
  assert.equal(d.faiteLe, null);
  assert.equal(db.prepare('SELECT faite_le FROM taches_preparation WHERE id = ?').get(t.id)!['faite_le' as never], null);
});

test('compte-rendu : Joueur et MJ, section et auteur, une transaction', () => {
  const { db, marc, lea, c1 } = monde();
  const fj = creerCompteRendu(db, lea.id, c1.universId, c1.id, { titre: 'Séance 1', texte: 'Il pleuvait' });
  assert.equal(fj.type, 'compte_rendu');
  const fm = creerCompteRendu(db, marc.id, c1.universId, c1.id, { titre: 'Séance 2', texte: 'MJ' });
  const rows = db.prepare('SELECT * FROM sections ORDER BY fiche_id').all() as Record<string, number | string | null>[];
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.titre, 'Compte-rendu');
    assert.equal(r.joueurs_lisent, 1);
    assert.equal(r.joueurs_ecrivent, 0);
  }
  assert.deepEqual([rows[0]!.auteur_id, rows[0]!.auteur_lit, rows[0]!.auteur_ecrit], [lea.id, 1, 1]);
  assert.equal(rows[1]!.auteur_id, null);
  assert.equal(JSON.parse((db.prepare('SELECT charge FROM fiches WHERE id = ?').get(fm.id) as { charge: string }).charge).campagne_id, c1.id);
});

test('compte-rendu : campagne d’un autre univers ou inconnue, titre invalide → rien écrit', () => {
  const { db, marc, lea, c1, c2, u1, u2 } = monde();
  for (const who of [lea.id, marc.id]) {
    assert.equal(code(() => creerCompteRendu(db, who, u1.id, c2.id, { titre: 'x' })), 'introuvable');
    assert.equal(code(() => creerCompteRendu(db, who, u1.id, 99999, { titre: 'x' })), 'introuvable');
  }
  assert.notEqual(code(() => creerCompteRendu(db, marc.id, u2.id, c1.id, { titre: 'x' })), undefined);
  assert.equal(code(() => creerCompteRendu(db, lea.id, u1.id, c1.id, { titre: '' })), 'invalide');
  assert.equal(code(() => creerCompteRendu(db, lea.id, u1.id, c1.id, { titre: 'x', texte: 'a'.repeat(20001) })), 'invalide');
  assert.equal(n(db, 'fiches'), 0);
  assert.equal(n(db, 'sections'), 0);
  // second write fails → first rolled back
  db.exec("CREATE TRIGGER casse BEFORE INSERT ON sections BEGIN SELECT RAISE(ABORT, 'boom'); END");
  assert.throws(() => creerCompteRendu(db, lea.id, u1.id, c1.id, { titre: 'x' }));
  assert.equal(n(db, 'fiches'), 0);
});

test('liste des comptes-rendus : récent d’abord, masqués ni rendus ni comptés', () => {
  const { db, marc, lea, c1, u1 } = monde();
  const a = creerCompteRendu(db, lea.id, u1.id, c1.id, { titre: 'A' });
  const b = creerCompteRendu(db, marc.id, u1.id, c1.id, { titre: 'B' });
  const c = creerCompteRendu(db, marc.id, u1.id, c1.id, { titre: 'C' });
  db.prepare("UPDATE fiches SET cree_le = '2026-01-01T00:00:00.000Z'").run();
  db.prepare("UPDATE fiches SET cree_le = '2026-02-01T00:00:00.000Z' WHERE id = ?").run(a.id);
  let l = listerComptesRendus(db, { compteId: lea.id }, u1.id);
  assert.deepEqual(l.comptesRendus.map((x) => x.titre), ['A', 'C', 'B']); // égalité → id décroissant
  assert.equal(l.total, 3);
  assert.equal(l.comptesRendus[0]!.auteur, 'lea');
  assert.equal(l.comptesRendus[1]!.auteur, null);
  // GM hides C from players
  db.prepare('UPDATE sections SET joueurs_lisent = 0 WHERE fiche_id = ?').run(c.id);
  l = listerComptesRendus(db, { compteId: lea.id }, u1.id);
  assert.deepEqual(l.comptesRendus.map((x) => x.titre), ['A', 'B']);
  assert.equal(l.total, 2);
  assert.equal(listerComptesRendus(db, { compteId: marc.id }, u1.id).total, 3);
  // hidden from players, but its author still reads it
  db.prepare('UPDATE sections SET joueurs_lisent = 0 WHERE fiche_id = ?').run(a.id);
  assert.equal(listerComptesRendus(db, { compteId: lea.id }, u1.id).total, 2);
  // player mode: the author no longer counts as author
  assert.deepEqual(listerComptesRendus(db, { compteId: lea.id, modeJoueur: false }, u1.id).comptesRendus.map((x) => x.titre), ['A', 'B']);
  assert.deepEqual(listerComptesRendus(db, { compteId: marc.id, modeJoueur: true }, u1.id).comptesRendus.map((x) => x.titre), ['B']);
  // pagination
  const p = listerComptesRendus(db, { compteId: marc.id }, u1.id, { limite: 2 });
  assert.equal(p.comptesRendus.length, 2);
  assert.ok(p.suivant);
  const p2 = listerComptesRendus(db, { compteId: marc.id }, u1.id, { limite: 2, curseur: p.suivant! });
  assert.equal(p2.comptesRendus.length, 1);
  assert.equal(p2.suivant, null);
  void b;
});

test('liste des comptes-rendus : univers étranger refusé', () => {
  const { db, paul, u1 } = monde();
  assert.notEqual(code(() => listerComptesRendus(db, { compteId: paul.id }, u1.id)), undefined);
});

test('liste des comptes-rendus : la campagne d’un autre univers ne fuit ni nom ni compte', () => {
  const { db, marc, lea, c1, c2, u1 } = monde();
  creerCompteRendu(db, lea.id, u1.id, c1.id, { titre: 'Légitime' });
  // a sheet's campagne_id is free-form (creerFiche): point it at the campaign of universe 2
  const f = creerFiche(db, marc.id, u1.id, { type: 'compte_rendu', titre: 'Piégé', charge: { campagne_id: c2.id } });
  db.prepare("INSERT INTO sections (fiche_id, titre, contenu, ordre, joueurs_lisent, joueurs_ecrivent, modifie_le) VALUES (?, 'Compte-rendu', 'x', 0, 1, 0, 'x')").run(f.id);
  for (const who of [marc.id, lea.id]) {
    const l = listerComptesRendus(db, { compteId: who }, u1.id);
    assert.deepEqual(l.comptesRendus.map((x) => x.titre), ['Légitime']);
    assert.equal(l.total, 1);
    assert.ok(!JSON.stringify(l).includes('Camp 2'));
    assert.equal(listerComptesRendus(db, { compteId: who }, u1.id, { campagneId: c2.id }).total, 0);
  }
});
