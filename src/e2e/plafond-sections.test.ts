// Black-box tests of kanevas-plafond-sections, written from the need (docs/ecrans.md "contenu
// long" + its criterion, docs/donnees.md `sections.contenu`, ARCHITECTURE.md routes), not from the
// code. Real server in stub mode + real Chromium; expectations are literals taken from the docs.
//
// TEST PLAN (need -> case -> hard-coded expectation)
//   server nominal  : PUT contenu of 100 000 chars -> 200, stored whole
//   server edges    : 100 001 -> 400 {message:'Contenu trop long : 100 000 caractères au plus.'}, content and version unchanged
//                     POST section with contenu 100 000 -> 201; 100 001 -> 400 and no section added
//                     100 001 with a stale version -> 400 (limit checked before version); 100 000 stale -> 409
//   server exclusion: a Player on a section she cannot read, 100 001 chars -> not 400 (rights first), nothing written
//                     a Player who can write: 100 001 -> 400, content unchanged
//   /api/moi        : limites.contenuSection === 100000
//   screen nominal  : 100 000 chars typed -> no error; the 100 001st char -> « Erreur : 100 000 caractères au plus. »,
//                     « Enregistrer » sends nothing, text kept
//   screen failure  : /api/moi unavailable -> the screen checks nothing, the server answers 400 -> same text,
//                     not « L'action n'a pas abouti. Réessayez. », text kept
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, rxExact, section, skipBrowser, startServer, voit, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
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

test('écran : au 100 001e caractère saisi, l\'erreur apparaît, Enregistrer n\'envoie rien, le texte reste', opts, async () => {
  const s = await nouvelleSection('base');
  const { page } = await connecte(browser, srv.base, 'antor');
  const puts: string[] = [];
  page.on('request', (rq: Any) => rq.method() === 'PUT' && puts.push(rq.url()));
  const zone = await ouvrirEdition(page, await titreDe(s));
  await zone.getByRole('textbox').fill('g'.repeat(100000));
  assert.equal((await texte(page)).includes('Erreur : 100 000 caractères au plus.'), false);
  await page.keyboard.type('g');
  await voit(page, 'Erreur : 100 000 caractères au plus.');
  await page.screenshot({ path: '/tmp/plafond-ecran-erreur.png' });
  await zone.getByRole('button', { name: rxExact('Enregistrer') }).click({ force: true }).catch(() => undefined);
  await attendre(page);
  assert.deepEqual(puts, []);
  assert.equal((await zone.getByRole('textbox').inputValue()).length, 100001);
  await zone.getByRole('textbox').press('Control+End');
  await zone.getByRole('textbox').press('Backspace');
  await attendre(page);
  assert.equal((await texte(page)).includes('Erreur : 100 000 caractères au plus.'), false);
});

test('écran : si /api/moi échoue, le refus 400 du serveur affiche le même texte, pas « L\'action n\'a pas abouti », texte gardé', opts, async () => {
  const s = await nouvelleSection('base');
  const { ctx, page } = await connecte(browser, srv.base, 'antor');
  await ctx.route('**/api/moi', (r: Any) => r.abort());
  const zone = await ouvrirEdition(page, await titreDe(s));
  await zone.getByRole('textbox').fill('h'.repeat(100001));
  await zone.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(page, 'Erreur : 100 000 caractères au plus.');
  await attendre(page);
  await page.screenshot({ path: '/tmp/plafond-ecran-serveur.png' });
  assert.equal((await texte(page)).includes("L'action n'a pas abouti"), false);
  assert.equal((await zone.getByRole('textbox').inputValue()).length, 100001);
});

async function moiAvecLimite(ctx: Any, limite: number): Promise<void> {
  await ctx.route('**/api/moi', (r: Any) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'antor', groups: [], limites: { contenuSection: limite } }) }),
  );
}

test('écran : si l\'écran croit la limite plus large (200 000), le refus 400 du serveur à 100 001 donne le même texte et garde le texte', opts, async () => {
  const s = await nouvelleSection('base');
  const { ctx, page } = await connecte(browser, srv.base, 'antor');
  await moiAvecLimite(ctx, 200000);
  const zone = await ouvrirEdition(page, await titreDe(s));
  await zone.getByRole('textbox').fill('i'.repeat(100001));
  await zone.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(page, 'Erreur : 100 000 caractères au plus.');
  await attendre(page);
  assert.equal((await texte(page)).includes("L'action n'a pas abouti"), false);
  assert.equal((await zone.getByRole('textbox').inputValue()).length, 100001);
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
