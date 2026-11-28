import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-rendu-habillage-sorties-lecture (AD-sorties-1), through the route the screen calls:
// `GET …/interieur/:q/:r/sorties` carries the route's length and type for each readable neighbour.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const GALAXIE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const O = { q: 40, r: -20 };

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea']) h[c] = await connecter(app, c);
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const g = (app.db.prepare('SELECT id FROM swn_galaxies WHERE univers_id = ?').get(E) as any).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run('kanevas-neutre-1', GALAXIE.densites.defaut, g);
  const poser = (q: number, r: number, secret = false) =>
    app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.5,NULL,'',?,0)")
      .run(g, E, `s${q}_${r}`, `S ${q} ${r}`, q, r, secret ? 1 : 0).lastInsertRowid as number;
  const route = (d: number, v: number, publique: boolean, longueur: number, type: string | null) =>
    app.db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur, type_lien) VALUES (?,?,?,?,?,?,?)')
      .run(g, E, d, v, publique ? 1 : 0, longueur, type);
  const sorties = (who: string, q = O.q, r = O.r) =>
    app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur/${q}/${r}/sorties`, headers: h[who] });
  return { poser, route, sorties };
}

test('la route des sorties donne la distance et le type de la route de chaque voisin lisible ; la joueuse ne voit ni route privée ni voisin masqué', async () => {
  const w = await monde();
  const o = w.poser(O.q, O.r);
  w.route(o, w.poser(O.q + 1, O.r), true, 3, 'pirate');
  w.route(o, w.poser(O.q, O.r - 1), true, 6, null);
  w.route(o, w.poser(O.q - 1, O.r), false, 8, 'prive');
  w.route(o, w.poser(O.q, O.r + 1, true), true, 4, 'cache');
  const lea = await w.sorties('lea');
  assert.equal(lea.statusCode, 200, lea.body);
  const tri = (l: any[]) => [...l].sort((a, b) => a.heure - b.heure);
  assert.deepEqual(tri(lea.json()), [
    { q: O.q + 1, r: O.r, heure: 3, nom: `S ${O.q + 1} ${O.r}`, distance: 3, type_lien: 'pirate' },
    { q: O.q, r: O.r - 1, heure: 11, nom: `S ${O.q} ${O.r - 1}`, distance: 6, type_lien: null },
  ]);
  const mj = await w.sorties('antor');
  assert.deepEqual(tri(mj.json()).map((s: any) => [s.distance, s.type_lien]),
    [[3, 'pirate'], [4, 'cache'], [8, 'prive'], [6, null]]);
});

test('sans la route privée ni le voisin masqué, la réponse de la joueuse est la même, octet pour octet', async () => {
  const a = await monde();
  const oa = a.poser(O.q, O.r);
  a.route(oa, a.poser(O.q + 1, O.r), true, 3, 'pirate');
  const b = await monde();
  const ob = b.poser(O.q, O.r);
  b.route(ob, b.poser(O.q + 1, O.r), true, 3, 'pirate');
  b.route(ob, b.poser(O.q - 1, O.r), false, 8, 'prive');
  b.route(ob, b.poser(O.q, O.r + 1, true), true, 4, 'cache');
  assert.equal((await b.sorties('lea')).body, (await a.sorties('lea')).body);
});

test('une origine masquée répond à la joueuse comme une adresse inconnue', async () => {
  const w = await monde();
  const o = w.poser(O.q, O.r, true);
  w.route(o, w.poser(O.q + 1, O.r), true, 3, 'pirate');
  const masque = await w.sorties('lea');
  const inconnu = await w.sorties('lea', O.q + 5, O.r + 5);
  assert.equal(masque.statusCode, inconnu.statusCode);
  assert.equal(masque.body, inconnu.body);
  assert.equal((await w.sorties('antor')).json()[0].distance, 3);
});
