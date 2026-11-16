// Doors of `src/e2e/monde-besoin-api.test.ts` (lot « écrans »): the update proposals of kanevas-monde (B-21, B-27, P-5, AD-48/49/79),
// through the app in-process. That file opened no browser; its tests run here, on the same literals.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, type Hote, monter } from './monde-lot-ecrans.js';

const VERITE = 'Il sert la Couronne.';
const CR_DEMANDE = 'Mets à jour la section « Vérité » de « Maître Aldric » d\'après le compte-rendu « Séance 3 »';

const monde = await monter();
const { antor, lea, mira, admin, dire, univers, creer } = monde;

interface M {
  base: string;
  fiche: number;
  section: number;
  cr: number;
}
/** A fresh universe per test, so tests do not see each other's proposals. */
async function bati(nom = "Lame d'Ébène"): Promise<M> {
  const u = await univers(nom, ['lea']);
  const f = await creer(antor, u.base, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  const s = await dire(antor, 'POST', `${u.base}/fiches/${f.id}/sections`, { titre: 'Vérité', contenu: VERITE });
  const c = await creer(antor, u.base, { type: 'aventure', sousType: 'Campagne', titre: 'La Couronne brisée', sections: [{ titre: 'Présentation', joueursLisent: true }] });
  const cr = await dire(lea, 'POST', `${u.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 3', texte: 'Aldric a livré la clef de la crypte à la Couronne.' });
  assert.equal(cr.status, 201, JSON.stringify(cr.corps));
  return { base: u.base, fiche: f.id, section: s.corps.id, cr: cr.corps.id };
}
const sectionUrl = (m: M) => `${m.base}/fiches/${m.fiche}/sections/${m.section}`;
const lireSection = async (m: M) => (await dire(antor, 'GET', sectionUrl(m))).corps as { contenu: string; version: number };
const demander = async (h: Hote, m: M, message = CR_DEMANDE) => {
  const r = await dire(h, 'POST', `${m.base}/assistant/messages`, { message });
  return { status: r.status, ...r.corps } as Any;
};
const propUrl = (m: M, pid: number | string) => `${m.base}/propositions/${pid}`;
const idProposition = (rep: Any): number => rep.evenements[0].cible.propositionId;
const get = (h: Hote, url: string) => dire(h, 'GET', url);
const post = (h: Hote, url: string) => dire(h, 'POST', url);
async function modifierSection(m: M, contenu: string) {
  const cur = await lireSection(m);
  const r = await dire(antor, 'PUT', `${sectionUrl(m)}/contenu`, { contenu, version: cur.version });
  assert.ok(r.status < 300, JSON.stringify(r.corps));
}

test('B-21 : le MJ demande une mise à jour, la proposition naît en attente et la section ne bouge pas', async () => {
  const m = await bati();
  const avant = await lireSection(m);
  assert.equal(avant.contenu, VERITE);
  const rep = await demander(antor, m);
  assert.equal(rep.status, 200);
  assert.equal(rep.evenements.length, 1);
  assert.equal(rep.evenements[0].type, 'proposition_creee');
  assert.match(rep.evenements[0].libelle, /Maître Aldric/);
  assert.match(rep.evenements[0].libelle, /Vérité/);
  assert.equal((await lireSection(m)).contenu, VERITE);
  assert.equal((await lireSection(m)).version, avant.version);
  const p = await get(antor, propUrl(m, idProposition(rep)));
  assert.equal(p.status, 200);
  assert.equal(p.corps.etat, 'en_attente');
  assert.equal(JSON.stringify(p.corps).includes(VERITE), true, 'the proposal shows the current content');
  assert.equal((await lireSection(m)).contenu, VERITE, 'reading does not write');
});

test('B-21 : appliquer écrit le contenu proposé dans la section, la proposition devient appliquée', async () => {
  const m = await bati();
  const avant = await lireSection(m);
  const id = idProposition(await demander(antor, m));
  const lue = (await get(antor, propUrl(m, id))).corps;
  const r = await post(antor, propUrl(m, id) + '/appliquer');
  assert.equal(r.status, 200);
  const apres = await lireSection(m);
  assert.notEqual(apres.contenu, VERITE);
  assert.equal(apres.version, avant.version + 1);
  assert.equal(JSON.stringify(lue).includes(JSON.stringify(apres.contenu).slice(1, -1)), true, 'the section holds what was proposed');
  assert.equal((await get(antor, propUrl(m, id))).corps.etat, 'appliquee');
});

test('B-21 : abandonner ne touche pas la section, et la proposition n’existe plus', async () => {
  const m = await bati();
  const id = idProposition(await demander(antor, m));
  const r = await post(antor, propUrl(m, id) + '/abandonner');
  assert.equal(r.status, 204);
  assert.equal((await lireSection(m)).contenu, VERITE);
  assert.equal((await get(antor, propUrl(m, id))).status, 404);
  assert.equal((await post(antor, propUrl(m, id) + '/appliquer')).status, 404);
  assert.equal((await lireSection(m)).contenu, VERITE);
});

test('P-5 échec : la section a changé depuis la proposition, appliquer est refusé avec sa raison et rien n’est écrit', async () => {
  const m = await bati();
  const id = idProposition(await demander(antor, m));
  await modifierSection(m, 'Il trahit la Couronne.');
  assert.equal((await get(antor, propUrl(m, id))).corps.etat, 'perimee');
  const r = await post(antor, propUrl(m, id) + '/appliquer');
  assert.equal(r.status, 409);
  assert.equal(r.corps.code, 'section_modifiee');
  assert.equal((await lireSection(m)).contenu, 'Il trahit la Couronne.');
  assert.equal((await get(antor, propUrl(m, id))).corps.etat, 'perimee');
  assert.equal((await post(antor, propUrl(m, id) + '/abandonner')).status, 204, 'the stale proposal can still be abandoned');
});

test('P-5 bord : une proposition appliquée reste appliquée quand la section change ensuite, et ne se réapplique pas', async () => {
  const m = await bati();
  const id = idProposition(await demander(antor, m));
  assert.equal((await post(antor, propUrl(m, id) + '/appliquer')).status, 200);
  await modifierSection(m, 'Encore autre chose.');
  assert.equal((await get(antor, propUrl(m, id))).corps.etat, 'appliquee');
  const again = await post(antor, propUrl(m, id) + '/appliquer');
  assert.equal(again.status, 409);
  assert.equal(again.corps.code, 'proposition_appliquee');
  assert.equal((await post(antor, propUrl(m, id) + '/abandonner')).status, 409);
  assert.equal((await lireSection(m)).contenu, 'Encore autre chose.');
});

test('bord : une seconde demande sur la même section remplace la première (une seule en attente)', async () => {
  const m = await bati();
  const premiere = idProposition(await demander(antor, m));
  const seconde = idProposition(await demander(antor, m));
  assert.notEqual(premiere, seconde);
  assert.equal((await get(antor, propUrl(m, seconde))).corps.etat, 'en_attente');
  const vieille = await post(antor, propUrl(m, premiere) + '/appliquer');
  assert.notEqual(vieille.status, 200, 'the replaced proposal cannot be applied');
});

test('bord : une section vide se propose et « Actuel » est vide', async () => {
  const m = await bati();
  await modifierSection(m, '');
  const rep = await demander(antor, m);
  assert.equal(rep.evenements.length, 1, JSON.stringify(rep));
  const p = (await get(antor, propUrl(m, idProposition(rep)))).corps;
  assert.equal(p.etat, 'en_attente');
  assert.equal((await lireSection(m)).contenu, '');
});

test('échec : un compte-rendu inconnu ne crée aucune proposition', async () => {
  const m = await bati();
  const rep = await demander(antor, m, "Mets à jour la section « Vérité » de « Maître Aldric » d'après le compte-rendu « Séance 99 »");
  assert.equal(rep.evenements.length, 0, JSON.stringify(rep));
  assert.equal((await lireSection(m)).contenu, VERITE);
});

test('B-27 exclusion : Léa, Joueuse, fait la même demande et n’obtient aucune proposition', async () => {
  const m = await bati();
  // Léa can read and write the section, so only the missing tool can stop her
  const ouvert = await dire(antor, 'PATCH', sectionUrl(m), { joueursLisent: true, joueursEcrivent: true });
  assert.equal(ouvert.status, 200);
  const rep = await demander(lea, m);
  assert.deepEqual(rep.evenements, []);
  assert.equal((await lireSection(m)).contenu, VERITE);
  for (const pid of [1, 2, 3]) assert.equal((await get(lea, propUrl(m, pid))).status, 404);
  assert.equal((await get(lea, `${m.base}/assistant`)).corps.catalogue, 'joueur');
  assert.equal((await get(antor, `${m.base}/assistant`)).corps.catalogue, 'mj');
});

test('AD-79 exclusions : seul le MJ demandeur lit, applique, abandonne (autre MJ, joueur, admin sans rôle, autre univers, inconnu, sans session)', async () => {
  const m = await bati();
  const r = await dire(antor, 'POST', `${m.base}/membres`, { username: 'mira', role: 'mj' });
  assert.equal(r.status, 201);
  const autre = await bati('Autre univers');
  const id = idProposition(await demander(antor, m));
  const url = propUrl(m, id);
  const inconnu = await get(antor, propUrl(m, 99999));
  assert.equal(inconnu.status, 404);
  for (const [nom, c] of [['Léa', lea], ['Mira MJ', mira], ['Admin', admin]] as const) {
    const lecture = await get(c, url);
    assert.equal(lecture.status, 404, `${nom} reads`);
    assert.deepEqual(lecture.corps, inconnu.corps, `${nom}: same body as an unknown id`);
    assert.equal((await post(c, url + '/appliquer')).status, 404, `${nom} applies`);
    assert.equal((await post(c, url + '/abandonner')).status, 404, `${nom} abandons`);
  }
  assert.equal((await get(antor, propUrl(autre, id))).status, 404, 'read under another universe');
  assert.equal((await post(antor, propUrl(autre, id) + '/appliquer')).status, 404);
  const anonyme = await dire(undefined, 'GET', url);
  assert.equal([401, 302, 403].includes(anonyme.status), true, `anonymous got ${anonyme.status}`);
  assert.equal((await lireSection(m)).contenu, VERITE);
  assert.equal((await get(antor, url)).corps.etat, 'en_attente', 'still pending after all the refusals');
  // her colleague's own proposal stays hers: Mira proposes, Antor cannot see it
  const miraRep = await demander(mira, m);
  assert.equal(miraRep.evenements.length, 1);
  const idMira = idProposition(miraRep);
  assert.equal((await get(antor, propUrl(m, idMira))).status, 404);
  assert.equal((await get(mira, propUrl(m, idMira))).status, 200);
  // Mira is removed from the universe: she no longer reads nor applies it
  const membres = (await get(antor, `${m.base}/membres`)).corps;
  const lignes = Array.isArray(membres) ? membres : membres.membres;
  const ligne = lignes.find((x: Any) => x.username === 'mira');
  assert.equal((await dire(antor, 'DELETE', `${m.base}/membres/${ligne.compteId ?? ligne.id}`)).status, 204);
  assert.equal((await get(mira, propUrl(m, idMira))).status, 404);
  assert.equal((await post(mira, propUrl(m, idMira) + '/appliquer')).status, 404);
});

test('AD-48 exclusion : aucune route ne crée une proposition', async () => {
  const m = await bati();
  const r = await dire(antor, 'POST', `${m.base}/propositions`, { sectionId: m.section, crId: m.cr, contenu: 'Piraté', version: 1 });
  assert.notEqual(r.status, 201);
  assert.equal((await lireSection(m)).contenu, VERITE);
  assert.equal((await get(antor, propUrl(m, 1))).status, 404);
});

test('AD-49 exclusion : l’assistant ne sait pas appliquer — demander d’appliquer n’écrit rien', async () => {
  const m = await bati();
  await demander(antor, m);
  const rep = await demander(antor, m, 'Applique la proposition de mise à jour de la section « Vérité » de « Maître Aldric »');
  assert.equal(rep.evenements.filter((e: Any) => e.type !== 'proposition_creee').length, 0, JSON.stringify(rep));
  assert.equal((await lireSection(m)).contenu, VERITE);
});

test('B-21 bord : un contenu proposé de 20 000 caractères ou moins se lit et s’applique', async () => {
  const m = await bati();
  await modifierSection(m, 'A'.repeat(9000) + '\n\n' + 'B'.repeat(9000));
  const rep = await demander(antor, m);
  assert.equal(rep.evenements.length, 1, JSON.stringify(rep).slice(0, 300));
  const id = idProposition(rep);
  assert.equal((await post(antor, propUrl(m, id) + '/appliquer')).status, 200);
  const apres = (await lireSection(m)).contenu;
  assert.equal(apres.startsWith('A'.repeat(9000) + '\n\n' + 'B'.repeat(9000)), true);
  assert.equal(apres.length > 18002, true, 'the proposed content (longer than the old one) was written');
});
