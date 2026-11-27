// Review tests of kanevas-battlemap-distance-service (B-108, AD-125, AD-159, AD-160, AD-163, AD-battlemap-distance-2, 3, 5):
// remote play through the routes, read as the browser would get it (bytes included), and live with three clients.
//
// TEST PLAN
//   deplacer     : a player moves her own token, the version advances, the GM reads the new place
//   refus-memes  : another's, hidden, under the fog and unknown token give the same 403 body (pion_non_proprietaire)
//   reglage      : off → jeu_a_distance_coupe, nothing written; the GM's commands pass; the setting is read at each write
//   mode-joueur  : a GM in player mode gets refuse / mode_joueur
//   lecture      : mesPions = own tokens she sees; deplacement false off / no own token / GM in player mode / no table
//   octets       : refusals and mesPions never carry a masked token's name nor the owners of others
//   direct       : MJ + two players on the stream: a move is seen by both others, off it is refused, the GM's command is pushed anyway
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation, poserReglages } = await import('../../services/outils.js');
const { ajouterMembre } = await import('../../services/membres.js');

type Any = any;
const one = (app: Any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reqs = new Set<http.ClientRequest>();

async function monde() {
  const app: Any = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-dist-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x: Any) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const compte = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  poserActivation(app.db, compte('antor'), { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
  ajouterMembre(app.db, compte('antor'), E, 'teo', 'joueur');
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: string, who: string, url: string, payload?: Any) =>
    app.inject({ method, url, headers: { cookie: h[who]! }, payload });
  const regler = (valeur: boolean) => {
    const v = one(app, "SELECT version_reglages v FROM outils_univers WHERE univers_id = ? AND outil = 'battlemap/cartes'", E)?.v ?? 0;
    poserReglages(app.db, compte('antor'), { niveau: 'univers', id: E }, 'battlemap/cartes', { version: v, valeurs: { jeu_a_distance: valeur } });
  };
  return { app, E, R, h, port, req, compte, regler };
}
type W = Awaited<ReturnType<typeof monde>>;
const fin = async (w: W) => { for (const r of reqs) r.destroy(); reqs.clear(); await w.app.close(); };
const pion = (id: string, x: number, y: number, extra: Any = {}) => ({ type: 'ajouter_pion', id, nom: id.toUpperCase(), x, y, ...extra });

/** A played map: lea owns `a` (visible) , `cache` (hidden) and `brume` (under the fog); teo owns `b`; `libre` is nobody's. */
async function table(w: W) {
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Soute', largeur: 12, hauteur: 8 })).json();
  assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true })).statusCode, 200);
  const T = `${w.R}/${id}/table`;
  assert.equal((await w.req('POST', 'antor', T)).statusCode, 201);
  const r = await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [
    pion('a', 1, 1, { nom: 'Mira' }), pion('b', 2, 1, { nom: 'Bran' }), pion('libre', 3, 1, { nom: 'Libre' }),
    pion('cache', 2, 2, { nom: 'SECRET-CACHE', visible: false }), pion('brume', 10, 6, { nom: 'SECRET-BRUME' }),
    { type: 'reveler_rect', x: 0, y: 0, l: 5, h: 5 }] });
  assert.equal(r.statusCode, 200, r.body);
  for (const [p, c] of [['a', 'lea'], ['cache', 'lea'], ['brume', 'lea'], ['b', 'teo']] as const) {
    assert.equal((await w.req('PUT', 'antor', `${T}/pions/${p}/proprietaire`, { compte_id: w.compte(c) })).statusCode, 200);
  }
  const version = async () => (await w.req('GET', 'antor', T)).json().version as number;
  const pos = async (p: string) => (await w.req('GET', 'antor', T)).json().etat.pions.find((x: Any) => x.id === p);
  const cmd = async (who: string, commandes: Any[], v?: number, query = '') =>
    w.req('POST', who, `${T}/commandes${query}`, { version: v ?? await version(), commandes });
  return { id: id as number, T, version, pos, cmd };
}

test('un joueur déplace son pion : la version avance et le MJ lit la nouvelle case', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    const v = await t.version();
    const r = await t.cmd('lea', [{ type: 'deplacer_pion', id: 'a', x: 3, y: 3 }]);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().version, v + 1);
    const p = await t.pos('a');
    assert.deepEqual([p.x, p.y], [3, 3]);
    assert.equal(await t.version(), v + 1);
  } finally { await fin(w); }
});

test('le pion d’autrui, caché, sous le brouillard et inconnu : même 403 pion_non_proprietaire, même corps, rien d’écrit', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    const v = await t.version();
    const corps = new Set<string>();
    // teo owns `b` only: `a` is another's, `cache` and `brume` belong to lea (hidden / fogged for her too), `nul` is unknown.
    for (const id of ['a', 'libre', 'cache', 'brume', 'nul']) {
      const r = await t.cmd('teo', [{ type: 'deplacer_pion', id, x: 4, y: 4 }]);
      assert.equal(r.statusCode, 403, `${id}: ${r.body}`);
      assert.equal(r.json().code, 'pion_non_proprietaire', id);
      corps.add(r.body);
    }
    // lea against her own hidden / fogged token, and against an unknown one: same refusal, same bytes.
    for (const id of ['cache', 'brume', 'nul', 'b']) {
      const r = await t.cmd('lea', [{ type: 'deplacer_pion', id, x: 4, y: 4 }]);
      assert.equal(r.statusCode, 403, `${id}: ${r.body}`);
      corps.add(r.body);
    }
    assert.equal(corps.size, 1, [...corps].join(' | '));
    assert.equal(await t.version(), v, 'rien n’est écrit');
    // a batch mixing a good and a bad move is refused whole
    const mixte = await t.cmd('lea', [{ type: 'deplacer_pion', id: 'a', x: 4, y: 4 }, { type: 'deplacer_pion', id: 'b', x: 5, y: 5 }]);
    assert.equal(mixte.statusCode, 403);
    assert.deepEqual([(await t.pos('a')).x, await t.version()], [1, v]);
  } finally { await fin(w); }
});

test('un joueur ne peut rien d’autre que déplacer : ajouter, retirer, révéler, régler sont refusés sans écriture', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    const v = await t.version();
    for (const c of [pion('z', 1, 2), { type: 'retirer_pion', id: 'a' }, { type: 'reveler_rect', x: 5, y: 5, l: 2, h: 2 },
      { type: 'regler_pion', id: 'a', nom: 'Autre' }, { type: 'partager_vue', vue: { x: 0, y: 0, l: 4, h: 4 } }, { type: 'reinitialiser' }]) {
      const r = await t.cmd('lea', [c]);
      assert.equal(r.statusCode, 403, `${JSON.stringify(c)}: ${r.statusCode} ${r.body}`);
    }
    assert.equal(await t.version(), v);
    assert.equal((await w.req('POST', 'lea', t.T)).statusCode, 403);
    assert.equal((await w.req('PUT', 'lea', `${t.T}/pions/a/proprietaire`, { compte_id: w.compte('teo') })).statusCode, 403);
    assert.equal(one(w.app, "SELECT compte_id c FROM bm_pions_proprietaires WHERE pion_id = 'a'").c, w.compte('lea'));
  } finally { await fin(w); }
});

test('réglage coupé : le joueur reçoit jeu_a_distance_coupe sans écriture, le MJ passe ; relu à chaque écriture, sans événement', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    const flux = await ouvrir(w, 'lea', `${w.R}/${t.id}/flux`);
    await flux.attendre(/event: maj/);
    const v = await t.version();
    const avant = flux.octets();
    w.regler(false);
    await dormir(150);
    assert.equal(flux.octets(), avant, 'changer le réglage ne pousse aucun événement');
    const r = await t.cmd('lea', [{ type: 'deplacer_pion', id: 'a', x: 3, y: 3 }]);
    assert.equal(r.statusCode, 403, r.body);
    assert.equal(r.json().code, 'jeu_a_distance_coupe');
    // even against an alien token: the setting answers first, whatever the batch
    assert.equal((await t.cmd('lea', [{ type: 'deplacer_pion', id: 'b', x: 3, y: 3 }])).json().code, 'jeu_a_distance_coupe');
    assert.equal(await t.version(), v);
    assert.equal((await t.pos('a')).x, 1);
    const mj = await t.cmd('antor', [{ type: 'deplacer_pion', id: 'b', x: 6, y: 6 }]);
    assert.equal(mj.statusCode, 200, mj.body);
    // the GM's batch with assets/fiches still validated as before
    w.regler(true);
    const rendu = await t.cmd('lea', [{ type: 'deplacer_pion', id: 'a', x: 3, y: 3 }]);
    assert.equal(rendu.statusCode, 200, rendu.body);
    w.regler(false);
    assert.equal((await t.cmd('lea', [{ type: 'deplacer_pion', id: 'a', x: 2, y: 2 }])).statusCode, 403, 'relu, jamais en cache');
    flux.fermer();
  } finally { await fin(w); }
});

test('un MJ en mode joueur reste lecteur : sa commande est refuse / mode_joueur, même sur ses propres pions et réglage coupé', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    assert.equal((await w.req('PUT', 'antor', `${t.T}/pions/libre/proprietaire`, { compte_id: w.compte('antor') })).statusCode, 200);
    const v = await t.version();
    for (const coupe of [false, true]) {
      if (coupe) w.regler(false);
      const r = await t.cmd('antor', [{ type: 'deplacer_pion', id: 'libre', x: 4, y: 4 }], v, '?mode=joueur');
      assert.equal(r.statusCode, 403, r.body);
      assert.equal(r.json().code ?? r.json().detail, 'mode_joueur');
    }
    assert.equal(await t.version(), v);
  } finally { await fin(w); }
});

test('GET table d’un joueur : mesPions = ses pions qu’elle voit ; deplacement vrai ; jamais les propriétaires des autres', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    const lea = await w.req('GET', 'lea', t.T);
    assert.deepEqual(lea.json().mesPions, ['a'], 'cache et brume sont à elle mais elle ne les voit pas');
    assert.equal(lea.json().deplacement, true);
    const rox = await w.req('GET', 'teo', t.T);
    assert.deepEqual(rox.json().mesPions, ['b']);
    assert.equal(rox.json().deplacement, true);
    for (const r of [lea, rox]) {
      assert.equal('proprietaires' in r.json(), false);
      assert.equal(r.body.includes('SECRET-'), false);
    }
    assert.equal(lea.body.includes(`${w.compte('teo')}`) && /compte|proprio/i.test(lea.body), false);
    // revealing the fog shows her fogged token: she now sees it
    await t.cmd('antor', [{ type: 'reveler_rect', x: 8, y: 4, l: 4, h: 4 }]);
    assert.deepEqual((await w.req('GET', 'lea', t.T)).json().mesPions.sort(), ['a', 'brume']);
    await t.cmd('antor', [{ type: 'regler_pion', id: 'cache', visible: true }]);
    assert.deepEqual((await w.req('GET', 'lea', t.T)).json().mesPions.sort(), ['a', 'brume', 'cache']);
    // her owned token's owner removed: she has no more
    assert.equal((await w.req('PUT', 'antor', `${t.T}/pions/b/proprietaire`, { compte_id: null })).statusCode, 200);
    const sans = (await w.req('GET', 'teo', t.T)).json();
    assert.deepEqual([sans.mesPions, sans.deplacement], [[], false], 'sans pion à soi : lecture seule (compte de table)');
  } finally { await fin(w); }
});

test('deplacement est faux : réglage coupé, sans pion à soi, MJ en mode joueur ; le MJ n’a pas ces champs ; table non commencée', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    assert.equal((await w.req('PUT', 'antor', `${t.T}/pions/libre/proprietaire`, { compte_id: w.compte('antor') })).statusCode, 200);
    const mjJ = (await w.req('GET', 'antor', `${t.T}?mode=joueur`)).json();
    assert.equal(mjJ.deplacement, false, 'MJ en mode joueur, même propriétaire d’un pion visible');
    assert.deepEqual(mjJ.mesPions, ['libre'], 'il lit ses pions, sans pouvoir les déplacer');
    const mj = (await w.req('GET', 'antor', t.T)).json();
    assert.equal('deplacement' in mj, false);
    assert.equal('mesPions' in mj, false);
    w.regler(false);
    const coupe = (await w.req('GET', 'lea', t.T)).json();
    assert.equal(coupe.deplacement, false);
    assert.deepEqual(coupe.mesPions, ['a'], 'mesPions ne dépend pas du réglage');
    w.regler(true);
    assert.equal((await w.req('GET', 'lea', t.T)).json().deplacement, true);
    const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Vide', largeur: 6, hauteur: 6 })).json();
    await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true });
    assert.deepEqual((await w.req('GET', 'lea', `${w.R}/${id}/table`)).json(), { commencee: false });
  } finally { await fin(w); }
});

test('octets : refus et mesPions ne portent le nom d’aucun pion masqué ni le propriétaire d’un autre', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    const lus: string[] = [];
    for (const id of ['cache', 'brume', 'b', 'nul']) lus.push((await t.cmd('lea', [{ type: 'deplacer_pion', id, x: 4, y: 4 }])).body);
    lus.push((await t.cmd('lea', [pion('z', 1, 2, { nom: 'SECRET-NOUVEAU' })])).body);
    w.regler(false);
    lus.push((await t.cmd('lea', [{ type: 'deplacer_pion', id: 'cache', x: 4, y: 4 }])).body);
    w.regler(true);
    lus.push((await w.req('GET', 'lea', t.T)).body, (await w.req('GET', 'teo', t.T)).body);
    const refus = lus.slice(0, 6);
    const lectures = lus.slice(6);
    for (const corps of refus) {
      for (const secret of ['SECRET-', 'Bran', 'BRAN', String(w.compte('teo'))]) assert.equal(corps.includes(secret), false, `${secret} dans ${corps}`);
    }
    for (const corps of lectures) {
      for (const secret of ['SECRET-CACHE', 'SECRET-BRUME', 'SECRET-NOUVEAU']) assert.equal(corps.includes(secret), false, `${secret} dans une lecture`);
      assert.equal(/"proprietaires"|"owner/.test(corps), false, corps);
    }
    assert.deepEqual(JSON.parse(lectures[0]!).mesPions, ['a']);
  } finally { await fin(w); }
});

// ---- live, three clients -------------------------------------------------------------------------------------------------
interface Ouvert { octets(): string; attendre(re: RegExp, ms?: number): Promise<string>; fermer(): void }
function ouvrir(w: W, who: string, chemin: string): Promise<Ouvert> {
  return new Promise((resolve, reject) => {
    let tampon = '';
    const r = http.request({ host: '127.0.0.1', port: w.port, path: chemin, headers: { cookie: w.h[who]! } }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (d: string) => { tampon += d; });
      res.on('error', () => {});
      resolve({
        octets: () => tampon,
        async attendre(re, ms = 2000) {
          const limite = Date.now() + ms;
          while (!re.test(tampon)) {
            if (Date.now() > limite) throw new Error(`pas de ${re} dans ${JSON.stringify(tampon)}`);
            await dormir(10);
          }
          return tampon;
        },
        fermer: () => { r.destroy(); },
      });
    });
    r.on('error', (e) => { if (!(e as Any).code?.startsWith('ECONN')) reject(e); });
    reqs.add(r);
    r.end();
  });
}

test('direct à trois clients : le déplacement d’un joueur est vu du MJ et de l’autre joueur en < 2 s ; coupé, refusé et la commande du MJ est poussée', async () => {
  const w = await monde();
  try {
    const t = await table(w);
    const F = `${w.R}/${t.id}/flux`;
    const [mj, lea, rox] = [await ouvrir(w, 'antor', F), await ouvrir(w, 'lea', F), await ouvrir(w, 'teo', F)];
    for (const c of [mj, lea, rox]) await c.attendre(/event: maj/);
    const v = await t.version();
    const t0 = Date.now();
    const ok = await t.cmd('lea', [{ type: 'deplacer_pion', id: 'a', x: 3, y: 3 }]);
    assert.equal(ok.statusCode, 200, ok.body);
    // the other two clients see the new version, then read the new position through their own door
    await mj.attendre(new RegExp(`"table":${v + 1}`));
    await rox.attendre(new RegExp(`"table":${v + 1}`));
    await lea.attendre(new RegExp(`"table":${v + 1}`));
    assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
    const vueRox = (await w.req('GET', 'teo', t.T)).json();
    assert.deepEqual(vueRox.pions.filter((p: Any) => p.id === 'a').map((p: Any) => [p.x, p.y]), [[3, 3]]);
    assert.deepEqual(vueRox.mesPions, ['b']);

    w.regler(false);
    const refus = await t.cmd('teo', [{ type: 'deplacer_pion', id: 'b', x: 4, y: 4 }]);
    assert.equal(refus.statusCode, 403);
    assert.equal(refus.json().code, 'jeu_a_distance_coupe');
    await dormir(200);
    assert.equal(mj.octets().includes(`"table":${v + 2}`), false, 'le refus ne pousse rien');
    const t1 = Date.now();
    const pousse = await t.cmd('antor', [{ type: 'deplacer_pion', id: 'b', x: 6, y: 6 }]);
    assert.equal(pousse.statusCode, 200, pousse.body);
    await lea.attendre(new RegExp(`"table":${v + 2}`));
    await rox.attendre(new RegExp(`"table":${v + 2}`));
    assert.ok(Date.now() - t1 < 2000);
    assert.equal((await w.req('GET', 'teo', t.T)).json().deplacement, false);
    for (const c of [mj, lea, rox]) {
      assert.equal(/SECRET-|Bran|proprietaire/.test(c.octets()), false, 'le flux ne porte que des versions');
      c.fermer();
    }
  } finally { await fin(w); }
});
