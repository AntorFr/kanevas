// Rétention de l'historique (B-102 : ligne 90 jours, valeur précédente 30 jours ; critère : purge au démarrage et toutes
// les 24 h), écrite du besoin. Base fichier remplie à la main, puis application montée : la purge de démarrage a joué.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';

import Database from 'better-sqlite3';

import { migrate, openDb } from './db/db.js';

const JOUR = 86400_000;

test('au démarrage : ligne de 91 jours supprimée ; de 89 jours gardée sans sa valeur ; de 29 jours gardée avec ; puis, 24 h plus tard, la valeur de 30+ jours part', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-purge-ensemble-'));
  const chemin = join(dir, 'k.db');
  process.env.NODE_ENV = 'test';
  process.env.KANEVAS_STUB = '1';
  process.env.DB_PATH = chemin;
  try {
    const db = openDb(chemin);
    migrate(db);
    const t = Date.now();
    const iso = (j: number) => new Date(t - j * JOUR).toISOString();
    db.prepare("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U', ?, 'u-un')").run(iso(200));
    const ins = db.prepare(
      "INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, origine, cree_le, valeur_avant) VALUES (1, NULL, 'lieu:x', 'X', 'section', ?, 'modifiee', 'ecran', ?, '{\"contenu\":\"avant\"}')");
    ins.run('j91', iso(91));
    ins.run('j89', iso(89));
    ins.run('j29.5', iso(29.5));
    ins.run('j1', iso(1));
    db.close();

    mock.timers.enable({ apis: ['setInterval'] });
    const { buildApp } = await import('./app.js');
    const app = await buildApp();
    try {
      const lire = () => {
        const ro = new Database(chemin, { readonly: true });
        try {
          return ro.prepare('SELECT objet_cle k, valeur_avant v FROM historique ORDER BY id').all() as { k: string; v: string | null }[];
        } finally { ro.close(); }
      };
      assert.deepEqual(lire().map((l) => [l.k, l.v === null ? 'vide' : 'valeur']), [
        ['j89', 'vide'], ['j29.5', 'valeur'], ['j1', 'valeur'],
      ]);
      app.horloge = () => new Date(t + 2 * JOUR);
      mock.timers.tick(24 * 3600_000);
      assert.deepEqual(lire().map((l) => [l.k, l.v === null ? 'vide' : 'valeur']), [
        ['j29.5', 'vide'], ['j1', 'valeur'],
      ], 'j89 a maintenant 91 jours : supprimée ; j29.5 a 31,5 jours : valeur partie');
    } finally {
      await app.close();
      mock.timers.reset();
    }
  } finally {
    delete process.env.DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  }
});
