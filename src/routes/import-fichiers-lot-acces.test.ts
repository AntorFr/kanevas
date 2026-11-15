// Doors of lot « acces » (docs/tests-ecran/lot-acces.md): what `src/e2e/import-fichiers-*.test.ts` proved through HTTP and
// the browser, proved here through `inject` (kanevas-import-fichiers: B-48, B-49, B-56, AD-111, P-10).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'import-fichiers-lot-acces-'));
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ------------------------------------------------------------------ bytes
function crc32(buf: Buffer): number {
  let c: number;
  let crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
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
/** A valid 1×1 PNG of the given colour (two colours are two different files). */
function png(r: number, g: number, b: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, r, g, b]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const ROUGE = png(255, 0, 0);
const VERT = png(0, 255, 0);
const BLEU = png(0, 0, 255);
const pdf = (texte: string) => Buffer.from(`%PDF-1.4\n1 0 obj<< /Title (${texte}) >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n`);

function multipart(contenu: Buffer, champs: Record<string, string>) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="envoi.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`), contenu, Buffer.from(`\r\n--${B}--\r\n`));
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

// ------------------------------------------------------------------ world
type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const section = (cle: string, titre: string, contenu: string, extra: Record<string, unknown> = {}) => ({ cle, titre, contenu, joueursLisent: true, joueursEcrivent: false, ...extra });

async function monde() {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db), 'the stub world is seeded');
  const essai = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Essai Kanka') as { id: number }).id;
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const base = `/api/import/v1/univers/${essai}`;
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const m = {
    app, essai, antor, lea,
    imp: (methode: string, chemin: string, payload?: unknown, headers: Record<string, string> = auth) =>
      app.inject({ method: methode as 'GET', url: `${base}${chemin}`, headers, payload: payload as object | undefined }),
    rest: (h: { cookie: string }, methode: string, url: string, payload?: unknown) => app.inject({ method: methode as 'GET', url, headers: h, payload: payload as object | undefined }),
    putFichier(cle: string, o: { nom?: string; visibilite?: string; octets: Buffer; lot?: number; headers?: Record<string, string> }) {
      const champs: Record<string, string> = {};
      if (o.nom !== undefined) champs.nom = o.nom;
      if (o.visibilite !== undefined) champs.visibilite = o.visibilite;
      const mp = multipart(o.octets, champs);
      return app.inject({
        method: 'PUT',
        url: `${base}/fichiers/${encodeURIComponent(cle)}${o.lot === undefined ? '' : `?lot=${o.lot}`}`,
        headers: { ...(o.headers ?? auth), 'content-type': mp.type },
        payload: mp.payload,
      });
    },
    putFiche: (cle: string, corps: unknown, lot?: number) => m.imp('PUT', `/fiches/${encodeURIComponent(cle)}${lot === undefined ? '' : `?lot=${lot}`}`, corps),
    async ouvrirLot(): Promise<number> {
      const r = await m.imp('POST', '/lots');
      assert.ok(r.statusCode === 200 || r.statusCode === 201, r.body);
      return r.json().lotId;
    },
    async clore(lot: number): Promise<Any> {
      const r = await m.imp('POST', `/lots/${lot}/clore`);
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    },
    /** One whole batch: open, run `corps` with its id, close. */
    async lotComplet<T>(corps: (lot: number) => Promise<T>): Promise<{ res: T; rapport: Any; lot: number }> {
      const lot = await m.ouvrirLot();
      const res = await corps(lot);
      return { res, rapport: await m.clore(lot), lot };
    },
    fiche: (h: { cookie: string }, id: number) => app.inject({ method: 'GET', url: `/api/univers/${essai}/fiches/${id}`, headers: h }),
    biblio: (h: { cookie: string }, q = '') => app.inject({ method: 'GET', url: `/api/univers/${essai}/fichiers${q}`, headers: h }),
    idFichier: (cle: string): number => (app.db.prepare('SELECT id FROM fichiers WHERE univers_id = ? AND cle_origine = ?').get(essai, cle) as { id: number }).id,
    nb: (sql: string): number => (app.db.prepare(sql).get() as { n: number }).n,
  };
  return m;
}

// ------------------------------------------------------------------ P-10 / critère de sortie
test('criterion > a sheet pushed before its files is created with 2 waiting references, the files resolve them without a version, the replay is unchanged everywhere', async () => {
  const m = await monde();
  const racine = await m.imp('GET', '');
  assert.equal(racine.statusCode, 200, racine.body);
  assert.equal(racine.json().limites.fichiersJointsParSection, 100);
  const base = await m.lotComplet(async () => null);
  const attenteAvant: number = base.rapport.enAttente;
  const fiche = { type: 'lieu', titre: 'Les Quais', sections: [section('description', 'Description', 'Avant ![](fichier:cle:img:quais) Après', { fichiers: ['doc:tarifs'] })] };
  const l1 = await m.lotComplet((lot) => m.putFiche('lieu:quais', fiche, lot));
  assert.equal(l1.res.statusCode, 200, l1.res.body);
  assert.equal(l1.res.json().etat, 'creee');
  assert.equal(l1.res.json().avertissements.length, 2, 'two waiting references, no more');
  assert.match(l1.res.json().avertissements.join('\n'), /img:quais/);
  assert.match(l1.res.json().avertissements.join('\n'), /doc:tarifs/);
  assert.equal(l1.rapport.enAttente, attenteAvant + 2);
  assert.equal(l1.rapport.compteurs.fiches.creees, 1);
  const fid: number = l1.res.json().id;
  const coteLea = await m.fiche(m.lea, fid);
  assert.ok(!coteLea.body.includes('img:quais') && !coteLea.body.includes('doc:tarifs'), 'the API never sends the keys to Léa');
  const avant = (await m.fiche(m.antor, fid)).json();
  const l2 = await m.lotComplet(async (lot) => [
    await m.putFichier('img:quais', { nom: 'Quais', octets: ROUGE, lot }),
    await m.putFichier('doc:tarifs', { nom: 'Tarifs du port', octets: pdf('tarifs'), lot }),
  ]);
  assert.equal(l2.res[0]!.statusCode, 200, l2.res[0]!.body);
  assert.equal(l2.res[0]!.json().etat, 'creee');
  assert.equal(l2.res[1]!.json().etat, 'creee');
  assert.equal(l2.rapport.compteurs.fichiers.creees, 2);
  assert.equal(l2.rapport.enAttente, attenteAvant, 'the two references are resolved');
  const apres = (await m.fiche(m.antor, fid)).json();
  assert.equal(apres.sections[0].version, avant.sections[0].version, 'resolving does not create a version');
  assert.equal(apres.modifieLe, avant.modifieLe, 'nor move the modification date');
  const l3 = await m.lotComplet(async (lot) => ({
    fiche: await m.putFiche('lieu:quais', fiche, lot),
    img: await m.putFichier('img:quais', { nom: 'Quais', octets: ROUGE, lot }),
    doc: await m.putFichier('doc:tarifs', { nom: 'Tarifs du port', octets: pdf('tarifs'), lot }),
  }));
  assert.equal(l3.res.fiche.json().etat, 'inchangee');
  assert.equal(l3.res.img.json().etat, 'inchangee');
  assert.equal(l3.res.doc.json().etat, 'inchangee');
  assert.equal(l3.rapport.compteurs.fiches.inchangees, 1);
  assert.equal(l3.rapport.compteurs.fichiers.inchangees, 2);
  assert.equal(l3.rapport.compteurs.fiches.creees + l3.rapport.compteurs.fichiers.creees + l3.rapport.compteurs.fichiers.mises_a_jour, 0);
  assert.equal(l3.rapport.avertissements, 0);
});

test('B-56 GM-only file > a file sent mj is not in Léa’s library, its bytes are refused to her and served to the GM, the sheet shows the placeholder; made visible by the GM the replay does not restore it and the lot says so', async () => {
  const m = await monde();
  const f = await m.lotComplet((lot) => m.putFichier('img:plan', { nom: 'Plan du Repaire', visibilite: 'mj', octets: BLEU, lot }));
  assert.equal(f.res.json().etat, 'creee');
  const id = m.idFichier('img:plan');
  const fiche = await m.lotComplet((lot) =>
    m.putFiche('lieu:repaire', { type: 'lieu', titre: 'Le Repaire', sections: [section('d', 'Description', 'Un plan : ![plan](fichier:cle:img:plan)')] }, lot),
  );
  assert.equal(fiche.res.json().etat, 'creee');
  assert.deepEqual(fiche.res.json().avertissements, [], 'the file is known: nothing waits');
  const biblioLea = await m.biblio(m.lea);
  assert.equal(biblioLea.statusCode, 200);
  assert.ok(!biblioLea.body.includes('Plan du Repaire'), 'a GM-only file is not in the player library');
  const octetsLea = await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fichiers/${id}`);
  assert.notEqual(octetsLea.statusCode, 200, 'its bytes are refused to Léa');
  const octetsAntor = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fichiers/${id}`);
  assert.equal(octetsAntor.statusCode, 200, 'but served to the GM');
  assert.deepEqual(octetsAntor.rawPayload, BLEU, 'the very bytes that were sent');
  const vueLea = (await m.fiche(m.lea, fiche.res.json().id)).body;
  assert.ok(!vueLea.includes('<img'), 'no image for Léa');
  assert.ok(vueLea.includes('Image réservée au MJ.'), 'the documented placeholder');
  const patch = await m.rest(m.antor, 'PATCH', `/api/univers/${m.essai}/fichiers/${id}`, { visibilite: 'joueurs' });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.ok((await m.biblio(m.lea)).body.includes('Plan du Repaire'), 'Léa now has the file: the setting was made');
  const rejeu = await m.lotComplet((lot) => m.putFichier('img:plan', { nom: 'Plan du Repaire', visibilite: 'mj', octets: BLEU, lot }));
  assert.equal(rejeu.res.statusCode, 200, rejeu.res.body);
  assert.equal(rejeu.res.json().etat, 'inchangee', 'nothing else changed');
  assert.ok(rejeu.res.json().avertissements.some((a: string) => /visibilité modifiée dans Kanevas : non écrasée/.test(a)), rejeu.res.body);
  assert.equal(rejeu.rapport.avertissements, 1);
  assert.ok((await m.biblio(m.lea)).body.includes('Plan du Repaire'), 'still visible to the players after the replay');
});

test('B-56 empty file > 0 byte is refused (400, champ fichier), counted refused in the batch with its key and the reason « fichier vide : 0 octet, refusé », nothing stored, the next file is written', async () => {
  const m = await monde();
  const l = await m.lotComplet(async (lot) => ({
    vide: await m.putFichier('doc:vide', { nom: 'Vide', octets: Buffer.alloc(0), lot }),
    bon: await m.putFichier('img:ok', { nom: 'Rouge', octets: ROUGE, lot }),
  }));
  assert.equal(l.res.vide.statusCode, 400, l.res.vide.body);
  assert.equal(l.res.vide.json().champ, 'fichier');
  assert.equal(l.res.vide.json().code, 'invalide');
  assert.equal(l.res.bon.json().etat, 'creee', 'the next file of the batch is written');
  assert.equal(l.rapport.compteurs.fichiers.refusees, 1);
  assert.equal(l.rapport.compteurs.fichiers.creees, 1);
  const refus = l.rapport.rapport.find((r: Any) => r.cle === 'doc:vide');
  assert.ok(refus, 'the refusal is in the report with its key');
  assert.equal(refus.gravite, 'refus');
  assert.equal(refus.raison, 'fichier vide : 0 octet, refusé');
  const lib = await m.biblio(m.antor);
  assert.ok(!lib.body.includes('Vide'), 'nothing stored for the empty file');
  assert.ok(lib.body.includes('Rouge'));
});

test('B-56 without batch > an empty file is refused without a batch; a closed batch refuses the write (409 lot_clos)', async () => {
  const m = await monde();
  assert.equal((await m.putFichier('doc:vide', { nom: 'Vide', octets: Buffer.alloc(0) })).statusCode, 400);
  const lot = await m.ouvrirLot();
  await m.clore(lot);
  const clos = await m.putFichier('img:tard', { nom: 'Tard', octets: ROUGE, lot });
  assert.equal(clos.statusCode, 409, clos.body);
  assert.equal(clos.json().code, 'lot_clos');
});

test('B-56 nominal > an image and a document enter the library, visible to players by default even without sheet; same bytes unchanged, other bytes updated and served', async () => {
  const m = await monde();
  const l1 = await m.lotComplet(async (lot) => ({
    img: await m.putFichier('img:orpheline', { nom: 'Orpheline', octets: ROUGE, lot }),
    doc: await m.putFichier('doc:orphelin', { nom: 'Règlement du port', octets: pdf('v1'), lot }),
  }));
  assert.equal(l1.res.img.json().etat, 'creee');
  assert.equal(l1.res.doc.json().etat, 'creee');
  assert.deepEqual(l1.res.img.json().avertissements, []);
  assert.equal(l1.rapport.compteurs.fichiers.creees, 2);
  const lib = await m.biblio(m.lea);
  assert.ok(lib.body.includes('Orpheline') && lib.body.includes('Règlement du port'), 'players read what the script sent without a visibility');
  const nonUtilises = await m.biblio(m.antor, '?usage=non_utilises');
  assert.ok(nonUtilises.body.includes('Orpheline') && nonUtilises.body.includes('Règlement du port'), 'a file no sheet uses is in the library');
  assert.ok(!(await m.biblio(m.antor, '?usage=utilises')).body.includes('Orpheline'));
  const l2 = await m.lotComplet((lot) => m.putFichier('doc:orphelin', { nom: 'Règlement du port', octets: pdf('v1'), lot }));
  assert.equal(l2.res.json().etat, 'inchangee');
  assert.equal(l2.rapport.compteurs.fichiers.inchangees, 1);
  assert.equal(l2.rapport.compteurs.fichiers.creees, 0);
  const l3 = await m.lotComplet((lot) => m.putFichier('doc:orphelin', { nom: 'Règlement du port', octets: pdf('v2'), lot }));
  assert.equal(l3.res.json().etat, 'mise_a_jour');
  assert.equal(l3.rapport.compteurs.fichiers.mises_a_jour, 1);
  const servi = await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fichiers/${m.idFichier('doc:orphelin')}`);
  assert.equal(servi.statusCode, 200);
  assert.deepEqual(servi.rawPayload, pdf('v2'), 'the bytes of the second send');
  assert.equal(m.nb("SELECT count(*) n FROM fichiers WHERE cle_origine = 'doc:orphelin'"), 1, 'no duplicate by replay');
});

test('B-56 references > a sheet references a file already there by text, joined files and illustration: Léa reads the image, the document link and the join, nothing waits, the replay is unchanged', async () => {
  const m = await monde();
  await m.lotComplet(async (lot) => [
    await m.putFichier('img:quais', { nom: 'Quais', octets: ROUGE, lot }),
    await m.putFichier('img:blason', { nom: 'Blason', octets: VERT, lot }),
    await m.putFichier('doc:tarifs', { nom: 'Tarifs du port', octets: pdf('t'), lot }),
    await m.putFichier('doc:charte', { nom: 'Charte', octets: pdf('c'), lot }),
  ]);
  const idQuais = m.idFichier('img:quais');
  const idTarifs = m.idFichier('doc:tarifs');
  const corps = {
    type: 'lieu',
    titre: 'Le Port',
    illustration: 'img:blason',
    sections: [section('d', 'Description', 'Voir ![quais](fichier:cle:img:quais) et le [tarif](fichier:cle:doc:tarifs).', { fichiers: ['doc:charte'] })],
  };
  const r = await m.lotComplet((lot) => m.putFiche('lieu:port', corps, lot));
  assert.equal(r.res.json().etat, 'creee');
  assert.deepEqual(r.res.json().avertissements, []);
  assert.equal(r.rapport.enAttente, 1, 'only the seeded link still waits');
  const vue = (await m.fiche(m.lea, r.res.json().id)).json();
  assert.ok(vue.illustration, 'the illustration is the blason');
  assert.equal(vue.sections[0].piecesJointes.length, 1);
  assert.match(vue.sections[0].piecesJointes[0].nom, /Charte/);
  assert.ok(vue.sections[0].html.includes(`/fichiers/${idQuais}`), 'the image points at the library file');
  assert.ok(vue.sections[0].html.includes(`/fichiers/${idTarifs}`), 'the document link points at the library file');
  assert.ok(!vue.sections[0].html.includes('fichier:cle'), 'no raw key is left in what a reader gets');
  const rej = await m.lotComplet((lot) => m.putFiche('lieu:port', corps, lot));
  assert.equal(rej.res.json().etat, 'inchangee');
});

test('B-56 bounds > an illustration naming a document is refused (400 pas_une_image) and counted; a name of 200 characters passes, 201 or empty is refused', async () => {
  const m = await monde();
  await m.lotComplet((lot) => m.putFichier('doc:tarifs', { nom: 'Tarifs', octets: pdf('t'), lot }));
  const lot = await m.ouvrirLot();
  const r = await m.putFiche('lieu:x', { type: 'lieu', titre: 'X', illustration: 'doc:tarifs', sections: [] }, lot);
  assert.equal(r.statusCode, 400, r.body);
  assert.ok(r.body.includes('pas_une_image'), r.body);
  const clos = await m.clore(lot);
  assert.equal(clos.compteurs.fiches.refusees, 1, 'counted as refused');
  assert.ok(clos.rapport.some((x: Any) => x.cle === 'lieu:x' && x.gravite === 'refus'));
  assert.equal((await m.putFichier('img:n0', { nom: '', octets: ROUGE })).statusCode, 400, 'empty name');
  const nom200 = await m.putFichier('img:n200', { nom: 'n'.repeat(200), octets: ROUGE });
  assert.equal(nom200.statusCode, 200, nom200.body);
  assert.equal((await m.putFichier('img:n201', { nom: 'n'.repeat(201), octets: ROUGE })).statusCode, 400, '201 characters');
  assert.equal(m.nb("SELECT count(*) n FROM fichiers WHERE cle_origine IN ('img:n0','img:n201')"), 0);
});

test('B-56 refusals > no token, a wrong token or the cookie: 401 jeton_invalide, nothing written, no batch; another universe: 404', async () => {
  const m = await monde();
  const lotsAvant = (await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/lots`)).json().length;
  const sans = await m.putFichier('img:x', { nom: 'X', octets: ROUGE, headers: {} });
  assert.equal(sans.statusCode, 401);
  assert.deepEqual(sans.json(), { message: 'Jeton invalide.', code: 'jeton_invalide' });
  assert.equal((await m.putFichier('img:x', { nom: 'X', octets: ROUGE, headers: { authorization: 'Bearer kvs_' + 'A'.repeat(43) } })).statusCode, 401);
  assert.equal((await m.putFichier('img:x', { nom: 'X', octets: ROUGE, headers: m.antor })).statusCode, 401, 'the session cookie opens nothing on the import API');
  assert.equal(m.nb("SELECT count(*) n FROM fichiers WHERE cle_origine = 'img:x'"), 0, 'nothing written');
  assert.equal((await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/lots`)).json().length, lotsAvant, 'no batch opened');
  const lame = (m.app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Lame d'Ébène") as { id: number }).id;
  const mp = multipart(ROUGE, { nom: 'X' });
  const ailleurs = await m.app.inject({ method: 'PUT', url: `/api/import/v1/univers/${lame}/fichiers/img%3Ax`, headers: { authorization: `Bearer ${JETON_BOUCHON}`, 'content-type': mp.type }, payload: mp.payload });
  assert.equal(ailleurs.statusCode, 404, 'the token is good for its own universe only');
  assert.equal(m.nb("SELECT count(*) n FROM fichiers WHERE cle_origine = 'img:x'"), 0);
});

test('B-48 files > name and visibility changed in Kanevas are not restored, each is named in the lot; the new bytes are written', async () => {
  const m = await monde();
  await m.lotComplet((lot) => m.putFichier('doc:reglement', { nom: 'Règlement', visibilite: 'mj', octets: pdf('v1'), lot }));
  const id = m.idFichier('doc:reglement');
  const patch = await m.rest(m.antor, 'PATCH', `/api/univers/${m.essai}/fichiers/${id}`, { nom: 'Règlement révisé par Antor', visibilite: 'joueurs' });
  assert.equal(patch.statusCode, 200, patch.body);
  const l = await m.lotComplet((lot) => m.putFichier('doc:reglement', { nom: 'Règlement', visibilite: 'mj', octets: pdf('v2'), lot }));
  assert.equal(l.res.statusCode, 200, l.res.body);
  assert.equal(l.res.json().etat, 'mise_a_jour', 'the new bytes are written');
  const av: string[] = l.res.json().avertissements;
  assert.equal(av.length, 2, `one warning per protected field: ${av.join(' | ')}`);
  assert.ok(av.some((a) => /nom modifié dans Kanevas : non écrasé/.test(a)), av.join(' | '));
  assert.ok(av.some((a) => /visibilité modifiée dans Kanevas : non écrasée/.test(a)), av.join(' | '));
  assert.equal(l.rapport.avertissements, 2);
  assert.ok(l.rapport.rapport.every((r: Any) => r.cle === 'doc:reglement'), 'the report names the key of the file');
  const lib = await m.biblio(m.lea);
  assert.ok(lib.body.includes('Règlement révisé par Antor'), 'the name set in Kanevas stays');
  assert.ok(!lib.body.includes('"Règlement"'), 'the script name did not come back');
  const octets = await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fichiers/${id}`);
  assert.equal(octets.statusCode, 200, 'still visible to the players');
  assert.deepEqual(octets.rawPayload, pdf('v2'));
});

test('B-48 files > only the name changed in Kanevas: one warning, the visibility of the script applies', async () => {
  const m = await monde();
  await m.lotComplet((lot) => m.putFichier('img:a', { nom: 'A', visibilite: 'joueurs', octets: ROUGE, lot }));
  const id = m.idFichier('img:a');
  assert.equal((await m.rest(m.antor, 'PATCH', `/api/univers/${m.essai}/fichiers/${id}`, { nom: 'A renommée' })).statusCode, 200);
  const l = await m.lotComplet((lot) => m.putFichier('img:a', { nom: 'A', visibilite: 'mj', octets: ROUGE, lot }));
  assert.equal(l.res.json().etat, 'mise_a_jour');
  assert.equal(l.res.json().avertissements.length, 1, l.res.body);
  assert.match(l.res.json().avertissements[0], /nom modifié dans Kanevas : non écrasé/);
  assert.ok(!(await m.biblio(m.lea)).body.includes('A renommée'), 'the visibility of the script was applied: Léa no longer sees it');
});

test('B-48 files > the illustration and the joined files changed in Kanevas are not restored by the replay, which names each and writes the rest', async () => {
  const m = await monde();
  await m.lotComplet(async (lot) => [
    await m.putFichier('img:a', { nom: 'Image A', octets: ROUGE, lot }),
    await m.putFichier('img:b', { nom: 'Image B', octets: VERT, lot }),
    await m.putFichier('doc:x', { nom: 'Doc X', octets: pdf('x'), lot }),
    await m.putFichier('doc:y', { nom: 'Doc Y', octets: pdf('y'), lot }),
  ]);
  const fiche = (titre: string) => ({ type: 'lieu', titre, illustration: 'img:a', sections: [section('d', 'Description', 'Texte.', { fichiers: ['doc:x'] })] });
  const l1 = await m.lotComplet((lot) => m.putFiche('lieu:q', fiche('Quais'), lot));
  assert.equal(l1.res.json().etat, 'creee');
  const fid: number = l1.res.json().id;
  let vue = (await m.fiche(m.antor, fid)).json();
  const sid: number = vue.sections[0].id;
  const ill = await m.rest(m.antor, 'PUT', `/api/univers/${m.essai}/fiches/${fid}/illustration`, { fichierId: m.idFichier('img:b') });
  assert.equal(ill.statusCode, 200, ill.body);
  assert.equal((await m.rest(m.antor, 'DELETE', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}/fichiers/${m.idFichier('doc:x')}`)).statusCode, 204);
  assert.equal((await m.rest(m.antor, 'POST', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}/fichiers`, { fichierId: m.idFichier('doc:y') })).statusCode, 201);
  const l2 = await m.lotComplet((lot) => m.putFiche('lieu:q', fiche('Quais de Port-Sel'), lot));
  assert.equal(l2.res.json().etat, 'mise_a_jour', 'the rest is written');
  const av: string[] = l2.res.json().avertissements;
  assert.ok(av.some((a) => /illustration/i.test(a)), `the illustration is named: ${av.join(' | ')}`);
  assert.ok(av.some((a) => /fichiers? joints?|jointe/i.test(a)), `the joined files are named: ${av.join(' | ')}`);
  vue = (await m.fiche(m.antor, fid)).json();
  assert.equal(vue.titre, 'Quais de Port-Sel');
  assert.equal(vue.illustration.id, m.idFichier('img:b'), 'the illustration chosen in Kanevas stays');
  const noms: string = vue.sections[0].piecesJointes.map((p: Any) => p.nom).join('|');
  assert.ok(noms.includes('Doc Y'), noms);
  assert.ok(!noms.includes('Doc X'), 'the file Antor removed does not come back: ' + noms);
});

test('AD-111 limit > 100 joined files per section are accepted, 101 refused (400 invalide, champ fichiers, counted refused); GET / says 100', async () => {
  const m = await monde();
  const cles = Array.from({ length: 101 }, (_, i) => `doc:n${i}`);
  await m.lotComplet(async (lot) => {
    for (const c of cles) await m.putFichier(c, { nom: c, octets: pdf(c), lot });
    return null;
  });
  const lot = await m.ouvrirLot();
  const cent = await m.putFiche('lieu:cent', { type: 'lieu', titre: 'Cent', sections: [section('n', 'Notes', 'x', { fichiers: cles.slice(0, 100) })] }, lot);
  assert.equal(cent.statusCode, 200, cent.body);
  assert.equal(cent.json().etat, 'creee');
  assert.deepEqual(cent.json().avertissements, []);
  const trop = await m.putFiche('lieu:trop', { type: 'lieu', titre: 'Trop', sections: [section('n', 'Notes', 'x', { fichiers: cles })] }, lot);
  assert.equal(trop.statusCode, 400, trop.body);
  assert.equal(trop.json().code, 'invalide');
  assert.equal(trop.json().champ, 'fichiers');
  const rap = await m.clore(lot);
  assert.equal(rap.compteurs.fiches.creees, 1);
  assert.equal(rap.compteurs.fiches.refusees, 1);
  assert.ok(rap.rapport.some((r: Any) => r.cle === 'lieu:trop' && r.gravite === 'refus'));
  assert.equal((await m.fiche(m.antor, cent.json().id)).json().sections[0].piecesJointes.length, 100);
  assert.equal(m.nb("SELECT count(*) n FROM fiches WHERE cle_origine = 'lieu:trop'"), 0, 'the refused sheet was not written');
  assert.equal((await m.imp('GET', '')).json().limites.fichiersJointsParSection, 100);
});

test('AD-111 limit > a waiting join does not count among the 100; when its file arrives on a section already at 100 it stays waiting and the lot warns', async () => {
  const m = await monde();
  const cles = Array.from({ length: 99 }, (_, i) => `doc:p${i}`);
  await m.lotComplet(async (lot) => {
    for (const c of [...cles, 'doc:extra']) await m.putFichier(c, { nom: c, octets: pdf(c), lot });
    return null;
  });
  const l1 = await m.lotComplet((lot) => m.putFiche('lieu:notes', { type: 'lieu', titre: 'Carnet', sections: [section('n', 'Notes', 'x', { fichiers: [...cles, 'doc:tardif'] })] }, lot));
  assert.equal(l1.res.statusCode, 200, l1.res.body);
  const fid: number = l1.res.json().id;
  let vue = (await m.fiche(m.antor, fid)).json();
  const sid: number = vue.sections[0].id;
  const ajout = await m.rest(m.antor, 'POST', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}/fichiers`, { fichierId: m.idFichier('doc:extra') });
  assert.equal(ajout.statusCode, 201, 'the 100th file is accepted: ' + ajout.body);
  const l2 = await m.lotComplet((lot) => m.putFichier('doc:tardif', { nom: 'Tardif', octets: pdf('t'), lot }));
  assert.equal(l2.res.json().etat, 'creee');
  const dit = [...l2.res.json().avertissements, ...l2.rapport.rapport.map((r: Any) => r.raison)].join(' | ');
  assert.ok(dit.includes('section « Notes » : 100 fichiers joints au plus, « doc:tardif » reste en attente'), dit);
  vue = (await m.fiche(m.antor, fid)).json();
  assert.equal(vue.sections[0].piecesJointes.filter((p: Any) => !p.attente).length, 100, 'the section stays at 100');
});

test('E-9 waiting > four waiting references are warned; nothing of them leaves the server for Léa; a 200-character key is accepted and resolved at the arrival of the file', async () => {
  const m = await monde();
  const l = await m.lotComplet((lot) =>
    m.putFiche('lieu:attente', {
      type: 'lieu',
      titre: 'Les Docks Oubliés',
      illustration: 'img:blason',
      sections: [section('d', 'Description', 'Un [tarif](fichier:cle:doc:lien) et ![x](fichier:cle:img:corps).', { fichiers: ['doc:seule'] })],
    }, lot),
  );
  assert.equal(l.res.json().etat, 'creee');
  assert.equal(l.res.json().avertissements.length, 4, 'illustration, image, link and join, each waiting: ' + l.res.body);
  const fid: number = l.res.json().id;
  const api = (await m.fiche(m.lea, fid)).body;
  assert.ok(!/img:blason|doc:seule|img:corps|doc:lien|attente/.test(api), 'nothing of the waiting references leaves the server for Léa: ' + api);
  const joueur = (await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}?mode=joueur`)).body;
  assert.ok(!/img:blason|doc:seule|img:corps|doc:lien|attente/.test(joueur), 'nor in player mode for the GM');
  const biblio = (await m.biblio(m.antor)).body;
  assert.ok(!biblio.includes('img:blason') && !biblio.includes('doc:seule'), 'no waiting file in the library');
  const longue = 'img:' + 'k'.repeat(196);
  assert.equal(longue.length, 200);
  const l2 = await m.lotComplet((lot) => m.putFiche('lieu:longue', { type: 'lieu', titre: 'Clé longue', sections: [section('d', 'Description', `![](fichier:cle:${longue})`)] }, lot));
  assert.equal(l2.res.statusCode, 200, l2.res.body);
  const f2: number = l2.res.json().id;
  assert.ok((await m.fiche(m.antor, f2)).body.includes(longue), 'the GM gets the whole waiting key');
  await m.lotComplet((lot) => m.putFichier(longue, { nom: 'Longue', octets: VERT, lot }));
  assert.ok((await m.fiche(m.antor, f2)).json().sections[0].html.includes(`/fichiers/${m.idFichier(longue)}`), 'the arrival resolves the reference');
});
