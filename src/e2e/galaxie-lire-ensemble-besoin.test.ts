// Black-box tests of the feature kanevas-outils-galaxie-lire (the galaxy map, read side), written from its
// sheet (« Livre », exit criterion), docs/parcours.md (B-68 to B-72, P-18 steps 1 to 3) and docs/ecrans.md
// (E-21, E-10) — not from the code. Real server in stub mode WITH its starting world (« Éneria d'essai »,
// « Galaxie d'essai »: Port-Sel, Vael, Hesper, « Station fantôme » secret; 3 routes, one private; 1 secret zone),
// real Chromium at 390 px for the phone scenarios. Expected values are literals taken from the docs.
// Data setups that no screen of this slice offers (hide the galaxy, remove the secret zone) go straight to the
// SQLite file of the throw-away server.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import Database from 'better-sqlite3';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
const tmpDirs: string[] = [];
const servers: { stop: () => void }[] = [];
let browser: Any;

interface Monde {
  base: string;
  dbPath: string;
  uid: number;
  gid: number;
  sid: number; // the game system « Système d'essai »
  cookies: Record<string, string>;
}

async function monde(): Promise<Monde> {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-galaxie-'));
  tmpDirs.push(dir);
  const dbPath = join(dir, 'k.db');
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
  servers.push(srv);
  const m: Monde = { base: srv.base, dbPath, uid: 0, gid: 0, sid: 0, cookies: {} };
  for (const c of ['antor', 'lea', 'teo', 'mira', 'roxane']) m.cookies[c] = await connexion(m.base, c);
  const univers = (await (await fetch(`${m.base}/api/univers`, { headers: { cookie: m.cookies.antor } })).json()) as Any[];
  const eneria = univers.find((u) => u.nom === "Éneria d'essai");
  m.uid = eneria.id;
  m.sid = eneria.systeme.id;
  const cartes = (await (await fetch(`${m.base}/api/univers/${m.uid}/cartes`, { headers: { cookie: m.cookies.antor } })).json()) as Any;
  m.gid = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id;
  return m;
}

async function connexion(base: string, compte: string): Promise<string> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ compte }).toString(),
  });
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

interface Rep {
  status: number;
  texte: string;
  json: Any;
}
async function lire(m: Monde, compte: string, chemin: string): Promise<Rep> {
  const r = await fetch(`${m.base}${chemin}`, { headers: { cookie: m.cookies[compte] } });
  const texte = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(texte);
  } catch {
    /* not JSON */
  }
  return { status: r.status, texte, json };
}
const api = (m: Monde, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${m.gid}${suite}`;
const trajet = (m: Monde, compte: string, de: string, vers: string, moteur: number, routes: string) =>
  lire(m, compte, api(m, `/trajet?depart=${de}&arrivee=${vers}&moteur=${moteur}&routes=${routes}`));
const blocs = (m: Monde, compte: string, de: string, a: string, mode = '') =>
  lire(m, compte, api(m, `/blocs?de=${de}&a=${a}${mode}`));
function blocDe(rep: Rep, bx: number, by: number): Any {
  return rep.json.blocs.find((b: Any) => b.bx === bx && b.by === by);
}
async function put(m: Monde, compte: string, chemin: string, corps: unknown): Promise<number> {
  const r = await fetch(`${m.base}${chemin}`, {
    method: 'PUT',
    headers: { cookie: m.cookies[compte], 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  });
  return r.status;
}
function sql(m: Monde, requete: string): void {
  const db = new Database(m.dbPath);
  try {
    db.exec(requete);
  } finally {
    db.close();
  }
}

before(async () => {
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
  for (const s of servers) s.stop();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------- B-72 : trajet

test('B-72 nominal : Léa, Port-Sel vers Vael, moteur 2, routes publiques : « 7 cases · 4,5 jours »', async () => {
  const m = await monde();
  const r = await trajet(m, 'lea', 'port-sel', 'vael', 2, 'publiques');
  assert.equal(r.status, 200);
  assert.equal(r.json.libelle, '7 cases · 4,5 jours');
  assert.equal(r.json.cases, 7);
  assert.equal(r.json.jours, 4.5);
});

test('B-72 : Antor (toutes) Port-Sel vers Hesper par la route privée : 6 cases · 4 jours ; Léa : 13 cases · 8,5 jours par Vael sans tronçon privé', async () => {
  const m = await monde();
  const antor = await trajet(m, 'antor', 'port-sel', 'hesper', 2, 'toutes');
  assert.equal(antor.json.libelle, '6 cases · 4 jours');
  assert.deepEqual(antor.json.etapes.map((e: Any) => e.cle), ['port-sel', 'hesper']);
  const lea = await trajet(m, 'lea', 'port-sel', 'hesper', 2, 'publiques');
  assert.equal(lea.json.libelle, '13 cases · 8,5 jours');
  assert.deepEqual(lea.json.etapes.map((e: Any) => e.cle), ['port-sel', 'vael', 'hesper']);
  for (const t of lea.json.troncons) {
    const bout = new Set([t.depuis, t.vers]);
    assert.ok(!(bout.has('port-sel') && bout.has('hesper')), 'aucun tronçon de la route privée pour Léa');
  }
});

test('B-72 exclusion : Léa demandant « toutes » n’obtient pas la route privée', async () => {
  const m = await monde();
  const r = await trajet(m, 'lea', 'port-sel', 'hesper', 2, 'toutes');
  assert.equal(r.json.libelle, '13 cases · 8,5 jours');
});

test('B-72 bords : moteur 1 (7 cases = 7 ÷ 1 + 1 = 8 jours) et moteur 6 (7 ÷ 6 + 1 = 2,2 jours, arrondi au dixième)', async () => {
  const m = await monde();
  assert.equal((await trajet(m, 'lea', 'port-sel', 'vael', 1, 'publiques')).json.libelle, '7 cases · 8 jours');
  assert.equal((await trajet(m, 'lea', 'port-sel', 'vael', 6, 'publiques')).json.libelle, '7 cases · 2,2 jours');
});

test('B-72 bords : la route privée se prend dans les deux sens (Hesper vers Port-Sel pour Antor)', async () => {
  const m = await monde();
  const r = await trajet(m, 'antor', 'hesper', 'port-sel', 2, 'toutes');
  assert.equal(r.json.libelle, '6 cases · 4 jours');
});

test('B-72 / P-18 échec : aucune route ne mène à « Station fantôme » : « Aucun trajet avec ce moteur. »', async () => {
  const m = await monde();
  const r = await trajet(m, 'antor', 'port-sel', 'station-fantome', 2, 'toutes');
  assert.equal(r.status, 200);
  assert.equal(r.json.trouve, false);
  assert.equal(r.json.libelle, 'Aucun trajet avec ce moteur.');
});

test('B-73 / E-21 exclusion : un trajet vers « Station fantôme » est, pour Léa, la même 404 qu’un système inconnu', async () => {
  const m = await monde();
  const secret = await trajet(m, 'lea', 'port-sel', 'station-fantome', 2, 'publiques');
  const inconnu = await trajet(m, 'lea', 'port-sel', 'nulle-part', 2, 'publiques');
  assert.equal(secret.status, 404);
  assert.equal(secret.status, inconnu.status);
  assert.equal(secret.texte, inconnu.texte);
});

test('B-73 / E-21 exclusion : en mode Joueur, Antor obtient le trajet et la recherche de Léa', async () => {
  const m = await monde();
  const t = await lire(m, 'antor', api(m, '/trajet?depart=port-sel&arrivee=hesper&moteur=2&routes=toutes&mode=joueur'));
  assert.equal(t.json.libelle, '13 cases · 8,5 jours');
  const s = await lire(m, 'antor', api(m, '/recherche?q=fant&mode=joueur'));
  assert.deepEqual(s.json, []);
});

// ---------------------------------------------------------------- recherche (P-18 échec, E-21)

test('E-21 nominal et bords de la recherche : « Vael » (casse libre) trouvé, une seule lettre : rien', async () => {
  const m = await monde();
  const a = await lire(m, 'lea', api(m, '/recherche?q=vael'));
  assert.deepEqual(a.json.map((x: Any) => x.nom), ['Vael']);
  const b = await lire(m, 'lea', api(m, '/recherche?q=VAEL'));
  assert.deepEqual(b.json.map((x: Any) => x.nom), ['Vael']);
  const c = await lire(m, 'lea', api(m, '/recherche?q=v'));
  assert.deepEqual(c.json, []);
});

test('P-18 échec : Léa cherche « Station fantôme », « fant », « Station » : aucun résultat, même réponse qu’une recherche sans objet', async () => {
  const m = await monde();
  const vide = await lire(m, 'lea', api(m, '/recherche?q=zzzz'));
  for (const q of ['Station%20fant%C3%B4me', 'fant', 'Station']) {
    const r = await lire(m, 'lea', api(m, `/recherche?q=${q}`));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, []);
    assert.equal(r.texte, vide.texte, 'aucune trace d’un masquage');
  }
});

test('E-21 : Antor (MJ) trouve « Station fantôme » en cherchant « fant »', async () => {
  const m = await monde();
  const r = await lire(m, 'antor', api(m, '/recherche?q=fant'));
  assert.deepEqual(r.json.map((x: Any) => x.nom), ['Station fantôme']);
});

// ---------------------------------------------------------------- B-71 : blocs, droits, stabilité

test('B-71 : deux appels du même bloc rendent les mêmes systèmes générés', async () => {
  const m = await monde();
  const a = await blocs(m, 'lea', '-2,-2', '2,2');
  const b = await blocs(m, 'lea', '-2,-2', '2,2');
  assert.equal(a.status, 200);
  assert.deepEqual(a.json, b.json);
  assert.ok(a.json.blocs.length === 25);
  assert.ok(a.json.blocs.some((x: Any) => x.generes.length > 0));
});

test('B-71 / B-78 : deux serveurs neufs sur la galaxie d’essai génèrent les mêmes blocs (identique à chaque redémarrage)', async () => {
  const m1 = await monde();
  const m2 = await monde();
  const a = await blocs(m1, 'lea', '-2,-2', '2,2');
  const b = await blocs(m2, 'lea', '-2,-2', '2,2');
  assert.deepEqual(a.json.blocs, b.json.blocs);
});

test('B-71 bords : la vue ne rend que le rectangle demandé ; 12 × 12 blocs passe, 13 × 13 est refusé', async () => {
  const m = await monde();
  const un = await blocs(m, 'lea', '0,0', '0,0');
  assert.equal(un.json.blocs.length, 1);
  assert.deepEqual(un.json.systemes.map((s: Any) => s.nom), ['Port-Sel']);
  assert.ok(!un.texte.includes('Vael'));
  assert.ok(!un.texte.includes('Hesper'));
  assert.equal((await blocs(m, 'lea', '0,0', '11,11')).status, 200);
  assert.equal((await blocs(m, 'lea', '0,0', '12,12')).status, 400);
});

test('B-71 bords : les blocs de coordonnées négatives existent (bloc −1,−1)', async () => {
  const m = await monde();
  const r = await blocs(m, 'lea', '-1,-1', '-1,-1');
  assert.equal(r.json.blocs.length, 1);
  assert.equal(r.json.blocs[0].bx, -1);
  assert.equal(r.json.blocs[0].by, -1);
  for (const [q, rr] of r.json.blocs[0].generes) {
    assert.ok(q >= -5 && q <= -1 && rr >= -5 && rr <= -1, `(${q},${rr}) hors du bloc (-1,-1)`);
  }
});

test('B-73 exclusion : la vue de Léa ne contient ni système secret, ni route privée, ni zone secrète, ni trace de masquage', async () => {
  const m = await monde();
  const r = await blocs(m, 'lea', '-2,-2', '2,2');
  assert.deepEqual(r.json.systemes.map((s: Any) => s.nom).sort(), ['Hesper', 'Port-Sel', 'Vael']);
  assert.equal(r.json.routes.length, 2);
  assert.deepEqual(r.json.zones, []);
  for (const mot of ['fant', 'Station', 'Marches', 'secret', 'publique', 'Priv', 'masqu', 'cach']) {
    assert.ok(!r.texte.includes(mot), `« ${mot} » ne doit pas apparaître dans la vue de Léa`);
  }
});

test('B-73 : la vue d’Antor (MJ) porte le système secret, la route privée et la zone secrète', async () => {
  const m = await monde();
  const r = await blocs(m, 'antor', '-2,-2', '2,2');
  assert.deepEqual(r.json.systemes.map((s: Any) => s.nom).sort(), ['Hesper', 'Port-Sel', 'Station fantôme', 'Vael']);
  assert.equal(r.json.routes.length, 3);
  assert.deepEqual(r.json.zones.map((z: Any) => z.nom), ['Marches interdites']);
});

test('B-73 : Antor en mode Joueur voit la vue de Léa, le bloc (−2,0) recouvrant la zone secrète compris', async () => {
  const m = await monde();
  const lea = await blocs(m, 'lea', '-2,-2', '2,2');
  const mj = await blocs(m, 'antor', '-2,-2', '2,2');
  const joueur = await blocs(m, 'antor', '-2,-2', '2,2', '&mode=joueur');
  assert.deepEqual(joueur.json, lea.json);
  assert.notDeepEqual(blocDe(mj, -2, 0).generes, blocDe(lea, -2, 0).generes, 'le MJ voit le bloc modifié par la zone secrète');
});

test('B-71 / AD-132 : un bloc dont la densité dépend d’un territoire secret est identique pour Léa avec ou sans ce territoire', async () => {
  const m = await monde();
  const avec = await blocs(m, 'lea', '-2,-1', '-1,1');
  const mjAvec = await blocs(m, 'antor', '-2,-1', '-1,1');
  sql(m, 'DELETE FROM swn_zones');
  const sans = await blocs(m, 'lea', '-2,-1', '-1,1');
  const mjSans = await blocs(m, 'antor', '-2,-1', '-1,1');
  assert.deepEqual(avec.json.blocs, sans.json.blocs);
  assert.notDeepEqual(mjAvec.json.blocs, mjSans.json.blocs, 'la zone secrète change bien la densité vue par le MJ');
  assert.deepEqual(mjSans.json.blocs, sans.json.blocs, 'sans zone, MJ et joueur voient les mêmes blocs');
});

test('B-71 / AD-132 : un bloc chauffé par Antor est lu par Léa comme à froid ; et inversement', async () => {
  const froidLea = await (async () => blocs(await monde(), 'lea', '-2,-2', '2,2'))();
  const froidAntor = await (async () => blocs(await monde(), 'antor', '-2,-2', '2,2'))();
  const m1 = await monde();
  await blocs(m1, 'antor', '-2,-2', '2,2');
  const leaApres = await blocs(m1, 'lea', '-2,-2', '2,2');
  assert.deepEqual(leaApres.json, froidLea.json);
  const m2 = await monde();
  await blocs(m2, 'lea', '-2,-2', '2,2');
  const antorApres = await blocs(m2, 'antor', '-2,-2', '2,2');
  assert.deepEqual(antorApres.json, froidAntor.json);
});

// ---------------------------------------------------------------- B-68 : système et lien

test('B-68 : le panneau de « Vael » porte nom, distance de la position, routes publiques et le lien stable sans contenu', async () => {
  const m = await monde();
  const r = await lire(m, 'lea', api(m, '/systemes/vael'));
  assert.equal(r.status, 200);
  assert.equal(r.json.nom, 'Vael');
  assert.equal(r.json.lien, `/univers/${m.uid}/outils/swn/galaxie/${m.gid}?systeme=vael`);
  assert.deepEqual(r.json.routes.map((x: Any) => x.avec.nom).sort(), ['Hesper', 'Port-Sel']);
});

test('B-73 exclusion : le panneau de « Hesper » montre à Léa sa seule route publique, à Antor aussi la privée', async () => {
  const m = await monde();
  const lea = await lire(m, 'lea', api(m, '/systemes/hesper'));
  assert.deepEqual(lea.json.routes.map((x: Any) => x.avec.nom), ['Vael']);
  const antor = await lire(m, 'antor', api(m, '/systemes/hesper'));
  assert.deepEqual(antor.json.routes.map((x: Any) => x.avec.nom).sort(), ['Port-Sel', 'Vael']);
});

test('B-68 exclusion : le système secret est « introuvable » pour Léa, comme un système inconnu (même réponse)', async () => {
  const m = await monde();
  const secret = await lire(m, 'lea', api(m, '/systemes/station-fantome'));
  const inconnu = await lire(m, 'lea', api(m, '/systemes/nulle-part'));
  assert.equal(secret.status, 404);
  assert.equal(secret.status, inconnu.status);
  assert.equal(secret.texte, inconnu.texte);
  assert.equal((await lire(m, 'antor', api(m, '/systemes/station-fantome'))).status, 200);
});

test('B-68 / B-71 exclusion : Teo (sans rôle dans l’univers) et une galaxie inconnue : la 404 d’un chemin inexistant', async () => {
  const m = await monde();
  const absent = await lire(m, 'lea', `/api/univers/${m.uid}/outils/swn/galaxie/nulle-part`);
  assert.equal(absent.status, 404);
  for (const compte of ['teo']) {
    const r = await lire(m, compte, api(m));
    assert.equal(r.status, 404, compte);
    assert.equal(r.texte, absent.texte, compte);
    const s = await lire(m, compte, api(m, '/systemes/vael'));
    assert.equal(s.status, 404, compte);
  }
  const inconnue = await lire(m, 'lea', `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/9999`);
  assert.equal(inconnue.status, 404);
});

// ---------------------------------------------------------------- droits : galaxie cachée, outil désactivé

test('B-71 : une galaxie non visible est introuvable pour Léa, entière pour Antor ; absente de sa liste de cartes', async () => {
  const m = await monde();
  sql(m, 'UPDATE swn_galaxies SET visible = 0');
  for (const suite of ['', '/blocs?de=0,0&a=0,0', '/systemes/vael', '/recherche?q=vael', '/trajet?depart=port-sel&arrivee=vael&moteur=2&routes=publiques']) {
    assert.equal((await lire(m, 'lea', api(m, suite))).status, 404, suite);
    assert.equal((await lire(m, 'antor', api(m, suite))).status, 200, suite);
  }
  const lea = await lire(m, 'lea', `/api/univers/${m.uid}/cartes`);
  assert.ok(!lea.texte.includes("Galaxie d'essai"));
  const antor = await lire(m, 'antor', `/api/univers/${m.uid}/cartes`);
  assert.equal(antor.json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").visible, false);
});

test('B-70 : l’outil désactivé au système rend la galaxie introuvable à Léa et à Antor, et la retire de la liste des cartes', async () => {
  const m = await monde();
  assert.equal(await put(m, 'antor', `/api/systemes/${m.sid}/outils/swn/galaxie/activation`, { active: false }), 204);
  for (const compte of ['lea', 'antor']) {
    assert.equal((await lire(m, compte, api(m))).status, 404, compte);
    const l = await lire(m, compte, `/api/univers/${m.uid}/cartes`);
    assert.ok(!l.texte.includes("Galaxie d'essai"), compte);
  }
});

test('B-70 : l’outil invisible des joueurs est introuvable pour Léa, lisible par Antor', async () => {
  const m = await monde();
  assert.equal(await put(m, 'antor', `/api/systemes/${m.sid}/outils/swn/galaxie/visibilite`, { joueur: false }), 204);
  assert.equal((await lire(m, 'lea', api(m))).status, 404);
  assert.equal((await lire(m, 'antor', api(m))).status, 200);
});

// ---------------------------------------------------------------- B-69 : outil d'assistant

test('B-69 : l’outil d’assistant swn_galaxie_trajet rend le résultat de l’écran, pour le même compte', async () => {
  const m = await monde();
  process.env.NODE_ENV = 'test';
  process.env.KANEVAS_STUB = '1';
  const { openDb } = await import('../db/db.js');
  const { catalogueDe } = await import('../services/assistant/catalogue.js');
  const db = openDb(m.dbPath);
  try {
    const ids: Record<string, number> = {};
    for (const c of db.prepare('SELECT id, username FROM comptes').all() as { id: number; username: string }[]) ids[c.username] = c.id;
    const outil = (compte: string) => catalogueDe(db, ids[compte], m.uid).outils.find((o) => o.nom === 'swn_galaxie_trajet');

    const lea = outil('lea');
    assert.ok(lea, 'l’outil est dans le catalogue de Léa');
    const ecran = await trajet(m, 'lea', 'port-sel', 'vael', 2, 'publiques');
    const r: Any = await lea.executer({ depart: 'Port-Sel', arrivee: 'Vael', moteur: 2, routes: 'publiques' });
    assert.equal(r.ok, true);
    const d = (x: Any): Any => x.donnees ?? x;
    assert.equal(d(r).libelle, '7 cases · 4,5 jours');
    assert.deepEqual({ etapes: d(r).etapes, troncons: d(r).troncons, cases: d(r).cases, jours: d(r).jours, libelle: d(r).libelle },
      { etapes: ecran.json.etapes, troncons: ecran.json.troncons, cases: ecran.json.cases, jours: ecran.json.jours, libelle: ecran.json.libelle });

    const leaToutes: Any = await lea.executer({ depart: 'Port-Sel', arrivee: 'Hesper', moteur: 2, routes: 'toutes' });
    assert.equal(d(leaToutes).libelle, '13 cases · 8,5 jours');
    const antor: Any = await outil('antor')!.executer({ depart: 'Port-Sel', arrivee: 'Hesper', moteur: 2, routes: 'toutes' });
    assert.equal(d(antor).libelle, '6 cases · 4 jours');

    const secret: Any = await lea.executer({ depart: 'Port-Sel', arrivee: 'Station fantôme' });
    const inconnu: Any = await lea.executer({ depart: 'Port-Sel', arrivee: 'Nulle part' });
    assert.equal(secret.ok, false);
    assert.deepEqual(secret, inconnu, 'le système secret n’a pas d’autre réponse qu’un système inconnu');

    assert.throws(() => catalogueDe(db, ids.teo, m.uid), 'Teo, sans rôle, n’a pas de catalogue');
  } finally {
    db.close();
  }
  assert.equal(await put(m, 'antor', `/api/systemes/${m.sid}/outils/swn/galaxie/activation`, { active: false }), 204);
  const db2 = openDb(m.dbPath);
  try {
    const lea = (db2.prepare("SELECT id FROM comptes WHERE username = 'lea'").get() as { id: number }).id;
    assert.ok(!catalogueDe(db2, lea, m.uid).outils.some((o) => o.nom === 'swn_galaxie_trajet'), 'outil désactivé : absent du catalogue');
  } finally {
    db2.close();
  }
});

// ---------------------------------------------------------------- écran, navigateur

interface Session {
  ctx: Any;
  page: Any;
  assets: string[];
}
async function session(m: Monde, compte: string, largeur = 390, hauteur = 844): Promise<Session> {
  const ctx = await browser.newContext({
    baseURL: m.base,
    viewport: { width: largeur, height: hauteur },
    hasTouch: largeur < 760,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.request.post('/connexion-bouchon', { form: { compte }, maxRedirects: 0 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const assets: string[] = [];
  page.on('request', (r: Any) => {
    const u = new URL(r.url());
    if (/^\/assets\/.*\.js$/.test(u.pathname)) assets.push(u.pathname);
  });
  return { ctx, page, assets };
}
const adresse = (m: Monde, suite = '') => `/univers/${m.uid}/outils/swn/galaxie/${m.gid}${suite}`;
async function ouvrirGalaxie(s: Session, m: Monde, suite = ''): Promise<void> {
  await s.page.goto(adresse(m, suite));
  await s.page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  if (suite === '') await s.page.getByRole('button', { name: 'Port-Sel' }).waitFor();
  else await s.page.locator('svg [role=button]').first().waitFor();
}
const texteDe = async (page: Any): Promise<string> => ((await page.locator('main').innerText()) as string).replace(/’/g, "'");
const trajetBloc = (page: Any) => page.getByRole('region', { name: 'Trajet' });
async function choisir(page: Any, champ: string, saisie: string, nom: string): Promise<void> {
  await page.getByLabel(champ, { exact: true }).fill(saisie);
  await trajetBloc(page).getByRole('button', { name: nom, exact: true }).click();
}
async function calculer(page: Any): Promise<void> {
  const reponse = page.waitForResponse((r: Any) => r.url().includes('/trajet?') && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await reponse;
}
async function dezoomer(page: Any, fois = 2): Promise<void> {
  for (let i = 0; i < fois; i++) await page.getByRole('button', { name: 'Zoom arrière' }).click();
}

test('P-18 1-2 / critère : Léa à 390 px ouvre « Galaxie d’essai » depuis Cartes, appuie sur « Vael » (panneau sous la carte), calcule Port-Sel vers Vael, moteur 2 : « 7 cases · 4,5 jours »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  const { page } = s;
  await page.goto(`/univers/${m.uid}/cartes`);
  await page.getByRole('link', { name: /Galaxie d'essai/ }).click();
  await page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Port-Sel' }).waitFor();
  assert.equal(new URL(page.url()).pathname, adresse(m));

  await dezoomer(page);
  const vael = page.getByRole('button', { name: 'Vael' });
  await vael.waitFor();
  await vael.tap();
  await page.getByText('7 cases depuis Port-Sel').waitFor();
  const t = await texteDe(page);
  assert.match(t, /Vael/);
  assert.match(t, /7 cases depuis Port-Sel/);
  const carte = await page.getByRole('img', { name: 'Carte de la galaxie' }).boundingBox();
  const bouton = await page.getByRole('button', { name: 'Trajet depuis ici' }).boundingBox();
  assert.ok(bouton.y > carte.y + carte.height - 1, 'le panneau s’ouvre sous la carte');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'pas de débordement horizontal à 390 px');
  await page.screenshot({ path: '/tmp/shots/galaxie-vael-390.png' });

  await choisir(page, 'Départ', 'Port', 'Port-Sel');
  await choisir(page, 'Arrivée', 'Vae', 'Vael');
  await page.getByLabel('Moteur').selectOption('2');
  assert.equal(await page.getByLabel('Routes').count(), 0, 'Léa n’a pas le choix « Routes » (absent, non désactivé)');
  await calculer(page);
  await page.getByText('7 cases · 4,5 jours').waitFor();
  await page.screenshot({ path: '/tmp/shots/galaxie-trajet-390.png' });
  await s.ctx.close();
});

test('P-18 / critère : Port-Sel vers Hesper, Antor (« Toutes ») lit 6 cases · 4 jours, Léa 13 cases · 8,5 jours', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor', 1200, 800);
  await ouvrirGalaxie(antor, m);
  await choisir(antor.page, 'Départ', 'Port', 'Port-Sel');
  await choisir(antor.page, 'Arrivée', 'Hes', 'Hesper');
  await antor.page.getByLabel('Routes').selectOption({ label: 'Toutes' });
  await calculer(antor.page);
  await antor.page.getByText('6 cases · 4 jours').waitFor();
  await antor.page.screenshot({ path: '/tmp/shots/galaxie-antor-hesper.png' });

  const lea = await session(m, 'lea');
  await ouvrirGalaxie(lea, m);
  await choisir(lea.page, 'Départ', 'Port', 'Port-Sel');
  await choisir(lea.page, 'Arrivée', 'Hes', 'Hesper');
  await calculer(lea.page);
  await lea.page.getByText('13 cases · 8,5 jours').waitFor();
  assert.ok(!(await texteDe(lea.page)).includes('6 cases'));
  await antor.ctx.close();
  await lea.ctx.close();
});

test('E-21 états : même système « Choisissez deux systèmes différents. » ; « Calculer » inactif tant qu’une extrémité manque', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  await ouvrirGalaxie(s, m);
  const calc = s.page.getByRole('button', { name: 'Calculer' });
  assert.equal(await calc.getAttribute('aria-disabled'), 'true');
  await choisir(s.page, 'Départ', 'Port', 'Port-Sel');
  assert.equal(await calc.getAttribute('aria-disabled'), 'true');
  await choisir(s.page, 'Arrivée', 'Port', 'Port-Sel');
  await calc.click();
  await s.page.getByText('Choisissez deux systèmes différents.').waitFor();
  assert.ok(!(await texteDe(s.page)).includes('cases ·'));
  await s.ctx.close();
});

test('P-18 échec / critère : Léa tape « fant » : « Aucun système ne correspond. », rien de caché sur la carte ni dans la page', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  await ouvrirGalaxie(s, m);
  await s.page.getByLabel('Rechercher un système', { exact: true }).first().fill('fant');
  await s.page.getByText('Aucun système ne correspond.').waitFor();
  const t = await texteDe(s.page);
  for (const mot of ['fantôme', 'Station', 'masqué', 'Marches', 'Secret', 'Privée']) {
    assert.ok(!t.includes(mot), `« ${mot} » absent de la page de Léa`);
  }
  assert.equal(await s.page.getByRole('button', { name: /Station/ }).count(), 0);
  await s.page.screenshot({ path: '/tmp/shots/galaxie-recherche-fant.png' });
  // une seule lettre : aucun message, aucun résultat
  await s.page.getByLabel('Rechercher un système', { exact: true }).first().fill('v');
  await s.page.waitForTimeout(600);
  assert.ok(!(await texteDe(s.page)).includes('Aucun système ne correspond.'));
  await s.ctx.close();
});

test('E-21 : Antor (MJ) voit « Station fantôme », « Marches interdites · Secret », la route « Privée » et le choix « Routes »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'antor', 1200, 800);
  await ouvrirGalaxie(s, m);
  const t = await texteDe(s.page);
  assert.match(t, /Station fantôme/);
  assert.match(t, /Marches interdites · Secret/);
  assert.match(t, /Privée/);
  assert.equal(await s.page.getByLabel('Routes').count(), 1);
  await s.ctx.close();
});

test('P-18 / B-73 : Antor passe en mode Joueur : plus de système secret, de route privée, de zone, ni de choix « Routes »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'antor', 1200, 800);
  await ouvrirGalaxie(s, m);
  await s.page.getByText('Mode Joueur', { exact: true }).click();
  await s.page.waitForFunction(() => !document.querySelector('main')?.textContent?.includes('Station fantôme'));
  const t = await texteDe(s.page);
  for (const mot of ['Station fantôme', 'Marches', 'Privée', 'Secret']) assert.ok(!t.includes(mot), mot);
  assert.equal(await s.page.getByLabel('Routes').count(), 0);
  await s.page.screenshot({ path: '/tmp/shots/galaxie-antor-mode-joueur.png' });
  await s.ctx.close();
});

test('E-21 mesure : la souris sur « Hesper », « Vael » étant le départ : l’étiquette « Hesper · 6 cases »', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea', 1200, 800);
  await ouvrirGalaxie(s, m, '?systeme=vael');
  await s.page.getByRole('button', { name: 'Trajet depuis ici' }).click();
  // the legend covers the lower left of the map: pan the map so that Hesper leaves it
  await s.page.mouse.move(600, 300);
  await s.page.mouse.down();
  await s.page.mouse.move(700, 200, { steps: 8 });
  await s.page.mouse.up();
  await s.page.getByRole('button', { name: 'Hesper' }).hover();
  await s.page.getByRole('tooltip', { name: 'Hesper · 6 cases' }).waitFor();
  await s.ctx.close();
});

test('E-21 gestes : glisser la carte déplace Port-Sel ; « Recentrer » le remet', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea', 1200, 800);
  await ouvrirGalaxie(s, m);
  const pos = async () => (await s.page.getByRole('button', { name: 'Port-Sel' }).boundingBox()).x as number;
  const x0 = await pos();
  await s.page.mouse.move(500, 600);
  await s.page.mouse.down();
  await s.page.mouse.move(400, 600, { steps: 8 });
  await s.page.mouse.up();
  const x1 = await pos();
  assert.ok(Math.abs(x1 - (x0 - 100)) < 8, `déplacé d’environ −100 px (avant ${x0}, après ${x1})`);
  await s.page.getByRole('button', { name: 'Recentrer' }).click();
  await s.page.waitForFunction((x: number) => true, x0);
  const x2 = await pos();
  assert.ok(Math.abs(x2 - x0) < 8, `recentré (avant ${x0}, après ${x2})`);
  await s.ctx.close();
});

test('B-68 : le lien ?systeme=vael ouvre la carte, le panneau de « Vael » ouvert ; « Copier le lien » dit « Lien copié » et copie l’adresse', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  await ouvrirGalaxie(s, m, '?systeme=vael');
  await s.page.getByText('7 cases depuis Port-Sel').waitFor();
  await s.page.getByRole('button', { name: /Copier le lien/ }).click();
  await s.page.getByText('Lien copié').waitFor();
  const presse = await s.page.evaluate(() => navigator.clipboard.readText());
  assert.ok(presse.endsWith(adresse(m, '?systeme=vael')), presse);
  assert.ok(!/coordonn|"q"|nom=/.test(presse), 'aucun contenu dans l’adresse');
  await s.page.screenshot({ path: '/tmp/shots/galaxie-lien.png' });
  await s.ctx.close();
});

test('B-68 / E-21 : ?systeme=station-fantome donne « Page introuvable. » à Léa, et Antor l’ouvre', opts, async () => {
  const m = await monde();
  const lea = await session(m, 'lea');
  await lea.page.goto(adresse(m, '?systeme=station-fantome'));
  await lea.page.getByText('Page introuvable.').waitFor();
  assert.ok(!(await lea.page.locator('body').innerText()).includes('fantôme'));
  const antor = await session(m, 'antor', 1200, 800);
  await ouvrirGalaxie(antor, m, '?systeme=station-fantome');
  await antor.page.getByRole('heading', { name: 'Station fantôme' }).waitFor();
  await lea.ctx.close();
  await antor.ctx.close();
});

test('B-70 / E-21 : Teo (sans rôle), Léa sur galaxie cachée, Léa outil désactivé : « Page introuvable. » et le code de la carte n’est jamais demandé', opts, async () => {
  const m = await monde();
  // référence : le code que charge la carte pour Léa
  const ref = await session(m, 'lea');
  await ouvrirGalaxie(ref, m);
  const dedans = new Set(ref.assets);
  await ref.ctx.close();
  const vide = await session(m, 'teo');
  await vide.page.goto(adresse(m));
  await vide.page.getByText('Page introuvable.').waitFor();
  await vide.page.waitForLoadState('networkidle');
  const commun = new Set(vide.assets);
  const code = [...dedans].filter((a) => !commun.has(a));
  assert.ok(code.length > 0, 'la carte charge au moins un fichier de code propre pour un compte autorisé');
  await vide.ctx.close();

  sql(m, 'UPDATE swn_galaxies SET visible = 0');
  const cachee = await session(m, 'lea');
  await cachee.page.goto(adresse(m));
  await cachee.page.getByText('Page introuvable.').waitFor();
  await cachee.page.waitForLoadState('networkidle');
  for (const a of code) assert.ok(!cachee.assets.includes(a), `galaxie cachée : ${a} demandé`);
  await cachee.ctx.close();

  sql(m, 'UPDATE swn_galaxies SET visible = 1');
  assert.equal(await put(m, 'antor', `/api/systemes/${m.sid}/outils/swn/galaxie/activation`, { active: false }), 204);
  const off = await session(m, 'lea');
  await off.page.goto(adresse(m));
  await off.page.getByText('Page introuvable.').waitFor();
  await off.page.waitForLoadState('networkidle');
  for (const a of code) assert.ok(!off.assets.includes(a), `outil désactivé : ${a} demandé`);
  await off.page.screenshot({ path: '/tmp/shots/galaxie-outil-desactive.png' });
  await off.ctx.close();
});

test('E-10 / B-71 : la liste Cartes porte « Galaxie d’essai » avec « Galaxie » ; cachée : « MJ seul » pour Antor, absente pour Léa', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor', 1200, 800);
  await antor.page.goto(`/univers/${m.uid}/cartes`);
  await antor.page.getByRole('link', { name: /Galaxie d'essai/ }).waitFor();
  let t = await texteDe(antor.page);
  assert.match(t, /Galaxie d'essai/);
  assert.match(t, /Galaxie\b/);
  assert.ok(!t.includes('MJ seul'));
  sql(m, 'UPDATE swn_galaxies SET visible = 0');
  await antor.page.reload();
  await antor.page.getByRole('link', { name: /Galaxie d'essai/ }).waitFor();
  t = await texteDe(antor.page);
  assert.match(t, /MJ seul/);
  await antor.page.screenshot({ path: '/tmp/shots/e10-antor-cachee.png' });
  const lea = await session(m, 'lea');
  await lea.page.goto(`/univers/${m.uid}/cartes`);
  await lea.page.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
  await lea.page.waitForLoadState('networkidle');
  assert.ok(!(await texteDe(lea.page)).includes("Galaxie d'essai"));
  await antor.ctx.close();
  await lea.ctx.close();
});

test('E-21 refus : Antor en mode Joueur sur une galaxie cachée : « Cette carte n’est pas visible des joueurs. »', opts, async () => {
  const m = await monde();
  sql(m, 'UPDATE swn_galaxies SET visible = 0');
  const s = await session(m, 'antor', 1200, 800);
  await s.page.goto(adresse(m));
  await s.page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await s.page.getByText('Mode Joueur', { exact: true }).click();
  await s.page.getByText("Cette carte n'est pas visible des joueurs.").or(s.page.getByText('Cette carte n’est pas visible des joueurs.')).waitFor();
  await s.page.screenshot({ path: '/tmp/shots/galaxie-mode-joueur-cachee.png' });
  await s.ctx.close();
});

test('E-21 état vide : Léa, aucun système lisible : « Rien à voir sur cette carte pour l’instant. »', opts, async () => {
  const m = await monde();
  sql(m, 'UPDATE swn_systemes SET secret = 1');
  const s = await session(m, 'lea');
  await s.page.goto(adresse(m));
  await s.page.getByRole('heading', { name: "Galaxie d'essai", level: 1 }).waitFor();
  await s.page.getByText(/Rien à voir sur cette carte pour l.instant\./).waitFor();
  await s.page.screenshot({ path: '/tmp/shots/galaxie-vide.png' });
  await s.ctx.close();
});

test('E-21 hors ligne : la vue reste, « Connexion perdue. », « Calculer » et la recherche inactifs, « Copier le lien » reste actif', opts, async () => {
  const m = await monde();
  const s = await session(m, 'lea');
  await ouvrirGalaxie(s, m, '?systeme=vael');
  await s.page.getByText('7 cases depuis Port-Sel').waitFor();
  await choisir(s.page, 'Départ', 'Port', 'Port-Sel');
  await choisir(s.page, 'Arrivée', 'Vae', 'Vael');
  await s.ctx.setOffline(true);
  await s.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await s.page.getByText('Connexion perdue.', { exact: true }).waitFor();
  assert.equal(await s.page.getByRole('button', { name: 'Calculer' }).getAttribute('aria-disabled'), 'true');
  const champ = s.page.getByLabel('Rechercher un système', { exact: true }).first();
  assert.ok((await champ.isDisabled()) || (await champ.getAttribute('aria-disabled')) === 'true');
  assert.ok(await s.page.getByRole('button', { name: 'Vael' }).first().isVisible(), 'la vue affichée reste');
  await s.page.getByRole('button', { name: /Copier le lien/ }).click();
  await s.page.getByText('Lien copié').waitFor();
  await s.page.screenshot({ path: '/tmp/shots/galaxie-hors-ligne.png' });
  await s.ctx.close();
});
