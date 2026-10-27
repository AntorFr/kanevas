// Feature-level tests of kanevas-import-tenir (B-39 title, B-40, B-41, P-14 steps 2-3, P-10 step 8; E-9 title and
// deletion, E-14 « Supprimer l'univers »; AD-105), written from the feature's exit criterion and docs/parcours.md /
// docs/ecrans.md only. World: the stub seed (« Lame d'Ébène », « Essai Kanka »), real server in stub mode, real
// Chromium, the import API called over HTTP with the stub token. Expected values are literals. Three servers, one per
// destructive story: the rename, the sheet deletion, the universe deletion.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const SHOTS = '/tmp/kanevas-tenir-ensemble-shots';

async function brut(srv: Server, page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; corps: Any }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  const t = await r.text();
  let corps: Any = null;
  try {
    corps = JSON.parse(t);
  } catch {
    /* not json */
  }
  return { status: r.status(), corps };
}
async function api(srv: Server, page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await brut(srv, page, method, url, data);
  assert.ok(r.status < 300, `${method} ${url} -> ${r.status} ${JSON.stringify(r.corps)}`);
  return r.corps;
}
async function ouvrirFiche(page: Any, univers: number, id: number, titre: string): Promise<void> {
  await page.goto(`/univers/${univers}/fiche/${id}`);
  await page.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor();
  await attendre(page);
}
async function monde(srv: Server, antor: Any): Promise<{ U: number; E: number; ids: Record<string, number> }> {
  const us = await api(srv, antor, 'GET', '/api/univers');
  const U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
  const E = us.find((u: Any) => u.nom === 'Essai Kanka').id;
  const ids: Record<string, number> = {};
  for (const q of ['Port-Sel', 'Sphères', 'Aldric', 'Guilde', 'Taverne']) {
    for (const f of (await api(srv, antor, 'GET', `/api/univers/${U}/fiches?q=${encodeURIComponent(q)}`)).fiches) ids[f.titre] = f.id;
  }
  return { U, E, ids };
}
const menuFiche = (page: Any, titre: string) => page.getByRole('button', { name: `Autres actions sur « ${titre} »` });
const boite = (page: Any) => page.getByRole('alertdialog');
const normaliser = (s: string) => s.replace(/’/g, "'").replace(/\s+/g, ' ').trim();

// ───────────────────────────── B-39 : le titre, édité en place ─────────────────────────────
describe('kanevas-import-tenir · B-39, renommer une fiche en place (E-9)', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let U = 0;
  let ids: Record<string, number> = {};
  let port = 0;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    ({ U, ids } = await monde(srv, antor));
    port = ids['Port-Sel']!;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const editer = async (page: Any, titre: string) => {
    await page.getByRole('button', { name: `Renommer « ${titre} »` }).click();
    const champ = page.getByLabel('Titre de la fiche');
    await champ.waitFor();
    return champ;
  };

  // Panne : le clic sur le titre n'ouvre plus l'édition, ou Entrée n'enregistre plus, ou les suivants gardent l'ancien nom.
  test('B-39 nominal : Antor renomme « Port-Sel » en « Port-Sel-sur-Brume » (clic, Entrée), le fil des descendants et la liste suivent, un lien vers elle reste vivant', async () => {
    await ouvrirFiche(antor, U, port, 'Port-Sel');
    const champ = await editer(antor, 'Port-Sel');
    await champ.fill('Port-Sel-sur-Brume');
    await champ.press('Enter');
    await antor.getByText('Fiche renommée.').first().waitFor();
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel-sur-Brume', exact: true }).waitFor();
    await antor.screenshot({ path: `${SHOTS}/renomme.png` });
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'Port-Sel-sur-Brume');
    await antor.reload();
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel-sur-Brume', exact: true }).waitFor();
    // un descendant : son fil d'Ariane
    await ouvrirFiche(antor, U, ids['La Taverne du Kraken']!, 'La Taverne du Kraken');
    const fil = await antor.getByRole('navigation', { name: /Fil d.Ariane/i }).first().innerText();
    assert.ok(fil.includes('Port-Sel-sur-Brume') && !/Port-Sel(?!-sur)/.test(fil), fil);
    // un lien [[…]] vers elle, dans « Maître Aldric » : il vise l'identifiant, il n'est pas cassé
    await ouvrirFiche(antor, U, ids['Maître Aldric']!, 'Maître Aldric');
    const lien = antor.locator(`main a.lien-fiche[href="/univers/${U}/fiche/${port}"]`).first();
    await lien.waitFor();
    assert.ok(!(await texte(antor)).includes('lien cassé'));
    await lien.click();
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel-sur-Brume', exact: true }).waitFor();
  });

  // Panne : la recherche garde l'ancien titre, ou la liste du type garde l'ancien badge.
  test('B-39 : la liste « Lieux » montre « Port-Sel-sur-Brume » et la recherche du nouveau titre rend la fiche', async () => {
    const r = await api(srv, antor, 'GET', `/api/univers/${U}/fiches?type=lieu`);
    const titres = r.fiches.map((f: Any) => f.titre);
    assert.ok(titres.includes('Port-Sel-sur-Brume'), titres.join('|'));
    assert.ok(!titres.includes('Port-Sel'), titres.join('|'));
    const q = await api(srv, antor, 'GET', `/api/univers/${U}/fiches?q=Brume`);
    assert.ok(q.fiches.some((f: Any) => f.id === port));
  });

  // Bords : vide, 121 caractères, 120 caractères, rognage, inchangé, Échap, perte de focus.
  test('B-39 bord : titre vidé, « Erreur : le titre est obligatoire. », le champ reste ouvert, rien n’est enregistré', async () => {
    await ouvrirFiche(antor, U, port, 'Port-Sel-sur-Brume');
    const champ = await editer(antor, 'Port-Sel-sur-Brume');
    await champ.fill('   ');
    await champ.press('Enter');
    await antor.getByText('Erreur : le titre est obligatoire.').waitFor();
    assert.equal(await champ.isVisible(), true, 'le champ reste ouvert');
    await champ.press('Escape');
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel-sur-Brume', exact: true }).waitFor();
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'Port-Sel-sur-Brume');
  });

  test('B-39 bord : 121 caractères refusés (« Erreur : 120 caractères au plus. »), 120 acceptés, espaces rognés', async () => {
    await ouvrirFiche(antor, U, port, 'Port-Sel-sur-Brume');
    let champ = await editer(antor, 'Port-Sel-sur-Brume');
    await champ.fill('T'.repeat(121));
    await champ.press('Enter');
    await antor.getByText('Erreur : 120 caractères au plus.').waitFor();
    assert.equal(await champ.isVisible(), true);
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'Port-Sel-sur-Brume');
    await champ.fill('T'.repeat(120));
    await champ.press('Enter');
    await antor.getByText('Fiche renommée.').first().waitFor();
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'T'.repeat(120));
    champ = await editer(antor, 'T'.repeat(120));
    await champ.fill('  Port-Sel-sur-Brume  ');
    await champ.press('Enter');
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel-sur-Brume', exact: true }).waitFor();
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'Port-Sel-sur-Brume');
  });

  test('B-39 bord : titre inchangé, aucune requête d’écriture ; Échap annule la saisie ; la perte de focus enregistre', async () => {
    await ouvrirFiche(antor, U, port, 'Port-Sel-sur-Brume');
    const ecritures: string[] = [];
    antor.on('request', (r: Any) => {
      if (r.method() !== 'GET' && r.url().includes('/fiches/')) ecritures.push(`${r.method()} ${r.url()}`);
    });
    let champ = await editer(antor, 'Port-Sel-sur-Brume');
    await champ.press('Enter');
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel-sur-Brume', exact: true }).waitFor();
    await attendre(antor);
    assert.deepEqual(ecritures, [], 'titre inchangé : rien n’est envoyé');
    champ = await editer(antor, 'Port-Sel-sur-Brume');
    await champ.fill('Brouillon');
    await champ.press('Escape');
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel-sur-Brume', exact: true }).waitFor();
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'Port-Sel-sur-Brume');
    champ = await editer(antor, 'Port-Sel-sur-Brume');
    await champ.fill('Port-Sel-sur-Brume bis');
    await antor.locator('main').click({ position: { x: 5, y: 400 } });
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel-sur-Brume bis', exact: true }).waitFor();
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'Port-Sel-sur-Brume bis');
  });

  // Échec : le serveur répond une erreur.
  test('B-39 échec : l’enregistrement échoue, « L’action n’a pas abouti. Réessayez. » sous le titre, le champ reste ouvert avec la saisie', async () => {
    await ouvrirFiche(antor, U, port, 'Port-Sel-sur-Brume bis');
    await antor.route(`**/api/univers/${U}/fiches/${port}`, (route: Any) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue());
    const champ = await editer(antor, 'Port-Sel-sur-Brume bis');
    await champ.fill('Nouveau nom');
    await champ.press('Enter');
    await antor.getByText(/L.action n.a pas abouti\. Réessayez\./).first().waitFor();
    assert.equal(await champ.inputValue(), 'Nouveau nom');
    await antor.screenshot({ path: `${SHOTS}/renommer-echec.png` });
    await antor.unroute(`**/api/univers/${U}/fiches/${port}`);
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'Port-Sel-sur-Brume bis');
  });

  // Exclusions : seul le MJ renomme.
  test('B-39 exclusion : Léa (Joueuse) voit le titre en texte, sans bouton ni champ ; le serveur refuse son PATCH', async () => {
    await ouvrirFiche(lea, U, port, 'Port-Sel-sur-Brume bis');
    assert.equal(await lea.getByRole('button', { name: /^Renommer/ }).count(), 0);
    await lea.getByRole('heading', { level: 1 }).click();
    assert.equal(await lea.getByLabel('Titre de la fiche').count(), 0);
    const r = await brut(srv, lea, 'PATCH', `/api/univers/${U}/fiches/${port}`, { titre: 'Piraté' });
    assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port}`)).titre, 'Port-Sel-sur-Brume bis');
  });

  test('B-39 exclusion : Antor en mode Joueur voit le titre en texte, sans bouton de renommage', async () => {
    await ouvrirFiche(antor, U, port, 'Port-Sel-sur-Brume bis');
    await antor.getByRole('radio', { name: 'Mode Joueur' }).click();
    await antor.getByRole('button', { name: /^Renommer/ }).waitFor({ state: 'detached' });
    await antor.getByRole('radio', { name: 'Mode MJ' }).click();
    await antor.getByRole('button', { name: /^Renommer/ }).first().waitFor();
  });
});

// ───────────────────────────── B-40 : supprimer une fiche ─────────────────────────────
describe('kanevas-import-tenir · B-40, supprimer une fiche (E-9)', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let U = 0;
  let E = 0;
  let ids: Record<string, number> = {};
  const A = () => `/api/univers/${U}`;

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    ({ U, E, ids } = await monde(srv, antor));
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const ouvrirBoite = async (page: Any, titre: string) => {
    await menuFiche(page, titre).click();
    await page.getByRole('menuitem', { name: 'Supprimer la fiche…' }).click();
    await boite(page).waitFor();
  };
  const bilanTexte = async (page: Any) => {
    await boite(page).getByText('Chargement…').waitFor({ state: 'detached' });
    return normaliser(await boite(page).innerText());
  };

  // Panne : la boîte ne compte plus un poste (sections, relations, places, fichiers, enfants), ou ne dit plus que les fichiers restent.
  test('B-40 nominal : la boîte de « Port-Sel » compte 3 sections, 3 relations, 1 place, 2 fichiers qui restent, 5 enfants sous « Les Sphères », liens cassés ; Annuler ne touche à rien', async () => {
    await ouvrirFiche(antor, U, ids['Port-Sel']!, 'Port-Sel');
    await ouvrirBoite(antor, 'Port-Sel');
    const t = await bilanTexte(antor);
    assert.equal(
      t,
      "Supprimer « Port-Sel » ? 3 sections ; 3 relations qui la visent ; 1 place sur une carte. Ses 2 fichiers restent dans la médiathèque. Ses 5 enfants remonteront sous « Les Sphères ». Les liens qui la visent deviendront des liens cassés. Annuler Supprimer la fiche",
    );
    await antor.screenshot({ path: `${SHOTS}/boite-port-sel.png` });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
    await boite(antor).waitFor({ state: 'detached' });
    assert.equal((await api(srv, antor, 'GET', `${A()}/fiches/${ids['Port-Sel']}`)).titre, 'Port-Sel');
    assert.equal((await api(srv, antor, 'GET', `${A()}/fiches/${ids['Port-Sel']}/enfants`)).enfants.length, 5);
  });

  // Échec : le bilan ne se charge pas, puis revient ; la suppression échoue.
  test('B-40 échec : bilan en erreur « Impossible de charger le détail. » puis « Réessayer » ; suppression qui échoue, la boîte reste, la fiche n’a pas bougé', async () => {
    const port = ids['Port-Sel']!;
    await ouvrirFiche(antor, U, port, 'Port-Sel');
    let panne = true;
    await antor.route(`**${A()}/fiches/${port}/suppression`, (route: Any) =>
      panne ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : route.continue());
    await ouvrirBoite(antor, 'Port-Sel');
    await boite(antor).getByText('Impossible de charger le détail.').waitFor();
    assert.equal(await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).isDisabled(), true);
    panne = false;
    await boite(antor).getByRole('button', { name: 'Réessayer' }).click();
    await boite(antor).getByText(/3 sections/).waitFor();
    await antor.unroute(`**${A()}/fiches/${port}/suppression`);
    await antor.route(`**${A()}/fiches/${port}`, (route: Any) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : route.continue());
    await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).click();
    await boite(antor).getByText(/L.action n.a pas abouti\. Réessayez\./).waitFor();
    await antor.screenshot({ path: `${SHOTS}/suppression-echec.png` });
    await antor.unroute(`**${A()}/fiches/${port}`);
    assert.equal((await api(srv, antor, 'GET', `${A()}/fiches/${port}`)).titre, 'Port-Sel');
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  test('B-40 état : pendant la lecture du bilan, « Chargement… » et « Supprimer la fiche » inactif', async () => {
    const port = ids['Port-Sel']!;
    await ouvrirFiche(antor, U, port, 'Port-Sel');
    await antor.route(`**${A()}/fiches/${port}/suppression`, async (route: Any) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await ouvrirBoite(antor, 'Port-Sel');
    await boite(antor).getByText('Chargement…').waitFor();
    assert.equal(await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).isDisabled(), true);
    await boite(antor).getByText(/3 sections/).waitFor();
    assert.equal(await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).isEnabled(), true);
    await antor.unroute(`**${A()}/fiches/${port}/suppression`);
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Bords : la fiche seule, le singulier, sans parent.
  test('B-40 bord : une fiche seule dit « Cette fiche ne porte rien d’autre. »', async () => {
    const f = (await api(srv, antor, 'POST', `${A()}/fiches`, { type: 'lieu', titre: 'Îlot seul' })).id;
    await ouvrirFiche(antor, U, f, 'Îlot seul');
    await ouvrirBoite(antor, 'Îlot seul');
    const t = await bilanTexte(antor);
    assert.ok(t.includes("Cette fiche ne porte rien d'autre."), t);
    for (const poste of ['section', 'relation', 'place', 'fichier', 'enfant']) assert.ok(!t.includes(poste), `poste nul « ${poste} » nommé : ${t}`);
    await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).click();
    await antor.getByText('Fiche supprimée.').first().waitFor();
  });

  test('B-40 bord : 1 section, 1 relation, 1 place, 1 fichier, 1 enfant sous un parent — tout au singulier', async () => {
    const creer = async (titre: string) => (await api(srv, antor, 'POST', `${A()}/fiches`, { type: 'lieu', titre })).id as number;
    const parent = await creer('Parent singulier');
    const f = await creer('Fiche mince');
    const enfant = await creer('Enfant unique');
    await api(srv, antor, 'PATCH', `${A()}/fiches/${f}`, { parent });
    await api(srv, antor, 'PATCH', `${A()}/fiches/${enfant}`, { parent: f });
    const sec = (await api(srv, antor, 'POST', `${A()}/fiches/${f}/sections`, { titre: 'Notes' })).id;
    await api(srv, antor, 'POST', `${A()}/fiches/${ids['Maître Aldric']}/sections/2/relations`, { cibleFicheId: f, type: 'connaît' });
    await api(srv, antor, 'POST', `${A()}/cartes/1/elements`, { ficheId: f });
    const r = await antor.request.fetch(`${srv.base}${A()}/fichiers`, {
      method: 'POST',
      multipart: { section: String(sec), maniere: 'joint', fichier: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('x') } },
    });
    assert.ok(r.status() < 300, `upload ${r.status()}`);
    await ouvrirFiche(antor, U, f, 'Fiche mince');
    await ouvrirBoite(antor, 'Fiche mince');
    assert.equal(
      await bilanTexte(antor),
      "Supprimer « Fiche mince » ? 1 section ; 1 relation qui la vise ; 1 place sur une carte. Son fichier reste dans la médiathèque. Son enfant remontera sous « Parent singulier ». Les liens qui la visent deviendront des liens cassés. Annuler Supprimer la fiche",
    );
    await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).click();
    await antor.getByText('Fiche supprimée.').first().waitFor();
    assert.equal((await api(srv, antor, 'GET', `${A()}/fiches/${parent}/enfants`)).enfants[0].titre, 'Enfant unique');
  });

  test('B-40 bord : une fiche sans parent, avec 2 enfants, les remonte « à la racine de la liste du type »', async () => {
    const creer = async (titre: string) => (await api(srv, antor, 'POST', `${A()}/fiches`, { type: 'lieu', titre })).id as number;
    const f = await creer('Racine mère');
    const a = await creer('Fille A');
    const b = await creer('Fille B');
    await api(srv, antor, 'PATCH', `${A()}/fiches/${a}`, { parent: f });
    await api(srv, antor, 'PATCH', `${A()}/fiches/${b}`, { parent: f });
    await ouvrirFiche(antor, U, f, 'Racine mère');
    await ouvrirBoite(antor, 'Racine mère');
    assert.ok((await bilanTexte(antor)).includes('Ses 2 enfants remonteront à la racine de la liste du type.'));
    await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).click();
    await antor.getByText('Fiche supprimée.').first().waitFor();
    for (const id of [a, b]) {
      const fiche = await api(srv, antor, 'GET', `${A()}/fiches/${id}`);
      assert.deepEqual(fiche.ancetres, []);
    }
  });

  // Exclusions avant la suppression : un Joueur n'a ni le geste, ni la route, ni les nombres.
  test('B-40 exclusion : Léa n’a pas « Supprimer la fiche… » ; le serveur refuse son DELETE et ne lui donne pas le bilan', async () => {
    const port = ids['Port-Sel']!;
    await ouvrirFiche(lea, U, port, 'Port-Sel');
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur « Port-Sel »/ }).count(), 0);
    assert.equal(await lea.getByText('Supprimer la fiche…').count(), 0);
    const bilan = await brut(srv, lea, 'GET', `${A()}/fiches/${port}/suppression`);
    assert.ok(bilan.status >= 400 && bilan.status < 500, `bilan ${bilan.status}`);
    assert.ok(!JSON.stringify(bilan.corps).includes('enfants'), 'aucun nombre pour un Joueur');
    const del = await brut(srv, lea, 'DELETE', `${A()}/fiches/${port}`);
    assert.ok(del.status >= 400 && del.status < 500, `delete ${del.status}`);
    assert.equal((await api(srv, antor, 'GET', `${A()}/fiches/${port}`)).titre, 'Port-Sel');
  });

  // Le critère : la suppression de « Port-Sel », puis ce qui doit avoir changé.
  test('B-40 nominal : Antor supprime « Port-Sel », toast « Fiche supprimée. », retour à la liste des lieux où elle n’est plus', async () => {
    const port = ids['Port-Sel']!;
    // avant : « Mentionnée dans » de deux autres fiches la nomme, la carte la place
    for (const autre of ['Maître Aldric', 'La Guilde des Brumes']) {
      const m = (await api(srv, antor, 'GET', `${A()}/fiches/${ids[autre]}`)).mentions.map((x: Any) => x.titre);
      assert.ok(m.includes('Port-Sel'), `${autre} : ${m.join('|')}`);
    }
    assert.deepEqual((await api(srv, antor, 'GET', `${A()}/cartes/1`)).elements.map((e: Any) => e.titre), ['Port-Sel']);
    await ouvrirFiche(antor, U, port, 'Port-Sel');
    await ouvrirBoite(antor, 'Port-Sel');
    await bilanTexte(antor);
    await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).click();
    await antor.getByText('Fiche supprimée.').first().waitFor();
    await antor.waitForURL(new RegExp(`/univers/${U}/fiches/lieux`));
    await antor.getByRole('heading', { level: 1, name: 'Lieux' }).waitFor();
    await attendre(antor);
    await antor.screenshot({ path: `${SHOTS}/apres-suppression.png` });
    assert.ok(!(await texte(antor)).includes('Port-Sel'), 'Port-Sel ne figure plus dans la liste des lieux');
  });

  test('B-40 : les 5 enfants sont sous « Les Sphères », et « Port-Sel » répond « Page introuvable. »', async () => {
    const enfants = (await api(srv, antor, 'GET', `${A()}/fiches/${ids['Les Sphères']}/enfants`)).enfants.map((e: Any) => e.titre);
    for (const t of ['La Taverne du Kraken', 'Le Phare aux Sels', 'Le Repaire des contrebandiers', 'Les Docks', 'Quartier des Cordiers']) {
      assert.ok(enfants.includes(t), `${t} manque sous Les Sphères : ${enfants.join('|')}`);
    }
    assert.ok(!enfants.includes('Port-Sel'));
    const fil = await (async () => {
      await ouvrirFiche(antor, U, ids['La Taverne du Kraken']!, 'La Taverne du Kraken');
      return antor.getByRole('navigation', { name: /Fil d.Ariane/i }).first().innerText();
    })();
    assert.ok(fil.includes('Les Sphères') && !fil.includes('Port-Sel'), fil);
    await antor.goto(`/univers/${U}/fiche/${ids['Port-Sel']}`);
    await antor.getByText('Page introuvable.').waitFor();
    await antor.screenshot({ path: `${SHOTS}/adresse-introuvable.png` });
    const r = await brut(srv, antor, 'GET', `${A()}/fiches/${ids['Port-Sel']}`);
    assert.equal(r.status, 404);
  });

  // Panne : le texte du lien reste un lien vivant vers une fiche disparue, ou Léa voit « lien cassé ».
  test('B-40 : un lien vers « Port-Sel » est « lien cassé » pour Antor et du texte pour Léa', async () => {
    await ouvrirFiche(antor, U, ids['Maître Aldric']!, 'Maître Aldric');
    await antor.getByTitle(/Lien cassé/).first().waitFor();
    assert.equal(await antor.locator(`main a[href="/univers/${U}/fiche/${ids['Port-Sel']}"]`).count(), 0, 'plus de lien cliquable');
    await antor.screenshot({ path: `${SHOTS}/lien-casse-antor.png` });
    await ouvrirFiche(lea, U, ids['Maître Aldric']!, 'Maître Aldric');
    const corps = await lea.locator('main').innerText();
    assert.ok(corps.includes('Il règne sur Port-Sel.'), corps);
    assert.equal(await lea.getByTitle(/Lien cassé/i).count(), 0, 'Léa ne voit pas « lien cassé »');
    assert.equal(await lea.locator(`main a[href="/univers/${U}/fiche/${ids['Port-Sel']}"]`).count(), 0);
    await lea.screenshot({ path: `${SHOTS}/lien-casse-lea.png` });
  });

  test('B-40 : ses relations, ses mentions et sa place sur la carte ont disparu', async () => {
    const aldric = await api(srv, antor, 'GET', `${A()}/fiches/${ids['Maître Aldric']}`);
    assert.ok(!aldric.mentions.some((m: Any) => m.titre === 'Port-Sel'), 'Mentionnée dans (Aldric)');
    const guilde = await api(srv, antor, 'GET', `${A()}/fiches/${ids['La Guilde des Brumes']}`);
    assert.ok(!guilde.mentions.some((m: Any) => m.titre === 'Port-Sel'), 'Mentionnée dans (Guilde)');
    assert.deepEqual((await api(srv, antor, 'GET', `${A()}/fiches/${ids['Maître Aldric']}/sections/1/relations`)).relations, []);
    const carte = await api(srv, antor, 'GET', `${A()}/cartes/1`);
    assert.deepEqual(carte.elements, []);
  });

  // Panne : la suppression emporte les fichiers de la médiathèque.
  test('B-40 : « port-sel-quais.webp » et « Carte des Sphères » restent dans la médiathèque (E-19)', async () => {
    const noms = (await api(srv, antor, 'GET', `${A()}/fichiers`)).fichiers.map((f: Any) => f.nom);
    assert.ok(noms.includes('port-sel-quais.webp'), noms.join('|'));
    assert.ok(noms.includes('Carte des Sphères'), noms.join('|'));
    await antor.goto(`/univers/${U}`);
    await attendre(antor);
    await antor.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Médiathèque', exact: true }).click();
    await attendre(antor);
    await antor.getByText('port-sel-quais.webp').first().waitFor();
    await antor.screenshot({ path: `${SHOTS}/mediatheque.png` });
  });

  test('B-40 exclusion : supprimer « Port-Sel » ne supprime ni ses enfants, ni les fiches qui la mentionnaient', async () => {
    for (const t of ['Maître Aldric', 'La Guilde des Brumes', 'La Taverne du Kraken', 'Les Sphères']) {
      assert.equal((await api(srv, antor, 'GET', `${A()}/fiches/${ids[t]}`)).titre, t);
    }
  });

  // Un compte-rendu se supprime de même, retour à E-13.
  test('B-40 : un compte-rendu se supprime de même et ramène à la liste des comptes-rendus (E-13)', async () => {
    const c = await api(srv, antor, 'POST', `${A()}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'La Couronne brisée', sections: [{ titre: 'Présentation', joueursLisent: true }] });
    const cr = await api(srv, antor, 'POST', `${A()}/comptes-rendus`, { campagneId: c.id, titre: 'Session 12', texte: 'On a ri.' });
    await ouvrirFiche(antor, U, cr.id, 'Session 12');
    await ouvrirBoite(antor, 'Session 12');
    assert.ok((await bilanTexte(antor)).includes('Supprimer « Session 12 » ?'));
    await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).click();
    await antor.getByText('Fiche supprimée.').first().waitFor();
    await antor.getByRole('heading', { level: 1, name: 'Comptes-rendus' }).waitFor();
    assert.equal((await brut(srv, antor, 'GET', `${A()}/fiches/${cr.id}`)).status, 404);
  });

  // Import : DELETE de l'API d'import, sans pierre tombale.
  test('B-40 import : un DELETE d’import compte « Fiches : 1 supprimée », une clé inconnue ne compte rien', async () => {
    const imp = async (method: string, chemin: string, corps?: unknown) => {
      const r = await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, {
        method,
        headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
      const t = await r.text();
      return { status: r.status, corps: t ? JSON.parse(t) : null };
    };
    const lot = (await imp('POST', '/lots')).corps.lotId;
    const sec = [{ cle: 'description', titre: 'Description', contenu: 'Une anse.', joueursLisent: true, joueursEcrivent: false }];
    assert.equal((await imp('PUT', `/fiches/lieu%3Aecume?lot=${lot}`, { type: 'lieu', titre: 'Écume', sections: sec })).corps.etat, 'creee');
    assert.ok((await imp('DELETE', `/fiches/lieu%3Aecume?lot=${lot}`)).status < 300);
    assert.equal((await imp('GET', `/lots/${lot}`)).corps.compteurs.fiches.supprimees, 1);
    assert.ok((await imp('DELETE', `/fiches/lieu%3Ainconnue?lot=${lot}`)).status < 300);
    assert.equal((await imp('GET', `/lots/${lot}`)).corps.compteurs.fiches.supprimees, 1, 'clé inconnue : rien n’est compté');
    const titres = (await api(srv, antor, 'GET', `/api/univers/${E}/fiches?q=%C3%89cume`)).fiches.map((f: Any) => f.titre);
    assert.deepEqual(titres, []);
  });
});

// ───────────────────────────── B-41 : supprimer un univers ─────────────────────────────
describe('kanevas-import-tenir · B-41, supprimer un univers d’essai (E-14) et rejouer sans pierre tombale', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let U = 0;
  let E = 0;

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    ({ U, E } = await monde(srv, antor));
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const imp = async (method: string, chemin: string, corps?: unknown) => {
    const r = await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, {
      method,
      headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const t = await r.text();
    return { status: r.status, corps: t ? JSON.parse(t) : null };
  };
  const ouvrirParametres = async (page: Any, univers: number) => {
    await page.goto(`/univers/${univers}/parametres`);
    await page.getByRole('button', { name: /^Supprimer l.univers$/ }).waitFor();
    await attendre(page);
  };
  const ouvrirBoiteUnivers = async (page: Any, univers: number) => {
    await ouvrirParametres(page, univers);
    await page.getByRole('button', { name: /^Supprimer l.univers$/ }).click();
    await boite(page).waitFor();
  };
  const champNom = (page: Any) => boite(page).getByLabel(/Tapez le nom de l.univers pour confirmer/);
  const confirmer = (page: Any) => boite(page).getByRole('button', { name: /^Supprimer l.univers$/ });

  // Panne : « pas de pierre tombale » n'est plus tenu, la fiche supprimée reste fantôme au rejeu.
  test('B-40 rejeu : Antor importe « Havre-Gris » (lieu:havre-gris), la supprime sur E-9, rejoue le même appel : « creee » et la fiche est de nouveau là', async () => {
    const corps = { type: 'lieu', titre: 'Havre-Gris', sections: [{ cle: 'description', titre: 'Description', contenu: 'Un havre sous la brume.', joueursLisent: true, joueursEcrivent: false }] };
    const a = await imp('PUT', '/fiches/lieu%3Ahavre-gris', corps);
    assert.equal(a.corps.etat, 'creee');
    const id = a.corps.id ?? (await api(srv, antor, 'GET', `/api/univers/${E}/fiches?q=Havre`)).fiches[0].id;
    await ouvrirFiche(antor, E, id, 'Havre-Gris');
    await menuFiche(antor, 'Havre-Gris').click();
    await antor.getByRole('menuitem', { name: 'Supprimer la fiche…' }).click();
    await boite(antor).getByText('Chargement…').waitFor({ state: 'detached' });
    await boite(antor).getByRole('button', { name: 'Supprimer la fiche' }).click();
    await antor.getByText('Fiche supprimée.').first().waitFor();
    assert.deepEqual((await api(srv, antor, 'GET', `/api/univers/${E}/fiches?q=Havre`)).fiches, []);
    const b = await imp('PUT', '/fiches/lieu%3Ahavre-gris', corps);
    assert.equal(b.corps.etat, 'creee');
    const titres = (await api(srv, antor, 'GET', `/api/univers/${E}/fiches?q=Havre`)).fiches.map((f: Any) => f.titre);
    assert.deepEqual(titres, ['Havre-Gris']);
  });

  // Exclusions : seul un MJ de l'univers supprime.
  test('B-41 exclusion : Léa (Joueuse d’« Essai Kanka ») n’a pas le panneau (« Page introuvable. ») et son DELETE est refusé', async () => {
    await lea.goto(`/univers/${E}/parametres`);
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await lea.getByRole('button', { name: /Supprimer l.univers/ }).count(), 0);
    const r = await brut(srv, lea, 'DELETE', `/api/univers/${E}`, { nom: 'Essai Kanka' });
    assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
    assert.ok((await api(srv, antor, 'GET', '/api/univers')).some((u: Any) => u.nom === 'Essai Kanka'));
  });

  // Bords : le nom à la lettre près.
  test('B-41 bord : « essai kanka », « Essai Kanka␠ », « Essai », vide laissent le bouton inactif ; « Essai Kanka » l’active', async () => {
    await ouvrirBoiteUnivers(antor, E);
    assert.equal(
      normaliser(await boite(antor).innerText()),
      "Supprimer « Essai Kanka » ? Tout son contenu — fiches, sections, fichiers de la médiathèque, campagnes, cartes, jetons — sera effacé, pour tous ses membres. Le système de jeu reste. Tapez le nom de l'univers pour confirmer Annuler Supprimer l'univers",
    );
    assert.equal(await confirmer(antor).isDisabled(), true, 'champ vide');
    for (const saisie of ['essai kanka', 'Essai Kanka ', ' Essai Kanka', 'Essai', 'ESSAI KANKA']) {
      await champNom(antor).fill(saisie);
      assert.equal(await confirmer(antor).isDisabled(), true, `« ${saisie} »`);
    }
    await champNom(antor).fill('Essai Kanka');
    assert.equal(await confirmer(antor).isEnabled(), true);
    await antor.screenshot({ path: `${SHOTS}/univers-boite-active.png` });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
    assert.ok((await api(srv, antor, 'GET', '/api/univers')).some((u: Any) => u.nom === 'Essai Kanka'), 'Annuler ne supprime rien');
  });

  // Échec : le serveur recompare le nom ; la suppression échoue.
  test('B-41 échec : un nom différent envoyé au serveur est refusé (400, « Le nom ne correspond pas à celui de l’univers. »), l’univers est intact', async () => {
    const r = await brut(srv, antor, 'DELETE', `/api/univers/${E}`, { nom: 'essai kanka' });
    assert.equal(r.status, 400);
    assert.equal(r.corps.code ?? r.corps.detail, 'nom_different');
    assert.equal(r.corps.message, "Le nom ne correspond pas à celui de l'univers.");
    const sans = await brut(srv, antor, 'DELETE', `/api/univers/${E}`, {});
    assert.ok(sans.status >= 400 && sans.status < 500, `sans nom : ${sans.status}`);
    assert.ok((await api(srv, antor, 'GET', '/api/univers')).some((u: Any) => u.nom === 'Essai Kanka'));
  });

  test('B-41 échec : la suppression échoue, « L’action n’a pas abouti. Réessayez. » dans la boîte qui reste ouverte, l’univers est intact', async () => {
    await ouvrirBoiteUnivers(antor, E);
    await antor.route(`**/api/univers/${E}`, (route: Any) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : route.continue());
    await champNom(antor).fill('Essai Kanka');
    await confirmer(antor).click();
    await boite(antor).getByText(/L.action n.a pas abouti\. Réessayez\./).waitFor();
    await antor.screenshot({ path: `${SHOTS}/univers-echec.png` });
    assert.equal(await boite(antor).isVisible(), true);
    await antor.unroute(`**/api/univers/${E}`);
    assert.ok((await api(srv, antor, 'GET', '/api/univers')).some((u: Any) => u.nom === 'Essai Kanka'));
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Le critère : taper le nom exact supprime l'univers.
  test('B-41 nominal : avec « Essai Kanka » exact, « Suppression… » inactif pendant l’attente, puis accueil, « Univers supprimé. », l’univers n’y est plus', async () => {
    await ouvrirBoiteUnivers(antor, E);
    await antor.route(`**/api/univers/${E}`, async (route: Any) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      await new Promise((r) => setTimeout(r, 2000));
      return route.continue();
    });
    await champNom(antor).fill('Essai Kanka');
    await confirmer(antor).click();
    const enCours = boite(antor).getByRole('button', { name: 'Suppression…' });
    await enCours.waitFor();
    assert.equal(await enCours.isDisabled(), true);
    await antor.getByText('Univers supprimé.').first().waitFor();
    await antor.getByRole('heading', { level: 1, name: 'Mes univers' }).waitFor();
    await attendre(antor);
    await antor.screenshot({ path: `${SHOTS}/univers-supprime.png` });
    const t = await texte(antor);
    assert.ok(!t.includes('Essai Kanka'), 'accueil d’Antor');
    assert.ok(t.includes("Lame d'Ébène"));
    assert.ok(!(await api(srv, antor, 'GET', '/api/univers')).some((u: Any) => u.nom === 'Essai Kanka'));
  });

  test('B-41 : Léa ne l’a plus à l’accueil, son adresse répond « Page introuvable. », les fiches et le jeton d’import partent', async () => {
    await lea.goto('/');
    await lea.getByRole('heading', { level: 1, name: 'Mes univers' }).waitFor();
    await attendre(lea);
    assert.ok(!(await texte(lea)).includes('Essai Kanka'), 'accueil de Léa');
    await lea.goto(`/univers/${E}`);
    await lea.getByText('Page introuvable.').waitFor();
    await lea.screenshot({ path: `${SHOTS}/univers-introuvable-lea.png` });
    assert.equal((await brut(srv, lea, 'GET', `/api/univers/${E}`)).status, 404);
    assert.equal((await brut(srv, antor, 'GET', `/api/univers/${E}/fiches`)).status, 404);
    const j = await imp('GET', '');
    assert.equal(j.status, 401, 'le jeton du bouchon est parti avec l’univers');
  });

  test('B-41 exclusion : « Lame d’Ébène » (autre univers) est intacte, avec ses fiches', async () => {
    const fiches = await api(srv, antor, 'GET', `/api/univers/${U}/fiches?type=lieu`);
    const port = fiches.fiches.find((f: Any) => f.titre === 'Port-Sel');
    assert.ok(port);
    assert.equal((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port.id}/enfants`)).enfants.length, 5, 'ses 5 enfants');
    assert.deepEqual((await api(srv, antor, 'GET', `/api/univers/${U}/fiches/${port.id}`)).ancetres.map((x: Any) => x.titre), ['Les Sphères'], 'son parent');
  });

  test('B-41 exclusion : supprimer un univers rattaché laisse son système de jeu', async () => {
    const cof = (await api(srv, antor, 'GET', '/api/systemes')).find((s: Any) => s.nom === 'CoF Mini');
    const nouvel = (await api(srv, antor, 'POST', '/api/univers', { nom: 'Éphémère' })).id;
    assert.equal((await brut(srv, antor, 'PUT', `/api/univers/${nouvel}/systeme`, { systemeId: cof.id })).status, 204);
    const avant = await api(srv, antor, 'GET', `/api/systemes/${cof.id}`);
    assert.equal((await brut(srv, antor, 'DELETE', `/api/univers/${nouvel}`, { nom: 'Éphémère' })).status, 204);
    const apres = await api(srv, antor, 'GET', `/api/systemes/${cof.id}`);
    assert.equal(apres.nom, 'CoF Mini');
    assert.deepEqual(apres.entrees, avant.entrees, 'les entrées du système restent');
  });
});
