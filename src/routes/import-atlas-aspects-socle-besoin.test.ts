import assert from 'node:assert/strict';
import { test } from 'node:test';

// Verification (written from the need, not from the code) of kanevas-carte-rendu-aspects-socle, B-114 « A setting the core cannot
// render is reported by the import, never silently dropped »: the door is the atlas import route. Neutral fixture (AD-131).
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerGalaxie } = await import('../services/swn/galaxies.js');

const G = 'swn/galaxie';

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const gal = creerGalaxie(app.db, antor, E, { titre: 'Galaxie de vérification' }).id;
  const t = creerJeton(app.db, antor, E, { nom: 'T', dureeJours: 30, outils: [G] }, app.horloge()).valeur;
  const req = (url: string, payload: unknown) =>
    app.inject({ method: 'PUT', url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${t}` }, payload: payload as any });
  const g = await req(`/outils/swn/galaxie/galaxies/${gal}`, { systemes: [{ cle: 'vael', nom: 'Vael', q: 0, r: 0 }] });
  assert.equal(g.statusCode, 200, g.body);
  const put = (doc: unknown) => req(`/outils/swn/galaxie/galaxies/${gal}/systemes/vael/atlas`, doc);
  const ligne = (cle: string) => app.db.prepare('SELECT * FROM swn_astres WHERE cle = ?').get(cle) as any;
  return { put, ligne };
}
const etoile = (extra: object = {}) => ({ cle: 's', type: 'orange', nom: 'S', taille: 1, ...extra });
const planete = (extra: object = {}, cle = 'p1') => ({ cle, type: 'tellurique', nom: cle, orbite: 3, heure: 2, taille: 1, etoile: 's', ...extra });

// Panne attrapée : l'import qui refuse le corps (au lieu de le ranger) pour une clé de l'atelier de la source, ou qui l'avale sans trace.
test('B-114 : une clé inconnue d\'une étoile, d\'une lune et d\'une comète est rangée sous non_rendu avec son chemin, les trois astres sont importés', async () => {
  const w = await monde();
  const r = await w.put({
    etoiles: [etoile({ aspect: { orage: 1 } })],
    corps: [planete({ lunes: [{ cle: 'l1', type: 'rocheux', nom: 'L', orbite: 1, heure: 1, taille: 1, aspect: { geyser_x: 2 } }] })],
    points: [{ cle: 'c1', type: 'comete', nom: 'C', orbite: 6, heure: 1, taille: 1, aspect: { queue_x: 3 } }],
  });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.appliquee, true, r.body);
  const chemins = (j.non_rendu as any[]).map((x) => `${x.chemin}|${x.cle}`).sort();
  assert.equal(chemins.length, 3, r.body);
  assert.ok(chemins.some((c) => /^etoiles\[0\]\.aspect\.orage\|orage$/.test(c)), chemins.join(' ; '));
  assert.ok(chemins.some((c) => /^corps\[0\]\.lunes\[0\]\.aspect\.geyser_x\|geyser_x$/.test(c)), chemins.join(' ; '));
  assert.ok(chemins.some((c) => /^points\[0\]\.aspect\.queue_x\|queue_x$/.test(c)), chemins.join(' ; '));
  assert.equal(j.non_rendu_total, 3);
  for (const cle of ['s', 'l1', 'c1', 'p1']) assert.ok(w.ligne(cle), `${cle} importé`);
});

// Panne attrapée : le tri qui ne descend pas dans `tache` (le chemin d'une clé imbriquée se perd ou le corps est refusé).
test('B-114 : une clé inconnue dans `tache` est rangée sous non_rendu au chemin complet, la tache connue est gardée', async () => {
  const w = await monde();
  const r = await w.put({ etoiles: [etoile()], corps: [planete({ type: 'gazeuse', aspect: { tache: { latitude: 0.5, taille: 0.2, forme_x: 1 } } })] });
  const j = r.json();
  assert.equal(j.appliquee, true, r.body);
  assert.deepEqual(j.non_rendu, [{ chemin: 'corps[0].aspect.tache.forme_x', cle: 'forme_x' }]);
  const a = JSON.parse(w.ligne('p1').aspect);
  assert.deepEqual(a.tache, { latitude: 0.5, taille: 0.2 });
});

// Panne attrapée : le plafond compté à 999 ou 1001 ; le bord exact de 1 000 ne tronque rien.
test('B-114 : exactement 1 000 clés inconnues sont toutes gardées, total 1 000', async () => {
  const w = await monde();
  const lesCorps = [0, 1, 2, 3, 4].map((c) => {
    const aspect: Record<string, number> = {};
    for (let i = 0; i < 200; i++) aspect[`k${i}`] = i;
    return planete({ aspect, orbite: 3 + c }, `p${c}`);
  });
  const r = await w.put({ etoiles: [etoile()], corps: lesCorps });
  const j = r.json();
  assert.equal(j.appliquee, true, r.body.slice(0, 500));
  assert.equal(j.non_rendu.length, 1000);
  assert.equal(j.non_rendu_total, 1000);
});

// Panne attrapée : `disparue` accepté sur n'importe quel astre (la table dit : sur une étoile seulement, refusé ailleurs).
test('B-114 : `disparue` est gardé sur une étoile et refuse l\'import sur une planète, au chemin de la clé', async () => {
  const w = await monde();
  const bon = await w.put({ etoiles: [etoile({ aspect: { disparue: true } })], corps: [planete()] });
  assert.equal(bon.json().appliquee, true, bon.body);
  assert.equal(JSON.parse(w.ligne('s').aspect).disparue, true);
  const w2 = await monde();
  const mauvais = (await w2.put({ etoiles: [etoile()], corps: [planete({ aspect: { disparue: true } })] })).json();
  assert.equal(mauvais.appliquee, false);
  assert.ok(mauvais.refus.some((x: any) => String(x.chemin).startsWith('corps[0].aspect')), JSON.stringify(mauvais));
  assert.equal(w2.ligne('p1'), undefined);
});

// Panne attrapée : « un corps sans anneau n'a pas d'anneau » — l'import qui invente un anneau ou la graine qui bouge au rejeu.
test('B-114 : un corps sans `anneau` est stocké sans anneau, avec une graine ; la graine posée par la source n\'est jamais changée', async () => {
  const w = await monde();
  const r = await w.put({ etoiles: [etoile()], corps: [planete({ type: 'gazeuse', aspect: {} }), planete({ aspect: { graine: 424242 }, orbite: 5 }, 'p2')] });
  assert.equal(r.json().appliquee, true, r.body.slice(0, 500));
  const a1 = JSON.parse(w.ligne('p1').aspect);
  assert.equal('anneau' in a1, false);
  assert.equal(Number.isInteger(a1.graine), true, `graine ${JSON.stringify(a1.graine)}`);
  assert.equal(JSON.parse(w.ligne('p2').aspect).graine, 424242);
});
