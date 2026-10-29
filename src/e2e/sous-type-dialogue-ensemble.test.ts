// Feature-level black-box tests of kanevas-sous-type-dialogue, written from the need only (Monsieur's
// « Livre » of 2026-10-29; docs/parcours.md B-52 and the P-14 step added by the feature; docs/ecrans.md E-9
// « Changer le type… » and « Le sous-type montre qu'il s'édite »). Real server in stub mode WITH the
// starting world, real Chromium. Every expected value is a literal taken from those documents.
// Entry gestures: the sheet's « ⋯ » menu, « Changer le type… », the sub-type button of the badge.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/shots';
const UNIVERS = 1; // « Lame d'Ébène » of the starting world: antor is GM, lea a player.
const PERDUE =
  "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";

let srv: Server;
let browser: Any;
let antor: Any;
let n = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}

/** A fresh PNJ of Lame d'Ébène (sub-type set when given); returns its sheet. */
async function pnj(sousType: string | null, type: 'personnage' | 'lieu' = 'personnage'): Promise<{ id: number; titre: string }> {
  const titre = `Sam${++n}`;
  const f = await api(antor, 'POST', `/api/univers/${UNIVERS}/fiches`, type === 'personnage' ? { type, titre, charge: { pj: false } } : { type, titre });
  if (sousType !== null) await api(antor, 'PATCH', `/api/univers/${UNIVERS}/fiches/${f.id}`, { sousType });
  return { id: f.id, titre };
}

const lire = (id: number): Promise<Any> => api(antor, 'GET', `/api/univers/${UNIVERS}/fiches/${id}`);

async function ouvrirFiche(page: Any, f: { id: number; titre: string }): Promise<void> {
  await page.goto(`/univers/${UNIVERS}/fiche/${f.id}`);
  await page.getByRole('heading', { level: 1, name: f.titre }).waitFor();
}

/** « ⋯ » then « Changer le type… ». Returns the dialog. */
async function ouvrirBoite(page: Any, f: { titre: string }): Promise<Any> {
  await page.getByRole('button', { name: rx(`Autres actions sur « ${f.titre} »`) }).click();
  await page.getByRole('menuitem', { name: rx('Changer le type…') }).click();
  const boite = page.getByRole('dialog');
  await boite.getByRole('heading', { name: rx('Changer le type de') }).waitFor();
  return boite;
}

const champ = (boite: Any): Any => boite.getByLabel('Sous-type');
const bouton = (boite: Any): Any => boite.getByRole('button', { name: /^(Changer le type|Enregistrement…)$/ });
/** The badge line of the sheet header (type · sub-type). */
const badge = (page: Any): Any => page.locator('main .tete-ligne .type').first();
const badgeTexte = async (page: Any): Promise<string> => ((await badge(page).innerText()) as string).replace(/\s+/g, ' ').trim();
const capture = (page: Any, nom: string): Promise<unknown> => page.screenshot({ path: `${CAPTURES}/${nom}.png` });

/** Waits until the dialog has finished loading the list of types (the button is then decided by the fields only). */
async function typesLus(boite: Any): Promise<void> {
  await boite.getByText('Chargement des types…').waitFor({ state: 'detached' });
}

describe('kanevas-sous-type-dialogue : ensemble depuis le besoin', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'antor')).page;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // ---------------------------------------------------------------- B-52 : nominal (critère de sortie)

  test('B-52 nominal : PNJ « Capitaine », le type gardé, sous-type « Amiral », « Changer le type » : le badge dit « PNJ · Amiral »', async () => {
    // Panne visée : le dialogue ignore un sous-type seul (bouton inactif, ou rien d'envoyé), ou perd le type.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    assert.equal(await badgeTexte(antor), 'PNJ · Capitaine');
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    assert.equal(await boite.getByRole('radio', { name: rx('Personnage') }).isChecked(), true);
    assert.equal(await champ(boite).inputValue(), 'Capitaine');
    await capture(antor, 'nominal-ouverture');
    await champ(boite).fill('Amiral');
    await bouton(boite).waitFor();
    assert.equal(await bouton(boite).isEnabled(), true);
    await capture(antor, 'nominal-saisie');
    await bouton(boite).click();
    await antor.getByText('Sous-type enregistré.').waitFor();
    await antor.getByRole('dialog').waitFor({ state: 'detached' });
    await antor.getByRole('button', { name: /^Sous-type : Amiral/ }).waitFor();
    assert.equal(await badgeTexte(antor), 'PNJ · Amiral');
    const v = await lire(f.id);
    assert.equal(v.type, 'personnage');
    assert.equal(v.sousType, 'Amiral');
    assert.equal(v.charge.pj, false);
    const liste = await api(antor, 'GET', `/api/univers/${UNIVERS}/fiches?type=personnage`);
    assert.ok((liste.fiches ?? liste).some((x: Any) => x.id === f.id && x.sousType === 'Amiral'));
    await capture(antor, 'nominal-apres');
  });

  test('B-52 : la requête envoyée est le seul PATCH {sousType}, jamais la route de changement de type', async () => {
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      // Panne visée : le dialogue passe par le changement de type (qui viderait les champs propres au type) ou envoie plus que le sous-type.
      const f = await pnj('Capitaine');
      await ouvrirFiche(p, f);
      const envoyees: { methode: string; url: string; corps: string | null }[] = [];
      p.on('request', (r: Any) => {
        if (r.method() !== 'GET' && r.url().includes('/api/')) envoyees.push({ methode: r.method(), url: new URL(r.url()).pathname, corps: r.postData() });
      });
      const boite = await ouvrirBoite(p, f);
      await typesLus(boite);
      await champ(boite).fill('Amiral');
      await bouton(boite).click();
      await p.getByText('Sous-type enregistré.').waitFor();
      p.removeAllListeners('request');
      assert.equal(envoyees.length, 1, JSON.stringify(envoyees));
      assert.equal(envoyees[0]!.methode, 'PATCH');
      assert.equal(envoyees[0]!.url, `/api/univers/${UNIVERS}/fiches/${f.id}`);
      assert.deepEqual(JSON.parse(envoyees[0]!.corps!), { sousType: 'Amiral' });
    } finally {
      await ctx.close();
    }
  });

  test('B-52 : « Personnage (actuel) » ne propose pas PJ / PNJ', async () => {
    // Panne visée : PJ / PNJ s'affiche pour le type actuel et laisse croire qu'il se change ici.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    assert.equal(await boite.getByRole('radio', { name: rxExact('PJ') }).count(), 0);
    assert.equal(await boite.getByRole('radio', { name: rxExact('PNJ') }).count(), 0);
    await boite.getByRole('radio', { name: rx('Lieu') }).check();
    await boite.getByRole('radio', { name: rx('Personnage') }).check();
    assert.equal(await boite.getByRole('radio', { name: rxExact('PNJ') }).count(), 0, 'revenu au type actuel : toujours pas de PJ / PNJ');
    assert.equal(await boite.getByRole('radio', { name: rxExact('PJ') }).count(), 0);
  });

  // ---------------------------------------------------------------- bords : le bouton

  test('B-52 bord : à l’ouverture le champ porte « Capitaine », « Changer le type » est inactif et la boîte ne dit pas « sera retiré »', async () => {
    // Panne visée : le bouton est actif d'emblée, ou l'avertissement du changement de type s'affiche pour le type actuel.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    assert.equal(await champ(boite).inputValue(), 'Capitaine');
    assert.equal(await bouton(boite).isDisabled(), true);
    assert.equal(await boite.getByText(/sera retiré/).count(), 0);
    await champ(boite).fill('Amiral');
    await champ(boite).fill('Capitaine');
    assert.equal(await bouton(boite).isDisabled(), true, 'revenir au sous-type actuel désactive de nouveau');
  });

  test('B-52 bord : des espaces autour du sous-type actuel ne l’activent pas (texte rogné)', async () => {
    // Panne visée : la comparaison se fait sans rogner, le bouton s'active pour rien.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    await champ(boite).fill('  Capitaine  ');
    assert.equal(await bouton(boite).isDisabled(), true);
  });

  test('B-52 bord : la casse compte, « capitaine » remplace « Capitaine »', async () => {
    // Panne visée : la comparaison ignore la casse, le bouton reste inactif.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    await champ(boite).fill('capitaine');
    assert.equal(await bouton(boite).isEnabled(), true);
    await bouton(boite).click();
    await antor.getByText('Sous-type enregistré.').waitFor();
    assert.equal((await lire(f.id)).sousType, 'capitaine');
    assert.equal(await badgeTexte(antor), 'PNJ · capitaine');
  });

  test('B-52 bord : champ vidé sur une fiche qui avait un sous-type, le bouton s’active et le sous-type est retiré', async () => {
    // Panne visée : un champ vide est traité comme « rien à changer », ou le sous-type est envoyé comme texte vide.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    await champ(boite).fill('');
    assert.equal(await bouton(boite).isEnabled(), true);
    assert.equal(await boite.getByText(/sera retiré/).count(), 0);
    await bouton(boite).click();
    await antor.getByText('Sous-type retiré.').waitFor();
    await antor.getByRole('button', { name: /^Ajouter un sous-type/ }).waitFor();
    assert.equal(await badgeTexte(antor), 'PNJ · Sous-type');
    assert.equal((await lire(f.id)).sousType, null);
    await capture(antor, 'vide-apres');
  });

  test('B-52 bord : fiche sans sous-type, le champ est vide, le bouton inactif, et saisir « Amiral » l’active', async () => {
    // Panne visée : le champ n'est rempli que quand un sous-type existe, ou le bouton s'active à vide.
    const f = await pnj(null);
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    assert.equal(await champ(boite).inputValue(), '');
    assert.equal(await bouton(boite).isDisabled(), true);
    await champ(boite).fill('Amiral');
    assert.equal(await bouton(boite).isEnabled(), true);
    await bouton(boite).click();
    await antor.getByText('Sous-type enregistré.').waitFor();
    assert.equal(await badgeTexte(antor), 'PNJ · Amiral');
    assert.equal((await lire(f.id)).sousType, 'Amiral');
  });

  test('B-52 bord : 60 caractères sont acceptés', async () => {
    // Panne visée : la limite est posée à 59 (ou 60 refusé).
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    const soixante = 'B'.repeat(60);
    await champ(boite).fill(soixante);
    await bouton(boite).click();
    await antor.getByText('Sous-type enregistré.').waitFor();
    assert.equal((await lire(f.id)).sousType, soixante);
  });

  // ---------------------------------------------------------------- bords : changement de type conservé

  test('B-52 : choisir « Lieu » vide le champ et avertit, revenir à « Personnage » rend « Capitaine » et désactive', async () => {
    // Panne visée : le comportement du changement de type est perdu, ou le retour au type actuel ne restitue pas le sous-type.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    await boite.getByRole('radio', { name: rx('Lieu') }).check();
    assert.equal(await champ(boite).inputValue(), '');
    await boite.getByText('Le sous-type « Capitaine » sera retiré.').waitFor();
    assert.equal(await bouton(boite).isEnabled(), true);
    await capture(antor, 'autre-type-avertissement');
    await boite.getByRole('radio', { name: rxExact('Personnage (actuel)') }).check();
    assert.equal(await champ(boite).inputValue(), 'Capitaine');
    assert.equal(await boite.getByText(/sera retiré/).count(), 0);
    assert.equal(await bouton(boite).isDisabled(), true);
  });

  test('B-52 : changer vraiment de type (Personnage → Lieu) retire le sous-type et le dit', async () => {
    // Panne visée : le changement de type garde le sous-type, ou la fiche n'est pas devenue un lieu.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    await boite.getByRole('radio', { name: rx('Lieu') }).check();
    await bouton(boite).click();
    await antor.getByText('Type changé : Personnage → Lieu.').waitFor();
    const v = await lire(f.id);
    assert.equal(v.type, 'lieu');
    assert.equal(v.sousType, null);
  });

  test('B-52 : un autre type avec un sous-type neuf saisi est enregistré avec le nouveau type', async () => {
    // Panne visée : le sous-type tapé pour un autre type est perdu.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const boite = await ouvrirBoite(antor, f);
    await typesLus(boite);
    await boite.getByRole('radio', { name: rx('Lieu') }).check();
    await champ(boite).fill('Port');
    assert.equal(await boite.getByText(/sera retiré/).count(), 0);
    await bouton(boite).click();
    await antor.getByText('Type changé : Personnage → Lieu.').waitFor();
    const v = await lire(f.id);
    assert.equal(v.type, 'lieu');
    assert.equal(v.sousType, 'Port');
  });

  // ---------------------------------------------------------------- échecs

  test('B-52 échec : un sous-type de 61 caractères dit « Erreur : 60 caractères au plus. », rien n’est envoyé', async () => {
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      // Panne visée : la limite n'est pas contrôlée dans la boîte, la requête part quand même.
      const f = await pnj('Capitaine');
      await ouvrirFiche(p, f);
      const boite = await ouvrirBoite(p, f);
      await typesLus(boite);
      const patchs: string[] = [];
      p.on('request', (r: Any) => r.method() !== 'GET' && r.url().includes('/api/') && patchs.push(r.method() + r.url()));
      await champ(boite).fill('C'.repeat(61));
      await bouton(boite).click();
      await boite.getByText(rx('Erreur : 60 caractères au plus.')).waitFor();
      await p.waitForTimeout(300);
      p.removeAllListeners('request');
      assert.deepEqual(patchs, []);
      assert.equal(await p.getByRole('dialog').count(), 1);
      assert.equal((await lire(f.id)).sousType, 'Capitaine');
      await capture(p, 'trop-long');
    } finally {
      await ctx.close();
    }
  });

  test('B-52 échec : le PATCH échoue (500), la boîte reste ouverte avec « Le sous-type n’a pas changé. Réessayez. », « Amiral » gardé, badge inchangé', async () => {
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      // Panne visée : l'échec ferme la boîte ou perd la saisie, ou le badge dit « Amiral » sans que rien soit enregistré.
      const f = await pnj('Capitaine');
      await ouvrirFiche(p, f);
      const boite = await ouvrirBoite(p, f);
      await typesLus(boite);
      await p.route(`**/api/univers/${UNIVERS}/fiches/${f.id}`, (r: Any) =>
        r.request().method() === 'PATCH' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.continue(),
      );
      await champ(boite).fill('Amiral');
      await bouton(boite).click();
      await boite.getByText(rx("Le sous-type n'a pas changé. Réessayez.")).waitFor();
      assert.equal(await champ(boite).inputValue(), 'Amiral');
      assert.equal(await p.getByRole('dialog').count(), 1);
      assert.match(await badgeTexte(p), /^PNJ · Capitaine$/);
      await capture(p, 'echec-500');
      await p.unroute(`**/api/univers/${UNIVERS}/fiches/${f.id}`);
      assert.equal((await lire(f.id)).sousType, 'Capitaine');
    } finally {
      await ctx.close();
    }
  });

  test('B-52 échec : 403 ferme la boîte et dit « Vous ne pouvez plus modifier cette fiche. »', async () => {
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      // Panne visée : le refus de droit laisse la boîte ouverte sans explication.
      const f = await pnj('Capitaine');
      await ouvrirFiche(p, f);
      const boite = await ouvrirBoite(p, f);
      await typesLus(boite);
      await p.route(`**/api/univers/${UNIVERS}/fiches/${f.id}`, (r: Any) =>
        r.request().method() === 'PATCH' ? r.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"x"}' }) : r.continue(),
      );
      await champ(boite).fill('Amiral');
      await bouton(boite).click();
      await p.getByText(rx('Vous ne pouvez plus modifier cette fiche.')).waitFor();
      await p.getByRole('dialog').waitFor({ state: 'detached' });
      await p.unroute(`**/api/univers/${UNIVERS}/fiches/${f.id}`);
    } finally {
      await ctx.close();
    }
  });

  test('B-52 échec : 404 dit « Introuvable. » dans la boîte, qui reste ouverte', async () => {
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      // Panne visée : la fiche disparue est traitée comme une erreur générique.
      const f = await pnj('Capitaine');
      await ouvrirFiche(p, f);
      const boite = await ouvrirBoite(p, f);
      await typesLus(boite);
      await p.route(`**/api/univers/${UNIVERS}/fiches/${f.id}`, (r: Any) =>
        r.request().method() === 'PATCH' ? r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"x"}' }) : r.continue(),
      );
      await champ(boite).fill('Amiral');
      await bouton(boite).click();
      await boite.getByText('Introuvable.').waitFor();
      assert.equal(await p.getByRole('dialog').count(), 1);
      await p.unroute(`**/api/univers/${UNIVERS}/fiches/${f.id}`);
    } finally {
      await ctx.close();
    }
  });

  test('B-52 échec : liste des types pas encore lue, « Chargement des types… » et « Changer le type » inactif jusqu’à la lecture', async () => {
    // Panne visée : le bouton s'active avant la liste des types et envoie un choix fait à l'aveugle.
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      const f = await pnj('Capitaine');
      let liberer: () => void = () => {};
      const bloque = new Promise<void>((ok) => (liberer = ok));
      // The list of types is read when the universe's screen opens: hold it before the page loads.
      await p.route(`**/api/univers/${UNIVERS}/types`, async (r: Any) => {
        await bloque;
        await r.continue();
      });
      await ouvrirFiche(p, f);
      const boite = await ouvrirBoite(p, f);
      await boite.getByText('Chargement des types…').waitFor();
      assert.equal(await bouton(boite).isDisabled(), true);
      await capture(p, 'chargement');
      liberer();
      await typesLus(boite);
      assert.equal(await champ(boite).inputValue(), 'Capitaine');
      assert.equal(await bouton(boite).isDisabled(), true, 'rien ne diffère encore');
    } finally {
      await ctx.close();
    }
  });

  test('B-52 échec : pendant le chargement des types, le champ porte déjà « Capitaine », « Amiral » saisi n’active pas le bouton avant la lecture', async () => {
    // Panne visée : le bouton s'active avant la liste des types (critère : « même si le champ diffère déjà »).
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      const f = await pnj('Capitaine');
      let liberer: () => void = () => {};
      const bloque = new Promise<void>((ok) => (liberer = ok));
      await p.route(`**/api/univers/${UNIVERS}/types`, async (r: Any) => {
        await bloque;
        await r.continue();
      });
      await ouvrirFiche(p, f);
      const boite = await ouvrirBoite(p, f);
      await boite.getByText('Chargement des types…').waitFor();
      await champ(boite).fill('Amiral');
      assert.equal(await bouton(boite).isDisabled(), true);
      liberer();
      await typesLus(boite);
      assert.equal(await champ(boite).inputValue(), 'Amiral');
      assert.equal(await bouton(boite).isEnabled(), true);
    } finally {
      await ctx.close();
    }
  });

  test('B-52 échec : liste des types illisible, « Impossible de charger les types. » et le bouton reste inactif', async () => {
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      // Panne visée : l'échec de lecture des types laisse enregistrer.
      const f = await pnj('Capitaine');
      await p.route(`**/api/univers/${UNIVERS}/types`, (r: Any) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
      await ouvrirFiche(p, f);
      const boite = await ouvrirBoite(p, f);
      await boite.getByText('Impossible de charger les types.').waitFor();
      assert.equal(await bouton(boite).isDisabled(), true);
      await p.unroute(`**/api/univers/${UNIVERS}/types`);
    } finally {
      await ctx.close();
    }
  });

  test('B-52 échec : connexion perdue boîte ouverte, le bandeau, « Changer le type » inactif, la saisie gardée ; elle revient, le bouton aussi', async () => {
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      // Panne visée : on peut valider hors connexion, ou la saisie est perdue.
      const f = await pnj('Capitaine');
      await ouvrirFiche(p, f);
      const boite = await ouvrirBoite(p, f);
      await typesLus(boite);
      await champ(boite).fill('Amiral');
      assert.equal(await bouton(boite).isEnabled(), true);
      await p.context().setOffline(true);
      await p.evaluate(() => window.dispatchEvent(new Event('offline')));
      await p.getByText(rx(PERDUE)).waitFor();
      assert.equal(await bouton(boite).isDisabled(), true);
      assert.equal(await champ(boite).inputValue(), 'Amiral');
      await capture(p, 'connexion-perdue-boite');
      await p.context().setOffline(false);
      await p.evaluate(() => window.dispatchEvent(new Event('online')));
      await p.getByText(rx(PERDUE)).waitFor({ state: 'detached' });
      assert.equal(await champ(boite).inputValue(), 'Amiral');
      assert.equal(await bouton(boite).isEnabled(), true);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------- exclusions : joueur et mode Joueur

  test('B-52 exclusion : Léa (Joueuse) lit le sous-type en simple texte : ni bouton, ni menu « ⋯ », ni arrêt de tabulation', async () => {
    // Panne visée : le sous-type reste éditable (ou le menu « Changer le type… » visible) pour un joueur.
    const lea = (await connecte(browser, srv.base, 'Léa')).page;
    const liste = await api(antor, 'GET', `/api/univers/${UNIVERS}/fiches?type=personnage`);
    const aldric = (liste.fiches ?? liste).find((x: Any) => x.titre === 'Maître Aldric');
    await api(antor, 'PATCH', `/api/univers/${UNIVERS}/fiches/${aldric.id}`, { sousType: 'Capitaine' });
    await ouvrirFiche(lea, { id: aldric.id, titre: 'Maître Aldric' });
    assert.equal(await badgeTexte(lea), 'PNJ · Capitaine');
    assert.equal(await lea.getByRole('button', { name: /Sous-type/ }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    await badge(lea).getByText('Capitaine').hover();
    await lea.mouse.move(0, 0);
    const arrets: string[] = [];
    for (let i = 0; i < 40; i++) {
      await lea.keyboard.press('Tab');
      arrets.push(await lea.evaluate(() => (document.activeElement?.closest('.tete-ligne .type') ? 'IN|' : 'out|') + (document.activeElement?.tagName ?? '')));
    }
    assert.equal(arrets.filter((a) => a.startsWith('IN|')).length, 0, JSON.stringify(arrets));
    await capture(lea, 'joueur-texte');
    await lea.context().close();
  });

  test('B-52 exclusion : le MJ en mode Joueur voit le sous-type en texte : pas de bouton, pas d’arrêt de tabulation, pas de « Changer le type… »', async () => {
    // Panne visée : le mode Joueur laisse l'affordance et l'édition du sous-type.
    const f = await pnj('Capitaine');
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      await ouvrirFiche(p, f);
      await p.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
      await p.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
      assert.equal(await p.getByRole('button', { name: /Sous-type/ }).count(), 0);
      assert.equal(await badgeTexte(p), 'PNJ · Capitaine');
      const menu = p.getByRole('button', { name: /^Autres actions sur/ });
      if ((await menu.count()) > 0) {
        await menu.click();
        assert.equal(await p.getByRole('menuitem', { name: rx('Changer le type…') }).count(), 0);
        await p.keyboard.press('Escape');
      }
      await p.locator('body').click({ position: { x: 1, y: 1 } });
      for (let i = 0; i < 40; i++) {
        await p.keyboard.press('Tab');
        assert.equal(await p.evaluate(() => !!document.activeElement?.closest('.tete-ligne .type')), false);
      }
      await capture(p, 'mode-joueur');
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------- affordance du badge

  async function couleurs(page: Any, bouton_: Any): Promise<{ fond: string; crayon: number; opacite: string; couleur: string; largeur: number; contour: string; decalage: string; curseur: string }> {
    return bouton_.evaluate((b: HTMLElement) => {
      const cs = getComputedStyle(b);
      const c = b.querySelector('svg.crayon') as SVGElement | null;
      const cc = c ? getComputedStyle(c) : null;
      const visible = !!c && cc!.display !== 'none' && cc!.visibility !== 'hidden' ? 1 : 0;
      return {
        fond: cs.backgroundColor,
        crayon: visible,
        opacite: cc ? cc.opacity : '0',
        couleur: cs.color,
        largeur: b.parentElement!.getBoundingClientRect().width,
        contour: `${cs.outlineStyle} ${cs.outlineWidth}`,
        decalage: cs.outlineOffset,
        curseur: cs.cursor,
      };
    });
  }
  /** Computed colour of a design token (the charter's), read through a probe element. */
  async function jeton(page: Any, nom: string, propriete: 'backgroundColor' | 'color'): Promise<string> {
    return page.evaluate(
      ([n, p]: string[]) => {
        const d = document.createElement('div');
        (d.style as Any)[p!] = `var(${n})`;
        document.body.appendChild(d);
        const v = getComputedStyle(d)[p as Any] as string;
        d.remove();
        return v;
      },
      [nom, propriete],
    );
  }

  test('B-52 affordance : au repos rien ne change, au survol fond --surface-3 et crayon, sans anneau ; la largeur du badge ne bouge pas', async () => {
    // Panne visée : le sous-type ne se distingue pas d'un texte au survol, ou le crayon pousse le titre.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const b = antor.getByRole('button', { name: /^Sous-type : Capitaine\. Modifier le sous-type/ });
    await b.waitFor();
    await antor.mouse.move(0, 0);
    const repos = await couleurs(antor, b);
    assert.equal(repos.fond, 'rgba(0, 0, 0, 0)');
    assert.ok(repos.crayon === 0 || Number(repos.opacite) === 0, `crayon au repos : ${JSON.stringify(repos)}`);
    assert.equal(await b.getAttribute('title'), 'Modifier le sous-type');
    await b.hover();
    await antor.waitForFunction(() => getComputedStyle(document.querySelector('.sous-type-bouton')!).backgroundColor !== 'rgba(0, 0, 0, 0)');
    const survol = await couleurs(antor, b);
    assert.equal(survol.fond, await jeton(antor, '--surface-3', 'backgroundColor'));
    assert.equal(survol.crayon, 1);
    assert.equal(Number(survol.opacite), 1);
    assert.equal(survol.largeur, repos.largeur, 'la largeur du badge ne bouge pas au survol');
    assert.ok(/^(none|hidden) |0px/.test(survol.contour), `pas d'anneau au survol : ${survol.contour}`);
    assert.equal(survol.curseur, 'text');
    await capture(antor, 'affordance-survol');
  });

  test('B-52 affordance : à la tabulation le bouton reçoit le fond, le crayon et l’anneau de 2 px décalé de 2 px ; Entrée ouvre l’édition en place', async () => {
    // Panne visée : le sous-type n'est pas atteignable au clavier, ou sans indication de focus.
    const f = await pnj('Capitaine');
    await ouvrirFiche(antor, f);
    const b = antor.getByRole('button', { name: /^Sous-type : Capitaine\. Modifier le sous-type/ });
    await b.waitFor();
    await antor.mouse.move(0, 0);
    await antor.locator('body').click({ position: { x: 1, y: 1 } });
    let atteint = false;
    for (let i = 0; i < 40 && !atteint; i++) {
      await antor.keyboard.press('Tab');
      atteint = await b.evaluate((e: Element) => e === document.activeElement);
    }
    assert.ok(atteint, 'le sous-type est un arrêt de tabulation');
    const focus = await couleurs(antor, b);
    assert.equal(focus.fond, await jeton(antor, '--surface-3', 'backgroundColor'));
    assert.equal(focus.crayon, 1);
    assert.equal(focus.contour, 'solid 2px');
    assert.equal(focus.decalage, '2px');
    await capture(antor, 'affordance-focus');
    await antor.keyboard.press('Enter');
    const saisie = antor.getByRole('combobox', { name: 'Sous-type' });
    await saisie.waitFor();
    assert.equal(await saisie.inputValue(), 'Capitaine');
    await antor.keyboard.press('Escape');
    await b.waitFor();
  });

  test('B-52 affordance : fiche sans sous-type, « Sous-type » en --texte-3 au repos, --texte-2 avec fond et crayon au survol ; le nom accessible est « Ajouter un sous-type »', async () => {
    // Panne visée : une fiche sans sous-type n'offre aucun moyen de découvrir l'édition.
    const f = await pnj(null);
    await ouvrirFiche(antor, f);
    const b = antor.getByRole('button', { name: /^Ajouter un sous-type/ });
    await b.waitFor();
    assert.equal(await b.innerText(), 'Sous-type');
    await antor.mouse.move(0, 0);
    const repos = await couleurs(antor, b);
    assert.equal(repos.couleur, await jeton(antor, '--texte-3', 'color'));
    await b.hover();
    await antor.waitForFunction(() => getComputedStyle(document.querySelector('.sous-type-bouton')!).backgroundColor !== 'rgba(0, 0, 0, 0)');
    const survol = await couleurs(antor, b);
    assert.equal(survol.couleur, await jeton(antor, '--texte-2', 'color'));
    assert.equal(survol.fond, await jeton(antor, '--surface-3', 'backgroundColor'));
    assert.equal(survol.crayon, 1);
    await capture(antor, 'affordance-sans-sous-type');
  });

  test('B-52 affordance : écran tactile (hover: none), le crayon est toujours visible', async () => {
    // Panne visée : sur tactile le crayon n'apparaît jamais faute de survol.
    const f = await pnj('Capitaine');
    const ctx = await browser.newContext({ baseURL: srv.base, hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
    await attendre(page);
    await ouvrirFiche(page, f);
    assert.equal(await page.evaluate(() => matchMedia('(hover: none)').matches), true);
    const b = page.getByRole('button', { name: /^Sous-type : Capitaine/ });
    await b.waitFor();
    const etat = await couleurs(page, b);
    assert.equal(etat.crayon, 1);
    assert.equal(Number(etat.opacite), 1);
    await capture(page, 'affordance-tactile');
    await ctx.close();
  });

  test('B-52 affordance : connexion perdue, le sous-type du badge est désactivé : ni fond ni crayon au survol, pas d’arrêt de tabulation', async () => {
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    try {
      // Panne visée : hors connexion le sous-type reste éditable et promet un enregistrement impossible.
      const f = await pnj('Capitaine');
      await ouvrirFiche(p, f);
      const b = p.getByRole('button', { name: /^Sous-type : Capitaine/ });
      await b.waitFor();
      await p.context().setOffline(true);
      await p.evaluate(() => window.dispatchEvent(new Event('offline')));
      await p.getByText(rx(PERDUE)).waitFor();
      assert.equal(await b.isDisabled(), true);
      await b.hover({ force: true });
      const e = await couleurs(p, b);
      assert.equal(e.fond, 'rgba(0, 0, 0, 0)');
      assert.ok(e.crayon === 0 || Number(e.opacite) === 0, JSON.stringify(e));
      assert.notEqual(e.curseur, 'text');
      await p.locator('body').click({ position: { x: 1, y: 1 } });
      for (let i = 0; i < 40; i++) {
        await p.keyboard.press('Tab');
        assert.equal(await b.evaluate((x: Element) => x === document.activeElement), false);
      }
      await capture(p, 'affordance-hors-ligne');
      await p.context().setOffline(false);
      await p.evaluate(() => window.dispatchEvent(new Event('online')));
      await p.getByText(rx(PERDUE)).waitFor({ state: 'detached' });
      assert.equal(await b.isEnabled(), true);
    } finally {
      await ctx.close();
    }
  });

  test('B-52 : le sous-type s’édite toujours en place dans le badge (toast « Sous-type enregistré. »)', async () => {
    // Panne visée : le dialogue a remplacé l'édition en place au lieu de la compléter.
    const f = await pnj('Port');
    await ouvrirFiche(antor, f);
    await antor.getByRole('button', { name: /^Sous-type : Port/ }).click();
    const saisie = antor.getByRole('combobox', { name: 'Sous-type' });
    await saisie.fill('Havre');
    await antor.keyboard.press('Enter');
    await antor.getByText('Sous-type enregistré.').waitFor();
    assert.equal(await badgeTexte(antor), 'PNJ · Havre');
    assert.equal((await lire(f.id)).sousType, 'Havre');
  });
});
