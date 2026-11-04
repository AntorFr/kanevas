import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

export type Db = Database.Database;

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/**
 * Opens the single SQLite file (AD-5): foreign keys on, WAL, one connection.
 * `:memory:` is accepted for tests. Migrations are NOT applied here.
 */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  // Title order key, accent- and case-insensitive (« Léa » sorts with « Lea », before « Les »); better-sqlite3 has no collations.
  db.function('plier', { deterministic: true }, (t: unknown) =>
    typeof t === 'string' ? t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() : t,
  );
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  return db;
}

/**
 * Applies the numbered SQL files of `dir` not yet recorded, in order, each in
 * its own transaction (AD-14). Idempotent: a second run applies nothing.
 * Returns the numbers applied by this run.
 */
export function migrate(db: Db, dir: string = MIGRATIONS_DIR): number[] {
  db.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
       numero    INTEGER PRIMARY KEY,
       nom       TEXT NOT NULL,
       applique_le TEXT NOT NULL
     )`,
  );
  const done = new Set(
    (db.prepare('SELECT numero FROM migrations').all() as { numero: number }[]).map(
      (r) => r.numero,
    ),
  );
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-.+\.sql$/.test(f))
    .sort();
  const applied: number[] = [];
  for (const file of files) {
    const numero = Number(file.slice(0, 4));
    if (done.has(numero)) continue;
    const sql = readFileSync(`${dir}${file}`, 'utf8');
    const record = () =>
      db
        .prepare('INSERT INTO migrations (numero, nom, applique_le) VALUES (?, ?, ?)')
        .run(numero, file, new Date().toISOString());
    if (/^-- migrate: sans-cles-etrangeres[ \t]*\r?$/m.test(sql.split('\n', 1)[0] ?? '')) {
      sansClesEtrangeres(db, file, () => {
        db.exec(sql);
        record();
      });
    } else {
      db.transaction(() => {
        db.exec(sql);
        record();
      })();
    }
    applied.push(numero);
  }
  return applied;
}

/**
 * Plays a file that recreates a table the others refer to (AD-120). `PRAGMA foreign_keys` does
 * nothing inside a transaction, so it is switched off BEFORE it opens; the file and its record run
 * in the transaction, `foreign_key_check` runs before the commit (a row returned cancels everything
 * and names the table), and the keys are switched back on whatever happens.
 */
function sansClesEtrangeres(db: Db, file: string, jouer: () => void): void {
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      jouer();
      const violations = db.pragma('foreign_key_check') as { table: string }[];
      if (violations.length > 0) {
        const tables = [...new Set(violations.map((v) => v.table))].join(', ');
        throw new Error(`Migration ${file}: foreign key violations in ${tables}.`);
      }
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Counts what migration 0017 will convert (AD-127), or `null` when it has nothing to convert (fresh
 * base, or already played). Read BEFORE `migrate`: the tables are gone afterwards.
 */
export function comptesDuPivot(db: Db): { campagnes: number; scenarios: number; taches: number; comptesRendus: number } | null {
  const table = (n: string) =>
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(n) !== undefined;
  if (!table('campagnes') || !table('scenarios') || !table('migrations')) return null;
  if (db.prepare('SELECT 1 FROM migrations WHERE numero = 17').get() !== undefined) return null;
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    campagnes: n('SELECT COUNT(*) AS n FROM campagnes'),
    scenarios: n('SELECT COUNT(*) AS n FROM scenarios'),
    taches: n('SELECT COUNT(*) AS n FROM taches_preparation'),
    comptesRendus: n("SELECT COUNT(*) AS n FROM fiches WHERE type = 'compte_rendu'"),
  };
}
