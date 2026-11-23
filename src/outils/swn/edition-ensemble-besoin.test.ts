import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Whole-feature tests of kanevas-carte-spatiale-edition at the door of E-23: the write routes under
// …/galaxies/:gid/interieur/:q/:r, real routes, real database, stub login. Written from the sheet (« Livre », exit criterion),
// docs/parcours.md (B-91, B-93, P-22 step 3) and docs/ecrans.md (E-23 « what -edition builds »), not from the code.
// Every expected value is a literal; the neutral seed's system (-49, -48) has a lava planet at orbit 1.03, hour 0.6 (the fixtures of Éneria).
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { plagesDe } = await import('./regles/forme.js');

const GALAXIE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const TIRES: Array<[number, number]> = [[-49, -48], [-44, -47], [-44, 38], [-43, -14], [-39, -49], [-27, 12], [-17, -48], [-13, -48], [-7, -48], [-2, -49],
  [7, 18], [11, -7], [12, -34], [12, -24], [18, -47], [26, 22], [33, -2], [37, -44], [38, 3], [48, 27]];

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
const n = (app: App, sql: string, ...a: unknown[]) => (one(app, sql, ...a) as { c: number }).c;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run('kanevas-neutre-1', GALAXIE.densites.defaut, g);
  for (const z of GALAXIE.densites.zones) {
    app.db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, E, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur`;
  const lire = (who: string, q: number, r: number, suite = '') => app.inject({ method: 'GET', url: `${base}/${q}/${r}${suite}`, headers: h[who] });
  const ecrire = (who: string, method: 'POST' | 'PATCH' | 'DELETE' | 'PUT', q: number, r: number, chemin: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method, url: `${base}/${q}/${r}/${chemin}`, headers: { ...h[who], ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const systemes = () => n(app, 'SELECT COUNT(*) c FROM swn_systemes WHERE galaxie_id=?', g);
  const lignes = () => n(app, 'SELECT (SELECT COUNT(*) FROM swn_astres) + (SELECT COUNT(*) FROM swn_formations) c');
  return { app, E, g, lire, ecrire, systemes, lignes };
}
const sansJetons = (corps: string): string => {
  const { peutEcrire, versionSysteme, ...v } = JSON.parse(corps);
  return JSON.stringify({ ...v, astres: v.astres.map(({ version, ...a }: any) => a), formations: v.formations.map(({ version, ...f }: any) => f) });
};
const planete = (v: any) => v.astres.find((a: any) => a.genre === 'planete');

test('B-93 nominal : le MJ déplace une planète d\'un système tiré, le système devient défini, la planète est à sa nouvelle heure à la relecture, les voisins tirés n\'ont pas bougé', async () => {
  const w = await monde();
  const avant: Record<string, string> = {};
  for (const [q, r] of TIRES) avant[`${q},${r}`] = (await w.lire('antor', q, r)).body;
  const v0 = JSON.parse(avant['-49,-48']);
  assert.equal(v0.etat, 'tire');
  const p = planete(v0);
  assert.deepEqual([p.type, p.orbite, p.heure], ['lave', 1.03, 0.6]);

  const res = await w.ecrire('antor', 'PATCH', -49, -48, `astres/${encodeURIComponent(p.cle)}`, { orbite: 1.03, heure: 7, version: p.version, versionSysteme: v0.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  const apres = (await w.lire('antor', -49, -48)).json();
  assert.equal(apres.etat, 'defini');
  assert.deepEqual([planete(apres).orbite, planete(apres).heure], [1.03, 7]);
  assert.equal(apres.astres.length, v0.astres.length);
  assert.equal(apres.formations.length, v0.formations.length);
  // every other body is as drawn
  assert.deepEqual(apres.astres.filter((a: any) => a.cle !== p.cle).map(({ version, ...a }: any) => a), v0.astres.filter((a: any) => a.cle !== p.cle).map(({ version, ...a }: any) => a));
  assert.equal(w.systemes(), 1);
  // neighbours, and all other drawn systems: byte for byte as before
  for (const [q, r] of TIRES.slice(1)) assert.equal((await w.lire('antor', q, r)).body, avant[`${q},${r}`], `${q},${r}`);
  // the neighbours of (-49,-48) that hold a star are drawn too: -48 row neighbours of the system itself
  for (const [q, r] of [[-48, -48], [-50, -48], [-49, -47], [-48, -49], [-50, -47], [-49, -49]]) {
    const x = await w.lire('antor', q, r);
    if (x.statusCode === 200) assert.equal(x.json().etat, 'tire', `${q},${r}`);
  }
});

test('B-93 nominal : « Ancrer ce système » seul fige l\'intérieur tel que tiré, nom par défaut « Système (q, r) », sans que rien d\'autre ne change ; deux fois de suite, rien de plus', async () => {
  const w = await monde();
  const v0 = (await w.lire('antor', -49, -48)).json();
  const res = await w.ecrire('antor', 'POST', -49, -48, 'ancrage', { versionSysteme: v0.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  const v1 = res.json();
  assert.equal(v1.etat, 'defini');
  assert.equal(v1.nom, 'Système (-49, -48)');
  assert.equal(sansJetons(JSON.stringify({ ...v1, nom: null, etat: 'tire' })), sansJetons(JSON.stringify({ ...v0 })));
  const lignes = w.lignes();
  const encore = await w.ecrire('antor', 'POST', -49, -48, 'ancrage', { versionSysteme: v1.versionSysteme });
  assert.equal(encore.statusCode, 200, encore.body);
  assert.equal(w.lignes(), lignes);
  assert.equal(w.systemes(), 1);
  assert.equal((await w.lire('antor', -49, -48)).json().nom, 'Système (-49, -48)');
});

test('B-93 bord : « Ancrer ce système » avec un nom, c\'est le nom du système défini', async () => {
  const w = await monde();
  const v0 = (await w.lire('antor', -44, -47)).json();
  const res = await w.ecrire('antor', 'POST', -44, -47, 'ancrage', { nom: 'Port-Aube', versionSysteme: v0.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal((await w.lire('antor', -44, -47)).json().nom, 'Port-Aube');
});

test('B-93 échec : un refus laisse le système tiré, zéro ligne, ancrage compris', async () => {
  const w = await monde();
  const v0 = (await w.lire('antor', -49, -48)).json();
  const p = planete(v0);
  const avant = [w.systemes(), w.lignes()];
  for (const [o, h] of [[-1, 3], [2, 12], [2, -0.5], [1000.5, 3], [-0.01, 0]]) {
    const res = await w.ecrire('antor', 'PATCH', -49, -48, `astres/${encodeURIComponent(p.cle)}`, { orbite: o, heure: h, version: p.version, versionSysteme: v0.versionSysteme });
    assert.equal(res.statusCode, 400, `${o}/${h} ${res.body}`);
    assert.equal(res.json().code, 'orbite_invalide', `${o}/${h}`);
  }
  assert.deepEqual([w.systemes(), w.lignes()], avant);
  assert.equal((await w.lire('antor', -49, -48)).json().etat, 'tire');
});

test('B-93 bords : orbite 0 et 1 000, heure 0 et 11,99 sont acceptés ; orbite −1 et heure 12 refusés avec « orbite_invalide »', async () => {
  const w = await monde();
  let v = (await w.lire('antor', -49, -48)).json();
  const cle0 = planete(v).cle;
  const suivi = (x: any) => x.astres.find((a: any) => a.cle === cle0);
  for (const [o, h] of [[0, 0], [1000, 11.99], [5, 0], [5, 11.99]]) {
    const p = suivi(v);
    const res = await w.ecrire('antor', 'PATCH', -49, -48, `astres/${encodeURIComponent(p.cle)}`, { orbite: o, heure: h, version: p.version, versionSysteme: v.versionSysteme });
    assert.equal(res.statusCode, 200, `${o}/${h} ${res.body}`);
    v = res.json();
    assert.deepEqual([suivi(v).orbite, suivi(v).heure], [o, h]);
  }
  const p = suivi(v);
  for (const [o, h] of [[-1, 3], [3, 12]]) {
    const res = await w.ecrire('antor', 'PATCH', -49, -48, `astres/${encodeURIComponent(p.cle)}`, { orbite: o, heure: h, version: p.version, versionSysteme: v.versionSysteme });
    assert.equal(res.json().code, 'orbite_invalide');
  }
  const ajout = await w.ecrire('antor', 'POST', -49, -48, 'astres', { genre: 'comete', orbite: 3, heure: 12, versionSysteme: v.versionSysteme });
  assert.equal(ajout.json().code, 'orbite_invalide');
});

test('B-93 échec : un astre inconnu est « astre_inconnu » (introuvable), rien d\'écrit', async () => {
  const w = await monde();
  const v0 = (await w.lire('antor', -49, -48)).json();
  const res = await w.ecrire('antor', 'PATCH', -49, -48, 'astres/nexiste-pas', { orbite: 3, heure: 3, version: 1, versionSysteme: v0.versionSysteme });
  assert.equal(res.statusCode, 404, res.body);
  assert.equal(res.json().code, 'astre_inconnu');
  const sup = await w.ecrire('antor', 'DELETE', -49, -48, `astres/nexiste-pas?version=1&versionSysteme=${v0.versionSysteme}`);
  assert.equal(sup.statusCode, 404, sup.body);
  assert.equal(sup.json().code, 'astre_inconnu');
  assert.equal(w.systemes(), 0);
});

test('B-93 critère : deux modifications concurrentes de même version, la seconde est « a_change » (409) et n\'écrit rien ; recharger puis réessayer passe', async () => {
  const w = await monde();
  const v0 = (await w.lire('antor', -49, -48)).json();
  const p = planete(v0);
  const url = `astres/${encodeURIComponent(p.cle)}`;
  const premiere = await w.ecrire('antor', 'PATCH', -49, -48, url, { orbite: 2, heure: 2, version: p.version, versionSysteme: v0.versionSysteme });
  assert.equal(premiere.statusCode, 200, premiere.body);
  const seconde = await w.ecrire('antor', 'PATCH', -49, -48, url, { orbite: 9, heure: 9, version: p.version, versionSysteme: v0.versionSysteme });
  assert.equal(seconde.statusCode, 409, seconde.body);
  assert.equal(seconde.json().code, 'a_change');
  const v = (await w.lire('antor', -49, -48)).json();
  const sui = (x: any) => x.astres.find((a: any) => a.cle === p.cle);
  assert.deepEqual([sui(v).orbite, sui(v).heure], [2, 2]);
  const reessai = await w.ecrire('antor', 'PATCH', -49, -48, url, { orbite: 9, heure: 9, version: sui(v).version, versionSysteme: v.versionSysteme });
  assert.equal(reessai.statusCode, 200, reessai.body);
  assert.deepEqual([sui(reessai.json()).orbite, sui(reessai.json()).heure], [9, 9]);
});

test('B-93 échec : la graine change entre la lecture et l\'écriture, « a_change », aucune ligne, système toujours tiré', async () => {
  const w = await monde();
  const v0 = (await w.lire('antor', -49, -48)).json();
  const p = planete(v0);
  // the GM of another tab changes the seed through the E-21 route (the galaxy's version moves) to one that still draws a star here
  const galaxie = `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.g}`;
  const hdr = (await w.app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' }));
  const cookie = `kanevas_session=${hdr.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  let change = false;
  for (let i = 0; i < 400 && !change; i++) {
    const ver = (await w.app.inject({ method: 'GET', url: galaxie, headers: { cookie } })).json().version;
    const put = await w.app.inject({ method: 'PUT', url: `${galaxie}/graine`, headers: { cookie }, payload: { graine: `autre-${i}`, version: ver, confirme: true } });
    assert.equal(put.statusCode, 200, put.body);
    change = (await w.lire('antor', -49, -48)).statusCode === 200;
  }
  assert.ok(change, 'une graine qui tire encore une étoile à cet hexagone');
  const res = await w.ecrire('antor', 'PATCH', -49, -48, `astres/${encodeURIComponent(p.cle)}`, { orbite: 2, heure: 2, version: p.version, versionSysteme: v0.versionSysteme });
  assert.equal(res.statusCode, 409, res.body);
  assert.equal(res.json().code, 'a_change');
  const anc = await w.ecrire('antor', 'POST', -49, -48, 'ancrage', { versionSysteme: v0.versionSysteme });
  assert.equal(anc.json().code, 'a_change');
  assert.deepEqual([w.systemes(), w.lignes()], [0, 0]);
});

test('B-91 nominal : un astre posé en plan, en hexagone ou en orbite et heure du même point est stocké au même endroit', async () => {
  const w = await monde();
  let v = (await w.lire('antor', -49, -48)).json();
  const rayon = v.transition as number;
  assert.ok(rayon > 0);
  const poser = async (corps: Record<string, unknown>) => {
    const res = await w.ecrire('antor', 'POST', -49, -48, 'astres', { genre: 'comete', versionSysteme: v.versionSysteme, ...corps });
    assert.ok([200, 201].includes(res.statusCode), res.body);
    const nouv = res.json();
    const cle = nouv.astres.map((a: any) => a.cle).find((c: string) => !v.astres.some((a: any) => a.cle === c));
    v = nouv;
    const a = nouv.astres.find((x: any) => x.cle === cle);
    return [a.orbite, a.heure];
  };
  const proche = (x: number[], y: number[], msg: string) => { assert.ok(Math.abs(x[0]! - y[0]!) < 0.02 && Math.abs(x[1]! - y[1]!) < 0.02, `${msg} ${x} vs ${y}`); };
  // the point « orbit 5, hour 3 » is the plane point (5, 0)
  const oh = await poser({ orbite: 5, heure: 3 });
  assert.deepEqual(oh, [5, 3]);
  proche(await poser({ plan: { x: 5, y: 0 } }), [5, 3], 'plan (5, 0)');
  // hour 9 at orbit 4 is the plane point (−4, 0); hour 6 at orbit 4 is (0, 4) (12 at the top, 3 at the right)
  proche(await poser({ plan: { x: -4, y: 0 } }), [4, 9], 'plan (−4, 0)');
  proche(await poser({ plan: { x: 0, y: 4 } }), [4, 6], 'plan (0, 4)');
  // the centre of each of the six adjacent hexagons falls on the transition circle at the direction of the neighbour
  const voisins: Array<[number, number, number]> = [[1, 0, 3], [0, 1, 5], [-1, 1, 7], [-1, 0, 9], [0, -1, 11], [1, -1, 1]];
  for (const [dq, dr, heure] of voisins) {
    const [o, h] = await poser({ galactique: { q: -49 + dq, r: -48 + dr } });
    proche([o!, h!], [rayon, heure], `voisin ${dq},${dr}`);
  }
  // half way to the east neighbour: half the radius, same hour
  proche(await poser({ galactique: { q: -48.5, r: -48 } }), [rayon / 2, 3], 'demi-hexagone');
});

test('B-91 échec et exclusions : deux formes dans un appel, une demi-paire, un plan ou un hexagone sur une lune, le centre : refusés « invalide » avec un champ', async () => {
  const w = await monde();
  const v = (await w.lire('antor', -49, -48)).json();
  const lune = v.astres.find((a: any) => a.genre === 'lune');
  assert.ok(lune, 'le système tiré a une lune');
  const avant = [w.systemes(), w.lignes()];
  const tentatives: Array<[string, string, unknown]> = [
    ['POST', 'astres', { genre: 'comete', orbite: 4, heure: 3, plan: { x: 4, y: 0 } }],
    ['POST', 'astres', { genre: 'comete', plan: { x: 4, y: 0 }, galactique: { q: -48, r: -48 } }],
    ['POST', 'astres', { genre: 'comete', plan: { x: 4 } }],
    ['POST', 'astres', { genre: 'comete', galactique: { q: -48 } }],
    ['PATCH', `astres/${encodeURIComponent(lune.cle)}`, { plan: { x: 1, y: 1 }, version: lune.version }],
    ['PATCH', `astres/${encodeURIComponent(lune.cle)}`, { galactique: { q: -48, r: -48 }, version: lune.version }],
  ];
  for (const [m, chemin, corps] of tentatives) {
    const res = await w.ecrire('antor', m as 'POST' | 'PATCH', -49, -48, chemin, { versionSysteme: v.versionSysteme, ...(corps as object) });
    assert.equal(res.statusCode, 400, `${chemin} ${JSON.stringify(corps)} ${res.body}`);
    assert.equal(res.json().code, 'invalide', JSON.stringify(corps));
    assert.ok(typeof res.json().champ === 'string' && res.json().champ.length > 0, `champ ${JSON.stringify(corps)}`);
  }
  // a point past 1 000 is out of bounds (the centre's refusal is a hole of the sheet, see the report)
  const loin = await w.ecrire('antor', 'POST', -49, -48, 'astres', { genre: 'comete', plan: { x: 2000, y: 0 }, versionSysteme: v.versionSysteme });
  assert.equal(loin.statusCode, 400, loin.body);
  assert.equal(loin.json().code, 'orbite_invalide');
  assert.deepEqual([w.systemes(), w.lignes()], avant);
});

test('B-93 nominal : une lune suit sa planète ; retirer une planète retire ses lunes et rend leur nombre ; l\'étoile principale ne se retire pas', async () => {
  const w = await monde();
  let v = (await w.lire('antor', -49, -48)).json();
  const planetes = v.astres.filter((a: any) => a.genre === 'planete');
  const avecLunes = planetes.map((p: any) => [p, v.astres.filter((a: any) => a.genre === 'lune' && a.parent_cle === p.cle)]).find(([, l]: any) => l.length > 0);
  assert.ok(avecLunes, 'une planète tirée a des lunes');
  const [p, lunes] = avecLunes;
  const lunesAvant = lunes.map((l: any) => [l.orbite, l.heure]);
  const dep = await w.ecrire('antor', 'PATCH', -49, -48, `astres/${encodeURIComponent(p.cle)}`, { orbite: 7, heure: 5, version: p.version, versionSysteme: v.versionSysteme });
  assert.equal(dep.statusCode, 200, dep.body);
  v = dep.json();
  assert.deepEqual(v.astres.filter((a: any) => a.genre === 'lune' && a.parent_cle === p.cle).map((l: any) => [l.orbite, l.heure]), lunesAvant);

  const etoile = v.astres.find((a: any) => a.genre === 'etoile');
  const non = await w.ecrire('antor', 'DELETE', -49, -48, `astres/${encodeURIComponent(etoile.cle)}?version=${etoile.version}&versionSysteme=${v.versionSysteme}`);
  assert.equal(non.statusCode, 403, non.body);
  assert.equal(non.json().code, 'etoile_principale');
  assert.equal((await w.lire('antor', -49, -48)).json().astres.length, v.astres.length);

  const pp = planete(v) && v.astres.find((a: any) => a.cle === p.cle);
  const total = v.astres.length;
  const sup = await w.ecrire('antor', 'DELETE', -49, -48, `astres/${encodeURIComponent(pp.cle)}?version=${pp.version}&versionSysteme=${v.versionSysteme}`);
  assert.equal(sup.statusCode, 200, sup.body);
  const apres = sup.json();
  assert.equal(apres.astres.length, total - 1 - lunes.length);
  assert.ok(!apres.astres.some((a: any) => a.cle === p.cle || a.parent_cle === p.cle));
  assert.equal((await w.lire('antor', -49, -48)).body, JSON.stringify(apres));
});

test('B-93 nominal : ajouter un astre, ajouter une zone, modifier nom, description et taille, retirer la zone ; le MJ relit ce qu\'il a écrit', async () => {
  const w = await monde();
  let v = (await w.lire('antor', -49, -48)).json();
  const etat = async (res: any) => { assert.ok([200, 201].includes(res.statusCode), res.body); v = res.json(); assert.equal(v.etat, 'defini'); return v; };
  const nb = v.astres.length;
  await etat(await w.ecrire('antor', 'POST', -49, -48, 'astres', { genre: 'comete', nom: 'Vagabonde', orbite: 6, heure: 2.5, versionSysteme: v.versionSysteme }));
  assert.equal(v.astres.length, nb + 1);
  const c = v.astres.find((a: any) => a.nom === 'Vagabonde');
  assert.deepEqual([c.genre, c.orbite, c.heure], ['comete', 6, 2.5]);
  await etat(await w.ecrire('antor', 'PATCH', -49, -48, `astres/${encodeURIComponent(c.cle)}`, { nom: 'Errante', description: 'Passe tous les sept ans.', taille: 0.5, version: c.version, versionSysteme: v.versionSysteme }));
  const c2 = v.astres.find((a: any) => a.cle === c.cle);
  assert.deepEqual([c2.nom, c2.description, c2.taille], ['Errante', 'Passe tous les sept ans.', 0.5]);
  assert.ok(c2.version > c.version);
  const nz = v.formations.length;
  await etat(await w.ecrire('antor', 'POST', -49, -48, 'zones', { forme: 'anneau', nom: 'Halo', parametres: { de: 14, a: 15 }, versionSysteme: v.versionSysteme }));
  assert.equal(v.formations.length, nz + 1);
  const z = v.formations.find((f: any) => f.nom === 'Halo');
  assert.equal(z.forme, 'anneau');
  await etat(await w.ecrire('antor', 'DELETE', -49, -48, `zones/${encodeURIComponent(z.cle)}?version=${z.version}&versionSysteme=${v.versionSysteme}`));
  assert.equal(v.formations.length, nz);
  assert.equal((await w.lire('antor', -49, -48)).body, JSON.stringify(v));
});

test('B-93 bords et échec : une zone en anneau « de » ≥ « a » ou « de » négatif, une taille nulle ou de plus de 100, un nom de 81 caractères, une description de 2 001 : « invalide » avec champ, rien d\'écrit', async () => {
  const w = await monde();
  const v = (await w.lire('antor', -49, -48)).json();
  const p = planete(v);
  const avant = [w.systemes(), w.lignes()];
  const refus: Array<[string, string, Record<string, unknown>]> = [
    ['POST', 'zones', { forme: 'anneau', parametres: { de: 5, a: 5 } }],
    ['POST', 'zones', { forme: 'anneau', parametres: { de: 6, a: 5 } }],
    ['POST', 'zones', { forme: 'anneau', parametres: { de: -1, a: 5 } }],
    ['PATCH', `astres/${encodeURIComponent(p.cle)}`, { taille: 0, version: p.version }],
    ['PATCH', `astres/${encodeURIComponent(p.cle)}`, { taille: 100.5, version: p.version }],
    ['PATCH', `astres/${encodeURIComponent(p.cle)}`, { nom: 'x'.repeat(81), version: p.version }],
    ['PATCH', `astres/${encodeURIComponent(p.cle)}`, { description: 'x'.repeat(2001), version: p.version }],
    ['PATCH', `astres/${encodeURIComponent(p.cle)}`, { type: 'type-inconnu', version: p.version }],
  ];
  for (const [m, chemin, corps] of refus) {
    const res = await w.ecrire('antor', m as 'POST' | 'PATCH', -49, -48, chemin, { versionSysteme: v.versionSysteme, ...corps });
    assert.equal(res.statusCode, 400, `${chemin} ${JSON.stringify(corps)} ${res.body}`);
    assert.equal(res.json().code, 'invalide');
    assert.ok(res.json().champ, JSON.stringify(corps));
  }
  assert.deepEqual([w.systemes(), w.lignes()], avant);
  // the bounds themselves are accepted
  const ok = await w.ecrire('antor', 'PATCH', -49, -48, `astres/${encodeURIComponent(p.cle)}`, { taille: 100, nom: 'x'.repeat(80), description: 'y'.repeat(2000), version: p.version, versionSysteme: v.versionSysteme });
  assert.equal(ok.statusCode, 200, ok.body);
});

test('B-93 nominal : le rayon de transition se pose, se relit, et « null » revient au défaut du système ; 1 001 est refusé', async () => {
  const w = await monde();
  let v = (await w.lire('antor', -49, -48)).json();
  const defaut = v.transition as number;
  const res = await w.ecrire('antor', 'PUT', -49, -48, 'transition', { transition: 40, versionSysteme: v.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  v = res.json();
  assert.equal(v.etat, 'defini');
  assert.equal(v.transition, 40);
  assert.equal((await w.lire('antor', -49, -48)).json().transition, 40);
  const trop = await w.ecrire('antor', 'PUT', -49, -48, 'transition', { transition: 1001, versionSysteme: v.versionSysteme });
  assert.equal(trop.statusCode, 400, trop.body);
  assert.equal((await w.lire('antor', -49, -48)).json().transition, 40);
  const nul = await w.ecrire('antor', 'PUT', -49, -48, 'transition', { transition: null, versionSysteme: v.versionSysteme });
  assert.equal(nul.statusCode, 200, nul.body);
  assert.equal(nul.json().transition, defaut);
  for (const bord of [0, 1000]) {
    const r = await w.ecrire('antor', 'PUT', -49, -48, 'transition', { transition: bord, versionSysteme: (await w.lire('antor', -49, -48)).json().versionSysteme });
    assert.equal(r.statusCode, 200, `${bord} ${r.body}`);
  }
  assert.equal((await w.ecrire('antor', 'PUT', -49, -48, 'transition', { transition: -1, versionSysteme: (await w.lire('antor', -49, -48)).json().versionSysteme })).statusCode, 400);
});

test('B-93 sur un système tiré, le rayon de transition ancre aussi, avec le même tirage : les voisins ne bougent pas', async () => {
  const w = await monde();
  const avant: Record<string, string> = {};
  for (const [q, r] of TIRES) avant[`${q},${r}`] = (await w.lire('antor', q, r)).body;
  const v = JSON.parse(avant['-13,-48']);
  const res = await w.ecrire('antor', 'PUT', -13, -48, 'transition', { transition: 30, versionSysteme: v.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().etat, 'defini');
  for (const [q, r] of TIRES) if (q !== -13) assert.equal((await w.lire('antor', q, r)).body, avant[`${q},${r}`], `${q},${r}`);
});

test('B-93 exclusion : la joueuse et le MJ en mode joueur ne lisent ni jetons ni « peutEcrire », et chaque route d\'écriture leur répond « refuse » sans rien écrire', async () => {
  const w = await monde();
  const mj = (await w.lire('antor', -49, -48)).json();
  assert.equal(mj.peutEcrire, true);
  const p = planete(mj);
  const lea = await w.lire('lea', -49, -48);
  const joueur = await w.lire('antor', -49, -48, '?mode=joueur');
  for (const x of [lea, joueur]) {
    const v = x.json();
    assert.ok(!('peutEcrire' in v) || v.peutEcrire !== true);
    assert.ok(!('versionSysteme' in v));
    assert.ok(v.astres.every((a: any) => !('version' in a)));
  }
  const cle = encodeURIComponent(p.cle);
  const jeton = mj.versionSysteme;
  const routes: Array<['POST' | 'PATCH' | 'DELETE' | 'PUT', string, unknown]> = [
    ['POST', 'ancrage', { versionSysteme: jeton }],
    ['POST', 'astres', { genre: 'comete', orbite: 3, heure: 3, versionSysteme: jeton }],
    ['PATCH', `astres/${cle}`, { orbite: 3, heure: 3, version: 1, versionSysteme: jeton }],
    ['DELETE', `astres/${cle}?version=1&versionSysteme=${jeton}`, undefined],
    ['POST', 'zones', { forme: 'anneau', parametres: { de: 14, a: 15 }, versionSysteme: jeton }],
    ['PATCH', 'zones/z', { nom: 'x', version: 1, versionSysteme: jeton }],
    ['DELETE', `zones/z?version=1&versionSysteme=${jeton}`, undefined],
    ['PUT', 'transition', { transition: 5, versionSysteme: jeton }],
  ];
  for (const [m, chemin, corps] of routes) {
    for (const [who, suite] of [['lea', ''], ['antor', '?mode=joueur']] as const) {
      const url = suite ? (chemin.includes('?') ? `${chemin}&mode=joueur` : `${chemin}?mode=joueur`) : chemin;
      const res = await w.ecrire(who, m, -49, -48, url, corps);
      assert.equal(res.statusCode, 403, `${who}${suite} ${m} ${chemin} ${res.body}`);
    }
  }
  assert.deepEqual([w.systemes(), w.lignes()], [0, 0]);
  assert.equal((await w.lire('antor', -49, -48)).json().etat, 'tire');
});

test('B-93 exclusion : un en-tête Authorization ne donne aucun droit d\'écriture à la joueuse', async () => {
  const w = await monde();
  const mj = (await w.lire('antor', -49, -48)).json();
  const res = await w.ecrire('lea', 'POST', -49, -48, 'ancrage', { versionSysteme: mj.versionSysteme }, { authorization: 'Bearer n-importe-quoi' });
  assert.equal(res.statusCode, 403, res.body);
  assert.equal(w.systemes(), 0);
});

test('B-93 exclusion : un système défini secret est « introuvable » en écriture pour la joueuse, dans le même corps que la lecture', async () => {
  const w = await monde();
  w.app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',1,0)")
    .run(w.g, w.E, 'cache', 'Caché', 40, 41);
  const lecture = await w.lire('lea', 40, 41);
  assert.equal(lecture.statusCode, 404);
  const res = await w.ecrire('lea', 'POST', 40, 41, 'ancrage', { versionSysteme: 1 });
  assert.equal(res.statusCode, 404, res.body);
  assert.equal(res.body, lecture.body);
});

test('B-93 exclusion : aucun secret de corps (AD-150) ; hexagone sans étoile ou coordonnées non entières : « introuvable »', async () => {
  const w = await monde();
  const mj = (await w.lire('antor', -49, -48)).json();
  for (const a of [...mj.astres, ...mj.formations]) assert.ok(!('secret' in a));
  assert.ok(!('secret' in mj));
  const cookie = (await connecter(w.app, 'antor')).cookie;
  // an empty hexagon, and « q » or « r » that are not integers but start like those of a drawn system
  for (const [q, r] of [['1', '1'], ['abc', '2'], ['-49.7', '-48'], ['-49', '-48abc'], ['-49', '']] as const) {
    const res = await w.app.inject({ method: 'POST', url: `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.g}/interieur/${q}/${r}/ancrage`,
      headers: { cookie }, payload: { versionSysteme: 1 } });
    assert.equal(res.statusCode, 404, `${q}/${r} ${res.body}`);
  }
  assert.equal(w.systemes(), 0);
});
