import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Whole-feature tests of kanevas-carte-spatiale-systeme at the door of the screen E-23: GET …/galaxies/:gid/interieur/:q/:r,
// real routes, real database, stub login. Written from the sheet, docs/parcours.md (B-88, B-91) and docs/ecrans.md (E-23),
// not from the code. Expected values are literals (counts of the twenty systems of Éneria's generator on the neutral seed).
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { plagesDe } = await import('./regles/forme.js');

const fixture = (n: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../rust/modules/coeur/tests/fixtures/${n}`, import.meta.url)), 'utf8'));
const GALAXIE = fixture('generation-galaxie.json'); // only to set the density zones up, never an expectation

/** [q, r, bodies, zones] of the twenty drawn systems of the neutral seed, as Éneria's own generator draws them. */
const VINGT: Array<[number, number, number, number]> = [
  [-49, -48, 18, 1], [-44, -47, 5, 1], [-44, 38, 10, 1], [-43, -14, 12, 2], [-39, -49, 12, 1],
  [-27, 12, 18, 0], [-17, -48, 8, 1], [-13, -48, 12, 2], [-7, -48, 8, 1], [-2, -49, 13, 3],
  [7, 18, 17, 0], [11, -7, 15, 1], [12, -34, 13, 3], [12, -24, 16, 4], [18, -47, 17, 1],
  [26, 22, 18, 1], [33, -2, 15, 2], [37, -44, 10, 1], [38, 3, 11, 1], [48, 27, 22, 1],
];

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  // The neutral seed of the fixtures, no defined system, the fixtures' two density zones.
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run('kanevas-neutre-1', GALAXIE.densites.defaut, g);
  for (const z of GALAXIE.densites.zones) {
    app.db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, E, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const get = (who: string, q: number | string, r: number | string, suite = '') =>
    app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur/${q}/${r}${suite}`, headers: h[who] });
  const systeme = (q: number, r: number, nom: string | null, secret: boolean) =>
    app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)")
      .run(g, E, `ens-${q}-${r}`, nom, q, r, secret ? 1 : 0).lastInsertRowid as number;
  return { app, E, g, get, systeme };
}

test('B-88 nominal : vingt systèmes de la graine neutre, mêmes comptes que le générateur d\'Éneria, marqués tirés, lus deux fois à l\'identique', async () => {
  const w = await monde();
  for (const [q, r, corps, zones] of VINGT) {
    const a = await w.get('antor', q, r);
    assert.equal(a.statusCode, 200, `${q},${r}`);
    const v = a.json();
    assert.equal(v.etat, 'tire', `${q},${r}`);
    assert.deepEqual([v.q, v.r, v.nom], [q, r, null]);
    assert.equal(v.astres.length, corps, `${q},${r} corps`);
    assert.equal(v.formations.length, zones, `${q},${r} zones`);
    assert.equal(v.astres[0].genre, 'etoile');
    assert.equal((await w.get('antor', q, r)).body, a.body, `${q},${r} deuxième lecture`);
  }
});

test('B-88 nominal : le premier système tiré, valeurs de la fixture d\'Éneria (étoile orange, première planète de lave à l\'orbite 1,03 et à 0,6 h)', async () => {
  const w = await monde();
  const v = (await w.get('lea', -49, -48)).json();
  const [etoile, planete] = v.astres;
  assert.deepEqual([etoile.type, etoile.orbite, etoile.heure], ['orange', 0, 0]);
  assert.deepEqual([planete.genre, planete.type, planete.orbite, planete.heure], ['planete', 'lave', 1.03, 0.6]);
});

/** The MJ's body without the write tokens of AD-edition-2, which no one else reads. */
const sansJetons = (corps: string): string => {
  const { peutEcrire, versionSysteme, ...v } = JSON.parse(corps);
  return JSON.stringify({ ...v, astres: v.astres.map(({ version, ...a }: any) => a), formations: v.formations.map(({ version, ...f }: any) => f) });
};

test('B-88 la joueuse lit les mêmes corps que le MJ, et le MJ en mode joueur aussi', async () => {
  const w = await monde();
  for (const [q, r] of [[-49, -48], [48, 27], [-2, -49]]) {
    const mj = sansJetons((await w.get('antor', q, r)).body);
    assert.equal((await w.get('lea', q, r)).body, mj, `joueuse ${q},${r}`);
    assert.equal((await w.get('antor', q, r, '?mode=joueur')).body, mj, `mode joueur ${q},${r}`);
  }
});

test('critère : un système posé en base est rendu avec ses lignes, « defini », et non le tirage, pour le MJ, la joueuse et le MJ en mode joueur', async () => {
  const w = await monde();
  const sid = w.systeme(-49, -48, 'Port-Aube', false); // an hexagon that the draw fills with 18 bodies
  const ins = w.app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?)');
  ins.run(sid, 'e', 'etoile', 'orange', null, 0, 0, 0.2);
  ins.run(sid, 'p', 'planete', 'gazeux', 'Vael II', 4, 7, 0.1);
  ins.run(sid, 'a', 'planete', 'anomalie', null, 5.5, 3.4, 0.1);
  const mj = await w.get('antor', -49, -48);
  const v = mj.json();
  assert.equal(v.etat, 'defini');
  assert.equal(v.nom, 'Port-Aube');
  assert.deepEqual(v.astres.map((x: any) => [x.type, x.nom, x.orbite, x.heure]),
    [['orange', null, 0, 0], ['gazeux', 'Vael II', 4, 7], ['anomalie', null, 5.5, 3.4]]);
  assert.deepEqual(v.formations, []);
  assert.equal((await w.get('lea', -49, -48)).body, sansJetons(mj.body));
  assert.equal((await w.get('antor', -49, -48, '?mode=joueur')).body, sansJetons(mj.body));
});

test('critère : un système défini sans aucune ligne est lu défini et vide, pour tous', async () => {
  const w = await monde();
  w.systeme(3, 3, 'Calme', false);
  for (const [who, suite] of [['antor', ''], ['lea', ''], ['antor', '?mode=joueur']]) {
    const v = (await w.get(who!, 3, 3, suite)).json();
    assert.equal(v.etat, 'defini', `${who}${suite}`);
    assert.deepEqual([v.astres, v.formations], [[], []], `${who}${suite}`);
  }
});

test('exclusion : un système secret est introuvable pour la joueuse et pour le MJ en mode joueur, dans le même corps qu\'un hexagone sans étoile ; le MJ le lit', async () => {
  const w = await monde();
  const sid = w.systeme(-44, -47, 'Flotte creuse', true);
  w.app.db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?)").run(sid, 'e', 'etoile', 'rouge', 0, 0, 0.2);
  const vide = await w.get('lea', 1, 1); // no star there
  assert.equal(vide.statusCode, 404);
  for (const [who, suite] of [['lea', ''], ['antor', '?mode=joueur']]) {
    const x = await w.get(who!, -44, -47, suite);
    assert.equal(x.statusCode, 404, `${who}${suite}`);
    assert.equal(x.body, vide.body, `${who}${suite}`);
    assert.ok(!x.body.includes('Flotte'), `${who}${suite}`);
  }
  const mj = await w.get('antor', -44, -47);
  assert.equal(mj.statusCode, 200);
  assert.equal(mj.json().nom, 'Flotte creuse');
});

test('échec : hexagone sans étoile ou inconnu, introuvable, sans fuite de ce qui existe autour', async () => {
  const w = await monde();
  const ref = await w.get('lea', 1, 1);
  assert.equal(ref.statusCode, 404);
  // the hexagon next to a drawn star, and one far outside the galaxy
  assert.equal((await w.get('antor', -48, -48)).statusCode, 404);
  assert.equal((await w.get('antor', 100000, -100000)).statusCode, 404);
  assert.equal((await w.get('antor', 'x', 'y')).body, ref.body);
});

test('exclusion : la lecture d\'un système ne porte ni identifiant de fiche, ni drapeau secret, ni compte de corps cachés', async () => {
  const w = await monde();
  const sid = w.systeme(5, 5, 'Plein', false);
  w.app.db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?)").run(sid, 'e', 'etoile', 'jaune', 0, 0, 0.2);
  for (const [q, r] of [[5, 5], [-49, -48]]) {
    const v = (await w.get('lea', q, r)).json();
    assert.deepEqual(Object.keys(v).sort(), ['astres', 'etat', 'formations', 'nom', 'q', 'r', 'transition', 'version_generateur']);
    for (const a of v.astres) assert.ok(!('fiche_id' in a) && !('secret' in a) && !('id' in a));
  }
});
