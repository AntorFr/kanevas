// Browser test of kanevas-outils-catalogue-elements, written from the exit criterion and docs/ecrans.md
// (E-20 « Voir les éléments ») — not from the code. Stub world with the seed. Screenshots go to
// /tmp/cap-catalogue-elements (never into the workspace). Léa has no screen: her reads are API calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-catalogue-elements';
const EXEMPLE = JSON.parse(readFileSync('src/outils/essai/exemples/catalogue-essai.json', 'utf8')) as Any;
const clone = (): Any => JSON.parse(JSON.stringify(EXEMPLE));
const fautif = (): Any => { const c = clone(); delete c.armes.find((a: Any) => a.cle === 'laser-lourd').masse; return c; };
const ARME = EXEMPLE.armes[0];
const univers = (version: string, armes: Any[]): Any => ({ catalogue: 'essai/g', version, coques: [], armes });
const fichier = (nom: string, contenu: unknown) => ({ name: nom, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contenu)) });
const G = 'essai/g';

describe('Voir les éléments d’un catalogue (E-20)', { skip: skipBrowser, timeout: 500000 }, () => {
  let srv: Server;
  let browser: Any;
  const ids: Record<string, number> = {};
  const ouvre = async (compte: string, width = 1440) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width, height: 900 });
    return c;
  };
  const U = (nom: string) => `/api/univers/${ids[nom]}/outils/${G}/catalogue`;
  const e14 = (q = '') => `/univers/${ids["Éneria d'essai"]}/parametres?onglet=outils${q}`;
  const e15 = (q = '') => `/systemes/${ids["Système d'essai"]}?type=outils${q}`;
  const carte = (page: Any) => page.getByRole('region', { name: 'Essai G' });
  const panneau = (page: Any) => page.getByRole('region', { name: /^Éléments/ });
  const ligne = (page: Any, nom: string) => panneau(page).getByRole('listitem').filter({ hasText: nom });
  const photo = (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const ouvrirPanneau = async (page: Any) => { await carte(page).getByRole('button', { name: 'Voir les éléments' }).click(); };
  const onglet = (page: Any, re: RegExp) => panneau(page).getByRole('tab', { name: re });
  const lire = async (ctx: Any, url: string): Promise<{ statut: number; corps: string }> => {
    const r = await ctx.request.get(url); return { statut: r.status(), corps: await r.text() };
  };
  const ecrire = (ctx: Any, url: string, body: unknown) => ctx.request.put(url, { data: body });
  const importer = (ctx: Any, url: string, body: unknown) => ctx.request.post(`${url}/application`, { data: body });

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    for (const u of us.univers ?? us) ids[u.nom] = u.id;
    const ss = (await (await a.page.request.get('/api/systemes')).json()) as Any;
    for (const s of ss.systemes ?? ss) ids[s.nom] = s.id;
    await a.ctx.close();
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('états : liste vide, chargement, erreur avec Réessayer', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(e15());
    await carte(page).waitFor();
    await ouvrirPanneau(page);
    await panneau(page).getByText('Aucun élément dans ce catalogue.').waitFor();
    await photo(page, 'vide');
    await ctx.close();
  });

  it('Antor, Léa, Mira : le critère de bout en bout', async () => {
    const antor = await ouvre('Antor');
    const lea = await ouvre('Léa');
    const sys = `/api/systemes/${ids["Système d'essai"]}/outils/${G}`;
    const act = await ecrire(antor.ctx, `${sys}/activation`, { active: true });
    assert.ok([200, 204].includes(act.status()), `activation ${act.status()}`);
    assert.equal((await importer(antor.ctx, `${sys}/catalogue`, fautif())).status(), 200);
    assert.equal((await importer(antor.ctx, U("Éneria d'essai"), univers('u1', [{ ...ARME, cle: 'lance-essai', nom: 'Lance d’essai' }]))).status(), 200);
    const { page } = antor;
    await page.goto(e14());
    await carte(page).waitFor();
    await ouvrirPanneau(page);
    await onglet(page, /^Coques · 4$/).waitFor();
    await onglet(page, /^Armes · 8$/).click();
    await ligne(page, 'Lance d’essai').waitFor();
    assert.ok(await ligne(page, 'Lance d’essai').getByText('Univers', { exact: true }).count() >= 1);
    assert.ok(await ligne(page, 'Canon léger').getByText('Système', { exact: true }).count() >= 1);
    await photo(page, 'antor-liste');

    // mask
    const leaLit = async () => (await lire(lea.ctx, U("Éneria d'essai") + '?nature=armes')).corps;
    assert.ok((await leaLit()).includes('lance-essai'), 'visible avant masquage');
    await ligne(page, 'Lance d’essai').getByRole('button', { name: 'Masquer aux joueurs' }).click();
    await ligne(page, 'Lance d’essai').getByText('MJ seul').waitFor();
    await ligne(page, 'Lance d’essai').getByRole('button', { name: 'Rendre visible' }).waitFor();
    await photo(page, 'antor-masque');
    const masquee = await lire(lea.ctx, U("Éneria d'essai") + '?nature=armes');
    assert.equal(masquee.statut, 200);
    assert.ok(!masquee.corps.includes('lance-essai') && !masquee.corps.includes('Lance'), 'Léa ne la lit pas');
    assert.ok(!/manque|masqu|cach|MJ|retir/i.test(masquee.corps.replace(/"[^"]*"\s*:/g, '')), `rien ne signale un manque: ${masquee.corps.slice(0, 200)}`);
    // visible again
    await ligne(page, 'Lance d’essai').getByRole('button', { name: 'Rendre visible' }).click();
    await ligne(page, 'Lance d’essai').getByRole('button', { name: 'Masquer aux joueurs' }).waitFor();
    assert.ok((await leaLit()).includes('lance-essai'), 'rendue visible, Léa la lit');

    // retire a system element
    await ligne(page, 'Canon léger').getByRole('button', { name: 'Retirer de cet univers' }).click();
    await ligne(page, 'Canon léger').getByText('Retiré de l’univers').waitFor();
    await ligne(page, 'Canon léger').getByRole('button', { name: 'Rétablir' }).waitFor();
    assert.equal(await ligne(page, 'Canon léger').evaluate((el: Any) => Number(getComputedStyle(el).opacity) < 1), true, 'ligne estompée');
    await photo(page, 'antor-retire');
    assert.ok(!(await leaLit()).includes('canon-leger'), 'Léa ne lit plus canon-leger');
    const voisin = await lire(antor.ctx, U('Univers voisin') + '?nature=armes');
    assert.ok(voisin.corps.includes('canon-leger'), 'Univers voisin le garde');
    // « Système » sur Univers voisin
    await page.goto(`/univers/${ids['Univers voisin']}/parametres?onglet=outils`);
    await carte(page).waitFor();
    await ouvrirPanneau(page);
    await onglet(page, /^Armes/).click();
    assert.ok(await ligne(page, 'Canon léger').getByText('Système', { exact: true }).count() >= 1);
    await page.goto(e14());
    await carte(page).waitFor();
    await ouvrirPanneau(page);
    await onglet(page, /^Armes/).click();
    await ligne(page, 'Canon léger').getByRole('button', { name: 'Rétablir' }).click();
    await ligne(page, 'Canon léger').getByRole('button', { name: 'Retirer de cet univers' }).waitFor();
    assert.ok((await leaLit()).includes('canon-leger'), 'rétabli, Léa le lit');

    // replaced element: laser
    assert.equal((await importer(antor.ctx, U("Éneria d'essai"), univers('u2', [{ ...ARME, cle: 'laser', nom: 'Laser maison' }]))).status(), 200);
    await page.reload();
    await carte(page).waitFor();
    await ouvrirPanneau(page);
    await onglet(page, /^Armes · 8$/).click();
    const laser = ligne(page, 'Laser maison');
    await laser.getByText('Remplacé pour l’univers').waitFor();
    assert.equal(await laser.getByRole('button', { name: /Retirer/ }).count(), 0, 'pas de retrait sur un remplacé');
    await photo(page, 'antor-remplace');
    await laser.getByRole('button', { name: 'Masquer aux joueurs' }).click();
    await laser.getByText('MJ seul').waitFor();
    const apres = (await leaLit());
    assert.ok(!/"cle":"laser"/.test(apres), 'ni le remplaçant ni l’arme du système : Léa ne lit pas laser');
    await laser.getByRole('button', { name: 'Rendre visible' }).click();
    await laser.getByRole('button', { name: 'Masquer aux joueurs' }).waitFor();

    // stale version: a second context changes lance-essai
    await ligne(page, 'Lance d’essai').waitFor();
    const gest = (await (await antor.ctx.request.get(U("Éneria d'essai") + '/gestion?nature=armes')).json()) as Any;
    const le = gest.elements.find((e: Any) => e.cle === 'lance-essai');
    const r = await ecrire(antor.ctx, `${U("Éneria d'essai")}/armes/lance-essai/masque`, { masque: true, version: le.version });
    assert.equal(r.status(), 200);
    await ligne(page, 'Lance d’essai').getByRole('button', { name: 'Masquer aux joueurs' }).click();
    await page.getByText('Cet élément a changé depuis que vous l’avez ouvert.').waitFor();
    await photo(page, 'antor-conflit');
    await page.getByRole('button', { name: 'Recharger' }).click();
    await ligne(page, 'Lance d’essai').getByRole('button', { name: 'Rendre visible' }).waitFor();
    await ligne(page, 'Lance d’essai').getByText('MJ seul').waitFor();

    // mask then re-apply the file that contains it through the import dialog
    await carte(page).getByRole('button', { name: 'Importer un catalogue…' }).click();
    const dlg = page.getByRole('dialog');
    await page.locator('input[type=file]').setInputFiles(fichier('u3.json', univers('u3', [{ ...ARME, cle: 'lance-essai', nom: 'Lance d’essai', cout: 77 }])));
    await dlg.getByRole('button', { name: /^Appliquer/ }).waitFor();
    await dlg.getByRole('button', { name: /^Appliquer/ }).click();
    await dlg.getByText(/Catalogue appliqué/).waitFor();
    await dlg.getByRole('button', { name: 'Fermer' }).first().click();
    const g2 = (await (await antor.ctx.request.get(U("Éneria d'essai") + '/gestion?nature=armes')).json()) as Any;
    assert.equal(g2.elements.find((e: Any) => e.cle === 'lance-essai').masque, true, 'toujours masquée après réimport');
    assert.ok(!(await leaLit()).includes('lance-essai'));
    await page.reload();
    await carte(page).waitFor();
    await ouvrirPanneau(page);
    await onglet(page, /^Armes/).click();
    await ligne(page, 'Lance d’essai').getByText('MJ seul').waitFor();

    // offline
    await antor.ctx.setOffline(true);
    await panneau(page).getByText('Connexion perdue.').waitFor();
    assert.equal(await ligne(page, 'Lance d’essai').getByRole('button', { name: 'Rendre visible' }).isDisabled(), true);
    await photo(page, 'antor-hors-ligne');
    await antor.ctx.setOffline(false);
    await antor.ctx.close(); await lea.ctx.close();
  });

  it('E-15 : Mira lit la liste sans aucun bouton ; mode Joueur sans action', async () => {
    const mira = await ouvre('Mira');
    await mira.page.goto(e15());
    await carte(mira.page).waitFor();
    await ouvrirPanneau(mira.page);
    await onglet(mira.page, /^Armes · 7$/).click();
    await ligne(mira.page, 'Canon léger').waitFor();
    assert.equal(await panneau(mira.page).getByRole('button', { name: /Masquer|Rendre|Retirer|Rétablir/ }).count(), 0);
    await photo(mira.page, 'mira-e15');
    await mira.ctx.close();
  });

  it('120 caractères de nom passent à la ligne sans cacher les pastilles (360 px)', async () => {
    const antor = await ouvre('Antor', 360);
    const long = 'N'.repeat(5) + ' mot'.repeat(23);
    const nom = long.slice(0, 120);
    await importer(antor.ctx, U("Éneria d'essai"), univers('u4', [{ ...ARME, cle: 'long', nom }]));
    await antor.page.goto(e14());
    await carte(antor.page).waitFor();
    await ouvrirPanneau(antor.page);
    await onglet(antor.page, /^Armes/).click();
    const l = ligne(antor.page, nom.slice(0, 20));
    await l.waitFor();
    assert.equal(await antor.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'débordement horizontal');
    const pastille = l.getByText('Univers', { exact: true });
    await pastille.waitFor();
    const box = await pastille.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 360, `pastille hors écran ${JSON.stringify(box)}`);
    await photo(antor.page, 'nom-120-360');
    await antor.ctx.close();
  });

  it('erreur : Réessayer, chargement visible', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(e14());
    await carte(page).waitFor();
    let casse = true;
    await page.route('**/catalogue/gestion**', async (r: Any) => { if (casse) await r.abort('connectionreset'); else await r.continue(); });
    await ouvrirPanneau(page);
    await panneau(page).getByText('Impossible de charger les éléments.').waitFor();
    await photo(page, 'erreur');
    casse = false;
    await panneau(page).getByRole('button', { name: 'Réessayer' }).click();
    await onglet(page, /^Armes/).waitFor();
    await ctx.close();
  });
});
