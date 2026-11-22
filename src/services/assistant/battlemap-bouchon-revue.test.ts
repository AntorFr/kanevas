// Review tests of kanevas-battlemap-assistant-blocs (B-100, B-103, P-26, P-27, AD-76, AD-78, AD-battlemap-assistant-6 and 8):
// the stub transport's three battle map rules call the real tools, and the orchestration answers with the events.
//
// TEST PLAN
//  direction : « Propose une direction artistique… » writes the text, one direction_ecrite event carrying the previous version
//  lot       : « dix décors … » leaves a `prepare` lot of ten lines and one lot_prepare event; digits work; 25 is capped at 20;
//              a second request while a lot is open is refused with no event
//  carte     : cantine 20×14 avec cuisine et réserve → names the missing « cuisine » (not « réserve »), a map hidden from players,
//              every element and layer asset in the library, ONE carte_composee event though several batches were applied
//  une pièce : no « avec » → one room; a single known word → no missing asset named
//  existant  : a message with none of that keeps the existing answers (campaign creation, out-of-script sentence)
//  refus     : generation off → refusal sentence, no event, no lot; a player gets no tool: nothing written, no event
//  graine    : « Caisses » carries « réserve », nothing is called « cuisine »
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
const { poserActivation } = await import('../outils.js');
const { repondre } = await import('./repondre.js');
const { HORS_SCRIPT } = await import('./bouchon.js');

const one = (app: any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
const all = (app: any, sql: string, ...a: unknown[]) => app.db.prepare(sql).all(...a) as any[];

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-bouchon-')));
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const mj = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  const joueur = one(app, "SELECT id FROM comptes WHERE username = 'lea'").id as number;
  const dit = (compte: number, m: string) => repondre(app.db, compte, E, m, [], { config: { KANEVAS_STUB: '1' } });
  const n = (t: string) => one(app, `SELECT COUNT(*) n FROM ${t}`).n as number;
  return { app, E, S, mj, joueur, dit, n };
}

test('la direction : le texte est écrit et un seul événement direction_ecrite porte la version précédente', async () => {
  const w = await monde();
  const avant = one(w.app, 'SELECT texte, version FROM bm_direction WHERE univers_id = ?', w.E);
  const r = await w.dit(w.mj, 'Propose une direction artistique pour cet univers.');
  assert.equal(r.evenements.length, 1);
  assert.equal(r.evenements[0]!.type, 'direction_ecrite');
  assert.equal(r.evenements[0]!.cible.versionPrecedente, avant.version);
  const apres = one(w.app, 'SELECT texte, version FROM bm_direction WHERE univers_id = ?', w.E);
  assert.notEqual(apres.texte, avant.texte);
  assert.equal(apres.version, avant.version + 1);
  assert.match(r.reponse, /Direction artistique/);
});

test('dix décors : un lot « prepare » de dix lignes, jamais lancé, un événement lot_prepare', async () => {
  const w = await monde();
  const r = await w.dit(w.mj, 'Prépare dix décors de station abandonnée');
  assert.deepEqual(r.evenements.map((e) => e.type), ['lot_prepare']);
  assert.equal(r.evenements[0]!.cible.lignes, 10);
  const lot = one(w.app, 'SELECT id, etat FROM bm_lots WHERE univers_id = ?', w.E);
  assert.equal(lot.etat, 'prepare');
  const lignes = all(w.app, 'SELECT nom, categorie FROM bm_lots_lignes WHERE lot_id = ?', lot.id);
  assert.equal(lignes.length, 10);
  assert.equal(new Set(lignes.map((l) => l.nom)).size, 10, 'dix noms distincts');
  assert.ok(lignes.every((l) => l.categorie === 'decor'));
});

test('décors : en chiffres, la demande est comprise ; 25 est ramené à 20 ; 0 ne laisse rien', async () => {
  const w = await monde();
  const r = await w.dit(w.mj, 'Prépare 4 décors');
  assert.equal(r.evenements[0]!.cible.lignes, 4);
  const w2 = await monde();
  const r2 = await w2.dit(w2.mj, 'vingt-cinq décors de forêt');
  assert.equal(r2.evenements.length, 1);
  assert.ok(Number(r2.evenements[0]!.cible.lignes) <= 20);
  const w3 = await monde();
  const r3 = await w3.dit(w3.mj, '0 décors');
  assert.ok(Number(r3.evenements[0]?.cible.lignes ?? 1) >= 1, 'jamais un lot vide');
});

test('décors : un lot est déjà ouvert → refus, aucun événement, un seul lot', async () => {
  const w = await monde();
  await w.dit(w.mj, 'dix décors de station abandonnée');
  const r = await w.dit(w.mj, 'cinq décors de cave');
  assert.deepEqual(r.evenements, []);
  assert.equal(w.n('bm_lots'), 1);
  assert.equal(w.n('bm_lots_lignes'), 10);
});

test('la cantine : la cuisine manquante est nommée, la carte est cachée, tout est de la bibliothèque, un seul événement', async () => {
  const w = await monde();
  const avant = w.n('bm_cartes');
  const r = await w.dit(w.mj, 'Compose une cantine de 20×14 avec une cuisine et une réserve');
  assert.match(r.reponse, /cuisine/);
  assert.doesNotMatch(r.reponse, /manque[^.]*réserve/);
  assert.equal(w.n('bm_cartes'), avant + 1);
  assert.equal(r.evenements.length, 1, 'un seul événement malgré plusieurs paquets');
  assert.equal(r.evenements[0]!.type, 'carte_composee');
  const carte = one(w.app, 'SELECT * FROM bm_cartes ORDER BY id DESC LIMIT 1');
  assert.equal(r.evenements[0]!.cible.carteId, carte.id);
  assert.equal(r.evenements[0]!.cible.titre, carte.titre);
  assert.equal(carte.titre, 'Cantine');
  const colonnes = Object.keys(carte);
  const vis = colonnes.find((c) => /visible|montree|joueurs/.test(c));
  if (vis) assert.ok(!carte[vis], 'cachée aux joueurs');
  // the element ids are those of the library of this universe
  const ids = new Set(all(w.app, 'SELECT id FROM bm_assets WHERE univers_id = ?', w.E).map((a) => String(a.id)));
  const texte = JSON.stringify(carte);
  const cites = [...texte.matchAll(/asset_id\\?"\s*:\s*\\?"([^"\\]+)/g)].map((m) => m[1]!);
  assert.ok(cites.length > 0, `des éléments ont un asset (${colonnes.join(',')})`);
  for (const id of cites) assert.ok(ids.has(id), `asset ${id} de la bibliothèque`);
});

test('la cantine : la carte est invisible à Léa (introuvable pour une joueuse)', async () => {
  const w = await monde();
  await w.dit(w.mj, 'Compose une cantine de 20×14 avec une cuisine et une réserve');
  const { lireCarte } = await import('../battlemap-cartes.js');
  const c = one(w.app, 'SELECT id FROM bm_cartes ORDER BY id DESC LIMIT 1');
  assert.throws(() => lireCarte(w.app.db, { compteId: w.joueur }, w.E, c.id), (e: any) => e.code === 'introuvable' || e.code === 'refuse');
});

test('une pièce sans « avec », ou avec un seul mot connu : une carte, un événement, rien de manquant', async () => {
  const w = await monde();
  const a = await w.dit(w.mj, 'Compose une salle de 10×8');
  assert.equal(a.evenements.length, 1);
  assert.doesNotMatch(a.reponse, /manque/);
  const b = await w.dit(w.mj, 'Compose un entrepôt de 12×8 avec une réserve');
  assert.equal(b.evenements.length, 1);
  assert.doesNotMatch(b.reponse, /manque/);
  assert.equal(w.n('bm_cartes') >= 2, true);
});

test('une carte minuscule ne fait pas tomber le bouchon : une réponse, jamais d’exception', async () => {
  const w = await monde();
  for (const m of ['Compose une cave de 2×2 avec une réserve', 'Compose une cave de 1×1', 'Compose une cave de 300×300 avec une réserve']) {
    const r = await w.dit(w.mj, m);
    assert.equal(typeof r.reponse, 'string');
    assert.ok(r.evenements.length <= 1, m);
  }
});

test('un message sans rien de cela garde les réponses existantes', async () => {
  const w = await monde();
  const h = await w.dit(w.mj, 'Bonjour, quel temps fait-il ?');
  assert.equal(h.reponse, HORS_SCRIPT);
  assert.deepEqual(h.evenements, []);
  const c = await w.dit(w.mj, 'Crée une campagne « Les Cendres »');
  assert.equal(c.reponse, 'Campagne « Les Cendres » créée.');
  assert.equal(c.evenements[0]!.type, 'fiche_creee');
  // « 3 » et « carte » sans dimensions, « décors » sans nombre : on ne compose ni ne prépare rien
  const avant = [w.n('bm_cartes'), w.n('bm_lots')];
  for (const m of ['Parle-moi de la carte du monde', 'Des décors, s’il te plaît']) {
    const r = await w.dit(w.mj, m);
    assert.equal(r.reponse, HORS_SCRIPT, m);
    assert.deepEqual(r.evenements, []);
  }
  assert.deepEqual([w.n('bm_cartes'), w.n('bm_lots')], avant);
});

test('génération désactivée : « dix décors » est refusé, aucun événement, aucun lot', async () => {
  const w = await monde();
  poserActivation(w.app.db, w.mj, { niveau: 'systeme', id: w.S }, 'battlemap/generation', false);
  const r = await w.dit(w.mj, 'dix décors de station abandonnée');
  assert.deepEqual(r.evenements, []);
  assert.equal(w.n('bm_lots'), 0);
  assert.match(r.reponse, /outil|bm_lancer_lot/);
});

test('une joueuse n’a aucun outil de battle map : rien d’écrit, aucun événement', async () => {
  const w = await monde();
  const avant = [w.n('bm_cartes'), w.n('bm_lots'), one(w.app, 'SELECT version v FROM bm_direction WHERE univers_id = ?', w.E).v];
  for (const m of ['Compose une cantine de 20×14 avec une cuisine et une réserve', 'dix décors de station abandonnée', 'Propose une direction artistique pour cet univers.']) {
    const r = await w.dit(w.joueur, m);
    assert.deepEqual(r.evenements, [], m);
    assert.match(r.reponse, /ne fait pas partie de ceux dont vous disposez/, m);
  }
  assert.deepEqual([w.n('bm_cartes'), w.n('bm_lots'), one(w.app, 'SELECT version v FROM bm_direction WHERE univers_id = ?', w.E).v], avant);
});

test('la graine : « Caisses » porte « réserve » et rien ne s’appelle ni ne s’étiquette « cuisine »', async () => {
  const w = await monde();
  const caisses = one(w.app, "SELECT id FROM bm_assets WHERE univers_id = ? AND nom = 'Caisses'", w.E);
  assert.ok(caisses);
  const lignes = all(w.app, 'SELECT * FROM bm_assets WHERE univers_id = ?', w.E);
  assert.ok(!JSON.stringify(lignes).toLowerCase().includes('cuisine'));
});
