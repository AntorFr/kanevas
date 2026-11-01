// Tests of kanevas-mediatheque-service, written from the exit criterion (AD-117 §4): the migration
// played on a base of before turns attachments and illustrations into files. Expectations are literals.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const SRC = new URL('./migrations/', import.meta.url).pathname;

function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig15-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) {
    if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  }
  return dir;
}

function avant() {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(14));
  const t = '2026-01-01T00:00:00.000Z';
  // Accounts 1 (Zed), 2 (Amy): the GM of smallest id is account 2 (Amy), the player is account 1.
  db.prepare('INSERT INTO comptes (id, username, cree_le) VALUES (1, ?, ?), (2, ?, ?), (3, ?, ?)').run(
    'zed', t, 'amy', t, 'bob', t,
  );
  db.prepare('INSERT INTO univers (id, nom, cree_le) VALUES (1, ?, ?)').run('Lame', t);
  db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'joueur'), (1, 2, 'mj'), (1, 3, 'mj')").run();
  db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, illustration_fichier, illustration_type, illustration_taille) VALUES (1, 1, 'lieu', 'Port-Sel', '{}', ?, '2026-02-02T00:00:00.000Z', 'ill-disque', 'image/png', 12)").run(t);
  db.prepare("INSERT INTO sections (id, fiche_id, titre, ordre, modifie_le, joueurs_lisent) VALUES (1, 1, 'Description', 1, ?, 1)").run(t);
  const pj = db.prepare('INSERT INTO pieces_jointes (section_id, nom, type, taille, fichier, secrete, cree_le) VALUES (1, ?, ?, ?, ?, ?, ?)');
  pj.run('secret.pdf', 'application/octet-stream', 5, 'disque-secret', 1, '2026-03-03T00:00:00.000Z');
  pj.run('public.png', 'image/png', 7, 'disque-public', 0, '2026-03-04T00:00:00.000Z');
  return db;
}

test('migration 0015 : trois fichiers (mj, joueurs, joueurs), ajoute_par le MJ de plus petit compte, empreinte nulle', () => {
  const db = avant();
  assert.deepEqual(migrate(db), [15, 16, 17, 18, 19]);
  const l = db
    .prepare('SELECT nom, disque, visibilite, ajoute_par, empreinte, taille, type, ajoute_le FROM fichiers ORDER BY id')
    .all();
  assert.deepEqual(l, [
    { nom: 'secret.pdf', disque: 'disque-secret', visibilite: 'mj', ajoute_par: 2, empreinte: null, taille: 5, type: 'application/octet-stream', ajoute_le: '2026-03-03T00:00:00.000Z' },
    { nom: 'public.png', disque: 'disque-public', visibilite: 'joueurs', ajoute_par: 2, empreinte: null, taille: 7, type: 'image/png', ajoute_le: '2026-03-04T00:00:00.000Z' },
    { nom: 'Port-Sel', disque: 'ill-disque', visibilite: 'joueurs', ajoute_par: 2, empreinte: null, taille: 12, type: 'image/png', ajoute_le: '2026-02-02T00:00:00.000Z' },
  ]);
  // The two attachments are joined to their section; the illustration is set on the sheet.
  assert.deepEqual(
    db.prepare('SELECT f.nom AS nom, fs.joint AS joint FROM fichiers_sections fs JOIN fichiers f ON f.id = fs.fichier_id ORDER BY f.id').all(),
    [{ nom: 'secret.pdf', joint: 1 }, { nom: 'public.png', joint: 1 }],
  );
  assert.deepEqual(
    db.prepare('SELECT x.nom AS nom FROM fiches f JOIN fichiers x ON x.id = f.illustration_fichier_id').all(),
    [{ nom: 'Port-Sel' }],
  );
  // `pieces_jointes` is emptied, not dropped; the old illustration columns stay, unused.
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM pieces_jointes').get() as { n: number }).n, 0);
  assert.equal((db.prepare('SELECT illustration_fichier AS d FROM fiches WHERE id = 1').get() as { d: string }).d, 'ill-disque');
});

test('migration 0015 rejouée : rien ne change', () => {
  const db = avant();
  migrate(db);
  const avantRejeu = JSON.stringify([
    db.prepare('SELECT * FROM fichiers ORDER BY id').all(),
    db.prepare('SELECT * FROM fichiers_sections ORDER BY fichier_id').all(),
    db.prepare('SELECT id, illustration_fichier_id FROM fiches').all(),
  ]);
  assert.deepEqual(migrate(db), []);
  const apres = JSON.stringify([
    db.prepare('SELECT * FROM fichiers ORDER BY id').all(),
    db.prepare('SELECT * FROM fichiers_sections ORDER BY fichier_id').all(),
    db.prepare('SELECT id, illustration_fichier_id FROM fiches').all(),
  ]);
  assert.equal(apres, avantRejeu);
});

test('migration 0015 : sans membre, la pièce n’est pas migrée et la table des pièces est tout de même vidée sans erreur', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(14));
  const t = '2026-01-01T00:00:00.000Z';
  db.prepare('INSERT INTO univers (id, nom, cree_le) VALUES (1, ?, ?)').run('Vide', t);
  db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 1, 'lieu', 'F', '{}', ?, ?)").run(t, t);
  db.prepare("INSERT INTO sections (id, fiche_id, titre, ordre, modifie_le) VALUES (1, 1, 'S', 1, ?)").run(t);
  db.prepare("INSERT INTO pieces_jointes (section_id, nom, type, taille, fichier, secrete, cree_le) VALUES (1, 'a.pdf', 'application/octet-stream', 3, 'd', 0, ?)").run(t);
  assert.deepEqual(migrate(db), [15, 16, 17, 18, 19]);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM fichiers').get() as { n: number }).n, 0);
});

test('migration 0014 : une pièce d’une section fermée aux joueurs devient mj, même non secrète (MJ seul, ou section d’auteur fermée à Teo)', () => {
  const db = avant();
  const t = '2026-01-01T00:00:00.000Z';
  db.prepare("INSERT INTO sections (id, fiche_id, titre, ordre, modifie_le, joueurs_lisent) VALUES (2, 1, 'Secret MJ', 2, ?, 0)").run(t);
  db.prepare("INSERT INTO sections (id, fiche_id, titre, ordre, modifie_le, joueurs_lisent, auteur_id, auteur_lit, auteur_ecrit) VALUES (3, 1, 'Notes', 3, ?, 0, 1, 1, 1)").run(t);
  const pj = db.prepare('INSERT INTO pieces_jointes (section_id, nom, type, taille, fichier, secrete, cree_le) VALUES (?, ?, ?, ?, ?, 0, ?)');
  pj.run(2, 'ferme-mj.png', 'image/png', 4, 'd-mj', t);
  pj.run(3, 'ferme-auteur.png', 'image/png', 4, 'd-auteur', t);
  migrate(db);
  assert.deepEqual(
    db.prepare("SELECT nom, visibilite FROM fichiers WHERE nom IN ('ferme-mj.png','ferme-auteur.png','public.png') ORDER BY id").all(),
    [
      { nom: 'public.png', visibilite: 'joueurs' },
      { nom: 'ferme-mj.png', visibilite: 'mj' },
      { nom: 'ferme-auteur.png', visibilite: 'mj' },
    ],
  );
});

test('migration 0014 : l’illustration d’une fiche sans aucune section lue des joueurs devient mj', () => {
  const db = avant();
  db.prepare('UPDATE sections SET joueurs_lisent = 0').run();
  migrate(db);
  assert.deepEqual(db.prepare("SELECT visibilite FROM fichiers WHERE nom = 'Port-Sel'").all(), [{ visibilite: 'mj' }]);
  assert.deepEqual(db.prepare("SELECT visibilite FROM fichiers WHERE nom = 'public.png'").all(), [{ visibilite: 'mj' }]);
});
