// Test d'ensemble de kanevas-fiches-liees-rattrapage, critère de sortie : « une base au schéma de `main`, ouverte par
// l'application, monte toutes les migrations sans erreur ». La base est construite ici avec les migrations 0001 à 0017
// (celles de `main`, AD-51), peuplée d'une campagne (fiche `aventure`) et d'une relation libre ; le vrai serveur démarre dessus.
// Attendus littéraux du besoin : l'application démarre, les migrations de l'epic passent après celles de `main`, la campagne
// reste lisible avec son statut, la relation d'avant répond nature '' et son texte en qualificatif.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import Database from 'better-sqlite3';

import { migrate, openDb } from '../db/db.js';
import { type Any, startServer, type Server } from './harnais.test.js';

let srv: Server;
let dir = '';
let chemin = '';
let cookie = '';
const lire = async (p: string) => fetch(`${srv.base}${p}`, { headers: { cookie } });

describe('kanevas-fiches-liees-rattrapage, une base au schéma de main monte les migrations de l’epic', () => {
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rattrapage-migration-'));
    const migrations = join(dir, 'migrations');
    mkdirSync(migrations);
    const source = new URL('../db/migrations/', import.meta.url);
    for (const f of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 17) copyFileSync(new URL(f, source), join(migrations, f));
    }
    chemin = join(dir, 'k.db');
    const db = openDb(chemin);
    migrate(db, migrations + '/');
    assert.equal((db.prepare('SELECT max(numero) AS n FROM migrations').get() as { n: number }).n, 17, 'la base de départ est au schéma de main');
    const d = '2026-10-20T10:00:00.000Z';
    db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
    db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Brumes', ?)").run(d);
    db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj')").run();
    const f = db.prepare("INSERT INTO fiches (id, univers_id, type, sous_type, titre, charge, cree_le, modifie_le) VALUES (?, 1, ?, ?, ?, ?, ?, ?)");
    f.run(1, 'aventure', 'Campagne', 'La Couronne brisée', '{"v":1,"statut":"en_cours"}', d, d);
    f.run(2, 'lieu', null, 'Port-Sel', '{"v":1}', d, d);
    f.run(3, 'personnage', null, 'Aldric', '{"v":1,"pj":false}', d, d);
    const cols = (db.prepare('PRAGMA table_info(sections)').all() as { name: string }[]).map((c) => c.name);
    const val: Record<string, unknown> = { fiche_id: 1, titre: 'Présentation', contenu: 'x', contenu_public: 'x', ordre: 0, version: 1, joueurs_lisent: 1, cree_le: d, modifie_le: d };
    const noms = Object.keys(val).filter((k) => cols.includes(k));
    db.prepare(`INSERT INTO sections (id, ${noms.join(',')}) VALUES (1, ${noms.map(() => '?').join(',')})`).run(...noms.map((k) => val[k]));
    db.prepare(`INSERT INTO sections (id, ${noms.join(',')}) VALUES (2, ${noms.map(() => '?').join(',')})`).run(...noms.map((k) => (k === 'fiche_id' ? 3 : k === 'titre' ? 'Apparence' : val[k])));
    db.prepare('INSERT INTO relations (id, section_id, cible_fiche_id, type, cree_le) VALUES (1, 1, 2, ?, ?)').run('mouille à', d);
    db.close();
    srv = await startServer({ DB_PATH: chemin });
    const r = await fetch(`${srv.base}/connexion-bouchon`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'compte=antor',
      redirect: 'manual',
    });
    cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    assert.ok(cookie.includes('kanevas_session'), 'connecté en antor');
  }, { timeout: 120000 });
  after(() => {
    srv?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // Panne visée : un numéro de migration de l'epic collisionne avec ceux de main, ou une migration échoue sur une base de main.
  test('la base ouverte par l’application porte les migrations 1 à 18, une fois chacune', () => {
    const ro = new Database(chemin, { readonly: true });
    const numeros = (ro.prepare('SELECT numero FROM migrations ORDER BY numero').all() as { numero: number }[]).map((r) => r.numero);
    ro.close();
    assert.deepEqual(numeros, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  // Panne visée : la migration des relations perd la relation d'avant ou son texte.
  test('la relation libre d’avant répond nature "" et son texte en qualificatif', async () => {
    const r = await lire('/api/univers/1/fiches/1/sections/1/relations');
    assert.equal(r.status, 200);
    const { relations } = (await r.json()) as { relations: Any[] };
    assert.deepEqual(relations.map((x) => [x.nature, x.qualificatif, x.cible.titre]), [['', 'mouille à', 'Port-Sel']]);
  });

  // Panne visée : la fusion casse la lecture d'une fiche d'aventure de main (charge, statut).
  test('la campagne de main reste lisible, type aventure, statut « en_cours »', async () => {
    const r = await lire('/api/univers/1/fiches/1');
    assert.equal(r.status, 200);
    const f = (await r.json()) as Any;
    assert.equal(f.type, 'aventure');
    assert.equal(f.sousType, 'Campagne');
    assert.equal(f.charge.statut, 'en_cours');
    assert.deepEqual(f.sections.map((s: Any) => s.titre), ['Présentation']);
  });

  // Panne visée : la liste d'un type ne répond plus sur la base migrée.
  test('la liste des aventures répond et porte la campagne', async () => {
    const r = await lire('/api/univers/1/fiches?type=aventure');
    assert.equal(r.status, 200);
    const { fiches } = (await r.json()) as { fiches: Any[] };
    assert.deepEqual(fiches.map((x) => x.titre), ['La Couronne brisée']);
  });

  // Échec : sur la base migrée, une relation à nature se pose, preuve que le schéma de l'epic est en place.
  test('une relation à nature se relie sur la base migrée', async () => {
    const r = await fetch(`${srv.base}/api/univers/1/fiches/3/sections/2/relations`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ cibleFicheId: 2, nature: 'se_situe', qualificatif: 'habite' }),
    });
    assert.ok(r.status < 300, `POST -> ${r.status}`);
    const { relations } = (await (await lire('/api/univers/1/fiches/3/sections/2/relations')).json()) as { relations: Any[] };
    assert.deepEqual(relations.map((x) => [x.nature, x.qualificatif, x.cible.titre]), [['se_situe', 'habite', 'Port-Sel']]);
  });
});
