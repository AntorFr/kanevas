// Independent acceptance tests of the whole feature kanevas-import-liens, written from the need only:
// docs/parcours.md (B-33, B-36, P-12 steps 2, 3 and 5, P-14 steps 1 and 4, P-10 step 4), docs/ecrans.md (E-9 links,
// E-7 links, « Mentionnée dans », « Données de départ du bouchon »), the exit criterion of the feature sheet.
// Every expected value is a literal taken from those documents. The product runs for real in stub mode
// (AD-55) with its starting data: real server, real SQLite, real Chromium; nothing is mocked.
//
// PLAN DE TEST (besoin -> famille -> cas)
//  B-33 nominal    Antor inserts, with `[[`, a link to « Maître Aldric » and one to « La Guilde des Brumes » (GM only) in
//                  « Histoire » of « Port-Sel »; Léa reads the first as a link that opens « Maître Aldric », the second as
//                  plain text with no mark; « Mentionnée dans » of Aldric names « Port-Sel » for her.
//  B-33 bords      grammar: code span, code block, `|` in the text, empty text, id 0, 201-char text stay text; a 200-char text links.
//  B-33 échec      Léa types the bare `[[<id>]]` of the Guild: 400 lien_illisible, text and version unchanged; a readable bare id is
//                  rewritten `[[<id>|<titre>]]`; her `[[<id>|ma guilde]]` is saved but reads as text.
//  B-33 exclusions Léa's `[[` list never offers the Guild; a broken link (999999) and a waiting key are marks for Antor only and
//                  plain text for Léa and for Antor in player mode; a system entry keeps `[[…]]` as text (no button, no list).
//  B-33 import     `[[cle:faction:guilde|la Guilde]]` before the Guild exists: waiting (« en attente » for Antor, text for Léa);
//                  the Guild's import resolves it without touching the section version; replaying both gives « inchangée »;
//                  the lot counts the waiting links.
//  B-33 scénario   « La Couronne brisée »: a link to Aldric opens his sheet, 999999 is marked broken, a sheet of another universe
//                  is not a link; `[[` lists the sheets of the campaign's universe only; scenario links are not mentions; Léa has no E-7.
//  B-36 nominal    Aldric's « Mentionnée dans »: Léa -> « Port-Sel »; Antor -> the Guild, Port-Sel, the GM-only report.
//  B-36 bords      60 citing sheets: 50 then « Afficher les 10 suivants »; a relation alone, a relation and a link together (« · »).
//  B-36 exclusions a link inside a GM block (Antor only, not in player mode); a relation carried by a section Léa cannot read;
//                  a sheet citing itself; no counter of what is hidden.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';
import { comptes, json } from './monde-aide.test.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue'; // « Jeton du bouchon » (docs/ecrans.md)
const SHOTS = process.env.SHOTS_DIR ?? '/tmp/shots';
const opts = { skip: skipBrowser };

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;
let lame = 0;
let kanka = 0;
const id: Record<string, number> = {};

async function http(c: Any, method: 'get' | 'post' | 'put' | 'patch', url: string, data?: unknown): Promise<{ status: number; json: Any }> {
  const r = await c.ctx.request[method](url, data === undefined ? {} : { data });
  return { status: r.status(), json: await json(r) };
}
async function ok(c: Any, method: 'get' | 'post' | 'put' | 'patch', url: string, data?: unknown): Promise<Any> {
  const r = await http(c, method, url, data);
  if (r.status >= 300) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}
async function imp(method: string, chemin: string, corps?: unknown): Promise<{ status: number; json: Any }> {
  const r = await fetch(`${srv.base}/api/import/v1/univers/${kanka}${chemin}`, {
    method,
    headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const t = await r.text();
  return { status: r.status, json: t ? JSON.parse(t) : null };
}
const put = async (cle: string, corps: unknown, lotId: number) => (await imp('PUT', `/fiches/${cle}?lot=${lotId}`, corps)).json;
const fichePage = async (page: Any, u: number, f: number) => {
  await page.goto(`${srv.base}/univers/${u}/fiche/${f}`);
  await page.waitForLoadState('networkidle');
};
const lireFiche = (c: Any, f: number, mode = '', u = lame) => ok(c, 'get', `/api/univers/${u}/fiches/${f}${mode}`);
const sectionDe = (fiche: Any, titre: string) => fiche.sections.find((s: Any) => s.titre === titre);
const titresMentions = (fiche: Any) => fiche.mentions.map((m: Any) => m.titre);
const trouver = async (c: Any, u: number, titre: string): Promise<number> => {
  const l = await ok(c, 'get', `/api/univers/${u}/fiches?q=${encodeURIComponent(titre)}`);
  return l.fiches.find((f: Any) => f.titre === titre).id;
};
/** A sheet with one section, set to the given audience; returns the ids. */
async function creerFiche(c: Any, titre: string, sec: string, contenu: string, bascules: Record<string, boolean> = { joueursLisent: true }) {
  const f = await ok(c, 'post', `/api/univers/${lame}/fiches`, { type: 'lieu', titre, charge: { v: 1 } });
  const s = await ok(c, 'post', `/api/univers/${lame}/fiches/${f.id}/sections`, { titre: sec, contenu });
  if (Object.keys(bascules).length > 0) await ok(c, 'patch', `/api/univers/${lame}/fiches/${f.id}/sections/${s.id}`, bascules);
  return { fiche: f.id as number, section: s.id as number };
}
const ecrire = (c: Any, f: number, s: number, contenu: string, version: number) =>
  http(c, 'put', `/api/univers/${lame}/fiches/${f}/sections/${s}/contenu`, { contenu, version });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  C = await comptes(srv, browser);
  const univers = (await ok(C.antor, 'get', '/api/univers')) as { id: number; nom: string }[];
  lame = univers.find((u) => u.nom === "Lame d'Ébène")!.id;
  kanka = univers.find((u) => u.nom === 'Essai Kanka')!.id;
  for (const t of ['Maître Aldric', 'Port-Sel', 'La Guilde des Brumes', "Rapport secret de l'amirauté"]) id[t] = await trouver(C.antor, lame, t);
  id['Anse-aux-Sels'] = await trouver(C.antor, kanka, 'Anse-aux-Sels');
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

describe('critère de sortie : Port-Sel, Maître Aldric, La Guilde des Brumes', opts, () => {
  test('B-33 nominal : Antor insère deux liens par [[ ; Léa lit un lien qui ouvre Aldric et un texte sans marque', async () => {
    const antor = await C.antor.ctx.newPage();
    await fichePage(antor, lame, id['Port-Sel']!);
    const histoire = antor.locator('section.sec').filter({ has: antor.getByRole('heading', { name: 'Histoire', exact: true }) }).last();
    await histoire.getByRole('button', { name: 'Modifier', exact: true }).click();
    const champ = histoire.getByRole('textbox').first();
    await champ.fill('On cite ');
    await champ.pressSequentially('[[ald');
    const liste = antor.getByRole('listbox');
    await liste.getByRole('option', { name: /Maître Aldric/ }).click();
    await champ.pressSequentially(' et ');
    await champ.pressSequentially('[[guil');
    await liste.getByRole('option', { name: /La Guilde des Brumes/ }).click();
    await antor.screenshot({ path: `${SHOTS}/liens-critere-antor-edition.png` });
    await histoire.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await antor.waitForLoadState('networkidle');
    const f = await lireFiche(C.antor, id['Port-Sel']!);
    const contenu: string = (await ok(C.antor, 'get', `/api/univers/${lame}/fiches/${id['Port-Sel']}/sections/${sectionDe(f, 'Histoire').id}`)).contenu;
    assert.ok(contenu.includes(`[[${id['Maître Aldric']}|Maître Aldric]]`), contenu);
    assert.ok(contenu.includes(`[[${id['La Guilde des Brumes']}|La Guilde des Brumes]]`), contenu);

    const lea = await C.lea.ctx.newPage();
    await fichePage(lea, lame, id['Port-Sel']!);
    const hl = lea.locator('section.sec').filter({ has: lea.getByRole('heading', { name: 'Histoire', exact: true }) }).last();
    assert.equal(await hl.locator('a').count(), 1, 'un seul lien pour Léa');
    const lien = hl.getByRole('link', { name: 'Maître Aldric', exact: true });
    assert.equal(await lien.getAttribute('href'), `/univers/${lame}/fiche/${id['Maître Aldric']}`);
    assert.match(await hl.innerText(), /La Guilde des Brumes/, 'le texte de la Guilde reste lisible');
    assert.equal(await hl.locator('.lien-casse, .lien-attente, [title]').count(), 0, 'aucune marque');
    assert.ok(!(await hl.innerHTML()).includes(`/fiche/${id['La Guilde des Brumes']}`), "l'adresse de la Guilde ne sort pas");
    await lea.screenshot({ path: `${SHOTS}/liens-critere-lea-port-sel.png` });
    await lien.click();
    await lea.waitForURL(new RegExp(`/univers/${lame}/fiche/${id['Maître Aldric']}$`));
    await lea.waitForLoadState('networkidle');
    await lea.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
    const mentions = lea.getByRole('region', { name: /Mentionnée dans/ });
    assert.match(await mentions.innerText(), /Port-Sel/);
    assert.doesNotMatch(await mentions.innerText(), /Guilde|Rapport secret/);
    await lea.screenshot({ path: `${SHOTS}/liens-critere-lea-aldric.png` });
    await antor.close();
    await lea.close();
  });

  test('B-36 nominal : « Mentionnée dans » de Maître Aldric, Léa puis Antor, titres puis identifiants', async () => {
    const pourLea = await lireFiche(C.lea, id['Maître Aldric']!);
    assert.deepEqual(titresMentions(pourLea), ['Port-Sel']);
    assert.equal(pourLea.mentionsSuite, false);
    assert.equal(pourLea.mentions[0].pourquoi[0].genre, 'lien');
    assert.equal(pourLea.mentions[0].pourquoi[0].section, 'Histoire');
    const pourAntor = await lireFiche(C.antor, id['Maître Aldric']!);
    assert.deepEqual(titresMentions(pourAntor), ['La Guilde des Brumes', 'Port-Sel', "Rapport secret de l'amirauté"]);
  });

  test('B-36 exclusion : le lien du bloc MJ de « Rapport secret » ne paraît que pour Antor, et pas en mode Joueur', async () => {
    assert.ok(titresMentions(await lireFiche(C.antor, id['Maître Aldric']!)).includes("Rapport secret de l'amirauté"));
    assert.ok(!titresMentions(await lireFiche(C.lea, id['Maître Aldric']!)).includes("Rapport secret de l'amirauté"));
    assert.deepEqual(titresMentions(await lireFiche(C.antor, id['Maître Aldric']!, '?mode=joueur')), ['Port-Sel']);
  });

  test('B-33 exclusion : Antor en mode Joueur lit la Guilde comme du texte, comme Léa', async () => {
    const f = await lireFiche(C.antor, id['Port-Sel']!, '?mode=joueur');
    const html: string = sectionDe(f, 'Histoire').html;
    assert.match(html, /La Guilde des Brumes/);
    assert.ok(!html.includes(`/fiche/${id['La Guilde des Brumes']}`));
    assert.ok(html.includes(`href="/univers/${lame}/fiche/${id['Maître Aldric']}"`));
    const pourAntor: string = sectionDe(await lireFiche(C.antor, id['Port-Sel']!), 'Histoire').html;
    assert.ok(pourAntor.includes(`href="/univers/${lame}/fiche/${id['La Guilde des Brumes']}"`), 'Antor, hors mode Joueur, lit le lien');
  });
});

describe('B-33 : lire un lien cassé ou en attente, selon le lecteur (Anse-aux-Sels, Essai Kanka)', opts, () => {
  test('Antor lit « Capitaine Hesk » cassé et « les contrebandiers du Repaire » en attente ; Léa lit deux textes simples', async () => {
    const antor = await C.antor.ctx.newPage();
    await fichePage(antor, kanka, id['Anse-aux-Sels']!);
    const casse = antor.locator('.lien-casse', { hasText: 'Capitaine Hesk' });
    const attente = antor.locator('.lien-attente', { hasText: 'les contrebandiers du Repaire' });
    assert.equal(await casse.count(), 1);
    assert.equal(await attente.count(), 1);
    assert.equal(await casse.getAttribute('title'), "Lien cassé : cette fiche n'existe plus.");
    assert.equal(await attente.getAttribute('title'), "Lien en attente : aucune fiche n'a encore la clé « faction:repaire ».");
    await antor.screenshot({ path: `${SHOTS}/liens-anse-antor.png` });
    const lea = await C.lea.ctx.newPage();
    await fichePage(lea, kanka, id['Anse-aux-Sels']!);
    const corps = await lea.locator('main').innerText();
    assert.match(corps, /Capitaine Hesk/);
    assert.match(corps, /les contrebandiers du Repaire/);
    assert.equal(await lea.locator('.lien-casse, .lien-attente, main a[href*="/fiche/"]').count(), 0);
    await lea.screenshot({ path: `${SHOTS}/liens-anse-lea.png` });
    await antor.close();
    await lea.close();
  });

  test('Antor en mode Joueur lit les deux comme du texte (API)', async () => {
    const f = await lireFiche(C.antor, id['Anse-aux-Sels']!, '?mode=joueur', kanka);
    const html: string = f.sections.map((s: Any) => s.html).join('');
    assert.match(html, /Capitaine Hesk/);
    assert.doesNotMatch(html, /lien-casse|lien-attente/);
    const mj = (await lireFiche(C.antor, id['Anse-aux-Sels']!, '', kanka)).sections.map((s: Any) => s.html).join('');
    assert.match(mj, /lien-casse/);
    assert.match(mj, /lien-attente/);
  });
});

describe('B-33 : écrire un lien, refus et grammaire', () => {
  let carnet = { fiche: 0, section: 0 };
  before(async () => {
    if (skipBrowser) return;
    carnet = await creerFiche(C.antor, 'Carnet partagé', 'Notes', 'Rien.', { joueursLisent: true, joueursEcrivent: true });
  });

  test('échec : Léa tape [[<id>]] de la Guilde : 400 lien_illisible, texte et version inchangés', opts, async () => {
    const avant = await ok(C.lea, 'get', `/api/univers/${lame}/fiches/${carnet.fiche}/sections/${carnet.section}`);
    const r = await ecrire(C.lea, carnet.fiche, carnet.section, `Voir [[${id['La Guilde des Brumes']}]]`, avant.version);
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'lien_illisible');
    assert.equal(r.json.message, "Cette fiche n'existe pas ou vous ne pouvez pas la lire.");
    const apres = await ok(C.lea, 'get', `/api/univers/${lame}/fiches/${carnet.fiche}/sections/${carnet.section}`);
    assert.equal(apres.contenu, 'Rien.');
    assert.equal(apres.version, avant.version);
  });

  test('bord : [[<id>]] d\'une fiche lisible est réécrit [[<id>|<titre>]] ; [[<id inconnu>]] est refusé', opts, async () => {
    const avant = await ok(C.lea, 'get', `/api/univers/${lame}/fiches/${carnet.fiche}/sections/${carnet.section}`);
    const r = await ecrire(C.lea, carnet.fiche, carnet.section, `Voir [[${id['Maître Aldric']}]]`, avant.version);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const apres = await ok(C.lea, 'get', `/api/univers/${lame}/fiches/${carnet.fiche}/sections/${carnet.section}`);
    assert.equal(apres.contenu, `Voir [[${id['Maître Aldric']}|Maître Aldric]]`);
    const inconnu = await ecrire(C.lea, carnet.fiche, carnet.section, 'Voir [[999999]]', apres.version);
    assert.equal(inconnu.status, 400);
    assert.equal(inconnu.json.code, 'lien_illisible');
  });

  test("exclusion : [[<id>|ma guilde]] de Léa s'enregistre tel quel, se lit comme du texte pour elle, comme un lien pour Antor", opts, async () => {
    const avant = await ok(C.lea, 'get', `/api/univers/${lame}/fiches/${carnet.fiche}/sections/${carnet.section}`);
    const texte = `Ma [[${id['La Guilde des Brumes']}|ma guilde]] à moi`;
    const r = await ecrire(C.lea, carnet.fiche, carnet.section, texte, avant.version);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const lue = await ok(C.lea, 'get', `/api/univers/${lame}/fiches/${carnet.fiche}/sections/${carnet.section}`);
    assert.equal(lue.contenu, texte);
    const pageLea: string = sectionDe(await lireFiche(C.lea, carnet.fiche), 'Notes').html;
    assert.match(pageLea, /ma guilde/);
    assert.doesNotMatch(pageLea, /<a |lien-/);
    const pageAntor: string = sectionDe(await lireFiche(C.antor, carnet.fiche), 'Notes').html;
    assert.ok(pageAntor.includes(`href="/univers/${lame}/fiche/${id['La Guilde des Brumes']}"`));
  });

  test("bords : code en ligne, bloc de code, « | » dans le texte, texte vide, id 0, 201 caractères restent du texte ; 200 caractères font un lien", opts, async () => {
    const a = id['Maître Aldric'];
    const t200 = 'x'.repeat(200);
    const t201 = 'y'.repeat(201);
    const banc = await creerFiche(C.antor, 'Banc de grammaire', 'Texte', 'vide');
    const contenu = [
      `Ligne un \`[[${a}|enligne]]\``,
      '',
      '```',
      `[[${a}|enbloc]]`,
      '```',
      '',
      `[[${a}|a|b]]`,
      '',
      `[[${a}|]]`,
      '',
      '[[0|zero]]',
      '',
      `[[${a}|${t201}]]`,
      '',
      `[[${a}|${t200}]]`,
      '',
      `[[${banc.fiche}|moi-même]]`,
    ].join('\n');
    const r = await ecrire(C.antor, banc.fiche, banc.section, contenu, 1);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const html: string = sectionDe(await lireFiche(C.antor, banc.fiche), 'Texte').html;
    const liens = html.match(/<a class="lien-fiche"[^>]*>[^<]*<\/a>/g) ?? [];
    assert.equal(liens.length, 2, html);
    assert.ok(liens.some((l) => l.includes(`>${t200}<`)), 'le texte de 200 caractères fait un lien');
    assert.ok(!html.includes(`>${t201}</a>`), 'le texte de 201 caractères reste du texte');
    for (const reste of ['[[0|zero]]', `[[${a}|a|b]]`, `[[${a}|]]`, `[[${a}|enligne]]`, `[[${a}|enbloc]]`]) {
      assert.ok(html.includes(reste), `${reste} reste du texte`);
    }
    // B-36 exclusion : une fiche qui se cite elle-même ne s'affiche pas dans « Mentionnée dans »
    assert.deepEqual((await lireFiche(C.antor, banc.fiche)).mentions, []);
    // ... mais elle cite Aldric, qui la compte
    assert.ok(titresMentions(await lireFiche(C.antor, id['Maître Aldric']!)).includes('Banc de grammaire'));
  });
});

describe('B-33 : la liste ouverte par [[ (E-9)', opts, () => {
  test('exclusion : la Guilde (MJ seul) n\'est pas dans la liste de [[ de Léa, « Aucune fiche. » sans résultat ; [[ald propose Maître Aldric ; Antor voit la Guilde', async () => {
    const carnet = (await lireFiche(C.antor, await trouver(C.antor, lame, 'Carnet partagé')));
    const lea = await C.lea.ctx.newPage();
    await fichePage(lea, lame, carnet.id);
    const sec = lea.locator('section.sec').filter({ has: lea.getByRole('heading', { name: 'Notes', exact: true }) }).last();
    await sec.getByRole('button', { name: 'Modifier', exact: true }).click();
    const champ = sec.getByRole('textbox').first();
    await champ.fill('');
    await champ.pressSequentially('[[guil');
    // La liste répond (soit des fiches, soit « Aucune fiche. ») : alors seulement on vérifie que la Guilde n'y est pas.
    await lea.getByText('Aucune fiche.', { exact: true }).or(lea.getByRole('option').first()).waitFor();
    await lea.waitForLoadState('networkidle');
    assert.equal(await lea.getByRole('option', { name: /La Guilde des Brumes/ }).count(), 0);
    await lea.screenshot({ path: `${SHOTS}/liens-liste-lea-guil.png` });
    await champ.fill('');
    await champ.pressSequentially('[[zzqx');
    await lea.getByText('Aucune fiche.', { exact: true }).waitFor();
    await champ.fill('');
    await champ.pressSequentially('[[ald');
    await lea.getByRole('option', { name: /Maître Aldric/ }).waitFor();
    await lea.close();

    const antor = await C.antor.ctx.newPage();
    await fichePage(antor, lame, carnet.id);
    const sa = antor.locator('section.sec').filter({ has: antor.getByRole('heading', { name: 'Notes', exact: true }) }).last();
    await sa.getByRole('button', { name: 'Modifier', exact: true }).click();
    const ca = sa.getByRole('textbox').first();
    await ca.fill('');
    await ca.pressSequentially('[[guil');
    await antor.getByRole('option', { name: /La Guilde des Brumes/ }).waitFor();
    await ca.press('Escape');
    assert.equal(await ca.inputValue(), '[[guil', 'Échap ferme la liste et laisse le texte');
    await antor.close();
  });

  test("bord : Léa n'a ni « Modifier » ni « Lien vers une fiche » sur une section qu'elle n'écrit pas (« Description » de Port-Sel)", async () => {
    const lea = await C.lea.ctx.newPage();
    await fichePage(lea, lame, id['Port-Sel']!);
    const sec = lea.locator('section.sec').filter({ has: lea.getByRole('heading', { name: 'Description', exact: true }) }).last();
    assert.equal(await sec.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: 'Lien vers une fiche' }).count(), 0);
    await lea.close();
  });
});

describe('B-33 : import `[[cle:…|…]]`, en attente puis résolu (Essai Kanka, Jeton du bouchon)', () => {
  const PORT = {
    type: 'lieu',
    titre: 'Port-Sel',
    sections: [{ cle: 'histoire', titre: 'Histoire', contenu: 'Le port obéit à [[cle:faction:guilde|la Guilde]].', joueursLisent: true, joueursEcrivent: false }],
  };
  const GUILDE = {
    type: 'faction',
    titre: 'La Guilde des Brumes',
    sections: [{ cle: 'description', titre: 'Description', contenu: 'Une confrérie de passeurs.', joueursLisent: false, joueursEcrivent: false }],
  };
  let portKanka = 0;
  let version = 0;
  let modifieLe = '';
  const histoire = async (c: Any) => sectionDe(await lireFiche(c, portKanka, '', kanka), 'Histoire');
  const lot = async (corps: () => Promise<void>): Promise<Any> => {
    const ouvert = await imp('POST', '/lots');
    await corps();
    return (await imp('POST', `/lots/${ouvert.json.lotId}/clore`)).json;
  };

  test('avant la Guilde : lien en attente (« en attente » pour Antor, texte pour Léa) ; le lot compte 2 liens en attente', opts, async () => {
    const ouvert = await imp('POST', '/lots');
    const r = await put('lieu:port-sel', PORT, ouvert.json.lotId);
    assert.equal(r.etat, 'creee');
    portKanka = r.id;
    const clos = (await imp('POST', `/lots/${ouvert.json.lotId}/clore`)).json;
    // Anse-aux-Sels (semis) attend déjà « faction:repaire » : 1 + 1
    assert.equal(clos.enAttente, 2);
    const h = await histoire(C.antor);
    version = h.version;
    modifieLe = h.modifieLe;
    const antor = await C.antor.ctx.newPage();
    await fichePage(antor, kanka, portKanka);
    const marque = antor.locator('.lien-attente', { hasText: 'la Guilde' });
    assert.equal(await marque.count(), 1);
    assert.equal(await marque.getAttribute('title'), "Lien en attente : aucune fiche n'a encore la clé « faction:guilde ».");
    await antor.screenshot({ path: `${SHOTS}/liens-import-attente-antor.png` });
    const lea = await C.lea.ctx.newPage();
    await fichePage(lea, kanka, portKanka);
    assert.match(await lea.locator('main').innerText(), /Le port obéit à la Guilde\./);
    assert.equal(await lea.locator('.lien-attente, .lien-casse, main a[href*="/fiche/"]').count(), 0);
    await antor.close();
    await lea.close();
  });

  test("l'import de la Guilde résout le lien sans toucher à version ni modifieLe ; Léa lit toujours du texte ; reste 1 en attente", opts, async () => {
    const ouvert = await imp('POST', '/lots');
    const g = await put('faction:guilde', GUILDE, ouvert.json.lotId);
    assert.equal(g.etat, 'creee');
    const clos = (await imp('POST', `/lots/${ouvert.json.lotId}/clore`)).json;
    assert.equal(clos.enAttente, 1);
    const h = await histoire(C.antor);
    assert.equal(h.version, version, 'la version de la section ne bouge pas');
    assert.equal(h.modifieLe, modifieLe, 'modifieLe ne bouge pas');
    const contenu = (await ok(C.antor, 'get', `/api/univers/${kanka}/fiches/${portKanka}/sections/${h.id}`)).contenu;
    assert.equal(contenu, `Le port obéit à [[${g.id}|la Guilde]].`);
    assert.ok(h.html.includes(`href="/univers/${kanka}/fiche/${g.id}"`), 'Antor lit un lien');
    const hl = await histoire(C.lea);
    assert.match(hl.html, /la Guilde/);
    assert.doesNotMatch(hl.html, /<a |lien-/, 'Léa lit du texte (la Guilde est MJ seul)');
    const antor = await C.antor.ctx.newPage();
    await fichePage(antor, kanka, portKanka);
    await antor.getByRole('link', { name: 'la Guilde', exact: true }).click();
    await antor.waitForURL(new RegExp(`/fiche/${g.id}$`));
    await antor.close();
  });

  test('rejouer les deux imports rend « inchangée » pour chacune, rien de créé', opts, async () => {
    const ouvert = await imp('POST', '/lots');
    const a = await put('lieu:port-sel', PORT, ouvert.json.lotId);
    const b = await put('faction:guilde', GUILDE, ouvert.json.lotId);
    assert.equal(a.etat, 'inchangee');
    assert.equal(b.etat, 'inchangee');
    const clos = (await imp('POST', `/lots/${ouvert.json.lotId}/clore`)).json;
    assert.equal(clos.compteurs.fiches.inchangees, 2);
    assert.equal(clos.compteurs.fiches.creees, 0);
    assert.equal(clos.compteurs.fiches.mises_a_jour, 0);
    assert.equal((await histoire(C.antor)).version, version);
  });

  test('exclusion : une clé qui ne vient jamais reste en attente sans compteur chez Léa ; une clé déjà connue est résolue dès le premier import', opts, async () => {
    const ouvert = await imp('POST', '/lots');
    const r = await put('lieu:port-gris', { type: 'lieu', titre: 'Port-Gris', sections: [{ cle: 'h', titre: 'Histoire', contenu: 'Voir [[cle:faction:guilde|la Guilde]] et [[cle:inconnue:x|ailleurs]].', joueursLisent: true, joueursEcrivent: false }] }, ouvert.json.lotId);
    await imp('POST', `/lots/${ouvert.json.lotId}/clore`);
    const s = sectionDe(await lireFiche(C.antor, r.id, '', kanka), 'Histoire');
    const guilde = await trouver(C.antor, kanka, 'La Guilde des Brumes');
    assert.equal((await ok(C.antor, 'get', `/api/univers/${kanka}/fiches/${r.id}/sections/${s.id}`)).contenu, `Voir [[${guilde}|la Guilde]] et [[cle:inconnue:x|ailleurs]].`);
    assert.match(s.html, /lien-attente/);
  });
});

describe('B-36 : « Mentionnée dans », bords et exclusions', () => {
  test('exclusion : un lien dans un bloc MJ ne compte que pour Antor hors mode Joueur', opts, async () => {
    const a = id['Maître Aldric'];
    await creerFiche(C.antor, 'Carnet du MJ', 'Notes', `Public.\n\n:::mj\nIl sait pour [[${a}|Maître Aldric]].\n:::\n`);
    await creerFiche(C.antor, 'Journal du port', 'Notes', `On croise [[${a}|Maître Aldric]] sur le quai.`);
    const lea = titresMentions(await lireFiche(C.lea, a!));
    assert.ok(lea.includes('Journal du port'));
    assert.ok(!lea.includes('Carnet du MJ'));
    assert.ok(titresMentions(await lireFiche(C.antor, a!)).includes('Carnet du MJ'));
    assert.ok(!titresMentions(await lireFiche(C.antor, a!, '?mode=joueur')).includes('Carnet du MJ'));
  });

  test('relation : lue seule, ou avec un lien (« · ») ; une relation portée par une section illisible de Léa est absente', opts, async () => {
    const a = id['Maître Aldric']!;
    const portSel = await lireFiche(C.antor, id['Port-Sel']!);
    await ok(C.antor, 'post', `/api/univers/${lame}/fiches/${id['Port-Sel']}/sections/${sectionDe(portSel, 'Histoire').id}/relations`, { cibleFicheId: a, type: 'Amiral de' });
    const intendant = await creerFiche(C.antor, 'Intendant de la Guilde', 'Portrait', 'Un homme discret.');
    const secret = await ok(C.antor, 'post', `/api/univers/${lame}/fiches/${intendant.fiche}/sections`, { titre: 'Secret', contenu: 'Rien.' });
    await ok(C.antor, 'post', `/api/univers/${lame}/fiches/${intendant.fiche}/sections/${secret.id}/relations`, { cibleFicheId: a, type: 'Espion de' });
    const lea = await lireFiche(C.lea, a);
    const port = lea.mentions.find((m: Any) => m.titre === 'Port-Sel');
    assert.deepEqual(port.pourquoi.map((p: Any) => p.genre).sort(), ['lien', 'relation']);
    assert.ok(!titresMentions(lea).includes('Intendant de la Guilde'), 'section porteuse illisible');
    const antor = await lireFiche(C.antor, a);
    const intend = antor.mentions.find((m: Any) => m.titre === 'Intendant de la Guilde');
    assert.deepEqual(intend.pourquoi, [{ genre: 'relation', libelle: 'Espion de' }]);
    const page = await C.lea.ctx.newPage();
    await fichePage(page, lame, a);
    const ligne = page.getByRole('region', { name: /Mentionnée dans/ }).getByRole('listitem').filter({ hasText: 'Port-Sel' });
    const t = await ligne.innerText();
    assert.match(t, /lien dans « Histoire »/);
    assert.match(t, /Amiral de/);
    assert.match(t, /·/);
    await page.screenshot({ path: `${SHOTS}/liens-mentions-relation.png` });
    await page.close();
  });

  test('bords : 60 fiches citent une cible : 50 d\'abord et « Afficher les 10 suivants », puis les 10 dernières', opts, async () => {
    const ouvert = await imp('POST', '/lots');
    const cible = await put('lieu:cible', { type: 'lieu', titre: 'Cible', sections: [{ cle: 'd', titre: 'Description', contenu: 'Le but.', joueursLisent: true, joueursEcrivent: false }] }, ouvert.json.lotId);
    for (let i = 1; i <= 60; i++) {
      const n = String(i).padStart(2, '0');
      await put(`lieu:source-${n}`, { type: 'lieu', titre: `Source ${n}`, sections: [{ cle: 'd', titre: 'Description', contenu: `Cite [[cle:lieu:cible|Cible]] ${n}`, joueursLisent: true, joueursEcrivent: false }] }, ouvert.json.lotId);
    }
    await imp('POST', `/lots/${ouvert.json.lotId}/clore`);
    const premiere = await lireFiche(C.lea, cible.id, '', kanka);
    assert.equal(premiere.mentions.length, 50);
    assert.equal(premiere.mentionsSuite, true);
    assert.equal(premiere.mentionsRestantes, 10);
    assert.equal(premiere.mentions[0].titre, 'Source 01');
    assert.equal(premiere.mentions[49].titre, 'Source 50');
    const suite = await ok(C.lea, 'get', `/api/univers/${kanka}/fiches/${cible.id}/mentions?apres=50`);
    assert.equal(suite.mentions.length, 10);
    assert.equal(suite.suite, false);
    assert.equal(suite.mentions[0].titre, 'Source 51');
    assert.equal(suite.mentions[9].titre, 'Source 60');

    if (skipBrowser) return;
    const page = await C.lea.ctx.newPage();
    await fichePage(page, kanka, cible.id);
    const bloc = page.getByRole('region', { name: /Mentionnée dans/ });
    assert.equal(await bloc.getByRole('listitem').count(), 50);
    await page.screenshot({ path: `${SHOTS}/liens-mentions-50.png` });
    await bloc.getByRole('button', { name: 'Afficher les 10 suivants' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="titre-mentions"] li').length === 60);
    assert.equal(await bloc.getByRole('button', { name: /Afficher les/ }).count(), 0);
    await page.close();
  });
});

describe('B-33 : un scénario (E-7) et une entrée de système (E-15)', opts, () => {
  let scenario = 0;
  let campagne = 0;
  before(async () => {
    campagne = (await ok(C.antor, 'post', `/api/univers/${lame}/campagnes`, { nom: 'La Couronne brisée' })).id;
    const contenu = `Allié : [[${id['Maître Aldric']}|Maître Aldric]] ; perdu : [[999999|Capitaine Hesk]] ; ailleurs : [[${id['Anse-aux-Sels']}|Anse d'ailleurs]]`;
    scenario = (await ok(C.antor, 'post', `/api/campagnes/${campagne}/scenarios`, { titre: 'Acte I', contenu })).id;
  });

  test("nominal : le lien vers Aldric s'ouvre sur sa fiche ; 999999 est marqué cassé ; la fiche d'un autre univers n'est pas un lien", async () => {
    const page = await C.antor.ctx.newPage();
    await page.goto(`${srv.base}/univers/${lame}/scenarios/${scenario}`);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.lien-casse', { hasText: 'Capitaine Hesk' }).count(), 1);
    assert.equal(await page.locator(`a[href="/univers/${kanka}/fiche/${id['Anse-aux-Sels']}"], a[href="/univers/${lame}/fiche/${id['Anse-aux-Sels']}"]`).count(), 0);
    assert.match(await page.locator('main').innerText(), /Anse d'ailleurs/);
    await page.screenshot({ path: `${SHOTS}/liens-scenario.png` });
    await page.getByRole('link', { name: 'Maître Aldric', exact: true }).click();
    await page.waitForURL(new RegExp(`/univers/${lame}/fiche/${id['Maître Aldric']}$`));
    await page.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
    await page.close();
  });

  test("exclusion : un lien de scénario n'est pas une mention ; Léa n'a pas E-7", async () => {
    assert.ok(!titresMentions(await lireFiche(C.antor, id['Maître Aldric']!)).includes('Acte I'));
    const lea = await C.lea.ctx.newPage();
    await lea.goto(`${srv.base}/univers/${lame}/scenarios/${scenario}`);
    await lea.waitForLoadState('networkidle');
    assert.match(await lea.locator('body').innerText(), /Page introuvable\./);
    await lea.close();
  });

  test("[[ y liste les fiches de l'univers de la campagne seulement et insère [[<id>|<titre>]]", async () => {
    const page = await C.antor.ctx.newPage();
    await page.goto(`${srv.base}/univers/${lame}/scenarios/${scenario}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    const champ = page.getByRole('textbox', { name: /Contenu/ });
    await champ.fill('');
    await champ.pressSequentially('[[anse');
    await page.getByText('Aucune fiche.', { exact: true }).waitFor();
    await champ.fill('');
    await champ.pressSequentially('[[ald');
    await page.getByRole('option', { name: /Maître Aldric/ }).click();
    assert.ok((await champ.inputValue()).startsWith(`[[${id['Maître Aldric']}|Maître Aldric]]`), await champ.inputValue());
    await page.screenshot({ path: `${SHOTS}/liens-scenario-edition.png` });
    await page.close();
  });

  test('exclusion : dans une entrée de système, [[…]] reste du texte (API et éditeur sans liste)', async () => {
    const systeme = (await ok(C.antor, 'get', '/api/systemes/1')).gabarits[0];
    const texte = `Voir [[${id['Maître Aldric']}|Maître Aldric]] et [[cle:x:y|z]]`;
    const r = await http(C.antor, 'put', `/api/systemes/1/gabarits/${systeme.id}`, { nom: systeme.nom, contenu: texte, version: systeme.version });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const apres = (await ok(C.antor, 'get', '/api/systemes/1')).gabarits.find((g: Any) => g.id === systeme.id);
    assert.equal(apres.html, `<p>Voir [[${id['Maître Aldric']}|Maître Aldric]] et [[cle:x:y|z]]</p>\n`);
    const page = await C.antor.ctx.newPage();
    await page.goto(`${srv.base}/systemes/1`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /Règles/ }).click();
    await page.getByRole('button', { name: new RegExp(systeme.nom) }).click();
    assert.match(await page.locator('.entree-contenu').innerText(), /\[\[\d+\|Maître Aldric\]\]/);
    assert.equal(await page.locator('.entree-contenu a').count(), 0);
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Lien vers une fiche' }).count(), 0);
    const champ = page.getByRole('textbox', { name: /Contenu/ });
    await champ.fill('');
    await champ.pressSequentially('[[ald');
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole('listbox').count(), 0, 'pas de liste dans une entrée de système');
    await page.screenshot({ path: `${SHOTS}/liens-systeme-edition.png` });
    await page.close();
  });
});
