import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-outils-format-vaisseaux-regles-livre-catalogue (W-1, W-4, W-5, W-7): the invented trial catalogue is written by the test,
// imported through the session route, refused field by field, replayed. Expectations hard-coded from the criterion. Nothing of Éneria.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserActivation } = await import('../services/outils.js');
const { produireRegles } = await import('../services/swn/regles-hooks.js');

const T = 'swn/vaisseaux';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const VISE = { nature: 'armes', cle: 'canon-r' };
const coque = { classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 20, masse: 20, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, emports: 3 };
function catalogue(version = 'v1'): any {
  return {
    catalogue: T, version, coques: [{ cle: 'fregate-r', nom: 'Frégate R', ...coque }], moteurs: [], amenagements: [], defenses: [],
    armes: [{ cle: 'canon-r', nom: 'Canon R', emport: 1, munitions: 0, cout_munition: 0, ...el }],
    modifications: [
      { cle: 'optimise-l', nom: 'Optimise L', ...el, effet: 'soutes_optimisees_livre', limite: 1 },
      { cle: 'blindage-l', nom: 'Blindage L', ...el, effet: 'blindage_renforce', limite: 1, valeur: 2 },
      { cle: 'montage-l', nom: 'Montage L', ...el, effet: 'montages_specialises', limite: 1, vise: VISE },
      { cle: 'surcharge-l', nom: 'Surcharge L', ...el, effet: 'surcharge_cumulable', limite: 2, effet_pct: 50, vise: VISE },
      { cle: 'simple', nom: 'Simple', ...el },
    ],
    exemples: [],
  };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  poserActivation(app.db, antor, { niveau: 'univers', id: E }, T, true);
  const sess = async (compte: string) => {
    const c = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
    return `kanevas_session=${c.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  };
  const cookie = await sess('antor'); const cookieLea = await sess('lea');
  const base = `/api/univers/${E}/outils/${T}/catalogue`;
  const post = (corps: unknown) => app.inject({ method: 'POST', url: base + '/application', headers: { cookie }, payload: corps as any });
  const lire = async (nature: string) => (await app.inject({ method: 'GET', url: `${base}?nature=${nature}`, headers: { cookie: cookieLea } })).json();
  const ligne = async (nature: string, cle: string) => (await lire(nature)).elements.find((e: any) => e.cle === cle);
  const regles = (nature: string) => produireRegles(app.db, E, `regles-${nature}`).contenu;
  return { app, E, post, ligne, regles };
}


const NOMS = ['optimise-l', 'blindage-l', 'montage-l', 'surcharge-l'];

test('W-7 : chaque élément employant l’un des quatre effets est créé, puis inchangé au rejeu, relu par GET catalogue', async () => {
  const w = await monde();
  const r = await w.post(catalogue());
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, []);
  assert.equal(r.json().natures.modifications.ajoutes, 5);
  for (const cle of NOMS) assert.ok(await w.ligne('modifications', cle), cle);
  assert.equal((await w.ligne('modifications', 'surcharge-l')).donnees.effet_pct, 50);
  assert.equal((await w.ligne('modifications', 'blindage-l')).donnees.valeur, 2);
  for (const cle of NOMS) assert.ok(!('armure_par_classe' in (await w.ligne('modifications', cle)).donnees), cle);
  const rejeu = await w.post(catalogue());
  assert.deepEqual(rejeu.json().refus, []);
  for (const [n, c] of Object.entries<any>(rejeu.json().natures)) { assert.equal(c.ajoutes, 0, n); assert.equal(c.modifies, 0, `${n} modifiés au rejeu`); }
  assert.equal(rejeu.json().versionCatalogue, undefined, 'la version du catalogue ne monte pas pour un rejeu identique');
});

test('W-7 : un rejeu qui retire l’effet remet l’élément sans effet et monte la version', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const f = catalogue('v2');
  f.modifications = f.modifications.filter((m: any) => m.cle === 'blindage-l' || m.cle === 'optimise-l');
  for (const m of f.modifications) { delete m.effet; delete m.valeur; delete m.limite; m.limite = 1; }
  const r = await w.post(f);
  assert.deepEqual(r.json().refus, []);
  assert.equal(r.json().natures.modifications.modifies, 2);
  assert.equal(r.json().versionCatalogue, 'v2');
  const d = (await w.ligne('modifications', 'blindage-l')).donnees;
  assert.ok(!('effet' in d) && !('valeur' in d), JSON.stringify(d));
});

const cas: [string, Record<string, unknown>, string, string][] = [
  ['optimise-l', { effet_pct: 10 }, 'effet_pct', 'paramètre réservé à son effet'],
  ['optimise-l', { limite: 2 }, 'limite', 'limite 1 attendue'],
  ['optimise-l', { vise: VISE }, 'vise', 'paramètre réservé à son effet.'],
  ['blindage-l', { valeur: 10 }, 'valeur', ''],
  ['blindage-l', { valeur: -1 }, 'valeur', ''],
  ['blindage-l', { valeur: 1.5 }, 'valeur', ''],
  ['blindage-l', { valeur: undefined }, 'valeur', ''],
  ['blindage-l', { vise: VISE }, 'vise', 'paramètre réservé à son effet.'],
  ['blindage-l', { limite: 2 }, 'limite', 'limite 1 attendue'],
  ['blindage-l', { effet_pct: 50 }, 'effet_pct', 'paramètre réservé à son effet'],
  ['montage-l', { vise: undefined }, 'vise', 'élément visé exigé.'],
  ['montage-l', { limite: 2 }, 'limite', 'limite 1 attendue'],
  ['montage-l', { effet_pct: 50 }, 'effet_pct', 'paramètre réservé à son effet'],
  ['surcharge-l', { vise: undefined }, 'vise', 'élément visé exigé.'],
  ['surcharge-l', { effet_pct: 0 }, 'effet_pct', ''],
  ['surcharge-l', { effet_pct: 1001 }, 'effet_pct', ''],
  ['surcharge-l', { limite: 0 }, 'limite', 'nombre entier de 1 ou plus attendu.'],
  ['surcharge-l', { limite: 1.5 }, 'limite', 'nombre entier de 1 ou plus attendu.'],
  ['simple', { effet: 'soutes_optimisees', effet_pct: 10 }, 'effet', 'effet inconnu : soutes_optimisees'],
  ['simple', { effet: 'armure_par_classe' }, 'effet', 'effet inconnu : armure_par_classe'],
  ['simple', { effet: 'montage_specialise', valeur: 1, limite: 1 }, 'effet', 'effet inconnu : montage_specialise'],
  ['simple', { effet: 'surcharge_arme', effet_pct: 50, limite: 1 }, 'effet', 'effet inconnu : surcharge_arme'],
];

test('W-7 : chaque refus nomme son champ et sa phrase, les autres lignes passent', async () => {
  const w = await monde();
  for (const [cle, patch, champ, phrase] of cas) {
    const f = catalogue();
    const l = f.modifications.find((x: any) => x.cle === cle);
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete l[k]; else l[k] = v; }
    const r = await w.post(f);
    const nom = `${cle} ${JSON.stringify(patch)}`;
    assert.equal(r.statusCode, 200, `${nom} ${r.body}`);
    const refus = r.json().refus;
    assert.equal(refus.length, 1, `${nom} ${JSON.stringify(refus)}`);
    assert.equal(refus[0].cle, cle, nom); assert.equal(refus[0].champ, champ, nom);
    assert.ok(JSON.stringify(refus[0]).includes(phrase), `${nom} : ${JSON.stringify(refus[0])}`);
  }
});

test('W-7 : les bornes passent (valeur 0 et 9, effet_pct 1 et 1 000, limite 2 et 3 de la surcharge)', async () => {
  const w = await monde();
  const f = catalogue();
  const m = (cle: string, o: Record<string, unknown>) => f.modifications.push({ cle, nom: cle, ...el, limite: 1, ...o });
  m('b0', { effet: 'blindage_renforce', valeur: 0 }); m('b9', { effet: 'blindage_renforce', valeur: 9 });
  m('s1', { effet: 'surcharge_cumulable', effet_pct: 1, vise: VISE }); m('s1000', { effet: 'surcharge_cumulable', effet_pct: 1000, vise: VISE, limite: 3 });
  const r = await w.post(f);
  assert.deepEqual(r.json().refus, []);
  assert.equal((await w.ligne('modifications', 'b0')).donnees.valeur, 0);
  assert.equal((await w.ligne('modifications', 'b9')).donnees.valeur, 9);
  assert.equal((await w.ligne('modifications', 's1000')).donnees.limite, 3);
});

test('W-6 : la colonne Armure par classe a disparu des fiches de règles, Pourcentage seulement quand une ligne le dit', async () => {
  const w = await monde();
  const f = catalogue(); f.modifications = f.modifications.filter((m: any) => m.cle !== 'surcharge-l');
  assert.deepEqual((await w.post(f)).json().refus, []);
  const entete = w.regles('modifications').split('\n').find((l) => l.startsWith('| Nom'))!;
  assert.doesNotMatch(entete, /Armure par classe|Pourcentage|Arrondi/);
  assert.match(entete, /Effet/);
});
