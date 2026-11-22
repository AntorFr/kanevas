// Ensemble tests of kanevas-battlemap-distance, written from the need alone (fiche « Livre » + exit criterion, B-108, P-29,
// E-29 player, E-20 « Jeu à distance », AD-156, AD-159, AD-160, AD-163): the effects through their door (the routes the screens
// call), real routes, database and core, stub login, on the seeded table « Cantine de la station »
// (Mira: Léa's, Vox: Roxane's, Garde: nobody's, under the fog). The screens are proved in src/e2e/.
//
// TEST PLAN (every expected value is written by hand from the need)
//   nominal   : Léa moves Mira to (5,4): 200; Antor and Roxane read Mira at (5,4)
//   bords     : a batch of 10 own moves passes, 11 refused, an empty batch refused; the last cell of the 30 × 20 map passes,
//               one beyond is refused and nothing moves
//   échec     : Léa moves Garde (nobody's) or Vox (Roxane's, not a login account): 403 pion_non_proprietaire, token stays; a stale version is 409 and
//               writes nothing; a hidden map answers 404 to a drop
//   exclusions: a player cannot add / reveal; one message for another's, hidden-by-fog and unknown token; no owner leaks
//   réglage   : « Jeu à distance » off (E-20 route): Léa refused jeu_a_distance_coupe, reads deplacement false, still sees
//               Antor's moves; Antor still moves; on again: Léa moves again
//   couloir   : Antor reveals a corridor, Léa and Roxane read it revealed
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
const { ajouterMembre } = await import('../../services/membres.js');

type Any = any;
const one = (app: Any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;

async function monde() {
  const app: Any = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-dist-ens-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x: Any) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const antorId = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  poserActivation(app.db, antorId, { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
  ajouterMembre(app.db, antorId, E, 'teo', 'joueur'); // the second player watching (the stub has no login for Roxane)
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: string, who: string, url: string, payload?: Any) =>
    app.inject({ method, url, headers: { cookie: h[who]! }, payload });
  const id = one(app, "SELECT c.id FROM bm_cartes c WHERE c.univers_id = ? AND c.titre = 'Cantine de la station'", E)?.id as number;
  assert.ok(id, 'la carte « Cantine de la station » est semée');
  const T = `${R}/${id}/table`;
  const lire = async (who: string) => (await req('GET', who, T)).json();
  const version = async () => (await lire('antor')).version as number;
  const cmd = async (who: string, commandes: Any[], v?: number) =>
    req('POST', who, `${T}/commandes`, { version: v ?? await version(), commandes });
  const pos = async (p: string) => {
    const q = (await lire('antor')).etat.pions.find((x: Any) => x.id === p);
    return [q.x, q.y];
  };
  const posVue = async (who: string, p: string) => {
    const q = (await lire(who)).pions.find((x: Any) => x.id === p);
    return q ? [q.x, q.y] : null;
  };
  // E-20 : l'interrupteur « Jeu à distance » écrit les réglages communs du module au niveau de l'univers.
  const regler = async (valeur: boolean) => {
    const v = one(app, "SELECT version_reglages v FROM outils_univers WHERE univers_id = ? AND outil = 'battlemap/cartes'", E)?.v ?? 0;
    return req('PUT', 'antor', `/api/univers/${E}/outils/battlemap/cartes/reglages`, { version: v, valeurs: { jeu_a_distance: valeur } });
  };
  const deplacer = (p: string, x: number, y: number) => ({ type: 'deplacer_pion', id: p, x, y });
  return { app, E, R, id, T, req, lire, version, cmd, pos, posVue, regler, deplacer };
}

test('B-108 nominal : Léa glisse Mira en (5,4) ; Antor et Roxane lisent Mira en (5,4)', async () => {
  const w = await monde();
  assert.deepEqual(await w.pos('mira'), [3, 3]);
  assert.deepEqual(await w.posVue('teo', 'mira'), [3, 3]);
  const r = await w.cmd('lea', [w.deplacer('mira', 5, 4)]);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(await w.pos('mira'), [5, 4]);
  assert.deepEqual(await w.posVue('teo', 'mira'), [5, 4]);
  assert.deepEqual(await w.posVue('lea', 'mira'), [5, 4]);
  await w.app.close();
});

test('B-108 échec : Léa déplace Garde (à personne) ou Vox (à Roxane) : 403 pion_non_proprietaire, rien ne bouge', async () => {
  const w = await monde();
  for (const [p, x, y] of [['garde', 21, 6], ['vox', 4, 7]] as const) {
    const r = await w.cmd('lea', [w.deplacer(p, x, y)]);
    assert.equal(r.statusCode, 403, r.body);
    assert.equal(r.json().code, 'pion_non_proprietaire');
  }
  assert.deepEqual(await w.pos('garde'), [20, 6]);
  assert.deepEqual(await w.pos('vox'), [3, 7]);
  await w.app.close();
});

test('B-108 exclusion : pion d’autrui sous le brouillard, pion inconnu : le même refus, au même corps — aucun indice', async () => {
  const w = await monde();
  const a = await w.cmd('lea', [w.deplacer('garde', 21, 6)]); // existe, sous le brouillard, à personne
  const b = await w.cmd('lea', [w.deplacer('fantome', 21, 6)]); // n'existe pas
  assert.equal(a.statusCode, 403);
  assert.equal(b.statusCode, 403);
  assert.equal(a.body, b.body);
  await w.app.close();
});

test('B-108 exclusion : une joueuse ne peut ni ajouter, ni retirer, ni révéler : refusé, rien d’écrit', async () => {
  const w = await monde();
  const v = await w.version();
  for (const c of [
    { type: 'ajouter_pion', id: 'nouveau', nom: 'Nouveau', x: 1, y: 1 },
    { type: 'retirer_pion', id: 'mira' },
    { type: 'reveler_rect', x: 15, y: 0, l: 3, h: 3 },
    { type: 'regler_pion', id: 'mira', visible: false },
  ]) {
    const r = await w.cmd('lea', [c], v);
    assert.equal(r.statusCode, 403, `${c.type} : ${r.body}`);
  }
  assert.equal(await w.version(), v, 'aucune écriture');
  await w.app.close();
});

test('B-108 bords : lot de 1 déplacement passe ; lot vide refusé', async () => {
  const w = await monde();
  const vide = await w.cmd('lea', []);
  assert.ok(vide.statusCode >= 400 && vide.statusCode < 500, 'lot vide : ' + vide.statusCode);
  assert.equal((await w.cmd('lea', [w.deplacer('mira', 4, 3)])).statusCode, 200);
  await w.app.close();
});

test('B-108 bords : dix déplacements de ses pions passent, onze sont refusés', async () => {
  const w = await monde();
  const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
  const add = await w.cmd('antor', ids.map((id, i) => ({ type: 'ajouter_pion', id, nom: id, x: i, y: 10 })));
  assert.equal(add.statusCode, 200, add.body);
  for (const id of ids) {
    const c = one(w.app, "SELECT id FROM comptes WHERE username = 'lea'").id;
    assert.equal((await w.req('PUT', 'antor', `${w.T}/pions/${id}/proprietaire`, { compte_id: c })).statusCode, 200);
  }
  // révéler la ligne 10 pour qu'elle les voie
  assert.equal((await w.cmd('antor', [{ type: 'reveler_rect', x: 0, y: 10, l: 12, h: 1 }])).statusCode, 200);
  const dix = await w.cmd('lea', ids.slice(0, 10).map((id, i) => w.deplacer(id, i, 11)));
  assert.equal(dix.statusCode, 200, dix.body);
  const onze = await w.cmd('lea', ids.map((id, i) => w.deplacer(id, i, 12)));
  assert.ok(onze.statusCode >= 400 && onze.statusCode < 500, 'onze : ' + onze.statusCode);
  assert.deepEqual(await w.pos('p10'), [10, 10], 'le lot de onze est refusé en entier');
  await w.app.close();
});

test('B-108 bords : la dernière case de la carte 30 × 20 passe ; une case au-delà est refusée, le pion reste', async () => {
  const w = await monde();
  assert.equal((await w.cmd('lea', [w.deplacer('mira', 29, 19)])).statusCode, 200);
  assert.deepEqual(await w.pos('mira'), [29, 19]);
  for (const [x, y] of [[30, 19], [29, 20], [-1, 0]] as const) {
    const r = await w.cmd('lea', [w.deplacer('mira', x, y)]);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `${x},${y} : ${r.statusCode}`);
  }
  assert.deepEqual(await w.pos('mira'), [29, 19]);
  await w.app.close();
});

test('B-108 échec : version périmée : 409 conflit, rien d’écrit', async () => {
  const w = await monde();
  const v = await w.version();
  assert.equal((await w.cmd('antor', [{ type: 'reveler_rect', x: 0, y: 12, l: 1, h: 1 }])).statusCode, 200);
  const r = await w.cmd('lea', [w.deplacer('mira', 6, 3)], v);
  assert.equal(r.statusCode, 409, r.body);
  assert.deepEqual(await w.pos('mira'), [3, 3]);
  await w.app.close();
});

test('E-20 : « Jeu à distance » coupé, Léa est refusée (jeu_a_distance_coupe), lit deplacement faux, voit bouger les pions ; remis, elle rejoue', async () => {
  const w = await monde();
  assert.equal((await w.lire('lea')).deplacement, true, 'activé par défaut');
  assert.equal((await w.regler(false)).statusCode, 204);
  const r = await w.cmd('lea', [w.deplacer('mira', 6, 3)]);
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.json().code, 'jeu_a_distance_coupe');
  assert.deepEqual(await w.pos('mira'), [3, 3]);
  assert.equal((await w.lire('lea')).deplacement, false);
  // elle voit toujours bouger : le MJ déplace Vox
  assert.equal((await w.cmd('antor', [w.deplacer('vox', 4, 7)])).statusCode, 200);
  assert.deepEqual(await w.posVue('lea', 'vox'), [4, 7]);
  assert.equal((await w.regler(true)).statusCode, 204);
  assert.equal((await w.lire('lea')).deplacement, true);
  assert.equal((await w.cmd('lea', [w.deplacer('mira', 6, 3)])).statusCode, 200);
  assert.deepEqual(await w.pos('mira'), [6, 3]);
  await w.app.close();
});

test('P-29 : Antor révèle un couloir ; Léa et Roxane le lisent révélé (la case n’était pas visible avant)', async () => {
  const w = await monde();
  const cases = (b64: string) => { const o = Buffer.from(b64, 'base64'); return (x: number, y: number) => ((o[(y * 30 + x) >> 3]! >> ((y * 30 + x) & 7)) & 1) === 1; };
  for (const who of ['lea', 'teo']) assert.equal(cases((await w.lire(who)).brouillard)(15, 15), false);
  assert.equal((await w.cmd('antor', [{ type: 'reveler_rect', x: 14, y: 15, l: 4, h: 1 }])).statusCode, 200);
  for (const who of ['lea', 'teo']) assert.equal(cases((await w.lire(who)).brouillard)(15, 15), true, who);
  await w.app.close();
});

test('P-29 : une carte cachée par le MJ répond introuvable aux joueurs, lecture et dépôt', async () => {
  const w = await monde();
  const carte = (await w.req('GET', 'antor', `${w.R}/${w.id}`)).json();
  const p = await w.req('PATCH', 'antor', `${w.R}/${w.id}`, { version: carte.version ?? carte.carte?.version, visible: false });
  assert.equal(p.statusCode, 200, p.body);
  const v = await w.version();
  for (const who of ['lea', 'teo']) {
    assert.equal((await w.req('GET', who, w.T)).statusCode, 404, who);
  }
  const r = await w.cmd('lea', [w.deplacer('mira', 6, 3)], v);
  assert.equal(r.statusCode, 404, r.body);
  assert.deepEqual(await w.pos('mira'), [3, 3]);
  await w.app.close();
});
