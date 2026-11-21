import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-elements-import (AD-145, AD-150, P-25): an atlas carrying an element is
// imported twice the same, anchors the system, refuses an unknown body by path, and keeps B-48 for elements.
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
const { modifierElement } = await import('../services/swn/ecriture-elements.js');

const G = 'swn/galaxie';
const ESSAI = fileURLToPath(new URL('../outils/swn/exemples/atlas-essai.json', import.meta.url));
const atlas = (elements: unknown[]) => ({ ...JSON.parse(readFileSync(ESSAI, 'utf8')), elements });
const vaisseau = () => ({ cle: 'nef', genre: 'vaisseau', nom: 'La Nef', sur: 'planete-un' });

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const gal = creerGalaxie(app.db, id('antor'), E, { titre: 'Galaxie du bord' }).id;
  app.db.prepare('UPDATE swn_galaxies SET graine = ? WHERE id = ?').run('kanevas-neutre-1', gal);
  const t = creerJeton(app.db, id('antor'), E, { nom: 'T', dureeJours: 30, outils: [G] }, app.horloge()).valeur;
  const req = (method: 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${t}` }, payload: payload as any });
  const g = await req('PUT', `/outils/swn/galaxie/galaxies/${gal}`, {
    systemes: [{ cle: 'vael', nom: 'Vael', q: 0, r: 0 }, { cle: 'oran', nom: 'Oran', q: 3, r: 0 }],
  });
  assert.equal(g.statusCode, 200, g.body);
  const put = (corps: unknown, cle = 'vael') => req('PUT', `/outils/swn/galaxie/galaxies/${gal}/systemes/${cle}/atlas`, corps);
  const dump = () => JSON.stringify(['swn_systemes', 'swn_astres', 'swn_formations', 'swn_elements', 'swn_galaxies']
    .map((tb) => app.db.prepare(`SELECT * FROM ${tb} ORDER BY 1`).all()));
  const els = () => app.db.prepare('SELECT * FROM swn_elements ORDER BY id').all() as any[];
  const fiche = (cle: string) => {
    const f = creerFiche(app.db, id('antor'), E, { type: 'lieu', titre: `Fiche ${cle}` });
    app.db.prepare('UPDATE fiches SET cle = ? WHERE id = ?').run(cle, f.id);
    return f.id as number;
  };
  fiche('fiche-essai');
  return { app, id, E, gal, put, dump, els, fiche, un };
}

test('un élément importé deux fois : créée puis inchangée, mêmes version, système ancré dès la première', async () => {
  const w = await monde();
  const fid = w.fiche('fiche-nef');
  const r = await w.put(atlas([{ ...vaisseau(), description: 'Un cargo.', aspect: { couleur: 'ambre' }, secret: true, fiche: 'fiche-nef' }]));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().appliquee, true, r.body);
  assert.deepEqual([r.json().natures.elements.creees, r.json().natures.elements.inchangees, r.json().natures.elements.refusees], [1, 0, 0]);
  const [e] = w.els();
  assert.equal(e.cle, 'nef');
  assert.equal(e.secret, 1);
  assert.equal(e.fiche_id, fid);
  assert.equal(e.version_importee, e.version);
  assert.equal(w.un('SELECT COUNT(*) n FROM swn_astres WHERE cle = ?', 'planete-un').n, 1);
  const base = w.dump();
  const r2 = await w.put(atlas([{ ...vaisseau(), description: 'Un cargo.', aspect: { couleur: 'ambre' }, secret: true, fiche: 'fiche-nef' }]));
  assert.equal(r2.json().appliquee, true);
  assert.deepEqual([r2.json().natures.elements.creees, r2.json().natures.elements.inchangees, r2.json().natures.elements.mises_a_jour], [0, 1, 0]);
  assert.equal(w.dump(), base);
});

test('un élément sur un système neuf ancre le système par le même appel', async () => {
  const w = await monde();
  const avant = lireInterieur(w.app.db, { compteId: w.id('antor') }, w.E, w.gal, 3, 0);
  const r = await w.put({ elements: [{ cle: 'station', genre: 'station', nom: 'Halte' }] }, 'oran');
  assert.equal(r.json().appliquee, true, r.body);
  assert.equal(r.json().natures.elements.creees, 1);
  const e = w.els()[0];
  assert.deepEqual([e.astre_id, e.orbite, e.heure], [null, 1, 0]);
  const apres = lireInterieur(w.app.db, { compteId: w.id('antor') }, w.E, w.gal, 3, 0);
  assert.equal(apres.etat, 'defini', `avant : ${avant.etat}`);
  assert.equal((await w.put({ elements: [{ cle: 'station', genre: 'station', nom: 'Halte' }] }, 'oran')).json().natures.elements.inchangees, 1);
});

test('élément sur un corps inconnu : appliquee false, chemin du champ, compté, base identique octet pour octet', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas([]))).json().appliquee, true);
  const base = w.dump();
  const r = await w.put(atlas([{ ...vaisseau(), sur: 'nulle-part' }, { cle: 'bonne', genre: 'ville', nom: 'Bonne', orbite: 2, heure: 3 }]));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().appliquee, false);
  assert.deepEqual(r.json().refus.map((x: any) => x.chemin), ['elements[0].sur']);
  assert.equal(r.json().refus[0].nature, 'elements');
  assert.equal(r.json().natures.elements.refusees, 1);
  assert.equal(w.dump(), base);
});

test('refus de lecture : genre, doublon de clé avec un corps, orbite sans heure, corps et orbite ensemble', async () => {
  const w = await monde();
  const base = w.dump();
  const r = await w.put(atlas([
    { cle: 'a', genre: 'dragon', nom: 'A' },
    { cle: 'planete-un', genre: 'ville', nom: 'Même clé qu un corps', orbite: 2, heure: 1 },
    { cle: 'c', genre: 'ville', nom: 'C', orbite: 2 },
    { cle: 'd', genre: 'ville', nom: 'D', sur: 'planete-un', orbite: 2, heure: 1 },
  ]));
  assert.equal(r.json().appliquee, false);
  const chemins = r.json().refus.map((x: any) => x.chemin);
  assert.ok(chemins.includes('elements[0].genre'), chemins.join());
  assert.ok(chemins.some((c: string) => c.startsWith('elements[1]')), chemins.join());
  assert.ok(chemins.includes('elements[2].heure'), chemins.join());
  assert.ok(chemins.some((c: string) => c.startsWith('elements[3]')), chemins.join());
  assert.equal(w.dump(), base);
});

test('clé d’élément égale à celle d’un corps du système : refusée, base inchangée', async () => {
  const w = await monde();
  assert.equal((await w.put(atlas([]))).json().appliquee, true);
  const base = w.dump();
  const r = await w.put(atlas([{ cle: 'planete-un', genre: 'ville', nom: 'Doublon', orbite: 2, heure: 1 }]));
  assert.equal(r.json().appliquee, false, r.body);
  assert.equal(r.json().refus[0].chemin.startsWith('elements[0]'), true);
  assert.equal(w.dump(), base);
});

test('valeur différente : mise à jour ; secret absent ne change rien ; modifié dans Kanevas : hors_synchro et tout annulé', async () => {
  const w = await monde();
  await w.put(atlas([{ ...vaisseau(), secret: true }]));
  const r = await w.put(atlas([{ ...vaisseau(), nom: 'La Nef II' }]));
  assert.equal(r.json().appliquee, true, r.body);
  assert.equal(r.json().natures.elements.mises_a_jour, 1);
  let e = w.els()[0];
  assert.equal(e.nom, 'La Nef II');
  assert.equal(e.secret, 1, 'secret absent : inchangé');
  assert.equal(e.version_importee, e.version);

  modifierElement(w.app.db, w.id('antor'), w.E, w.gal, 0, 0, 'nef', { nom: 'Renommée au MJ', version: e.version } as any);
  const base = w.dump();
  const same = await w.put(atlas([{ ...vaisseau(), nom: 'Renommée au MJ' }]));
  assert.equal(same.json().appliquee, true, 'la même valeur que Kanevas n’est pas un conflit');
  const r3 = await w.put(atlas([{ ...vaisseau(), nom: 'Autre valeur' }]));
  assert.equal(r3.json().appliquee, false);
  const refus = r3.json().refus.find((x: any) => x.code === 'hors_synchro');
  assert.equal(refus.chemin, 'elements[0]');
  assert.equal(refus.nature, 'elements');
  assert.equal(w.dump(), base);
  e = w.els()[0];
  assert.equal(e.nom, 'Renommée au MJ');
});

test('déplacement par import : de corps à orbite, puis rejeu inchangé', async () => {
  const w = await monde();
  await w.put(atlas([vaisseau()]));
  const a = atlas([{ cle: 'nef', genre: 'vaisseau', nom: 'La Nef', orbite: 5, heure: 2 }]);
  const r = await w.put(a);
  assert.equal(r.json().natures.elements.mises_a_jour, 1, r.body);
  const e = w.els()[0];
  assert.deepEqual([e.astre_id, e.orbite, e.heure], [null, 5, 2]);
  assert.equal((await w.put(a)).json().natures.elements.inchangees, 1);
});
