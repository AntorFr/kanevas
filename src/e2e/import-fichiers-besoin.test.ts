// Black-box tests of kanevas-import-fichiers, written from the need (docs/parcours.md B-48, B-49, B-56, P-10 steps 4, 5, 7;
// docs/ecrans.md E-9 « Référence de fichier en attente », E-18, E-19; the feature's critère de sortie), not from the code.
// The real app runs in this process in stub mode on an in-memory SQLite and is driven over HTTP (the import API with the
// « Jeton du bouchon ») and by a real Chromium (Playwright). Captures go to $IMPORT_FICHIERS_CAPTURES
// (default /tmp/import-fichiers-captures), outside the tree.
//
// TEST PLAN (need -> cases; every expectation is a literal written from the docs)
//   critère  : GET / says 100 files per section; a sheet (image in the text + joined document) pushed before its files is
//              `creee` with 2 waiting references; Antor reads « Fichier en attente d'import » for both, Léa nothing;
//              PUT of both files resolves them without a new version; the replay says inchangee everywhere.
//   B-56 nominal  : PUT /fichiers/:cle creates an image and a document; « Visible des joueurs » by default; a file no sheet uses
//                   is in the library; the sheet then references it by text, `fichiers`, `illustration`.
//        bords    : 1 byte accepted, 0 byte refused (400, champ fichier, refused in the batch with key and reason, nothing stored);
//                   same bytes -> inchangee, new bytes -> mise_a_jour (served bytes change);
//                   100 joined files accepted, 101 refused; an illustration naming a document -> 400 pas_une_image
//        échec    : no / wrong token -> 401 and no batch; another universe -> 404; empty name refused
//        exclusion: a `mj` file is neither listed, nor served, nor shown to Léa; a waiting key never reaches a reader;
//                   the cookie opens nothing on the import API
//   B-48 (files)  : name and visibility changed in Kanevas are not restored by the replay, the batch names each, the rest is written;
//                   illustration and joined files changed in Kanevas are not restored either
//   B-49 lot      : « Fichiers : N créés », « refusé », « lien ou référence en attente » on E-18; refusal unfolded with key and reason;
//                   the replay lot omits the waiting line
//   E-9 waiting   : tile for the GM (text, illustration, document link, section with only waiting joins), nothing in Mode Joueur,
//                   long key cut with the whole key in the tooltip, not counted in the 100, replaced after reload
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { after, before, test } from 'node:test';
import { type Any, attendre, launch, rx, skipBrowser } from './harnais.test.js';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');

const opts = { skip: skipBrowser };
const CAP = process.env.IMPORT_FICHIERS_CAPTURES ?? '/tmp/import-fichiers-captures';

let browser: Any;
before(async () => {
  mkdirSync(CAP, { recursive: true });
  if (!skipBrowser) browser = await launch();
});
const ouverts: Array<{ close: () => Promise<unknown> }> = [];
after(async () => {
  await browser?.close();
  for (const a of ouverts) await a.close().catch(() => {});
});

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
/** A valid 1×1 PNG of the given colour (so two colours are two different files). */
function png(r: number, g: number, b: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, r, g, b]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const ROUGE = png(255, 0, 0);
const VERT = png(0, 255, 0);
const BLEU = png(0, 0, 255);
const pdf = (texte: string) => Buffer.from(`%PDF-1.4\n1 0 obj<< /Title (${texte}) >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n`);

// ------------------------------------------------------------------ world
interface Monde {
  app: Awaited<ReturnType<typeof buildApp>>;
  base: string;
  essai: number;
}
async function monde(): Promise<Monde> {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db), 'the stub world is seeded');
  ouverts.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as { port: number };
  const essai = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Essai Kanka') as { id: number }).id;
  return { app, base: `http://127.0.0.1:${addr.port}`, essai };
}
async function cookieDe(m: Monde, compte: string): Promise<string> {
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
async function lireReponse(r: Response) {
  const txt = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(txt);
  } catch {
    /* not JSON */
  }
  return { statut: r.status, json, txt, entetes: r.headers };
}
/** A call of the import API (JSON body optional), with the stub token unless `jeton` says otherwise. */
async function imp(m: Monde, methode: string, chemin: string, corps?: unknown, jeton: string | null = JETON_BOUCHON, univers = m.essai) {
  const headers: Record<string, string> = {};
  if (jeton !== null) headers.authorization = `Bearer ${jeton}`;
  if (corps !== undefined) headers['content-type'] = 'application/json';
  return lireReponse(
    await fetch(`${m.base}/api/import/v1/univers/${univers}${chemin}`, {
      method: methode,
      headers,
      body: corps === undefined ? undefined : JSON.stringify(corps),
    }),
  );
}
/** `PUT /fichiers/:cle` as a script does: multipart, `nom` and `visibilite` before `fichier`. */
async function putFichier(
  m: Monde,
  cle: string,
  o: { nom?: string; visibilite?: string; octets: Buffer; type?: string; lot?: number; jeton?: string | null },
) {
  const fd = new FormData();
  if (o.nom !== undefined) fd.set('nom', o.nom);
  if (o.visibilite !== undefined) fd.set('visibilite', o.visibilite);
  fd.set('fichier', new Blob([o.octets], { type: o.type ?? 'application/octet-stream' }), 'envoi.bin');
  const headers: Record<string, string> = {};
  const jeton = o.jeton === undefined ? JETON_BOUCHON : o.jeton;
  if (jeton !== null) headers.authorization = `Bearer ${jeton}`;
  return lireReponse(
    await fetch(`${m.base}/api/import/v1/univers/${m.essai}/fichiers/${encodeURIComponent(cle)}${o.lot === undefined ? '' : `?lot=${o.lot}`}`, {
      method: 'PUT',
      headers,
      body: fd,
    }),
  );
}
const section = (cle: string, titre: string, contenu: string, extra: Record<string, unknown> = {}) => ({
  cle,
  titre,
  contenu,
  joueursLisent: true,
  joueursEcrivent: false,
  ...extra,
});
async function putFiche(m: Monde, cle: string, corps: unknown, lot?: number) {
  return imp(m, 'PUT', `/fiches/${encodeURIComponent(cle)}${lot === undefined ? '' : `?lot=${lot}`}`, corps);
}
async function ouvrirLot(m: Monde): Promise<number> {
  const r = await imp(m, 'POST', '/lots');
  assert.ok(r.statut === 201 || r.statut === 200, r.txt);
  return r.json.lotId;
}
async function clore(m: Monde, lot: number) {
  const r = await imp(m, 'POST', `/lots/${lot}/clore`);
  assert.equal(r.statut, 200, r.txt);
  return r.json;
}
/** One whole batch: open, run `corps` with its id, close; returns what `corps` returned and the closing report. */
async function lotComplet<T>(m: Monde, corps: (lot: number) => Promise<T>): Promise<{ res: T; rapport: Any; lot: number }> {
  const lot = await ouvrirLot(m);
  const res = await corps(lot);
  return { res, rapport: await clore(m, lot), lot };
}
async function rest(m: Monde, cookie: string, methode: string, chemin: string, corps?: unknown) {
  const headers: Record<string, string> = { cookie };
  if (corps !== undefined) headers['content-type'] = 'application/json';
  return lireReponse(await fetch(`${m.base}${chemin}`, { method: methode, headers, body: corps === undefined ? undefined : JSON.stringify(corps) }));
}
const ficheDe = (m: Monde, cookie: string, id: number) => rest(m, cookie, 'GET', `/api/univers/${m.essai}/fiches/${id}`);
const idFichier = (m: Monde, cle: string): number => (m.app.db.prepare('SELECT id FROM fichiers WHERE univers_id = ? AND cle_origine = ?').get(m.essai, cle) as { id: number }).id;

async function session(m: Monde, compte: string): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({ baseURL: m.base, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte === 'lea' ? 'Léa' : compte}$`, 'i') }).click();
  await attendre(page);
  return { ctx, page };
}
const norm = (s: string) => s.replace(/[  ]/g, ' ').replace(/’/g, "'");
const lire = async (page: Any): Promise<string> => norm(await page.locator('body').innerText());
async function aller(page: Any, chemin: string): Promise<void> {
  await page.goto(chemin);
  await attendre(page);
}
const capture = (page: Any, nom: string) => page.screenshot({ path: `${CAP}/${nom}.png`, fullPage: true });
const ATTENTE = (cle: string) => `Fichier en attente d'import : « ${cle} ».`;

// ------------------------------------------------------------------ P-10 / critère de sortie
test('critère · fiche poussée avant ses fichiers : creee, 2 références en attente que Antor voit et Léa non ; PUT des fichiers les résout sans nouvelle version ; rejeu inchangé partout', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  const lea = await session(m, 'lea');
  try {
    // « GET / rend parmi ses limites 100 fichiers joints par section »
    const racine = await imp(m, 'GET', '');
    assert.equal(racine.statut, 200, racine.txt);
    assert.equal(racine.json.limites.fichiersJointsParSection, 100);

    // Baseline: the seeded universe already waits on one link (« faction:repaire »).
    const base = await lotComplet(m, async () => null);
    const attenteAvant: number = base.rapport.enAttente;

    const fiche = {
      type: 'lieu',
      titre: 'Les Quais',
      sections: [section('description', 'Description', 'Avant ![](fichier:cle:img:quais) Après', { fichiers: ['doc:tarifs'] })],
    };
    const l1 = await lotComplet(m, async (lot) => putFiche(m, 'lieu:quais', fiche, lot));
    assert.equal(l1.res.statut, 200, l1.res.txt);
    assert.equal(l1.res.json.etat, 'creee');
    assert.equal(l1.res.json.avertissements.length, 2, 'two waiting references, no more');
    assert.match(l1.res.json.avertissements.join('\n'), /img:quais/);
    assert.match(l1.res.json.avertissements.join('\n'), /doc:tarifs/);
    assert.equal(l1.rapport.enAttente, attenteAvant + 2);
    assert.equal(l1.rapport.compteurs.fiches.creees, 1);
    const fid: number = l1.res.json.id;

    // Antor sees both waiting files; Léa nothing, and never the keys.
    await aller(antor.page, `/univers/${m.essai}/fiche/${fid}`);
    let t = await lire(antor.page);
    await capture(antor.page, 'critere-antor-en-attente');
    assert.ok(t.includes(ATTENTE('img:quais')), 'tile of the image');
    assert.ok(t.includes(ATTENTE('doc:tarifs')), 'line of the joined document');
    await aller(lea.page, `/univers/${m.essai}/fiche/${fid}`);
    t = await lire(lea.page);
    await capture(lea.page, 'critere-lea-sans-attente');
    assert.ok(t.includes('Les Quais'), 'Léa reads the sheet');
    assert.ok(!t.includes("en attente d'import"), 'no tile for Léa');
    assert.ok(!t.includes('img:quais') && !t.includes('doc:tarifs'), 'no key for Léa');
    const coteLea = await ficheDe(m, await cookieDe(m, 'lea'), fid);
    assert.ok(!coteLea.txt.includes('img:quais') && !coteLea.txt.includes('doc:tarifs'), 'the API never sends the keys to Léa');
    const avant = (await ficheDe(m, await cookieDe(m, 'antor'), fid)).json;
    const versionAvant = avant.sections[0].version;

    // The files arrive.
    const l2 = await lotComplet(m, async (lot) => [
      await putFichier(m, 'img:quais', { nom: 'Quais', octets: ROUGE, lot }),
      await putFichier(m, 'doc:tarifs', { nom: 'Tarifs du port', octets: pdf('tarifs'), lot }),
    ]);
    assert.equal(l2.res[0].statut, 200, l2.res[0].txt);
    assert.equal(l2.res[0].json.etat, 'creee');
    assert.equal(l2.res[1].json.etat, 'creee');
    assert.equal(l2.rapport.compteurs.fichiers.creees, 2);
    assert.equal(l2.rapport.enAttente, attenteAvant, 'the two references are resolved');
    const apres = (await ficheDe(m, await cookieDe(m, 'antor'), fid)).json;
    assert.equal(apres.sections[0].version, versionAvant, 'resolving does not create a version');
    assert.equal(apres.modifieLe, avant.modifieLe, 'nor move the modification date');
    await aller(antor.page, `/univers/${m.essai}/fiche/${fid}`);
    t = await lire(antor.page);
    await capture(antor.page, 'critere-antor-resolu');
    assert.ok(!t.includes("en attente d'import"), 'the tiles are gone after the reload');
    assert.ok(t.includes('Tarifs du port'), 'the joined document is listed');
    assert.ok((await antor.page.locator('img[src*="/fichiers/"]').count()) >= 1, 'the image is shown');
    await aller(lea.page, `/univers/${m.essai}/fiche/${fid}`);
    assert.ok((await lea.page.locator('img[src*="/fichiers/"]').count()) >= 1, 'Léa sees the image too');
    assert.ok((await lire(lea.page)).includes('Tarifs du port'), 'and the document');

    // The replay of everything.
    const l3 = await lotComplet(m, async (lot) => ({
      fiche: await putFiche(m, 'lieu:quais', fiche, lot),
      img: await putFichier(m, 'img:quais', { nom: 'Quais', octets: ROUGE, lot }),
      doc: await putFichier(m, 'doc:tarifs', { nom: 'Tarifs du port', octets: pdf('tarifs'), lot }),
    }));
    assert.equal(l3.res.fiche.json.etat, 'inchangee');
    assert.equal(l3.res.img.json.etat, 'inchangee');
    assert.equal(l3.res.doc.json.etat, 'inchangee');
    assert.equal(l3.rapport.compteurs.fiches.inchangees, 1);
    assert.equal(l3.rapport.compteurs.fichiers.inchangees, 2);
    assert.equal(l3.rapport.compteurs.fiches.creees + l3.rapport.compteurs.fichiers.creees + l3.rapport.compteurs.fichiers.mises_a_jour, 0);
    assert.equal(l3.rapport.avertissements, 0);
  } finally {
    await antor.ctx.close();
    await lea.ctx.close();
    await m.app.close();
  }
});

// ------------------------------------------------------------------ B-56 mj / B-48 visibilité
test('B-56 exclusion + B-48 · un fichier envoyé mj est invisible de Léa ; Antor le passe « Visible des joueurs » sur E-19 : le rejeu ne le rétablit pas et le lot le dit', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  const lea = await session(m, 'lea');
  try {
    const f = await lotComplet(m, async (lot) => ({
      fichier: await putFichier(m, 'img:plan', { nom: 'Plan du Repaire', visibilite: 'mj', octets: BLEU, lot }),
    }));
    assert.equal(f.res.fichier.json.etat, 'creee');
    const id = idFichier(m, 'img:plan');
    const fiche = await lotComplet(m, async (lot) =>
      putFiche(m, 'lieu:repaire', { type: 'lieu', titre: 'Le Repaire', sections: [section('d', 'Description', 'Un plan : ![plan](fichier:cle:img:plan)')] }, lot),
    );
    assert.equal(fiche.res.json.etat, 'creee');
    assert.deepEqual(fiche.res.json.avertissements, [], 'the file is known: nothing waits');

    // Léa: not in her library, bytes refused, and the sheet shows the reserved wording, no image.
    const cLea = await cookieDe(m, 'lea');
    const cAntor = await cookieDe(m, 'antor');
    const biblioLea = await rest(m, cLea, 'GET', `/api/univers/${m.essai}/fichiers`);
    assert.equal(biblioLea.statut, 200);
    assert.ok(!biblioLea.txt.includes('Plan du Repaire'), 'a GM-only file is not in the player library');
    const octetsLea = await fetch(`${m.base}/api/univers/${m.essai}/fichiers/${id}`, { headers: { cookie: cLea } });
    assert.notEqual(octetsLea.status, 200, 'its bytes are refused to Léa');
    const octetsAntor = await fetch(`${m.base}/api/univers/${m.essai}/fichiers/${id}`, { headers: { cookie: cAntor } });
    assert.equal(octetsAntor.status, 200, 'but served to the GM');
    assert.deepEqual(Buffer.from(await octetsAntor.arrayBuffer()), BLEU, 'the very bytes that were sent');
    await aller(lea.page, `/univers/${m.essai}/mediatheque`);
    assert.ok(!(await lire(lea.page)).includes('Plan du Repaire'));
    const vueLea = (await rest(m, cLea, 'GET', `/api/univers/${m.essai}/fiches/${fiche.res.json.id}`)).txt;
    assert.ok(!vueLea.includes('<img'), 'no image for Léa');
    assert.ok(vueLea.includes('Image réservée au MJ.'), 'the documented placeholder');

    // Antor, on E-19: « Visible des joueurs ».
    await aller(antor.page, `/univers/${m.essai}/mediatheque`);
    await antor.page.getByText('Plan du Repaire').first().click();
    await antor.page.getByText('Visible des joueurs', { exact: true }).first().click();
    await attendre(antor.page);
    await capture(antor.page, 'b48-visibilite-e19');
    const apresReglage = await rest(m, cLea, 'GET', `/api/univers/${m.essai}/fichiers`);
    assert.ok(apresReglage.txt.includes('Plan du Repaire'), 'Léa now has the file: the setting was made');

    // The replay still says mj: not restored, named in the batch.
    const rejeu = await lotComplet(m, async (lot) => putFichier(m, 'img:plan', { nom: 'Plan du Repaire', visibilite: 'mj', octets: BLEU, lot }));
    assert.equal(rejeu.res.statut, 200, rejeu.res.txt);
    assert.equal(rejeu.res.json.etat, 'inchangee', 'nothing else changed');
    assert.ok(rejeu.res.json.avertissements.some((a: string) => /visibilité modifiée dans Kanevas : non écrasée/.test(a)), rejeu.res.txt);
    assert.equal(rejeu.rapport.avertissements, 1);
    const encore = await rest(m, cLea, 'GET', `/api/univers/${m.essai}/fichiers`);
    assert.ok(encore.txt.includes('Plan du Repaire'), 'still visible to the players after the replay');
    // The lot says so on E-18 as well.
    await aller(antor.page, `/univers/${m.essai}/acces-api`);
    const t = await lire(antor.page);
    await capture(antor.page, 'b48-lot-e18');
    assert.match(t, /1 avertissement/);
  } finally {
    await antor.ctx.close();
    await lea.ctx.close();
    await m.app.close();
  }
});

// ------------------------------------------------------------------ B-56 0 octet, B-49
test('B-56 bords + B-49 · un fichier de 0 octet est refusé (400, champ fichier), compté « refusé » au lot avec sa clé et sa raison sur E-18, rien de stocké', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  try {
    const l = await lotComplet(m, async (lot) => ({
      vide: await putFichier(m, 'doc:vide', { nom: 'Vide', octets: Buffer.alloc(0), type: 'application/pdf', lot }),
      bon: await putFichier(m, 'img:ok', { nom: 'Rouge', octets: ROUGE, type: 'image/png', lot }),
    }));
    assert.equal(l.res.vide.statut, 400, l.res.vide.txt);
    assert.equal(l.res.vide.json.champ, 'fichier');
    assert.equal(l.res.vide.json.code, 'invalide');
    assert.equal(l.res.bon.json.etat, 'creee', 'the next file of the batch is written');
    assert.equal(l.rapport.compteurs.fichiers.refusees, 1);
    assert.equal(l.rapport.compteurs.fichiers.creees, 1);
    const refus = l.rapport.rapport.find((r: Any) => r.cle === 'doc:vide');
    assert.ok(refus, 'the refusal is in the report with its key');
    assert.equal(refus.gravite, 'refus');
    assert.match(refus.raison, /vide/i, refus.raison);
    const lib = await rest(m, await cookieDe(m, 'antor'), 'GET', `/api/univers/${m.essai}/fichiers`);
    assert.ok(!lib.txt.includes('Vide'), 'nothing stored for the empty file');
    assert.ok(lib.txt.includes('Rouge'));

    await aller(antor.page, `/univers/${m.essai}/acces-api`);
    let t = await lire(antor.page);
    assert.match(t, /Fichiers : 1 créé · 1 refusé/);
    await antor.page.getByText(/Fichiers : 1 créé · 1 refusé/).first().click();
    await attendre(antor.page);
    t = await lire(antor.page);
    await capture(antor.page, 'b49-refus-fichier');
    assert.match(t, /1 refusée/);
    assert.ok(t.includes('doc:vide'), 'the key of the refusal');
    assert.match(t, /vide/i, 'the reason of the refusal is on screen');
  } finally {
    await antor.ctx.close();
    await m.app.close();
  }
});

test('B-49 · la raison du refus d’un fichier de 0 octet se lit « fichier vide : 0 octet, refusé » (docs/ecrans.md, E-18), au rapport du lot et sur l’écran', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  try {
    const l = await lotComplet(m, async (lot) => putFichier(m, 'doc:vide', { nom: 'Vide', octets: Buffer.alloc(0), type: 'application/pdf', lot }));
    const refus = l.rapport.rapport.find((r: Any) => r.cle === 'doc:vide');
    assert.equal(refus.raison, 'fichier vide : 0 octet, refusé');
    await aller(antor.page, `/univers/${m.essai}/acces-api`);
    await antor.page.getByText(/1 refusé/).first().click();
    await attendre(antor.page);
    assert.ok((await lire(antor.page)).includes('fichier vide : 0 octet, refusé'));
  } finally {
    await antor.ctx.close();
    await m.app.close();
  }
});

test('B-56 sans lot · un fichier de 0 octet est refusé sans lot ; un lot clos refuse l’écriture (409 lot_clos)', async () => {
  const m = await monde();
  const r = await putFichier(m, 'doc:vide', { nom: 'Vide', octets: Buffer.alloc(0) });
  assert.equal(r.statut, 400);
  const lot = await ouvrirLot(m);
  await clore(m, lot);
  const clos = await putFichier(m, 'img:tard', { nom: 'Tard', octets: ROUGE, lot });
  assert.equal(clos.statut, 409, clos.txt);
  assert.equal(clos.json.code, 'lot_clos');
  await m.app.close();
});

// ------------------------------------------------------------------ B-56 nominal, bords
test('B-56 nominal · image et document entrent dans la médiathèque, « Visible des joueurs » par défaut, y compris sans fiche ; mêmes octets inchangé, autres octets mis à jour', async () => {
  const m = await monde();
  const cLea = await cookieDe(m, 'lea');
  const cAntor = await cookieDe(m, 'antor');
  const l1 = await lotComplet(m, async (lot) => ({
    img: await putFichier(m, 'img:orpheline', { nom: 'Orpheline', octets: ROUGE, lot }),
    doc: await putFichier(m, 'doc:orphelin', { nom: 'Règlement du port', octets: pdf('v1'), lot }),
  }));
  assert.equal(l1.res.img.json.etat, 'creee');
  assert.equal(l1.res.doc.json.etat, 'creee');
  assert.deepEqual(l1.res.img.json.avertissements, []);
  assert.equal(l1.rapport.compteurs.fichiers.creees, 2);
  // Léa: both are in her library (default « Visible des joueurs »).
  const lib = await rest(m, cLea, 'GET', `/api/univers/${m.essai}/fichiers`);
  assert.ok(lib.txt.includes('Orpheline') && lib.txt.includes('Règlement du port'), 'players read what the script sent without a visibility');
  // Antor: both are « non utilisés ».
  const nonUtilises = await rest(m, cAntor, 'GET', `/api/univers/${m.essai}/fichiers?usage=non_utilises`);
  assert.ok(nonUtilises.txt.includes('Orpheline') && nonUtilises.txt.includes('Règlement du port'), 'a file no sheet uses is in the library');
  const utilises = await rest(m, cAntor, 'GET', `/api/univers/${m.essai}/fichiers?usage=utilises`);
  assert.ok(!utilises.txt.includes('Orpheline'));

  // Same bytes, same name, same visibility: unchanged.
  const l2 = await lotComplet(m, async (lot) => putFichier(m, 'doc:orphelin', { nom: 'Règlement du port', octets: pdf('v1'), lot }));
  assert.equal(l2.res.json.etat, 'inchangee');
  assert.equal(l2.rapport.compteurs.fichiers.inchangees, 1);
  assert.equal(l2.rapport.compteurs.fichiers.creees, 0);
  // Other bytes: updated, and the new bytes are served.
  const l3 = await lotComplet(m, async (lot) => putFichier(m, 'doc:orphelin', { nom: 'Règlement du port', octets: pdf('v2'), lot }));
  assert.equal(l3.res.json.etat, 'mise_a_jour');
  assert.equal(l3.rapport.compteurs.fichiers.mises_a_jour, 1);
  const servi = await fetch(`${m.base}/api/univers/${m.essai}/fichiers/${idFichier(m, 'doc:orphelin')}`, { headers: { cookie: cLea } });
  assert.equal(servi.status, 200);
  assert.deepEqual(Buffer.from(await servi.arrayBuffer()), pdf('v2'), 'the bytes of the second send');
  // One file, not two.
  const apres = await rest(m, cAntor, 'GET', `/api/univers/${m.essai}/fichiers`);
  assert.equal((apres.txt.match(/Règlement du port/g) ?? []).length >= 1, true);
  assert.equal(m.app.db.prepare("SELECT count(*) n FROM fichiers WHERE cle_origine = 'doc:orphelin'").get().n, 1, 'no duplicate by replay');
  await m.app.close();
});

test('B-56 nominal · la fiche référence un fichier déjà là par le texte, les fichiers d’une section et l’illustration : Léa lit l’image, le lien du document et la jointure ; rien n’attend', async () => {
  const m = await monde();
  const cLea = await cookieDe(m, 'lea');
  await lotComplet(m, async (lot) => [
    await putFichier(m, 'img:quais', { nom: 'Quais', octets: ROUGE, lot }),
    await putFichier(m, 'img:blason', { nom: 'Blason', octets: VERT, lot }),
    await putFichier(m, 'doc:tarifs', { nom: 'Tarifs du port', octets: pdf('t'), lot }),
    await putFichier(m, 'doc:charte', { nom: 'Charte', octets: pdf('c'), lot }),
  ]);
  const idQuais = idFichier(m, 'img:quais');
  const idTarifs = idFichier(m, 'doc:tarifs');
  const r = await lotComplet(m, async (lot) =>
    putFiche(
      m,
      'lieu:port',
      {
        type: 'lieu',
        titre: 'Le Port',
        illustration: 'img:blason',
        sections: [section('d', 'Description', 'Voir ![quais](fichier:cle:img:quais) et le [tarif](fichier:cle:doc:tarifs).', { fichiers: ['doc:charte'] })],
      },
      lot,
    ),
  );
  assert.equal(r.res.json.etat, 'creee');
  assert.deepEqual(r.res.json.avertissements, []);
  assert.equal(r.rapport.enAttente, 1, 'only the seeded link still waits');
  const vue = (await ficheDe(m, cLea, r.res.json.id)).json;
  assert.ok(vue.illustration, 'the illustration is the blason');
  assert.equal(vue.sections[0].piecesJointes.length, 1);
  assert.match(vue.sections[0].piecesJointes[0].nom, /Charte/);
  assert.ok(vue.sections[0].html.includes(`/fichiers/${idQuais}`), 'the image points at the library file');
  assert.ok(vue.sections[0].html.includes(`/fichiers/${idTarifs}`), 'the document link points at the library file');
  assert.ok(!vue.sections[0].html.includes('fichier:cle'), 'no raw key is left in what a reader gets');
  // Replay: unchanged (the texts are compared once the keys are resolved).
  const rej = await lotComplet(m, async (lot) =>
    putFiche(
      m,
      'lieu:port',
      {
        type: 'lieu',
        titre: 'Le Port',
        illustration: 'img:blason',
        sections: [section('d', 'Description', 'Voir ![quais](fichier:cle:img:quais) et le [tarif](fichier:cle:doc:tarifs).', { fichiers: ['doc:charte'] })],
      },
      lot,
    ),
  );
  assert.equal(rej.res.json.etat, 'inchangee');
  await m.app.close();
});

test('B-56 bords · une illustration qui nomme un document est refusée (400 pas_une_image) ; une clé de 200 caractères passe, 201 non ; un nom vide est refusé', async () => {
  const m = await monde();
  await lotComplet(m, async (lot) => putFichier(m, 'doc:tarifs', { nom: 'Tarifs', octets: pdf('t'), lot }));
  const lot = await ouvrirLot(m);
  const r = await putFiche(m, 'lieu:x', { type: 'lieu', titre: 'X', illustration: 'doc:tarifs', sections: [] }, lot);
  assert.equal(r.statut, 400, r.txt);
  assert.ok(r.txt.includes('pas_une_image'), r.txt);
  const clos = await clore(m, lot);
  assert.equal(clos.compteurs.fiches.refusees, 1, 'counted as refused');
  assert.ok(clos.rapport.some((x: Any) => x.cle === 'lieu:x' && x.gravite === 'refus'));
  // Names.
  const nomVide = await putFichier(m, 'img:n0', { nom: '', octets: ROUGE });
  assert.equal(nomVide.statut, 400, 'empty name');
  const nom200 = await putFichier(m, 'img:n200', { nom: 'n'.repeat(200), octets: ROUGE });
  assert.equal(nom200.statut, 200, nom200.txt);
  const nom201 = await putFichier(m, 'img:n201', { nom: 'n'.repeat(201), octets: ROUGE });
  assert.equal(nom201.statut, 400, '201 characters');
  assert.equal(m.app.db.prepare("SELECT count(*) n FROM fichiers WHERE cle_origine IN ('img:n0','img:n201')").get().n, 0);
  await m.app.close();
});

// ------------------------------------------------------------------ B-56 échecs et exclusions de l'API
test('B-56 échec/exclusion · sans jeton, avec un jeton faux ou avec le cookie : 401 jeton_invalide, rien d’écrit, aucun lot ; un autre univers : 404', async () => {
  const m = await monde();
  const cAntor = await cookieDe(m, 'antor');
  const lotsAvant = (await rest(m, cAntor, 'GET', `/api/univers/${m.essai}/lots`)).json.length;
  const sans = await putFichier(m, 'img:x', { nom: 'X', octets: ROUGE, jeton: null });
  assert.equal(sans.statut, 401);
  assert.deepEqual(sans.json, { message: 'Jeton invalide.', code: 'jeton_invalide' });
  const faux = await putFichier(m, 'img:x', { nom: 'X', octets: ROUGE, jeton: 'kvs_' + 'A'.repeat(43) });
  assert.equal(faux.statut, 401);
  const fd = new FormData();
  fd.set('nom', 'X');
  fd.set('fichier', new Blob([ROUGE]), 'x.png');
  const parCookie = await fetch(`${m.base}/api/import/v1/univers/${m.essai}/fichiers/img%3Ax`, { method: 'PUT', headers: { cookie: cAntor }, body: fd });
  assert.equal(parCookie.status, 401, 'the session cookie opens nothing on the import API');
  assert.equal(m.app.db.prepare("SELECT count(*) n FROM fichiers WHERE cle_origine = 'img:x'").get().n, 0, 'nothing written');
  assert.equal((await rest(m, cAntor, 'GET', `/api/univers/${m.essai}/lots`)).json.length, lotsAvant, 'no batch opened');
  const lame = (m.app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Lame d'Ébène") as { id: number }).id;
  const ailleurs = await fetch(`${m.base}/api/import/v1/univers/${lame}/fichiers/img%3Ax`, { method: 'PUT', headers: { authorization: `Bearer ${JETON_BOUCHON}` }, body: fd });
  assert.equal(ailleurs.status, 404, 'the token is good for its own universe only');
  assert.equal(m.app.db.prepare("SELECT count(*) n FROM fichiers WHERE cle_origine = 'img:x'").get().n, 0);
  await m.app.close();
});

// ------------------------------------------------------------------ B-48 sur les fichiers
test('B-48 · nom et visibilité changés dans Kanevas ne sont pas rétablis, chacun nommé au lot ; les nouveaux octets, eux, sont écrits', async () => {
  const m = await monde();
  const cAntor = await cookieDe(m, 'antor');
  const cLea = await cookieDe(m, 'lea');
  await lotComplet(m, async (lot) => putFichier(m, 'doc:reglement', { nom: 'Règlement', visibilite: 'mj', octets: pdf('v1'), lot }));
  const id = idFichier(m, 'doc:reglement');
  const patch = await rest(m, cAntor, 'PATCH', `/api/univers/${m.essai}/fichiers/${id}`, { nom: 'Règlement révisé par Antor', visibilite: 'joueurs' });
  assert.equal(patch.statut, 200, patch.txt);

  const l = await lotComplet(m, async (lot) => putFichier(m, 'doc:reglement', { nom: 'Règlement', visibilite: 'mj', octets: pdf('v2'), lot }));
  assert.equal(l.res.statut, 200, l.res.txt);
  assert.equal(l.res.json.etat, 'mise_a_jour', 'the new bytes are written');
  const av: string[] = l.res.json.avertissements;
  assert.equal(av.length, 2, `one warning per protected field: ${av.join(' | ')}`);
  assert.ok(av.some((a) => /nom modifié dans Kanevas : non écrasé/.test(a)), av.join(' | '));
  assert.ok(av.some((a) => /visibilité modifiée dans Kanevas : non écrasée/.test(a)), av.join(' | '));
  assert.equal(l.rapport.avertissements, 2);
  assert.ok(l.rapport.rapport.every((r: Any) => r.cle === 'doc:reglement'), 'the report names the key of the file');
  const lib = await rest(m, cLea, 'GET', `/api/univers/${m.essai}/fichiers`);
  assert.ok(lib.txt.includes('Règlement révisé par Antor'), 'the name set in Kanevas stays');
  assert.ok(!lib.txt.includes('"Règlement"'), 'the script name did not come back');
  const octets = await fetch(`${m.base}/api/univers/${m.essai}/fichiers/${id}`, { headers: { cookie: cLea } });
  assert.equal(octets.status, 200, 'still visible to the players');
  assert.deepEqual(Buffer.from(await octets.arrayBuffer()), pdf('v2'));
  await m.app.close();
});

test('B-48 bords · seul le nom a changé dans Kanevas : un seul avertissement, la visibilité du script s’applique', async () => {
  const m = await monde();
  const cAntor = await cookieDe(m, 'antor');
  const cLea = await cookieDe(m, 'lea');
  await lotComplet(m, async (lot) => putFichier(m, 'img:a', { nom: 'A', visibilite: 'joueurs', octets: ROUGE, lot }));
  const id = idFichier(m, 'img:a');
  assert.equal((await rest(m, cAntor, 'PATCH', `/api/univers/${m.essai}/fichiers/${id}`, { nom: 'A renommée' })).statut, 200);
  // The script now wants it GM-only: the visibility was not touched in Kanevas, so it follows the script.
  const l = await lotComplet(m, async (lot) => putFichier(m, 'img:a', { nom: 'A', visibilite: 'mj', octets: ROUGE, lot }));
  assert.equal(l.res.json.etat, 'mise_a_jour');
  assert.equal(l.res.json.avertissements.length, 1, l.res.txt);
  assert.match(l.res.json.avertissements[0], /nom modifié dans Kanevas : non écrasé/);
  const lib = await rest(m, cLea, 'GET', `/api/univers/${m.essai}/fichiers`);
  assert.ok(!lib.txt.includes('A renommée'), 'the visibility of the script was applied: Léa no longer sees it');
  await m.app.close();
});

test('B-48 · l’illustration et les fichiers joints changés dans Kanevas ne sont pas rétablis par le rejeu, qui nomme chacun et écrit le reste', async () => {
  const m = await monde();
  const cAntor = await cookieDe(m, 'antor');
  await lotComplet(m, async (lot) => [
    await putFichier(m, 'img:a', { nom: 'Image A', octets: ROUGE, lot }),
    await putFichier(m, 'img:b', { nom: 'Image B', octets: VERT, lot }),
    await putFichier(m, 'doc:x', { nom: 'Doc X', octets: pdf('x'), lot }),
    await putFichier(m, 'doc:y', { nom: 'Doc Y', octets: pdf('y'), lot }),
  ]);
  const fiche = (titre: string) => ({
    type: 'lieu',
    titre,
    illustration: 'img:a',
    sections: [section('d', 'Description', 'Texte.', { fichiers: ['doc:x'] })],
  });
  const l1 = await lotComplet(m, async (lot) => putFiche(m, 'lieu:q', fiche('Quais'), lot));
  assert.equal(l1.res.json.etat, 'creee');
  const fid: number = l1.res.json.id;
  let vue = (await ficheDe(m, cAntor, fid)).json;
  const sid: number = vue.sections[0].id;
  // Antor swaps the illustration and the joined file in Kanevas.
  const ill = await rest(m, cAntor, 'PUT', `/api/univers/${m.essai}/fiches/${fid}/illustration`, { fichierId: idFichier(m, 'img:b') });
  assert.equal(ill.statut, 200, ill.txt);
  const retire = await rest(m, cAntor, 'DELETE', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}/fichiers/${idFichier(m, 'doc:x')}`);
  assert.equal(retire.statut, 204, retire.txt);
  const joint = await rest(m, cAntor, 'POST', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}/fichiers`, { fichierId: idFichier(m, 'doc:y') });
  assert.equal(joint.statut, 201, joint.txt);
  // The replay: the title changed in the script, the files stay as Antor left them.
  const l2 = await lotComplet(m, async (lot) => putFiche(m, 'lieu:q', fiche('Quais de Port-Sel'), lot));
  assert.equal(l2.res.json.etat, 'mise_a_jour', 'the rest is written');
  const av: string[] = l2.res.json.avertissements;
  assert.ok(av.some((a) => /illustration/i.test(a)), `the illustration is named: ${av.join(' | ')}`);
  assert.ok(av.some((a) => /fichiers? joints?|jointe/i.test(a)), `the joined files are named: ${av.join(' | ')}`);
  vue = (await ficheDe(m, cAntor, fid)).json;
  assert.equal(vue.titre, 'Quais de Port-Sel');
  assert.equal(vue.illustration.id, idFichier(m, 'img:b'), 'the illustration chosen in Kanevas stays');
  const noms: string = vue.sections[0].piecesJointes.map((p: Any) => p.nom).join('|');
  assert.ok(noms.includes('Doc Y'), noms);
  assert.ok(!noms.includes('Doc X'), 'the file Antor removed does not come back: ' + noms);
  await m.app.close();
});

// ------------------------------------------------------------------ AD-111 : 100 fichiers par section
test('B-56 bords · 100 fichiers joints par section sont acceptés, 101 refusés (400 invalide, champ fichiers, compté « refusée ») ; GET / dit 100', async () => {
  const m = await monde();
  const cles = Array.from({ length: 101 }, (_, i) => `doc:n${i}`);
  await lotComplet(m, async (lot) => {
    for (const c of cles) await putFichier(m, c, { nom: c, octets: pdf(c), lot });
    return null;
  });
  const lot = await ouvrirLot(m);
  const cent = await putFiche(m, 'lieu:cent', { type: 'lieu', titre: 'Cent', sections: [section('n', 'Notes', 'x', { fichiers: cles.slice(0, 100) })] }, lot);
  assert.equal(cent.statut, 200, cent.txt);
  assert.equal(cent.json.etat, 'creee');
  assert.deepEqual(cent.json.avertissements, []);
  const trop = await putFiche(m, 'lieu:trop', { type: 'lieu', titre: 'Trop', sections: [section('n', 'Notes', 'x', { fichiers: cles })] }, lot);
  assert.equal(trop.statut, 400, trop.txt);
  assert.equal(trop.json.code, 'invalide');
  assert.equal(trop.json.champ, 'fichiers');
  const rap = await clore(m, lot);
  assert.equal(rap.compteurs.fiches.creees, 1);
  assert.equal(rap.compteurs.fiches.refusees, 1);
  assert.ok(rap.rapport.some((r: Any) => r.cle === 'lieu:trop' && r.gravite === 'refus'));
  const vue = (await ficheDe(m, await cookieDe(m, 'antor'), cent.json.id)).json;
  assert.equal(vue.sections[0].piecesJointes.length, 100);
  assert.equal(m.app.db.prepare("SELECT count(*) n FROM fiches WHERE cle_origine = 'lieu:trop'").get().n, 0, 'the refused sheet was not written');
  assert.equal((await imp(m, 'GET', '')).json.limites.fichiersJointsParSection, 100);
  await m.app.close();
});

test('AD-111 · une jointure en attente ne compte pas parmi les 100 ; à l’arrivée du fichier, si la section en porte déjà 100, elle reste en attente et le lot avertit', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  try {
    const cAntor = await cookieDe(m, 'antor');
    const cles = Array.from({ length: 99 }, (_, i) => `doc:p${i}`);
    await lotComplet(m, async (lot) => {
      for (const c of [...cles, 'doc:extra']) await putFichier(m, c, { nom: c, octets: pdf(c), lot });
      return null;
    });
    // 99 known joins + 1 waiting = 100 keys: accepted.
    const l1 = await lotComplet(m, async (lot) =>
      putFiche(m, 'lieu:notes', { type: 'lieu', titre: 'Carnet', sections: [section('n', 'Notes', 'x', { fichiers: [...cles, 'doc:tardif'] })] }, lot),
    );
    assert.equal(l1.res.statut, 200, l1.res.txt);
    const fid: number = l1.res.json.id;
    let vue = (await ficheDe(m, cAntor, fid)).json;
    const sid: number = vue.sections[0].id;
    // The waiting one does not count: Antor can still add the 100th.
    const ajout = await rest(m, cAntor, 'POST', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}/fichiers`, { fichierId: idFichier(m, 'doc:extra') });
    assert.equal(ajout.statut, 201, 'the 100th file is accepted: ' + ajout.txt);
    // Now the waiting file arrives: it would be the 101st.
    const l2 = await lotComplet(m, async (lot) => putFichier(m, 'doc:tardif', { nom: 'Tardif', octets: pdf('t'), lot }));
    assert.equal(l2.res.json.etat, 'creee');
    const dit = [...l2.res.json.avertissements, ...l2.rapport.rapport.map((r: Any) => r.raison)].join(' | ');
    assert.ok(dit.includes('section « Notes » : 100 fichiers joints au plus, « doc:tardif » reste en attente'), dit);
    vue = (await ficheDe(m, cAntor, fid)).json;
    assert.equal(vue.sections[0].piecesJointes.filter((p: Any) => !p.attente).length, 100, 'the section stays at 100');
    await aller(antor.page, `/univers/${m.essai}/fiche/${fid}`);
    assert.ok((await lire(antor.page)).includes(ATTENTE('doc:tardif')), 'the extra join still shows as waiting');
  } finally {
    await antor.ctx.close();
    await m.app.close();
  }
});

// ------------------------------------------------------------------ E-9 : fichier en attente d'import
const CLE_LONGUE = 'img:' + 'k'.repeat(196); // 200 characters, the longest key

test('E-9 · le MJ voit la tuile en attente à la place de l’illustration, du lien de document et de la jointure (section sans autre fichier : ni « Aucun fichier joint. ») ; Léa et le Mode Joueur : rien', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  const lea = await session(m, 'lea');
  try {
    const l = await lotComplet(m, async (lot) =>
      putFiche(
        m,
        'lieu:attente',
        {
          type: 'lieu',
          titre: 'Les Docks Oubliés',
          illustration: 'img:blason',
          sections: [
            section('d', 'Description', 'Un [tarif](fichier:cle:doc:lien) et ![x](fichier:cle:img:corps).', { fichiers: ['doc:seule'] }),
          ],
        },
        lot,
      ),
    );
    assert.equal(l.res.json.etat, 'creee');
    assert.equal(l.res.json.avertissements.length, 4, 'illustration, image, link and join, each waiting: ' + l.res.txt);
    const fid: number = l.res.json.id;

    await aller(antor.page, `/univers/${m.essai}/fiche/${fid}`);
    const t = await lire(antor.page);
    await capture(antor.page, 'e9-attente-mj');
    for (const cle of ['img:blason', 'doc:seule', 'img:corps']) assert.ok(t.includes(ATTENTE(cle)), `tile for ${cle}`);
    assert.ok(!t.includes('Aucun fichier joint.'), 'a section whose only joins wait shows its tiles, not « Aucun fichier joint. »');
    const lien = antor.page.getByText('tarif', { exact: true }).first();
    assert.equal(await lien.count(), 1, 'the document link text is there');
    const titre = await antor.page.locator(`[title="${ATTENTE('doc:lien')}"]`).count();
    assert.ok(titre >= 1, 'the link carries the sentence as tooltip');
    // Not in any list of the library.
    await aller(antor.page, `/univers/${m.essai}/mediatheque`);
    const biblio = await lire(antor.page);
    assert.ok(!biblio.includes('img:blason') && !biblio.includes('doc:seule'), 'no waiting file in the library');
    // Mode Joueur: nothing.
    await aller(antor.page, `/univers/${m.essai}/fiche/${fid}`);
    // The sheet is already drawn (GM view): the title alone proves nothing. Arm the wait for the Mode Joueur
    // response before the switch, then wait for the tiles of the GM view to be gone, then for the title.
    const reponseJoueur = antor.page.waitForResponse((r: Any) => r.url().includes(`/fiches/${fid}`) && r.url().includes('mode=joueur'));
    await antor.page.getByRole('radio', { name: 'Mode Joueur' }).check();
    await reponseJoueur;
    await antor.page.waitForFunction(() => !document.body.innerText.replace(/[  ]/g, ' ').includes("en attente d'import"));
    await antor.page.getByText('Les Docks Oubliés').first().waitFor();
    await attendre(antor.page);
    const tj = await lire(antor.page);
    await capture(antor.page, 'e9-attente-mode-joueur');
    assert.ok(tj.includes('Les Docks Oubliés'));
    assert.ok(!tj.includes("en attente d'import"), 'no tile in Mode Joueur');
    assert.ok(!/img:blason|doc:seule|img:corps|doc:lien/.test(tj), 'no key in Mode Joueur');
    // Léa: nothing either, in the page and in what the server sends.
    await aller(lea.page, `/univers/${m.essai}/fiche/${fid}`);
    const tl = await lire(lea.page);
    assert.ok(tl.includes('Les Docks Oubliés'));
    assert.ok(!tl.includes("en attente d'import"));
    assert.ok(!/img:blason|doc:seule|img:corps|doc:lien/.test(tl));
    assert.equal(await lea.page.locator('[title*="en attente"]').count(), 0, 'no tooltip for Léa');
    const api = (await ficheDe(m, await cookieDe(m, 'lea'), fid)).txt;
    assert.ok(!/img:blason|doc:seule|img:corps|doc:lien|attente/.test(api), 'nothing of the waiting references leaves the server for Léa: ' + api);
  } finally {
    await antor.ctx.close();
    await lea.ctx.close();
    await m.app.close();
  }
});

test('E-9 contenu extrême · une clé de 200 caractères : la clé entière en infobulle ; au rechargement après l’arrivée du fichier, la tuile est remplacée par l’image', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  try {
    assert.equal(CLE_LONGUE.length, 200);
    const l = await lotComplet(m, async (lot) =>
      putFiche(m, 'lieu:longue', { type: 'lieu', titre: 'Clé longue', sections: [section('d', 'Description', `![](fichier:cle:${CLE_LONGUE})`)] }, lot),
    );
    assert.equal(l.res.statut, 200, l.res.txt);
    const fid: number = l.res.json.id;
    await aller(antor.page, `/univers/${m.essai}/fiche/${fid}`);
    await capture(antor.page, 'e9-cle-longue');
    assert.ok((await antor.page.locator(`[title*="${CLE_LONGUE}"]`).count()) >= 1, 'the whole key is in the tooltip');
    assert.ok((await lire(antor.page)).includes("Fichier en attente d'import"));
    // The page stays open; the file arrives; the open page does not change by itself…
    await lotComplet(m, async (lot) => putFichier(m, CLE_LONGUE, { nom: 'Longue', octets: VERT, lot }));
    assert.ok((await lire(antor.page)).includes("Fichier en attente d'import"), 'the open page is not refreshed by the arrival');
    // …and the reload shows the file.
    await antor.page.reload();
    await attendre(antor.page);
    await capture(antor.page, 'e9-cle-longue-resolue');
    assert.ok(!(await lire(antor.page)).includes("en attente d'import"));
    assert.ok((await antor.page.locator('img[src*="/fichiers/"]').count()) >= 1);
  } finally {
    await antor.ctx.close();
    await m.app.close();
  }
});
