// Tests of kanevas-mediatheque-service, written from the exit criterion (AD-2, AD-117): where the
// library is written, and how a section's text keeps `fichiers_sections` in step. Literal expectations.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { semerBouchon } from '../bouchon/depart.js';
import { migrate, openDb } from '../db/db.js';
import { ajouterFichier, effacerFichier, fichierLisible, lireLignes, modifierFichier } from './fichiers.js';
import { ecrireContenu, lireSection } from './sections.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** Every write to a table of the library (or to the illustration pointer) found in a source text. */
function ecrituresDeFichiers(source: string): string[] {
  const re = /(INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(fichiers\w*|fiches\b[^;`'"]*illustration_fichier_id)/gi;
  return [...source.matchAll(re)].map((m) => m[0]);
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

test('le détecteur d’écritures voit INSERT, UPDATE, DELETE sur fichiers* et sur illustration_fichier_id', () => {
  assert.equal(ecrituresDeFichiers("db.prepare('INSERT INTO fichiers (a) VALUES (1)')").length, 1);
  assert.equal(ecrituresDeFichiers('UPDATE fichiers_sections SET joint = 0').length, 1);
  assert.equal(ecrituresDeFichiers('DELETE FROM fichiers_attente WHERE 1').length, 1);
  assert.equal(ecrituresDeFichiers('UPDATE fiches SET illustration_fichier_id = NULL').length, 1);
  assert.equal(ecrituresDeFichiers('SELECT * FROM fichiers').length, 0);
});

test('aucune écriture de fichiers* ni de l’illustration hors de src/services/', () => {
  const racine = new URL('../', import.meta.url).pathname;
  const hors = sources(racine).filter((p) => !p.startsWith(join(racine, 'services') + '/') && !p.startsWith(join(racine, 'db') + '/'));
  assert.ok(hors.length > 20, 'le parcours voit les sources hors services');
  const fautifs = hors.filter((p) => ecrituresDeFichiers(readFileSync(p, 'utf8')).length > 0);
  assert.deepEqual(fautifs, []);
});

function base() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const c = (n: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as { id: number }).id;
  const univers = (db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number }).id;
  const section = (fiche: string, titre: string) =>
    db.prepare('SELECT s.id, s.fiche_id AS ficheId FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.titre = ? AND s.titre = ?').get(fiche, titre) as { id: number; ficheId: number };
  return { db, antor: { compteId: c('antor') }, lea: { compteId: c('lea') }, univers, section, racine: mkdtempSync(join(tmpdir(), 'fichiers-svc-')) };
}

const lignes = (db: ReturnType<typeof base>['db'], sid: number) =>
  db.prepare('SELECT fichier_id AS f, joint, dans_texte AS t, dans_bloc_mj AS b FROM fichiers_sections WHERE section_id = ? ORDER BY fichier_id').all(sid);

test('enregistrer le texte recalcule dans_texte et dans_bloc_mj ; un fichier cité d’un autre univers est ignoré', async () => {
  const { db, antor, univers, section, racine } = base();
  const s = section('Port-Sel', 'Histoire');
  const a = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'a.png', { ou: 'mediatheque' }, racine);
  const b = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'b.png', { ou: 'mediatheque' }, racine);
  const autre = (db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const etranger = await ajouterFichier(db, antor, autre, Readable.from([PNG]), 'e.png', { ou: 'mediatheque' }, racine);
  assert.deepEqual(lignes(db, s.id), []);

  const v0 = lireSection(db, antor, univers, s.ficheId, s.id).version;
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id,
    `Public ![a](fichier:${a.id})\n\n:::mj\nSecret ![b](fichier:${b.id}) et ![e](fichier:${etranger.id}) et ![a](fichier:${a.id})\n:::\n`, v0);
  // `a` is cited in the public text and again in the block: it is in the text and in a GM block.
  assert.deepEqual(lignes(db, s.id), [
    { f: a.id, joint: 0, t: 1, b: 1 },
    { f: b.id, joint: 0, t: 1, b: 1 },
  ]);

  const v1 = lireSection(db, antor, univers, s.ficheId, s.id).version;
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, 'Plus rien.', v1);
  assert.deepEqual(lignes(db, s.id), [], 'une ligne ni jointe ni citée disparaît');
});

test('une jointure reste quand le texte cesse de citer le fichier ; dans_texte retombe à 0', async () => {
  const { db, antor, univers, section, racine } = base();
  const s = section('Port-Sel', 'Description');
  const f = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'j.png', { ou: 'section', sectionId: s.id, maniere: 'joint' }, racine);
  const v0 = lireSection(db, antor, univers, s.ficheId, s.id).version;
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, `Vu ![x](fichier:${f.id})`, v0);
  assert.deepEqual(lignes(db, s.id), [{ f: f.id, joint: 1, t: 1, b: 0 }]);
  const v1 = lireSection(db, antor, univers, s.ficheId, s.id).version;
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, 'Rien', v1);
  assert.deepEqual(lignes(db, s.id), [{ f: f.id, joint: 1, t: 0, b: 0 }]);
});

test('un échec de la transaction ne laisse ni ligne, ni octet, ni référence', async () => {
  const { db, antor, univers, section, racine } = base();
  const s = section('Port-Sel', 'Description');
  const n = () => (db.prepare('SELECT COUNT(*) AS n FROM fichiers').get() as { n: number }).n;
  const avant = n();
  // A trigger makes the reference insertion fail after the file row went in.
  db.exec("CREATE TRIGGER casse BEFORE INSERT ON fichiers_sections BEGIN SELECT RAISE(ABORT, 'panne'); END");
  await assert.rejects(() =>
    ajouterFichier(db, antor, univers, Readable.from([PNG]), 'z.png', { ou: 'section', sectionId: s.id, maniere: 'joint' }, racine),
  );
  assert.equal(n(), avant, 'la ligne du fichier est annulée');
  const restes = readdirSync(racine, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
  assert.equal(restes.length, 0, 'aucun octet ne reste (ni dans tmp/)');
});

test('fichierLisible : MJ tout, joueur les fichiers joueurs ou les siens, non-membre rien', async () => {
  const { db, antor, lea, univers, racine } = base();
  const mj = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'm.png', { ou: 'mediatheque' }, racine);
  const mira = (db.prepare("SELECT id FROM comptes WHERE username = 'mira'").get() as { id: number }).id;
  // Added by someone else, so that Antor in player mode has no claim of his own on it.
  db.prepare("UPDATE fichiers SET visibilite = 'mj', ajoute_par = ? WHERE id = ?").run(mira, mj.id);
  const ligne = db.prepare('SELECT * FROM fichiers WHERE id = ?').get(mj.id) as Parameters<typeof fichierLisible>[2];
  assert.equal(fichierLisible(db, antor, ligne), true);
  assert.equal(fichierLisible(db, lea, ligne), false);
  assert.equal(fichierLisible(db, { compteId: antor.compteId, modeJoueur: true }, ligne), false);
  assert.equal(fichierLisible(db, { compteId: 99999 }, ligne), false);
  assert.equal(fichierLisible(db, lea, { ...ligne, ajoute_par: lea.compteId }), true);
});

test('effacerFichier : un autre univers ne le voit pas (introuvable) et ses octets restent', async () => {
  const { db, antor, univers, racine } = base();
  const autre = (db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const f = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'm.png', { ou: 'mediatheque' }, racine);
  assert.throws(() => effacerFichier(db, antor, autre, f.id, racine));
  assert.equal(readdirSync(racine, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length, 1);
});

test('réenregistrer un texte qui cite un fichier non joint ne plante pas (deuxième enregistrement)', async () => {
  const { db, antor, univers, section, racine } = base();
  const s = section('Port-Sel', 'Description');
  const f = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'c.png', { ou: 'mediatheque' }, racine);
  const v0 = lireSection(db, antor, univers, s.ficheId, s.id).version;
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, `Vu ![c](fichier:${f.id})`, v0);
  assert.deepEqual(lignes(db, s.id), [{ f: f.id, joint: 0, t: 1, b: 0 }]);
  const v1 = lireSection(db, antor, univers, s.ficheId, s.id).version;
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, `Revu ![c](fichier:${f.id}) et plus`, v1);
  assert.deepEqual(lignes(db, s.id), [{ f: f.id, joint: 0, t: 1, b: 0 }]);
  const v2 = lireSection(db, antor, univers, s.ficheId, s.id).version;
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, 'Retiré', v2);
  assert.deepEqual(lignes(db, s.id), []);
});

test('une pièce réservée au MJ reste une ligne fermée pour Léa : la phrase seule, ni nom, ni taille', async () => {
  const { db, antor, lea, univers, section, racine } = base();
  const s = section('Port-Sel', 'Description');
  const img = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'secret-reel.png', { ou: 'section', sectionId: s.id, maniere: 'joint' }, racine);
  const pdf = await ajouterFichier(db, antor, univers, Readable.from([Buffer.from('%PDF-1.4 x')]), 'budget-reel.pdf', { ou: 'section', sectionId: s.id, maniere: 'joint' }, racine);
  modifierFichier(db, antor, univers, img.id, { visibilite: 'mj' });
  modifierFichier(db, antor, univers, pdf.id, { visibilite: 'mj' });
  const vue = lireLignes(db, lea, univers, 'joueur', s.id).filter((l) => l.id === img.id || l.id === pdf.id);
  assert.deepEqual(vue, [
    { id: img.id, nom: 'Image réservée au MJ.', taille: 0, image: false, ferme: true },
    { id: pdf.id, nom: 'Fichier réservé au MJ.', taille: 0, image: false, ferme: true },
  ]);
  assert.ok(!JSON.stringify(vue).includes('reel'));
  const mj = lireLignes(db, antor, univers, 'mj', s.id).filter((l) => l.id === img.id);
  assert.equal(mj[0].nom, 'secret-reel.png');
  assert.equal(mj[0].ferme, undefined);
});
