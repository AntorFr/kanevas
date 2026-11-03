// Browser test of kanevas-outils-vaisseaux-ecran, written from the exit criterion and docs/ecrans.md (E-22, E-9)
// — not from the code. Stub world with the seed. Screenshots go to /tmp/cap-vx (never into the workspace).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-vx';
const CODE = /\/assets\/vaisseaux-[^/]*\.js/;

describe('E-22 concepteur de vaisseaux et section « Caractéristiques » de E-9', { skip: skipBrowser, timeout: 400000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let outils = '';
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const ouvre = async (compte: string, w = 1280, h = 900) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: w, height: h });
    const codes: string[] = [];
    c.page.on('request', (r: Any) => { if (CODE.test(new URL(r.url()).pathname)) codes.push(r.url()); });
    return { ...c, codes };
  };
  const fiche = async (page: Any, titre: string) => {
    const r = (await (await page.request.get(`/api/univers/${univers}/outils/swn/vaisseaux/conceptions`)).json()) as Any;
    return [...r.conceptions, ...(r.fichesSansConception ?? [])].find((c: Any) => c.titre === titre);
  };

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: join(mkdtempSync(join(tmpdir(), 'kanevas-vx-')), 'k.db') });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    outils = `/univers/${univers}/outils/swn/vaisseaux`;
    await a.ctx.close();
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('Léa : code différé, alerte bloquante, enregistrement, fiche E-9', async () => {
    const { page, ctx, codes } = await ouvre('Léa');
    await page.goto(`/univers/${univers}`);
    await page.getByRole('link', { name: 'Concepteur de vaisseaux' }).first().waitFor();
    assert.equal(codes.length, 0, 'code non demandé avant l\'ouverture');
    await page.getByRole('link', { name: 'Concepteur de vaisseaux' }).first().click();
    await page.getByRole('link', { name: "Vent d'Orak" }).click();
    await page.getByRole('heading', { name: "Vent d'Orak" }).waitFor();
    assert.ok(codes.length >= 1);
    await hors(page, '1-atelier');
    await page.getByRole('button', { name: 'Ajouter : Armes' }).click();
    assert.match(await texte(page), /Lance d'essai/, 'la lance du semis est déjà là');
    const sel = page.getByRole('group', { name: /arme/i });
    await sel.getByRole('button', { name: /Lance d'essai/ }).click();
    await page.getByText('Puissance insuffisante : −2').waitFor();
    await page.waitForTimeout(400);
    const alerte = page.getByText('Puissance insuffisante : −2').first();
    const couleur = await alerte.evaluate((e: Any) => getComputedStyle(e).color);
    await hors(page, '2-alerte');
    const enr = page.getByRole('button', { name: 'Enregistrer', exact: true });
    assert.equal(await enr.isDisabled(), true);
    const corps = await texte(page);
    assert.match(corps, /Enregistrement refusé : .*Puissance insuffisante/);
    assert.ok(couleur !== 'rgb(0, 0, 0)', 'couleur ' + couleur);
    await page.getByRole('button', { name: /Diminuer la quantité : Lance d'essai/ }).click();
    await page.waitForFunction(() => !document.body.innerText.includes('Puissance insuffisante'));
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).waitFor();
    await page.waitForFunction(() => !(document.querySelector('button.principal') as Any)?.disabled);
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText('Conception enregistrée.').waitFor();
    await hors(page, '3-enregistre');
    const f = await fiche(page, "Vent d'Orak");
    await page.goto(`/univers/${univers}/fiche/${f.ficheId}`);
    await page.getByTestId('composant-caracteristiques').waitFor();
    await page.getByText(/Générée par .*[Cc]oncepteur de vaisseaux/).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0, 'sans éditeur');
    const t = await texte(page);
    assert.match(t, /685\s?000/);
    assert.match(t, /28 jours/);
    await hors(page, '4-fiche');
    await ctx.close();
  });

  it('Roxane et Teo : lien en lecture seule, page introuvable sans requête du code', async () => {
    const lea = await ouvre('Léa');
    await lea.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
    const etoile = await fiche(lea.page, 'Étoile du soir');
    await lea.page.goto(`${outils}?fiche=${etoile.ficheId}`);
    await lea.page.getByRole('heading', { name: 'Étoile du soir' }).waitFor();
    await lea.page.getByRole('button', { name: 'Copier le lien' }).click();
    await lea.page.getByText('Lien copié.').waitFor();
    const lien = (await lea.page.evaluate(() => navigator.clipboard.readText())) as string;
    assert.match(lien, new RegExp(`/outils/swn/vaisseaux\\?fiche=${etoile.ficheId}$`));
    await lea.ctx.close();

    // Roxane has no button on the stub login page: the GM in player mode stands for a non-author player.
    const rox = await ouvre('Antor');
    await rox.page.goto(outils);
    await rox.page.getByRole('radio', { name: 'Mode Joueur' }).check();
    await rox.page.getByRole('link', { name: 'Étoile du soir' }).click();
    await rox.page.getByRole('heading', { name: 'Étoile du soir' }).waitFor();
    await rox.page.getByText('Prix').first().waitFor();
    await rox.page.getByText('Lecture seule.').waitFor();
    assert.equal(await rox.page.getByRole('button', { name: 'Enregistrer' }).count(), 0);
    assert.equal(await rox.page.getByRole('button', { name: 'Annuler' }).count(), 0);
    assert.equal(await rox.page.getByRole('button', { name: /Retirer|Ajouter|Changer/ }).count(), 0);
    await hors(rox.page, '5-joueur-lecture');
    await rox.page.getByRole('link', { name: 'Toutes les conceptions' }).click();
    await rox.page.getByRole('link', { name: 'Étoile du soir' }).waitFor();
    assert.equal(await rox.page.getByRole('link', { name: "Vent d'Orak" }).count(), 0, 'la liste du joueur ne montre pas Vent d\'Orak');
    await rox.ctx.close();

    const lea2 = await ouvre('Léa');
    const o = await fiche(lea2.page, "Vent d'Orak");
    await lea2.ctx.close();
    for (const compte of ['Teo']) {
      const c = await ouvre(compte);
      await c.page.goto(`${outils}?fiche=${o.ficheId}`);
      await c.page.getByText('Page introuvable.').waitFor();
      assert.equal(c.codes.length, 0, `${compte}: aucun code de l'outil`);
      await hors(c.page, `6-${compte}-introuvable`);
      await c.ctx.close();
    }
  });

  it('390 px : catalogue en une colonne, résultats au-dessus, étiquette Univers', async () => {
    const { page, ctx } = await ouvre('Léa', 390, 780);
    const o = await fiche(page, "Vent d'Orak");
    await page.goto(`${outils}?fiche=${o.ficheId}`);
    await page.getByRole('heading', { name: "Vent d'Orak" }).waitFor();
    await page.getByRole('button', { name: 'Ajouter : Armes' }).click();
    const sel = page.getByRole('group', { name: /arme/i });
    await sel.getByRole('button', { name: /Lance d'essai/ }).waitFor();
    const li = sel.locator('li', { hasText: "Lance d'essai" });
    assert.match(await li.innerText(), /Univers/);
    const autre = sel.locator('li', { hasText: 'Laser' }).first();
    assert.doesNotMatch(await autre.innerText(), /Univers/);
    await hors(page, '7-390-catalogue');
    const bs = await sel.locator('li').evaluateAll((els: Any[]) => els.map((e) => e.getBoundingClientRect().left));
    assert.ok(new Set(bs.map((x: number) => Math.round(x))).size === 1, 'une colonne');
    // the results stay on screen while the catalogue is browsed: they lie above the open catalogue in the viewport
    await sel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/7b-390-viewport.png` });
    const br = await page.getByRole('complementary', { name: 'Résultats' }).boundingBox();
    const bs2 = await sel.boundingBox();
    // arbitration 22:44: under 760 px the panel is in the flow (not sticky, no height cap, no inner scroll)
    const pos = await page.getByRole('complementary', { name: 'Résultats' }).evaluate((e: Element) => {
      const d = e.querySelector('.vx-defile') as HTMLElement | null;
      return { position: getComputedStyle(e).position, maxHeight: getComputedStyle(e).maxHeight, interne: d ? d.scrollHeight > d.clientHeight + 1 : false };
    });
    assert.notEqual(pos.position, 'sticky', 'panneau non collant à 390 px');
    assert.equal(pos.maxHeight, 'none', 'panneau non plafonné à 390 px');
    assert.equal(pos.interne, false, 'aucune zone interne qui défile');
    assert.ok(br.y + br.height <= bs2.y + 2, 'résultats au-dessus du catalogue : ' + JSON.stringify([br, bs2]));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 391), 'pas de débordement horizontal');
    await ctx.close();
  });

  it('Antor : Nouvelle conception, Aube de Sel ; Léa sans bouton', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(outils);
    await page.getByRole('button', { name: 'Nouvelle conception' }).click();
    const d = page.getByRole('dialog');
    await d.waitFor();
    const opts = async (label: string) => d.getByLabel(label, { exact: true }).locator('option').allInnerTexts();
    assert.deepEqual(await opts('Fiche'), ['Aube de Sel']);
    const coques = await opts('Coque');
    assert.ok(coques.some((c: string) => /clair?eur/i.test(c)), String(coques));
    const auteurs = await opts('Auteur');
    assert.ok(auteurs.includes('lea'), String(auteurs));
    await hors(page, '8-creation');
    await d.getByLabel('Coque', { exact: true }).selectOption({ label: coques.find((c: string) => /clair?eur/i.test(c)) });
    await d.getByLabel('Auteur', { exact: true }).selectOption({ label: 'lea' });
    await d.getByRole('button', { name: 'Créer' }).click();
    await page.getByText('Aucun moteur de saut : ce vaisseau ne peut pas voyager.').waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Résultats"] .vx-calcul'));
    assert.equal(await page.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), false);
    await hors(page, '9-aube');
    await page.goto(outils);
    await page.getByRole('link', { name: 'Aube de Sel' }).waitFor();
    await page.getByRole('button', { name: 'Nouvelle conception' }).click();
    await page.getByRole('dialog').getByText('Aucune fiche de vaisseau sans conception.').waitFor();
    await ctx.close();
    const lea = await ouvre('Léa');
    await lea.page.goto(outils);
    await lea.page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    assert.equal(await lea.page.getByRole('button', { name: 'Nouvelle conception' }).count(), 0);
    await lea.ctx.close();
  });

  it('« Ouvrir la fiche » mène à la fiche E-9 de la conception', async () => {
    const { page, ctx } = await ouvre('Léa');
    const o = await fiche(page, "Vent d'Orak");
    await page.goto(`${outils}?fiche=${o.ficheId}`);
    await page.getByRole('heading', { name: "Vent d'Orak" }).waitFor();
    await page.getByRole('link', { name: 'Ouvrir la fiche' }).click();
    await page.waitForTimeout(1500);
    await hors(page, '13-ouvrir-la-fiche');
    assert.match(new URL(page.url()).pathname, new RegExp(`/fiche/${o.ficheId}$`), 'adresse : ' + page.url());
    await page.getByTestId('composant-caracteristiques').waitFor();
    assert.match(new URL(page.url()).pathname, new RegExp(`/fiche/${o.ficheId}$`));
    await ctx.close();
  });

  it('retrait de l\'éclaireur et masquage de la lance par Antor', async () => {
    const antor = await ouvre('Antor');
    const lea = await ouvre('Léa');
    const etoile = await fiche(lea.page, 'Étoile du soir');
    const base = `/api/univers/${univers}/outils/swn/vaisseaux`;
    const avant = (await (await lea.page.request.get(`${base}/conceptions/${etoile.ficheId}`)).json()) as Any;
    const r = await antor.page.request.put(`${base}/catalogue/coques/eclaireur/retrait`, { data: { retire: true } });
    assert.equal(r.status(), 200);
    await lea.page.goto(`${outils}?fiche=${etoile.ficheId}`);
    await lea.page.getByRole('heading', { name: 'Étoile du soir' }).waitFor();
    await lea.page.getByText('Élément retiré de cet univers').first().waitFor();
    assert.equal(await lea.page.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), true);
    await hors(lea.page, '10-retire');
    const apres = (await (await lea.page.request.get(`${base}/conceptions/${etoile.ficheId}`)).json()) as Any;
    assert.equal(apres.version, avant.version, 'la fiche garde son texte');
    await lea.page.goto(`/univers/${univers}/fiche/${etoile.ficheId}`);
    await lea.page.getByTestId('composant-caracteristiques').waitFor();
    await lea.ctx.close();

    const g = (await (await antor.page.request.get(`${base}/catalogue/gestion?nature=armes`)).json()) as Any;
    const lance = g.elements.find((e: Any) => e.cle === 'lance-d-essai');
    const m = await antor.page.request.put(`${base}/catalogue/armes/lance-d-essai/masque`, { data: { masque: true, version: lance.version } });
    assert.equal(m.status(), 200, await m.text());
    const l2 = await ouvre('Léa');
    const o = await fiche(l2.page, "Vent d'Orak");
    await l2.page.goto(`${outils}?fiche=${o.ficheId}`);
    await l2.page.getByRole('heading', { name: "Vent d'Orak" }).waitFor();
    await l2.page.getByText("Lance d'essai").first().waitFor();
    await l2.page.getByRole('button', { name: 'Ajouter : Armes' }).click();
    const sel = l2.page.getByRole('group', { name: /arme/i });
    await sel.getByRole('button', { name: /Ajouter Laser/ }).waitFor();
    assert.equal(await sel.getByText("Lance d'essai").count(), 0, 'masquée : plus proposée');
    // saving without alert: change the laser's quantity then back is not needed — add then remove a cannon
    await sel.getByRole('button', { name: /Canon léger/ }).click();
    await l2.page.getByRole('button', { name: /Augmenter la quantité : Canon léger|Retirer : Canon léger/ }).first().waitFor();
    await l2.page.waitForFunction(() => !(document.querySelector('main button.principal, button.principal') as Any)?.disabled);
    assert.equal(await l2.page.getByText(/Bloquante|BLOQUANTE/).count(), 0);
    await l2.page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await l2.page.getByText('Conception enregistrée.').waitFor();
    await hors(l2.page, '11-masquee');
    await l2.ctx.close();
    await antor.ctx.close();
  });

  it('deux onglets : le second enregistrement dit que la conception a changé, Recharger', async () => {
    const lea = await ouvre('Léa');
    const o = await fiche(lea.page, "Vent d'Orak");
    const p2 = await lea.ctx.newPage();
    for (const p of [lea.page, p2]) {
      await p.goto(`${outils}?fiche=${o.ficheId}`);
      await p.getByRole('heading', { name: "Vent d'Orak" }).waitFor();
    }
    const modif = async (p: Any) => {
      await p.getByRole('button', { name: /Retirer : Canon léger/ }).click();
      await p.waitForFunction(() => (document.querySelector('button.principal') as Any)?.getAttribute('aria-disabled') !== 'true', null, { timeout: 8000 }).catch(async () => { await hors(p, '12-debug'); throw new Error(await texte(p)); });
      await p.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    };
    await modif(lea.page);
    await lea.page.getByText('Conception enregistrée.').waitFor();
    await modif(p2);
    await p2.getByText('Cette conception a changé depuis que vous l’avez ouverte.').waitFor();
    await hors(p2, '12-conflit');
    await p2.getByRole('button', { name: 'Recharger' }).click();
    await p2.getByRole('heading', { name: "Vent d'Orak" }).waitFor();
    await p2.getByText('Cette conception a changé').waitFor({ state: 'detached' });
    await lea.ctx.close();
  });

  it('états : erreur de calcul, connexion perdue, listes vides, brouillon hors stockage', async () => {
    const { page, ctx } = await ouvre('Léa');
    const o = await fiche(page, "Vent d'Orak");
    await page.goto(`${outils}?fiche=${o.ficheId}`);
    await page.getByRole('heading', { name: "Vent d'Orak" }).waitFor();
    // calculation failure: last result kept, dimmed, « Réessayer »
    let casse = true;
    await page.route('**/vaisseaux/calcul**', (r: Any) => (casse ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : r.continue()));
    await page.getByRole('button', { name: /Retirer : Canon léger/ }).waitFor({ state: 'detached', timeout: 1000 }).catch(() => {});
    await page.getByRole('button', { name: /Retirer : Laser/ }).click();
    await page.getByText('Impossible de calculer ce vaisseau.').waitFor();
    assert.equal(await page.locator('[data-estompe]').count(), 1, 'dernier résultat estompé');
    assert.ok(/\d/.test(await page.locator('[data-estompe]').innerText()), 'dernier résultat conservé');
    assert.equal(await page.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), true);
    await hors(page, '14-erreur-calcul');
    casse = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await page.getByText('Impossible de calculer ce vaisseau.').waitFor({ state: 'detached' });
    // draft only in memory
    const stock = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    assert.ok(!/laser/i.test(stock), 'brouillon absent du stockage : ' + stock);
    // offline
    await ctx.setOffline(true);
    await page.getByRole('button', { name: /Retirer : Lance d'essai/ }).click().catch(() => {});
    await page.getByText('Connexion perdue.').first().waitFor();
    await page.getByText('Les choix sont verrouillés.').waitFor();
    for (const b of await page.getByRole('button', { name: /^Retirer : / }).all()) assert.equal(await b.isDisabled(), true, 'choix verrouillés');
    assert.equal(await page.getByRole('button', { name: /Ajouter : Armes/ }).count(), 0, 'plus d\'ajout hors ligne');
    await hors(page, '15-hors-ligne');
    await ctx.setOffline(false);
    await ctx.close();
  });

  it('liste vide (Antor et Léa), catalogue vide', async () => {
    const antor = await ouvre('Antor');
    const vide = { conceptions: [], peutCreer: true, fichesSansConception: [] };
    await antor.page.route('**/vaisseaux/conceptions?*', (r: Any) => r.request().method() === 'GET' ? r.fulfill({ json: vide }) : r.continue());
    await antor.page.route('**/vaisseaux/conceptions', (r: Any) => r.request().method() === 'GET' ? r.fulfill({ json: vide }) : r.continue());
    await antor.page.route('**/vaisseaux/catalogue**', (r: Any) => r.fulfill({ json: { elements: [], suivant: null } }));
    await antor.page.goto(outils);
    await antor.page.getByText('Aucune conception.').waitFor();
    await antor.page.getByText('Créez une fiche de vaisseau, puis ouvrez-la ici.').waitFor();
    await antor.page.getByText(/Le catalogue du système est vide/).waitFor();
    await hors(antor.page, '16-vide-antor');
    await antor.ctx.close();
    const lea = await ouvre('Léa');
    await lea.page.route('**/vaisseaux/conceptions', (r: Any) => r.request().method() === 'GET' ? r.fulfill({ json: { conceptions: [], peutCreer: false } }) : r.continue());
    await lea.page.goto(outils);
    await lea.page.getByText('Aucune conception.').waitFor();
    assert.equal(await lea.page.getByText('Créez une fiche de vaisseau').count(), 0);
    await lea.ctx.close();
  });

  it('outil désactivé : la fiche montre Caractéristiques en texte avec « Outil désactivé »', async () => {
    const antor = await ouvre('Antor');
    const systemes = (await (await antor.page.request.get(`/api/univers/${univers}`)).json()) as Any;
    const sysId = systemes.systemeId ?? systemes.systeme?.id ?? 3;
    const lea = await ouvre('Léa');
    const o = await fiche(lea.page, "Vent d'Orak");
    const r = await antor.page.request.put(`/api/systemes/${sysId}/outils/swn/vaisseaux/activation`, { data: { active: false } });
    assert.equal(r.status(), 204, await r.text());
    await lea.page.goto(`/univers/${univers}/fiche/${o.ficheId}`);
    await lea.page.getByText('Outil désactivé').waitFor();
    await lea.page.getByText('Caractéristiques').first().waitFor();
    assert.equal(await lea.page.getByTestId('composant-caracteristiques').count(), 0);
    assert.match(await texte(lea.page), /Prix/);
    await hors(lea.page, '17-desactive');
    await lea.ctx.close();
    await antor.ctx.close();
  });
});
