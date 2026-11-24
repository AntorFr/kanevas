// Ensemble test (door level) of kanevas-battlemap-generation, case « sans moteur d'image » (B-99, AD-88): the entry of generation is
// absent and the rest of the library keeps working. Written from the exit criterion only.
//
// TEST PLAN
//  B-99 sans moteur : tool switched on for the system but no engine (no stub, no signed-in Codex) -> every lots route answers 404 to the GM,
//                     the tool is in no list of accessible tools, the library of assets and its direction still answer 200
//  B-99 avec moteur : the same universe, same activation, with the stub engine -> the tool is listed and the route answers 200
//                     (this contrast proves the absence above comes from the engine alone)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const IMPORTS = `
const { buildApp } = await import(${JSON.stringify(new URL('../../app.js', import.meta.url).pathname)});
const { semerBouchon, semerIllustrations } = await import(${JSON.stringify(new URL('../../bouchon/depart.js', import.meta.url).pathname)});
const { poserActivation } = await import(${JSON.stringify(new URL('../../services/outils.js', import.meta.url).pathname)});
`;
// Phase 1 (stub engine): seed the world, switch the tool on for the system, print a GM session cookie.
const PREPARATION = `
process.env.NODE_ENV = 'test'; process.env.KANEVAS_STUB = '1';
${IMPORTS}
const app = await buildApp();
semerBouchon(app.db);
await semerIllustrations(app.db, process.env.DOSSIER);
const one = (sql, ...a) => app.db.prepare(sql).get(...a);
const S = one('SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id;
poserActivation(app.db, one("SELECT id FROM comptes WHERE username = 'antor'").id, { niveau: 'systeme', id: S }, 'battlemap/generation', true);
const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
console.log('COOKIE ' + res.cookies.find((x) => x.name === 'kanevas_session').value);
await app.close();
process.exit(0);
`;
// Phase 2: the same database, started with the stub or without any engine.
const LECTURE = `
process.env.NODE_ENV = 'test';
if (process.env.AVEC_MOTEUR === '1') process.env.KANEVAS_STUB = '1'; else delete process.env.KANEVAS_STUB;
${IMPORTS}
const app = await buildApp();
const one = (sql, ...a) => app.db.prepare(sql).get(...a);
const E = one('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id;
const cookie = 'kanevas_session=' + process.env.COOKIE;
const get = async (u) => { const r = await app.inject({ method: 'GET', url: u, headers: { cookie } }); return { statut: r.statusCode, corps: r.body }; };
const base = '/api/univers/' + E + '/outils';
const sortie = {
  lots: (await get(base + '/battlemap/lots')).statut,
  lotsPut: (await app.inject({ method: 'PUT', url: base + '/battlemap/lots', headers: { cookie }, payload: { lignes: [{ nom: 'A', categorie: 'objet', largeur: 1, hauteur: 1, indice: '' }] } })).statusCode,
  assets: (await get(base + '/battlemap/assets')).statut,
  direction: (await get(base + '/battlemap/direction')).statut,
  listes: [(await get(base)).corps, (await get(base + '/entrees')).corps].map((c) => c.includes('generation')),
};
console.log('SORTIE ' + JSON.stringify(sortie));
await app.close();
process.exit(0);
`;

const lancer = (code: string, env: Record<string, string>) =>
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env: { ...process.env, ...env }, encoding: 'utf8', cwd: process.cwd(), timeout: 90_000 });

function jouer(avecMoteur: boolean) {
  const dossier = mkdtempSync(join(tmpdir(), 'bm-sans-moteur-'));
  const commun = { DB_PATH: join(dossier, 'kanevas.db'), CODEX_HOME: join(dossier, 'codex'), DOSSIER: dossier };
  const prep = lancer(PREPARATION, commun).split('\n').find((l) => l.startsWith('COOKIE '));
  assert.ok(prep, 'préparation sans cookie');
  const sortie = lancer(LECTURE, { ...commun, AVEC_MOTEUR: avecMoteur ? '1' : '0', COOKIE: prep.slice(7) });
  const ligne = sortie.split('\n').find((l) => l.startsWith('SORTIE '));
  assert.ok(ligne, `pas de sortie de la sonde : ${sortie.slice(-500)}`);
  return JSON.parse(ligne.slice(7)) as { lots: number; lotsPut: number; assets: number; direction: number; listes: boolean[] };
}

test('sans moteur d’image : l’outil de génération est absent partout, la bibliothèque marche', () => {
  // Panne : l'entrée de génération proposée (ou ses routes ouvertes) alors qu'aucun moteur n'existe ; la bibliothèque cassée par l'absence.
  const s = jouer(false);
  assert.equal(s.lots, 404);
  assert.equal(s.lotsPut, 404);
  assert.deepEqual(s.listes, [false, false]);
  assert.equal(s.assets, 200);
  assert.equal(s.direction, 200);
});

test('avec moteur : le même univers, la même activation, offrent l’outil', () => {
  // Panne : l'outil jamais offert (le contraste qui donne son sens au test précédent).
  const s = jouer(true);
  assert.equal(s.lots, 200);
  assert.equal(s.lotsPut, 200);
  assert.equal(s.listes[0] || s.listes[1], true);
  assert.equal(s.assets, 200);
});
