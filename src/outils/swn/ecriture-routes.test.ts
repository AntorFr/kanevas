import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-galaxie-tenir-api : les routes d'écriture T-8, avec les comptes du semis.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { encoderSession } = await import('../../services/session.js');
const { JETON_BOUCHON, semerBouchon } = await import('../../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'mira', 'lea', 'teo']) h[c] = await connecter(app, c);
  // Roxane n'a pas de connexion bouchon : on signe son cookie de session comme `ouvrirSession` le fait.
  const rid = one(app, 'SELECT id FROM comptes WHERE username = ?', 'roxane').id as number;
  h.roxane = { cookie: `kanevas_session=${app.signCookie(encoderSession({ id: rid, groups: [] }))}` };
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const V = one(app, 'SELECT id FROM univers WHERE nom = ?', 'Univers voisin').id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const R = `/api/univers/${E}/outils/swn/galaxie/galaxies`;
  const req = (method: M, who: string | null, url: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...(who ? h[who] : {}), ...headers }, payload: payload as any });
  return { app, E, V, S, g, R, B: `${R}/${g}`, req, h };
}
type W = Awaited<ReturnType<typeof monde>>;
const ver = (w: W, table: string, where: string, ...a: unknown[]) => one(w.app, `SELECT version FROM ${table} WHERE ${where}`, ...a).version as number;
const compte = (w: W, t: string) => one(w.app, `SELECT count(*) n FROM ${t}`).n as number;
const carre = [[20, 20], [24, 20], [24, 24], [20, 24]];

test('Antor : chaque ligne de la table T-8 répond de la forme annoncée', async () => {
  const w = await monde();
  // galaxies
  const c = await w.req('POST', 'antor', w.R, { titre: 'Neuve' });
  assert.equal(c.statusCode, 201, c.body);
  assert.equal(typeof c.json().id, 'number');
  const p = await w.req('PATCH', 'antor', w.B, { titre: 'Renommée', version: 1 });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(p.json().titre, 'Renommée');
  assert.equal(p.json().version, 2);
  const pv = await w.req('PATCH', 'antor', w.B, { visible: false, version: 2 });
  assert.equal(pv.statusCode, 200, pv.body);
  assert.equal(pv.json().version, 3);
  const gr = await w.req('PUT', 'antor', `${w.B}/graine`, { graine: 'autre', version: 3, confirme: true });
  assert.equal(gr.statusCode, 200, gr.body);
  assert.equal(gr.json().version, 4);
  assert.equal(one(w.app, 'SELECT graine FROM swn_galaxies WHERE id=?', w.g).graine, 'autre');
  // systèmes
  const s = await w.req('POST', 'antor', `${w.B}/systemes`, { nom: 'Port Noir', q: 3, r: -3, secret: true });
  assert.equal(s.statusCode, 201, s.body);
  assert.equal(s.json().cle, 'port-noir');
  assert.equal(s.json().nom, 'Port Noir');
  assert.equal(s.json().version, 1);
  const sp = await w.req('PATCH', 'antor', `${w.B}/systemes/port-noir`, { nom: 'Port Noir II', version: 1 });
  assert.equal(sp.statusCode, 200, sp.body);
  assert.equal(sp.json().nom, 'Port Noir II');
  assert.equal(sp.json().version, 2);
  // routes
  const r = await w.req('POST', 'antor', `${w.B}/routes`, { depuis: 'port-noir', vers: 'vael', publique: false });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().publique, false);
  assert.equal(r.json().version, 1);
  assert.equal(typeof r.json().longueur, 'number');
  const rid = r.json().id as number;
  const rp = await w.req('PATCH', 'antor', `${w.B}/routes/${rid}`, { publique: true, version: 1 });
  assert.equal(rp.statusCode, 200, rp.body);
  assert.equal(rp.json().publique, true);
  assert.equal(rp.json().version, 2);
  // zones
  const z = await w.req('POST', 'antor', `${w.B}/zones`, { nom: 'Les Brumes', contour: carre });
  assert.equal(z.statusCode, 201, z.body);
  assert.equal(z.json().cle, 'les-brumes');
  assert.equal(z.json().version, 1);
  const zp = await w.req('PATCH', 'antor', `${w.B}/zones/les-brumes`, { nom: 'Les Brumes II', version: 1 });
  assert.equal(zp.statusCode, 200, zp.body);
  assert.equal(zp.json().nom, 'Les Brumes II');
  assert.equal(zp.json().version, 2);
  // contenu
  const ct = await w.req('GET', 'antor', `${w.B}/contenu`);
  assert.equal(ct.statusCode, 200);
  assert.deepEqual(ct.json(), { systemes: 5, routes: 4, zones: 2, document: null });
  // document
  const d0 = await w.req('GET', 'antor', `${w.B}/document`);
  assert.equal(d0.statusCode, 200);
  assert.deepEqual(d0.json(), { fiche: null, sectionId: null, etat: null, propositionId: null });
  const gv = ver(w, 'swn_galaxies', 'id=?', w.g);
  const d = await w.req('POST', 'antor', `${w.B}/document`, { creer: { titre: 'Galaxie — notes MJ' }, version: gv });
  assert.equal(d.statusCode, 201, d.body);
  assert.equal(d.json().fiche.titre, 'Galaxie — notes MJ');
  assert.equal(d.json().etat, 'a_jour');
  assert.equal(typeof d.json().sectionId, 'number');
  const d1 = await w.req('GET', 'antor', `${w.B}/document`);
  assert.deepEqual(d1.json(), d.json());
  assert.equal((await w.req('GET', 'antor', `${w.B}/contenu`)).json().document.titre, 'Galaxie — notes MJ');
  // suppressions
  assert.equal((await w.req('DELETE', 'antor', `${w.B}/zones/les-brumes?version=2`)).statusCode, 204);
  assert.equal((await w.req('DELETE', 'antor', `${w.B}/routes/${rid}?version=2`)).statusCode, 204);
  assert.equal((await w.req('DELETE', 'antor', `${w.B}/systemes/port-noir?version=2`)).statusCode, 204);
  const ct2 = (await w.req('GET', 'antor', `${w.B}/contenu`)).json();
  const del = await w.req('DELETE', 'antor', `${w.B}?version=${gv}&systemes=${ct2.systemes}&routes=${ct2.routes}&zones=${ct2.zones}`);
  assert.equal(del.statusCode, 204, del.body);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_galaxies WHERE id=?', w.g).n, 0);
});

test('Mira (MJ) écrit aussi', async () => {
  const w = await monde();
  const s = await w.req('POST', 'mira', `${w.B}/systemes`, { nom: 'Relais', q: 2, r: 2 });
  assert.equal(s.statusCode, 201, s.body);
});

test('Léa et Roxane : 403 refuse sur une galaxie visible, rien n\'est écrit', async () => {
  const w = await monde();
  const avant = [compte(w, 'swn_systemes'), compte(w, 'swn_routes'), compte(w, 'swn_zones'), compte(w, 'swn_galaxies')];
  const cas: [M, string, object?][] = [
    ['POST', w.R, { titre: 'X' }], ['PATCH', w.B, { titre: 'X', version: 1 }], ['PUT', `${w.B}/graine`, { graine: 'x', version: 1, confirme: true }],
    ['GET', `${w.B}/contenu`], ['DELETE', `${w.B}?version=1&systemes=4&routes=3&zones=0`],
    ['POST', `${w.B}/systemes`, { nom: 'X', q: 9, r: 9 }], ['PATCH', `${w.B}/systemes/vael`, { nom: 'X', version: 1 }], ['DELETE', `${w.B}/systemes/vael?version=1`],
    ['POST', `${w.B}/routes`, { depuis: 'vael', vers: 'hesper' }], ['PATCH', `${w.B}/routes/1`, { publique: false, version: 1 }], ['DELETE', `${w.B}/routes/1?version=1`],
    ['POST', `${w.B}/zones`, { nom: 'X', contour }], ['PATCH', `${w.B}/zones/marches-interdites`, { nom: 'X', version: 1 }], ['DELETE', `${w.B}/zones/marches-interdites?version=1`],
    ['GET', `${w.B}/document`], ['POST', `${w.B}/document`, { creer: { titre: 'X' }, version: 1 }],
  ];
  for (const who of ['lea', 'roxane']) for (const [m, url, body] of cas) {
    const r = await w.req(m, who, url, body);
    assert.equal(r.statusCode, 403, `${who} ${m} ${url} → ${r.statusCode} ${r.body}`);
    assert.equal(r.json().error ?? r.json().code ?? 'refuse', 'refuse', `${who} ${m} ${url}`);
  }
  assert.deepEqual([compte(w, 'swn_systemes'), compte(w, 'swn_routes'), compte(w, 'swn_zones'), compte(w, 'swn_galaxies')], avant);
});
const contour = carre;

test('Antor en mode Joueur : 403 code mode_joueur, rien n\'est écrit', async () => {
  const w = await monde();
  const avant = [compte(w, 'swn_systemes'), compte(w, 'swn_routes'), compte(w, 'swn_zones'), compte(w, 'swn_galaxies')];
  const cas: [M, string, object?][] = [
    ['POST', w.R, { titre: 'X' }], ['PATCH', w.B, { titre: 'X', version: 1 }], ['PUT', `${w.B}/graine`, { graine: 'x', version: 1, confirme: true }],
    ['GET', `${w.B}/contenu`], ['DELETE', `${w.B}?version=1&systemes=4&routes=3&zones=1`],
    ['POST', `${w.B}/systemes`, { nom: 'X', q: 9, r: 9 }], ['PATCH', `${w.B}/systemes/vael`, { nom: 'X', version: 1 }], ['DELETE', `${w.B}/systemes/vael?version=1`],
    ['POST', `${w.B}/routes`, { depuis: 'vael', vers: 'hesper' }], ['PATCH', `${w.B}/routes/1`, { publique: false, version: 1 }], ['DELETE', `${w.B}/routes/1?version=1`],
    ['POST', `${w.B}/zones`, { nom: 'X', contour }], ['PATCH', `${w.B}/zones/marches-interdites`, { nom: 'X', version: 1 }], ['DELETE', `${w.B}/zones/marches-interdites?version=1`],
    ['GET', `${w.B}/document`], ['POST', `${w.B}/document`, { creer: { titre: 'X' }, version: 1 }],
  ];
  for (const [m, url, body] of cas) {
    const r = await w.req(m, 'antor', `${url}${url.includes('?') ? '&' : '?'}mode=joueur`, body);
    assert.equal(r.statusCode, 403, `${m} ${url} → ${r.statusCode} ${r.body}`);
    assert.equal(r.json().code, 'mode_joueur', `${m} ${url}`);
  }
  assert.deepEqual([compte(w, 'swn_systemes'), compte(w, 'swn_routes'), compte(w, 'swn_zones'), compte(w, 'swn_galaxies')], avant);
});

test('404 identique octet pour octet : Teo, étranger, galaxie cachée à Léa, autre univers, outil désactivé, invisible', async () => {
  const w = await monde();
  const dehors = await connecter(w.app, 'admin').catch(() => null);
  const gabarits: [M, (b: string, r: string) => string, object?][] = [
    ['POST', (_b, r) => r, { titre: 'X' }], ['PATCH', (b) => b, { titre: 'X', version: 1 }], ['PUT', (b) => `${b}/graine`, { graine: 'x', version: 1, confirme: true }],
    ['GET', (b) => `${b}/contenu`], ['DELETE', (b) => `${b}?version=1&systemes=4&routes=3&zones=1`],
    ['POST', (b) => `${b}/systemes`, { nom: 'X', q: 9, r: 9 }], ['PATCH', (b) => `${b}/systemes/vael`, { nom: 'X', version: 1 }], ['DELETE', (b) => `${b}/systemes/vael?version=1`],
    ['POST', (b) => `${b}/routes`, { depuis: 'vael', vers: 'hesper' }], ['PATCH', (b) => `${b}/routes/1`, { publique: false, version: 1 }], ['DELETE', (b) => `${b}/routes/1?version=1`],
    ['POST', (b) => `${b}/zones`, { nom: 'X', contour }], ['PATCH', (b) => `${b}/zones/marches-interdites`, { nom: 'X', version: 1 }], ['DELETE', (b) => `${b}/zones/marches-interdites?version=1`],
    ['GET', (b) => `${b}/document`], ['POST', (b) => `${b}/document`, { creer: { titre: 'X' }, version: 1 }],
  ];
  const ref = async (m: M, f: (b: string, r: string) => string, body?: object) => {
    // adresse inexistante : outil inconnu, même méthode
    const url = f(`/api/univers/${w.E}/outils/swn/inconnu/galaxies/${w.g}`, `/api/univers/${w.E}/outils/swn/inconnu/galaxies`);
    const r = await w.req(m, 'antor', url, body);
    return [r.statusCode, r.body] as const;
  };
  const attendu: Record<string, readonly [number, string]> = {};
  for (const [m, f, b] of gabarits) { attendu[`${m}${f('B', 'R')}`] = await ref(m, f, b); assert.equal(attendu[`${m}${f('B', 'R')}`]![0], 404); }
  const verifier = async (qui: string | null, nom: string, base: string, racine: string, headers?: Record<string, string>, sansCreation = false) => {
    for (const [m, f, b] of gabarits) {
      if (sansCreation && f('B', 'R') === 'R') continue; // POST galaxies n'adresse aucun identifiant : légitime ici
      const r = await w.req(m, qui, f(base, racine), b, headers);
      assert.deepEqual([r.statusCode, r.body], attendu[`${m}${f('B', 'R')}`], `${nom} ${m} ${f(base, racine)}`);
    }
  };
  await verifier('teo', 'teo', w.B, w.R);
  // l'identifiant d'une galaxie d'un autre univers, via un univers où Antor n'a pas de rôle
  const gv = Number(w.app.db.prepare(`INSERT INTO swn_galaxies (univers_id, titre, visible, graine) VALUES (?, 'Voisine', 1, 'x')`).run(w.V).lastInsertRowid);
  await verifier('antor', 'autre-univers (id étranger)', `${w.R}/${gv}`, w.R, undefined, true);
  await verifier('antor', 'univers inexistant', `/api/univers/999999/outils/swn/galaxie/galaxies/${gv}`, `/api/univers/999999/outils/swn/galaxie/galaxies`);
  await verifier('lea', 'Léa dans un univers où elle n\'est pas membre', `/api/univers/${w.V}/outils/swn/galaxie/galaxies/${gv}`, `/api/univers/${w.V}/outils/swn/galaxie/galaxies`);
  await verifier('antor', 'galaxie inconnue', `${w.R}/999999`, w.R, undefined, true);
  // galaxie cachée à Léa : 404 pour elle (pas 403)
  w.app.db.prepare('UPDATE swn_galaxies SET visible = 0 WHERE id = ?').run(w.g);
  for (const who of ['lea', 'roxane']) await verifier(who, `${who} galaxie cachée`, w.B, w.R, undefined, true);
  w.app.db.prepare('UPDATE swn_galaxies SET visible = 1 WHERE id = ?').run(w.g);
  void dehors;
  // outil désactivé
  const off = await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/galaxie/activation`, headers: w.h.antor, payload: { active: false } });
  assert.equal(off.statusCode, 204);
  await verifier('antor', 'outil désactivé', w.B, w.R);
});

test('galaxie cachée à Léa : écriture 404 comme une adresse inexistante, à Léa et Roxane', async () => {
  const w = await monde();
  w.app.db.prepare('UPDATE swn_galaxies SET visible = 0 WHERE id = ?').run(w.g);
  const inex = await w.req('PATCH', 'lea', `${w.R}/999999`, { titre: 'X', version: 1 });
  assert.equal(inex.statusCode, 404);
  for (const who of ['lea', 'roxane']) {
    const r = await w.req('PATCH', who, w.B, { titre: 'X', version: 1 });
    assert.equal(r.statusCode, 404, who);
    assert.equal(r.body, inex.body, who);
  }
});

test('409 donnee_modifiee sur version périmée : galaxie, système, route, zone ; rien n\'est écrit', async () => {
  const w = await monde();
  const code = (r: any) => r.json().code;
  const gv = ver(w, 'swn_galaxies', 'id=?', w.g);
  const stale = gv + 5;
  for (const [m, url, body] of [
    ['PATCH', w.B, { titre: 'X', version: stale }],
    ['PATCH', w.B, { visible: false, version: stale }],
    ['PUT', `${w.B}/graine`, { graine: 'x', version: stale, confirme: true }],
    ['PATCH', `${w.B}/systemes/vael`, { nom: 'X', version: 9 }],
    ['DELETE', `${w.B}/systemes/vael?version=9`],
    ['PATCH', `${w.B}/routes/1`, { publique: false, version: 9 }],
    ['DELETE', `${w.B}/routes/1?version=9`],
    ['PATCH', `${w.B}/zones/marches-interdites`, { nom: 'X', version: 9 }],
    ['DELETE', `${w.B}/zones/marches-interdites?version=9`],
    ['DELETE', `${w.B}?version=${stale}&systemes=4&routes=3&zones=1`],
    ['POST', `${w.B}/document`, { creer: { titre: 'X' }, version: stale }],
  ] as [M, string, object?][]) {
    const r = await w.req(m, 'antor', url, body);
    assert.equal(r.statusCode, 409, `${m} ${url} ${r.body}`);
    assert.equal(code(r), 'donnee_modifiee', `${m} ${url}`);
  }
  assert.equal(ver(w, 'swn_galaxies', 'id=?', w.g), gv);
  assert.equal(one(w.app, "SELECT nom FROM swn_systemes WHERE cle='vael'").nom, 'Vael');
  assert.equal(compte(w, 'swn_zones'), 1);
});

test('409 case_occupee, route_existante, contenu_change (nouveaux décomptes), document_existant', async () => {
  const w = await monde();
  const occ = await w.req('POST', 'antor', `${w.B}/systemes`, { nom: 'Doublon', q: 0, r: 0 });
  assert.equal(occ.statusCode, 409, occ.body);
  assert.equal(occ.json().code, 'case_occupee');
  const dep = await w.req('PATCH', 'antor', `${w.B}/systemes/vael`, { q: 0, r: 0, version: 1 });
  assert.equal(dep.statusCode, 409);
  assert.equal(dep.json().code, 'case_occupee');
  const ex = await w.req('POST', 'antor', `${w.B}/routes`, { depuis: 'vael', vers: 'port-sel' });
  assert.equal(ex.statusCode, 409, ex.body);
  assert.equal(ex.json().code, 'route_existante');
  const gv = ver(w, 'swn_galaxies', 'id=?', w.g);
  const cc = await w.req('DELETE', 'antor', `${w.B}?version=${gv}&systemes=1&routes=1&zones=1`);
  assert.equal(cc.statusCode, 409, cc.body);
  assert.equal(cc.json().code, 'contenu_change');
  assert.equal(cc.json().systemes, 4);
  assert.equal(cc.json().routes, 3);
  assert.equal(cc.json().zones, 1);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_galaxies').n, 1);
  assert.equal(compte(w, 'swn_systemes'), 4);
  const d = await w.req('POST', 'antor', `${w.B}/document`, { creer: { titre: 'Doc' }, version: gv });
  assert.equal(d.statusCode, 201, d.body);
  const d2 = await w.req('POST', 'antor', `${w.B}/document`, { creer: { titre: 'Doc 2' }, version: gv });
  assert.equal(d2.statusCode, 409, d2.body);
  assert.equal(d2.json().code, 'document_existant');
  assert.equal(one(w.app, "SELECT count(*) n FROM fiches WHERE titre='Doc 2'").n, 0);
});

test('400 avec champ : contour croisé, trop court, nom vide, confirmation absente, route sur elle-même, longueur', async () => {
  const w = await monde();
  const c400 = async (m: M, url: string, body: object | undefined, champ: string, code?: string) => {
    const r = await w.req(m, 'antor', url, body);
    assert.equal(r.statusCode, 400, `${m} ${url} ${r.body}`);
    assert.equal(r.json().champ, champ, `${m} ${url} ${r.body}`);
    if (code) assert.equal(r.json().code, code);
  };
  const gv = ver(w, 'swn_galaxies', 'id=?', w.g);
  await c400('POST', `${w.B}/zones`, { nom: 'Noeud', contour: [[0, 0], [4, 4], [4, 0], [0, 4]] }, 'contour');
  await c400('POST', `${w.B}/zones`, { nom: 'Court', contour: [[0, 0], [4, 4]] }, 'contour');
  await c400('PATCH', `${w.B}/zones/marches-interdites`, { contour: [[0, 0], [4, 4], [4, 0], [0, 4]], version: 1 }, 'contour');
  await c400('POST', `${w.B}/systemes`, { nom: '', q: 5, r: 5 }, 'nom');
  await c400('POST', `${w.B}/systemes`, { nom: '   ', q: 5, r: 5 }, 'nom');
  await c400('POST', `${w.B}/zones`, { nom: '', contour: carre }, 'nom');
  await c400('POST', w.R, { titre: '' }, 'titre');
  await c400('PATCH', w.B, { titre: '', version: gv }, 'titre');
  await c400('PUT', `${w.B}/graine`, { graine: 'x', version: gv }, 'confirme');
  await c400('PUT', `${w.B}/graine`, { graine: 'x', version: gv, confirme: 'true' }, 'confirme');
  await c400('PUT', `${w.B}/graine`, { graine: '', version: gv, confirme: true }, 'graine');
  await c400('POST', `${w.B}/routes`, { depuis: 'vael', vers: 'vael' }, 'vers');
  await c400('POST', `${w.B}/routes`, { depuis: 'vael', vers: 'hesper', longueur: 3 }, 'longueur');
  await c400('PATCH', w.B, { titre: 'a', visible: true, version: gv }, 'visible');
  await c400('PATCH', w.B, { version: gv }, 'titre');
  await c400('DELETE', `${w.B}?systemes=4&routes=3&zones=1`, undefined, 'version');
  await c400('DELETE', `${w.B}?version=${gv}&systemes=x&routes=3&zones=1`, undefined, 'vu');
  await c400('DELETE', `${w.B}/systemes/vael`, undefined, 'version');
  // rien n'a bougé
  assert.equal(one(w.app, "SELECT graine g FROM swn_galaxies WHERE id=?", w.g).g, 'essai-1');
  assert.equal(compte(w, 'swn_zones'), 1);
  // corps non-objet : 400, pas 500
  for (const [m, url] of [['POST', `${w.B}/systemes`], ['POST', w.R], ['PUT', `${w.B}/graine`]] as [M, string][]) {
    const r = await w.app.inject({ method: m, url, headers: { ...w.h.antor, 'content-type': 'application/json' }, payload: '[1]' });
    assert.equal(r.statusCode, 400, `${m} ${url} ${r.body}`);
  }
});

test('une route/zone/système d\'une autre galaxie du même univers est 404', async () => {
  const w = await monde();
  const g2 = Number(w.app.db.prepare(`INSERT INTO swn_galaxies (univers_id, titre, visible, graine) VALUES (?, 'Seconde', 1, 'x')`).run(w.E).lastInsertRowid);
  const B2 = `${w.R}/${g2}`;
  const ref = await w.req('PATCH', 'antor', `${B2}/routes/999999`, { publique: true, version: 1 });
  assert.equal(ref.statusCode, 404);
  const rid = one(w.app, 'SELECT id FROM swn_routes LIMIT 1').id;
  const x = await w.req('PATCH', 'antor', `${B2}/routes/${rid}`, { publique: true, version: 1 });
  assert.equal(x.statusCode, 404);
  assert.equal((await w.req('PATCH', 'antor', `${B2}/systemes/vael`, { nom: 'X', version: 1 })).statusCode, 404);
  assert.equal((await w.req('DELETE', 'antor', `${B2}/zones/marches-interdites?version=1`)).statusCode, 404);
  assert.equal(compte(w, 'swn_zones'), 1);
});

test('un jeton kvs_… n\'ouvre aucune route d\'écriture ; sans session 401', async () => {
  const w = await monde();
  const bearer = { authorization: `Bearer ${JETON_BOUCHON}` };
  const cas: [M, string, object?][] = [
    ['POST', w.R, { titre: 'X' }], ['PATCH', w.B, { titre: 'X', version: 1 }], ['PUT', `${w.B}/graine`, { graine: 'x', version: 1, confirme: true }],
    ['GET', `${w.B}/contenu`], ['DELETE', `${w.B}?version=1&systemes=4&routes=3&zones=1`],
    ['POST', `${w.B}/systemes`, { nom: 'X', q: 9, r: 9 }], ['DELETE', `${w.B}/systemes/vael?version=1`],
    ['POST', `${w.B}/routes`, { depuis: 'vael', vers: 'hesper' }], ['POST', `${w.B}/zones`, { nom: 'X', contour: carre }],
    ['GET', `${w.B}/document`], ['POST', `${w.B}/document`, { creer: { titre: 'X' }, version: 1 }],
  ];
  for (const [m, url, body] of cas) {
    assert.equal((await w.req(m, null, url, body, bearer)).statusCode, 401, `jeton ${m} ${url}`);
    assert.equal((await w.req(m, null, url, body)).statusCode, 401, `anonyme ${m} ${url}`);
  }
  assert.equal(compte(w, 'swn_galaxies'), 1);
  assert.equal(compte(w, 'swn_systemes'), 4);
});

test('document : la proposition de mise à jour passe par la route commune de sections gérées', async () => {
  const w = await monde();
  const gv = ver(w, 'swn_galaxies', 'id=?', w.g);
  const d = (await w.req('POST', 'antor', `${w.B}/document`, { creer: { titre: 'Notes' }, version: gv })).json();
  const rien = await w.req('POST', 'antor', `${w.B}/systemes`, { nom: 'Septième', q: 4, r: 4 });
  assert.equal(rien.statusCode, 201);
  const apres = (await w.req('GET', 'antor', `${w.B}/document`)).json();
  assert.equal(apres.etat, 'perime');
  assert.equal(typeof apres.propositionId, 'number', 'proposition posée par l\'écriture');
  // Léa ne lit pas la section
  const fiche = await w.req('GET', 'lea', `/api/univers/${w.E}/fiches/${d.fiche.id}`);
  assert.ok(!fiche.body.includes('Septième') && !fiche.body.includes('Port-Sel'), 'le document ne fuit pas');
  // la route commune
  const p = await w.req('POST', 'antor', `/api/univers/${w.E}/fiches/${d.fiche.id}/sections/${d.sectionId}/recalcul/proposition`, {});
  assert.equal(p.statusCode, 201, p.body);
  // le contenu de la section n'a pas été écrit sans acceptation
  const texte = one(w.app, 'SELECT contenu FROM sections WHERE id=?', d.sectionId).contenu as string;
  assert.ok(!texte.includes('Septième'));
  assert.equal(one(w.app, 'SELECT contenu_public FROM sections WHERE id=?', d.sectionId).contenu_public, '');
});

test('document : ficheId existante, ficheId inconnue, les deux ou aucun', async () => {
  const w = await monde();
  const gv = ver(w, 'swn_galaxies', 'id=?', w.g);
  const post = (b: object) => w.req('POST', 'antor', `${w.B}/document`, b);
  assert.equal((await post({ version: gv })).statusCode, 400);
  assert.equal((await post({ ficheId: 1, creer: { titre: 'X' }, version: gv })).statusCode, 400);
  assert.equal((await post({ creer: { titre: '' }, version: gv })).statusCode >= 400, true);
  const inconnue = await post({ ficheId: 999999, version: gv });
  assert.ok([400, 404].includes(inconnue.statusCode), String(inconnue.statusCode));
  assert.equal(one(w.app, 'SELECT fiche_id f FROM swn_galaxies WHERE id=?', w.g).f, null);
  assert.equal((await post({ creer: { titre: 'Y' } })).statusCode, 400);
});

test('suppression : la section gérée du document part avec la galaxie, la fiche reste', async () => {
  const w = await monde();
  const gv = ver(w, 'swn_galaxies', 'id=?', w.g);
  const d = (await w.req('POST', 'antor', `${w.B}/document`, { creer: { titre: 'Notes' }, version: gv })).json();
  const del = await w.req('DELETE', 'antor', `${w.B}?version=${gv}&systemes=4&routes=3&zones=1`);
  assert.equal(del.statusCode, 204, del.body);
  assert.equal(one(w.app, 'SELECT count(*) n FROM sections WHERE id=?', d.sectionId).n, 0);
  assert.equal(one(w.app, 'SELECT count(*) n FROM fiches WHERE id=?', d.fiche.id).n, 1);
  assert.equal((await w.req('GET', 'antor', w.B)).statusCode, 404);
});

test('les écritures de Léa n\'apparaissent pas ; un secret posé par le MJ reste invisible à Léa', async () => {
  const w = await monde();
  await w.req('POST', 'antor', `${w.B}/systemes`, { nom: 'Port Noir', q: 3, r: -3, secret: true });
  await w.req('POST', 'antor', `${w.B}/zones`, { nom: 'Zone cachée', contour: carre, secret: true });
  const blocs = await w.req('GET', 'lea', `${w.B}/blocs?de=-3,-3&a=3,3`);
  assert.ok(!blocs.body.includes('Port Noir') && !blocs.body.includes('Zone cachée'));
  const rech = await w.req('GET', 'lea', `${w.B}/recherche?q=noir`);
  assert.equal(rech.json().length, 0);
  assert.equal((await w.req('GET', 'lea', `${w.B}/systemes/port-noir`)).statusCode, 404);
});
