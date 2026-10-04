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
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (numero, nom, applique_le) VALUES (?, ?, ?)').run(
        numero,
        file,
        new Date().toISOString(),
      );
    })();
    applied.push(numero);
  }
  return applied;
}
