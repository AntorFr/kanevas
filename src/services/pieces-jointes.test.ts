import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { assurerCompte } from './comptes.js';
import { ErreurService } from './erreurs.js';
import { creerFiche, lireFiche } from './fiches.js';
import { ajouterMembre } from './membres.js';
import {
  deposerPieceJointe,
  marquerSecrete,
  ouvrirPieceJointe,
  piecesDeSection,
  retirerPieceJointe,
} from './pieces-jointes.js';
import { ajouterSection, changerAudience, lireSection, retirerSection } from './sections.js';
import { viderTmp } from './stockage.js';
import { creerUnivers } from './univers.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GIF = Buffer.from('GIF89a....');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const racine = mkdtempSync(join(tmpdir(), 'pj-'));
  const marc = assurerCompte(db, 'marc');
  const lea = assurerCompte(db, 'lea');
  const zoe = assurerCompte(db, 'zoe');
  const u = creerUnivers(db, marc.id, { nom: 'U' });
  ajouterMembre(db, marc.id, u.id, 'lea', 'joueur');
  const f = creerFiche(db, marc.id, u.id, { type: 'personnage', titre: 'Aldric', charge: { pj: false } });
  const sec = ajouterSection(db, marc.id, u.id, f.id, { titre: 'Vérité — MJ seul', contenu: 'x' });
  const pub = ajouterSection(db, marc.id, u.id, f.id, { titre: 'Apparence', contenu: 'x' });
  changerAudience(db, marc.id, u.id, f.id, pub.id, { joueursLisent: true });
  return { db, racine, marc, lea, zoe, u, f, sec, pub };
}

async function code(p: () => unknown): Promise<string> {
  try {
    await p();
  } catch (e) {
    if (e instanceof ErreurService) return e.code;
    throw e;
  }
  return 'aucune';
}

const flux = (b: Buffer) => Readable.from([b]);
const nbLignes = (db: Db) => (db.prepare('SELECT count(*) n FROM pieces_jointes').get() as { n: number }).n;
const fichiers = (racine: string) => readdirSync(racine).filter((x) => x !== 'tmp');
const tmp = (racine: string) => (existsSync(join(racine, 'tmp')) ? readdirSync(join(racine, 'tmp')) : []);
const vide = (m: { db: Db; racine: string }) => {
  assert.equal(nbLignes(m.db), 0);
  assert.deepEqual(fichiers(m.racine), []);
  assert.deepEqual(tmp(m.racine), []);
};
const version = (db: Db, id: number) =>
  db.prepare('SELECT version, modifie_le FROM sections WHERE id = ?').get(id);

test('migration 0004 sur une base 0001-0003 avec sections : table créée, seconde exécution sans effet', () => {
  const db = openDb(':memory:');
  assert.deepEqual(migrate(db), [1, 2, 3, 4]);
  assert.deepEqual(migrate(db), []);
  const cols = (db.prepare('PRAGMA table_info(pieces_jointes)').all() as { name: string }[]).map((c) => c.name);
  assert.deepEqual(cols, ['id', 'section_id', 'nom', 'type', 'taille', 'fichier', 'secrete', 'cree_le']);
  assert.throws(() =>
    db.prepare("INSERT INTO pieces_jointes (section_id, nom, type, taille, fichier, cree_le) VALUES (99,'a','t',1,'f','x')").run(),
  );
});

test('MJ dépose sur « Vérité — MJ seul » avec secrete : une ligne, un fichier aux mêmes octets', async () => {
  const m = monde();
  const p = await deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, flux(PNG), 'plan.png', true, m.racine);
  assert.equal(p.nom, 'plan.png');
  assert.equal(p.taille, 11);
  assert.equal(p.image, true);
  assert.equal(p.secrete, true);
  assert.equal(nbLignes(m.db), 1);
  const f = fichiers(m.racine);
  assert.equal(f.length, 1);
  assert.match(f[0]!, /^[0-9a-f-]{36}$/);
  assert.deepEqual(readFileSync(join(m.racine, f[0]!)), PNG);
  assert.deepEqual(tmp(m.racine), []);
});

test('type par signature : quatre images ; HTML « portrait.png », SVG, PDF → octet-stream', async () => {
  const m = monde();
  const cas: [Buffer, string, boolean][] = [
    [PNG, 'a.bin', true],
    [JPG, 'a.bin', true],
    [GIF, 'a.bin', true],
    [WEBP, 'a.bin', true],
    [Buffer.from('<html><script>1</script></html>'), 'portrait.png', false],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg', false],
    [Buffer.from('%PDF-1.4 x'), 'a.pdf', false],
    [Buffer.from('RIFF1234WAVEfmt '), 'a.webp', false],
  ];
  const ids: number[] = [];
  for (const [b, nom, image] of cas) {
    const p = await deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, flux(b), nom, false, m.racine);
    assert.equal(p.image, image, nom);
    ids.push(p.id);
  }
  const types = (m.db.prepare('SELECT type FROM pieces_jointes ORDER BY id').all() as { type: string }[]).map((r) => r.type);
  assert.deepEqual(types, [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/octet-stream', 'application/octet-stream', 'application/octet-stream', 'application/octet-stream',
  ]);
  const o = await ouvrirPieceJointe(m.db, { compteId: m.marc.id }, ids[4]!, m.racine);
  assert.equal(o.type, 'application/octet-stream');
  assert.equal(o.nom, 'portrait.png');
});

async function detail(p: () => unknown): Promise<string> {
  try {
    await p();
  } catch (e) {
    if (e instanceof ErreurService) return `${e.code}/${e.detail}`;
    throw e;
  }
  return 'aucune';
}

test('fichier vide refusé (invalide/fichier_vide), rien écrit', async () => {
  const m = monde();
  assert.equal(await detail(() => deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, Readable.from([]), 'a', false, m.racine)), 'invalide/fichier_vide');
  assert.equal(await detail(() => deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, Readable.from([Buffer.alloc(0)]), 'a', false, m.racine)), 'invalide/fichier_vide');
  vide(m);
});

test('50 pièces passent, la 51e est refusée (limite_pieces) sans rien écrire ; une autre section reste libre', async () => {
  const m = monde();
  for (let i = 0; i < 50; i++) await deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, flux(PNG), `p${i}`, false, m.racine);
  assert.equal(nbLignes(m.db), 50);
  assert.equal(await detail(() => deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, flux(PNG), 'de trop', false, m.racine)), 'invalide/limite_pieces');
  assert.equal(nbLignes(m.db), 50);
  assert.equal(fichiers(m.racine).length, 50);
  assert.deepEqual(tmp(m.racine), []);
  await deposerPieceJointe(m.db, m.marc.id, false, m.pub.id, flux(PNG), 'autre', false, m.racine);
  assert.equal(nbLignes(m.db), 51);
});

test('refus sans rien écrire : sans rôle, section inconnue, section non lue, lecture sans écriture', async () => {
  const m = monde();
  // Zoé has no role: same answer as an unknown section.
  const sans = await code(() => deposerPieceJointe(m.db, m.zoe.id, false, m.pub.id, flux(PNG), 'a', false, m.racine));
  const inconnue = await code(() => deposerPieceJointe(m.db, m.marc.id, false, 9999, flux(PNG), 'a', false, m.racine));
  assert.equal(sans, 'introuvable');
  assert.equal(inconnue, 'introuvable');
  // Léa does not read « Vérité » (joueurs_lisent = 0).
  assert.equal(await code(() => deposerPieceJointe(m.db, m.lea.id, false, m.sec.id, flux(PNG), 'a', false, m.racine)), 'introuvable');
  // Léa reads « Apparence » but players do not write it.
  assert.equal(await code(() => deposerPieceJointe(m.db, m.lea.id, false, m.pub.id, flux(PNG), 'a', false, m.racine)), 'refuse');
  vide(m);
});

test('droit retiré pendant la lecture du flux : refus, rien écrit', async () => {
  const m = monde();
  changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.pub.id, { joueursEcrivent: true });
  async function* gen() {
    yield PNG;
    changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.pub.id, { joueursEcrivent: false });
    yield PNG;
  }
  assert.equal(await code(() => deposerPieceJointe(m.db, m.lea.id, false, m.pub.id, gen(), 'a', false, m.racine)), 'refuse');
  vide(m);
});

test('flux interrompu : erreur propagée, rien écrit', async () => {
  const m = monde();
  async function* gen() {
    yield PNG;
    throw new Error('coupé');
  }
  await assert.rejects(() => deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, gen(), 'a', false, m.racine), /coupé/);
  vide(m);
});

test('Joueur auteur : dépose et retire, mais ni marquer ni lever « secrète »', async () => {
  const m = monde();
  changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.sec.id, { auteurId: m.lea.id, auteurLit: true, auteurEcrit: true });
  const p = await deposerPieceJointe(m.db, m.lea.id, false, m.sec.id, flux(PNG), 'a', false, m.racine);
  assert.equal(await code(() => deposerPieceJointe(m.db, m.lea.id, false, m.sec.id, flux(PNG), 'b', true, m.racine)), 'refuse');
  assert.equal(nbLignes(m.db), 1);
  assert.equal(await code(() => marquerSecrete(m.db, m.lea.id, false, p.id, true)), 'refuse');
  marquerSecrete(m.db, m.marc.id, false, p.id, true);
  // Secret now: invisible to Léa, even if she is the author.
  assert.equal(await code(() => marquerSecrete(m.db, m.lea.id, false, p.id, false)), 'introuvable');
  marquerSecrete(m.db, m.marc.id, false, p.id, false);
  await retirerPieceJointe(m.db, m.lea.id, false, p.id, m.racine);
  vide(m);
});

test('MJ en mode Joueur : ne dépose, ne retire, ne marque que là où les joueurs écrivent', async () => {
  const m = monde();
  // « Vérité » : joueurs n'écrivent pas.
  assert.equal(await code(() => deposerPieceJointe(m.db, m.marc.id, true, m.pub.id, flux(PNG), 'a', false, m.racine)), 'refuse');
  const p = await deposerPieceJointe(m.db, m.marc.id, false, m.pub.id, flux(PNG), 'a', false, m.racine);
  assert.equal(await code(() => retirerPieceJointe(m.db, m.marc.id, true, p.id, m.racine)), 'refuse');
  assert.equal(await code(() => marquerSecrete(m.db, m.marc.id, true, p.id, true)), 'refuse');
  changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.pub.id, { joueursEcrivent: true });
  assert.equal(await code(() => deposerPieceJointe(m.db, m.marc.id, true, m.pub.id, flux(PNG), 'b', true, m.racine)), 'refuse');
  await deposerPieceJointe(m.db, m.marc.id, true, m.pub.id, flux(PNG), 'b', false, m.racine);
  assert.equal(nbLignes(m.db), 2);
  await retirerPieceJointe(m.db, m.marc.id, true, p.id, m.racine);
  assert.equal(nbLignes(m.db), 1);
});

test('lecture : secrètes absentes pour Léa et pour le MJ en mode Joueur, `secrete` rendu au seul MJ', async () => {
  const m = monde();
  await deposerPieceJointe(m.db, m.marc.id, false, m.pub.id, flux(PNG), 'ouverte', false, m.racine);
  await deposerPieceJointe(m.db, m.marc.id, false, m.pub.id, flux(PNG), 'cachee', true, m.racine);
  const noms = (l: { nom: string }[]) => l.map((x) => x.nom);
  const mj = piecesDeSection(m.db, { compteId: m.marc.id }, m.pub.id);
  assert.deepEqual(noms(mj), ['ouverte', 'cachee']);
  assert.deepEqual(mj.map((x) => x.secrete), [false, true]);
  for (const a of [{ compteId: m.lea.id }, { compteId: m.marc.id, modeJoueur: true }]) {
    const l = piecesDeSection(m.db, a, m.pub.id);
    assert.deepEqual(noms(l), ['ouverte']);
    assert.equal('secrete' in l[0]!, false);
  }
  // Section not read / no role / unknown: nothing.
  assert.equal(await code(() => piecesDeSection(m.db, { compteId: m.lea.id }, m.sec.id)), 'introuvable');
  assert.equal(await code(() => piecesDeSection(m.db, { compteId: m.zoe.id }, m.pub.id)), 'introuvable');
  assert.equal(await code(() => piecesDeSection(m.db, { compteId: m.marc.id }, 9999)), 'introuvable');
  // lireFiche carries them (AD-67), same rules.
  const fl = lireFiche(m.db, { compteId: m.lea.id }, m.u.id, m.f.id);
  assert.deepEqual(fl.sections.map((s) => s.piecesJointes), [[{ id: 1, nom: 'ouverte', taille: 11, image: true }]]);
  const fm = lireFiche(m.db, { compteId: m.marc.id }, m.u.id, m.f.id);
  assert.equal(fm.sections.find((s) => s.id === m.pub.id)!.piecesJointes!.length, 2);
  assert.deepEqual(fm.sections.find((s) => s.id === m.sec.id)!.piecesJointes, []);
  const fmj = lireFiche(m.db, { compteId: m.marc.id, modeJoueur: true }, m.u.id, m.f.id);
  assert.deepEqual(fmj.sections.map((s) => s.piecesJointes!.length), [1]);
});

test('ouvrir : mêmes règles de lecture, flux aux mêmes octets', async () => {
  const m = monde();
  const ouv = await deposerPieceJointe(m.db, m.marc.id, false, m.pub.id, flux(JPG), 'o.jpg', false, m.racine);
  const sec = await deposerPieceJointe(m.db, m.marc.id, false, m.pub.id, flux(PNG), 's.png', true, m.racine);
  const o = await ouvrirPieceJointe(m.db, { compteId: m.lea.id }, ouv.id, m.racine);
  const chunks: Buffer[] = [];
  for await (const c of o.flux) chunks.push(c as Buffer);
  assert.deepEqual(Buffer.concat(chunks), JPG);
  assert.equal(o.type, 'image/jpeg');
  assert.equal(o.taille, 6);
  assert.equal(await code(() => ouvrirPieceJointe(m.db, { compteId: m.lea.id }, sec.id, m.racine)), 'introuvable');
  assert.equal(await code(() => ouvrirPieceJointe(m.db, { compteId: m.marc.id, modeJoueur: true }, sec.id, m.racine)), 'introuvable');
  assert.equal(await code(() => ouvrirPieceJointe(m.db, { compteId: m.zoe.id }, ouv.id, m.racine)), 'introuvable');
  const s = await ouvrirPieceJointe(m.db, { compteId: m.marc.id }, sec.id, m.racine);
  s.flux.destroy();
  // Section later hidden from players: the file is no longer theirs.
  changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.pub.id, { joueursLisent: false });
  assert.equal(await code(() => ouvrirPieceJointe(m.db, { compteId: m.lea.id }, ouv.id, m.racine)), 'introuvable');
});

test('ajouter, marquer, retirer : ni version ni modifie_le de la section ne bougent', async () => {
  const m = monde();
  const avant = version(m.db, m.pub.id);
  const p = await deposerPieceJointe(m.db, m.marc.id, false, m.pub.id, flux(PNG), 'a', false, m.racine);
  marquerSecrete(m.db, m.marc.id, false, p.id, true);
  marquerSecrete(m.db, m.marc.id, false, p.id, false);
  assert.deepEqual(version(m.db, m.pub.id), avant);
  await retirerPieceJointe(m.db, m.marc.id, false, p.id, m.racine);
  assert.deepEqual(version(m.db, m.pub.id), avant);
  assert.equal(lireSection(m.db, { compteId: m.marc.id }, m.u.id, m.f.id, m.pub.id).version, (avant as { version: number }).version);
});

test('retirer une pièce supprime ligne et fichier ; retirer une section supprime ceux de ses pièces seulement', async () => {
  const m = monde();
  const a = await deposerPieceJointe(m.db, m.marc.id, false, m.pub.id, flux(PNG), 'a', false, m.racine);
  await deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, flux(PNG), 'b', true, m.racine);
  await deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, flux(JPG), 'c', false, m.racine);
  assert.equal(fichiers(m.racine).length, 3);
  await retirerPieceJointe(m.db, m.marc.id, false, a.id, m.racine);
  assert.equal(nbLignes(m.db), 2);
  assert.equal(fichiers(m.racine).length, 2);
  retirerSection(m.db, m.marc.id, m.u.id, m.f.id, m.sec.id, m.racine);
  vide(m);
  // Unknown piece.
  assert.equal(await code(() => retirerPieceJointe(m.db, m.marc.id, false, 9999, m.racine)), 'introuvable');
});

test('tmp/ est vidé au démarrage, les fichiers définitifs restent', async () => {
  const m = monde();
  await deposerPieceJointe(m.db, m.marc.id, false, m.sec.id, flux(PNG), 'a', false, m.racine);
  writeFileSync(join(m.racine, 'tmp', 'reste'), 'x');
  await viderTmp(m.racine);
  assert.deepEqual(tmp(m.racine), []);
  assert.equal(fichiers(m.racine).length, 1);
});
