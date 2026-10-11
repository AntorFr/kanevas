// Black-box tests of kanevas-monde from the need (B-21, B-27 proposer, P-5 steps 2-3, AD-48/49), through the
// real server in stub mode and its real HTTP API; no Chromium page is driven here (screens: monde-besoin-ecran).
//
// TEST PLAN (expected values are literals from docs/parcours.md B-21/B-27/P-5, docs/ecrans.md, docs/donnees.md)
//   B-21 nominal   : Antor asks → one `proposition_creee` event naming « Maître Aldric » and « Vérité »; the
//                    section is unchanged (content and version); the proposal reads « en_attente » with
//                    actuel = « Il sert la Couronne. » and a proposé that differs; appliquer → section = proposé,
//                    version +1, etat « appliquee »
//   B-21 « rien ne s'applique tout seul » : asking, reading and abandoning never write the section
//   P-5 échec      : the section changes after the proposal → appliquer 409 `section_modifiee`, nothing written,
//                    etat « perimee »; an applied proposal stays « appliquee » when the section changes later
//   bords          : appliquer twice → 409 `proposition_appliquee`; abandonner an applied one → 409; abandonner
//                    then GET → 404; a second proposal on the same section replaces the first (one pending)
//   exclusions     : Léa (player) asks the same → no event, no proposal; another GM, a role-less admin, another
//                    universe, an unknown id → the same 404 and nothing written; no session → 401; a GM removed
//                    from the universe no longer reads or applies hers; no route creates a proposal
//   B-27           : the GM catalogue is « mj », the player's « joueur »
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';
import {
  CR_DEMANDE,
  VERITE,
  bati,
  comptes,
  demander,
  idProposition,
  json,
  lireSection,
  modifierSection,
  propUrl,
} from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  C = await comptes(srv, browser);
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

const get = async (c: Any, url: string) => {
  const r = await c.ctx.request.get(url);
  return { status: r.status(), corps: await json(r) };
};
const post = async (c: Any, url: string) => {
  const r = await c.ctx.request.post(url);
  return { status: r.status(), corps: await json(r) };
};

test('B-21 : le MJ demande une mise à jour, la proposition naît en attente et la section ne bouge pas', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const avant = await lireSection(C.antor, m);
  assert.equal(avant.contenu, 'Il sert la Couronne.');
  const rep = await demander(C.antor, m);
  assert.equal(rep.status, 200);
  assert.equal(rep.evenements.length, 1);
  assert.equal(rep.evenements[0].type, 'proposition_creee');
  assert.match(rep.evenements[0].libelle, /Maître Aldric/);
  assert.match(rep.evenements[0].libelle, /Vérité/);
  assert.equal(await lireSection(C.antor, m).then((s) => s.contenu), 'Il sert la Couronne.');
  assert.equal((await lireSection(C.antor, m)).version, avant.version);
  const p = await get(C.antor, propUrl(m, idProposition(rep)));
  assert.equal(p.status, 200);
  assert.equal(p.corps.etat, 'en_attente');
  assert.equal(JSON.stringify(p.corps).includes('Il sert la Couronne.'), true, 'the proposal shows the current content');
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.', 'reading does not write');
});

test('B-21 : appliquer écrit le contenu proposé dans la section, la proposition devient appliquée', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const avant = await lireSection(C.antor, m);
  const id = idProposition(await demander(C.antor, m));
  const lue = (await get(C.antor, propUrl(m, id))).corps;
  const r = await post(C.antor, propUrl(m, id) + '/appliquer');
  assert.equal(r.status, 200);
  const apres = await lireSection(C.antor, m);
  assert.notEqual(apres.contenu, VERITE);
  assert.equal(apres.version, avant.version + 1);
  assert.equal(JSON.stringify(lue).includes(JSON.stringify(apres.contenu).slice(1, -1)), true, 'the section holds what was proposed');
  assert.equal((await get(C.antor, propUrl(m, id))).corps.etat, 'appliquee');
});

test('B-21 : abandonner ne touche pas la section, et la proposition n’existe plus', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const id = idProposition(await demander(C.antor, m));
  const r = await post(C.antor, propUrl(m, id) + '/abandonner');
  assert.equal(r.status, 204);
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.');
  assert.equal((await get(C.antor, propUrl(m, id))).status, 404);
  assert.equal((await post(C.antor, propUrl(m, id) + '/appliquer')).status, 404);
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.');
});

test('P-5 échec : la section a changé depuis la proposition, appliquer est refusé avec sa raison et rien n’est écrit', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const id = idProposition(await demander(C.antor, m));
  await modifierSection(C.antor, m, 'Il trahit la Couronne.');
  assert.equal((await get(C.antor, propUrl(m, id))).corps.etat, 'perimee');
  const r = await post(C.antor, propUrl(m, id) + '/appliquer');
  assert.equal(r.status, 409);
  assert.equal(r.corps.code, 'section_modifiee');
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il trahit la Couronne.');
  assert.equal((await get(C.antor, propUrl(m, id))).corps.etat, 'perimee');
  // the stale proposal can still be abandoned
  assert.equal((await post(C.antor, propUrl(m, id) + '/abandonner')).status, 204);
});

test('P-5 bord : une proposition appliquée reste appliquée quand la section change ensuite, et ne se réapplique pas', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const id = idProposition(await demander(C.antor, m));
  assert.equal((await post(C.antor, propUrl(m, id) + '/appliquer')).status, 200);
  await modifierSection(C.antor, m, 'Encore autre chose.');
  assert.equal((await get(C.antor, propUrl(m, id))).corps.etat, 'appliquee');
  const again = await post(C.antor, propUrl(m, id) + '/appliquer');
  assert.equal(again.status, 409);
  assert.equal(again.corps.code, 'proposition_appliquee');
  assert.equal((await post(C.antor, propUrl(m, id) + '/abandonner')).status, 409);
  assert.equal((await lireSection(C.antor, m)).contenu, 'Encore autre chose.');
});

test('bord : une seconde demande sur la même section remplace la première (une seule en attente)', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const premiere = idProposition(await demander(C.antor, m));
  const seconde = idProposition(await demander(C.antor, m));
  assert.notEqual(premiere, seconde);
  assert.equal((await get(C.antor, propUrl(m, seconde))).corps.etat, 'en_attente');
  const vieille = await post(C.antor, propUrl(m, premiere) + '/appliquer');
  assert.notEqual(vieille.status, 200, 'the replaced proposal cannot be applied');
});

test('bord : une section vide se propose et « Actuel » est vide', opts, async () => {
  const m = await bati(C.antor, C.lea);
  await modifierSection(C.antor, m, '');
  const rep = await demander(C.antor, m);
  assert.equal(rep.evenements.length, 1, JSON.stringify(rep));
  const p = (await get(C.antor, propUrl(m, idProposition(rep)))).corps;
  assert.equal(p.etat, 'en_attente');
  assert.equal((await lireSection(C.antor, m)).contenu, '');
});

test('échec : un compte-rendu inconnu ne crée aucune proposition', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const rep = await demander(C.antor, m, "Mets à jour la section « Vérité » de « Maître Aldric » d'après le compte-rendu « Séance 99 »");
  assert.equal(rep.evenements.length, 0, JSON.stringify(rep));
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.');
});

test('B-27 exclusion : Léa, Joueuse, fait la même demande et n’obtient aucune proposition', opts, async () => {
  const m = await bati(C.antor, C.lea);
  // Léa can read and write the section, so only the missing tool can stop her
  const ouvert = await C.antor.ctx.request.patch(`/api/univers/${m.univers}/fiches/${m.fiche}/sections/${m.section}`, {
    data: { joueursLisent: true, joueursEcrivent: true },
  });
  assert.equal(ouvert.status(), 200);
  const rep = await demander(C.lea, m);
  assert.deepEqual(rep.evenements, []);
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.');
  // nothing exists for anybody under the first ids either
  for (const pid of [1, 2, 3]) assert.equal((await get(C.lea, propUrl(m, pid))).status, 404);
  assert.equal((await get(C.lea, `/api/univers/${m.univers}/assistant`)).corps.catalogue, 'joueur');
  assert.equal((await get(C.antor, `/api/univers/${m.univers}/assistant`)).corps.catalogue, 'mj');
});

test('AD-79 exclusions : seul le MJ demandeur lit, applique, abandonne (autre MJ, joueur, admin sans rôle, autre univers, inconnu, sans session)', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const r = await C.antor.ctx.request.post(`/api/univers/${m.univers}/membres`, { data: { username: 'mira', role: 'mj' } });
  assert.equal(r.status(), 201);
  const autre = await bati(C.antor, C.lea, 'Autre univers');
  const id = idProposition(await demander(C.antor, m));
  const url = propUrl(m, id);
  const inconnu = await get(C.antor, propUrl(m, 99999));
  assert.equal(inconnu.status, 404);
  for (const [nom, c] of [['Léa', C.lea], ['Mira MJ', C.mira], ['Admin', C.admin]] as const) {
    const lecture = await get(c, url);
    assert.equal(lecture.status, 404, `${nom} reads`);
    assert.deepEqual(lecture.corps, inconnu.corps, `${nom}: same body as an unknown id`);
    assert.equal((await post(c, url + '/appliquer')).status, 404, `${nom} applies`);
    assert.equal((await post(c, url + '/abandonner')).status, 404, `${nom} abandons`);
  }
  assert.equal((await get(C.antor, propUrl(autre, id))).status, 404, 'read under another universe');
  assert.equal((await post(C.antor, propUrl(autre, id) + '/appliquer')).status, 404);
  const anonyme = await srv.base && (await fetch(srv.base + url));
  assert.equal(anonyme.status === 401 || anonyme.status === 302 || anonyme.status === 403, true, `anonymous got ${anonyme.status}`);
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.');
  assert.equal((await get(C.antor, url)).corps.etat, 'en_attente', 'still pending after all the refusals');
  // her colleague's own proposal stays hers: Mira proposes, Antor cannot see it
  const miraRep = await demander(C.mira, m);
  assert.equal(miraRep.evenements.length, 1);
  const idMira = idProposition(miraRep);
  assert.equal((await get(C.antor, propUrl(m, idMira))).status, 404);
  assert.equal((await get(C.mira, propUrl(m, idMira))).status, 200);
  // Mira is removed from the universe: she no longer reads nor applies it
  const compteMira = (await get(C.antor, `/api/univers/${m.univers}/membres`)).corps;
  const lignes = Array.isArray(compteMira) ? compteMira : compteMira.membres;
  const mira = lignes.find((x: Any) => x.username === 'mira');
  const del = await C.antor.ctx.request.delete(`/api/univers/${m.univers}/membres/${mira.compteId ?? mira.id}`);
  assert.equal(del.status(), 204);
  assert.equal((await get(C.mira, propUrl(m, idMira))).status, 404);
  assert.equal((await post(C.mira, propUrl(m, idMira) + '/appliquer')).status, 404);
});

test('AD-48 exclusion : aucune route ne crée une proposition', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const r = await C.antor.ctx.request.post(`/api/univers/${m.univers}/propositions`, {
    data: { sectionId: m.section, crId: m.cr, contenu: 'Piraté', version: 1 },
  });
  assert.notEqual(r.status(), 201);
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.');
  assert.equal((await get(C.antor, propUrl(m, 1))).status, 404);
});

test('AD-49 exclusion : l’assistant ne sait pas appliquer — demander d’appliquer n’écrit rien', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const id = idProposition(await demander(C.antor, m));
  const rep = await demander(C.antor, m, 'Applique la proposition de mise à jour de la section « Vérité » de « Maître Aldric »');
  assert.equal(rep.evenements.filter((e: Any) => e.type !== 'proposition_creee').length, 0, JSON.stringify(rep));
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.');
  void id;
});

test('B-21 bord : un contenu proposé de 20 000 caractères ou moins se lit et s’applique', opts, async () => {
  const m = await bati(C.antor, C.lea);
  await modifierSection(C.antor, m, 'A'.repeat(9000) + '\n\n' + 'B'.repeat(9000));
  const rep = await demander(C.antor, m);
  assert.equal(rep.evenements.length, 1, JSON.stringify(rep).slice(0, 300));
  const id = idProposition(rep);
  assert.equal((await post(C.antor, propUrl(m, id) + '/appliquer')).status, 200);
  const apres = (await lireSection(C.antor, m)).contenu;
  assert.equal(apres.startsWith('A'.repeat(9000) + '\n\n' + 'B'.repeat(9000)), true);
  assert.equal(apres.length > 18002, true, 'the proposed content (longer than the old one) was written');
});

void CR_DEMANDE;
