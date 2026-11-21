// Tests of kanevas-synchro-lecture-fichiers (B-90, AD-149, AD-66, AD-117, AD-139): a token reads the
// library's files and the maps of the universe, through /api/v1 and the import alias.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-lecture-fichiers-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerCarte, reglerCarte, remplacerFond } = await import('../services/cartes.js');
const { modifierFichier } = await import('../services/fichiers.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
const PDF = Buffer.from('%PDF-1.4 tarifs');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function multipart(contenu: Buffer, champs: Record<string, string>) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) {
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="x"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${B}--\r\n`),
  );
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const antor = trouverCompte(app.db, 'antor')!.id;
  const lea = trouverCompte(app.db, 'lea')!.id;
  const jeton = (compteId: number) =>
    creerJeton(app.db, compteId, { nom: 'L', dureeJours: 30, acces: { tous: true, niveauTous: 'lecture' } } as never, app.horloge()).valeur;
  const mj = { authorization: `Bearer ${jeton(antor)}` };
  const joueuse = { authorization: `Bearer ${jeton(lea)}` };
  const ecriture = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/v1/univers/${u.id}`;
  const put = async (cle: string, contenu: Buffer, champs: Record<string, string>) => {
    const m = multipart(contenu, champs);
    const r = await app.inject({
      method: 'PUT',
      url: `/api/import/v1/univers/${u.id}/fichiers/${encodeURIComponent(cle)}`,
      headers: { ...ecriture, 'content-type': m.type },
      payload: m.payload,
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.json().id as number;
  };
  const get = (url: string, h: Record<string, string>) => app.inject({ method: 'GET', url: `${base}${url}`, headers: h });
  return { app, u, antor, lea, mj, joueuse, put, get, base };
}

test('B-90 : GET /fichiers rend id, cle, nom, visibilite, taille, sha256, empreinte ; stable, puis change au renommage et à la visibilité', async () => {
  const { app, u, antor, mj, put, get } = await monter();
  const id = await put('img:a', PNG, { nom: 'a.png' });
  const r1 = await get('/fichiers', mj);
  assert.equal(r1.statusCode, 200, r1.body);
  const f1 = r1.json().fichiers.find((f: { id: number }) => f.id === id);
  assert.equal(f1.cle, 'img:a');
  assert.equal(f1.nom, 'a.png');
  assert.equal(f1.visibilite, 'joueurs');
  assert.equal(f1.taille, PNG.length);
  assert.equal(f1.sha256, sha(PNG));
  assert.match(f1.empreinte, /^[0-9a-f]+$/);
  assert.equal(r1.json().suivant, null);
  const f2 = (await get('/fichiers', mj)).json().fichiers.find((f: { id: number }) => f.id === id);
  assert.equal(f2.empreinte, f1.empreinte);
  modifierFichier(app.db, { compteId: antor }, u.id, id, { nom: 'b.png' });
  const f3 = (await get('/fichiers', mj)).json().fichiers.find((f: { id: number }) => f.id === id);
  assert.notEqual(f3.empreinte, f1.empreinte);
  modifierFichier(app.db, { compteId: antor }, u.id, id, { visibilite: 'mj' });
  const f4 = (await get('/fichiers', mj)).json().fichiers.find((f: { id: number }) => f.id === id);
  assert.notEqual(f4.empreinte, f3.empreinte);
  modifierFichier(app.db, { compteId: antor }, u.id, id, { nom: 'a.png', visibilite: 'joueurs' });
  const f5 = (await get('/fichiers', mj)).json().fichiers.find((f: { id: number }) => f.id === id);
  assert.equal(f5.empreinte, f1.empreinte);
});

test('B-90 : octets remplacés, même nom : sha256 et empreinte changent', async () => {
  const { put, get, mj } = await monter();
  const id = await put('img:r', PNG, { nom: 'r.png' });
  const a = (await get('/fichiers', mj)).json().fichiers.find((f: { id: number }) => f.id === id);
  await put('img:r', PNG2, { nom: 'r.png' });
  const b = (await get('/fichiers', mj)).json().fichiers.find((f: { id: number }) => f.id === id);
  assert.equal(b.sha256, sha(PNG2));
  assert.notEqual(b.empreinte, a.empreinte);
});

test('AD-66 : fichier réservé au MJ : ni listé ni servi pour la joueuse (404 = inconnu), servi au MJ', async () => {
  const { put, get, mj, joueuse } = await monter();
  const id = await put('img:sec', PNG, { nom: 'secret-xyz.png', visibilite: 'mj' });
  const lJ = await get('/fichiers', joueuse);
  assert.equal(lJ.statusCode, 200);
  assert.ok(!lJ.body.includes('secret-xyz'));
  assert.ok(!lJ.json().fichiers.some((f: { id: number }) => f.id === id));
  assert.ok((await get('/fichiers', mj)).json().fichiers.some((f: { id: number }) => f.id === id));
  const ferme = await get('/fichiers/img:sec/contenu', joueuse);
  const ferme2 = await get(`/fichiers/${id}/contenu`, joueuse);
  const inconnu = await get('/fichiers/img:nope/contenu', joueuse);
  assert.equal(ferme.statusCode, 404);
  assert.equal(ferme2.statusCode, 404);
  assert.equal(inconnu.statusCode, 404);
  assert.equal(ferme.body, inconnu.body);
  const ok = await get('/fichiers/img:sec/contenu', mj);
  assert.equal(ok.statusCode, 200);
  assert.equal(sha(ok.rawPayload), sha(PNG));
});

test('B-90 : contenu rend les octets exacts par clé et par id ; image inline, document en pièce jointe', async () => {
  const { put, get, joueuse } = await monter();
  const idImg = await put('img:c', PNG, { nom: 'c.png' });
  const idPdf = await put('doc:c', PDF, { nom: 'tarifs.pdf' });
  for (const ref of ['img:c', String(idImg)]) {
    const r = await get(`/fichiers/${encodeURIComponent(ref)}/contenu`, joueuse);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.rawPayload, PNG);
    assert.equal(r.headers['content-type'], 'image/png');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }
  const d = await get(`/fichiers/${idPdf}/contenu`, joueuse);
  assert.deepEqual(d.rawPayload, PDF);
  assert.equal(d.headers['content-type'], 'application/octet-stream');
  assert.match(String(d.headers['content-disposition']), /^attachment/);
});

test('B-90 : pagination par curseur ?apres, mille par page, sans doublon ni trou ; curseur faux 400', async () => {
  const { app, u, put, get, mj } = await monter();
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) ids.push(await put(`img:p${i}`, PNG, { nom: `p${i}.png` }));
  // 1 002 rows more, cheap: same disk file, no bytes needed for the listing's page rule
  const f = app.db.prepare('SELECT * FROM fichiers WHERE id = ?').get(ids[0]) as Record<string, unknown>;
  const ins = app.db.prepare(
    `INSERT INTO fichiers (univers_id, nom, type, taille, disque, visibilite, empreinte, ajoute_par, ajoute_le, cle_origine)
     VALUES (?, ?, ?, ?, ?, 'joueurs', ?, ?, ?, ?)`,
  );
  for (let i = 0; i < 1001; i++) ins.run(u.id, `n${i}`, f.type, f.taille, `fake-${i}`, f.empreinte, f.ajoute_par, f.ajoute_le, `k${i}`);
  const p1 = (await get('/fichiers', mj)).json();
  assert.equal(p1.fichiers.length, 1000);
  assert.notEqual(p1.suivant, null);
  assert.equal(p1.suivant, p1.fichiers[999].id);
  const p2 = (await get(`/fichiers?apres=${p1.suivant}`, mj)).json();
  assert.equal(p2.fichiers.length, 4);
  assert.equal(p2.suivant, null);
  const tous = [...p1.fichiers, ...p2.fichiers].map((x: { id: number }) => x.id);
  assert.equal(new Set(tous).size, 1004);
  assert.equal((await get('/fichiers?apres=abc', mj)).statusCode, 400);
});

test('B-90 : exactement mille lisibles : une page, suivant nul', async () => {
  const { app, u, put, get, mj } = await monter();
  const id = await put('img:q', PNG, { nom: 'q.png' });
  const f = app.db.prepare('SELECT * FROM fichiers WHERE id = ?').get(id) as Record<string, unknown>;
  const ins = app.db.prepare(
    `INSERT INTO fichiers (univers_id, nom, type, taille, disque, visibilite, empreinte, ajoute_par, ajoute_le) VALUES (?, ?, ?, ?, ?, 'joueurs', ?, ?, ?)`,
  );
  for (let i = 0; i < 999; i++) ins.run(u.id, `n${i}`, f.type, f.taille, `fake-${i}`, f.empreinte, f.ajoute_par, f.ajoute_le);
  const p = (await get('/fichiers', mj)).json();
  assert.equal(p.fichiers.length, 1000);
  assert.equal(p.suivant, null);
});

test('B-90 : cartes — lisibles seules pour la joueuse, sha256 du fond, empreinte qui bouge, mêmes routes sous l\'alias', async () => {
  const { app, u, antor, mj, joueuse, get } = await monter();
  const visible = await creerCarte(app.db, antor, false, u.id, { titre: 'Royaume', forme: 'illustree', fond: Readable.from([PNG]) });
  const cachee = await creerCarte(app.db, antor, false, u.id, { titre: 'Crypte-secrete', forme: 'illustree', fond: Readable.from([PNG2]) });
  const graphe = await creerCarte(app.db, antor, false, u.id, { titre: 'Liens', forme: 'graphe' });
  reglerCarte(app.db, antor, false, visible.id, { visible: true });
  const m = (await get('/cartes', mj)).json();
  assert.equal(m.suivant, null);
  const cm = (id: number) => m.cartes.find((c: { id: number }) => c.id === id);
  assert.equal(cm(visible.id).titre, 'Royaume');
  assert.equal(cm(visible.id).forme, 'illustree');
  assert.equal(cm(visible.id).visible, true);
  assert.equal(cm(visible.id).sha256Fond, sha(PNG));
  assert.equal(cm(cachee.id).visible, false);
  assert.equal(cm(cachee.id).sha256Fond, sha(PNG2));
  assert.equal(cm(graphe.id).sha256Fond, null);
  const j = await get('/cartes', joueuse);
  assert.equal(j.statusCode, 200);
  assert.deepEqual(j.json().cartes.map((c: { id: number }) => c.id), [visible.id]);
  assert.ok(!j.body.includes('Crypte-secrete'));
  // alias
  const a = await app.inject({ method: 'GET', url: `/api/import/v1/univers/${u.id}/cartes`, headers: mj });
  assert.deepEqual(a.json(), m);
  const af = await app.inject({ method: 'GET', url: `/api/import/v1/univers/${u.id}/fichiers`, headers: mj });
  assert.equal(af.statusCode, 200);
  // empreinte: stable, then moves with title, visibility, background
  const e0 = cm(visible.id).empreinte;
  assert.equal((await get('/cartes', mj)).json().cartes.find((c: { id: number }) => c.id === visible.id).empreinte, e0);
  const lire = async () => (await get('/cartes', mj)).json().cartes.find((c: { id: number }) => c.id === visible.id).empreinte;
  reglerCarte(app.db, antor, false, visible.id, { titre: 'Royaume 2' });
  const e1 = await lire();
  assert.notEqual(e1, e0);
  reglerCarte(app.db, antor, false, visible.id, { visible: false });
  const e2 = await lire();
  assert.notEqual(e2, e1);
  await remplacerFond(app.db, antor, false, visible.id, Readable.from([PNG2]));
  const e3 = await lire();
  assert.notEqual(e3, e2);
  assert.equal((await get('/cartes', mj)).json().cartes.find((c: { id: number }) => c.id === visible.id).sha256Fond, sha(PNG2));
});

test('AD-149 : sans jeton 401, jeton d\'un autre univers 404, lecture d\'un compte sans rôle 404', async () => {
  const { app, u, get } = await monter();
  for (const url of ['/fichiers', '/cartes', '/fichiers/x/contenu']) {
    const r = await app.inject({ method: 'GET', url: `/api/v1/univers/${u.id}${url}` });
    assert.equal(r.statusCode, 401);
  }
  const autre = (app.db.prepare("SELECT id FROM univers WHERE nom <> 'Essai Kanka' LIMIT 1").get() as { id: number }).id;
  const antor = trouverCompte(app.db, 'antor')!.id;
  const { valeur } = creerJeton(app.db, antor, { nom: 'S', dureeJours: 30, acces: { tous: false, univers: [{ universId: autre, niveau: 'lecture' }] } } as never, app.horloge());
  for (const url of ['/fichiers', '/cartes']) {
    assert.equal((await get(url, { authorization: `Bearer ${valeur}` })).statusCode, 404);
  }
  assert.equal((await get('/fichiers', {})).statusCode, 401);
});
