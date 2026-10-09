// Black-box tests of the assembled feature kanevas-images, written from the need (docs/parcours.md
// B-25, B-27, B-29, P-3 step 5; docs/ecrans.md « Détail des écrans de kanevas-images », E-12 block
// « Image attachée ») and not from the code. Expected values are literals taken from those docs.
// Real server in stub mode (AD-55, image « bouchon » AD-88) + real Chromium; the world is arranged
// through the API, what is checked is read on screen as the user sees it.
//
// TEST PLAN (need -> case -> proof)
//   B-25 nominal  : Antor asks a portrait for « Apparence » -> label + thumbnail + « Ouvrir la section » -> E-9
//                   section carries exactly one more image            (demande_de_portrait_attache_une_image…)
//   B-25 nominal  : same asked from the sheet itself -> following the link shows the image without reload
//   B-25 bords    : one request = one image; two requests = two; 49 -> 50 passes, 50 -> « 50 pièces jointes »
//   B-25 échec    : « échec » -> « Je n'ai pas pu générer l'image. », no block, nothing attached
//   B-25 échec    : description over 500 chars -> « La description est limitée à 500 caractères. »
//   B-27 exclusion: Léa (Joueuse) cannot ask: no block, nothing attached
//   B-24/B-25     : the image is an ordinary non-secret attachment following its section (Léa sees it on a section
//                   she reads, not on a closed one; direct address of a closed one is 404; no session -> not served)
//   B-29 états    : loading frame, removed image, reload, lost connection, role removed, 20 s wait (MJ vs Joueur),
//                   long titles
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const DEMANDE = "Fais un portrait pour « Apparence » d'« Maître Aldric »";
const LIBELLE = "Image attachée à la section « Apparence » de « Maître Aldric »";

interface Monde {
  U: number;
  antor: Any;
  lea: Any;
  teo: Any;
  aldric: number;
  apparence: number;
  verite: number;
}

async function api(page: Any, method: string, url: string, data?: unknown, multipart?: unknown): Promise<Any> {
  return page.request.fetch(srv.base + url, { method, data, multipart });
}
async function json(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await api(page, method, url, data);
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.json();
}

/** Antor (MJ) and Léa (Joueuse) in a fresh universe; Teo outside. « Apparence » read by players, « Vérité — MJ seul » closed. */
async function monde(nom: string, titreFiche = 'Maître Aldric', titreSection = 'Apparence'): Promise<Monde> {
  const antor = (await connecte(browser, srv.base, 'Antor')).page;
  const lea = (await connecte(browser, srv.base, 'Léa')).page;
  const teo = (await connecte(browser, srv.base, 'Teo')).page;
  const U = (await json(antor, 'POST', '/api/univers', { nom })).id;
  await json(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
  const aldric = (await json(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: titreFiche, charge: { pj: false } })).id;
  const base = `/api/univers/${U}/fiches/${aldric}/sections`;
  const apparence = (await json(antor, 'POST', base, { titre: titreSection, contenu: 'Grand, cape grise, regard dur.' })).id;
  await json(antor, 'PATCH', `${base}/${apparence}`, { joueursLisent: true });
  const verite = (await json(antor, 'POST', base, { titre: 'Vérité — MJ seul', contenu: 'Il trahit le Cercle.' })).id;
  return { U, antor, lea, teo, aldric, apparence, verite };
}

const bouton = (page: Any) => page.getByRole('button', { name: rx('Demander à Kanevas') });
const saisie = (page: Any) => page.getByLabel(rx('Demander à Kanevas'));
const envoyer = (page: Any) => page.getByRole('button', { name: /^Envoyer$/ });
const bloc = (page: Any) =>
  page.getByText(/Image attachée à la section/).first().locator('xpath=ancestor::*[.//a[normalize-space()="Ouvrir la section"]][1]');

async function ouvrirFiche(page: Any, m: Monde): Promise<void> {
  await page.goto(`/univers/${m.U}/fiche/${m.aldric}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
}
async function ouvrirListe(page: Any, m: Monde): Promise<void> {
  await page.goto(`/univers/${m.U}/fiches/personnages`);
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
  await page.waitForFunction(() => !/Kanevas réfléchit…|Kanevas travaille toujours…/.test(document.body.innerText));
  await attendre(page);
}
/** Number of image attachments displayed by the sheet (E-9), read after a fresh load. */
async function nbImages(page: Any, m: Monde): Promise<number> {
  await ouvrirFiche(page, m);
  return page.locator('main img[src*="pieces-jointes"]').count();
}
async function remplir(page: Any, m: Monde, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const r = await api(page, 'POST', `/api/univers/${m.U}/fiches/${m.aldric}/sections/${m.apparence}/pieces-jointes`, undefined, {
      fichier: { name: `p${i}.png`, mimeType: 'image/png', buffer: PNG_1X1 },
    });
    assert.equal(r.status(), 201);
  }
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

describe('kanevas-images : générer un portrait (B-25, B-27, P-3 étape 5)', { skip: skipBrowser }, () => {
  test('demande_de_portrait_attache_une_image_et_le_lien_mene_a_la_section', async () => {
    // Fails if the tool does not attach, if the block lacks label/thumbnail/link, or if the link misses the section.
    const m = await monde('Images nominal');
    assert.equal(await nbImages(m.antor, m), 0);
    await ouvrirListe(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, DEMANDE);
    const t = await texte(m.antor);
    assert.ok(t.includes(LIBELLE), 'label of the block');
    assert.match(t, /Écrit par l'assistant/);
    const img = bloc(m.antor).locator('img');
    await img.waitFor();
    const box = await img.boundingBox();
    assert.ok(box && box.width > 0 && box.width <= 240, `thumbnail width ${box?.width}`);
    assert.ok(await img.evaluate((i: Any) => i.complete && i.naturalWidth > 0), 'thumbnail really loaded');
    await m.antor.screenshot({ path: '/tmp/images-nominal-fil.png' });
    await bloc(m.antor).getByRole('link', { name: 'Ouvrir la section' }).click();
    await m.antor.waitForURL(new RegExp(`/univers/${m.U}/fiche/${m.aldric}#section-${m.apparence}$`));
    await attendre(m.antor);
    await m.antor.screenshot({ path: '/tmp/images-nominal-fiche.png' });
    await m.antor.locator('main img[src*="pieces-jointes"]').first().waitFor({ timeout: 3000 });
    assert.equal(await m.antor.locator('main img[src*="pieces-jointes"]').count(), 1);
  });

  test('demande_faite_sur_la_fiche_elle_meme_montre_l_image_en_suivant_ouvrir_la_section', async () => {
    // P-3 step 5: Antor "suit « Ouvrir la section » dans le fil pour la voir sur la fiche (E-9)".
    // Fails if the sheet already on screen is not refreshed when the link is followed.
    const m = await monde('Images meme fiche');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, DEMANDE);
    await bloc(m.antor).getByRole('link', { name: 'Ouvrir la section' }).click();
    await attendre(m.antor);
    await m.antor.waitForTimeout(500);
    assert.equal(await m.antor.locator('main img[src*="pieces-jointes"]').count(), 1);
  });

  test('une_demande_attache_une_seule_image_et_deux_demandes_en_attachent_deux', async () => {
    // Fails if a request attaches several images or if a second request replaces the first.
    const m = await monde('Images une par demande');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, DEMANDE);
    assert.equal(await nbImages(m.antor, m), 1);
    await ouvrirPanneau(m.antor).catch(() => undefined);
    await demander(m.antor, DEMANDE);
    assert.equal(await nbImages(m.antor, m), 2);
  });

  test('echec_dans_la_demande_n_attache_rien_et_le_dit', async () => {
    // Fails if a failed generation attaches something or shows the block, or if the sentence differs.
    const m = await monde('Images echec');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, "Fais un portrait pour « Apparence » d'« Maître Aldric » avec un échec");
    const t = await texte(m.antor);
    assert.match(t, /Je n'ai pas pu générer l'image\./);
    assert.doesNotMatch(t, /Image attachée/);
    assert.doesNotMatch(t, /Écrit par l'assistant/);
    await m.antor.screenshot({ path: '/tmp/images-echec.png' });
    assert.equal(await nbImages(m.antor, m), 0);
  });

  test('section_a_49_pieces_accepte_la_cinquantieme_et_a_50_refuse_sans_rien_attacher', async () => {
    // Fails if the 50-attachment limit is off by one in either direction or if a refusal still attaches.
    const m = await monde('Images plafond');
    await remplir(m.antor, m, 49);
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, DEMANDE);
    const accepte = (await texte(m.antor)).includes(LIBELLE);
    assert.equal(await nbImages(m.antor, m), 50);
    assert.ok(accepte, '49 -> 50 is accepted');
    await ouvrirPanneau(m.antor).catch(() => undefined);
    await demander(m.antor, DEMANDE);
    const t = await texte(m.antor);
    assert.equal(await nbImages(m.antor, m), 50);
    assert.match(t, /Cette section porte déjà 50 pièces jointes\./);
  });

  test('description_de_plus_de_500_caracteres_est_refusee_et_rien_n_est_attache', async () => {
    // Fails if the 500-character limit is not enforced on the description.
    const m = await monde('Images description longue');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    const longue = DEMANDE + ' ' + 'très détaillé, '.repeat(60);
    assert.ok(longue.length > 501 && longue.length < 2000);
    await demander(m.antor, longue);
    const t = await texte(m.antor);
    assert.equal(await nbImages(m.antor, m), 0);
    assert.match(t, /La description est limitée à 500 caractères\./);
  });

  test('joueuse_ne_peut_pas_demander_d_image_rien_n_est_attache', async () => {
    // Fails if the player's catalogue offers the tool (B-27) or if anything is attached on her request.
    const m = await monde('Images joueuse');
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, DEMANDE);
    const t = await texte(m.lea);
    assert.doesNotMatch(t, /Image attachée/);
    assert.doesNotMatch(t, /Écrit par l'assistant/);
    await m.lea.screenshot({ path: '/tmp/images-lea.png' });
    assert.equal(await nbImages(m.antor, m), 0);
    assert.equal(await m.lea.locator('main img[src*="pieces-jointes"]').count(), 0);
  });

  test('joueuse_qui_peut_ecrire_la_section_n_obtient_pas_d_image_non_plus', async () => {
    // B-27: the tool is the GM's, whatever the player may write. Fails if the player's catalogue offers it
    // (the write right alone would then let the image through).
    const m = await monde('Images joueuse ecrit');
    await json(m.antor, 'PATCH', `/api/univers/${m.U}/fiches/${m.aldric}/sections/${m.apparence}`, { joueursEcrivent: true });
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.lea);
    await demander(m.lea, DEMANDE);
    const t = await texte(m.lea);
    assert.doesNotMatch(t, /Image attachée/);
    assert.doesNotMatch(t, /Écrit par l'assistant/);
    assert.equal(await nbImages(m.antor, m), 0);
  });

  test('joueuse_par_l_api_ne_fait_rien_attacher_et_un_etranger_est_refuse', async () => {
    // Fails if the server trusts the screen: the same request sent straight to the route must not attach.
    const m = await monde('Images api');
    const r = await api(m.lea, 'POST', `/api/univers/${m.U}/assistant/messages`, { message: DEMANDE, historique: [] });
    const corps = r.status() < 300 ? await r.json() : {};
    assert.ok(!JSON.stringify(corps).includes('image_attachee'), 'no image event for a player');
    assert.equal(await nbImages(m.antor, m), 0);
    const e = await api(m.teo, 'POST', `/api/univers/${m.U}/assistant/messages`, { message: DEMANDE, historique: [] });
    assert.ok(e.status() >= 400, `outsider got ${e.status()}`);
    assert.equal(await nbImages(m.antor, m), 0);
  });

  test('image_suit_la_visibilite_de_sa_section_joueuse_la_voit_sur_apparence_pas_sur_verite', async () => {
    // Fails if the attached image is secret/visible against its section's audience, or served without the section's read right.
    const m = await monde('Images visibilite');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, DEMANDE);
    await demander(m.antor, "Fais un portrait pour « Vérité — MJ seul » d'« Maître Aldric »");
    assert.ok((await texte(m.antor)).includes("Image attachée à la section « Vérité — MJ seul » de « Maître Aldric »"));
    await ouvrirFiche(m.antor, m);
    const srcs: string[] = await m.antor.locator('main img[src*="pieces-jointes"]').evaluateAll((l: Any[]) => l.map((i) => i.getAttribute('src')));
    assert.equal(srcs.length, 2);
    // Léa sees exactly one: the one of « Apparence ».
    await ouvrirFiche(m.lea, m);
    const vues: string[] = await m.lea.locator('main img[src*="pieces-jointes"]').evaluateAll((l: Any[]) => l.map((i) => i.getAttribute('src')));
    assert.equal(vues.length, 1);
    const cachee = srcs.find((s) => !vues.includes(s))!;
    assert.equal((await api(m.lea, 'GET', cachee)).status(), 404);
    assert.equal((await api(m.teo, 'GET', cachee)).status(), 404);
    assert.equal((await api(m.teo, 'GET', vues[0]!)).status(), 404);
    const ok = await api(m.lea, 'GET', vues[0]!);
    assert.equal(ok.status(), 200);
    assert.match(ok.headers()['content-type'] ?? '', /^image\//);
    // No session: nothing is served.
    const anonyme = await browser.newContext({ baseURL: srv.base });
    const sans = await anonyme.request.get(srv.base + vues[0]!, { maxRedirects: 0 });
    assert.notEqual(sans.status(), 200);
    assert.ok(!/^image\//.test(sans.headers()['content-type'] ?? ''));
    await anonyme.close();
  });
});

describe('kanevas-images : états du bloc « Image attachée » (B-29)', { skip: skipBrowser }, () => {
  test('vignette_en_chargement_montre_le_cadre_gris_puis_l_image', async () => {
    // Fails if the loading frame is missing or the link/label are not there while the image loads.
    const m = await monde('Images chargement');
    await m.antor.route('**/pieces-jointes/*/fichier', async (route: Any) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await saisie(m.antor).fill(DEMANDE);
    await envoyer(m.antor).click();
    await m.antor.getByText(rx('Chargement de l’image…')).waitFor();
    assert.ok((await texte(m.antor)).includes(LIBELLE));
    await m.antor.getByRole('link', { name: 'Ouvrir la section' }).waitFor();
    await m.antor.screenshot({ path: '/tmp/images-chargement.png' });
    await bloc(m.antor).locator('img').waitFor();
    assert.equal(await m.antor.getByText(rx('Chargement de l’image…')).count(), 0);
  });

  test('image_retiree_depuis_dit_image_indisponible_garde_le_lien_et_recharger_rend_le_meme_texte', async () => {
    // Fails if a removed image leaves a broken picture, drops the link, or the reload misbehaves.
    const m = await monde('Images retiree');
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, DEMANDE);
    const src: string = await bloc(m.antor).locator('img').getAttribute('src');
    const pid = /pieces-jointes\/(\d+)\/fichier/.exec(src)![1];
    const r = await api(m.antor, 'DELETE', `/api/univers/${m.U}/fiches/${m.aldric}/pieces-jointes/${pid}`);
    assert.ok(r.status() < 300, `delete ${r.status()}`);
    await m.antor.getByRole('button', { name: 'Fermer' }).click();
    await ouvrirPanneau(m.antor);
    await m.antor.getByText('Image indisponible.').waitFor();
    await m.antor.getByRole('button', { name: "Recharger l'image" }).or(m.antor.getByRole('button', { name: /Recharger l.image/ })).waitFor();
    await m.antor.screenshot({ path: '/tmp/images-retiree.png' });
    assert.ok((await texte(m.antor)).includes(LIBELLE));
    await m.antor.getByRole('button', { name: /Recharger l.image/ }).click();
    await attendre(m.antor);
    await m.antor.getByText('Image indisponible.').waitFor();
    await m.antor.getByRole('link', { name: 'Ouvrir la section' }).click();
    await m.antor.waitForURL(new RegExp(`#section-${m.apparence}$`));
  });

  test('connexion_perdue_garde_la_vignette_chargee_et_grise_le_rechargement_d_une_absente', async () => {
    // Fails if a loaded thumbnail vanishes offline, or if reload stays usable offline on an unavailable image.
    const m = await monde('Images hors ligne');
    const ctx = m.antor.context();
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, DEMANDE);
    await bloc(m.antor).locator('img').waitFor();
    await ctx.setOffline(true);
    await m.antor.getByText(/Connexion perdue\./).first().waitFor();
    assert.ok(await bloc(m.antor).locator('img').evaluate((i: Any) => i.complete && i.naturalWidth > 0), 'loaded thumbnail stays');
    await m.antor.screenshot({ path: '/tmp/images-hors-ligne.png' });
    // Close and reopen while offline: the thumbnail is re-read, cannot be, so the frame says so.
    await m.antor.getByRole('button', { name: 'Fermer' }).click();
    await ouvrirPanneau(m.antor);
    await m.antor.getByText('Image indisponible.').waitFor();
    const recharger = m.antor.getByRole('button', { name: /Recharger l.image/ });
    assert.equal(await recharger.getAttribute('aria-disabled').then((v: string | null) => v === 'true') || (await recharger.isDisabled()), true);
    await ctx.setOffline(false);
    await m.antor.getByText(/Connexion perdue\./).first().waitFor({ state: 'hidden' });
    await recharger.click();
    await bloc(m.antor).locator('img').waitFor();
  });

  test('role_retire_apres_coup_la_vignette_repond_404_et_le_cadre_dit_image_indisponible', async () => {
    // Fails if the image is still readable once the GM lost the right to write/read the section.
    const m = await monde('Images role retire');
    const mira = (await connecte(browser, srv.base, 'Mira')).page;
    await json(m.antor, 'POST', `/api/univers/${m.U}/membres`, { username: 'mira', role: 'mj' });
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, DEMANDE);
    const src: string = await bloc(m.antor).locator('img').getAttribute('src');
    const membres = await json(mira, 'GET', `/api/univers/${m.U}/membres`);
    const liste = Array.isArray(membres) ? membres : membres.membres;
    const antor = liste.find((x: Any) => /antor/i.test(JSON.stringify(x)));
    const compteId = antor.compteId ?? antor.id;
    const d = await api(mira, 'DELETE', `/api/univers/${m.U}/membres/${compteId}`);
    assert.ok(d.status() < 300, `removal ${d.status()}`);
    assert.equal((await api(m.antor, 'GET', src)).status(), 404);
    await m.antor.getByRole('button', { name: 'Fermer' }).click();
    await ouvrirPanneau(m.antor).catch(() => undefined);
    await m.antor.getByText('Image indisponible.').waitFor();
    assert.ok((await texte(m.antor)).includes(LIBELLE));
    await m.antor.screenshot({ path: '/tmp/images-role-retire.png' });
  });

  test('attente_de_plus_de_20_secondes_le_mj_voit_le_texte_sur_l_image_la_joueuse_non', async () => {
    // Fails if the long-wait text is shown to a Player, or not shown to the GM at 20 s.
    const m = await monde('Images attente');
    const retarder = async (page: Any) =>
      page.route('**/assistant/messages', async (route: Any) => {
        await new Promise((r) => setTimeout(r, 23000));
        await route.continue();
      });
    await retarder(m.antor);
    await retarder(m.lea);
    await ouvrirFiche(m.antor, m);
    await ouvrirFiche(m.lea, m);
    await ouvrirPanneau(m.antor);
    await ouvrirPanneau(m.lea);
    await saisie(m.antor).fill(DEMANDE);
    await saisie(m.lea).fill('Que sait-on d’Aldric ?');
    await envoyer(m.antor).click();
    await envoyer(m.lea).click();
    await m.antor.getByText(rx('Kanevas travaille toujours… Une image peut prendre jusqu’à trois minutes.')).waitFor({ timeout: 25000 });
    assert.equal(await m.antor.getByRole('status').filter({ hasText: 'travaille toujours' }).count(), 1);
    await m.antor.screenshot({ path: '/tmp/images-attente-mj.png' });
    assert.match(await texte(m.lea), /Kanevas réfléchit…/);
    assert.doesNotMatch(await texte(m.lea), /travaille toujours/);
    assert.doesNotMatch(await texte(m.lea), /trois minutes/);
    await m.antor.getByText(LIBELLE, { exact: true }).waitFor({ timeout: 10000 });
  });

  test('titres_longs_passent_a_la_ligne_et_la_vignette_reste_dans_ses_bornes', async () => {
    // Fails if a 120-char sheet title or 80-char section title overflows the panel, or the thumbnail exceeds 240x320.
    // The stub script searches the sheet by its title, and a search takes 1 to 100 characters: a 120-character
    // title cannot be reached through the stub, so the sheet title is the longest askable one (100).
    const titreFiche = 'Maître Aldric de la Couronne brisée, régent déchu du royaume de Lame d’Ébène et gardien des sept sce';
    const titreSection = 'Apparence détaillée lors de la grande cérémonie devant toute la cour du royaumes';
    assert.equal(titreFiche.length, 100);
    assert.equal(titreSection.length, 80);
    const m = await monde('Images titres longs', titreFiche, titreSection);
    await ouvrirFiche(m.antor, m);
    await ouvrirPanneau(m.antor);
    await demander(m.antor, `Fais un portrait pour « ${titreSection} » d'« ${titreFiche} »`);
    assert.ok((await texte(m.antor)).includes(`Image attachée à la section « ${titreSection} » de « ${titreFiche} »`.replace(/’/g, "'")));
    const b = bloc(m.antor);
    const dep = await b.evaluate((e: Any) => e.scrollWidth > e.clientWidth + 1);
    assert.equal(dep, false, 'block overflows horizontally');
    const box = await b.locator('img').boundingBox();
    assert.ok(box && box.width <= 240 && box.height <= 320, `thumbnail ${box?.width}x${box?.height}`);
    await m.antor.screenshot({ path: '/tmp/images-titres-longs.png' });
  });
});
