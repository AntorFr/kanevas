// Ensemble tests of kanevas-battlemap-table, written from the need alone (fiche « Livre » + exit criterion, B-104 token
// linked to a sheet, B-105, B-106, B-107, B-109, P-28, E-29 / E-30, E-10 piece, AD-156, AD-159, AD-160, AD-163): the
// effects through their door (the routes the screens call), real routes, database and core, stub login. The screens are
// proved in src/e2e/battlemap-table-ensemble-besoin.test.ts.
//
// TEST PLAN (every expected value is written by hand from the need, never read back from the code)
//   B-105 nominal    : the table account (Léa, ordinary member) reads « not started » before « Jouer », then the table the
//                      GM created; the shared view she reads is the GM's rectangle, cleared it is null (« En attente du MJ »)
//   B-105 exclusion  : the display read (GET …/table?mode=joueur and the player account) never carries owners, `peutEcrire`
//                      or the state shape of the GM; a player's command and creation are refused (403)
//   B-106 nominal    : three tokens (a sheet, an asset, a disc), two given to players; the GM reads the owners, a player does not;
//                      « Retirer » removes one; hiding one removes it from the player's read, showing it brings it back
//   B-106 bords      : a name of 40 characters is accepted, 41 refused; a token outside the map is refused (422, nothing written);
//                      owner: a non-member is refused (400), « no owner » (null) clears it
//   B-106 bord 200   : 200 tokens accepted, the 201st refused 409 table_pleine, nothing written
//   B-107 nominal    : a room (walls + a door): « Révéler ▸ Pièce » reveals exactly the 12 cells of the room, not behind the door;
//                      « Masquer ▸ Pièce » hides them again
//   B-107 bords      : a rectangle at the map's last cell is accepted, one cell beyond refused; a batch of 500 commands passes
//                      (a brush stroke), 501 is refused whole; a token under the fog or hidden is absent from the player's read
//   B-107 exclusion  : bytes of the player's table read, map read and stream carry none of the secrets (hidden token, token under
//                      the fog, GM-only layer, masked layer, unreadable sheet title and its id)
//   B-109            : see table-ensemble-reprise-besoin.test.ts (needs a database file, so its own process)
//   AD-159 live      : a reveal by the GM is on a player's open stream in under 2 s (the frame carries only versions)
//   B-104 / E-10     : a hidden map: not found for a player and a non-member (table, stream, creation), same body as an unknown id;
//                      deleting a played map removes its table and owners; resizing keeps (enlarges) or crops the fog and refuses
//                      when a token would leave (400 limite_depassee, nothing changed)
import assert from 'node:assert/strict';
import http from 'node:http';
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
const { creerFiche } = await import('../../services/fiches.js');

type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Any = any;
const one = (app: Any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;
const code = (r: Any) => r.json().code ?? r.json().detail;

async function ouvrirMonde(semer: boolean) {
  const app: Any = await buildApp();
  if (semer) {
    assert.equal(semerBouchon(app.db), true);
    await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-table-ens-img-')));
  }
  const h: Record<string, string> = {};
  for (const c of ['antor', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x: Any) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const compte = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  if (semer) poserActivation(app.db, compte('antor'), { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: M, who: string | null, url: string, payload?: Any) =>
    app.inject({ method, url, headers: who ? { cookie: h[who]! } : {}, payload });
  const asset = (nom: string) => String(one(app, 'SELECT id FROM bm_assets WHERE univers_id = ? AND nom = ?', E, nom).id);
  const fiche = (titre: string, joueursLisent: boolean) =>
    String(creerFiche(app.db, compte('antor'), E, { type: 'objet', titre, charge: {}, sections: [{ titre: 'S', joueursLisent }] }).id);
  return { app, E, R, h, req, compte, asset, fiche };
}
type W = Awaited<ReturnType<typeof ouvrirMonde>>;
const monde = () => ouvrirMonde(true);

/** A visible 12 × 8 map with a table (« Jouer » opened), version of the table 1. */
async function jouer(w: W, opts: { visible?: boolean; table?: boolean; largeur?: number; hauteur?: number; titre?: string } = {}) {
  const { id } = (await w.req('POST', 'antor', w.R, { titre: opts.titre ?? 'Soute', largeur: opts.largeur ?? 12, hauteur: opts.hauteur ?? 8 })).json();
  if (opts.visible !== false) assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true })).statusCode, 200);
  const T = `${w.R}/${id}/table`;
  if (opts.table !== false) assert.equal((await w.req('POST', 'antor', T)).statusCode, 201);
  const cmd = async (commandes: Any[], who = 'antor') => {
    const v = (await w.req('GET', 'antor', T)).json().version as number;
    return w.req('POST', who, `${T}/commandes`, { version: v, commandes });
  };
  return { id: id as number, T, F: `${w.R}/${id}/flux`, cmd };
}
const disque = (id: string, x: number, y: number, extra: Any = {}) => ({ type: 'ajouter_pion', id, nom: id.toUpperCase(), x, y, ...extra });
/** The revealed cells of a bitmap (base64, one bit per cell, row-major, least significant bit first), as « x,y » strings. */
function revelees(b64: string, largeur: number, hauteur: number): string[] {
  const o = Buffer.from(b64, 'base64');
  const r: string[] = [];
  for (let i = 0; i < largeur * hauteur; i++) if ((o[i >> 3]! >> (i & 7)) & 1) r.push(`${i % largeur},${Math.floor(i / largeur)}`);
  return r;
}
const cellules = (x0: number, y0: number, l: number, h: number) => {
  const r: string[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + l; x++) r.push(`${x},${y}`);
  return r;
};

test('B-105 : le compte de table lit « partie pas commencée », puis la table du MJ et sa vue partagée — la vue effacée est null', async () => {
  const w = await monde();
  const c = await jouer(w, { table: false });
  assert.deepEqual((await w.req('GET', 'lea', c.T)).json(), { commencee: false }); // E-30 : « La partie n'a pas commencé. »
  assert.equal((await w.req('POST', 'antor', c.T)).statusCode, 201); // première ouverture de « Jouer »
  const vide = (await w.req('GET', 'lea', c.T)).json();
  assert.equal(vide.commencee, true);
  assert.equal(vide.vue, null, 'pas de vue : « En attente du MJ »');
  assert.deepEqual(vide.pions, []);
  assert.deepEqual(revelees(vide.brouillard, 12, 8), [], 'la carte commence masquée');
  const partage = await c.cmd([{ type: 'partager_vue', vue: { x: 2, y: 1, l: 6, h: 4 } }]);
  assert.equal(partage.statusCode, 200, partage.body);
  assert.deepEqual((await w.req('GET', 'lea', c.T)).json().vue, { x: 2, y: 1, l: 6, h: 4 });
  assert.equal((await c.cmd([{ type: 'partager_vue', vue: null }])).statusCode, 200);
  assert.equal((await w.req('GET', 'lea', c.T)).json().vue, null);
});

test('B-105 exclusion : le compte de table et le MJ en mode joueur lisent la vue joueur — ni propriétaires, ni droit d’écrire ; leurs écritures sont refusées', async () => {
  const w = await monde();
  const c = await jouer(w);
  await c.cmd([disque('a', 1, 1), { type: 'reveler_rect', x: 0, y: 0, l: 3, h: 3 }]);
  assert.equal((await w.req('PUT', 'antor', `${c.T}/pions/a/proprietaire`, { compte_id: w.compte('lea') })).statusCode, 200);
  const mj = (await w.req('GET', 'antor', c.T)).json();
  assert.equal(mj.peutEcrire, true);
  assert.deepEqual(mj.proprietaires, { a: w.compte('lea') });
  for (const lecteur of [await w.req('GET', 'lea', c.T), await w.req('GET', 'antor', `${c.T}?mode=joueur`)]) {
    const j = lecteur.json();
    assert.deepEqual(j.pions.map((p: Any) => p.id), ['a']);
    for (const k of ['peutEcrire', 'proprietaires', 'etat']) assert.equal(k in j, false, `${k} dans la vue joueur`);
    assert.equal(lecteur.body.includes(String(w.compte('lea')) + '"'), false, 'aucun identifiant de propriétaire');
  }
  const v = (await w.req('GET', 'antor', c.T)).json().version;
  assert.equal((await w.req('POST', 'lea', `${c.T}/commandes`, { version: v, commandes: [disque('z', 2, 2)] })).statusCode, 403);
  assert.equal((await w.req('POST', 'antor', `${c.T}/commandes?mode=joueur`, { version: v, commandes: [disque('z', 2, 2)] })).statusCode, 403);
  assert.equal((await w.req('POST', 'lea', c.T)).statusCode, 403);
  assert.equal((await w.req('GET', 'antor', c.T)).json().etat.pions.length, 1, 'rien n’a été écrit');
});

test('B-106 : trois pions (fiche, asset, disque), deux à des joueurs ; le MJ lit les propriétaires, la joueuse non ; masquer / montrer / retirer', async () => {
  const w = await monde();
  const c = await jouer(w);
  const mira = w.fiche('Mira', true);
  const lot = [
    disque('mira', 1, 1, { nom: 'Mira', fiche_id: mira }),
    disque('coffre', 2, 1, { nom: 'Coffre', asset_id: w.asset('Coffre') }),
    disque('garde', 3, 1, { nom: 'Garde' }),
    { type: 'reveler_rect', x: 0, y: 0, l: 5, h: 3 },
  ];
  const r = await c.cmd(lot);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await w.req('PUT', 'antor', `${c.T}/pions/mira/proprietaire`, { compte_id: w.compte('lea') })).statusCode, 200);
  assert.equal((await w.req('PUT', 'antor', `${c.T}/pions/garde/proprietaire`, { compte_id: w.compte('roxane') })).statusCode, 200);
  const mj = (await w.req('GET', 'antor', c.T)).json();
  assert.deepEqual(mj.etat.pions.map((p: Any) => [p.id, p.nom, p.x, p.y]), [['mira', 'Mira', 1, 1], ['coffre', 'Coffre', 2, 1], ['garde', 'Garde', 3, 1]]);
  assert.equal(mj.etat.pions[0].fiche_id, mira, 'le pion lié à une fiche');
  assert.equal(mj.etat.pions[1].asset_id, w.asset('Coffre'), 'le pion d’asset');
  assert.equal(mj.etat.pions[2].fiche_id, null);
  assert.equal(mj.etat.pions[2].asset_id, null, 'le disque');
  assert.deepEqual(mj.proprietaires, { mira: w.compte('lea'), garde: w.compte('roxane') });
  const lea = (await w.req('GET', 'lea', c.T)).json();
  assert.deepEqual(lea.pions.map((p: Any) => p.id), ['mira', 'coffre', 'garde']);
  assert.equal(lea.pions[0].fiche_id, mira, 'une fiche qu’elle lit reste liée');
  // masquer : le pion sort de la lecture de la joueuse ; le montrer le ramène
  assert.equal((await c.cmd([{ type: 'regler_pion', id: 'garde', visible: false }])).statusCode, 200);
  assert.deepEqual((await w.req('GET', 'lea', c.T)).json().pions.map((p: Any) => p.id), ['mira', 'coffre']);
  assert.equal((await w.req('GET', 'antor', c.T)).json().etat.pions.length, 3, 'le MJ le voit toujours');
  assert.equal((await c.cmd([{ type: 'regler_pion', id: 'garde', visible: true }])).statusCode, 200);
  assert.equal((await w.req('GET', 'lea', c.T)).json().pions.length, 3);
  // retirer
  assert.equal((await c.cmd([{ type: 'retirer_pion', id: 'coffre' }])).statusCode, 200);
  assert.deepEqual((await w.req('GET', 'antor', c.T)).json().etat.pions.map((p: Any) => p.id), ['mira', 'garde']);
  // délier une fiche
  assert.equal((await c.cmd([{ type: 'regler_pion', id: 'mira', fiche_id: null }])).statusCode, 200);
  assert.equal((await w.req('GET', 'antor', c.T)).json().etat.pions[0].fiche_id, null);
});

test('B-106 bords : un nom de 40 caractères passe, 41 refusé ; un pion hors carte est 422 sans rien écrire ; propriétaire non membre 400, null efface', async () => {
  const w = await monde();
  const c = await jouer(w);
  const ok = await c.cmd([disque('long', 0, 0, { nom: 'x'.repeat(40) })]);
  assert.equal(ok.statusCode, 200, ok.body);
  const trop = await c.cmd([disque('trop', 1, 0, { nom: 'x'.repeat(41) })]);
  assert.ok(trop.statusCode >= 400 && trop.statusCode < 500, trop.body);
  const vide = await c.cmd([disque('vide', 1, 0, { nom: '' })]);
  assert.ok(vide.statusCode >= 400 && vide.statusCode < 500, 'un nom vide est refusé');
  const dernier = await c.cmd([disque('coin', 11, 7)]);
  assert.equal(dernier.statusCode, 200, 'la dernière case de la carte 12 × 8');
  for (const [x, y] of [[12, 7], [11, 8], [-1, 0]] as const) {
    const hors = await c.cmd([disque('hors', x, y)]);
    assert.equal(hors.statusCode, 422, `${x},${y} : ${hors.body}`);
    assert.equal(code(hors), 'limite_depassee');
  }
  assert.deepEqual((await w.req('GET', 'antor', c.T)).json().etat.pions.map((p: Any) => p.id), ['long', 'coin']);
  const etranger = one(w.app, "INSERT INTO comptes (username, cree_le) VALUES ('etranger', 'x') RETURNING id").id;
  assert.equal((await w.req('PUT', 'antor', `${c.T}/pions/coin/proprietaire`, { compte_id: etranger })).statusCode, 400);
  assert.equal((await w.req('PUT', 'antor', `${c.T}/pions/coin/proprietaire`, { compte_id: w.compte('lea') })).statusCode, 200);
  assert.equal((await w.req('PUT', 'antor', `${c.T}/pions/coin/proprietaire`, { compte_id: null })).statusCode, 200);
  assert.deepEqual((await w.req('GET', 'antor', c.T)).json().proprietaires, {});
});

test('B-106 : 200 pions passent, le 201e est refusé 409 table_pleine et rien n’est écrit', async () => {
  const w = await monde();
  const c = await jouer(w, { largeur: 20, hauteur: 12 });
  const lot = Array.from({ length: 200 }, (_, i) => disque(`p${i}`, i % 20, Math.floor(i / 20)));
  const r = await c.cmd(lot);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await w.req('GET', 'antor', c.T)).json().etat.pions.length, 200);
  const de_trop = await c.cmd([disque('p200', 0, 11)]);
  assert.equal(de_trop.statusCode, 409, de_trop.body);
  assert.equal(code(de_trop), 'table_pleine');
  assert.equal((await w.req('GET', 'antor', c.T)).json().etat.pions.length, 200);
});

/** A 12 × 8 map: a room of 4 × 3 cells (x 0–3, y 0–2) closed by walls, a door on its right side at (4, 1). */
async function salle(w: W) {
  const c = await jouer(w);
  const mur = w.asset('Mur de pierre');
  const segments = [
    ...[0, 1, 2, 3].flatMap((x) => [{ x, y: 0, cote: 'h' }, { x, y: 3, cote: 'h' }]),
    ...[0, 1, 2].flatMap((y) => [{ x: 0, y, cote: 'v' }, { x: 4, y, cote: 'v' }]),
  ];
  const doc = await w.req('POST', 'antor', `${w.R}/${c.id}/commandes`, { version: 2, commandes: [
    { type: 'tracer_mur', calque: 'murs', segments, asset_id: mur },
    { type: 'poser_porte', calque: 'murs', x: 4, y: 1, cote: 'v', porte: true },
  ] });
  assert.equal(doc.statusCode, 200, doc.body);
  return c;
}

test('B-107 : « Révéler ▸ Pièce » révèle les 12 cases de la salle (pas derrière la porte), « Masquer ▸ Pièce » les cache de nouveau', async () => {
  const w = await monde();
  const c = await salle(w);
  assert.equal((await c.cmd([{ type: 'reveler_piece', x: 1, y: 1 }])).statusCode, 200);
  const lu = (await w.req('GET', 'lea', c.T)).json();
  assert.deepEqual(revelees(lu.brouillard, 12, 8).sort(), cellules(0, 0, 4, 3).sort());
  assert.equal((await c.cmd([{ type: 'masquer_piece', x: 2, y: 2 }])).statusCode, 200);
  assert.deepEqual(revelees((await w.req('GET', 'lea', c.T)).json().brouillard, 12, 8), []);
});

test('B-107 bords : pinceau (rectangles de 1 case) en lot de 500 accepté, 501 refusé en entier ; rectangle à la dernière case accepté, une case plus loin 422 ; pions sous le brouillard absents', async () => {
  const w = await monde();
  const c = await jouer(w, { largeur: 30, hauteur: 20 });
  const coup = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'reveler_rect', x: i % 30, y: Math.floor(i / 30), l: 1, h: 1 }));
  const trop = await c.cmd(coup(501));
  assert.ok(trop.statusCode >= 400 && trop.statusCode < 500, trop.body);
  assert.deepEqual(revelees((await w.req('GET', 'antor', c.T)).json().etat.brouillard, 30, 20), [], 'refusé en entier');
  const ok = await c.cmd(coup(500));
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(revelees((await w.req('GET', 'antor', c.T)).json().etat.brouillard, 30, 20).length, 500);
  assert.equal((await c.cmd([{ type: 'reveler_rect', x: 29, y: 19, l: 1, h: 1 }])).statusCode, 200);
  const hors = await c.cmd([{ type: 'reveler_rect', x: 29, y: 19, l: 2, h: 1 }]);
  assert.equal(hors.statusCode, 422, hors.body);
  assert.equal(code(hors), 'limite_depassee');
  // un pion sur une case encore sous le brouillard (cases 0–499 : lignes 0 à 16 ; ligne 18 masquée) est absent de la joueuse
  await c.cmd([disque('dedans', 1, 1), disque('dessous', 5, 18)]);
  assert.deepEqual((await w.req('GET', 'lea', c.T)).json().pions.map((p: Any) => p.id), ['dedans']);
  assert.deepEqual((await w.req('GET', 'antor', c.T)).json().etat.pions.map((p: Any) => p.id), ['dedans', 'dessous']);
});

/** What no player account may ever read, whichever door. */
const SECRETS = ['SECRET-PION-CACHE', 'SECRET-PION-BROUILLARD', 'SECRET-CALQUE-MJ', 'SECRET-CALQUE-MASQUE', 'SECRET-FICHE-ILLISIBLE', 'secret-element-brouillard'];

function flux(port: number, cookie: string, chemin: string) {
  let tampon = '';
  const r = http.request({ host: '127.0.0.1', port, path: chemin, headers: { cookie } }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (d: string) => { tampon += d; });
  });
  r.on('error', () => {});
  r.end();
  return {
    octets: () => tampon,
    fermer: () => r.destroy(),
    async attendre(re: RegExp, ms = 2000) {
      const fin = Date.now() + ms;
      while (!re.test(tampon)) {
        if (Date.now() > fin) throw new Error(`pas de ${re} dans ${JSON.stringify(tampon)}`);
        await new Promise((ok) => setTimeout(ok, 10));
      }
    },
  };
}

test('B-107 exclusion : ce qui est masqué n’est jamais dans les octets de la table, de la liste ni du flux reçus par un compte joueur ; une révélation arrive sur le flux en moins de 2 s', async () => {
  const w = await monde();
  await w.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (w.app.server.address() as Any).port as number;
  const flux_ouverts: Any[] = [];
  try {
    const c = await jouer(w);
    const illisible = w.fiche('SECRET-FICHE-ILLISIBLE', false);
    const lot = [
      { type: 'creer_calque', id: 'mj', nom: 'SECRET-CALQUE-MJ', genre: 'objet', mj_seul: true },
      { type: 'creer_calque', id: 'masque', nom: 'SECRET-CALQUE-MASQUE', genre: 'objet' },
      { type: 'poser_element', id: 'secret-element-brouillard', calque: 'objets', asset_id: w.asset('Coffre'), x: 9.5, y: 6.5 },
      { type: 'poser_element', id: 'e-mj', calque: 'mj', asset_id: w.asset('Coffre piégé'), x: 1.5, y: 1.5 },
      { type: 'poser_element', id: 'e-masque', calque: 'masque', asset_id: w.asset('Tonneau'), x: 2.5, y: 1.5 },
      { type: 'poser_element', id: 'e-vu', calque: 'objets', asset_id: w.asset('Tonneau'), x: 3.5, y: 1.5 },
    ];
    const d = await w.req('POST', 'antor', `${w.R}/${c.id}/commandes`, { version: 2, commandes: lot });
    assert.equal(d.statusCode, 200, d.body);
    const t = await c.cmd([
      { type: 'reveler_rect', x: 0, y: 0, l: 5, h: 3 },
      disque('cache', 1, 1, { nom: 'SECRET-PION-CACHE', visible: false }),
      disque('brume', 9, 6, { nom: 'SECRET-PION-BROUILLARD' }),
      disque('lie', 2, 2, { nom: 'Lié', fiche_id: illisible }),
      disque('vu', 3, 2, { nom: 'Vu' }),
      { type: 'regler_calque_joueurs', calque: 'masque', montre: false },
    ]);
    assert.equal(t.statusCode, 200, t.body);
    const tous = (await w.req('GET', 'antor', c.T)).json();
    assert.ok(JSON.stringify(tous).includes('SECRET-PION-CACHE'), 'le MJ, lui, les lit (le test peut échouer)');
    const lea = flux(port, w.h.lea!, c.F);
    const affichage = flux(port, w.h.lea!, `${c.F}?role=affichage`);
    flux_ouverts.push(lea, affichage);
    await lea.attendre(/event: maj/);
    await affichage.attendre(/event: maj/);
    // une écriture de plus, que les flux voient
    const t0 = Date.now();
    assert.equal((await c.cmd([{ type: 'reveler_rect', x: 5, y: 0, l: 2, h: 2 }])).statusCode, 200);
    const v = (await w.req('GET', 'antor', c.T)).json().version as number;
    await lea.attendre(new RegExp(`"table":${v}`));
    await affichage.attendre(new RegExp(`"table":${v}`));
    assert.ok(Date.now() - t0 < 2000, 'moins de deux secondes');
    const octets = [
      (await w.req('GET', 'lea', c.T)).body,
      (await w.req('GET', 'lea', w.R)).body,
      (await w.req('GET', 'antor', `${c.T}?mode=joueur`)).body,
      lea.octets(),
      affichage.octets(),
    ];
    for (const [i, o] of octets.entries()) {
      for (const s of SECRETS) assert.equal(o.includes(s), false, `octets n° ${i} : « ${s} » présent`);
      assert.equal(o.includes(`"fiche_id":"${illisible}"`), false, `octets n° ${i} : la fiche illisible est liée`);
    }
    const joueuse = (await w.req('GET', 'lea', c.T)).json();
    assert.deepEqual(joueuse.pions.map((p: Any) => p.id).sort(), ['lie', 'vu']);
    assert.equal(joueuse.pions.find((p: Any) => p.id === 'lie').fiche_id, null, 'la fiche qu’elle ne lit pas n’est pas liée');
    assert.deepEqual(joueuse.document.elements.map((e: Any) => e.id), ['e-vu']);
    assert.deepEqual(joueuse.document.calques.map((k: Any) => k.id), ['sol', 'murs', 'objets']);
  } finally {
    for (const f of flux_ouverts) f.fermer();
    await w.app.close();
  }
});

test('B-104 / E-29 / E-30 : une carte cachée aux joueurs est introuvable pour la joueuse, le non-membre et sans session (table, flux, création), comme une carte inconnue ; visible, elle se lit', async () => {
  const w = await monde();
  const c = await jouer(w, { visible: false });
  const inconnue = await w.req('GET', 'lea', `${w.R}/99999/table`);
  assert.equal(inconnue.statusCode, 404);
  for (const who of ['lea', 'teo']) {
    const r = await w.req('GET', who, c.T);
    assert.equal(r.statusCode, 404, who);
    if (who === 'lea') assert.equal(r.body, inconnue.body, 'même corps qu’une carte inconnue');
    assert.equal((await w.req('GET', who, `${c.F}?role=affichage`)).statusCode, 404, `flux ${who}`);
    assert.equal((await w.req('POST', who, c.T)).statusCode, 404, `création ${who}`);
  }
  assert.ok((await w.req('GET', null, c.T)).statusCode >= 400);
  assert.equal((await w.req('GET', 'antor', c.T)).statusCode, 200);
  assert.equal((await w.req('PATCH', 'antor', `${w.R}/${c.id}`, { version: 1, visible: true })).statusCode, 200);
  assert.equal((await w.req('GET', 'lea', c.T)).statusCode, 200);
});

test('E-10 : supprimer une carte jouée supprime sa table et ses propriétaires, et la table disparaît pour tous', async () => {
  const w = await monde();
  const c = await jouer(w);
  await c.cmd([disque('a', 1, 1), disque('b', 2, 2)]);
  await w.req('PUT', 'antor', `${c.T}/pions/a/proprietaire`, { compte_id: w.compte('lea') });
  await w.req('PUT', 'antor', `${c.T}/pions/b/proprietaire`, { compte_id: w.compte('roxane') });
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_tables WHERE carte_id = ?', c.id).n, 1);
  const avant = one(w.app, 'SELECT COUNT(*) n FROM bm_pions_proprietaires').n as number;
  assert.equal((await w.req('DELETE', 'lea', `${w.R}/${c.id}`)).statusCode >= 400, true, 'une joueuse ne supprime pas');
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_tables WHERE carte_id = ?', c.id).n, 1);
  assert.equal((await w.req('DELETE', 'antor', `${w.R}/${c.id}`)).statusCode, 204);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_tables WHERE carte_id = ?', c.id).n, 0);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_pions_proprietaires').n, avant - 2);
  assert.equal((await w.req('GET', 'lea', c.T)).statusCode, 404);
  assert.equal((await w.req('GET', 'antor', c.T)).statusCode, 404);
});

test('E-28 / B-107 : agrandir une carte jouée garde le brouillard et masque les cases neuves ; rogner le rogne ; un pion qui sortirait refuse tout (400 limite_depassee) sans rien changer', async () => {
  const w = await monde();
  const c = await jouer(w, { largeur: 12, hauteur: 8 });
  await c.cmd([{ type: 'reveler_rect', x: 10, y: 6, l: 2, h: 2 }, { type: 'reveler_rect', x: 0, y: 0, l: 2, h: 2 }, disque('loin', 11, 7)]);
  const grand = await w.req('PATCH', 'antor', `${w.R}/${c.id}`, { version: 2, largeur: 14, hauteur: 10 });
  assert.equal(grand.statusCode, 200, grand.body);
  const g = (await w.req('GET', 'antor', c.T)).json().etat;
  assert.deepEqual(revelees(g.brouillard, 14, 10).sort(), [...cellules(0, 0, 2, 2), ...cellules(10, 6, 2, 2)].sort(), 'mêmes cases révélées, aucune case neuve');
  assert.deepEqual([g.pions[0].x, g.pions[0].y], [11, 7]);
  const refus = await w.req('PATCH', 'antor', `${w.R}/${c.id}`, { version: 3, largeur: 8 });
  assert.equal(refus.statusCode, 400, refus.body);
  assert.equal(code(refus), 'limite_depassee');
  assert.equal(refus.json().champ, 'taille');
  assert.equal((await w.req('GET', 'antor', `${w.R}/${c.id}`)).json().largeur, 14, 'la carte n’a pas changé');
  assert.deepEqual(revelees((await w.req('GET', 'antor', c.T)).json().etat.brouillard, 14, 10).length, 8);
  await c.cmd([{ type: 'deplacer_pion', id: 'loin', x: 1, y: 1 }]);
  const rogne = await w.req('PATCH', 'antor', `${w.R}/${c.id}`, { version: 3, largeur: 8, hauteur: 4 });
  assert.equal(rogne.statusCode, 200, rogne.body);
  assert.deepEqual(revelees((await w.req('GET', 'antor', c.T)).json().etat.brouillard, 8, 4).sort(), cellules(0, 0, 2, 2).sort(), 'les cases révélées hors de la carte rognée sont perdues');
});

test('B-107 exclusion : le relevé de la carte (GET …/cartes/:cid) par un compte joueur ne porte ni le calque masqué, ni ses éléments, ni un élément sous le brouillard', async () => {
  const w = await monde();
  const c = await jouer(w);
  const d = await w.req('POST', 'antor', `${w.R}/${c.id}/commandes`, { version: 2, commandes: [
    { type: 'creer_calque', id: 'masque', nom: 'SECRET-CALQUE-MASQUE', genre: 'objet' },
    { type: 'poser_element', id: 'secret-element-brouillard', calque: 'objets', asset_id: w.asset('Coffre'), x: 9.5, y: 6.5 },
    { type: 'poser_element', id: 'e-masque', calque: 'masque', asset_id: w.asset('Tonneau'), x: 2.5, y: 1.5 },
    { type: 'poser_element', id: 'e-vu', calque: 'objets', asset_id: w.asset('Tonneau'), x: 3.5, y: 1.5 },
  ] });
  assert.equal(d.statusCode, 200, d.body);
  assert.equal((await c.cmd([{ type: 'reveler_rect', x: 0, y: 0, l: 5, h: 3 }, { type: 'regler_calque_joueurs', calque: 'masque', montre: false }])).statusCode, 200);
  const lu = await w.req('GET', 'lea', `${w.R}/${c.id}`);
  assert.equal(lu.statusCode, 200, lu.body);
  assert.equal(lu.body.includes('SECRET-CALQUE-MASQUE'), false, 'le calque masqué aux joueurs est dans le relevé de la carte');
  assert.equal(lu.body.includes('e-masque'), false, 'un élément du calque masqué est dans le relevé de la carte');
  assert.equal(lu.body.includes('secret-element-brouillard'), false, 'un élément sous le brouillard est dans le relevé de la carte');
});
