// ecrans: battlemap-assets, outil
// E-27 « Génération » at desktop width (1280 px), lot préparé: layout of the list pane, written from docs/ecrans.md
// « E-27 — detail » and the mockup docs/maquettes/e27-generation.html (frame « lot préparé »): each input line is ONE row
// (name, category, footprint, « Retirer »), the hint under it; « Ajouter une ligne », « Coller des lignes » on the left of the
// button row and « Lancer le lot (N) » at its right end.
//
// TEST PLAN (every expected value is a literal from the mockup)
//   rangee  : 2 prepared lines, 1280 px: name, category, width, height, « Retirer » of line 1 share one row (tops within 4 px),
//             in that left-to-right order, not overlapping, « Retirer » inside the list pane; line 2 sits under line 1
//   lancer  : « Lancer le lot (2) » is on the right of « Ajouter une ligne » and « Coller des lignes », on the same row,
//             and its right edge is within 40 px of the right edge of the list pane
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const ligne = (nom: string, extra: object = {}) => ({ nom, categorie: 'objet', largeur: 2, hauteur: 1, indice: '', ...extra });

describe('E-27 Génération au bureau (1280 px), lot préparé', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let liste: Any;
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
    const r = await antor.request.put(`/api/univers/${u.id}/outils/battlemap/lots`, {
      data: { lignes: [ligne('Console de commande', { indice: 'draps froissés' }), ligne('Sas', { categorie: 'decor', largeur: 2, hauteur: 2 })] },
    });
    assert.ok(r.status() < 300, `${r.status()}`);
    await antor.setViewportSize({ width: 1280, height: 800 });
    await antor.goto(`/univers/${u.id}/outils/battlemap/assets?onglet=generation`);
    await antor.getByRole('heading', { name: 'Lot', level: 2 }).waitFor();
    await attendre(antor);
    liste = antor.getByRole('region', { name: 'Liste' });
    await liste.getByRole('textbox', { name: 'Nom de la ligne 1' }).waitFor();
    await antor.screenshot({ path: join(dossier, 'prepare-bureau-1280.png') });
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  it('rangee : nom, catégorie, empreinte et « Retirer » d’une ligne tiennent sur une seule rangée, dans cet ordre', async () => {
    const haut = (b: Any) => b.y;
    const n1 = await liste.getByRole('textbox', { name: 'Nom de la ligne 1' }).boundingBox();
    const c1 = await liste.getByRole('combobox').first().boundingBox();
    const l1 = await liste.getByRole('spinbutton', { name: 'Largeur de la ligne 1' }).boundingBox();
    const h1 = await liste.getByRole('spinbutton', { name: 'Hauteur de la ligne 1' }).boundingBox();
    const x1 = await liste.getByRole('button', { name: 'Retirer la ligne Console de commande' }).boundingBox();
    const pane = await liste.boundingBox();
    const toutes = { n1, c1, l1, h1, x1 };
    for (const [k, b] of Object.entries({ c1, l1, h1, x1 })) {
      assert.ok(Math.abs(haut(b) - haut(n1)) <= 4, `${k} sur la rangée du nom : ${JSON.stringify(toutes)}`);
    }
    const ordre = [n1, c1, l1, h1, x1];
    for (let i = 0; i < ordre.length - 1; i++) {
      assert.ok(ordre[i].x + ordre[i].width <= ordre[i + 1].x + 1, `ordre/chevauchement entre contrôles ${i} et ${i + 1} : ${JSON.stringify(toutes)}`);
    }
    assert.ok(x1.x + x1.width <= pane.x + pane.width + 1, `« Retirer » dans le panneau : ${JSON.stringify({ x1, pane })}`);
    const n2 = await liste.getByRole('textbox', { name: 'Nom de la ligne 2' }).boundingBox();
    assert.ok(n2.y >= n1.y + n1.height - 1, `ligne 2 sous la ligne 1 : ${JSON.stringify({ n1, n2 })}`);
  });

  it('lancer : « Lancer le lot (2) » est à droite de « Ajouter une ligne » et « Coller des lignes », sur la même rangée', async () => {
    const a = await liste.getByRole('button', { name: 'Ajouter une ligne' }).boundingBox();
    const c = await liste.getByRole('button', { name: 'Coller des lignes' }).boundingBox();
    const l = await liste.getByRole('button', { name: 'Lancer le lot (2)' }).boundingBox();
    const pane = await liste.boundingBox();
    const m = (b: Any) => b.y + b.height / 2;
    assert.ok(Math.abs(m(l) - m(a)) <= 12 && Math.abs(m(l) - m(c)) <= 12, `même rangée : ${JSON.stringify({ a, c, l })}`);
    assert.ok(l.x >= a.x + a.width && l.x >= c.x + c.width, `Lancer à droite des deux autres : ${JSON.stringify({ a, c, l })}`);
    assert.ok(pane.x + pane.width - (l.x + l.width) <= 40, `Lancer au bord droit du panneau : ${JSON.stringify({ l, pane })}`);
  });
});
