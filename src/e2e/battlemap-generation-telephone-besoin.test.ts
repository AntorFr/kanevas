// ecrans: battlemap-assets, outil
// E-27 « Génération » at 390 px (phone), written from docs/ecrans.md « E-27 — detail » (Phone / tablet, States) and the mockup
// docs/maquettes/e27-generation.html (phone frame: rows as cards, small thumbnail on the left, green « Brouillon prêt » pill,
// the three tabs whole, a line name of 19 characters not cut).
//
// TEST PLAN (every expected value is a literal from the mockup / the sheet)
//   onglets   : at 390 px « Assets », « Direction artistique », « Génération » are all inside the viewport, the page does not scroll sideways
//   prepare-nom    : prepared batch, « Console de commande » fully readable in its name field
//   prepare-rangee : prepared batch, name on its own line (mandate arbitration 12:08), category, footprint and « Retirer » below (wrapping allowed), inside the viewport, not overlapping
//   brouillon         : a draft row at 390 px: thumbnail (≤ 100 × 80 px, mockup 92 × 68) at the left of the name, name not cut, the three gestures inside the viewport
//   brouillon-pastille : pill « Brouillon prêt » green (mockup #3fc79a), not violet nor grey
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const ligne = (nom: string, extra: object = {}) => ({ nom, categorie: 'objet', largeur: 2, hauteur: 1, indice: '', ...extra });

describe('E-27 Génération au téléphone (390 px)', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let adresse = '';
  let api = '';
  const dossier = process.env.E27_CAPTURES ?? join(tmpdir(), 'e27-captures');

  before(async () => {
    mkdirSync(dossier, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', KANEVAS_SANS_SEMIS_BATTLEMAP: '1' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    const sid = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    for (const outil of ['assets', 'generation']) {
      for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: outil === 'assets' }]] as const) {
        const r = await antor.request.put(`/api/systemes/${sid}/outils/battlemap/${outil}/${c}`, { data: d });
        assert.ok(r.status() < 300, `${outil}/${c}: ${r.status()}`);
      }
    }
    adresse = `/univers/${u.id}/outils/battlemap/assets?onglet=generation`;
    api = `/api/univers/${u.id}/outils/battlemap/lots`;
    await antor.setViewportSize({ width: 390, height: 844 });
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const ouvrir = async () => {
    await antor.goto(adresse);
    await antor.getByRole('heading', { name: 'Lot', level: 2 }).waitFor();
    await attendre(antor);
  };
  const dansEcran = (b: Any, large = 390) => b && b.x >= 0 && b.x + b.width <= large + 0.5;

  it('onglets : les trois onglets sont entiers dans l’écran de 390 px, sans défilement latéral', async () => {
    await ouvrir();
    for (const nom of ['Assets', 'Direction artistique', 'Génération']) {
      const b = await antor.getByRole('tab', { name: nom }).boundingBox();
      assert.ok(dansEcran(b), `onglet « ${nom} » dans l’écran : ${JSON.stringify(b)}`);
    }
    const liste = await antor.getByRole('tablist').first().evaluate((e: Any) => e.scrollWidth - e.clientWidth);
    assert.ok(liste <= 0, `la barre d’onglets déborde de ${liste} px (onglet coupé ou à faire défiler)`);
    const barre = await antor.getByRole('tablist').first().boundingBox();
    const dernier = await antor.getByRole('tab', { name: 'Génération' }).boundingBox();
    assert.ok(dernier.x + dernier.width <= barre.x + barre.width + 1, `« Génération » dépasse la barre : ${JSON.stringify({ barre, dernier })}`);
    const dl = await antor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(dl <= 0, `défilement latéral de la page : ${dl} px`);
    await antor.screenshot({ path: join(dossier, 'onglets-390.png') });
  });

  const preparer = async () => {
    const r = await antor.request.put(api, { data: { lignes: [ligne('Console de commande', { indice: 'draps froissés' }), ligne('Sas', { categorie: 'decor', largeur: 2, hauteur: 2 })] } });
    assert.ok(r.status() < 300, `${r.status()}`);
    await ouvrir();
    const liste = antor.getByRole('region', { name: 'Liste' });
    const nom = liste.getByRole('textbox', { name: 'Nom de la ligne 1' });
    await nom.waitFor();
    assert.equal(await nom.inputValue(), 'Console de commande');
    return { liste, nom };
  };

  it('prepare-nom : dans un lot préparé, le nom « Console de commande » (19 caractères) se lit en entier dans son champ', async () => {
    const { nom } = await preparer();
    await antor.screenshot({ path: join(dossier, 'prepare-390.png') });
    const coupe = await nom.evaluate((e: Any) => e.scrollWidth - e.clientWidth);
    assert.ok(coupe <= 0, `le nom « Console de commande » est coupé de ${coupe} px dans son champ`);
  });

  it('prepare-rangee : dans un lot préparé, le nom a sa propre ligne, catégorie, empreinte et « Retirer » tiennent dessous dans l’écran, sans chevauchement', async () => {
    const { liste, nom } = await preparer();
    const boites = [
      await nom.boundingBox(),
      await liste.getByRole('combobox').first().boundingBox(),
      await liste.getByRole('spinbutton', { name: 'Largeur de la ligne 1' }).boundingBox(),
      await liste.getByRole('button', { name: 'Retirer la ligne Console de commande' }).boundingBox(),
    ];
    boites.forEach((b, i) => assert.ok(dansEcran(b), `contrôle ${i} de la ligne 1 dans l’écran : ${JSON.stringify(b)}`));
    const [n, c, l, x] = boites;
    for (const b of [c, l, x]) {
      assert.ok(b.y >= n.y + n.height - 1, `catégorie, empreinte et Retirer sous le nom : ${JSON.stringify(boites)}`);
    }
    const croise = (p: Any, q: Any) => p.x < q.x + q.width - 1 && q.x < p.x + p.width - 1 && p.y < q.y + q.height - 1 && q.y < p.y + p.height - 1;
    for (const [i, p] of [c, l, x].entries()) for (const q of [c, l, x].slice(i + 1)) assert.ok(!croise(p, q), `contrôles qui se chevauchent : ${JSON.stringify(boites)}`);
  });

  it('brouillon : vignette réduite à gauche du nom, nom entier, gestes dans l’écran', async () => {
    await antor.request.post(`${api}/lancer`, { data: {} });
    await ouvrir();
    const img = antor.getByAltText('Brouillon de Console de commande');
    await img.waitFor();
    const rangee = antor.getByRole('region', { name: 'Lot' }).locator('li', { has: img });
    const nom = rangee.getByText('Console de commande', { exact: true }).first();
    const bi = await img.boundingBox();
    const bn = await nom.boundingBox();
    assert.ok(bi.width <= 100 && bi.height <= 80, `vignette ${bi.width} × ${bi.height}, attendu au plus 100 × 80 (maquette 92 × 68)`);
    assert.ok(bi.x + bi.width <= bn.x + 1, `vignette à gauche du nom : image ${JSON.stringify(bi)}, nom ${JSON.stringify(bn)}`);
    const coupe = await nom.evaluate((e: Any) => e.scrollWidth - e.clientWidth);
    assert.ok(coupe <= 0, `le nom est coupé de ${coupe} px`);
    for (const g of ['Accepter', 'Régénérer…', 'Écarter']) {
      const b = await rangee.getByRole('button', { name: g }).boundingBox();
      assert.ok(dansEcran(b), `« ${g} » dans l’écran : ${JSON.stringify(b)}`);
    }
    await antor.screenshot({ path: join(dossier, 'brouillon-390.png') });
  });

  it('brouillon-pastille : la pastille « Brouillon prêt » est verte', async () => {
    await ouvrir();
    const img = antor.getByAltText('Brouillon de Console de commande');
    await img.waitFor();
    const rangee = antor.getByRole('region', { name: 'Lot' }).locator('li', { has: img });
    const pastille = rangee.getByText('Brouillon prêt', { exact: true });
    const [rouge, vert, bleu] = await pastille.evaluate((e: Any) => getComputedStyle(e).color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number));
    assert.ok(vert > rouge + 40 && vert > bleu + 20, `pastille « Brouillon prêt » de couleur rgb(${rouge}, ${vert}, ${bleu}), attendu un vert (maquette #3fc79a)`);
  });
});
