// Doors of `assistant-besoins`, `assistant-ecran` and `cadre-univers` (lot « écrans »): what the assistant writes or refuses (E-12, AD-75,
// AD-126), who reaches its routes, and the end of a session, in-process. The screens keep the button, the panel, the blocks and the messages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

/** Antor (GM) and Léa (player) in a fresh universe, Teo outside it; « Maître Aldric » with « Apparence », « Vérité — MJ seul », « Notes de la table ». */
async function monde(nom: string) {
  const m = await monter();
  const u = await m.univers(nom, ['lea']);
  const aldric = (await m.creer(m.antor, u.base, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })).id;
  const base = `${u.base}/fiches/${aldric}`;
  const section = async (titre: string, contenu: string, lue: boolean) => {
    const s = await m.dire(m.antor, 'POST', `${base}/sections`, { titre, contenu });
    assert.equal(s.status, 201);
    if (lue) assert.equal((await m.dire(m.antor, 'PATCH', `${base}/sections/${s.corps.id}`, { joueursLisent: true })).status, 200);
  };
  await section('Apparence', 'Grand, cape grise, regard dur.', true);
  await section('Vérité — MJ seul', 'Il trahit le Cercle.', false);
  await section('Notes de la table', 'Rien encore.', true);
  const dit = (h: typeof m.antor, message: string) => m.dire(h, 'POST', `${u.base}/assistant/messages`, { message, historique: [] });
  return { ...m, U: u.id, ub: u.base, base, dit };
}

test('joueuse_ajoute_a_section_lisible_non_ecrite_est_refusee_sans_ecriture', async () => {
  const m = await monde('Lame d’Ébène écriture');
  const r = await m.dit(m.lea, 'Ajoute le paragraphe « Elle ment. » dans « Notes de la table »');
  assert.equal(r.status, 200);
  assert.deepEqual(r.corps.evenements, []);
  assert.match(r.corps.reponse, /Vous ne pouvez pas modifier cette section\./);
  const s = await m.dire(m.antor, 'GET', m.base);
  assert.doesNotMatch(JSON.stringify(s.corps), /Elle ment/);
});

test('mj_ajoute_un_paragraphe_et_l_evenement_designe_la_fiche', async () => {
  const m = await monde('Lame d’Ébène ajout');
  const r = await m.dit(m.antor, 'Ajoute le paragraphe « Elle ment. » dans « Notes de la table »');
  assert.equal(r.status, 200);
  assert.equal(r.corps.evenements.length, 1);
  assert.match(JSON.stringify(r.corps.evenements[0]), /Notes de la table/);
  const s = await m.dire(m.antor, 'GET', m.base);
  assert.match(JSON.stringify(s.corps), /Rien encore\.[\s\S]*Elle ment\./);
});

test('mj_cree_une_campagne_puis_un_scenario_dessous_joueuse_recoit_outil_absent', async () => {
  const m = await monde('Lame d’Ébène création');
  const c = await m.dit(m.antor, 'Crée une campagne « Les Marches rouges »');
  assert.match(c.corps.reponse, /Campagne « Les Marches rouges » créée\./);
  const s = await m.dit(m.antor, 'Crée un scénario « Acte III — La crypte » dans « Les Marches rouges »');
  assert.match(s.corps.reponse, /Scénario « Acte III — La crypte » créé dans Les Marches rouges\./);
  const liste = JSON.stringify((await m.dire(m.antor, 'GET', `${m.ub}/fiches?type=aventure`)).corps);
  assert.ok(liste.includes('Marches rouges') && liste.includes('Acte III'));
  const l = await m.dit(m.lea, 'Crée une campagne « Les Cendres »');
  assert.deepEqual(l.corps.evenements, []);
  assert.match(l.corps.reponse, /l'outil « creer_fiche » ne fait pas partie de ceux dont vous disposez/);
  const apres = JSON.stringify((await m.dire(m.antor, 'GET', `${m.ub}/fiches?type=aventure`)).corps);
  assert.equal(apres.includes('Les Cendres'), false);
});

test('compte_sans_role_n_a_ni_page_ni_route : Teo reçoit 404 sur les deux routes de l’assistant', async () => {
  const m = await monde('Lame d’Ébène sans rôle');
  assert.equal((await m.dire(m.teo, 'POST', `${m.ub}/assistant/messages`, { message: 'Bonjour', historique: [] })).status, 404);
  assert.equal((await m.dire(m.teo, 'GET', `${m.ub}/assistant`)).status, 404);
});

test('Léa complète « Notes de la table » quand le MJ lui en donne l’écriture', async () => {
  const m = await monde('Lame d’Ébène Léa écrit');
  const notes = (await m.dire(m.antor, 'GET', m.base)).corps.sections.find((s: Any) => s.titre === 'Notes de la table');
  assert.equal((await m.dire(m.antor, 'PATCH', `${m.base}/sections/${notes.id}`, { joueursEcrivent: true })).status, 200);
  const r = await m.dit(m.lea, 'Ajoute le paragraphe « Elle cherche son frère. » dans « Notes de la table »');
  assert.equal(r.corps.evenements.length, 1);
  assert.match(JSON.stringify((await m.dire(m.lea, 'GET', m.base)).corps), /Elle cherche son frère\./);
});

test('« Se déconnecter » ferme la session : /api/moi répond 401 ensuite', async () => {
  const m = await monde('Lame d’Ébène déconnexion');
  assert.equal((await m.dire(m.antor, 'GET', '/api/moi')).status, 200);
  const sortie = await m.app.inject({ method: 'POST', url: '/api/auth/logout', headers: m.antor });
  assert.ok(sortie.statusCode < 400, String(sortie.statusCode));
  const efface = sortie.cookies.find((c) => c.name === 'kanevas_session');
  assert.ok(efface && (efface.value === '' || (efface.expires && efface.expires.getTime() <= Date.now()) || efface.maxAge === 0), 'the session cookie is cleared');
  assert.equal((await m.dire(undefined, 'GET', '/api/moi')).status, 401);
});

// --- assistant-image-ecran: the portrait attached to a section (E-12, AD-88), on the starting world (stub image engine) ---
test('image : un portrait demandé par le MJ ajoute une pièce, « échec » et la joueuse n’en ajoutent aucune', async () => {
  const m = await monter({ semis: true });
  const us = (await m.dire(m.antor, 'GET', '/api/univers')).corps as Any[];
  const U = us.find((u) => u.nom === "Lame d'Ébène").id as number;
  const f = 1; // « Maître Aldric » of the starting world, as in the screen file
  const DEMANDE = 'Fais un portrait pour « Apparence » d’« Maître Aldric »';
  const pieces = async () => {
    const r = (await m.dire(m.antor, 'GET', `/api/univers/${U}/fiches/${f}`)).corps;
    return (r.sections as Any[]).flatMap((s) => s.piecesJointes ?? []);
  };
  const dit = (h: typeof m.antor, message: string) => m.dire(h, 'POST', `/api/univers/${U}/assistant/messages`, { message, historique: [] });
  const avant = (await pieces()).length;
  const echec = await dit(m.antor, DEMANDE + ' échec');
  assert.deepEqual(echec.corps.evenements, []);
  assert.match(echec.corps.reponse, /Je n['’]ai pas pu générer l['’]image\./);
  assert.equal((await pieces()).length, avant);
  const lea = await dit(m.lea, DEMANDE);
  assert.deepEqual(lea.corps.evenements, []);
  assert.equal((await pieces()).length, avant);
  const ok = await dit(m.antor, DEMANDE);
  assert.equal(ok.status, 200, JSON.stringify(ok.corps));
  assert.equal(ok.corps.evenements.length, 1);
  assert.equal((await pieces()).length, avant + 1);
});
