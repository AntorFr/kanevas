import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-etoiles-galaxie: the service serves the core's stars (the fixtures of
// Éneria's generator on the neutral seed), non-promoted defined systems empty their seven hexagons, promoted ones
// change nothing, the exclusion is the same for every reader, the cache never serves a stale exclusion.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { lireBlocsGeneres, viderCacheBlocs } = await import('./cache-blocs.js');
const { lireBlocs } = await import('./lecture-carte.js');
const { placerSysteme } = await import('./ecriture-carte.js');
const { plagesDe } = await import('../../outils/swn/regles/forme.js');

const F = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));

/** The bouchon's galaxy, emptied of its own systems/routes/zones and re-set on the fixtures' seed, zones and defined systems. */
function monde(opts: { secret?: Set<string> } = {}) {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  const a = (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur });
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run(F.graine, F.densites.defaut, g);
  for (const z of F.densites.zones) {
    db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, univers, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const poser = (q_: number, r: number, promu: boolean, secret = false) => db.prepare(
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,?)")
    .run(g, univers, `s${q_}_${r}`, `S ${q_} ${r}`, q_, r, secret ? 1 : 0, promu ? 1 : 0);
  for (const s of F.systemes_definis) poser(s.q, s.r, s.promu, opts.secret?.has(`${s.q},${s.r}`) ?? false);
  return { db, q, univers, g, a, poser };
}
type W = ReturnType<typeof monde>;

/** Every block of the fixtures read through the service (rectangles of ten blocks, the limit is twelve). */
function lireTout(w: W, who: ReturnType<W['a']>) {
  const out = new Map<string, [number, number][]>();
  for (const bx0 of [-10, 0]) for (const by0 of [-10, 0]) {
    for (const b of lireBlocsGeneres(w.db, who, w.univers, w.g, { bx: bx0, by: by0 }, { bx: bx0 + 9, by: by0 + 9 })) {
      out.set(`${b.bx},${b.by}`, b.generes.map(([q, r]) => [q, r] as [number, number]));
    }
  }
  return out;
}
const attendu = (b: any): [number, number][] => (b.etoile ? [[b.etoile.q, b.etoile.r]] : []);
const bloc = (w: W, who: ReturnType<W['a']>, bx: number, by: number) =>
  lireBlocsGeneres(w.db, who, w.univers, w.g, { bx, by }, { bx, by })[0]!.generes;

test('les generes des 400 blocs des fixtures sont les étoiles des fixtures (MJ et joueuse, un système secret au milieu)', () => {
  const w = monde({ secret: new Set(['22,-49', '3,-2']) });
  assert.equal(F.blocs.length, 400);
  for (const who of [w.a('antor'), w.a('lea'), w.a('antor', true)]) {
    const lu = lireTout(w, who);
    assert.equal(lu.size, 400);
    let etoiles = 0;
    for (const b of F.blocs) {
      assert.deepEqual(lu.get(`${b.bx},${b.by}`), attendu(b), `bloc ${b.bx},${b.by}`);
      etoiles += attendu(b).length;
    }
    assert.equal(etoiles, 243);
  }
});

test('autour d\'un défini non promu les sept hexagones sont vides ; sans lui les étoiles tirées reviennent', () => {
  const w = monde();
  const A = w.a('antor');
  // (22,-49) sits on a drawn star, (33,-38) has one at its neighbour (32,-38), (-48,-18) at (-47,-19): values of the core without exclusion.
  const attendus: [number, number, number, number][] = [[22, -49, 4, -10], [32, -38, 6, -8], [-47, -19, -10, -4]];
  for (const [q, r, bx, by] of attendus) assert.deepEqual(bloc(w, A, bx, by), [], `exclu ${q},${r}`);
  w.db.prepare('UPDATE swn_systemes SET promu = 1').run(); // no exclusion left
  for (const [q, r, bx, by] of attendus) assert.deepEqual(bloc(w, A, bx, by), [[q, r]], `libre ${q},${r}`);
});

test('autour d\'un promu l\'étoile tirée voisine garde sa place', () => {
  const w = monde();
  for (const who of [w.a('antor'), w.a('lea')]) {
    assert.deepEqual(bloc(w, who, 3, -6), [[18, -27]]); // the star of promoted (18,-27)
    assert.deepEqual(bloc(w, who, -1, 7), [[-2, 38]]); // the star of promoted (-2,38)
  }
});

test('l\'exclusion d\'un système secret est la même pour la joueuse, le MJ et le MJ en mode joueur', () => {
  const w = monde({ secret: new Set(['22,-49']) });
  const lecteurs = [w.a('antor'), w.a('mira'), w.a('lea'), w.a('roxane'), w.a('antor', true)];
  for (const who of lecteurs) assert.deepEqual(bloc(w, who, 4, -10), []);
  // the secret system itself is hidden from the player, its effect is not hidden — nor revealed: no field says why a cell is empty
  const vue = JSON.stringify(lireBlocs(w.db, w.a('lea'), w.univers, w.g, { bx: 4, by: -10 }, { bx: 4, by: -10 }));
  assert.ok(!vue.includes('S 22 -49') && !vue.includes('s22_-49') && !/exclu|raison|secret/i.test(vue), vue);
  const brut = lireBlocsGeneres(w.db, w.a('lea'), w.univers, w.g, { bx: 4, by: -10 }, { bx: 4, by: -10 });
  assert.deepEqual(Object.keys(brut[0]!).sort(), ['bx', 'by', 'generes']);
});

test('cache : une exclusion ajoutée, retirée ou promue n\'est jamais ignorée par une entrée déjà lue', () => {
  const w = monde();
  for (const who of [w.a('lea'), w.a('antor')]) {
    viderCacheBlocs();
    assert.deepEqual(bloc(w, who, 5, -10), [[28, -49]]); // fixture star, cached
    assert.deepEqual(bloc(w, who, 5, -10), [[28, -49]]);
    w.poser(29, -49, false); // a neighbour of the star
    assert.deepEqual(bloc(w, who, 5, -10), [], 'exclusion ajoutée');
    w.db.prepare('UPDATE swn_systemes SET promu = 1 WHERE q = 29 AND r = -49').run();
    assert.deepEqual(bloc(w, who, 5, -10), [[28, -49]], 'système promu : plus d\'exclusion');
    w.db.prepare('UPDATE swn_systemes SET promu = 0 WHERE q = 29 AND r = -49').run();
    assert.deepEqual(bloc(w, who, 5, -10), [], 'exclusion remise');
    w.db.prepare('DELETE FROM swn_systemes WHERE q = 29 AND r = -49').run();
    assert.deepEqual(bloc(w, who, 5, -10), [[28, -49]], 'exclusion retirée');
  }
});

test('cache : un système du bloc voisin dont la bordure touche le bloc exclut aussi, et le bloc lointain est inchangé', () => {
  const w = monde();
  const A = w.a('antor');
  const avant = bloc(w, A, 5, -10);
  w.poser(40, 40, false); // far away
  assert.deepEqual(bloc(w, A, 5, -10), avant);
  // star (28,-49) in block (5,-10): a system on (29,-50) sits in the same block, (30,-49) is its neighbour's neighbour: no exclusion
  w.poser(30, -49, false);
  assert.deepEqual(bloc(w, A, 5, -10), [[28, -49]], 'à deux hexagones : étoile gardée');
});

test('estGenere suit le même tirage : un système posé sur une étoile tirée est promu, ailleurs ou en zone exclue non', () => {
  const w = monde();
  const A = w.a('antor');
  assert.equal(placerSysteme(w.db, A, w.univers, w.g, { nom: 'Sur étoile', q: 28, r: -49 }).promu, true);
  assert.equal(placerSysteme(w.db, A, w.univers, w.g, { nom: 'Vide', q: 28, r: -48 }).promu, false);
  // the star of block (-1,6) at (-4,31) is drawn; a non-promoted system beside it empties it, so a system placed on it is not promoted
  w.poser(-5, 31, false);
  assert.equal(placerSysteme(w.db, A, w.univers, w.g, { nom: 'Sur exclue', q: -4, r: 31 }).promu, false);
});

test('la densité de zone agit : les 25 blocs de la zone basse (0.3) et de la haute (0.95) rendent la fixture, puis 0 et 1', () => {
  const w = monde();
  const L = w.a('lea');
  const total = (b0: number, cle: string, densite: number | null) => {
    if (densite !== undefined) w.db.prepare('UPDATE swn_zones SET densite = ?, version = version + 1 WHERE cle = ?').run(densite, cle);
    let n = 0;
    for (const b of lireBlocsGeneres(w.db, L, w.univers, w.g, { bx: b0, by: b0 }, { bx: b0 + 4, by: b0 + 4 })) n += b.generes.length;
    return n;
  };
  const dans = (b0: number) => F.blocs.filter((b: any) => b.bx >= b0 && b.bx < b0 + 5 && b.by >= b0 && b.by < b0 + 5)
    .reduce((n: number, b: any) => n + attendu(b).length, 0);
  assert.equal(total(-9, 'zone-basse', 0.3), dans(-9)); assert.equal(dans(-9), 4);
  assert.equal(total(3, 'zone-haute', 0.95), dans(3)); assert.equal(dans(3), 22);
  assert.equal(total(-9, 'zone-basse', 0), 0);
  assert.equal(total(-9, 'zone-basse', 1), 25);
  assert.equal(total(3, 'zone-haute', 0), 0);
  assert.equal(total(3, 'zone-haute', 1), 25);
});

test('une densité par défaut modifiée change le résultat servi (clé de cache)', () => {
  const w = monde();
  w.db.prepare("DELETE FROM swn_zones WHERE galaxie_id = ?").run(w.g);
  const lire = () => JSON.stringify(lireBlocsGeneres(w.db, w.a('lea'), w.univers, w.g, { bx: 0, by: 0 }, { bx: 9, by: 9 }));
  const base = lire();
  w.db.prepare('UPDATE swn_galaxies SET densite_defaut = 0 WHERE id = ?').run(w.g);
  assert.ok(!lire().includes('[['), 'densité 0 : aucune étoile');
  w.db.prepare('UPDATE swn_galaxies SET densite_defaut = 1 WHERE id = ?').run(w.g);
  assert.equal(lire().match(/\[\d+,-?\d+\]/g)?.length, 100, 'densité 1 : une étoile par bloc');
  w.db.prepare('UPDATE swn_galaxies SET densite_defaut = ? WHERE id = ?').run(F.densites.defaut, w.g);
  assert.equal(lire(), base);
});

// --- migration 0035 (AD-etoiles-7)

const SRC = new URL('../../db/migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0035 : montée depuis 0034, la galaxie à 0.2 passe à 0.68, une autre valeur et les zones restent', () => {
  const db = openDb(':memory:');
  assert.deepEqual(migrate(db, dossierJusqua(34)).at(-1), 34);
  const d = '2026-10-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', ?)").run(d);
  const gal = db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, visible, graine, densite_defaut, version) VALUES (?, 1, ?, 0, ?, ?, 4)");
  gal.run(1, 'A', 'a', 0.2); gal.run(2, 'B', 'b', 0.5); gal.run(3, 'C', 'c', 0.21); gal.run(4, 'D', 'd', 0); gal.run(5, 'E', 'e', 0.68);
  const zone = db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret) VALUES (1, 1, ?, ?, '[[0,0],[1,0],[0,1]]', 'accent', ?, 0)");
  zone.run('z1', 'Z1', 0.2); zone.run('z2', 'Z2', 0.9); zone.run('z3', 'Z3', null);
  const zones = () => db.prepare('SELECT * FROM swn_zones ORDER BY id').all();
  const avantZones = zones();
  const avantGal = db.prepare('SELECT * FROM swn_galaxies ORDER BY id').all() as any[];

  assert.deepEqual(migrate(db), [35]);

  const apresGal = db.prepare('SELECT * FROM swn_galaxies ORDER BY id').all() as any[];
  assert.deepEqual(apresGal.map((g) => g.densite_defaut), [0.68, 0.5, 0.21, 0, 0.68]);
  assert.deepEqual(apresGal.map((g) => ({ ...g, densite_defaut: 0 })), avantGal.map((g) => ({ ...g, densite_defaut: 0 })), 'rien d\'autre ne bouge (version comprise)');
  assert.deepEqual(zones(), avantZones, 'les zones restent, une zone à 0.2 aussi');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.deepEqual(migrate(db), []);
});
