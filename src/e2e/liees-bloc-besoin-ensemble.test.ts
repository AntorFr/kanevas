// Tests d'ensemble de la feature kanevas-fiches-liees-bloc (B-64, part « Mentionnée dans » de B-69),
// écrits depuis la fiche de la feature, docs/parcours.md (B-64, B-69, P-17), docs/ecrans.md (E-9 « Fiches liées »),
// la maquette e09-lieu-liees.html et le contrat de la route GET …/fiches/:fid/liees d'ARCHITECTURE.md.
// Serveur réel en bouchon avec le semis + vrai Chromium. Les attendus sont des littéraux du besoin.
//
// PLAN (besoin -> cas -> preuve ; panne = ce qui ferait rougir le test)
//  B-64 nominal   Port-Sel/Antor : « S'y trouvent : Personnages (2) », Aldric + Prieur (panne : groupe/regroupement absent)
//                 sous-lieux compris : Suie « — Les Docks », (3), Kraken « — La Taverne du Kraken » (panne : descente absente)
//                 Guilde/Corvalis : « Membres : Personnages (2) » + qualificatifs (panne : nature lue à l'endroit)
//                 « Chercher parmi » -> E-17 pré-remplie
//  B-64 bords     Sphères : rien à son niveau -> case cochée+désactivée, « Rien à ce niveau ; 4 fiches… » ; singulier ;
//                 5 lignes puis « Afficher les 56 » puis suivants ; 50 niveaux ; bloc absent sur quête / sans relation ;
//                 qualificatif de 80 caractères à 360 px ; mémorisation de la case
//  B-64 échec     route 500 -> « Impossible de charger… » + Réessayer ; relecture échouée -> contenu gardé, case revenue ;
//                 connexion perdue -> bandeau, contrôles désactivés ; « Chargement… »
//  B-64 exclusions Léa : Prieur ni nommé ni compté (liste, comptes, totaux de la route) ; relation en section MJ ; fiche
//                 source MJ seul ; lieu MJ seul introuvable ; mode Joueur du MJ = Léa ; autre univers 404 ; via = lieu direct
//  B-69           « Mentionnée dans » ne liste plus les relations à nature, garde les libres et les liens
//  Marque disparu : Bran « Mort » sur sa ligne après « Marquer mort », pas avant ; le Prieur la porte d'emblée
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-liees-bloc-besoin-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const ids: Record<string, number> = {};

async function brut(page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; body: Any }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  let body: Any = null;
  try {
    body = await r.json();
  } catch {
    /* 204 */
  }
  return { status: r.status(), body };
}
async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await brut(page, method, url, data);
  assert.ok(r.status < 300, `${method} ${url} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
const liees = (page: Any, fid: number, qs = ''): Promise<{ status: number; body: Any }> =>
  brut(page, 'GET', `/api/univers/${U}/fiches/${fid}/liees${qs}`);

/** Crée une fiche à une section lisible (ou MJ seul) et rend { id, section }. */
async function creer(
  type: string,
  titre: string,
  opt: { parent?: number; lisible?: boolean; charge?: Any } = {},
): Promise<{ id: number; section: number }> {
  const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, {
    type,
    titre,
    ...(type === 'personnage' ? { charge: { pj: false } } : {}),
    ...(opt.charge ? { charge: opt.charge } : {}),
    ...(opt.parent ? { parent: opt.parent } : {}),
    sections: [{ titre: 'Notes', contenu: 'x', joueursLisent: opt.lisible !== false }],
  });
  const d = await api(antor, 'GET', `/api/univers/${U}/fiches/${f.id}`);
  ids[titre] = f.id;
  return { id: f.id, section: d.sections[0].id };
}
async function relier(ficheId: number, section: number, cible: number, nature: string | null, qualificatif?: string): Promise<void> {
  await api(antor, 'POST', `/api/univers/${U}/fiches/${ficheId}/sections/${section}/relations`, {
    cibleFicheId: cible,
    ...(nature ? { nature } : {}),
    ...(qualificatif ? { qualificatif } : {}),
  });
}
async function personneLiee(titre: string, cible: number, qualif?: string, lisible = true): Promise<number> {
  const p = await creer('personnage', titre, { lisible });
  await relier(p.id, p.section, cible, 'se_situe', qualif);
  return p.id;
}
let citeId = 0;
async function citeCinquanteSix(): Promise<number> {
  if (citeId) return citeId;
  const cite = await creer('lieu', 'Cité des Cinquante-Six');
  for (let i = 1; i <= 56; i++) await personneLiee(`Habitant ${String(i).padStart(2, '0')}`, cite.id, `rôle ${i}`);
  citeId = cite.id;
  return citeId;
}

async function ouvrir(page: Any, fid: number | string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${typeof fid === 'string' ? ids[fid] : fid}`);
  await page.locator('main h1, main [role=heading][aria-level="1"]').first().waitFor();
}
const bloc = (page: Any) => page.getByRole('region', { name: /^Fiches liées$/ });
async function blocPret(page: Any): Promise<Any> {
  const b = bloc(page);
  await b.waitFor();
  await b.getByText('Chargement…').waitFor({ state: 'detached' });
  return b;
}
const norm = (s: string): string => s.replace(/\s+/g, ' ').replace(/’/g, "'").trim();
const lignes = async (b: Any): Promise<string[]> => (await b.locator('li.ligne-liee').allInnerTexts()).map(norm);
const titres = async (b: Any): Promise<string[]> => (await b.locator('li.ligne-liee a.titre-liee').allInnerTexts()).map(norm);
async function photo(page: Any, nom: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
}

describe('kanevas-fiches-liees-bloc, le bloc « Fiches liées » (B-64)', { skip: skipBrowser }, () => {
  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = (us.find?.((u: Any) => u.nom === "Lame d'Ébène") ?? us.univers.find((u: Any) => u.nom === "Lame d'Ébène")).id;
    for (const t of ['personnage', 'lieu', 'faction', 'famille', 'creature']) {
      const p = await api(antor, 'GET', `/api/univers/${U}/fiches?type=${t}`);
      for (const f of p.fiches ?? p.items ?? []) ids[f.titre] = f.id;
    }
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // ---------- Nominal : Antor ----------

  test('antor_voit_les_personnages_qui_se_trouvent_a_port_sel_avant_mentionnee_dans', async () => {
    // panne : bloc absent, groupe mal intitulé, mal compté, ou placé après « Mentionnée dans »
    await ouvrir(antor, 'Port-Sel');
    const b = await blocPret(antor);
    const groupe = b.getByRole('region', { name: "S'y trouvent" });
    assert.equal(norm(await groupe.getByRole('heading', { level: 3 }).innerText()).replace(' Chercher parmi', ''), "S'y trouvent : Personnages (2)");
    assert.deepEqual(await titres(b), ['Le Prieur masqué', 'Maître Aldric']);
    const l = await lignes(b);
    assert.match(l[1], /Maître Aldric.*habite/);
    assert.match(l[0], /Le Prieur masqué.*se cache/);
    assert.equal(await b.getByText('Suie').count(), 0, 'Suie (aux Docks) ne se montre pas sans « sous-lieux compris »');
    assert.equal(await b.getByRole('checkbox', { name: 'sous-lieux compris' }).isChecked(), false);
    const yBloc = (await bloc(antor).boundingBox())!.y;
    const yMent = (await antor.getByRole('heading', { name: /^Mentionnée dans/ }).boundingBox())!.y;
    assert.ok(yBloc < yMent, `« Fiches liées » (${yBloc}) avant « Mentionnée dans » (${yMent})`);
    await photo(antor, 'port-sel-antor');
  });

  test('sous_lieux_compris_ajoute_suie_aux_docks_et_le_kraken_dans_son_groupe', async () => {
    // panne : la descente de l'arbre manque, ou le lieu intermédiaire n'est pas dit, ou le total ne bouge pas
    await ouvrir(antor, 'Port-Sel');
    const b = await blocPret(antor);
    await b.getByRole('checkbox', { name: 'sous-lieux compris' }).click();
    await b.getByText('Suie').waitFor();
    await b.getByText('Le Kraken des Cales').waitFor();
    const l = await lignes(b);
    assert.ok(l.some((x) => /^Suie.*— Les Docks$/.test(x)), l.join(' | '));
    assert.ok(l.some((x) => /^Le Kraken des Cales.*dort sous la taverne.*— La Taverne du Kraken$/.test(x)), l.join(' | '));
    const g = norm(await b.getByRole('region', { name: "S'y trouvent" }).getByRole('heading', { level: 3 }).innerText());
    assert.match(g, /^S'y trouvent : Personnages \(3\), Créatures \(1\)/);
    // Aldric et le Prieur, liés à Port-Sel même, ne portent pas de lieu
    assert.ok(l.some((x) => /^Maître Aldric.*habite$/.test(x)), l.join(' | '));
    await photo(antor, 'port-sel-sous-lieux');
    // la case est mémorisée par le navigateur
    await antor.reload();
    const b2 = await blocPret(antor);
    assert.equal(await b2.getByRole('checkbox', { name: 'sous-lieux compris' }).isChecked(), true);
    await b2.getByText('Suie').waitFor();
    await b2.getByRole('checkbox', { name: 'sous-lieux compris' }).click();
    await b2.getByText('Suie').waitFor({ state: 'detached' });
    await antor.reload();
    const b3 = await blocPret(antor);
    assert.equal(await b3.getByRole('checkbox', { name: 'sous-lieux compris' }).isChecked(), false);
  });

  test('chercher_parmi_ouvre_e17_prerempli_sous_lieux_compris', async () => {
    // panne : lien sans filtre, mauvaise nature, ou « sous-lieux » perdu
    await antor.evaluate(() => localStorage.clear());
    await ouvrir(antor, 'Port-Sel');
    const b = await blocPret(antor);
    await b.getByRole('checkbox', { name: 'sous-lieux compris' }).click();
    await b.getByText('Suie').waitFor();
    await b.getByRole('link', { name: 'Chercher parmi' }).first().click();
    await antor.waitForURL(/\/recherche\?/);
    const u = new URL(antor.url());
    assert.equal(u.searchParams.get('lie'), String(ids['Port-Sel']));
    assert.equal(u.searchParams.get('nature'), 'se_situe');
    assert.equal(u.searchParams.get('descendants'), '1');
    await antor.getByText('Lié à').first().waitFor();
    await antor.getByText('Chargement…').first().waitFor({ state: 'detached' });
    await antor.getByText('Suie').first().waitFor();
    const t = norm(await antor.locator('main').innerText());
    assert.match(t, /Lié à/);
    assert.match(t, /Port-Sel/);
    assert.match(t, /s'y trouvent/);
    assert.equal(await antor.getByRole('checkbox', { name: /sous-lieux compris/ }).isChecked(), true);
    await antor.getByText('Suie').first().waitFor();
    await photo(antor, 'chercher-parmi');
    await antor.evaluate(() => localStorage.clear());
  });

  test('guilde_des_brumes_membres_avec_leur_qualificatif', async () => {
    // panne : nature lue à l'endroit (la Guilde « membre de »), ou qualificatif perdu
    await ouvrir(antor, 'La Guilde des Brumes');
    const b = await blocPret(antor);
    const g = b.getByRole('region', { name: 'Membres' });
    assert.equal(norm(await g.getByRole('heading', { level: 3 }).innerText()).replace(' Chercher parmi', ''), 'Membres : Personnages (2)');
    const l = await lignes(b);
    assert.equal(l.length, 2);
    assert.match(l.find((x) => x.startsWith('Maître Aldric'))!, /trésorier/);
    assert.match(l.find((x) => x.startsWith('Dame Ombeline de Val-Fortin'))!, /dirige/);
    assert.equal(await b.getByRole('checkbox', { name: 'sous-lieux compris' }).count(), 0, 'la bascule est propre aux lieux');
    await photo(antor, 'guilde');
  });

  test('corvalis_bran_porte_la_marque_mort_seulement_apres_marquer_mort', async () => {
    // panne : la ligne n'utilise pas le composant marqué, ou le bloc n'est pas relu après le geste
    await ouvrir(antor, 'Les Corvalis');
    let b = await blocPret(antor);
    assert.equal(norm(await b.getByRole('region', { name: 'Membres' }).getByRole('heading', { level: 3 }).innerText()).replace(' Chercher parmi', ''), 'Membres : Personnages (2)');
    const l = await lignes(b);
    assert.match(l.find((x) => x.startsWith('Bran Corvalis'))!, /aîné/);
    assert.match(l.find((x) => x.startsWith('Dame Ombeline'))!, /veuve/);
    assert.equal(await b.getByRole('img', { name: 'Mort' }).count(), 0, 'pas de marque avant le geste');
    await ouvrir(antor, 'Bran Corvalis');
    await antor.getByRole('button', { name: /^Autres actions sur « Bran Corvalis »/ }).click();
    await antor.getByRole('menuitem', { name: 'Marquer mort' }).click();
    await antor.getByText('Mort', { exact: true }).first().waitFor();
    await ouvrir(antor, 'Les Corvalis');
    b = await blocPret(antor);
    const ligneBran = b.locator('li.ligne-liee').filter({ hasText: 'Bran Corvalis' });
    await ligneBran.getByRole('img', { name: 'Mort' }).waitFor();
    assert.equal(await b.locator('li.ligne-liee').filter({ hasText: 'Dame Ombeline' }).getByRole('img', { name: 'Mort' }).count(), 0);
    await photo(antor, 'corvalis-bran-mort');
  });

  test('le_prieur_mort_au_semis_porte_la_marque_dans_le_bloc_de_port_sel', async () => {
    // panne : le bloc rend ses lignes sans la marque partagée
    await ouvrir(antor, 'Port-Sel');
    const b = await blocPret(antor);
    await b.locator('li.ligne-liee').filter({ hasText: 'Le Prieur masqué' }).getByRole('img', { name: 'Mort' }).waitFor();
    assert.equal(await b.locator('li.ligne-liee').filter({ hasText: 'Maître Aldric' }).getByRole('img', { name: 'Mort' }).count(), 0);
  });

  // ---------- Bords ----------

  test('les_spheres_rien_a_son_niveau_case_cochee_desactivee_et_la_phrase', async () => {
    // panne : le bloc disparaît, ou la case reste libre, ou la phrase se trompe de total
    await antor.evaluate(() => localStorage.clear());
    await ouvrir(antor, 'Les Sphères');
    const b = await blocPret(antor);
    const c = b.getByRole('checkbox', { name: 'sous-lieux compris' });
    assert.equal(await c.isChecked(), true);
    assert.equal(await c.isDisabled(), true);
    assert.match(norm(await b.innerText()), /Rien à ce niveau ; 4 fiches dans ses sous-lieux\./);
    const l = await lignes(b);
    assert.ok(l.some((x) => /^Maître Aldric.*— Port-Sel$/.test(x)), l.join(' | '));
    assert.ok(l.some((x) => /^Suie.*— Les Docks$/.test(x)), l.join(' | '));
    await photo(antor, 'spheres');
  });

  test('un_seul_sous_lieu_lisible_dit_1_fiche_au_singulier', async () => {
    // panne : « 1 fiches », ou le bloc est absent quand le niveau propre est vide
    const haut = await creer('lieu', 'Haut-Pays');
    const bas = await creer('lieu', 'Bas-Pays', { parent: haut.id });
    await personneLiee('Seul Habitant', bas.id);
    await ouvrir(antor, haut.id);
    const b = await blocPret(antor);
    assert.match(norm(await b.innerText()), /Rien à ce niveau ; 1 fiche dans ses sous-lieux\./);
    assert.equal(await b.getByRole('checkbox', { name: 'sous-lieux compris' }).isDisabled(), true);
    const l = await lignes(b);
    assert.ok(l.some((x) => /^Seul Habitant.*— Bas-Pays$/.test(x)), l.join(' | '));
  });

  test('lieu_sans_aucune_fiche_liee_et_fiche_non_cible_nont_pas_de_bloc', async () => {
    // panne : un bloc vide ou un en-tête orphelin
    const vide = await creer('lieu', 'Lieu Vide');
    await ouvrir(antor, vide.id);
    await antor.getByRole('heading', { level: 1, name: 'Lieu Vide' }).waitFor();
    await attendre(antor);
    assert.equal(await bloc(antor).count(), 0);
    assert.equal(norm(await antor.locator('main').innerText()).includes('Fiches liées'), false);
    await ouvrir(antor, 'Maître Aldric');
    await antor.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await attendre(antor);
    assert.equal(await bloc(antor).count(), 0, 'un personnage n\'est cible d\'aucune nature');
  });

  test('une_quete_na_pas_de_bloc_fiches_liees', async () => {
    // panne : le registre rend le bloc pour tous les types
    const q = await creer('quete', 'Quête du test');
    await ouvrir(antor, q.id);
    await antor.getByRole('heading', { level: 1, name: 'Quête du test' }).waitFor();
    await attendre(antor);
    assert.equal(await bloc(antor).count(), 0);
    assert.equal(norm(await antor.locator('main').innerText()).includes('Fiches liées'), false);
  });

  test('cinquante_six_personnages_cinq_lignes_puis_afficher_les_56_par_pages', async () => {
    // panne : tout est chargé d'un coup, ou le bouton ne pagine pas, ou le total est celui de la page
    await ouvrir(antor, await citeCinquanteSix());
    const b = await blocPret(antor);
    assert.match(norm(await b.getByRole('region', { name: "S'y trouvent" }).getByRole('heading', { level: 3 }).innerText()), /^S'y trouvent : Personnages \(56\)/);
    assert.equal((await lignes(b)).length, 5);
    await b.getByRole('button', { name: 'Afficher les 56' }).click();
    await b.getByRole('button', { name: /^Afficher les \d+ suivants$/ }).waitFor();
    const apres = (await lignes(b)).length;
    assert.ok(apres >= 50 && apres < 56, `une page de 50 de plus : ${apres} lignes`);
    const reste = 56 - apres;
    assert.equal(await b.getByRole('button', { name: `Afficher les ${reste} suivants` }).count(), 1);
    await b.getByRole('button', { name: /^Afficher les \d+ suivants$/ }).click();
    await b.locator('li.ligne-liee').nth(55).waitFor();
    assert.equal((await lignes(b)).length, 56);
    assert.equal(await b.getByRole('button', { name: /^Afficher les/ }).count(), 0);
    assert.equal(new Set(await titres(b)).size, 56, 'aucune fiche en double ni perdue');
    await photo(antor, 'cinquante-six');
  });

  test('cinquante_niveaux_de_sous_lieux_la_case_le_dit', async () => {
    // panne : la descente est sans borne ou la borne n'est pas dite
    const racine = await creer('lieu', 'Racine Profonde');
    let parent = racine.id;
    for (let i = 1; i <= 50; i++) parent = (await creer('lieu', `Niveau ${i}`, { parent })).id;
    await personneLiee('Au Fond', parent);
    const r = await liees(antor, racine.id, '?descendants=1');
    assert.equal(r.status, 200);
    assert.equal(r.body.profondeurAtteinte, true);
    await antor.evaluate(() => localStorage.clear());
    await ouvrir(antor, racine.id);
    const b = await blocPret(antor);
    await b.getByText('sous-lieux compris (50 niveaux au plus)').waitFor();
  });

  test('qualificatif_de_80_caracteres_sur_telephone_passe_a_la_ligne_et_reste_entier_en_infobulle', async () => {
    // panne : débordement horizontal, ou texte tronqué sans infobulle
    const q = 'a'.repeat(10) + ' ' + 'b'.repeat(10) + ' ' + 'c'.repeat(10) + ' ' + 'd'.repeat(10) + ' ' + 'e'.repeat(10) + ' ' + 'f'.repeat(10) + ' ' + 'g'.repeat(14);
    assert.equal(q.length, 80);
    const lieu = await creer('lieu', 'Lieu Qualificatif');
    await personneLiee('Bavard', lieu.id, q);
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 360, height: 740 } });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    await p.goto('/connexion-bouchon');
    await p.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
    await p.waitForLoadState('networkidle');
    await ouvrir(p, lieu.id);
    const b = await blocPret(p);
    const ligne = b.locator('li.ligne-liee').filter({ hasText: 'Bavard' });
    assert.equal(await ligne.locator('[title]').filter({ hasText: q.slice(0, 10) }).first().getAttribute('title'), q);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'pas de défilement horizontal');
    await photo(p, 'qualificatif-360');
    await ctx.close();
  });

  // ---------- Exclusions : Léa et les droits ----------

  test('lea_lit_personnages_1_aldric_le_prieur_ni_nomme_ni_compte', async () => {
    // panne : la garde de la section « Secret — MJ seul » absente de la liste ou du compte
    await lea.evaluate(() => localStorage.clear());
    await ouvrir(lea, 'Port-Sel');
    const b = await blocPret(lea);
    assert.equal(norm(await b.getByRole('region', { name: "S'y trouvent" }).getByRole('heading', { level: 3 }).innerText()).replace(' Chercher parmi', ''), "S'y trouvent : Personnages (1)");
    assert.deepEqual(await titres(b), ['Maître Aldric']);
    assert.equal(norm(await lea.locator('main').innerText()).includes('Prieur'), false, 'le Prieur n\'est nommé nulle part pour Léa');
    // la case reste offerte à tout rôle sur un lieu ; les comptes sous-lieux sont ceux de Léa
    await b.getByRole('checkbox', { name: 'sous-lieux compris' }).click();
    await b.getByText('Suie').waitFor();
    const g = norm(await b.getByRole('region', { name: "S'y trouvent" }).getByRole('heading', { level: 3 }).innerText());
    assert.match(g, /^S'y trouvent : Personnages \(2\), Créatures \(1\)/);
    assert.equal(norm(await lea.locator('main').innerText()).includes('Prieur'), false);
    await photo(lea, 'port-sel-lea');
    await lea.evaluate(() => localStorage.clear());
  });

  test('mentionnee_dans_ne_liste_plus_les_relations_a_nature_mais_garde_les_libres_et_les_liens', async () => {
    // panne : « habite » (relation à nature d'Aldric) encore listée dans « Mentionnée dans »
    for (const page of [antor, lea]) {
      await ouvrir(page, 'Port-Sel');
      await blocPret(page);
      const m = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Mentionnée dans/ }) }).last();
      const t = norm(await m.innerText());
      assert.ok(t.includes('Maître Aldric'), t);
      assert.ok(t.includes('maître de port'), 'relation libre gardée : ' + t);
      assert.ok(t.includes('lien dans « Apparence »'), 'lien gardé : ' + t);
      assert.equal(t.includes('habite'), false, 'relation à nature absente : ' + t);
      assert.equal(t.includes('se cache'), false, t);
    }
    await ouvrir(antor, 'Port-Sel');
    const ma = norm(await antor.locator('section').filter({ has: antor.getByRole('heading', { name: /^Mentionnée dans/ }) }).last().innerText());
    assert.ok(ma.includes('La Guilde des Brumes') && ma.includes('y fait passer ses cargaisons'), ma);
  });

  test('lea_ne_lit_pas_les_spheres_et_n_a_aucun_bloc_dessus', async () => {
    // panne : le lieu MJ seul trahi par son bloc
    await ouvrir(lea, 'Les Sphères');
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await bloc(lea).count(), 0);
    const r = await liees(lea, ids['Les Sphères']);
    assert.equal(r.status, 404);
  });

  test('bloc_absent_sans_trace_pour_lea_quand_rien_n_est_lisible_pour_elle', async () => {
    // panne : un bloc vide, un « 0 » ou un titre de groupe pour une fiche cachée
    const lieu = await creer('lieu', 'Lieu Aux Secrets');
    await personneLiee('Complice Caché', lieu.id, 'tapi', false);
    await ouvrir(lea, lieu.id);
    await lea.getByRole('heading', { level: 1, name: 'Lieu Aux Secrets' }).waitFor();
    await attendre(lea);
    assert.equal(await bloc(lea).count(), 0);
    const t = norm(await lea.locator('main').innerText());
    assert.equal(t.includes('Fiches liées'), false);
    assert.equal(t.includes('Complice'), false);
    assert.equal(t.includes('Rien à ce niveau'), false);
    const r = await liees(lea, lieu.id, '?descendants=1');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.groupes, []);
    await ouvrir(antor, lieu.id);
    const b = await blocPret(antor);
    assert.deepEqual(await titres(b), ['Complice Caché']);
  });

  // ---------- Route ----------

  test('route_rend_les_totaux_avec_et_sans_descendants_par_type', async () => {
    // panne : un total absent, ou égal à l'autre, ou un type manquant
    const r = await liees(antor, ids['Port-Sel'], '?descendants=1');
    assert.equal(r.status, 200);
    assert.equal(r.body.profondeurAtteinte, false);
    assert.equal(r.body.groupes.length, 1);
    const g = r.body.groupes[0];
    assert.equal(g.nature, 'se_situe');
    assert.equal(g.libelle, "s'y trouvent");
    assert.deepEqual(g.types, [
      { type: 'personnage', total: 2, totalAvecDescendants: 3 },
      { type: 'creature', total: 0, totalAvecDescendants: 1 },
    ]);
    const sans = await liees(antor, ids['Port-Sel']);
    assert.deepEqual(sans.body.groupes[0].types[0], { type: 'personnage', total: 2, totalAvecDescendants: 3 });
    assert.deepEqual(
      sans.body.groupes[0].fiches.map((f: Any) => f.titre).sort(),
      ['Le Prieur masqué', 'Maître Aldric'],
      'sans descendants, les lignes sont celles du niveau',
    );
    const guilde = await liees(antor, ids['La Guilde des Brumes']);
    assert.deepEqual(guilde.body.groupes.map((x: Any) => [x.nature, x.libelle, x.types]), [
      ['membre', 'membres', [{ type: 'personnage', total: 2, totalAvecDescendants: 2 }]],
    ]);
  });

  test('route_en_mode_joueur_rend_les_comptes_de_lea_et_aucun_secret', async () => {
    // panne : le MJ en mode Joueur lit plus que Léa, ou un total trahit le Prieur
    const ml = await liees(antor, ids['Port-Sel'], '?mode=joueur&descendants=1');
    const l = await liees(lea, ids['Port-Sel'], '?descendants=1');
    for (const r of [ml, l]) {
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.groupes[0].types, [
        { type: 'personnage', total: 1, totalAvecDescendants: 2 },
        { type: 'creature', total: 0, totalAvecDescendants: 1 },
      ]);
      assert.equal(JSON.stringify(r.body).includes('Prieur'), false);
    }
    const ms = await liees(antor, ids['Les Sphères'], '?mode=joueur');
    assert.equal(ms.status, 404, 'le MJ en mode Joueur ne lit pas un lieu MJ seul');
  });

  test('route_fiche_inconnue_ou_d_un_autre_univers_est_introuvable', async () => {
    // panne : 200 vide ou 500 au lieu du 404 du reste de l'API
    assert.equal((await liees(antor, 999999)).status, 404);
    const autre = await api(antor, 'GET', '/api/univers');
    const u2 = (autre.find?.((u: Any) => u.id !== U) ?? autre.univers.find((u: Any) => u.id !== U)).id;
    const r = await brut(antor, 'GET', `/api/univers/${u2}/fiches/${ids['Port-Sel']}/liees`);
    assert.equal(r.status, 404);
    const anon = await browser.newContext({ baseURL: srv.base });
    const rr = await anon.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Port-Sel']}/liees`);
    assert.ok([401, 403].includes(rr.status()), `sans session : ${rr.status()}`);
    await anon.close();
  });

  test('route_pagine_un_groupe_par_50_sans_perte_ni_doublon', async () => {
    // panne : curseur ignoré, page de 5 répétée, ou fiches perdues entre deux pages
    const cite = await citeCinquanteSix();
    const p1 = await liees(antor, cite);
    const g1 = p1.body.groupes[0];
    assert.equal(g1.fiches.length, 5);
    assert.equal(g1.types[0].total, 56);
    assert.ok(g1.suivant !== null && g1.suivant !== undefined);
    const vus = new Set<string>();
    let curseur: string | number | null = g1.suivant;
    let pages = 0;
    const tailles: number[] = [];
    while (curseur !== null && curseur !== undefined && pages < 5) {
      const r = await liees(antor, cite, `?nature=se_situe&curseur=${curseur}`);
      assert.equal(r.status, 200);
      const g = r.body.groupes[0];
      tailles.push(g.fiches.length);
      for (const f of g.fiches) vus.add(f.titre);
      curseur = g.suivant;
      pages++;
    }
    assert.deepEqual(tailles, [50, 1]);
    for (const f of g1.fiches) vus.add(f.titre);
    assert.equal(vus.size, 56);
  });

  test('route_nature_symetrique_se_lit_des_deux_cotes', async () => {
    // panne : « allié de » lu d'un seul côté (la fiche cible seule)
    const a = await creer('faction', 'Ligue Alpha');
    const b = await creer('faction', 'Ligue Beta');
    await relier(a.id, a.section, b.id, 'allie', 'pacte de sel');
    for (const [moi, autre] of [[a.id, 'Ligue Beta'], [b.id, 'Ligue Alpha']] as const) {
      const r = await liees(antor, moi);
      assert.equal(r.status, 200);
      const g = r.body.groupes.find((x: Any) => x.nature === 'allie');
      assert.ok(g, JSON.stringify(r.body));
      assert.equal(g.libelle, 'allié de');
      assert.deepEqual(g.fiches.map((f: Any) => f.titre), [autre]);
      assert.equal(g.fiches[0].qualificatif, 'pacte de sel');
    }
    await ouvrir(antor, b.id);
    const bl = await blocPret(antor);
    assert.deepEqual(await titres(bl), ['Ligue Alpha']);
  });

  test('route_via_nomme_le_lieu_direct_jamais_un_lieu_intermediaire', async () => {
    // panne : « via » = le lieu intermédiaire ou un chemin
    const haut = await creer('lieu', 'Royaume Haut');
    const milieu = await creer('lieu', 'Comté Milieu', { parent: haut.id });
    const bas = await creer('lieu', 'Hameau Bas', { parent: milieu.id });
    await personneLiee('Hameaudier', bas.id);
    const r = await liees(antor, haut.id, '?descendants=1');
    const g = r.body.groupes[0];
    assert.deepEqual(g.types, [{ type: 'personnage', total: 0, totalAvecDescendants: 1 }]);
    assert.deepEqual(g.fiches.map((f: Any) => [f.titre, f.via]), [['Hameaudier', { id: bas.id, titre: 'Hameau Bas' }]]);
    assert.equal(JSON.stringify(r.body).includes('Comté Milieu'), false);
  });

  test('route_exclut_pour_lea_la_relation_en_section_mj_et_la_fiche_source_mj_seul', async () => {
    // panne : un des deux gardes d'AD-64 retiré du compte ou des lignes
    const lieu = await creer('lieu', 'Lieu Deux Gardes');
    await personneLiee('Source Visible', lieu.id, 'là');
    await personneLiee('Source Mj Seul', lieu.id, 'caché', false);
    // relation tenue par une section MJ seul d'une fiche par ailleurs lisible
    const p = await api(antor, 'POST', `/api/univers/${U}/fiches`, {
      type: 'personnage', titre: 'Double Section', charge: { pj: false },
      sections: [{ titre: 'Public', contenu: 'x', joueursLisent: true }, { titre: 'Secret', contenu: 'y', joueursLisent: false }],
    });
    const d = await api(antor, 'GET', `/api/univers/${U}/fiches/${p.id}`);
    const secret = d.sections.find((s: Any) => s.titre === 'Secret').id;
    await relier(p.id, secret, lieu.id, 'se_situe', 'terré');
    const m = await liees(antor, lieu.id);
    assert.deepEqual(m.body.groupes[0].types, [{ type: 'personnage', total: 3, totalAvecDescendants: 3 }]);
    const l = await liees(lea, lieu.id);
    assert.deepEqual(l.body.groupes[0].types, [{ type: 'personnage', total: 1, totalAvecDescendants: 1 }]);
    assert.deepEqual(l.body.groupes[0].fiches.map((f: Any) => f.titre), ['Source Visible']);
    assert.equal(JSON.stringify(l.body).includes('Double Section'), false);
    assert.equal(JSON.stringify(l.body).includes('Mj Seul'), false);
  });

  // ---------- États ----------

  test('erreur_de_la_route_dit_impossible_de_charger_et_reessayer_relit', async () => {
    // panne : erreur avalée, bloc qui disparaît, ou « Réessayer » sans effet ; le reste de la fiche reste lisible
    let panne = true;
    await antor.route(/\/fiches\/\d+\/liees/, (route: Any) =>
      panne ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boum"}' }) : route.continue());
    await ouvrir(antor, 'Port-Sel');
    const b = bloc(antor);
    await b.getByText('Impossible de charger les fiches liées.').waitFor();
    await antor.getByText('Un port de sel et de brume').waitFor();
    await photo(antor, 'erreur');
    panne = false;
    await b.getByRole('button', { name: 'Réessayer' }).click();
    await b.getByText('Maître Aldric').waitFor();
    assert.equal(await b.getByText('Impossible de charger les fiches liées.').count(), 0);
    await antor.unroute(/\/fiches\/\d+\/liees/);
  });

  test('chargement_dit_chargement_dans_le_bloc_et_la_fiche_reste_lisible', async () => {
    // panne : bloc invisible jusqu'à la réponse
    let lacher: () => void = () => undefined;
    const attente = new Promise<void>((r) => (lacher = r));
    await antor.route(/\/fiches\/\d+\/liees/, async (route: Any) => {
      await attente;
      await route.continue();
    });
    await ouvrir(antor, 'Port-Sel');
    const b = bloc(antor);
    await b.getByText('Chargement…').waitFor();
    await antor.getByText('Un port de sel et de brume').waitFor();
    lacher();
    await b.getByText('Maître Aldric').waitFor();
    await antor.unroute(/\/fiches\/\d+\/liees/);
  });

  test('relecture_echouee_garde_le_contenu_et_remet_la_case_dans_l_etat_affiche', async () => {
    // panne : case restée cochée sur un contenu non descendant, ou contenu vidé par l'échec
    await antor.evaluate(() => localStorage.clear());
    await ouvrir(antor, 'Port-Sel');
    const b = await blocPret(antor);
    await antor.route(/\/fiches\/\d+\/liees\?.*descendants=1/, (route: Any) => route.fulfill({ status: 500, body: '{}' }));
    await b.getByRole('checkbox', { name: 'sous-lieux compris' }).click();
    await b.getByText('Impossible de charger les fiches liées.').waitFor();
    assert.deepEqual(await titres(b), ['Le Prieur masqué', 'Maître Aldric']);
    assert.equal(await b.getByRole('checkbox', { name: 'sous-lieux compris' }).isChecked(), false);
    await antor.unroute(/\/fiches\/\d+\/liees\?.*descendants=1/);
    await b.getByRole('button', { name: 'Réessayer' }).click();
    await b.getByText('Impossible de charger les fiches liées.').waitFor({ state: 'detached' });
    assert.deepEqual(await titres(b), ['Le Prieur masqué', 'Maître Aldric']);
    await antor.evaluate(() => localStorage.clear());
  });

  test('connexion_perdue_bandeau_et_controles_qui_interrogent_le_serveur_desactives', async () => {
    // panne : la case ou « Afficher les N » reste active hors connexion, ou le contenu chargé disparaît
    await antor.evaluate(() => localStorage.clear());
    await ouvrir(antor, await citeCinquanteSix());
    const b = await blocPret(antor);
    await b.getByRole('button', { name: 'Afficher les 56' }).waitFor();
    await antor.context().setOffline(true);
    try {
      await antor.getByText(/^Connexion perdue\./).first().waitFor();
      assert.equal(await b.getByRole('button', { name: 'Afficher les 56' }).isDisabled(), true);
      assert.equal(await b.getByRole('checkbox', { name: 'sous-lieux compris' }).isDisabled(), true);
      assert.equal((await lignes(b)).length, 5, 'le contenu chargé reste lisible');
      await photo(antor, 'connexion-perdue');
    } finally {
      await antor.context().setOffline(false);
    }
    await antor.getByText(/^Connexion perdue\./).first().waitFor({ state: 'detached' });
    await b.getByRole('button', { name: 'Afficher les 56' }).waitFor();
    assert.equal(await b.getByRole('button', { name: 'Afficher les 56' }).isDisabled(), false);
  });
});
