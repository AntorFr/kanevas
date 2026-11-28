// Second black-box pass (verification) of kanevas-carte-rendu-galaxie-systemes, written from its sheet (« Livre », exit criterion),
// docs/parcours.md (B-117, P-28, P-30), docs/donnees.md (conversion table, defaults) and the contract of the blocks route in ARCHITECTURE.md —
// not from the code. Same world as galaxie-etoiles-systemes-ensemble-besoin.test.ts (stub server WITH its starting world: Port-Sel (0,0),
// Vael (7,0), Hesper (1,5), « Station fantôme » secret). Expected values are literals of the doc.
//
// TEST PLAN
//   migration : routes, bodies and zone of a system survive the rebuild, the ids are kept, foreign_key_check is empty
//   écriture  : whole number 1 is the old size (0.15), 2/3/4 the old sizes 0.45/0.75/0.9, 0.9999 is kept ; null and « neutre » clear the colour,
//               null clears the class ; the other old names ; a refused field leaves the valid ones of the same request unwritten ;
//               a defined system placed without class keeps class null and the default size 0.45 ; Vortexis = class V and a colour ;
//               the import refuses class Z and size 1.5 with their path, and replays an old-format atlas to the same row twice
//   lecture   : every drawn star of the blocks has a size in [0, 1] (the scale of a defined system) and one class of the six drawn ones
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrate, openDb } from '../db/db.js';
import { startServer, type Any, type Server } from '../e2e/harnais.test.js';

const servers: Server[] = [];
const tmp: string[] = [];
after(() => { servers.forEach((s) => s.stop()); tmp.forEach((d) => rmSync(d, { recursive: true, force: true })); });

interface Rep { status: number; json: Any; texte: string }
interface Monde {
  G: string;
  api: (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  imp: (methode: string, corps?: unknown) => Promise<Rep>;
}

async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  const lire = async (r: Response): Promise<Rep> => {
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    return lire(await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) }));
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const gid = (await api('antor', 'GET', `/api/univers/${E}/cartes`)).json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id as number;
  const jeton = await srv.jetonOutils('antor', E, 'Script vérification', ['swn/galaxie']);
  const imp = async (methode: string, corps?: unknown): Promise<Rep> =>
    lire(await fetch(`${srv.base}/api/import/v1/univers/${E}/outils/swn/galaxie/galaxies/${gid}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) }));
  return { G: `/api/univers/${E}/outils/swn/galaxie/galaxies/${gid}`, api, imp };
}

const lireSysteme = (m: Monde, cle: string): Promise<Rep> => m.api('antor', 'GET', `${m.G}/systemes/${cle}`);
const patch = async (m: Monde, cle: string, champs: Any): Promise<Rep> =>
  m.api('antor', 'PATCH', `${m.G}/systemes/${cle}`, { ...champs, version: (await lireSysteme(m, cle)).json.version });

describe('B-117 migration : les lignes rattachées à un système survivent à la reconstruction', () => {
  it('routes, astre et zone gardés, identifiants gardés, foreign_key_check vide', () => {
    const racine = join(process.cwd(), 'src/db/migrations');
    const fichiers = readdirSync(racine).filter((f) => /^\d{4}-.+\.sql$/.test(f)).sort();
    const dir = mkdtempSync(join(tmpdir(), 'kanevas-montee-verif-'));
    tmp.push(dir);
    for (const f of fichiers) {
      if (f !== fichiers[fichiers.length - 1]) cpSync(join(racine, f), join(dir, 'avant', f));
      cpSync(join(racine, f), join(dir, 'tout', f));
    }
    const db: Database.Database = openDb(join(dir, 'k.db'));
    migrate(db, join(dir, 'avant/'));
    db.prepare("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U', 'x', 'uu')").run();
    db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, graine) VALUES (1, 1, 'G', 'g')").run();
    db.prepare("INSERT INTO swn_systemes (id, galaxie_id, univers_id, cle, nom, q, r, taille, couleur) VALUES (11, 1, 1, 'a', 'A', 0, 0, 3, 'ambre')").run();
    db.prepare("INSERT INTO swn_systemes (id, galaxie_id, univers_id, cle, nom, q, r, taille, couleur) VALUES (12, 1, 1, 'b', 'B', 4, 0, 5, 'neutre')").run();
    db.prepare("INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (1, 1, 11, 12, 1, 4)").run();
    db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, nom, heure, taille) VALUES (11, 'soleil', 'etoile', 'naine', 'Soleil', 0, 1)").run();
    db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour) VALUES (1, 1, 'z', 'Z', '[[0,0],[3,0],[3,3]]')").run();
    migrate(db, join(dir, 'tout/'));
    assert.deepEqual(db.prepare('SELECT id, cle, taille, couleur FROM swn_systemes ORDER BY id').all(),
      [{ id: 11, cle: 'a', taille: 0.75, couleur: '#f2a33c' }, { id: 12, cle: 'b', taille: 1, couleur: null }]);
    assert.deepEqual(db.prepare('SELECT depuis_id, vers_id, longueur FROM swn_routes').all(), [{ depuis_id: 11, vers_id: 12, longueur: 4 }]);
    assert.deepEqual(db.prepare('SELECT systeme_id, cle FROM swn_astres').all(), [{ systeme_id: 11, cle: 'soleil' }]);
    assert.equal((db.prepare('SELECT count(*) AS n FROM swn_zones').get() as Any).n, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
  });
});

describe('B-117 écriture : bords et alias de la table de conversion', () => {
  it('l’entier 1 est l’ancienne taille 1 (0.15), 2, 3 et 4 sont 0.45, 0.75 et 0.9, 0.9999 est gardé', async () => {
    const m = await monde();
    const lues: number[] = [];
    for (const t of [1, 2, 3, 4, 0.9999]) {
      assert.equal((await patch(m, 'vael', { taille: t })).status, 200, `taille ${t}`);
      lues.push((await lireSysteme(m, 'vael')).json.taille);
    }
    assert.deepEqual(lues, [0.15, 0.45, 0.75, 0.9, 0.9999]);
  });

  it('les noms accent, table, danger et clair donnent #8b9bf0, #3fc79a, #ec7b6f, #ebecf0', async () => {
    const m = await monde();
    const lues: string[] = [];
    for (const c of ['accent', 'table', 'danger', 'clair']) {
      assert.equal((await patch(m, 'vael', { couleur: c })).status, 200, c);
      lues.push((await lireSysteme(m, 'vael')).json.couleur);
    }
    assert.deepEqual(lues, ['#8b9bf0', '#3fc79a', '#ec7b6f', '#ebecf0']);
  });

  it('« neutre » et null effacent la couleur libre, null efface la classe', async () => {
    const m = await monde();
    await patch(m, 'vael', { couleur: '#102030', classe: 'F' });
    assert.equal((await patch(m, 'vael', { couleur: 'neutre' })).status, 200);
    assert.equal((await lireSysteme(m, 'vael')).json.couleur ?? null, null);
    await patch(m, 'vael', { couleur: '#102030' });
    assert.equal((await patch(m, 'vael', { couleur: null, classe: null })).status, 200);
    const p = (await lireSysteme(m, 'vael')).json;
    assert.deepEqual([p.couleur ?? null, p.classe ?? null], [null, null]);
  });

  it('une requête dont un champ est refusé n’écrit pas les champs valides qui l’accompagnent', async () => {
    const m = await monde();
    await patch(m, 'vael', { classe: 'K', taille: 0.3, couleur: '#102030' });
    const r = await patch(m, 'vael', { classe: 'B', taille: 0.9, couleur: 'violet' });
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.champ, 'couleur');
    const p = (await lireSysteme(m, 'vael')).json;
    assert.deepEqual([p.classe, p.taille, p.couleur], ['K', 0.3, '#102030']);
  });

  it('un système posé sans classe garde la classe null et la taille par défaut 0.45', async () => {
    const m = await monde();
    const r = await m.api('antor', 'POST', `${m.G}/systemes`, { nom: 'Nue', q: 6, r: 6 });
    assert.equal(r.status, 201, r.texte);
    const p = (await lireSysteme(m, 'nue')).json;
    assert.deepEqual([p.classe ?? null, p.taille, p.couleur ?? null], [null, 0.45, null]);
  });

  it('Vortexis : la classe V et une couleur libre se portent ensemble', async () => {
    const m = await monde();
    assert.equal((await patch(m, 'vael', { classe: 'V', couleur: '#33ff99' })).status, 200);
    const p = (await lireSysteme(m, 'vael')).json;
    assert.deepEqual([p.classe, p.couleur], ['V', '#33ff99']);
  });
});

describe('B-117 import : refus avec chemin et rejeu de l’ancien format', () => {
  it('la classe Z et la taille 1.5 sont refusées avec le chemin du champ, les autres systèmes passent', async () => {
    const m = await monde();
    const r = await m.imp('PUT', { systemes: [
      { cle: 'ok', nom: 'Ok', q: 8, r: 8 },
      { cle: 'zz', nom: 'Zz', q: 9, r: 8, classe: 'Z' },
      { cle: 'gros', nom: 'Gros', q: 10, r: 8, taille: 1.5 },
    ] });
    assert.equal(r.json.natures.systemes.creees, 1, r.texte);
    assert.equal(r.json.natures.systemes.refusees, 2);
    assert.match(r.texte, /systemes\[1\]\.classe/);
    assert.match(r.texte, /systemes\[2\]\.taille/);
    assert.equal((await lireSysteme(m, 'zz')).status, 404);
    assert.equal((await lireSysteme(m, 'gros')).status, 404);
  });

  it('un atlas de l’ancien format (grande, danger / petite, neutre) donne 0.75, #ec7b6f / 0.15, null et se rejoue sans changement', async () => {
    const m = await monde();
    const atlas = { systemes: [
      { cle: 'vieux-un', nom: 'Vieux un', q: 8, r: 8, taille: 'grande', couleur: 'danger' },
      { cle: 'vieux-deux', nom: 'Vieux deux', q: 9, r: 8, taille: 'petite', couleur: 'neutre' },
    ] };
    const un = await m.imp('PUT', atlas);
    assert.equal(un.json.natures.systemes.creees, 2, un.texte);
    const a = (await lireSysteme(m, 'vieux-un')).json;
    const b = (await lireSysteme(m, 'vieux-deux')).json;
    assert.deepEqual([a.taille, a.couleur, b.taille, b.couleur ?? null], [0.75, '#ec7b6f', 0.15, null]);
    const deux = await m.imp('PUT', atlas);
    assert.equal(deux.json.natures.systemes.inchangees, 2, deux.texte);
    assert.equal(deux.json.natures.systemes.mises_a_jour, 0);
  });
});

describe('B-117 lecture : l’étoile tirée est sur l’échelle d’un système défini', () => {
  it('chaque étoile tirée des blocs a une taille dans [0, 1] et une classe parmi M, K, G, F, A, B', async () => {
    const m = await monde();
    const r = await m.api('antor', 'GET', `${m.G}/blocs?de=-3,-3&a=3,3`);
    const tirees = (r.json.blocs as Any[]).flatMap((b) => b.generes as Any[]);
    assert.ok(tirees.length > 20, `étoiles tirées : ${tirees.length}`);
    const hors = tirees.filter((e) => !(e[2] >= 0 && e[2] <= 1));
    assert.equal(hors.length, 0, `tailles hors [0, 1] : ${JSON.stringify(hors.slice(0, 5))}`);
    assert.ok(tirees.every((e) => ['M', 'K', 'G', 'F', 'A', 'B'].includes(e[3])));
  });
});
