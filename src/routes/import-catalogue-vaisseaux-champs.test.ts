import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-outils-format-vaisseaux-fiches-catalogue (F-1, F-4, F-7, F-8): invented trial catalogue written by the test,
// imported through the session route, read back by GET catalogue, replayed, then rendered in the rules sheets. Expectations hard-coded.
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
const coque = { classe: 2, cout: 10, pv: 5, ca: 10, puissance: 10, masse: 8, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const arme = { emport: 1, munitions: 0, cout_munition: 0, ...el };
function catalogue(version = 'v1', retirer = false): any {
  return {
    catalogue: T, version,
    coques: [
      { cle: 'fregate-r', nom: 'Frégate R', ...coque, ...(retirer ? {} : { vitesse: 3, armure: 5, equipage_min: 6, equipage_max: 20 }) },
      { cle: 'nue', nom: 'Nue', ...coque },
    ],
    moteurs: [{ cle: 'm1', nom: 'M1', niveau: 1, ...el, classe_min: 1, classe_max: 4 }],
    amenagements: [
      { cle: 'salle', nom: 'Salle', ...el, classe_min: 2, classe_max: 3, condition: 'Si bon|ne\\ligne\nsuite' },
      { cle: 'hangar', nom: 'Hangar', ...el, classe_min: 3 },
    ],
    defenses: [{ cle: 'voiles', nom: 'Voiles', ...el, bonus_vitesse: 1 }],
    armes: [{ cle: 'canon-r', nom: 'Canon R', ...arme, ...(retirer ? {} : { degats: '1d8', perforation: 3, qualites: 'Bruyant', niveau_tech: 3 }) }],
    modifications: [{ cle: 'mod', nom: 'Mod', ...el }],
    exemples: [{ cle: 'ex', nom: 'Ex', coque: 'nue', choix: [{ nature: 'defenses', cle: 'voiles', quantite: 1 }], ...(retirer ? {} : { equipage: 8 }) }],
  };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  poserActivation(app.db, antor, { niveau: 'univers', id: E }, T, true);
  const c = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  const cookie = `kanevas_session=${c.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  // GET catalogue gives `donnees` to a player reader (the GM reads the management metadata): the fields are read as Léa.
  const cl = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=lea' });
  const cookieLea = `kanevas_session=${cl.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  const base = `/api/univers/${E}/outils/${T}/catalogue`;
  const post = (corps: unknown) => app.inject({ method: 'POST', url: base + '/application', headers: { cookie }, payload: corps as any });
  const lire = async (nature: string) => (await app.inject({ method: 'GET', url: `${base}?nature=${nature}`, headers: { cookie: cookieLea } })).json();
  const ligne = async (nature: string, cle: string) => (await lire(nature)).elements.find((e: any) => e.cle === cle);
  const version = () => (app.db.prepare("SELECT version FROM swn_catalogue_coques WHERE proprietaire = 'univers' LIMIT 1").get() as any);
  return { app, E, post, lire, ligne, version, antor };
}

test('F-1 : chaque champ est créé, relu par GET catalogue (null omis), inchangé au rejeu', async () => {
  const w = await monde();
  const r = await w.post(catalogue());
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, []);
  const f = await w.ligne('coques', 'fregate-r');
  assert.deepEqual(f.donnees.vitesse, 3); assert.equal(f.donnees.armure, 5);
  assert.equal(f.donnees.equipage_min, 6); assert.equal(f.donnees.equipage_max, 20);
  const nue = await w.ligne('coques', 'nue');
  for (const k of ['vitesse', 'armure', 'equipage_min', 'equipage_max']) assert.ok(!(k in nue.donnees), k);
  const salle = await w.ligne('amenagements', 'salle');
  assert.equal(salle.donnees.classe_min, 2); assert.equal(salle.donnees.classe_max, 3);
  const hangar = await w.ligne('amenagements', 'hangar');
  assert.equal(hangar.donnees.classe_min, 3); assert.ok(!('classe_max' in hangar.donnees)); assert.ok(!('condition' in hangar.donnees));
  assert.equal((await w.ligne('defenses', 'voiles')).donnees.bonus_vitesse, 1);
  const canon = await w.ligne('armes', 'canon-r');
  assert.equal(canon.donnees.degats, '1d8'); assert.equal(canon.donnees.perforation, 3);
  assert.equal(canon.donnees.qualites, 'Bruyant'); assert.equal(canon.donnees.niveau_tech, 3);
  assert.equal(canon.donnees.classe_min, 1); // the weapon's own (E-2), not an F-1 field
  assert.equal((await w.ligne('exemples', 'ex')).donnees.equipage, 8);
  // replay: everything unchanged, catalogue version stable
  const r2 = await w.post(catalogue());
  assert.equal(r2.statusCode, 200);
  const nat = r2.json().natures;
  for (const n of Object.keys(nat)) { assert.equal(nat[n].ajoutes, 0, n); assert.equal(nat[n].modifies ?? 0, 0, n); }
});

test('F-1 : un rejeu qui retire un champ remet null, modifie la ligne et monte la version', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const vers = () => (w.app.db.prepare("SELECT version FROM swn_catalogue_coques WHERE cle = 'fregate-r' AND proprietaire = 'univers'").get() as any).version as number;
  const avant = { version: vers() };
  const r = await w.post(catalogue('v2', true));
  assert.equal(r.statusCode, 200, r.body);
  const nat = r.json().natures;
  assert.equal(nat.coques.modifies, 1); assert.equal(nat.armes.modifies, 1); assert.equal(nat.exemples.modifies, 1);
  const apres = await w.ligne('coques', 'fregate-r');
  for (const k of ['vitesse', 'armure', 'equipage_min', 'equipage_max']) assert.ok(!(k in apres.donnees), k);
  assert.equal(vers(), avant.version + 1);
  const row = w.app.db.prepare("SELECT vitesse, armure, equipage_min, equipage_max FROM swn_catalogue_coques WHERE cle = 'fregate-r' AND proprietaire = 'univers'").get() as any;
  assert.deepEqual(row, { vitesse: null, armure: null, equipage_min: null, equipage_max: null });
  const ex = w.app.db.prepare("SELECT equipage FROM swn_catalogue_exemples WHERE cle = 'ex' AND proprietaire = 'univers'").get() as any;
  assert.equal(ex.equipage, null);
  // catalogue version (K-3): the modified row carries that of the file that modified it
  const vc = (t: string, c: string) => (w.app.db.prepare(`SELECT version_catalogue v FROM swn_catalogue_${t} WHERE cle = ? AND proprietaire = 'univers'`).get(c) as any).v;
  assert.equal(vc('coques', 'fregate-r'), 'v2'); assert.equal(vc('armes', 'canon-r'), 'v2');
  assert.equal(vc('coques', 'nue'), 'v1'); // an unchanged row keeps the version of its last change
});

test('F-1 : champs mal formés refusés avec leur champ, les autres lignes passent', async () => {
  const w = await monde();
  const cas: [string, string, string, any, string][] = [
    ['coques', 'fregate-r', 'vitesse', 'rapide', 'vitesse'],
    ['coques', 'fregate-r', 'vitesse', 100, 'vitesse'],
    ['coques', 'fregate-r', 'vitesse', null, 'vitesse'],
    ['coques', 'fregate-r', 'armure', 1.5, 'armure'],
    ['coques', 'fregate-r', 'equipage_max', 100001, 'equipage_max'],
    ['amenagements', 'salle', 'condition', '', 'condition'],
    ['amenagements', 'salle', 'condition', '   ', 'condition'],
    ['amenagements', 'salle', 'condition', 'x'.repeat(201), 'condition'],
    ['amenagements', 'salle', 'classe_min', 5, 'classe_min'],
    ['amenagements', 'salle', 'classe_max', 0, 'classe_max'],
    ['defenses', 'voiles', 'bonus_vitesse', 10, 'bonus_vitesse'],
    ['defenses', 'voiles', 'bonus_vitesse', '1', 'bonus_vitesse'],
    ['armes', 'canon-r', 'degats', 'x'.repeat(41), 'degats'],
    ['armes', 'canon-r', 'qualites', 'x'.repeat(121), 'qualites'],
    ['armes', 'canon-r', 'perforation', -1, 'perforation'],
    ['armes', 'canon-r', 'niveau_tech', 10, 'niveau_tech'],
    ['armes', 'canon-r', 'classe_max', 3, 'classe_max'],
    ['armes', 'canon-r', 'condition', 'x', 'condition'],
    ['modifications', 'mod', 'vitesse', 1, 'vitesse'],
    ['exemples', 'ex', 'equipage', -1, 'equipage'],
    ['exemples', 'ex', 'equipage', 'huit', 'equipage'],
  ];
  for (const [nature, cle, champ, val, attendu] of cas) {
    const f = catalogue();
    f[nature].find((x: any) => x.cle === cle)[champ] = val;
    const r = await w.post(f);
    assert.equal(r.statusCode, 200, `${nature}.${champ}=${JSON.stringify(val)} ${r.body}`);
    const refus = r.json().refus;
    assert.equal(refus.length, 1, `${nature}.${champ}=${JSON.stringify(val)} ${JSON.stringify(refus)}`);
    assert.equal(refus[0].nature, nature); assert.equal(refus[0].cle, cle); assert.equal(refus[0].champ, attendu);
  }
  // the rest passes: the cannon refused, not the frigate
  const f = catalogue(); f.armes[0].degats = 'x'.repeat(41);
  const r = await w.post(f);
  assert.equal(w.app.db.prepare("SELECT COUNT(*) n FROM swn_catalogue_coques WHERE proprietaire = 'univers'").get().n, 2);
});

test('F-1 : bornes inversées refusées sur le champ haut ; bornes égales acceptées', async () => {
  const w = await monde();
  const a = catalogue(); a.coques[0].equipage_min = 21;
  let r = (await w.post(a)).json();
  assert.deepEqual(r.refus.map((x: any) => [x.nature, x.cle, x.champ]), [['coques', 'fregate-r', 'equipage_max']]);
  for (const nature of ['moteurs', 'amenagements', 'defenses'] as const) {
    const f = catalogue(); const l = f[nature][0]; l.classe_min = 3; l.classe_max = 2;
    r = (await w.post(f)).json();
    assert.deepEqual(r.refus.map((x: any) => [x.nature, x.champ]), [[nature, 'classe_max']], nature);
  }
  const ok = catalogue(); ok.coques[0].equipage_min = 20; ok.amenagements[0].classe_min = 3;
  assert.deepEqual((await w.post(ok)).json().refus, []);
});

test('F-4 : fiches de règles — colonnes présentes seulement quand une ligne dit la valeur, « — » sinon, texte échappé', async () => {
  const w = await monde();
  await w.post(catalogue());
  const t = (nature: string) => produireRegles(w.app.db, w.E, nature === 'exemples' ? 'exemples' : `regles-${nature}`).contenu;
  const arm = t('armes').split('\n').filter((l) => l.startsWith('|'));
  assert.match(arm[0]!, /\| Dégâts \| Perforation \| Qualités \| Niveau tech\. \|$/);
  const canon = arm.find((l) => l.includes('Canon R'))!;
  assert.match(canon, /\| 1d8 \| 3 \| Bruyant \| 3 \|$/);
  const am = t('amenagements').split('\n').filter((l) => l.startsWith('|'));
  assert.match(am[0]!, /\| Classe min \| Classe max \| Condition$| Classe min \| Classe max \| Condition \|$/);
  const salle = am.find((l) => l.includes('Salle'))!;
  assert.ok(salle.endsWith('| 2 | 3 | Si bon\\|ne\\\\ligne suite |'), salle);
  const hangar = am.find((l) => l.includes('Hangar'))!;
  assert.ok(hangar.endsWith('| 3 | — | — |'), hangar);
  const co = t('coques').split('\n').filter((l) => l.startsWith('|'));
  assert.match(co[0]!, /\| Vitesse \| Armure \| Équipage min \| Équipage max \|$/);
  assert.ok(co.find((l) => l.includes('Nue'))!.endsWith('| — | — | — | — |'));
  assert.ok(co.find((l) => l.includes('Frégate R'))!.endsWith('| 3 | 5 | 6 | 20 |'));
  assert.match(t('defenses').split('\n').find((l) => l.startsWith('| Nom'))!, /Bonus de vitesse \|$/);
  // the modifications carry no optional column
  assert.doesNotMatch(t('modifications'), /Classe min|Vitesse|Condition/);
});

test('F-4 : un catalogue qui ne dit rien produit des fiches sans colonne en plus', async () => {
  const w = await monde();
  const f = catalogue(); 
  for (const n of ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'exemples']) {
    f[n] = f[n].map((l: any) => Object.fromEntries(Object.entries(l).filter(([k]) => !['vitesse', 'armure', 'equipage_min', 'equipage_max', 'classe_min', 'classe_max', 'condition', 'bonus_vitesse', 'degats', 'perforation', 'qualites', 'niveau_tech', 'equipage'].includes(k) || (n === 'armes' && k === 'classe_min'))));
  }
  assert.deepEqual((await w.post(f)).json().refus, []);
  for (const n of ['coques', 'moteurs', 'amenagements', 'defenses', 'armes']) {
    const e = produireRegles(w.app.db, w.E, `regles-${n}`).contenu.split('\n').find((l) => l.startsWith('| Nom'))!;
    assert.doesNotMatch(e, /Vitesse|Armure|Équipage|Classe max|Condition|Bonus|Dégâts|Perforation|Qualités|Niveau tech/, n);
  }
});

test('F-1 : une arme ne reçoit toujours pas de classe_max (champ inconnu) et le semis garde ses décomptes', async () => {
  const w = await monde();
  const n = (t: string) => (w.app.db.prepare(`SELECT COUNT(*) n FROM swn_catalogue_${t}`).get() as any).n as number;
  const avant = ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications', 'exemples'].map(n);
  assert.ok(avant.every((x) => x > 0));
  const nulls = w.app.db.prepare('SELECT COUNT(*) n FROM swn_catalogue_coques WHERE vitesse IS NOT NULL OR armure IS NOT NULL OR equipage_min IS NOT NULL OR equipage_max IS NOT NULL').get() as any;
  assert.equal(nulls.n, 0);
});

test('CHECK de la base : valeur hors plage ou mauvais type refusée, null accepté', async () => {
  const w = await monde();
  const ins = (col: string, v: unknown) => w.app.db.prepare(`UPDATE swn_catalogue_coques SET ${col} = ? WHERE rowid = (SELECT MIN(rowid) FROM swn_catalogue_coques)`).run(v as any);
  assert.throws(() => ins('vitesse', 100)); assert.throws(() => ins('vitesse', 'x')); assert.throws(() => ins('vitesse', 1.5));
  assert.throws(() => ins('equipage_max', 100001));
  ins('vitesse', 99); ins('vitesse', null);
  const d = (c: string, v: unknown) => w.app.db.prepare(`UPDATE swn_catalogue_amenagements SET ${c} = ? WHERE rowid = (SELECT MIN(rowid) FROM swn_catalogue_amenagements)`).run(v as any);
  assert.throws(() => d('classe_min', 0)); assert.throws(() => d('classe_max', 5)); assert.throws(() => d('condition', '')); assert.throws(() => d('condition', 'x'.repeat(201)));
  d('classe_min', 4); d('condition', 'x'.repeat(200));
});
