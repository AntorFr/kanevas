import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-carte-spatiale-edition-formulaires: the description of a body or a zone rides with the read of the
// writing GM only (the form « Modifier » needs it), never to a player, a GM in Player mode or a drawn system.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  const sid = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu, transition) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',0,0,NULL)")
    .run(g, univers, 's', 'Port', 3, 4).lastInsertRowid as number;
  const ins = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, description, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  ins.run(sid, 'e', 'etoile', null, 0, 'orange', null, null, 0, 0, 0.2, '{}');
  ins.run(sid, 'p', 'planete', null, 0, 'rocheux', 'Roc', 'Secret du MJ', 2, 3, 0.1, '{}');
  db.prepare('INSERT INTO swn_formations (systeme_id, cle, forme, nom, description, parametres) VALUES (?,?,?,?,?,?)')
    .run(sid, 'f', 'anneau', 'Ceinture', 'Zone secrète', '{"de":3,"a":4}');
  return { db, univers, g, a: (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur }) };
}

test('the writing GM reads the description of a body and of a zone; an empty one is absent', () => {
  const w = monde();
  const v = lireInterieur(w.db, w.a('antor'), w.univers, w.g, 3, 4);
  assert.equal(v.etat, 'defini');
  assert.equal(v.astres.find((x) => x.cle === 'p')!.description, 'Secret du MJ');
  assert.equal('description' in v.astres.find((x) => x.cle === 'e')!, false);
  assert.equal(v.formations[0]!.description, 'Zone secrète');
});

test('a player and a GM in Player mode never receive a description, nor any write token', () => {
  const w = monde();
  for (const acteur of [w.a('lea'), w.a('antor', true)]) {
    const v = lireInterieur(w.db, acteur, w.univers, w.g, 3, 4);
    assert.ok(!JSON.stringify(v).includes('Secret du MJ') && !JSON.stringify(v).includes('Zone secrète'));
    assert.ok([...v.astres, ...v.formations].every((x) => !('description' in x) && !('version' in x)));
    assert.equal(v.peutEcrire, undefined);
  }
});
