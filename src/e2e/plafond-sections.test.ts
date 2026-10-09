// Black-box tests of kanevas-plafond-sections, written from the need (docs/ecrans.md "contenu
// long" + its criterion, docs/donnees.md `sections.contenu`, ARCHITECTURE.md routes), not from the
// code. Real server in stub mode + real Chromium; expectations are literals taken from the docs.
//
// TEST PLAN (need -> case -> hard-coded expectation)
//   server nominal  : PUT contenu of 20 000 chars -> 200, stored whole
//   server edges    : 20 001 -> 400 {message:'Contenu trop long : 20 000 caractères au plus.'}, content and version unchanged
//                     POST section with contenu 20 000 -> 201; 20 001 -> 400 and no section added
//                     20 001 with a stale version -> 400 (limit checked before version); 20 000 stale -> 409
//   server exclusion: a Player on a section she cannot read, 20 001 chars -> not 400 (rights first), nothing written
//                     a Player who can write: 20 001 -> 400, content unchanged
//   /api/moi        : limites.contenuSection === 20000
//   screen nominal  : 20 000 chars typed -> no error; the 20 001st char -> « Erreur : 20 000 caractères au plus. »,
//                     « Enregistrer » sends nothing, text kept
//   screen failure  : /api/moi unavailable -> the screen checks nothing, the server answers 400 -> same text,
//                     not « L'action n'a pas abouti. Réessayez. », text kept
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, rxExact, section, skipBrowser, startServer, voit, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
const MESSAGE = 'Contenu trop long : 20 000 caractères au plus.';
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let universId = 0;
let ficheId = 0;
let n = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; json: Any }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  let json: Any = null;
  try {
    json = await r.json();
  } catch {
    /* no body */
  }
  return { status: r.status(), json };
}

async function nouvelleSection(contenu?: string): Promise<{ url: string; id: number; version: number }> {
  const r = await api(antor, 'POST', `/api/univers/${universId}/fiches/${ficheId}/sections`, {
    titre: `S${++n}`,
    ...(contenu === undefined ? {} : { contenu }),
  });
  assert.equal(r.status, 201);
  return { url: `/api/univers/${universId}/fiches/${ficheId}/sections/${r.json.id}`, id: r.json.id, version: r.json.version };
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  antor = (await connecte(browser, srv.base, 'antor')).page;
  universId = (await api(antor, 'POST', '/api/univers', { nom: 'Plafond' })).json.id;
  ficheId = (await api(antor, 'POST', `/api/univers/${universId}/fiches`, { type: 'lieu', titre: 'Grimoire' })).json.id;
  const m = await api(antor, 'POST', `/api/univers/${universId}/membres`, { username: 'lea', role: 'joueur' });
  assert.equal(m.status, 201);
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('/api/moi rend la limite de section : 20000', opts, async () => {
  const r = await api(antor, 'GET', '/api/moi');
  assert.deepEqual(r.json, { username: 'antor', groups: [], limites: { contenuSection: 20000 } });
});

test('serveur : PUT de 20 000 caractères accepté et conservé en entier', opts, async () => {
  const s = await nouvelleSection();
  const r = await api(antor, 'PUT', `${s.url}/contenu`, { contenu: 'a'.repeat(20000), version: s.version });
  assert.equal(r.status, 200);
  const lue = await api(antor, 'GET', s.url);
  assert.equal(lue.json.contenu.length, 20000);
  assert.equal(lue.json.version, 2);
});

test('serveur : PUT de 20 001 caractères refusé 400, contenu et version inchangés', opts, async () => {
  const s = await nouvelleSection('avant');
  const r = await api(antor, 'PUT', `${s.url}/contenu`, { contenu: 'b'.repeat(20001), version: s.version });
  assert.equal(r.status, 400);
  assert.equal(r.json.message, MESSAGE);
  const lue = await api(antor, 'GET', s.url);
  assert.equal(lue.json.contenu, 'avant');
  assert.equal(lue.json.version, 1);
});

test('serveur : le plafond est contrôlé avant la version (20 001 périmé -> 400, 20 000 périmé -> 409)', opts, async () => {
  const s = await nouvelleSection();
  const trop = await api(antor, 'PUT', `${s.url}/contenu`, { contenu: 'c'.repeat(20001), version: 99 });
  assert.equal(trop.status, 400);
  const ok = await api(antor, 'PUT', `${s.url}/contenu`, { contenu: 'c'.repeat(20000), version: 99 });
  assert.equal(ok.status, 409);
});

test('serveur : ajout d\'une section avec 20 000 caractères accepté, avec 20 001 refusé 400 sans section ajoutée', opts, async () => {
  const base = `/api/univers/${universId}/fiches/${ficheId}`;
  const avant = (await api(antor, 'GET', base)).json.sections.length;
  const ok = await api(antor, 'POST', `${base}/sections`, { titre: 'Pleine', contenu: 'd'.repeat(20000) });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.contenu.length, 20000);
  const trop = await api(antor, 'POST', `${base}/sections`, { titre: 'Trop', contenu: 'd'.repeat(20001) });
  assert.equal(trop.status, 400);
  assert.equal(trop.json.message, MESSAGE);
  const apres = (await api(antor, 'GET', base)).json.sections;
  assert.equal(apres.length, avant + 1);
  assert.equal(apres.some((s: Any) => s.titre === 'Trop'), false);
});

test('serveur : une Joueuse qui peut écrire est refusée à 20 001 caractères (400), contenu inchangé', opts, async () => {
  const s = await nouvelleSection('texte');
  const p = await api(antor, 'PATCH', s.url, { joueursLisent: true, joueursEcrivent: true });
  assert.equal(p.status, 200);
  const trop = await api(lea, 'PUT', `${s.url}/contenu`, { contenu: 'e'.repeat(20001), version: 1 });
  assert.equal(trop.status, 400);
  assert.equal((await api(antor, 'GET', s.url)).json.contenu, 'texte');
  const ok = await api(lea, 'PUT', `${s.url}/contenu`, { contenu: 'e'.repeat(20000), version: 1 });
  assert.equal(ok.status, 200);
});

test('serveur : une Joueuse sans droit d\'écriture reçoit son refus de droits, pas le 400 du plafond, rien d\'écrit', opts, async () => {
  const cachee = await nouvelleSection('secret');
  const r = await api(lea, 'PUT', `${cachee.url}/contenu`, { contenu: 'f'.repeat(20001), version: 1 });
  assert.notEqual(r.status, 400);
  assert.ok(r.status === 403 || r.status === 404, String(r.status));
  assert.equal((await api(antor, 'GET', cachee.url)).json.contenu, 'secret');
  const lisible = await nouvelleSection('lisible');
  await api(antor, 'PATCH', lisible.url, { joueursLisent: true });
  const r2 = await api(lea, 'PUT', `${lisible.url}/contenu`, { contenu: 'f'.repeat(20001), version: 1 });
  assert.equal(r2.status, 403);
});

async function ouvrirEdition(page: Any, titre: string): Promise<Any> {
  await page.goto(`/univers/${universId}/fiche/${ficheId}`);
  await attendre(page);
  const s = section(page, titre);
  await s.getByRole('button', { name: rxExact('Modifier') }).click();
  return s;
}

async function titreDe(s: { id: number }): Promise<string> {
  const r = await api(antor, 'GET', `/api/univers/${universId}/fiches/${ficheId}/sections/${s.id}`);
  return r.json.titre;
}

test('écran : au 20 001e caractère saisi, l\'erreur apparaît, Enregistrer n\'envoie rien, le texte reste', opts, async () => {
  const s = await nouvelleSection('base');
  const { page } = await connecte(browser, srv.base, 'antor');
  const puts: string[] = [];
  page.on('request', (rq: Any) => rq.method() === 'PUT' && puts.push(rq.url()));
  const zone = await ouvrirEdition(page, await titreDe(s));
  await zone.getByRole('textbox').fill('g'.repeat(20000));
  assert.equal((await texte(page)).includes('Erreur : 20 000 caractères au plus.'), false);
  await page.keyboard.type('g');
  await voit(page, 'Erreur : 20 000 caractères au plus.');
  await page.screenshot({ path: '/tmp/plafond-ecran-erreur.png' });
  await zone.getByRole('button', { name: rxExact('Enregistrer') }).click({ force: true }).catch(() => undefined);
  await attendre(page);
  assert.deepEqual(puts, []);
  assert.equal((await zone.getByRole('textbox').inputValue()).length, 20001);
  assert.equal((await api(antor, 'GET', s.url)).json.contenu, 'base');
  await zone.getByRole('textbox').press('Control+End');
  await zone.getByRole('textbox').press('Backspace');
  await attendre(page);
  assert.equal((await texte(page)).includes('Erreur : 20 000 caractères au plus.'), false);
});

test('écran : si /api/moi échoue, le refus 400 du serveur affiche le même texte, pas « L\'action n\'a pas abouti », texte gardé', opts, async () => {
  const s = await nouvelleSection('base');
  const { ctx, page } = await connecte(browser, srv.base, 'antor');
  await ctx.route('**/api/moi', (r: Any) => r.abort());
  const zone = await ouvrirEdition(page, await titreDe(s));
  await zone.getByRole('textbox').fill('h'.repeat(20001));
  await zone.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(page, 'Erreur : 20 000 caractères au plus.');
  await attendre(page);
  await page.screenshot({ path: '/tmp/plafond-ecran-serveur.png' });
  assert.equal((await texte(page)).includes("L'action n'a pas abouti"), false);
  assert.equal((await zone.getByRole('textbox').inputValue()).length, 20001);
  assert.equal((await api(antor, 'GET', s.url)).json.contenu, 'base');
});

async function moiAvecLimite(ctx: Any, limite: number): Promise<void> {
  await ctx.route('**/api/moi', (r: Any) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'antor', groups: [], limites: { contenuSection: limite } }) }),
  );
}

test('écran : si l\'écran croit la limite plus large (30 000), le refus 400 du serveur à 20 001 donne le même texte et garde le texte', opts, async () => {
  const s = await nouvelleSection('base');
  const { ctx, page } = await connecte(browser, srv.base, 'antor');
  await moiAvecLimite(ctx, 30000);
  const zone = await ouvrirEdition(page, await titreDe(s));
  await zone.getByRole('textbox').fill('i'.repeat(20001));
  await zone.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(page, 'Erreur : 20 000 caractères au plus.');
  await attendre(page);
  assert.equal((await texte(page)).includes("L'action n'a pas abouti"), false);
  assert.equal((await zone.getByRole('textbox').inputValue()).length, 20001);
  assert.equal((await api(antor, 'GET', s.url)).json.contenu, 'base');
});

test('écran : la limite vient de /api/moi (limite 100 : l\'erreur apparaît au 101e caractère, pas avant)', opts, async () => {
  const s = await nouvelleSection('base');
  const { ctx, page } = await connecte(browser, srv.base, 'antor');
  await moiAvecLimite(ctx, 100);
  const zone = await ouvrirEdition(page, await titreDe(s));
  await zone.getByRole('textbox').fill('j'.repeat(100));
  assert.equal((await texte(page)).includes('caractères au plus.'), false);
  await page.keyboard.type('j');
  await voit(page, 'au plus.');
});
