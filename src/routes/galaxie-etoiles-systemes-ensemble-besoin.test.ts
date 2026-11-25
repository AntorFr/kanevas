// Black-box tests of the feature kanevas-carte-rendu-galaxie-systemes (B-117 first part, AD-rendu-2 migration), written from its
// sheet (« Livre », exit criterion), docs/parcours.md (B-117, P-28, P-30), docs/donnees.md (the conversion table) and docs/ecrans.md
// (E-21) — not from the code. Real server in stub mode WITH its starting world (« Éneria d'essai », « Galaxie d'essai »: Port-Sel (0,0),
// Vael (7,0), Hesper (1,5), « Station fantôme » secret), real SQLite, real routes. Expected values are literals of the doc.
//
// TEST PLAN
//   migration   : sizes 1..5 -> 0.15 0.45 0.75 0.9 1 ; six names -> #8b9bf0 #3fc79a #f2a33c #ec7b6f #ebecf0, neutre -> null ;
//                 classe/voile null ; zones affichage_defaut 1 ; the rest of the row kept ; replay of an old atlas = migrated row
//   écriture    : PATCH round trip classe/taille/couleur ; "violet" -> 400 invalide champ couleur, nothing stored ; bords taille 0 / 1 /
//                 -0.01 / 1.01 ; classe V accepted, Z refused ; aliases petite/moyenne/grande, ambre ; POST ; import (PUT)
//   lecture     : blocs give classe + taille per drawn star ; two defined systems without class differ ; classe/taille/couleur on blocs and panel
//   droits      : a hidden system gives nothing (404 identical to unknown), a Player reads the fields of a readable one, cannot write
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
  base: string; E: number; gid: number; G: string; dbPath: string;
  api: (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  imp: (methode: string, corps?: unknown, galerie?: number) => Promise<Rep>;
}

async function monde(): Promise<Monde> {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-etoiles-sys-'));
  tmp.push(dir);
  const dbPath = join(dir, 'k.db');
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
  const G = `/api/univers/${E}/outils/swn/galaxie/galaxies/${gid}`;
  const jeton = await srv.jetonOutils('antor', E, 'Script étoiles', ['swn/galaxie']);
  const imp = async (methode: string, corps?: unknown, galerie: number = gid): Promise<Rep> =>
    lire(await fetch(`${srv.base}/api/import/v1/univers/${E}/outils/swn/galaxie/galaxies/${galerie}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) }));
  return { base: srv.base, E, gid, G, dbPath, api, imp };
}

const FENETRE = '/blocs?de=-2,-2&a=2,2';
const systemeDes = (rep: Rep, cle: string): Any => (rep.json.systemes as Any[]).find((s) => s.cle === cle);
const lireSysteme = async (m: Monde, compte: string, cle: string): Promise<Rep> => m.api(compte, 'GET', `${m.G}/systemes/${cle}`);
async function place(m: Monde, corps: Any): Promise<Rep> {
  return m.api('antor', 'POST', `${m.G}/systemes`, corps);
}
async function version(m: Monde, cle: string): Promise<number> {
  return (await lireSysteme(m, 'antor', cle)).json.version as number;
}
const patch = async (m: Monde, cle: string, champs: Any): Promise<Rep> =>
  m.api('antor', 'PATCH', `${m.G}/systemes/${cle}`, { ...champs, version: await version(m, cle) });

// ---------------------------------------------------------------- migration (the base of the previous schema)

/** A database at the schema BEFORE the slice's migration (every numbered file but the last), filled with old-format rows, then migrated. */
function baseAvant(): { db: Database.Database; dernier: string; rejouer: () => number[] } {
  const racine = join(process.cwd(), 'src/db/migrations');
  const fichiers = readdirSync(racine).filter((f) => /^\d{4}-.+\.sql$/.test(f)).sort();
  const dernier = fichiers[fichiers.length - 1]!;
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-montee-'));
  tmp.push(dir);
  const avant = join(dir, 'avant/');
  const tout = join(dir, 'tout/');
  for (const f of fichiers) {
    if (f !== dernier) cpSync(join(racine, f), join(avant, f));
    cpSync(join(racine, f), join(tout, f));
  }
  const db = openDb(join(dir, 'k.db'));
  migrate(db, avant);
  return { db, dernier, rejouer: () => migrate(db, tout) };
}
function remplir(db: Database.Database): void {
  db.prepare("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U', 'x', 'uu')").run();
  db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, graine) VALUES (1, 1, 'G', 'g')").run();
  const noms = ['accent', 'table', 'ambre', 'danger', 'neutre', 'clair'];
  for (let t = 1; t <= 5; t++) {
    db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu, version) VALUES (1, 1, ?, ?, ?, 0, ?, ?, 'une note', ?, 0, 4)")
      .run(`taille-${t}`, `Taille ${t}`, t, t, noms[t - 1], t === 3 ? 1 : 0);
  }
  noms.forEach((c, i) => {
    db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur) VALUES (1, 1, ?, ?, ?, 1, 2, ?)").run(`couleur-${c}`, `Couleur ${c}`, i, c);
  });
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour) VALUES (1, 1, 'zone', 'Zone', '[[0,0],[3,0],[3,3]]')").run();
}

describe('B-117 migration : une base du schéma précédent est convertie en valeurs fixes', () => {
  it('les tailles 1 à 5 deviennent 0.15, 0.45, 0.75, 0.9 et 1', () => {
    const { db, rejouer } = baseAvant();
    remplir(db);
    rejouer();
    const lues = [1, 2, 3, 4, 5].map((t) => (db.prepare('SELECT taille FROM swn_systemes WHERE cle = ?').get(`taille-${t}`) as Any).taille);
    assert.deepEqual(lues, [0.15, 0.45, 0.75, 0.9, 1]);
    db.close();
  });

  it('les noms de couleur deviennent #8b9bf0, #3fc79a, #f2a33c, #ec7b6f, #ebecf0 et neutre devient null', () => {
    const { db, rejouer } = baseAvant();
    remplir(db);
    rejouer();
    const c = (nom: string) => (db.prepare('SELECT couleur FROM swn_systemes WHERE cle = ?').get(`couleur-${nom}`) as Any).couleur;
    assert.deepEqual(['accent', 'table', 'ambre', 'danger', 'clair', 'neutre'].map(c), ['#8b9bf0', '#3fc79a', '#f2a33c', '#ec7b6f', '#ebecf0', null]);
    db.close();
  });

  it('la classe et le voile des lignes migrées sont null, l’affichage par défaut des zones vaut 1, le reste de la ligne est gardé', () => {
    const { db, rejouer } = baseAvant();
    remplir(db);
    rejouer();
    const l = db.prepare("SELECT classe, voile, nom, q, r, notes, secret, promu, version FROM swn_systemes WHERE cle = 'taille-3'").get() as Any;
    assert.deepEqual(l, { classe: null, voile: null, nom: 'Taille 3', q: 3, r: 0, notes: 'une note', secret: 1, promu: 0, version: 4 });
    assert.equal((db.prepare("SELECT affichage_defaut FROM swn_zones WHERE cle = 'zone'").get() as Any).affichage_defaut, 1);
    assert.equal((db.prepare('SELECT count(*) AS n FROM swn_systemes').get() as Any).n, 11);
    db.close();
  });

  it('la migration jouée une seconde fois ne change aucune ligne', () => {
    const { db, rejouer } = baseAvant();
    remplir(db);
    rejouer();
    const avant = JSON.stringify(db.prepare('SELECT * FROM swn_systemes ORDER BY id').all());
    assert.deepEqual(rejouer(), []);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM swn_systemes ORDER BY id').all()), avant);
    db.close();
  });

  it('une base sans aucun système se migre', () => {
    const { db, rejouer } = baseAvant();
    assert.equal(rejouer().length, 1);
    assert.equal((db.prepare('SELECT count(*) AS n FROM swn_systemes').get() as Any).n, 0);
    db.close();
  });
});

describe('B-117 écriture : classe, taille et couleur par les routes de la galaxie', () => {
  it('PATCH enregistre classe, taille et couleur et les relit à l’identique (panneau et blocs)', async () => {
    const m = await monde();
    const r = await patch(m, 'vael', { classe: 'B', taille: 0.8, couleur: '#d8352a' });
    assert.equal(r.status, 200, r.texte);
    const p = (await lireSysteme(m, 'antor', 'vael')).json;
    assert.equal(p.classe, 'B');
    assert.equal(p.taille, 0.8);
    assert.equal(p.couleur, '#d8352a');
    const b = systemeDes(await m.api('antor', 'GET', m.G + FENETRE), 'vael');
    assert.equal(b.classe, 'B');
    assert.equal(b.taille, 0.8);
    assert.equal(b.couleur, '#d8352a');
  });

  it('PATCH refuse couleur « violet » en invalide avec champ couleur et ne change rien', async () => {
    const m = await monde();
    await patch(m, 'vael', { classe: 'K', taille: 0.3, couleur: '#102030' });
    const r = await patch(m, 'vael', { couleur: 'violet' });
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.code ?? r.json.erreur, 'invalide');
    assert.equal(r.json.champ, 'couleur');
    const p = (await lireSysteme(m, 'antor', 'vael')).json;
    assert.deepEqual([p.classe, p.taille, p.couleur], ['K', 0.3, '#102030']);
  });

  it('PATCH refuse une couleur de six chiffres sans dièse et une de trois chiffres', async () => {
    const m = await monde();
    for (const c of ['d8352a', '#fff', '#12345g']) {
      const r = await patch(m, 'vael', { couleur: c });
      assert.equal(r.status, 400, `${c} : ${r.texte}`);
      assert.equal(r.json.champ, 'couleur', c);
    }
  });

  it('PATCH accepte les tailles 0 et 0.99 et refuse -0.01 et 1.01 avec champ taille', async () => {
    const m = await monde();
    for (const t of [0, 0.99]) {
      assert.equal((await patch(m, 'vael', { taille: t })).status, 200, `taille ${t}`);
      assert.equal((await lireSysteme(m, 'antor', 'vael')).json.taille, t);
    }
    for (const t of [-0.01, 1.01]) {
      const r = await patch(m, 'vael', { taille: t });
      assert.equal(r.status, 400, `taille ${t}`);
      assert.equal(r.json.champ, 'taille');
    }
    assert.equal((await lireSysteme(m, 'antor', 'vael')).json.taille, 0.99);
  });

  it('PATCH refuse une taille qui n’est pas un nombre avec champ taille', async () => {
    const m = await monde();
    const r = await patch(m, 'vael', { taille: 'immense' });
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.champ, 'taille');
  });

  it('PATCH accepte chacune des sept classes M, K, G, F, A, B, V et refuse Z avec champ classe', async () => {
    const m = await monde();
    for (const c of ['M', 'K', 'G', 'F', 'A', 'B', 'V']) {
      assert.equal((await patch(m, 'vael', { classe: c })).status, 200, `classe ${c}`);
      assert.equal((await lireSysteme(m, 'antor', 'vael')).json.classe, c);
    }
    const r = await patch(m, 'vael', { classe: 'Z' });
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.champ, 'classe');
    assert.equal((await lireSysteme(m, 'antor', 'vael')).json.classe, 'V');
  });

  it('les anciens alias sont gardés : petite, moyenne, grande donnent 0.15, 0.45, 0.75 ; ambre donne #f2a33c ; l’entier 5 donne 1', async () => {
    const m = await monde();
    const lus: number[] = [];
    for (const t of ['petite', 'moyenne', 'grande']) {
      assert.equal((await patch(m, 'vael', { taille: t })).status, 200, t);
      lus.push((await lireSysteme(m, 'antor', 'vael')).json.taille);
    }
    assert.deepEqual(lus, [0.15, 0.45, 0.75]);
    assert.equal((await patch(m, 'vael', { taille: 5 })).status, 200);
    assert.equal((await lireSysteme(m, 'antor', 'vael')).json.taille, 1);
    assert.equal((await patch(m, 'vael', { couleur: 'ambre' })).status, 200);
    assert.equal((await lireSysteme(m, 'antor', 'vael')).json.couleur, '#f2a33c');
  });

  it('POST place un système avec classe, taille et couleur libre, et refuse « violet » sans rien créer', async () => {
    const m = await monde();
    const r = await place(m, { nom: 'Nouvelle étoile', q: 3, r: 3, classe: 'A', taille: 0.5, couleur: '#00ff88' });
    assert.equal(r.status, 201, r.texte);
    const p = (await lireSysteme(m, 'antor', r.json.cle)).json;
    assert.deepEqual([p.classe, p.taille, p.couleur], ['A', 0.5, '#00ff88']);
    const refus = await place(m, { nom: 'Mauvaise', q: 4, r: 3, couleur: 'violet' });
    assert.equal(refus.status, 400, refus.texte);
    assert.equal(refus.json.champ, 'couleur');
    assert.equal((await lireSysteme(m, 'antor', 'mauvaise')).status, 404);
  });

  it('l’import d’atlas accepte classe, taille et couleur, les relit, et un rejeu identique ne change rien', async () => {
    const m = await monde();
    const corps = { systemes: [{ cle: 'import-un', nom: 'Import un', q: 9, r: 9, classe: 'F', taille: 0.25, couleur: '#a1b2c3' }] };
    const r = await m.imp('PUT', corps);
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.natures.systemes.creees, 1);
    const p = (await lireSysteme(m, 'antor', 'import-un')).json;
    assert.deepEqual([p.classe, p.taille, p.couleur], ['F', 0.25, '#a1b2c3']);
    const rejeu = await m.imp('PUT', corps);
    assert.equal(rejeu.json.natures.systemes.inchangees, 1);
    assert.equal(rejeu.json.natures.systemes.mises_a_jour, 0);
  });

  it('l’import refuse « violet » avec le champ du système et laisse passer les autres', async () => {
    const m = await monde();
    const r = await m.imp('PUT', { systemes: [
      { cle: 'bon', nom: 'Bon', q: 8, r: 8 },
      { cle: 'mauvais', nom: 'Mauvais', q: 9, r: 8, couleur: 'violet' },
    ] });
    assert.equal(r.json.natures.systemes.creees, 1, r.texte);
    assert.equal(r.json.natures.systemes.refusees, 1);
    assert.match(r.texte, /systemes\[1\]\.couleur/);
    assert.equal((await lireSysteme(m, 'antor', 'mauvais')).status, 404);
  });

  it('rejouer un atlas de l’ancien format (taille moyenne, couleur ambre) donne la même ligne que la ligne migrée de taille 2 et couleur ambre', async () => {
    const m = await monde();
    const r = await m.imp('PUT', { systemes: [{ cle: 'ancien', nom: 'Ancien', q: 8, r: 8, taille: 'moyenne', couleur: 'ambre' }] });
    assert.equal(r.status, 200, r.texte);
    const p = (await lireSysteme(m, 'antor', 'ancien')).json;
    assert.deepEqual([p.taille, p.couleur, p.classe ?? null], [0.45, '#f2a33c', null]);
  });
});

describe('B-117 lecture : les blocs portent classe et taille de chaque étoile tirée, deux systèmes définis diffèrent', () => {
  it('chaque étoile tirée de GET blocs a une taille (nombre entre 0 et 2.1) et une classe parmi M, K, G, F, A, B', async () => {
    const m = await monde();
    const r = await m.api('antor', 'GET', `${m.G}/blocs?de=-3,-3&a=3,3`);
    const tirees = (r.json.blocs as Any[]).flatMap((b) => b.generes as Any[]);
    assert.ok(tirees.length > 20, `des étoiles sont tirées (${tirees.length})`);
    for (const e of tirees) {
      assert.equal(e.length, 4, JSON.stringify(e));
      assert.ok(Number.isInteger(e[0]) && Number.isInteger(e[1]));
      assert.ok(typeof e[2] === 'number' && e[2] >= 0 && e[2] <= 2.1, `taille ${e[2]}`);
      assert.ok(['M', 'K', 'G', 'F', 'A', 'B'].includes(e[3]), `classe ${e[3]}`);
    }
    assert.ok(new Set(tirees.map((e) => e[3])).size >= 3, 'plusieurs classes différentes sont tirées');
  });

  it('les classes et tailles tirées sont les mêmes à chaque lecture et pour la Joueuse que pour le MJ', async () => {
    const m = await monde();
    const f = '/blocs?de=0,0&a=0,0';
    const a = (await m.api('antor', 'GET', m.G + f)).json.blocs[0].generes;
    const b = (await m.api('antor', 'GET', m.G + f)).json.blocs[0].generes;
    const l = (await m.api('lea', 'GET', m.G + f)).json.blocs[0].generes;
    assert.deepEqual(b, a);
    assert.deepEqual(l, a);
  });

  it('des systèmes placés sans classe ni taille, de clés différentes, ne portent pas tous la même classe et la même taille', async () => {
    const m = await monde();
    const noms = ['Alpha', 'Bravo', 'Cirrus', 'Delta', 'Écho', 'Foxtrot'];
    const lues: string[] = [];
    for (const [i, nom] of noms.entries()) {
      const r = await place(m, { nom, q: -9 - i, r: 9 });
      assert.equal(r.status, 201, r.texte);
    }
    const b = await m.api('antor', 'GET', `${m.G}/blocs?de=-3,-1&a=0,1`);
    for (const nom of noms) {
      const s = systemeDes(b, nom.toLowerCase().replace('é', 'e'));
      assert.ok(s, nom);
      assert.ok(typeof s.taille === 'number' && s.taille >= 0 && s.taille <= 1, `taille ${s.taille}`);
      lues.push(`${s.classe}|${s.taille}`);
    }
    assert.ok(new Set(lues).size >= 2, `deux systèmes au moins diffèrent : ${lues.join(' ; ')}`);
  });

  it('un système placé sans couleur n’a pas de couleur libre : la couleur est facultative et la classe de la carte reste visible', async () => {
    const m = await monde();
    const r = await place(m, { nom: 'Sans couleur', q: 5, r: 9 });
    assert.equal(r.status, 201, r.texte);
    const p = (await lireSysteme(m, 'antor', 'sans-couleur')).json;
    assert.equal(p.couleur ?? null, null);
    const s = systemeDes(await m.api('antor', 'GET', `${m.G}/blocs?de=0,0&a=1,1`), 'sans-couleur');
    assert.equal(s.couleur ?? null, null);
  });
});

describe('B-117 droits : ces champs ne sont lisibles que sous la garde du système', () => {
  it('un système caché n’apparaît pas pour la Joueuse dans les blocs et son panneau répond comme un inconnu, octet pour octet', async () => {
    const m = await monde();
    await patch(m, 'station-fantome', { classe: 'B', taille: 0.9, couleur: '#123456' });
    const b = await m.api('lea', 'GET', m.G + FENETRE);
    assert.equal(systemeDes(b, 'station-fantome'), undefined);
    assert.ok(!b.texte.includes('#123456') && !b.texte.includes('Station fantôme'));
    const cache = await lireSysteme(m, 'lea', 'station-fantome');
    const inconnu = await lireSysteme(m, 'lea', 'systeme-qui-n-existe-pas');
    assert.equal(cache.status, 404);
    assert.equal(cache.texte, inconnu.texte);
  });

  it('un système caché garde ses champs pour le MJ mais pas pour le MJ en mode Joueur', async () => {
    const m = await monde();
    await patch(m, 'station-fantome', { classe: 'B', taille: 0.9, couleur: '#123456' });
    assert.equal((await lireSysteme(m, 'antor', 'station-fantome')).json.couleur, '#123456');
    const enMode = await m.api('antor', 'GET', `${m.G}/systemes/station-fantome?mode=joueur`);
    assert.equal(enMode.status, 404);
    assert.ok(!enMode.texte.includes('#123456'));
    const blocs = await m.api('antor', 'GET', `${m.G}${FENETRE}&mode=joueur`);
    assert.ok(!blocs.texte.includes('#123456'));
  });

  it('la Joueuse lit classe, taille et couleur d’un système qu’elle lit, et ne peut pas les écrire', async () => {
    const m = await monde();
    await patch(m, 'vael', { classe: 'A', taille: 0.6, couleur: '#abcdef' });
    const p = (await lireSysteme(m, 'lea', 'vael')).json;
    assert.deepEqual([p.classe, p.taille, p.couleur], ['A', 0.6, '#abcdef']);
    const s = systemeDes(await m.api('lea', 'GET', m.G + FENETRE), 'vael');
    assert.deepEqual([s.classe, s.taille, s.couleur], ['A', 0.6, '#abcdef']);
    const ecrit = await m.api('lea', 'PATCH', `${m.G}/systemes/vael`, { couleur: '#000000', version: p.version });
    assert.equal(ecrit.status, 403, ecrit.texte);
    assert.equal((await lireSysteme(m, 'antor', 'vael')).json.couleur, '#abcdef');
  });

  it('la Joueuse qui écrit sur un système caché reçoit le même refus qu’un inconnu et rien n’est changé', async () => {
    const m = await monde();
    const a = await m.api('lea', 'PATCH', `${m.G}/systemes/station-fantome`, { couleur: '#000000', version: 1 });
    const b = await m.api('lea', 'PATCH', `${m.G}/systemes/inconnu-total`, { couleur: '#000000', version: 1 });
    assert.equal(a.status, b.status);
    assert.equal(a.texte, b.texte);
    assert.notEqual((await lireSysteme(m, 'antor', 'station-fantome')).json.couleur, '#000000');
  });

  it('le MJ en mode Joueur ne peut pas écrire ces champs', async () => {
    const m = await monde();
    const v = await version(m, 'vael');
    const r = await m.api('antor', 'PATCH', `${m.G}/systemes/vael?mode=joueur`, { couleur: '#000000', version: v });
    assert.equal(r.status, 403, r.texte);
    assert.notEqual((await lireSysteme(m, 'antor', 'vael')).json.couleur, '#000000');
  });
});
