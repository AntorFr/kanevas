import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { assurerCompte } from './comptes.js';
import { ErreurService } from './erreurs.js';
import { creerFiche, lireFiche, listerFiches } from './fiches.js';
import {
  ajouterMembreInstance,
  changerRoleInstance,
  listerMembresInstance,
  listerUniversInstance,
  retirerMembreInstance,
  type ActeurInstance,
} from './instance.js';
import { listerMembres } from './membres.js';
import { lireUnivers } from './univers.js';
import { creerUnivers, listerUnivers } from './univers.js';

function err(fn: () => unknown): ErreurService | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurService) return e;
    throw e;
  }
  return null;
}

function monde() {
  const db: Db = openDb(':memory:');
  migrate(db);
  const mira = assurerCompte(db, 'mira');
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const root = assurerCompte(db, 'root');
  const zoe = assurerCompte(db, 'zoe');
  const landes = creerUnivers(db, mira.id, { nom: 'Les Landes grises', description: 'secret' } as never);
  const bravo = creerUnivers(db, antor.id, { nom: 'bravo' });
  const alpha = creerUnivers(db, antor.id, { nom: 'Alpha' });
  const adm: ActeurInstance = { compteId: root.id, admin: true };
  return { db, mira, antor, lea, root, zoe, landes, bravo, alpha, adm };
}

const snap = (db: Db) =>
  JSON.stringify([
    db.prepare('SELECT * FROM membres ORDER BY 1,2').all(),
    db.prepare('SELECT * FROM comptes ORDER BY 1').all(),
    db.prepare('SELECT * FROM univers ORDER BY 1').all(),
  ]);

test('liste des univers : id, nom, nombre de membres, par nom sans casse, rien d’autre', () => {
  const { db, adm, landes, alpha, bravo, lea } = monde();
  ajouterMembreInstance(db, adm, bravo.id, 'lea', 'joueur');
  const l = listerUniversInstance(db, adm);
  assert.deepEqual(l, [
    { id: alpha.id, nom: 'Alpha', nbMembres: 1 },
    { id: bravo.id, nom: 'bravo', nbMembres: 2 },
    { id: landes.id, nom: 'Les Landes grises', nbMembres: 1 },
  ]);
  assert.ok(lea);
});

test('membres d’un univers sans rôle pour l’admin ; ajout, doublon, jamais connecté', () => {
  const { db, adm, landes, mira } = monde();
  assert.deepEqual(listerMembresInstance(db, adm, landes.id), [
    { compteId: mira.id, username: 'mira', role: 'mj' },
  ]);
  const m = ajouterMembreInstance(db, adm, landes.id, 'lea', 'mj');
  assert.equal(m.role, 'mj');
  assert.equal(err(() => ajouterMembreInstance(db, adm, landes.id, 'nadia', 'mj'))?.message, 'Ce compte ne s’est jamais connecté.'.replace('’', "'"));
  assert.ok(err(() => ajouterMembreInstance(db, adm, landes.id, 'lea', 'joueur')));
});

test('dernier MJ : retrait et rétrogradation refusés ; changement de rôle et retrait sinon', () => {
  const { db, adm, landes, mira, lea } = monde();
  const msg = 'Impossible : l’univers doit garder au moins un MJ.';
  for (const f of [
    () => retirerMembreInstance(db, adm, landes.id, mira.id),
    () => changerRoleInstance(db, adm, landes.id, mira.id, 'joueur'),
  ]) {
    const e = err(f);
    assert.ok(e);
    assert.equal(e.message.replace(/['’]/g, ''), msg.replace(/['’]/g, ''));
  }
  ajouterMembreInstance(db, adm, landes.id, 'lea', 'joueur');
  assert.equal(changerRoleInstance(db, adm, landes.id, lea.id, 'mj').role, 'mj');
  changerRoleInstance(db, adm, landes.id, mira.id, 'joueur');
  retirerMembreInstance(db, adm, landes.id, mira.id);
  assert.deepEqual(listerMembresInstance(db, adm, landes.id).map((x) => x.username), ['lea']);
});

test('l’admin qui s’ajoute en MJ apparaît dans la liste lue par le MJ', () => {
  const { db, adm, landes, mira, root } = monde();
  ajouterMembreInstance(db, adm, landes.id, 'root', 'mj');
  assert.ok(listerMembres(db, mira.id, landes.id).some((m) => m.compteId === root.id && m.role === 'mj'));
});

test('non admin : tout est introuvable, rien n’est écrit', () => {
  const { db, landes, mira, antor, lea, zoe } = monde();
  ajouterMembreInstance(db, { compteId: 0, admin: true }, landes.id, 'lea', 'joueur');
  const avant = snap(db);
  for (const c of [mira, antor, lea, zoe]) {
    const a: ActeurInstance = { compteId: c.id, admin: false };
    for (const f of [
      () => listerUniversInstance(db, a),
      () => listerMembresInstance(db, a, landes.id),
      () => ajouterMembreInstance(db, a, landes.id, 'zoe', 'mj'),
      () => changerRoleInstance(db, a, landes.id, lea.id, 'mj'),
      () => retirerMembreInstance(db, a, landes.id, lea.id),
    ]) {
      assert.equal(err(f)?.code, 'introuvable');
    }
  }
  // flag absent / truthy-but-not-true
  assert.equal(err(() => listerUniversInstance(db, { compteId: 1 } as never))?.code, 'introuvable');
  assert.equal(err(() => listerUniversInstance(db, { compteId: 1, admin: 1 } as never))?.code, 'introuvable');
  assert.equal(snap(db), avant);
});

test('admin : univers inconnu introuvable', () => {
  const { db, adm } = monde();
  assert.equal(err(() => listerMembresInstance(db, adm, 999))?.code, 'introuvable');
  assert.equal(err(() => ajouterMembreInstance(db, adm, 999, 'lea', 'mj'))?.code, 'introuvable');
  assert.equal(err(() => changerRoleInstance(db, adm, 999, 1, 'mj'))?.code, 'introuvable');
  assert.equal(err(() => retirerMembreInstance(db, adm, 999, 1))?.code, 'introuvable');
});

test('admin sans rôle : contenu et univers refusés comme un compte sans rôle', () => {
  const { db, landes, mira, root } = monde();
  const f = creerFiche(db, mira.id, landes.id, { type: 'lieu', titre: 'Marais', charge: {} } as never);
  assert.equal(err(() => lireUnivers(db, root.id, landes.id))?.code, 'introuvable');
  assert.equal(err(() => lireFiche(db, { compteId: root.id }, landes.id, f.id))?.code, 'introuvable');
  assert.equal(err(() => listerFiches(db, { compteId: root.id }, landes.id))?.code, 'introuvable');
  assert.deepEqual(listerUnivers(db, root.id), []);
  assert.equal(err(() => listerMembres(db, root.id, landes.id))?.code, 'introuvable');
});
