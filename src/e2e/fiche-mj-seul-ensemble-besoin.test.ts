// ecrans: fiche, fiches
// Independent black-box tests of the assembled feature `kanevas-fiche-mj-seul` (B-57), written from the need only
// (docs/parcours.md B-57 and P-3 step 4, docs/ecrans.md E-8/E-9 « Visibility », docs/donnees.md rule 11).
// Real server in stub mode (API part: real HTTP; screen part: real Chromium). Expected values are literals
// taken from the need, never read back from the product.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, connecte, launch, regler, rx, section, skipBrowser, startServer } from './harnais.test.ts';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

const PHRASE = "Aucune section n'est visible des joueurs.";

interface Monde {
  base: string;
  browser: Any;
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
    const antor = await connecte(browser, s.base, 'Antor');
    const lea = await connecte(browser, s.base, 'Léa');
    return { base: s.base, browser, antor, lea };
  })();
  return partage;
}

let compteur = 0;
/** A fresh universe where Antor is GM and Léa a player: tests do not share data. */
async function univers(m: Monde): Promise<number> {
  const r = await m.antor.ctx.request.post('/api/univers', { data: { nom: `Lame d'Ébène ${++compteur}`, description: 'd' } });
  assert.equal(r.status(), 201);
  const id = (await r.json()).id as number;
  const a = await m.antor.ctx.request.post(`/api/univers/${id}/membres`, { data: { username: 'lea', role: 'joueur' } });
  assert.equal(a.status(), 201);
  return id;
}

/** A personnage with the given sections: `[titre, lueDesJoueurs]`. Returns its id. */
async function fiche(m: Monde, u: number, titre: string, sections: Array<[string, boolean]>): Promise<number> {
  const r = await m.antor.ctx.request.post(`/api/univers/${u}/fiches`, { data: { type: 'personnage', titre, charge: { pj: false } } });
  assert.equal(r.status(), 201);
  const id = (await r.json()).id as number;
  for (const [t, lue] of sections) {
    const s = await m.antor.ctx.request.post(`/api/univers/${u}/fiches/${id}/sections`, { data: { titre: t, contenu: 'Texte.' } });
    assert.equal(s.status(), 201);
    const sid = (await s.json()).id as number;
    const p = await m.antor.ctx.request.patch(`/api/univers/${u}/fiches/${id}/sections/${sid}`, { data: { joueursLisent: lue } });
    assert.equal(p.status(), 200);
  }
  return id;
}

/** The standard world of the criteria: Aldric (Apparence read by players) and the Prieur (Secret only for the GM). */
async function dePlus(m: Monde) {
  const u = await univers(m);
  const aldric = await fiche(m, u, 'Maître Aldric', [['Apparence', true], ['Vérité — MJ seul', false]]);
  const prieur = await fiche(m, u, 'Le Prieur masqué', [['Secret — MJ seul', false]]);
  return { u, aldric, prieur };
}

async function ouvrirListe(page: Any, u: number, query = ''): Promise<void> {
  await page.goto(`/univers/${u}/fiches/personnages${query}`);
  await page.getByRole('heading', { name: 'Personnages', level: 1 }).waitFor();
  await page.getByText('Chargement des fiches…').waitFor({ state: 'detached' });
}
const carte = (page: Any, titre: string): Any => page.getByRole('link', { name: rx(titre) }).first();
const pastilles = (page: Any): Any => page.getByLabel(rx(PHRASE));

describe('B-57 écran : pastille « MJ seul » et filtre « Visibilité » (navigateur)', { skip: skipBrowser }, () => {
  // Panne visée : la carte du Prieur ne porte pas la pastille, ou celle d'Aldric la porte.
  it('le_mj_voit_la_pastille_sur_la_carte_du_seul_prieur', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.antor.page;
    await ouvrirListe(page, u);
    await carte(page, 'Le Prieur masqué').waitFor();
    assert.equal(await pastilles(page).count(), 1, 'une seule pastille dans la grille');
    const cartePrieur = page.getByRole('link', { name: rx('Le Prieur masqué') }).first().locator('xpath=ancestor-or-self::*[contains(., "MJ seul")][1]');
    assert.match(await cartePrieur.innerText(), /Le Prieur masqué/);
    assert.ok(!/Maître Aldric/.test(await cartePrieur.innerText()), 'la pastille est dans la carte du Prieur seule');
    assert.equal(await page.getByText('MJ seul', { exact: true }).count(), 1);
    await page.screenshot({ path: '/tmp/capt-mj-seul-grille.png' });
  });

  // Panne visée : le filtre « Réservées au MJ » liste Aldric, ou ne liste pas le Prieur ; l'adresse ne garde pas le filtre.
  it('filtre_reservees_au_mj_liste_le_prieur_seul_et_se_garde_dans_l_adresse', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.antor.page;
    await ouvrirListe(page, u);
    await carte(page, 'Le Prieur masqué').waitFor();
    const rep = page.waitForResponse((r: Any) => /visibilite=mj/.test(r.url()) && r.status() === 200);
    await page.getByLabel('Visibilité').selectOption({ label: 'Réservées au MJ' });
    await rep;
    await page.getByText('Maître Aldric').waitFor({ state: 'detached' });
    assert.equal(await carte(page, 'Le Prieur masqué').count(), 1);
    assert.match(page.url(), /visibilite=mj/);
    await page.reload();
    await carte(page, 'Le Prieur masqué').waitFor();
    assert.equal(await page.getByText('Maître Aldric').count(), 0, 'le filtre survit au rechargement');
    assert.equal(await page.getByLabel('Visibilité').inputValue(), 'mj');
    await page.screenshot({ path: '/tmp/capt-mj-seul-filtre.png' });
  });

  // Panne visée : « Visibles des joueurs » liste le Prieur.
  it('filtre_visibles_des_joueurs_liste_aldric_seul_sans_pastille', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.antor.page;
    await ouvrirListe(page, u, '?visibilite=joueurs');
    await carte(page, 'Maître Aldric').waitFor();
    assert.equal(await page.getByText('Le Prieur masqué').count(), 0);
    assert.equal(await pastilles(page).count(), 0);
  });

  // Panne visée : une valeur inconnue de l'adresse filtre quand même, ou part à l'API.
  it('valeur_inconnue_dans_l_adresse_est_ignoree_et_rien_n_est_envoye', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.antor.page;
    const vues: string[] = [];
    page.on('request', (r: Any) => vues.push(r.url().replace(/^https?:\/\/[^/]+/, '')));
    await ouvrirListe(page, u, '?visibilite=bidule');
    await carte(page, 'Maître Aldric').waitFor();
    await carte(page, 'Le Prieur masqué').waitFor();
    assert.equal(await page.getByLabel('Visibilité').inputValue(), '');
    assert.deepEqual(vues.filter((x) => x.startsWith('/api/') && /visibilite=/.test(x)), []);
  });

  // Panne visée : le bouton « Voir toutes les fiches » ne remet pas la liste, ou le texte de l'état vide est autre.
  it('filtre_sans_fiche_dit_aucune_fiche_reservee_au_mj_et_voir_toutes_remet_la_liste', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Maître Aldric', [['Apparence', true]]);
    const page = m.antor.page;
    await ouvrirListe(page, u, '?visibilite=mj');
    await page.getByText('Aucune fiche réservée au MJ.').waitFor();
    await page.screenshot({ path: '/tmp/capt-mj-seul-vide.png' });
    await page.getByRole('button', { name: 'Voir toutes les fiches' }).or(page.getByRole('link', { name: 'Voir toutes les fiches' })).first().click();
    await carte(page, 'Maître Aldric').waitFor();
    assert.equal(await page.getByLabel('Visibilité').inputValue(), '');
  });

  it('filtre_joueurs_sans_fiche_dit_aucune_fiche_visible_des_joueurs', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Le Prieur masqué', [['Secret — MJ seul', false]]);
    const page = m.antor.page;
    await ouvrirListe(page, u, '?visibilite=joueurs');
    await page.getByText('Aucune fiche visible des joueurs.').waitFor();
  });

  // Panne visée : la recherche ignore le filtre (ou l'inverse) ; le texte combiné est faux.
  it('recherche_et_filtre_vides_disent_aucune_fiche_pour_ces_filtres', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.antor.page;
    await ouvrirListe(page, u, '?visibilite=joueurs');
    await carte(page, 'Maître Aldric').waitFor();
    const rep = page.waitForResponse((r: Any) => /q=Prieur/.test(r.url()) && r.status() === 200);
    await page.getByLabel('Chercher dans les personnages').fill('Prieur');
    await page.getByRole('button', { name: 'Chercher', exact: true }).click();
    await rep;
    await page.getByText('Aucune fiche pour ces filtres.').waitFor();
    await page.getByRole('button', { name: 'Voir toutes les fiches' }).or(page.getByRole('link', { name: 'Voir toutes les fiches' })).first().click();
    await carte(page, 'Le Prieur masqué').waitFor();
    await carte(page, 'Maître Aldric').waitFor();
  });

  // Panne visée : la pastille manque sur la ligne de l'arbre.
  it('la_ligne_d_arbre_du_prieur_porte_la_pastille', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.antor.page;
    await ouvrirListe(page, u);
    await page.getByRole('button', { name: 'Arbre' }).click();
    await page.getByText('Le Prieur masqué').first().waitFor();
    assert.equal(await pastilles(page).count(), 1);
    assert.equal(await page.getByText('MJ seul', { exact: true }).count(), 1);
    await page.screenshot({ path: '/tmp/capt-mj-seul-arbre.png' });
  });

  // Panne visée : l'en-tête de la fiche ne porte pas la pastille ; elle ne part pas à l'enregistrement ; rechargement requis.
  it('pastille_d_entete_disparait_sans_recharger_quand_la_section_s_ouvre_aux_joueurs_puis_la_carte_n_en_porte_plus', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.antor.page;
    await ouvrirListe(page, u);
    await carte(page, 'Le Prieur masqué').click();
    await page.getByRole('heading', { name: 'Le Prieur masqué', level: 1 }).waitFor();
    await page.getByRole('region', { name: rx('Secret — MJ seul') }).waitFor();
    assert.equal(await pastilles(page).count(), 1, "la pastille de l'en-tête");
    await page.screenshot({ path: '/tmp/capt-mj-seul-entete.png' });
    await page.evaluate(() => ((window as Any).__marque = 'pas rechargé'));
    await regler(page, 'Secret — MJ seul', 'Les joueurs la lisent', true);
    await pastilles(page).first().waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => (window as Any).__marque), 'pas rechargé', 'sans recharger la page');
    await ouvrirListe(page, u);
    await carte(page, 'Le Prieur masqué').waitFor();
    assert.equal(await pastilles(page).count(), 0, 'la carte ne porte plus la pastille');
    // and the section closed again brings the badge back at the header
    await carte(page, 'Le Prieur masqué').click();
    await page.getByRole('region', { name: rx('Secret — MJ seul') }).waitFor();
    await regler(page, 'Secret — MJ seul', 'Les joueurs la lisent', false);
    await pastilles(page).first().waitFor();
  });

  // Panne visée : la phrase n'est pas écrite sous la ligne d'en-tête quand la pastille prend le focus.
  it('focus_sur_la_pastille_d_entete_ecrit_la_phrase_sous_l_entete', async () => {
    const m = await monde();
    const { u, prieur } = await dePlus(m);
    const page = m.antor.page;
    await page.goto(`/univers/${u}/fiche/${prieur}`);
    await page.getByRole('region', { name: rx('Secret — MJ seul') }).waitFor();
    assert.equal(await page.getByText(PHRASE, { exact: true }).count(), 0, 'la phrase est cachée tant que rien ne la demande');
    await pastilles(page).first().focus();
    await page.getByText(PHRASE, { exact: true }).first().waitFor();
  });

  // Panne visée : la phrase écrite au focus décale la page et fait perdre le clic suivant (le focus part au mousedown).
  it('apres_le_focus_sur_la_pastille_le_clic_sur_une_section_aboutit_quand_meme', async () => {
    const m = await monde();
    const { u, prieur } = await dePlus(m);
    const page = m.antor.page;
    page.setDefaultTimeout(8000);
    await page.goto(`/univers/${u}/fiche/${prieur}`);
    await page.getByRole('region', { name: rx('Secret — MJ seul') }).waitFor();
    await pastilles(page).first().focus();
    await page.getByText(PHRASE, { exact: true }).first().waitFor();
    await section(page, 'Secret — MJ seul').getByRole('button', { name: /régler l['’]audience de/ }).click();
    await page.getByRole('dialog', { name: /^Qui voit/ }).waitFor();
    page.setDefaultTimeout(30000);
  });

  // Panne visée : une fiche sans section n'a pas la pastille d'en-tête.
  it('fiche_sans_section_porte_la_pastille_d_entete', async () => {
    const m = await monde();
    const u = await univers(m);
    const id = await fiche(m, u, 'Fiche vide', []);
    const page = m.antor.page;
    await page.goto(`/univers/${u}/fiche/${id}`);
    await page.getByRole('heading', { name: 'Fiche vide', level: 1 }).waitFor();
    await pastilles(page).first().waitFor();
  });

  // Panne visée : un titre de 120 caractères est tronqué à cause de la pastille.
  it('titre_de_120_caracteres_n_est_pas_tronque_par_la_pastille', async () => {
    const m = await monde();
    const u = await univers(m);
    const titre = 'Seigneur-' + 'Très-'.repeat(20) + 'Long-Nom'.padEnd(120 - 9 - 100, 'x');
    assert.equal(titre.length, 120);
    const id = await fiche(m, u, titre, [['Secret', false]]);
    const page = m.antor.page;
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/univers/${u}/fiche/${id}`);
    const h1 = page.getByRole('heading', { level: 1 });
    await h1.waitFor();
    assert.equal(await h1.innerText(), titre);
    const { depasse } = await h1.evaluate((n: Element) => ({ depasse: n.scrollWidth > n.clientWidth + 1 }));
    assert.equal(depasse, false, 'le titre ne déborde pas de son bloc');
    await page.screenshot({ path: '/tmp/capt-mj-seul-titre-long.png' });
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  // Panne visée : le joueur voit la pastille ou le filtre, ou l'adresse ?visibilite=mj filtre pour lui.
  it('joueur_ne_voit_ni_pastille_ni_filtre_et_l_adresse_ne_change_pas_sa_liste', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.lea.page;
    const vues: string[] = [];
    page.on('request', (r: Any) => vues.push(r.url().replace(/^https?:\/\/[^/]+/, '')));
    await ouvrirListe(page, u, '?visibilite=mj');
    await carte(page, 'Maître Aldric').waitFor();
    assert.equal(await page.getByText('Le Prieur masqué').count(), 0);
    assert.equal(await pastilles(page).count(), 0);
    assert.equal(await page.getByText('MJ seul').count(), 0);
    assert.equal(await page.getByLabel('Visibilité').count(), 0);
    assert.deepEqual(vues.filter((x) => x.startsWith('/api/') && /visibilite=/.test(x)), [], 'aucune requête ne porte visibilite');
    await page.screenshot({ path: '/tmp/capt-mj-seul-joueur.png' });
    // header of a sheet she reads
    await carte(page, 'Maître Aldric').click();
    await page.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
    assert.equal(await pastilles(page).count(), 0);
  });

  // Panne visée : en mode Joueur le MJ garde la pastille/le filtre ; le retour en mode MJ garde le filtre.
  it('mj_en_mode_joueur_perd_pastille_et_filtre_puis_les_retrouve_toutes_les_fiches', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const page = m.antor.page;
    await ouvrirListe(page, u, '?visibilite=mj');
    await carte(page, 'Le Prieur masqué').waitFor();
    const vues: string[] = [];
    page.on('request', (r: Any) => vues.push(r.url().replace(/^https?:\/\/[^/]+/, '')));
    await page.getByRole('radio', { name: 'Mode Joueur' }).first().click();
    await page.getByLabel('Visibilité').waitFor({ state: 'detached' });
    await carte(page, 'Maître Aldric').waitFor();
    assert.equal(await page.getByText('Le Prieur masqué').count(), 0, 'le MJ en mode Joueur lit comme un joueur');
    assert.equal(await pastilles(page).count(), 0);
    assert.ok(!/visibilite=/.test(page.url()), "le paramètre est retiré de l'adresse");
    await page.screenshot({ path: '/tmp/capt-mj-seul-mode-joueur.png' });
    await page.getByRole('radio', { name: 'Mode MJ' }).first().click();
    await page.getByLabel('Visibilité').waitFor();
    assert.equal(await page.getByLabel('Visibilité').inputValue(), '', 'retour en mode MJ : « Toutes »');
    await carte(page, 'Le Prieur masqué').waitFor();
  });
});
