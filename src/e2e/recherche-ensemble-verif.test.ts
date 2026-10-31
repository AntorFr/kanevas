// Feature-level black-box tests of kanevas-import-recherche (E-17 search, aliases and labels of E-9,
// the import API's `alias`/`etiquettes`, the assistant's `chercher`), written from the feature's exit
// criterion, docs/parcours.md (B-37, B-38, B-52, P-12 step 4) and docs/ecrans.md (E-17, E-9).
// Real server in stub mode with the starting world (« Lame d'Ébène » id 1, « Essai Kanka » id 4) and a
// real Chromium. Every expected value is a literal taken from the docs, never read from the code.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  type Any,
  attendre,
  connecte,
  launch,
  rxExact,
  skipBrowser,
  startServer,
  type Server,
  texte,
} from './harnais.test.js';

const SHOTS = '/tmp/kanevas-recherche-ensemble-shots';
const LAME = 1;
const ESSAI = 4;
const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const AUCUNE = 'Aucune fiche ne correspond.';

let srv: Server;
let browser: Any;

/** Opens E-17 on the address and waits until the results (or the empty message) settled. */
async function recherche(page: Any, query: string, univers = LAME): Promise<void> {
  await page.goto(`/univers/${univers}/recherche${query}`);
  await page.getByRole('textbox').first().waitFor();
  await attendre(page);
  await page.waitForTimeout(700); // 300 ms debounce + request
  await attendre(page);
}
const principal = async (page: Any): Promise<string> => ((await page.locator('main').innerText()) as string).replace(/’/g, "'");
const pastille = (page: Any, nom: string) => page.getByRole('button', { name: nom, exact: true });

async function shot(page: Any, nom: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
}

describe('kanevas-import-recherche, E-17 en bouchon (B-37, B-52, P-12 étape 4)', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('lea_trouve_port_sel_par_son_alias_salport_tapé_dans_le_champ', async () => {
    // Fails if the alias is not indexed or the « alias : … » line is not shown.
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await page.goto(`/univers/${LAME}/recherche`);
    await page.getByRole('textbox').first().fill('salport');
    await page.getByRole('link', { name: /Port-Sel/ }).first().waitFor();
    const t = await principal(page);
    assert.match(t, /Port-Sel/);
    assert.match(t, /alias : Salport/);
    await shot(page, 'lea-salport');
    await ctx.close();
  });

  test('lea_ne_trouve_pas_sous_main_du_seul_bloc_mj', async () => {
    // Fails if the search reads the MJ block for a player.
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=sous-main');
    assert.match(await principal(page), new RegExp(AUCUNE));
    assert.doesNotMatch(await principal(page), /Port-Sel/);
    await ctx.close();
  });

  test('antor_trouve_sous_main_mais_pas_en_mode_joueur', async () => {
    // Fails if the MJ cannot search his blocks, or if player mode keeps them.
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await recherche(page, '?q=sous-main');
    assert.match(await principal(page), /Port-Sel/);
    await recherche(page, '?q=sous-main&mode=joueur');
    assert.match(await principal(page), new RegExp(AUCUNE));
    // Same through the gesture: the frame's switch, then the search box.
    await recherche(page, '?q=sous-main');
    await page.getByRole('radio', { name: 'Mode Joueur' }).click();
    await attendre(page);
    await page.waitForTimeout(700);
    assert.match(await principal(page), new RegExp(AUCUNE));
    assert.match(page.url(), /mode=joueur/);
    await shot(page, 'antor-mode-joueur-sous-main');
    await ctx.close();
  });

  test('lea_filtre_sur_etiquette_cote_des_brumes_et_ne_voit_que_ce_quelle_lit', async () => {
    // Fails if the label filter ignores the read filter (Cercle des Cendres is unreadable for Léa).
    const lea = await connecte(browser, srv.base, 'Léa');
    await recherche(lea.page, '');
    await pastille(lea.page, 'Côte des Brumes').click();
    await lea.page.getByRole('link', { name: /Port-Sel/ }).first().waitFor();
    await attendre(lea.page);
    const t = await principal(lea.page);
    assert.match(t, /Port-Sel/);
    assert.doesNotMatch(t, /Cercle des Cendres/);
    assert.match(lea.page.url(), /etiquette=/);
    await shot(lea.page, 'lea-etiquette');
    await lea.ctx.close();

    const antor = await connecte(browser, srv.base, 'Antor');
    await recherche(antor.page, '?etiquette=C%C3%B4te%20des%20Brumes');
    const ta = await principal(antor.page);
    assert.match(ta, /Port-Sel/);
    assert.match(ta, /Cercle des Cendres/);
    // Order: title, alphabetical (« Cercle » before « Port-Sel »).
    assert.ok(ta.indexOf('Cercle des Cendres') < ta.indexOf('Port-Sel'), ta);
    await antor.ctx.close();
  });

  test('lea_ne_trouve_jamais_la_fiche_illisible_cercle_des_cendres', async () => {
    // Fails if an unreadable title is a result.
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=cercle');
    assert.match(await principal(page), new RegExp(AUCUNE));
    await recherche(page, '?q=Cendres');
    assert.doesNotMatch(await principal(page), /Cercle des Cendres/);
    await ctx.close();
  });

  test('lea_cherche_taverne_trouve_le_sous_type_et_sous_lieux_seuls_des_lieux', async () => {
    // B-52: the sub-type « Taverne » of « Le Pendu Joyeux » is searched; the type pill narrows.
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=taverne');
    assert.match(await principal(page), /Le Pendu Joyeux/);
    await pastille(page, 'Lieux').click();
    await page.waitForTimeout(700);
    await attendre(page);
    assert.match(await principal(page), /Le Pendu Joyeux/);
    await pastille(page, 'Personnages').click();
    await page.waitForTimeout(700);
    await attendre(page);
    assert.match(await principal(page), new RegExp(AUCUNE));
    await shot(page, 'lea-taverne');
    await ctx.close();
  });

  test('chronique_est_un_resultat_du_savoir_lisible_sous_tous', async () => {
    // Savoir is active in the starting world: the pill exists and the sheet is found under « Tous ».
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=chronique');
    assert.match(await principal(page), /Chronique de l'Âge d'Ombre/);
    await ctx.close();
  });

  test('bords_saisie_vide_espaces_cent_et_cent_un_caracteres', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '');
    assert.match(await principal(page), /Cherchez un nom, un alias ou un mot\./);
    // Spaces only never leave: the starting state stays.
    await page.getByRole('textbox').first().fill('   ');
    await page.waitForTimeout(800);
    assert.match(await principal(page), /Cherchez un nom, un alias ou un mot\./);
    assert.doesNotMatch(await principal(page), new RegExp(AUCUNE));
    // 101 characters by address: refused with the doc's words.
    await recherche(page, `?q=${'a'.repeat(101)}`);
    assert.match(await principal(page), /Erreur : 100 caractères au plus\./);
    // 100 characters: accepted, simply no result.
    await recherche(page, `?q=${'a'.repeat(100)}`);
    assert.doesNotMatch(await principal(page), /Erreur : 100 caractères au plus\./);
    assert.match(await principal(page), new RegExp(AUCUNE));
    await shot(page, 'lea-101-caracteres');
    await ctx.close();
  });

  test('etiquette_inconnue_dans_ladresse_est_ignoree_sans_erreur', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=salport&etiquette=Inconnue');
    const t = await principal(page);
    assert.match(t, /Port-Sel/);
    assert.doesNotMatch(t, /n'a pas abouti|Erreur/);
    await ctx.close();
  });

  test('un_compte_sans_role_a_page_introuvable_sur_la_recherche', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Teo');
    await page.goto(`/univers/${LAME}/recherche?q=salport`);
    await attendre(page);
    assert.match(await texte(page), /Page introuvable\./);
    assert.doesNotMatch(await texte(page), /Port-Sel/);
    await ctx.close();
  });

  test('rechercher_est_la_premiere_entree_de_la_barre_et_la_touche_slash_ouvre_e17', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await page.goto(`/univers/${LAME}`);
    await attendre(page);
    const liens = await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link').allInnerTexts();
    assert.equal(liens[0].trim(), 'Rechercher');
    // « / » outside a field opens the search...
    await page.locator('body').press('/');
    await page.waitForURL(/\/univers\/1\/recherche/);
    // ...and inside the field it only types the character.
    const champ = page.getByRole('textbox').first();
    await champ.click();
    await champ.press('/');
    assert.equal(await champ.inputValue(), '/');
    await ctx.close();
  });

  test('assistant_de_lea_cherche_port_sel_par_son_alias_sans_rien_citer_du_bloc_mj', async () => {
    // AD-74 amended: `chercher` without a type goes through the all-types search (alias included).
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    const r = await page.request.post(`${srv.base}/api/univers/${LAME}/assistant/messages`, {
      data: { message: 'que sait-on de Salport ?', historique: [] },
    });
    assert.equal(r.status(), 200);
    const corps = await r.json();
    assert.match(corps.reponse, /Port-Sel/);
    assert.doesNotMatch(corps.reponse, /sous-main/);
    await ctx.close();
  });

  test('fiche_e9_montre_alias_et_etiquette_a_lea_et_letiquette_ouvre_e17_filtree', async () => {
    // B-38: whoever sees the sheet sees alias and labels; a touched label opens E-17 filtered; no editing box for a player.
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=salport');
    await page.getByRole('link', { name: /Port-Sel/ }).first().click();
    await page.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    await attendre(page);
    const t = await texte(page);
    assert.match(t, /Aussi appelée/);
    assert.match(t, /Salport/);
    assert.match(t, /Port-aux-Sels/);
    assert.equal(await page.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    assert.equal(await page.getByRole('menuitem', { name: 'Alias et étiquettes…' }).count(), 0);
    await shot(page, 'lea-fiche-port-sel');
    await page.locator('main').getByRole('link', { name: 'Côte des Brumes' }).first().click();
    await page.waitForURL(/\/recherche\?.*etiquette=/);
    await page.getByRole('link', { name: /Port-Sel/ }).first().waitFor();
    assert.doesNotMatch(await principal(page), /Cercle des Cendres/);
    await ctx.close();
  });

  test('antor_en_mode_joueur_na_pas_alias_et_etiquettes_dans_le_menu', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await recherche(page, '?q=salport');
    await page.getByRole('link', { name: /Port-Sel/ }).first().click();
    await page.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    await attendre(page);
    await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    assert.equal(await page.getByRole('menuitem', { name: 'Alias et étiquettes…' }).count(), 1);
    await page.keyboard.press('Escape');
    await page.getByRole('radio', { name: 'Mode Joueur' }).click();
    await attendre(page);
    assert.equal(await page.getByRole('menuitem', { name: 'Alias et étiquettes…' }).count(), 0);
    const ouvre = page.getByRole('button', { name: /^Autres actions sur/ });
    if ((await ouvre.count()) > 0) {
      await ouvre.first().click();
      assert.equal(await page.getByRole('menuitem', { name: 'Alias et étiquettes…' }).count(), 0);
    }
    await ctx.close();
  });
});

describe('kanevas-import-recherche, écriture des alias et étiquettes, types désactivés (B-38, B-42)', { skip: skipBrowser }, () => {
  let s2: Server;
  before(async () => {
    s2 = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    s2?.stop();
  });

  async function ouvrirBoite(page: Any): Promise<void> {
    await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await page.getByRole('menuitem', { name: 'Alias et étiquettes…' }).click();
    await page.getByRole('dialog').waitFor();
  }
  async function ajoute(page: Any, champ: string, v: string): Promise<void> {
    const c = page.getByRole('dialog').getByLabel(champ, { exact: true });
    await c.fill(v);
    await c.press('Enter');
  }
  async function versFiche(page: Any, base: string, titre: string): Promise<void> {
    await page.goto(`${base}/univers/${LAME}/recherche?q=${encodeURIComponent(titre)}`);
    await page.getByRole('link', { name: new RegExp(titre) }).first().click();
    await page.getByRole('heading', { level: 1, name: titre }).waitFor();
    await attendre(page);
  }

  test('savoir_desactive_la_fiche_savoir_lisible_reste_un_resultat_sous_tous_sans_pastille', async () => {
    // Fails if a disabled type hides its sheets from the search or keeps its pill.
    const antor = await connecte(browser, s2.base, 'Antor');
    await antor.page.goto(`${s2.base}/univers/${LAME}/parametres`);
    await attendre(antor.page);
    const groupe = antor.page.locator('[role="radiogroup"][aria-labelledby="type-nom-savoir"]');
    await groupe.getByRole('radio', { name: 'Désactivé' }).click();
    // A type that has sheets asks for confirmation (E-14).
    await antor.page.getByRole('alertdialog').getByRole('button', { name: rxExact('Désactiver') }).click();
    await antor.page.waitForTimeout(800);
    await attendre(antor.page);
    assert.equal(await groupe.getByRole('radio', { name: 'Désactivé' }).getAttribute('aria-checked'), 'true');
    await antor.ctx.close();

    const lea = await connecte(browser, s2.base, 'Léa');
    await lea.page.goto(`${s2.base}/univers/${LAME}/recherche?q=chronique`);
    await lea.page.getByRole('link', { name: /Chronique de l'Âge d'Ombre/ }).first().waitFor();
    await attendre(lea.page);
    assert.equal(await pastille(lea.page, 'Savoirs').count(), 0);
    assert.equal(await pastille(lea.page, 'Savoir').count(), 0);
    assert.equal(await pastille(lea.page, 'Tous').count(), 1);
    assert.equal(await pastille(lea.page, 'Lieux').count(), 1);
    await shot(lea.page, 'lea-savoir-desactive');
    await lea.ctx.close();
  });

  test('antor_pose_alias_et_etiquette_lea_les_trouve_et_letiquette_dune_fiche_cachee_nest_pas_proposee', async () => {
    const antor = await connecte(browser, s2.base, 'Antor');
    const p = antor.page;
    await versFiche(p, s2.base, 'Port-Sel');
    await ouvrirBoite(p);
    await ajoute(p, 'Alias', 'Sel-sur-Mer');
    await ajoute(p, 'Alias', 'sel-sur-mer'); // duplicate without regard to case: ignored
    await ajoute(p, 'Étiquettes', 'Port franc');
    const alias = p.getByRole('dialog').getByRole('list', { name: 'Alias saisis' }).getByRole('listitem');
    assert.equal(await alias.count(), 3); // Port-aux-Sels, Salport, Sel-sur-Mer (once)
    await p.getByRole('dialog').getByRole('button', { name: rxExact('Enregistrer') }).click();
    await p.getByText('Alias et étiquettes enregistrés.').first().waitFor();
    await attendre(p);
    assert.match(await texte(p), /Sel-sur-Mer/);
    assert.match(await texte(p), /Port franc/);

    // The MJ labels the unreadable « Cercle des Cendres » with a label no readable sheet carries.
    await versFiche(p, s2.base, 'Cercle des Cendres');
    await ouvrirBoite(p);
    await ajoute(p, 'Étiquettes', 'Réservé aux ombres');
    await p.getByRole('dialog').getByRole('button', { name: rxExact('Enregistrer') }).click();
    await p.getByText('Alias et étiquettes enregistrés.').first().waitFor();
    await attendre(p);
    await recherche(p, '?etiquette=R%C3%A9serv%C3%A9%20aux%20ombres');
    assert.match(await principal(p), /Cercle des Cendres/); // Antor reads it
    await antor.ctx.close();

    const lea = await connecte(browser, s2.base, 'Léa');
    await lea.page.goto(`${s2.base}/univers/${LAME}/recherche?q=sel-sur-mer`);
    await lea.page.getByRole('link', { name: /Port-Sel/ }).first().waitFor();
    assert.match(await principal(lea.page), /alias : Sel-sur-Mer/);
    await recherche(lea.page, '');
    assert.equal(await pastille(lea.page, 'Port franc').count(), 1);
    assert.equal(await pastille(lea.page, 'Réservé aux ombres').count(), 0);
    // By address the unknown-to-her label is ignored and shows nothing hidden.
    await lea.page.goto(`${s2.base}/univers/${LAME}/recherche?etiquette=R%C3%A9serv%C3%A9%20aux%20ombres`);
    await attendre(lea.page);
    await lea.page.waitForTimeout(700);
    assert.doesNotMatch(await principal(lea.page), /Cercle des Cendres/);
    await lea.ctx.close();
  });

  test('boite_alias_refuse_vingt_et_un_alias_et_cent_vingt_et_un_caracteres_et_retirer_efface_la_pastille', async () => {
    const antor = await connecte(browser, s2.base, 'Antor');
    const p = antor.page;
    await versFiche(p, s2.base, 'Maître Aldric');
    await ouvrirBoite(p);
    await ajoute(p, 'Alias', 'x'.repeat(121));
    // The local refusal appears at Entrée; wait for it before saving, which may close the dialog and erase it.
    await p.getByText('Erreur : 120 caractères au plus.').first().waitFor();
    await p.getByRole('dialog').getByRole('button', { name: rxExact('Enregistrer') }).click();
    await p.keyboard.press('Escape');
    await p.getByRole('dialog').waitFor({ state: 'detached' });

    await ouvrirBoite(p);
    for (let i = 1; i <= 21; i++) await ajoute(p, 'Alias', `alias numéro ${i}`);
    await p.getByText('Erreur : 20 alias au plus.').first().waitFor();
    assert.equal(await p.getByRole('dialog').getByRole('list', { name: 'Alias saisis' }).getByRole('listitem').count(), 20);
    await shot(p, 'antor-21-alias');
    await p.keyboard.press('Escape');
    await p.getByRole('dialog').waitFor({ state: 'detached' });

    // Nothing was written: the sheet shows no alias.
    await attendre(p);
    assert.doesNotMatch(await texte(p), /Aussi appelée/);

    // Removing the only carrier of a label removes the label from the proposed ones.
    await versFiche(p, s2.base, 'Port-Sel');
    await ouvrirBoite(p);
    await p.getByRole('dialog').getByRole('button', { name: 'Retirer « Port franc »' }).click();
    await p.getByRole('dialog').getByRole('button', { name: rxExact('Enregistrer') }).click();
    await p.getByText('Alias et étiquettes enregistrés.').first().waitFor();
    await recherche(p, '');
    assert.equal(await pastille(p, 'Port franc').count(), 0);
    await antor.ctx.close();
  });
});

describe('kanevas-import-recherche, import API : alias et étiquettes (B-38, B-48)', { skip: skipBrowser }, () => {
  let s3: Server;
  const B = () => `${s3.base}/api/import/v1/univers/${ESSAI}`;
  const entetes = { Authorization: `Bearer ${JETON}`, 'content-type': 'application/json' };
  const corps = (extra: Record<string, unknown> = {}) => ({
    type: 'lieu',
    titre: 'Port-Sel',
    sections: [{ cle: 'desc', titre: 'Description', contenu: 'Un port de sel.', joueursLisent: true }],
    ...extra,
  });
  async function put(cle: string, data: Record<string, unknown>): Promise<Any> {
    const r = await fetch(`${B()}/fiches/${cle}`, { method: 'PUT', headers: entetes, body: JSON.stringify(data) });
    return { status: r.status, json: await r.json() };
  }

  before(async () => {
    s3 = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    s3?.stop();
  });

  test('import_de_port_sel_avec_alias_et_etiquettes_rejoue_rend_inchangee_et_lea_le_trouve_par_alias', async () => {
    // Fails if alias/etiquettes are not written, or if the replay (order and case aside) is not « inchangee ».
    const donnees = { alias: ['Salport', 'Port-aux-Sels'], etiquettes: ['Côte des Brumes'] };
    const un = await put('lieu:importe-sel', corps({ titre: 'Sel-Importé', ...donnees }));
    assert.equal(un.status, 200);
    assert.equal(un.json.etat, 'creee');
    const deux = await put('lieu:importe-sel', corps({ titre: 'Sel-Importé', ...donnees }));
    assert.equal(deux.json.etat, 'inchangee');
    const trois = await put(
      'lieu:importe-sel',
      corps({ titre: 'Sel-Importé', alias: ['port-aux-sels', 'SALPORT'], etiquettes: ['côte des brumes'] }),
    );
    assert.equal(trois.json.etat, 'inchangee');

    const lea = await connecte(browser, s3.base, 'Léa');
    await recherche(lea.page, '?q=port-aux-sels', ESSAI);
    const t = await principal(lea.page);
    assert.match(t, /Sel-Importé/);
    assert.match(t, /alias : Port-aux-Sels/);
    await shot(lea.page, 'lea-essai-kanka-alias-importe');
    await recherche(lea.page, '', ESSAI);
    assert.equal(await pastille(lea.page, 'Côte des Brumes').count(), 1);
    await lea.ctx.close();
  });

  test('un_alias_de_121_caracteres_ne_refuse_pas_la_fiche_et_avertit', async () => {
    const r = await put('lieu:alias-trop-long', corps({ titre: 'Alias-Long', alias: ['x'.repeat(121)] }));
    assert.equal(r.status, 200);
    assert.equal(r.json.etat, 'creee');
    assert.ok(Array.isArray(r.json.avertissements) && r.json.avertissements.length >= 1, JSON.stringify(r.json));
  });

  test('un_ensemble_modifie_dans_kanevas_nest_pas_ecrase_par_le_rejeu_et_est_signale', async () => {
    const un = await put('lieu:modifie-ailleurs', corps({ titre: 'Modifié-Ailleurs', alias: ['Premier'] }));
    assert.equal(un.json.etat, 'creee');
    // The MJ edits the alias set in Kanevas (the UI route's contract: the whole sets in one body).
    const antor = await connecte(browser, s3.base, 'Antor');
    const fid = un.json.id;
    const w = await antor.page.request.put(`${s3.base}/api/univers/${ESSAI}/fiches/${fid}/etiquetage`, {
      data: { alias: ['Premier', 'Ajouté dans Kanevas'], etiquettes: [] },
    });
    assert.equal(w.status(), 200);
    const ouvert = await fetch(`${B()}/lots`, { method: 'POST', headers: entetes });
    const { lotId } = (await ouvert.json()) as { lotId: string };
    const deux = await put(`lieu:modifie-ailleurs?lot=${lotId}`, corps({ titre: 'Modifié-Ailleurs', alias: ['Premier'] }));
    assert.equal(deux.status, 200);
    const lot = await (await fetch(`${B()}/lots/${lotId}`, { headers: entetes })).text();
    assert.match(lot, /alias modifiés dans Kanevas/, lot);
    await recherche(antor.page, '?q=Ajouté dans Kanevas', ESSAI);
    assert.match(await principal(antor.page), /Modifié-Ailleurs/);
    await antor.ctx.close();
  });
});
