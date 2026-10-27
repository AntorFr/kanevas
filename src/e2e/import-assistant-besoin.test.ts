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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const exec = promisify(execFile);
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

test('B-61 critère : la campagne puis le scénario sous elle se créent avec leurs statuts, le lot les compte parmi les fiches', opts, async () => {
  // Panne visée : aventure refusée par la route, statut ignoré, parent non posé, ou compteurs « campagnes ».
  const l = await lot();
  const a = await put('campagne:couronne', CAMPAGNE, l);
  assert.equal(a.status, 200);
  assert.equal(a.json.etat, 'creee');
  const b = await put('scenario:acte-2', SCENARIO, l);
  assert.equal(b.status, 200);
  assert.equal(b.json.etat, 'creee');
  const rapport = await clore(l);
  assert.equal(rapport.compteurs.fiches.creees, 2);
  assert.equal(rapport.compteurs.campagnes, undefined);
  assert.equal(rapport.compteurs.scenarios, undefined);

  const liste = await aventures(antor, kanka);
  const camp = parTitre(liste, 'La Couronne brisée');
  const scen = parTitre(liste, 'Acte II');
  assert.equal(camp.sousType, 'Campagne');
  assert.equal(camp.charge.statut, 'en_cours');
  assert.equal(scen.sousType, 'Scénario');
  assert.equal(scen.charge.statut, 'prete');
  const fiche = await (await antor.request.get(`/api/univers/${kanka}/fiches/${scen.id}`)).json();
  assert.deepEqual(fiche.ancetres.map((x: Any) => x.titre), ['La Couronne brisée']);
});

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

test('B-61 bord : rejeu identique -> inchangee ; statut omis à la création -> en_preparation ; statut inconnu -> 400 sans fiche', opts, async () => {
  // Panne visée : le rejeu réécrit (mise_a_jour), le défaut n'est pas « En préparation », un statut libre passe.
  const l = await lot();
  assert.equal((await put('campagne:couronne', CAMPAGNE, l)).json.etat, 'inchangee');
  assert.equal((await put('scenario:acte-2', SCENARIO, l)).json.etat, 'inchangee');
  const n = await put('scenario:acte-3', { type: 'aventure', sousType: 'Scénario', titre: 'Acte III', parent: 'campagne:couronne', sections: [] }, l);
  assert.equal(n.json.etat, 'creee');
  const mauvais = await put('scenario:acte-4', { type: 'aventure', titre: 'Acte IV', statut: 'archivee', sections: [] }, l);
  assert.equal(mauvais.status, 400);
  assert.equal(mauvais.json.code, 'invalide');
  await clore(l);
  const liste = await aventures(antor, kanka);
  assert.equal(parTitre(liste, 'Acte III').charge.statut, 'en_preparation');
  assert.equal(parTitre(liste, 'Acte IV'), undefined);
});

test('B-61 B-48 : après « En cours » posé par Antor, le rejeu ne réécrit pas le statut et l’avertissement le dit', opts, async () => {
  // Panne visée : le rejeu écrase le statut changé dans Kanevas, ou l'avertissement manque.
  const liste = await aventures(antor, kanka);
  const scen = parTitre(liste, 'Acte II');
  const p = await antor.request.patch(`/api/univers/${kanka}/fiches/${scen.id}`, { data: { statut: 'en_cours' } });
  assert.equal(p.status(), 200);
  const l = await lot();
  const r = await put('scenario:acte-2', SCENARIO, l);
  assert.equal(r.status, 200);
  assert.match(JSON.stringify(r.json.avertissements), /statut modifié dans Kanevas/);
  const rapport = await clore(l);
  assert.match(JSON.stringify(rapport.rapport), /statut modifié dans Kanevas/);
  assert.equal(parTitre(await aventures(antor, kanka), 'Acte II').charge.statut, 'en_cours');
});

test('B-61 B-48 : un sous-type et un parent changés dans Kanevas ne sont pas écrasés par le rejeu', opts, async () => {
  // Panne visée : B-48 ne couvre pas sousType / parent pour les aventures.
  const liste = await aventures(antor, kanka);
  const a3 = parTitre(liste, 'Acte III');
  const t = await antor.request.patch(`/api/univers/${kanka}/fiches/${a3.id}`, { data: { sousType: 'One-shot' } });
  assert.equal(t.status(), 200);
  const d = await antor.request.patch(`/api/univers/${kanka}/fiches/${a3.id}`, { data: { parent: null } });
  assert.equal(d.status(), 200);
  const l = await lot();
  const r = await put('scenario:acte-3', { type: 'aventure', sousType: 'Scénario', titre: 'Acte III', parent: 'campagne:couronne', sections: [] }, l);
  assert.equal(r.status, 200);
  const avert = JSON.stringify(r.json.avertissements);
  assert.match(avert, /sous-type modifié dans Kanevas/);
  assert.match(avert, /parent modifié dans Kanevas/);
  await clore(l);
  const apres = await (await antor.request.get(`/api/univers/${kanka}/fiches/${a3.id}`)).json();
  assert.equal(apres.sousType, 'One-shot');
  assert.deepEqual(apres.ancetres, []);
});

test('B-61 CR : un compte-rendu importé avec campagne:campagne:couronne montre « Campagne : La Couronne brisée »', opts, async () => {
  // Panne visée : le CR nomme son aventure par une clé de l'ancienne route, ou pas du tout.
  const l = await lot();
  const r = await put('cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', campagne: 'campagne:couronne', sections: [{ cle: 'texte', titre: 'Récit', contenu: 'La table a gagné la crypte.', joueursLisent: true }] }, l);
  assert.equal(r.status, 200);
  assert.equal(r.json.etat, 'creee');
  const inconnu = await put('cr:seance-2', { type: 'compte_rendu', titre: 'Séance 2', campagne: 'campagne:absente', sections: [] }, l);
  assert.equal(inconnu.status, 400);
  assert.equal(inconnu.json.champ, 'campagne');
  await clore(l);
  await antor.goto(`/univers/${kanka}/fiche/${r.json.id}`);
  await antor.getByText('Campagne : La Couronne brisée').waitFor();
  await antor.screenshot({ path: '/tmp/captures-import-assistant-cr.png' });
});

test('B-61 GET de la base : « aventure » parmi les types, aucun type campagne ni scénario, les quatre statuts', opts, async () => {
  // Panne visée : le contrat annonce encore les campagnes au script de Monsieur.
  const j = (await (await fetch(base, { headers: h })).json()) as Any;
  const types = j.types.map((t: Any) => t.type);
  assert.ok(types.includes('aventure'));
  for (const ancien of ['campagne', 'campagnes', 'scenario', 'scenarios']) assert.ok(!types.includes(ancien), ancien);
  assert.equal(j.campagnes, undefined);
  assert.deepEqual(j.statuts, ['en_preparation', 'prete', 'en_cours', 'terminee']);
});

test('B-61 exclusion : un jeton faux est refusé en 401 et n’écrit aucune aventure', opts, async () => {
  // Panne visée : la route des fiches accepte une aventure sans jeton valide.
  const r = await put('campagne:intruse', { type: 'aventure', titre: 'Intruse', sections: [] }, undefined, {
    authorization: 'Bearer kvs_faux', 'content-type': 'application/json',
  });
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'jeton_invalide');
  assert.equal(parTitre(await aventures(antor, kanka), 'Intruse'), undefined);
});

test('B-61 semis : « Lame d’Ébène » porte « La Couronne brisée » (Campagne) et « Acte II » (Scénario) dessous', opts, async () => {
  // Panne visée : le semis du bouchon ne porte pas les deux aventures dont l'assistant retrouve les phrases.
  const liste = await aventures(antor, lame);
  const camp = parTitre(liste, 'La Couronne brisée');
  const acte = liste.find((f) => f.titre.startsWith('Acte II'));
  assert.equal(camp.sousType, 'Campagne');
  assert.equal(acte.sousType, 'Scénario');
  const f = await (await antor.request.get(`/api/univers/${lame}/fiches/${acte.id}`)).json();
  assert.deepEqual(f.ancetres.map((x: Any) => x.titre), ['La Couronne brisée']);
  // Léa lit la campagne (Présentation ouverte), jamais le scénario
  const pourLea = (await aventures(lea, lame)).map((x) => x.titre);
  assert.deepEqual(pourLea, ['La Couronne brisée']);
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

test('B-62 critère : Antor crée une campagne puis un scénario dans E-12, « Ouvrir » mène à chaque fiche, le scénario est sous la campagne', opts, async () => {
  // Panne visée : l'outil creer_fiche manque, ignore le sous-type ou le parent, ou « Ouvrir » ne mène nulle part.
  await ouvrir(antor, lame);
  await demander(antor, 'Crée une campagne « Les Cendres »');
  await panneau(antor).getByText('Fiche « Les Cendres » créée').waitFor();
  await panneau(antor).getByRole('link', { name: /^Ouvrir/ }).first().click();
  await antor.waitForURL(/\/univers\/\d+\/fiche\/\d+$/);
  await antor.getByRole('heading', { name: 'Les Cendres' }).first().waitFor();
  await antor.getByText('En préparation').first().waitFor();
  await antor.screenshot({ path: '/tmp/captures-import-assistant-campagne.png' });

  if ((await panneau(antor).count()) === 0) await bouton(antor).click();
  await demander(antor, 'Crée un scénario « Le Creuset » dans « Les Cendres »');
  await panneau(antor).getByText('Fiche « Le Creuset » créée').waitFor();
  await panneau(antor).getByRole('link', { name: /^Ouvrir/ }).last().click();
  await antor.waitForURL(/\/univers\/\d+\/fiche\/\d+$/);
  await antor.getByRole('heading', { name: 'Le Creuset' }).first().waitFor();
  await antor.screenshot({ path: '/tmp/captures-import-assistant-scenario.png' });

  const liste = await aventures(antor, lame);
  const camp = parTitre(liste, 'Les Cendres');
  const scen = parTitre(liste, 'Le Creuset');
  assert.equal(camp.sousType, 'Campagne');
  assert.equal(camp.charge.statut, 'en_preparation');
  assert.equal(scen.sousType, 'Scénario');
  assert.equal(scen.charge.statut, 'en_preparation');
  const f = await (await antor.request.get(`/api/univers/${lame}/fiches/${scen.id}`)).json();
  assert.deepEqual(f.ancetres.map((x: Any) => x.titre), ['Les Cendres']);
});

test('B-62 exclusion : Léa n’a pas l’outil — rien n’est créé, aucun bloc d’écriture ; elle ne voit pas les fiches d’Antor', opts, async () => {
  // Panne visée : l'outil de création est offert au Joueur, ou une aventure du MJ fuit vers lui.
  await ouvrir(lea, lame);
  await demander(lea, 'Crée une campagne « Les Braises »');
  await panneau(lea).getByText('Crée une campagne « Les Braises »').waitFor();
  await lea.waitForTimeout(1500); // rien à attendre : on vérifie une absence ; la réponse du bouchon est synchrone
  assert.equal(await panneau(lea).getByText('Écrit par l’assistant').count(), 0);
  assert.equal(await panneau(lea).getByText(/^Fiche « .* » créée$/).count(), 0);
  await lea.screenshot({ path: '/tmp/captures-import-assistant-lea.png' });
  const titresLea = (await aventures(lea, lame)).map((x) => x.titre);
  assert.ok(!titresLea.includes('Les Braises'));
  assert.ok(!titresLea.includes('Les Cendres'));
  assert.ok(!titresLea.includes('Le Creuset'));
  assert.equal(parTitre(await aventures(antor, lame), 'Les Braises'), undefined);
});

test('B-62 échec : un parent inconnu ne crée rien et n’écrit aucun bloc', opts, async () => {
  // Panne visée : la fiche naît à la racine quand son parent n'existe pas.
  await ouvrir(antor, lame);
  const avant = (await aventures(antor, lame)).length;
  await demander(antor, 'Crée un scénario « Orphelin » dans « Nulle part »');
  await panneau(antor).getByText('Introuvable.').waitFor();
  assert.equal(await panneau(antor).getByText('Fiche « Orphelin » créée').count(), 0);
  assert.equal((await aventures(antor, lame)).length, avant);
});

// ---------------------------------------------------------------- type désactivé (en dernier : il change l'univers 4 puis le rétablit)
test('B-61 / B-62 exclusion : type « aventure » désactivé -> l’import avertit type_desactive, l’assistant ne crée rien', opts, async () => {
  // Panne visée : la création d'une aventure passe alors que le MJ a désactivé le type.
  const off = await antor.request.put(`/api/univers/${kanka}/types/aventure`, { data: { etat: 'desactive' } });
  assert.equal(off.status(), 200);
  try {
    const l = await lot();
    const r = await put('campagne:fermee', { type: 'aventure', sousType: 'Campagne', titre: 'Fermée', sections: [] }, l);
    assert.match(JSON.stringify(r.json), /type_desactive/);
    await clore(l);
    // Trou : le besoin ne dit pas si l'import écrit quand même la fiche avec l'avertissement ; pas d'attendu là-dessus.

    await ouvrir(antor, kanka);
    await demander(antor, 'Crée une campagne « Fermée aussi »');
    await panneau(antor).getByText('Crée une campagne « Fermée aussi »').waitFor();
    await antor.waitForTimeout(1500);
    assert.equal(await panneau(antor).getByText('Fiche « Fermée aussi » créée').count(), 0);
    assert.equal(parTitre(await aventures(antor, kanka), 'Fermée aussi'), undefined);
  } finally {
    await antor.request.put(`/api/univers/${kanka}/types/aventure`, { data: { etat: 'suivre' } });
  }
});

test('B-61 : `npm run import:echantillon` passe sur une base neuve avec l’échantillon mis à jour', opts, async () => {
  // Panne visée : l'échantillon ou le client d'import parle encore l'ancien contrat des campagnes.
  const neuf = await startServer({ KANEVAS_SANS_SEMIS: '' });
  try {
    const { stdout } = await exec('npm', ['run', '--silent', 'import:echantillon', '--', neuf.base, '4', JETON], { timeout: 120000 });
    assert.doesNotMatch(stdout, /refus\w*\s*:?\s*[1-9]/i);
    const lots = await (await fetch(`${neuf.base}/api/import/v1/univers/4/lots/1`, { headers: h })).json();
    assert.equal(lots.compteurs.fiches.creees, 15);
    assert.equal(lots.compteurs.fiches.refusees, 0);
  } finally {
    neuf.stop();
  }
});
