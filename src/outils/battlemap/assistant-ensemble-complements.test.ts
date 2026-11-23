// Black-box complements to assistant-ensemble-besoin.test.ts for kanevas-battlemap-assistant, written from the need
// (docs/parcours.md B-100, B-103, P-27 step 3; docs/ecrans.md « E-12, E-26, E-27, E-28 — detail of kanevas-battlemap-assistant »,
// « Refusals in the answer »; ARCHITECTURE.md AD-161 contract: tool names, `{ok:false, erreur}` without event). Expected values are
// literals taken from those docs. Real app in stub mode, real database and rights; the effect is read at its door.
//
// TEST PLAN
//  B-100 outils  : no tool of the module has a parameter naming an account, a universe or a role (AD-161: « sans paramètre de compte ni d'univers »)
//  B-100 outils  : the tool hidden from the player role removes `bm_lister_assets` from the player, the GM keeps his eight
//  B-103 refus   : a wall leaving the map -> « Le mur sort de la carte (10 × 10). », no event, map unchanged
//  B-103 bords   : 200 commands in one batch pass, 201 -> « Envoyez les commandes par paquets de 200 au plus. », nothing written
//  B-103 refus   : an unknown command type is refused whole with a sentence, never a raw code, no event
//  B-103 lecture : `bm_lire_carte` names the placed asset by its name
//  P-27 (3)      : the map composed for the GM is created hidden and the tool has no parameter to show it
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserVisibilite } = await import('../../services/outils.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');

const HUIT = ['bm_appliquer_commandes', 'bm_competence', 'bm_creer_carte', 'bm_ecrire_direction', 'bm_lancer_lot', 'bm_lire_carte', 'bm_lire_direction', 'bm_lister_assets'];

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-comp-')));
  const one = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const E = one('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const mj = one("SELECT id FROM comptes WHERE username = 'antor'").id as number;
  const joueur = one("SELECT id FROM comptes WHERE username = 'lea'").id as number;
  const r = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  const antor = { cookie: `kanevas_session=${r.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
  const racine = `/api/univers/${E}/outils/battlemap`;
  const lire = async (url: string) => (await app.inject({ method: 'GET', url: `${racine}/${url}`, headers: antor })).json();
  const outils = (c: number) => catalogueDe(app.db, c, E).outils.filter((o) => o.nom.startsWith('bm_'));
  const outil = (c: number, nom: string, args: unknown): Promise<any> => outils(c).find((o) => o.nom === nom)!.executer(args) as any;
  const noms = (c: number) => outils(c).map((o) => o.nom).sort();
  return { app, one, E, mj, joueur, lire, outil, outils, noms };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function carte(w: Monde, n: number) {
  const c = await w.outil(w.mj, 'bm_creer_carte', { titre: 'Essai', largeur: n, hauteur: n });
  assert.equal(c.ok, true, JSON.stringify(c));
  const id = c.donnees.carte_id as number;
  const assets = (await w.lire('assets')).assets as { id: number; nom: string; categorie: string }[];
  return { id, assets, version: (await w.lire(`cartes/${id}`)).version as number };
}

test('B-100 · aucun outil du module n’a de paramètre de compte, d’univers ou de rôle', async () => {
  const w = await monde();
  assert.deepEqual(w.noms(w.mj), HUIT);
  for (const o of w.outils(w.mj)) {
    const champs = Object.keys(o.schema.shape).map((c) => c.toLowerCase());
    for (const c of champs) assert.ok(!/compte|univers|role|rôle|acteur/.test(c), `${o.nom} a le paramètre ${c}`);
  }
});

test('B-100 · l’outil masqué au rôle joueur retire bm_lister_assets à la joueuse, le MJ garde ses huit outils', async () => {
  const w = await monde();
  assert.deepEqual(w.noms(w.joueur), ['bm_lister_assets']);
  poserVisibilite(w.app.db, w.mj, { niveau: 'univers', id: w.E }, 'battlemap/assets', { joueur: false });
  assert.deepEqual(w.noms(w.joueur), []);
  assert.deepEqual(w.noms(w.mj), HUIT);
});

test('B-103 · échec : un mur qui sort de la carte est refusé avec la taille de la carte, sans événement, la carte inchangée', async () => {
  const w = await monde();
  const { id, assets, version } = await carte(w, 10);
  const mur = assets.find((a) => a.categorie === 'mur')!;
  assert.ok(mur, 'la bibliothèque graine porte un mur');
  const r = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version, commandes: [{ type: 'tracer_mur', calque: 'murs', segments: [{ x: 50, y: 50, cote: 'h' }], asset_id: String(mur.id) }] });
  assert.equal(r.ok, false);
  assert.equal(r.erreur, 'Le mur sort de la carte (10 × 10).');
  assert.equal(r.evenement, undefined);
  assert.equal((await w.lire(`cartes/${id}`)).version, version);
});

test('B-103 · bords : 200 commandes passent en un paquet, 201 sont refusées en entier avec la phrase de la doc', async () => {
  const w = await monde();
  const { id, assets, version } = await carte(w, 30);
  const objet = assets.find((a) => a.nom === 'Rocher')!;
  const cmds = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ type: 'poser_element', id: `${p}${i}`, calque: 'objets', asset_id: String(objet.id), x: (i % 30) + 0.5, y: Math.floor(i / 30) + 0.5 }));
  const trop = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version, commandes: cmds(201, 'a') });
  assert.equal(trop.ok, false);
  assert.equal(trop.erreur, 'Envoyez les commandes par paquets de 200 au plus.');
  assert.equal(trop.evenement, undefined);
  assert.equal((await w.lire(`cartes/${id}`)).version, version);
  const juste = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version, commandes: cmds(200, 'b') });
  assert.equal(juste.ok, true, JSON.stringify(juste));
  assert.equal((await w.lire(`cartes/${id}`)).version, version + 1);
});

test('B-103 · échec : une commande hors de la liste est refusée entière avec une phrase, jamais un code brut, sans événement', async () => {
  const w = await monde();
  const { id, version } = await carte(w, 10);
  const r = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version, commandes: [{ type: 'inventer_un_monstre', calque: 'objets' }] });
  assert.equal(r.ok, false);
  assert.equal(r.evenement, undefined);
  assert.ok(typeof r.erreur === 'string' && r.erreur.length > 10);
  assert.doesNotMatch(r.erreur, /^[a-z_]+$/);
  assert.equal((await w.lire(`cartes/${id}`)).version, version);
});

test('B-103 · bm_lire_carte nomme l’asset posé par son nom ; la carte créée par l’outil est cachée aux joueurs', async () => {
  const w = await monde();
  const { id, assets, version } = await carte(w, 10);
  assert.equal(w.one('SELECT visible FROM bm_cartes WHERE id = ?', id).visible, 0);
  const rocher = assets.find((a) => a.nom === 'Rocher')!;
  const ok = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version, commandes: [{ type: 'poser_element', id: 'r1', calque: 'objets', asset_id: String(rocher.id), x: 2.5, y: 2.5 }] });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const lue = await w.outil(w.mj, 'bm_lire_carte', { carte_id: id });
  assert.equal(lue.ok, true, JSON.stringify(lue));
  assert.match(JSON.stringify(lue.donnees), /Rocher/);
  assert.deepEqual(Object.keys((w.outils(w.mj).find((o) => o.nom === 'bm_creer_carte')!).schema.shape).sort(), ['hauteur', 'largeur', 'titre']);
});
