// ecrans: acces-api, fiche, vue-ensemble
// Need-based tests of kanevas-scenarios-import-assistant (B-61, B-62), written from the feature sheet and
// docs/parcours.md / docs/ecrans.md only. The real server in stub mode WITH its starting data (token of the
// stub, « Essai Kanka » id 4, « Lame d'Ébène » id 1), real SQLite, a real Chromium for E-12 and E-18.
// Every expected value is a literal read from the need.
//
// TEST PLAN (need -> case -> proof)
//   B-61 nominal   : PUT campagne:couronne (aventure, Campagne, en_cours) then scenario:acte-2 (parent, prete)
//                    -> both « creee », statuses kept, the scenario sits under the campaign
//   B-61 bords     : status omitted -> en_preparation ; identical replay -> « inchangee » ; unknown status -> 400
//   B-61 B-48      : after Antor sets the scenario « En cours », replay (prete) keeps « en_cours » and warns
//                    « statut modifié dans Kanevas » ; same for a sub-type and a parent changed in Kanevas
//   B-61 CR        : a compte_rendu with campagne:campagne:couronne reads « Campagne : La Couronne brisée »;
//                    an unknown campagne key is refused 400
//   B-61 GET base  : names « aventure » among the types, no campagne/scenario type, lists the statuts
//   B-61 lot       : the closed lot counts the adventures under « fiches », E-18 shows « Fiches : 2 créées »,
//                    no « Campagnes » / « Scénarios » line
//   B-61 exclusion : a bad token -> 401 and nothing is written ; a disabled type warns type_desactive
//   B-61 semis     : the stub seed of « Lame d'Ébène » carries « La Couronne brisée » and « Acte II »
//   B-61 echantillon : `npm run import:echantillon` passes on a fresh base
//   B-62 nominal   : Antor, in E-12 : « crée une campagne « Les Cendres » » then « crée un scénario
//                    « Le Creuset » dans « Les Cendres » » -> two adventures, block « Fiche « X » créée »,
//                    « Ouvrir » leads to the sheet, the scenario is under the campaign, « En préparation »
//   B-62 exclusions: Léa has no tool : nothing created, no writing block ; a player never sees what Antor made
//   B-62 echec     : an unknown parent -> nothing created, no writing block ; a disabled type -> nothing created
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let kanka = 0;
let lame = 0;
let base = '';
const h = { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' };

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  const us = await (await antor.request.get('/api/univers')).json();
  kanka = us.find((u: Any) => u.nom === 'Essai Kanka').id;
  lame = us.find((u: Any) => u.nom === 'Lame d’Ébène' || u.nom === "Lame d'Ébène").id;
  base = `${srv.base}/api/import/v1/univers/${kanka}`;
  // The state the screens below read (the effects of these pushes are proved by src/routes/import-assistant-lot-acces.test.ts).
  const l1 = await lot();
  await put('campagne:couronne', CAMPAGNE, l1);
  await put('scenario:acte-2', SCENARIO, l1);
  await clore(l1);
  const l2 = await lot();
  await put('scenario:acte-3', { type: 'aventure', sousType: 'Scénario', titre: 'Acte III', parent: 'campagne:couronne', sections: [] }, l2);
  await clore(l2);
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

async function lot(): Promise<number> {
  return (await (await fetch(`${base}/lots`, { method: 'POST', headers: h })).json()).lotId;
}
async function clore(id: number): Promise<Any> {
  return (await fetch(`${base}/lots/${id}/clore`, { method: 'POST', headers: h })).json();
}
async function put(cle: string, body: unknown, lotId?: number, headers: Any = h) {
  const r = await fetch(`${base}/fiches/${encodeURIComponent(cle)}${lotId ? `?lot=${lotId}` : ''}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as Any };
}
async function aventures(page: Any, univers: number): Promise<Any[]> {
  return (await (await page.request.get(`/api/univers/${univers}/fiches?type=aventure`)).json()).fiches;
}
const parTitre = (l: Any[], t: string) => l.find((f) => f.titre === t);
const CAMPAGNE = { type: 'aventure', sousType: 'Campagne', statut: 'en_cours', titre: 'La Couronne brisée', sections: [] };
const SCENARIO = { type: 'aventure', sousType: 'Scénario', statut: 'prete', parent: 'campagne:couronne', titre: 'Acte II', sections: [] };

test('B-61 E-18 : la ligne du lot dit « Fiches : 2 créées » et ne porte ni « Campagnes » ni « Scénarios »', opts, async () => {
  // Panne visée : l'écran des lots garde des compteurs par nature d'aventure.
  await antor.goto(`/univers/${kanka}/acces-api`);
  await antor.getByRole('heading', { name: 'Lots d’import' }).waitFor();
  const tete = antor.locator('.lot-tete', { hasText: 'Fiches : 2 créées' }).first();
  await tete.waitFor();
  const bloc = antor.locator('section', { has: antor.getByRole('heading', { name: 'Lots d’import' }) }).first();
  assert.doesNotMatch(await bloc.innerText(), /Campagnes|Scénarios/);
  await antor.screenshot({ path: '/tmp/captures-import-assistant-e18.png' });
});

test('B-61 CR : un compte-rendu importé avec campagne:campagne:couronne montre « Campagne : La Couronne brisée »', opts, async () => {
  // Panne visée : le CR nomme son aventure par une clé de l'ancienne route, ou pas du tout.
  const l = await lot();
  const r = await put('cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', campagne: 'campagne:couronne', sections: [{ cle: 'texte', titre: 'Récit', contenu: 'La table a gagné la crypte.', joueursLisent: true }] }, l);
  await clore(l);
  await antor.goto(`/univers/${kanka}/fiche/${r.json.id}`);
  await antor.getByText('Campagne : La Couronne brisée').waitFor();
  await antor.screenshot({ path: '/tmp/captures-import-assistant-cr.png' });
});

// ---------------------------------------------------------------- B-62 : l'assistant (E-12)
const bouton = (p: Any) => p.getByRole('button', { name: 'Demander à Kanevas' });
const panneau = (p: Any) => p.getByRole('complementary', { name: /Kanevas — assistant/ });
async function ouvrir(p: Any, univers: number) {
  await p.goto(`/univers/${univers}`);
  await attendre(p);
  if ((await panneau(p).count()) === 0) await bouton(p).click();
  await panneau(p).getByRole('textbox', { name: 'Demander à Kanevas' }).waitFor();
}
async function demander(p: Any, q: string) {
  await panneau(p).getByRole('textbox', { name: 'Demander à Kanevas' }).fill(q);
  await panneau(p).getByRole('button', { name: 'Envoyer' }).click();
}

test('B-62 critère : Antor crée une campagne puis un scénario dans E-12, « Ouvrir » mène à chaque fiche, « En préparation »', opts, async () => {
  // Panne visée : l'outil creer_fiche manque, ignore le sous-type ou le parent, ou « Ouvrir » ne mène nulle part.
  await ouvrir(antor, lame);
  await demander(antor, 'Crée une campagne « Les Cendres »');
  await panneau(antor).getByText('Fiche « Les Cendres » créée').waitFor();
  await panneau(antor).getByRole('link', { name: /^Ouvrir/ }).first().click();
  await antor.waitForURL(/\/univers\/[^/]+\/fiche\/\d+$/);
  await antor.getByRole('heading', { name: 'Les Cendres' }).first().waitFor();
  await antor.getByText('En préparation').first().waitFor();
  await antor.screenshot({ path: '/tmp/captures-import-assistant-campagne.png' });

  if ((await panneau(antor).count()) === 0) await bouton(antor).click();
  await demander(antor, 'Crée un scénario « Le Creuset » dans « Les Cendres »');
  await panneau(antor).getByText('Fiche « Le Creuset » créée').waitFor();
  await panneau(antor).getByRole('link', { name: /^Ouvrir/ }).last().click();
  await antor.waitForURL(/\/univers\/[^/]+\/fiche\/\d+$/);
  await antor.getByRole('heading', { name: 'Le Creuset' }).first().waitFor();
  await antor.screenshot({ path: '/tmp/captures-import-assistant-scenario.png' });
});

test('B-62 exclusion : Léa n’a pas l’outil — aucun bloc d’écriture dans le panneau', opts, async () => {
  // Panne visée : l'outil de création est offert au Joueur, ou une aventure du MJ fuit vers lui.
  await ouvrir(lea, lame);
  const reponse = lea.waitForResponse((r: Any) => /\/assistant\/messages/.test(r.url()));
  await demander(lea, 'Crée une campagne « Les Braises »');
  await panneau(lea).getByText('Crée une campagne « Les Braises »').waitFor();
  await reponse; // l'absence se vérifie sur la page posée, une fois la réponse du bouchon rendue
  await attendre(lea);
  assert.equal(await panneau(lea).getByText('Écrit par l’assistant').count(), 0);
  assert.equal(await panneau(lea).getByText(/^Fiche « .* » créée$/).count(), 0);
  await lea.screenshot({ path: '/tmp/captures-import-assistant-lea.png' });
});

test('B-62 échec : un parent inconnu dit « Introuvable. » et n’écrit aucun bloc', opts, async () => {
  // Panne visée : la fiche naît à la racine quand son parent n'existe pas.
  await ouvrir(antor, lame);
  await demander(antor, 'Crée un scénario « Orphelin » dans « Nulle part »');
  await panneau(antor).getByText('Introuvable.').waitFor();
  assert.equal(await panneau(antor).getByText('Fiche « Orphelin » créée').count(), 0);
});

// ---------------------------------------------------------------- type désactivé (en dernier : il change l'univers 4 puis le rétablit)
test('B-61 / B-62 exclusion : type « aventure » désactivé -> l’assistant n’écrit aucun bloc de création', opts, async () => {
  // Panne visée : la création d'une aventure passe alors que le MJ a désactivé le type.
  await antor.request.put(`/api/univers/${kanka}/types/aventure`, { data: { etat: 'desactive' } });
  try {
    await ouvrir(antor, kanka);
    const reponse = antor.waitForResponse((r: Any) => /\/assistant\/messages/.test(r.url()));
    await demander(antor, 'Crée une campagne « Fermée aussi »');
    await panneau(antor).getByText('Crée une campagne « Fermée aussi »').waitFor();
    await reponse;
    await attendre(antor);
    assert.equal(await panneau(antor).getByText('Fiche « Fermée aussi » créée').count(), 0);
  } finally {
    await antor.request.put(`/api/univers/${kanka}/types/aventure`, { data: { etat: 'suivre' } });
  }
});
