// Noyau de l'historique (AD-147, migration 0039) : montée, déclencheurs, contexte, empreintes, purge.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { empreinteEntete, empreinteSection } from './empreintes.js';
import { avecContexte, cleDe, purgerHistorique, type ContexteEcriture } from './historique.js';
import { creerFiche, supprimerFiche } from './fiches.js';
import { creerUnivers, supprimerUnivers } from './univers.js';

const D = '2022-02-02T10:00:00.000Z';
const ecran: ContexteEcriture = { compteId: 1, jetonId: null, origine: 'ecran', lotId: null };

interface Ligne {
  id: number;
  univers_id: number;
  fiche_id: number | null;
  fiche_cle: string;
  objet: string;
  objet_cle: string | null;
  action: string;
  empreinte_apres: string | null;
  compte_id: number | null;
  jeton_id: number | null;
  origine: string;
  lot_id: number | null;
  cree_le: string;
  valeur_avant: string | null;
}
const lignes = (db: Db): Ligne[] => db.prepare('SELECT * FROM historique ORDER BY id').all() as Ligne[];
const vider = (db: Db) => db.prepare('DELETE FROM historique').run();
const modifie = (db: Db, id: number) => (db.prepare('SELECT modifie_le FROM fiches WHERE id = ?').get(id) as { modifie_le: string }).modifie_le;

function semer(db: Db) {
  db.prepare('INSERT INTO comptes (id, username, cree_le) VALUES (1, ?, ?), (2, ?, ?)').run('ana', D, 'bob', D);
  db.prepare("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U1', ?, 'u-un'), (2, 'U2', ?, 'u-deux')").run(D, D);
  const fiche = db.prepare(
    "INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (?, ?, 'personnage', ?, '{}', ?, ?, ?, 'ecran')",
  );
  fiche.run(1, 1, 'Aldric', D, D, 'aldric');
  fiche.run(2, 1, 'Brune', D, D, 'brune');
  fiche.run(3, 2, 'Cora', D, D, 'cora');
  const section = db.prepare(
    "INSERT INTO sections (id, fiche_id, titre, ordre, contenu, modifie_le, cle) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  section.run(1, 1, 'Histoire', 1, 'Né au nord.', D, 'histoire');
  section.run(2, 1, 'Secret', 2, 'Voleur.', D, 'secret');
  section.run(3, 2, 'Notes', 1, 'Rien.', D, 'notes');
  section.run(4, 3, 'Autre', 1, 'Ailleurs.', D, 'autre');
  db.prepare("INSERT INTO relations (id, section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (1, 1, 2, 'ami', '', ?)").run(D);
  db.prepare("INSERT INTO fiche_alias (fiche_id, alias) VALUES (1, 'Al')").run();
  db.prepare("INSERT INTO etiquettes (id, univers_id, nom, cree_le) VALUES (1, 1, 'noble', ?), (2, 1, 'brigand', ?)").run(D, D);
  db.prepare('INSERT INTO fiche_etiquettes (fiche_id, etiquette_id) VALUES (1, 1)').run();
  db.prepare(
    "INSERT INTO fichiers (id, univers_id, nom, type, taille, disque, ajoute_par, ajoute_le, cle_origine) VALUES (1, 1, 'a.png', 'image/png', 10, 'd1', 1, ?, 'fic-a')",
  ).run(D);
  db.prepare("INSERT INTO fichiers_sections (fichier_id, section_id, joint) VALUES (1, 3, 1)").run();
}

function base(): Db {
  const db = openDb(':memory:');
  migrate(db);
  semer(db);
  vider(db); // le semis, hors contexte, a laissé des lignes `inconnu`
  db.prepare('UPDATE fiches SET modifie_le = ?').run(D);
  return db;
}

test('montée 0039 : données intactes, historique vide, déclencheurs posés', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-historique-'));
  try {
    const source = new URL('../db/migrations/', import.meta.url);
    for (const file of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 38) copyFileSync(new URL(file, source), join(dir, file));
    }
    const db = openDb(':memory:');
    assert.equal(migrate(db, dir + '/').at(-1), 38);
    semer(db);
    const avant = (t: string) => db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all();
    const tables = ['univers', 'fiches', 'sections', 'relations', 'fiche_alias', 'etiquettes', 'fiche_etiquettes', 'fichiers', 'fichiers_sections'];
    const snap = tables.map(avant);
    assert.deepEqual(migrate(db), [39, 40]);
    assert.deepEqual(tables.map(avant), snap, 'data untouched');
    assert.equal(lignes(db).length, 0, 'no past write reconstructed');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    const trig = (db.prepare("SELECT tbl_name AS t FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'historique_%'").all() as { t: string }[]).map((r) => r.t);
    for (const t of ['fiches', 'sections', 'relations', 'fiche_alias', 'fiche_etiquettes', 'fichiers_sections']) {
      assert.ok(trig.includes(t), `trigger on ${t}`);
    }
    assert.equal((db.prepare('SELECT count(*) AS n FROM contexte_ecriture').get() as { n: number }).n, 0);
    assert.deepEqual(migrate(db), [], 'idempotent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('chaque écriture date la fiche et laisse une ligne du bon objet, de la bonne action, du compte et de l’origine', () => {
  type Cas = [string, (db: Db) => void, Partial<Ligne>, number];
  const cas: Cas[] = [
    ['section modifiée', (db) => db.prepare("UPDATE sections SET contenu = 'Nouveau' WHERE id = 1").run(), { objet: 'section', objet_cle: 'histoire', action: 'modifiee' }, 1],
    ['fiche déplacée sous un parent', (db) => db.prepare('UPDATE fiches SET parent_id = 2 WHERE id = 1').run(), { objet: 'entete', action: 'modifiee' }, 1],
    ['relation supprimée', (db) => db.prepare('DELETE FROM relations WHERE id = 1').run(), { objet: 'relation', action: 'supprimee' }, 1],
    ['alias ajouté', (db) => db.prepare("INSERT INTO fiche_alias (fiche_id, alias) VALUES (2, 'Br')").run(), { objet: 'entete', action: 'modifiee' }, 2],
    ['étiquette changée', (db) => db.prepare('INSERT INTO fiche_etiquettes (fiche_id, etiquette_id) VALUES (2, 2)').run(), { objet: 'entete', action: 'modifiee' }, 2],
    ['fichier joint', (db) => db.prepare('INSERT INTO fichiers_sections (fichier_id, section_id, joint) VALUES (1, 1, 1)').run(), { objet: 'section', objet_cle: 'histoire', action: 'modifiee' }, 1],
    ['fichier retiré', (db) => db.prepare('UPDATE fichiers_sections SET joint = 0, dans_texte = 1 WHERE section_id = 3').run(), { objet: 'section', objet_cle: 'notes', action: 'modifiee' }, 2],
    ['section créée', (db) => db.prepare("INSERT INTO sections (fiche_id, titre, ordre, modifie_le, cle) VALUES (2, 'N', 5, ?, 'n')").run(D), { objet: 'section', objet_cle: 'n', action: 'creee' }, 2],
  ];
  for (const [nom, ecrire, attendu, ficheId] of cas) {
    for (const origine of ['ecran', 'import'] as const) {
      const db = base();
      const lot = origine === 'import' ? 7 : null;
      avecContexte(db, { compteId: 2, jetonId: null, origine, lotId: lot }, () => ecrire(db));
      const l = lignes(db);
      assert.equal(l.length, 1, `${nom} (${origine}) : une ligne`);
      assert.equal(l[0]!.compte_id, 2, nom);
      assert.equal(l[0]!.origine, origine, nom);
      assert.equal(l[0]!.lot_id, lot, nom);
      assert.equal(l[0]!.fiche_id, ficheId, nom);
      assert.equal(l[0]!.univers_id, 1, nom);
      for (const [k, v] of Object.entries(attendu)) assert.equal((l[0] as unknown as Record<string, unknown>)[k], v, `${nom} ${k}`);
      assert.notEqual(modifie(db, ficheId), D, `${nom} : modifie_le avance`);
      // the same write outside any context: an `inconnu` line, the sheet still dated
      const hors = base();
      ecrire(hors);
      assert.deepEqual(lignes(hors).map((r) => [r.origine, r.compte_id]), [['inconnu', null]], `${nom} hors contexte`);
      assert.notEqual(modifie(hors, ficheId), D);
    }
  }
});

test('même écriture hors contexte = ligne inconnu ; origine systeme = aucune ligne', () => {
  const db = base();
  db.prepare("UPDATE sections SET contenu = 'x' WHERE id = 1").run();
  db.prepare('UPDATE fiches SET parent_id = 2 WHERE id = 1').run();
  db.prepare('DELETE FROM relations WHERE id = 1').run();
  const l = lignes(db);
  assert.equal(l.length, 3);
  assert.ok(l.every((r) => r.origine === 'inconnu' && r.compte_id === null && r.empreinte_apres === null));
  vider(db);
  db.prepare('UPDATE fiches SET modifie_le = ?').run(D);
  avecContexte(db, { compteId: null, jetonId: null, origine: 'systeme', lotId: null }, () => {
    db.prepare("UPDATE sections SET contenu = 'résolu' WHERE id = 2").run();
    db.prepare("INSERT INTO fiche_alias (fiche_id, alias) VALUES (1, 'Zed')").run();
  });
  assert.equal(lignes(db).length, 0);
  assert.equal(modifie(db, 1), D, 'systeme ne date pas non plus');
});

test('le contexte est effacé en fin de transaction, aussi en cas d’exception ; l’écriture et sa ligne sont annulées ensemble', () => {
  const db = base();
  assert.throws(() =>
    avecContexte(db, ecran, () => {
      db.prepare("UPDATE sections SET contenu = 'x' WHERE id = 1").run();
      throw new Error('boum');
    }),
  /boum/);
  assert.equal((db.prepare('SELECT count(*) AS n FROM contexte_ecriture').get() as { n: number }).n, 0);
  assert.equal(lignes(db).length, 0);
  assert.equal((db.prepare('SELECT contenu FROM sections WHERE id = 1').get() as { contenu: string }).contenu, 'Né au nord.');
  db.prepare("UPDATE sections SET contenu = 'y' WHERE id = 1").run();
  assert.equal(lignes(db)[0]!.origine, 'inconnu', 'no leaked context');
});

test('contextes imbriqués : le contexte extérieur revient', () => {
  const db = base();
  avecContexte(db, ecran, () => {
    avecContexte(db, { compteId: 2, jetonId: null, origine: 'assistant', lotId: null }, () => db.prepare("UPDATE sections SET contenu = 'a' WHERE id = 1").run());
    db.prepare("UPDATE sections SET contenu = 'b' WHERE id = 2").run();
  });
  assert.deepEqual(lignes(db).map((l) => [l.origine, l.compte_id]), [['assistant', 2], ['ecran', 1]]);
});

test('empreinte_apres : section = empreinte recalculée, en-tête idem, relation/fiche/inconnu nulles, deux écritures = même valeur', () => {
  const db = base();
  avecContexte(db, ecran, () => {
    db.prepare("UPDATE sections SET contenu = 'v1' WHERE id = 1").run();
    db.prepare("UPDATE sections SET contenu = 'v2' WHERE id = 1").run();
    db.prepare("UPDATE fiches SET titre = 'Aldric II' WHERE id = 1").run();
    db.prepare('DELETE FROM relations WHERE id = 1').run();
  });
  const l = lignes(db);
  const sections = l.filter((r) => r.objet === 'section');
  assert.equal(sections.length, 2);
  const s = db.prepare('SELECT * FROM sections WHERE id = 1').get() as Parameters<typeof empreinteSection>[0];
  const attendue = empreinteSection({ ...s, fichiers: [] }, cleDe(db));
  assert.deepEqual(sections.map((r) => r.empreinte_apres), [attendue, attendue]);
  const f = db.prepare('SELECT * FROM fiches WHERE id = 1').get() as { titre: string; type: string; sous_type: string | null; parent_id: number | null; charge: string; cree_le: string };
  const entete = empreinteEntete(
    { titre: f.titre, type: f.type, sousType: f.sous_type, parentId: f.parent_id, alias: ['Al'], etiquettes: ['noble'], charge: JSON.parse(f.charge), creeLe: f.cree_le },
    cleDe(db),
  );
  const e = l.filter((r) => r.objet === 'entete');
  assert.equal(e.length, 1);
  assert.equal(e[0]!.empreinte_apres, entete);
  assert.equal(l.find((r) => r.objet === 'relation')!.empreinte_apres, null);
});

test('suppression : section garde son dernier contenu, empreinte nulle ; fiche garde ses sections', () => {
  const db = base();
  avecContexte(db, ecran, () => {
    db.prepare("UPDATE sections SET contenu = 'dernier' WHERE id = 2").run();
    db.prepare('DELETE FROM sections WHERE id = 2').run();
  });
  const l = lignes(db);
  const sup = l.find((r) => r.action === 'supprimee')!;
  assert.equal(JSON.parse(sup.valeur_avant!).contenu, 'dernier');
  assert.equal(sup.empreinte_apres, null);
  assert.ok(l.filter((r) => r.objet_cle === 'secret').every((r) => r.empreinte_apres === null), 'the section is gone: both lines null');

  vider(db);
  avecContexte(db, ecran, () => db.prepare('DELETE FROM sections WHERE fiche_id = 3').run());
  vider(db);
  const u = creerUnivers(db, 1, { nom: 'Mien' });
  const fiche = creerFiche(db, 1, u.id, { type: 'lieu', titre: 'Tour' } as never);
  db.prepare("INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le, cle) VALUES (?, 'Vue', 9, 'Haute.', ?, 'vue')").run(fiche.id, D);
  vider(db);
  supprimerFiche(db, { compteId: 1, modeJoueur: false } as never, u.id, fiche.id);
  const sf = lignes(db).find((r) => r.objet === 'fiche' && r.action === 'supprimee')!;
  assert.ok(sf, 'sheet deletion leaves its line');
  assert.equal(sf.fiche_id, null);
  const v = JSON.parse(sf.valeur_avant!) as { sections: { cle: string; contenu: string }[] };
  assert.ok(v.sections.some((s) => s.cle === 'vue' && s.contenu === 'Haute.'), JSON.stringify(v).slice(0, 300));
});

test('supprimerUnivers ne laisse aucune ligne de l’univers, ni l’autre univers touché', () => {
  const db = base();
  db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj'), (2, 1, 'mj')").run();
  avecContexte(db, ecran, () => {
    db.prepare("UPDATE sections SET contenu = 'x' WHERE id = 1").run();
    db.prepare("UPDATE sections SET contenu = 'y' WHERE id = 4").run();
  });
  assert.equal((db.prepare('SELECT count(*) AS n FROM historique WHERE univers_id = 1').get() as { n: number }).n, 1);
  supprimerUnivers(db, { compteId: 1, modeJoueur: false } as never, 1, 'U1');
  assert.equal((db.prepare('SELECT count(*) AS n FROM historique WHERE univers_id = 1').get() as { n: number }).n, 0);
  assert.equal((db.prepare('SELECT count(*) AS n FROM historique WHERE univers_id = 2').get() as { n: number }).n, 1);
});

test('purge : 31 jours vide valeur_avant et garde la ligne ; 91 jours la supprime', () => {
  const db = base();
  avecContexte(db, ecran, () => db.prepare("UPDATE sections SET contenu = 'x' WHERE id = 1").run());
  const t0 = new Date(lignes(db)[0]!.cree_le).getTime();
  const j = 86400_000;
  assert.deepEqual(purgerHistorique(db, new Date(t0 + 29 * j)), { videes: 0, supprimees: 0 });
  assert.notEqual(lignes(db)[0]!.valeur_avant, null);
  purgerHistorique(db, new Date(t0 + 31 * j));
  const l = lignes(db);
  assert.equal(l.length, 1);
  assert.equal(l[0]!.valeur_avant, null);
  assert.equal(l[0]!.objet_cle, 'histoire');
  purgerHistorique(db, new Date(t0 + 89 * j));
  assert.equal(lignes(db).length, 1);
  purgerHistorique(db, new Date(t0 + 91 * j));
  assert.equal(lignes(db).length, 0);
});
