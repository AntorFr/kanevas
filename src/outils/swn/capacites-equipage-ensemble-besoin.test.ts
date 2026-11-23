import assert from 'node:assert/strict';
import { test } from 'node:test';

// Tests d'ensemble de kanevas-concepteur-vaisseaux-capacites-equipage, écrits depuis le besoin (B-91, B-92, B-94 ; H-4, H-5, H-10 (1),
// H-capacites-1 ; docs/vaisseaux-regles.md L-14 à L-27, L-43, L-45, L-46) et non depuis le code. Catalogue inventé par le test (aucune donnée
// d'Éneria), importé par la route, calculé par POST calcul. Chaque attendu est écrit à la main : voir le calcul en commentaire.
// Portes : POST calcul, PUT reglages, PUT conceptions, POST catalogue/application. Écrans : couverts par les tests e2e de la tranche.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { encoderSession, SESSION_COOKIE } = await import('../../services/session.js');
const o = await import('../../services/outils.js');

const T = 'swn/vaisseaux';
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 10, pv: 5, ca: 10, puissance: 100, masse: 100, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const cq = (cle: string, classe: number, max?: number) => ({ cle, nom: cle.toUpperCase(), ...coque, classe, ...(max === undefined ? {} : { equipage_min: 2, equipage_max: max }) });
function catalogue(version: string, extra: { amenagements?: any[] } = {}): any {
  return {
    catalogue: T, version,
    coques: [cq('k1', 1, 6), cq('k2', 2, 6), cq('k3', 3, 6), cq('k4', 4, 6), cq('kb', 2, 40), cq('kc', 2, 41), cq('kd', 2, 21), cq('kn', 2)],
    moteurs: [],
    amenagements: [
      { cle: 'fc', nom: 'FC', ...el, capacite: 'fret_cache' }, { cle: 'fc2', nom: 'FC2', ...el, capacite: 'fret_cache' },
      { cle: 'pct', nom: 'PCT', ...el, capacite: 'equipage_max_pct' },
      { cle: 'prov', nom: 'PROV', ...el, capacite: 'provisions' }, { cle: 'prov2', nom: 'PROV2', ...el, capacite: 'provisions' },
      { cle: 'hyd', nom: 'HYD', ...el, capacite: 'hydroponie' }, { cle: 'som', nom: 'SOM', ...el, capacite: 'sommeil_froid' },
      { cle: 'exo', nom: 'EXO', ...el, capacite: 'soute_exode' }, { cle: 'can', nom: 'CAN', ...el, capacite: 'canots' },
      { cle: 'cab', nom: 'CAB', ...el, capacite: 'cabines_luxe' }, { cle: 'col', nom: 'COL', ...el, capacite: 'colonie' },
      { cle: 'sans', nom: 'SANS', ...el }, { cle: 'txt', nom: 'TXT', ...el, effet_jeu: '+2 sur les routes connues' },
      { cle: 'auto', nom: 'AUTO', ...el, limite: 1, effet: 'support_automatisation' },
      ...(extra.amenagements ?? []),
    ],
    defenses: [], armes: [{ cle: 'arm', nom: 'ARM', emport: 1, munitions: 0, cout_munition: 0, ...el, effet_jeu: 'Perce-blindage' }],
    modifications: [], exemples: [],
  };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const one = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const cid = (u: string) => one('SELECT id FROM comptes WHERE username = ?', u).id as number;
  const h = (u: string) => ({ cookie: `${SESSION_COOKIE}=${app.signCookie(encoderSession({ id: cid(u), groups: [] }))}` });
  const E = one('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const orak = one('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?', E, "Vent d'Orak").id as number;
  const B = `/api/univers/${E}/outils/${T}`;
  const req = (u: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: h(u), ...(payload ? { payload: payload as any } : {}) });
  const importer = (c: any) => req('antor', 'POST', `${B}/catalogue/application`, c);
  const r0 = await importer(catalogue('v1'));
  assert.equal(r0.statusCode, 200, r0.body);
  assert.equal(r0.json().refusTotal, 0, r0.body);
  const calcul = (corps: object) => req('antor', 'POST', `${B}/calcul`, corps);
  const ok = async (corps: object) => { const r = await calcul(corps); assert.equal(r.statusCode, 200, r.body); return r.json().resultat; };
  const version = () => o.lireLigneOutil(app.db, { niveau: 'univers', id: E }, T)?.version_reglages ?? 0;
  const regler = (u: string, valeurs: object) => req(u, 'PUT', `${B}/reglages`, { version: version(), valeurs });
  return { app, one, E, B, orak, req, importer, calcul, ok, regler };
}
const L = (cle: string, quantite = 1) => ({ nature: 'amenagements', cle, quantite });
const cap = (r: any, code: string) => (r.capacites ?? []).find((c: any) => c.code === code)?.valeur;
const codes = (r: any) => (r.capacites ?? []).map((c: any) => c.code);
const bloquantes = (r: any) => r.alertes.filter((a: any) => a.niveau === 'bloquante');

// ---------- B-91 : capacités calculées du catalogue ----------

test('B-91 fret caché : 0,2 / 2 / 20 / 200 t par installation selon la classe de la coque, quantités et éléments additionnés', async () => {
  const w = await monde();
  assert.equal(cap(await w.ok({ coque: 'k1', choix: [L('fc')] }), 'fret_cache'), 0.2);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('fc')] }), 'fret_cache'), 2);
  assert.equal(cap(await w.ok({ coque: 'k3', choix: [L('fc')] }), 'fret_cache'), 20);
  assert.equal(cap(await w.ok({ coque: 'k4', choix: [L('fc')] }), 'fret_cache'), 200);
  assert.equal(cap(await w.ok({ coque: 'k1', choix: [L('fc', 2)] }), 'fret_cache'), 0.4);
  // 1 × 2 t + 2 × 2 t sur deux éléments qui portent le même code
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('fc'), L('fc2', 2)] }), 'fret_cache'), 6);
});

test('B-91 aucune ligne de capacité sans élément à capacité (un élément sans code ou sans quantité ne donne rien, jamais 0)', async () => {
  const w = await monde();
  assert.deepEqual(codes(await w.ok({ coque: 'k2', choix: [] })), []);
  assert.deepEqual(codes(await w.ok({ coque: 'k2', choix: [L('sans'), L('txt', 2)] })), []);
});

test('B-91 équipage maximal : +100 % du maximum de la coque par installation ; le calcul relit la nouvelle borne', async () => {
  const w = await monde();
  assert.equal((await w.ok({ coque: 'k2', choix: [] })).equipage.max, 6);
  const un = await w.ok({ coque: 'k2', choix: [L('pct')] });
  assert.equal(un.equipage.max, 12); assert.equal(cap(un, 'equipage_max_pct'), 12);
  const deux = await w.ok({ coque: 'k2', choix: [L('pct', 2)] });
  assert.equal(deux.equipage.max, 18); assert.equal(cap(deux, 'equipage_max_pct'), 18);
  // bords de l'alerte « équipage excessif » : 12 passe, 13 non (la borne est celle de la coque étendue)
  const alertesEq = (r: any) => r.alertes.filter((a: any) => a.code === 'equipage_excessif').length;
  assert.equal(alertesEq(await w.ok({ coque: 'k2', choix: [L('pct')], equipage: 12 })), 0);
  assert.equal(alertesEq(await w.ok({ coque: 'k2', choix: [L('pct')], equipage: 13 })), 1);
  assert.equal(alertesEq(await w.ok({ coque: 'k2', choix: [], equipage: 7 })), 1);
});

test('B-91 durée des provisions : 2 mois × 2^n, n = somme des quantités de tous les éléments à ce code', async () => {
  const w = await monde();
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('prov')] }), 'provisions'), 4);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('prov', 2)] }), 'provisions'), 8);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('prov'), L('prov2')] }), 'provisions'), 8);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('prov', 2), L('prov2')] }), 'provisions'), 16);
});

test('B-91 hydroponie : équipage maximal × 2^(n−1)', async () => {
  const w = await monde();
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('hyd')] }), 'hydroponie'), 6);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('hyd', 2)] }), 'hydroponie'), 12);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('hyd', 3)] }), 'hydroponie'), 24);
});

test('B-91 sommeil froid : équipage maximal × n ; il lit le maximum relevé par le support de vie étendu', async () => {
  const w = await monde();
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('som')] }), 'sommeil_froid'), 6);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('som', 2)] }), 'sommeil_froid'), 12);
  // le support de vie est listé après : l'ordre des lignes ne change rien
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('som'), L('pct')] }), 'sommeil_froid'), 12);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('pct'), L('som')] }), 'sommeil_froid'), 12);
});

test('B-91 colons de l\'exode : 0 combattant/frégate (aucune ligne), 1 000 croiseur, 5 000 capitale, doublé à chaque sélection de plus', async () => {
  const w = await monde();
  assert.deepEqual(codes(await w.ok({ coque: 'k1', choix: [L('exo')] })), []);
  assert.deepEqual(codes(await w.ok({ coque: 'k2', choix: [L('exo')] })), []);
  assert.equal(cap(await w.ok({ coque: 'k3', choix: [L('exo')] }), 'soute_exode'), 1000);
  assert.equal(cap(await w.ok({ coque: 'k4', choix: [L('exo')] }), 'soute_exode'), 5000);
  assert.equal(cap(await w.ok({ coque: 'k3', choix: [L('exo', 2)] }), 'soute_exode'), 2000);
  assert.equal(cap(await w.ok({ coque: 'k3', choix: [L('exo', 3)] }), 'soute_exode'), 4000);
  assert.equal(cap(await w.ok({ coque: 'k4', choix: [L('exo', 2)] }), 'soute_exode'), 10000);
});

test('B-91 canots : un canot par tranche de 20 de l\'équipage maximal, par installation (arrondi au-dessus)', async () => {
  const w = await monde();
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('can')] }), 'canots'), 1); // 6 → ⌈0,3⌉
  assert.equal(cap(await w.ok({ coque: 'kb', choix: [L('can')] }), 'canots'), 2); // 40 → 2 pile
  assert.equal(cap(await w.ok({ coque: 'kc', choix: [L('can')] }), 'canots'), 3); // 41 → ⌈2,05⌉
  assert.equal(cap(await w.ok({ coque: 'kc', choix: [L('can', 2)] }), 'canots'), 6);
  // équipage maximal relevé : 21 × 2 = 42 → 3 canots (contre 2 sans le support)
  assert.equal(cap(await w.ok({ coque: 'kd', choix: [L('can')] }), 'canots'), 2);
  assert.equal(cap(await w.ok({ coque: 'kd', choix: [L('can'), L('pct')] }), 'canots'), 3);
});

test('B-91 cabines de luxe : 10 % de l\'équipage maximal par installation, arrondi au-dessus', async () => {
  const w = await monde();
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('cab')] }), 'cabines_luxe'), 1); // 0,6
  assert.equal(cap(await w.ok({ coque: 'kb', choix: [L('cab')] }), 'cabines_luxe'), 4); // 4 pile
  assert.equal(cap(await w.ok({ coque: 'kc', choix: [L('cab')] }), 'cabines_luxe'), 5); // 4,1
  assert.equal(cap(await w.ok({ coque: 'kb', choix: [L('cab', 2)] }), 'cabines_luxe'), 8);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('cab'), L('pct')] }), 'cabines_luxe'), 2); // 1,2
});

test('B-91 colonie : 5 × l\'équipage maximal, relevé par le support de vie étendu', async () => {
  const w = await monde();
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('col')] }), 'colonie'), 30);
  assert.equal(cap(await w.ok({ coque: 'k2', choix: [L('col'), L('pct')] }), 'colonie'), 60);
  assert.equal(cap(await w.ok({ coque: 'kc', choix: [L('col')] }), 'colonie'), 205);
});

test('B-91 les neuf capacités sur une coque de classe 3 : valeurs de la classe, équipage relevé lu par les cinq autres, ordre de H-4', async () => {
  const w = await monde();
  const r = await w.ok({ coque: 'k3', choix: [L('fc'), L('pct'), L('prov'), L('hyd'), L('som'), L('exo'), L('can'), L('cab'), L('col')] });
  assert.deepEqual(codes(r), ['fret_cache', 'equipage_max_pct', 'provisions', 'hydroponie', 'sommeil_froid', 'soute_exode', 'canots', 'cabines_luxe', 'colonie']);
  const v = Object.fromEntries(r.capacites.map((c: any) => [c.code, c.valeur]));
  // max 6 → 12 ; fret 20 ; provisions 2×2 ; hydroponie 12 ; sommeil 12 ; exode 1000 ; canots ⌈12/20⌉ ; cabines ⌈1,2⌉ ; colonie 60
  assert.deepEqual(v, { fret_cache: 20, equipage_max_pct: 12, provisions: 4, hydroponie: 12, sommeil_froid: 12, soute_exode: 1000, canots: 1, cabines_luxe: 2, colonie: 60 });
});

test('B-91 coque sans équipage maximal : aucune des capacités qui le lisent n\'a de ligne (jamais 0) ; le fret caché reste', async () => {
  const w = await monde();
  const r = await w.ok({ coque: 'kn', choix: [L('fc'), L('hyd'), L('som'), L('can'), L('cab'), L('col'), L('prov')] });
  assert.deepEqual(codes(r), ['fret_cache', 'provisions']);
});

test('B-91 la ligne d\'effet de chaque élément choisi est rendue ; un élément sans effet_jeu n\'en a pas', async () => {
  const w = await monde();
  const r = await w.ok({ coque: 'k2', choix: [L('txt'), L('sans'), { nature: 'armes', cle: 'arm', quantite: 1 }] });
  assert.deepEqual(r.effetsJeu.map((e: any) => [e.nature, e.cle, e.texte]), [['amenagements', 'txt', '+2 sur les routes connues'], ['armes', 'arm', 'Perce-blindage']]);
  assert.deepEqual((await w.ok({ coque: 'k2', choix: [L('sans')] })).effetsJeu, []);
});

// ---------- B-92 : coût d'équipage, diviseur, chantier, réglages ----------

test('B-92 pj = 2, robots = 3, équipage 10 : 640 cr par jour, robots 3 000 cr en coût unique hors du total journalier', async () => {
  const w = await monde();
  // 100 × (10 − 2 − 3) + 20 × (10 − 3) = 500 + 140
  const r = await w.ok({ coque: 'k2', choix: [L('auto')], equipage: 10, pj: 2, robots: 3 });
  assert.deepEqual(r.fraisEquipage, { jour: 640, robots: 3000 });
  assert.equal(r.prix, 1010); // l'équipage et les robots restent hors du prix : 10 + 1 000
});

test('B-92 bords du coût : sans pj ni robots 1 200 ; tous les membres joueurs : vivres seules ; un seul vivant : 120 et 9 000 ; coque sans équipage : rien', async () => {
  const w = await monde();
  assert.deepEqual((await w.ok({ coque: 'k2', choix: [], equipage: 10 })).fraisEquipage, { jour: 1200, robots: 0 });
  assert.deepEqual((await w.ok({ coque: 'k2', choix: [], equipage: 10, pj: 10 })).fraisEquipage, { jour: 200, robots: 0 });
  assert.deepEqual((await w.ok({ coque: 'k2', choix: [L('auto')], equipage: 10, robots: 9 })).fraisEquipage, { jour: 120, robots: 9000 });
  assert.equal((await w.ok({ coque: 'kn', choix: [], pj: 2 })).fraisEquipage, null); // coque sans équipage : aucun équipage choisi
});

test('B-92 solde_jour et vivres_jour réglés atteignent le coût : 7 × 5 + 3 × 7 = 56', async () => {
  const w = await monde();
  assert.equal((await w.regler('antor', { solde_jour: 7, vivres_jour: 3 })).statusCode, 204);
  assert.deepEqual((await w.ok({ coque: 'k2', choix: [L('auto')], equipage: 10, pj: 2, robots: 3 })).fraisEquipage, { jour: 56, robots: 3000 });
});

test('B-92 des robots sans système d\'automatisation sont refusés (bloquante) ; la conception n\'est pas enregistrée', async () => {
  const w = await monde();
  const r = await w.ok({ coque: 'k2', choix: [], equipage: 10, robots: 1 });
  assert.deepEqual(bloquantes(r).map((a: any) => a.texte), ["Des robots exigent un système d'automatisation."]);
  const g = (await w.req('antor', 'GET', `${w.B}/conceptions/${w.orak}`)).json();
  const corps = { coque: 'k2', choix: [] as object[], version: g.version, equipage: 10, pj: 0, robots: 1 };
  const p = await w.req('antor', 'PUT', `${w.B}/conceptions/${w.orak}`, corps);
  assert.equal(p.statusCode, 422, p.body); assert.equal(p.json().code, 'conception_bloquee');
  assert.equal(w.one('SELECT robots r FROM swn_conceptions WHERE fiche_id = ?', w.orak).r, 0);
});

test('B-92 plus aucun membre vivant, ou plus de joueurs que de vivants : bloquantes ; à la limite, accepté', async () => {
  const w = await monde();
  const t = async (c: object) => bloquantes(await w.ok({ coque: 'k2', choix: [L('auto')], ...c })).map((a: any) => a.texte);
  assert.deepEqual(await t({ equipage: 10, robots: 10 }), ['Au moins un membre d\'équipage doit rester vivant.']);
  assert.deepEqual(await t({ equipage: 10, robots: 9 }), []);
  assert.deepEqual(await t({ equipage: 4, pj: 3, robots: 2 }), ['Plus de personnages-joueurs que de membres d\'équipage vivants.']);
  assert.deepEqual(await t({ equipage: 4, pj: 2, robots: 2 }), []);
});

test('B-92 enregistrer une conception garde pj, robots et rend le coût ; le relire donne les mêmes chiffres', async () => {
  const w = await monde();
  const g = (await w.req('antor', 'GET', `${w.B}/conceptions/${w.orak}`)).json();
  const p = await w.req('antor', 'PUT', `${w.B}/conceptions/${w.orak}`, { coque: 'k2', choix: [L('auto')], version: g.version, equipage: 10, pj: 2, robots: 3 });
  assert.equal(p.statusCode, 200, p.body);
  const r = (await w.req('antor', 'GET', `${w.B}/conceptions/${w.orak}`)).json();
  assert.equal(r.pj, 2); assert.equal(r.robots, 3);
  assert.deepEqual(r.resultat.fraisEquipage, { jour: 640, robots: 3000 });
});

test('B-92 diviseur de prix : 1 → 4 010 ; 2 → 2 005 ; 4 → 1 003 (arrondi au-dessus) ; l\'entretien suit le prix affiché ; les robots ne sont pas divisés', async () => {
  const w = await monde();
  const c = { coque: 'k2', choix: [L('fc', 3), L('auto')], equipage: 10, pj: 2, robots: 3 };
  const p1 = await w.ok(c);
  assert.equal(p1.prix, 4010); assert.equal(p1.diviseurPrix, 1); assert.equal(p1.entretien, 201);
  assert.equal((await w.regler('antor', { diviseur_prix: '2' })).statusCode, 204);
  const p2 = await w.ok(c);
  assert.equal(p2.prix, 2005); assert.equal(p2.diviseurPrix, 2); assert.equal(p2.entretien, 100);
  assert.deepEqual(p2.fraisEquipage, { jour: 640, robots: 3000 });
  assert.equal((await w.regler('antor', { diviseur_prix: '4' })).statusCode, 204);
  assert.equal((await w.ok(c)).prix, 1003);
});

test('B-92 cadence du chantier : défaut 25 000 ; changer la cadence recalcule les jours (⌈prix / cadence⌉, au moins 1)', async () => {
  const w = await monde();
  const c = { coque: 'k2', choix: [L('fc', 3)] }; // prix 3 010
  assert.equal((await w.ok(c)).chantierJours, 1);
  assert.equal((await w.regler('antor', { cadence_chantier: 1000 })).statusCode, 204);
  assert.equal((await w.ok(c)).chantierJours, 4); // ⌈3,01⌉
  assert.equal((await w.regler('antor', { cadence_chantier: 3010 })).statusCode, 204);
  assert.equal((await w.ok(c)).chantierJours, 1);
  assert.equal((await w.regler('antor', { cadence_chantier: 3009 })).statusCode, 204);
  assert.equal((await w.ok(c)).chantierJours, 2);
  // le chantier suit le prix divisé : 3 010 ÷ 2 = 1 505 ; cadence 1 000 → 2
  assert.equal((await w.regler('antor', { cadence_chantier: 1000, diviseur_prix: '2' })).statusCode, 204);
  assert.equal((await w.ok(c)).chantierJours, 2);
});

test('B-92 réglages hors bornes refusés (400, champ nommé), bornes exactes acceptées', async () => {
  const w = await monde();
  for (const [champ, valeur] of [['cadence_chantier', 0], ['cadence_chantier', 1000001], ['cadence_chantier', 12.5], ['solde_jour', -1], ['solde_jour', 100001],
    ['vivres_jour', -1], ['vivres_jour', 100001], ['vivres_jour', 1.5], ['diviseur_prix', '3'], ['diviseur_prix', '0']] as [string, unknown][]) {
    const r = await w.regler('antor', { [champ]: valeur });
    assert.equal(r.statusCode, 400, champ + ' ' + String(valeur) + ' ' + r.body);
    assert.equal(r.json().champ, champ);
  }
  for (const valeurs of [{ cadence_chantier: 1 }, { cadence_chantier: 1000000 }, { solde_jour: 0 }, { solde_jour: 100000 }, { vivres_jour: 0 }, { vivres_jour: 100000 }, { diviseur_prix: '1' }]) {
    assert.equal((await w.regler('antor', valeurs)).statusCode, 204, JSON.stringify(valeurs));
  }
});

test('B-92 une valeur refusée ne change rien au calcul ; un joueur ne peut pas régler (« Page introuvable. »)', async () => {
  const w = await monde();
  assert.equal((await w.regler('antor', { cadence_chantier: 0 })).statusCode, 400);
  assert.equal((await w.ok({ coque: 'k2', choix: [L('fc', 3)] })).chantierJours, 1);
  for (const u of ['lea', 'teo']) {
    const r = await w.regler(u, { diviseur_prix: '4' });
    assert.equal(r.statusCode, 404, u + r.body); assert.equal(r.json().message, 'Page introuvable.');
  }
  assert.equal((await w.ok({ coque: 'k2', choix: [L('fc', 3)] })).diviseurPrix, 1);
});

// ---------- B-94 / H-10 (5) : l'import de catalogue accepte les champs, l'empreinte les couvre ----------

test('B-94 import : capacite et effet_jeu acceptés et relus ; code inconnu et ligne de 201 caractères refusés ; rejeu identique inchangé', async () => {
  const w = await monde();
  const lire = async () => (await w.req('antor', 'GET', `${w.B}/catalogue?nature=amenagements`)).json().elements;
  const fc = (await lire()).find((e: any) => e.cle === 'fc');
  assert.equal(fc.donnees.capacite, 'fret_cache');
  assert.equal((await lire()).find((e: any) => e.cle === 'txt').donnees.effet_jeu, '+2 sur les routes connues');
  assert.equal((await lire()).find((e: any) => e.cle === 'sans').donnees.capacite ?? null, null);
  const rejeu = await w.importer(catalogue('v1'));
  assert.equal(rejeu.statusCode, 200, rejeu.body);
  for (const s of Object.values<any>(rejeu.json().natures)) { assert.equal(s.ajoutes, 0); assert.equal(s.modifies, 0); }
  const mauvais = await w.importer(catalogue('v2', { amenagements: [
    { cle: 'x1', nom: 'X1', ...el, capacite: 'teleportation' },
    { cle: 'x2', nom: 'X2', ...el, effet_jeu: 'a'.repeat(201) },
    { cle: 'x3', nom: 'X3', ...el, effet_jeu: 'a'.repeat(200) },
  ] }));
  assert.equal(mauvais.statusCode, 200, mauvais.body);
  const refus = mauvais.json().refus.map((x: any) => `${x.cle}:${x.champ}`).sort();
  assert.deepEqual(refus, ['x1:capacite', 'x2:effet_jeu']);
  assert.ok((await lire()).some((e: any) => e.cle === 'x3'));
  assert.ok(!(await lire()).some((e: any) => e.cle === 'x1' || e.cle === 'x2'));
});

test('B-94 empreinte : ne changer que capacite, ou que effet_jeu, d\'un élément est une modification (et non « inchangé »)', async () => {
  const w = await monde();
  const change = (champs: object) => {
    const c = catalogue('v2');
    Object.assign(c.amenagements.find((a: any) => a.cle === 'fc'), champs);
    return w.importer(c);
  };
  const a = await change({ capacite: 'colonie' });
  assert.equal(a.json().natures.amenagements.modifies, 1, a.body);
  assert.equal((await w.req('antor', 'GET', `${w.B}/catalogue?nature=amenagements`)).json().elements.find((e: any) => e.cle === 'fc').donnees.capacite, 'colonie');
  const b = await change({ capacite: 'colonie', effet_jeu: 'Nouveau texte' });
  assert.equal(b.json().natures.amenagements.modifies, 1, b.body);
  const c = await change({ capacite: 'colonie', effet_jeu: 'Nouveau texte' });
  assert.equal(c.json().natures.amenagements.modifies, 0, c.body);
  assert.equal(c.json().natures.amenagements.inchanges >= 1, true);
});

test('B-94 un catalogue sans les nouveaux champs se lit comme avant : aucune capacité, aucun effet, et le calcul reste valide', async () => {
  const w = await monde();
  const c = catalogue('v2');
  for (const a of c.amenagements) { delete a.capacite; delete a.effet_jeu; }
  assert.equal((await w.importer(c)).statusCode, 200);
  const r = await w.ok({ coque: 'k2', choix: [L('fc'), L('pct'), L('txt')] });
  assert.deepEqual(codes(r), []); assert.deepEqual(r.effetsJeu, []);
  assert.equal(r.equipage.max, 6);
});
