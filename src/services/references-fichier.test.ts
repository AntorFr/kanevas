// Tests of the single `fichier:<id>` grammar (kanevas-mediatheque-fiche): the reference read by the rendering
// and by "Utilisé dans" / the impact box is the same one (AD-117).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { semerBouchon } from '../bouchon/depart.js';
import { migrate, openDb } from '../db/db.js';
import { ajouterFichier, impactFichier } from './fichiers.js';
import { extraireReferencesFichier } from './markdown.js';
import { ecrireContenu, lireSection } from './sections.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

test('extraireReferencesFichier : images et liens, dans l’ordre, une entrée par occurrence', () => {
  assert.deepEqual(extraireReferencesFichier('![a](fichier:12) puis [b](fichier:7) et ![c](fichier:12)'), [12, 7, 12]);
  assert.deepEqual(extraireReferencesFichier(':::mj\n![a](fichier:3)\n:::\n'), [3]);
});

test('extraireReferencesFichier : ni code, ni identifiant hors grammaire, ni autre schéma', () => {
  assert.deepEqual(extraireReferencesFichier('`![a](fichier:5)`'), []);
  assert.deepEqual(extraireReferencesFichier('```\n![a](fichier:5)\n```\n'), []);
  assert.deepEqual(extraireReferencesFichier('![a](fichier:0)'), []);
  assert.deepEqual(extraireReferencesFichier('![a](fichier:007)'), []);
  assert.deepEqual(extraireReferencesFichier('![a](fichier:1x)'), []);
  assert.deepEqual(extraireReferencesFichier('![a](fichier:-3)'), []);
  assert.deepEqual(extraireReferencesFichier('![a](fichier:1234567890123456)'), []);
  assert.deepEqual(extraireReferencesFichier('[a](https://x.test/fichier:5) fichier:5'), []);
  assert.deepEqual(extraireReferencesFichier('[a](fichier:cle:x)'), []);
  assert.deepEqual(extraireReferencesFichier('![a](fichier:123456789012345)'), [123456789012345]);
});

test('Utilisé dans / impact : un identifiant en code ou à zéros en tête ne compte pas, un lien ou une image oui', async () => {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const antor = { compteId: (db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id };
  const univers = (db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number }).id;
  const s = db.prepare('SELECT s.id, s.fiche_id AS ficheId FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.titre = ? AND s.titre = ?').get('Port-Sel', 'Histoire') as { id: number; ficheId: number };
  const racine = mkdtempSync(join(tmpdir(), 'ref-fichier-'));
  const f = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'r.png', { ou: 'mediatheque' }, racine);
  const impact = () => impactFichier(db, antor, univers, f.id, 'supprimer').usages.length;
  const ecrire = (texte: string) => {
    const v = lireSection(db, antor, univers, s.ficheId, s.id).version;
    ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, texte, v);
  };
  ecrire(`\`![x](fichier:${f.id})\`\n\n![y](fichier:0${f.id})\n`);
  assert.equal(impact(), 0);
  ecrire(`Voir [le plan](fichier:${f.id}).`);
  assert.equal(impact(), 1);
  ecrire(`![i](fichier:${f.id})`);
  assert.equal(impact(), 1);
  ecrire('Rien.');
  assert.equal(impact(), 0);
});
