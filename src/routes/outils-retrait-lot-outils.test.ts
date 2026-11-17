// Doors of the lot « outils » for `src/e2e/outils-retrait-ensemble-besoin.test.ts` (docs/tests-ecran/lot-outils.md): what disabling,
// summarising and erasing a tool's data changes, on the starting world of the trial universe « Éneria d'essai » (in-process, no browser).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

async function monde() {
  const m = await monter({ semis: true });
  const db = m.app.db;
  const un = (sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as Any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const V = un('SELECT id FROM univers WHERE nom = ?', 'Univers voisin').id as number;
  const S = un('SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const tables = (motif: string) => (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ? ESCAPE '\\' ORDER BY name`).all(motif) as { name: string }[]).map((t) => t.name);
  const toutes = () => tables('swn\\_%').map((t) => `${t}=${JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())}`).join('\n');
  const dUnivers = (u: number) => {
    const r: Record<string, number> = {};
    for (const t of tables('swn\\_%')) {
      if ((db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === 'univers_id'))
        r[t] = (un(`SELECT COUNT(*) n FROM ${t} WHERE univers_id = ?`, u)).n;
    }
    return r;
  };
  const conceptions = (u: number) =>
    (db.prepare('SELECT f.titre t FROM swn_conceptions c JOIN fiches f ON f.id = c.fiche_id WHERE c.univers_id = ? ORDER BY f.titre').all(u) as { t: string }[]).map((r) => r.t);
  const catalogueSysteme = () => {
    let n = 0;
    for (const t of tables('swn\\_catalogue\\_%').filter((x) => x !== 'swn_catalogue_retraits'))
      n += (un(`SELECT COUNT(*) n FROM ${t} WHERE systeme_id = ? AND univers_id IS NULL`, S)).n;
    return n;
  };
  const resume = (niveau: 'univers' | 'systemes', id: number, outil = 'vaisseaux', suite = '') => `/api/${niveau}/${id}/outils/swn/${outil}/suppression${suite}`;
  const vu = async (h: Any, niveau: 'univers' | 'systemes', id: number, outil = 'vaisseaux') =>
    (await m.dire(h, 'GET', resume(niveau, id, outil))).corps.efface as { cle: string; nombre: number }[];
  const actif = async (u: number) =>
    ((await m.dire(m.antor, 'GET', `/api/univers/${u}/outils`)).corps.outils as Any[]).find((o) => o.cle === 'swn/vaisseaux').effectif.active as boolean;
  return { ...m, db, E, V, S, toutes, dUnivers, conceptions, catalogueSysteme, resume, vu, actif };
}

const ORAK = ["Vent d'Orak", 'Étoile du soir'].sort();

test('B-63: disabling then re-enabling the designer erases no swn_* row, keeps the same designs, and the summary still counts them while disabled', async () => {
  const w = await monde();
  const avant = w.toutes();
  assert.deepEqual(w.conceptions(w.E), ORAK);
  assert.equal((await w.dire(w.antor, 'PUT', `/api/univers/${w.E}/outils/swn/vaisseaux/activation`, { active: false })).status, 204);
  assert.equal(await w.actif(w.E), false);
  assert.equal(w.toutes(), avant, 'disabled: every swn_* row is identical');
  assert.deepEqual((await w.vu(w.antor, 'univers', w.E)).map((l) => [l.cle, l.nombre]), [['conceptions', 2], ['catalogue', 2]]);
  assert.equal((await w.dire(w.antor, 'PUT', `/api/univers/${w.E}/outils/swn/vaisseaux/activation`, { active: true })).status, 204);
  assert.equal(await w.actif(w.E), true);
  assert.equal(w.toutes(), avant, 're-enabled: every swn_* row is identical');
  assert.deepEqual(w.conceptions(w.E), ORAK);
});

test('E-20: only tools with data answer the summary (unknown tool, tool without data: 404)', async () => {
  const w = await monde();
  assert.equal((await w.dire(w.antor, 'GET', w.resume('univers', w.E, 'inconnu'))).status, 404);
  assert.equal((await w.dire(w.antor, 'GET', `/api/univers/${w.E}/outils/essai/a/suppression`)).status, 404);
  assert.equal((await w.dire(w.antor, 'GET', w.resume('univers', w.E, 'galaxie'))).status, 200);
  assert.equal((await w.dire(w.antor, 'GET', w.resume('systemes', w.S, 'galaxie'))).status, 404, 'the galaxy has no system-level data');
});

test('E-20: the system switch turns the tool off for « Éneria d’essai » only, « Univers voisin » (forced) keeps it, nothing is erased', async () => {
  const w = await monde();
  const avant = w.toutes();
  assert.equal((await w.dire(w.antor, 'PUT', `/api/systemes/${w.S}/outils/swn/vaisseaux/activation`, { active: false })).status, 204);
  assert.equal(await w.actif(w.E), false);
  assert.equal(await w.actif(w.V), true);
  assert.equal(w.toutes(), avant);
});

test('E-20: universe erase counts 2 designs and 2 local elements; the vu read erases them; the other universe, the system catalogue, the galaxy and the sheets stay', async () => {
  const w = await monde();
  const vuLu = await w.vu(w.antor, 'univers', w.E);
  assert.deepEqual(vuLu.map((l) => [l.cle, l.nombre]), [['conceptions', 2], ['catalogue', 2]]);
  const galaxie = w.dUnivers(w.E);
  const r = await w.dire(w.antor, 'POST', w.resume('univers', w.E), { vu: vuLu });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.deepEqual(w.conceptions(w.E), []);
  const apres = w.dUnivers(w.E);
  assert.ok(Object.values(apres).reduce((a, b) => a + b, 0) > 0, 'the galaxy is another tool: it stays');
  assert.equal(apres.swn_galaxies, galaxie.swn_galaxies);
  assert.deepEqual(w.conceptions(w.V), ['Sentinelle du voisin']);
  assert.equal(w.catalogueSysteme(), 18);
  const fiches = (w.db.prepare("SELECT titre FROM fiches WHERE univers_id = ? AND type = 'vaisseau'").all(w.E) as { titre: string }[]).map((f) => f.titre);
  assert.ok(fiches.includes("Vent d'Orak") && fiches.includes('Étoile du soir'));
  assert.deepEqual(await w.vu(w.antor, 'univers', w.E), [], 'afterwards there is nothing left to erase');
  assert.equal(await w.actif(w.E), true, 'the activation is untouched');
});

test('E-20: a single design is counted alone, with no line at zero', async () => {
  const w = await monde();
  assert.deepEqual((await w.vu(w.antor, 'univers', w.V)).map((l) => [l.cle, l.nombre]), [['conceptions', 1]]);
});

test('E-20: system erase counts the 18 catalogue elements, names the universes still using it, and erases the system catalogue only', async () => {
  const w = await monde();
  assert.equal((await w.dire(w.antor, 'PUT', `/api/systemes/${w.S}/outils/swn/vaisseaux/activation`, { active: false })).status, 204);
  const lu = await w.dire(w.antor, 'GET', w.resume('systemes', w.S));
  assert.equal(lu.status, 200);
  assert.deepEqual((lu.corps.efface as Any[]).map((l) => [l.cle, l.nombre]), [['catalogue', 18]]);
  const texte = JSON.stringify(lu.corps);
  assert.ok(texte.includes('Univers voisin'), texte);
  assert.ok(!texte.includes("Éneria d'essai"), texte);
  const r = await w.dire(w.antor, 'POST', w.resume('systemes', w.S), { vu: lu.corps.efface });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.equal(w.catalogueSysteme(), 0);
  assert.deepEqual(w.conceptions(w.E), ORAK);
  assert.deepEqual(w.conceptions(w.V), ['Sentinelle du voisin']);
  assert.equal((w.db.prepare('SELECT COUNT(*) n FROM swn_catalogue_armes WHERE univers_id = ?').get(w.E) as Any).n, 1, 'a universe’s own element stays');
});

test('E-20: galaxy erase counts and erases 4 systems, 3 routes and 1 zone, leaves the designs, and removes the galaxy from the maps', async () => {
  const w = await monde();
  const lu = await w.dire(w.antor, 'GET', w.resume('univers', w.E, 'galaxie'));
  assert.equal(lu.status, 200);
  const nombres = Object.fromEntries((lu.corps.efface as Any[]).map((l) => [l.cle, l.nombre]));
  assert.deepEqual([nombres.systemes, nombres.routes, nombres.zones], [4, 3, 1], JSON.stringify(lu.corps));
  assert.equal((await w.dire(w.antor, 'POST', w.resume('univers', w.E, 'galaxie'), { vu: lu.corps.efface })).status, 200);
  const l = w.dUnivers(w.E);
  assert.deepEqual([l.swn_galaxies, l.swn_systemes, l.swn_routes, l.swn_zones], [0, 0, 0, 0]);
  assert.deepEqual(w.conceptions(w.E), ORAK);
  const cartes = await w.dire(w.antor, 'GET', `/api/univers/${w.E}/cartes`);
  assert.ok(!JSON.stringify(cartes.corps).includes("Galaxie d'essai"));
});

test('E-20: a GM who is not responsible of the system gets 403 without detail and nothing is erased, and has the summary on her own universe; a player gets 404 « Page introuvable. »; the GM in player mode 403', async () => {
  const w = await monde();
  const avant = w.toutes();
  const get = await w.dire(w.mira, 'GET', w.resume('systemes', w.S));
  assert.equal(get.status, 403);
  assert.ok(!JSON.stringify(get.corps).includes('Univers voisin') && !JSON.stringify(get.corps).includes('18'));
  assert.equal((await w.dire(w.mira, 'POST', w.resume('systemes', w.S), { vu: [{ cle: 'catalogue', nombre: 18 }] })).status, 403);
  assert.equal((await w.dire(w.mira, 'GET', w.resume('univers', w.E))).status, 200);
  for (const [niveau, id] of [['univers', w.E], ['systemes', w.S]] as const) {
    const g = await w.dire(w.lea, 'GET', w.resume(niveau, id));
    assert.equal(g.status, 404, niveau);
    assert.ok(JSON.stringify(g.corps).includes('Page introuvable.'));
    assert.equal((await w.dire(w.lea, 'POST', w.resume(niveau, id), { vu: [] })).status, 404, niveau);
  }
  assert.equal((await w.dire(w.antor, 'GET', w.resume('univers', w.E, 'vaisseaux', '?mode=joueur'))).status, 403);
  assert.equal((await w.dire(w.antor, 'POST', w.resume('univers', w.E, 'vaisseaux', '?mode=joueur'), { vu: [{ cle: 'conceptions', nombre: 2 }, { cle: 'catalogue', nombre: 2 }] })).status, 403);
  assert.equal((await w.dire(w.teo, 'GET', w.resume('univers', w.E))).status, 404);
  assert.equal(w.toutes(), avant);
});

test('E-20: a design added after the count was read makes the erase 409 and erases nothing; the fresh count (3) then erases', async () => {
  const w = await monde();
  const vuLu = await w.vu(w.antor, 'univers', w.E);
  const f = await w.dire(w.mira, 'POST', `/api/univers/${w.E}/fiches`, { type: 'vaisseau', titre: 'Nouveau' });
  assert.equal(f.status, 201, JSON.stringify(f.corps));
  assert.equal((await w.dire(w.mira, 'POST', `/api/univers/${w.E}/outils/swn/vaisseaux/conceptions`, { ficheId: f.corps.id, coque: 'fregate' })).status, 201);
  const avant = w.toutes();
  const refus = await w.dire(w.antor, 'POST', w.resume('univers', w.E), { vu: vuLu });
  assert.equal(refus.status, 409);
  assert.equal(w.toutes(), avant, 'nothing erased');
  const frais = await w.vu(w.antor, 'univers', w.E);
  assert.deepEqual(frais.map((l) => [l.cle, l.nombre]), [['conceptions', 3], ['catalogue', 2]]);
  assert.equal(w.conceptions(w.E).length, 3, 'reading again erases nothing');
  assert.equal((await w.dire(w.antor, 'POST', w.resume('univers', w.E), { vu: frais })).status, 200);
  assert.equal(w.conceptions(w.E).length, 0);
});
