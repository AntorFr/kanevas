// Diagnostic of the e2e harness: the wait for the server is long enough and a server that cannot start says why.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { DELAI_DEMARRAGE_MS, startServer } from './harnais.test.ts';

test('le harnais attend le serveur au moins 30 s', () => {
  assert.ok(DELAI_DEMARRAGE_MS >= 30_000, String(DELAI_DEMARRAGE_MS));
});

test('un serveur qui sort au démarrage : erreur « server did not start » avec sa sortie, bien avant 30 s', async () => {
  // A regular file as parent directory of the database: fails for root too (ENOTDIR).
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-diag-'));
  const fichier = join(dir, 'fichier');
  writeFileSync(fichier, 'x');
  const debut = Date.now();
  try {
    await assert.rejects(startServer({ DB_PATH: join(fichier, 'sous', 'k.db') }), (e: Error) => {
      assert.match(e.message, /server did not start/);
      assert.match(e.message, /exited/);
      assert.match(e.message, /ENOTDIR|not a directory|ENOENT|EEXIST/i, e.message);
      return true;
    });
    assert.ok(Date.now() - debut < 25_000, `${Date.now() - debut} ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
