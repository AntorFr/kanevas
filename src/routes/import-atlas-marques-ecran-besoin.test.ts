import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Re-check of kanevas-carte-spatiale-atlas (B-93, B-95, P-25, AD-145: the import writes rows marked as imported; a row changed
// in Kanevas is never overwritten by the next import). A screen's body (session, E-23 routes) must not be able to stamp a row
// as imported or choose its key. Door: the screen routes PATCH/POST/PUT …/interieur/:q/:r/…, then the import route. Literals.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerGalaxie } = await import('../services/swn/galaxies.js');

const G = 'swn/galaxie';
// A neutral atlas invented here: one star, two bodies one of which has a moon, a belt, a comet, a transition.
const atlas = () => ({
  transition: 9.75,
  etoiles: [{ cle: 'astre-ref', type: 'jaune', nom: 'Astre de référence', taille: 1 }],
  corps: [
    { cle: 'monde-a', type: 'tellurique', nom: 'Monde A', orbite: 2.5, heure: 3.5, taille: 1.2, aspect: { mer: 0.3 },
      lunes: [{ cle: 'satellite-a', type: 'rocheux', nom: 'Satellite A', orbite: 0.5, heure: 9, taille: 0.25 }] },
    { cle: 'monde-b', type: 'gazeuse', nom: 'Monde B', orbite: 7, heure: 11, taille: 2.5 },
  ],
  zones: [{ cle: 'ceinture-x', forme: 'anneau', nom: 'Ceinture X', parametres: { de: 4, a: 5 } }],
  points: [{ cle: 'comete-x', type: 'comete', nom: 'Comète X', orbite: 10, heure: 1, taille: 0.2 }],
});

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const gal = creerGalaxie(app.db, id('antor'), E, { titre: 'Galaxie neutre' }).id as number;
  const dens = JSON.parse(readFileSync(fileURLToPath(new URL('../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8')).densites.defaut;
  app.db.prepare('UPDATE swn_galaxies SET graine = ?, densite_defaut = ? WHERE id = ?').run('kanevas-neutre-1', dens, gal);
  const cookie = await connecter(app, 'antor');
  const tok = (compte: string, outils?: string[]) => creerJeton(app.db, id(compte), E, { nom: 'T', dureeJours: 30, outils }, app.horloge()).valeur;
  const t = tok('antor', [G]);
  const req = (valeur: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as any });
  const g = await req(t, 'PUT', `/outils/swn/galaxie/galaxies/${gal}`, { systemes: [{ cle: 'sys-ref', nom: 'Système de référence', q: 0, r: 0 }] });
  assert.equal(g.statusCode, 200, g.body);
  const put = (corps: unknown, cle = 'sys-ref', lot?: number, valeur = t, gid = gal) =>
    req(valeur, 'PUT', `/outils/swn/galaxie/galaxies/${gid}/systemes/${cle}/atlas${lot ? `?lot=${lot}` : ''}`, corps);
  const ecran = (q: number, r: number) =>
    app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${gal}/interieur/${q}/${r}`, headers: cookie });
  const dump = () => JSON.stringify(['swn_systemes', 'swn_astres', 'swn_formations', 'swn_galaxies', 'swn_routes', 'swn_zones', 'lots_import']
    .map((tb) => app.db.prepare(`SELECT * FROM ${tb} ORDER BY 1`).all()));
  const nbLignes = () => (un('SELECT COUNT(*) c FROM swn_astres').c as number) + (un('SELECT COUNT(*) c FROM swn_formations').c as number);
  return { app, E, gal, cookie, tok, req, put, ecran, dump, nbLignes, t, un, ouvrir: async () => (await req(t, 'POST', `/lots?outil=${G}`)).json().lotId as number };
}

const ECRAN = (w: Awaited<ReturnType<typeof monde>>) => `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.gal}/interieur/0/0`;
const jeton = async (w: Awaited<ReturnType<typeof monde>>) => (await w.ecran(0, 0)).json().versionSysteme as number;

test('B-95 exclusion : un PATCH d\'écran portant importee:true et une autre cle ne ré-estampe pas la ligne, le réimport reste refusé hors_synchro', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas())).json().appliquee, true);
  const p = (await w.ecran(0, 0)).json().astres.find((a: any) => a.cle === 'monde-b');
  const patch = await w.app.inject({ method: 'PATCH', url: `${ECRAN(w)}/astres/monde-b`, headers: w.cookie,
    payload: { orbite: 6, version: p.version, versionSysteme: await jeton(w), importee: true, cle: 'autre', version_importee: 999 } });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.equal(w.un("SELECT COUNT(*) c FROM swn_astres WHERE cle = 'autre'").c, 0);
  const ligne = w.un("SELECT orbite, version, version_importee FROM swn_astres WHERE cle = 'monde-b'");
  assert.equal(ligne.orbite, 6);
  assert.notEqual(ligne.version_importee, ligne.version);
  const avant = w.dump();
  const r = await w.put(atlas()); // the file still says orbite 7
  assert.equal(r.json().appliquee, false, r.body);
  assert.ok(JSON.stringify(r.json().refus).includes('hors_synchro'), r.body);
  assert.equal(w.dump(), avant);
  assert.equal(w.un("SELECT orbite o FROM swn_astres WHERE cle = 'monde-b'").o, 6);
});

test('B-95 exclusion : un lien de fiche posé par l\'écran avec importee:true ne ré-estampe pas la ligne importée', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas())).json().appliquee, true);
  const fiche = w.un("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', 'Port', '{}', 1, 1) RETURNING id", w.E).id as number;
  const p = (await w.ecran(0, 0)).json().astres.find((a: any) => a.cle === 'monde-a');
  const l = await w.app.inject({ method: 'PUT', url: `${ECRAN(w)}/astres/monde-a/fiche`, headers: w.cookie,
    payload: { ficheId: fiche, version: p.version, versionSysteme: await jeton(w), importee: true } });
  assert.equal(l.statusCode, 200, l.body);
  const ligne = w.un("SELECT version, version_importee FROM swn_astres WHERE cle = 'monde-a'");
  assert.notEqual(ligne.version_importee, ligne.version);
});

test('B-95 exclusion : un astre créé par l\'écran avec cle et importee dans le corps a une clé tirée et n\'est pas importé ; l\'import de cette clé crée une autre ligne', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas())).json().appliquee, true);
  const c = await w.app.inject({ method: 'POST', url: `${ECRAN(w)}/astres`, headers: w.cookie,
    payload: { genre: 'planete', nom: 'Neuve', type: 'tellurique', orbite: 3, heure: 5, taille: 1, versionSysteme: await jeton(w), cle: 'pirate', importee: true } });
  assert.equal(c.statusCode, 201, c.body);
  assert.equal(w.un("SELECT COUNT(*) c FROM swn_astres WHERE cle = 'pirate'").c, 0);
  const neuve = w.un("SELECT cle, version_importee FROM swn_astres WHERE nom = 'Neuve'");
  assert.equal(neuve.version_importee, null);
  const a = atlas();
  a.corps.push({ cle: 'pirate', type: 'tellurique', nom: 'Pirate', orbite: 9, heure: 2, taille: 1, lunes: [] });
  const r = await w.put(a);
  assert.equal(r.json().appliquee, true, r.body);
  assert.equal(r.json().natures.corps.creees, 1);
  assert.equal(w.un("SELECT COUNT(*) c FROM swn_astres WHERE nom = 'Neuve'").c, 1);
  assert.equal(w.un("SELECT nom FROM swn_astres WHERE cle = 'pirate'").nom, 'Pirate');
});

test('B-95 exclusion : une zone créée puis modifiée par l\'écran avec cle et importee dans le corps n\'est jamais marquée importée', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas())).json().appliquee, true);
  const z = await w.app.inject({ method: 'POST', url: `${ECRAN(w)}/zones`, headers: w.cookie,
    payload: { forme: 'anneau', nom: 'Ceinture Y', parametres: { de: 6, a: 6.5 }, versionSysteme: await jeton(w), cle: 'pirate-zone', importee: true } });
  assert.equal(z.statusCode, 201, z.body);
  assert.equal(w.un("SELECT COUNT(*) c FROM swn_formations WHERE cle = 'pirate-zone'").c, 0);
  assert.equal(w.un("SELECT version_importee v FROM swn_formations WHERE nom = 'Ceinture Y'").v, null);
  const x = w.un("SELECT version FROM swn_formations WHERE cle = 'ceinture-x'");
  const m = await w.app.inject({ method: 'PATCH', url: `${ECRAN(w)}/zones/ceinture-x`, headers: w.cookie,
    payload: { nom: 'Ceinture renommée', version: x.version, versionSysteme: await jeton(w), importee: true } });
  assert.equal(m.statusCode, 200, m.body);
  const apres = w.un("SELECT version, version_importee FROM swn_formations WHERE cle = 'ceinture-x'");
  assert.notEqual(apres.version_importee, apres.version);
  const r = await w.put(atlas());
  assert.equal(r.json().appliquee, false, r.body);
  assert.ok(JSON.stringify(r.json().refus).includes('hors_synchro'), r.body);
});

test('B-95 exclusion : le changement de transition par l\'écran avec importee:true ne marque pas le système comme importé', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas())).json().appliquee, true);
  const t = await w.app.inject({ method: 'PUT', url: `${ECRAN(w)}/transition`, headers: w.cookie,
    payload: { transition: 40, versionSysteme: await jeton(w), importee: true } });
  assert.equal(t.statusCode, 200, t.body);
  const s = w.un("SELECT transition, version, version_importee FROM swn_systemes WHERE cle = 'sys-ref'");
  assert.equal(s.transition, 40);
  assert.notEqual(s.version_importee, s.version);
});
