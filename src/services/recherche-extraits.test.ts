// Review of kanevas-synchro-mcp-extraits: `listerFiches({recherche, extraits})` carries the passages of the
// readable matching sections (B-98, AD-145); the set and order of the sheets do not move (AD-63, AD-101).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { listerFiches } from './fiches.js';

const D = '2022-02-02T10:00:00.000Z';
const MJ = { compteId: 1 };
const MJ_JOUEUR = { compteId: 1, modeJoueur: true };
const LEA = { compteId: 2 };

function monde(): Db {
  const db = openDb(':memory:');
  migrate(db);
  db.prepare('INSERT INTO comptes (id, username, cree_le) VALUES (1, ?, ?), (2, ?, ?)').run('mj', D, 'lea', D);
  db.prepare("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U1', ?, 'u-un')").run(D);
  db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj'), (1, 2, 'joueur')").run();
  const fiche = db.prepare(
    "INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (?, 1, 'personnage', ?, '{}', ?, ?, ?, 'ecran')",
  );
  fiche.run(1, 'Aldric', D, D, 'aldric');
  fiche.run(2, 'Brune', D, D, 'brune');
  fiche.run(3, 'Cachee', D, D, 'cachee');
  fiche.run(4, 'Dorian', D, D, 'dorian');
  const s = db.prepare(
    'INSERT INTO sections (id, fiche_id, titre, ordre, contenu, contenu_public, joueurs_lisent, modifie_le, cle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  s.run(1, 1, 'Histoire', 1, 'Un long récit.\nAldric a croisé un dragon rouge près du port.\nFin.', 'Un long récit.\nAldric a croisé un dragon rouge près du port.\nFin.', 1, D, 'histoire');
  s.run(2, 1, 'Secret', 2, 'Le dragon dort sous la ville.', '', 0, D, 'secret');
  s.run(3, 2, 'Notes', 1, 'Rien.\n\n:::mj\nTraitre.\n:::\n', 'Rien.\n\n', 1, D, 'notes');
  s.run(4, 3, 'Verite', 1, 'Cachée dragon.', '', 0, D, 'verite');
  s.run(5, 4, 'Légendes', 1, 'Rien ici.', 'Rien ici.', 1, D, 'legendes');
  s.run(6, 1, 'Dragon second', 3, 'Un autre dragon, encore un dragon.', 'Un autre dragon, encore un dragon.', 1, D, 'second');
  s.run(7, 2, 'Phare', 2, 'Le phare brille.\n\n:::mj\nLe phare cache un grimoire interdit.\n:::\n', 'Le phare brille.\n\n', 1, D, 'phare');
  return db;
}

const ids = (p: { fiches: { id: number }[] }) => p.fiches.map((f) => f.id);

test('extraits : le mot est entouré de ** sur une ligne, une entrée par section lisible qui correspond', () => {
  const db = monde();
  const p = listerFiches(db, LEA, 1, { recherche: 'dragon', extraits: true });
  assert.deepEqual(ids(p), [1]);
  const passages = p.fiches[0].passages!;
  assert.deepEqual(passages.map((x) => x.section), [1, 6]);
  assert.deepEqual(passages.map((x) => x.titre), ['Histoire', 'Dragon second']);
  assert.match(passages[0].extrait, /\*\*dragon\*\*/);
  for (const x of passages) assert.ok(!x.extrait.includes('\n'), 'une ligne');
  assert.ok(!JSON.stringify(p).includes('sous la ville'), 'section MJ seul absente');
});

test('extraits : bloc :::mj — le joueur n\'a ni fiche ni passage, le MJ a le passage, le MJ en mode joueur non', () => {
  const db = monde();
  const joueur = listerFiches(db, LEA, 1, { recherche: 'Traitre', extraits: true });
  assert.deepEqual(joueur.fiches, []);
  const mj = listerFiches(db, MJ, 1, { recherche: 'Traitre', extraits: true });
  assert.deepEqual(ids(mj), [2]);
  assert.equal(mj.fiches[0].passages!.length, 1);
  assert.match(mj.fiches[0].passages![0].extrait, /\*\*Traitre\*\*/);
  const mode = listerFiches(db, MJ_JOUEUR, 1, { recherche: 'Traitre', extraits: true });
  assert.deepEqual(mode.fiches, []);
});

test('extraits : section MJ seul — le MJ la lit, le joueur non, même quand la fiche répond par une autre section', () => {
  const db = monde();
  const mj = listerFiches(db, MJ, 1, { recherche: 'dragon', extraits: true });
  assert.deepEqual(ids(mj), [1, 3]);
  assert.deepEqual(mj.fiches[0].passages!.map((x) => x.section), [1, 2, 6]);
  const mode = listerFiches(db, MJ_JOUEUR, 1, { recherche: 'dragon', extraits: true });
  assert.deepEqual(mode.fiches[0].passages!.map((x) => x.section), [1, 6]);
});

test('extraits : mêmes fiches, même ordre, avec et sans l\'option ; sans l\'option, pas de passages', () => {
  const db = monde();
  for (const acteur of [MJ, LEA, MJ_JOUEUR]) {
    for (const mot of ['dragon', 'Traitre', 'a', 'aldric', 'rien', 'zzz']) {
      const avec = listerFiches(db, acteur, 1, { recherche: mot, extraits: true });
      const sans = listerFiches(db, acteur, 1, { recherche: mot });
      assert.deepEqual(ids(avec), ids(sans), `${mot}/${acteur.compteId}`);
      assert.equal(avec.suivant, sans.suivant);
      for (const f of sans.fiches) assert.equal('passages' in f, false);
    }
  }
  assert.equal('passages' in listerFiches(db, MJ, 1, { extraits: true }).fiches[0], false, 'sans recherche : rien');
});

test('extraits : correspondance dans le seul titre de section → extrait = titre marqué ; fiche trouvée par son titre → passages []', () => {
  const db = monde();
  const t = listerFiches(db, LEA, 1, { recherche: 'Légendes', extraits: true });
  assert.deepEqual(ids(t), [4]);
  assert.deepEqual(t.fiches[0].passages!.map((x) => x.extrait), ['**Légendes**']);
  const f = listerFiches(db, LEA, 1, { recherche: 'Brune', extraits: true });
  assert.deepEqual(ids(f), [2]);
  assert.deepEqual(f.fiches[0].passages, []);
});

test('extraits : recherche vide ou syntaxe FTS hostile ne casse pas', () => {
  const db = monde();
  for (const r of ['"', 'dragon OR', 'NEAR(', '*', '{titre}:x', "d'ragon"]) {
    const avec = listerFiches(db, MJ, 1, { recherche: r, extraits: true });
    assert.deepEqual(ids(avec), ids(listerFiches(db, MJ, 1, { recherche: r })), r);
  }
});

test('extraits : pagination — les passages suivent la page', () => {
  const db = monde();
  const p1 = listerFiches(db, MJ, 1, { recherche: 'dragon', extraits: true, limite: 1 });
  assert.deepEqual(ids(p1), [1]);
  const p2 = listerFiches(db, MJ, 1, { recherche: 'dragon', extraits: true, limite: 1, curseur: p1.suivant! });
  assert.deepEqual(ids(p2), [3]);
  assert.equal(p2.fiches[0].passages!.length, 1);
});

test('extraits : le mot est dans le public et dans un bloc :::mj — le joueur (et le MJ en mode joueur) ne reçoit que le public', () => {
  const db = monde();
  for (const acteur of [LEA, MJ_JOUEUR]) {
    const p = listerFiches(db, acteur, 1, { recherche: 'phare', extraits: true });
    const x = p.fiches[0].passages!.find((q) => q.section === 7)!;
    assert.match(x.extrait, /\*\*phare\*\*/);
    assert.ok(!/grimoire|interdit|mj/i.test(x.extrait), x.extrait);
  }
  const mj = listerFiches(db, MJ, 1, { recherche: 'grimoire', extraits: true });
  assert.match(mj.fiches[0].passages!.find((q) => q.section === 7)!.extrait, /\*\*grimoire\*\*/);
});
