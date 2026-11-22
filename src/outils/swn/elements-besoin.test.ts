import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Ensemble tests of kanevas-carte-spatiale-elements, written from the need (B-96, P-22.4, P-22.5, P-26, E-23 elements,
// E-9 line of an element, import nature `elements`), at the doors the screens call: the routes of the tool, the sheet read,
// the import API. Literal expectations. The screens (labels at 390 px, dialog wording) are not played here.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { creerFiche } = await import('../../services/fiches.js');
const { creerJeton } = await import('../../services/jetons.js');
const { trouverCompte } = await import('../../services/comptes.js');
const { creerGalaxie } = await import('../../services/swn/galaxies.js');
const { migrate, openDb } = await import('../../db/db.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type Who = 'antor' | 'lea' | null;
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
const all = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).all(...a) as any[];

async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

/** Éneria d'essai, one defined system (hexagon 42/43): a star and a planet « mere » at orbit 2, hour 4. */
async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h = { antor: await connecter(app, 'antor'), lea: await connecter(app, 'lea') };
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  app.db.prepare('UPDATE swn_galaxies SET visible = 1 WHERE id = ?').run(g);
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  const systeme = (cle: string, q: number, r: number, secret: number) => {
    const s = app.db.prepare(
      "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)")
      .run(g, E, cle, cle === 'ouvert' ? 'Vael' : 'Caché', q, r, secret).lastInsertRowid as number;
    const astre = (c: string, genre: string, type: string, orbite: number, heure: number) =>
      app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,1)').run(s, c, genre, type, orbite, heure);
    astre('etoile', 'etoile', 'naine_jaune', 0, 0); astre('mere', 'planete', 'rocheux', 2, 4);
    return s;
  };
  systeme('ouvert', 42, 43, 0);
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}`;
  const req = (who: Who, method: 'GET' | 'PUT' | 'DELETE' | 'POST' | 'PATCH', path: string, payload?: unknown) =>
    app.inject({ method, url: `${base}/${path}`, headers: who ? h[who] : {}, ...(payload === undefined ? {} : { payload: payload as object }) });
  const lire = async (who: Who, suite = '', hex = '42/43') => req(who, 'GET', `interieur/${hex}${suite}`);
  const vue = async (who: Who, suite = '') => { const r = await lire(who, suite); assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const ajouter = async (corps: Record<string, unknown>, hex = '42/43') => {
    const v = (await (await req('antor', 'GET', `interieur/${hex}`)).json());
    return req('antor', 'POST', `interieur/${hex}/elements`, { ...corps, versionSysteme: v.versionSysteme });
  };
  const fiche = (titre: string) => creerFiche(app.db, trouverCompte(app.db, 'antor')!.id, E, { type: 'lieu', titre, sections: [{ titre: 'Apparence', joueursLisent: true }] }).id as number;
  const fichePour = async (who: Who, fid: number, suite = '') =>
    (await app.inject({ method: 'GET', url: `/api/univers/${E}/fiches/${fid}${suite}`, headers: who ? h[who] : {} })).json();
  return { app, E, g, req, lire, vue, ajouter, systeme, fiche, fichePour };
}

test('B-96 nominal : le vaisseau posé sur une planète la suit quand la planète est déplacée, sans orbite ni heure propres', async () => {
  const w = await monde();
  const add = await w.ajouter({ genre: 'vaisseau', nom: 'Aube-Brisée', sur: 'mere' });
  assert.equal(add.statusCode, 201, add.body);
  let v = await w.vue('antor');
  assert.deepEqual([v.elements[0].nom, v.elements[0].sur, v.elements[0].orbite, v.elements[0].heure], ['Aube-Brisée', 'mere', 2, 4]);
  const mere = v.astres.find((a: any) => a.cle === 'mere');
  const mv = await w.req('antor', 'PATCH', 'interieur/42/43/astres/mere', { orbite: 5, heure: 9, version: mere.version, versionSysteme: v.versionSysteme });
  assert.equal(mv.statusCode, 200, mv.body);
  v = await w.vue('antor');
  assert.deepEqual([v.elements[0].sur, v.elements[0].orbite, v.elements[0].heure], ['mere', 5, 9]);
  assert.deepEqual(all(w.app, 'SELECT orbite, heure FROM swn_elements'), [{ orbite: null, heure: null }]);
  const lea = await w.vue('lea');
  assert.deepEqual([lea.elements[0].nom, lea.elements[0].orbite, lea.elements[0].heure], ['Aube-Brisée', 5, 9]);
});

test('B-96 nominal : un élément posé par orbite et heure, puis sur un astre, ne garde plus orbite ni heure', async () => {
  const w = await monde();
  const add = await w.ajouter({ genre: 'ville', nom: 'Port-Haut', orbite: 4, heure: 7 });
  assert.equal(add.statusCode, 201, add.body);
  assert.deepEqual(all(w.app, 'SELECT orbite, heure, astre_id FROM swn_elements'), [{ orbite: 4, heure: 7, astre_id: null }]);
  const v = await w.vue('antor');
  const el = v.elements[0];
  const put = await w.req('antor', 'PUT', `interieur/42/43/elements/${el.cle}/place`, { sur: 'mere', version: el.version, versionSysteme: v.versionSysteme });
  assert.equal(put.statusCode, 200, put.body);
  const rows = all(w.app, 'SELECT orbite, heure, astre_id FROM swn_elements');
  assert.deepEqual([rows[0].orbite, rows[0].heure, rows[0].astre_id !== null], [null, null, true]);
  assert.equal((await w.vue('antor')).elements[0].sur, 'mere');
});

test('B-96 bords : orbite 0 et heure 11,99 passent ; orbite -1, heure 12 et double lieu sont refusés, rien écrit', async () => {
  const w = await monde();
  assert.equal((await w.ajouter({ genre: 'base', nom: 'Limite', orbite: 0, heure: 11.99 })).statusCode, 201);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 1);
  for (const corps of [
    { genre: 'base', nom: 'Neg', orbite: -1, heure: 3 },
    { genre: 'base', nom: 'Midi', orbite: 2, heure: 12 },
    { genre: 'base', nom: 'Double', orbite: 2, heure: 3, sur: 'mere' },
    { genre: 'moto', nom: 'Genre', orbite: 2, heure: 3 },
  ]) {
    const r = await w.ajouter(corps);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `${corps.nom} -> ${r.statusCode}`);
  }
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 1);
});

test('B-96 bords : deux éléments au même lieu et sur le même corps sont acceptés, une description de 2 001 caractères est refusée', async () => {
  const w = await monde();
  for (const nom of ['Un', 'Deux']) assert.equal((await w.ajouter({ genre: 'vaisseau', nom, sur: 'mere' })).statusCode, 201);
  for (const nom of ['Trois', 'Quatre']) assert.equal((await w.ajouter({ genre: 'vaisseau', nom, orbite: 3, heure: 3 })).statusCode, 201);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 4);
  const ok = await w.ajouter({ genre: 'autre', nom: 'Pile', orbite: 1, heure: 1, description: 'x'.repeat(2000) });
  assert.equal(ok.statusCode, 201, ok.body);
  const trop = await w.ajouter({ genre: 'autre', nom: 'Trop', orbite: 1, heure: 1, description: 'x'.repeat(2001) });
  assert.equal(trop.statusCode, 400, trop.body);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 5);
});

test('B-96 exclusion : un élément ne se pose jamais sur un autre élément', async () => {
  const w = await monde();
  await w.ajouter({ genre: 'station', nom: 'Hôte', orbite: 3, heure: 1 });
  const v = await w.vue('antor');
  const hote = v.elements[0].cle;
  const r = await w.ajouter({ genre: 'vaisseau', nom: 'Passager', sur: hote });
  assert.deepEqual([r.statusCode, r.json().code], [404, 'astre_inconnu']);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 1);
});

test('critère : retirer la planète compte son élément (1) pour le MJ seul, puis retire les deux', async () => {
  const w = await monde();
  await w.ajouter({ genre: 'vaisseau', nom: 'Aube-Brisée', sur: 'mere' });
  await w.ajouter({ genre: 'station', nom: 'Cachée', sur: 'mere', secret: true });
  const compte = async (who: Who, suite = '') => w.req(who, 'GET', `interieur/42/43/astres/mere/elements${suite}`);
  const mj = await compte('antor');
  assert.deepEqual([mj.statusCode, mj.json()], [200, { elements: 2 }]);
  assert.equal((await compte('lea')).statusCode, 403);
  assert.equal((await compte('antor', '?mode=joueur')).statusCode, 403);
  const v = await w.vue('antor');
  const mere = v.astres.find((a: any) => a.cle === 'mere');
  const rm = await w.req('antor', 'DELETE', `interieur/42/43/astres/mere?version=${mere.version}&versionSysteme=${v.versionSysteme}`);
  assert.equal(rm.statusCode, 200, rm.body);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 0);
  assert.deepEqual((await w.vue('antor')).elements, []);
});

test('critère : la station « Réservé au MJ » est absente pour la joueuse et le MJ en mode joueur, sans trou ni compte ni lien de fiche', async () => {
  const w = await monde();
  const fid = w.fiche('Station Oméga');
  await w.ajouter({ genre: 'vaisseau', nom: 'Visible', orbite: 3, heure: 2 });
  await w.ajouter({ genre: 'station', nom: 'Oméga-Secrète', orbite: 6, heure: 6, secret: true });
  let v = await w.vue('antor');
  const st = v.elements.find((e: any) => e.nom === 'Oméga-Secrète');
  assert.equal(st.reserve, true);
  const lie = await w.req('antor', 'PUT', `interieur/42/43/elements/${st.cle}/fiche`, { ficheId: fid, version: st.version, versionSysteme: v.versionSysteme });
  assert.equal(lie.statusCode, 200, lie.body);
  const lea = await w.lire('lea');
  const modeJ = await w.lire('antor', '?mode=joueur');
  assert.equal(modeJ.body, lea.body);
  const j = lea.json();
  assert.deepEqual(j.elements.map((e: any) => e.nom), ['Visible']);
  assert.deepEqual(j.astres.map((a: any) => a.cle).sort(), ['etoile', 'mere']);
  for (const interdit of ['Oméga', 'Station Oméga', String(fid) + '"', '"reserve"', '"secret"', 'versionSysteme']) assert.ok(!lea.body.includes(interdit), interdit);
  assert.ok(Object.keys(j).every((k) => !/compte|nombre|total|count|cache/i.test(k)), Object.keys(j).join());
  const elementRead = await w.req('lea', 'GET', `interieur/42/43/astres/mere/elements`);
  assert.equal(elementRead.statusCode, 403);
  // the sheet of the station: the MJ reads the line with the badge, the player and the MJ in Player mode read no block
  const bloc = (f: any) => (f.blocs ?? []).find((b: any) => b.cle === 'swn/galaxie');
  const pourMJ = bloc(await w.fichePour('antor', fid));
  assert.deepEqual(pourMJ.lignes.map((l: any) => l.texte), ['Oméga-Secrète — système Vael, orbite 6 · 6 h (MJ seul)']);
  assert.equal(bloc(await w.fichePour('antor', fid, '?mode=joueur')), undefined);
  assert.equal(bloc(await w.fichePour('lea', fid)), undefined);
});

test('E-9 : la ligne d\'un élément posé sur un corps lit « sur <astre> » et celle par orbite lit « orbite 4 · 7 h »', async () => {
  const w = await monde();
  const f1 = w.fiche('Aube-Brisée (fiche)'), f2 = w.fiche('Port-Haut (fiche)');
  await w.ajouter({ genre: 'vaisseau', nom: 'Aube-Brisée', sur: 'mere' });
  await w.ajouter({ genre: 'ville', nom: 'Port-Haut', orbite: 4, heure: 7 });
  let v = await w.vue('antor');
  for (const [nom, fid] of [['Aube-Brisée', f1], ['Port-Haut', f2]] as const) {
    const e = v.elements.find((x: any) => x.nom === nom);
    const r = await w.req('antor', 'PUT', `interieur/42/43/elements/${e.cle}/fiche`, { ficheId: fid, version: e.version, versionSysteme: v.versionSysteme });
    assert.equal(r.statusCode, 200, r.body);
    v = await w.vue('antor');
  }
  const lignes = async (who: Who, fid: number) => ((await w.fichePour(who, fid)).blocs ?? []).find((b: any) => b.cle === 'swn/galaxie')?.lignes.map((l: any) => l.texte);
  // the planet carries no name in the seed row: « Astre sans nom »
  assert.deepEqual(await lignes('lea', f1), ['Aube-Brisée — système Vael, sur Astre sans nom']);
  assert.deepEqual(await lignes('lea', f2), ['Port-Haut — système Vael, orbite 4 · 7 h']);
  const nom = await w.req('antor', 'PATCH', 'interieur/42/43/astres/mere', { nom: 'Vael II', version: v.astres.find((a: any) => a.cle === 'mere').version, versionSysteme: v.versionSysteme });
  assert.equal(nom.statusCode, 200, nom.body);
  assert.deepEqual(await lignes('lea', f1), ['Aube-Brisée — système Vael, sur Vael II']);
});

test('critère : élément sur un système supprimé, 404 pour le MJ qui le lisait ; système masqué, même 404 pour la joueuse, lecture comprise', async () => {
  const w = await monde();
  w.systeme('masque', 10, 11, 1);
  // hidden system: the player and the MJ in Player mode read the same answer as an hexagon with no star at all
  const vide = await w.lire('lea', '', '-20/-20');
  assert.equal(vide.statusCode, 404);
  for (const [who, suite] of [['lea', ''], ['antor', '?mode=joueur']] as const) {
    const r = await w.lire(who, suite, '10/11');
    assert.equal(r.statusCode, 404);
    assert.equal(r.body, vide.body);
  }
  assert.equal((await w.lire('antor', '', '10/11')).statusCode, 200);
  const poseLea = await w.req('lea', 'POST', 'interieur/10/11/elements', { genre: 'ville', nom: 'X', orbite: 1, heure: 1, versionSysteme: 1 });
  assert.ok([403, 404].includes(poseLea.statusCode));
  // deleted system
  const v = await w.vue('antor');
  const sysRow = one(w.app, "SELECT version FROM swn_systemes WHERE cle = 'ouvert'");
  const del = await w.req('antor', 'DELETE', `systemes/ouvert?version=${sysRow.version}`);
  assert.equal(del.statusCode, 204, del.body);
  const pose = await w.req('antor', 'POST', 'interieur/42/43/elements', { genre: 'ville', nom: 'Fantôme', orbite: 1, heure: 1, versionSysteme: v.versionSysteme });
  assert.equal(pose.statusCode, 404, pose.body);
  assert.notEqual(pose.json().code, 'astre_inconnu');
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 0);
});

test('exclusion : la joueuse et un visiteur sans session ne peuvent ni poser, ni déplacer, ni réserver, ni retirer', async () => {
  const w = await monde();
  await w.ajouter({ genre: 'vaisseau', nom: 'Aube-Brisée', sur: 'mere' });
  const v = await w.vue('antor');
  const e = v.elements[0];
  const avant = JSON.stringify(all(w.app, 'SELECT * FROM swn_elements'));
  for (const who of ['lea', null] as const) {
    for (const [m, p, body] of [
      ['POST', 'interieur/42/43/elements', { genre: 'ville', nom: 'Pirate', orbite: 1, heure: 1 }],
      ['PUT', `interieur/42/43/elements/${e.cle}/place`, { orbite: 1, heure: 1, version: e.version }],
      ['PUT', `interieur/42/43/elements/${e.cle}/secret`, { secret: true, version: e.version }],
      ['PATCH', `interieur/42/43/elements/${e.cle}`, { nom: 'Pris', version: e.version }],
      ['DELETE', `interieur/42/43/elements/${e.cle}?version=${e.version}`, undefined],
    ] as const) {
      const r = await w.req(who, m, p, body);
      assert.ok([401, 403, 404].includes(r.statusCode), `${who} ${m} ${r.statusCode}`);
    }
  }
  assert.equal(JSON.stringify(all(w.app, 'SELECT * FROM swn_elements')), avant);
});

// ---- the import API (AD-145, AD-150) ----
const ESSAI = fileURLToPath(new URL('./exemples/atlas-essai.json', import.meta.url));
async function monde_import() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const gal = creerGalaxie(app.db, antor, E, { titre: 'Galaxie du bord' }).id;
  app.db.prepare('UPDATE swn_galaxies SET graine = ? WHERE id = ?').run('kanevas-neutre-1', gal);
  const t = creerJeton(app.db, antor, E, { nom: 'T', dureeJours: 30, outils: ['swn/galaxie'] }, app.horloge()).valeur;
  const put = (url: string, payload: unknown) =>
    app.inject({ method: 'PUT', url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${t}` }, payload: payload as any });
  const fe = creerFiche(app.db, antor, E, { type: 'lieu', titre: 'Fiche essai', sections: [{ titre: 'Apparence', joueursLisent: true }] });
  app.db.prepare('UPDATE fiches SET cle = ? WHERE id = ?').run('fiche-essai', fe.id);
  assert.equal((await put(`/outils/swn/galaxie/galaxies/${gal}`, { systemes: [{ cle: 'vael', nom: 'Vael', q: 0, r: 0 }] })).statusCode, 200);
  const atlas = (elements: unknown[]) => ({ ...JSON.parse(readFileSync(ESSAI, 'utf8')), elements });
  const atlasPut = (elements: unknown[]) => put(`/outils/swn/galaxie/galaxies/${gal}/systemes/vael/atlas`, atlas(elements));
  return { app, E, gal, atlasPut };
}

test('P-25 / critère : un atlas neutre portant un élément, importé deux fois : « créée » puis « inchangée », ligne identique, système ancré', async () => {
  const w = await monde_import();
  const el = [{ cle: 'nef', genre: 'vaisseau', nom: 'La Nef', sur: 'planete-un' }];
  const a = await w.atlasPut(el);
  assert.equal(a.statusCode, 200, a.body);
  assert.deepEqual([a.json().natures.elements.creees, a.json().natures.elements.inchangees, a.json().natures.elements.refusees], [1, 0, 0]);
  assert.equal(one(w.app, "SELECT count(*) n FROM swn_astres a JOIN swn_systemes s ON s.id = a.systeme_id WHERE s.cle = 'vael' AND s.galaxie_id = ?", w.gal).n, 5);
  const ligne1 = JSON.stringify(all(w.app, 'SELECT * FROM swn_elements'));
  const b = await w.atlasPut(el);
  assert.equal(b.statusCode, 200, b.body);
  assert.deepEqual([b.json().natures.elements.creees, b.json().natures.elements.inchangees, b.json().natures.elements.mises_a_jour], [0, 1, 0]);
  assert.equal(JSON.stringify(all(w.app, 'SELECT * FROM swn_elements')), ligne1);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 1);
});

test('P-25 échec : un élément sur un corps inconnu est refusé avec son chemin et rien n\'est écrit ; un élément secret importé est absent pour la joueuse', async () => {
  const w = await monde_import();
  const r = await w.atlasPut([{ cle: 'nef', genre: 'vaisseau', nom: 'La Nef', sur: 'corps-fantome' }]);
  assert.equal(r.json().appliquee, false, r.body);
  assert.equal(r.json().natures.elements.refusees, 1);
  assert.ok(r.body.includes('elements[0]'), r.body);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_elements').n, 0);
  const ok = await w.atlasPut([{ cle: 'base-noire', genre: 'base', nom: 'Base noire', sur: 'planete-un', secret: true }, { cle: 'ville-claire', genre: 'ville', nom: 'Ville claire', orbite: 4, heure: 7 }]);
  assert.equal(ok.json().appliquee, true, ok.body);
  w.app.db.prepare('UPDATE swn_galaxies SET visible = 1 WHERE id = ?').run(w.gal);
  const lea = await connecter(w.app, 'lea');
  const g = one(w.app, "SELECT q, r FROM swn_systemes WHERE cle = 'vael' AND galaxie_id = ?", w.gal);
  const res = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.gal}/interieur/${g.q}/${g.r}`, headers: lea });
  const noms = res.json().elements.map((e: any) => e.nom);
  assert.deepEqual(noms, ['Ville claire']);
  assert.ok(!res.body.includes('Base noire'));
});

// ---- the migration ----
const SRC = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
test('0044 : la montée depuis le schéma précédent garde les lignes existantes et crée swn_elements vide qui refuse un genre inconnu', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'elb-')), 'm') + '/';
  mkdirSync(dir);
  const fichiers = readdirSync(SRC).filter((f) => /^\d{4}-.+\.sql$/.test(f));
  for (const f of fichiers) if (Number(f.slice(0, 4)) < 44) copyFileSync(SRC + f, dir + f);
  const db = openDb(':memory:');
  migrate(db, dir);
  const d = '2026-11-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO univers (id, cle, nom, cree_le) VALUES (1, 'uu', 'U', ?)").run(d);
  db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, visible, graine, densite_defaut, version) VALUES (1, 1, 'G', 1, 'abc', 0.68, 1)").run();
  db.prepare("INSERT INTO swn_systemes (id, galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (1, 1, 1, 's', 'S', 1, 2, 3, 'accent', '', 0, 1)").run();
  db.prepare("INSERT INTO swn_astres (id, systeme_id, cle, genre, type, orbite, heure, taille) VALUES (1, 1, 'p', 'planete', 'rocheux', 2, 4, 1)").run();
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name = 'swn_elements'").get().n, 0);
  const avant = [db.prepare('SELECT * FROM swn_systemes').all(), db.prepare('SELECT * FROM swn_astres').all()];
  const appliquees = migrate(db);
  assert.ok(appliquees.includes(44), String(appliquees));
  assert.deepEqual([db.prepare('SELECT * FROM swn_systemes').all(), db.prepare('SELECT * FROM swn_astres').all()], avant);
  assert.equal(db.prepare('SELECT count(*) n FROM swn_elements').get().n, 0);
  assert.throws(() => db.prepare("INSERT INTO swn_elements (systeme_id, cle, genre, nom, orbite, heure) VALUES (1, 'x', 'moto', 'X', 1, 1)").run());
  db.prepare("INSERT INTO swn_elements (systeme_id, cle, genre, nom, orbite, heure) VALUES (1, 'x', 'station', 'X', 1, 1)").run();
  db.prepare('DELETE FROM swn_astres').run();
  assert.equal(db.prepare('SELECT count(*) n FROM swn_elements').get().n, 1);
});
