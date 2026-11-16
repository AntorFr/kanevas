// Doors of the « administration-* » screen files (lot « écrans »): the instance API of E-5 (`/api/instance/univers`), who may call it,
// what it refuses and what it never carries (B-6, B-29), in-process. The screens keep the pages, the messages and the counts shown.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

const SECRET = 'Description secrète de la Lame';

/** « Lame d'Ébène »: antor MJ, lea player; mira and teo have signed in once (the world connects them). */
async function monde() {
  const m = await monter();
  const u = await m.dire(m.antor, 'POST', '/api/univers', { nom: "Lame d'Ébène", description: SECRET });
  assert.equal(u.status, 201);
  const lame = u.corps.id as number;
  assert.equal((await m.dire(m.antor, 'POST', `/api/univers/${lame}/membres`, { username: 'lea', role: 'joueur' })).status, 201);
  return { ...m, lame };
}
const texte = (r: { corps: Any }) => (typeof r.corps === 'string' ? r.corps : JSON.stringify(r.corps));

test('api_instance_ferme_aux_non_admins : une joueuse reçoit 404 partout et rien du nom de l’univers', async () => {
  const w = await monde();
  for (const chemin of ['/api/instance/univers', `/api/instance/univers/${w.lame}/membres`]) {
    const rep = await w.dire(w.lea, 'GET', chemin);
    assert.equal(rep.status, 404, chemin);
    assert.equal(texte(rep).includes("Lame d'Ébène"), false);
  }
  assert.equal((await w.dire(w.lea, 'POST', `/api/instance/univers/${w.lame}/membres`, { username: 'teo', role: 'joueur' })).status, 404);
});

test('mj_non_admin_n_a_ni_page_ni_api_d_administration : le MJ de l’univers reçoit 404 et ne change aucun membre', async () => {
  const w = await monde();
  assert.equal((await w.dire(w.antor, 'GET', '/api/instance/univers')).status, 404);
  assert.equal((await w.dire(w.antor, 'POST', `/api/instance/univers/${w.lame}/membres`, { username: 'mira', role: 'mj' })).status, 404);
  const membres = (await w.dire(w.antor, 'GET', `/api/univers/${w.lame}/membres`)).corps;
  const lignes = (Array.isArray(membres) ? membres : membres.membres) as Any[];
  assert.equal(lignes.some((x) => x.username === 'mira'), false);
});

test('administration_sans_session_ne_sert_rien : l’API d’instance sans session ne répond pas 200 et ne nomme rien', async () => {
  const w = await monde();
  const r = await w.dire(undefined, 'GET', '/api/instance/univers');
  assert.notEqual(r.status, 200);
  assert.equal(texte(r).includes("Lame d'Ébène"), false);
});

test('admin_sans_role_ne_lit_aucun_contenu_ni_description_par_l_api : nom et effectif, jamais la description', async () => {
  const w = await monde();
  const liste = await w.dire(w.admin, 'GET', '/api/instance/univers');
  assert.equal(liste.status, 200);
  assert.ok(texte(liste).includes("Lame d'Ébène"), 'admin sees the universe name');
  assert.equal(texte(liste).includes(SECRET), false, 'no description in the instance list');
  const membres = await w.dire(w.admin, 'GET', `/api/instance/univers/${w.lame}/membres`);
  assert.equal(membres.status, 200);
  assert.equal(texte(membres).includes(SECRET), false, 'no description in the member list');
  for (const chemin of [`/api/univers/${w.lame}`, `/api/univers/${w.lame}/membres`]) {
    const rep = await w.dire(w.admin, 'GET', chemin);
    assert.equal(rep.status, 404, `${chemin} is unknown to a no-role account`);
    assert.equal(texte(rep).includes(SECRET), false, chemin);
  }
  assert.equal(texte(await w.dire(w.admin, 'GET', '/api/univers')).includes("Lame d'Ébène"), false, 'not in the admin own universes');
  const ajout = await w.dire(w.admin, 'POST', `/api/univers/${w.lame}/membres`, { username: 'mira', role: 'mj' });
  assert.equal(ajout.status, 404, 'the member routes of an universe he is not in are closed');
  assert.equal(((await w.dire(w.admin, 'GET', `/api/instance/univers/${w.lame}/membres`)).corps as Any[]).length, 2, 'nothing was added');
});

test('api_instance_refuse_les_entrees_fausses_et_ne_change_rien', async () => {
  const w = await monde();
  const url = `/api/instance/univers/${w.lame}/membres`;
  const avant = (await w.dire(w.admin, 'GET', url)).corps as Array<{ username?: string; role: string }>;
  assert.equal(avant.length, 2);
  const client = (s: number) => s >= 400 && s < 500;
  assert.ok(client((await w.dire(w.admin, 'POST', url, { username: 'mira', role: 'dieu' })).status), 'role dieu');
  assert.ok(client((await w.dire(w.admin, 'POST', url, {})).status), 'empty body');
  assert.ok(client((await w.dire(w.admin, 'POST', url, { username: 'nadia', role: 'joueur' })).status), 'unknown account');
  assert.ok(client((await w.dire(w.admin, 'PATCH', `${url}/999999`, { role: 'mj' })).status), 'patch non-member');
  assert.ok(client((await w.dire(w.admin, 'DELETE', `${url}/999999`)).status), 'delete non-member');
  assert.equal((await w.dire(w.admin, 'GET', '/api/instance/univers/999999/membres')).status, 404);
  const apres = (await w.dire(w.admin, 'GET', url)).corps;
  assert.equal(JSON.stringify(apres), JSON.stringify(avant), 'list unchanged');
});

test('admin_simple_joueur_n_a_pas_les_droits_de_mj_sur_l_univers : membre joueur, la route de l’univers lui refuse l’ajout', async () => {
  const w = await monde();
  assert.equal((await w.dire(w.antor, 'POST', `/api/univers/${w.lame}/membres`, { username: 'admin', role: 'joueur' })).status, 201);
  const rep = await w.dire(w.admin, 'POST', `/api/univers/${w.lame}/membres`, { username: 'mira', role: 'mj' });
  assert.ok(rep.status >= 400 && rep.status < 500, `joueur cannot add via the universe route, got ${rep.status}`);
  assert.equal(((await w.dire(w.admin, 'GET', `/api/instance/univers/${w.lame}/membres`)).corps as Any[]).length, 3, 'E-5 stays his repair door');
});

test('admin_repare_univers_sans_mj_joignable : il ajoute mira MJ puis retire antor, antor perd l’univers et mira y entre', async () => {
  const w = await monde();
  const url = `/api/instance/univers/${w.lame}/membres`;
  assert.equal((await w.dire(w.admin, 'POST', url, { username: 'mira', role: 'mj' })).status, 201);
  const lignes = (await w.dire(w.admin, 'GET', url)).corps as Any[];
  assert.equal(lignes.find((x) => x.username === 'mira').role, 'mj');
  const antor = lignes.find((x) => x.username === 'antor');
  assert.equal((await w.dire(w.admin, 'DELETE', `${url}/${antor.compteId ?? antor.id}`)).status, 204);
  assert.equal(((await w.dire(w.admin, 'GET', url)).corps as Any[]).length, 2);
  assert.equal((await w.dire(w.mira, 'GET', `/api/univers/${w.lame}`)).status, 200);
  assert.equal((await w.dire(w.antor, 'GET', `/api/univers/${w.lame}`)).status, 404);
});

test('admin_ne_retire_pas_le_seul_mj : 409 ou refus, le membre reste', async () => {
  const w = await monde();
  const landes = await w.dire(w.mira, 'POST', '/api/univers', { nom: 'Les Landes grises' });
  const url = `/api/instance/univers/${landes.corps.id}/membres`;
  const lignes = (await w.dire(w.admin, 'GET', url)).corps as Any[];
  assert.equal(lignes.length, 1);
  const r = await w.dire(w.admin, 'DELETE', `${url}/${lignes[0].compteId ?? lignes[0].id}`);
  assert.ok(r.status >= 400 && r.status < 500, `last MJ guard, got ${r.status}`);
  assert.equal(((await w.dire(w.admin, 'GET', url)).corps as Any[]).length, 1);
});

test('admin_change_un_role : le rôle posé par l’administration se relit, lea devient MJ de l’univers', async () => {
  const w = await monde();
  const url = `/api/instance/univers/${w.lame}/membres`;
  const lea = ((await w.dire(w.admin, 'GET', url)).corps as Any[]).find((x) => x.username === 'lea');
  const r = await w.dire(w.admin, 'PATCH', `${url}/${lea.compteId ?? lea.id}`, { role: 'mj' });
  assert.ok(r.status < 300, String(r.status));
  assert.equal(((await w.dire(w.admin, 'GET', url)).corps as Any[]).find((x) => x.username === 'lea').role, 'mj');
  assert.equal((await w.dire(w.lea, 'GET', `/api/univers/${w.lame}/membres`)).status, 200, 'lea is a GM now: she reads the members');
});
