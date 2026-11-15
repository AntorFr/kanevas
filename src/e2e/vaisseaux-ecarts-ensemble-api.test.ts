// Feature-level black-box tests of kanevas-outils-format-vaisseaux-ecarts (B-85), HTTP level: real server in stub mode with the stub seed,
// real SQLite. Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (B-85, P-19 step 2), docs/ecrans.md (E-22,
// import refusals) and ARCHITECTURE.md Y-1 to Y-5 for what is delivered without a screen (import, calculation, rule sheets, saved text).
// The trial catalogue is written here, invented, absent from the seed. Every expected value is a literal calculated by hand.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player and author of « Étoile du soir »)
// Hulls (power 20, mass 20, factors 1): Frégate R class 2, cost 300 000, speed 3, armour 5 ; Frégate R3 class 3, cost 400 000, speed 3.
// B-85 (1) vitesse signée  nominal : bonus −2 → vitesse 1 ; +2 → 5 ; two units of −2 → 0 (one floor on the total)
//                bords     : −5 → 0 (floor) ; bonus 0 → 3 ; import −9 and 9 pass, −10 and 10 refused (champ bonus_vitesse)
//                échec     : "−2" (string), 1.5 refused ; exclusion : hull without speed stays null with a negative bonus
// B-85 (2) réparation à part nominal : Blindage (10 %, armure +2, reparation_min 2) → armure 7, +30 000 cr ; skill 1 → alert exact text ; skill 2, 3 → none
//                bords     : result { choisie: 1, min: 2 } ; two lines asking 2 and 3 with skill 2 → one alert (3) ; 20 passes, 0 and 21 refused
//                échec     : effect reparation_min AND field → refused (champ reparation_min)
//                exclusions: effect alone and field alone behave as before ; no line asks → reparation null
// B-85 (3) soute par classe nominal : [10,20,40,80] (soute 5 ignored): class 2 → 20, class 3 → 40 ; line « Soutes » in the saved text
//                bords     : doubling aimed at it → 40 ; [0,0,0,0] → soutes 0 (not null) ; soute 10 alone → 10 on every class
//                échec     : three numbers, 1 000 001, 1.5, −1 refused (champ soute_par_classe)
// B-85 (3) moteur système  nominal : cout 40 000 → ligne 36 000, prix 336 000, +3 power +1,5 mass given back
//                bords     : 12 345 → 11 110 ; 12 344 → 11 110 ; 100 % → ligne 0 ; 0 % and 101 % refused
//                exclusions: reduction on a fitting with no effect, or on a modification, refused (champ reduction_cout_pct)
// B-85 import    : each new field created then unchanged at replay ; a malformed field is refused with its champ and the rest passes ;
//                  the seed files state none of the new fields
// B-85 fiches de règles / texte : « Réparation min. », « Soute par classe » (10 / 20 / 40 / 80), « Réduction du coût » (10 %), « −2 » ; none when no row states them
// Ancien : a catalogue that states none gives the same result as before (Vent d'Orak 685 000 cr)
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

const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const mod = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };

const catalogue = (version = 'ecarts-1', surcharge: Any = {}): Any => ({
  catalogue: 'swn/vaisseaux', version,
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5 },
    { cle: 'fregate-r3', nom: 'Frégate R3', classe: 3, ...coque, cout: 400000, vitesse: 3, armure: 5 },
    { cle: 'sans-vitesse-r', nom: 'Sans vitesse R', classe: 2, ...coque, armure: 1 },
  ],
  defenses: [
    { cle: 'rotors-lourds', nom: 'Rotors lourds', ...el, bonus_vitesse: -2 },
    { cle: 'rotors-tres-lourds', nom: 'Rotors très lourds', ...el, bonus_vitesse: -5 },
    { cle: 'rotors-vifs', nom: 'Rotors vifs', ...el, bonus_vitesse: 2 },
    { cle: 'rotors-neutres', nom: 'Rotors neutres', ...el, bonus_vitesse: 0 },
  ],
  amenagements: [
    { cle: 'soute-r2', nom: 'Soute par classe', ...el, soute: 5, soute_par_classe: [10, 20, 40, 80] },
    { cle: 'soute-simple', nom: 'Soute simple', ...el, soute: 10 },
    { cle: 'soute-zero', nom: 'Soute nulle', ...el, soute_par_classe: [0, 0, 0, 0] },
    { cle: 'moteur-sys', nom: 'Moteur système réduit', ...mod, cout: 40000, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 10 },
    { cle: 'moteur-sys-plein', nom: 'Moteur système plein', ...mod, cout: 40000, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] },
    { cle: 'moteur-12345', nom: 'Moteur 12345', ...mod, cout: 12345, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 10 },
    { cle: 'moteur-12344', nom: 'Moteur 12344', ...mod, cout: 12344, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 10 },
    { cle: 'moteur-gratuit', nom: 'Moteur gratuit', ...mod, cout: 40000, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 100 },
  ],
  modifications: [
    { cle: 'blindage-r', nom: "Blindage d'essai", ...mod, cout_pct: 10, effet: 'armure', valeur: 2, reparation_min: 2 },
    { cle: 'blindage-seul', nom: 'Blindage seul', ...mod, cout_pct: 10, effet: 'armure', valeur: 2 },
    { cle: 'repar-effet', nom: 'Réparation par effet', ...mod, effet: 'reparation_min', valeur: 2 },
    { cle: 'repar-champ', nom: 'Réparation par champ', ...mod, reparation_min: 3 },
    { cle: 'repar-champ2', nom: 'Réparation par champ 2', ...mod, reparation_min: 2 },
    { cle: 'repar-vitesse', nom: 'Vitesse et réparation', ...mod, effet: 'vitesse', valeur: 1, reparation_min: 2 },
    { cle: 'cale', nom: "Cale d'essai", ...mod, limite: 1, effet: 'soutes_doublees' },
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
const calc = (m: Monde, corps: Any) => m.lea('POST', `${m.V}/calcul`, corps);
const plat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const ligne = (r: Rep, cle: string): Any => r.json.resultat.lignes.find((x: Any) => x.cle === cle);
const def = (cle: string, q = 1) => l('defenses', cle, q);
const mods = (cle: string, q = 1, plus: Any = {}) => l('modifications', cle, q, plus);
const amen = (cle: string, q = 1, plus: Any = {}) => l('amenagements', cle, q, plus);
const vitesse = async (m: Monde, coqueCle: string, choix: Any[]) => (await calc(m, { coque: coqueCle, choix })).json.resultat.vitesse;

describe('B-85 (1) bonus de vitesse signé', () => {
  it('bonus −2 sur la vitesse 3 → 1 ; +2 → 5 ; 0 → 3 ; sans choix → 3', async () => {
    const m = await monde();
    assert.equal(await vitesse(m, 'fregate-r', []), 3);
    assert.equal(await vitesse(m, 'fregate-r', [def('rotors-lourds')]), 1);
    assert.equal(await vitesse(m, 'fregate-r', [def('rotors-vifs')]), 5);
    assert.equal(await vitesse(m, 'fregate-r', [def('rotors-neutres')]), 3);
  });

  it('bords : −5 sur 3 → 0 (plancher) ; deux unités de −2 → 0 ; −2 et +2 ensemble → 3', async () => {
    const m = await monde();
    assert.equal(await vitesse(m, 'fregate-r', [def('rotors-tres-lourds')]), 0);
    assert.equal(await vitesse(m, 'fregate-r', [def('rotors-lourds', 2)]), 0);
    assert.equal(await vitesse(m, 'fregate-r', [def('rotors-lourds'), def('rotors-vifs')]), 3);
  });

  it('exclusion : une coque qui ne dit pas sa vitesse reste sans vitesse (null) avec un bonus négatif', async () => {
    const m = await monde();
    assert.equal(await vitesse(m, 'sans-vitesse-r', [def('rotors-lourds')]), null);
  });

  it('import : −9 et 9 passent, −10 et 10 sont refusés avec champ bonus_vitesse, le reste passe ; "−2" et 1,5 refusés', async () => {
    const m = await monde(false);
    const cat = catalogue('vit-1', { defenses: [
      { cle: 'd-moins9', nom: 'D −9', ...el, bonus_vitesse: -9 },
      { cle: 'd-plus9', nom: 'D 9', ...el, bonus_vitesse: 9 },
      { cle: 'd-moins10', nom: 'D −10', ...el, bonus_vitesse: -10 },
      { cle: 'd-plus10', nom: 'D 10', ...el, bonus_vitesse: 10 },
      { cle: 'd-chaine', nom: 'D chaîne', ...el, bonus_vitesse: '-2' },
      { cle: 'd-dec', nom: 'D décimal', ...el, bonus_vitesse: 1.5 },
      { cle: 'd-ok', nom: 'D ok', ...el },
    ] });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    const refus = Object.fromEntries((r.json.refus as Any[]).map((x) => [`${x.nature}/${x.cle}`, x.champ]));
    assert.deepEqual(refus, { 'defenses/d-moins10': 'bonus_vitesse', 'defenses/d-plus10': 'bonus_vitesse', 'defenses/d-chaine': 'bonus_vitesse', 'defenses/d-dec': 'bonus_vitesse' });
    assert.equal(r.json.natures.defenses.ajoutes, 3);
    const lues = (await m.antor('GET', `${m.V}/catalogue?nature=defenses`)).json.elements.filter((e: Any) => e.cle.startsWith('d-'));
    assert.equal(lues.find((e: Any) => e.cle === 'd-moins9').donnees.bonus_vitesse, -9);
    assert.equal(lues.find((e: Any) => e.cle === 'd-plus9').donnees.bonus_vitesse, 9);
  });
});

describe('B-85 (2) réparation minimale à part de l’effet', () => {
  const rep = (m: Monde, choix: Any[], reparation?: number) => calc(m, { coque: 'fregate-r', choix, ...(reparation === undefined ? {} : { reparation }) });
  const alertes = (r: Rep) => r.json.alertes.filter((a: Any) => a.code === 'reparation_insuffisante');

  it('Blindage à 10 % (armure +2) qui exige 2 : armure 7 et +30 000 cr comme avant ; compétence 1 → alerte au texte exact', async () => {
    const m = await monde();
    const r = await rep(m, [mods('blindage-r')], 1);
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.armure, 7);
    assert.equal(r.json.resultat.prix, 330000);
    assert.equal(ligne(r, 'blindage-r').cout, 30000);
    assert.deepEqual(alertes(r).map((a: Any) => [a.niveau, a.texte]), [['a_surveiller', "« Blindage d'essai » : réparation 2 au moins (1 choisie)."]]);
    assert.deepEqual(r.json.resultat.reparation, { choisie: 1, min: 2 });
  });

  it('exactement à la borne : compétence 2 et 3 → aucune alerte ; l’alerte ne bloque pas l’enregistrement', async () => {
    const m = await monde();
    assert.deepEqual(alertes(await rep(m, [mods('blindage-r')], 2)), []);
    assert.deepEqual(alertes(await rep(m, [mods('blindage-r')], 3)), []);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const s = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [mods('blindage-r')], reparation: 1, version: vue.version });
    assert.equal(s.status, 200, s.texte);
  });

  it('deux lignes qui exigent 2 (champ) et 3 (champ) avec la compétence 2 : une seule alerte, celle de 3 ; minimum 3', async () => {
    const m = await monde();
    const r = await rep(m, [mods('repar-champ2'), mods('repar-champ')], 2);
    assert.deepEqual(alertes(r).map((a: Any) => a.texte), ["« Réparation par champ » : réparation 3 au moins (2 choisie)."]);
    assert.deepEqual(r.json.resultat.reparation, { choisie: 2, min: 3 });
  });

  it('un effet réparation seul et le champ seul se lisent comme avant ; une vitesse +1 avec réparation 2 applique les deux', async () => {
    const m = await monde();
    const a = await rep(m, [mods('repar-effet')], 1);
    assert.deepEqual(alertes(a).map((x: Any) => x.texte), ["« Réparation par effet » : réparation 2 au moins (1 choisie)."]);
    const b = await rep(m, [mods('repar-champ')], 2);
    assert.equal(alertes(b).length, 1);
    const c = await rep(m, [mods('repar-vitesse')], 2);
    assert.equal(c.json.resultat.vitesse, 4);
    assert.deepEqual(alertes(c), []);
    const d = await rep(m, [mods('repar-vitesse')], 1);
    assert.equal(d.json.resultat.vitesse, 4);
    assert.equal(alertes(d).length, 1);
  });

  it('exclusion : aucune ligne n’exige de réparation et compétence 0 → reparation null ; un blindage sans réparation ne lève rien', async () => {
    const m = await monde();
    const r = await rep(m, [mods('blindage-seul')]);
    assert.equal(r.json.resultat.reparation, null);
    assert.deepEqual(alertes(r), []);
    assert.equal(r.json.resultat.armure, 7);
  });

  it('import : reparation_min 1 et 20 passent, 0, 21, 2,5, "2" refusés (champ reparation_min) ; effet ET champ refusé (champ reparation_min)', async () => {
    const m = await monde(false);
    const cat = catalogue('rep-1', { modifications: [
      { cle: 'r1', nom: 'R1', ...mod, reparation_min: 1 },
      { cle: 'r20', nom: 'R20', ...mod, reparation_min: 20 },
      { cle: 'r0', nom: 'R0', ...mod, reparation_min: 0 },
      { cle: 'r21', nom: 'R21', ...mod, reparation_min: 21 },
      { cle: 'rdec', nom: 'Rdec', ...mod, reparation_min: 2.5 },
      { cle: 'rstr', nom: 'Rstr', ...mod, reparation_min: '2' },
      { cle: 'double', nom: 'Double', ...mod, effet: 'reparation_min', valeur: 2, reparation_min: 2 },
    ] });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    const refus = Object.fromEntries((r.json.refus as Any[]).map((x) => [`${x.nature}/${x.cle}`, x.champ]));
    assert.deepEqual(refus, { 'modifications/r0': 'reparation_min', 'modifications/r21': 'reparation_min', 'modifications/rdec': 'reparation_min', 'modifications/rstr': 'reparation_min', 'modifications/double': 'reparation_min' });
    assert.equal(r.json.natures.modifications.ajoutes, 2);
  });
});

describe('B-85 (3) soute par classe de coque', () => {
  const soutes = (r: Rep) => r.json.resultat.soutes;

  it('[10, 20, 40, 80] (soute 5 ignorée) : classe 2 → 20, classe 3 → 40', async () => {
    const m = await monde();
    assert.equal(soutes(await calc(m, { coque: 'fregate-r', choix: [amen('soute-r2')] })), 20);
    assert.equal(soutes(await calc(m, { coque: 'fregate-r3', choix: [amen('soute-r2')] })), 40);
  });

  it('bords : doublement visé sur la classe 2 → 40 ; [0,0,0,0] → soutes 0 et non null ; soute 10 seule → 10 sur chaque classe ; rien → null', async () => {
    const m = await monde();
    const d = await calc(m, { coque: 'fregate-r', choix: [amen('soute-r2'), mods('cale', 1, { vise: { nature: 'amenagements', cle: 'soute-r2' } })] });
    assert.equal(d.status, 200, d.texte);
    assert.equal(soutes(d), 40);
    assert.deepEqual(d.json.alertes.filter((a: Any) => a.code === 'cible_invalide'), []);
    assert.equal(soutes(await calc(m, { coque: 'fregate-r', choix: [amen('soute-zero')] })), 0);
    assert.equal(soutes(await calc(m, { coque: 'fregate-r', choix: [amen('soute-simple')] })), 10);
    assert.equal(soutes(await calc(m, { coque: 'fregate-r3', choix: [amen('soute-simple')] })), 10);
    assert.equal(soutes(await calc(m, { coque: 'fregate-r', choix: [] })), null);
  });

  it('un doublement visant une soute par classe seule n’est pas refusé (« stating a cargo by either field ») ; sans visée, alerte bloquante', async () => {
    const m = await monde();
    const ok = await calc(m, { coque: 'fregate-r3', choix: [amen('soute-zero'), mods('cale', 1, { vise: { nature: 'amenagements', cle: 'soute-zero' } })] });
    assert.deepEqual(ok.json.alertes.filter((a: Any) => a.code === 'cible_invalide'), []);
    assert.equal(soutes(ok), 0);
    const sans = await calc(m, { coque: 'fregate-r', choix: [amen('soute-r2'), mods('cale')] });
    assert.deepEqual(sans.json.alertes.filter((a: Any) => a.code === 'cible_invalide').map((a: Any) => a.niveau), ['bloquante']);
  });

  it('import : trois nombres, 1 000 001, 1,5, −1, une chaîne, null refusés (champ soute_par_classe) ; 0 et 1 000 000 passent ; le reste passe', async () => {
    const m = await monde(false);
    const cat = catalogue('soute-1', { amenagements: [
      { cle: 's-ok', nom: 'S ok', ...el, soute_par_classe: [0, 1, 2, 1000000] },
      { cle: 's-trois', nom: 'S trois', ...el, soute_par_classe: [10, 20, 40] },
      { cle: 's-cinq', nom: 'S cinq', ...el, soute_par_classe: [10, 20, 40, 80, 1] },
      { cle: 's-haut', nom: 'S haut', ...el, soute_par_classe: [10, 20, 40, 1000001] },
      { cle: 's-dec', nom: 'S dec', ...el, soute_par_classe: [10, 20, 40, 1.5] },
      { cle: 's-neg', nom: 'S neg', ...el, soute_par_classe: [10, 20, 40, -1] },
      { cle: 's-chaine', nom: 'S chaîne', ...el, soute_par_classe: '10,20,40,80' },
      { cle: 's-null', nom: 'S null', ...el, soute_par_classe: null },
      { cle: 's-autre', nom: 'S autre', ...el, soute: 3 },
    ] });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    const refus = Object.fromEntries((r.json.refus as Any[]).map((x) => [x.cle, x.champ]));
    assert.deepEqual(refus, { 's-trois': 'soute_par_classe', 's-cinq': 'soute_par_classe', 's-haut': 'soute_par_classe', 's-dec': 'soute_par_classe', 's-neg': 'soute_par_classe', 's-chaine': 'soute_par_classe', 's-null': 'soute_par_classe' });
    assert.equal(r.json.natures.amenagements.ajoutes, 2);
  });
});

describe('B-85 (3) moteur système : réduction de coût en pourcentage', () => {
  const sys = (m: Monde, cle: string) => calc(m, { coque: 'fregate-r', choix: [amen(cle)] });

  it('coût 40 000 réduit de 10 % : ligne 36 000, prix 336 000, 3 de puissance et 1,5 de masse rendus ; sans réduction : 40 000 / 340 000', async () => {
    const m = await monde();
    const r = await sys(m, 'moteur-sys');
    assert.equal(r.status, 200, r.texte);
    assert.equal(ligne(r, 'moteur-sys').cout, 36000);
    assert.equal(r.json.resultat.prix, 336000);
    assert.equal(r.json.resultat.puissanceLibre, 23);
    assert.equal(r.json.resultat.masseLibre, 21.5);
    const p = await sys(m, 'moteur-sys-plein');
    assert.equal(p.json.resultat.prix, 340000);
    assert.equal(p.json.resultat.puissanceLibre, 23);
  });

  it('arrondi de la réduction, moitié vers le haut : 12 345 → réduction 1 235, ligne 11 110 ; 12 344 → réduction 1 234, ligne 11 110', async () => {
    const m = await monde();
    const a = await sys(m, 'moteur-12345');
    assert.equal(ligne(a, 'moteur-12345').cout, 11110);
    assert.equal(a.json.resultat.prix, 311110);
    const b = await sys(m, 'moteur-12344');
    assert.equal(ligne(b, 'moteur-12344').cout, 11110);
    assert.equal(b.json.resultat.prix, 311110);
  });

  it('bords : 100 % → ligne 0 ; la réduction entre dans le prix du texte enregistré « — 36 000 cr » ; entretien et chantier suivent le prix', async () => {
    const m = await monde();
    assert.equal(ligne(await sys(m, 'moteur-gratuit'), 'moteur-gratuit').cout, 0);
    assert.equal((await sys(m, 'moteur-gratuit')).json.resultat.prix, 300000);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const s = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [amen('moteur-sys')], version: vue.version });
    assert.equal(s.status, 200, s.texte);
    const t = plat((await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((x: Any) => x.titre === 'Caractéristiques').html);
    assert.match(t, /Moteur système réduit — 36 000 cr/);
    assert.match(t, /Prix 336 000 cr/);
  });

  it('import : 1 et 100 passent ; 0, 101, 10,5, "10" refusés ; hors moteur système (aménagement sans effet, modification) refusé ; champ reduction_cout_pct', async () => {
    const m = await monde(false);
    const mot = { ...mod, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] };
    const cat = catalogue('red-1', {
      amenagements: [
        { cle: 'm1', nom: 'M1', ...mot, reduction_cout_pct: 1 },
        { cle: 'm100', nom: 'M100', ...mot, reduction_cout_pct: 100 },
        { cle: 'm0', nom: 'M0', ...mot, reduction_cout_pct: 0 },
        { cle: 'm101', nom: 'M101', ...mot, reduction_cout_pct: 101 },
        { cle: 'mdec', nom: 'Mdec', ...mot, reduction_cout_pct: 10.5 },
        { cle: 'mstr', nom: 'Mstr', ...mot, reduction_cout_pct: '10' },
        { cle: 'a-sans-effet', nom: 'A sans effet', ...el, reduction_cout_pct: 10 },
      ],
      modifications: [
        { cle: 'mod-red', nom: 'Mod red', ...mod, reduction_cout_pct: 10 },
        { cle: 'mod-ok', nom: 'Mod ok', ...mod },
      ],
    });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    const refus = Object.fromEntries((r.json.refus as Any[]).map((x) => [x.cle, x.champ]));
    assert.deepEqual(refus, { m0: 'reduction_cout_pct', m101: 'reduction_cout_pct', mdec: 'reduction_cout_pct', mstr: 'reduction_cout_pct', 'a-sans-effet': 'reduction_cout_pct', 'mod-red': 'reduction_cout_pct' });
    assert.equal(r.json.natures.amenagements.ajoutes, 2);
    assert.equal(r.json.natures.modifications.ajoutes, 1);
  });
});

describe('B-85 import : champs créés, relus, inchangés au rejeu', () => {
  const lire = async (m: Monde, nature: string, cle: string) => (await m.antor('GET', `${m.V}/catalogue?nature=${nature}`)).json.elements.find((e: Any) => e.cle === cle);

  it('l’application crée les éléments, l’API relit chaque champ nouveau, le rejeu les trouve tous inchangés sans doublon', async () => {
    const m = await monde(false);
    const ok = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('imp-1'));
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(ok.json.refusTotal, 0);
    assert.equal(ok.json.natures.defenses.ajoutes, 4);
    assert.equal(ok.json.natures.modifications.ajoutes, 7);
    assert.equal(ok.json.natures.amenagements.ajoutes, 8);
    assert.equal((await lire(m, 'defenses', 'rotors-lourds')).donnees.bonus_vitesse, -2);
    assert.equal((await lire(m, 'modifications', 'blindage-r')).donnees.reparation_min, 2);
    assert.deepEqual((await lire(m, 'amenagements', 'soute-r2')).donnees.soute_par_classe, [10, 20, 40, 80]);
    assert.equal((await lire(m, 'amenagements', 'moteur-sys')).donnees.reduction_cout_pct, 10);
    const bis = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('imp-2'));
    assert.equal(bis.json.natures.defenses.inchanges, 4);
    assert.equal(bis.json.natures.modifications.inchanges, 7);
    assert.equal(bis.json.natures.amenagements.inchanges, 8);
    for (const n of ['defenses', 'modifications', 'amenagements']) {
      assert.equal(bis.json.natures[n].ajoutes, 0, n);
      assert.equal(bis.json.natures[n].modifies, 0, n);
    }
  });

  it('un fichier qui retire un champ au rejeu modifie l’élément (le champ disparaît)', async () => {
    const m = await monde();
    const r = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('imp-3', { amenagements: [{ cle: 'soute-r2', nom: 'Soute par classe', ...el, soute: 5 }] }));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.natures.amenagements.modifies, 1);
    const e = await lire(m, 'amenagements', 'soute-r2');
    assert.ok(e.donnees.soute_par_classe == null, 'soute_par_classe is gone');
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [amen('soute-r2')] })).json.resultat.soutes, 5);
  });

  it('un champ mal formé refuse seulement son élément, le reste du fichier passe', async () => {
    const m = await monde(false);
    const cat = catalogue('mix-1', { modifications: [
      { cle: 'bon', nom: 'Bon', ...mod, reparation_min: 3 },
      { cle: 'mauvais', nom: 'Mauvais', ...mod, reparation_min: 99 },
    ] });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.deepEqual((r.json.refus as Any[]).map((x) => [x.cle, x.champ]), [['mauvais', 'reparation_min']]);
    assert.equal(r.json.natures.coques.ajoutes, 3);
    assert.equal(r.json.natures.defenses.ajoutes, 4);
    assert.equal(await lire(m, 'modifications', 'mauvais'), undefined);
    assert.notEqual(await lire(m, 'modifications', 'bon'), undefined);
  });

  it('exclusion : une joueuse ne peut pas importer (403 ou 404), rien n’est écrit', async () => {
    const m = await monde(false);
    const r = await m.lea('POST', `${m.V}/catalogue/application`, catalogue('joueuse'));
    assert.ok(r.status === 403 || r.status === 404, `got ${r.status}`);
    assert.equal(await lire(m, 'defenses', 'rotors-lourds'), undefined);
  });

  it('les fichiers d’essai du semis ne disent aucun des champs nouveaux (les décomptes de retrait restent vrais) ni de bonus négatif', () => {
    for (const f of ['catalogue-essai.json', 'catalogue-essai-univers.json']) {
      const texte = readFileSync(`src/outils/swn/exemples/${f}`, 'utf8');
      for (const k of ['soute_par_classe', 'reduction_cout_pct', 'reparation_min']) assert.equal(texte.includes(`"${k}"`), false, `${f} states ${k}`);
      assert.doesNotMatch(texte, /"bonus_vitesse"\s*:\s*-/, f);
    }
  });
});

describe('B-85 fiches de règles et texte de la conception', () => {
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

  it('catalogue qui dit les champs : colonnes « Réparation min. », « Soute par classe » (10 / 20 / 40 / 80), « Réduction du coût » (10 %), bonus de vitesse « −2 » (U+2212)', async () => {
    const m = await monde();
    const s = await sheets(m);
    assert.match(s['regles-modifications'], /Réparation min\./);
    assert.match(s['regles-amenagements'], /Soute par classe/);
    assert.match(s['regles-amenagements'], /10 \/ 20 \/ 40 \/ 80/);
    assert.match(s['regles-amenagements'], /Réduction du coût/);
    assert.match(s['regles-amenagements'], /10 %/);
    assert.match(s['regles-defenses'], /−2/);
    assert.doesNotMatch(s['regles-defenses'], /\+2/);
  });

  it('catalogue qui ne dit rien de cela : aucune de ces colonnes dans les fiches de règles', async () => {
    const m = await monde(false);
    const s = await sheets(m);
    for (const k of ['regles-modifications', 'regles-amenagements', 'regles-defenses']) assert.doesNotMatch(s[k], /Réparation min\.|Soute par classe|Réduction du coût/, k);
  });

  it('texte enregistré : « Soutes 20 » pour la soute par classe de la classe 2', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [amen('soute-r2')], version: vue.version });
    assert.equal(r.status, 200, r.texte);
    const t = plat((await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((x: Any) => x.titre === 'Caractéristiques').html);
    assert.match(t, /Soutes 20/);
  });
});

describe('Catalogue antérieur sans ces champs : même résultat qu’avant', () => {
  it('« Vent d’Orak » : 685 000 cr, 30 PV, CA 14, aucune alerte, ni soutes ni réparation ; l’éclaireur armé donne 54 000 cr', async () => {
    const m = await monde(false);
    const orak = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.equal(orak.resultat.prix, 685000);
    assert.equal(orak.resultat.pv, 30);
    assert.equal(orak.resultat.ca, 14);
    assert.deepEqual(orak.alertes, []);
    assert.equal(orak.resultat.soutes ?? null, null);
    assert.equal(orak.resultat.reparation ?? null, null);
    const r = await calc(m, { coque: 'eclaireur', choix: [l('moteurs', 'moteur-1'), l('armes', 'laser'), l('defenses', 'blindage')] });
    const res = r.json.resultat;
    assert.deepEqual([res.prix, res.pv, res.ca, res.puissanceLibre, res.masseLibre, res.chantierJours, res.entretien, res.porteeSaut], [54000, 13, 15, 6, 4, 3, 2700, 10]);
    assert.deepEqual(r.json.alertes, []);
  });

  it('un élément antérieur (soute 10, bonus 2, modification à effet seul) se calcule comme avant, et un second import du même catalogue ne change rien', async () => {
    const m = await monde();
    const avant = await calc(m, { coque: 'fregate-r', choix: [amen('soute-simple'), def('rotors-vifs'), mods('blindage-seul')] });
    assert.equal(avant.json.resultat.soutes, 10);
    assert.equal(avant.json.resultat.vitesse, 5);
    assert.equal(avant.json.resultat.armure, 7);
    assert.equal(avant.json.resultat.prix, 300000 + 1000 + 1000 + 30000);
    assert.equal(avant.json.resultat.reparation, null);
    const bis = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('ecarts-2'));
    assert.equal(bis.status, 200, bis.texte);
    assert.deepEqual((await calc(m, { coque: 'fregate-r', choix: [amen('soute-simple'), def('rotors-vifs'), mods('blindage-seul')] })).json, avant.json);
  });
});
