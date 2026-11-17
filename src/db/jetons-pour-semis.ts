// Test helper (migration tests only): the stub starting world writes tokens in the schema of 0038
// (`compte_id`, `jetons_univers`), which a database below 0038 lacks. `avantSemis` swaps in that schema
// for the seed, `apresSemis` puts back the one of 0010 with the seeded rows, so the climb to 0038 is played for real.
import type { Db } from './db.js';

const NOUVELLE = `CREATE TABLE jetons_api (
  id INTEGER PRIMARY KEY AUTOINCREMENT, compte_id INTEGER NOT NULL, nom TEXT NOT NULL, empreinte TEXT NOT NULL UNIQUE,
  cree_le TEXT NOT NULL, expire_le TEXT NOT NULL, revoque_le TEXT, revoque_par INTEGER, dernier_usage_le TEXT,
  tous INTEGER NOT NULL DEFAULT 0, niveau_tous TEXT, modifie_par_admin_par INTEGER, modifie_par_admin_le TEXT);
CREATE TABLE jetons_univers (jeton_id INTEGER NOT NULL, univers_id INTEGER NOT NULL, niveau TEXT NOT NULL, PRIMARY KEY (jeton_id, univers_id))`;

const ANCIENNE = `CREATE TABLE jetons_api (
  id INTEGER PRIMARY KEY AUTOINCREMENT, univers_id INTEGER NOT NULL REFERENCES univers (id),
  compte_id INTEGER NOT NULL REFERENCES comptes (id), nom TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 80),
  empreinte TEXT NOT NULL UNIQUE, cree_le TEXT NOT NULL, expire_le TEXT NOT NULL, revoque_le TEXT, dernier_usage_le TEXT,
  CHECK (expire_le > cree_le));
CREATE INDEX jetons_api_par_univers ON jetons_api (univers_id, cree_le)`;

const outilsDeSecours = new WeakSet<Db>();

export function avantSemis(db: Db): void {
  db.pragma('foreign_keys = OFF');
  db.exec(`DROP TABLE jetons_api; ${NOUVELLE}`);
  // `jetons_outils` (0021) is read by the service: a scratch one below 0021, dropped after the seed.
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'jetons_outils'").get()) {
    db.exec('CREATE TABLE jetons_outils (jeton_id INTEGER, outil TEXT)');
    outilsDeSecours.add(db);
  }
  db.pragma('foreign_keys = ON');
}

export function apresSemis(db: Db): void {
  const lignes = db
    .prepare(
      `SELECT j.id, u.univers_id, j.compte_id, j.nom, j.empreinte, j.cree_le, j.expire_le, j.revoque_le, j.dernier_usage_le
         FROM jetons_api j JOIN jetons_univers u ON u.jeton_id = j.id ORDER BY j.id`,
    )
    .all() as Record<string, unknown>[];
  db.pragma('foreign_keys = OFF');
  if (outilsDeSecours.delete(db)) db.exec('DROP TABLE jetons_outils');
  db.exec(`DROP TABLE jetons_univers; DROP TABLE jetons_api; ${ANCIENNE}`);
  const ins = db.prepare(
    `INSERT INTO jetons_api (id, univers_id, compte_id, nom, empreinte, cree_le, expire_le, revoque_le, dernier_usage_le)
     VALUES (@id, @univers_id, @compte_id, @nom, @empreinte, @cree_le, @expire_le, @revoque_le, @dernier_usage_le)`,
  );
  for (const l of lignes) ins.run(l);
  db.pragma('foreign_keys = ON');
}
