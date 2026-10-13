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
  assert.ok(!t.includes('Guilde des Brumes'));
  assert.ok(!t.includes(':::'));
  assert.equal(await page.locator('.bloc-mj').count(), 0);
  assert.equal(await page.getByText('MJ seul', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('note').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
  assert.deepEqual(dlg, []);
  await page.screenshot({ path: '/tmp/kanevas-secrets-lea.png' });
  await page.close();
});

test('critère : la réponse de lecture de Léa ne contient ni un mot du bloc ni la source', opts, async () => {
  const f = await vue(C.lea, LAME, PORT);
  const h = sec(f, 'Histoire');
  assert.ok(h.html.includes('<p>'));
  for (const mot of ['sous-main', 'Guilde', 'cargaisons', 'bloc-mj', 'Bloc MJ', ':::']) {
    assert.ok(!JSON.stringify(f).includes(mot), mot);
  }
  assert.equal('contenu' in h, false);
  assert.equal(h.peutEcrire, false);
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

test('critère : en mode Joueur, la lecture API d’Antor est celle de Léa', opts, async () => {
  const f = await vue(C.antor, LAME, PORT, 'joueur');
  const h = sec(f, 'Histoire');
  assert.ok(!JSON.stringify(f).includes('sous-main'));
  assert.ok(!h.html.includes('bloc-mj'));
  assert.equal(h.peutEcrire, false);
  assert.equal(h.html, sec(await vue(C.lea, LAME, PORT), 'Histoire').html);
});

test('critère : « sous-main » cherché dans Lieux par Léa ne rend pas Port-Sel ; par Antor, si', opts, async () => {
  assert.deepEqual(await trouvees(C.lea, LAME, 'lieu', 'sous-main'), []);
  assert.deepEqual(await trouvees(C.antor, LAME, 'lieu', 'sous-main', 'joueur'), []);
  assert.deepEqual(await trouvees(C.antor, LAME, 'lieu', 'sous-main'), ['Port-Sel']);
  // bord: a word of the public text still finds it, for Léa too
  assert.deepEqual(await trouvees(C.lea, LAME, 'lieu', 'sauniers'), ['Port-Sel']);

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

test('critère : l’assistant de Léa ne cite rien du bloc (lis-moi la section, que sait-on) ; celui d’Antor, si', opts, async () => {
  const demande = (c: Any, message: string, mode = '') =>
    api(c, 'post', `/api/univers/${LAME}/assistant/messages${mode}`, { message });
  const l1 = await demande(C.lea, 'Lis-moi la section « Histoire »');
  const s1 = JSON.stringify(l1);
  assert.ok(s1.includes('sauniers'), 'the public text is read: ' + s1);
  for (const mot of ['sous-main', 'Guilde', 'cargaisons', ':::', 'bloc-mj']) assert.ok(!s1.includes(mot), mot);
  const l2 = await demande(C.lea, 'Que sait-on de Port-Sel ?');
  for (const mot of ['sous-main', 'Guilde', 'cargaisons', ':::']) assert.ok(!JSON.stringify(l2).includes(mot), mot);
  const a = await demande(C.antor, 'Lis-moi la section « Histoire »');
  assert.ok(JSON.stringify(a).includes('sous-main'), 'the GM catalogue keeps the whole source');
  // the GM catalogue is the GM's even on screen in player mode (docs/ecrans.md, « L'assistant »)
  const aj = await demande(C.antor, 'Lis-moi la section « Histoire »', '?mode=joueur');
  assert.ok(JSON.stringify(aj).includes('sous-main'));
});

test('critère : l’écriture de Léa, auteur avec écriture, est refusée (403) par l’API et par l’assistant, rien n’est écrit', opts, async () => {
  const b = `/api/univers/${LAME}/fiches/${PORT}/sections/${HISTOIRE}`;
  const avant = await api(C.antor, 'get', b);
  const r = await brut(C.lea, 'put', `${b}/contenu`, { contenu: 'Remplacé par Léa.', version: avant.version });
  assert.equal(r.status, 403);
  assert.equal(r.corps.message, REFUS_ECRITURE);
  assert.ok(!JSON.stringify(r.corps).includes('sous-main'));
  const r2 = await brut(C.lea, 'put', `${b}/contenu`, { contenu: 'Public seulement.', version: avant.version });
  assert.equal(r2.status, 403);

  const ass = await api(C.lea, 'post', `/api/univers/${LAME}/assistant/messages`, {
    message: 'Ajoute le paragraphe « Ajout de Léa. » dans « Histoire »',
  });
  assert.deepEqual(ass.evenements ?? [], []);
  assert.ok(JSON.stringify(ass).includes(REFUS_ECRITURE) || JSON.stringify(ass).includes('Introuvable.'), JSON.stringify(ass));

  const apres = await api(C.antor, 'get', b);
  assert.equal(apres.contenu, avant.contenu);
  assert.equal(apres.version, avant.version);
});

test('critère : un import qui envoie :::mj produit le même rendu ; le rejeu est inchangé ; le contenu public suit chaque écriture', opts, async () => {
  const base = `${srv.base}/api/import/v1/univers/${ESSAI}`;
  const put = async (contenu: string): Promise<Any> => {
    const r = await fetch(`${base}/fiches/${encodeURIComponent('lieu:secrets-import')}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'lieu', titre: 'Anse Close', sections: [{ cle: 'desc', titre: 'Description', contenu, joueursLisent: true }] }),
    });
    return { status: r.status, corps: await r.json() };
  };
  const avecBloc = 'Un port.\n\n:::mj\nTenu en sous-main.\n:::\n\nFin publique.';
  const r1 = await put(avecBloc);
  assert.equal(r1.status, 200);
  assert.equal(r1.corps.etat, 'creee');
  const fid = r1.corps.id as number;
  const liste = async (c: Any, q: string) => trouvees(c, ESSAI, 'lieu', q);

  let lea = sec(await vue(C.lea, ESSAI, fid), 'Description');
  assert.ok(lea.html.includes('Un port.') && lea.html.includes('Fin publique.'));
  assert.ok(!lea.html.includes('sous-main') && !lea.html.includes('bloc-mj'));
  const antor = sec(await vue(C.antor, ESSAI, fid), 'Description');
  assert.ok(antor.html.includes('class="bloc-mj"') && antor.html.includes('sous-main'));
  assert.deepEqual(await liste(C.lea, 'sous-main'), []);
  assert.deepEqual(await liste(C.antor, 'sous-main'), ['Anse Close']);
  assert.deepEqual(await liste(C.lea, 'port'), ['Anse Close']);

  assert.equal((await put(avecBloc)).corps.etat, 'inchangee');

  // the block removed at the source: the word is public, searchable by Léa
  const r3 = await put('Un port.\n\nTenu en sous-main.\n\nFin publique.');
  assert.equal(r3.status, 200);
  assert.ok(sec(await vue(C.lea, ESSAI, fid), 'Description').html.includes('sous-main'));
  assert.deepEqual(await liste(C.lea, 'sous-main'), ['Anse Close']);
  // the block back: hidden again
  assert.equal((await put(avecBloc)).status, 200);
  lea = sec(await vue(C.lea, ESSAI, fid), 'Description');
  assert.ok(!lea.html.includes('sous-main'));
  assert.deepEqual(await liste(C.lea, 'sous-main'), []);
});

// ---------------------------------------------------------------- bords: the syntax

test('bord : paragraphes, liste, tableau et citation d’un bloc sont tous secrets ; deux blocs sont deux cadres', opts, async () => {
  const m = await monde('Secrets formes');
  await section(m, 'Formes', [
    'Public un.', '', ':::mj', '- LISTESECRETE', '', '| a | b |', '|---|---|', '| TABLESECRETE | x |', '', '> CITATIONSECRETE', ':::', '',
    'Public deux.', '', ':::mj', 'SECONDSECRET', ':::', '', 'Public trois.',
  ].join('\n'));
  const lea = await htmlLea(m, 'Formes');
  for (const mot of ['LISTESECRETE', 'TABLESECRETE', 'CITATIONSECRETE', 'SECONDSECRET']) assert.ok(!lea.includes(mot), mot);
  for (const mot of ['Public un.', 'Public deux.', 'Public trois.']) assert.ok(lea.includes(mot), mot);
  assert.ok(!lea.includes('bloc-mj') && !lea.includes('<table'));
  const antor = await htmlAntor(m, 'Formes');
  assert.equal((antor.match(/class="bloc-mj"/g) ?? []).length, 2);
  for (const mot of ['LISTESECRETE', 'TABLESECRETE', 'CITATIONSECRETE', 'SECONDSECRET']) assert.ok(antor.includes(mot), mot);
});

test('bord : un bloc dans un bloc ; le plus extérieur gouverne, le texte après sa fermeture est public', opts, async () => {
  const m = await monde('Secrets imbriques');
  await section(m, 'Gigogne', 'AVANT\n\n:::mj\nINTERIEURUN\n\n:::mj\nINTERIEURDEUX\n:::\n\nINTERIEURTROIS\n:::\n\nAPRES');
  const lea = await htmlLea(m, 'Gigogne');
  for (const mot of ['INTERIEURUN', 'INTERIEURDEUX', 'INTERIEURTROIS']) assert.ok(!lea.includes(mot), mot);
  assert.ok(lea.includes('AVANT') && lea.includes('APRES'));
});

test('exclusion : un « ::: » indenté de 4 espaces ou d’une tabulation ne livre à Léa rien de la suite du bloc', opts, async () => {
  // Panne : fermer le bloc sur une ligne « ::: » indentée (du code pour le moteur), puis livrer la suite du secret.
  const m = await monde('Secrets indentes');
  await section(m, 'Quatre', 'AVANTQ\n\n:::mj\nSECRETQUN\n\n    :::\n\nSECRETQDEUX\n:::\n\nAPRESQ');
  await section(m, 'Tabulation', 'AVANTT\n\n:::mj\nSECRETTUN\n\n\t:::\n\nSECRETTDEUX\n:::\n\nAPREST');
  for (const [titre, avant, apres, secrets] of [
    ['Quatre', 'AVANTQ', 'APRESQ', ['SECRETQUN', 'SECRETQDEUX']],
    ['Tabulation', 'AVANTT', 'APREST', ['SECRETTUN', 'SECRETTDEUX']],
  ] as const) {
    const lea = await htmlLea(m, titre);
    assert.ok(lea.includes(avant) && lea.includes(apres), titre);
    for (const mot of secrets) assert.ok(!lea.includes(mot), `${titre} ${mot}`);
    assert.deepEqual(await trouvees(C.lea, m.u, 'personnage', secrets[1]), [], `${titre} recherche`);
    assert.deepEqual(await trouvees(C.antor, m.u, 'personnage', secrets[1]), ['Maître Aldric'], `${titre} recherche MJ`);
  }
});

test('bord : un bloc jamais fermé couvre jusqu’à la fin de la section, même ouvert dans une citation', opts, async () => {
  const m = await monde('Secrets ouverts');
  await section(m, 'Ouvert', 'DEBUT\n\n:::mj\nSECRETOUVERT\n\nSUITEOUVERTE');
  await section(m, 'Citation', 'DEBUTC\n\n> :::mj\n> SECRETCITE\n\nSUITECITE');
  for (const [titre, debut, secrets] of [['Ouvert', 'DEBUT', ['SECRETOUVERT', 'SUITEOUVERTE']], ['Citation', 'DEBUTC', ['SECRETCITE', 'SUITECITE']]] as const) {
    const lea = await htmlLea(m, titre);
    assert.ok(lea.includes(debut), titre);
    for (const mot of secrets) assert.ok(!lea.includes(mot), `${titre} ${mot}`);
    const antor = await htmlAntor(m, titre);
    for (const mot of secrets) assert.ok(antor.includes(mot), `${titre} ${mot}`);
  }
});

test('bord : bloc vide = cadre sans texte pour le MJ, rien pour Léa ; section toute en bloc = « Rien d’écrit pour l’instant. »', opts, async () => {
  const m = await monde('Secrets vides');
  await section(m, 'Creux', 'Avant creux.\n\n:::mj\n:::\n\nAprès creux.');
  await section(m, 'Tout', ':::mj\nTOUTSECRET\n:::');
  assert.equal(((await htmlAntor(m, 'Creux')).match(/class="bloc-mj"/g) ?? []).length, 1);
  const leaCreux = await htmlLea(m, 'Creux');
  assert.ok(leaCreux.includes('Avant creux.') && leaCreux.includes('Après creux.') && !leaCreux.includes('bloc-mj'));

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

test('exclusion : code fencé, :::MJ, « ::: mj », ::::mj et « :::mj suite » ne sont pas des blocs, tout le monde les lit', opts, async () => {
  const m = await monde('Secrets non blocs');
  await section(m, 'Texte', [
    '```', ':::mj', 'DANSLECODE', ':::', '```', '',
    ':::MJ', 'MAJUSCULES', ':::', '',
    '::: mj', 'ESPACE', ':::', '',
    '::::mj', 'QUATRE', ':::', '',
    ':::mj suite', 'AVECMOTS', ':::',
  ].join('\n'));
  const lea = await htmlLea(m, 'Texte');
  for (const mot of ['DANSLECODE', 'MAJUSCULES', 'ESPACE', 'QUATRE', 'AVECMOTS']) assert.ok(lea.includes(mot), mot);
  assert.ok(!lea.includes('bloc-mj'));
  assert.ok(!(await htmlAntor(m, 'Texte')).includes('bloc-mj'));
  assert.deepEqual(await trouvees(C.lea, m.u, 'personnage', 'MAJUSCULES'), ['Maître Aldric']);
});

// ---------------------------------------------------------------- writing

test('écriture : « Bloc MJ » entoure la sélection, sinon pose deux lignes ; Léa ne le voit pas ; le bloc posé est secret', opts, async () => {
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

  const lea = await htmlLea(m, 'Notes');
  assert.ok(lea.includes('Avant') && !lea.includes('SECRETPOSE'));

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

test('écriture : Léa qui tape :::mj dans une section sans bloc est refusée (400), message sous le champ, texte conservé', opts, async () => {
  const m = await monde('Secrets refus joueur');
  const sid = await section(m, 'Écrite par Léa', 'Texte de départ.', true);
  const url = `${m.b}/fiches/${m.f}/sections/${sid}/contenu`;
  const v = (await api(C.lea, 'get', `${m.b}/fiches/${m.f}/sections/${sid}`)).version;
  const r = await brut(C.lea, 'put', url, { contenu: 'Public.\n\n:::mj\nINTRUS\n:::', version: v });
  assert.equal(r.status, 400);
  assert.equal(r.corps.message, REFUS_BLOC);
  assert.equal((await api(C.antor, 'get', `${m.b}/fiches/${m.f}/sections/${sid}`)).contenu, 'Texte de départ.');
  // a bound case: no block at all is accepted
  assert.equal((await brut(C.lea, 'put', url, { contenu: 'Public deux.', version: v })).status, 200);

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
  assert.equal((await api(C.antor, 'get', `${m.b}/fiches/${m.f}/sections/${sid}`)).contenu, 'Public deux.');
});

test('écriture : Léa ne crée pas de compte-rendu dont le texte contient un bloc MJ (400)', opts, async () => {
  const m = await monde('Secrets compte rendu');
  const c = await api(C.antor, 'post', `${m.b}/campagnes`, { nom: 'La Couronne brisée' });
  const r = await brut(C.lea, 'post', `${m.b}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 9', texte: 'Résumé.\n\n:::mj\nRUSE\n:::' });
  assert.equal(r.status, 400);
  assert.equal(r.corps.message, REFUS_BLOC);
  const ok = await brut(C.lea, 'post', `${m.b}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 10', texte: 'Résumé sans secret.' });
  assert.ok(ok.status < 300);
});

test('écriture : un MJ écrit une section à bloc par l’API et par l’assistant ; Léa, par l’assistant, est refusée sans événement', opts, async () => {
  const m = await monde('Secrets assistant');
  const sid = await section(m, 'Histoire', 'Public.\n\n:::mj\nSECRETASSIST\n:::', true);
  const url = `${m.b}/fiches/${m.f}/sections/${sid}`;
  const avant = await api(C.antor, 'get', url);
  const lea = await api(C.lea, 'post', `${m.b}/assistant/messages`, { message: 'Ajoute le paragraphe « Intrus. » dans « Histoire »' });
  assert.deepEqual(lea.evenements ?? [], []);
  assert.equal((await api(C.antor, 'get', url)).contenu, avant.contenu);
  const ant = await api(C.antor, 'post', `${m.b}/assistant/messages`, { message: 'Ajoute le paragraphe « Ajout du MJ. » dans « Histoire »' });
  assert.equal((ant.evenements ?? []).length, 1);
  const apres = await api(C.antor, 'get', url);
  assert.ok(apres.contenu.includes('SECRETASSIST') && apres.contenu.includes('Ajout du MJ.'));
  assert.ok(!(await htmlLea(m, 'Histoire')).includes('SECRETASSIST'));
});

// ---------------------------------------------------------------- preview, and search after writing

test('aperçu : Léa n’a aucun bloc, Antor le voit hachuré, Antor en mode Joueur n’en a pas', opts, async () => {
  const m = await monde('Secrets apercu');
  const texteApercu = 'Public.\n\n:::mj\nAPERCUSECRET\n:::';
  const ctx = { nature: 'section', univers_id: m.u };
  const lea = await brut(C.lea, 'post', '/api/apercu', { texte: texteApercu, contexte: ctx });
  assert.equal(lea.status, 200);
  assert.ok(lea.corps.html.includes('Public.') && !lea.corps.html.includes('APERCUSECRET') && !lea.corps.html.includes('bloc-mj'));
  const antor = await brut(C.antor, 'post', '/api/apercu', { texte: texteApercu, contexte: ctx });
  assert.ok(antor.corps.html.includes('class="bloc-mj"') && antor.corps.html.includes('APERCUSECRET'));
  const mj = await brut(C.antor, 'post', '/api/apercu', { texte: texteApercu, contexte: { ...ctx, mode: 'joueur' } });
  assert.ok(!mj.corps.html.includes('APERCUSECRET'));
  // a section preview without universe is refused; a universe the account is not a member of is unknown
  assert.equal((await brut(C.antor, 'post', '/api/apercu', { texte: texteApercu, contexte: { nature: 'section' } })).status, 400);
  assert.equal((await brut(C.lea, 'post', '/api/apercu', { texte: texteApercu, contexte: { nature: 'section', univers_id: 999999 } })).status, 404);
});

test('recherche : poser un bloc retire le mot de la recherche de Léa, le retirer le lui rend (index recréé à chaque écriture)', opts, async () => {
  const m = await monde('Secrets index');
  const sid = await section(m, 'Rumeurs', 'Le zéphyrin court les ruelles.');
  const url = `${m.b}/fiches/${m.f}/sections/${sid}`;
  assert.deepEqual(await trouvees(C.lea, m.u, 'personnage', 'zéphyrin'), ['Maître Aldric']);
  let v = (await api(C.antor, 'get', url)).version;
  await api(C.antor, 'put', `${url}/contenu`, { contenu: 'Public.\n\n:::mj\nLe zéphyrin court les ruelles.\n:::', version: v });
  assert.deepEqual(await trouvees(C.lea, m.u, 'personnage', 'zéphyrin'), []);
  assert.deepEqual(await trouvees(C.antor, m.u, 'personnage', 'zéphyrin'), ['Maître Aldric']);
  assert.deepEqual(await trouvees(C.lea, m.u, 'personnage', 'public'), ['Maître Aldric']);
  v = (await api(C.antor, 'get', url)).version;
  await api(C.antor, 'put', `${url}/contenu`, { contenu: 'Le zéphyrin court les ruelles.', version: v });
  assert.deepEqual(await trouvees(C.lea, m.u, 'personnage', 'zéphyrin'), ['Maître Aldric']);
});
