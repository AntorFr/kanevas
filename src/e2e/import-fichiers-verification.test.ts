// Independent verification of kanevas-import-fichiers, written from the need only (docs/parcours.md B-48, B-49,
// B-56, P-10 steps 4-7; docs/ecrans.md E-9 « Pending file reference », E-18 « Import batches »; the criterion of the
// feature sheet). Every expectation is a literal from those documents. Real app, real SQLite (in memory), stub mode
// (AD-55), the import API driven with the « Jeton du bouchon », E-9 and E-18 read by a real Chromium.
//
// PLAN
//  critère  GET / lists 100 joined files per section; the sheet (image in text + joined doc) pushed before its files is
//           `creee` with two waiting references; Antor sees « Fichier en attente d'import », Léa nothing; the two PUT
//           /fichiers resolve them; the replay of everything says inchangee / inchangee everywhere.
//  B-56     bords : 1 byte accepted, 0 byte refused (400 champ fichier, reason in the batch), 100 joined keys accepted,
//           101 refused; échec : no token -> 401, empty name refused; exclusion : an `mj` file is neither listed nor
//           served to Léa and its key never reaches her.
//  B-48     visibility set to « joueurs » in Kanevas is not restored by the replay (still joueurs), the batch says so;
//           same for the name.
//  B-49     E-18 reads « Fichiers : 2 créés », « 1 refusé », « 3 liens et références en attente » (2 of the sheet + 1 of the stub seed).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, attendre, launch, skipBrowser } from './harnais.test.js';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');

const CAP = process.env.IMPORT_FICHIERS_VERIF_CAPTURES ?? '/tmp/import-fichiers-verif-captures';
let browser: Any;
before(async () => {
  mkdirSync(CAP, { recursive: true });
  if (!skipBrowser) browser = await launch();
});
const fermer: Array<() => Promise<unknown>> = [];
after(async () => {
  await browser?.close();
  for (const f of fermer) await f().catch(() => {});
});

// 1x1 PNG (valid signature, so the server sniffs an image).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await app.listen({ port: 0, host: '127.0.0.1' });
  fermer.push(() => app.close());
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const essai = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const racine = `/api/import/v1/univers/${essai}`;
  const rendre = (r: Any) => ({ status: r.statusCode as number, json: (() => { try { return JSON.parse(r.body); } catch { return r.body; } })() as Any });
  const imp = async (m: string, chemin: string, corps?: unknown, jeton: string | null = JETON_BOUCHON) =>
    rendre(await app.inject({ method: m, url: racine + chemin, headers: jeton ? { authorization: `Bearer ${jeton}` } : {}, ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }) }));
  const fichier = async (cle: string, o: { nom: string; octets: Buffer; visibilite?: string; lot?: number; jeton?: string | null }) => {
    const b = '----vrf' + Math.random().toString(16).slice(2);
    const champ = (n: string, v: string) => `--${b}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`;
    const corps = Buffer.concat([
      Buffer.from((o.visibilite ? champ('visibilite', o.visibilite) : '') + champ('nom', o.nom) +
        `--${b}\r\nContent-Disposition: form-data; name="fichier"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      o.octets,
      Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    const jeton = o.jeton === undefined ? JETON_BOUCHON : o.jeton;
    return rendre(await app.inject({
      method: 'PUT',
      url: `${racine}/fichiers/${encodeURIComponent(cle)}${o.lot ? `?lot=${o.lot}` : ''}`,
      headers: { 'content-type': `multipart/form-data; boundary=${b}`, ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
      payload: corps,
    }));
  };
  const cookies = new Map<string, string>();
  const cookie = async (compte: string) => {
    if (!cookies.has(compte)) {
      const r = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
      cookies.set(compte, `kanevas_session=${r.cookies.find((c: Any) => c.name === 'kanevas_session')!.value}`);
    }
    return cookies.get(compte)!;
  };
  const sess = async (compte: string, m: string, url: string, corps?: unknown) =>
    rendre(await app.inject({ method: m, url: `/api/univers/${essai}${url}`, headers: { cookie: await cookie(compte) }, ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }) }));
  const lot = async () => (await imp('POST', '/lots')).json.lotId as number;
  const clore = async (id: number) => (await imp('POST', `/lots/${id}/clore`)).json;
  return { app, base, essai, imp, fichier, sess, lot, clore };
}

const FICHE = {
  type: 'lieu',
  titre: 'Les Quais',
  sections: [
    { cle: 'desc', titre: 'Description', contenu: 'Le port.\n\n![](fichier:cle:img:quais)', joueursLisent: true, joueursEcrivent: false, fichiers: ['doc:tarifs'] },
  ],
};

async function session(m: Awaited<ReturnType<typeof monde>>, compte: 'antor' | 'lea') {
  const ctx = await browser.newContext({ baseURL: m.base, locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte === 'lea' ? 'Léa' : compte}$`, 'i') }).click();
  await attendre(page);
  return { ctx, page };
}
const lire = async (page: Any) => ((await page.locator('body').innerText()) as string).replace(/[  ]/g, ' ').replace(/’/g, "'");

test('critère · GET / rend 100 fichiers joints par section parmi ses limites', async () => {
  // Fails if the limit is dropped from GET / or changed.
  const m = await monde();
  const r = await m.imp('GET', '');
  assert.equal(r.status, 200);
  assert.equal(r.json.limites.fichiersJointsParSection, 100);
});

test('critère · fiche poussée avant ses fichiers : creee avec 2 en attente, vue du MJ seul ; les PUT les résolvent ; le rejeu dit inchangée/inchangé partout', async () => {
  // Fails if a waiting reference is lost, never resolved, shown to a player, or if the replay rewrites something.
  const m = await monde();
  const lot1 = await m.lot();
  const f1 = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:quais')}?lot=${lot1}`, FICHE);
  assert.equal(f1.status, 200);
  assert.equal(f1.json.etat, 'creee');
  assert.equal(f1.json.avertissements.length, 2, JSON.stringify(f1.json));
  const fid: number = f1.json.id;

  // The player's read carries no key.
  const lea = await m.sess('lea', 'GET', `/fiches/${fid}`);
  assert.ok(!JSON.stringify(lea.json).includes('img:quais'), 'key leaked to Léa');
  assert.ok(!JSON.stringify(lea.json).includes('doc:tarifs'), 'key leaked to Léa');

  if (!skipBrowser) {
    const antor = await session(m, 'antor');
    const joueuse = await session(m, 'lea');
    try {
      await antor.page.goto(`/univers/${m.essai}/fiche/${fid}`);
      await attendre(antor.page);
      const t = await lire(antor.page);
      await antor.page.screenshot({ path: `${CAP}/e9-antor-attente.png`, fullPage: true });
      assert.ok(t.includes("Fichier en attente d'import : « img:quais »."), 'tile for the image');
      assert.ok(t.includes("Fichier en attente d'import : « doc:tarifs »."), 'tile for the document');
      await joueuse.page.goto(`/univers/${m.essai}/fiche/${fid}`);
      await attendre(joueuse.page);
      const tl = await lire(joueuse.page);
      await joueuse.page.screenshot({ path: `${CAP}/e9-lea-attente.png`, fullPage: true });
      assert.ok(tl.includes('Le port.'), 'Léa reads the section');
      assert.ok(!tl.includes('en attente d'), 'Léa sees no waiting tile');
      assert.ok(!tl.includes('img:quais') && !tl.includes('doc:tarifs'), 'Léa never sees a key');
    } finally {
      await antor.ctx.close();
      await joueuse.ctx.close();
    }
  }

  const a = await m.fichier('img:quais', { nom: 'quais.png', octets: PNG, lot: lot1 });
  const b = await m.fichier('doc:tarifs', { nom: 'tarifs.pdf', octets: PDF, lot: lot1 });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(a.json.etat, 'creee');
  assert.equal(b.json.etat, 'creee');
  const clos = await m.clore(lot1);
  assert.equal(clos.compteurs.fichiers.creees, 2);

  // After arrival the sheet no longer waits: Antor reads no tile.
  if (!skipBrowser) {
    const antor = await session(m, 'antor');
    try {
      await antor.page.goto(`/univers/${m.essai}/fiche/${fid}`);
      await attendre(antor.page);
      assert.ok(!(await lire(antor.page)).includes("Fichier en attente d'import"), 'tiles gone after arrival');
      await antor.page.screenshot({ path: `${CAP}/e9-antor-resolu.png`, fullPage: true });
    } finally {
      await antor.ctx.close();
    }
  }

  // Replay of everything.
  const lot2 = await m.lot();
  const r1 = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:quais')}?lot=${lot2}`, FICHE);
  const r2 = await m.fichier('img:quais', { nom: 'quais.png', octets: PNG, lot: lot2 });
  const r3 = await m.fichier('doc:tarifs', { nom: 'tarifs.pdf', octets: PDF, lot: lot2 });
  assert.equal(r1.json.etat, 'inchangee', JSON.stringify(r1.json));
  assert.equal(r2.json.etat, 'inchangee');
  assert.equal(r3.json.etat, 'inchangee');
  assert.deepEqual(r1.json.avertissements, []);
  const clos2 = await m.clore(lot2);
  assert.equal(clos2.compteurs.fiches.inchangees, 1);
  assert.equal(clos2.compteurs.fichiers.inchangees, 2);
  assert.equal(clos2.compteurs.fichiers.creees, 0);
  // The stub universe already carries one waiting link of its own (« Anse-aux-Sels » -> faction:repaire): 1, not 0.
  assert.equal(clos2.enAttente, 1);
});

test('critère · un fichier envoyé mj n\'est ni listé, ni servi, ni nommé à Léa ; Antor le voit', async () => {
  // Fails if the mj visibility is ignored or the player's guard is missing on the list or the bytes.
  const m = await monde();
  const mj = await m.fichier('img:secret', { nom: 'secret.png', octets: PNG, visibilite: 'mj' });
  const ouvert = await m.fichier('img:public', { nom: 'public.png', octets: PNG });
  assert.equal(mj.json.etat, 'creee');
  const idMj = mj.json.id as number;
  const idOuvert = ouvert.json.id as number;

  const listeLea = await m.sess('lea', 'GET', '/fichiers');
  const noms = JSON.stringify(listeLea.json);
  assert.ok(noms.includes('public.png'), 'default visibility is joueurs');
  assert.ok(!noms.includes('secret.png'), 'mj file listed to Léa');
  assert.equal((await m.sess('lea', 'GET', `/fichiers/${idMj}`)).status, 404);
  assert.equal((await m.sess('lea', 'GET', `/fichiers/${idOuvert}`)).status, 200);
  assert.equal((await m.sess('antor', 'GET', `/fichiers/${idMj}`)).status, 200);
  assert.ok(JSON.stringify((await m.sess('antor', 'GET', '/fichiers')).json).includes('secret.png'));
});

test('B-48 · visibilité passée à « joueurs » dans Kanevas : le rejeu avec mj ne la rétablit pas, le lot le dit ; de même le nom', async () => {
  // Fails if the replay overwrites a human change, or the batch stays silent about it.
  const m = await monde();
  const l1 = await m.lot();
  const c = await m.fichier('img:plan', { nom: 'plan.png', octets: PNG, visibilite: 'mj', lot: l1 });
  await m.clore(l1);
  const id = c.json.id as number;
  assert.equal((await m.sess('lea', 'GET', `/fichiers/${id}`)).status, 404);
  const p = await m.sess('antor', 'PATCH', `/fichiers/${id}`, { visibilite: 'joueurs' });
  assert.equal(p.status, 200, JSON.stringify(p.json));
  assert.equal((await m.sess('lea', 'GET', `/fichiers/${id}`)).status, 200);

  const l2 = await m.lot();
  const r = await m.fichier('img:plan', { nom: 'plan.png', octets: PNG, visibilite: 'mj', lot: l2 });
  assert.equal(r.status, 200);
  assert.equal((await m.sess('lea', 'GET', `/fichiers/${id}`)).status, 200, 'visibility restored to mj by the replay');
  assert.ok(JSON.stringify(r.json.avertissements).includes('visibilité modifiée dans Kanevas : non écrasée'), JSON.stringify(r.json));
  await m.clore(l2);
  const lots = await m.sess('antor', 'GET', '/lots');
  const rapport = JSON.stringify(lots.json);
  assert.ok(rapport.includes('img:plan'), 'the report names the origin key');
  assert.ok(rapport.includes('visibilité modifiée dans Kanevas : non écrasée'));

  // Name.
  const ren = await m.sess('antor', 'PATCH', `/fichiers/${id}`, { nom: 'plan-du-port.png' });
  assert.equal(ren.status, 200, JSON.stringify(ren.json));
  const l3 = await m.lot();
  const r3 = await m.fichier('img:plan', { nom: 'plan.png', octets: PNG, visibilite: 'mj', lot: l3 });
  assert.ok(JSON.stringify(r3.json.avertissements).includes('nom modifié dans Kanevas : non écrasé'), JSON.stringify(r3.json));
  const liste = JSON.stringify((await m.sess('antor', 'GET', '/fichiers')).json);
  assert.ok(liste.includes('plan-du-port.png') && !liste.includes('"plan.png"'), 'name restored by the replay');
});

test('B-56 bords · 0 octet refusé (400 invalide, champ fichier, raison au lot), 1 octet accepté ; nom vide refusé ; sans jeton 401', async () => {
  // Fails if an empty file is stored, if the reason is not in the batch, or if the token is not required.
  const m = await monde();
  const l = await m.lot();
  const vide = await m.fichier('doc:vide', { nom: 'vide.pdf', octets: Buffer.alloc(0), lot: l });
  assert.equal(vide.status, 400);
  assert.equal(vide.json.code, 'invalide');
  assert.equal(vide.json.champ, 'fichier');
  const un = await m.fichier('doc:un', { nom: 'un.txt', octets: Buffer.from('a'), lot: l });
  assert.equal(un.status, 200, JSON.stringify(un.json));
  assert.equal(un.json.etat, 'creee');
  const sansNom = await m.fichier('doc:sansnom', { nom: '', octets: Buffer.from('a'), lot: l });
  assert.equal(sansNom.status, 400);
  const sansJeton = await m.fichier('doc:x', { nom: 'x.txt', octets: Buffer.from('a'), jeton: null });
  assert.equal(sansJeton.status, 401);
  assert.equal(sansJeton.json.message, 'Jeton invalide.');
  const clos = await m.clore(l);
  assert.equal(clos.compteurs.fichiers.creees, 1);
  assert.equal(clos.compteurs.fichiers.refusees, 2);
  const rapport = JSON.stringify((await m.sess('antor', 'GET', '/lots')).json);
  assert.ok(rapport.includes('doc:vide'), 'refused key in the report');
  assert.ok(rapport.includes('fichier vide : 0 octet, refusé'), rapport);
  assert.equal(m.app.db.prepare("SELECT COUNT(*) AS n FROM fichiers WHERE cle_origine IN ('doc:vide','doc:sansnom','doc:x')").get().n, 0);
});

test('B-56 bords · 100 fichiers joints à une section acceptés, 101 refusés (400 invalide, champ fichiers) ; une illustration qui nomme un document : 400 pas_une_image', async () => {
  // Fails if the cap of 100 is off by one or missing, or if a document can be an illustration.
  const m = await monde();
  const cles = (n: number) => Array.from({ length: n }, (_, i) => `doc:j${i}`);
  const sec = (n: number) => [{ cle: 's', titre: 'Pièces', contenu: 'x', joueursLisent: true, joueursEcrivent: false, fichiers: cles(n) }];
  const ok = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:cent')}`, { type: 'lieu', titre: 'Cent', sections: sec(100) });
  assert.equal(ok.status, 200, JSON.stringify(ok.json).slice(0, 300));
  const trop = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:cent-un')}`, { type: 'lieu', titre: 'Cent un', sections: sec(101) });
  assert.equal(trop.status, 400);
  assert.equal(trop.json.code, 'invalide');
  assert.equal(trop.json.champ, 'fichiers');
  assert.equal(m.app.db.prepare("SELECT COUNT(*) AS n FROM fiches WHERE titre = 'Cent un'").get().n, 0);

  await m.fichier('doc:pas-image', { nom: 'a.pdf', octets: PDF });
  const doc = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:ill')}`, { type: 'lieu', titre: 'Ill', illustration: 'doc:pas-image', sections: [] });
  assert.equal(doc.status, 400);
  assert.equal(doc.json.code, 'pas_une_image');
});

test('B-49 · E-18 : « Fichiers : 2 créés · 1 refusé », « 3 liens et références en attente » (2 + 1 du semis) avec clé et raison', { skip: skipBrowser }, async () => {
  // Fails if the batch does not count files by nature, forgets the waiting references, or hides a refusal's key/reason.
  const m = await monde();
  const l = await m.lot();
  await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:quais')}?lot=${l}`, FICHE);
  await m.fichier('doc:vide', { nom: 'vide.pdf', octets: Buffer.alloc(0), lot: l });
  await m.fichier('doc:autre', { nom: 'autre.pdf', octets: PDF, lot: l });
  await m.fichier('doc:autre2', { nom: 'autre2.pdf', octets: PDF, lot: l });
  await m.clore(l);
  const antor = await session(m, 'antor');
  try {
    await antor.page.goto(`/univers/${m.essai}/acces-api`);
    await attendre(antor.page);
    const t = await lire(antor.page);
    await antor.page.screenshot({ path: `${CAP}/e18-lot.png`, fullPage: true });
    assert.ok(t.includes('Fichiers : 2 créés'), t);
    assert.ok(t.includes('1 refusé'), t);
    // 2 file references of the sheet + the 1 waiting link the stub universe already carries.
    assert.ok(t.includes('3 liens et références en attente'), t);
  } finally {
    await antor.ctx.close();
  }
});
