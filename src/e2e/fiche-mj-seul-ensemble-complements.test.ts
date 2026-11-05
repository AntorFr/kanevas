// Complements of the independent black-box tests of `kanevas-fiche-mj-seul` (B-57), written from the need only
// (docs/parcours.md B-57, docs/ecrans.md E-8/E-9/E-17 « Visibility »): the badge where a sheet line is drawn outside
// the grid (E-17 search, « Relier » selector), its absence for a player and in player mode, the filter kept
// across « Charger la suite », the filter disabled under the connection-lost banner. Literal expectations.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, connecte, launch, rx, skipBrowser, startServer } from './harnais.test.ts';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

const PHRASE = "Aucune section n'est visible des joueurs.";
const pastilles = (page: Any): Any => page.getByLabel(rx(PHRASE));

interface Monde {
  base: string;
  antor: { ctx: Any; page: Any };
  lea: { ctx: Any; page: Any };
}
let partage: Promise<Monde> | null = null;
function monde(): Promise<Monde> {
  partage ??= (async () => {
    const s = await startServer();
    const browser = await launch();
    aFermer.push(async () => {
      await browser.close();
      s.stop();
    });
    return { base: s.base, antor: await connecte(browser, s.base, 'Antor'), lea: await connecte(browser, s.base, 'Léa') };
  })();
  return partage;
}

let compteur = 0;
async function univers(m: Monde): Promise<number> {
  const r = await m.antor.ctx.request.post('/api/univers', { data: { nom: `Complements ${++compteur}`, description: 'd' } });
  assert.equal(r.status(), 201);
  const id = (await r.json()).id as number;
  const a = await m.antor.ctx.request.post(`/api/univers/${id}/membres`, { data: { username: 'lea', role: 'joueur' } });
  assert.equal(a.status(), 201);
  return id;
}
async function fiche(m: Monde, u: number, titre: string, lue: boolean | null): Promise<number> {
  const r = await m.antor.ctx.request.post(`/api/univers/${u}/fiches`, { data: { type: 'personnage', titre, charge: { pj: false } } });
  assert.equal(r.status(), 201);
  const id = (await r.json()).id as number;
  if (lue !== null) {
    const s = await m.antor.ctx.request.post(`/api/univers/${u}/fiches/${id}/sections`, { data: { titre: 'Apparence', contenu: 'Texte.' } });
    const sid = (await s.json()).id as number;
    const p = await m.antor.ctx.request.patch(`/api/univers/${u}/fiches/${id}/sections/${sid}`, { data: { joueursLisent: lue } });
    assert.equal(p.status(), 200);
  }
  return id;
}

describe('B-57 écran : la pastille hors de la grille (navigateur)', { skip: skipBrowser }, () => {
  // Panne visée : la recherche E-17 ne marque pas les fiches réservées, ou les marque toutes / à un joueur.
  it('recherche_e17_le_mj_voit_la_pastille_sur_la_fiche_fermee_seule', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Zorbal fermé', false);
    await fiche(m, u, 'Zorbal ouvert', true);
    const page = m.antor.page;
    await page.goto(`/univers/${u}/recherche?q=Zorbal`);
    await page.getByRole('link', { name: /Zorbal fermé/ }).first().waitFor();
    await page.getByRole('link', { name: /Zorbal ouvert/ }).first().waitFor();
    assert.equal(await pastilles(page.locator('main')).count(), 1);
    assert.equal(await pastilles(page.locator('main').locator('li, article, a').filter({ hasText: 'Zorbal fermé' }).filter({ hasNot: page.getByText('Zorbal ouvert') })).count() > 0, true, 'la pastille est sur la ligne de la fiche fermée');
    await page.screenshot({ path: '/tmp/capt-mj-seul-e17.png' });
  });

  // Panne visée : le joueur reçoit la pastille (ou l'information) dans les résultats de recherche.
  it('recherche_e17_joueuse_ne_voit_aucune_pastille_et_pas_la_fiche_fermee', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Yorbal fermé', false);
    await fiche(m, u, 'Yorbal ouvert', true);
    const page = m.lea.page;
    await page.goto(`/univers/${u}/recherche?q=Yorbal`);
    await page.getByRole('link', { name: /Yorbal ouvert/ }).first().waitFor();
    assert.equal(await page.getByText('Yorbal fermé').count(), 0);
    assert.equal(await pastilles(page).count(), 0);
    assert.equal(await page.getByText('MJ seul', { exact: true }).count(), 0);
  });

  // Panne visée : le MJ en mode Joueur voit encore la pastille dans E-17.
  it('recherche_e17_mj_en_mode_joueur_ne_voit_ni_pastille_ni_fiche_fermee', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Xorbal fermé', false);
    await fiche(m, u, 'Xorbal ouvert', true);
    const page = m.antor.page;
    await page.goto(`/univers/${u}/recherche?q=Xorbal&mode=joueur`);
    await page.getByRole('link', { name: /Xorbal ouvert/ }).first().waitFor();
    assert.equal(await page.getByText('Xorbal fermé').count(), 0);
    assert.equal(await pastilles(page).count(), 0);
  });

  // Panne visée : le filtre est perdu au « Charger la suite », ou la page suivante mélange des fiches visibles.
  it('filtre_reservees_au_mj_tient_apres_charger_la_suite', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Aldric ouvert', true);
    for (let i = 0; i < 101; i++) {
      const r = await m.antor.ctx.request.post(`/api/univers/${u}/fiches`, { data: { type: 'personnage', titre: `Fermé ${String(i).padStart(3, '0')}`, charge: { pj: false } } });
      assert.equal(r.status(), 201);
    }
    const page = m.antor.page;
    await page.goto(`/univers/${u}/fiches/personnages?visibilite=mj`);
    await page.getByRole('button', { name: 'Charger la suite' }).waitFor();
    assert.equal(await page.getByText('Aldric ouvert').count(), 0);
    await page.getByRole('button', { name: 'Charger la suite' }).click();
    await page.getByRole('link', { name: /Fermé 100/ }).first().waitFor();
    assert.equal(await page.getByText('Aldric ouvert').count(), 0, 'la page suivante reste filtrée');
    assert.equal(await page.getByRole('link', { name: /^Fermé / }).count(), 101);
    assert.equal(await page.getByLabel('Visibilité').inputValue(), 'mj');
    assert.ok(/visibilite=mj/.test(page.url()));
  });

  // Panne visée : le filtre reste actif sous le bandeau de connexion perdue.
  it('filtre_visibilite_desactive_sous_le_bandeau_connexion_perdue', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Hors ligne', false);
    const page = m.antor.page;
    await page.goto(`/univers/${u}/fiches/personnages`);
    await page.getByLabel('Visibilité').waitFor();
    await page.getByRole('link', { name: /Hors ligne/ }).first().waitFor();
    assert.equal(await page.getByLabel('Visibilité').isDisabled(), false);
    await page.context().setOffline(true);
    try {
      await page.getByText(/Connexion perdue\./).first().waitFor({ timeout: 15000 });
      assert.equal(await page.getByLabel('Visibilité').isDisabled(), true);
      await page.screenshot({ path: '/tmp/capt-mj-seul-horsligne.png' });
    } finally {
      await page.context().setOffline(false);
    }
  });
});
