// ecrans: cartes
// Browser test of kanevas-carte-spatiale-liens-ecran (E-23 « Lier à une fiche », « Délier », « Illustrer la fiche »; P-22.3, P-22.5),
// written from the exit criterion and docs/ecrans.md « E-23 — links » — not from the code. The effect of the routes has its door
// (src/outils/swn/liens-routes.test.ts); the screen keeps the gestures, the texts and the states.
// Screenshots go to /tmp/cap-liens-ecran (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-liens-ecran';
const D = { q: 70, r: 71 }; // defined system

describe('E-23 lier un corps à une fiche : dialogue, panneau, bloc de la fiche', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  let ficheLue = 0;
  let fichePrivee = 0;
  const adr = (p: { q: number; r: number } = D) => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${p.q}/${p.r}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const sql = <T>(fn: (db: Any) => T): T => { const db = new Database(dbPath); try { return fn(db); } finally { db.close(); } };
  const ouvrir = async (compte: string, l = 1280, h = 900, p: { q: number; r: number } = D) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: l, height: h });
    await c.page.goto(adr(p));
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    return c;
  };
  const panneau = (page: Any) => page.getByRole('region', { name: 'Corps sélectionné' });
  const choisir = async (page: Any, cle: string) => { await page.locator(`.cs-corps[data-cle="${cle}"]`).click(); await panneau(page).waitFor(); };
  const fiche = async (page: Any, titre: string, lisible: boolean) => {
    const r = await page.request.post(`/api/univers/${univers}/fiches`, { data: { type: 'lieu', titre, sections: [{ titre: 'Présentation', joueursLisent: lisible }] } });
    assert.equal(r.status(), 201);
    return ((await r.json()) as Any).id as number;
  };
  const remise = () => sql((db) => db.prepare('UPDATE swn_astres SET fiche_id = NULL').run()) && sql((db) => db.prepare('UPDATE swn_formations SET fiche_id = NULL').run());
  const liee = (cle: string) => sql((db) => db.prepare('SELECT fiche_id FROM swn_astres WHERE cle = ?').get(cle)?.fiche_id ?? null);

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-liens-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    ficheLue = await fiche(a.page, 'Vael II (colonie)', true);
    fichePrivee = await fiche(a.page, 'Vael III (privée)', false);
    await a.ctx.close();
    sql((db) => {
      const sys = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',0,?)");
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      for (const [p, nom, promu, pre] of [[D, 'Vael', 1, 'd']] as const) {
        const id = Number(sys.run(gid, univers, `lk-${pre}`, nom, p.q, p.r, promu).lastInsertRowid);
        ast.run(id, `${pre}-soleil`, 'etoile', null, 0, 'jaune', `Soleil-${pre}`, 0, 0, 0.3);
        ast.run(id, `${pre}-un`, 'planete', null, 0, 'tellurique', `Vael II${pre}`, 4, 7, 0.3);
        ast.run(id, `${pre}-deux`, 'planete', null, 0, 'gazeuse', `Vael III${pre}`, 5, 8, 0.3);
        db.prepare('INSERT INTO swn_formations (systeme_id, cle, forme, etoile_rang, nom, parametres) VALUES (?,?,?,?,?,?)').run(id, `${pre}-ceinture`, 'anneau', 0, 'Ceinture de Vael', JSON.stringify({ de: 2.6, a: 3.0, rochers: 0.8 }));
      }
    });
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('Antor lie un corps depuis le dialogue : ligne « Fiche : » ; Léa suit le lien, la fiche montre « Sur la carte spatiale »', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'd-un');
    const p = panneau(page);
    assert.equal(await p.getByRole('button', { name: 'Délier' }).count(), 0, 'pas de « Délier » sans lien');
    assert.equal(await p.getByRole('button', { name: 'Illustrer la fiche' }).count(), 0, 'pas d’« Illustrer » sans lien');
    await hors(page, '1-panneau-sans-lien');
    await p.getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog', { name: 'Lier Vael IId à une fiche' });
    await d.waitFor();
    assert.equal(await d.getByRole('textbox', { name: 'Rechercher une fiche' }).evaluate((e: Any) => e === document.activeElement), true, 'le focus entre sur le champ');
    assert.equal(await d.getByRole('button', { name: 'Lier', exact: true }).isDisabled(), true, '« Lier » désactivé tant que rien n’est choisi');
    await d.getByText('Vael II (colonie)').first().waitFor();
    await hors(page, '2-dialogue');
    await d.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('colonie');
    await d.getByRole('option', { name: /Vael II \(colonie\)/ }).click();
    await d.getByText('Fiche choisie : Vael II (colonie)').waitFor();
    const rep = page.waitForResponse((r: Any) => r.url().includes('/fiche') && r.request().method() === 'PUT');
    await d.getByRole('button', { name: 'Lier', exact: true }).click();
    assert.equal((await rep).status(), 200);
    await d.waitFor({ state: 'detached' });
    await p.getByText('Fiche : ').waitFor();
    assert.equal(await p.getByRole('link', { name: 'Vael II (colonie)' }).getAttribute('href'), `/univers/${univers}/fiche/${ficheLue}`);
    assert.equal(await p.getByRole('button', { name: 'Changer la fiche liée…' }).count(), 1);
    assert.equal(await liee('d-un'), ficheLue);
    await hors(page, '3-panneau-lie');
    await ctx.close();

    const l = await ouvrir('Léa');
    await choisir(l.page, 'd-un');
    await panneau(l.page).getByRole('link', { name: 'Vael II (colonie)' }).click();
    const bloc = l.page.getByRole('region', { name: 'Sur la carte spatiale' });
    await bloc.waitFor();
    await bloc.getByText(/Vael IId — système Vael, orbite 4 · 7 h/).waitFor();
    assert.ok(await bloc.getByRole('link').count() >= 1, 'un lien vers le système');
    await hors(l.page, '4-fiche-lea');
    await l.ctx.close();
  });

  it('une fiche que Léa ne lit pas : elle voit le corps sans ligne, la fiche n’existe pas pour elle, et la liste texte n’en dit rien', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'd-deux');
    await panneau(page).getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('privée');
    await d.getByRole('option', { name: /Vael III \(privée\)/ }).click();
    await d.getByRole('button', { name: 'Lier', exact: true }).click();
    await d.waitFor({ state: 'detached' });
    await panneau(page).getByText('Fiche : ').waitFor();
    assert.equal(await liee('d-deux'), fichePrivee);
    await ctx.close();
    const l = await ouvrir('Léa');
    await choisir(l.page, 'd-deux');
    assert.equal(await panneau(l.page).getByText('Fiche :').count(), 0);
    assert.equal(await l.page.getByText('Vael III (privée)').count(), 0, 'ni titre ni cadenas dans la page');
    assert.equal((await l.page.request.get(`/api/univers/${univers}/fiches/${fichePrivee}`)).status(), 404);
    for (const m of ['Lier', 'Délier', 'Illustrer']) assert.equal(await l.page.getByRole('button', { name: new RegExp(m) }).count(), 0, m);
    await hors(l.page, '5-lea-sans-ligne');
    await l.ctx.close();
  });

  it('dialogue : une recherche sans résultat dit « Aucune fiche ne correspond. »', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'd-un');
    await panneau(page).getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('zzzinconnu');
    await d.getByText('Aucune fiche ne correspond.').waitFor({ timeout: 5000 });
    await hors(page, '2b-dialogue-vide');
    await ctx.close();
  });

  it('réussite du lien : toast « <nom> : fiche liée, <titre>. »', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'd-un');
    await panneau(page).getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('colonie');
    await d.getByRole('option', { name: /Vael II \(colonie\)/ }).click();
    await d.getByRole('button', { name: 'Lier', exact: true }).click();
    await page.getByRole('status').getByText('Vael IId : fiche liée, Vael II (colonie).').waitFor({ timeout: 5000 });
    await ctx.close();
  });

  it('« Délier » agit tout de suite : la ligne part, toast « Fiche déliée. »', async () => {
    remise();
    sql((db) => db.prepare('UPDATE swn_astres SET fiche_id = ? WHERE cle = ?').run(ficheLue, 'd-un'));
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'd-un');
    await panneau(page).getByRole('button', { name: 'Délier' }).click();
    await panneau(page).getByText('Fiche :').waitFor({ state: 'detached' });
    assert.equal(await liee('d-un'), null);
    await page.getByRole('status').getByText('Fiche déliée.').waitFor({ timeout: 5000 });
    await ctx.close();
  });

  it('« Changer la fiche liée… » ouvre le dialogue sur la fiche actuelle choisie, champ vide ; « Annuler » n’écrit rien', async () => {
    remise();
    sql((db) => db.prepare('UPDATE swn_astres SET fiche_id = ? WHERE cle = ?').run(ficheLue, 'd-un'));
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'd-un');
    await panneau(page).getByRole('button', { name: 'Changer la fiche liée…' }).click();
    const d = page.getByRole('dialog');
    await d.waitFor();
    await d.getByText('Fiche choisie : Vael II (colonie)').waitFor({ timeout: 3000 });
    assert.equal(await d.getByRole('textbox', { name: 'Rechercher une fiche' }).inputValue(), '');
    await d.getByRole('button', { name: 'Annuler' }).click();
    await d.waitFor({ state: 'detached' });
    assert.equal(await liee('d-un'), ficheLue);
    await ctx.close();
  });

  it('la fiche supprimée : le corps reste, sans lien, sans erreur', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'd-un');
    await panneau(page).getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('colonie');
    await d.getByRole('option', { name: /Vael II \(colonie\)/ }).click();
    await d.getByRole('button', { name: 'Lier', exact: true }).click();
    await d.waitFor({ state: 'detached' });
    const r = await page.request.delete(`/api/univers/${univers}/fiches/${ficheLue}`);
    assert.ok(r.status() < 300, `suppression ${r.status()}`);
    await page.reload();
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await choisir(page, 'd-un');
    assert.equal(await panneau(page).getByText('Fiche :').count(), 0);
    assert.equal(await page.locator('.cs-corps[data-cle="d-un"]').count(), 1, 'le corps reste');
    assert.equal(await page.getByRole('alert').count(), 0, 'aucune erreur');
    assert.equal(sql((db) => db.prepare('SELECT COUNT(*) AS n FROM swn_astres WHERE cle = ?').get('d-un').n), 1);
    await ctx.close();
  });

  it('« Illustrer la fiche » : toast « Illustration ajoutée à <titre>. » avec « Ouvrir la fiche » qui mène à elle', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    const id = await fiche(page, 'Vael IV (étape)', true);
    sql((db) => db.prepare('UPDATE swn_astres SET fiche_id = ? WHERE cle = ?').run(id, 'd-deux'));
    await page.reload();
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await choisir(page, 'd-deux');
    const b = panneau(page).getByRole('button', { name: 'Illustrer la fiche' });
    await page.route('**/astres/d-deux/**', async (r: Any) => { if (r.request().method() === 'POST') await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
    const rep = page.waitForResponse((r: Any) => r.request().method() === 'POST' && r.url().includes('/astres/d-deux/'), { timeout: 60000 });
    await b.click();
    assert.ok((await rep).status() < 300);
    const t = page.getByRole('status').getByText('Illustration ajoutée à Vael IV (étape).');
    await t.waitFor({ timeout: 60000 });
    await hors(page, '6-toast-illustration');
    await page.getByRole('status').getByRole('link', { name: 'Ouvrir la fiche' }).click();
    await page.waitForURL((u) => u.pathname.endsWith(`/fiche/${id}`) || u.pathname.endsWith("/vael-iv-etape")); // readable address (keys, kanevas-synchro-cles)
    const f = (await (await page.request.get(`/api/univers/${univers}/fiches/${id}`)).json()) as Any;
    assert.ok(JSON.stringify(f).match(/illustration|image|fichier/i), 'la fiche porte une illustration');
    await hors(page, '7-fiche-illustree');
    await ctx.close();
  });

  it('« Illustrer la fiche » : le bouton se lit « Illustration en cours… » tant que la requête court', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    const id = await fiche(page, 'Vael VI (attente)', true);
    sql((db) => db.prepare('UPDATE swn_astres SET fiche_id = ? WHERE cle = ?').run(id, 'd-deux'));
    await page.reload();
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await choisir(page, 'd-deux');
    await page.route('**/astres/d-deux/**', async (r: Any) => { if (r.request().method() === 'POST') await new Promise((ok) => setTimeout(ok, 2500)); await r.continue(); });
    await panneau(page).getByRole('button', { name: 'Illustrer la fiche' }).click();
    await panneau(page).getByText('Illustration en cours…').waitFor({ state: 'visible', timeout: 2000 });
    await hors(page, '6b-en-cours');
    await ctx.close();
  });

  it('« Illustrer la fiche » en échec : Alerte « L’illustration n’a pas pu être ajoutée. » + « Réessayer », rien d’ajouté', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    await page.route('**/astres/d-deux/**', (r: Any) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: '{}', contentType: 'application/json' }) : r.continue()));
    await choisir(page, 'd-deux');
    const idf = await fiche(page, 'Vael V (échec)', true);
    sql((db) => db.prepare('UPDATE swn_astres SET fiche_id = ? WHERE cle = ?').run(idf, 'd-deux'));
    await page.reload();
    await choisir(page, 'd-deux');
    await panneau(page).getByRole('button', { name: 'Illustrer la fiche' }).click();
    await panneau(page).getByText('L’illustration n’a pas pu être ajoutée.').waitFor();
    assert.equal(await page.getByRole('status').getByText(/Illustration ajoutée/).count(), 0, 'un échec n’est pas un toast');
    assert.equal(await panneau(page).getByRole('button', { name: 'Réessayer' }).count(), 1);
    await hors(page, '8-alerte-illustration');
    await ctx.close();
  });

  it('système tiré : « Lier » ouvre d’abord l’ancrage ; « Annuler » n’envoie rien, puis « Ancrer » lie et ancre', async () => {
    remise();
    const { page, ctx } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}`);
    await page.locator('circle[data-genere]').first().waitFor({ state: 'attached' });
    const [q, r] = ((await page.locator('circle[data-genere]').first().getAttribute('data-genere')) ?? '').split(',').map(Number);
    await page.goto(adr({ q: q!, r: r! }));
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    const nb = () => sql((db) => db.prepare('SELECT COUNT(*) AS n FROM swn_systemes WHERE q = ? AND r = ?').get(q, r).n);
    assert.equal(nb(), 0, 'le système est tiré : aucune ligne');
    await page.locator('.cs-corps').nth(1).click();
    await panneau(page).waitFor();
    await panneau(page).getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('privée');
    await d.getByRole('option', { name: /Vael III \(privée\)/ }).click();
    await d.getByRole('button', { name: 'Lier', exact: true }).click();
    const anc = page.getByRole('dialog', { name: 'Ancrer ce système ?' });
    await anc.waitFor();
    await hors(page, '11-ancrage-d-abord');
    await anc.getByRole('button', { name: 'Annuler' }).click();
    await anc.waitFor({ state: 'detached' });
    assert.equal(nb(), 0, 'Annuler n’écrit rien');
    await d.getByRole('button', { name: 'Lier', exact: true }).click();
    await anc.waitFor();
    await anc.getByRole('button', { name: 'Ancrer', exact: true }).click();
    await anc.waitFor({ state: 'detached' });
    await panneau(page).getByText('Fiche : ').waitFor();
    assert.equal(nb(), 1, 'le système est ancré');
    assert.equal(sql((db) => db.prepare('SELECT COUNT(*) AS n FROM swn_astres WHERE fiche_id = ?').get(fichePrivee).n), 1);
    await ctx.close();
  });

  it('conflit : « Cet astre a changé depuis que vous l’avez ouvert. » + « Recharger », le dialogue reste ; fiche disparue : « Cette fiche n’existe plus. »', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'd-un');
    await panneau(page).getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('privée');
    await d.getByRole('option', { name: /Vael III \(privée\)/ }).click();
    sql((db) => db.prepare('UPDATE swn_astres SET version = version + 1 WHERE cle = ?').run('d-un'));
    await d.getByRole('button', { name: 'Lier', exact: true }).click();
    await d.getByText('Cet astre a changé depuis que vous l’avez ouvert.').waitFor();
    assert.equal(await d.getByText('Fiche choisie : Vael III (privée)').count(), 1, 'le choix est gardé');
    await hors(page, '9-conflit');
    await d.getByRole('button', { name: 'Recharger' }).click();
    await ctx.close();
    // sheet gone
    const c2 = await ouvrir('Antor');
    await choisir(c2.page, 'd-un');
    await panneau(c2.page).getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d2 = c2.page.getByRole('dialog');
    await d2.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('privée');
    await d2.getByRole('option', { name: /Vael III \(privée\)/ }).click();
    const r = await c2.page.request.delete(`/api/univers/${univers}/fiches/${fichePrivee}`);
    assert.ok(r.status() < 300);
    await d2.getByRole('button', { name: 'Lier', exact: true }).click();
    await d2.getByText('Cette fiche n’existe plus.').waitFor();
    assert.equal(await d2.getByText(/Fiche choisie/).count(), 0, 'le choix est effacé');
    await c2.ctx.close();
  });

  it('390 px : le dialogue de Antor garde « Annuler » et « Lier » dans l’écran', async () => {
    remise();
    const { page, ctx } = await ouvrir('Antor', 390, 780);
    await choisir(page, 'd-un');
    await panneau(page).getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog');
    await d.waitFor();
    for (const n of ['Annuler', 'Lier']) {
      const bb = await d.getByRole('button', { name: n, exact: true }).boundingBox();
      assert.ok(bb && bb.y + bb.height <= 780 && bb.x + bb.width <= 390, `${n} dans l’écran`);
    }
    await hors(page, '10-dialogue-390');
    await ctx.close();
  });
  it('zone : Lier, Changer la fiche liée, Délier depuis son panneau (MJ) ; Léa voit la ligne sans aucun geste ; Échap ferme le dialogue sans écrire', async () => {
    remise();
    const zone = (page: Any) => page.getByRole('region', { name: 'Zone sélectionnée' });
    const { page, ctx } = await ouvrir('Antor');
    const ficheLue = await fiche(page, 'Vael II (colonie)', true); // own sheet: an earlier test deletes the shared one
    await page.getByRole('list', { name: 'Zones du système' }).getByRole('button', { name: /Ceinture de Vael/ }).click();
    const z = zone(page);
    await z.waitFor();
    assert.equal(await z.getByRole('button', { name: 'Illustrer la fiche' }).count(), 0, 'pas d’illustration pour une zone');
    assert.equal(await z.getByRole('button', { name: 'Délier' }).count(), 0);
    await z.getByRole('button', { name: 'Lier à une fiche…' }).click();
    const d = page.getByRole('dialog');
    await d.waitFor();
    await page.keyboard.press('Escape');
    await d.waitFor({ state: 'detached' });
    assert.equal(sql((db) => db.prepare("SELECT fiche_id FROM swn_formations WHERE cle = 'd-ceinture'").get().fiche_id), null, 'Échap n’écrit rien');
    await z.getByRole('button', { name: 'Lier à une fiche…' }).click();
    await d.getByRole('textbox', { name: 'Rechercher une fiche' }).fill('colonie');
    await d.getByRole('option', { name: /Vael II \(colonie\)/ }).click();
    await d.getByRole('button', { name: 'Lier', exact: true }).click();
    await d.waitFor({ state: 'detached' });
    await z.getByRole('link', { name: 'Vael II (colonie)' }).waitFor();
    const fz = () => sql((db) => db.prepare("SELECT fiche_id FROM swn_formations WHERE cle = 'd-ceinture'").get().fiche_id);
    assert.equal(fz(), ficheLue);
    await hors(page, '11-zone-liee');
    await z.getByRole('button', { name: 'Changer la fiche liée…' }).click();
    await d.getByText('Fiche choisie : Vael II (colonie)').waitFor();
    await d.getByRole('button', { name: 'Annuler' }).click();
    await d.waitFor({ state: 'detached' });
    await z.getByRole('button', { name: 'Délier' }).click();
    await z.getByText('Fiche :').waitFor({ state: 'detached' });
    assert.equal(fz(), null);
    sql((db) => db.prepare("UPDATE swn_formations SET fiche_id = ? WHERE cle = 'd-ceinture'").run(ficheLue));
    await ctx.close();
    const l = await ouvrir('Léa');
    await l.page.getByRole('list', { name: 'Zones du système' }).getByRole('button', { name: /Ceinture de Vael/ }).click();
    await zone(l.page).getByRole('link', { name: 'Vael II (colonie)' }).waitFor();
    for (const m of ['Lier', 'Délier', 'Changer']) assert.equal(await zone(l.page).getByRole('button', { name: new RegExp(m) }).count(), 0, m);
    await l.ctx.close();
  });
});
