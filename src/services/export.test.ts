// Export d'un univers : lignes, droits, cliché, abandon, depuis, empreintes (B-92, AD-148, AD-export-1).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { listerCartesApi } from './cartes.js';
import { exporterUnivers, type LigneExport } from './export.js';
import { listerFichiersApi } from './fichiers.js';
import { lireFicheApi } from './lecture-api.js';

const D = '2022-02-02T10:00:00.000Z';
const MJ = { compteId: 1 };
const LEA = { compteId: 2 };

function peupler(db: Db): void {
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
  const section = db.prepare(
    'INSERT INTO sections (id, fiche_id, titre, ordre, contenu, contenu_public, joueurs_lisent, modifie_le, cle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  section.run(1, 1, 'Histoire', 1, 'Né au nord.', 'Né au nord.', 1, D, 'histoire');
  section.run(2, 1, 'Secret', 2, 'Voleur.', '', 0, D, 'secret');
  section.run(3, 2, 'Notes', 1, 'Rien.', 'Rien.', 1, D, 'notes');
  section.run(4, 3, 'Verite', 1, 'Cachée.', '', 0, D, 'verite');
  db.prepare("INSERT INTO relations (id, section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (1, 1, 2, 'ami', '', ?)").run(D);
  db.prepare("INSERT INTO fiche_alias (fiche_id, alias) VALUES (1, 'Al')").run();
  const fic = db.prepare(
    "INSERT INTO fichiers (id, univers_id, nom, type, taille, disque, ajoute_par, ajoute_le, cle_origine, visibilite) VALUES (?, 1, ?, 'image/png', 10, ?, 1, ?, ?, ?)",
  );
  fic.run(1, 'a.png', 'd1', D, 'fic-a', 'joueurs');
  fic.run(2, 'b.png', 'd2', D, 'fic-b', 'mj');
  const carte = db.prepare("INSERT INTO cartes (id, univers_id, titre, forme, visible, cree_le) VALUES (?, 1, ?, 'graphe', ?, ?)");
  carte.run(1, 'Publique', 1, D);
  carte.run(2, 'Secrete', 0, D);
  db.prepare('UPDATE fiches SET modifie_le = ?').run(D);
}

function fichierTemp(): { db: Db; fin: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'export-'));
  const db = openDb(join(dir, 'k.db'));
  peupler(db);
  return {
    db,
    fin: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function tout(g: AsyncGenerator<LigneExport>): Promise<LigneExport[]> {
  const l: LigneExport[] = [];
  for await (const x of g) l.push(x);
  return l;
}
const sans = <T extends { type: string }>(l: T) => {
  const { type: _t, ...r } = l;
  return r;
};

test('MJ : en-tête, fiches par id, fichiers, cartes, fin = lignes écrites avant elle', async () => {
  const { db, fin } = fichierTemp();
  try {
    const l = await tout(exporterUnivers(db, MJ, 1));
    assert.deepEqual(l.map((x) => x.type), ['entete', 'fiche', 'fiche', 'fiche', 'fichier', 'fichier', 'carte', 'carte', 'fin']);
    const e = l[0] as Extract<LigneExport, { type: 'entete' }>;
    assert.deepEqual([e.fiches, e.fichiers, e.cartes, e.depuis, e.cle, e.univers], [3, 2, 2, null, 'u-un', 'U1']);
    assert.equal((l[l.length - 1] as { lignes: number }).lignes, 8);
    const ids = l.filter((x) => x.type === 'fiche').map((x) => (x as { id: number }).id);
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
    const fichiers = (await listerFichiersApi(db, MJ, 1, undefined)).fichiers;
    assert.deepEqual(l.filter((x) => x.type === 'fichier').map(sans), fichiers);
    const cartes = (await listerCartesApi(db, 1, 1, undefined)).cartes;
    assert.deepEqual(l.filter((x) => x.type === 'carte').map(sans), cartes);
    const a = l.find((x) => x.type === 'fiche' && (x as { id: number }).id === 1) as { empreinte: string };
    assert.equal(a.empreinte, lireFicheApi(db, MJ, 1, 'aldric').empreinte);
  } finally {
    fin();
  }
});

test('joueur : section MJ absente, fiche cachée sans ligne ni compte, fichiers et cartes lisibles', async () => {
  const { db, fin } = fichierTemp();
  try {
    const l = await tout(exporterUnivers(db, LEA, 1));
    const e = l[0] as Extract<LigneExport, { type: 'entete' }>;
    const fiches = l.filter((x) => x.type === 'fiche') as unknown as { id: number; sections: { titre: string }[]; empreinte: string }[];
    assert.deepEqual(fiches.map((f) => f.id), [1, 2]);
    assert.equal(e.fiches, 2);
    assert.deepEqual(fiches[0]!.sections.map((s) => s.titre), ['Histoire']);
    assert.equal(fiches[0]!.empreinte, lireFicheApi(db, LEA, 1, 'aldric').empreinte);
    assert.equal(e.fichiers, 1);
    assert.equal(e.cartes, 1);
    assert.equal(l.length, 1 + 2 + 1 + 1 + 1);
    assert.equal((l[l.length - 1] as { lignes: number }).lignes, 5);
    assert.ok(!JSON.stringify(l).includes('Voleur'));
  } finally {
    fin();
  }
});

test('cliché : une écriture après la première ligne aboutit, reste invisible, une nouvelle lecture la montre', async () => {
  const { db, fin } = fichierTemp();
  try {
    const g = exporterUnivers(db, MJ, 1);
    await g.next();
    db.prepare("UPDATE sections SET contenu = 'CHANGE' WHERE id = 1").run();
    db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (9, 1, 'personnage', 'Neuve', '{}', ?, ?, 'neuve', 'ecran')").run(D, D);
    const reste: LigneExport[] = [];
    for await (const x of g) reste.push(x);
    assert.ok(!JSON.stringify(reste).includes('CHANGE'));
    assert.equal(reste.filter((x) => x.type === 'fiche').length, 3);
    const apres = await tout(exporterUnivers(db, MJ, 1));
    assert.equal(apres.filter((x) => x.type === 'fiche').length, 4);
    assert.ok(JSON.stringify(apres).includes('CHANGE'));
  } finally {
    fin();
  }
});

test('abandon : return() ferme la connexion de lecture, le fichier se ferme sans verrou', async () => {
  const { db, fin } = fichierTemp();
  try {
    const g = exporterUnivers(db, MJ, 1);
    await g.next();
    await g.return(undefined);
    assert.deepEqual(await g.next(), { done: true, value: undefined });
    db.pragma('wal_checkpoint(TRUNCATE)');
    const busy = db.pragma('wal_checkpoint(TRUNCATE)') as { busy: number }[];
    assert.equal(busy[0]!.busy, 0);
  } finally {
    fin();
  }
});

test('univers inconnu ou sans rôle : refusé, sans fuite de connexion', async () => {
  const { db, fin } = fichierTemp();
  try {
    await assert.rejects(tout(exporterUnivers(db, MJ, 99)), { code: 'introuvable' });
    await assert.rejects(tout(exporterUnivers(db, { compteId: 7 }, 1)));
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    fin();
  }
});

test('depuis : une fiche dont seule une relation a changé est rendue, une inchangée non ; mal formé = invalide', async () => {
  const { db, fin } = fichierTemp();
  try {
    db.prepare("UPDATE relations SET qualificatif = 'rival' WHERE id = 1").run();
    const t = (db.prepare('SELECT modifie_le m FROM fiches WHERE id = 1').get() as { m: string }).m;
    assert.notEqual(t, D);
    const l = await tout(exporterUnivers(db, MJ, 1, { depuis: '2023-01-01' }));
    const e = l[0] as Extract<LigneExport, { type: 'entete' }>;
    assert.deepEqual(l.filter((x) => x.type === 'fiche').map((x) => (x as { id: number }).id), [1]);
    assert.equal(e.fiches, 1);
    assert.equal(e.fichiers, 2);
    assert.equal(e.cartes, 2);
    assert.equal(e.depuis, '2023-01-01');
    assert.equal(l.filter((x) => x.type === 'fichier').length, 2);
    // borne exacte : >=
    const egal = await tout(exporterUnivers(db, MJ, 1, { depuis: D }));
    assert.equal(egal.filter((x) => x.type === 'fiche').length, 3);
    await assert.rejects(tout(exporterUnivers(db, MJ, 1, { depuis: 'hier' })), { code: 'invalide', champ: 'depuis' });
  } finally {
    fin();
  }
});

test('empreintes : ni section ni champ d’en-tête', async () => {
  const { db, fin } = fichierTemp();
  try {
    const l = await tout(exporterUnivers(db, MJ, 1, { empreintes: true }));
    const f = l.find((x) => x.type === 'fiche')!;
    assert.deepEqual(Object.keys(f).sort(), ['cle', 'empreinte', 'empreinte_entete', 'id', 'modifie_le', 'type']);
    const ref = lireFicheApi(db, MJ, 1, 'aldric');
    assert.equal((f as { empreinte: string }).empreinte, ref.empreinte);
    assert.equal((f as { empreinte_entete: string }).empreinte_entete, ref.empreinteEntete);
  } finally {
    fin();
  }
});

test(':memory: : mêmes lignes, une seule base', async () => {
  const db = openDb(':memory:');
  peupler(db);
  const l = await tout(exporterUnivers(db, LEA, 1));
  assert.equal(l.length, 6);
  assert.equal((l[5] as { lignes: number }).lignes, 5);
});
