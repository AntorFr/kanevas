import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-outils-format-vaisseaux-effets-catalogue (X-1, X-2, X-6, X-8): the invented trial catalogue is written by the test,
// imported through the session route, read back by GET catalogue, replayed, refused field by field, then rendered in the rule sheets.
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
  const si = <T,>(x: T) => (retirer ? {} : x);
  return {
    catalogue: T, version,
    coques: [{ cle: 'fregate-r', nom: 'Frégate R', ...coque, vitesse: 3, armure: 5 }],
    moteurs: [{ cle: 'm1', nom: 'M1', niveau: 1, ...el }],
    amenagements: [
      { cle: 'soute-r', nom: 'Soute R', ...el, ...si({ soute: 10 }) },
      { cle: 'moteur-sys', nom: 'Moteur système', ...el, ...si({ effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] }) },
      { cle: 'vide', nom: 'Vide', ...el },
    ],
    defenses: [{ cle: 'voiles', nom: 'Voiles', ...el }],
    armes: [{ cle: 'canon-r', nom: 'Canon R', emport: 1, munitions: 0, cout_munition: 0, ...el }],
    modifications: [
      { cle: 'blindage', nom: 'Blindage', ...el, ...si({ cout_pct: 10, effet: 'armure', valeur: 2 }) },
      { cle: 'cale', nom: 'Cale', ...el, limite: 1, ...si({ effet: 'soutes_doublees' }) },
      { cle: 'reacteur', nom: 'Réacteur', ...el, limite: 1, ...si({ effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5 }) },
      { cle: 'munitions-x', nom: 'Munitions X', ...el, limite: 1, ...si({ effet: 'magasins_doubles' }) },
      { cle: 'atelier', nom: 'Atelier|réparé', ...el, ...si({ effet: 'reparation_min', valeur: 2 }) },
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

test('X-1 : chaque champ est créé, relu par GET catalogue (null omis), inchangé au rejeu', async () => {
  const w = await monde();
  const r = await w.post(catalogue());
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, []);
  assert.deepEqual((await w.ligne('modifications', 'blindage')).donnees.cout_pct, 10);
  const b = (await w.ligne('modifications', 'blindage')).donnees;
  assert.equal(b.effet, 'armure'); assert.equal(b.valeur, 2);
  assert.equal((await w.ligne('modifications', 'cale')).donnees.effet, 'soutes_doublees');
  const re = (await w.ligne('modifications', 'reacteur')).donnees;
  assert.equal(re.effet, 'echange'); assert.equal(re.sens, 'puissance_vers_masse'); assert.equal(re.points_max, 5);
  assert.equal(re.echange_puissance, 1); assert.equal(re.echange_masse, 0.5);
  assert.equal((await w.ligne('modifications', 'munitions-x')).donnees.effet, 'magasins_doubles');
  assert.equal((await w.ligne('modifications', 'atelier')).donnees.valeur, 2);
  const s = (await w.ligne('amenagements', 'soute-r')).donnees;
  assert.equal(s.soute, 10); assert.ok(!('effet' in s));
  const m = (await w.ligne('amenagements', 'moteur-sys')).donnees;
  assert.equal(m.effet, 'moteur_systeme'); assert.deepEqual(m.rend_puissance, [2, 3, 4, 5]); assert.deepEqual(m.rend_masse, [1, 1.5, 2, 2.5]);
  const simple = (await w.ligne('modifications', 'simple')).donnees;
  for (const k of ['cout_pct', 'effet', 'valeur', 'points_max', 'sens', 'echange_puissance', 'echange_masse']) assert.ok(!(k in simple), k);
  const vide = (await w.ligne('amenagements', 'vide')).donnees;
  for (const k of ['effet', 'rend_puissance', 'rend_masse', 'soute']) assert.ok(!(k in vide), k);
  const r2 = await w.post(catalogue());
  const nat = r2.json().natures;
  for (const n of Object.keys(nat)) { assert.equal(nat[n].ajoutes, 0, n); assert.equal(nat[n].modifies ?? 0, 0, n); }
});

test('X-1 : un rejeu qui retire un champ remet null, modifie la ligne et monte la version du catalogue', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const vc = (t: string, c: string) => (w.app.db.prepare(`SELECT version_catalogue v, version n FROM swn_catalogue_${t} WHERE cle = ? AND proprietaire = 'univers'`).get(c) as any);
  const avant = vc('modifications', 'blindage').n;
  const r = await w.post(catalogue('v2', true));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().natures.modifications.modifies, 5);
  assert.equal(r.json().natures.amenagements.modifies, 2);
  const row = w.app.db.prepare("SELECT cout_pct, effet, valeur, points_max, sens, echange_puissance, echange_masse FROM swn_catalogue_modifications WHERE cle IN ('blindage','reacteur') AND proprietaire = 'univers' ORDER BY cle").all() as any[];
  for (const x of row) for (const v of Object.values(x)) assert.equal(v, null);
  const am = w.app.db.prepare("SELECT effet, rend_puissance, rend_masse, soute FROM swn_catalogue_amenagements WHERE cle IN ('soute-r','moteur-sys') AND proprietaire = 'univers'").all() as any[];
  for (const x of am) for (const v of Object.values(x)) assert.equal(v, null);
  assert.equal(vc('modifications', 'blindage').n, avant + 1);
  assert.equal(vc('modifications', 'blindage').v, 'v2');
  assert.equal(vc('modifications', 'simple').v, 'v1');
});

test('X-1 : un seul champ retiré (le pourcentage) est une modification', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const f = catalogue('v2'); delete f.modifications[0].cout_pct;
  const r = await w.post(f);
  assert.equal(r.json().natures.modifications.modifies, 1);
  assert.equal((w.app.db.prepare("SELECT cout_pct c FROM swn_catalogue_modifications WHERE cle = 'blindage' AND proprietaire = 'univers'").get() as any).c, null);
});

test('X-1 : champs mal formés refusés avec leur champ, les autres lignes passent', async () => {
  const w = await monde();
  const cas: [string, string, Record<string, unknown>, string][] = [
    ['modifications', 'blindage', { effet: 'inconnu' }, 'effet'],
    ['modifications', 'blindage', { effet: 'moteur_systeme' }, 'effet'],
    ['modifications', 'blindage', { effet: 'Armure' }, 'effet'],
    ['modifications', 'blindage', { effet: 5 }, 'effet'],
    ['amenagements', 'moteur-sys', { effet: 'armure' }, 'effet'],
    ['modifications', 'blindage', { cout_pct: 0 }, 'cout_pct'],
    ['modifications', 'blindage', { cout_pct: 1001 }, 'cout_pct'],
    ['modifications', 'blindage', { cout_pct: 2.5 }, 'cout_pct'],
    ['modifications', 'blindage', { cout_pct: '10' }, 'cout_pct'],
    ['modifications', 'blindage', { cout_pct: null }, 'cout_pct'],
    ['modifications', 'blindage', { valeur: 0 }, 'valeur'],
    ['modifications', 'blindage', { valeur: 10 }, 'valeur'],
    ['modifications', 'blindage', { valeur: -10 }, 'valeur'],
    ['modifications', 'atelier', { valeur: 0 }, 'valeur'],
    ['modifications', 'atelier', { valeur: 21 }, 'valeur'],
    ['modifications', 'blindage', { points_max: 5 }, 'points_max'],
    ['modifications', 'blindage', { valeur: undefined }, 'valeur'],
    ['modifications', 'cale', { valeur: 1 }, 'valeur'],
    ['modifications', 'simple', { valeur: 1 }, 'valeur'],
    ['modifications', 'simple', { points_max: 3 }, 'points_max'],
    ['modifications', 'reacteur', { points_max: undefined }, 'points_max'],
    ['modifications', 'reacteur', { points_max: 0 }, 'points_max'],
    ['modifications', 'reacteur', { points_max: 100 }, 'points_max'],
    ['modifications', 'reacteur', { sens: 'autre' }, 'sens'],
    ['modifications', 'reacteur', { sens: undefined }, 'sens'],
    ['modifications', 'reacteur', { echange_puissance: 0 }, 'echange_puissance'],
    ['modifications', 'reacteur', { echange_puissance: 100 }, 'echange_puissance'],
    ['modifications', 'reacteur', { echange_masse: 0.3 }, 'echange_masse'],
    ['modifications', 'reacteur', { echange_masse: 0 }, 'echange_masse'],
    ['modifications', 'reacteur', { echange_masse: 99.5 }, 'echange_masse'],
    ['modifications', 'reacteur', { valeur: 1 }, 'valeur'],
    ['modifications', 'reacteur', { limite: 2 }, 'limite'],
    ['modifications', 'reacteur', { limite: 0 }, 'limite'],
    ['modifications', 'cale', { limite: 2 }, 'limite'],
    ['modifications', 'munitions-x', { limite: 2 }, 'limite'],
    ['amenagements', 'soute-r', { soute: -1 }, 'soute'],
    ['amenagements', 'soute-r', { soute: 1_000_001 }, 'soute'],
    ['amenagements', 'soute-r', { soute: 1.5 }, 'soute'],
    ['amenagements', 'moteur-sys', { rend_puissance: [1, 2, 3] }, 'rend_puissance'],
    ['amenagements', 'moteur-sys', { rend_puissance: [1, 2, 3, -1] }, 'rend_puissance'],
    ['amenagements', 'moteur-sys', { rend_puissance: [1, 2, 3, 1.5] }, 'rend_puissance'],
    ['amenagements', 'moteur-sys', { rend_puissance: undefined }, 'rend_puissance'],
    ['amenagements', 'moteur-sys', { rend_masse: [1, 1, 1, 0.3] }, 'rend_masse'],
    ['amenagements', 'moteur-sys', { rend_masse: undefined }, 'rend_masse'],
    ['amenagements', 'soute-r', { rend_puissance: [1, 2, 3, 4] }, 'rend_puissance'],
    ['amenagements', 'vide', { rend_masse: [1, 1, 1, 1] }, 'rend_masse'],
  ];
  for (const [nature, cle, patch, attendu] of cas) {
    const f = catalogue();
    const l = f[nature].find((x: any) => x.cle === cle);
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete l[k]; else l[k] = v; }
    const r = await w.post(f);
    const nom = `${nature}.${cle} ${JSON.stringify(patch)}`;
    assert.equal(r.statusCode, 200, `${nom} ${r.body}`);
    const refus = r.json().refus;
    assert.equal(refus.length, 1, `${nom} ${JSON.stringify(refus)}`);
    assert.equal(refus[0].nature, nature, nom); assert.equal(refus[0].cle, cle, nom); assert.equal(refus[0].champ, attendu, nom);
  }
  // the others pass: refusing blindage does not stop cale
  const w2 = await monde();
  const f = catalogue(); f.modifications[0].cout_pct = 0;
  await w2.post(f);
  assert.ok(await w2.ligne('modifications', 'cale'));
  assert.ok(!(await w2.ligne('modifications', 'blindage')));
});

test('X-1 : les bornes passent (1 et 1000 %, soute 0 et 1 000 000, valeur −9, 9, points_max 99, limite 1)', async () => {
  const w = await monde();
  const f = catalogue();
  f.modifications[0].cout_pct = 1000; f.modifications[0].valeur = -9;
  f.modifications.push({ cle: 'b2', nom: 'B2', ...el, cout_pct: 1, effet: 'vitesse', valeur: 9 });
  f.modifications.push({ cle: 'b3', nom: 'B3', ...el, effet: 'reparation_min', valeur: 20 });
  f.modifications.push({ cle: 'b4', nom: 'B4', ...el, effet: 'reparation_min', valeur: 1 });
  f.modifications.push({ cle: 'b5', nom: 'B5', ...el, limite: 1, effet: 'echange', sens: 'masse_vers_puissance', points_max: 99, echange_puissance: 99, echange_masse: 99 });
  f.amenagements[0].soute = 1_000_000; f.amenagements[2].soute = 0;
  assert.deepEqual((await w.post(f)).json().refus, []);
  assert.equal((await w.ligne('amenagements', 'vide')).donnees.soute, 0);
});

test('X-1 : une ligne sans effet reste acceptée avec cout_pct seul ; effet sans paramètre propre (cale) ne demande rien', async () => {
  const w = await monde();
  const f = catalogue(); f.modifications.push({ cle: 'p', nom: 'P', ...el, cout_pct: 5 });
  assert.deepEqual((await w.post(f)).json().refus, []);
  assert.equal((await w.ligne('modifications', 'p')).donnees.cout_pct, 5);
});

test('X-6 : fiches de règles — Coût %, Effet (libellé français), Valeur / points max, Soute ; texte échappé', async () => {
  const w = await monde();
  await w.post(catalogue());
  const lignes = (n: string) => w.regles(n).split('\n').filter((l) => l.startsWith('|'));
  const mo = lignes('modifications');
  assert.match(mo[0]!, /\| Coût % \| Effet \| Valeur \/ points max \|$/);
  const ligneDe = (ls: string[], nom: string) => ls.find((l) => l.includes(nom))!;
  assert.ok(ligneDe(mo, 'Blindage').endsWith('| 10 | Armure | 2 |'), ligneDe(mo, 'Blindage'));
  assert.ok(ligneDe(mo, 'Cale').endsWith('| — | Soutes doublées | — |'), ligneDe(mo, 'Cale'));
  assert.ok(ligneDe(mo, 'Réacteur').endsWith('| — | Échange de points | 5 |'), ligneDe(mo, 'Réacteur'));
  assert.ok(ligneDe(mo, 'Munitions X').endsWith('| — | Magasins doublés | — |'), ligneDe(mo, 'Munitions X'));
  assert.ok(ligneDe(mo, 'réparé').endsWith('| — | Réparation minimale | 2 |'), ligneDe(mo, 'réparé'));
  assert.ok(ligneDe(mo, 'Atelier').includes('Atelier\\|réparé'), 'nom échappé');
  assert.ok(ligneDe(mo, 'Simple').endsWith('| — | — | — |'), ligneDe(mo, 'Simple'));
  const am = lignes('amenagements');
  assert.match(am[0]!, /\| Effet \| Soute \|$/);
  assert.ok(ligneDe(am, 'Soute R').endsWith('| — | 10 |'), ligneDe(am, 'Soute R'));
  assert.ok(ligneDe(am, 'Moteur système').endsWith('| Moteur système | — |'), ligneDe(am, 'Moteur système'));
  assert.ok(ligneDe(am, 'Vide').endsWith('| — | — |'), ligneDe(am, 'Vide'));
});

test('X-6 : un catalogue qui ne dit rien produit des fiches sans colonne en plus', async () => {
  const w = await monde();
  const f = catalogue(); f.modifications = [{ cle: 'simple', nom: 'Simple', ...el }]; f.amenagements = [{ cle: 'vide', nom: 'Vide', ...el }];
  assert.deepEqual((await w.post(f)).json().refus, []);
  const entete = (n: string) => w.regles(n).split('\n').find((l) => l.startsWith('| Nom'))!;
  assert.doesNotMatch(entete('modifications'), /Coût %|Effet|Valeur|Soute/);
  assert.doesNotMatch(entete('amenagements'), /Effet|Soute/);
  assert.doesNotMatch(w.regles('modifications'), /Coût %/);
});

test('X-6 : une seule colonne dite (soute seule) n\'ajoute que celle-là', async () => {
  const w = await monde();
  const f = catalogue(); f.modifications = []; f.amenagements = [{ cle: 'vide', nom: 'Vide', ...el }, { cle: 's', nom: 'S', ...el, soute: 3 }];
  await w.post(f);
  const e = w.regles('amenagements').split('\n').find((l) => l.startsWith('| Nom'))!;
  assert.match(e, /Soute \|$/); assert.doesNotMatch(e, /Effet/);
});

test('X-8 : le semis garde ses décomptes et ne dit aucun champ nouveau', async () => {
  const w = await monde();
  const n = (sql: string) => (w.app.db.prepare(sql).get() as any).n as number;
  assert.equal(n('SELECT COUNT(*) n FROM swn_catalogue_modifications WHERE cout_pct IS NOT NULL OR effet IS NOT NULL OR valeur IS NOT NULL OR points_max IS NOT NULL OR sens IS NOT NULL OR echange_puissance IS NOT NULL OR echange_masse IS NOT NULL'), 0);
  assert.equal(n('SELECT COUNT(*) n FROM swn_catalogue_amenagements WHERE effet IS NOT NULL OR rend_puissance IS NOT NULL OR rend_masse IS NOT NULL OR soute IS NOT NULL'), 0);
});

test('CHECK de la base : valeur hors plage, mauvais type ou effet inconnu refusés, null accepté', async () => {
  const w = await monde();
  const m = (c: string, v: unknown) => w.app.db.prepare(`UPDATE swn_catalogue_modifications SET ${c} = ? WHERE rowid = (SELECT MIN(rowid) FROM swn_catalogue_modifications)`).run(v as any);
  assert.throws(() => m('cout_pct', 0)); assert.throws(() => m('cout_pct', 1001)); assert.throws(() => m('cout_pct', 'x'));
  assert.throws(() => m('effet', 'moteur_systeme')); assert.throws(() => m('effet', 'zz'));
  assert.throws(() => m('sens', 'zz')); assert.throws(() => m('points_max', 0)); assert.throws(() => m('points_max', 100));
  assert.throws(() => m('echange_masse', 0.2)); assert.throws(() => m('echange_puissance', 100));
  m('cout_pct', 1000); m('cout_pct', null); m('effet', 'echange'); m('effet', null);
  const a = (c: string, v: unknown) => w.app.db.prepare(`UPDATE swn_catalogue_amenagements SET ${c} = ? WHERE rowid = (SELECT MIN(rowid) FROM swn_catalogue_amenagements)`).run(v as any);
  assert.throws(() => a('effet', 'armure')); assert.throws(() => a('soute', -1)); assert.throws(() => a('soute', 1_000_001));
  assert.throws(() => a('rend_puissance', '[1,2,3]')); assert.throws(() => a('rend_puissance', 'pas du json'));
  a('effet', 'moteur_systeme'); a('soute', 0); a('rend_puissance', '[1,2,3,4]'); a('soute', null);
});
