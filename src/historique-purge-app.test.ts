// La purge de l'historique (B-93) se joue au montage de l'application et par une minuterie de 24 h
// qui lit l'horloge de l'application (déplaçable en test).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';

import Database from 'better-sqlite3';

import { migrate, openDb } from './db/db.js';

const JOUR = 86400_000;

test('au montage une ligne de 91 jours est purgée ; la minuterie de 24 h purge une ligne de 31 jours', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-historique-'));
  const chemin = join(dir, 'k.db');
  process.env.NODE_ENV = 'test';
  process.env.KANEVAS_STUB = '1';
  process.env.DB_PATH = chemin;
  try {
    const db = openDb(chemin);
    migrate(db);
    const maintenant = Date.now();
    const iso = (jours: number) => new Date(maintenant - jours * JOUR).toISOString();
    db.prepare("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U', ?, 'u-un')").run(iso(100));
    const ins = db.prepare(
      "INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, origine, cree_le, valeur_avant) VALUES (1, NULL, 'f', 'F', 'section', ?, 'modifiee', 'ecran', ?, '{\"contenu\":\"x\"}')",
    );
    ins.run('vieille', iso(91));
    ins.run('recente', iso(1));
    db.close();

    mock.timers.enable({ apis: ['setInterval'] });
    const { buildApp } = await import('./app.js');
    const app = await buildApp();
    try {
      const lire = () => {
        const ro = new Database(chemin, { readonly: true });
        try {
          return ro.prepare('SELECT objet_cle AS cle, valeur_avant AS v FROM historique ORDER BY id').all() as { cle: string; v: string | null }[];
        } finally {
          ro.close();
        }
      };
      assert.deepEqual(lire().map((l) => l.cle), ['recente'], 'the 91-day line is gone at mount');
      assert.notEqual(lire()[0]!.v, null);

      // 31 days later by the test clock; the 24 h timer fires
      app.horloge = () => new Date(maintenant + 31 * JOUR);
      mock.timers.tick(24 * 3600_000);
      const apres = lire();
      assert.equal(apres.length, 1, 'the line stays');
      assert.equal(apres[0]!.v, null, 'its previous value is emptied');

      app.horloge = () => new Date(maintenant + 91 * JOUR + 5 * 60_000);
      mock.timers.tick(24 * 3600_000);
      assert.deepEqual(lire(), [], 'and goes at 90 days');
    } finally {
      mock.timers.reset();
      await app.close();
    }
  } finally {
    delete process.env.DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  }
});
