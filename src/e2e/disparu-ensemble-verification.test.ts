// Black-box tests of kanevas-fiches-liees-disparu (B-67, B-68 part `disparu`), written from the
// feature's exit criterion, docs/parcours.md and docs/ecrans.md « the gone mark » — not from the code.
// Real server in stub mode with the seed + real Chromium. Every expected value is a literal of the docs.
// Waits are on what the screen shows (a toast, an element appearing), never networkidle or a delay.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-disparu-ensemble-shots';
const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let UKANKA = 0;
const ids: Record<string, number> = {};

async function req(page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; body: Any }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  const txt = await r.text();
  let body: Any = null;
  try {
    body = JSON.parse(txt);
  } catch {
    body = txt;
  }
  return { status: r.status(), body };
}
async function titres(page: Any, query: string): Promise<string[]> {
  const r = await req(page, 'GET', `/api/univers/${U}/fiches?${query}`);
  assert.equal(r.status, 200, query);
  return r.body.fiches.map((f: Any) => f.titre as string).sort();
}
async function marquer(titre: string, disparu: boolean): Promise<Any> {
  return req(antor, 'PATCH', `/api/univers/${U}/fiches/${ids[titre]}`, { disparu });
}
async function ouvrir(page: Any, titre: string, query = ''): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}${query}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
}
async function ouvrirMenu(page: Any, titre: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^Autres actions sur « ${titre} »`) }).click();
  await page.getByRole('menuitem').first().waitFor();
}
async function liste(page: Any, slug: string, query = ''): Promise<void> {
  await page.goto(`/univers/${U}/fiches/${slug}${query}`);
  await page.locator('main h1').first().waitFor();
}
const carte = (page: Any, titre: string) => page.getByRole('link', { name: new RegExp(titre) });
const pastille = (page: Any, mot: string) => page.getByText(mot, { exact: true });
async function photo(page: Any, nom: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${nom}.png` });
}

before(async () => {
  if (skipBrowser) return;
  mkdirSync(SHOTS, { recursive: true });
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  const us = (await req(antor, 'GET', '/api/univers')).body as Any[];
  U = us.find((u) => u.nom === "Lame d'Ébène").id;
  UKANKA = us.find((u) => u.nom === 'Essai Kanka').id;
  const fs = (await req(antor, 'GET', `/api/univers/${U}/fiches`)).body.fiches as Any[];
  for (const f of fs) ids[f.titre] = f.id;
  ids['La Dette'] = (await req(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'quete', titre: 'La Dette' })).body.id;
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

describe('B-67 par l’API : marquer, lire, filtrer', { skip: skipBrowser }, () => {
  test('antor_marque_bran_mort_puis_vivant_et_les_filtres_suivent', async () => {
    // Panne visée : le PATCH n'écrit pas la clé, ou le filtre `etat` ignore la charge.
    assert.deepEqual(await titres(antor, 'type=personnage&etat=disparu'), ['Le Prieur masqué']);
    const r = await marquer('Bran Corvalis', true);
    assert.equal(r.status, 200);
    assert.equal(r.body.charge.disparu, true);
    assert.deepEqual(await titres(antor, 'type=personnage&etat=disparu'), ['Bran Corvalis', 'Le Prieur masqué']);
    const vivants = await titres(antor, 'type=personnage&etat=la');
    assert.ok(!vivants.includes('Bran Corvalis') && !vivants.includes('Le Prieur masqué'));
    assert.ok(vivants.includes('Maître Aldric'));
    assert.equal(vivants.length, 5);
    const v = await marquer('Bran Corvalis', false);
    assert.equal(v.status, 200);
    assert.ok(!v.body.charge.disparu);
    assert.deepEqual(await titres(antor, 'type=personnage&etat=disparu'), ['Le Prieur masqué']);
    assert.equal((await titres(antor, 'type=personnage&etat=la')).length, 6);
  });

  test('le_phare_detruit_est_liste_par_etat_disparu_du_type_lieu', async () => {
    // Panne visée : `etat=disparu` ne combine pas avec `type`.
    assert.deepEqual(await titres(antor, 'type=lieu&etat=disparu'), []);
    assert.equal((await marquer('Le Phare aux Sels', true)).status, 200);
    assert.deepEqual(await titres(antor, 'type=lieu&etat=disparu'), ['Le Phare aux Sels']);
    assert.ok(!(await titres(antor, 'type=lieu&etat=la')).includes('Le Phare aux Sels'));
    assert.equal((await marquer('Le Phare aux Sels', false)).status, 200);
  });

  test('marquer_deux_fois_est_idempotent', async () => {
    assert.equal((await marquer('Suie', true)).status, 200);
    const r = await marquer('Suie', true);
    assert.equal(r.status, 200);
    assert.equal(r.body.charge.disparu, true);
    assert.equal((await marquer('Suie', false)).status, 200);
  });

  test('lea_lit_la_marque_et_filtre_comme_antor', async () => {
    // Exclusion inverse : la marque est publique.
    assert.equal((await marquer('Bran Corvalis', true)).status, 200);
    try {
      const f = await req(lea, 'GET', `/api/univers/${U}/fiches/${ids['Bran Corvalis']}`);
      assert.equal(f.status, 200);
      assert.equal(f.body.charge.disparu, true);
      assert.deepEqual(await titres(lea, 'type=personnage&etat=disparu'), ['Bran Corvalis']);
    } finally {
      await marquer('Bran Corvalis', false);
    }
  });

  test('les_mots_des_sept_types_sont_ceux_de_la_doc', async () => {
    const t = (await req(antor, 'GET', `/api/univers/${U}/types`)).body as Any[];
    const attendu: Record<string, [string, string, string, string]> = {
      personnage: ['Mort', 'Marquer mort', 'Marquer vivant', 'skull'],
      creature: ['Morte', 'Marquer morte', 'Marquer vivante', 'skull'],
      famille: ['Éteinte', 'Marquer éteinte', 'Marquer vivante', 'skull'],
      faction: ['Détruite', 'Marquer détruite', 'Marquer active', 'shield-off'],
      lieu: ['Détruit', 'Marquer détruit', 'Marquer intact', 'flame'],
      objet: ['Détruit', 'Marquer détruit', 'Marquer intact', 'flame'],
      vaisseau: ['Détruit', 'Marquer détruit', 'Marquer intact', 'flame'],
    };
    for (const [type, [oui, menuOui, menuNon, icone]] of Object.entries(attendu)) {
      const d = t.find((x) => x.type === type)?.disparu;
      assert.ok(d, `${type} porte la marque`);
      assert.deepEqual([d.oui, d.menuOui, d.menuNon, d.icone], [oui, menuOui, menuNon, icone], type);
    }
    for (const type of ['evenement', 'quete', 'savoir', 'note', 'aventure']) {
      const x = t.find((y) => y.type === type);
      if (x) assert.equal(x.disparu, undefined, `${type} ne porte pas la marque`);
    }
  });
});

describe('B-67 par l’API : refus', { skip: skipBrowser }, () => {
  test('une_joueuse_ne_marque_pas', async () => {
    const r = await req(lea, 'PATCH', `/api/univers/${U}/fiches/${ids['Bran Corvalis']}`, { disparu: true });
    assert.equal(r.status, 403);
    assert.ok(!(await titres(antor, 'type=personnage&etat=disparu')).includes('Bran Corvalis'));
  });
  test('un_mj_en_mode_joueur_ne_marque_pas', async () => {
    const r = await req(antor, 'PATCH', `/api/univers/${U}/fiches/${ids['Bran Corvalis']}?mode=joueur`, { disparu: true });
    assert.equal(r.status, 403);
    assert.ok(!(await titres(antor, 'type=personnage&etat=disparu')).includes('Bran Corvalis'));
  });
  test('une_quete_et_un_savoir_refusent_la_marque_en_400', async () => {
    for (const t of ['La Dette', "Chronique de l'Âge d'Ombre", "Rapport secret de l'amirauté"]) {
      const r = await marquer(t, true);
      assert.equal(r.status, 400, t);
    }
    const q = await req(antor, 'GET', `/api/univers/${U}/fiches/${ids['La Dette']}`);
    assert.ok(!q.body.charge.disparu);
  });
  test('une_valeur_non_booleenne_est_refusee', async () => {
    for (const v of ['oui', 1, null]) {
      const r = await req(antor, 'PATCH', `/api/univers/${U}/fiches/${ids['Bran Corvalis']}`, { disparu: v });
      assert.equal(r.status, 400, String(v));
    }
  });
  test('un_etat_inconnu_est_refuse_et_un_type_sans_marque_n_a_aucune_fiche_dans_aucun_etat', async () => {
    const r = await req(antor, 'GET', `/api/univers/${U}/fiches?type=lieu&etat=mort`);
    assert.equal(r.status, 400);
    assert.deepEqual(await titres(antor, 'type=quete&etat=disparu'), []);
    assert.deepEqual(await titres(antor, 'type=quete&etat=la'), []);
  });
});

describe('B-68 : l’import pose la marque', { skip: skipBrowser }, () => {
  const put = (cle: string, corps: Any) =>
    fetch(`${srv.base}/api/import/v1/univers/${UKANKA}/fiches/${cle}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sections: [{ cle: 'd', titre: 'Description', contenu: 'x', joueursLisent: true }], ...corps }),
    });

  test('l_import_pose_disparu_sur_un_personnage_et_le_refuse_sur_une_quete', async () => {
    const ok = await put('personnage:xan', { type: 'personnage', titre: 'Xan', disparu: true });
    assert.equal(ok.status, 200);
    const j = (await ok.json()) as Any;
    assert.equal(j.etat, 'creee');
    const f = await req(antor, 'GET', `/api/univers/${UKANKA}/fiches/${j.id}`);
    assert.equal(f.body.charge.disparu, true);
    const ko = await put('quete:q', { type: 'quete', titre: 'Q', disparu: true });
    assert.equal(ko.status, 400);
    const kj = (await ko.json()) as Any;
    assert.equal(kj.code, 'champ_inconnu');
    assert.equal(kj.champ, 'disparu');
    const ko2 = await put('personnage:yan', { type: 'personnage', titre: 'Yan', disparu: 'oui' });
    assert.equal(ko2.status, 400);
  });

  test('rejoue_apres_marquer_vivant_l_import_n_ecrase_pas', async () => {
    // Panne visée : le rejeu écrase la marque posée à la main (B-48).
    const corps = { type: 'personnage', titre: 'Zed', disparu: true };
    const j = (await (await put('personnage:zed', corps)).json()) as Any;
    assert.equal(j.etat, 'creee');
    const id = j.id as number;
    const m = await req(antor, 'PATCH', `/api/univers/${UKANKA}/fiches/${id}`, { disparu: false });
    assert.equal(m.status, 200);
    const rejeu = await put('personnage:zed', corps);
    assert.equal(rejeu.status, 200);
    const f = await req(antor, 'GET', `/api/univers/${UKANKA}/fiches/${id}`);
    assert.ok(!f.body.charge.disparu, 'la marque retirée à la main reste retirée');
  });
});

describe('B-67 à l’écran, en Antor', { skip: skipBrowser }, () => {
  test('bran_marque_mort_badge_crane_carte_et_filtres', async () => {
    await ouvrir(antor, 'Bran Corvalis');
    await ouvrirMenu(antor, 'Bran Corvalis');
    await antor.getByRole('menuitem', { name: 'Marquer mort' }).click();
    await antor.getByText('Fiche marquée : Mort.').waitFor();
    await pastille(antor, 'Mort').waitFor();
    assert.ok(await antor.locator('.lucide-skull').count() >= 1, 'le crâne est dans l’en-tête');
    await photo(antor, 'bran-mort-entete');
    await ouvrirMenu(antor, 'Bran Corvalis');
    assert.equal(await antor.getByRole('menuitem', { name: 'Marquer vivant' }).count(), 1);
    assert.equal(await antor.getByRole('menuitem', { name: 'Marquer mort' }).count(), 0);
    await antor.keyboard.press('Escape');

    await liste(antor, 'personnages');
    await carte(antor, 'Bran Corvalis').waitFor();
    assert.equal(await carte(antor, 'Bran Corvalis').getByRole('img', { name: 'Mort' }).count(), 1);
    assert.equal(await carte(antor, 'Maître Aldric').getByRole('img', { name: 'Mort' }).count(), 0);

    await antor.getByRole('button', { name: 'Vivants' }).click();
    await carte(antor, 'Bran Corvalis').waitFor({ state: 'detached' });
    await carte(antor, 'Maître Aldric').waitFor();
    assert.equal(await carte(antor, 'Maître Aldric').count(), 1);
    assert.equal(await carte(antor, 'Le Prieur masqué').count(), 0);
    await antor.getByRole('button', { name: 'Morts' }).click();
    await carte(antor, 'Maître Aldric').waitFor({ state: 'detached' });
    await carte(antor, 'Bran Corvalis').waitFor();
    assert.equal(await carte(antor, 'Bran Corvalis').count(), 1);
    assert.equal(await carte(antor, 'Le Prieur masqué').count(), 1);
    assert.match(antor.url(), /etat=disparu/);
    await photo(antor, 'personnages-morts');

    await ouvrir(antor, 'Bran Corvalis');
    await ouvrirMenu(antor, 'Bran Corvalis');
    await antor.getByRole('menuitem', { name: 'Marquer vivant' }).click();
    await antor.getByText('Marque retirée.').waitFor();
    await antor.getByText('Mort', { exact: true }).waitFor({ state: 'detached' });
    await liste(antor, 'personnages', '?etat=la');
    await carte(antor, 'Bran Corvalis').waitFor();
    assert.equal(await carte(antor, 'Bran Corvalis').getByRole('img', { name: 'Mort' }).count(), 0);
  });

  test('le_phare_detruit_porte_detruit_et_la_flamme_et_sort_d_intacts', async () => {
    await ouvrir(antor, 'Le Phare aux Sels');
    await ouvrirMenu(antor, 'Le Phare aux Sels');
    await antor.getByRole('menuitem', { name: 'Marquer détruit' }).click();
    await antor.getByText('Fiche marquée : Détruit.').waitFor();
    await pastille(antor, 'Détruit').waitFor();
    assert.ok(await antor.locator('.lucide-flame').count() >= 1);
    await photo(antor, 'phare-detruit');
    try {
      await liste(antor, 'lieux');
      await antor.getByRole('button', { name: 'Intacts' }).click();
      await carte(antor, 'Le Phare aux Sels').waitFor({ state: 'detached' });
      await carte(antor, 'Port-Sel').waitFor();
      assert.equal(await carte(antor, 'Port-Sel').count(), 1);
      await antor.getByRole('button', { name: 'Détruits' }).click();
      await carte(antor, 'Port-Sel').waitFor({ state: 'detached' });
      await carte(antor, 'Le Phare aux Sels').waitFor();
      assert.equal(await carte(antor, 'Le Phare aux Sels').count(), 1);
    } finally {
      await marquer('Le Phare aux Sels', false);
    }
  });

  test('la_guilde_est_marquee_detruite_avec_shield_off_et_les_corvalis_eteinte', async () => {
    await ouvrir(antor, 'La Guilde des Brumes');
    await ouvrirMenu(antor, 'La Guilde des Brumes');
    await antor.getByRole('menuitem', { name: 'Marquer détruite' }).click();
    await antor.getByText('Fiche marquée : Détruite.').waitFor();
    await pastille(antor, 'Détruite').waitFor();
    assert.ok(await antor.locator('.lucide-shield-off').count() >= 1);
    await marquer('La Guilde des Brumes', false);

    await ouvrir(antor, 'Les Corvalis');
    await ouvrirMenu(antor, 'Les Corvalis');
    await antor.getByRole('menuitem', { name: 'Marquer éteinte' }).click();
    await antor.getByText('Fiche marquée : Éteinte.').waitFor();
    await pastille(antor, 'Éteinte').waitFor();
    await marquer('Les Corvalis', false);
  });

  test('une_quete_n_a_pas_d_entree_de_marque_dans_le_menu', async () => {
    await ouvrir(antor, 'La Dette');
    await ouvrirMenu(antor, 'La Dette');
    assert.equal(await antor.getByRole('menuitem', { name: /Marquer/ }).count(), 0);
    assert.ok((await antor.getByRole('menuitem').count()) >= 1);
  });

  test('en_mode_joueur_antor_n_a_pas_l_entree_mais_voit_la_marque', async () => {
    await marquer('Bran Corvalis', true);
    try {
      await ouvrir(antor, 'Bran Corvalis');
      await pastille(antor, 'Mort').waitFor();
      await antor.getByRole('radio', { name: 'Mode Joueur' }).click();
      await antor.getByRole('radio', { name: 'Mode Joueur', checked: true }).waitFor();
      await pastille(antor, 'Mort').waitFor();
      const bouton = antor.getByRole('button', { name: /^Autres actions sur « Bran Corvalis »/ });
      if (await bouton.count()) {
        await bouton.click();
        assert.equal(await antor.getByRole('menuitem', { name: /Marquer/ }).count(), 0);
      }
    } finally {
      await marquer('Bran Corvalis', false);
    }
  });

  test('un_filtre_sans_resultat_dit_aucun_objet_detruit_et_voir_tous_efface_l_etat', async () => {
    await liste(antor, 'objets', '?etat=disparu');
    await antor.getByText('Aucun objet détruit.').waitFor();
    await photo(antor, 'objets-detruits-vide');
    await antor.getByRole('button', { name: /Voir tous les objets/ }).or(antor.getByRole('link', { name: /Voir tous les objets/ })).click();
    await antor.getByText('Aucun objet détruit.').waitFor({ state: 'detached' });
    assert.doesNotMatch(antor.url(), /etat=disparu/);
  });

  test('une_ecriture_refusee_montre_le_message_sous_l_en_tete_et_la_fiche_reste_vivante', async () => {
    await ouvrir(antor, 'Maître Aldric');
    await antor.route(/\/api\/univers\/\d+\/fiches\/\d+$/, (route: Any) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : route.continue(),
    );
    await ouvrirMenu(antor, 'Maître Aldric');
    await antor.getByRole('menuitem', { name: 'Marquer mort' }).click();
    await antor.getByRole('alert').filter({ hasText: 'Impossible de modifier la fiche. Réessayez.' }).waitFor();
    assert.equal(await pastille(antor, 'Mort').count(), 0);
    await photo(antor, 'echec-marque');
    await antor.unroute(/\/api\/univers\/\d+\/fiches\/\d+$/);
    assert.ok(!(await titres(antor, 'type=personnage&etat=disparu')).includes('Maître Aldric'));
  });

  test('le_portrait_d_un_lieu_illustre_est_desature_et_porte_la_pastille', async () => {
    await marquer('Le Pendu Joyeux', true);
    try {
      await ouvrir(antor, 'Le Pendu Joyeux');
      const chip = antor.getByRole('img', { name: 'Détruit' }).first();
      await chip.waitFor();
      const filtres = await chip.evaluate((el: Any) => {
        const out: string[] = [];
        let n = el.parentElement;
        for (let i = 0; n && i < 4; i++, n = n.parentElement) {
          out.push(getComputedStyle(n).filter);
          n.querySelectorAll('img').forEach((im: Any) => out.push(getComputedStyle(im).filter));
        }
        return out;
      });
      assert.ok(filtres.some((f: string) => /saturate\(0?\.4\)/.test(f)), `désaturé à 60 % : ${filtres.join(' | ')}`);
      await photo(antor, 'pendu-illustration-detruite');
      await liste(antor, 'lieux');
      await carte(antor, 'Le Pendu Joyeux').getByRole('img', { name: 'Détruit' }).waitFor();
    } finally {
      await marquer('Le Pendu Joyeux', false);
    }
  });
});

describe('B-67 : texte exact de l’état vide', { skip: skipBrowser }, () => {
  test('l_etat_vide_propose_voir_tous_les_objets_avec_son_point', async () => {
    // docs/ecrans.md : « Voir tous les <pluriel du type>. » (maquette : le point est dans le lien).
    await liste(antor, 'objets', '?etat=disparu');
    await antor.getByText('Aucun objet détruit.').waitFor();
    assert.equal(await antor.getByText('Voir tous les objets.', { exact: true }).count(), 1);
  });
});

describe('B-67 à l’écran, en Léa', { skip: skipBrowser }, () => {
  test('lea_voit_le_badge_et_la_marque_de_bran_mais_pas_l_entree', async () => {
    await marquer('Bran Corvalis', true);
    try {
      await ouvrir(lea, 'Bran Corvalis');
      await pastille(lea, 'Mort').waitFor();
      const bouton = lea.getByRole('button', { name: /^Autres actions sur « Bran Corvalis »/ });
      if (await bouton.count()) {
        await bouton.click();
        assert.equal(await lea.getByRole('menuitem', { name: /Marquer/ }).count(), 0);
        await lea.keyboard.press('Escape');
      }
      await photo(lea, 'lea-bran-mort');
      await liste(lea, 'personnages');
      await carte(lea, 'Bran Corvalis').getByRole('img', { name: 'Mort' }).waitFor();
      await lea.getByRole('button', { name: 'Morts' }).click();
      await carte(lea, 'Maître Aldric').waitFor({ state: 'detached' });
      await carte(lea, 'Bran Corvalis').waitFor();
      assert.equal(await carte(lea, 'Bran Corvalis').count(), 1);
    } finally {
      await marquer('Bran Corvalis', false);
    }
  });
});
