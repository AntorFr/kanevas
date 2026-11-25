import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-atlas-import (AD-atlas-1, AD-atlas-3, B-95, P-25): one request, one
// transaction, the same twice, and an invalid atlas writes nothing.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerGalaxie } = await import('../services/swn/galaxies.js');
const { lireInterieur } = await import('../services/swn/interieur.js');
const { creerFiche } = await import('../services/fiches.js');
const { modifierAstre } = await import('../services/swn/ecriture-systeme.js');
const { graineDe } = await import('../wasm/coeur.js');

const G = 'swn/galaxie';
const ESSAI = fileURLToPath(new URL('../outils/swn/exemples/atlas-essai.json', import.meta.url));
const atlas = () => JSON.parse(readFileSync(ESSAI, 'utf8'));

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const gal = creerGalaxie(app.db, id('antor'), E, { titre: 'Galaxie du bord' }).id;
  // The seed is drawn at random at creation: fix it, so that the window of drawn neighbours below is the same every run.
  app.db.prepare('UPDATE swn_galaxies SET graine = ? WHERE id = ?').run('kanevas-neutre-1', gal);
  const tok = (compte: string, outils?: string[]) => creerJeton(app.db, id(compte), E, { nom: 'T', dureeJours: 30, outils }, app.horloge());
  const req = (valeur: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as any });
  const t = tok('antor', [G]).valeur;
  const galaxie = await req(t, 'PUT', `/outils/swn/galaxie/galaxies/${gal}`, {
    systemes: [{ cle: 'vael', nom: 'Vael', q: 0, r: 0 }, { cle: 'oran', nom: 'Oran', q: 3, r: 0 }],
  });
  assert.equal(galaxie.statusCode, 200, galaxie.body);
  const put = (corps: unknown, cle = 'vael', lot?: number, valeur = t, g = gal) =>
    req(valeur, 'PUT', `/outils/swn/galaxie/galaxies/${g}/systemes/${cle}/atlas${lot ? `?lot=${lot}` : ''}`, corps);
  const ouvrir = async () => (await req(t, 'POST', `/lots?outil=${G}`)).json().lotId as number;
  const acteur = { compteId: id('antor') };
  const interieur = (q: number, r: number) => lireInterieur(app.db, acteur, E, gal, q, r);
  // Every row of the swn tables, to compare the base byte for byte.
  const dump = () => JSON.stringify(['swn_systemes', 'swn_astres', 'swn_formations', 'swn_galaxies', 'swn_routes', 'swn_zones']
    .map((tb) => app.db.prepare(`SELECT * FROM ${tb} ORDER BY 1`).all()));
  const astres = () => app.db.prepare('SELECT cle, genre, version, version_importee, fiche_id FROM swn_astres ORDER BY id').all() as any[];
  const fiche = (cle: string) => {
    const f = creerFiche(app.db, id('antor'), E, { type: 'lieu', titre: `Fiche ${cle}` });
    app.db.prepare('UPDATE fiches SET cle = ? WHERE id = ?').run(cle, f.id);
    return f.id as number;
  };
  return { app, id, E, gal, tok, req, put, ouvrir, un, t, interieur, dump, astres, fiche };
}
const somme = (n: any, k: string) => Object.values(n).reduce((a: number, c: any) => a + c[k], 0) as number;

test("atlas d'essai : tout créé, rejeu identique tout inchangé aux mêmes versions, intérieur lu", async () => {
  const w = await monde();
  const fid = w.fiche('fiche-essai');
  const r = await w.put(atlas());
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.appliquee, true);
  assert.deepEqual([j.natures.etoiles.creees, j.natures.corps.creees, j.natures.points.creees, j.natures.formations.creees, j.natures.systemes.mises_a_jour],
    [1, 3, 1, 1, 1]);
  assert.equal(somme(j.natures, 'refusees'), 0);
  const avant = w.astres();
  const base = w.dump();
  const r2 = await w.put(atlas());
  assert.equal(r2.json().appliquee, true);
  assert.equal(somme(r2.json().natures, 'inchangees'), 7);
  assert.equal(somme(r2.json().natures, 'creees') + somme(r2.json().natures, 'mises_a_jour') + somme(r2.json().natures, 'refusees'), 0);
  assert.deepEqual(w.astres(), avant);
  assert.equal(w.dump(), base);
  for (const a of avant) assert.equal(a.version_importee, a.version);

  const v = w.interieur(0, 0);
  assert.equal(v.etat, 'defini');
  assert.equal(v.transition, 14.5);
  const p1 = v.astres.find((a: any) => a.cle === 'planete-un')!;
  assert.deepEqual([p1.orbite, p1.heure, p1.taille, p1.type], [3.5, 2.25, 1, 'tellurique']);
  // the seed is written at the creation of the row (AD-aspects-socle-2)
  assert.deepEqual(p1.aspect, { mer: 0.6, nuages: 0.4, graine: await graineDe('vael', 'planete-un') });
  const lune = v.astres.find((a: any) => a.cle === 'lune-un')!;
  assert.deepEqual([lune.genre, lune.parent_cle, lune.orbite, lune.heure], ['lune', 'planete-un', 0.4, 6]);
  const p2 = v.astres.find((a: any) => a.cle === 'planete-deux')!;
  assert.equal(p2.fiche?.id, fid);
  assert.deepEqual([v.astres.find((a: any) => a.cle === 'comete-essai')!.genre, v.formations[0].cle, v.formations[0].parametres.de], ['comete', 'ceinture-essai', 6]);
});

test('un seul corps invalide : 200 appliquee false avec le chemin, base identique octet pour octet', async () => {
  const w = await monde();
  w.fiche('fiche-essai');
  const base = w.dump();
  const a = atlas();
  a.corps[1].heure = 12;
  const r = await w.put(a);
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().appliquee, false);
  assert.deepEqual(r.json().refus.map((x: any) => x.chemin), ['corps[1].heure']);
  assert.equal(w.dump(), base);
  // Same after a first successful import: a bad second request changes nothing.
  assert.equal((await w.put(atlas())).json().appliquee, true);
  const apres = w.dump();
  const b = atlas();
  b.corps[0].orbite = 4;
  b.corps[0].lunes[0].orbite = -1;
  const r2 = await w.put(b);
  assert.equal(r2.json().appliquee, false);
  assert.deepEqual(r2.json().refus.map((x: any) => x.chemin), ['corps[0].lunes[0].orbite']);
  assert.equal(w.dump(), apres);
});

test('ligne intacte différente : mise à jour, version montée ; modifiée dans Kanevas : hors_synchro et tout annulé', async () => {
  const w = await monde();
  w.fiche('fiche-essai');
  await w.put(atlas());
  const b = atlas();
  b.corps[1].orbite = 10;
  const r = await w.put(b);
  assert.equal(r.json().appliquee, true);
  assert.equal(r.json().natures.corps.mises_a_jour, 1);
  assert.equal(r.json().natures.corps.inchangees, 2);
  const p2 = w.astres().find((a: any) => a.cle === 'planete-deux');
  assert.equal(p2.version, p2.version_importee);
  assert.equal(w.interieur(0, 0).astres.find((a: any) => a.cle === 'planete-deux')!.orbite, 10);

  // The GM edits the planet in Kanevas, then the file arrives with another value.
  const vue = w.interieur(0, 0);
  const cible = vue.astres.find((a: any) => a.cle === 'planete-un')!;
  modifierAstre(w.app.db, w.id('antor'), w.E, w.gal, 0, 0, 'planete-un', { orbite: 5, version: cible.version, versionSysteme: vue.versionSysteme } as any);
  const base = w.dump();
  const c = atlas();
  c.corps[1].orbite = 11; // would be a valid update on its own
  c.corps[0].orbite = 6;  // refused: edited since the import
  c.corps.push({ cle: 'neuve', type: 'tellurique', orbite: 20, heure: 1, taille: 1 });
  const r3 = await w.put(c);
  assert.equal(r3.statusCode, 200, r3.body);
  assert.equal(r3.json().appliquee, false);
  const refus = r3.json().refus.find((x: any) => x.code === 'hors_synchro');
  assert.equal(refus.chemin, 'corps[0]');
  assert.equal(refus.champ, 'orbite');
  assert.equal(w.dump(), base);
  // The same value as Kanevas holds is not a conflict.
  const d = atlas();
  d.corps[0].orbite = 5;
  d.corps[1].orbite = 10;
  assert.equal((await w.put(d)).json().appliquee, true);
});

test('fiche inconnue, étoile inconnue : refusés avec leur champ, rien écrit ; fiche liée à un corps existant', async () => {
  const w = await monde();
  const base = w.dump();
  const r = await w.put(atlas()); // 'fiche-essai' does not exist
  assert.equal(r.json().appliquee, false);
  assert.deepEqual(r.json().refus.map((x: any) => [x.chemin, x.champ, x.raison]), [['corps[1].fiche', 'fiche', 'Fiche inconnue.']]);
  assert.equal(w.dump(), base);
  const b = atlas();
  b.corps[0].etoile = 'absente';
  b.corps[1].fiche = null;
  const r2 = await w.put(b);
  assert.equal(r2.json().appliquee, false);
  assert.deepEqual(r2.json().refus.map((x: any) => [x.chemin, x.champ]), [['corps[0].etoile', 'etoile']]);
  assert.equal(w.dump(), base);
  // The link arrives later, on a body already imported.
  const c = atlas();
  c.corps[1].fiche = null;
  assert.equal((await w.put(c)).json().appliquee, true);
  const fid = w.fiche('fiche-essai');
  const r3 = await w.put(atlas());
  assert.equal(r3.json().appliquee, true);
  assert.equal(r3.json().natures.corps.mises_a_jour, 1);
  assert.equal(w.astres().find((a: any) => a.cle === 'planete-deux').fiche_id, fid);
});

test("système inconnu : 200 systeme_inconnu compté dans le lot ; galaxie inconnue 404 ; le voisin ne bouge pas", async () => {
  const w = await monde();
  w.fiche('fiche-essai');
  await w.put(atlas());
  const voisinAvant = JSON.stringify(w.interieur(3, 0));
  // Every drawn neighbour hex of the block: its interior must not move either.
  const tires = () => {
    const sortie: string[] = [];
    for (let q = -3; q <= 5; q++) for (let r = -3; r <= 5; r++) {
      if ((q === 0 && r === 0) || (q === 3 && r === 0)) continue;
      try { sortie.push(JSON.stringify([q, r, w.interieur(q, r)])); } catch { /* no star here */ }
    }
    return sortie;
  };
  const tireAvant = tires();
  assert.ok(tireAvant.length > 0, 'au moins un système tiré voisin');
  const base = w.dump();
  const lid = await w.ouvrir();
  const r = await w.put(atlas(), 'inconnu', lid);
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().appliquee, false);
  assert.deepEqual(r.json().refus.map((x: any) => [x.chemin, x.champ, x.code]), [['systeme', 'systeme', 'systeme_inconnu']]);
  assert.equal(w.dump(), base);
  const l = (await w.req(w.t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.systemes.refusees, 1);
  assert.equal((await w.put(atlas(), 'vael', undefined, w.t, w.gal + 999)).statusCode, 404);
  // The neighbour, defined (oran) and drawn alike, has the same interior before and after an import on vael.
  const b = atlas();
  b.corps[0].orbite = 4.5;
  assert.equal((await w.put(b)).json().appliquee, true);
  assert.equal(JSON.stringify(w.interieur(3, 0)), voisinAvant);
  assert.deepEqual(tires(), tireAvant);
});

test('lot : comptes par nature, refus compris y compris pour une requête annulée ; lot clos 409', async () => {
  const w = await monde();
  w.fiche('fiche-essai');
  const lid = await w.ouvrir();
  assert.equal((await w.put(atlas(), 'vael', lid)).json().appliquee, true);
  let l = (await w.req(w.t, 'GET', `/lots/${lid}`)).json();
  assert.deepEqual([l.compteurs.etoiles.creees, l.compteurs.corps.creees, l.compteurs.points.creees, l.compteurs.formations.creees, l.compteurs.systemes.mises_a_jour],
    [1, 3, 1, 1, 1]);
  await w.put(atlas(), 'vael', lid);
  l = (await w.req(w.t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.corps.inchangees, 3);
  const a = atlas();
  a.corps[0].heure = 99;
  a.points[0].orbite = -2;
  const r = await w.put(a, 'vael', lid);
  assert.equal(r.json().appliquee, false);
  l = (await w.req(w.t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.corps.refusees, 1);
  assert.equal(l.compteurs.points.refusees, 1);
  assert.equal(l.compteurs.corps.creees, 3);
  await w.req(w.t, 'POST', `/lots/${lid}/clore`);
  const clos = await w.put(atlas(), 'vael', lid);
  assert.equal(clos.statusCode, 409);
  assert.equal(clos.json().code, 'lot_clos');
});

test('jetons : contenu, autre outil → 401 jeton_invalide ; créateur plus MJ → 403 ou 404 ; aucun lot, rien écrit', async () => {
  const w = await monde();
  w.fiche('fiche-essai');
  const lots0 = w.un('SELECT COUNT(*) n FROM lots_import').n;
  const base = w.dump();
  const non = async (valeur: string) => {
    const x = await w.put(atlas(), 'vael', undefined, valeur);
    assert.equal(x.statusCode, 401);
    assert.equal(x.json().code, 'jeton_invalide');
    assert.equal((await w.req(valeur, 'POST', `/lots?outil=${G}`)).statusCode, 401);
  };
  await non(w.tok('antor').valeur);
  await non(w.tok('antor', ['essai/g']).valeur);
  const mira = w.tok('mira', [G]).valeur;
  w.app.db.prepare("UPDATE membres SET role = 'joueur' WHERE compte_id = ? AND univers_id = ?").run(w.id('mira'), w.E);
  // B-46 revised (main): a lost role is no longer a 401, the token falls to what a player may; an import write needs a GM.
  const ecrit = await w.put(atlas(), 'vael', undefined, mira);
  assert.ok([403, 404].includes(ecrit.statusCode), `write ${ecrit.statusCode}`);
  assert.equal(w.un('SELECT COUNT(*) n FROM lots_import').n, lots0);
  assert.equal(w.dump(), base);
});

test('un corps refusé ne casse rien ailleurs : une requête valide sans fiche sur un atlas vide ne crée que les éléments listés', async () => {
  const w = await monde();
  const r = await w.put({ etoiles: [{ cle: 's', type: 'orange', taille: 1 }] });
  assert.equal(r.json().appliquee, true);
  assert.equal(w.astres().length, 1);
  assert.equal(w.interieur(0, 0).transition === 14.5, false);
  // Nothing is deleted: a later atlas that lists nothing leaves the star.
  assert.equal((await w.put({})).json().appliquee, true);
  assert.equal(w.astres().length, 1);
});
