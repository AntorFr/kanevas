// Migration 0017 (AD-127): campaigns and scenarios become `aventure` sheets. The 0016 database is
// built by the test itself (migrations 0001–0016 then SQL rows); no binary fixture.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { comptesDuPivot, migrate, openDb } from './db.js';

const D = '2022-02-02T10:00:00.000Z';

function base0016() {
  const dir = mkdtempSync(join(tmpdir(), 'migration-pivot-'));
  const db = openDb(':memory:');
  const source = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(source)) {
    if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 16) copyFileSync(new URL(file, source), join(dir, file));
  }
  assert.deepEqual(migrate(db, dir + '/').at(-1), 16);
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?), (2, 'lea', ?)").run(D, D);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Brumes', ?), (2, 'Autre', ?)").run(D, D);
  db.exec("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj'), (1, 2, 'joueur'), (2, 1, 'mj')");
  return { db, dir };
}

test('0017 convertit campagnes et scénarios en fiches aventure, tâches et CR rattachés, tables supprimées', () => {
  const { db, dir } = base0016();
  try {
    const fiche = db.prepare(
      'INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle_origine) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    fiche.run(5, 1, 'lieu', 'Port-Sel', '{"v":1}', D, D, 'prise');          // key already taken by a sheet
    fiche.run(6, 1, 'personnage', 'Capitaine', '{"v":1,"pj":false}', D, D, null);
    fiche.run(40, 1, 'compte_rendu', 'Séance 1', '{"v":1,"campagne_id":1}', D, D, null);
    fiche.run(41, 1, 'compte_rendu', 'Séance 2', '{"v":1,"campagne_id":2}', D, D, null);
    db.prepare("INSERT INTO sections (fiche_id, titre, ordre, contenu, contenu_public, modifie_le, joueurs_lisent) VALUES (40, 'Compte-rendu', 1, 'x', 'x', ?, 1)").run(D);

    const campagne = db.prepare('INSERT INTO campagnes (id, univers_id, nom, statut, cree_le, cle_origine, dernier_import) VALUES (?, ?, ?, ?, ?, ?, ?)');
    campagne.run(1, 1, 'La Couronne brisée', 'active', D, 'couronne', '{"nom":"La Couronne brisée"}');
    campagne.run(2, 1, 'Le Bal masqué', 'en_preparation', D, null, null);
    const scenario = db.prepare('INSERT INTO scenarios (id, campagne_id, titre, contenu, version, cree_le, modifie_le, cle_origine, dernier_import, version_importee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    scenario.run(1, 1, 'Acte II', 'Public\n:::mj\nSecret\n:::\n', 4, D, D, 'acte-2', null, 3);
    scenario.run(2, 1, 'Acte I', 'Tout public', 2, D, D, 'prise', null, null); // key taken by the lieu
    scenario.run(3, 2, 'Prélude', '', 1, D, D, null, null, null);
    const tache = db.prepare('INSERT INTO taches_preparation (campagne_id, categorie, libelle, faite, faite_le, cree_le) VALUES (?, ?, ?, ?, ?, ?)');
    tache.run(1, 'pnj', 'Le roi', 0, null, D);
    tache.run(1, 'cartes', 'La salle du trône', 1, D, D);
    tache.run(2, 'autre', 'Les masques', 0, null, D);

    assert.deepEqual(comptesDuPivot(db), { campagnes: 2, scenarios: 3, taches: 3, comptesRendus: 2 }, 'les comptes que le démarrage journalise');
    assert.deepEqual(migrate(db), [17, 18]);
    assert.equal(comptesDuPivot(db), null, 'rien à convertir une fois la 0017 jouée');

    const avs = db.prepare("SELECT * FROM fiches WHERE type = 'aventure' ORDER BY id").all() as any[];
    assert.equal(avs.length, 5, 'autant d\'aventures que de campagnes + scénarios');
    const par = (t: string) => avs.find((a) => a.titre === t);
    const couronne = par('La Couronne brisée');
    assert.equal(couronne.sous_type, 'Campagne');
    assert.equal(JSON.parse(couronne.charge).statut, 'en_cours');
    assert.equal(couronne.cle_origine, 'couronne');
    assert.equal(couronne.dernier_import, '{"nom":"La Couronne brisée"}');
    assert.equal(couronne.parent_id, null);
    const bal = par('Le Bal masqué');
    assert.equal(JSON.parse(bal.charge).statut, 'en_preparation');

    const pres = (id: number) => db.prepare("SELECT * FROM sections WHERE fiche_id = ? AND titre = 'Présentation'").get(id) as any;
    assert.equal(pres(couronne.id).joueurs_lisent, 1, 'Présentation lue des joueurs (campagne active)');
    assert.equal(pres(bal.id).joueurs_lisent, 0, 'Présentation fermée (en préparation)');

    const acte2 = par('Acte II');
    assert.equal(acte2.sous_type, 'Scénario');
    assert.equal(acte2.parent_id, couronne.id);
    assert.equal(par('Prélude').parent_id, bal.id);
    const sec = db.prepare("SELECT * FROM sections WHERE fiche_id = ?").get(acte2.id) as any;
    assert.equal(sec.joueurs_lisent, 0);
    assert.equal(sec.contenu, 'Public\n:::mj\nSecret\n:::\n');
    assert.ok(!sec.contenu_public.includes(':::'), 'contenu_public ne porte aucun bloc :::mj');
    assert.ok(!sec.contenu_public.includes('Secret'));
    assert.equal(sec.version, 4);
    assert.equal(sec.version_importee, 3);
    assert.equal(acte2.cle_origine, 'acte-2');
    const acte1 = par('Acte I');
    assert.equal((db.prepare("SELECT contenu_public FROM sections WHERE fiche_id = ?").get(acte1.id) as any).contenu_public, 'Tout public');
    assert.equal(acte1.cle_origine, 'scenario:prise', 'clé en collision préfixée');
    assert.equal((db.prepare('SELECT cle_origine FROM fiches WHERE id = 5').get() as any).cle_origine, 'prise');

    const taches = db.prepare('SELECT * FROM taches_preparation ORDER BY id').all() as any[];
    assert.deepEqual(taches.map((t) => t.fiche_id), [couronne.id, couronne.id, bal.id]);
    assert.equal(taches[1].faite, 1);
    assert.equal(taches[1].faite_le, D);
    assert.ok(!Object.keys(taches[0]).includes('campagne_id'));

    const cr = (id: number) => JSON.parse((db.prepare('SELECT charge FROM fiches WHERE id = ?').get(id) as any).charge);
    assert.equal(cr(40).campagne_id, couronne.id);
    assert.equal(cr(41).campagne_id, bal.id);

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r) => r.name);
    assert.ok(!tables.includes('campagnes') && !tables.includes('scenarios'));
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.deepEqual(migrate(db), []);
    // The sheets are searchable (triggers kept the indexes).
    assert.ok(avs.every((a) => a.univers_id === 1));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('0017 sur une base sans campagne ni scénario : rien à convertir, tâches intactes', () => {
  const { db, dir } = base0016();
  try {
    assert.deepEqual(migrate(db), [17, 18]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM fiches WHERE type='aventure'").get() as any).n, 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('0017 : une clé de scénario déjà prise par un autre scénario de l\'univers est préfixée sans casser l\'unicité', () => {
  const { db, dir } = base0016();
  try {
    db.exec(`INSERT INTO campagnes (id, univers_id, nom, statut, cree_le, cle_origine) VALUES (1,1,'A','terminee','${D}','k1'), (2,1,'B','active','${D}','k2')`);
    db.exec(`INSERT INTO scenarios (id, campagne_id, titre, contenu, version, cree_le, modifie_le, cle_origine) VALUES (1,1,'S1','',1,'${D}','${D}','s'), (2,2,'S2','',1,'${D}','${D}','s')`);
    assert.deepEqual(migrate(db), [17, 18]);
    const keys = (db.prepare("SELECT cle_origine FROM fiches WHERE type='aventure' ORDER BY id").all() as any[]).map((r) => r.cle_origine);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    // terminated campaign: Présentation open
    const t = db.prepare("SELECT s.joueurs_lisent FROM sections s JOIN fiches f ON f.id=s.fiche_id WHERE f.titre='A' AND s.titre='Présentation'").get() as any;
    assert.equal(t.joueurs_lisent, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
