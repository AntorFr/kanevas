import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-outils-format-zones-serveur (B-84, Z-1 to Z-8): a zone that is a set of hexagons, by the import API.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerGalaxie, rendreVisibleGalaxie } = await import('../services/swn/galaxies.js');
const { poserDocumentMJ } = await import('../services/swn/document.js');
const { migrate, openDb } = await import('../db/db.js');

const G = 'swn/galaxie';
const dist = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

/** Invented set: a disc with a hole (ring), an island in the hole and a notch on the edge; exactly 800 hexagons. */
function anneau(): [number, number][] {
  const s: [number, number][] = [];
  for (let r = -17; r <= 17; r++) for (let q = -17; q <= 17; q++) {
    if (dist(q, r) > 17) continue;
    if (dist(q, r) <= 4 && dist(q, r) >= 2) continue; // hole around the island at the centre
    if (dist(q - 17, r + 8) <= 3) continue; // notch
    s.push([q, r]);
  }
  return s.slice(0, 800);
}
const cle = (h: [number, number][]) => h.map(([q, r]) => `${q},${r}`).sort().join(' ');
const developpe = (plages: [number, number, number][]) => plages.flatMap(([r, a, b]) => Array.from({ length: b - a + 1 }, (_, i) => `${a + i},${r}`)).sort().join(' ');

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g0 = creerGalaxie(app.db, id('antor'), E, { titre: 'Galaxie des zones' });
  const gal = g0.id;
  rendreVisibleGalaxie(app.db, id('antor'), E, gal, true, 1);
  const t = creerJeton(app.db, id('antor'), E, { nom: 'T', dureeJours: 30, outils: [G] }, app.horloge()).valeur;
  const put = (corps: unknown, lot?: number) => app.inject({ method: 'PUT', url: `/api/import/v1/univers/${E}/outils/swn/galaxie/galaxies/${gal}${lot ? `?lot=${lot}` : ''}`,
    headers: { authorization: `Bearer ${t}` }, payload: corps as any });
  const ouvrir = async () => (await app.inject({ method: 'POST', url: `/api/import/v1/univers/${E}/lots?outil=${G}`, headers: { authorization: `Bearer ${t}` } })).json().lotId as number;
  const session = async (compte: string) => {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
    return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
  };
  const lire = async (compte: string, de = '-4,-4', a = '4,4') =>
    (await app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${gal}/blocs?de=${de}&a=${a}`, headers: await session(compte) }));
  return { app, id, E, gal, put, ouvrir, lire, un, t };
}
const zone = (c: string, hexagones: unknown, extra: object = {}) => ({ cle: c, nom: `Zone ${c}`, contour: { hexagones }, ...extra });

test('800 hexagones : créée, rejeu inchangé sans version montée, lecture = exactement l\'ensemble, un hexagone changé = mise à jour', async () => {
  const w = await monde();
  const avantSemis = w.un('SELECT COUNT(*) n FROM swn_zones').n;
  const h = anneau();
  assert.equal(h.length, 800);
  assert.equal(new Set(cle(h).split(' ')).size, 800);
  const r = await w.put({ systemes: [], routes: [], zones: [zone('anneau', h)] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().natures.zones.creees, 1);
  assert.equal(w.un('SELECT COUNT(*) n FROM swn_zones').n, avantSemis + 1);
  const ligne = w.un("SELECT * FROM swn_zones WHERE cle = 'anneau'");
  assert.equal(ligne.contour, '[]');
  assert.ok(ligne.plages);

  const vue = (await w.lire('antor', '-4,-4', '4,4')).json().zones.find((z: any) => z.nom === 'Zone anneau');
  assert.deepEqual(vue.contour, []);
  assert.equal(vue.hexagones, 800);
  assert.equal(developpe(vue.plages), cle(h)); // ni plus ni moins

  // replay in another order, with duplicates: same set, nothing to do
  const melange = [...h].reverse().concat([h[3]!, h[10]!]);
  const r2 = await w.put({ systemes: [], routes: [], zones: [zone('anneau', melange)] });
  assert.equal(r2.json().natures.zones.inchangees, 1, r2.body);
  assert.equal(w.un("SELECT version FROM swn_zones WHERE cle = 'anneau'").version, 1);

  // one hexagon moved (the island's one goes to a free cell far away)
  const change = h.filter((p) => !(p[0] === 0 && p[1] === 0)).concat([[40, 40]]);
  const r3 = await w.put({ systemes: [], routes: [], zones: [zone('anneau', change)] });
  assert.equal(r3.json().natures.zones.mises_a_jour, 1, r3.body);
  const lu = (await w.lire('antor', '-4,-4', '7,7')).json().zones.find((z: any) => z.nom === 'Zone anneau');
  assert.equal(developpe(lu.plages), cle(change));
  assert.equal(lu.hexagones, 800);
});

test('un hexagone mal formé et 5 001 hexagones : refusés avec champ contour, le reste du lot passe ; 5 000 passent', async () => {
  const w = await monde();
  const lot = await w.ouvrir();
  const trop = Array.from({ length: 5001 }, (_, i) => [i % 100, Math.floor(i / 100)]);
  const pile = trop.slice(0, 5000);
  const r = await w.put({ systemes: [], routes: [], zones: [
    zone('bon', [[0, 0], [1, 0]]),
    zone('mal', [[0, 0], [1.5, 0]]),
    zone('mal2', [[0, 0], [1]]),
    zone('vide', []),
    zone('trop', trop),
    zone('pile', pile),
  ] }, lot);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual([r.json().natures.zones.creees, r.json().natures.zones.refusees], [2, 4]);
  assert.deepEqual(r.json().refus.map((x: any) => x.champ), ['zones[1].contour', 'zones[2].contour', 'zones[3].contour', 'zones[4].contour']);
  assert.deepEqual(w.app.db.prepare('SELECT cle FROM swn_zones WHERE galaxie_id = ? ORDER BY cle').all(w.gal).map((x: any) => x.cle), ['bon', 'pile']);
});

test('lecture d\'une zone de 5 000 hexagones par l\'API en moins d\'une seconde', async () => {
  const w = await monde();
  const h: [number, number][] = [];
  for (let r = 0; r < 50; r++) for (let q = 0; q < 100; q++) h.push([q, r]);
  assert.equal((await w.put({ systemes: [], routes: [], zones: [zone('grande', h)] })).statusCode, 200);
  const session = await (async () => { const res = await w.app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' }); return { cookie: `kanevas_session=${res.cookies[0]!.value}` }; })();
  const debut = performance.now();
  const res = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.gal}/blocs?de=0,0&a=11,9`, headers: session });
  const ms = performance.now() - debut;
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().zones.find((z: any) => z.nom === 'Zone grande').hexagones, 5000);
  assert.ok(ms < 1000, `${ms} ms`);
});

test('50 000 hexagones par requête passent, 50 001 : invalide pour toute la requête', async () => {
  const w = await monde();
  const zones = (n: number) => Array.from({ length: Math.ceil(n / 5000) }, (_, k) => zone(`z${k}`,
    Array.from({ length: Math.min(5000, n - k * 5000) }, (_, i) => [i, k])));
  const trop = await w.put({ systemes: [], routes: [], zones: zones(50001) });
  assert.equal(trop.statusCode, 400, trop.body);
  assert.equal(w.un('SELECT COUNT(*) n FROM swn_zones WHERE galaxie_id = ?', w.gal).n, 0);
  const ok = await w.put({ systemes: [], routes: [], zones: zones(50000) });
  assert.equal(ok.statusCode, 200, ok.body.slice(0, 300));
  assert.equal(ok.json().natures.zones.creees, 10);
});

test('zone privée : absente pour Léa, présente pour Antor ; le bloc dessous est identique pour Léa avec et sans la zone', async () => {
  const w = await monde();
  const avantLea = (await w.lire('lea', '-4,-4', '4,4')).json();
  const avantAntor = (await w.lire('antor', '-4,-4', '4,4')).json();
  const h = anneau();
  const r = await w.put({ systemes: [], routes: [], zones: [zone('cachee', h, { secret: true, densite: 1 })] });
  assert.equal(r.statusCode, 200, r.body);
  const lea = await w.lire('lea', '-4,-4', '4,4');
  const antor = (await w.lire('antor', '-4,-4', '4,4')).json();
  assert.equal(lea.body.includes('Zone cachee'), false);
  assert.equal(lea.body.includes('plages'), false);
  assert.deepEqual(lea.json(), avantLea); // blocks, systems, zones: nothing moved for a player
  assert.ok(antor.zones.some((z: any) => z.nom === 'Zone cachee' && z.hexagones === 800));
  assert.notDeepEqual(antor.blocs, avantAntor.blocs, 'la densité de la zone agit pour le MJ');
});

test('le document MJ dit « 800 hexagones » ; un polygone reste octet pour octet', async () => {
  const w = await monde();
  await w.put({ systemes: [], routes: [], zones: [zone('anneau', anneau()), { cle: 'tri', nom: 'Triangle', contour: [[0, 0], [5, 0], [0, 5]] }] });
  const antor = w.id('antor');
  const r = poserDocumentMJ(w.app.db, { compteId: antor, modeJoueur: false }, w.E, w.gal, { creer: { titre: 'Notes MJ' } }, w.un('SELECT version FROM swn_galaxies WHERE id = ?', w.gal).version);
  const texte = w.un('SELECT contenu FROM sections WHERE id = ?', r.sectionId).contenu as string;
  assert.ok(texte.includes('- Zone anneau · 800 hexagones · densité automatique\n') || texte.includes('- Zone anneau · 800 hexagones · densité automatique'), texte);
  assert.ok(texte.includes('- Triangle · densité automatique'), texte);
});

test('0029 : montée depuis 0028 avec une zone polygone, rien ne bouge, plages nulle, foreign_key_check vide', async () => {
  const { copyFileSync, mkdirSync, mkdtempSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const SRC = new URL('../db/migrations/', import.meta.url).pathname;
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 28) copyFileSync(SRC + f, dir + f);
  const db = openDb(':memory:');
  migrate(db, dir);
  const d = '2026-10-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', ?)").run(d);
  db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, visible, graine, densite_defaut, version) VALUES (1, 1, 'G', 0, 'abc', 0.2, 1)").run();
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, secret) VALUES (1, 1, 'z', 'Z', '[[0,0],[1,0],[0,1]]', 'accent', 0)").run();
  const avant = db.prepare('SELECT * FROM swn_zones').all() as any[];
  const comptesAvant = db.prepare('SELECT (SELECT COUNT(*) FROM swn_zones) z, (SELECT COUNT(*) FROM swn_galaxies) g').get();
  assert.deepEqual(migrate(db), [29, 30, 31]);
  const apres = db.prepare('SELECT * FROM swn_zones').all() as any[];
  const { plages, ...reste } = apres[0];
  assert.equal(plages, null);
  assert.deepEqual(reste, avant[0]);
  assert.deepEqual(db.prepare('SELECT (SELECT COUNT(*) FROM swn_zones) z, (SELECT COUNT(*) FROM swn_galaxies) g').get(), comptesAvant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  // a polygon zone after the migration is still read as a polygon
  assert.equal(db.prepare('SELECT contour FROM swn_zones').get().contour, '[[0,0],[1,0],[0,1]]');
});
