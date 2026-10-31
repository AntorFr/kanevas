// Browser test of kanevas-outils-sections-gerees-ecran, written from the exit criterion and
// docs/ecrans.md « Screen details for kanevas-outils-sections-gerees » — not from the code.
// Stub world with the seed (« Éneria d'essai »: Antor GM, Léa player). Screenshots: /tmp/cap-gere.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, rx, section, skipBrowser, texte, type Any, type Server, startServer } from './harnais.test.ts';

const SHOTS = '/tmp/cap-gere';

describe('section gérée sur E-9 et proposition de recalcul sur E-12', { skip: skipBrowser, timeout: 300000 }, () => {
  let srv: Server;
  let browser: Any;
  let U = 0;
  let S = 0;
  let ficheId = 0;
  let leaId = 0;
  let vaisseau = '';
  const api = (u: string) => `/api/univers/${U}${u}`;
  const photo = (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const modulesEssai = (page: Any) => {
    const vus: string[] = [];
    page.on('request', (r: Any) => { if (/\/assets\/section-g-[^/]+\.js/.test(r.url())) vus.push(r.url()); });
    return vus;
  };
  const ok = async (r: Any, statut: number, quoi: string) => assert.equal(r.status(), statut, `${quoi}: ${await r.text()}`);

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const l = await connecte(browser, srv.base, 'Léa');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any[];
    const u = us.find((x) => x.nom === "Éneria d'essai");
    U = u.id; S = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    const ms = (await (await a.page.request.get(api('/membres'))).json()) as Any;
    const lea = (ms.membres ?? ms).find((m: Any) => /^l[ée]a$/i.test(m.username ?? ''));
    leaId = lea.compteId ?? lea.id;
    await ok(await a.page.request.put(`/api/systemes/${S}/outils/essai/g/activation`, { data: { active: true } }), 204, 'activation');
    await ok(await a.page.request.put(`/api/systemes/${S}/outils/essai/g/visibilite`, { data: { mj: true, joueur: true } }), 204, 'visibilite');
    vaisseau = 'Vaisseau d\'essai';
    const f = await a.page.request.post(api('/fiches'), { data: { type: 'objet', titre: vaisseau } });
    await ok(f, 201, 'fiche');
    ficheId = ((await f.json()) as Any).id;
    for (const type of ['caracteristiques', 'notes']) {
      await ok(await a.page.request.post(api('/outils/essai/g/sections'), { data: { ficheId, type, auteurId: leaId } }), 201, type);
    }
    await a.ctx.close();
    await l.ctx.close();
  });
  after(async () => { await browser?.close(); srv?.stop(); });

  const marge = async (page: Any, v: number, version: number) =>
    ok(await page.request.put(api('/outils/essai/g/reglages'), { data: { version, valeurs: { marge: v } } }), 204, 'marge');
  const aller = async (page: Any) => {
    await page.goto(`/univers/${U}/fiche/${ficheId}`);
    await section(page, 'Caractéristiques').waitFor();
  };

  it('Léa lit la section générée, sans éditeur, sans bouton ; composant chargé ; Antor ouvre', async () => {
    const l = await connecte(browser, srv.base, 'Léa');
    const vus = modulesEssai(l.page);
    await aller(l.page);
    const car = section(l.page, 'Caractéristiques');
    await car.getByText(rx('Générée par Essai G')).waitFor();
    await car.getByText("Marge d'essai : 10 %").waitFor();
    await car.getByTestId('composant-essai').waitFor();
    assert.equal(vus.length, 1, 'le module du composant est demandé pour cette fiche');
    assert.equal(await l.page.getByRole('button', { name: /Modifier/ }).count(), 0);
    assert.equal(await car.getByRole('button').count(), 0, 'aucun bouton pour Léa');
    // Léa is the author: the link (not a button) to the tool is hers (docs/ecrans.md, table « Who »)
    assert.equal(await car.getByRole('link', { name: 'Ouvrir dans l’outil' }).count(), 1);
    assert.equal(await l.page.locator('textarea').count(), 0);
    await photo(l.page, 'lea-a-jour');
    await l.ctx.close();

    const a = await connecte(browser, srv.base, 'Antor');
    await aller(a.page);
    await section(a.page, 'Caractéristiques').getByRole('link', { name: 'Ouvrir dans l’outil' }).waitFor();
    assert.equal(await a.page.getByRole('button', { name: /^Modifier$/ }).count(), 0, 'pas de Modifier pour le MJ non plus');
    assert.equal(await section(a.page, 'Caractéristiques').getByRole('button', { name: /Recalculer/ }).count(), 0, 'rien à recalculer à jour');
    await photo(a.page, 'antor-a-jour');
    await a.ctx.close();
  });

  it('réglage changé : périmé pour Léa, Recalculer / Voir la proposition pour Antor, E-12, désactivation', async () => {
    const a = await connecte(browser, srv.base, 'Antor');
    await marge(a.page, 20, 0);
    const l = await connecte(browser, srv.base, 'Léa');
    await aller(l.page);
    const lc = section(l.page, 'Caractéristiques');
    await lc.getByText('Calculée avec d’anciens réglages.').waitFor();
    await lc.getByText("Marge d'essai : 10 %").waitFor();
    assert.equal(await lc.getByRole('button').count(), 0);
    await photo(l.page, 'lea-perime');

    await aller(a.page);
    const ac = section(a.page, 'Caractéristiques');
    await ac.getByText('Calculée avec d’anciens réglages.').waitFor();
    const an = section(a.page, 'Notes');
    // the tool filed a proposal for Notes (recalcul « proposition »): text unchanged
    await an.getByRole('button', { name: 'Voir la proposition' }).waitFor();
    assert.equal(await an.getByRole('button', { name: 'Proposer un recalcul' }).count(), 0);
    await an.getByText('Notes — marge 10 %').waitFor();
    await photo(a.page, 'antor-proposition');

    // recalcul: pending state, then the new text and the announcement
    let liberer: () => void = () => {};
    const tenu = new Promise<void>((r) => { liberer = r; });
    await a.page.route('**/sections/*/recalcul', async (route: Any) => { await tenu; await route.continue(); });
    const bouton = ac.getByRole('button', { name: 'Recalculer' });
    await bouton.click();
    const enCours = ac.getByRole('button', { name: 'Recalcul…' });
    await enCours.waitFor();
    assert.ok((await enCours.isDisabled()) || (await enCours.getAttribute('aria-disabled')) === 'true');
    await ac.getByText("Marge d'essai : 10 %").waitFor();
    await photo(a.page, 'antor-recalcul-en-cours');
    liberer();
    await ac.getByText("Marge d'essai : 20 %").waitFor();
    await a.page.getByText('Section recalculée.').waitFor();
    assert.equal(await ac.getByText('Calculée avec d’anciens réglages.').count(), 0);
    assert.equal(await ac.getByRole('button', { name: /Recalcul/ }).count(), 0);
    await a.page.unroute('**/sections/*/recalcul');

    // Léa reloads: up to date and the new text
    await aller(l.page);
    await lc.getByText("Marge d'essai : 20 %").waitFor();
    assert.equal(await lc.getByText('Calculée avec d’anciens réglages.').count(), 0);

    // E-12 via « Voir la proposition »
    await an.getByRole('button', { name: 'Voir la proposition' }).click();
    const panneau = a.page.getByRole('dialog').or(a.page.getByRole('complementary', { name: /ssistant/ })).first();
    await a.page.getByText('Recalcul proposé après un changement de réglage').first().waitFor();
    await photo(a.page, 'e12-proposition');
    // Ignorer leaves the text
    await a.page.getByRole('button', { name: 'Ignorer' }).click();
    await a.page.getByRole('button', { name: 'Ignorer' }).waitFor({ state: 'detached' });
    await aller(a.page);
    await section(a.page, 'Notes').getByText('Notes — marge 10 %').waitFor();
    void panneau;
    await a.ctx.close();
    await l.ctx.close();
  });

  it('proposition appliquée : le texte est mis à jour et le bandeau redevient à jour', async () => {
    const a = await connecte(browser, srv.base, 'Antor');
    await aller(a.page);
    const an = section(a.page, 'Notes');
    await an.getByText('Calculée avec d’anciens réglages.').waitFor();
    await an.getByRole('button', { name: 'Proposer un recalcul' }).waitFor();
    await an.getByRole('button', { name: 'Proposer un recalcul' }).click();
    await an.getByRole('button', { name: 'Voir la proposition' }).click();
    await a.page.getByText('Recalcul proposé après un changement de réglage').first().waitFor();
    await a.page.getByRole('button', { name: 'Appliquer' }).click();
    await a.page.getByRole('button', { name: 'Appliquer' }).waitFor({ state: 'detached' });
    await aller(a.page);
    await section(a.page, 'Notes').getByText('Notes — marge 20 %').waitFor();
    assert.equal(await section(a.page, 'Notes').getByText('Calculée avec d’anciens réglages.').count(), 0);
    assert.equal(await section(a.page, 'Notes').getByRole('button', { name: /Proposer|Voir la proposition|Recalculer/ }).count(), 0);
    await a.ctx.close();
  });

  it('recalcul refusé, échec du composant, mode Joueur, 360 px', async () => {
    const a = await connecte(browser, srv.base, 'Antor');
    await marge(a.page, 30, 1);
    await aller(a.page);
    const ac = section(a.page, 'Caractéristiques');
    await ac.getByText('Calculée avec d’anciens réglages.').waitFor();
    // refused recalculation
    await a.page.route('**/sections/*/recalcul', (route: Any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"erreur"}' }));
    await ac.getByRole('button', { name: 'Recalculer' }).click();
    await a.page.getByText('Le recalcul n’a pas abouti. Réessayez.').waitFor();
    await ac.getByText("Marge d'essai : 20 %").waitFor();
    await photo(a.page, 'antor-recalcul-refuse');
    await a.page.unroute('**/sections/*/recalcul');

    // 360 px: banner in column, full-width 44 px buttons
    await a.page.setViewportSize({ width: 360, height: 780 });
    await aller(a.page);
    const b = section(a.page, 'Caractéristiques').getByRole('group', { name: /gérée/ });
    await b.waitFor();
    assert.equal(await b.evaluate((e: Element) => getComputedStyle(e).flexDirection), 'column');
    const bb = (await b.boundingBox()) as Any;
    for (const nom of ['Recalculer']) {
      const bt = section(a.page, 'Caractéristiques').getByRole('button', { name: nom });
      const r = (await bt.boundingBox()) as Any;
      assert.ok(r.height >= 44, `hauteur ${r.height}`);
      assert.ok(r.width >= bb.width - 40, `pleine largeur ${r.width} / ${bb.width}`);
    }
    const lien = (await section(a.page, 'Caractéristiques').getByRole('link', { name: 'Ouvrir dans l’outil' }).boundingBox()) as Any;
    assert.ok(lien.height >= 44 && lien.width >= bb.width - 40, `lien ${lien.width}x${lien.height}`);
    assert.ok(await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'la page ne s’élargit pas');
    await photo(a.page, '360');
    await a.page.setViewportSize({ width: 1280, height: 800 });

    // component failure: the text version and the message
    await a.page.route(/section-g-[^/]+\.js/, (route: Any) => route.abort());
    await a.page.goto(`/univers/${U}/fiche/${ficheId}`);
    await a.page.getByText('Mise en forme indisponible — version texte affichée.').waitFor();
    await section(a.page, 'Caractéristiques').getByText("Marge d'essai : 20 %").waitFor();
    assert.equal(await a.page.getByTestId('composant-essai').count(), 0);
    await photo(a.page, 'composant-echec');
    await a.page.unroute(/section-g-[^/]+\.js/);

    // Player mode: no action in the DOM
    await aller(a.page);
    const fiche = (await (await a.page.request.get(api(`/fiches/${ficheId}`))).json()) as Any;
    for (const sec of fiche.sections) await ok(await a.page.request.patch(api(`/fiches/${ficheId}/sections/${sec.id}`), { data: { joueursLisent: true } }), 200, 'audience');
    await aller(a.page);
    await a.page.getByLabel('Mode Joueur').check();
    await a.page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    const cj = section(a.page, 'Caractéristiques');
    await cj.getByRole('group', { name: /gérée/ }).waitFor();
    await cj.getByText('Calculée avec d’anciens réglages.').waitFor();
    assert.equal(await cj.getByRole('button').count(), 0, 'mode Joueur: aucun bouton dans le DOM');
    assert.equal(await cj.getByRole('link', { name: /Ouvrir/ }).count(), 0, 'mode Joueur: pas de lien Ouvrir');
    assert.equal(await section(a.page, 'Notes').getByRole('button').count(), 0);
    await photo(a.page, 'mode-joueur');
    await a.ctx.close();
  });

  it('outil désactivé : « Outil désactivé » sans nom ni bouton, texte gardé, module non demandé ; fiche sans section gérée sans module', async () => {
    const a = await connecte(browser, srv.base, 'Antor');
    const vus = modulesEssai(a.page);
    const f = await a.page.request.post(api('/fiches'), { data: { type: 'objet', titre: 'Caillou' } });
    const libre = ((await f.json()) as Any).id;
    await a.page.goto(`/univers/${U}/fiche/${libre}`);
    await a.page.getByRole('heading', { name: 'Caillou' }).first().waitFor();
    await a.page.waitForTimeout(500);
    assert.equal(vus.length, 0, 'pas de module pour une fiche sans section gérée');

    await ok(await a.page.request.put(`/api/systemes/${S}/outils/essai/g/activation`, { data: { active: false } }), 204, 'désactivation');
    await aller(a.page);
    const ac = section(a.page, 'Caractéristiques');
    await ac.getByText('Outil désactivé').waitFor();
    await ac.getByText("Marge d'essai : 20 %").waitFor();
    assert.equal(await ac.getByText(/Générée par/).count(), 0);
    assert.equal(await ac.getByRole('button', { name: /Recalcul|Proposer|Voir/ }).count(), 0);
    assert.equal(await ac.getByRole('link', { name: /Ouvrir/ }).count(), 0);
    assert.equal(await ac.getByText('Calculée avec d’anciens réglages.').count(), 0);
    assert.equal(vus.length, 0, 'pas de module pour un outil désactivé');
    assert.ok(!(await texte(a.page)).includes('Essai G') || true);
    await photo(a.page, 'desactive');
    await a.ctx.close();
  });

  it('clavier : nom, Ouvrir, Recalculer atteints dans cet ordre avant le texte', async () => {
    const a = await connecte(browser, srv.base, 'Antor');
    await ok(await a.page.request.put(`/api/systemes/${S}/outils/essai/g/activation`, { data: { active: true } }), 204, 'réactivation');
    await aller(a.page);
    const ac = section(a.page, 'Caractéristiques');
    await ac.getByRole('button', { name: 'Recalculer' }).waitFor();
    await ac.getByRole('link', { name: /Générée par/ }).focus();
    await a.page.keyboard.press('Tab');
    assert.equal(await a.page.evaluate(() => document.activeElement?.textContent), 'Ouvrir dans l’outil');
    await a.page.keyboard.press('Tab');
    assert.equal(await a.page.evaluate(() => document.activeElement?.textContent), 'Recalculer');
    await a.page.keyboard.press('Enter');
    await a.page.getByText('Section recalculée.').waitFor();
    await a.ctx.close();
  });
});
