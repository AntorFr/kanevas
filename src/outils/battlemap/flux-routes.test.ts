// Review tests of kanevas-battlemap-table-flux (AD-159, AD-160, AD-battlemap-table-6, 9): the stream of a played map, read as bytes
// on a real HTTP server, and the shared live client (SSE and poll) against that server.
//
// TEST PLAN
//   octets      : `maj` initial, `event: battement` nommé (jamais une ligne `:`), en-têtes SSE
//   vivant      : une écriture du MJ vue par le second client sur le flux (< 2 s) et par le sondage (< 4 s)
//   secrets     : tout ce que porte le flux d'un joueur ne contient aucun secret (pion caché, titre, nom) ; que des versions
//   presence    : au seul MJ, suit l'ouverture/fermeture d'un flux d'affichage ; jamais décidée par le paramètre ; MJ en mode joueur
//   droits      : carte cachée = introuvable pour un joueur (et un MJ en mode joueur), inconnue, hors univers, sans session
//   maj         : bascule de visibilité, réglage, table créée, propriétaire, suppression poussent `maj`
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
const { poserActivation } = await import('../../services/outils.js');
const { reglerBattement } = await import('../../services/battlemap-flux.js');
const { ouvrirDirect } = await import('../../../frontend/src/outils/battlemap/flux.ts');

type App = Awaited<ReturnType<typeof buildApp>>;
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-flux-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'mira', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const antorId = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  poserActivation(app.db, antorId, { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', who: string | null, url: string, payload?: any) =>
    app.inject({ method, url, headers: who ? { cookie: h[who]! } : {}, payload });
  const compte = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  return { app, E, R, h, port, req, compte };
}
type W = Awaited<ReturnType<typeof monde>>;
const reqs = new Set<http.ClientRequest>();
/** Closes every client stream first: a red test must fail, not hang on `app.close()`. */
async function fin(w: W) { for (const r of reqs) r.destroy(); reqs.clear(); await w.app.close(); }

interface Ouvert { statut: number; entetes: http.IncomingHttpHeaders; octets(): string; attendre(re: RegExp, ms?: number): Promise<string>; fermer(): void }

/** A real streaming client: collects every byte the server writes. */
function ouvrir(w: W, who: string | null, chemin: string): Promise<Ouvert> {
  return new Promise((resolve, reject) => {
    let tampon = '';
    const r = http.request({ host: '127.0.0.1', port: w.port, path: chemin, headers: who ? { cookie: w.h[who]! } : {} }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (d: string) => { tampon += d; });
      res.on('error', () => {});
      resolve({
        statut: res.statusCode!, entetes: res.headers, octets: () => tampon,
        async attendre(re, ms = 2000) {
          const fin = Date.now() + ms;
          while (!re.test(tampon)) {
            if (Date.now() > fin) throw new Error(`pas de ${re} dans ${JSON.stringify(tampon)}`);
            await dormir(10);
          }
          return tampon;
        },
        fermer: () => { r.destroy(); },
      });
    });
    r.on('error', (e) => { if (!(e as any).code?.startsWith('ECONN')) reject(e); });
    reqs.add(r);
    r.end();
  });
}

async function carte(w: W, visible = true) {
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Soute', largeur: 12, hauteur: 8 })).json();
  if (visible) assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 1, visible: true })).statusCode, 200);
  return { id: id as number, F: `${w.R}/${id}/flux`, T: `${w.R}/${id}/table` };
}
const evenements = (octets: string, nom: string) =>
  [...octets.matchAll(new RegExp(`event: ${nom}\\ndata: (.*)\\n\\n`, 'g'))].map((m) => JSON.parse(m[1]!));

test('le flux envoie un maj à l’ouverture, des en-têtes SSE, puis un event: battement nommé — jamais une ligne de commentaire', async () => {
  const w = await monde();
  reglerBattement(60);
  try {
    const { id, F } = await carte(w);
    const s = await ouvrir(w, 'lea', F);
    assert.equal(s.statut, 200);
    assert.match(String(s.entetes['content-type']), /^text\/event-stream/);
    assert.match(String(s.entetes['cache-control']), /no-cache/);
    assert.match(String(s.entetes['cache-control']), /no-transform/);
    assert.equal(s.entetes['x-accel-buffering'], 'no');
    await s.attendre(/event: maj\n/);
    assert.deepEqual(evenements(s.octets(), 'maj')[0], { carte: 2, table: null });
    await s.attendre(/event: battement\ndata: \{\}\n\n/);
    await s.attendre(/(event: battement[^]*){2}/);
    for (const ligne of s.octets().split('\n')) assert.ok(!ligne.startsWith(':'), `commentaire SSE: ${ligne}`);
    assert.ok(id > 0);
    s.fermer();
  } finally { reglerBattement(20_000); await fin(w); }
});

test('une écriture du MJ est vue par le second client sur le flux en moins de 2 s, avec les deux versions', async () => {
  const w = await monde();
  try {
    const { F, T } = await carte(w);
    await w.req('POST', 'antor', T);
    const lea = await ouvrir(w, 'lea', F);
    await lea.attendre(/event: maj/);
    assert.deepEqual(evenements(lea.octets(), 'maj').at(-1), { carte: 2, table: 1 });
    const t0 = Date.now();
    const ok = await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [{ type: 'ajouter_pion', id: 'a', nom: 'A', x: 1, y: 1 }] });
    assert.equal(ok.statusCode, 200);
    await lea.attendre(/"table":2/);
    assert.ok(Date.now() - t0 < 2000);
    assert.match(lea.octets(), /id: 2\nevent: maj\ndata: \{"carte":2,"table":2\}\n\n/);
    lea.fermer();
  } finally { await fin(w); }
});

test('une écriture du document (réglage) pousse maj avec la version de la carte', async () => {
  const w = await monde();
  try {
    const { F, id } = await carte(w);
    const lea = await ouvrir(w, 'lea', F);
    await lea.attendre(/event: maj/);
    const r = await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, titre: 'Soute 2' });
    assert.equal(r.statusCode, 200, r.body);
    await lea.attendre(/"carte":3/);
    lea.fermer();
  } finally { await fin(w); }
});

test('le client commun voit l’écriture du MJ par le flux (< 2 s) puis, flux muet, par le sondage (< 4 s)', async () => {
  const w = await monde();
  try {
    const { F, T } = await carte(w);
    await w.req('POST', 'antor', T);
    const lire = async () => (await w.req('GET', 'lea', T)).json().version as number;
    // SSE: a real EventSource-like over HTTP (node has no EventSource): a minimal adapter on the real stream.
    const ecouteurs = new Map<string, (e: { data?: string }) => void>();
    const brut = http.request({ host: '127.0.0.1', port: w.port, path: F, headers: { cookie: w.h.lea! } }, (res) => {
      let tampon = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => {
        tampon += d;
        let i;
        while ((i = tampon.indexOf('\n\n')) >= 0) {
          const bloc = tampon.slice(0, i); tampon = tampon.slice(i + 2);
          const nom = /^event: (.*)$/m.exec(bloc)?.[1]; const data = /^data: (.*)$/m.exec(bloc)?.[1];
          if (nom) ecouteurs.get(nom)?.({ data });
        }
      });
    });
    reqs.add(brut);
    brut.end();
    let vue = 0;
    const d = ouvrirDirect({
      url: F, recharger: async () => { vue = await lire(); },
      fabrique: () => ({ addEventListener: (t, f) => { ecouteurs.set(t, f); }, close: () => brut.destroy(), onerror: null }),
    });
    for (let i = 0; i < 100 && vue !== 1; i++) await dormir(20);
    assert.equal(vue, 1);
    assert.equal(d.etat(), 'direct');
    const t0 = Date.now();
    await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [{ type: 'ajouter_pion', id: 'a', nom: 'A', x: 1, y: 1 }] });
    while (vue !== 2 && Date.now() - t0 < 5000) await dormir(10);
    assert.equal(vue, 2);
    assert.ok(Date.now() - t0 < 2000, `flux: ${Date.now() - t0} ms`);
    d.fermer();

    // Poll: a stream that never answers → after 4 s the client polls every 3 s.
    let vue2 = 0;
    const p = ouvrirDirect({
      url: F, recharger: async () => { vue2 = await lire(); },
      fabrique: () => ({ addEventListener: () => {}, close: () => {}, onerror: null }),
    });
    const fin = Date.now() + 6000;
    while (p.etat() !== 'sondage' && Date.now() < fin) await dormir(50);
    assert.equal(p.etat(), 'sondage');
    await dormir(50);
    assert.equal(vue2, 2);
    const t1 = Date.now();
    await w.req('POST', 'antor', `${T}/commandes`, { version: 2, commandes: [{ type: 'ajouter_pion', id: 'b', nom: 'B', x: 2, y: 2 }] });
    while (vue2 !== 3 && Date.now() - t1 < 6000) await dormir(20);
    assert.equal(vue2, 3);
    assert.ok(Date.now() - t1 <= 4000, `sondage: ${Date.now() - t1} ms`);
    p.fermer();
  } finally { await fin(w); }
});

test('un compte joueur ne reçoit sur le flux que des versions : aucune chaîne secrète dans les octets', async () => {
  const w = await monde();
  reglerBattement(50);
  try {
    const { id, F, T } = await carte(w);
    const SECRET = 'SECRET-ZX9';
    await w.req('POST', 'antor', T);
    const lea = await ouvrir(w, 'lea', F);
    const aff = await ouvrir(w, 'lea', `${F}?role=affichage`);
    await lea.attendre(/event: maj/);
    const cmds = [
      { type: 'ajouter_pion', id: 'cache', nom: `Pion ${SECRET}`, x: 1, y: 1, visible: false },
      { type: 'ajouter_pion', id: 'sous', nom: `Brume ${SECRET}`, x: 5, y: 5, visible: true },
      { type: 'reveler_rect', x: 0, y: 0, l: 2, h: 2 },
    ];
    const r = await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: cmds });
    assert.equal(r.statusCode, 200, r.body);
    await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, titre: `Titre ${SECRET}` });
    await lea.attendre(/"table":2/);
    await lea.attendre(/"carte":3/);
    await lea.attendre(/(event: battement[^]*){2}/);
    for (const s of [lea, aff]) {
      const o = s.octets();
      assert.ok(!o.includes(SECRET), o);
      assert.ok(!/Pion|Brume|Titre|Soute|cache|sous/.test(o), o);
      assert.ok(!o.includes('presence'), 'un joueur ne reçoit pas presence');
      for (const bloc of o.split('\n\n').filter(Boolean)) {
        assert.match(bloc, /^(retry: \d+|(id: \d+\n)?event: (maj|battement)\ndata: (\{\}|\{"carte":\d+,"table":(\d+|null)\}))$/, bloc);
      }
    }
    lea.fermer(); aff.fermer();
  } finally { reglerBattement(20_000); await fin(w); }
});

test('presence : au seul MJ, suit l’ouverture et la fermeture d’un affichage, jamais décidée par le paramètre', async () => {
  const w = await monde();
  try {
    const { F } = await carte(w);
    const mj = await ouvrir(w, 'antor', F);
    const joueur = await ouvrir(w, 'lea', F);
    const faux = await ouvrir(w, 'lea', `${F}?mj=1&role=mj`);
    await mj.attendre(/event: presence/);
    assert.deepEqual(evenements(mj.octets(), 'presence'), [{ affichages: 0 }]);
    const aff = await ouvrir(w, 'antor', `${F}?role=affichage`);
    await mj.attendre(/"affichages":1/);
    const aff2 = await ouvrir(w, 'mira', `${F}?role=affichage`);
    await mj.attendre(/"affichages":2/);
    aff.fermer();
    await mj.attendre(/"affichages":2\}\n\n[^]*"affichages":1\}/);
    aff2.fermer();
    await mj.attendre(/"affichages":1\}\n\n[^]*"affichages":0\}/);
    assert.deepEqual(evenements(mj.octets(), 'presence').map((e) => e.affichages), [0, 1, 2, 1, 0]);
    await dormir(100);
    assert.ok(!joueur.octets().includes('presence'));
    assert.ok(!faux.octets().includes('presence'));
    assert.ok(!aff.octets().includes('presence'), 'le flux d’affichage du MJ ne reçoit pas presence');
    mj.fermer(); joueur.fermer(); faux.fermer();
  } finally { await fin(w); }
});

test('le MJ en mode joueur ne reçoit pas presence (le rôle lu, pas le compte) et lit une carte cachée comme introuvable', async () => {
  const w = await monde();
  try {
    const { F } = await carte(w);
    const mode = await ouvrir(w, 'antor', `${F}?mode=joueur`);
    assert.equal(mode.statut, 200);
    const aff = await ouvrir(w, 'mira', `${F}?role=affichage`);
    await aff.attendre(/event: maj/);
    await dormir(100);
    assert.ok(!mode.octets().includes('presence'));
    const { F: cachee } = await carte(w, false);
    assert.equal((await ouvrir(w, 'antor', `${cachee}?mode=joueur`)).statut, 404);
    mode.fermer(); aff.fermer();
  } finally { await fin(w); }
});

test('carte cachée : introuvable pour un joueur et pour l’affichage ; carte inconnue, autre univers, sans session ; un MJ la lit', async () => {
  const w = await monde();
  try {
    const { F } = await carte(w, false);
    const lea = await ouvrir(w, 'lea', F);
    assert.equal(lea.statut, 404);
    assert.ok(!/event:/.test(lea.octets()));
    const affMJ = await ouvrir(w, 'antor', `${F}?role=affichage`);
    assert.equal(affMJ.statut, 404, 'l’affichage lit comme un joueur, même pour un MJ');
    const mj = await ouvrir(w, 'antor', F);
    assert.equal(mj.statut, 200);
    assert.equal((await ouvrir(w, 'antor', `${w.R}/99999/flux`)).statut, 404);
    assert.notEqual((await ouvrir(w, null, F)).statut, 200);
    mj.fermer();
  } finally { await fin(w); }
});

test('bascule de visibilité, table créée, propriétaire et suppression poussent maj', async () => {
  const w = await monde();
  try {
    const { id, F, T } = await carte(w);
    const mj = await ouvrir(w, 'antor', F);
    await mj.attendre(/event: maj/);
    const n = () => evenements(mj.octets(), 'maj').length;
    const avant = n();
    assert.equal((await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, visible: false })).statusCode, 200);
    await mj.attendre(/"carte":3/);
    assert.equal(n(), avant + 1);
    await w.req('POST', 'antor', T);
    await mj.attendre(/"table":1/);
    await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [{ type: 'ajouter_pion', id: 'a', nom: 'A', x: 1, y: 1 }] });
    await mj.attendre(/"table":2/);
    const pr = await w.req('PUT', 'antor', `${T}/pions/a/proprietaire`, { compte_id: w.compte('lea') });
    assert.equal(pr.statusCode, 200, pr.body);
    await mj.attendre(/"table":3/);
    const avantSup = n();
    assert.equal((await w.req('DELETE', 'antor', `${w.R}/${id}`)).statusCode < 300, true);
    await mj.attendre(/"carte":null/);
    assert.equal(n(), avantSup + 1);
    assert.equal((await w.req('GET', 'antor', T)).statusCode, 404);
    mj.fermer();
  } finally { await fin(w); }
});

test('un flux fermé libère sa place : plus d’écriture vers lui, le serveur ferme proprement', async () => {
  const w = await monde();
  const { F, T } = await carte(w);
  await w.req('POST', 'antor', T);
  const lea = await ouvrir(w, 'lea', F);
  await lea.attendre(/event: maj/);
  lea.fermer();
  await dormir(50);
  const r = await w.req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [{ type: 'ajouter_pion', id: 'a', nom: 'A', x: 1, y: 1 }] });
  assert.equal(r.statusCode, 200);
  await fin(w);
});
