// Black-box tests of kanevas-assistant-membre written from the need (docs/parcours.md B-26, B-27,
// B-29 ; docs/ecrans.md "Détail des écrans de kanevas-assistant-membre", E-12), not from the code.
// Expected values are literals taken from those docs. Real server in stub mode (AD-55, assistant
// script AD-78) + real Chromium. The world is arranged through the API; what is checked is read
// on screen as the user sees it.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;

interface Monde {
  U: number;
  antor: Any;
  lea: Any;
  teo: Any;
  aldric: number;
  apparence: number;
  verite: number;
  notes: number;
}

async function api(page: Any, method: string, url: string, data?: unknown, ok = true): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  if (ok) assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r;
}
const json = async (page: Any, method: string, url: string, data?: unknown): Promise<Any> =>
  (await api(page, method, url, data)).json();

/**
 * Antor (MJ) and Léa (Joueuse) in a fresh universe, Teo outside it. "Maître Aldric": "Apparence"
 * read by the players, "Vérité — MJ seul" closed. "Notes de la table": read by the players but
 * written by nobody but the GM.
 */
async function monde(nom: string): Promise<Monde> {
  const antor = (await connecte(browser, srv.base, 'Antor')).page;
  const lea = (await connecte(browser, srv.base, 'Léa')).page;
  const teo = (await connecte(browser, srv.base, 'Teo')).page;
  const U = (await json(antor, 'POST', '/api/univers', { nom })).id;
  await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
  const aldric = (
    await json(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })
  ).id;
  const base = `/api/univers/${U}/fiches/${aldric}/sections`;
  const apparence = (await json(antor, 'POST', base, { titre: 'Apparence', contenu: 'Grand, cape grise, regard dur.' })).id;
  await api(antor, 'PATCH', `${base}/${apparence}`, { joueursLisent: true });
  const verite = (await json(antor, 'POST', base, { titre: 'Vérité — MJ seul', contenu: 'Il trahit le Cercle.' })).id;
  const notes = (await json(antor, 'POST', base, { titre: 'Notes de la table', contenu: 'Rien encore.' })).id;
  await api(antor, 'PATCH', `${base}/${notes}`, { joueursLisent: true });
  return { U, antor, lea, teo, aldric, apparence, verite, notes };
}

const bouton = (page: Any) => page.getByRole('button', { name: rx('Demander à Kanevas') });
const saisie = (page: Any) => page.getByLabel(rx('Demander à Kanevas'));
const envoyer = (page: Any) => page.getByRole('button', { name: /^Envoyer$/ });

async function ouvrirFiche(page: Any, m: Monde): Promise<void> {
  await page.goto(`/univers/${m.U}/fiche/${m.aldric}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
}

async function ouvrirPanneau(page: Any): Promise<void> {
  await bouton(page).click();
  await saisie(page).waitFor();
  await attendre(page);
}

async function demander(page: Any, message: string): Promise<void> {
  await saisie(page).fill(message);
  await envoyer(page).click();
  await page.waitForFunction(() => !/Kanevas réfléchit…/.test(document.body.innerText));
  await attendre(page);
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
});
after(async () => {
  if (browser) await browser.close();
  if (srv) srv.stop();
});

describe('E-12 assistant : droits de lecture (B-26)', { skip: skipBrowser }, () => {
  test('joueuse_demande_aldric_obtient_apparence_sans_verite', async () => {
    // Fails if the assistant's search/read ignores the section audience.
    const m = await monde('Lame d’Ébène');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, "Que sait-on d'Aldric ?");
    const t = await texte(m.lea);
    assert.match(t, /Apparence/);
    assert.match(t, /Grand, cape grise, regard dur\./);
    assert.doesNotMatch(t, /Vérité/);
    assert.doesNotMatch(t, /trahit le Cercle/);
    await m.lea.screenshot({ path: '/tmp/e12-lea-aldric.png' });
  });

  test('mj_demande_aldric_obtient_aussi_la_verite', async () => {
    // Fails if the GM catalogue is filtered like the player's.
    const m = await monde('Lame d’Ébène MJ');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, "Que sait-on d'Aldric ?");
    const t = await texte(m.antor);
    assert.match(t, /Apparence/);
    assert.match(t, /Grand, cape grise, regard dur\./);
    assert.match(t, /Vérité/);
    assert.match(t, /Il trahit le Cercle\./);
  });

  test('joueuse_lit_verite_recoit_introuvable_et_aucun_contenu', async () => {
    // Fails if a closed section is read or if the refusal differs from the interface's.
    const m = await monde('Lame d’Ébène refus');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, 'Lis-moi la section « Vérité — MJ seul »');
    const t = await texte(m.lea);
    assert.match(t, /Introuvable\./);
    assert.doesNotMatch(t, /trahit le Cercle/);
    assert.doesNotMatch(t, /Écrit par l'assistant/);
  });

  test('joueuse_lit_section_lisible_sans_refus', async () => {
    // Border: the same request on a readable section gives the content.
    const m = await monde('Lame d’Ébène lisible');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, 'Lis-moi la section « Apparence »');
    const t = await texte(m.lea);
    assert.match(t, /Grand, cape grise, regard dur\./);
  });
});

describe('E-12 assistant : droits d’écriture (B-26)', { skip: skipBrowser }, () => {
  test('joueuse_ajoute_a_section_lisible_non_ecrite_est_refusee_sans_ecriture', async () => {
    // Fails if the tool writes where the person may only read.
    const m = await monde('Lame d’Ébène écriture');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, 'Ajoute le paragraphe « Elle ment. » dans « Notes de la table »');
    const t = await texte(m.lea);
    assert.match(t, /Vous ne pouvez pas modifier cette section\./);
    assert.doesNotMatch(t, /Écrit par l'assistant/);
    const s = await json(m.antor, 'GET', `/api/univers/${m.U}/fiches/${m.aldric}`);
    assert.doesNotMatch(JSON.stringify(s), /Elle ment/);
  });

  test('mj_ajoute_un_paragraphe_et_le_bloc_ecriture_mene_a_la_fiche', async () => {
    // Fails if the write event is missing or its link does not lead to E-9.
    const m = await monde('Lame d’Ébène ajout');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, 'Ajoute le paragraphe « Elle ment. » dans « Notes de la table »');
    const t = await texte(m.antor);
    assert.match(t, /Écrit par l'assistant/);
    assert.match(t, /Section « Notes de la table » complétée/);
    const s = await json(m.antor, 'GET', `/api/univers/${m.U}/fiches/${m.aldric}`);
    assert.match(JSON.stringify(s), /Rien encore\.[\s\S]*Elle ment\./);
    await m.antor.getByRole('link', { name: /^Ouvrir/ }).first().click();
    await attendre(m.antor);
    assert.match(m.antor.url(), new RegExp(`/univers/${m.U}/fiche/${m.aldric}`));
  });
});

describe('E-12 assistant : catalogue du MJ (B-27)', { skip: skipBrowser }, () => {
  test('mj_cree_campagne_puis_scenario_retrouve_sur_e6_et_e7', async () => {
    // Fails if the creation tools are absent, mis-labelled or mis-linked.
    const m = await monde('Lame d’Ébène création');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, 'Crée une campagne « Les Marches rouges »');
    let t = await texte(m.antor);
    assert.match(t, /Campagne « Les Marches rouges » créée/);
    await demander(m.antor, 'Crée un scénario « Acte III — La crypte » dans « Les Marches rouges »');
    t = await texte(m.antor);
    assert.match(t, /Scénario « Acte III — La crypte » créé dans Les Marches rouges/);
    await m.antor.screenshot({ path: '/tmp/e12-antor-creation.png' });
    // The last "Ouvrir" leads to the scenario (E-7), where its title is visible.
    await m.antor.getByRole('link', { name: /^Ouvrir/ }).last().click();
    await attendre(m.antor);
    assert.match(await texte(m.antor), /Acte III — La crypte/);
    // And the campaign page (E-6) lists it.
    await m.antor.goto(`/univers/${m.U}/campagnes`);
    await attendre(m.antor);
    assert.match(await texte(m.antor), /Les Marches rouges/);
    await m.antor.getByRole("link", { name: /Les Marches rouges/ }).first().click();
    await m.antor.getByText('Acte III — La crypte').first().waitFor();
    assert.match(await texte(m.antor), /Acte III — La crypte/);
  });

  test('joueuse_demande_de_creer_un_scenario_rien_n_est_cree', async () => {
    // Fails if the player gets a creation tool.
    const m = await monde('Lame d’Ébène joueuse crée');
    await json(m.antor, 'POST', `/api/univers/${m.U}/campagnes`, { nom: 'La Couronne brisée' }).catch(() => null);
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, 'Crée un scénario « Acte III — La crypte » dans « La Couronne brisée »');
    const t = await texte(m.lea);
    assert.doesNotMatch(t, /Écrit par l'assistant/);
    assert.doesNotMatch(t, /Scénario « Acte III — La crypte » créé/);
    await m.lea.screenshot({ path: '/tmp/e12-lea-creation.png' });
  });

  test('joueuse_demande_de_creer_une_campagne_rien_n_est_cree', async () => {
    const m = await monde('Lame d’Ébène joueuse campagne');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, 'Crée une campagne « Les Marches rouges »');
    const t = await texte(m.lea);
    assert.doesNotMatch(t, /Écrit par l'assistant/);
    assert.doesNotMatch(t, /Campagne « Les Marches rouges » créée/);
    await m.lea.goto(`/univers/${m.U}`);
    await attendre(m.lea);
    assert.doesNotMatch(await texte(m.lea), /Les Marches rouges/);
  });
});

describe('E-12 assistant : présence du bouton et pastille', { skip: skipBrowser }, () => {
  test('bouton_present_sur_les_ecrans_d_un_univers_pour_mj_et_joueuse', async () => {
    // Fails if the button is mounted on some screens only.
    const m = await monde('Lame d’Ébène présence');
    for (const p of [m.antor, m.lea]) {
      for (const chemin of [`/univers/${m.U}`, `/univers/${m.U}/fiches/personnages`, `/univers/${m.U}/fiche/${m.aldric}`]) {
        await p.goto(chemin);
        await attendre(p);
        assert.equal(await bouton(p).count(), 1, `${chemin}`);
      }
    }
  });

  test('bouton_absent_hors_d_un_univers', async () => {
    const m = await monde('Lame d’Ébène hors');
    await m.antor.goto('/');
    await attendre(m.antor);
    assert.equal(await bouton(m.antor).count(), 0);
  });

  test('compte_sans_role_n_a_ni_bouton_ni_page_ni_route', async () => {
    // Fails if a non-member reaches the assistant (AD-75).
    const m = await monde('Lame d’Ébène sans rôle');
    await m.teo.goto(`/univers/${m.U}`);
    await attendre(m.teo);
    assert.equal(await bouton(m.teo).count(), 0);
    const r = await api(m.teo, 'POST', `/api/univers/${m.U}/assistant/messages`, { message: 'Bonjour', historique: [] }, false);
    assert.equal(r.status(), 404);
    assert.equal((await api(m.teo, 'GET', `/api/univers/${m.U}/assistant`, undefined, false)).status(), 404);
    await m.antor.goto(`/univers/${m.U}/assistant`);
    await attendre(m.antor);
    assert.match(await texte(m.antor), /Page introuvable\./);
  });

  test('pastille_dit_le_role_reel_meme_en_mode_joueur', async () => {
    const m = await monde('Lame d’Ébène pastille');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    assert.match(await texte(m.lea), /Joueur/);
    await ouvrirFiche(m.antor, m);
    await m.antor.getByRole('radio', { name: /^Mode Joueur$/ }).check();
    await attendre(m.antor);
    await ouvrirPanneau(m.antor);
    const panneau = await texte(m.antor);
    assert.match(panneau, /Kanevas — assistant/);
    assert.match(panneau, /\bMJ\b/);
    // The GM keeps the GM catalogue: the closed section is readable by the assistant.
    await demander(m.antor, 'Lis-moi la section « Vérité — MJ seul »');
    assert.match(await texte(m.antor), /Il trahit le Cercle\./);
  });
});

describe('E-12 assistant : états du panneau (B-29)', { skip: skipBrowser }, () => {
  test('fil_vide_dit_l_invite', async () => {
    const m = await monde('Lame d’Ébène vide');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    const t = await texte(m.lea);
    assert.match(t, /Demandez-moi de chercher, de résumer ou d'écrire dans ce que vous pouvez lire et écrire\./);
    assert.match(t, /Que sait-on d'Aldric \?/);
    await m.lea.screenshot({ path: '/tmp/e12-vide.png' });
  });

  test('fil_survit_a_la_fermeture_et_au_changement_d_ecran_puis_nouvelle_conversation_le_vide', async () => {
    // Fails if the thread is kept in the router/panel instead of the module store (AD-28).
    const m = await monde('Lame d’Ébène fil');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, "Essai 42, que sait-on d'Aldric ?");
    await m.lea.getByRole('button', { name: /^Fermer$/ }).click();
    await bouton(m.lea).click();
    assert.match(await texte(m.lea), /Essai 42/);
    await m.lea.getByRole('button', { name: /^Fermer$/ }).click();
    await m.lea.getByRole('link', { name: /Personnages/ }).first().click();
    await attendre(m.lea);
    await bouton(m.lea).click();
    assert.match(await texte(m.lea), /Grand, cape grise/);
    await m.lea.getByRole('button', { name: rx('Nouvelle conversation') }).click();
    const t = await texte(m.lea);
    assert.doesNotMatch(t, /Essai 42/);
    assert.match(t, /Demandez-moi de chercher/);
  });

  test('fil_disparait_au_rechargement_et_n_est_pas_dans_le_stockage_du_navigateur', async () => {
    const m = await monde('Lame d’Ébène rechargement');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, "Essai 42, que sait-on d'Aldric ?");
    const stock = await m.lea.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
    assert.doesNotMatch(stock, /Essai 42|Grand, cape grise/);
    await m.lea.reload();
    await attendre(m.lea);
    await ouvrirPanneau(m.lea);
    const t = await texte(m.lea);
    assert.doesNotMatch(t, /Essai 42/);
    assert.match(t, /Demandez-moi de chercher/);
  });

  test('message_de_plus_de_2000_caracteres_est_refuse_sous_le_champ', async () => {
    // Border: 2000 passes, 2001 is refused.
    const m = await monde('Lame d’Ébène longueur');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await saisie(m.lea).fill('a'.repeat(2001));
    assert.match(await texte(m.lea), /Erreur : 2 000 caractères au plus\./);
    assert.equal(await envoyer(m.lea).getAttribute('aria-disabled') ?? String(await envoyer(m.lea).isDisabled()), 'true');
    await saisie(m.lea).fill('a'.repeat(2000));
    assert.doesNotMatch(await texte(m.lea), /Erreur : 2 000 caractères au plus\./);
    assert.equal(await envoyer(m.lea).isDisabled(), false);
  });

  test('erreur_de_transport_dit_reessayer_sans_evenement_et_reessayer_ne_double_pas_la_question', async () => {
    // Fails if the question is lost, shown twice, or an event appears.
    const m = await monde('Lame d’Ébène erreur');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, 'Fais un échec');
    let t = await texte(m.lea);
    assert.match(t, /Je n'ai pas pu répondre — réessayer/);
    assert.doesNotMatch(t, /Écrit par l'assistant/);
    assert.equal((t.match(/Fais un échec/g) ?? []).length, 1);
    await m.lea.screenshot({ path: '/tmp/e12-erreur.png' });
    await m.lea.getByRole('button', { name: /Réessayer/ }).click();
    await m.lea.waitForFunction(() => !/Kanevas réfléchit…/.test(document.body.innerText));
    t = await texte(m.lea);
    assert.equal((t.match(/Fais un échec/g) ?? []).length, 1);
    assert.match(t, /Je n'ai pas pu répondre — réessayer/);
  });

  test('serveur_muet_pendant_la_reponse_donne_l_erreur_et_la_saisie_reste_dans_le_fil', async () => {
    const m = await monde('Lame d’Ébène muet');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await m.lea.route('**/assistant/messages', (r: Any) => r.abort());
    await demander(m.lea, "Que sait-on d'Aldric ?");
    const t = await texte(m.lea);
    assert.match(t, /Je n'ai pas pu répondre — réessayer/);
    assert.equal((t.match(/Que sait-on d'Aldric \?/g) ?? []).length >= 1, true);
    await m.lea.unroute('**/assistant/messages');
    await m.lea.getByRole('button', { name: /Réessayer/ }).click();
    await m.lea.waitForFunction(() => /Grand, cape grise/.test(document.body.innerText));
    assert.doesNotMatch(await texte(m.lea), /Vérité/);
  });

  test('demande_deja_en_cours_429_dit_patientez', async () => {
    const m = await monde('Lame d’Ébène 429');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await m.lea.route('**/assistant/messages', (r: Any) =>
      r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"x"}' }),
    );
    await demander(m.lea, "Que sait-on d'Aldric ?");
    assert.match(await texte(m.lea), /Une demande est déjà en cours\. Patientez\./);
    await m.lea.unroute('**/assistant/messages');
  });

  test('connexion_perdue_desactive_le_champ_et_le_rend_au_retour', async () => {
    const m = await monde('Lame d’Ébène hors ligne');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await m.lea.context().setOffline(true);
    await m.lea.evaluate(() => window.dispatchEvent(new Event('offline')));
    await m.lea.getByText(/Connexion perdue\./).waitFor();
    assert.equal(await saisie(m.lea).getAttribute('aria-disabled') ?? String(await saisie(m.lea).isDisabled()), 'true');
    await m.lea.context().setOffline(false);
    await m.lea.evaluate(() => window.dispatchEvent(new Event('online')));
    await m.lea.waitForFunction(() => !/Connexion perdue\./.test(document.body.innerText));
    assert.notEqual(await saisie(m.lea).getAttribute('aria-disabled'), 'true');
  });

  test('echap_ferme_le_panneau_et_rend_le_focus_au_bouton', async () => {
    const m = await monde('Lame d’Ébène échap');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await m.lea.keyboard.press('Escape');
    await m.lea.waitForFunction(() => !/Kanevas — assistant/.test(document.body.innerText));
    assert.equal(await bouton(m.lea).evaluate((e: Any) => e === document.activeElement), true);
  });

  test('entree_envoie_maj_entree_va_a_la_ligne', async () => {
    const m = await monde('Lame d’Ébène clavier');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await saisie(m.lea).fill('ligne un');
    await saisie(m.lea).press('Shift+Enter');
    await saisie(m.lea).pressSequentially('ligne deux');
    assert.equal(await saisie(m.lea).inputValue(), 'ligne un\nligne deux');
    await saisie(m.lea).press('Enter');
    await m.lea.waitForFunction(() => !/Kanevas réfléchit…/.test(document.body.innerText));
    assert.equal(await saisie(m.lea).inputValue(), '');
    assert.match(await texte(m.lea), /ligne un/);
  });

  test('telephone_390px_le_panneau_prend_tout_l_ecran', async () => {
    const m = await monde('Lame d’Ébène téléphone');
    await m.lea.setViewportSize({ width: 390, height: 800 });
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    const larg = await saisie(m.lea).evaluate((e: Any) => {
      let n = e;
      let max = 0;
      while (n && n !== document.body) {
        max = Math.max(max, n.getBoundingClientRect().width);
        n = n.parentElement;
      }
      return max;
    });
    assert.ok(larg >= 380, `largeur du panneau ${larg}`);
    await m.lea.screenshot({ path: '/tmp/e12-390.png' });
  });
});
