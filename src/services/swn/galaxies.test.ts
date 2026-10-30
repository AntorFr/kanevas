import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-galaxie-lire-donnees : migration 0018, semis, niveaux, référence, cartes.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { poserActivation, listerCartesOutils } = await import('../outils.js');
const { applicable } = await import('../../outils/declaration.js');
const { niveauLecture, referenceGalaxie, galaxieLisible } = await import('./galaxies.js');
const { modulesActifs } = await import('../../outils/registre.js');

test('0018 crée les quatre tables sans toucher les lignes existantes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-swn-'));
  const db = openDb(':memory:');
  const source = new URL('../../db/migrations/', import.meta.url);
  for (const f of readdirSync(source)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 17) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', 'x')").run();
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', 'x')").run();
  db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 'lieu', 'F', '{}', 'x', 'x')").run();
  const snap = () => ['comptes', 'univers', 'fiches'].map((t) => db.prepare(`SELECT * FROM ${t}`).all());
  const avant = snap();
  assert.deepEqual(migrate(db), [18]);
  assert.deepEqual(snap(), avant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'swn_%' AND type='table' ORDER BY name").all().map((r: any) => r.name);
  assert.deepEqual(tables, ['swn_galaxies', 'swn_routes', 'swn_systemes', 'swn_zones']);
});

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q("SELECT id FROM univers WHERE nom = ?", "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  const a = (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur });
  return { db, q, univers, g, a, cid };
}

test('semis : 4 systèmes, 3 routes dont une privée, 1 zone secrète (comptés sur la base)', () => {
  const { db, g } = monde();
  const n = (sql: string) => (db.prepare(sql).get(g) as any).n;
  assert.equal(n('SELECT COUNT(*) n FROM swn_systemes WHERE galaxie_id=?'), 4);
  assert.equal(n('SELECT COUNT(*) n FROM swn_routes WHERE galaxie_id=?'), 3);
  assert.equal(n('SELECT COUNT(*) n FROM swn_routes WHERE galaxie_id=? AND publique=0'), 1);
  assert.equal(n('SELECT COUNT(*) n FROM swn_zones WHERE galaxie_id=?'), 1);
  assert.equal(n('SELECT COUNT(*) n FROM swn_zones WHERE galaxie_id=? AND secret=1'), 1);
});

test('niveauLecture : mj / joueur / null selon le compte du semis', () => {
  const { db, univers, a } = monde();
  assert.equal(niveauLecture(db, a('antor'), univers), 'mj');
  assert.equal(niveauLecture(db, a('mira'), univers), 'mj');
  assert.equal(niveauLecture(db, a('lea'), univers), 'joueur');
  assert.equal(niveauLecture(db, a('roxane'), univers), 'joueur');
  assert.equal(niveauLecture(db, a('antor', true), univers), 'joueur');
  assert.equal(niveauLecture(db, a('teo'), univers), null);
  assert.equal(niveauLecture(db, a('antor'), 99999), null);
});

test('niveauLecture : null quand l\'outil est désactivé', () => {
  const { db, univers, a } = monde();
  poserActivation(db, a('antor'), { niveau: 'univers', id: univers }, 'swn/galaxie', false);
  assert.equal(niveauLecture(db, a('antor'), univers), null);
  assert.equal(niveauLecture(db, a('lea'), univers), null);
});

test('galaxie invisible : introuvable pour Léa, refuse/mode_joueur pour Antor en mode Joueur, lisible par le MJ', () => {
  const { db, univers, g, a } = monde();
  db.prepare('UPDATE swn_galaxies SET visible = 0 WHERE id = ?').run(g);
  const e = (f: () => unknown) => { try { f(); } catch (x) { return x as any; } assert.fail('pas d\'erreur'); };
  assert.equal(e(() => galaxieLisible(db, a('lea'), univers, g)).code, 'introuvable');
  const r = e(() => galaxieLisible(db, a('antor', true), univers, g));
  assert.equal(r.code, 'refuse'); assert.equal(r.detail, 'mode_joueur');
  assert.equal(galaxieLisible(db, a('antor'), univers, g).niveau, 'mj');
  assert.equal(e(() => galaxieLisible(db, a('teo'), univers, g)).code, 'introuvable');
  assert.equal(e(() => galaxieLisible(db, a('lea'), univers, g + 100)).code, 'introuvable');
  assert.equal(e(() => galaxieLisible(db, a('lea'), univers + 100, g)).code, 'introuvable');
});

test('reference : Port-Sel ; un secret défini avant n\'est jamais la référence du joueur', () => {
  const { db, univers, g } = monde();
  assert.equal(referenceGalaxie(db, g, 'joueur')?.nom, 'Port-Sel');
  assert.equal(referenceGalaxie(db, g, 'mj')?.nom, 'Port-Sel');
  const g2 = Number(db.prepare("INSERT INTO swn_galaxies (univers_id, titre, graine) VALUES (?, 'B', 'b')").run(univers).lastInsertRowid);
  const ins = db.prepare('INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, secret) VALUES (?, ?, ?, ?, ?, ?, ?)');
  ins.run(g2, univers, 'cache', 'Caché', 1, 1, 1);
  ins.run(g2, univers, 'port-sel', 'Port-Sel', 0, 0, 0);
  assert.equal(referenceGalaxie(db, g2, 'joueur')?.nom, 'Port-Sel');
  assert.equal(referenceGalaxie(db, g2, 'mj')?.nom, 'Caché');
  const vide = Number(db.prepare("INSERT INTO swn_galaxies (univers_id, titre, graine) VALUES (?, 'C', 'c')").run(univers).lastInsertRowid);
  assert.equal(referenceGalaxie(db, vide, 'mj'), null);
});

test('listerCartesOutils : Antor visible, Léa selon visibilité et activation', () => {
  const { db, univers, g, a } = monde();
  const l = (u: string, mj = false) => listerCartesOutils(db, a(u, mj), univers);
  assert.deepEqual(l('antor'), [{ module: 'swn', outil: 'galaxie', id: g, titre: 'Galaxie d\'essai', visible: true }]);
  assert.equal(l('lea').length, 1);
  assert.equal(l('lea')[0].id, g);
  db.prepare('UPDATE swn_galaxies SET visible = 0 WHERE id = ?').run(g);
  assert.equal(l('antor')[0].visible, false);
  assert.deepEqual(l('lea'), []);
  assert.deepEqual(l('antor', true), []);
  db.prepare('UPDATE swn_galaxies SET visible = 1 WHERE id = ?').run(g);
  poserActivation(db, a('antor'), { niveau: 'univers', id: univers }, 'swn/galaxie', false);
  assert.deepEqual(l('lea'), []);
  assert.deepEqual(l('antor'), []);
  assert.throws(() => l('teo'));
});

test('le module swn est applicable à « Système d\'essai »', () => {
  const swn = modulesActifs().find((m) => m.nom === 'swn')!;
  assert.equal(applicable(swn.outils[0], "Système d'essai"), true);

});
