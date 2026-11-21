// Lecture d'une fiche en forme d'import, avec l'empreinte de chaque partie (B-80, B-81, AD-139, AD-144, AD-146, AD-64).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { lireFicheApi, listerFichesApi } from './lecture-api.js';

const D = '2022-02-02T10:00:00.000Z';
const MJ = { compteId: 1 };
const LEA = { compteId: 2 };
const TOUS = JSON.stringify;

function base(): Db {
  const db = openDb(':memory:');
  migrate(db);
  db.prepare('INSERT INTO comptes (id, username, cree_le) VALUES (1, ?, ?), (2, ?, ?)').run('mj', D, 'lea', D);
  db.prepare("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U1', ?, 'u-un'), (2, 'U2', ?, 'u-deux')").run(D, D);
  db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj'), (1, 2, 'joueur'), (2, 1, 'mj')").run();
  const fiche = db.prepare(
    "INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (?, ?, 'personnage', ?, '{}', ?, ?, ?, 'ecran')",
  );
  fiche.run(1, 1, 'Aldric', D, D, 'aldric');
  fiche.run(2, 1, 'Brune', D, D, 'brune');
  fiche.run(3, 1, 'Cachee', D, D, 'cachee');
  fiche.run(4, 2, 'Cora', D, D, 'cora');
  const section = db.prepare(
    'INSERT INTO sections (id, fiche_id, titre, ordre, contenu, contenu_public, joueurs_lisent, modifie_le, cle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  section.run(1, 1, 'Histoire', 1, 'Né au nord. Voir [[2|Brune]] et [[3|Cachee]].', 'Né au nord. Voir [[2|Brune]] et [[3|Cachee]].', 1, D, 'histoire');
  section.run(2, 1, 'Secret', 2, 'Voleur.', '', 0, D, 'secret');
  section.run(3, 2, 'Notes', 1, 'Rien.\n\n:::mj\nTraitre.\n:::\n', 'Rien.\n\n', 1, D, 'notes');
  section.run(4, 3, 'Verite', 1, 'Cachée.', '', 0, D, 'verite');
  section.run(5, 4, 'Autre', 1, 'Ailleurs.', 'Ailleurs.', 1, D, 'autre');
  const rel = db.prepare("INSERT INTO relations (id, section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (?, ?, ?, 'ami', '', ?)");
  rel.run(1, 1, 2, D);
  rel.run(2, 1, 3, D);
  rel.run(3, 2, 2, D);
  db.prepare("INSERT INTO fiche_alias (fiche_id, alias) VALUES (1, 'Al')").run();
  db.prepare("INSERT INTO etiquettes (id, univers_id, nom, cree_le) VALUES (1, 1, 'noble', ?), (2, 1, 'brigand', ?)").run(D, D);
  db.prepare('INSERT INTO fiche_etiquettes (fiche_id, etiquette_id) VALUES (1, 1)').run();
  db.prepare(
    "INSERT INTO fichiers (id, univers_id, nom, type, taille, disque, ajoute_par, ajoute_le, cle_origine, visibilite) VALUES (1, 1, 'a.png', 'image/png', 10, 'd1', 1, ?, 'fic-a', 'joueurs')",
  ).run(D);
  db.prepare('UPDATE fiches SET modifie_le = ?').run(D);
  return db;
}

const lire = (db: Db, ref = 'aldric', acteur = MJ) => lireFicheApi(db, acteur, 1, ref);
const figer = (db: Db, id: number) => db.prepare('UPDATE fiches SET modifie_le = ? WHERE id = ?').run(D, id);

test('deux lectures de la même fiche rendent les mêmes empreintes, 32 hexadécimaux', () => {
  const db = base();
  const a = lire(db);
  const b = lire(db);
  assert.equal(a.empreinte, b.empreinte);
  assert.equal(a.empreinteEntete, b.empreinteEntete);
  assert.match(a.empreinte, /^[0-9a-f]{32}$/);
  assert.notEqual(a.empreinte, a.empreinteEntete);
});

test('lecture nominale par un MJ : en-tête, sections, relations, clés', () => {
  const f = lire(base());
  assert.equal(f.cle, 'aldric');
  assert.equal(f.creeeVia, 'ecran');
  assert.equal(f.entete.titre, 'Aldric');
  assert.deepEqual(f.entete.alias, ['Al']);
  assert.deepEqual(f.entete.etiquettes, ['noble']);
  assert.deepEqual(f.sections.map((s) => s.cle), ['histoire', 'secret']);
  assert.equal(f.sections[0]!.audience?.joueursLisent, true);
  assert.equal(f.relations.length, 3);
  assert.deepEqual(f.relations.map((r) => r.cible.cle), ['brune', 'cachee', 'brune']);
});

test("changer une section : empreinte de section et de fiche changent, pas l'en-tête ni l'autre section", () => {
  const db = base();
  const av = lire(db);
  db.prepare("UPDATE sections SET contenu = 'Autre texte.', contenu_public = 'Autre texte.' WHERE id = 1").run();
  const ap = lire(db);
  assert.notEqual(ap.sections[0]!.empreinte, av.sections[0]!.empreinte);
  assert.equal(ap.sections[1]!.empreinte, av.sections[1]!.empreinte);
  assert.equal(ap.empreinteEntete, av.empreinteEntete);
  assert.notEqual(ap.empreinte, av.empreinte);
});

test("un champ d'en-tête, un alias, une étiquette, le parent changent l'en-tête et la fiche, pas les sections", () => {
  const changements: [string, (db: Db) => void][] = [
    ['titre', (db) => db.prepare("UPDATE fiches SET titre = 'Aldric II' WHERE id = 1").run()],
    ['sous-type', (db) => db.prepare("UPDATE fiches SET sous_type = 'roi' WHERE id = 1").run()],
    ['alias', (db) => db.prepare("INSERT INTO fiche_alias (fiche_id, alias) VALUES (1, 'Ric')").run()],
    ['étiquette', (db) => db.prepare('INSERT INTO fiche_etiquettes (fiche_id, etiquette_id) VALUES (1, 2)').run()],
    ['parent', (db) => db.prepare('UPDATE fiches SET parent_id = 2 WHERE id = 1').run()],
    ['pj', (db) => db.prepare("UPDATE fiches SET charge = '{\"v\":1,\"pj\":true}' WHERE id = 1").run()],
  ];
  for (const [nom, change] of changements) {
    const db = base();
    const av = lire(db);
    change(db);
    const ap = lire(db);
    assert.notEqual(ap.empreinteEntete, av.empreinteEntete, nom);
    assert.notEqual(ap.empreinte, av.empreinte, nom);
    assert.deepEqual(ap.sections.map((s) => s.empreinte), av.sections.map((s) => s.empreinte), nom);
    assert.deepEqual(ap.relations.map((r) => r.empreinte), av.relations.map((r) => r.empreinte), nom);
  }
});

test("une relation en plus ou changée : empreinte de relation et de fiche, pas l'en-tête ni les sections", () => {
  for (const change of [
    (db: Db) => db.prepare("INSERT INTO relations (id, section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (9, 2, 3, 'ami', '', ?)").run(D),
    (db: Db) => db.prepare("UPDATE relations SET qualificatif = 'frère' WHERE id = 1").run(),
    (db: Db) => db.prepare('DELETE FROM relations WHERE id = 3').run(),
  ]) {
    const db = base();
    const av = lire(db);
    change(db);
    const ap = lire(db);
    assert.notEqual(ap.empreinte, av.empreinte);
    assert.equal(ap.empreinteEntete, av.empreinteEntete);
    assert.deepEqual(ap.sections.map((s) => s.empreinte), av.sections.map((s) => s.empreinte));
  }
});

test("un fichier joint change l'empreinte de sa section et de la fiche, seulement", () => {
  const db = base();
  const av = lire(db);
  db.prepare('INSERT INTO fichiers_sections (fichier_id, section_id, joint) VALUES (1, 1, 1)').run();
  const ap = lire(db);
  assert.notEqual(ap.sections[0]!.empreinte, av.sections[0]!.empreinte);
  assert.equal(ap.sections[1]!.empreinte, av.sections[1]!.empreinte);
  assert.equal(ap.empreinteEntete, av.empreinteEntete);
  assert.notEqual(ap.empreinte, av.empreinte);
  assert.deepEqual(ap.sections[0]!.fichiers, [{ id: 1, cle: 'fic-a' }]);
});

test('modifie_le seul qui bouge ne change aucune empreinte', () => {
  const db = base();
  const av = lire(db);
  db.prepare("UPDATE fiches SET modifie_le = '2030-01-01T00:00:00.000Z' WHERE id = 1").run();
  db.prepare("UPDATE sections SET modifie_le = '2030-01-01T00:00:00.000Z', version = 9 WHERE id = 1").run();
  const ap = lire(db);
  assert.equal(ap.empreinte, av.empreinte);
  assert.equal(ap.empreinteEntete, av.empreinteEntete);
  assert.deepEqual(ap.sections.map((s) => s.empreinte), av.sections.map((s) => s.empreinte));
});

test("une relation recréée sous un autre id ne bouge pas l'empreinte de fiche", () => {
  const db = base();
  const av = lire(db);
  // la relation 1 (section 1 → fiche 2) revient après la 2 (section 1 → fiche 3) : l'ordre de lecture change
  db.prepare('DELETE FROM relations WHERE id = 1').run();
  db.prepare("INSERT INTO relations (id, section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (30, 1, 2, 'ami', '', ?)").run(D);
  assert.equal(lire(db).empreinte, av.empreinte);
});

test("un lien en attente qui se résout ne change aucune empreinte", () => {
  const db = base();
  db.prepare("UPDATE sections SET contenu = 'Voir [[cle:futur|Le Futur]].', contenu_public = 'Voir [[cle:futur|Le Futur]].' WHERE id = 1").run();
  const av = lire(db);
  // la fiche de la clé « futur » naît, le texte en attente est réécrit par id (resoudreClesEnAttente)
  db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (7, 1, 'lieu', 'Futur', '{}', ?, ?, 'futur', 'import')").run(D, D);
  db.prepare("UPDATE sections SET contenu = 'Voir [[7|Le Futur]].', contenu_public = 'Voir [[7|Le Futur]].' WHERE id = 1").run();
  const ap = lire(db);
  assert.equal(ap.sections[0]!.empreinte, av.sections[0]!.empreinte);
  assert.equal(ap.empreinte, av.empreinte);
});

test('une ancienne clé conduit à la fiche, rendue sous sa clé courante ; un id aussi', () => {
  const db = base();
  db.prepare("UPDATE fiches SET cle = 'aldric-le-vieux' WHERE id = 1").run();
  db.prepare("INSERT INTO cles_anciennes (univers_id, fiche_id, cle) VALUES (1, 1, 'aldric')").run();
  const parAncienne = lire(db, 'aldric');
  assert.equal(parAncienne.cle, 'aldric-le-vieux');
  assert.equal(parAncienne.id, 1);
  assert.equal(lire(db, 'aldric-le-vieux').empreinte, parAncienne.empreinte);
  assert.equal(lire(db, '1').cle, 'aldric-le-vieux');
});

test('fiche inconnue, d’un autre univers, ou compte sans rôle : introuvable', () => {
  const db = base();
  assert.throws(() => lire(db, 'nulle-part'), { code: 'introuvable' });
  assert.throws(() => lire(db, 'cora'), { code: 'introuvable' });
  assert.throws(() => lire(db, '4'), { code: 'introuvable' });
  assert.throws(() => lireFicheApi(db, { compteId: 2 }, 2, 'cora'), { code: 'introuvable' });
});

test('un joueur ne lit ni fiche cachée (même par id) ni section MJ, ni :::mj, ni relation vers une fiche cachée', () => {
  const db = base();
  assert.throws(() => lire(db, 'cachee', LEA), { code: 'introuvable' });
  assert.throws(() => lire(db, '3', LEA), { code: 'introuvable' });
  const a = lire(db, 'aldric', LEA);
  assert.deepEqual(a.sections.map((s) => s.titre), ['Histoire']);
  assert.deepEqual(a.relations.map((r) => r.cible.id), [2]);
  const b = lire(db, 'brune', LEA);
  assert.equal(b.sections[0]!.contenu, 'Rien.\n\n');
  const tout = TOUS(a) + TOUS(b);
  for (const mot of ['Voleur', 'Traitre', ':::mj', 'Verite', 'Cachée']) assert.ok(!tout.includes(mot), mot);
});

test('un joueur reçoit le texte public, jamais la source, ni clé, ni audience', () => {
  const db = base();
  db.prepare("UPDATE sections SET contenu = 'Source secrète', contenu_public = 'Public.' WHERE id = 1").run();
  const a = lire(db, 'aldric', LEA);
  assert.equal(a.sections[0]!.contenu, 'Public.');
  assert.ok(!TOUS(a).includes('Source secrète'));
  assert.equal(a.cle, null);
  assert.equal(a.sections[0]!.cle, null);
  assert.equal(a.sections[0]!.audience, undefined);
  assert.ok(a.relations.every((r) => r.cible.cle === null));
  // le joueur peut lire la fiche par la clé : la clé sert à résoudre, pas à être rendue
  assert.equal(lire(db, 'aldric', LEA).id, 1);
});

test("le texte d'un joueur ne porte pas la clé ni l'id d'une cible qu'il ne lit pas", () => {
  const db = base();
  const a = lire(db, 'aldric', LEA);
  const t = a.sections[0]!.contenu;
  assert.ok(t.includes('[[2|Brune]]'), t);
  assert.ok(!t.includes('[[3'), t);
  assert.ok(t.includes('Cachee'), t); // le texte seul, sans lien
});

test('un MJ en mode Joueur est lu comme un joueur', () => {
  const db = base();
  const f = lireFicheApi(db, { compteId: 1, modeJoueur: true }, 1, 'aldric');
  assert.equal(f.cle, null);
  assert.deepEqual(f.sections.map((s) => s.titre), ['Histoire']);
  assert.throws(() => lireFicheApi(db, { compteId: 1, modeJoueur: true }, 1, 'cachee'), { code: 'introuvable' });
});

test("l'empreinte vue par un joueur ne dépend pas de ce qu'il ne lit pas", () => {
  const db = base();
  const av = lire(db, 'aldric', LEA);
  db.prepare("UPDATE sections SET contenu = 'Autre voleur.' WHERE id = 2").run();
  assert.equal(lire(db, 'aldric', LEA).empreinte, av.empreinte);
});

test('le parent illisible est rendu null au joueur', () => {
  const db = base();
  db.prepare('UPDATE fiches SET parent_id = 3 WHERE id = 1').run();
  assert.equal(lire(db, 'aldric', LEA).entete.parent, null);
  assert.equal(lire(db).entete.parent?.cle, 'cachee');
});

test("liste : un joueur ne voit pas la fiche cachée, aucun total, ordre de l'id", () => {
  const db = base();
  const mj = listerFichesApi(db, MJ, 1);
  assert.deepEqual(mj.fiches.map((f) => f.id), [1, 2, 3]);
  assert.deepEqual(Object.keys(mj).sort(), ['fiches', 'suivant']);
  const lea = listerFichesApi(db, LEA, 1);
  assert.deepEqual(lea.fiches.map((f) => f.id), [1, 2]);
  assert.deepEqual(Object.keys(lea).sort(), ['fiches', 'suivant']);
  assert.equal(lea.fiches[0]!.cle, null);
  assert.equal(mj.fiches[0]!.cle, 'aldric');
  assert.equal(mj.fiches[0]!.creee_via, 'ecran');
  assert.equal(mj.fiches[0]!.empreinte, lire(db).empreinte);
  assert.equal(mj.fiches[0]!.empreinte_entete, lire(db).empreinteEntete);
  assert.equal(lea.fiches[0]!.empreinte, lire(db, 'aldric', LEA).empreinte);
});

test('liste : ?depuis ne rend que les fiches écrites après (section, relation, alias, parent, fichier joint)', () => {
  const ecritures: [string, (db: Db) => void][] = [
    ['section', (db) => db.prepare("UPDATE sections SET contenu = 'x', contenu_public = 'x' WHERE id = 3").run()],
    ['relation', (db) => db.prepare("INSERT INTO relations (section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (3, 1, 'ami', '', ?)").run(D)],
    ['alias', (db) => db.prepare("INSERT INTO fiche_alias (fiche_id, alias) VALUES (2, 'Bru')").run()],
    ['parent', (db) => db.prepare('UPDATE fiches SET parent_id = 1 WHERE id = 2').run()],
    ['fichier joint', (db) => db.prepare('INSERT INTO fichiers_sections (fichier_id, section_id, joint) VALUES (1, 3, 1)').run()],
  ];
  for (const [nom, ecrire] of ecritures) {
    const db = base();
    const depuis = '2023-01-01T00:00:00.000Z';
    assert.deepEqual(listerFichesApi(db, MJ, 1, { depuis }).fiches, [], nom);
    ecrire(db);
    assert.deepEqual(listerFichesApi(db, MJ, 1, { depuis }).fiches.map((f) => f.id), [2], nom);
  }
});

test('liste : ?depuis accepte une date sans heure, refuse le reste en invalide / champ depuis', () => {
  const db = base();
  assert.equal(listerFichesApi(db, MJ, 1, { depuis: '2023-01-01' }).fiches.length, 0);
  assert.equal(listerFichesApi(db, MJ, 1, { depuis: '2022-01-01' }).fiches.length, 3);
  // frontière : strictement postérieur
  assert.equal(listerFichesApi(db, MJ, 1, { depuis: D }).fiches.length, 0);
  for (const mauvais of ['hier', '2023-13-45', '', '2023']) {
    assert.throws(() => listerFichesApi(db, MJ, 1, { depuis: mauvais }), (e: { code?: string; champ?: string }) => e.code === 'invalide' && e.champ === 'depuis', mauvais);
  }
  assert.throws(() => listerFichesApi(db, MJ, 1, { apres: -1 }), (e: { code?: string; champ?: string }) => e.code === 'invalide' && e.champ === 'apres');
});

test("liste : ?depuis ne trahit pas une fiche cachée modifiée", () => {
  const db = base();
  db.prepare("UPDATE sections SET contenu = 'x' WHERE id = 4").run();
  assert.deepEqual(listerFichesApi(db, LEA, 1, { depuis: '2023-01-01' }).fiches, []);
  assert.deepEqual(listerFichesApi(db, MJ, 1, { depuis: '2023-01-01' }).fiches.map((f) => f.id), [3]);
});

test('1 001 fiches : deux pages, ni doublon ni trou, une fiche modifiée entre les appels ni doublée ni perdue', () => {
  const db = base();
  db.exec('DELETE FROM relations; DELETE FROM fichiers_sections;');
  const ins = db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (?, 1, 'lieu', ?, '{}', ?, ?, ?, 'import')");
  db.transaction(() => {
    for (let i = 10; i < 10 + 999; i++) ins.run(i, `F${i}`, D, D, `f-${i}`);
  })();
  // 3 + 999 = 1 002 fiches dans l'univers 1, moins la cachée retirée : 1 001
  db.prepare('DELETE FROM sections WHERE fiche_id = 3').run();
  db.prepare('DELETE FROM fiches WHERE id = 3').run();
  const p1 = listerFichesApi(db, MJ, 1);
  assert.equal(p1.fiches.length, 1000);
  assert.notEqual(p1.suivant, null);
  assert.equal(p1.suivant, p1.fiches[999]!.id);
  // une fiche de la page 1 est modifiée entre les deux appels : elle ne passe pas en page 2
  db.prepare("UPDATE fiches SET titre = 'Modifiée' WHERE id = 1").run();
  db.prepare("UPDATE fiches SET modifie_le = '2099-01-01T00:00:00.000Z' WHERE id = 1").run();
  const p2 = listerFichesApi(db, MJ, 1, { apres: p1.suivant! });
  assert.equal(p2.fiches.length, 1);
  assert.equal(p2.suivant, null);
  const ids = [...p1.fiches, ...p2.fiches].map((f) => f.id);
  assert.equal(new Set(ids).size, 1001);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('une page pile de 1 000 fiches ne promet pas de page suivante', () => {
  const db = base();
  db.exec('DELETE FROM relations; DELETE FROM fichiers_sections;');
  const ins = db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (?, 1, 'lieu', ?, '{}', ?, ?, ?, 'import')");
  db.transaction(() => {
    for (let i = 10; i < 10 + 997; i++) ins.run(i, `F${i}`, D, D, `f-${i}`);
  })();
  const p = listerFichesApi(db, MJ, 1);
  assert.equal(p.fiches.length, 1000);
  assert.equal(p.suivant, null);
});

test('la lecture n’écrit rien : ni modifie_le ni ligne d’historique', () => {
  const db = base();
  const n = () => (db.prepare('SELECT count(*) AS n FROM historique').get() as { n: number }).n;
  const avant = n();
  lire(db);
  listerFichesApi(db, MJ, 1);
  assert.equal(n(), avant);
  assert.equal((db.prepare('SELECT modifie_le FROM fiches WHERE id = 1').get() as { modifie_le: string }).modifie_le, D);
  figer(db, 1);
});
