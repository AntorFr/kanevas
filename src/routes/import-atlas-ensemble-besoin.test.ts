import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Whole-feature tests of kanevas-carte-spatiale-atlas, written from the sheet, B-93, B-95, P-25 (docs/parcours.md) and the
// contracts of ARCHITECTURE.md (AD-104, AD-145: the route of the import and the route E-23 reads), not from the code.
// Door of the effect: PUT …/systemes/:cle/atlas with an import token; what E-23 shows is read by the session route
// GET …/interieur/:q/:r. Real routes, real database, stub login. Every expectation is a literal.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerGalaxie } = await import('../services/swn/galaxies.js');
const { graineDe } = await import('../wasm/coeur.js');

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
const total = (n: Record<string, any>, k: string) => Object.values(n).reduce((a, c) => a + c[k], 0) as number;

test('B-93 B-95 nominal : atlas neutre importé deux fois, mêmes lignes, seconde fois tout inchangé ; E-23 lit le système défini aux places de l\'atlas', async () => {
  const w = await monde();
  const r = await w.put(atlas());
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.appliquee, true);
  assert.equal(j.natures.etoiles.creees, 1);
  assert.equal(j.natures.corps.creees, 3); // two bodies and the moon
  assert.equal(j.natures.points.creees, 1);
  assert.equal(j.natures.formations.creees, 1);
  assert.equal(total(j.natures, 'refusees'), 0);
  assert.equal(w.nbLignes(), 6);
  const lignes = w.app.db.prepare('SELECT cle, genre, orbite, heure, version, version_importee FROM swn_astres ORDER BY cle').all();
  const base = w.dump();

  const r2 = await w.put(atlas());
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal(r2.json().appliquee, true);
  assert.equal(total(r2.json().natures, 'inchangees'), 7);
  assert.equal(total(r2.json().natures, 'creees') + total(r2.json().natures, 'mises_a_jour') + total(r2.json().natures, 'refusees'), 0);
  assert.equal(w.nbLignes(), 6);
  assert.deepEqual(w.app.db.prepare('SELECT cle, genre, orbite, heure, version, version_importee FROM swn_astres ORDER BY cle').all(), lignes);
  assert.equal(w.dump(), base);

  const e = await w.ecran(0, 0);
  assert.equal(e.statusCode, 200, e.body);
  const v = e.json();
  assert.equal(v.etat, 'defini');
  assert.equal(v.transition, 9.75);
  const par = (c: string) => v.astres.find((a: any) => a.cle === c);
  assert.deepEqual([par('monde-a').orbite, par('monde-a').heure, par('monde-a').genre, par('monde-a').nom], [2.5, 3.5, 'planete', 'Monde A']);
  // the seed is written at the creation of the row (AD-aspects-socle-2)
  assert.deepEqual(par('monde-a').aspect, { mer: 0.3, graine: await graineDe('sys-ref', 'monde-a') });
  assert.deepEqual([par('satellite-a').genre, par('satellite-a').parent_cle, par('satellite-a').orbite, par('satellite-a').heure], ['lune', 'monde-a', 0.5, 9]);
  assert.deepEqual([par('monde-b').orbite, par('monde-b').heure], [7, 11]);
  assert.deepEqual([par('comete-x').genre, par('comete-x').orbite, par('comete-x').heure], ['comete', 10, 1]);
  assert.equal(v.astres.length, 5);
  assert.deepEqual([v.formations.length, v.formations[0].cle, v.formations[0].parametres.de, v.formations[0].parametres.a], [1, 'ceinture-x', 4, 5]);
});

test('B-95 échec : un atlas invalide est refusé avec son champ, rien n\'est écrit, même les éléments valides du même corps', async () => {
  const w = await monde();
  const avant = w.dump();
  const a = atlas();
  a.corps[0].lunes[0].heure = 12; // [0, 12) : 12 is out
  a.corps[1].orbite = -1;
  const r = await w.put(a);
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.appliquee, false);
  const chemins = (j.refus as any[]).map((x) => x.chemin ?? x.path);
  assert.ok(chemins.includes('corps[0].lunes[0].heure'), JSON.stringify(j.refus));
  assert.ok(chemins.includes('corps[1].orbite'), JSON.stringify(j.refus));
  assert.equal(w.nbLignes(), 0);
  assert.equal(w.dump(), avant);
});

test('B-93 bords : heure 11.99 et orbite 0 acceptées, heure 12 refusée ; 80 corps passent, 81 sont refusés', async () => {
  const w = await monde();
  const ok = atlas();
  ok.corps[1].heure = 11.99;
  ok.corps[1].orbite = 0;
  assert.equal((await w.put(ok)).json().appliquee, true);

  const w2 = await monde();
  const quatreVingts = { etoiles: atlas().etoiles, corps: Array.from({ length: 80 }, (_, i) => ({ cle: `c-${i}`, type: 'tellurique', orbite: 1 + i, heure: 1, taille: 1 })) };
  const r80 = await w2.put(quatreVingts);
  assert.equal(r80.json().appliquee, true, r80.body);
  assert.equal(w2.nbLignes(), 81);

  const w3 = await monde();
  const avant = w3.dump();
  const quatreVingtUn = { etoiles: atlas().etoiles, corps: Array.from({ length: 81 }, (_, i) => ({ cle: `c-${i}`, type: 'tellurique', orbite: 1 + i, heure: 1, taille: 1 })) };
  const r81 = await w3.put(quatreVingtUn);
  assert.equal(r81.json().appliquee, false);
  assert.ok(r81.json().refus.length >= 1);
  assert.equal(w3.dump(), avant);
});

test('B-93 échec : clé inconnue, clé en double entre une lune et une comète, type inconnu, forme inconnue : chacun refusé à son chemin', async () => {
  const w = await monde();
  const avant = w.dump();
  const cas: Array<[string, (a: any) => void, string]> = [
    ['clé inconnue', (a) => { a.corps[0].couleur = 'rouge'; }, 'corps[0]'],
    ['clé en double', (a) => { a.points[0].cle = 'satellite-a'; }, 'points[0]'],
    ['type inconnu', (a) => { a.corps[1].type = 'cubique'; }, 'corps[1].type'],
    ['forme inconnue', (a) => { a.zones[0].forme = 'carre'; }, 'zones[0]'],
    ['taille nulle', (a) => { a.corps[1].taille = 0; }, 'corps[1].taille'],
    ['description trop longue', (a) => { a.corps[1].description = 'x'.repeat(2001); }, 'corps[1].description'],
  ];
  for (const [nom, casse, prefixe] of cas) {
    const a = atlas();
    casse(a);
    const r = await w.put(a);
    assert.equal(r.statusCode, 200, `${nom} ${r.body}`);
    assert.equal(r.json().appliquee, false, nom);
    const chemins = (r.json().refus as any[]).map((x) => String(x.chemin ?? x.path));
    assert.ok(chemins.some((c) => c.startsWith(prefixe)), `${nom} : ${JSON.stringify(r.json().refus)}`);
    assert.equal(w.dump(), avant, nom);
  }
});

test('B-95 exclusion : un système inconnu est refusé systeme_inconnu, une galaxie inconnue 404, rien n\'est écrit', async () => {
  const w = await monde();
  const avant = w.dump();
  const r = await w.put(atlas(), 'sys-absent');
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().appliquee, false);
  assert.ok(JSON.stringify(r.json().refus).includes('systeme_inconnu'), r.body);
  assert.equal(w.dump(), avant);
  const g = await w.put(atlas(), 'sys-ref', undefined, w.t, 999999);
  assert.equal(g.statusCode, 404, g.body);
});

test('B-93 exclusion : le corps d\'un système tiré voisin n\'a pas bougé', async () => {
  const w = await monde();
  // (-49, -48) is a drawn star of the neutral seed: no row. Its drawn interior must be the same before and after.
  const avant = await w.ecran(-49, -48);
  assert.equal(avant.statusCode, 200, avant.body);
  assert.equal(avant.json().etat, 'tire');
  assert.equal((await w.put(atlas())).json().appliquee, true);
  const apres = await w.ecran(-49, -48);
  assert.equal(apres.body, avant.body);
  assert.equal(w.un('SELECT COUNT(*) c FROM swn_systemes WHERE galaxie_id = ?', w.gal).c, 1);
});

test('B-93 exclusion : rien n\'est supprimé — un corps que le fichier ne liste plus reste', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas())).json().appliquee, true);
  const moins = atlas();
  moins.corps.pop();
  const r = await w.put(moins);
  assert.equal(r.json().appliquee, true);
  assert.equal(w.nbLignes(), 6);
  assert.ok(w.un("SELECT 1 x FROM swn_astres WHERE cle = 'monde-b'"));
});

test('B-93 sans écrasement : une ligne changée dans Kanevas puis réimportée avec une autre valeur est refusée hors_synchro, tout est annulé ; réimport d\'une valeur modifiée et intacte met à jour', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas())).json().appliquee, true);
  // intact since the import, different in the file: updated
  const b = atlas();
  b.corps[1].orbite = 8;
  const maj = await w.put(b);
  assert.equal(maj.json().appliquee, true, maj.body);
  assert.equal(w.un("SELECT orbite o FROM swn_astres WHERE cle = 'monde-b'").o, 8);
  // changed in Kanevas (the E-23 gesture), then the file says something else
  const v = (await w.ecran(0, 0)).json();
  const p = v.astres.find((a: any) => a.cle === 'monde-b');
  const patch = await w.app.inject({ method: 'PATCH', url: `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.gal}/interieur/0/0/astres/monde-b`,
    headers: w.cookie, payload: { orbite: 6, heure: 11, version: p.version, versionSysteme: v.versionSysteme } });
  assert.equal(patch.statusCode, 200, patch.body);
  const avant = w.dump();
  const c = atlas();
  c.corps[1].orbite = 9;
  c.corps[0].orbite = 3; // another body, also different: all must be cancelled
  const r = await w.put(c);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().appliquee, false);
  assert.ok(JSON.stringify(r.json().refus).includes('hors_synchro'), r.body);
  assert.equal(w.dump(), avant);
  assert.equal(w.un("SELECT orbite o FROM swn_astres WHERE cle = 'monde-a'").o, 2.5);
});

test('B-93 échec : fiche inconnue refusée au champ fiche ; étoile inconnue refusée au champ etoile ; rien écrit', async () => {
  const w = await monde();
  const avant = w.dump();
  const a = atlas();
  (a.corps[1] as any).fiche = 'fiche-absente';
  const r = await w.put(a);
  assert.equal(r.json().appliquee, false, r.body);
  assert.ok(JSON.stringify(r.json().refus).includes('fiche'), r.body);
  const b = atlas();
  (b.corps[0] as any).etoile = 'etoile-absente';
  const r2 = await w.put(b);
  assert.equal(r2.json().appliquee, false, r2.body);
  assert.ok(JSON.stringify(r2.json().refus).includes('etoile'), r2.body);
  assert.equal(w.dump(), avant);
});

test('AD-104 exclusion : jeton de contenu, jeton d\'un autre outil, sans jeton : 401 jeton_invalide, rien écrit', async () => {
  const w = await monde();
  const avant = w.dump();
  const contenu = w.tok('antor');
  const r = await w.put(atlas(), 'sys-ref', undefined, contenu);
  assert.equal(r.statusCode, 401, r.body);
  assert.equal(r.json().code, 'jeton_invalide');
  const sans = await w.app.inject({ method: 'PUT', url: `/api/import/v1/univers/${w.E}/outils/swn/galaxie/galaxies/${w.gal}/systemes/sys-ref/atlas`, payload: atlas() });
  assert.equal(sans.statusCode, 401);
  assert.equal(w.dump(), avant);
});

test('B-95 lot : les comptes par nature entrent dans le lot, refus compris ; un lot clos répond 409 lot_clos', async () => {
  const w = await monde();
  const lot = await w.ouvrir();
  assert.equal((await w.put(atlas(), 'sys-ref', lot)).json().appliquee, true);
  const mauvais = atlas();
  mauvais.corps[1].heure = 12;
  assert.equal((await w.put(mauvais, 'sys-ref', lot)).json().appliquee, false);
  const etat = await w.req(w.t, 'GET', `/lots/${lot}`);
  assert.equal(etat.statusCode, 200, etat.body);
  const c = etat.json().compteurs;
  assert.deepEqual([c.etoiles.creees, c.corps.creees, c.corps.refusees, c.points.creees, c.formations.creees, c.systemes.mises_a_jour], [1, 3, 1, 1, 1, 1]);
  assert.equal(etat.json().rapport[0].cle, 'corps[1].heure');
  const fermer = await w.req(w.t, 'POST', `/lots/${lot}/clore`);
  assert.ok([200, 204].includes(fermer.statusCode), fermer.body);
  const clos = await w.put(atlas(), 'sys-ref', lot);
  assert.equal(clos.statusCode, 409, clos.body);
  assert.equal(clos.json().code, 'lot_clos');
});
