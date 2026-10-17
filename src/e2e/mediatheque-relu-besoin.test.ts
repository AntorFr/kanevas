// Black-box tests of the media library feature (kanevas-import-mediatheque), written from the need alone
// (docs/parcours.md B-24, B-44, B-53 to B-55, P-16; docs/ecrans.md E-9, E-19; the feature's exit criterion).
// Seeded stub world « Lame d'Ébène » (Antor GM, Léa player). Expected values are literal.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { allerMembres, ajouterMembre, attendre, launch, playwright, rx, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const PDF = (nom: string, n = 0) => ({ name: nom, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${nom} ${n}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`) });
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEElEQVR4nGP4z8CAFTEMLQkAbsP/AQ6EtMEAAAAASUVORK5CYII=';
const PNG = (nom: string) => ({ name: nom, mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') });

async function connexion(browser: Any, base: string, nom: string): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${nom}$`) }).click();
  await attendre(page);
  return { ctx, page };
}

async function cookie(base: string, compte: string): Promise<string> {
  const r = await fetch(`${base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  return (r.headers.getSetCookie() as string[]).map((c) => c.split(';')[0]).join('; ');
}
async function fichiers(base: string, ck: string): Promise<Any[]> {
  const r = await fetch(`${base}/api/univers/1/fichiers`, { headers: { cookie: ck } });
  return ((await r.json()) as Any).fichiers;
}
async function televerser(base: string, ck: string, section: number, f: Any, extra: Record<string, string> = {}): Promise<Response> {
  const fd = new FormData();
  fd.set('section', String(section));
  fd.set('maniere', 'joint');
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  fd.set('fichier', new Blob([f.buffer], { type: f.mimeType }), f.name);
  return fetch(`${base}/api/univers/1/fichiers`, { method: 'POST', headers: { cookie: ck }, body: fd });
}
async function ouvrirFiche(page: Any, id: number): Promise<void> {
  await page.goto(`/univers/1/fiche/${id}`);
  await attendre(page);
}
async function viaMenu(page: Any, declencheur: Any, entree: RegExp, fichier: Any): Promise<void> {
  await declencheur.click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: entree }).click()]);
  await fc.setFiles(fichier);
  await attendre(page);
  await page.waitForTimeout(600);
}
async function ouvrirMediatheque(page: Any): Promise<void> {
  await page.goto('/univers/1/mediatheque');
  await page.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await attendre(page);
}
const tuile = (page: Any, nom: string) => page.getByRole('button', { name: rx(nom) }).first();

describe('médiathèque — le parcours du critère de sortie (bouchon, monde semé)', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: { ctx: Any; page: Any };
  let lea: { ctx: Any; page: Any };
  let ckA: string;
  let ckL: string;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = await connexion(browser, srv.base, 'Antor');
    lea = await connexion(browser, srv.base, 'Léa');
    ckA = await cookie(srv.base, 'antor');
    ckL = await cookie(srv.base, 'lea');
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  it('antor_joint_un_pdf_a_description_lue_des_joueurs_il_entre_visible_des_joueurs', async () => {
    const p = antor.page;
    await ouvrirFiche(p, 12);
    const s = p.getByRole('region', { name: /Description/ });
    await viaMenu(p, s.getByRole('button', { name: 'Joindre un fichier' }), /Ajouter depuis l/, PDF('tarifs-du-port.pdf'));
    assert.match(await s.innerText(), /tarifs-du-port\.pdf/);
    const f = (await fichiers(srv.base, ckA)).find((x) => x.nom === 'tarifs-du-port.pdf');
    assert.ok(f, 'le PDF est dans la médiathèque');
    assert.equal(f.visibilite, 'joueurs');
    await ouvrirMediatheque(p);
    await p.screenshot({ path: '/tmp/work/shots/e19-antor.png', fullPage: true });
    const t = await texte(p);
    assert.match(t, /tarifs-du-port\.pdf/);
    await tuile(p, 'tarifs-du-port.pdf').click();
    await p.getByRole('button', { name: 'Fermer' }).waitFor();
    await attendre(p);
    assert.match(await texte(p), /Visible des joueurs/);
    assert.match(await texte(p), /Utilisé dans/);
  });

  it('antor_ajoute_plan_png_depuis_un_bloc_mj_il_entre_reserve_au_mj_et_avertit_pour_un_fichier_reserve_choisi', async () => {
    const p = antor.page;
    await ouvrirFiche(p, 12);
    const s = p.getByRole('region', { name: /Description/ });
    await s.getByRole('button', { name: 'Modifier' }).click();
    const ta = s.getByRole('textbox');
    await ta.fill('Avant\n\n:::mj\nLe secret\n:::\n\nAprès');
    await ta.evaluate((e: HTMLTextAreaElement) => {
      e.focus();
      const i = e.value.indexOf('Le secret');
      e.setSelectionRange(i, i);
    });
    await viaMenu(p, s.getByRole('button', { name: 'Fichier', exact: true }), /Ajouter depuis l/, PNG('plan.png'));
    const plan = (await fichiers(srv.base, ckA)).find((x) => x.nom === 'plan.png');
    assert.ok(plan, 'plan.png est dans la médiathèque');
    assert.equal(plan.visibilite, 'mj');
    // avertissement : pas pour le fichier réservé posé dans un bloc MJ
    assert.doesNotMatch(await texte(p), /Ce fichier est réservé au MJ/);
    // hors du bloc, on choisit « Plan secret de la Guilde » (réservé)
    await ta.evaluate((e: HTMLTextAreaElement) => {
      e.focus();
      e.setSelectionRange(e.value.length, e.value.length);
    });
    await s.getByRole('button', { name: 'Fichier', exact: true }).click();
    await p.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
    const boite = p.getByRole('dialog', { name: /Choisir un fichier/ });
    await boite.waitFor();
    await boite.getByRole('button', { name: rx('Plan secret de la Guilde') }).first().click();
    await attendre(p);
    await p.waitForTimeout(500);
    assert.match(await texte(p), /Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas\./);
    await p.screenshot({ path: '/tmp/work/shots/avertissement.png', fullPage: true });
    await s.getByRole('button', { name: 'Enregistrer' }).click();
    await attendre(p);
    // le choix ne change pas la visibilité
    const apres = (await fichiers(srv.base, ckA)).find((x) => x.nom === 'Plan secret de la Guilde');
    assert.equal(apres.visibilite, 'mj');
  });

  it('lea_telecharge_le_pdf_lit_image_reservee_au_mj_et_sa_mediatheque_ne_montre_ni_plan_ni_plan_secret', async () => {
    const p = lea.page;
    await ouvrirFiche(p, 12);
    const s = p.getByRole('region', { name: /Description/ });
    const t = await s.innerText();
    assert.match(t.replace(/’/g, "'"), /Image réservée au MJ\./);
    assert.doesNotMatch(t, /Le secret/);
    const [dl] = await Promise.all([p.waitForEvent('download'), s.getByRole('link', { name: /Télécharger/ }).first().click()]);
    assert.equal(dl.suggestedFilename(), 'tarifs-du-port.pdf');
    await p.screenshot({ path: '/tmp/work/shots/lea-description.png', fullPage: true });
    await ouvrirMediatheque(p);
    const m = await texte(p);
    assert.doesNotMatch(m, /plan\.png/);
    assert.doesNotMatch(m, /Plan secret/);
    assert.match(m, /tarifs-du-port\.pdf/);
    const noms = (await fichiers(srv.base, ckL)).map((x) => x.nom);
    assert.ok(!noms.includes('plan.png') && !noms.includes('Plan secret de la Guilde'));
    // la route des fichiers : adresse inconnue pour Léa, servie à Antor
    const plan = (await fichiers(srv.base, ckA)).find((x) => x.nom === 'plan.png');
    const secret = (await fichiers(srv.base, ckA)).find((x) => x.nom === 'Plan secret de la Guilde');
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${plan.id}`, { headers: { cookie: ckL } })).status, 404);
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${secret.id}`, { headers: { cookie: ckL } })).status, 404);
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${secret.id}`, { headers: { cookie: ckA } })).status, 200);
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${secret.id}`)).status === 200, false);
  });

  it('utilise_dans_ne_nomme_jamais_une_section_que_lea_ne_lit_pas', async () => {
    // Antor joint « Carte des Sphères » à « Vérité » de Port-Sel (MJ seul) : Léa ne doit pas voir cet usage.
    const p = antor.page;
    await ouvrirFiche(p, 12);
    const s = p.getByRole('region', { name: /Vérité/ });
    await s.getByRole('button', { name: 'Joindre un fichier' }).click();
    await p.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
    const boite = p.getByRole('dialog', { name: /Choisir un fichier/ });
    await boite.getByRole('button', { name: rx('Carte des Sphères') }).first().click();
    await attendre(p);
    await p.waitForTimeout(600);
    assert.match(await s.innerText(), /Carte des Sphères/);
    const q = lea.page;
    await ouvrirMediatheque(q);
    await tuile(q, 'Carte des Sphères').click();
    await q.getByRole('button', { name: 'Fermer' }).waitFor();
    await attendre(q);
    const t = await texte(q);
    assert.match(t, /Utilisé dans/);
    assert.match(t, /Val-Fortin/);
    assert.match(t, /Maître Aldric/);
    assert.doesNotMatch(t, /Vérité/);
    await q.screenshot({ path: '/tmp/work/shots/lea-utilise-dans.png', fullPage: true });
  });

  it('lea_ajoute_carnet_pdf_a_notes_de_la_table_elle_le_voit_teo_nulle_part', async () => {
    const a = antor.page;
    await a.goto('/univers/1');
    await attendre(a);
    await allerMembres(a);
    await ajouterMembre(a, 'teo', 'Joueur');
    const p = lea.page;
    await ouvrirFiche(p, 4);
    const s = p.getByRole('region', { name: /Notes de la table/ });
    await viaMenu(p, s.getByRole('button', { name: 'Joindre un fichier' }), /Ajouter depuis l/, PDF('carnet.pdf'));
    assert.match(await s.innerText(), /carnet\.pdf/);
    await ouvrirMediatheque(p);
    assert.match(await texte(p), /carnet\.pdf/);
    await tuile(p, 'carnet.pdf').click();
    await p.getByRole('button', { name: 'Fermer' }).waitFor();
    await attendre(p);
    assert.match(await texte(p), /ajouté par lea/);
    // Antor : « Réservé au MJ »
    const ckT = await cookie(srv.base, 'teo');
    const f = (await fichiers(srv.base, ckA)).find((x) => x.nom === 'carnet.pdf');
    assert.equal(f.visibilite, 'mj');
    assert.ok(!(await fichiers(srv.base, ckT)).some((x) => x.nom === 'carnet.pdf'));
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${f.id}`, { headers: { cookie: ckT } })).status, 404);
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${f.id}`, { headers: { cookie: ckL } })).status, 200);
    const t = await connexion(browser, srv.base, 'Teo');
    await ouvrirFiche(t.page, 4);
    const corps = await texte(t.page);
    assert.doesNotMatch(corps, /carnet\.pdf/);
    assert.doesNotMatch(corps, /Notes de la table/);
    await ouvrirMediatheque(t.page);
    assert.doesNotMatch(await texte(t.page), /carnet\.pdf/);
    await t.ctx.close();
  });
});

describe('médiathèque — réserver et supprimer « Carte des Sphères »', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  it('reserver_carte_liste_les_endroits_perdus_et_apres_confirmation_lea_lit_image_reservee_au_mj', async () => {
    const a = await connexion(browser, srv.base, 'Antor');
    const l = await connexion(browser, srv.base, 'Léa');
    const p = a.page;
    await ouvrirMediatheque(p);
    await tuile(p, 'Carte des Sphères').click();
    await p.getByRole('button', { name: 'Fermer' }).waitFor();
    await attendre(p);
    await p.getByText('Réservé au MJ', { exact: true }).first().click();
    const boite = p.getByRole('alertdialog').or(p.getByRole('dialog'));
    await boite.waitFor();
    const t = (await boite.innerText()).replace(/’/g, "'").replace(/[\u00a0\u202f]/g, ' ');
    assert.match(t, /Val-Fortin — « Description »/);
    assert.match(t, /Maître Aldric — « Apparence » \(jointe\)/);
    assert.match(t, /Port-Sel/);
    assert.doesNotMatch(t, /Les Docks/);
    await p.screenshot({ path: '/tmp/work/shots/reserver.png', fullPage: true });
    // avant confirmation, rien n'a changé
    assert.equal(((await fichiers(srv.base, await cookie(srv.base, 'lea'))) as Any[]).some((x) => x.nom === 'Carte des Sphères'), true);
    await boite.getByRole('button', { name: /^Annuler$/ }).click();
    assert.equal((await fichiers(srv.base, await cookie(srv.base, 'lea'))).some((x) => x.nom === 'Carte des Sphères'), true);
    await p.getByText('Réservé au MJ', { exact: true }).first().click();
    await p.getByRole('alertdialog').or(p.getByRole('dialog')).getByRole('button', { name: /^Réserver au MJ$/ }).click();
    await attendre(p);
    await p.waitForTimeout(500);
    assert.match(await texte(p), /Fichier réservé au MJ\./);
    for (const id of [8, 1, 12]) {
      await ouvrirFiche(l.page, id);
      assert.match(await texte(l.page), /Image réservée au MJ\./, `fiche ${id}`);
    }
    await l.page.screenshot({ path: '/tmp/work/shots/lea-reservee.png', fullPage: true });
    await ouvrirMediatheque(l.page);
    assert.doesNotMatch(await texte(l.page), /Carte des Sphères/);
    await a.ctx.close();
    await l.ctx.close();
  });

  it('supprimer_carte_liste_les_trois_fiches_puis_antor_voit_fichier_supprime_et_lea_rien', async () => {
    const a = await connexion(browser, srv.base, 'Antor');
    const l = await connexion(browser, srv.base, 'Léa');
    const p = a.page;
    await ouvrirMediatheque(p);
    await tuile(p, 'Carte des Sphères').click();
    await p.getByRole('button', { name: 'Fermer' }).waitFor();
    await attendre(p);
    await p.getByRole('button', { name: /Supprimer le fichier/ }).click();
    const boite = p.getByRole('alertdialog').or(p.getByRole('dialog'));
    await boite.waitFor();
    const t = (await boite.innerText()).replace(/’/g, "'").replace(/[\u00a0\u202f]/g, ' ');
    assert.match(t, /Elle est utilisée dans 3 fiches/);
    assert.match(t, /Port-Sel \(illustration\)/);
    assert.match(t, /Val-Fortin \(« Description »\)/);
    assert.match(t, /Maître Aldric \(pièces jointes de « Apparence »\)/);
    await boite.getByRole('button', { name: /^Supprimer le fichier$/ }).click();
    await attendre(p);
    await p.waitForTimeout(500);
    assert.match(await texte(p), /Fichier supprimé\./);
    await ouvrirFiche(p, 8);
    assert.match((await texte(p)).replace(/’/g, "'"), /Fichier supprimé de la médiathèque\./);
    await ouvrirFiche(l.page, 8);
    const tl = await texte(l.page);
    assert.doesNotMatch(tl, /Fichier supprimé/);
    assert.doesNotMatch(tl, /Image réservée/);
    await a.ctx.close();
    await l.ctx.close();
  });
});

describe('médiathèque — 100 fichiers joints au plus par section', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  it('antor_100_fichiers_joints_passent_le_101e_est_refuse_avec_le_message_du_mj', async () => {
    const ck = await cookie(srv.base, 'antor');
    // « Les Docks » / « Description » (section 18) porte 0 fichier joint à la base
    for (let i = 1; i <= 100; i++) {
      const r = await televerser(srv.base, ck, 18, PDF(`doc-${i}.pdf`, i));
      assert.equal(r.status < 300, true, `fichier ${i}: ${r.status}`);
    }
    const r = await televerser(srv.base, ck, 18, PDF('doc-101.pdf', 101));
    assert.equal(r.status >= 400, true);
    assert.ok(!(await fichiers(srv.base, ck)).some((x) => x.nom === 'doc-101.pdf'));
    const a = await connexion(browser, srv.base, 'Antor');
    await ouvrirFiche(a.page, 15);
    const s = a.page.getByRole('region', { name: /Description/ });
    await viaMenu(a.page, s.getByRole('button', { name: 'Joindre un fichier' }), /Ajouter depuis l/, PDF('doc-102.pdf', 102));
    assert.match(await texte(a.page), /Cette section porte déjà 100 fichiers joints\./);
    await a.page.screenshot({ path: '/tmp/work/shots/limite-mj.png', fullPage: true });
    assert.ok(!(await fichiers(srv.base, ck)).some((x) => x.nom === 'doc-102.pdf'));
    await a.ctx.close();
  });

  it('lea_100_fichiers_joints_passent_le_101e_est_refuse_avec_le_message_du_joueur', async () => {
    const ck = await cookie(srv.base, 'lea');
    // « Notes de la table » : section de Léa sur sa fiche (id 4)
    const fiche = (await (await fetch(`${srv.base}/api/univers/1/fiches/4`, { headers: { cookie: ck } })).json()) as Any;
    const sec = fiche.sections.find((x: Any) => x.titre === 'Notes de la table').id;
    for (let i = 1; i <= 100; i++) {
      const r = await televerser(srv.base, ck, sec, PDF(`note-${i}.pdf`, i));
      assert.equal(r.status < 300, true, `fichier ${i}: ${r.status}`);
    }
    const l = await connexion(browser, srv.base, 'Léa');
    await ouvrirFiche(l.page, 4);
    const s = l.page.getByRole('region', { name: /Notes de la table/ });
    await viaMenu(l.page, s.getByRole('button', { name: 'Joindre un fichier' }), /Ajouter depuis l/, PDF('note-101.pdf', 101));
    assert.match(await texte(l.page), /Cette section ne peut pas recevoir d'autre fichier\./);
    assert.ok(!(await fichiers(srv.base, ck)).some((x) => x.nom === 'note-101.pdf'));
    await l.ctx.close();
  });
});

describe('médiathèque — bords, refus et exclusions', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: { ctx: Any; page: Any };
  let lea: { ctx: Any; page: Any };
  let ckA: string;
  let ckL: string;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = await connexion(browser, srv.base, 'Antor');
    lea = await connexion(browser, srv.base, 'Léa');
    ckA = await cookie(srv.base, 'antor');
    ckL = await cookie(srv.base, 'lea');
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  it('fichier_visible_des_joueurs_utilise_seulement_dans_une_section_fermee_na_pas_dutilise_dans_pour_lea_et_est_non_utilise', async () => {
    const p = antor.page;
    // ajout direct dans la médiathèque : « Visible des joueurs » par défaut (B-55)
    await ouvrirMediatheque(p);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Ajouter des fichiers' }).click()]);
    await fc.setFiles(PDF('barème.pdf'));
    await attendre(p);
    await p.waitForTimeout(800);
    const f = (await fichiers(srv.base, ckA)).find((x) => x.nom === 'barème.pdf');
    assert.ok(f);
    assert.equal(f.visibilite, 'joueurs');
    // choisi pour « Vérité » (MJ seul) de Port-Sel : sa visibilité ne change pas
    await ouvrirFiche(p, 12);
    const s = p.getByRole('region', { name: /Vérité/ });
    await s.getByRole('button', { name: 'Joindre un fichier' }).click();
    await p.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
    await p.getByRole('dialog', { name: /Choisir un fichier/ }).getByRole('button', { name: rx('barème.pdf') }).first().click();
    await attendre(p);
    await p.waitForTimeout(600);
    assert.match(await s.innerText(), /barème\.pdf/);
    assert.equal((await fichiers(srv.base, ckA)).find((x) => x.nom === 'barème.pdf').visibilite, 'joueurs');
    const q = lea.page;
    await ouvrirMediatheque(q);
    await tuile(q, 'barème.pdf').click();
    await q.getByRole('button', { name: 'Fermer' }).waitFor();
    assert.doesNotMatch(await texte(q), /Utilisé dans/);
    // filtre « Non utilisés » : il paraît
    await q.getByRole('button', { name: 'Fermer' }).click();
    await q.locator('select').filter({ hasText: 'Non utilisés' }).selectOption({ label: 'Non utilisés' });
    await attendre(q);
    await q.getByText('barème.pdf').first().waitFor();
    assert.match(await texte(q), /barème\.pdf/);
  });

  it('un_joueur_na_ni_ajout_ni_visibilite_ni_suppression_sur_la_mediatheque_ni_joindre_sur_une_section_quil_ne_peut_pas_ecrire', async () => {
    const q = lea.page;
    await ouvrirMediatheque(q);
    const t = await texte(q);
    assert.doesNotMatch(t, /Ajouter des fichiers/);
    assert.doesNotMatch(t, /Visibilité/);
    await tuile(q, 'Carte des Sphères').click();
    await q.getByRole('button', { name: 'Fermer' }).waitFor();
    const panneau = await texte(q);
    assert.doesNotMatch(panneau, /Supprimer le fichier/);
    assert.doesNotMatch(panneau, /Réservé au MJ/);
    assert.equal(await q.getByRole('button', { name: 'Renommer le fichier' }).count(), 0);
    await ouvrirFiche(q, 12);
    const d = q.getByRole('region', { name: /Description/ });
    assert.equal(await d.getByRole('button', { name: 'Joindre un fichier' }).count(), 0);
    // aucun fichier réservé n'est servi à Léa, quelle que soit la route
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/11`, { headers: { cookie: ckL } })).status, 404);
    // et elle ne peut ni ajouter par la route des fichiers dans une section qu'elle ne peut pas écrire
    const r = await televerser(srv.base, ckL, 13, PDF('intrus.pdf'));
    assert.equal(r.status >= 400, true);
    assert.ok(!(await fichiers(srv.base, ckA)).some((x) => x.nom === 'intrus.pdf'));
  });

  it('un_fichier_vide_nest_pas_ajoute_et_le_message_le_dit', async () => {
    const p = antor.page;
    await ouvrirMediatheque(p);
    const avant = (await fichiers(srv.base, ckA)).length;
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Ajouter des fichiers' }).click()]);
    await fc.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
    await attendre(p);
    await p.waitForTimeout(800);
    assert.match((await texte(p)).replace(/’/g, "'"), /« notes\.txt » est vide\./);
    assert.equal((await fichiers(srv.base, ckA)).length, avant);
    // même refus pour un fichier vide joint à une section
    const r = await televerser(srv.base, ckA, 13, { name: 'vide.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) });
    assert.equal(r.status >= 400, true);
    assert.ok(!(await fichiers(srv.base, ckA)).some((x) => x.nom === 'vide.pdf'));
  });

  it('renommer_refuse_un_nom_vide_et_un_nom_de_201_caracteres_et_accepte_200', async () => {
    const p = antor.page;
    await ouvrirMediatheque(p);
    await tuile(p, 'Suie').click();
    await p.getByRole('button', { name: 'Fermer' }).waitFor();
    await p.getByRole('button', { name: 'Renommer le fichier' }).click();
    const champ = p.getByRole('textbox').last();
    await champ.fill('');
    await champ.press('Enter');
    await p.waitForTimeout(500);
    assert.match(await texte(p), /Erreur : le nom est obligatoire\./);
    await champ.fill('x'.repeat(201));
    await champ.press('Enter');
    await p.waitForTimeout(500);
    assert.match(await texte(p), /Erreur : 200 caractères au plus\./);
    assert.ok(!(await fichiers(srv.base, ckA)).some((x) => x.nom.startsWith('xxxx')));
    await champ.fill('y'.repeat(200));
    await champ.press('Enter');
    await attendre(p);
    await p.waitForTimeout(600);
    assert.ok((await fichiers(srv.base, ckA)).some((x) => x.nom === 'y'.repeat(200)));
  });

  it('la_bascule_documents_ne_montre_que_les_documents', async () => {
    const p = antor.page;
    await ouvrirMediatheque(p);
    await p.getByRole('radio', { name: 'Documents' }).click();
    await attendre(p);
    await p.waitForTimeout(500);
    const t = await texte(p);
    assert.match(t, /barème\.pdf/);
    assert.doesNotMatch(t, /Carte des Sphères/);
    assert.doesNotMatch(t, /Plan secret de la Guilde/);
    await p.screenshot({ path: '/tmp/work/shots/documents.png', fullPage: true });
  });

  it('retirer_un_fichier_joint_ote_la_reference_et_laisse_le_fichier_dans_la_mediatheque', async () => {
    const p = antor.page;
    await ouvrirFiche(p, 12);
    const s = p.getByRole('region', { name: /Description/ });
    await s.getByRole('button', { name: /Actions sur « port-sel-quais\.webp »/ }).click();
    await p.getByRole('menuitem', { name: /Retirer/ }).click();
    await p.getByRole('alertdialog').getByRole('button', { name: 'Retirer', exact: true }).click();
    await attendre(p);
    await p.waitForTimeout(600);
    assert.doesNotMatch(await s.innerText(), /port-sel-quais\.webp/);
    assert.ok((await fichiers(srv.base, ckA)).some((x) => x.nom === 'port-sel-quais.webp'));
  });

  it('illustration_reservee_au_mj_posee_par_le_selecteur_avertit_antor_et_lea_lit_image_reservee_au_mj_dans_len_tete', async () => {
    const p = antor.page;
    await ouvrirFiche(p, 15);
    await p.getByRole('button', { name: 'Ajouter une illustration' }).click();
    await p.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
    const boite = p.getByRole('dialog', { name: /Choisir un fichier/ });
    await boite.getByRole('button', { name: rx('Plan secret de la Guilde') }).first().click();
    await attendre(p);
    await p.waitForTimeout(800);
    assert.match(await texte(p), /Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas\./);
    await p.screenshot({ path: '/tmp/work/shots/illustration-avertie.png', fullPage: true });
    await ouvrirFiche(lea.page, 15);
    assert.match((await texte(lea.page)).replace(/’/g, "'"), /Image réservée au MJ\./);
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/11`, { headers: { cookie: ckL } })).status, 404);
  });
});

// A database written by the build before the media library (epic/kanevas-import at 5d4855f, stub world plus, through the
// old routes: « ancien-public.pdf » and « ancien-secret.pdf » (secret) on Port-Sel « Description », « ancien-mj.pdf » on
// the GM-only « Secret — MJ seul » of « Le Prieur masqué », an illustration on Port-Sel and one on « Rapport secret de
// l'amirauté », whose only section is GM-only). The current build migrates it at startup.
describe('médiathèque — migration des pièces jointes et illustrations d’avant', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let dir: string;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kanevas-avant-'));
    cpSync('src/e2e/fixtures/avant-mediatheque', dir, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '1', DB_PATH: join(dir, 'k.sqlite') });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('les_pieces_et_illustrations_d_avant_s_affichent_toujours_la_secrete_est_reservee_au_mj', async () => {
    const ckA = await cookie(srv.base, 'antor');
    const ckL = await cookie(srv.base, 'lea');
    const listeA = await fichiers(srv.base, ckA);
    const vis = (nom: string) => listeA.find((x) => x.nom === nom)?.visibilite;
    assert.equal(vis('ancien-public.pdf'), 'joueurs');
    assert.equal(vis('ancien-secret.pdf'), 'mj');
    assert.equal(vis('ancien-mj.pdf'), 'mj');
    const listeL = (await fichiers(srv.base, ckL)).map((x) => x.nom);
    assert.ok(listeL.includes('ancien-public.pdf'));
    assert.ok(!listeL.includes('ancien-secret.pdf'));
    assert.ok(!listeL.includes('ancien-mj.pdf'));
    // octets conservés
    const pub = listeA.find((x) => x.nom === 'ancien-public.pdf');
    const r = await fetch(`${srv.base}/api/univers/1/fichiers/${pub.id}`, { headers: { cookie: ckL } });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '%PDF-1.4\nancien public\n');
    const sec = listeA.find((x) => x.nom === 'ancien-secret.pdf');
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${sec.id}`, { headers: { cookie: ckL } })).status, 404);
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${sec.id}`, { headers: { cookie: ckA } })).status, 200);

    // à l'écran : Antor voit les deux pièces de Port-Sel, Léa seulement la publique
    const a = await connexion(browser, srv.base, 'Antor');
    await ouvrirFiche(a.page, 12);
    const ta = await a.page.getByRole('region', { name: /Description/ }).innerText();
    assert.match(ta, /ancien-public\.pdf/);
    assert.match(ta, /ancien-secret\.pdf/);
    await a.page.screenshot({ path: '/tmp/work/shots/migration-antor.png', fullPage: true });
    const l = await connexion(browser, srv.base, 'Léa');
    await ouvrirFiche(l.page, 12);
    const tl = await l.page.getByRole('region', { name: /Description/ }).innerText();
    assert.match(tl, /ancien-public\.pdf/);
    assert.doesNotMatch(tl, /ancien-secret\.pdf/);
    // illustrations : celle de Port-Sel (fiche lue) se charge pour Léa ; celle d'une fiche sans section lue reste au MJ
    const imgs: string[] = await l.page.locator('main img').evaluateAll((e: HTMLImageElement[]) => e.map((x) => x.src));
    assert.ok(imgs.length >= 1, 'illustration de Port-Sel visible de Léa');
    const ficheA = (await (await fetch(`${srv.base}/api/univers/1/fiches/23`, { headers: { cookie: ckA } })).json()) as Any;
    assert.ok(ficheA.illustration, 'Antor a toujours l’illustration du Rapport secret');
    const illA = await fetch(`${srv.base}/api/univers/1/fichiers/${ficheA.illustration.id}`, { headers: { cookie: ckA } });
    assert.equal(illA.status, 200);
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${ficheA.illustration.id}`, { headers: { cookie: ckL } })).status, 404);
    const f12 = (await (await fetch(`${srv.base}/api/univers/1/fiches/12`, { headers: { cookie: ckL } })).json()) as Any;
    assert.ok(f12.illustration);
    assert.equal((await fetch(`${srv.base}/api/univers/1/fichiers/${f12.illustration.id}`, { headers: { cookie: ckL } })).status, 200);
    await a.ctx.close();
    await l.ctx.close();
  });
});
