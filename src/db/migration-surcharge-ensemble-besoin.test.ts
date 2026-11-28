// Montée de kanevas-systemes-jeu-surcharge, écrite depuis le critère de la fiche : sur une base d'exemple au schéma précédent
// (fiches, sections et lignes d'historique présentes), la migration ne déplace rien, puis une copie peut être créée, une
// seconde copie du même élément dans le même univers est refusée, et le détachement laisse la ligne « detachee ».
// La base d'avant est construite par le test lui-même (migrations ≤ 0052, puis des lignes SQL dans l'ancien schéma).
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const D = '2022-02-02T10:00:00.000Z';

function baseAvant(dir: string) {
  const source = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(source)) {
    if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 52) copyFileSync(new URL(file, source), join(dir, file));
  }
  const db = openDb(':memory:');
  assert.equal(migrate(db, dir + '/').at(-1), 52);
  return db;
}

test('montée : la base du schéma précédent monte à 53 sans qu’une fiche, une section ni une ligne d’historique bouge, puis une copie se crée, une seconde est refusée, le détachement s’écrit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'montee-surcharge-'));
  try {
    const db = baseAvant(dir);
    db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(D);
    db.prepare('INSERT INTO systemes_jeu (id, nom, cree_le) VALUES (1, ?, ?)').run('Zeta', D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle, systeme_id) VALUES (1, 'Lame', '', ?, 'lame', 1)").run(D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle, espace_systeme_id) VALUES (2, 'espace', '', ?, 'espace-zeta', 1)").run(D);
    const fiche = db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (?, ?, 'objet', ?, '{\"v\":1}', ?, ?, ?, 'ecran')");
    fiche.run(10, 1, 'Épée', D, D, 'objet:epee');
    fiche.run(20, 2, 'Pistolet laser', D, D, 'objet:pistolet-laser');
    const section = db.prepare("INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent, cle, contenu_public) VALUES (?, ?, 1, ?, ?, 1, ?, ?)");
    section.run(10, 'Description', 'Lame fine', D, 'description', 'Lame fine');
    section.run(20, 'Description', 'Dégâts 1d8', D, 'description', 'Dégâts 1d8');
    const avant = {
      fiches: db.prepare('SELECT id, univers_id, type, titre, cree_le, modifie_le, cle FROM fiches ORDER BY id').all(),
      sections: db.prepare('SELECT id, fiche_id, titre, contenu, version FROM sections ORDER BY id').all(),
      historique: db.prepare('SELECT id, fiche_id, objet, action, cree_le FROM historique ORDER BY id').all(),
    };
    assert.ok(avant.historique.length >= 1, 'la base d’exemple porte des lignes d’historique');

    assert.equal(migrate(db)[0], 53);

    assert.deepEqual(db.prepare('SELECT id, univers_id, type, titre, cree_le, modifie_le, cle FROM fiches ORDER BY id').all(), avant.fiches);
    assert.deepEqual(db.prepare('SELECT id, fiche_id, titre, contenu, version FROM sections ORDER BY id').all(), avant.sections);
    assert.deepEqual(db.prepare('SELECT id, fiche_id, objet, action, cree_le FROM historique ORDER BY id').all(), avant.historique);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM fiches WHERE surcharge_de IS NOT NULL').get() as { n: number }).n, 0, 'aucune fiche existante n’est une copie');

    // une copie peut maintenant être créée
    db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via, surcharge_de) VALUES (30, 1, 'objet', 'Pistolet laser', '{\"v\":1}', ?, ?, 'objet:pistolet-laser', 'ecran', 20)").run(D, D);
    // une seconde copie du même élément dans le même univers est refusée
    assert.throws(
      () => db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via, surcharge_de) VALUES (31, 1, 'objet', 'Autre', '{\"v\":1}', ?, ?, 'objet:autre', 'ecran', 20)").run(D, D),
      /UNIQUE/,
    );
    // le détachement écrit sa ligne dans l'univers de la copie
    const lignesAvant = (db.prepare("SELECT COUNT(*) n FROM historique WHERE action = 'detachee'").get() as { n: number }).n;
    assert.equal(lignesAvant, 0);
    db.prepare('UPDATE fiches SET surcharge_de = NULL WHERE id = 30').run();
    const lignes = db.prepare("SELECT univers_id, fiche_id, objet FROM historique WHERE action = 'detachee'").all();
    assert.deepEqual(lignes, [{ univers_id: 1, fiche_id: 30, objet: 'fiche' }]);
    assert.equal((db.prepare('SELECT modifie_le FROM fiches WHERE id = 30').get() as { modifie_le: string }).modifie_le, D, 'la fiche n’est pas datée par le détachement');
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
