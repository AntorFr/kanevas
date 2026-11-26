import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-rendu-nuit-ecran (B-124, AD-nuit-1, AD-atlas-3): an atlas whose telluric body carries
// `villes`, `lueur` and `force_lueur` is applied with no `non_rendu` line; the same key on a wrong type refuses the
// whole atlas with the path of the refused line and writes nothing; the old format replays to the same report. Neutral names (AD-131).
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
  const gal = creerGalaxie(app.db, antor, E, { titre: 'Galaxie du bord' }).id;
  const t = creerJeton(app.db, antor, E, { nom: 'T', dureeJours: 30, outils: [G] }, app.horloge()).valeur;
  const req = (url: string, payload?: unknown) =>
    app.inject({ method: 'PUT', url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${t}` }, payload: payload as any });
  assert.equal((await req(`/outils/swn/galaxie/galaxies/${gal}`, { systemes: [{ cle: 'vael', nom: 'Vael', q: 0, r: 0 }] })).statusCode, 200);
  const put = (corps: unknown) => req(`/outils/swn/galaxie/galaxies/${gal}/systemes/vael/atlas`, corps);
  const dump = () => JSON.stringify(app.db.prepare('SELECT * FROM swn_astres ORDER BY id').all());
  return { app, put, dump };
}
const etoile = { cle: 's', type: 'orange', nom: 'S', taille: 1 };
const corps = (type: string, aspect: object, cle: string) => ({ cle, type, nom: cle, orbite: 3, heure: 2, taille: 1, etoile: 's', aspect });

const NUIT = { villes: 0.6, lueur: 0.5, force_lueur: 1.5 };

test('un tellurique à villes, lueur et force_lueur : appliqué, aucune ligne non_rendu, valeurs gardées, rejeu inchangé', async () => {
  const w = await monde();
  const cs = [corps('tellurique', NUIT, 'terre')];
  const r = await w.put({ etoiles: [etoile], corps: cs });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.appliquee, true, r.body);
  assert.equal('non_rendu' in j, false, r.body);
  assert.equal(j.non_rendu_total ?? 0, 0);
  const a = JSON.parse((w.app.db.prepare("SELECT aspect FROM swn_astres WHERE cle = 'terre'").get() as any).aspect);
  for (const [k, v] of Object.entries(NUIT)) assert.equal(a[k], v, k);
  const base = w.dump();
  const j2 = (await w.put({ etoiles: [etoile], corps: cs })).json();
  assert.equal('non_rendu' in j2, false);
  assert.equal(j2.natures.corps.inchangees, 1);
  assert.equal(w.dump(), base);
});

for (const cle of Object.keys(NUIT)) {
  test(`${cle} sur une gazeuse : l'atlas entier est refusé avec le chemin, rien n'est écrit`, async () => {
    const w = await monde();
    const avant = w.dump();
    const r = await w.put({ etoiles: [etoile], corps: [corps('tellurique', { villes: 0.2 }, 'ok'), corps('gazeuse', { [cle]: NUIT[cle as keyof typeof NUIT] }, 'mauvais')] });
    assert.equal(r.statusCode, 200, r.body);
    const j = r.json();
    assert.equal(j.appliquee, false, r.body);
    assert.equal(j.refus[0].chemin, 'corps[1].aspect', r.body);
    assert.ok(j.refus[0].raison.includes(`\`${cle}\``), r.body);
    assert.equal('non_rendu' in j, false, r.body);
    assert.equal(w.dump(), avant, 'tout ou rien');
  });
}

test('ancien format : rapport inchangé (non_rendu pour une clé vraiment inconnue, rejeu inchangé)', async () => {
  const w = await monde();
  const doc = { etoiles: [etoile], corps: [corps('tellurique', { mer: 0.5, inconnue: 1 }, 'p1')] };
  const j = (await w.put(doc)).json();
  assert.deepEqual(j.non_rendu, [{ chemin: 'corps[0].aspect.inconnue', cle: 'inconnue' }]);
  const j2 = (await w.put(doc)).json();
  assert.deepEqual(j2.non_rendu, j.non_rendu);
  assert.equal(j2.natures.corps.inchangees, 1);
});
