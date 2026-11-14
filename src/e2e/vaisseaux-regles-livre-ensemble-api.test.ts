// Feature-level black-box tests of kanevas-outils-format-vaisseaux-regles-livre (B-87), HTTP level: real server in stub mode with the
// stub seed, real SQLite. Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (B-87, P-19 step 2) and, for what
// is delivered without a screen (import, calculation, rule sheets, saved text), ARCHITECTURE.md W-1 to W-7 (the hand-calculated figures
// of W-4 are re-derived here). The trial catalogue is written by the test, invented, absent from the seed. Every expected value is a literal.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player and author of « Étoile du soir »)
// Hull Frégate R: class 2, cost 300 000, power 20, mass 20, emports 3, speed 3, armour 5. Frégate R3: class 3, same.
// B-87 (1) soutes optimisées  nominal : coque nue, masse libre 20 → 18 (exact), ajuste.masse −2 ; soute 10 de masse 8 : libre 12 → 11 (inexact), fret 10 → 20
//                             bords   : masse 7,5 (libre 12,5) → 11,5 ; masse 3 (libre 17) → 15,5 ; libre 0,5 → 0,5 ; libre −2 inchangé ; fret absent reste absent
//                             exclusions : après l'échange (libre 22 → 20) ; deux lignes de l'effet ne changent pas plus qu'une ; l'ordre des lignes ne change rien
// B-87 (2) blindage renforcé  nominal : valeur 2, réparation 0 → 7 ; réparation 3 → 10 ; bords : valeur 0 + réparation 4 → 9 ; réparation 20 → 27 ; classe 3 → même armure
// B-87 (3) montages spécialisés nominal : arme p10 m1 → +5 / +1 ; bords : p7 m3 → +4 / +1,5 ; p6 m4 → +3 / +2 ; p1 m1 → +1 / +1 ; m 2,5 → +1,5 ; deux armes → +10 / +1
//                             échec   : aucune cible, cible qui n'est pas une arme → cible_invalide bloquante
// B-87 (4) surcharge cumulable nominal : 1, 2, 3 installations de 50 % sur p10 → +5, +10, +15 ; bords : p3 → +2 (une), +4 (deux, arrondi par installation) ; 3 refusée à l'enregistrement
//                             échec   : cible invalide → cible_invalide ; import : limite 2 et 3 acceptées, 0 et 1,5 refusées
// Import : codes, paramètres et limites refusés avec leur champ, le reste passe ; champs créés, relus, inchangés au rejeu ; quatre anciens codes = effet inconnu ;
//          exclusion : une joueuse n'importe pas ; fiches de règles et texte enregistré ; catalogue antérieur : même résultat (Vent d'Orak 685 000 cr)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './harnais.test.ts';

const servers: Server[] = [];
after(() => servers.forEach((s) => s.stop()));

type Rep = { status: number; json: Any; texte: string };
type Client = (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

async function session(base: string, compte: string): Promise<Client> {
  const r = await fetch(`${base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, `no session cookie for ${compte}`);
  return async (methode, chemin, corps) => {
    const rep = await fetch(base + chemin, { method: methode, headers: { cookie, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await rep.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not json */ }
    return { status: rep.status, json, texte };
  };
}

const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const arme = { ...el, puissance: 10, masse: 1, emport: 1, munitions: 0, cout_munition: 0 };
const mod = { ...el, limite: 1 };

const catalogue = (version = 'livre-1', surcharge: Any = {}): Any => ({
  catalogue: 'swn/vaisseaux', version,
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5 },
    { cle: 'fregate-r3', nom: 'Frégate R3', classe: 3, ...coque, vitesse: 3, armure: 5 },
  ],
  amenagements: [
    { cle: 'soute-z', nom: 'Soute Z', ...el, masse: 8, soute: 10 },
    { cle: 'soute-75', nom: 'Soute 7,5', ...el, masse: 7.5, soute: 10 },
    { cle: 'soute-3', nom: 'Soute 3', ...el, masse: 3, soute: 10 },
    { cle: 'soute-195', nom: 'Soute 19,5', ...el, masse: 19.5, soute: 10 },
    { cle: 'lourd-22', nom: 'Lourd 22', ...el, masse: 22 },
    { cle: 'cabine-z', nom: 'Cabine Z', ...el, masse: 2 },
  ],
  armes: [
    { cle: 'laser-z', nom: 'Laser Z', ...arme },
    { cle: 'canon-z', nom: 'Canon Z', ...arme, puissance: 7, masse: 3 },
    { cle: 'canon-p', nom: 'Canon P', ...arme, puissance: 6, masse: 4 },
    { cle: 'laser-u', nom: 'Laser U', ...arme, puissance: 1, masse: 1 },
    { cle: 'canon-m', nom: 'Canon M', ...arme, puissance: 4, masse: 2.5 },
    { cle: 'canon-q', nom: 'Canon Q', ...arme, puissance: 3, masse: 1 },
  ],
  modifications: [
    { cle: 'optimise-l', nom: 'Optimise L', ...mod, effet: 'soutes_optimisees_livre' },
    { cle: 'optimise-l2', nom: 'Optimise L2', ...mod, effet: 'soutes_optimisees_livre' },
    { cle: 'blindage-l', nom: 'Blindage L', ...mod, effet: 'blindage_renforce', valeur: 2 },
    { cle: 'blindage-0', nom: 'Blindage 0', ...mod, effet: 'blindage_renforce', valeur: 0 },
    ...['laser-z', 'canon-z', 'canon-p', 'laser-u', 'canon-m', 'canon-q'].map((a) => ({ cle: `montage-${a}`, nom: `Montage ${a}`, ...mod, effet: 'montages_specialises', vise: { nature: 'armes', cle: a } })),
    { cle: 'surcharge-l', nom: 'Surcharge L', ...el, limite: 3, effet: 'surcharge_cumulable', effet_pct: 50, vise: { nature: 'armes', cle: 'laser-z' } },
    { cle: 'surcharge-q', nom: 'Surcharge Q', ...el, limite: 3, effet: 'surcharge_cumulable', effet_pct: 50, vise: { nature: 'armes', cle: 'canon-q' } },
    { cle: 'reacteur-i', nom: 'Réacteur arrondi', ...el, limite: 3, effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5, echange_arrondi: 'installation' },
  ],
  ...surcharge,
});

interface Monde { E: number; V: string; antor: Client; lea: Client; etoile: number; orak: number }

async function monde(importer = true, cat: Any = catalogue()): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const antor = await session(srv.base, 'antor');
  const lea = await session(srv.base, 'lea');
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  if (importer) {
    const r = await antor('POST', `${V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.refusTotal, 0, r.texte);
  }
  const liste = (await antor('GET', `${V}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  return { E, V, antor, lea, etoile: fid('Étoile du soir'), orak: fid("Vent d'Orak") };
}

const l = (nature: string, cle: string, quantite = 1, plus: Any = {}) => ({ nature, cle, quantite, ...plus });
const amen = (cle: string, q = 1) => l('amenagements', cle, q);
const armes = (cle: string, q = 1) => l('armes', cle, q);
const mods = (cle: string, q = 1, plus: Any = {}) => l('modifications', cle, q, plus);
const vise = (nature: string, cle: string) => ({ vise: { nature, cle } });
const calc = (m: Monde, corps: Any) => m.lea('POST', `${m.V}/calcul`, corps);
const plat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const ligne = (r: Rep, cle: string): Any => r.json.resultat.lignes.find((x: Any) => x.cle === cle);
const refus = (r: Rep) => Object.fromEntries((r.json.refus as Any[]).map((x) => [x.cle, x.champ]));
const cibleInvalide = (r: Rep) => (r.json.alertes as Any[]).filter((a) => a.code === 'cible_invalide');
const sur = (coqueCle: string, choix: Any[], plus: Any = {}) => ({ coque: coqueCle, choix, ...plus });
const importer = (m: Monde, cat: Any) => m.antor('POST', `${m.V}/catalogue/application`, cat);

describe('B-87 (1) soutes optimisées : masse libre −10 % (arrondie au-dessus), fret doublé', () => {
  it('coque nue, masse libre 20 → 18 (arrondi exact), ajuste.masse −2', async () => {
    const m = await monde();
    const r = await calc(m, sur('fregate-r', [mods('optimise-l')]));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.masseLibre, 18);
    assert.equal(ligne(r, 'optimise-l').ajuste.masse, -2);
  });

  it('soute de masse 8 et fret 10 : masse libre 12 → 11 (arrondi inexact), fret 20', async () => {
    const m = await monde();
    const r = await calc(m, sur('fregate-r', [amen('soute-z'), mods('optimise-l')]));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.masseLibre, 11);
    assert.equal(r.json.resultat.soutes, 20);
    const sans = await calc(m, sur('fregate-r', [amen('soute-z')]));
    assert.equal(sans.json.resultat.masseLibre, 12);
    assert.equal(sans.json.resultat.soutes, 10);
  });

  it('bords : libre 12,5 → 11,5 ; libre 17 → 15,5 ; libre 0,5 → 0,5', async () => {
    const m = await monde();
    const libre = async (soute: string) => (await calc(m, sur('fregate-r', [amen(soute), mods('optimise-l')]))).json.resultat.masseLibre;
    assert.equal(await libre('soute-75'), 11.5);
    assert.equal(await libre('soute-3'), 15.5);
    assert.equal(await libre('soute-195'), 0.5);
  });

  it('bord : masse libre négative (−2) inchangée ; fret absent reste absent', async () => {
    const m = await monde();
    const a = await calc(m, sur('fregate-r', [amen('lourd-22'), mods('optimise-l')]));
    assert.equal(a.json.resultat.masseLibre, -2);
    const b = await calc(m, sur('fregate-r', [mods('optimise-l')]));
    assert.equal(b.json.resultat.soutes, null);
  });

  it('exclusion : l’effet est pris après l’échange (4 points, +2 de masse : libre 22 → 20), quel que soit l’ordre des lignes', async () => {
    const m = await monde();
    const a = await calc(m, sur('fregate-r', [mods('reacteur-i', 1, { points: 4 }), mods('optimise-l')]));
    const b = await calc(m, sur('fregate-r', [mods('optimise-l'), mods('reacteur-i', 1, { points: 4 })]));
    assert.equal(a.json.resultat.masseLibre, 20);
    assert.equal(b.json.resultat.masseLibre, 20);
  });

  it('exclusion : deux lignes de l’effet (éléments différents) ne changent pas plus qu’une : libre 11, fret 20', async () => {
    const m = await monde();
    const r = await calc(m, sur('fregate-r', [amen('soute-z'), mods('optimise-l'), mods('optimise-l2')]));
    assert.equal(r.json.resultat.masseLibre, 11);
    assert.equal(r.json.resultat.soutes, 20);
  });

  it('échec : un pourcentage ou une cible sur l’effet est refusé au calcul (champ vise)', async () => {
    const m = await monde();
    const r = await calc(m, sur('fregate-r', [amen('soute-z'), mods('optimise-l', 1, vise('amenagements', 'soute-z'))]));
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.champ, 'vise');
  });
});

describe('B-87 (2) blindage renforcé : armure + valeur + réparation de l’ingénieur', () => {
  const armure = async (m: Monde, cle: string, reparation: number, coqueCle = 'fregate-r') =>
    (await calc(m, sur(coqueCle, [mods(cle)], { reparation }))).json.resultat.armure;

  it('valeur 2 : réparation 0 → 7 ; réparation 3 → 10 ; sans la modification 5', async () => {
    const m = await monde();
    assert.equal(await armure(m, 'blindage-l', 0), 7);
    assert.equal(await armure(m, 'blindage-l', 3), 10);
    assert.equal((await calc(m, sur('fregate-r', []))).json.resultat.armure, 5);
  });

  it('bords : valeur 0 et réparation 4 → 9 ; réparation 20 → 27 ; classe 3 → même armure 7', async () => {
    const m = await monde();
    assert.equal(await armure(m, 'blindage-0', 4), 9);
    assert.equal(await armure(m, 'blindage-l', 20), 27);
    assert.equal(await armure(m, 'blindage-l', 0, 'fregate-r3'), 7);
  });

  it('ajuste.armure de la ligne : +5 (valeur 2, réparation 3)', async () => {
    const m = await monde();
    const r = await calc(m, sur('fregate-r', [mods('blindage-l')], { reparation: 3 }));
    assert.equal(ligne(r, 'blindage-l').ajuste.armure, 5);
  });
});

describe('B-87 (3) montages spécialisés : la moitié (minimum 1) de la puissance ET de la masse de l’arme visée', () => {
  const monter = (m: Monde, arme: string, q = 1, plus: Any = {}) =>
    calc(m, sur('fregate-r', [armes(arme, q), mods(`montage-${arme}`, 1, vise('armes', arme))], plus));
  const ajuste = (r: Rep) => (r.json.resultat.lignes as Any[]).find((x) => x.cle.startsWith('montage-')).ajuste;

  it('arme de puissance 10 et masse 1 : puissance +5, masse +1 (minimum), puissance libre 5', async () => {
    const m = await monde();
    const r = await monter(m, 'laser-z');
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(ajuste(r), { masse: 1, puissance: 5 });
    assert.equal(r.json.resultat.puissanceLibre, 5);
  });

  it('bords : puissance 7 masse 3 → +4 / +1,5 ; 6 et 4 → +3 / +2 ; 1 et 1 → +1 / +1 ; masse 2,5 → +1,5', async () => {
    const m = await monde();
    assert.deepEqual(ajuste(await monter(m, 'canon-z')), { masse: 1.5, puissance: 4 });
    assert.deepEqual(ajuste(await monter(m, 'canon-p')), { masse: 2, puissance: 3 });
    assert.deepEqual(ajuste(await monter(m, 'laser-u')), { masse: 1, puissance: 1 });
    assert.equal(ajuste(await monter(m, 'canon-m')).masse, 1.5);
  });

  it('bord : deux armes (totaux de la ligne 20 et 2) → puissance +10, masse +1', async () => {
    const m = await monde();
    assert.deepEqual(ajuste(await monter(m, 'laser-z', 2)), { masse: 1, puissance: 10 });
  });

  it('échec : sans cible, ou avec un aménagement pour cible → alerte bloquante cible_invalide', async () => {
    const m = await monde();
    const a = await calc(m, sur('fregate-r', [armes('laser-z'), mods('montage-laser-z')]));
    assert.deepEqual(cibleInvalide(a).map((x) => x.niveau), ['bloquante']);
    const b = await calc(m, sur('fregate-r', [amen('soute-z'), mods('montage-laser-z', 1, vise('amenagements', 'soute-z'))]));
    assert.deepEqual(cibleInvalide(b).map((x) => x.niveau), ['bloquante']);
  });
});

describe('B-87 (4) surcharge d’arme cumulable : plusieurs installations, pas de limite de 1', () => {
  const surcharger = (m: Monde, arme: string, q: number) =>
    calc(m, sur('fregate-r', [armes(arme), mods(arme === 'canon-q' ? 'surcharge-q' : 'surcharge-l', q, vise('armes', arme))]));

  it('50 % sur puissance 10 : 1 installation +5 (libre 5) ; 2 → +10 (libre 0) ; 3 → +15 (libre −5)', async () => {
    const m = await monde();
    const un = await surcharger(m, 'laser-z', 1);
    assert.equal(un.status, 200, un.texte);
    assert.equal(ligne(un, 'surcharge-l').ajuste.puissance, 5);
    assert.equal(un.json.resultat.puissanceLibre, 5);
    const deux = await surcharger(m, 'laser-z', 2);
    assert.equal(ligne(deux, 'surcharge-l').ajuste.puissance, 10);
    assert.equal(deux.json.resultat.puissanceLibre, 0);
    const trois = await surcharger(m, 'laser-z', 3);
    assert.equal(ligne(trois, 'surcharge-l').ajuste.puissance, 15);
    assert.equal(trois.json.resultat.puissanceLibre, -5);
  });

  it('bord : puissance 3 à 50 % → +2 pour une installation, +4 pour deux (arrondi par installation)', async () => {
    const m = await monde();
    assert.equal(ligne(await surcharger(m, 'canon-q', 1), 'surcharge-q').ajuste.puissance, 2);
    assert.equal(ligne(await surcharger(m, 'canon-q', 2), 'surcharge-q').ajuste.puissance, 4);
  });

  it('échec : sans cible → cible_invalide bloquante ; trois installations dépassant la puissance sont refusées à l’enregistrement', async () => {
    const m = await monde();
    const a = await calc(m, sur('fregate-r', [armes('laser-z'), mods('surcharge-l')]));
    assert.deepEqual(cibleInvalide(a).map((x) => x.niveau), ['bloquante']);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const s = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, sur('fregate-r', [armes('laser-z'), mods('surcharge-l', 3, vise('armes', 'laser-z'))], { version: vue.version }));
    assert.ok(s.status >= 400 && s.status < 500, `got ${s.status}`);
  });
});

describe('B-87 import : refus avec leur champ, le reste passe', () => {
  it('soutes optimisées : limite 1 sans paramètre passe ; effet_pct, limite 2 et limite 0 refusés', async () => {
    const m = await monde(false);
    const cat = catalogue('s-1', { modifications: [
      { cle: 'o-ok', nom: 'O ok', ...mod, effet: 'soutes_optimisees_livre' },
      { cle: 'o-pct', nom: 'O pct', ...mod, effet: 'soutes_optimisees_livre', effet_pct: 10 },
      { cle: 'o-lim2', nom: 'O lim2', ...el, limite: 2, effet: 'soutes_optimisees_livre' },
      { cle: 'o-lim0', nom: 'O lim0', ...el, limite: 0, effet: 'soutes_optimisees_livre' },
    ] });
    const r = await importer(m, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'o-pct': 'effet_pct', 'o-lim2': 'limite', 'o-lim0': 'limite' });
    assert.equal(r.json.natures.modifications.ajoutes, 1);
    assert.equal(r.json.natures.coques.ajoutes, 2);
  });

  it('blindage renforcé : valeur 0 et 9 passent ; 10, −1, 1,5, absente refusées (champ valeur) ; limite 2 refusée (champ limite)', async () => {
    const m = await monde(false);
    const b = { ...mod, effet: 'blindage_renforce' };
    const cat = catalogue('b-1', { modifications: [
      { cle: 'b-0', nom: 'B 0', ...b, valeur: 0 },
      { cle: 'b-9', nom: 'B 9', ...b, valeur: 9 },
      { cle: 'b-10', nom: 'B 10', ...b, valeur: 10 },
      { cle: 'b-neg', nom: 'B neg', ...b, valeur: -1 },
      { cle: 'b-dec', nom: 'B dec', ...b, valeur: 1.5 },
      { cle: 'b-abs', nom: 'B abs', ...b },
      { cle: 'b-lim2', nom: 'B lim2', ...b, valeur: 2, limite: 2 },
    ] });
    const r = await importer(m, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'b-10': 'valeur', 'b-neg': 'valeur', 'b-dec': 'valeur', 'b-abs': 'valeur', 'b-lim2': 'limite' });
    assert.equal(r.json.natures.modifications.ajoutes, 2);
  });

  it('montages spécialisés : limite 1 passe ; limite 2 et limite 0 refusées', async () => {
    const m = await monde(false);
    const b = { ...el, effet: 'montages_specialises', vise: { nature: 'armes', cle: 'laser-z' } };
    const cat = catalogue('m-1', { modifications: [
      { cle: 'm-ok', nom: 'M ok', ...b, limite: 1 },
      { cle: 'm-2', nom: 'M 2', ...b, limite: 2 },
      { cle: 'm-0', nom: 'M 0', ...b, limite: 0 },
    ] });
    const r = await importer(m, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'm-2': 'limite', 'm-0': 'limite' });
    assert.equal(r.json.natures.modifications.ajoutes, 1);
  });

  it('surcharge cumulable : limite 1, 2, 3 et effet_pct 1 et 1 000 passent ; effet_pct 0, 1 001, absent refusés ; limite 0 et 1,5 refusées', async () => {
    const m = await monde(false);
    const b = { ...el, effet: 'surcharge_cumulable', vise: { nature: 'armes', cle: 'laser-z' } };
    const cat = catalogue('c-1', { modifications: [
      { cle: 'c-l1', nom: 'C l1', ...b, limite: 1, effet_pct: 50 },
      { cle: 'c-l2', nom: 'C l2', ...b, limite: 2, effet_pct: 50 },
      { cle: 'c-l3', nom: 'C l3', ...b, limite: 3, effet_pct: 1 },
      { cle: 'c-p1000', nom: 'C p1000', ...b, limite: 2, effet_pct: 1000 },
      { cle: 'c-p0', nom: 'C p0', ...b, limite: 2, effet_pct: 0 },
      { cle: 'c-p1001', nom: 'C p1001', ...b, limite: 2, effet_pct: 1001 },
      { cle: 'c-pabs', nom: 'C pabs', ...b, limite: 2 },
      { cle: 'c-l0', nom: 'C l0', ...b, limite: 0, effet_pct: 50 },
      { cle: 'c-ldec', nom: 'C ldec', ...b, limite: 1.5, effet_pct: 50 },
    ] });
    const r = await importer(m, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'c-p0': 'effet_pct', 'c-p1001': 'effet_pct', 'c-pabs': 'effet_pct', 'c-l0': 'limite', 'c-ldec': 'limite' });
    assert.equal(r.json.natures.modifications.ajoutes, 4);
  });

  it('les quatre anciens codes sont un effet inconnu (champ effet) ; le reste du fichier passe', async () => {
    const m = await monde(false);
    const cat = catalogue('a-1', { modifications: [
      { cle: 'bon', nom: 'Bon', ...mod, effet: 'blindage_renforce', valeur: 1 },
      { cle: 'vieux-1', nom: 'Vieux 1', ...mod, effet: 'soutes_optimisees', effet_pct: 10 },
      { cle: 'vieux-2', nom: 'Vieux 2', ...el, effet: 'armure_par_classe' },
      { cle: 'vieux-3', nom: 'Vieux 3', ...mod, effet: 'montage_specialise', valeur: 1 },
      { cle: 'vieux-4', nom: 'Vieux 4', ...mod, effet: 'surcharge_arme', effet_pct: 50 },
      { cle: 'inconnu', nom: 'Inconnu', ...el, effet: 'teleportation' },
    ] });
    const r = await importer(m, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'vieux-1': 'effet', 'vieux-2': 'effet', 'vieux-3': 'effet', 'vieux-4': 'effet', inconnu: 'effet' });
    assert.equal(r.json.natures.modifications.ajoutes, 1);
    assert.equal(r.json.natures.armes.ajoutes, 6);
  });

  it('les champs sont créés, relus tels quels, puis inchangés au rejeu ; un fichier qui retire le paramètre modifie l’élément', async () => {
    const m = await monde(false);
    const lire = async (cle: string) => ((await m.antor('GET', `${m.V}/catalogue?nature=modifications`)).json.elements as Any[]).find((e) => e.cle === cle);
    const ok = await importer(m, catalogue('imp-1'));
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(ok.json.refusTotal, 0, ok.texte);
    assert.equal(ok.json.natures.modifications.ajoutes, 13);
    assert.equal((await lire('optimise-l')).donnees.effet, 'soutes_optimisees_livre');
    assert.equal((await lire('blindage-l')).donnees.effet, 'blindage_renforce');
    assert.equal((await lire('blindage-l')).donnees.valeur, 2);
    assert.equal((await lire('montage-laser-z')).donnees.effet, 'montages_specialises');
    assert.equal((await lire('surcharge-l')).donnees.effet, 'surcharge_cumulable');
    assert.equal((await lire('surcharge-l')).donnees.effet_pct, 50);
    assert.equal((await lire('surcharge-l')).donnees.limite, 3);
    const bis = await importer(m, catalogue('imp-2'));
    assert.equal(bis.status, 200, bis.texte);
    assert.equal(bis.json.refusTotal, 0);
    assert.equal(bis.json.natures.modifications.inchanges, 13);
    for (const n of ['coques', 'amenagements', 'armes', 'modifications']) {
      assert.equal(bis.json.natures[n].ajoutes, 0, n);
      assert.equal(bis.json.natures[n].modifies, 0, n);
    }
    const retire = await importer(m, catalogue('imp-3', { modifications: [{ cle: 'blindage-l', nom: 'Blindage L', ...mod, effet: 'blindage_renforce', valeur: 3 }] }));
    assert.equal(retire.json.natures.modifications.modifies, 1);
    assert.equal((await lire('blindage-l')).donnees.valeur, 3);
  });

  it('exclusion : une joueuse ne peut pas importer (403 ou 404), rien n’est écrit', async () => {
    const m = await monde(false);
    const r = await m.lea('POST', `${m.V}/catalogue/application`, catalogue('joueuse'));
    assert.ok(r.status === 403 || r.status === 404, `got ${r.status}`);
    const liste = (await m.antor('GET', `${m.V}/catalogue?nature=modifications`)).json.elements as Any[];
    assert.equal(liste.find((e) => e.cle === 'optimise-l'), undefined);
  });

  it('les fichiers d’essai du semis ne disent aucun des huit codes d’effet (les décomptes de retrait restent vrais)', () => {
    for (const f of ['catalogue-essai.json', 'catalogue-essai-univers.json']) {
      const texte = readFileSync(`src/outils/swn/exemples/${f}`, 'utf8');
      for (const k of ['soutes_optimisees', 'blindage_renforce', 'montages_specialises', 'surcharge_cumulable', 'armure_par_classe', 'montage_specialise', 'surcharge_arme']) assert.equal(texte.includes(k), false, `${f} states ${k}`);
    }
  });
});

describe('B-87 fiches de règles et texte de la conception', () => {
  const sheets = async (m: Monde): Promise<Record<string, string>> => {
    const g = await m.antor('POST', `${m.V}/fiches-regles`);
    assert.equal(g.status, 200, g.texte);
    const etat = (await m.antor('GET', `${m.V}/fiches-regles`)).json as Any[];
    const out: Record<string, string> = {};
    for (const e of etat) {
      const f = (await m.lea('GET', `/api/univers/${m.E}/fiches/${e.ficheId}`)).json;
      out[e.cle] = plat(f.sections.map((s: Any) => s.html).join(' '));
    }
    return out;
  };

  it('les quatre effets s’y lisent par leur libellé et leur règle en mots ; plus de colonne « Armure par classe »', async () => {
    const m = await monde();
    const t = (await sheets(m))['regles-modifications'];
    assert.match(t, /Soutes optimisées/);
    assert.match(t, /Réduit de 10 % la masse libre et double le fret/);
    assert.match(t, /Blindage renforcé/);
    assert.match(t, /Ajoute l.armure indiquée et la Réparation de l.ingénieur/);
    assert.match(t, /Montages spécialisés/);
    assert.match(t, /Prend la moitié, au moins 1, de la puissance et de la masse de l.arme visée/);
    assert.match(t, /Surcharge d.arme/);
    assert.match(t, /Augmente de 50 % la puissance de l.arme visée, autant de fois que l.installation est prise/);
    assert.doesNotMatch(t, /Armure par classe/);
  });

  it('un catalogue qui n’emploie aucun des quatre effets : aucun de leurs libellés dans les fiches de règles', async () => {
    const m = await monde(false);
    const t = (await sheets(m))['regles-modifications'];
    assert.doesNotMatch(t, /Soutes optimisées|Blindage renforcé|Montages spécialisés|Surcharge d.arme|Armure par classe/);
  });

  it('texte enregistré : la surcharge nomme l’arme visée « → Laser Z » ; relue, la conception rend la même puissance libre', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const choix = [armes('laser-z'), mods('surcharge-l', 2, vise('armes', 'laser-z'))];
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, sur('fregate-r', choix, { version: vue.version }));
    assert.equal(r.status, 200, r.texte);
    const t = plat((await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((x: Any) => x.titre === 'Caractéristiques').html);
    assert.match(t, /Surcharge L \(→ Laser Z\)/);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.resultat.puissanceLibre, 0);
  });
});

describe('Catalogue antérieur qui n’emploie aucun des quatre effets : même résultat qu’avant', () => {
  it('« Vent d’Orak » : 685 000 cr, 30 PV, CA 14, aucune alerte (catalogue du semis)', async () => {
    const m = await monde(false);
    const orak = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.equal(orak.resultat.prix, 685000);
    assert.equal(orak.resultat.pv, 30);
    assert.equal(orak.resultat.ca, 14);
    assert.deepEqual(orak.alertes, []);
  });

  it('le catalogue d’essai importé, sans les quatre effets, ne change ni le prix ni l’armure d’une coque nue (300 000 cr, armure 5)', async () => {
    const m = await monde();
    const r = await calc(m, sur('fregate-r', []));
    assert.equal(r.json.resultat.prix, 300000);
    assert.equal(r.json.resultat.armure, 5);
    assert.equal(r.json.resultat.masseLibre, 20);
    assert.equal(r.json.resultat.puissanceLibre, 20);
  });
});
