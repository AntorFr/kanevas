// kanevas-taille-images — B-taille-1 : « the import and the export carry the setting as text » (docs/parcours.md).
// Black-box, in stub mode, against the real import API (`PUT /fichiers/:cle`, `PUT /fiches/:cle`) : a script pushes a
// sheet whose image reference keeps its `fichier:cle:` address and carries a setting title; once the key is resolved
// the setting is read back as written and rendered. Literal expectations.
//
// TEST PLAN
//   nominal   : `![p](fichier:cle:img:port "petit-gauche")` pushed after the file → text `![p](fichier:<id> "petit-gauche")`,
//               reading carries img-petit img-gauche
//   bords     : pushed BEFORE the file (waiting key) then the file arrives → same result; a replay of the push changes nothing
//   échec     : a title that is no setting ("Le port") survives the import untouched and does not style the image
//   exclusion : no title → no class (an image without setting reads as before)
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) {
    let c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 200, 30, 30]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ouverts: Array<{ close: () => Promise<unknown> }> = [];
after(async () => {
  for (const a of ouverts) await a.close().catch(() => {});
});

async function monde() {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db));
  ouverts.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const essai = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Essai Kanka') as { id: number }).id;
  return { app, base, essai };
}
type M = Awaited<ReturnType<typeof monde>>;

async function imp(m: M, methode: string, chemin: string, corps?: unknown): Promise<{ statut: number; json: Any; txt: string }> {
  const headers: Record<string, string> = { authorization: `Bearer ${JETON_BOUCHON}` };
  if (corps !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${m.base}/api/import/v1/univers/${m.essai}${chemin}`, { method: methode, headers, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const txt = await r.text();
  let json: Any = null;
  try { json = JSON.parse(txt); } catch { /* not json */ }
  return { statut: r.status, json, txt };
}
async function pousserFichier(m: M, cle: string): Promise<void> {
  const fd = new FormData();
  fd.set('nom', 'port.png');
  fd.set('visibilite', 'joueurs');
  fd.set('fichier', new Blob([png()], { type: 'application/octet-stream' }), 'envoi.bin');
  const r = await fetch(`${m.base}/api/import/v1/univers/${m.essai}/fichiers/${encodeURIComponent(cle)}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
    body: fd,
  });
  assert.ok(r.status < 300, `PUT fichier -> ${r.status} ${await r.text()}`);
}
const fiche = (titre: string, contenu: string) => ({
  type: 'lieu',
  titre,
  sections: [{ cle: 'desc', titre: 'Description', contenu, joueursLisent: true, joueursEcrivent: false }],
});
async function cookie(m: M, compte: string): Promise<string> {
  const r = await fetch(`${m.base}/connexion-bouchon`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `compte=${compte}`,
  });
  const c = /kanevas_session=[^;]+/.exec(r.headers.get('set-cookie') ?? '');
  assert.ok(c, 'session cookie');
  return c[0];
}
async function lire(m: M, compte: string, id: number): Promise<Any> {
  const r = await fetch(`${m.base}/api/univers/${m.essai}/fiches/${id}`, { headers: { cookie: await cookie(m, compte) } });
  assert.equal(r.status, 200);
  return r.json();
}
const idFichier = (m: M, cle: string): number => (m.app.db.prepare('SELECT id FROM fichiers WHERE univers_id = ? AND cle_origine = ?').get(m.essai, cle) as { id: number }).id;

test('B-taille-1 import : le réglage « petit-gauche » poussé avec la fiche est écrit tel quel dans le texte et lu en petit à gauche, par le MJ comme par la joueuse', async () => {
  const m = await monde();
  await pousserFichier(m, 'img:port');
  const id = idFichier(m, 'img:port');
  const r = await imp(m, 'PUT', `/fiches/${encodeURIComponent('lieu:port-taille')}`, fiche('Port Taille', 'Avant\n\n![p](fichier:cle:img:port "petit-gauche")\n\nAprès'));
  assert.equal(r.statut, 200, r.txt);
  for (const compte of ['antor', 'lea']) {
    const v = await lire(m, compte, r.json.id);
    const s = v.sections.find((x: Any) => x.titre === 'Description');
    assert.match(s.html, /<img[^>]*class="[^"]*\bimg-petit\b[^"]*\bimg-gauche\b|<img[^>]*class="[^"]*\bimg-gauche\b[^"]*\bimg-petit\b/, `${compte}: ${s.html}`);
    if (compte === 'antor') assert.equal(s.contenu, `Avant\n\n![p](fichier:${id} "petit-gauche")\n\nAprès`);
    else assert.equal(s.contenu, undefined, 'a reader never gets the source');
  }
});

test('B-taille-1 import : fiche poussée avant son fichier (clé en attente) puis fichier : le réglage est conservé ; le rejeu ne change rien', async () => {
  const m = await monde();
  const corps = fiche('Port Attente', 'Voir ![q](fichier:cle:img:quais "grand-droite")');
  const r1 = await imp(m, 'PUT', `/fiches/${encodeURIComponent('lieu:port-attente')}`, corps);
  assert.equal(r1.statut, 200, r1.txt);
  await pousserFichier(m, 'img:quais');
  const id = idFichier(m, 'img:quais');
  const v1 = await lire(m, 'antor', r1.json.id);
  const s1 = v1.sections.find((x: Any) => x.titre === 'Description');
  assert.equal(s1.contenu, `Voir ![q](fichier:${id} "grand-droite")`);
  assert.match(s1.html, /img-grand/);
  assert.match(s1.html, /img-droite/);
  const r2 = await imp(m, 'PUT', `/fiches/${encodeURIComponent('lieu:port-attente')}`, corps);
  assert.equal(r2.statut, 200, r2.txt);
  const v2 = await lire(m, 'antor', r1.json.id);
  const s2 = v2.sections.find((x: Any) => x.titre === 'Description');
  assert.equal(s2.contenu, `Voir ![q](fichier:${id} "grand-droite")`);
  assert.equal(s2.version, s1.version);
});

test('B-taille-1 import : un titre qui n’est pas un réglage reste dans le texte et ne style pas l’image ; sans titre, aucune classe', async () => {
  const m = await monde();
  await pousserFichier(m, 'img:neutre');
  const id = idFichier(m, 'img:neutre');
  const r = await imp(m, 'PUT', `/fiches/${encodeURIComponent('lieu:port-neutre')}`, fiche('Port Neutre', 'A ![a](fichier:cle:img:neutre "Le port")\n\nB ![b](fichier:cle:img:neutre)'));
  assert.equal(r.statut, 200, r.txt);
  const v = await lire(m, 'antor', r.json.id);
  const s = v.sections.find((x: Any) => x.titre === 'Description');
  assert.equal(s.contenu, `A ![a](fichier:${id} "Le port")\n\nB ![b](fichier:${id})`);
  assert.doesNotMatch(s.html, /img-(petit|moyen|grand|gauche|droite|centre)/);
});
