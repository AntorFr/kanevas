import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-outils-format-vaisseaux-suite-catalogue (Z-1, Z-2, Z-6, Z-7): invented trial catalogue written by the test, imported through
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
      { cle: 'moteur-sys', nom: 'Moteur système', ...el, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 10, ...si({ reduction_base: 'coque' }) },
      { cle: 'moteur-am', nom: 'Moteur Am', ...el, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 20, ...si({ reduction_base: 'amenagement' }) },
      { cle: 'vide', nom: 'Vide', ...el },
    ],
    defenses: [], armes: [{ cle: 'canon-r', nom: 'Canon R', emport: 1, munitions: 0, cout_munition: 0, ...el }],
    modifications: [
      { cle: 'soutes-o', nom: 'Soutes O', ...el, effet: 'soutes_optimisees', limite: 1, ...si({ effet_pct: 10 }) },
      { cle: 'armure-c', nom: 'Armure C', ...el, effet: 'armure_par_classe', ...si({ armure_par_classe: [1, 2, 3, 4] }) },
      { cle: 'montage', nom: 'Montage', ...el, effet: 'montage_specialise', limite: 1, valeur: -1 },
      { cle: 'surcharge', nom: 'Surcharge', ...el, effet: 'surcharge_arme', limite: 1, ...si({ effet_pct: 50 }) },
      { cle: 'echange-i', nom: 'Echange I', ...el, effet: 'echange', limite: 3, points_max: 3, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5, ...si({ echange_arrondi: 'installation' }) },
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

test('Z-1 : chaque champ nouveau est créé, relu par GET catalogue, inchangé au rejeu', async () => {
  const w = await monde();
  const r = await w.post(catalogue());
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, []);
  assert.equal((await w.ligne('amenagements', 'moteur-sys')).donnees.reduction_base, 'coque');
  assert.equal((await w.ligne('amenagements', 'moteur-am')).donnees.reduction_base, 'amenagement');
  assert.equal((await w.ligne('modifications', 'soutes-o')).donnees.effet_pct, 10);
  assert.equal((await w.ligne('modifications', 'surcharge')).donnees.effet_pct, 50);
  assert.deepEqual((await w.ligne('modifications', 'armure-c')).donnees.armure_par_classe, [1, 2, 3, 4]);
  assert.equal((await w.ligne('modifications', 'montage')).donnees.valeur, -1);
  const ech = (await w.ligne('modifications', 'echange-i')).donnees;
  assert.equal(ech.echange_arrondi, 'installation'); assert.equal(ech.limite, 3);
  const simple = (await w.ligne('modifications', 'simple')).donnees;
  for (const k of ['effet_pct', 'armure_par_classe', 'echange_arrondi']) assert.ok(!(k in simple), k);
  assert.ok(!('reduction_base' in (await w.ligne('amenagements', 'vide')).donnees));
  const nat = (await w.post(catalogue())).json().natures;
  for (const n of Object.keys(nat)) { assert.equal(nat[n].ajoutes, 0, n); assert.equal(nat[n].modifies ?? 0, 0, n); }
});

test('Z-1 : un rejeu qui retire un champ le remet à null et monte la version du catalogue', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const v = () => (w.app.db.prepare("SELECT version_catalogue v FROM swn_catalogue_modifications WHERE cle = 'armure-c' AND proprietaire = 'univers'").get() as any).v;
  assert.equal(v(), 'v1');
  const r = await w.post(catalogue('v2', true));
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus.map((x: any) => x.cle).sort(), ['armure-c', 'echange-i', 'soutes-o', 'surcharge']); // effect without its parameter, or a limite 3 without rounding
  const g = catalogue('v2', true);
  g.modifications = g.modifications.filter((m: any) => m.cle === 'echange-i' || m.cle === 'simple');
  g.modifications.find((m: any) => m.cle === 'echange-i').limite = 1;
  const r2 = await w.post(g);
  assert.deepEqual(r2.json().refus, []);
  assert.equal(r2.json().natures.modifications.modifies, 1);
  assert.equal(r.json().natures.amenagements.modifies, 2); // the lines that pass replay in the first pass
  const db = w.app.db;
  assert.equal((db.prepare("SELECT version_catalogue v FROM swn_catalogue_modifications WHERE cle = 'echange-i'").get() as any).v, 'v2');
  assert.equal((db.prepare("SELECT echange_arrondi a FROM swn_catalogue_modifications WHERE cle = 'echange-i'").get() as any).a, null);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM swn_catalogue_amenagements WHERE reduction_base IS NOT NULL").get() as any).n, 0);
});

const P = {
  s: 'nombre entier de 1 à 100 attendu', o: 'nombre entier de 1 à 1 000 attendu',
  arm: 'quatre nombres entiers de 0 à 9 attendus (classes 1 à 4)', arr: '« installation » attendu',
  base: '« coque » ou « amenagement » attendu', baseRes: 'base réservée à la réduction du coût',
  res: 'paramètre réservé à son effet', req: "paramètre requis par l'effet", mont: 'nombre entier de −9 à 9, sauf 0, attendu',
  lim: 'limite 1 attendue',
};

test('Z-1 : valeurs mal formées refusées avec leur champ et la phrase d\'E-20, les autres lignes passent', async () => {
  const w = await monde();
  const cas: [string, string, Record<string, unknown>, string, string][] = [
    ['amenagements', 'moteur-sys', { reduction_base: 'autre' }, 'reduction_base', P.base],
    ['amenagements', 'moteur-sys', { reduction_base: null }, 'reduction_base', P.base],
    ['amenagements', 'moteur-sys', { reduction_base: 1 }, 'reduction_base', P.base],
    ['amenagements', 'vide', { reduction_base: 'coque' }, 'reduction_base', P.baseRes],
    ['modifications', 'soutes-o', { effet_pct: 0 }, 'effet_pct', P.s],
    ['modifications', 'soutes-o', { effet_pct: 101 }, 'effet_pct', P.s],
    ['modifications', 'soutes-o', { effet_pct: 1.5 }, 'effet_pct', P.s],
    ['modifications', 'soutes-o', { effet_pct: null }, 'effet_pct', P.s],
    ['modifications', 'soutes-o', { effet_pct: '10' }, 'effet_pct', P.s],
    ['modifications', 'surcharge', { effet_pct: 0 }, 'effet_pct', P.o],
    ['modifications', 'surcharge', { effet_pct: 1001 }, 'effet_pct', P.o],
    ['modifications', 'surcharge', { effet_pct: null }, 'effet_pct', P.o],
    ['modifications', 'armure-c', { armure_par_classe: [1, 2, 3] }, 'armure_par_classe', P.arm],
    ['modifications', 'armure-c', { armure_par_classe: [1, 2, 3, 10] }, 'armure_par_classe', P.arm],
    ['modifications', 'armure-c', { armure_par_classe: [1, 2, 3, -1] }, 'armure_par_classe', P.arm],
    ['modifications', 'armure-c', { armure_par_classe: [1, 2, 3, 1.5] }, 'armure_par_classe', P.arm],
    ['modifications', 'armure-c', { armure_par_classe: null }, 'armure_par_classe', P.arm],
    ['modifications', 'montage', { valeur: 0 }, 'valeur', P.mont],
    ['modifications', 'montage', { valeur: 10 }, 'valeur', P.mont],
    ['modifications', 'montage', { valeur: -10 }, 'valeur', P.mont],
    ['modifications', 'montage', { valeur: 21 }, 'valeur', P.mont],
    ['modifications', 'montage', { valeur: 1.5 }, 'valeur', P.mont],
    // effect without its parameter
    ['modifications', 'soutes-o', { effet_pct: undefined }, 'effet_pct', P.req],
    ['modifications', 'surcharge', { effet_pct: undefined }, 'effet_pct', P.req],
    ['modifications', 'armure-c', { armure_par_classe: undefined }, 'armure_par_classe', P.req],
    ['modifications', 'montage', { valeur: undefined }, 'valeur', P.req],
    // parameter on another effect
    ['modifications', 'simple', { effet: 'armure', valeur: 1, effet_pct: 5 }, 'effet_pct', P.res],
    ['modifications', 'montage', { effet_pct: 5 }, 'effet_pct', P.res],
    ['modifications', 'soutes-o', { armure_par_classe: [1, 2, 3, 4] }, 'armure_par_classe', P.res],
    ['modifications', 'armure-c', { echange_arrondi: 'installation' }, 'echange_arrondi', P.res],
    ['modifications', 'surcharge', { echange_arrondi: 'installation' }, 'echange_arrondi', P.res],
    // rounding
    ['modifications', 'echange-i', { echange_arrondi: 'autre' }, 'echange_arrondi', P.arr],
    ['modifications', 'echange-i', { echange_arrondi: null }, 'echange_arrondi', P.arr],
    ['modifications', 'echange-i', { echange_arrondi: undefined }, 'limite', P.lim],
    // limite 1 for the targeted effects
    ['modifications', 'soutes-o', { limite: 3 }, 'limite', P.lim],
    ['modifications', 'surcharge', { limite: 3 }, 'limite', P.lim],
    ['modifications', 'montage', { limite: 3 }, 'limite', P.lim],
  ];
  for (const [nature, cle, patch, champ, phrase] of cas) {
    const f = catalogue();
    const l = f[nature].find((x: any) => x.cle === cle);
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete l[k]; else l[k] = v; }
    const r = await w.post(f);
    const nom = `${nature}.${cle} ${JSON.stringify(patch)}`;
    assert.equal(r.statusCode, 200, `${nom} ${r.body}`);
    const refus = r.json().refus;
    assert.equal(refus.length, 1, `${nom} ${JSON.stringify(refus)}`);
    assert.equal(refus[0].nature, nature, nom); assert.equal(refus[0].cle, cle, nom); assert.equal(refus[0].champ, champ, nom);
    assert.ok(JSON.stringify(refus[0]).includes(phrase), `${nom} : ${JSON.stringify(refus[0])}`);
  }
  // the others pass
  const w2 = await monde();
  const f = catalogue(); f.modifications[0].effet_pct = 0;
  await w2.post(f);
  assert.ok(await w2.ligne('modifications', 'surcharge'));
  assert.ok(!(await w2.ligne('modifications', 'soutes-o')));
});

test('Z-1 : les bornes passent', async () => {
  const w = await monde();
  const f = catalogue();
  const m = (cle: string, o: Record<string, unknown>) => f.modifications.push({ cle, nom: cle, ...el, limite: 1, ...o });
  m('s1', { effet: 'soutes_optimisees', effet_pct: 1 }); m('s100', { effet: 'soutes_optimisees', effet_pct: 100 });
  m('o1', { effet: 'surcharge_arme', effet_pct: 1 }); m('o1000', { effet: 'surcharge_arme', effet_pct: 1000 });
  m('a0', { effet: 'armure_par_classe', armure_par_classe: [0, 0, 0, 0], limite: 3 }); m('a9', { effet: 'armure_par_classe', armure_par_classe: [9, 9, 9, 9] });
  for (const [c, v] of [['mm9', -9], ['mm1', -1], ['mp1', 1], ['mp9', 9]] as const) m(c, { effet: 'montage_specialise', valeur: v });
  m('e1', { effet: 'echange', limite: 1, points_max: 3, sens: 'masse_vers_puissance', echange_puissance: 1, echange_masse: 0.5 }); // without rounding, limite 1
  f.amenagements.push({ cle: 'rb', nom: 'RB', ...el, effet: 'moteur_systeme', rend_puissance: [1, 1, 1, 1], rend_masse: [1, 1, 1, 1], reduction_cout_pct: 1, reduction_base: 'coque' });
  const r = await w.post(f);
  assert.deepEqual(r.json().refus, []);
  assert.equal((await w.ligne('modifications', 'o1000')).donnees.effet_pct, 1000);
  assert.deepEqual((await w.ligne('modifications', 'a0')).donnees.armure_par_classe, [0, 0, 0, 0]);
  assert.equal((await w.ligne('modifications', 'mp9')).donnees.valeur, 9);
  assert.equal((await w.ligne('modifications', 'mm9')).donnees.valeur, -9);
});

test('Z-1 : un echange sans echange_arrondi avec limite 3 est refusé (garde l\'ancien comportement)', async () => {
  const w = await monde();
  const f = catalogue(); delete f.modifications[4].echange_arrondi;
  const r = await w.post(f);
  assert.equal(r.json().refus.length, 1);
  assert.equal(r.json().refus[0].champ, 'limite');
});

test('Z-7 : fiches de règles — colonnes nouvelles seulement quand une ligne les dit', async () => {
  const w = await monde();
  await w.post(catalogue());
  const lignes = (n: string) => w.regles(n).split('\n').filter((l) => l.startsWith('|'));
  const ligneDe = (ls: string[], nom: string) => ls.find((l) => l.includes(nom))!;
  const mo = lignes('modifications');
  for (const c of ['Pourcentage', 'Armure par classe', "Arrondi de l'échange", 'Effet']) assert.ok(mo[0]!.includes(c), `${c} : ${mo[0]}`);
  assert.ok(ligneDe(mo, 'Soutes O').includes('| 10 % |'), ligneDe(mo, 'Soutes O'));
  assert.ok(ligneDe(mo, 'Surcharge').includes('| 50 % |'), ligneDe(mo, 'Surcharge'));
  assert.ok(ligneDe(mo, 'Armure C').includes('| 1 / 2 / 3 / 4 |'), ligneDe(mo, 'Armure C'));
  assert.ok(ligneDe(mo, 'Echange I').includes('par installation'), ligneDe(mo, 'Echange I'));
  assert.ok(ligneDe(mo, 'Soutes O').includes('Soutes optimisées'), ligneDe(mo, 'Soutes O'));
  assert.ok(ligneDe(mo, 'Montage').includes('Montage spécialisé'));
  assert.ok(ligneDe(mo, 'Simple').endsWith('| — | — | — | — | — | — |') || !/%|installation|\//.test(ligneDe(mo, 'Simple')), ligneDe(mo, 'Simple'));
  assert.ok(!/par installation|%/.test(ligneDe(mo, 'Armure C')));
  const am = lignes('amenagements');
  assert.match(am[0]!, /Base de la réduction/);
  assert.ok(ligneDe(am, '| Moteur système (').includes('| Coque |'), ligneDe(am, '| Moteur système ('));
  assert.ok(ligneDe(am, '| Moteur Am (').includes('| Aménagement |'), ligneDe(am, '| Moteur Am ('));
  assert.ok(ligneDe(am, 'Vide').endsWith('| — |'), ligneDe(am, 'Vide'));
});

test('Z-7 : un catalogue sans ces champs donne des fiches sans colonne en plus', async () => {
  const w = await monde();
  const f = catalogue('v1', true);
  f.modifications = f.modifications.filter((m: any) => !['soutes-o', 'armure-c', 'surcharge'].includes(m.cle)); // those need their parameter
  f.modifications.find((m: any) => m.cle === 'echange-i').limite = 1;
  assert.deepEqual((await w.post(f)).json().refus, []);
  const entete = (n: string) => w.regles(n).split('\n').find((l) => l.startsWith('| Nom'))!;
  assert.doesNotMatch(entete('modifications'), /Pourcentage|Armure par classe|Arrondi/);
  assert.doesNotMatch(entete('amenagements'), /Base de la réduction/);
  assert.match(entete('modifications'), /Effet/);
});

test('Z-5 : le semis ne dit aucun champ nouveau', async () => {
  const w = await monde();
  const n = (sql: string) => (w.app.db.prepare(sql).get() as any).n as number;
  assert.equal(n('SELECT COUNT(*) n FROM swn_catalogue_modifications WHERE effet_pct IS NOT NULL OR armure_par_classe IS NOT NULL OR echange_arrondi IS NOT NULL'), 0);
  assert.equal(n('SELECT COUNT(*) n FROM swn_catalogue_amenagements WHERE reduction_base IS NOT NULL'), 0);
});

test('Z-6 : CHECK de la base — effet_pct, armure_par_classe, echange_arrondi, reduction_base, quatre effets', async () => {
  const w = await monde();
  await w.post(catalogue());
  const u = (t: string, c: string, v: unknown) => w.app.db.prepare(`UPDATE swn_catalogue_${t} SET ${c} = ? WHERE rowid = (SELECT MIN(rowid) FROM swn_catalogue_${t} WHERE proprietaire = 'univers')`).run(v as any);
  assert.throws(() => u('modifications', 'effet_pct', 0)); assert.throws(() => u('modifications', 'effet_pct', 1001));
  u('modifications', 'effet_pct', 1000); u('modifications', 'effet_pct', null);
  assert.throws(() => u('modifications', 'armure_par_classe', '[1,2,3]')); assert.throws(() => u('modifications', 'armure_par_classe', 'x'));
  u('modifications', 'armure_par_classe', '[1,2,3,4]'); u('modifications', 'armure_par_classe', null);
  assert.throws(() => u('modifications', 'echange_arrondi', 'autre')); u('modifications', 'echange_arrondi', 'installation');
  assert.throws(() => u('amenagements', 'reduction_base', 'autre')); u('amenagements', 'reduction_base', 'coque');
  for (const e of ['soutes_optimisees', 'armure_par_classe', 'montage_specialise', 'surcharge_arme']) u('modifications', 'effet', e);
  assert.throws(() => u('modifications', 'effet', 'inconnu'));
});
