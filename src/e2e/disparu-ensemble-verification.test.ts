// Black-box tests of kanevas-fiches-liees-disparu (B-67, B-68 part `disparu`), written from the
// feature's exit criterion, docs/parcours.md and docs/ecrans.md « the gone mark » — not from the code.
// Real server in stub mode with the seed + real Chromium. Every expected value is a literal of the docs.
// Waits are on what the screen shows (a toast, an element appearing), never networkidle or a delay.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-disparu-ensemble-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
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
  const fs = (await req(antor, 'GET', `/api/univers/${U}/fiches`)).body.fiches as Any[];
  for (const f of fs) ids[f.titre] = f.id;
  ids['La Dette'] = (await req(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'quete', titre: 'La Dette' })).body.id;
});
after(async () => {
  await browser?.close();
  srv?.stop();
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
