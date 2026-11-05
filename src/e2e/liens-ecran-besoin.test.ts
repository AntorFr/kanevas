// Black-box tests of kanevas-liens-ecran (exit criterion), real Chromium, real server in stub mode with the starting data.
//
// TEST PLAN
//   nominal    : Antor types `[[` + « ald » in « Histoire » of « Port-Sel »: « Maître Aldric » listed with its type icon,
//                Enter inserts `[[<id>|Maître Aldric]]`; Escape closes the list and leaves `[[`; Ctrl+K opens a `[[`;
//                Léa follows the link to Aldric, whose « Mentionnée dans » names « Port-Sel » (« lien dans « Histoire » »)
//   bords      : 60 sheets citing Aldric: 50 then « Afficher les 10 suivants », « Chargement… », 60 in the end, no button;
//                the page fails: « Impossible de charger la suite. » + « Réessayer »; empty block absent;
//                list over 50 results: « Affinez la recherche pour voir les autres. »
//   échec      : search cut: « Impossible de chercher. » + « Réessayer », text kept; nothing found: « Aucune fiche. »;
//                connection lost: the list does not open; a bare `[[<id>]]` of an unreadable sheet: refusal under the field
//   exclusions : Léa never sees the link to the Guild, nor the GM-only report in « Mentionnée dans » (Antor does);
//                Antor in player mode sees what Léa sees; E-7 has the list; an entry of a system (E-15) has neither button nor list
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';
import { comptes, json } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;
let lame = 0;
let kanka = 0;
const id: Record<string, number> = {};

async function api(c: Any, method: 'post' | 'put' | 'get' | 'patch', url: string, data?: unknown): Promise<Any> {
  const r = await c.ctx.request[method](url, data === undefined ? {} : { data });
  if (r.status() >= 300) throw new Error(`${method} ${url} -> ${r.status()} ${await r.text()}`);
  return json(r);
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  C = await comptes(srv, browser);
  const univers = (await api(C.antor, 'get', '/api/univers')) as { id: number; nom: string }[];
  lame = univers.find((u) => u.nom === "Lame d'Ébène")!.id;
  kanka = univers.find((u) => u.nom === 'Essai Kanka')!.id;
  for (const [nom, u] of [['Maître Aldric', lame], ['Port-Sel', lame], ['La Guilde des Brumes', lame], ['Anse-aux-Sels', kanka]] as const) {
    const l = await api(C.antor, 'get', `/api/univers/${u}/fiches?q=${encodeURIComponent(nom)}`);
    id[nom] = l.fiches.find((f: Any) => f.titre === nom).id;
  }
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

const fiche = (page: Any, u: number, f: number) => page.goto(`${srv.base}/univers/${u}/fiche/${f}`).then(() => page.waitForLoadState('networkidle'));

async function ouvrirEdition(page: Any, section: string) {
  await fiche(page, lame, id['Port-Sel']!);
  await page.getByRole('region', { name: section, exact: true }).getByRole('button', { name: 'Modifier', exact: true }).click().catch(async () => {
    await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  });
  return page.getByLabel(`Contenu de « ${section} »`);
}

async function enHistoire(page: Any) {
  await fiche(page, lame, id['Port-Sel']!);
  const article = page.locator('section.sec').filter({ has: page.getByRole('heading', { name: 'Histoire', exact: true }) }).last();
  await article.getByRole('button', { name: 'Modifier', exact: true }).click();
  return page.getByLabel('Contenu de « Histoire »');
}

test('nominal : [[ + « ald » liste Maître Aldric avec son icône, Entrée insère, Aperçu le montre, Enregistrer', opts, async () => {
  const page = await C.antor.ctx.newPage();
  const champ = await enHistoire(page);
  await champ.press('Control+End');
  await champ.pressSequentially(' Voir [[ald');
  const liste = page.getByRole('listbox', { name: 'Fiches à lier' });
  await liste.waitFor();
  const option = liste.getByRole('option', { name: /Maître Aldric/ });
  await option.waitFor();
  assert.equal(await option.locator('svg').count(), 1, 'icône du type');
  assert.match(await option.innerText(), /Personnage/, 'libellé du type');
  await page.screenshot({ path: '/tmp/liens-ecran-liste.png' });
  await option.click();
  const v = await champ.inputValue();
  assert.ok(v.endsWith(` Voir [[${id['Maître Aldric']}|Maître Aldric]]`), v.slice(-60));
  assert.equal(await liste.count(), 0, 'la liste se ferme après le choix');
  await page.getByRole('radio', { name: 'Aperçu', exact: true }).click();
  const lien = page.locator('.apercu-md a.lien-fiche', { hasText: 'Maître Aldric' });
  await lien.last().waitFor();
  assert.equal(await lien.last().getAttribute('href'), `/univers/${lame}/fiche/${id['Maître Aldric']}`);
  await page.getByRole('radio', { name: 'Écrire', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).waitFor({ state: 'detached' });
  await page.waitForLoadState('networkidle');
  await page.locator('.md a.lien-fiche', { hasText: 'Maître Aldric' }).nth(1).waitFor();
  await page.close();
});

test('critère à la lettre : « ald » puis Entrée insère le lien de Maître Aldric', opts, async () => {
  const page = await C.antor.ctx.newPage();
  const champ = await enHistoire(page);
  await champ.press('Control+End');
  await champ.pressSequentially('\n[[ald');
  await page.getByRole('option', { name: /Maître Aldric/ }).waitFor();
  await page.keyboard.press('Enter');
  const v = await champ.inputValue();
  assert.ok(v.endsWith(`\n[[${id['Maître Aldric']}|Maître Aldric]]`), v.slice(-60));
  await page.close();
});

test('Échap ferme la liste en laissant [[ et ne quitte pas l’édition ; Ctrl+K ouvre un [[', opts, async () => {
  const page = await C.antor.ctx.newPage();
  const champ = await enHistoire(page);
  await champ.press('Control+End');
  await champ.pressSequentially('\n[[ald');
  const liste = page.getByRole('listbox', { name: 'Fiches à lier' });
  await liste.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await liste.count(), 0);
  assert.ok((await champ.inputValue()).endsWith('\n[[ald'));
  assert.equal(await champ.isVisible(), true, 'toujours en édition');
  await champ.press('Control+End');
  await page.keyboard.press('Control+k');
  assert.ok((await champ.inputValue()).endsWith('\n[[ald[['), await champ.inputValue());
  await page.getByRole('listbox', { name: 'Fiches à lier' }).or(page.getByText('Recherche…')).first().waitFor();
  await page.close();
});

test('Léa suit le lien vers Aldric, « Mentionnée dans » nomme Port-Sel ; le lien vers la Guilde est sans marque', opts, async () => {
  const page = await C.lea.ctx.newPage();
  await fiche(page, lame, id['Port-Sel']!);
  assert.ok((await page.locator('.md a.lien-fiche', { hasText: 'Maître Aldric' }).count()) >= 1);
  assert.equal(await page.locator('.md a', { hasText: 'La Guilde des Brumes' }).count(), 0);
  assert.equal(await page.locator('.md .lien-casse, .md .lien-attente').count(), 0);
  assert.match(await page.locator('.md', { hasText: 'La Guilde des Brumes' }).first().innerText(), /La Guilde des Brumes/);
  await page.locator('.md a.lien-fiche', { hasText: 'Maître Aldric' }).first().click();
  await page.waitForURL(`**/fiche/${id['Maître Aldric']}`);
  await page.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await page.waitForLoadState('networkidle');
  const bloc = page.getByRole('region', { name: 'Mentionnée dans' });
  await bloc.waitFor();
  const lignes = (await bloc.locator('li').allInnerTexts()).map((t: string) => t.replace(/\s+/g, ' ').trim());
  assert.deepEqual(lignes, ['Port-Sel lien dans « Histoire »']);
  await page.screenshot({ path: '/tmp/liens-ecran-lea-mentions.png' });
  await page.close();
});

test('Antor voit trois mentions d’Aldric dont le rapport MJ ; en mode Joueur, ce que voit Léa', opts, async () => {
  const page = await C.antor.ctx.newPage();
  await fiche(page, lame, id['Maître Aldric']!);
  const bloc = page.getByRole('region', { name: 'Mentionnée dans' });
  await bloc.waitFor();
  const titres = (await bloc.locator('li .cible').allInnerTexts()).map((t: string) => t.trim());
  assert.deepEqual(titres.map((t: string) => t.replace(/’/g, "'")), ['La Guilde des Brumes', 'Port-Sel', "Rapport secret de l'amirauté"]);
  await page.screenshot({ path: '/tmp/liens-ecran-antor-mentions.png' });
  await page.getByLabel('Mode Joueur').check();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const bloc2 = page.getByRole('region', { name: 'Mentionnée dans' });
  await bloc2.waitFor();
  assert.deepEqual((await bloc2.locator('li .cible').allInnerTexts()).map((t: string) => t.trim()), ['Port-Sel']);
  await page.close();
});

test('Anse-aux-Sels : lien cassé (--danger) et en attente (--texte-3) pour Antor', opts, async () => {
  const page = await C.antor.ctx.newPage();
  await fiche(page, kanka, id['Anse-aux-Sels']!);
  const casse = page.locator('.md .lien-casse', { hasText: 'Capitaine Hesk' });
  const attente = page.locator('.md .lien-attente', { hasText: 'les contrebandiers du Repaire' });
  await casse.waitFor();
  await attente.waitFor();
  const style = (l: Any) => l.evaluate((e: Element) => { const s = getComputedStyle(e); return { style: s.textDecorationStyle, line: s.textDecorationLine, color: s.textDecorationColor, titre: e.getAttribute('title') }; });
  const sc = await style(casse);
  const sa = await style(attente);
  assert.equal(sc.line, 'underline');
  assert.equal(sa.line, 'underline');
  assert.equal(sc.style, 'dashed');
  assert.equal(sa.style, 'dashed');
  const jeton = (nom: string) => page.evaluate((n: string) => { const d = document.createElement('i'); d.style.color = `var(${n})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, nom);
  assert.equal(sc.color, await jeton('--danger'));
  assert.equal(sa.color, await jeton('--texte-3'));
  assert.notEqual(sc.color, sa.color);
  const norm = (s: string | null) => (s ?? '').replace(/’/g, "'");
  assert.equal(norm(sc.titre), 'Lien cassé : cette fiche n\'existe plus.');
  assert.equal(norm(sa.titre), 'Lien en attente : aucune fiche n\'a encore la clé « faction:repaire ».');
  await page.screenshot({ path: '/tmp/liens-ecran-casse-attente.png' });
  await page.close();
});

test('recherche coupée : « Impossible de chercher. » + Réessayer, texte gardé ; aucune fiche ; en cours', opts, async () => {
  const page = await C.antor.ctx.newPage();
  const champ = await enHistoire(page);
  await champ.press('Control+End');
  let coupe = true;
  await page.route('**/api/univers/*/fiches?q=*', (r: Any) => (coupe ? r.abort() : r.continue()));
  await champ.pressSequentially('\n[[ald');
  await page.getByText('Impossible de chercher.').waitFor();
  await page.screenshot({ path: '/tmp/liens-ecran-erreur.png' });
  assert.ok((await champ.inputValue()).endsWith('\n[[ald'));
  coupe = false;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.getByRole('option', { name: /Maître Aldric/ }).waitFor();
  // nothing found
  await champ.pressSequentially('zzzqq');
  await page.getByText('Aucune fiche.').waitFor();
  await page.screenshot({ path: '/tmp/liens-ecran-vide.png' });
  // in progress
  await page.unroute('**/api/univers/*/fiches?q=*');
  await page.route('**/api/univers/*/fiches?q=*', async (r: Any) => { await new Promise((res) => setTimeout(res, 1500)); await r.continue(); });
  await champ.press('Backspace');
  await page.getByText('Recherche…').waitFor();
  await page.screenshot({ path: '/tmp/liens-ecran-cours.png' });
  await page.close();
});

test('connexion coupée : la liste ne s’ouvre pas', opts, async () => {
  const page = await C.antor.ctx.newPage();
  const champ = await enHistoire(page);
  await champ.press('Control+End');
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await champ.pressSequentially('\n[[ald');
  await page.waitForTimeout(600);
  assert.equal(await page.getByRole('listbox', { name: 'Fiches à lier' }).count(), 0);
  assert.equal(await page.getByText('Recherche…').count(), 0);
  await page.screenshot({ path: '/tmp/liens-ecran-horsligne.png' });
  await page.context().setOffline(false);
  await page.close();
});

test('au-delà de 50 résultats : « Affinez la recherche pour voir les autres. »', opts, async () => {
  const u = (await api(C.antor, 'post', '/api/univers', { nom: 'Beaucoup' })).id as number;
  for (let i = 0; i < 55; i++) await api(C.antor, 'post', `/api/univers/${u}/fiches`, { type: 'lieu', titre: `Zorbe ${String(i).padStart(2, '0')}` });
  const f = await api(C.antor, 'post', `/api/univers/${u}/fiches`, { type: 'lieu', titre: 'Hôte' });
  await api(C.antor, 'post', `/api/univers/${u}/fiches/${f.id}/sections`, { titre: 'Texte', contenu: 'x' });
  const page = await C.antor.ctx.newPage();
  await fiche(page, u, f.id);
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const champ = page.getByLabel('Contenu de « Texte »');
  await champ.press('Control+End');
  await champ.pressSequentially(' [[Zorbe');
  const liste = page.getByRole('listbox', { name: 'Fiches à lier' });
  await liste.getByText('Affinez la recherche pour voir les autres.').waitFor();
  assert.equal(await liste.getByRole('option').count(), 50);
  await page.screenshot({ path: '/tmp/liens-ecran-50plus.png' });
  await page.close();
});

test('60 fiches citent Aldric : 50, « Afficher les 10 suivants », Chargement…, échec puis Réessayer', opts, async () => {
  const u = (await api(C.antor, 'post', '/api/univers', { nom: 'Citations' })).id as number;
  const b = `/api/univers/${u}`;
  const cible = await api(C.antor, 'post', `${b}/fiches`, { type: 'personnage', titre: 'Aldric', charge: { v: 1, pj: false } });
  await api(C.antor, 'post', `${b}/fiches/${cible.id}/sections`, { titre: 'Apparence', contenu: 'vieux' });
  for (let i = 0; i < 60; i++) {
    const f = await api(C.antor, 'post', `${b}/fiches`, { type: 'lieu', titre: `Source ${String(i).padStart(2, '0')}` });
    await api(C.antor, 'post', `${b}/fiches/${f.id}/sections`, { titre: 'Texte', contenu: `cite [[${cible.id}|Aldric]]` });
  }
  const page = await C.antor.ctx.newPage();
  await fiche(page, u, cible.id);
  const bloc = page.getByRole('region', { name: 'Mentionnée dans' });
  await bloc.waitFor();
  assert.equal(await bloc.locator('li').count(), 50);
  const suite = bloc.getByRole('button', { name: 'Afficher les 10 suivants', exact: true });
  await suite.waitFor();
  await page.screenshot({ path: '/tmp/liens-ecran-50-mentions.png' });
  // failure first
  let coupe = true;
  await page.route('**/mentions?*', async (r: Any) => { if (coupe) await r.abort(); else { await new Promise((res) => setTimeout(res, 800)); await r.continue(); } });
  await suite.click();
  await bloc.getByText('Impossible de charger la suite.').waitFor();
  assert.equal(await bloc.locator('li').count(), 50);
  await page.screenshot({ path: '/tmp/liens-ecran-mentions-echec.png' });
  coupe = false;
  await bloc.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await bloc.getByText('Chargement…').waitFor();
  await page.screenshot({ path: '/tmp/liens-ecran-mentions-chargement.png' });
  await bloc.locator('li').nth(59).waitFor();
  assert.equal(await bloc.locator('li').count(), 60);
  assert.equal(await bloc.getByRole('button').count(), 0, 'plus de bouton');
  assert.equal(await bloc.getByText('Impossible de charger la suite.').count(), 0);
  await page.close();
});

test('une fiche sans mention n’a pas de bloc « Mentionnée dans »', opts, async () => {
  const page = await C.antor.ctx.newPage();
  await fiche(page, lame, id['Port-Sel']!.valueOf());
  // Port-Sel is cited by Aldric's Apparence; a sheet nobody cites has none
  const l = await api(C.antor, 'get', `/api/univers/${lame}/fiches?q=Suie`);
  await fiche(page, lame, l.fiches[0].id);
  assert.equal(await page.getByRole('region', { name: 'Mentionnée dans' }).count(), 0);
  await page.close();
});

test('Léa tape [[<id>]] de la Guilde dans Description (écriture accordée) : refus sous le champ, texte conservé', opts, async () => {
  const l = await api(C.antor, 'get', `/api/univers/${lame}/fiches/${id['Port-Sel']}`);
  const desc = l.sections.find((s: Any) => s.titre === 'Description');
  await api(C.antor, 'patch', `/api/univers/${lame}/fiches/${id['Port-Sel']}/sections/${desc.id}`, { joueursEcrivent: true });
  const page = await C.lea.ctx.newPage();
  await fiche(page, lame, id['Port-Sel']!);
  const champ0 = page.locator('section.sec').filter({ has: page.getByRole('heading', { name: 'Description', exact: true }) }).last();
  await champ0.getByRole('button', { name: 'Modifier', exact: true }).click();
  const champ = page.getByLabel('Contenu de « Description »');
  const bare = `\n[[${id['La Guilde des Brumes']}]]`;
  await champ.press('Control+End');
  await champ.pressSequentially(bare);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const erreur = page.locator('.erreur-md');
  await erreur.waitFor();
  assert.equal((await erreur.innerText()).replace(/’/g, "'"), "Cette fiche n'existe pas ou vous ne pouvez pas la lire.");
  assert.ok((await champ.inputValue()).endsWith(bare), 'texte conservé');
  await page.screenshot({ path: '/tmp/liens-ecran-illisible.png' });
  await page.close();
});
