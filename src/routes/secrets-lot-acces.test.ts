// Doors of lot « acces » for `src/e2e/secrets-ensemble-besoin.test.ts` (kanevas-import-secrets, B-34, AD-98, AD-114):
// the MJ block `:::mj` never reaches a player — not by the read, the search, the assistant, the preview nor the import — and
// only a GM writes one. Everything here goes through `inject` (session routes, import API, assistant route), no browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const REFUS_ECRITURE = 'Vous ne pouvez pas modifier cette section.';
const REFUS_BLOC = 'Un bloc MJ ne peut être écrit que par un MJ.';

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

/** The seeded world, with Antor (GM) and Léa (player) signed in. */
async function monde() {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db), 'the stub world is seeded');
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const C = { antor, lea };
  const brut = async (h: H, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) => {
    const r = await app.inject({ method, url, headers: h, payload: payload as object | undefined });
    return { status: r.statusCode, corps: (r.body ? JSON.parse(r.body) : null) as Any };
  };
  const api = async (h: H, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown): Promise<Any> => {
    const r = await brut(h, method, url, payload);
    if (r.status >= 300) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(r.corps)}`);
    return r.corps;
  };
  const id = (nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const LAME = id("Lame d'Ébène");
  const ESSAI = id('Essai Kanka');
  const lieux = await api(antor, 'GET', `/api/univers/${LAME}/fiches?type=lieu`);
  const PORT = lieux.fiches.find((f: Any) => f.titre === 'Port-Sel').id as number;
  const f = await api(antor, 'GET', `/api/univers/${LAME}/fiches/${PORT}`);
  const HISTOIRE = f.sections.find((s: Any) => s.titre === 'Histoire').id as number;
  const LEA_ID = (await api(antor, 'GET', `/api/univers/${LAME}/membres`)).find((x: Any) => x.username === 'lea').compteId as number;
  const vue = (h: H, u: number, fid: number, mode = ''): Promise<Any> => api(h, 'GET', `/api/univers/${u}/fiches/${fid}${mode ? `?mode=${mode}` : ''}`);
  const sec = (fiche: Any, titre: string): Any => fiche.sections.find((s: Any) => s.titre === titre);
  const trouvees = async (h: H, u: number, type: string, q: string, mode = ''): Promise<string[]> =>
    (await api(h, 'GET', `/api/univers/${u}/fiches?type=${type}&q=${encodeURIComponent(q)}${mode ? `&mode=${mode}` : ''}`)).fiches.map((x: Any) => x.titre);
  /** A fresh universe: Antor GM, Léa player; one sheet « Maître Aldric ». */
  const nouveau = async (nom: string) => {
    const u = await api(antor, 'POST', '/api/univers', { nom });
    const b = `/api/univers/${u.id}`;
    await api(antor, 'POST', `${b}/membres`, { username: 'lea', role: 'joueur' });
    const fi = await api(antor, 'POST', `${b}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
    return { u: u.id as number, b, f: fi.id as number };
  };
  type M = Awaited<ReturnType<typeof nouveau>>;
  /** A section read by the players. `auteur`: Léa is its author with write access. */
  const section = async (m: M, titre: string, contenu: string, auteur = false): Promise<number> => {
    const s = await api(antor, 'POST', `${m.b}/fiches/${m.f}/sections`, { titre, contenu });
    await api(antor, 'PATCH', `${m.b}/fiches/${m.f}/sections/${s.id}`, auteur ? { joueursLisent: true, auteurId: LEA_ID, auteurLit: true, auteurEcrit: true } : { joueursLisent: true });
    return s.id as number;
  };
  const htmlLea = async (m: M, titre: string) => sec(await vue(lea, m.u, m.f), titre).html as string;
  const htmlAntor = async (m: M, titre: string, mode = '') => sec(await vue(antor, m.u, m.f, mode), titre).html as string;
  return { app, C, antor, lea, brut, api, LAME, ESSAI, PORT, HISTOIRE, vue, sec, trouvees, nouveau, section, htmlLea, htmlAntor };
}

// ---------------------------------------------------------------- the exit criterion, on the seeded « Port-Sel »
test('criterion > Léa’s read of « Histoire » has neither a word of the block nor its source, nor the right to write', async () => {
  const m = await monde();
  const f = await m.vue(m.lea, m.LAME, m.PORT);
  const h = m.sec(f, 'Histoire');
  assert.ok(h.html.includes('<p>'));
  for (const mot of ['sous-main', 'cargaisons', 'bloc-mj', 'Bloc MJ', ':::']) assert.ok(!JSON.stringify(f).includes(mot), mot);
  assert.equal('contenu' in h, false);
  assert.equal(h.peutEcrire, false);
});

test('criterion > in player mode the GM’s API read is Léa’s', async () => {
  const m = await monde();
  const f = await m.vue(m.antor, m.LAME, m.PORT, 'joueur');
  const h = m.sec(f, 'Histoire');
  assert.ok(!JSON.stringify(f).includes('sous-main'));
  assert.ok(!h.html.includes('bloc-mj'));
  assert.equal(h.peutEcrire, false);
  assert.equal(h.html, m.sec(await m.vue(m.lea, m.LAME, m.PORT), 'Histoire').html);
});

test('criterion > « sous-main » searched in the places finds nothing for Léa nor for the GM in player mode, finds Port-Sel for the GM; a public word finds it for all', async () => {
  const m = await monde();
  assert.deepEqual(await m.trouvees(m.lea, m.LAME, 'lieu', 'sous-main'), []);
  assert.deepEqual(await m.trouvees(m.antor, m.LAME, 'lieu', 'sous-main', 'joueur'), []);
  assert.deepEqual(await m.trouvees(m.antor, m.LAME, 'lieu', 'sous-main'), ['Port-Sel']);
  assert.deepEqual(await m.trouvees(m.lea, m.LAME, 'lieu', 'sauniers'), ['Port-Sel']);
});

test('criterion > Léa’s assistant quotes nothing of the block (read the section, what is known), the GM’s keeps the whole source, even in player mode', async () => {
  const m = await monde();
  const demande = (h: H, message: string, mode = '') => m.api(h, 'POST', `/api/univers/${m.LAME}/assistant/messages${mode}`, { message });
  const s1 = JSON.stringify(await demande(m.lea, 'Lis-moi la section « Histoire »'));
  assert.ok(s1.includes('sauniers'), 'the public text is read: ' + s1);
  for (const mot of ['sous-main', 'cargaisons', ':::', 'bloc-mj']) assert.ok(!s1.includes(mot), mot);
  const l2 = await demande(m.lea, 'Que sait-on de Port-Sel ?');
  for (const mot of ['sous-main', 'cargaisons', ':::']) assert.ok(!JSON.stringify(l2).includes(mot), mot);
  assert.ok(JSON.stringify(await demande(m.antor, 'Lis-moi la section « Histoire »')).includes('sous-main'), 'the GM catalogue keeps the whole source');
  assert.ok(JSON.stringify(await demande(m.antor, 'Lis-moi la section « Histoire »', '?mode=joueur')).includes('sous-main'));
});

test('criterion > Léa, author with write, is refused (403) by the API and by the assistant and nothing is written', async () => {
  const m = await monde();
  const b = `/api/univers/${m.LAME}/fiches/${m.PORT}/sections/${m.HISTOIRE}`;
  const avant = await m.api(m.antor, 'GET', b);
  const r = await m.brut(m.lea, 'PUT', `${b}/contenu`, { contenu: 'Remplacé par Léa.', version: avant.version });
  assert.equal(r.status, 403);
  assert.equal(r.corps.message, REFUS_ECRITURE);
  assert.ok(!JSON.stringify(r.corps).includes('sous-main'));
  assert.equal((await m.brut(m.lea, 'PUT', `${b}/contenu`, { contenu: 'Public seulement.', version: avant.version })).status, 403);
  const ass = await m.api(m.lea, 'POST', `/api/univers/${m.LAME}/assistant/messages`, { message: 'Ajoute le paragraphe « Ajout de Léa. » dans « Histoire »' });
  assert.deepEqual(ass.evenements ?? [], []);
  assert.ok(JSON.stringify(ass).includes(REFUS_ECRITURE) || JSON.stringify(ass).includes('Introuvable.'), JSON.stringify(ass));
  const apres = await m.api(m.antor, 'GET', b);
  assert.equal(apres.contenu, avant.contenu);
  assert.equal(apres.version, avant.version);
});

test('criterion > an import sending :::mj gives the same view; the replay is unchanged; the public content follows each write', async () => {
  const m = await monde();
  const put = async (contenu: string): Promise<{ status: number; corps: Any }> => {
    const r = await m.app.inject({
      method: 'PUT',
      url: `/api/import/v1/univers/${m.ESSAI}/fiches/${encodeURIComponent('lieu:secrets-import')}`,
      headers: { authorization: `Bearer ${JETON_BOUCHON}` },
      payload: { type: 'lieu', titre: 'Anse Close', sections: [{ cle: 'desc', titre: 'Description', contenu, joueursLisent: true }] },
    });
    return { status: r.statusCode, corps: r.json() };
  };
  const avecBloc = 'Un port.\n\n:::mj\nTenu en sous-main.\n:::\n\nFin publique.';
  const r1 = await put(avecBloc);
  assert.equal(r1.status, 200);
  assert.equal(r1.corps.etat, 'creee');
  const fid = r1.corps.id as number;
  const liste = (h: H, q: string) => m.trouvees(h, m.ESSAI, 'lieu', q);
  let lea = m.sec(await m.vue(m.lea, m.ESSAI, fid), 'Description');
  assert.ok(lea.html.includes('Un port.') && lea.html.includes('Fin publique.'));
  assert.ok(!lea.html.includes('sous-main') && !lea.html.includes('bloc-mj'));
  const antor = m.sec(await m.vue(m.antor, m.ESSAI, fid), 'Description');
  assert.ok(antor.html.includes('class="bloc-mj"') && antor.html.includes('sous-main'));
  assert.deepEqual(await liste(m.lea, 'sous-main'), []);
  assert.deepEqual(await liste(m.antor, 'sous-main'), ['Anse Close']);
  assert.deepEqual(await liste(m.lea, 'port'), ['Anse Close']);
  assert.equal((await put(avecBloc)).corps.etat, 'inchangee');
  assert.equal((await put('Un port.\n\nTenu en sous-main.\n\nFin publique.')).status, 200);
  assert.ok(m.sec(await m.vue(m.lea, m.ESSAI, fid), 'Description').html.includes('sous-main'));
  assert.deepEqual(await liste(m.lea, 'sous-main'), ['Anse Close']);
  assert.equal((await put(avecBloc)).status, 200);
  lea = m.sec(await m.vue(m.lea, m.ESSAI, fid), 'Description');
  assert.ok(!lea.html.includes('sous-main'));
  assert.deepEqual(await liste(m.lea, 'sous-main'), []);
});

// ---------------------------------------------------------------- bounds: the syntax
test('bounds > paragraphs, list, table and quote of a block are all secret; two blocks are two frames', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets formes');
  await m.section(w, 'Formes', [
    'Public un.', '', ':::mj', '- LISTESECRETE', '', '| a | b |', '|---|---|', '| TABLESECRETE | x |', '', '> CITATIONSECRETE', ':::', '',
    'Public deux.', '', ':::mj', 'SECONDSECRET', ':::', '', 'Public trois.',
  ].join('\n'));
  const lea = await m.htmlLea(w, 'Formes');
  for (const mot of ['LISTESECRETE', 'TABLESECRETE', 'CITATIONSECRETE', 'SECONDSECRET']) assert.ok(!lea.includes(mot), mot);
  for (const mot of ['Public un.', 'Public deux.', 'Public trois.']) assert.ok(lea.includes(mot), mot);
  assert.ok(!lea.includes('bloc-mj') && !lea.includes('<table'));
  const antor = await m.htmlAntor(w, 'Formes');
  assert.equal((antor.match(/class="bloc-mj"/g) ?? []).length, 2);
  for (const mot of ['LISTESECRETE', 'TABLESECRETE', 'CITATIONSECRETE', 'SECONDSECRET']) assert.ok(antor.includes(mot), mot);
});

test('bounds > a block in a block: the outermost governs, the text after its closing is public', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets imbriques');
  await m.section(w, 'Gigogne', 'AVANT\n\n:::mj\nINTERIEURUN\n\n:::mj\nINTERIEURDEUX\n:::\n\nINTERIEURTROIS\n:::\n\nAPRES');
  const lea = await m.htmlLea(w, 'Gigogne');
  for (const mot of ['INTERIEURUN', 'INTERIEURDEUX', 'INTERIEURTROIS']) assert.ok(!lea.includes(mot), mot);
  assert.ok(lea.includes('AVANT') && lea.includes('APRES'));
});

test('exclusion > a « ::: » indented by 4 spaces or a tab gives Léa nothing of the rest of the block, in the read nor in the search', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets indentes');
  await m.section(w, 'Quatre', 'AVANTQ\n\n:::mj\nSECRETQUN\n\n    :::\n\nSECRETQDEUX\n:::\n\nAPRESQ');
  await m.section(w, 'Tabulation', 'AVANTT\n\n:::mj\nSECRETTUN\n\n\t:::\n\nSECRETTDEUX\n:::\n\nAPREST');
  for (const [titre, avant, apres, secrets] of [
    ['Quatre', 'AVANTQ', 'APRESQ', ['SECRETQUN', 'SECRETQDEUX']],
    ['Tabulation', 'AVANTT', 'APREST', ['SECRETTUN', 'SECRETTDEUX']],
  ] as const) {
    const lea = await m.htmlLea(w, titre);
    assert.ok(lea.includes(avant) && lea.includes(apres), titre);
    for (const mot of secrets) assert.ok(!lea.includes(mot), `${titre} ${mot}`);
    assert.deepEqual(await m.trouvees(m.lea, w.u, 'personnage', secrets[1]), [], `${titre} search`);
    assert.deepEqual(await m.trouvees(m.antor, w.u, 'personnage', secrets[1]), ['Maître Aldric'], `${titre} GM search`);
  }
});

test('bounds > a block never closed covers the rest of the section, even opened in a quote', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets ouverts');
  await m.section(w, 'Ouvert', 'DEBUT\n\n:::mj\nSECRETOUVERT\n\nSUITEOUVERTE');
  await m.section(w, 'Citation', 'DEBUTC\n\n> :::mj\n> SECRETCITE\n\nSUITECITE');
  for (const [titre, debut, secrets] of [['Ouvert', 'DEBUT', ['SECRETOUVERT', 'SUITEOUVERTE']], ['Citation', 'DEBUTC', ['SECRETCITE', 'SUITECITE']]] as const) {
    const lea = await m.htmlLea(w, titre);
    assert.ok(lea.includes(debut), titre);
    for (const mot of secrets) assert.ok(!lea.includes(mot), `${titre} ${mot}`);
    const antor = await m.htmlAntor(w, titre);
    for (const mot of secrets) assert.ok(antor.includes(mot), `${titre} ${mot}`);
  }
});

test('bounds > an empty block is a frame without text for the GM, nothing for Léa; a whole-block section reads empty for Léa', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets vides');
  await m.section(w, 'Creux', 'Avant creux.\n\n:::mj\n:::\n\nAprès creux.');
  await m.section(w, 'Tout', ':::mj\nTOUTSECRET\n:::');
  assert.equal(((await m.htmlAntor(w, 'Creux')).match(/class="bloc-mj"/g) ?? []).length, 1);
  const leaCreux = await m.htmlLea(w, 'Creux');
  assert.ok(leaCreux.includes('Avant creux.') && leaCreux.includes('Après creux.') && !leaCreux.includes('bloc-mj'));
  const leaTout = await m.htmlLea(w, 'Tout');
  assert.ok(!leaTout.includes('TOUTSECRET') && !leaTout.includes(':::'));
});

test('exclusion > fenced code, :::MJ, « ::: mj », ::::mj and « :::mj suite » are not blocks: everyone reads them, the search finds them', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets non blocs');
  await m.section(w, 'Texte', [
    '```', ':::mj', 'DANSLECODE', ':::', '```', '', ':::MJ', 'MAJUSCULES', ':::', '', '::: mj', 'ESPACE', ':::', '', '::::mj', 'QUATRE', ':::', '', ':::mj suite', 'AVECMOTS', ':::',
  ].join('\n'));
  const lea = await m.htmlLea(w, 'Texte');
  for (const mot of ['DANSLECODE', 'MAJUSCULES', 'ESPACE', 'QUATRE', 'AVECMOTS']) assert.ok(lea.includes(mot), mot);
  assert.ok(!lea.includes('bloc-mj'));
  assert.ok(!(await m.htmlAntor(w, 'Texte')).includes('bloc-mj'));
  assert.deepEqual(await m.trouvees(m.lea, w.u, 'personnage', 'MAJUSCULES'), ['Maître Aldric']);
});

// ---------------------------------------------------------------- writing
test('writing > Léa typing :::mj in a section without a block is refused (400), the text is kept; a text without a block is accepted', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets refus joueur');
  const sid = await m.section(w, 'Écrite par Léa', 'Texte de départ.', true);
  const url = `${w.b}/fiches/${w.f}/sections/${sid}/contenu`;
  const v = (await m.api(m.lea, 'GET', `${w.b}/fiches/${w.f}/sections/${sid}`)).version;
  const r = await m.brut(m.lea, 'PUT', url, { contenu: 'Public.\n\n:::mj\nINTRUS\n:::', version: v });
  assert.equal(r.status, 400);
  assert.equal(r.corps.message, REFUS_BLOC);
  assert.equal((await m.api(m.antor, 'GET', `${w.b}/fiches/${w.f}/sections/${sid}`)).contenu, 'Texte de départ.');
  assert.equal((await m.brut(m.lea, 'PUT', url, { contenu: 'Public deux.', version: v })).status, 200);
  assert.equal((await m.api(m.antor, 'GET', `${w.b}/fiches/${w.f}/sections/${sid}`)).contenu, 'Public deux.');
});

test('writing > Léa creates no report whose text carries an MJ block (400); a report without secret is created', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets compte rendu');
  const c = await m.api(m.antor, 'POST', `${w.b}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'La Couronne brisée', sections: [{ titre: 'Présentation', joueursLisent: true }] });
  const r = await m.brut(m.lea, 'POST', `${w.b}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 9', texte: 'Résumé.\n\n:::mj\nRUSE\n:::' });
  assert.equal(r.status, 400);
  assert.equal(r.corps.message, REFUS_BLOC);
  assert.ok((await m.brut(m.lea, 'POST', `${w.b}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 10', texte: 'Résumé sans secret.' })).status < 300);
});

test('writing > a GM writes a block section by the API and by the assistant; Léa, by the assistant, is refused without an event', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets assistant');
  const sid = await m.section(w, 'Histoire', 'Public.\n\n:::mj\nSECRETASSIST\n:::', true);
  const url = `${w.b}/fiches/${w.f}/sections/${sid}`;
  const avant = await m.api(m.antor, 'GET', url);
  const lea = await m.api(m.lea, 'POST', `${w.b}/assistant/messages`, { message: 'Ajoute le paragraphe « Intrus. » dans « Histoire »' });
  assert.deepEqual(lea.evenements ?? [], []);
  assert.equal((await m.api(m.antor, 'GET', url)).contenu, avant.contenu);
  const ant = await m.api(m.antor, 'POST', `${w.b}/assistant/messages`, { message: 'Ajoute le paragraphe « Ajout du MJ. » dans « Histoire »' });
  assert.equal((ant.evenements ?? []).length, 1);
  const apres = await m.api(m.antor, 'GET', url);
  assert.ok(apres.contenu.includes('SECRETASSIST') && apres.contenu.includes('Ajout du MJ.'));
  assert.ok(!(await m.htmlLea(w, 'Histoire')).includes('SECRETASSIST'));
});

test('preview > Léa’s preview has no block, the GM’s has it, the GM in player mode has none; a section preview without universe is 400, a foreign universe 404', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets apercu');
  const texteApercu = 'Public.\n\n:::mj\nAPERCUSECRET\n:::';
  const ctx = { nature: 'section', univers_id: w.u };
  const lea = await m.brut(m.lea, 'POST', '/api/apercu', { texte: texteApercu, contexte: ctx });
  assert.equal(lea.status, 200);
  assert.ok(lea.corps.html.includes('Public.') && !lea.corps.html.includes('APERCUSECRET') && !lea.corps.html.includes('bloc-mj'));
  const antor = await m.brut(m.antor, 'POST', '/api/apercu', { texte: texteApercu, contexte: ctx });
  assert.ok(antor.corps.html.includes('class="bloc-mj"') && antor.corps.html.includes('APERCUSECRET'));
  const mj = await m.brut(m.antor, 'POST', '/api/apercu', { texte: texteApercu, contexte: { ...ctx, mode: 'joueur' } });
  assert.ok(!mj.corps.html.includes('APERCUSECRET'));
  assert.equal((await m.brut(m.antor, 'POST', '/api/apercu', { texte: texteApercu, contexte: { nature: 'section' } })).status, 400);
  assert.equal((await m.brut(m.lea, 'POST', '/api/apercu', { texte: texteApercu, contexte: { nature: 'section', univers_id: 999999 } })).status, 404);
});

test('search > putting a block removes the word from Léa’s search, removing it brings the word back (index rebuilt at each write)', async () => {
  const m = await monde();
  const w = await m.nouveau('Secrets index');
  const sid = await m.section(w, 'Rumeurs', 'Le zéphyrin court les ruelles.');
  const url = `${w.b}/fiches/${w.f}/sections/${sid}`;
  assert.deepEqual(await m.trouvees(m.lea, w.u, 'personnage', 'zéphyrin'), ['Maître Aldric']);
  let v = (await m.api(m.antor, 'GET', url)).version;
  await m.api(m.antor, 'PUT', `${url}/contenu`, { contenu: 'Public.\n\n:::mj\nLe zéphyrin court les ruelles.\n:::', version: v });
  assert.deepEqual(await m.trouvees(m.lea, w.u, 'personnage', 'zéphyrin'), []);
  assert.deepEqual(await m.trouvees(m.antor, w.u, 'personnage', 'zéphyrin'), ['Maître Aldric']);
  assert.deepEqual(await m.trouvees(m.lea, w.u, 'personnage', 'public'), ['Maître Aldric']);
  v = (await m.api(m.antor, 'GET', url)).version;
  await m.api(m.antor, 'PUT', `${url}/contenu`, { contenu: 'Le zéphyrin court les ruelles.', version: v });
  assert.deepEqual(await m.trouvees(m.lea, w.u, 'personnage', 'zéphyrin'), ['Maître Aldric']);
});
