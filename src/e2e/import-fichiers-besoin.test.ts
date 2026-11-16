// ecrans: acces-api, fiche, mediatheque
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
test('critère · fiche poussée avant ses fichiers : Antor voit 2 tuiles « en attente d’import » et Léa aucune ; une fois les fichiers arrivés l’image et le document s’affichent aux deux', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  const lea = await session(m, 'lea');
  try {
    const fiche = {
      type: 'lieu',
      titre: 'Les Quais',
      sections: [section('description', 'Description', 'Avant ![](fichier:cle:img:quais) Après', { fichiers: ['doc:tarifs'] })],
    };
    const l1 = await lotComplet(m, async (lot) => putFiche(m, 'lieu:quais', fiche, lot)); // the effect is proved by the route test
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

    // The files arrive.
    await lotComplet(m, async (lot) => [
      await putFichier(m, 'img:quais', { nom: 'Quais', octets: ROUGE, lot }),
      await putFichier(m, 'doc:tarifs', { nom: 'Tarifs du port', octets: pdf('tarifs'), lot }),
    ]);
    await aller(antor.page, `/univers/${m.essai}/fiche/${fid}`);
    t = await lire(antor.page);
    await capture(antor.page, 'critere-antor-resolu');
    assert.ok(!t.includes("en attente d'import"), 'the tiles are gone after the reload');
    assert.ok(t.includes('Tarifs du port'), 'the joined document is listed');
    assert.ok((await antor.page.locator('img[src*="/fichiers/"]').count()) >= 1, 'the image is shown');
    await aller(lea.page, `/univers/${m.essai}/fiche/${fid}`);
    assert.ok((await lea.page.locator('img[src*="/fichiers/"]').count()) >= 1, 'Léa sees the image too');
    assert.ok((await lire(lea.page)).includes('Tarifs du port'), 'and the document');
  } finally {
    await antor.ctx.close();
    await lea.ctx.close();
    await m.app.close();
  }
});

// ------------------------------------------------------------------ B-56 mj / B-48 visibilité
test('B-56 exclusion + B-48 · un fichier envoyé mj n’est pas dans la médiathèque de Léa ; Antor le passe « Visible des joueurs » sur E-19 : Léa l’a, et E-18 dit « 1 avertissement » au rejeu', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  const lea = await session(m, 'lea');
  try {
    const f = await lotComplet(m, async (lot) => ({
      fichier: await putFichier(m, 'img:plan', { nom: 'Plan du Repaire', visibilite: 'mj', octets: BLEU, lot }),
    }));
    const fiche = await lotComplet(m, async (lot) =>
      putFiche(m, 'lieu:repaire', { type: 'lieu', titre: 'Le Repaire', sections: [section('d', 'Description', 'Un plan : ![plan](fichier:cle:img:plan)')] }, lot),
    );

    // Léa: not in her library (the rights are proved by the route test).
    const cLea = await cookieDe(m, 'lea');
    await aller(lea.page, `/univers/${m.essai}/mediatheque`);
    assert.ok(!(await lire(lea.page)).includes('Plan du Repaire'));

    // Antor, on E-19: « Visible des joueurs ».
    await aller(antor.page, `/univers/${m.essai}/mediatheque`);
    await antor.page.getByText('Plan du Repaire').first().click();
    await antor.page.getByText('Visible des joueurs', { exact: true }).first().click();
    await attendre(antor.page);
    await capture(antor.page, 'b48-visibilite-e19');
    const apresReglage = await rest(m, cLea, 'GET', `/api/univers/${m.essai}/fichiers`);
    assert.ok(apresReglage.txt.includes('Plan du Repaire'), 'Léa now has the file: the setting was made');

    // The replay still says mj: not restored, named in the batch.
    await lotComplet(m, async (lot) => putFichier(m, 'img:plan', { nom: 'Plan du Repaire', visibilite: 'mj', octets: BLEU, lot }));
    // The lot says so on E-18.
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
test('B-56 bords + B-49 · un fichier de 0 octet : E-18 dit « Fichiers : 1 créé · 1 refusé », déplié il donne la clé et la raison', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  try {
    await lotComplet(m, async (lot) => ({
      vide: await putFichier(m, 'doc:vide', { nom: 'Vide', octets: Buffer.alloc(0), type: 'application/pdf', lot }),
      bon: await putFichier(m, 'img:ok', { nom: 'Rouge', octets: ROUGE, type: 'image/png', lot }),
    }));

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

test('B-49 · la raison du refus d’un fichier de 0 octet se lit « fichier vide : 0 octet, refusé » sur l’écran (docs/ecrans.md, E-18)', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  try {
    await lotComplet(m, async (lot) => putFichier(m, 'doc:vide', { nom: 'Vide', octets: Buffer.alloc(0), type: 'application/pdf', lot }));
    await aller(antor.page, `/univers/${m.essai}/acces-api`);
    await antor.page.getByText(/1 refusé/).first().click();
    await attendre(antor.page);
    assert.ok((await lire(antor.page)).includes('fichier vide : 0 octet, refusé'));
  } finally {
    await antor.ctx.close();
    await m.app.close();
  }
});

// ------------------------------------------------------------------ B-56 nominal, bords
// ------------------------------------------------------------------ B-56 échecs et exclusions de l'API
// ------------------------------------------------------------------ B-48 sur les fichiers
// ------------------------------------------------------------------ AD-111 : 100 fichiers par section
test('AD-111 · une jointure en attente d’une section déjà à 100 fichiers reste affichée « en attente d’import » à l’arrivée du fichier', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  try {
    const cAntor = await cookieDe(m, 'antor');
    const cles = Array.from({ length: 99 }, (_, i) => `doc:p${i}`);
    await lotComplet(m, async (lot) => {
      for (const c of [...cles, 'doc:extra']) await putFichier(m, c, { nom: c, octets: pdf(c), lot });
      return null;
    });
    const l1 = await lotComplet(m, async (lot) =>
      putFiche(m, 'lieu:notes', { type: 'lieu', titre: 'Carnet', sections: [section('n', 'Notes', 'x', { fichiers: [...cles, 'doc:tardif'] })] }, lot),
    );
    const fid: number = l1.res.json.id;
    const vue = (await ficheDe(m, cAntor, fid)).json;
    const sid: number = vue.sections[0].id;
    await rest(m, cAntor, 'POST', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}/fichiers`, { fichierId: idFichier(m, 'doc:extra') });
    await lotComplet(m, async (lot) => putFichier(m, 'doc:tardif', { nom: 'Tardif', octets: pdf('t'), lot }));
    await aller(antor.page, `/univers/${m.essai}/fiche/${fid}`);
    assert.ok((await lire(antor.page)).includes(ATTENTE('doc:tardif')), 'the extra join still shows as waiting');
  } finally {
    await antor.ctx.close();
    await m.app.close();
  }
});

// ------------------------------------------------------------------ E-9 : fichier en attente d'import
const CLE_LONGUE = 'img:' + 'k'.repeat(196); // 200 characters, the longest key

test('E-9 · le MJ voit la tuile en attente à la place de l’illustration, du lien de document et de la jointure (section sans autre fichier : ni « Aucun fichier joint. ») ; Léa et le Mode Joueur : rien à l’écran', opts, async () => {
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
