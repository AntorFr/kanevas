// Test d'ensemble de la migration de `relations` (kanevas-fiches-liees-natures) : une base au schéma précédent (migrations
// 0001 à 0016) est construite ici avec trois relations à `type` ; le vrai serveur démarre dessus, applique les migrations,
// et l'application répond : nature '' et l'ancien texte en `qualificatif`. Écrit depuis le besoin :
// « après migration les trois répondent nature: '' et leur ancien texte en qualificatif ».
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { migrate, openDb } from '../db/db.js';
import { type Any, startServer, type Server } from './harnais.test.js';

let srv: Server;
let dir = '';
let cookie = '';

const lire = async (chemin: string) => fetch(`${srv.base}${chemin}`, { headers: { cookie } });

describe('kanevas-fiches-liees-natures, migration d’une base du schéma précédent', () => {
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'natures-migration-'));
    const migrations = join(dir, 'migrations');
    mkdirSync(migrations);
    const source = new URL('../db/migrations/', import.meta.url);
    for (const f of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 16) copyFileSync(new URL(f, source), join(migrations, f));
    }
    const chemin = join(dir, 'k.db');
    const db = openDb(chemin);
    migrate(db, migrations + '/');
    const d = '2024-05-05T10:00:00.000Z';
    db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
    db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Brumes', ?)").run(d);
    db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj')").run();
    const f = db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 1, ?, ?, '{}', ?, ?)");
    f.run(1, 'personnage', 'Aldric', d, d);
    f.run(2, 'lieu', 'Port-Sel', d, d);
    f.run(3, 'faction', 'Guilde', d, d);
    const cols = (db.prepare('PRAGMA table_info(sections)').all() as { name: string }[]).map((c) => c.name);
    const val: Record<string, unknown> = { fiche_id: 1, titre: 'Apparence', contenu: 'x', contenu_public: 'x', ordre: 0, version: 1, joueurs_lisent: 1, cree_le: d, modifie_le: d };
    const noms = Object.keys(val).filter((k) => cols.includes(k));
    db.prepare(`INSERT INTO sections (id, ${noms.join(',')}) VALUES (1, ${noms.map(() => '?').join(',')})`).run(...noms.map((k) => val[k]));
    const rel = db.prepare('INSERT INTO relations (id, section_id, cible_fiche_id, type, cree_le) VALUES (?, 1, ?, ?, ?)');
    rel.run(1, 2, 'maître de port', d);
    rel.run(2, 2, 'surveille', d);
    rel.run(3, 3, 'y fait passer ses cargaisons', d);
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

  // Panne visée : la migration perd une relation, déplace le texte hors de `qualificatif`, ou range une nature par défaut.
  test('les trois relations d’avant répondent nature "" et leur ancien texte en qualificatif', async () => {
    const r = await lire('/api/univers/1/fiches/1/sections/1/relations');
    assert.equal(r.status, 200);
    const { relations } = (await r.json()) as { relations: Any[] };
    assert.deepEqual(
      relations.map((x) => [x.nature, x.qualificatif, x.cible.titre]),
      [
        ['', 'maître de port', 'Port-Sel'],
        ['', 'surveille', 'Port-Sel'],
        ['', 'y fait passer ses cargaisons', 'Guilde'],
      ],
    );
  });

  // Panne visée : « Mentionnée dans » perd les relations d'avant (elles sont sans nature : libres).
  test('« Mentionnée dans » de Port-Sel liste encore les relations d’avant d’Aldric (maître de port, surveille)', async () => {
    const f = (await (await lire('/api/univers/1/fiches/2')).json()) as Any;
    const rel = (titre: string) => (f.mentions.find((m: Any) => m.titre === titre)?.pourquoi ?? []).filter((p: Any) => p.genre === 'relation').map((p: Any) => p.libelle);
    assert.deepEqual(rel('Aldric'), ['maître de port', 'surveille']);
  });

  // Panne visée : la migration casse l'écriture (nouvel index unique) ou le rejeu après coup.
  test('après migration, une relation à nature se relie sur la base migrée, et la même à l’identique est « relation_existante »', async () => {
    const poster = (corps: Any) =>
      fetch(`${srv.base}/api/univers/1/fiches/1/sections/1/relations`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      });
    const a = await poster({ cibleFicheId: 2, nature: 'se_situe', qualificatif: 'habite' });
    assert.equal(a.status, 201);
    const b = await poster({ cibleFicheId: 2, nature: 'se_situe', qualificatif: 'habite' });
    assert.equal(b.status, 409);
    const c = await poster({ cibleFicheId: 2, qualificatif: 'maître de port' });
    assert.equal(c.status, 409, 'la relation libre d’avant garde son unicité');
  });
});
