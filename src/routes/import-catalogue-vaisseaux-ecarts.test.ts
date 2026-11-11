import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-outils-format-vaisseaux-ecarts-catalogue (Y-1, Y-2, Y-5): invented trial catalogue written by the test, imported through
// the session route, read back by GET catalogue, replayed, refused field by field with the E-20 sentences, rendered in the rule sheets.
// Expectations are hard-coded from the criterion. Nothing of Éneria.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserActivation } = await import('../services/outils.js');
const { produireRegles } = await import('../services/swn/regles-hooks.js');

const T = 'swn/vaisseaux';
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 10, masse: 8, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
function catalogue(version = 'v1', retirer = false): any {
  const si = <X,>(x: X) => (retirer ? {} : x);
  return {
    catalogue: T, version,
    coques: [{ cle: 'fregate-r', nom: 'Frégate R', ...coque }],
    moteurs: [{ cle: 'm1', nom: 'M1', niveau: 1, ...el }],
    amenagements: [
      { cle: 'soute-c', nom: 'Soute C', ...el, ...si({ soute: 10, soute_par_classe: [10, 20, 40, 80] }) },
      { cle: 'moteur-sys', nom: 'Moteur système', ...el, ...si({ effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 10 }) },
      { cle: 'vide', nom: 'Vide', ...el },
    ],
    defenses: [
      { cle: 'voiles', nom: 'Voiles', ...el, ...si({ bonus_vitesse: -2 }) },
      { cle: 'propulseur', nom: 'Propulseur', ...el, ...si({ bonus_vitesse: 2 }) },
      { cle: 'nul', nom: 'Nul', ...el, ...si({ bonus_vitesse: 0 }) },
    ],
    armes: [{ cle: 'canon-r', nom: 'Canon R', emport: 1, munitions: 0, cout_munition: 0, ...el }],
    modifications: [
      { cle: 'atelier', nom: 'Atelier', ...el, ...si({ reparation_min: 2 }) },
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

test('Y-1 : chaque champ nouveau est créé, relu par GET catalogue, inchangé au rejeu', async () => {
  const w = await monde();
  const r = await w.post(catalogue());
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, []);
  assert.equal((await w.ligne('defenses', 'voiles')).donnees.bonus_vitesse, -2);
  assert.equal((await w.ligne('defenses', 'propulseur')).donnees.bonus_vitesse, 2);
  assert.equal((await w.ligne('defenses', 'nul')).donnees.bonus_vitesse, 0);
  assert.equal((await w.ligne('modifications', 'atelier')).donnees.reparation_min, 2);
  const s = (await w.ligne('amenagements', 'soute-c')).donnees;
  assert.deepEqual(s.soute_par_classe, [10, 20, 40, 80]); assert.equal(s.soute, 10);
  assert.equal((await w.ligne('amenagements', 'moteur-sys')).donnees.reduction_cout_pct, 10);
  const simple = (await w.ligne('modifications', 'simple')).donnees;
  assert.ok(!('reparation_min' in simple));
  const vide = (await w.ligne('amenagements', 'vide')).donnees;
  for (const k of ['soute_par_classe', 'reduction_cout_pct']) assert.ok(!(k in vide), k);
  const nat = (await w.post(catalogue())).json().natures;
  for (const n of Object.keys(nat)) { assert.equal(nat[n].ajoutes, 0, n); assert.equal(nat[n].modifies ?? 0, 0, n); }
});

test('Y-1 : un rejeu qui retire un champ remet null et monte la version du catalogue', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const v = () => (w.app.db.prepare("SELECT version_catalogue v FROM swn_catalogue_modifications WHERE cle = 'atelier' AND proprietaire = 'univers'").get() as any).v;
  assert.equal(v(), 'v1');
  const r = await w.post(catalogue('v2', true));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().natures.modifications.modifies, 1);
  assert.equal(r.json().natures.defenses.modifies, 3);
  assert.equal(r.json().natures.amenagements.modifies, 2);
  const db = w.app.db;
  assert.equal((db.prepare("SELECT reparation_min r FROM swn_catalogue_modifications WHERE cle = 'atelier'").get() as any).r, null);
  for (const x of db.prepare("SELECT soute_par_classe a, reduction_cout_pct b, effet c FROM swn_catalogue_amenagements WHERE cle IN ('soute-c','moteur-sys') AND proprietaire = 'univers'").all() as any[]) {
    assert.equal(x.a, null); assert.equal(x.b, null); assert.equal(x.c, null);
  }
  assert.equal((db.prepare("SELECT COUNT(*) n FROM swn_catalogue_defenses WHERE cle IN ('voiles','propulseur','nul') AND bonus_vitesse IS NOT NULL").get() as any).n, 0);
  assert.equal(v(), 'v2');
});

test('Y-1 : un seul champ retiré (soute_par_classe) est une modification', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const f = catalogue('v2'); delete f.amenagements[0].soute_par_classe;
  const r = await w.post(f);
  assert.equal(r.json().natures.amenagements.modifies, 1);
  assert.equal((w.app.db.prepare("SELECT soute_par_classe s FROM swn_catalogue_amenagements WHERE cle = 'soute-c' AND proprietaire = 'univers'").get() as any).s, null);
});

const P = {
  soute: 'quatre nombres entiers de 0 à 1 000 000 attendus (classes 1 à 4)',
  red: 'nombre entier de 1 à 100 attendu', redRes: 'réduction du coût réservée au moteur système',
  rep: 'nombre entier de 1 à 20 attendu', repDit: "déjà dit par l'effet", bv: 'nombre entier de −9 à 9 attendu',
};

test('Y-1 : valeurs mal formées refusées avec leur champ et la phrase d\'E-20, les autres lignes passent', async () => {
  const w = await monde();
  const cas: [string, string, Record<string, unknown>, string, string][] = [
    ['defenses', 'voiles', { bonus_vitesse: -10 }, 'bonus_vitesse', P.bv],
    ['defenses', 'voiles', { bonus_vitesse: 10 }, 'bonus_vitesse', P.bv],
    ['defenses', 'voiles', { bonus_vitesse: 1.5 }, 'bonus_vitesse', P.bv],
    ['defenses', 'voiles', { bonus_vitesse: '2' }, 'bonus_vitesse', P.bv],
    ['defenses', 'voiles', { bonus_vitesse: null }, 'bonus_vitesse', P.bv],
    ['modifications', 'atelier', { reparation_min: 0 }, 'reparation_min', P.rep],
    ['modifications', 'atelier', { reparation_min: 21 }, 'reparation_min', P.rep],
    ['modifications', 'atelier', { reparation_min: 1.5 }, 'reparation_min', P.rep],
    ['modifications', 'atelier', { reparation_min: null }, 'reparation_min', P.rep],
    ['amenagements', 'moteur-sys', { reduction_cout_pct: 0 }, 'reduction_cout_pct', P.red],
    ['amenagements', 'moteur-sys', { reduction_cout_pct: 101 }, 'reduction_cout_pct', P.red],
    ['amenagements', 'moteur-sys', { reduction_cout_pct: 2.5 }, 'reduction_cout_pct', P.red],
    ['amenagements', 'moteur-sys', { reduction_cout_pct: null }, 'reduction_cout_pct', P.red],
    ['amenagements', 'soute-c', { soute_par_classe: [1, 2, 3] }, 'soute_par_classe', P.soute],
    ['amenagements', 'soute-c', { soute_par_classe: [1, 2, 3, 4, 5] }, 'soute_par_classe', P.soute],
    ['amenagements', 'soute-c', { soute_par_classe: [1, 2, 3, 1_000_001] }, 'soute_par_classe', P.soute],
    ['amenagements', 'soute-c', { soute_par_classe: [1, 2, 3, 1.5] }, 'soute_par_classe', P.soute],
    ['amenagements', 'soute-c', { soute_par_classe: [1, 2, 3, -1] }, 'soute_par_classe', P.soute],
    ['amenagements', 'soute-c', { soute_par_classe: [1, 2, 3, '4'] }, 'soute_par_classe', P.soute],
    ['amenagements', 'soute-c', { soute_par_classe: null }, 'soute_par_classe', P.soute],
    ['amenagements', 'soute-c', { soute_par_classe: 5 }, 'soute_par_classe', P.soute],
    // cross rules
    ['amenagements', 'vide', { reduction_cout_pct: 10 }, 'reduction_cout_pct', P.redRes],
    ['amenagements', 'soute-c', { reduction_cout_pct: 10 }, 'reduction_cout_pct', P.redRes],
    ['modifications', 'simple', { reduction_cout_pct: 10 }, 'reduction_cout_pct', P.redRes],
    ['modifications', 'atelier', { reduction_cout_pct: 10 }, 'reduction_cout_pct', P.redRes],
    ['modifications', 'atelier', { effet: 'reparation_min', valeur: 2 }, 'reparation_min', P.repDit],
  ];
  for (const [nature, cle, patch, champ, phrase] of cas) {
    const f = catalogue();
    const l = f[nature].find((x: any) => x.cle === cle);
    for (const [k, v] of Object.entries(patch)) l[k] = v;
    const r = await w.post(f);
    const nom = `${nature}.${cle} ${JSON.stringify(patch)}`;
    assert.equal(r.statusCode, 200, `${nom} ${r.body}`);
    const refus = r.json().refus;
    assert.equal(refus.length, 1, `${nom} ${JSON.stringify(refus)}`);
    assert.equal(refus[0].nature, nature, nom); assert.equal(refus[0].cle, cle, nom); assert.equal(refus[0].champ, champ, nom);
    assert.ok(String(refus[0].raison ?? refus[0].message ?? JSON.stringify(refus[0])).includes(phrase), `${nom} : ${JSON.stringify(refus[0])}`);
  }
  // the others pass
  const w2 = await monde();
  const f = catalogue(); f.defenses[0].bonus_vitesse = -10;
  await w2.post(f);
  assert.ok(await w2.ligne('defenses', 'propulseur'));
  assert.ok(!(await w2.ligne('defenses', 'voiles')));
});

test('Y-1 : les bornes passent, soute et soute_par_classe ensemble, le champ et un autre effet', async () => {
  const w = await monde();
  const f = catalogue();
  f.defenses.push({ cle: 'b1', nom: 'B1', ...el, bonus_vitesse: -9 }, { cle: 'b2', nom: 'B2', ...el, bonus_vitesse: 9 });
  f.modifications.push({ cle: 'r1', nom: 'R1', ...el, reparation_min: 1 }, { cle: 'r20', nom: 'R20', ...el, reparation_min: 20 });
  f.modifications.push({ cle: 'r-arm', nom: 'RArm', ...el, effet: 'armure', valeur: 2, reparation_min: 3 });
  f.modifications.push({ cle: 'r-eff', nom: 'REff', ...el, effet: 'reparation_min', valeur: 4 }); // effect alone passes
  f.amenagements.push({ cle: 'z', nom: 'Z', ...el, soute_par_classe: [0, 0, 0, 0] });
  f.amenagements.push({ cle: 'mx', nom: 'Mx', ...el, soute_par_classe: [1_000_000, 1_000_000, 1_000_000, 1_000_000] });
  f.amenagements.push({ cle: 'ms100', nom: 'Ms100', ...el, effet: 'moteur_systeme', rend_puissance: [1, 1, 1, 1], rend_masse: [1, 1, 1, 1], reduction_cout_pct: 100 });
  f.amenagements.push({ cle: 'ms1', nom: 'Ms1', ...el, effet: 'moteur_systeme', rend_puissance: [1, 1, 1, 1], rend_masse: [1, 1, 1, 1], reduction_cout_pct: 1 });
  const r = await w.post(f);
  assert.deepEqual(r.json().refus, []);
  assert.equal((await w.ligne('defenses', 'b1')).donnees.bonus_vitesse, -9);
  assert.equal((await w.ligne('defenses', 'b2')).donnees.bonus_vitesse, 9);
  assert.equal((await w.ligne('modifications', 'r20')).donnees.reparation_min, 20);
  assert.equal((await w.ligne('modifications', 'r-arm')).donnees.reparation_min, 3);
  assert.deepEqual((await w.ligne('amenagements', 'z')).donnees.soute_par_classe, [0, 0, 0, 0]);
  assert.equal((await w.ligne('amenagements', 'ms100')).donnees.reduction_cout_pct, 100);
});

test('Y-5 : fiches de règles — −2 (U+2212) et 2 sans « + », colonnes nouvelles seulement quand une ligne les dit', async () => {
  const w = await monde();
  await w.post(catalogue());
  const lignes = (n: string) => w.regles(n).split('\n').filter((l) => l.startsWith('|'));
  const ligneDe = (ls: string[], nom: string) => ls.find((l) => l.includes(nom))!;
  const de = lignes('defenses');
  assert.match(de[0]!, /Bonus de vitesse \|$/);
  assert.ok(ligneDe(de, 'Voiles').endsWith('| −2 |'), ligneDe(de, 'Voiles'));
  assert.ok(ligneDe(de, 'Propulseur').endsWith('| 2 |'), ligneDe(de, 'Propulseur'));
  assert.ok(ligneDe(de, 'Nul').endsWith('| 0 |'), ligneDe(de, 'Nul'));
  assert.ok(!w.regles('defenses').includes('+'), 'no plus sign');
  const mo = lignes('modifications');
  assert.match(mo[0]!, /Réparation min\.\s*\|$/);
  assert.ok(ligneDe(mo, 'Atelier').endsWith('| 2 |'), ligneDe(mo, 'Atelier'));
  assert.ok(ligneDe(mo, 'Simple').endsWith('| — |'), ligneDe(mo, 'Simple'));
  const am = lignes('amenagements');
  assert.match(am[0]!, /Soute \| Soute par classe \| Réduction du coût \|$/);
  assert.ok(ligneDe(am, 'Soute C').endsWith('| 10 | 10 / 20 / 40 / 80 | — |'), ligneDe(am, 'Soute C'));
  assert.ok(ligneDe(am, 'Moteur système').endsWith('| — | — | 10 % |'), ligneDe(am, 'Moteur système'));
  assert.ok(ligneDe(am, 'Vide').endsWith('| — | — | — |'), ligneDe(am, 'Vide'));
});

test('Y-5 : un catalogue sans ces champs donne des fiches identiques à celles d\'avant (sans colonne en plus)', async () => {
  const w = await monde();
  const f = catalogue('v1', true);
  assert.deepEqual((await w.post(f)).json().refus, []);
  const entete = (n: string) => w.regles(n).split('\n').find((l) => l.startsWith('| Nom'))!;
  assert.doesNotMatch(entete('modifications'), /Réparation/);
  assert.doesNotMatch(entete('amenagements'), /Soute par classe|Réduction/);
  assert.doesNotMatch(entete('defenses'), /Bonus/);
  // a positive-only catalogue prints as before: bare digits
  const g = catalogue('v2'); g.defenses = [{ cle: 'p', nom: 'P', ...el, bonus_vitesse: 3 }];
  await w.post(g);
  const l = w.regles('defenses').split('\n').find((x) => x.includes('| P |') || x.startsWith('| P'))!;
  assert.ok(l.endsWith('| 3 |'), l);
  assert.ok(!/[+−]/.test(l));
});

test('Y-2 : le semis ne dit aucun champ nouveau', async () => {
  const w = await monde();
  const n = (sql: string) => (w.app.db.prepare(sql).get() as any).n as number;
  assert.equal(n('SELECT COUNT(*) n FROM swn_catalogue_modifications WHERE reparation_min IS NOT NULL'), 0);
  assert.equal(n('SELECT COUNT(*) n FROM swn_catalogue_amenagements WHERE soute_par_classe IS NOT NULL OR reduction_cout_pct IS NOT NULL'), 0);
});

test('Y-2 : CHECK de la base — bonus −9..9, reparation 1..20, réduction 1..100, soute_par_classe de 4 valeurs', async () => {
  const w = await monde();
  const u = (t: string, c: string, v: unknown) => w.app.db.prepare(`UPDATE swn_catalogue_${t} SET ${c} = ? WHERE rowid = (SELECT MIN(rowid) FROM swn_catalogue_${t})`).run(v as any);
  assert.throws(() => u('defenses', 'bonus_vitesse', -10)); assert.throws(() => u('defenses', 'bonus_vitesse', 10));
  assert.throws(() => u('defenses', 'bonus_vitesse', 'x'));
  u('defenses', 'bonus_vitesse', -9); u('defenses', 'bonus_vitesse', 9); u('defenses', 'bonus_vitesse', null);
  assert.throws(() => u('modifications', 'reparation_min', 0)); assert.throws(() => u('modifications', 'reparation_min', 21));
  u('modifications', 'reparation_min', 20); u('modifications', 'reparation_min', null);
  assert.throws(() => u('amenagements', 'reduction_cout_pct', 0)); assert.throws(() => u('amenagements', 'reduction_cout_pct', 101));
  u('amenagements', 'reduction_cout_pct', 100);
  assert.throws(() => u('amenagements', 'soute_par_classe', '[1,2,3]')); assert.throws(() => u('amenagements', 'soute_par_classe', 'pas du json'));
  u('amenagements', 'soute_par_classe', '[1,2,3,4]'); u('amenagements', 'soute_par_classe', null);
});
