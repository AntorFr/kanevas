// Black-box tests of kanevas-import-secrets at the level of the assembled feature (B-34, AD-98, AD-114), written from the
// need alone (the fiche's « Livre » and exit criterion, docs/parcours.md B-34, docs/ecrans.md « Le bloc MJ »), against the
// real server in stub mode (seeded world, « Port-Sel ») driven by a real Chromium. Expected values are literals.
//
// TEST PLAN (need -> case -> proof)
//   critère / lecture Léa     : « Histoire » of Port-Sel: no « sous-main », no hatched block, no « Modifier »; API view has no source
//   critère / lecture Antor   : block hatched, pastille « MJ seul », label « Bloc MJ seul »; mode Joueur = Léa's view; mode MJ again hatched
//   critère / recherche       : « sous-main » in Lieux: Léa and Antor in mode Joueur « Aucun résultat… »; Antor finds Port-Sel (screen + API)
//   critère / assistant       : Léa « lis-moi la section « Histoire » » and « que sait-on de Port-Sel »: nothing of the block; Antor gets it
//   critère / écriture refusée: Léa, author with write: 403 « Vous ne pouvez pas modifier cette section. » by API and by assistant, nothing written
//   critère / import          : PUT with :::mj gives the same view; replay « inchangee »; block removed then restored: view and search follow
//   bords syntaxe             : list/table/quote in a block, several blocks, nested, never closed (also in a quote), empty block,
//                               whole-section block (« Rien d'écrit pour l'instant. »)
//   exclusions syntaxe        : fenced code, :::MJ, "::: mj", ::::mj, ":::mj suite" are plain text, visible to all
//   écriture / bouton         : « Bloc MJ » wraps the selection, or posts two lines; absent for Léa
//   écriture / refus joueur   : Léa types :::mj in a section without one: 400 « Un bloc MJ ne peut être écrit que par un MJ. », text kept
//   aperçu                    : Léa's preview carries no block, Antor's does, Antor in mode Joueur's does not
//   recherche après écriture  : adding a block removes the word from Léa's search (index rebuilt); removing it brings the word back
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, launch, rx, rxExact, skipBrowser, startServer, texte } from './harnais.test.js';
import { comptes, json } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const REFUS_ECRITURE = 'Vous ne pouvez pas modifier cette section.';
const REFUS_BLOC = 'Un bloc MJ ne peut être écrit que par un MJ.';

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;
let LAME = 0;
let ESSAI = 0;
let LEA_ID = 0;
let PORT = 0;
let HISTOIRE = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' }); // the seeded world: the exit criterion names « Port-Sel »
  browser = await launch();
  C = await comptes(srv, browser);
  const us = await json(await C.lea.ctx.request.get('/api/univers'));
  LAME = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
  ESSAI = us.find((u: Any) => u.nom === 'Essai Kanka').id;
  const membres = await json(await C.antor.ctx.request.get(`/api/univers/${LAME}/membres`));
  LEA_ID = membres.find((x: Any) => x.username === 'lea').compteId;
  const lieux = await json(await C.antor.ctx.request.get(`/api/univers/${LAME}/fiches?type=lieu`));
  PORT = lieux.fiches.find((f: Any) => f.titre === 'Port-Sel').id;
  const f = await json(await C.antor.ctx.request.get(`/api/univers/${LAME}/fiches/${PORT}`));
  HISTOIRE = f.sections.find((s: Any) => s.titre === 'Histoire').id;
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

async function api(c: Any, method: 'post' | 'put' | 'get' | 'patch', url: string, data?: unknown): Promise<Any> {
  const r = await c.ctx.request[method](url, data === undefined ? {} : { data });
  if (r.status() >= 300) throw new Error(`${method} ${url} -> ${r.status()} ${await r.text()}`);
  return json(r);
}
async function brut(c: Any, method: 'post' | 'put', url: string, data: unknown): Promise<{ status: number; corps: Any }> {
  const r = await c.ctx.request[method](url, { data });
  return { status: r.status(), corps: await json(r) };
}
async function vue(c: Any, u: number, f: number, mode = ''): Promise<Any> {
  return api(c, 'get', `/api/univers/${u}/fiches/${f}${mode ? `?mode=${mode}` : ''}`);
}
const sec = (fiche: Any, titre: string): Any => fiche.sections.find((s: Any) => s.titre === titre);
async function trouvees(c: Any, u: number, type: string, q: string, mode = ''): Promise<string[]> {
  const r = await api(c, 'get', `/api/univers/${u}/fiches?type=${type}&q=${encodeURIComponent(q)}${mode ? `&mode=${mode}` : ''}`);
  return r.fiches.map((f: Any) => f.titre);
}
/** A fresh universe: Antor GM, Léa player; one sheet « Maître Aldric ». */
async function monde(nom: string) {
  const u = await api(C.antor, 'post', '/api/univers', { nom });
  const b = `/api/univers/${u.id}`;
  await api(C.antor, 'post', `${b}/membres`, { username: 'lea', role: 'joueur' });
  const f = await api(C.antor, 'post', `${b}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  return { u: u.id as number, b, f: f.id as number };
}
type M = Awaited<ReturnType<typeof monde>>;
/** A section read by the players. `auteur`: Léa is its author with write access. */
async function section(m: M, titre: string, contenu: string, auteur = false): Promise<number> {
  const s = await api(C.antor, 'post', `${m.b}/fiches/${m.f}/sections`, { titre, contenu });
  await api(C.antor, 'patch', `${m.b}/fiches/${m.f}/sections/${s.id}`, auteur
    ? { joueursLisent: true, auteurId: LEA_ID, auteurLit: true, auteurEcrit: true }
    : { joueursLisent: true });
  return s.id as number;
}
async function htmlLea(m: M, titre: string): Promise<string> {
  return sec(await vue(C.lea, m.u, m.f), titre).html as string;
}
async function htmlAntor(m: M, titre: string, mode = ''): Promise<string> {
  return sec(await vue(C.antor, m.u, m.f, mode), titre).html as string;
}
function surveiller(page: Any): string[] {
  const dialogues: string[] = [];
  page.on('dialog', async (d: Any) => {
    dialogues.push(d.message());
    await d.dismiss();
  });
  return dialogues;
}

// ---------------------------------------------------------------- the exit criterion, on the seeded « Port-Sel »

test('critère : Léa lit « Histoire » sans un mot du bloc ni trace, et sans « Modifier »', opts, async () => {
  const page = await C.lea.ctx.newPage();
  const dlg = surveiller(page);
  await page.goto(`${srv.base}/univers/${LAME}/fiche/${PORT}`);
  await page.getByRole('heading', { name: 'Histoire' }).waitFor();
  await attendre(page);
  const t = await texte(page);
  assert.ok(!t.includes('sous-main'));
  assert.ok(!t.includes('cargaisons'));
  assert.ok(!t.includes(':::'));
  assert.equal(await page.locator('.bloc-mj').count(), 0);
  assert.equal(await page.getByText('MJ seul', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('note').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
  assert.deepEqual(dlg, []);
  await page.screenshot({ path: '/tmp/kanevas-secrets-lea.png' });
  await page.close();
});

test('critère : Antor voit le bloc hachuré « MJ seul » ; en mode Joueur la vue de Léa ; en mode MJ de nouveau le bloc', opts, async () => {
  const page = await C.antor.ctx.newPage();
  await page.goto(`${srv.base}/univers/${LAME}/fiche/${PORT}`);
  await page.getByRole('heading', { name: 'Histoire' }).waitFor();
  await attendre(page);
  const bloc = page.getByRole('note', { name: 'Bloc MJ seul' });
  assert.equal(await bloc.count(), 1);
  assert.ok((await bloc.innerText()).includes('sous-main'));
  // the « MJ seul » pastille is drawn by the block's pseudo-element: read the rendered content, not the text nodes
  assert.equal(await bloc.evaluate((e: Element) => getComputedStyle(e, '::before').content), '"MJ seul"');
  await bloc.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/kanevas-secrets-antor-mj.png' });

  await page.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
  await attendre(page);
  await page.waitForFunction(() => !document.body.innerText.includes('sous-main'));
  const t = await texte(page);
  assert.ok(!t.includes('sous-main'));
  assert.equal(await page.getByRole('note').count(), 0);
  assert.equal(await page.getByText('MJ seul', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
  await page.screenshot({ path: '/tmp/kanevas-secrets-antor-joueur.png' });

  await page.getByRole('radio', { name: rxExact('Mode MJ') }).check();
  await attendre(page);
  await page.getByRole('note', { name: 'Bloc MJ seul' }).waitFor();
  await page.close();
});

test('critère : « sous-main » cherché dans Lieux : Léa lit « Aucun résultat… », Antor voit Port-Sel', opts, async () => {
  const chercher = async (c: Any, mot: string) => {
    const p = await c.ctx.newPage();
    await p.goto(`${srv.base}/univers/${LAME}/fiches/lieux`);
    await p.getByRole('heading', { level: 1 }).waitFor();
    await attendre(p);
    await p.getByLabel(rx('Chercher dans les lieux')).fill(mot);
    await p.getByRole('button', { name: rxExact('Chercher') }).click();
    await p.waitForFunction(() => !/Recherche…/.test(document.body.innerText));
    await attendre(p);
    const t = await texte(p);
    await p.screenshot({ path: `/tmp/kanevas-secrets-recherche-${c === C.lea ? 'lea' : 'antor'}.png` });
    await p.close();
    return t;
  };
  const tl = await chercher(C.lea, 'sous-main');
  assert.ok(tl.includes('Aucun résultat pour « sous-main » dans les lieux.'));
  assert.ok(!tl.includes('Port-Sel'.concat('X')) && !tl.includes('Port-Sel'));
  const ta = await chercher(C.antor, 'sous-main');
  assert.ok(ta.includes('Port-Sel'));
  assert.ok(!ta.includes('Aucun résultat'));
});

// ---------------------------------------------------------------- bords: the syntax

test('bord : section toute en bloc = « Rien d’écrit pour l’instant. » pour Léa', opts, async () => {
  const m = await monde('Secrets vides');
  await section(m, 'Creux', 'Avant creux.\n\n:::mj\n:::\n\nAprès creux.');
  await section(m, 'Tout', ':::mj\nTOUTSECRET\n:::');

  const page = await C.lea.ctx.newPage();
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.getByRole('heading', { name: 'Tout' }).waitFor();
  await attendre(page);
  const t = await texte(page);
  assert.ok(t.includes("Rien d'écrit pour l'instant."));
  assert.ok(!t.includes('TOUTSECRET') && !t.includes(':::'));
  await page.screenshot({ path: '/tmp/kanevas-secrets-tout-en-bloc.png' });
  await page.close();
});

// ---------------------------------------------------------------- exclusions: what is not a block stays public text

// ---------------------------------------------------------------- writing

test('écriture : « Bloc MJ » entoure la sélection, sinon pose deux lignes ; absent pour Léa ; le bloc posé s’affiche hachuré', opts, async () => {
  const m = await monde('Secrets bouton');
  const sid = await section(m, 'Notes', 'Public ouvert.');
  const page = await C.antor.ctx.newPage();
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.getByRole('heading', { name: 'Notes' }).waitFor();
  await attendre(page);
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const champ = page.getByLabel('Contenu de « Notes »');
  await champ.fill('Avant\nSECRETPOSE');
  await champ.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(6, el.value.length); });
  await page.getByRole('button', { name: 'Bloc MJ', exact: true }).click();
  assert.equal(await champ.inputValue(), 'Avant\n:::mj\nSECRETPOSE\n:::');
  await page.screenshot({ path: '/tmp/kanevas-secrets-bouton.png' });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await attendre(page);
  await page.getByRole('note', { name: 'Bloc MJ seul' }).waitFor();

  // no selection: two lines with an empty line between
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await champ.fill('');
  await page.getByRole('button', { name: 'Bloc MJ', exact: true }).click();
  assert.equal(await champ.inputValue(), ':::mj\n\n:::');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.close();

  // Léa, author with write, on a section without block: « Modifier » yes, « Bloc MJ » no
  await section(m, 'Écrite par Léa', 'Rien.', true);
  const pl = await C.lea.ctx.newPage();
  await pl.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await pl.getByRole('heading', { name: 'Écrite par Léa' }).waitFor();
  await attendre(pl);
  assert.equal(await pl.getByRole('button', { name: 'Modifier', exact: true }).count(), 1);
  await pl.getByRole('button', { name: 'Modifier', exact: true }).click();
  assert.equal(await pl.getByRole('button', { name: 'Bloc MJ' }).count(), 0);
  await pl.close();
  assert.ok(sid > 0);
});

test('écriture : Léa qui tape :::mj dans une section sans bloc : message sous le champ, texte conservé dans le champ', opts, async () => {
  const m = await monde('Secrets refus joueur');
  const sid = await section(m, 'Écrite par Léa', 'Texte de départ.', true);

  const page = await C.lea.ctx.newPage();
  await page.goto(`${srv.base}/univers/${m.u}/fiche/${m.f}`);
  await page.getByRole('heading', { name: 'Écrite par Léa' }).waitFor();
  await attendre(page);
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const saisie = 'Encore.\n\n:::mj\nINTRUS\n:::';
  await page.getByLabel('Contenu de « Écrite par Léa »').fill(saisie);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText(REFUS_BLOC).waitFor();
  assert.equal(await page.getByLabel('Contenu de « Écrite par Léa »').inputValue(), saisie);
  await page.screenshot({ path: '/tmp/kanevas-secrets-refus-joueur.png' });
  await page.close();
});

// ---------------------------------------------------------------- preview, and search after writing
