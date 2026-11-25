// Black-box tests of kanevas-battlemap-assistant written from the need (docs/parcours.md B-98, B-100, B-103, P-26 step 4,
// P-27 step 3; docs/ecrans.md « E-12, E-26, E-27, E-28 — detail of kanevas-battlemap-assistant »; the fiche's exit criterion),
// not from the code. Expected values are literals taken from those docs. Real app in stub mode (the assistant's AD-78 script),
// real routes, database and rights; effects are read at their door (the routes the screens call), never in the browser.
//
// TEST PLAN (one block per need: nominal / bords / échec / exclusions)
//  B-103 carte  : Antor « Compose une cantine de 20×14 avec une cuisine et une réserve » -> one event, hidden map of the library's
//                 assets only, « cuisine » named missing and « réserve » not; Antor retouches by hand (version moves);
//                 without a room word nothing is named missing; unknown asset refused naming it, no event, map unchanged;
//                 Léa asking for a map: nothing written; Léa cannot read the composed map (404)
//  P-26 (4) lot : « dix décors de station abandonnée » -> one event « Lot préparé : 10 assets », a batch `prepare`, nothing started,
//                 no asset created; second request refused with the doc's sentence; 21 lines refused; Léa: nothing prepared
//  B-98 dir.    : assistant writes -> event, source `assistant`, previous text kept; cancel gives the previous text back; a hand save
//                 removes the cancel; a stale cancel changes nothing; stale write refused with the doc's sentence; Léa: no write, 404
//  B-100 outils : GM eight tools, player `bm_lister_assets` only; tool disabled -> none; skills readable, unknown name lists the three
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
const { poserActivation } = await import('../../services/outils.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');

type Hote = { cookie: string };
const HUIT = ['bm_appliquer_commandes', 'bm_competence', 'bm_creer_carte', 'bm_ecrire_direction', 'bm_lancer_lot', 'bm_lire_carte', 'bm_lire_direction', 'bm_lister_assets'];
const CANTINE = 'Compose une cantine de 20×14 avec une cuisine et une réserve';
const DIX = 'Je voudrais dix décors de station abandonnée';
const DIRECTION = 'Propose une direction artistique pour cet univers.';
const DIRECTION_AVANT = 'Peinture à plat, couleurs franches, vue de dessus, contours nets.';

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-ens-')));
  const one = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const E = one('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one('SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const mj = one("SELECT id FROM comptes WHERE username = 'antor'").id as number;
  const joueur = one("SELECT id FROM comptes WHERE username = 'lea'").id as number;
  const login = async (compte: string): Promise<Hote> => {
    const r = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
    return { cookie: `kanevas_session=${r.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
  };
  const antor = await login('antor');
  const lea = await login('lea');
  const racine = `/api/univers/${E}/outils/battlemap`;
  const appel = (h: Hote, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => app.inject({ method, url: `${racine}/${url}`, headers: h, payload });
  const dit = async (h: Hote, message: string) => {
    const r = await app.inject({ method: 'POST', url: `/api/univers/${E}/assistant/messages`, headers: h, payload: { message } });
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as { reponse: string; evenements: { type: string; libelle: string; cible: any }[] };
  };
  const compte = (table: string) => one(`SELECT count(*) n FROM ${table}`).n as number;
  const outil = (c: number, nom: string, args: unknown): Promise<any> => catalogueDe(app.db, c, E).outils.find((o) => o.nom === nom)!.executer(args) as any;
  const noms = (c: number) => catalogueDe(app.db, c, E).outils.map((o) => o.nom).filter((n) => n.startsWith('bm_')).sort();
  return { app, one, E, S, mj, joueur, antor, lea, appel, dit, compte, outil, noms };
}

test('B-103 · Antor demande la cantine : une carte cachée, faite des seuls assets de la bibliothèque, « cuisine » nommée, « réserve » non', async () => {
  const w = await monde();
  const avant = w.compte('bm_cartes');
  const r = await w.dit(w.antor, CANTINE);
  assert.equal(r.evenements.length, 1);
  assert.equal(r.evenements[0]!.type, 'carte_composee');
  assert.equal(r.evenements[0]!.libelle, 'Carte « Cantine » composée');
  assert.match(r.reponse, /20×14/);
  assert.match(r.reponse, /cachée aux joueurs/);
  assert.match(r.reponse, /Il manque un asset de cuisine/);
  assert.doesNotMatch(r.reponse, /réserve/);
  assert.equal(w.compte('bm_cartes'), avant + 1);
  const id = r.evenements[0]!.cible.carteId as number;
  const carte = (await w.appel(w.antor, 'GET', `cartes/${id}`)).json();
  assert.equal(carte.titre, 'Cantine');
  assert.equal(carte.largeur, 20);
  assert.equal(carte.hauteur, 14);
  const biblio = new Set(((await w.appel(w.antor, 'GET', 'assets')).json().assets as { id: number }[]).map((a) => String(a.id)));
  const utilises = [...JSON.stringify(carte.document).matchAll(/"asset_id":"(\d+)"/g)].map((m) => m[1]!);
  assert.ok(utilises.length > 20, 'la carte porte sol, murs et un objet');
  for (const a of utilises) assert.ok(biblio.has(a), `asset ${a} hors bibliothèque`);
  const caisses = (await w.appel(w.antor, 'GET', 'assets')).json().assets.find((a: any) => a.nom === 'Caisses');
  assert.ok(utilises.includes(String(caisses.id)), 'la réserve reçoit les caisses de la bibliothèque');
});

test('B-103 · la carte composée est cachée aux joueurs : Léa la lit en 404 ; Antor la retouche à la main', async () => {
  const w = await monde();
  const r = await w.dit(w.antor, CANTINE);
  const id = r.evenements[0]!.cible.carteId as number;
  assert.equal(w.one('SELECT visible FROM bm_cartes WHERE id = ?', id).visible, 0);
  assert.equal((await w.appel(w.lea, 'GET', `cartes/${id}`)).statusCode, 404);
  const lue = (await w.appel(w.antor, 'GET', `cartes/${id}`)).json();
  const rocher = (await w.appel(w.antor, 'GET', 'assets')).json().assets.find((a: any) => a.nom === 'Rocher');
  const main = await w.appel(w.antor, 'POST', `cartes/${id}/commandes`, { version: lue.version, commandes: [{ type: 'poser_element', id: 'main-1', calque: 'objets', asset_id: String(rocher.id), x: 3.5, y: 8.5 }] });
  assert.equal(main.statusCode, 200, main.body);
  const apres = (await w.appel(w.antor, 'GET', `cartes/${id}`)).json();
  assert.equal(apres.version, lue.version + 1);
  assert.match(JSON.stringify(apres.document), /"id":"main-1"/);
});

test('B-103 · bord : sans mot de pièce aucun asset n’est dit manquant ; avec réserve seule non plus', async () => {
  const w = await monde();
  const sans = await w.dit(w.antor, 'Compose une salle de 12×10');
  assert.equal(sans.evenements.length, 1);
  assert.doesNotMatch(sans.reponse, /Il manque/);
  const reserve = await w.dit(w.antor, 'Compose un entrepôt de 12×10 avec une réserve');
  assert.equal(reserve.evenements.length, 1);
  assert.doesNotMatch(reserve.reponse, /Il manque/);
});

test('B-103 · échec : un asset inconnu est refusé en le nommant, sans événement, la carte inchangée', async () => {
  const w = await monde();
  const creee = await w.outil(w.mj, 'bm_creer_carte', { titre: 'Test', largeur: 10, hauteur: 10 });
  assert.equal(creee.ok, true, JSON.stringify(creee));
  const id = creee.donnees.carte_id;
  const avant = (await w.appel(w.antor, 'GET', `cartes/${id}`)).json();
  const r = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version: avant.version, commandes: [{ type: 'poser_element', id: 'x', calque: 'objets', asset_id: '99999', x: 2.5, y: 2.5 }] });
  assert.equal(r.ok, false);
  assert.match(r.erreur, /L'asset 99999 n'existe pas dans la bibliothèque/);
  assert.equal(r.evenement, undefined);
  const apres = (await w.appel(w.antor, 'GET', `cartes/${id}`)).json();
  assert.equal(apres.version, avant.version);
});

test('B-103 · exclusion : Léa demande une carte, rien n’est écrit, ni carte ni bloc', async () => {
  const w = await monde();
  const avant = w.compte('bm_cartes');
  const r = await w.dit(w.lea, CANTINE);
  assert.deepEqual(r.evenements, []);
  assert.equal(w.compte('bm_cartes'), avant);
});

test('P-26 (4) · « dix décors » : un lot Préparé de 10 lignes attend, rien n’est lancé ni généré', async () => {
  const w = await monde();
  const assets = w.compte('bm_assets');
  const r = await w.dit(w.antor, DIX);
  assert.equal(r.evenements.length, 1);
  assert.equal(r.evenements[0]!.type, 'lot_prepare');
  assert.equal(r.evenements[0]!.libelle, 'Lot préparé : 10 assets');
  assert.match(r.reponse, /Il reste à le lancer depuis la génération\./);
  const lot = (await w.appel(w.antor, 'GET', 'lots')).json().lot;
  assert.equal(lot.etat, 'prepare');
  assert.equal(lot.lignes.length, 10);
  for (const l of lot.lignes) assert.equal(l.etat, 'attente');
  assert.equal(w.compte('bm_assets'), assets);
});

test('P-26 (4) · échec : un lot est déjà préparé, le second est refusé avec la phrase de la doc, rien ne change', async () => {
  const w = await monde();
  await w.dit(w.antor, DIX);
  const r = await w.dit(w.antor, 'Prépare 5 décors de plus');
  assert.deepEqual(r.evenements, []);
  assert.match(r.reponse, /Un lot est déjà préparé ou en cours\. Ouvrez-le dans la génération\./);
  assert.equal(w.compte('bm_lots'), 1);
  assert.equal((await w.appel(w.antor, 'GET', 'lots')).json().lot.lignes.length, 10);
});

test('P-26 (4) · bords : 20 lignes passent, 21 sont refusées sans lot ni événement', async () => {
  const w = await monde();
  const lignes = (n: number) => Array.from({ length: n }, (_, i) => ({ nom: `Décor ${i + 1}`, categorie: 'decor', largeur: 1, hauteur: 1 }));
  const trop = await w.outil(w.mj, 'bm_lancer_lot', { lignes: lignes(21) });
  assert.equal(trop.ok, false);
  assert.equal(trop.evenement, undefined);
  assert.equal(w.compte('bm_lots'), 0);
  const vingt = await w.outil(w.mj, 'bm_lancer_lot', { lignes: lignes(20) });
  assert.equal(vingt.ok, true, JSON.stringify(vingt));
  assert.equal(vingt.evenement.libelle, 'Lot préparé : 20 assets');
  assert.equal((await w.appel(w.antor, 'GET', 'lots')).json().lot.etat, 'prepare');
});

test('P-26 (4) · exclusion : Léa demande un lot, aucun lot n’est préparé', async () => {
  const w = await monde();
  const r = await w.dit(w.lea, DIX);
  assert.deepEqual(r.evenements, []);
  assert.equal(w.compte('bm_lots'), 0);
});

test('P-26 (4) · échec : sans l’outil génération, l’assistant ne prépare pas de lot', async () => {
  const w = await monde();
  poserActivation(w.app.db, w.mj, { niveau: 'systeme', id: w.S }, 'battlemap/generation', false);
  assert.ok(!w.noms(w.mj).includes('bm_lancer_lot'));
  const r = await w.dit(w.antor, DIX);
  assert.deepEqual(r.evenements, []);
  assert.equal(w.compte('bm_lots'), 0);
});

test('B-98 · l’assistant propose une direction : source assistant, texte précédent gardé, « Annuler » rétablit l’ancien texte', async () => {
  const w = await monde();
  const avant = (await w.appel(w.antor, 'GET', 'direction')).json();
  assert.equal(avant.texte, DIRECTION_AVANT);
  assert.equal(avant.source, 'mj');
  assert.equal(avant.peutAnnuler, false);
  const r = await w.dit(w.antor, DIRECTION);
  assert.equal(r.evenements.length, 1);
  assert.equal(r.evenements[0]!.type, 'direction_ecrite');
  assert.equal(r.evenements[0]!.libelle, 'Direction artistique modifiée');
  const apres = (await w.appel(w.antor, 'GET', 'direction')).json();
  assert.equal(apres.source, 'assistant');
  assert.equal(apres.peutAnnuler, true);
  assert.equal(apres.textePrecedent, DIRECTION_AVANT);
  assert.notEqual(apres.texte, DIRECTION_AVANT);
  assert.equal(apres.version, avant.version + 1);
  const ann = await w.appel(w.antor, 'POST', 'direction/annuler', { version: apres.version });
  assert.equal(ann.statusCode, 200, ann.body);
  const fin = (await w.appel(w.antor, 'GET', 'direction')).json();
  assert.equal(fin.texte, DIRECTION_AVANT);
  assert.equal(fin.source, 'mj');
  assert.equal(fin.peutAnnuler, false);
  assert.equal(fin.version, apres.version + 1);
});

test('B-98 · bord : après une sauvegarde à la main, « Annuler » n’est plus offert et une annulation périmée ne change rien', async () => {
  const w = await monde();
  await w.dit(w.antor, DIRECTION);
  const ecrit = (await w.appel(w.antor, 'GET', 'direction')).json();
  const main = await w.appel(w.antor, 'PUT', 'direction', { texte: 'Écrit à la main.', version: ecrit.version });
  assert.equal(main.statusCode, 200, main.body);
  const apres = (await w.appel(w.antor, 'GET', 'direction')).json();
  assert.equal(apres.source, 'mj');
  assert.equal(apres.texte, 'Écrit à la main.');
  const perimee = await w.appel(w.antor, 'POST', 'direction/annuler', { version: ecrit.version });
  assert.ok(perimee.statusCode >= 400, `statut ${perimee.statusCode}`);
  assert.equal((await w.appel(w.antor, 'GET', 'direction')).json().texte, 'Écrit à la main.');
});

test('B-98 · échec : l’écriture de l’assistant sur un texte relu périmé est refusée avec la phrase de la doc, sans événement', async () => {
  const w = await monde();
  const r = await w.outil(w.mj, 'bm_ecrire_direction', { texte: 'Autre', version: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.erreur, "Le texte a changé depuis que vous l'avez lu. Relisez-le.");
  assert.equal(r.evenement, undefined);
  assert.equal((await w.appel(w.antor, 'GET', 'direction')).json().texte, DIRECTION_AVANT);
});

test('B-98 · bord : 5 000 caractères passent, 5 001 sont refusés', async () => {
  const w = await monde();
  const v = (await w.appel(w.antor, 'GET', 'direction')).json().version;
  const trop = await w.outil(w.mj, 'bm_ecrire_direction', { texte: 'a'.repeat(5001), version: v });
  assert.equal(trop.ok, false);
  assert.equal(trop.erreur, 'Le texte est limité à 5 000 caractères.');
  const juste = await w.outil(w.mj, 'bm_ecrire_direction', { texte: 'a'.repeat(5000), version: v });
  assert.equal(juste.ok, true, JSON.stringify(juste));
});

test('B-98 · exclusion : Léa n’écrit rien, ne lit pas la direction et ne peut pas annuler', async () => {
  const w = await monde();
  const r = await w.dit(w.lea, DIRECTION);
  assert.deepEqual(r.evenements, []);
  assert.equal((await w.appel(w.antor, 'GET', 'direction')).json().texte, DIRECTION_AVANT);
  assert.equal((await w.appel(w.lea, 'GET', 'direction')).statusCode, 404);
  assert.equal((await w.appel(w.lea, 'POST', 'direction/annuler', { version: 1 })).statusCode, 404);
});

test('B-100 · le MJ a les huit outils, la joueuse bm_lister_assets seul ; l’outil désactivé les retire tous', async () => {
  const w = await monde();
  assert.deepEqual(w.noms(w.mj), HUIT);
  assert.deepEqual(w.noms(w.joueur), ['bm_lister_assets']);
  for (const o of ['generation', 'cartes', 'assets']) poserActivation(w.app.db, w.mj, { niveau: 'systeme', id: w.S }, `battlemap/${o}`, false);
  assert.deepEqual(w.noms(w.mj), []);
  assert.deepEqual(w.noms(w.joueur), []);
});

test('B-100 · désactiver cartes retire les trois outils de carte, le reste demeure', async () => {
  const w = await monde();
  poserActivation(w.app.db, w.mj, { niveau: 'systeme', id: w.S }, 'battlemap/cartes', false);
  assert.deepEqual(w.noms(w.mj), ['bm_competence', 'bm_ecrire_direction', 'bm_lancer_lot', 'bm_lire_direction', 'bm_lister_assets']);
});

test('B-100 · la joueuse ne lit jamais un asset réservé au MJ par bm_lister_assets ; le MJ si', async () => {
  const w = await monde();
  const joueuse = await w.outil(w.joueur, 'bm_lister_assets', {});
  const noms = (joueuse.donnees.assets as { nom: string }[]).map((a) => a.nom);
  assert.ok(noms.includes('Tonneau'));
  assert.ok(!noms.includes('Coffre piégé'));
  const mj = await w.outil(w.mj, 'bm_lister_assets', {});
  assert.ok((mj.donnees.assets as { nom: string }[]).some((a) => a.nom === 'Coffre piégé'));
});

test('B-100 · les compétences se chargent à la demande : trois noms, un nom inconnu liste les trois, la joueuse n’a pas bm_competence', async () => {
  const w = await monde();
  for (const nom of ['direction-artistique', 'lot-d-assets', 'composition-de-carte']) {
    const r = await w.outil(w.mj, 'bm_competence', { nom });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(JSON.stringify(r.donnees).length > 200);
  }
  const inconnue = await w.outil(w.mj, 'bm_competence', { nom: 'inconnue' });
  const dit = JSON.stringify(inconnue);
  for (const nom of ['direction-artistique', 'lot-d-assets', 'composition-de-carte']) assert.ok(dit.includes(nom), nom);
  assert.ok(!w.noms(w.joueur).includes('bm_competence'));
});
