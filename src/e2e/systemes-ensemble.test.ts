// Black-box tests of kanevas-systemes written from the need (docs/parcours.md B-13, B-14, B-29,
// P-8; docs/ecrans.md E-14, E-15, bloc « Système de jeu » de E-3), not from the code. Expected
// values are literals taken from those docs. Same harness as the other e2e files: real server in
// stub mode + real Chromium. The tests of this file share one server and run in order.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  type Any,
  attendre as attendreHarnais,
  connecte,
  launch,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
  voit,
  type Server,
} from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 60000 };
const LAME = "Lame d'Ébène";
const LANDES = 'Les Landes grises';
// A field's label also carries its error text once it is in error: match the start only.
const NOM = /^Nom(?! du système)/;
const BANDEAU_PERDU = "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";

let srv: Server;
let browser: Any;
let antor: Any, mira: Any, lea: Any, teo: Any, admin: Any;
let idLame = 0, idLandes = 0, idBrume = 0;

async function attendre(page: Any): Promise<void> {
  await attendreHarnais(page);
  await page.waitForTimeout(200);
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '…'));
  await attendreHarnais(page);
}

async function creerUnivers(page: Any, nom: string): Promise<number> {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  await attendre(page);
  await page.getByRole('link', { name: rxExact('Créer un univers') }).or(page.getByRole('button', { name: rxExact('Créer un univers') })).first().click();
  await page.getByLabel(NOM).fill(nom);
  await page.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await page.waitForURL(/\/univers\/\d+$/);
  await attendre(page);
  return Number(/\/univers\/(\d+)/.exec(page.url())![1]);
}

async function ajouterMembre(page: Any, identifiant: string, role: 'MJ' | 'Joueur'): Promise<void> {
  await page.goto(`/univers/${idLame}/membres`);
  await attendre(page);
  await page.getByLabel('Identifiant du compte').fill(identifiant);
  await page.getByLabel('Rôle', { exact: true }).selectOption({ label: role });
  await page.getByRole('button', { name: rxExact('Ajouter') }).click();
  await attendre(page);
}

async function parametres(page: Any, id: number): Promise<void> {
  await page.goto(`/univers/${id}/parametres`);
  await page.getByLabel('Nom du système').waitFor();
  await attendre(page);
}
async function systeme(page: Any, id: number, onglet = 'Créatures'): Promise<void> {
  await page.goto(`/univers/${id}/systeme`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
  await ongletVers(page, onglet);
}
async function ongletVers(page: Any, onglet: string): Promise<void> {
  // the tab name carries its count since E-15 shows « Règles 3 » (maquette e15)
  const nom = new RegExp(rxExact(onglet).source.slice(0, -1) + '( \\d+)?$');
  await page.getByRole('tab', { name: nom }).or(page.getByRole('button', { name: rxExact(onglet) })).first().click();
  await attendre(page);
}
async function creerEtRattacher(page: Any, nom: string): Promise<void> {
  await page.getByLabel('Nom du système').fill(nom);
  await page.getByRole('button', { name: rxExact('Créer et rattacher') }).click();
  await attendre(page);
}
async function rattacher(page: Any, choix: string): Promise<void> {
  await page.getByLabel('Système du catalogue').selectOption({ label: choix });
  await page.getByRole('button', { name: rxExact('Rattacher') }).click();
  await attendre(page);
}
async function ajouterGabarit(page: Any, type: 'une règle' | 'une créature' | 'un objet', nom: string, contenu = ''): Promise<void> {
  await page.getByRole('button', { name: rxExact(`Ajouter ${type}`) }).click();
  await page.getByLabel(NOM).fill(nom);
  if (contenu) await page.getByLabel('Contenu').fill(contenu);
  await page.getByRole('button', { name: rxExact('Ajouter') }).click();
  await attendre(page);
}
async function optionsCatalogue(page: Any): Promise<string[]> {
  return (await page.getByLabel('Système du catalogue').locator('option').allTextContents()).map((s: string) => s.trim());
}
async function api(page: Any, methode: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, corps?: unknown): Promise<{ status: number; body: string }> {
  const r = await page.request.fetch(url, { method: methode, data: corps === undefined ? undefined : JSON.stringify(corps), headers: { 'content-type': 'application/json' } });
  return { status: r.status(), body: await r.text() };
}
async function sidDe(page: Any, idUnivers: number): Promise<number> {
  const r = await api(page, 'GET', `/api/univers/${idUnivers}`);
  return JSON.parse(r.body).systeme.id;
}
async function ouvrirEntree(page: Any, nom: string): Promise<void> {
  await page.getByText(rxExact(nom)).first().click();
  await attendre(page);
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  mira = (await connecte(browser, srv.base, 'Mira')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  teo = (await connecte(browser, srv.base, 'Teo')).page;
  admin = (await connecte(browser, srv.base, 'Admin')).page;
  idLame = await creerUnivers(antor, LAME);
  await ajouterMembre(antor, 'lea', 'Joueur');
}, { timeout: 120000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

describe('B-13 rattacher un univers à un système', opts, () => {
  test('Paramètres : item de barre du MJ, catalogue vide et univers sans système disent leur texte', opts, async () => {
    await antor.goto(`/univers/${idLame}`);
    await attendre(antor);
    await antor.getByRole('link', { name: rxExact('Paramètres') }).click();
    await attendre(antor);
    assert.match(antor.url(), new RegExp(`/univers/${idLame}/parametres$`));
    await voit(antor, "Le catalogue est vide. Créez le premier système ci-dessous.");
    await voit(antor, "Cet univers n'est rattaché à aucun système de jeu.");
    assert.deepEqual(await optionsCatalogue(antor), ['Aucun système']);
    assert.equal(await antor.getByRole('link', { name: rx('Ouvrir le système') }).count() + (await antor.getByRole('button', { name: rx('Ouvrir le système') }).count()), 0);
    await antor.screenshot({ path: '/tmp/sys-e14-vide.png' });
  });

  test('Antor crée et rattache « CoF Mini » : nom, « Utilisé par 1 univers », « Ouvrir le système »', opts, async () => {
    await creerEtRattacher(antor, 'CoF Mini');
    await voit(antor, 'Utilisé par 1 univers');
    const t = await texte(antor);
    assert.ok(t.includes('CoF Mini'));
    assert.ok(/Ouvrir le système/.test(t));
    assert.ok(!t.includes("n'est rattaché à aucun système"));
    assert.deepEqual(await optionsCatalogue(antor), ['Aucun système', 'CoF Mini']);
    await antor.screenshot({ path: '/tmp/sys-e14-rattache.png' });
  });

  test('un nom déjà pris, casse ignorée : « Un système porte déjà ce nom. » et rien n’est créé', opts, async () => {
    await creerEtRattacher(antor, 'cof mini');
    await voit(antor, 'Un système porte déjà ce nom.');
    assert.deepEqual(await optionsCatalogue(antor), ['Aucun système', 'CoF Mini']);
  });

  test('un nom de système vide : « Erreur : le nom est obligatoire. » ; 81 caractères : « Erreur : 80 caractères au plus. »', opts, async () => {
    await antor.getByLabel('Nom du système').fill('');
    await antor.getByRole('button', { name: rxExact('Créer et rattacher') }).click();
    await voit(antor, 'Erreur : le nom est obligatoire.');
    await antor.getByLabel('Nom du système').fill('x'.repeat(81));
    await antor.getByRole('button', { name: rxExact('Créer et rattacher') }).click();
    await voit(antor, 'Erreur : 80 caractères au plus.');
    assert.deepEqual(await optionsCatalogue(antor), ['Aucun système', 'CoF Mini']);
  });

  test('un nom de système de 80 caractères est accepté', opts, async () => {
    const nom = 'Z'.repeat(80);
    await creerEtRattacher(antor, nom);
    await attendre(antor);
    assert.ok((await optionsCatalogue(antor)).includes(nom));
    await rattacher(antor, 'CoF Mini');
    await voit(antor, 'Utilisé par 1 univers');
  });

  test('Identité : nom et description modifiés, « Enregistré. » ; nom vide refusé, 81 caractères refusés', opts, async () => {
    await antor.getByLabel(NOM).fill(LAME);
    await antor.getByLabel('Description').fill('Un royaume de brume.');
    await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(antor, 'Enregistré.');
    await antor.reload();
    await attendre(antor);
    assert.equal(await antor.getByLabel('Description').inputValue(), 'Un royaume de brume.');
    await antor.getByLabel(NOM).fill('');
    await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(antor, 'Erreur : le nom est obligatoire.');
    await antor.getByLabel(NOM).fill('n'.repeat(81));
    await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(antor, 'Erreur : 80 caractères au plus.');
    await antor.getByLabel(NOM).fill(LAME);
    await antor.getByLabel('Description').fill('d'.repeat(501));
    await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(antor, 'Erreur : 500 caractères au plus.');
    await antor.getByLabel('Description').fill('Un royaume de brume.');
  });

  test('Joueur : pas d’item « Paramètres » et l’adresse des paramètres dit « Page introuvable. »', opts, async () => {
    await lea.goto(`/univers/${idLame}`);
    await attendre(lea);
    assert.equal(await lea.getByRole('link', { name: rxExact('Paramètres') }).count(), 0);
    await lea.goto(`/univers/${idLame}/parametres`);
    await attendre(lea);
    await voit(lea, 'Page introuvable.');
    assert.ok(!(await texte(lea)).includes('CoF Mini'));
  });

  test('compte sans rôle dans l’univers (Teo) : « Page introuvable. » sur les paramètres et sur le système', opts, async () => {
    for (const fin of ['parametres', 'systeme']) {
      await teo.goto(`/univers/${idLame}/${fin}`);
      await attendre(teo);
      await voit(teo, 'Page introuvable.');
      assert.ok(!(await texte(teo)).includes('CoF Mini'));
    }
  });

  test('Mira crée « Les Landes grises », trouve « CoF Mini » au catalogue et s’y rattache : « Utilisé par 2 univers »', opts, async () => {
    idLandes = await creerUnivers(mira, LANDES);
    await parametres(mira, idLandes);
    const opt = await optionsCatalogue(mira);
    assert.ok(opt.includes('CoF Mini'), `catalogue: ${opt.join('|')}`);
    await voit(mira, "Cet univers n'est rattaché à aucun système de jeu.");
    await rattacher(mira, 'CoF Mini');
    await voit(mira, 'Utilisé par 2 univers');
    assert.ok(!(await texte(mira)).includes(LAME), 'no other universe is named');
  });

  test('le catalogue est ordonné alphabétiquement sans tenir compte de la casse, « Aucun système » en tête', opts, async () => {
    await creerEtRattacher(mira, 'abyme');
    await rattacher(mira, 'CoF Mini');
    const opt = await optionsCatalogue(mira);
    assert.equal(opt[0], 'Aucun système');
    assert.deepEqual(opt.slice(1, 3), ['abyme', 'CoF Mini']);
  });

  test('catalogue : un Joueur sans univers MJ et un compte sans univers n’en lisent aucun nom', opts, async () => {
    // Léa is only a Joueur; Admin has not created any universe yet.
    for (const page of [lea, admin]) {
      const r = await api(page, 'GET', '/api/systemes/catalogue');
      assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
      assert.ok(!r.body.includes('CoF Mini'));
    }
    const r = await api(antor, 'GET', '/api/systemes/catalogue');
    assert.equal(r.status, 200);
    assert.ok(r.body.includes('CoF Mini'));
  });
});

describe('B-14 le référentiel commun', opts, () => {
  test('E-15 vide : le MJ voit « Aucune créature pour l’instant. » et le bouton d’ajout, onglets Règles et Objets de même', opts, async () => {
    await antor.goto(`/univers/${idLame}/parametres`);
    await attendre(antor);
    await antor.getByRole('link', { name: rx('Ouvrir le système') }).or(antor.getByRole('button', { name: rx('Ouvrir le système') })).first().click();
    await attendre(antor);
    assert.match(antor.url(), new RegExp(`/systemes/\\d+$`)); // E-15 has its own address (AD-94)
    await voit(antor, 'CoF Mini');
    await voit(antor, 'Référentiel commun · utilisé par 2 univers');
    await voit(antor, "Aucune créature pour l'instant.");
    await antor.getByRole('button', { name: rxExact('Ajouter une créature') }).waitFor();
    await ongletVers(antor, 'Règles');
    await voit(antor, 'Aucune règle');
    await ongletVers(antor, 'Objets');
    await voit(antor, 'Aucun objet');
    await antor.screenshot({ path: '/tmp/sys-e15-vide.png' });
  });

  test('Joueur, onglet vide : « Aucune créature à voir pour l’instant. » sans bouton d’ajout', opts, async () => {
    await systeme(lea, idLame);
    await voit(lea, "Aucune créature à voir pour l'instant.");
    assert.equal(await lea.getByRole('button', { name: rx('^Ajouter') }).count(), 0);
  });

  test('Antor ajoute la créature « Garde du sceau » avec son contenu : elle apparaît sous « Créatures »', opts, async () => {
    await systeme(antor, idLame);
    await ajouterGabarit(antor, 'une créature', 'Garde du sceau', 'Sentinelle de pierre.\nDEF 14, PV 30.');
    await voit(antor, 'Garde du sceau');
    await voit(antor, 'Sentinelle de pierre.');
    await ouvrirEntree(antor, 'Garde du sceau');
    assert.ok((await texte(antor)).includes('DEF 14, PV 30.'));
    await antor.screenshot({ path: '/tmp/sys-e15-creature.png' });
  });

  test('Mira lit « Garde du sceau » et « Utilisé par 2 univers », sans aucun nom d’univers', opts, async () => {
    await systeme(mira, idLandes);
    await voit(mira, 'Garde du sceau');
    const t = await texte(mira);
    assert.ok(t.includes('utilisé par 2 univers'));
    assert.ok(!t.includes(LAME) && !t.includes('Ébène'));
    await antor.goto(`/univers/${idLame}`);
  });

  test('Léa, Joueuse, lit la créature depuis le bloc « Système de jeu » de la vue d’ensemble, sans Ajouter ni Modifier', opts, async () => {
    await lea.goto(`/univers/${idLame}`);
    await attendre(lea);
    await voit(lea, 'CoF Mini');
    await lea.getByRole('link', { name: rx('Ouvrir le système') }).first().click();
    await attendre(lea);
    await ongletVers(lea, 'Créatures');
    await voit(lea, 'Garde du sceau');
    await ouvrirEntree(lea, 'Garde du sceau');
    assert.ok((await texte(lea)).includes('DEF 14, PV 30.'));
    assert.equal(await lea.getByRole('button', { name: rx('^Ajouter') }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: rx('^Modifier') }).count(), 0);
  });

  test('écriture par l’API au nom de Léa refusée ; la même écriture par Antor passe', opts, async () => {
    const corps = { type: 'creature', nom: 'Intrus', contenu: '' };
    const refus = await api(lea, 'POST', `/api/systemes/${await sidDe(antor, idLame)}/gabarits`, corps);
    assert.ok(refus.status >= 400 && refus.status < 500, `status ${refus.status}`);
    const preuve = await api(antor, 'POST', `/api/systemes/${await sidDe(antor, idLame)}/gabarits`, { ...corps, nom: 'Intrus MJ' });
    assert.equal(preuve.status, 201, 'the same body is valid for a MJ');
    await systeme(lea, idLame);
    const t = await texte(lea);
    assert.ok(!t.includes('Intrus\n') && t.includes('Intrus MJ'));
    assert.ok(!/^Intrus$/m.test(t));
  });

  test('un nom déjà pris dans le même type : « Une créature porte déjà ce nom. » ; le même nom dans un autre type est permis', opts, async () => {
    await systeme(antor, idLame);
    await ajouterGabarit(antor, 'une créature', 'garde du SCEAU'.replace('SCEAU', 'sceau'));
    await voit(antor, 'Une créature porte déjà ce nom.');
    await antor.getByRole('button', { name: rxExact('Annuler') }).click();
    await ongletVers(antor, 'Règles');
    await ajouterGabarit(antor, 'une règle', 'Garde du sceau', 'Règle homonyme.');
    await voit(antor, 'Règle homonyme.');
  });

  test('nom vide : « Erreur : le nom est obligatoire. » ; 121 caractères : « Erreur : 120 caractères au plus. » ; contenu de 20 001 : « Erreur : 20 000 caractères au plus. »', opts, async () => {
    await ongletVers(antor, 'Objets');
    await antor.getByRole('button', { name: rxExact('Ajouter un objet') }).click();
    await antor.getByRole('button', { name: rxExact('Ajouter') }).click();
    await voit(antor, 'Erreur : le nom est obligatoire.');
    await antor.getByLabel(NOM).fill('o'.repeat(121));
    await antor.getByRole('button', { name: rxExact('Ajouter') }).click();
    await voit(antor, 'Erreur : 120 caractères au plus.');
    await antor.getByLabel(NOM).fill('Clé de brume');
    await antor.getByLabel('Contenu').fill('c'.repeat(20001));
    await antor.getByRole('button', { name: rxExact('Ajouter') }).click();
    await voit(antor, 'Erreur : 20 000 caractères au plus.');
    await antor.getByLabel('Contenu').fill('c'.repeat(20000));
    await antor.getByRole('button', { name: rxExact('Ajouter') }).click();
    await attendre(antor);
    await voit(antor, 'Clé de brume');
  });

  test('l’ordre des entrées est alphabétique sans tenir compte de la casse', opts, async () => {
    for (const nom of ['bête', 'Zèbre', 'Aigle']) await api(antor, 'POST', `/api/systemes/${await sidDe(antor, idLame)}/gabarits`, { type: 'creature', nom, contenu: '' });
    await systeme(antor, idLame);
    const noms: string[] = await antor.locator('main').getByText(/^(Aigle|bête|Garde du sceau|Intrus MJ|Zèbre)$/).allTextContents();
    assert.deepEqual(noms.map((s) => s.trim()), ['Aigle', 'bête', 'Garde du sceau', 'Intrus MJ', 'Zèbre']);
  });

  test('cent entrées à la fois puis « Charger la suite »', opts, async () => {
    for (let i = 1; i <= 101; i++) {
      const r = await api(antor, 'POST', `/api/systemes/${await sidDe(antor, idLame)}/gabarits`, { type: 'objet', nom: `Objet ${String(i).padStart(3, '0')}`, contenu: '' });
      assert.equal(r.status, 201);
    }
    await systeme(antor, idLame, 'Objets');
    const motif = /^Objet \d{3}$/;
    // « Clé de brume » (added above) sorts before « Objet 001 » : it takes one of the 100 places.
    assert.equal(await antor.getByText(motif).count(), 99);
    await antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
    await attendre(antor);
    assert.equal(await antor.getByText(motif).count(), 101);
    assert.equal(await antor.getByRole('button', { name: rxExact('Charger la suite') }).count(), 0);
  });

  test('modifier une entrée : le nouveau contenu est lu par Mira ; deux onglets, le second voit « Cette entrée a changé… » et garde son texte', opts, async () => {
    const un = await antor.context().newPage();
    const deux = await antor.context().newPage();
    for (const p of [un, deux]) {
      p.setDefaultTimeout(8000);
      await systeme(p, idLame);
      await ouvrirEntree(p, 'Aigle');
      await p.getByRole('button', { name: rxExact('Modifier') }).click();
    }
    await un.getByLabel('Contenu').fill('Rapace des cimes.');
    await un.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await attendre(un);
    await voit(un, 'Rapace des cimes.');
    await deux.getByLabel('Contenu').fill('Mon texte concurrent.');
    await deux.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(deux, "Cette entrée a changé depuis que vous l'avez ouverte.");
    assert.equal(await deux.getByLabel('Contenu').inputValue(), 'Mon texte concurrent.');
    await deux.getByRole('button', { name: rxExact('Recharger') }).waitFor();
    await systeme(mira, idLandes);
    await ouvrirEntree(mira, 'Aigle');
    assert.ok((await texte(mira)).includes('Rapace des cimes.'));
    assert.ok(!(await texte(mira)).includes('Mon texte concurrent.'));
    await un.close();
    await deux.close();
  });
});

describe('P-8 univers non rattaché, détachement', opts, () => {
  test('Admin crée « Brume », non rattaché : « Page introuvable. » sur le système, pas de bloc sur la vue d’ensemble, aucun nom au catalogue d’un autre', opts, async () => {
    idBrume = await creerUnivers(admin, 'Brume');
    await admin.goto(`/univers/${idBrume}`);
    await attendre(admin);
    const t = await texte(admin);
    assert.ok(!t.includes('Système de jeu') && !t.includes('CoF Mini') && !/Ouvrir le système/.test(t));
    await admin.goto(`/univers/${idBrume}/systeme`);
    await attendre(admin);
    await voit(admin, 'Page introuvable.');
    assert.ok(!(await texte(admin)).includes('CoF Mini'));
    const sidLame = await sidDe(antor, idLame);
    const r = await api(admin, 'GET', `/api/systemes/${sidLame}?type=creature`);
    assert.equal(r.status, 404);
    assert.ok(!r.body.includes('Garde du sceau'));
    await admin.screenshot({ path: '/tmp/sys-brume-introuvable.png' });
  });

  test('Mira, avant d’être rattachée, ne voyait rien : un univers fraîchement créé répond « Page introuvable. » sur le système', opts, async () => {
    const id = await creerUnivers(mira, 'Terres vierges');
    await mira.goto(`/univers/${id}/systeme`);
    await attendre(mira);
    await voit(mira, 'Page introuvable.');
    await mira.goto(`/univers/${id}`);
    await attendre(mira);
    assert.ok(!/Ouvrir le système/.test(await texte(mira)));
  });

  test('un MJ de Brume rattache Brume au même système, y voit le contenu, puis détache : le système et son contenu restent', opts, async () => {
    await parametres(admin, idBrume);
    await rattacher(admin, 'CoF Mini');
    await voit(admin, 'Utilisé par 3 univers');
    await systeme(admin, idBrume);
    await voit(admin, 'Garde du sceau');
    await parametres(admin, idBrume);
    await rattacher(admin, 'Aucun système');
    await voit(admin, "Cet univers n'est rattaché à aucun système de jeu.");
    assert.ok((await optionsCatalogue(admin)).includes('CoF Mini'));
    await admin.goto(`/univers/${idBrume}`);
    await attendre(admin);
    assert.ok(!/Ouvrir le système/.test(await texte(admin)));
    await systeme(mira, idLandes);
    await voit(mira, 'Garde du sceau');
    await voit(mira, 'utilisé par 2 univers');
  });

  test('un univers détaché pendant que le joueur lit : au prochain chargement la page du joueur dit « Page introuvable. »', opts, async () => {
    await systeme(lea, idLame);
    await voit(lea, 'Garde du sceau');
    await parametres(antor, idLame);
    await rattacher(antor, 'Aucun système');
    await voit(antor, "Cet univers n'est rattaché à aucun système de jeu.");
    await lea.reload();
    await attendre(lea);
    await voit(lea, 'Page introuvable.');
    await lea.goto(`/univers/${idLame}`);
    await attendre(lea);
    assert.ok(!/Ouvrir le système/.test(await texte(lea)));
    await antor.goto(`/univers/${idLame}`);
    await attendre(antor);
    assert.ok(!/Ouvrir le système/.test(await texte(antor)), 'no block on E-3 once detached');
    await parametres(antor, idLame);
    assert.ok((await optionsCatalogue(antor)).includes('CoF Mini'), 'the system stays in the catalogue');
    await rattacher(antor, 'CoF Mini');
    await systeme(antor, idLame);
    await voit(antor, 'Garde du sceau');
  });
});

describe('B-29 états de E-14 et E-15', opts, () => {
  const motifs: [string, RegExp, string, string][] = [];
  test('chargement : « Chargement des paramètres… » (E-14), « Chargement du système… » (E-15)', opts, async () => {
    const cas: [() => string, RegExp, string][] = [
      [() => `/univers/${idLame}/parametres`, /\/api\/(systemes$|univers\/\d+$)/, 'Chargement des paramètres…'],
      [() => `/univers/${idLame}/systeme`, /\/api\/(univers\/\d+$|systemes\/\d+)/, 'Chargement du système…'],
    ];
    for (const [url, motif, message] of cas) {
      const page = await antor.context().newPage();
      page.setDefaultTimeout(8000);
      await page.route(motif, async (route: Any) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.fallback();
      });
      await page.goto(url());
      await voit(page, message);
      await page.close();
    }
    void motifs;
  });

  test('erreur : « Impossible de charger cette page. » (E-14) et « Impossible de charger ce système. » (E-15), « Réessayer » rend le contenu', opts, async () => {
    const cas: [string, RegExp, string, string][] = [
      [`/univers/${idLame}/parametres`, /\/api\/(systemes$|univers\/\d+$)/, 'Impossible de charger cette page.', 'Utilisé par'],
      [`/univers/${idLame}/systeme`, /\/api\/(univers\/\d+$|systemes\/\d+)/, 'Impossible de charger ce système.', 'Garde du sceau'],
    ];
    for (const [url, motif, message, apres] of cas) {
      const page = await antor.context().newPage();
      page.setDefaultTimeout(8000);
      await page.route(motif, (route: Any) => route.abort('failed'));
      await page.goto(url);
      await voit(page, message);
      await page.unroute(motif);
      await page.getByRole('button', { name: rxExact('Réessayer') }).first().click();
      await voit(page, apres);
      await page.close();
    }
  });

  test('échec d’une écriture : « L’action n’a pas abouti. Réessayez. » et la saisie est conservée (E-14 et E-15)', opts, async () => {
    const page = await antor.context().newPage();
    page.setDefaultTimeout(8000);
    await parametres(page, idLame);
    await page.route(/\/api\/univers\/\d+\/systeme-nouveau$/, (route: Any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
    await page.getByLabel('Nom du système').fill('Système raté');
    await page.getByRole('button', { name: rxExact('Créer et rattacher') }).click();
    await voit(page, "L'action n'a pas abouti. Réessayez.");
    assert.equal(await page.getByLabel('Nom du système').inputValue(), 'Système raté');
    await systeme(page, idLame);
    await page.route(/\/api\/systemes\/\d+\/gabarits$/, (route: Any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
    await page.getByRole('button', { name: rxExact('Ajouter une créature') }).click();
    await page.getByLabel(NOM).fill('Échec');
    await page.getByLabel('Contenu').fill('Texte gardé');
    await page.getByRole('button', { name: rxExact('Ajouter') }).click();
    await voit(page, "L'action n'a pas abouti. Réessayez.");
    assert.equal(await page.getByLabel('Contenu').inputValue(), 'Texte gardé');
    await page.close();
  });

  test('connexion perdue : bandeau, boutons qui écrivent désactivés, saisie conservée, contenu lisible', opts, async () => {
    const page = await antor.context().newPage();
    page.setDefaultTimeout(8000);
    await parametres(page, idLame);
    await page.getByLabel('Nom du système').fill('Hors ligne');
    await page.context().setOffline(true);
    await voit(page, BANDEAU_PERDU);
    for (const b of ['Enregistrer', 'Rattacher', 'Créer et rattacher']) {
      assert.equal(await page.getByRole('button', { name: rxExact(b) }).first().isDisabled(), true, b);
    }
    assert.equal(await page.getByLabel('Nom du système').inputValue(), 'Hors ligne');
    await page.context().setOffline(false);
    await page.close();
    const p2 = await antor.context().newPage();
    p2.setDefaultTimeout(8000);
    await systeme(p2, idLame);
    await p2.getByRole('button', { name: rxExact('Ajouter une créature') }).click();
    await p2.getByLabel(NOM).fill('Saisie en cours');
    await p2.context().setOffline(true);
    await voit(p2, BANDEAU_PERDU);
    assert.equal(await p2.getByRole('button', { name: rxExact('Ajouter') }).isDisabled(), true);
    assert.equal(await p2.getByLabel(NOM).inputValue(), 'Saisie en cours');
    assert.ok((await texte(p2)).includes('Garde du sceau'));
    await p2.context().setOffline(false);
    await p2.close();
  });

  test('refus : rôle retiré pendant que la page est ouverte, « Vous ne pouvez plus modifier ces paramètres. » à l’écriture suivante', opts, async () => {
    // Teo becomes MJ of a scratch universe, opens its settings, then the only other MJ demotes him.
    const id = await creerUnivers(mira, 'Table de Teo');
    await mira.goto(`/univers/${id}/membres`);
    await attendre(mira);
    await mira.getByLabel('Identifiant du compte').fill('teo');
    await mira.getByLabel('Rôle', { exact: true }).selectOption({ label: 'MJ' });
    await mira.getByRole('button', { name: rxExact('Ajouter') }).click();
    await attendre(mira);
    await teo.goto(`/univers/${id}/parametres`);
    await attendre(teo);
    await parametres(teo, id);
    await mira.getByLabel('Rôle de teo').selectOption({ label: 'Joueur' });
    await attendre(mira);
    await teo.getByLabel(NOM).fill('Table de Teo bis');
    await teo.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(teo, 'Vous ne pouvez plus modifier ces paramètres.');
  });

  test('contenu long : un nom de 80 caractères est tronqué avec infobulle (E-14, bloc de E-3), 200 systèmes défilent', opts, async () => {
    const long = 'L'.repeat(40) + ' ' + 'M'.repeat(39);
    assert.equal(long.length, 80);
    for (let i = 1; i <= 200; i++) await api(antor, 'POST', '/api/systemes', { nom: `Sys ${String(i).padStart(3, '0')}` });
    await parametres(antor, idLame);
    await antor.getByLabel('Nom du système').fill(long);
    await antor.getByRole('button', { name: rxExact('Créer et rattacher') }).click();
    await attendre(antor);
    assert.equal((await optionsCatalogue(antor)).length >= 202, true);
    await antor.goto(`/univers/${idLame}`);
    await attendre(antor);
    const bloc = antor.getByText(rx(long.slice(0, 20))).first();
    await bloc.waitFor();
    assert.equal(await bloc.getAttribute('title'), long);
    await antor.screenshot({ path: '/tmp/sys-e3-long.png' });
  });
});
