import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-rendu-aspects-reliefs-ecran (B-114, AD-aspects-reliefs-3, AD-atlas-3): an atlas whose bodies carry
// every key of the slice (on the type that draws it) is applied with no `non_rendu` line; the same key on a wrong type refuses the
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

// Every key of the slice, a valid value, and the type that draws it.
const PAR_TYPE: Record<string, Record<string, unknown>> = {
  tellurique: { couleur_nuages: '#d04020', opacite_nuages: 0.5, terre_seche: 0.4, etirement: 2, eclairs: 0.3, inclinaison: -30, mers: 3, atmosphere_epaisseur: 0.6, canyons: 0.5, couleur_fissures: undefined },
  gazeuse: { etirement: 1.5, eclairs: 0.5, inclinaison: 20, atmosphere_epaisseur: 0.2 },
  rocheux: { canyons: 0.5, lave: 0.5, cristaux: 0.4, geysers: 0.3, couleur_fissures: '#ff8800', inclinaison: 5 },
  glace: { cristaux: 0.4, geysers: 0.3, couleur_fissures: '#88ccff', cratere_glace: 0.5 },
  lave: { couleur_fissures: '#ff4400' },
};
delete PAR_TYPE.tellurique!.couleur_fissures;

test('chaque clé de la tranche sur son type : appliquée, aucune ligne non_rendu, valeur gardée', async () => {
  const w = await monde();
  const cs = Object.entries(PAR_TYPE).map(([type, a]) => corps(type, a, `c-${type}`));
  const et = { ...etoile, aspect: { activite: 0.5, intensite: 1.5 } };
  const comete = { cle: 'cm', type: 'comete', nom: 'Cm', orbite: 6, heure: 1, taille: 0.2, aspect: { vue: 'face' } };
  const r = await w.put({ etoiles: [et], corps: cs, points: [comete] });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.appliquee, true, r.body);
  assert.equal('non_rendu' in j, false, r.body);
  assert.equal(j.non_rendu_total ?? 0, 0);
  for (const [type, a] of Object.entries(PAR_TYPE)) {
    const s = JSON.parse((w.app.db.prepare('SELECT aspect FROM swn_astres WHERE cle = ?').get(`c-${type}`) as any).aspect);
    for (const [k, v] of Object.entries(a)) assert.deepEqual(s[k], v, `${type}.${k}`);
  }
  assert.equal(JSON.parse((w.app.db.prepare("SELECT aspect FROM swn_astres WHERE cle = 's'").get() as any).aspect).activite, 0.5);
  assert.equal(JSON.parse((w.app.db.prepare("SELECT aspect FROM swn_astres WHERE cle = 'cm'").get() as any).aspect).vue, 'face');
  // Replay: all unchanged, still no non_rendu.
  const base = w.dump();
  const j2 = (await w.put({ etoiles: [et], corps: cs, points: [comete] })).json();
  assert.equal('non_rendu' in j2, false);
  assert.equal(j2.natures.corps.inchangees, cs.length);
  assert.equal(w.dump(), base);
});

/** The atlas is refused as a whole (AD-atlas-3): answered, not applied, the refused line named by its path. */
function refuse(r: any, chemin: string, cle?: string) {
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.appliquee, false, r.body);
  assert.equal(j.refus[0].chemin, chemin, r.body);
  if (cle) assert.ok(j.refus[0].raison.includes(`\`${cle}\``), r.body);
  assert.equal('non_rendu' in j, false, r.body);
}

const MAUVAIS: Array<[string, string, string, unknown]> = [
  ['lave', 'tellurique', 'lave', 0.5],
  ['mers', 'gazeuse', 'mers', 2],
  ['couleur_nuages', 'glace', 'couleur_nuages', '#d04020'],
  ['cratere_glace', 'rocheux', 'cratere_glace', 0.5],
  ['geysers', 'gazeuse', 'geysers', 0.5],
  ['eclairs', 'rocheux', 'eclairs', 0.5],
];
for (const [nom, type, cle, val] of MAUVAIS) {
  test(`${nom} sur un corps ${type} : l'atlas entier est refusé avec le chemin, rien n'est écrit`, async () => {
    const w = await monde();
    const avant = w.dump();
    const r = await w.put({ etoiles: [etoile], corps: [corps('tellurique', { terre_seche: 0.2 }, 'ok'), corps(type, { [cle]: val }, 'mauvais')] });
    refuse(r, 'corps[1].aspect', cle);
    assert.equal(w.dump(), avant, 'tout ou rien');
  });
}

test('vue sur une étoile et activité sur un corps : refusés', async () => {
  const w = await monde();
  const avant = w.dump();
  const r = await w.put({ etoiles: [etoile], corps: [corps('tellurique', { activite: 0.5 }, 'p')] });
  refuse(r, 'corps[0].aspect');
  assert.equal(w.dump(), avant);
});

test('valeur hors bornes d\'une clé de la tranche : refus avec le chemin', async () => {
  const w = await monde();
  const avant = w.dump();
  const r = await w.put({ etoiles: [etoile], corps: [corps('tellurique', { mers: 9 }, 'p')] });
  refuse(r, 'corps[0].aspect');
  assert.equal(w.dump(), avant);
});

test('ancien format : rapport inchangé (non_rendu pour une clé vraiment inconnue, rejeu inchangé)', async () => {
  const w = await monde();
  const doc = { etoiles: [etoile], corps: [corps('tellurique', { mer: 0.5, inconnue: 1 }, 'p1')] };
  const j = (await w.put(doc)).json();
  assert.deepEqual(j.non_rendu, [{ chemin: 'corps[0].aspect.inconnue', cle: 'inconnue' }]);
  const j2 = (await w.put(doc)).json();
  assert.deepEqual(j2.non_rendu, j.non_rendu);
  assert.equal(j2.natures.corps.inchangees, 1);
});
