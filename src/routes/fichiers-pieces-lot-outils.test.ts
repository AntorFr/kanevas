// Doors of the lot « outils » for `src/e2e/pieces-jointes-besoin.test.ts` (docs/tests-ecran/lot-outils.md): the rights, statuses and served
// types the screen file read through the browser's request client, in-process on the seeded « Lame d'Ébène » (no browser).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, PDF, PNG, monter } from './monde-lot-mediatheque.js';

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

async function monde() {
  const m = await monter();
  const un = (sql: string, ...p: unknown[]) => m.app.db.prepare(sql).get(...p) as Any;
  const section = (fiche: string, titre: string) => {
    const f = m.ficheId(fiche);
    return { fiche: f, id: un('SELECT id FROM sections WHERE fiche_id = ? AND titre = ?', f, titre).id as number };
  };
  const joints = (sid: number) => (un('SELECT COUNT(*) n FROM fichiers_sections WHERE section_id = ? AND joint = 1', sid)).n as number;
  const jointure = (s: { fiche: number; id: number }, fid: number) => `/fiches/${s.fiche}/sections/${s.id}/fichiers/${fid}`;
  return { ...m, section, joints, jointure };
}

test('B-24: a player who only reads cannot add, unjoin, reserve or delete a piece, and still reads a public one', async () => {
  const w = await monde();
  const s = w.section('Port-Sel', 'Description');
  const ajout = await w.envoyer(w.antor, { section: String(s.id), maniere: 'joint' }, 'public.pdf', 'application/pdf', PDF);
  assert.equal(ajout.statusCode, 201);
  const f = ajout.json();
  assert.equal(f.visibilite, 'joueurs');
  const avant = w.joints(s.id);
  const lea = await w.envoyer(w.lea, { section: String(s.id), maniere: 'joint' }, 'x.bin', 'application/octet-stream', Buffer.from([1]));
  assert.equal(lea.statusCode, 403);
  assert.equal((await w.suppr(w.lea, w.jointure(s, f.id))).statusCode, 403);
  assert.equal((await w.patch(w.lea, `/fichiers/${f.id}`, { visibilite: 'mj' })).statusCode, 403);
  assert.equal((await w.suppr(w.lea, `/fichiers/${f.id}`)).statusCode, 403);
  assert.equal(w.joints(s.id), avant);
  assert.equal((await w.fichier(w.antor, 'public.pdf')).visibilite, 'joueurs');
  assert.equal((await w.get(w.lea, `/fichiers/${f.id}`)).statusCode, 200);
});

test('B-24: the author of a section with write cannot reserve her own piece (403) but unjoins it', async () => {
  const w = await monde();
  const s = w.section('Léa Brisefer', 'Notes de la table');
  const r = await w.envoyer(w.lea, { section: String(s.id), maniere: 'joint' }, 'mien.png', 'image/png', PNG);
  assert.equal(r.statusCode, 201);
  const f = r.json();
  assert.equal((await w.patch(w.lea, `/fichiers/${f.id}`, { visibilite: 'mj' })).statusCode, 403);
  assert.equal((await w.fichier(w.antor, 'mien.png')).visibilite, 'mj', 'a piece added in a section closed to the players enters reserved (AD-117)');
  assert.equal((await w.suppr(w.lea, w.jointure(s, f.id))).statusCode, 204);
  assert.equal(w.joints(s.id), 0);
});

test('B-24: the instance admin (not a member) gets 404 on a piece; no session gets a refusal and no bytes', async () => {
  const w = await monde();
  const s = w.section('Port-Sel', 'Description');
  const f = (await w.envoyer(w.antor, { section: String(s.id), maniere: 'joint' }, 'public.png', 'image/png', PNG)).json();
  assert.equal((await w.get(w.admin, `/fichiers/${f.id}`)).statusCode, 404);
  const anonyme = await w.app.inject({ method: 'GET', url: w.api(`/fichiers/${f.id}`) });
  assert.notEqual(anonyme.statusCode, 200);
  assert.ok(!anonyme.rawPayload.includes(PNG.subarray(0, 8)));
});

test('B-24: an empty file is refused (400 fichier_vide) and attaches nothing, the next file still goes in', async () => {
  const w = await monde();
  const s = w.section('Port-Sel', 'Description');
  const avant = w.joints(s.id);
  const vide = await w.envoyer(w.antor, { section: String(s.id), maniere: 'joint' }, 'notes.txt', 'text/plain', Buffer.alloc(0));
  assert.equal(vide.statusCode, 400);
  assert.equal(vide.json().code, 'fichier_vide');
  assert.equal(w.joints(s.id), avant);
  assert.equal((await w.envoyer(w.antor, { section: String(s.id), maniere: 'joint' }, 'petit.bin', 'application/octet-stream', Buffer.alloc(842, 1))).statusCode, 201);
  assert.equal(w.joints(s.id), avant + 1);
  assert.ok(!(await w.noms(w.antor)).includes('notes.txt'));
});

test('B-24: an SVG or an HTML named .png is served as a download and never inline; a PNG named .bin is served as image/png; all nosniff', async () => {
  const w = await monde();
  const s = w.section('Port-Sel', 'Description');
  const dep = async (nom: string, b: Buffer) => (await w.envoyer(w.antor, { section: String(s.id), maniere: 'joint' }, nom, 'application/octet-stream', b)).json();
  const [svg, faux, vrai] = [await dep('image.svg', SVG), await dep('faux.png', HTML), await dep('vrai.bin', PNG)];
  for (const f of [svg, faux]) {
    const r = await w.get(w.antor, `/fichiers/${f.id}`);
    assert.equal(r.statusCode, 200);
    assert.match(String(r.headers['content-disposition']), /^attachment/);
    assert.ok(!String(r.headers['content-type']).startsWith('image/svg'));
    assert.ok(!String(r.headers['content-type']).startsWith('text/html'));
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }
  const r = await w.get(w.antor, `/fichiers/${vrai.id}`);
  assert.equal(r.headers['content-type'], 'image/png');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
});

test('B-24: the 101st piece is refused with the number for the GM (409) and without it for a player (403); nothing is added', async () => {
  const w = await monde();
  const s = w.section('Léa Brisefer', 'Notes de la table');
  for (let i = 0; i < 100; i++) assert.equal((await w.envoyer(w.antor, { section: String(s.id), maniere: 'joint' }, `p${i}.bin`, 'application/octet-stream', Buffer.from([i + 1]))).statusCode, 201);
  const lea = await w.envoyer(w.lea, { section: String(s.id), maniere: 'joint' }, 'de-trop.bin', 'application/octet-stream', Buffer.from([1]));
  assert.equal(lea.statusCode, 403);
  assert.ok(!lea.body.includes('100'), lea.body);
  const antor = await w.envoyer(w.antor, { section: String(s.id), maniere: 'joint' }, 'de-trop.bin', 'application/octet-stream', Buffer.from([1]));
  assert.equal(antor.statusCode, 409);
  assert.equal(antor.json().code, 'limite_pieces');
  assert.equal(w.joints(s.id), 100);
  assert.ok(!(await w.noms(w.antor)).includes('de-trop.bin'));
});

test('B-24: removing a section that carries a portrait removes its reference, never the file, still served', async () => {
  const w = await monde();
  const s = w.section('Port-Sel', 'Description');
  const f = (await w.envoyer(w.antor, { section: String(s.id), maniere: 'joint' }, 'portrait.png', 'image/png', PNG)).json();
  assert.equal((await w.suppr(w.antor, `/fiches/${s.fiche}/sections/${s.id}`)).statusCode, 204);
  assert.equal((await w.get(w.antor, `/fichiers/${f.id}`)).statusCode, 200);
  assert.ok((await w.noms(w.antor)).includes('portrait.png'));
});

test('P-7: the piece Léa adds in a section closed to the players enters reserved and stays so when the section opens; Teo reads it only once the GM makes it visible', async () => {
  const w = await monde();
  const s = w.section('Léa Brisefer', 'Notes de la table');
  const r = await w.envoyer(w.lea, { section: String(s.id), maniere: 'joint' }, 'portrait-lea.png', 'image/png', PNG);
  assert.equal(r.statusCode, 201);
  const id = r.json().id as number;
  const univers = (w.app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as Any).id;
  w.app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) SELECT ?, id, 'joueur' FROM comptes WHERE username = 'teo'").run(univers);
  assert.equal((await w.fichier(w.antor, 'portrait-lea.png')).visibilite, 'mj');
  assert.equal((await w.get(w.teo, `/fichiers/${id}`)).statusCode, 404, 'closed section, reserved piece');
  assert.equal((await w.patch(w.antor, `/fiches/${s.fiche}/sections/${s.id}`, { joueursLisent: true })).statusCode, 200);
  assert.equal((await w.fichier(w.antor, 'portrait-lea.png')).visibilite, 'mj', 'opening the section does not open the piece');
  assert.equal((await w.get(w.teo, `/fichiers/${id}`)).statusCode, 404);
  assert.equal((await w.patch(w.antor, `/fichiers/${id}`, { visibilite: 'joueurs' })).statusCode, 200);
  assert.equal((await w.get(w.teo, `/fichiers/${id}`)).statusCode, 200);
  assert.equal((await w.suppr(w.teo, w.jointure(s, id))).statusCode, 403, 'a player without write cannot unjoin');
});
