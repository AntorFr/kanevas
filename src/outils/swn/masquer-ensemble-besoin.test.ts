import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Whole-feature tests of kanevas-carte-spatiale-masquer (B-97, P-26 « Secret (MJ seul) » on a system) at the doors the screens call:
// real routes, real database, stub login. Written from the sheet (« Livre », exit criterion) and docs/ecrans.md (E-21 « hiding a
// system »), not from the code. Every expected value is a literal. World: the neutral seed, where (-49, -48) is a drawn system;
// Port-Aube (-48, -48) and Quai-Nord (-50, -47) are defined, and the routes Port-Aube – H, H – Quai-Nord, Port-Aube – Quai-Nord exist.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { plagesDe } = await import('./regles/forme.js');

const GALAXIE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const H = '-49/-48'; // the drawn system the GM hides
const VIDE = '-49/-47'; // an ordinary empty hexagon
const NOM_H = 'Système (-49, -48)'; // the name anchoring gives
const VOISINS_TIRES: Array<[number, number]> = [[-44, -47], [-44, 38], [-43, -14], [-39, -49], [-27, 12], [-17, -48], [-13, -48], [-7, -48], [-2, -49], [7, 18]];
const BLOCS = 'blocs?de=-11,-11&a=-8,-8';

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde(options: { routes?: boolean } = {}) {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=?, visible=1 WHERE id=?').run('kanevas-neutre-1', GALAXIE.densites.defaut, g);
  for (const z of GALAXIE.densites.zones) {
    app.db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, E, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}`;
  const appeler = (who: string, method: 'GET' | 'PUT' | 'POST', path: string, payload?: unknown) =>
    app.inject({ method, url: path === '' || path.startsWith('?') ? base + path : `${base}/${path}`, headers: h[who] ?? {}, ...(payload === undefined ? {} : { payload: payload as object }) });
  const lire = (who: string, path: string) => appeler(who, 'GET', path);
  const joueur = (who: string, path: string) => appeler(who, 'GET', path + (path.includes('?') ? '&' : '?') + 'mode=joueur');
  const jeton = async (cle = H) => (await lire('antor', `interieur/${cle}`)).json().versionSysteme as number;
  const masquer = async (secret: boolean, cle = H, who = 'antor') => {
    const etat = await lire('antor', `interieur/${cle}/secret`);
    const version = etat.statusCode === 200 ? etat.json().versionSysteme : await jeton(cle);
    return appeler(who, 'PUT', `interieur/${cle}/secret`, { secret, versionSysteme: version });
  };
  const ligne = (q: number, r: number) => one(app, 'SELECT * FROM swn_systemes WHERE galaxie_id=? AND q=? AND r=?', g, q, r);
  const definir = (cle: string, nom: string, q: number, r: number) =>
    app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, secret, promu) VALUES (?,?,?,?,?,?,0,1)").run(g, E, cle, nom, q, r);
  const route = (a: string, b: string, longueur: number, publique = 1) => {
    const ia = one(app, 'SELECT id FROM swn_systemes WHERE galaxie_id=? AND cle=?', g, a).id;
    const ib = one(app, 'SELECT id FROM swn_systemes WHERE galaxie_id=? AND cle=?', g, b).id;
    app.db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?,?,?,?,?,?)').run(g, E, ia, ib, publique, longueur);
  };
  if (options.routes) {
    // anchoring H first gives it its row; its key is the first by identifier, so it is the galaxy's reference for the GM
    const ancrage = await appeler('antor', 'POST', `interieur/${H}/ancrage`, { versionSysteme: await jeton() });
    assert.equal(ancrage.statusCode, 200, ancrage.body);
    app.db.prepare("UPDATE swn_systemes SET cle='a-flotte-creuse' WHERE galaxie_id=? AND q=-49 AND r=-48").run(g);
    definir('b-port-aube', 'Port-Aube', -48, -48);
    definir('c-quai-nord', 'Quai-Nord', -50, -47);
    route('b-port-aube', 'a-flotte-creuse', 1);
    route('a-flotte-creuse', 'c-quai-nord', 1);
    route('b-port-aube', 'c-quai-nord', 9);
  }
  return { app, E, g, appeler, lire, joueur, masquer, ligne, jeton };
}
const cles = (rep: any) => rep.json().systemes.map((s: any) => s.cle).sort();
const tracesRoutes = (rep: any) => rep.json().routes.map((x: any) => `${x.depuis.cle}>${x.vers.cle}`).sort();

test('B-97 nominal : le MJ masque le système tiré (-49, -48) : il est ancré et secret, ses voisins tirés n\'ont pas bougé d\'un octet', async () => {
  const w = await monde();
  const avant: Record<string, string> = {};
  for (const [q, r] of VOISINS_TIRES) avant[`${q}/${r}`] = (await w.lire('antor', `interieur/${q}/${r}`)).body;
  for (const [q, r] of [[-48, -48], [-50, -47], [-49, -49], [-48, -49], [-50, -48]]) avant[`${q}/${r}`] = (await w.lire('antor', `interieur/${q}/${r}`)).body;
  const v0 = (await w.lire('antor', `interieur/${H}`)).json();
  assert.equal(v0.etat, 'tire');
  const res = await w.masquer(true);
  assert.equal(res.statusCode, 200, res.body);
  const l = w.ligne(-49, -48);
  assert.deepEqual([l.secret, l.promu, l.nom], [1, 1, NOM_H]);
  for (const [cle, corps] of Object.entries(avant)) assert.equal((await w.lire('antor', `interieur/${cle}`)).body, corps, cle);
  const v1 = (await w.lire('antor', `interieur/${H}`)).json();
  assert.equal(v1.etat, 'defini');
  assert.deepEqual(v1.astres.map(({ version, ...a }: any) => a), v0.astres.map(({ version, ...a }: any) => a), 'l\'intérieur figé est celui qu\'on voyait');
  const etat = (await w.lire('antor', `interieur/${H}/secret`)).json();
  assert.equal(etat.secret, true); assert.equal(etat.promu, true);
});

test('B-97 nominal : Léa recharge la galaxie : (-49, -48) est une case vide, les deux routes qui y menaient sont absentes, l\'adresse répond comme une adresse inconnue', async () => {
  const w = await monde({ routes: true });
  const lea0 = await w.lire('lea', BLOCS);
  assert.deepEqual(cles(lea0), ['a-flotte-creuse', 'b-port-aube', 'c-quai-nord']);
  assert.deepEqual(tracesRoutes(lea0), ['a-flotte-creuse>c-quai-nord', 'b-port-aube>a-flotte-creuse', 'b-port-aube>c-quai-nord']);
  assert.equal((await w.masquer(true)).statusCode, 200);
  const lea = await w.lire('lea', BLOCS);
  assert.deepEqual(cles(lea), ['b-port-aube', 'c-quai-nord']);
  assert.deepEqual(tracesRoutes(lea), ['b-port-aube>c-quai-nord']);
  assert.ok(!lea.body.includes('flotte') && !lea.body.includes('Flotte') && !lea.body.includes('Système (-49'), 'aucune trace du nom ni de la clé');
  assert.ok(!lea.json().blocs.some((b: any) => b.generes.some(([q, r]: number[]) => q === -49 && r === -48)), 'pas d\'étoile tirée à la place');
  const vide = await w.lire('lea', `interieur/${VIDE}`);
  const adresse = await w.lire('lea', `interieur/${H}`);
  assert.equal(adresse.statusCode, 404);
  assert.equal(adresse.body, vide.body);
  const lien = await w.lire('lea', 'systemes/a-flotte-creuse');
  const inconnu = await w.lire('lea', 'systemes/nulle-part');
  assert.equal(lien.statusCode, 404);
  assert.equal(lien.body, inconnu.body);
  // the GM still sees everything, and the mark
  const antor = await w.lire('antor', BLOCS);
  assert.deepEqual(cles(antor), ['a-flotte-creuse', 'b-port-aube', 'c-quai-nord']);
  assert.equal(antor.json().routes.length, 3);
  assert.equal(antor.json().systemes.find((s: any) => s.cle === 'a-flotte-creuse').secret, true);
  assert.equal(antor.json().systemes.find((s: any) => s.cle === 'b-port-aube').secret, false);
});

test('B-97 nominal : Antor en mode joueur lit exactement ce que lit Léa, galaxie, panneau, adresse, sorties et recherche', async () => {
  const w = await monde({ routes: true });
  assert.equal((await w.masquer(true)).statusCode, 200);
  for (const chemin of [BLOCS, 'systemes/a-flotte-creuse', `interieur/${H}`, `interieur/${H}/sorties`, 'systemes/b-port-aube', 'interieur/-48/-48/sorties',
    'recherche?q=Flotte', 'recherche?q=Syst', 'trajet?depart=b-port-aube&arrivee=c-quai-nord', 'trajet?depart=a-flotte-creuse&arrivee=c-quai-nord', '']) {
    const lea = await w.lire('lea', chemin);
    const mj = await w.joueur('antor', chemin);
    assert.equal(mj.statusCode, lea.statusCode, `${chemin} (mj ${mj.statusCode}, lea ${lea.statusCode})`);
    assert.equal(mj.body, lea.body, chemin);
  }
  // leaving the mode gives the system back
  assert.equal((await w.lire('antor', `interieur/${H}`)).statusCode, 200);
});

test('B-97 nominal : la sortie vers le système masqué disparaît de l\'E-23 du voisin visible, sans trou ni compte ; le MJ la garde', async () => {
  const w = await monde({ routes: true });
  const avant = (await w.lire('lea', 'interieur/-48/-48/sorties')).json();
  assert.deepEqual(avant.map((s: any) => [s.q, s.r, s.nom]).sort(), [[-49, -48, NOM_H], [-50, -47, 'Quai-Nord']]);
  assert.equal((await w.masquer(true)).statusCode, 200);
  const lea = (await w.lire('lea', 'interieur/-48/-48/sorties')).json();
  assert.deepEqual(lea.map((s: any) => [s.q, s.r, s.nom]), [[-50, -47, 'Quai-Nord']]);
  const qn = (await w.lire('lea', 'interieur/-50/-47/sorties')).json();
  assert.deepEqual(qn.map((s: any) => [s.q, s.r, s.nom]), [[-48, -48, 'Port-Aube']]);
  const mj = (await w.lire('antor', 'interieur/-48/-48/sorties')).json();
  assert.deepEqual(mj.map((s: any) => [s.q, s.r, s.nom]).sort(), [[-49, -48, NOM_H], [-50, -47, 'Quai-Nord']]);
  const panneau = (await w.lire('lea', 'systemes/b-port-aube')).json();
  assert.deepEqual(panneau.routes.map((x: any) => x['avec'].cle), ['c-quai-nord']);
  assert.equal((await w.lire('antor', 'systemes/b-port-aube')).json().routes.length, 2);
});

test('B-97 nominal : démasquer rend le système aux joueuses avec son intérieur stocké, sans que les voisins aient bougé', async () => {
  const w = await monde({ routes: true });
  const voisins = async (qui: string) => [(await w.lire(qui, 'interieur/-48/-48')).body, (await w.lire(qui, 'interieur/-50/-47')).body, (await w.lire(qui, 'interieur/-44/-47')).body];
  const lea0 = (await w.lire('lea', `interieur/${H}`)).body;
  const blocs0 = (await w.lire('lea', BLOCS)).body;
  const voisins0 = await voisins('lea');
  assert.equal((await w.masquer(true)).statusCode, 200);
  assert.equal((await w.lire('lea', `interieur/${H}`)).statusCode, 404);
  assert.equal((await w.masquer(false)).statusCode, 200);
  const l = w.ligne(-49, -48);
  assert.deepEqual([l.secret, l.promu], [0, 1], 'démasquer ne désancre pas');
  const lea1 = await w.lire('lea', `interieur/${H}`);
  assert.equal(lea1.statusCode, 200);
  assert.equal(lea1.body, lea0);
  assert.equal((await w.lire('lea', BLOCS)).body, blocs0);
  assert.deepEqual(await voisins('lea'), voisins0);
  assert.equal((await w.lire('lea', `interieur/-48/-48/sorties`)).json().length, 2);
});

test('B-97 bords : le nom du système masqué n\'est trouvé ni par la recherche (casse et accents repliés), ni par le trajet, ni par l\'illustration, ni par le panneau ; le MJ le trouve', async () => {
  const w = await monde({ routes: true });
  w.app.db.prepare("UPDATE swn_systemes SET nom='Flotte Éreintée' WHERE q=-49 AND r=-48").run();
  assert.deepEqual((await w.lire('lea', 'recherche?q=flotte')).json().map((x: any) => x.cle), ['a-flotte-creuse']);
  const astre = (await w.lire('antor', `interieur/${H}`)).json().astres[0].cle as string;
  const illu = `interieur/${H}/astres/${encodeURIComponent(astre)}/illustration?cote=128`;
  assert.equal((await w.lire('lea', illu)).statusCode, 200, 'visible avant');
  assert.equal((await w.masquer(true)).statusCode, 200);
  for (const q of ['flotte', 'FLOTTE', 'éreint', 'ereint', 'Flotte Éreintée', 'Syst']) {
    const rep = await w.lire('lea', `recherche?q=${encodeURIComponent(q)}`);
    assert.equal(rep.statusCode, 200, q);
    assert.ok(!rep.body.includes('Flotte') && !rep.body.includes('a-flotte-creuse'), q);
  }
  assert.deepEqual((await w.lire('antor', 'recherche?q=ereint')).json().map((x: any) => x.cle), ['a-flotte-creuse']);
  const inconnuIllu = await w.lire('lea', illu.replace(H, VIDE));
  const masqIllu = await w.lire('lea', illu);
  assert.equal(masqIllu.statusCode, 404);
  assert.equal(masqIllu.body, inconnuIllu.body);
  assert.equal((await w.lire('antor', illu)).statusCode, 200);
  const sansH = await w.lire('lea', 'trajet?depart=b-port-aube&arrivee=c-quai-nord');
  assert.deepEqual(sansH.json().etapes.map((e: any) => e.cle), ['b-port-aube', 'c-quai-nord']);
  assert.ok(!sansH.body.includes('flotte'));
  const avecH = await w.lire('antor', 'trajet?depart=b-port-aube&arrivee=c-quai-nord');
  assert.deepEqual(avecH.json().etapes.map((e: any) => e.cle), ['b-port-aube', 'a-flotte-creuse', 'c-quai-nord'], 'le MJ passe par le système masqué (2 cases contre 9)');
  for (const dep of ['depart=a-flotte-creuse&arrivee=c-quai-nord', 'depart=c-quai-nord&arrivee=a-flotte-creuse']) {
    const rep = await w.lire('lea', `trajet?${dep}`);
    const inc = await w.lire('lea', `trajet?${dep.replace('a-flotte-creuse', 'nulle-part')}`);
    assert.equal(rep.statusCode, inc.statusCode, dep);
    assert.equal(rep.body, inc.body, dep);
  }
});

test('B-97 bords : la référence de la galaxie n\'est jamais le système masqué pour une joueuse ; si tout est masqué, la galaxie est vide pour elle', async () => {
  const w = await monde({ routes: true });
  assert.equal((await w.lire('lea', '')).json().reference.cle, 'a-flotte-creuse');
  assert.equal((await w.masquer(true)).statusCode, 200);
  assert.equal((await w.lire('lea', '')).json().reference.cle, 'b-port-aube');
  assert.equal((await w.lire('antor', '')).json().reference.cle, 'a-flotte-creuse');
  assert.equal((await w.masquer(true, '-48/-48')).statusCode, 200);
  assert.equal((await w.masquer(true, '-50/-47')).statusCode, 200);
  const lea = await w.lire('lea', BLOCS);
  assert.deepEqual([lea.json().systemes, lea.json().routes], [[], []]);
  assert.equal((await w.lire('lea', '')).json().reference, null);
  assert.deepEqual((await w.lire('lea', 'recherche?q=Port')).json(), []);
  assert.equal((await w.lire('antor', BLOCS)).json().systemes.length, 3);
});

test('B-97 échec : Léa, Teo et un visiteur sans session ne masquent rien ; jeton périmé 409 ; hexagone vide 404 ; rien ne bouge', async () => {
  const w = await monde({ routes: true });
  const jeton = await w.jeton();
  for (const who of ['lea', 'teo', 'inconnu']) {
    const r = await w.appeler(who, 'PUT', `interieur/${H}/secret`, { secret: true, versionSysteme: jeton });
    assert.ok([302, 401, 403, 404].includes(r.statusCode), `${who} : ${r.statusCode}`);
  }
  assert.equal(w.ligne(-49, -48).secret, 0);
  assert.equal((await w.lire('lea', `interieur/${H}`)).statusCode, 200);
  const vieux = await w.appeler('antor', 'PUT', `interieur/${H}/secret`, { secret: true, versionSysteme: jeton + 5 });
  assert.equal(vieux.statusCode, 409);
  assert.equal(w.ligne(-49, -48).secret, 0);
  const vide = await w.appeler('antor', 'PUT', `interieur/${VIDE}/secret`, { secret: true, versionSysteme: jeton });
  assert.equal(vide.statusCode, 404);
  assert.ok(vide.body.includes('systeme_inconnu'), vide.body);
  // Antor in Player mode is not offered the write either
  const enMode = await w.appeler('antor', 'PUT', `interieur/${H}/secret?mode=joueur`, { secret: true, versionSysteme: jeton });
  assert.ok([403, 404].includes(enMode.statusCode), `mode joueur : ${enMode.statusCode}`);
  assert.equal(w.ligne(-49, -48).secret, 0);
  // Léa cannot read the switch state either
  assert.ok([403, 404].includes((await w.lire('lea', `interieur/${H}/secret`)).statusCode));
});

test('B-97 exclusion : la joueuse ne voit ni nom ni compte du système masqué dans la liste des cartes, ni dans aucune réponse de la galaxie', async () => {
  const w = await monde({ routes: true });
  const cartes = async (qui: string) => (await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/cartes`, headers: (await connecter(w.app, qui)) })).body;
  const avant = await cartes('lea');
  assert.equal((await w.masquer(true)).statusCode, 200);
  assert.equal(await cartes('lea'), avant, 'la liste des cartes de Léa ne change pas');
  for (const chemin of ['', BLOCS, 'systemes/b-port-aube', 'systemes/c-quai-nord', 'interieur/-48/-48', 'interieur/-50/-47', 'interieur/-48/-48/sorties', 'recherche?q=a', 'recherche?q=Port']) {
    const rep = await w.lire('lea', chemin);
    for (const trace of ['flotte', 'Flotte', 'Système (-49', '-49,-48', '"q":-49,"r":-48']) assert.ok(!rep.body.includes(trace), `${chemin} contient « ${trace} »`);
  }
});
