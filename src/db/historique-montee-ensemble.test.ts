// Montée de la migration de l'historique (kanevas-synchro-historique, critère de sortie : « un test de montée joue la
// migration sur une base d'exemple au schéma précédent »). Écrit du besoin et de docs/donnees.md (tables `historique` et
// `contexte_ecriture`, AD-147), pas du code. Base d'exemple : le schéma des migrations 0001 à 0038, remplie à la main,
// puis montée par `migrate` avec le dossier complet. Les attendus sont des littéraux.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { migrate, openDb } from './db.js';

const COMPLET = fileURLToPath(new URL('./migrations/', import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function baseAvant(): { db: Any; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-montee-'));
  const precedent = join(dir, 'precedent');
  cpSync(COMPLET, precedent, { recursive: true });
  for (const f of readdirSync(precedent)) {
    if (/^(\d+)/.exec(f) && Number(/^(\d+)/.exec(f)![1]) >= 39) rmSync(join(precedent, f));
  }
  const db = openDb(join(dir, 'k.db'));
  migrate(db, precedent + '/');
  db.exec(`
    INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', '2026-01-01T00:00:00Z');
    INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'Éneria', '2026-01-01T00:00:00Z', 'eneria');
    INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via)
      VALUES (1, 1, 'lieu', 'Port-Sel', '{"v":1}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00.000Z', 'lieu:port-sel', 'ecran');
    INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via)
      VALUES (2, 1, 'lieu', 'Cap Brume', '{"v":1}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00.000Z', 'lieu:cap-brume', 'ecran');
    INSERT INTO sections (id, fiche_id, titre, ordre, contenu, version, modifie_le, cle)
      VALUES (1, 1, 'Aperçu', 0, 'Un petit port.', 1, '2026-01-02T00:00:00.000Z', 'apercu');
    INSERT INTO relations (id, section_id, cible_fiche_id, qualificatif, cree_le)
      VALUES (1, 1, 2, 'voisin', '2026-01-02T00:00:00.000Z');
    INSERT INTO fiche_alias (fiche_id, alias) VALUES (1, 'Le Port');
  `);
  return { db, dir };
}
const un = (db: Any, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p);
const tout = (db: Any, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p);

describe('migration de l’historique : montée d’une base au schéma précédent', () => {
  it('avant la montée, ni historique ni contexte ; après, les tables existent et les données sont intactes', () => {
    const { db, dir } = baseAvant();
    try {
      assert.equal(un(db, "SELECT name FROM sqlite_master WHERE name IN ('historique', 'contexte_ecriture')"), undefined);
      assert.deepEqual(migrate(db), [39, 40, 41]);
      assert.deepEqual(
        tout(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('historique', 'contexte_ecriture') ORDER BY name").map((r: Any) => r.name),
        ['contexte_ecriture', 'historique']);
      assert.equal(un(db, 'SELECT contenu FROM sections WHERE id = 1').contenu, 'Un petit port.');
      assert.equal(un(db, 'SELECT titre FROM fiches WHERE id = 2').titre, 'Cap Brume');
      assert.equal(un(db, 'SELECT qualificatif q FROM relations WHERE id = 1').q, 'voisin');
      assert.equal(un(db, 'SELECT alias FROM fiche_alias WHERE fiche_id = 1').alias, 'Le Port');
      assert.deepEqual(migrate(db), [], 'la montée ne se rejoue pas');
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('colonnes de `historique` et de `contexte_ecriture` telles que docs/donnees.md les nomme', () => {
    const { db, dir } = baseAvant();
    try {
      migrate(db);
      const cols = (t: string) => tout(db, `PRAGMA table_info(${t})`).map((c: Any) => c.name).sort();
      assert.deepEqual(cols('historique'), [
        'action', 'compte_id', 'cree_le', 'empreinte_apres', 'fiche_cle', 'fiche_id', 'fiche_titre', 'id', 'jeton_id',
        'lot_id', 'objet', 'objet_cle', 'origine', 'univers_id', 'valeur_avant']);
      assert.deepEqual(cols('contexte_ecriture'), ['compte_id', 'id', 'jeton_id', 'lot_id', 'origine']);
      assert.throws(() => db.prepare('INSERT INTO contexte_ecriture (id, origine) VALUES (2, ?)').run('ecran'), 'une seule ligne (id toujours 1)');
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('après la montée, une écriture sans contexte date la fiche et laisse une ligne d’origine inconnu, jamais aucune ligne', () => {
    const { db, dir } = baseAvant();
    try {
      migrate(db);
      db.prepare("UPDATE sections SET contenu = 'Un grand port.', version = 2 WHERE id = 1").run();
      assert.notEqual(un(db, 'SELECT modifie_le m FROM fiches WHERE id = 1').m, '2026-01-02T00:00:00.000Z', 'modifie_le a bougé');
      assert.equal(un(db, 'SELECT modifie_le m FROM fiches WHERE id = 2').m, '2026-01-02T00:00:00.000Z', 'l’autre fiche ne bouge pas');
      const l = tout(db, 'SELECT objet, action, origine, fiche_id, fiche_cle, compte_id, valeur_avant FROM historique');
      assert.equal(l.length, 1);
      assert.equal(l[0].objet, 'section');
      assert.equal(l[0].action, 'modifiee');
      assert.equal(l[0].origine, 'inconnu');
      assert.equal(l[0].fiche_id, 1);
      assert.equal(l[0].fiche_cle, 'lieu:port-sel');
      assert.equal(l[0].compte_id, null);
      assert.ok(l[0].valeur_avant.includes('Un petit port.'), 'valeur précédente gardée');
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('après la montée, la relation, l’alias et l’étiquette sont déclenchés aussi : date de la fiche et ligne', () => {
    const { db, dir } = baseAvant();
    try {
      migrate(db);
      const vieux = '2026-01-02T00:00:00.000Z';
      const reinit = () => db.prepare('UPDATE fiches SET modifie_le = ? WHERE id = 1').run(vieux);
      const date = () => un(db, 'SELECT modifie_le m FROM fiches WHERE id = 1').m;
      db.prepare('DELETE FROM historique').run();
      db.prepare("DELETE FROM relations WHERE id = 1").run();
      assert.notEqual(date(), vieux, 'relation retirée');
      assert.equal(un(db, 'SELECT COUNT(*) n FROM historique WHERE objet = ? AND action = ?', 'relation', 'supprimee').n, 1);
      reinit();
      db.prepare("INSERT INTO fiche_alias (fiche_id, alias) VALUES (1, 'Sel')").run();
      assert.notEqual(date(), vieux, 'alias ajouté');
      reinit();
      db.prepare("DELETE FROM fiche_alias WHERE alias = 'Le Port'").run();
      assert.notEqual(date(), vieux, 'alias retiré');
      reinit();
      db.prepare("UPDATE fiches SET titre = 'Port-Sel-la-Grise' WHERE id = 1").run();
      assert.notEqual(date(), vieux, 'titre');
      assert.ok(un(db, "SELECT COUNT(*) n FROM historique WHERE objet = 'entete'").n >= 3);
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('un contexte rempli attribue la ligne (compte, origine ecran) ; l’origine systeme n’écrit aucune ligne', () => {
    const { db, dir } = baseAvant();
    try {
      migrate(db);
      db.prepare("INSERT OR REPLACE INTO contexte_ecriture (id, compte_id, origine) VALUES (1, 1, 'ecran')").run();
      db.prepare("UPDATE sections SET contenu = 'Texte B', version = 2 WHERE id = 1").run();
      const l = tout(db, 'SELECT origine, compte_id FROM historique');
      assert.deepEqual(l.map((x: Any) => [x.origine, x.compte_id]), [['ecran', 1]]);
      db.prepare("UPDATE contexte_ecriture SET compte_id = NULL, origine = 'systeme' WHERE id = 1").run();
      db.prepare("UPDATE sections SET contenu = 'Texte C', version = 3 WHERE id = 1").run();
      assert.equal(un(db, 'SELECT COUNT(*) n FROM historique').n, 1, 'systeme : pas de ligne');
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
