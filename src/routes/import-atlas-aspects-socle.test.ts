import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-rendu-aspects-socle-import (B-114, AD-aspects-socle-2, AD-atlas-3): the import sorts the
// aspect keys the core does not know under `non_rendu`, writes `graine_de` at the creation of a row only, and a replay
// (over rows older than the slice too) is « inchangée ».
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerGalaxie } = await import('../services/swn/galaxies.js');
const { lireInterieur } = await import('../services/swn/interieur.js');
const { graineDe } = await import('../wasm/coeur.js');

const G = 'swn/galaxie';

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const gal = creerGalaxie(app.db, antor, E, { titre: 'Galaxie du bord' }).id;
  app.db.prepare('UPDATE swn_galaxies SET graine = ? WHERE id = ?').run('kanevas-neutre-1', gal);
  const t = creerJeton(app.db, antor, E, { nom: 'T', dureeJours: 30, outils: [G] }, app.horloge()).valeur;
  const req = (method: 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${t}` }, payload: payload as any });
  const g = await req('PUT', `/outils/swn/galaxie/galaxies/${gal}`, { systemes: [{ cle: 'vael', nom: 'Vael', q: 0, r: 0 }] });
  assert.equal(g.statusCode, 200, g.body);
  const put = (corps: unknown) => req('PUT', `/outils/swn/galaxie/galaxies/${gal}/systemes/vael/atlas`, corps);
  const ligne = (cle: string) => app.db.prepare('SELECT * FROM swn_astres WHERE cle = ?').get(cle) as any;
  const dump = () => JSON.stringify(app.db.prepare('SELECT * FROM swn_astres ORDER BY id').all());
  return { app, E, gal, antor, put, ligne, dump };
}
const etoile = { cle: 's', type: 'orange', nom: 'S', taille: 1 };
const corps = (extra: object = {}, cle = 'p1') => ({ cle, type: 'tellurique', nom: cle, orbite: 3, heure: 2, taille: 1, etoile: 's', ...extra });

test('clés inconnues : corps créé sans elles, non_rendu aux chemins, rien d\'autre', async () => {
  const w = await monde();
  const r = await w.put({ etoiles: [etoile], corps: [corps({ aspect: { inconnue: 1, anneau: { y: 2 } } })] });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.appliquee, true, r.body);
  assert.deepEqual([...j.non_rendu].sort((a: any, b: any) => a.chemin.localeCompare(b.chemin)),
    [{ chemin: 'corps[0].aspect.anneau.y', cle: 'y' }, { chemin: 'corps[0].aspect.inconnue', cle: 'inconnue' }]);
  assert.equal(j.non_rendu_total, 2);
  const a = JSON.parse(w.ligne('p1').aspect);
  assert.equal(a.inconnue, undefined);
  assert.equal(a.anneau?.y, undefined);
  // Replay: same report, only « inchangées ».
  const r2 = (await w.put({ etoiles: [etoile], corps: [corps({ aspect: { inconnue: 1, anneau: { y: 2 } } })] })).json();
  assert.deepEqual(r2.non_rendu, j.non_rendu);
  assert.equal(r2.non_rendu_total, 2);
  assert.equal(r2.natures.corps.inchangees, 1);
  assert.equal(r2.natures.corps.creees + r2.natures.corps.mises_a_jour, 0);
});

test('ancien format : aucun non_rendu, rejeu tout inchangé', async () => {
  const w = await monde();
  const doc = { etoiles: [etoile], corps: [corps({ aspect: { mer: 0.5 } })] };
  const j = (await w.put(doc)).json();
  assert.equal('non_rendu' in j, false);
  assert.equal('non_rendu_total' in j, false);
  const base = w.dump();
  const j2 = (await w.put(doc)).json();
  assert.equal('non_rendu' in j2, false);
  assert.equal(j2.natures.corps.inchangees, 1);
  assert.equal(w.dump(), base);
});

test('graine : écrite à la création quand absente, gardée quand posée, jamais modifiée au rejeu', async () => {
  const w = await monde();
  const doc = { etoiles: [etoile], corps: [corps({ aspect: { mer: 0.5 } }), corps({ aspect: { graine: 7 } }, 'p2'), corps({}, 'p3')] };
  assert.equal((await w.put(doc)).statusCode, 200);
  assert.equal(JSON.parse(w.ligne('p1').aspect).graine, await graineDe('vael', 'p1'));
  assert.equal(JSON.parse(w.ligne('p2').aspect).graine, 7);
  assert.equal(JSON.parse(w.ligne('p3').aspect).graine, await graineDe('vael', 'p3'));
  // A file that now carries another seed for p1 is a real change; one that carries none keeps the stored one.
  const base = w.dump();
  const j = (await w.put(doc)).json();
  assert.equal(j.natures.corps.inchangees, 3);
  assert.equal(w.dump(), base);
  doc.corps[1] = corps({ aspect: { mer: 0.5 } }, 'p2');
  const j2 = (await w.put(doc)).json();
  assert.equal(JSON.parse(w.ligne('p2').aspect).graine, 7, JSON.stringify(j2));
});

test('rejeu sur des lignes d\'avant la tranche (sans graine) : inchangées, rien réécrit', async () => {
  const w = await monde();
  const doc = { etoiles: [etoile], corps: [corps({ aspect: { mer: 0.5 } }), corps({}, 'p2')] };
  assert.equal((await w.put(doc)).statusCode, 200);
  for (const c of ['p1', 'p2', 's']) {
    const a = JSON.parse(w.ligne(c).aspect);
    delete a.graine;
    w.app.db.prepare('UPDATE swn_astres SET aspect = ? WHERE cle = ?').run(JSON.stringify(a), c);
  }
  const base = w.dump();
  const j = (await w.put(doc)).json();
  assert.equal(j.natures.corps.inchangees, 2, JSON.stringify(j));
  assert.equal(j.natures.etoiles.inchangees, 1, JSON.stringify(j));
  assert.equal(w.dump(), base);
});

test('lireInterieur : corps sans graine stockée rendu avec graine_de, sans écrire', async () => {
  const w = await monde();
  assert.equal((await w.put({ etoiles: [etoile], corps: [corps({ aspect: { mer: 0.5 } })] })).statusCode, 200);
  const a = JSON.parse(w.ligne('p1').aspect);
  delete a.graine;
  w.app.db.prepare('UPDATE swn_astres SET aspect = ? WHERE cle = ?').run(JSON.stringify(a), 'p1');
  const base = w.dump();
  const v = lireInterieur(w.app.db, { compteId: w.antor }, w.E, w.gal, 0, 0);
  assert.equal(v.astres.find((x: any) => x.cle === 'p1')!.aspect.graine, await graineDe('vael', 'p1'));
  assert.equal(w.dump(), base);
});

test('1 005 clés inconnues (réparties sur 5 corps) : 1 000 gardées, non_rendu_total 1 005', async () => {
  const w = await monde();
  const lesCorps = [0, 1, 2, 3, 4].map((c) => {
    const aspect: Record<string, number> = {};
    for (let i = 0; i < 201; i++) aspect[`k${i}`] = i;
    return corps({ aspect }, `p${c}`);
  });
  const r = await w.put({ etoiles: [etoile], corps: lesCorps });
  const j = r.json();
  assert.equal(j.appliquee, true, r.body.slice(0, 600));
  assert.equal(j.non_rendu.length, 1000);
  assert.equal(j.non_rendu_total, 1005);
});

test('clé connue hors bornes : encore refusée au chemin de la clé, corps non créé', async () => {
  const w = await monde();
  const r = await w.put({ etoiles: [etoile], corps: [corps({ aspect: { mer: 7, inconnue: 1 } })] });
  const j = r.json();
  assert.equal(j.appliquee, false, r.body);
  assert.ok(j.refus.some((x: any) => String(x.chemin).startsWith('corps[0].aspect')), r.body);
  assert.equal(w.ligne('p1'), undefined);
});
