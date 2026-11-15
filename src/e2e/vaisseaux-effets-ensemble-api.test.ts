// Feature-level black-box tests of kanevas-outils-format-vaisseaux-effets (B-83), HTTP level: real server in stub mode with the stub seed,
// real SQLite. Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (P-19 step 2), docs/ecrans.md (« What
// kanevas-outils-format-vaisseaux-effets builds of E-22 ») and, for what is delivered without a screen (import, calculation, stored
// skill), the contracts of ARCHITECTURE.md X-1 to X-5. The trial catalogue is written here, invented, absent from the seed.
// Every expected value is a literal calculated by hand; none is read back from the code under test.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player and author of « Vent d'Orak » and « Étoile du soir »)
// Hulls (all power 20, mass 20, factors 1): Frégate R class 2, cost 300 000, speed 3, armour 5 ; Mini R class 1 ; Croiseur R class 3 ;
// Cuirassé R class 4 ; Impaire R cost 333 335 ; Paire R cost 333 334 ; Demi R cost 350 050.
// B-83 pourcentage nominal : Blindage (10 %, armure +2) on Frégate R → prix 330 000, ligne 30 000, armure 7
//                 bords    : 333 335 × 10 % → 33 334 (half up) ; 333 334 → 33 333 ; 350 050 × 1 % = 3 500,5 → 3 501 ; 1 % and 1 000 % import, 0 and 1 001 refused
//                 exclusions : the percentage is not multiplied by the hull's cost factor ; a modification without percentage has no `cout` on its line
// B-83 vitesse/armure nominal : vitesse +2 → 5, −1 → 2 ; armure +2 → 7
//                 bords    : armure −9 on 5 → 0 (never negative) ; hull without speed → vitesse null ; two units double the effect
// B-83 échange    nominal  : 3 points puissance → masse (1 power for 0.5 mass) → puissance libre 17, masse libre 21,5, line echange −3 / +1,5
//                 bords    : 0 and points_max (5) pass ; 6 refused (champ points) ; −1, 2.5 refused ; masse → puissance reverses the signs
//                 exclusions : points on an element without échange refused ; points saved with the design and replayed
// B-83 soutes     nominal  : Cale d'essai aiming Soute d'essai (soute 10) → soutes 20 ; not aimed → soutes 10 and blocking alert, save 422
//                 bords    : target not in the design ; target that states no soute ; quantity 2 → 40 ; removing the target line raises the alert
//                 exclusions : vise on an element without a doubling refused ; no soute stated → soutes null
// B-83 magasins   nominal  : weapon (munitions 10 × 100 × 2 on class 2, cost 12 000): 14 000 ; 2 extra magazines 18 000 ; doubled magazines 24 000 and mass 4
// B-83 réparation nominal  : skill 1 against 2 → watch alert exact text, save works ; bords : 2 passes, 0 default raises, two lines ask 2 and 3 : skill 2 → one alert ;
//                 échec    : −1, 21, 2.5, "2" refused (champ reparation) ; 20 passes ; exclusions : no line asks, skill 0 → reparation null
// B-83 moteur système nominal : class 2 → +3 power, +1,5 mass ; bords : classes 1, 3, 4 → 2/1, 4/2, 5/2,5 ; échec/exclusion : two units → blocking alert
// B-83 import     nominal  : modifications stored and read back ; replay unchanged, no duplicate ; échec : unknown effect → champ effet and the rest passes ; missing points_max,
//                 limite, parameter that does not belong, formula field ; exclusions : the seed files state none of the new fields
// B-83 fiches de règles / E-9 : columns only when a row states the value ; « Soutes » row and aimed names in the saved text
// Ancien          : a catalogue that states none gives the same result as before (Vent d'Orak 685 000 cr)
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
/** A modification that costs nothing by itself, so that its line is its percentage alone. */
const mod = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const arme = { emport: 1, munitions: 10, cout_munition: 100, classe_min: 1, ...el, cout: 12000 };

/** The invented trial catalogue of the slice, as the dialog of E-20 would send it. */
const catalogue = (version = 'effets-1', surcharge: Any = {}): Any => ({
  catalogue: 'swn/vaisseaux', version,
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5 },
    { cle: 'mini-r', nom: 'Mini R', classe: 1, ...coque },
    { cle: 'croiseur-r', nom: 'Croiseur R', classe: 3, ...coque },
    { cle: 'cuirasse-r', nom: 'Cuirassé R', classe: 4, ...coque },
    { cle: 'impaire-r', nom: 'Impaire R', classe: 2, ...coque, cout: 333335 },
    { cle: 'paire-r', nom: 'Paire R', classe: 2, ...coque, cout: 333334 },
    { cle: 'demi-r', nom: 'Demi R', classe: 2, ...coque, cout: 350050 },
    { cle: 'facteur-r', nom: 'Facteur R', classe: 2, ...coque, facteur_cout: 5 },
    { cle: 'sans-vitesse-r', nom: 'Sans vitesse R', classe: 2, ...coque, armure: 1 },
  ],
  amenagements: [
    { cle: 'soute-r', nom: "Soute d'essai", ...el, soute: 10 },
    { cle: 'libre', nom: "Libre d'essai", ...el },
    { cle: 'moteur-sys', nom: "Moteur système d'essai", ...mod, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] },
    { cle: 'moteur-sys-bis', nom: "Moteur système bis d'essai", ...mod, effet: 'moteur_systeme', rend_puissance: [1, 1, 1, 1], rend_masse: [0, 0, 0, 0] },
  ],
  armes: [{ cle: 'arme-r', nom: 'Arme R', ...arme }],
  modifications: [
    { cle: 'blindage', nom: "Blindage d'essai", ...mod, cout_pct: 10, effet: 'armure', valeur: 2 },
    { cle: 'plomb', nom: "Plomb d'essai", ...mod, effet: 'armure', valeur: -9 },
    { cle: 'rapide', nom: "Rapide d'essai", ...mod, effet: 'vitesse', valeur: 2 },
    { cle: 'lent', nom: "Lent d'essai", ...mod, effet: 'vitesse', valeur: -1 },
    { cle: 'pct1', nom: "Pour cent d'essai", ...mod, cout_pct: 1 },
    { cle: 'pct5', nom: "Cinq pour cent d'essai", ...mod, cout_pct: 5, effet: 'vitesse', valeur: 1 },
    { cle: 'sans-pct', nom: "Sans pourcentage d'essai", ...el },
    { cle: 'reacteur', nom: "Réacteur d'essai", ...mod, limite: 1, effet: 'echange', points_max: 5, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5 },
    { cle: 'inverse', nom: "Inverse d'essai", ...mod, limite: 1, effet: 'echange', points_max: 4, sens: 'masse_vers_puissance', echange_puissance: 2, echange_masse: 1 },
    { cle: 'cale', nom: "Cale d'essai", ...mod, limite: 1, effet: 'soutes_doublees' },
    { cle: 'munitions-x', nom: "Munitions d'essai", ...mod, limite: 1, effet: 'magasins_doubles' },
    { cle: 'repar2', nom: "Réparation d'essai", ...mod, effet: 'reparation_min', valeur: 2 },
    { cle: 'repar3', nom: "Réparation lourde d'essai", ...mod, effet: 'reparation_min', valeur: 3 },
  ],
  ...surcharge,
});

interface Monde { E: number; V: string; antor: Client; lea: Client; teo: Client; orak: number; etoile: number }

async function monde(importer = true, cat: Any = catalogue()): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const antor = await session(srv.base, 'antor');
  const lea = await session(srv.base, 'lea');
  const teo = await session(srv.base, 'teo');
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  if (importer) {
    const r = await antor('POST', `${V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.refusTotal, 0, r.texte);
  }
  const liste = (await antor('GET', `${V}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  return { E, V, antor, lea, teo, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir') };
}

const l = (nature: string, cle: string, quantite = 1, plus: Any = {}) => ({ nature, cle, quantite, ...plus });
const calc = (m: Monde, corps: Any) => m.lea('POST', `${m.V}/calcul`, corps);
const codes = (r: Rep): string[] => r.json.alertes.map((a: Any) => a.code);
const plat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const ligne = (r: Rep, cle: string): Any => r.json.resultat.lignes.find((x: Any) => x.cle === cle);
const mods = (cle: string, q = 1, plus: Any = {}) => l('modifications', cle, q, plus);

describe('B-83 coût en pourcentage de la coque', () => {
  it('Blindage à 10 % sur la Frégate R (300 000) : prix 330 000, ligne 30 000, armure 7', async () => {
    const m = await monde();
    const base = await calc(m, { coque: 'fregate-r', choix: [] });
    assert.equal(base.json.resultat.prix, 300000);
    assert.equal(base.json.resultat.armure, 5);
    const r = await calc(m, { coque: 'fregate-r', choix: [mods('blindage')] });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.prix, 330000);
    assert.equal(ligne(r, 'blindage').cout, 30000);
    assert.equal(r.json.resultat.armure, 7);
  });

  it('arrondi au crédit, moitié vers le haut : 333 335 × 10 % → 33 334 ; 333 334 → 33 333 ; 350 050 × 1 % = 3 500,5 → 3 501', async () => {
    const m = await monde();
    const a = await calc(m, { coque: 'impaire-r', choix: [mods('blindage')] });
    assert.equal(ligne(a, 'blindage').cout, 33334);
    assert.equal(a.json.resultat.prix, 333335 + 33334);
    const b = await calc(m, { coque: 'paire-r', choix: [mods('blindage')] });
    assert.equal(ligne(b, 'blindage').cout, 33333);
    assert.equal(b.json.resultat.prix, 333334 + 33333);
    const c = await calc(m, { coque: 'demi-r', choix: [mods('pct1')] });
    assert.equal(ligne(c, 'pct1').cout, 3501);
    assert.equal(c.json.resultat.prix, 350050 + 3501);
  });

  it('exclusion : le pourcentage n’est jamais multiplié par le facteur de coût de la coque (facteur 5 : 30 000 quand même)', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'facteur-r', choix: [mods('blindage')] });
    assert.equal(ligne(r, 'blindage').cout, 30000);
    assert.equal(r.json.resultat.prix, 330000);
  });

  it('exclusion : une modification sans pourcentage ne porte pas de coût de ligne ; une modification à 0 de coût propre ajoute exactement le pourcentage', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'fregate-r', choix: [mods('sans-pct'), mods('pct5')] });
    assert.equal(ligne(r, 'sans-pct').cout, undefined);
    assert.equal(r.json.resultat.prix, 300000 + 1000 + 15000);
    assert.equal(ligne(r, 'pct5').cout, 15000);
  });
});

describe('B-83 effets de vitesse et d’armure', () => {
  it('vitesse +2 sur 3 → 5 ; −1 → 2 ; les deux ensemble → 4', async () => {
    const m = await monde();
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [mods('rapide')] })).json.resultat.vitesse, 5);
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [mods('lent')] })).json.resultat.vitesse, 2);
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [mods('rapide'), mods('lent')] })).json.resultat.vitesse, 4);
  });

  it('bords : armure −9 sur 5 → 0 (jamais négative) ; vitesse sur une coque qui n’en dit pas → null ; deux unités +2 → armure 9', async () => {
    const m = await monde();
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [mods('plomb')] })).json.resultat.armure, 0);
    const sv = await calc(m, { coque: 'sans-vitesse-r', choix: [mods('rapide')] });
    assert.equal(sv.json.resultat.vitesse, null);
    assert.equal(sv.json.resultat.armure, 1);
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [mods('blindage', 2)] })).json.resultat.armure, 9);
  });
});

describe('B-83 échange de points entre puissance et masse', () => {
  it('3 points puissance → masse (1 pour 0,5) : puissance libre 17, masse libre 21,5, ligne −3 / +1,5', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'fregate-r', choix: [mods('reacteur', 1, { points: 3 })] });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.puissanceLibre, 17);
    assert.equal(r.json.resultat.masseLibre, 21.5);
    assert.deepEqual(ligne(r, 'reacteur').echange, { puissance: -3, masse: 1.5 });
    assert.equal(ligne(r, 'reacteur').points, 3);
  });

  it('bords : 0 point ne change rien ; 5 (le maximum) passe : 15 / 22,5 ; 6 est refusé au maximum exact (400, champ points) ; −1, 2,5 et "3" aussi (400)', async () => {
    const m = await monde();
    const zero = await calc(m, { coque: 'fregate-r', choix: [mods('reacteur', 1, { points: 0 })] });
    assert.equal(zero.status, 200, zero.texte);
    assert.equal(zero.json.resultat.puissanceLibre, 20);
    assert.equal(zero.json.resultat.masseLibre, 20);
    const sans = await calc(m, { coque: 'fregate-r', choix: [mods('reacteur')] });
    assert.equal(sans.json.resultat.puissanceLibre, 20, 'default is 0 point');
    const max = await calc(m, { coque: 'fregate-r', choix: [mods('reacteur', 1, { points: 5 })] });
    assert.equal(max.status, 200, max.texte);
    assert.equal(max.json.resultat.puissanceLibre, 15);
    assert.equal(max.json.resultat.masseLibre, 22.5);
    const six = await calc(m, { coque: 'fregate-r', choix: [mods('reacteur', 1, { points: 6 })] });
    assert.equal(six.status, 400, six.texte);
    assert.equal(six.json.champ, 'points');
    for (const p of [-1, 2.5, '3']) {
      const r = await calc(m, { coque: 'fregate-r', choix: [mods('reacteur', 1, { points: p })] });
      assert.equal(r.status, 400, `${JSON.stringify(p)} ${r.texte}`);
    }
  });

  it('sens inverse (masse → puissance, 2 puissance pour 1 masse, maximum 4) : 3 points → puissance libre 26, masse libre 17 ; 5 refusé', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'fregate-r', choix: [mods('inverse', 1, { points: 3 })] });
    assert.equal(r.json.resultat.puissanceLibre, 26);
    assert.equal(r.json.resultat.masseLibre, 17);
    assert.deepEqual(ligne(r, 'inverse').echange, { puissance: 6, masse: -3 });
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [mods('inverse', 1, { points: 4 })] })).status, 200);
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [mods('inverse', 1, { points: 5 })] })).status, 400);
  });

  it('exclusion : des points sur un élément qui n’échange rien sont refusés (400, champ points)', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'fregate-r', choix: [mods('blindage', 1, { points: 1 })] });
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.champ, 'points');
  });

  it('les points sont enregistrés avec la conception et rejoués : relue, la conception donne 17 / 21,5', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [mods('reacteur', 1, { points: 3 })], version: vue.version });
    assert.equal(r.status, 200, r.texte);
    const relu = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.equal(relu.resultat.puissanceLibre, 17);
    assert.equal(relu.resultat.masseLibre, 21.5);
    assert.equal(relu.resultat.lignes.find((x: Any) => x.cle === 'reacteur').points, 3);
  });
});

describe('B-83 soutes doublées : un élément visé', () => {
  const soutes = (r: Rep) => r.json.resultat.soutes;
  const vise = (nature: string, cle: string) => ({ vise: { nature, cle } });

  it('Cale d’essai visant la Soute d’essai (soute 10) : soutes 20 ; sans visée : soutes 10 et alerte bloquante exacte', async () => {
    const m = await monde();
    const ok = await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), mods('cale', 1, vise('amenagements', 'soute-r'))] });
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(soutes(ok), 20);
    assert.deepEqual(ok.json.alertes.filter((a: Any) => a.code === 'cible_invalide'), []);
    assert.deepEqual(ligne(ok, 'cale').vise, { nature: 'amenagements', cle: 'soute-r' });
    const sans = await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), mods('cale')] });
    assert.equal(soutes(sans), 10);
    assert.deepEqual(sans.json.alertes.filter((a: Any) => a.code === 'cible_invalide'), [{ niveau: 'bloquante', code: 'cible_invalide', texte: "« Cale d'essai » : choisissez l'élément visé.", ligne: 1 }]);
  });

  it('une conception avec une visée manquante ne s’enregistre pas (422, rien d’écrit) ; avec la visée elle s’enregistre', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const refus = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), mods('cale')], version: vue.version });
    assert.equal(refus.status, 422, refus.texte);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.version, vue.version);
    const ok = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), mods('cale', 1, vise('amenagements', 'soute-r'))], version: vue.version });
    assert.equal(ok.status, 200, ok.texte);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.resultat.soutes, 20);
  });

  it('visée hors de la conception : « l’élément visé n’est pas dans cette conception. » ; visée sur un aménagement sans soute : « cet élément ne peut pas être visé. »', async () => {
    const m = await monde();
    const dehors = await calc(m, { coque: 'fregate-r', choix: [mods('cale', 1, vise('amenagements', 'soute-r'))] });
    assert.deepEqual(dehors.json.alertes.filter((a: Any) => a.code === 'cible_invalide').map((a: Any) => a.texte), ["« Cale d'essai » : l'élément visé n'est pas dans cette conception."]);
    assert.equal(soutes(dehors), null);
    const libre = await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'libre'), mods('cale', 1, vise('amenagements', 'libre'))] });
    assert.deepEqual(libre.json.alertes.filter((a: Any) => a.code === 'cible_invalide').map((a: Any) => a.texte), ["« Cale d'essai » : cet élément ne peut pas être visé."]);
  });

  it('bords : deux unités de soute (20) doublées → 40 ; aucune soute dite → soutes null', async () => {
    const m = await monde();
    const deux = await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r', 2), mods('cale', 1, vise('amenagements', 'soute-r'))] });
    assert.equal(soutes(deux), 40);
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r', 2)] })).json.resultat.soutes, 20);
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'libre')] })).json.resultat.soutes, null);
  });

  it('exclusion : une visée sur un élément sans doublement est refusée (400, champ vise)', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), mods('blindage', 1, vise('amenagements', 'soute-r'))] });
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.champ, 'vise');
  });
});

describe('B-83 magasins doublés', () => {
  const armeMag = (magasins?: number) => l('armes', 'arme-r', 1, magasins === undefined ? {} : { magasins });
  it('arme sans magasin en plus : 12 000 + 2 000 de munitions (10 × 100 × 2 en classe 2) ; avec 2 magasins : 6 000 de munitions → prix 318 000 ; magasins doublés : 12 000 → 324 000, masse libre 15', async () => {
    const m = await monde();
    const sans = await calc(m, { coque: 'fregate-r', choix: [armeMag()] });
    assert.equal(sans.json.resultat.prix, 300000 + 12000 + 2000);
    const deux = await calc(m, { coque: 'fregate-r', choix: [armeMag(2)] });
    assert.equal(deux.json.resultat.prix, 300000 + 12000 + 6000);
    assert.equal(deux.json.resultat.masseLibre, 20 - 1 - 2);
    const dbl = await calc(m, { coque: 'fregate-r', choix: [armeMag(2), mods('munitions-x', 1, { vise: { nature: 'armes', cle: 'arme-r' } })] });
    assert.equal(dbl.status, 200, dbl.texte);
    assert.equal(dbl.json.resultat.prix, 300000 + 12000 + 12000);
    assert.equal(dbl.json.resultat.masseLibre, 20 - 1 - 4);
  });

  it('sans arme visée : alerte bloquante « choisissez l’élément visé »', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'fregate-r', choix: [armeMag(1), mods('munitions-x')] });
    assert.deepEqual(r.json.alertes.filter((a: Any) => a.code === 'cible_invalide').map((a: Any) => a.texte), ["« Munitions d'essai » : choisissez l'élément visé."]);
  });
});

describe('B-83 compétence de réparation', () => {
  const rep = async (m: Monde, choix: Any[], reparation?: unknown) => calc(m, { coque: 'fregate-r', choix, ...(reparation === undefined ? {} : { reparation }) });
  const alertes = (r: Rep) => r.json.alertes.filter((a: Any) => a.code === 'reparation_insuffisante');

  it('compétence 1 contre 2 : alerte à surveiller au texte exact ; 2 : plus d’alerte (exactement à la borne)', async () => {
    const m = await monde();
    assert.deepEqual(alertes(await rep(m, [mods('repar2')], 1)).map((a: Any) => [a.niveau, a.texte]), [['a_surveiller', "« Réparation d'essai » : réparation 2 au moins (1 choisie)."]]);
    assert.deepEqual(alertes(await rep(m, [mods('repar2')], 2)), []);
    assert.deepEqual(alertes(await rep(m, [mods('repar2')], 3)), []);
  });

  it('0 par défaut : l’alerte dit « 0 choisie » ; deux lignes qui demandent 2 et 3 avec la compétence 2 : une seule alerte, celle de 3', async () => {
    const m = await monde();
    assert.deepEqual(alertes(await rep(m, [mods('repar2')])).map((a: Any) => a.texte), ["« Réparation d'essai » : réparation 2 au moins (0 choisie)."]);
    assert.deepEqual(alertes(await rep(m, [mods('repar2'), mods('repar3')], 2)).map((a: Any) => a.texte), ["« Réparation lourde d'essai » : réparation 3 au moins (2 choisie)."]);
  });

  it('le résultat dit la compétence choisie et le minimum le plus haut ; null quand rien ne la demande et que la compétence est 0', async () => {
    const m = await monde();
    assert.deepEqual((await rep(m, [mods('repar2'), mods('repar3')], 2)).json.resultat.reparation, { choisie: 2, min: 3 });
    assert.equal((await rep(m, [mods('blindage')])).json.resultat.reparation, null);
  });

  it('l’alerte n’empêche pas d’enregistrer ; la compétence est enregistrée avec la conception (0 par défaut) et relue', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [mods('repar2')], reparation: 1, version: vue.version });
    assert.equal(r.status, 200, r.texte);
    const relu = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.deepEqual(relu.resultat.reparation, { choisie: 1, min: 2 });
    assert.ok(relu.alertes.some((a: Any) => a.code === 'reparation_insuffisante'));
    const v2 = relu.version;
    const sans = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [mods('repar2')], version: v2 });
    assert.equal(sans.status, 200, sans.texte);
    assert.deepEqual((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.resultat.reparation, { choisie: 0, min: 2 });
  });

  it('échec : −1, 21, 2,5 et "2" refusés (400, champ reparation) ; 0 et 20 passent ; un enregistrement refusé n’écrit rien', async () => {
    const m = await monde();
    for (const v of [-1, 21, 2.5, '2']) {
      const r = await rep(m, [mods('repar2')], v);
      assert.equal(r.status, 400, `${JSON.stringify(v)} ${r.texte}`);
      assert.equal(r.json.champ, 'reparation');
    }
    assert.equal((await rep(m, [mods('repar2')], 0)).status, 200);
    assert.equal((await rep(m, [mods('repar2')], 20)).status, 200);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const refus = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [], reparation: 21, version: vue.version });
    assert.equal(refus.status, 400, refus.texte);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.version, vue.version);
  });
});

describe('B-83 moteur système', () => {
  const sys = async (m: Monde, coque: string) => (await calc(m, { coque, choix: [l('amenagements', 'moteur-sys')] })).json.resultat;
  it('sur la coque de classe 2 : rend 3 de puissance et 1,5 de masse (23 / 21,5)', async () => {
    const m = await monde();
    const r = await sys(m, 'fregate-r');
    assert.equal(r.puissanceLibre, 23);
    assert.equal(r.masseLibre, 21.5);
  });

  it('une valeur par classe : 1 → 22 / 21 ; 3 → 24 / 22 ; 4 → 25 / 22,5', async () => {
    const m = await monde();
    const a = await sys(m, 'mini-r');
    assert.deepEqual([a.puissanceLibre, a.masseLibre], [22, 21]);
    const c = await sys(m, 'croiseur-r');
    assert.deepEqual([c.puissanceLibre, c.masseLibre], [24, 22]);
    const d = await sys(m, 'cuirasse-r');
    assert.deepEqual([d.puissanceLibre, d.masseLibre], [25, 22.5]);
  });

  it('exclusion : un second moteur système (deux lignes ou deux unités) lève « Un seul moteur système par vaisseau. » (bloquante), l’enregistrement est refusé', async () => {
    const m = await monde();
    const unites = await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-sys', 2)] });
    assert.deepEqual(unites.json.alertes.filter((a: Any) => a.code === 'moteur_systeme_multiple').map((a: Any) => [a.niveau, a.texte]), [['bloquante', 'Un seul moteur système par vaisseau.']]);
    const lignes = await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-sys'), l('amenagements', 'moteur-sys-bis')] });
    assert.deepEqual(codes(lignes).filter((c) => c === 'moteur_systeme_multiple'), ['moteur_systeme_multiple']);
    const un = await calc(m, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-sys')] });
    assert.deepEqual(codes(un).filter((c) => c === 'moteur_systeme_multiple'), []);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-sys', 2)], version: vue.version });
    assert.equal(r.status, 422, r.texte);
  });
});

describe('B-83 import : champs stockés, refus par champ, rejeu sans doublon', () => {
  const V = (m: Monde, chemin: string) => `${m.V}${chemin}`;
  const modif = (m: Monde, cle: string) => m.antor('GET', V(m, '/catalogue?nature=modifications')).then((x) => x.json.elements.find((e: Any) => e.cle === cle));

  it('l’application crée 13 modifications et 4 aménagements ; l’API relit les champs ; le rejeu les trouve inchangés et ne crée aucun doublon', async () => {
    const m = await monde(false);
    const avant = (await m.antor('GET', V(m, '/catalogue?nature=modifications'))).json.elements.length;
    const ap = await m.antor('POST', V(m, '/catalogue/apercu'), catalogue('imp-1'));
    assert.equal(ap.json.natures.modifications.ajoutes, 13);
    assert.equal((await m.antor('GET', V(m, '/catalogue?nature=modifications'))).json.elements.length, avant, 'preview writes nothing');
    const ok = await m.antor('POST', V(m, '/catalogue/application'), catalogue('imp-1'));
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(ok.json.refusTotal, 0);
    assert.equal(ok.json.natures.modifications.ajoutes, 13);
    const b = (await modif(m, 'blindage')).donnees;
    assert.deepEqual([b.cout_pct, b.effet, b.valeur], [10, 'armure', 2]);
    const r = (await modif(m, 'reacteur')).donnees;
    assert.deepEqual([r.effet, r.points_max, r.sens, r.echange_puissance, r.echange_masse], ['echange', 5, 'puissance_vers_masse', 1, 0.5]);
    const bis = await m.antor('POST', V(m, '/catalogue/application'), catalogue('imp-2'));
    assert.equal(bis.json.natures.modifications.inchanges, 13);
    assert.equal(bis.json.natures.modifications.ajoutes, 0);
    assert.equal(bis.json.natures.modifications.modifies, 0);
    assert.equal(bis.json.natures.amenagements.inchanges, 4);
    assert.equal((await m.antor('GET', V(m, '/catalogue?nature=modifications'))).json.elements.length, avant + 13, 'no duplicate');
  });

  it('un effet inconnu est refusé avec champ effet, le reste du fichier passe', async () => {
    const m = await monde(false);
    const cat = catalogue('inconnu-1', { modifications: [
      { cle: 'ok-m', nom: 'OK M', ...mod, cout_pct: 10, effet: 'armure', valeur: 1 },
      { cle: 'tele', nom: 'Tele', ...mod, effet: 'teleportation', valeur: 1 },
      { cle: 'tele-sys', nom: 'Tele sys', ...mod, effet: 'moteur_systeme' },
      { cle: 'ok-m2', nom: 'OK M2', ...mod, effet: 'vitesse', valeur: 1 },
    ] });
    const r = await m.antor('POST', V(m, '/catalogue/application'), cat);
    assert.equal(r.status, 200, r.texte);
    const refus = Object.fromEntries((r.json.refus as Any[]).map((x) => [`${x.nature}/${x.cle}`, x.champ]));
    assert.deepEqual(refus, { 'modifications/tele': 'effet', 'modifications/tele-sys': 'effet' });
    assert.equal(r.json.natures.modifications.ajoutes, 2);
    assert.equal(await modif(m, 'tele'), undefined);
    assert.notEqual(await modif(m, 'ok-m2'), undefined);
    assert.equal(r.json.natures.coques.ajoutes, 9, 'the other natures of the file pass');
  });

  it('chaque paramètre mal formé est refusé avec son champ ; les bornes exactes passent (1 % et 1 000 %, −9 et 9, points_max 1 et 99)', async () => {
    const m = await monde(false);
    const cat = catalogue('champs-1', { modifications: [
      { cle: 'pct0', nom: 'Pct0', ...mod, cout_pct: 0 },
      { cle: 'pct1001', nom: 'Pct1001', ...mod, cout_pct: 1001 },
      { cle: 'pct-frac', nom: 'PctFrac', ...mod, cout_pct: 2.5 },
      { cle: 'pct-min', nom: 'PctMin', ...mod, cout_pct: 1 },
      { cle: 'pct-max', nom: 'PctMax', ...mod, cout_pct: 1000 },
      { cle: 'val0', nom: 'Val0', ...mod, effet: 'armure', valeur: 0 },
      { cle: 'val10', nom: 'Val10', ...mod, effet: 'vitesse', valeur: 10 },
      { cle: 'val-10', nom: 'Val-10', ...mod, effet: 'vitesse', valeur: -10 },
      { cle: 'val-sans', nom: 'ValSans', ...mod, effet: 'armure' },
      { cle: 'val-9', nom: 'Val-9', ...mod, effet: 'armure', valeur: -9 },
      { cle: 'val9', nom: 'Val9', ...mod, effet: 'armure', valeur: 9 },
      { cle: 'rep0', nom: 'Rep0', ...mod, effet: 'reparation_min', valeur: 0 },
      { cle: 'rep21', nom: 'Rep21', ...mod, effet: 'reparation_min', valeur: 21 },
      { cle: 'rep20', nom: 'Rep20', ...mod, effet: 'reparation_min', valeur: 20 },
      { cle: 'ech-sans-max', nom: 'EchSansMax', ...mod, limite: 1, effet: 'echange', sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5 },
      { cle: 'ech-max0', nom: 'EchMax0', ...mod, limite: 1, effet: 'echange', points_max: 0, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5 },
      { cle: 'ech-max100', nom: 'EchMax100', ...mod, limite: 1, effet: 'echange', points_max: 100, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5 },
      { cle: 'ech-max99', nom: 'EchMax99', ...mod, limite: 1, effet: 'echange', points_max: 99, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5 },
      { cle: 'ech-sens', nom: 'EchSens', ...mod, limite: 1, effet: 'echange', points_max: 3, sens: 'vers_le_haut', echange_puissance: 1, echange_masse: 0.5 },
      { cle: 'ech-masse', nom: 'EchMasse', ...mod, limite: 1, effet: 'echange', points_max: 3, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.3 },
      { cle: 'ech-limite', nom: 'EchLimite', ...mod, limite: 0, effet: 'echange', points_max: 3, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5 },
      { cle: 'dbl-limite', nom: 'DblLimite', ...mod, limite: 0, effet: 'soutes_doublees' },
      { cle: 'hors-effet', nom: 'HorsEffet', ...mod, effet: 'vitesse', valeur: 1, points_max: 3 },
      { cle: 'sans-effet', nom: 'SansEffet', ...mod, valeur: 1 },
    ], amenagements: [
      { cle: 'sys3', nom: 'Sys3', ...mod, effet: 'moteur_systeme', rend_puissance: [1, 2, 3], rend_masse: [0, 0, 0, 0] },
      { cle: 'sys-masse', nom: 'SysMasse', ...mod, effet: 'moteur_systeme', rend_puissance: [1, 2, 3, 4], rend_masse: [0, 0.3, 0, 0] },
      { cle: 'sys-sans', nom: 'SysSans', ...mod, effet: 'moteur_systeme', rend_puissance: [1, 2, 3, 4] },
      { cle: 'sys-ok', nom: 'SysOk', ...mod, effet: 'moteur_systeme', rend_puissance: [0, 0, 0, 0], rend_masse: [0, 0.5, 0, 0] },
      { cle: 'soute-neg', nom: 'SouteNeg', ...el, soute: -1 },
      { cle: 'soute-max', nom: 'SouteMax', ...el, soute: 1000000 },
      { cle: 'soute-trop', nom: 'SouteTrop', ...el, soute: 1000001 },
      { cle: 'am-vitesse', nom: 'AmVitesse', ...mod, effet: 'vitesse' },
    ] });
    const r = await m.antor('POST', V(m, '/catalogue/application'), cat);
    assert.equal(r.status, 200, r.texte);
    const refus = Object.fromEntries((r.json.refus as Any[]).map((x) => [`${x.nature}/${x.cle}`, x.champ]));
    assert.deepEqual(refus, {
      'modifications/pct0': 'cout_pct', 'modifications/pct1001': 'cout_pct', 'modifications/pct-frac': 'cout_pct',
      'modifications/val0': 'valeur', 'modifications/val10': 'valeur', 'modifications/val-10': 'valeur', 'modifications/val-sans': 'valeur',
      'modifications/rep0': 'valeur', 'modifications/rep21': 'valeur',
      'modifications/ech-sans-max': 'points_max', 'modifications/ech-max0': 'points_max', 'modifications/ech-max100': 'points_max',
      'modifications/ech-sens': 'sens', 'modifications/ech-masse': 'echange_masse', 'modifications/ech-limite': 'limite', 'modifications/dbl-limite': 'limite',
      'modifications/hors-effet': 'points_max', 'modifications/sans-effet': 'valeur',
      'amenagements/sys3': 'rend_puissance', 'amenagements/sys-masse': 'rend_masse', 'amenagements/sys-sans': 'rend_masse',
      'amenagements/soute-neg': 'soute', 'amenagements/soute-trop': 'soute', 'amenagements/am-vitesse': 'effet',
    });
    const ajoutes = ['pct-min', 'pct-max', 'val-9', 'val9', 'rep20', 'ech-max99'];
    for (const c of ajoutes) assert.notEqual(await modif(m, c), undefined, c);
    assert.equal(r.json.natures.modifications.ajoutes, 6);
    assert.equal(r.json.natures.amenagements.ajoutes, 2);
  });

  it('exclusion : une formule ou du code dans les données est refusé, jamais stocké', async () => {
    const m = await monde(false);
    const cat = catalogue('formule-1', { modifications: [
      { cle: 'formule', nom: 'Formule', ...mod, effet: 'armure', valeur: 1, formule: 'coque.cout * 0.1' },
      { cle: 'code', nom: 'Code', ...mod, effet: 'code(1+1)', valeur: 1 },
      { cle: 'ok-f', nom: 'OK F', ...mod, effet: 'armure', valeur: 1 },
    ] });
    const r = await m.antor('POST', V(m, '/catalogue/application'), cat);
    assert.equal(r.status, 200, r.texte);
    const refus = Object.fromEntries((r.json.refus as Any[]).map((x) => [x.cle, x.champ]));
    assert.equal(refus['code'], 'effet');
    assert.ok('formule' in refus, 'formula field is refused');
    assert.equal(await modif(m, 'formule'), undefined);
    assert.equal(await modif(m, 'code'), undefined);
    assert.notEqual(await modif(m, 'ok-f'), undefined);
  });

  it('un fichier qui retire l’effet d’une modification la modifie ; la calculer ensuite n’applique plus rien', async () => {
    const m = await monde();
    const c2 = catalogue('retire-1');
    c2.modifications = c2.modifications.map((x: Any) => (x.cle === 'blindage' ? { cle: 'blindage', nom: "Blindage d'essai", ...mod } : x));
    const r = await m.antor('POST', V(m, '/catalogue/application'), c2);
    assert.equal(r.json.natures.modifications.modifies, 1);
    const calcul = await calc(m, { coque: 'fregate-r', choix: [mods('blindage')] });
    assert.equal(calcul.json.resultat.armure, 5);
    assert.equal(calcul.json.resultat.prix, 300000);
  });

  it('un joueur ne peut pas importer', async () => {
    const m = await monde(false);
    const r = await m.lea('POST', V(m, '/catalogue/application'), catalogue('joueuse'));
    assert.ok(r.status === 403 || r.status === 404, `got ${r.status}`);
    assert.equal(await modif(m, 'blindage'), undefined);
  });

  it('les fichiers d’essai du semis ne disent aucun des champs nouveaux (les décomptes de retrait restent vrais)', () => {
    const nouveaux = ['cout_pct', 'effet', 'valeur', 'points_max', 'sens', 'echange_puissance', 'echange_masse', 'rend_puissance', 'rend_masse', 'soute'];
    for (const f of ['catalogue-essai.json', 'catalogue-essai-univers.json']) {
      const cles = new Set<string>();
      const parcours = (v: Any): void => { if (Array.isArray(v)) v.forEach(parcours); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { cles.add(k); parcours(x); } };
      parcours(JSON.parse(readFileSync(`src/outils/swn/exemples/${f}`, 'utf8')));
      for (const k of nouveaux) assert.equal(cles.has(k), false, `${f} states ${k}`);
    }
  });
});

describe('B-83 fiches de règles et texte de la conception', () => {
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

  it('catalogue qui ne dit rien : les tables des modifications et des aménagements sont celles d’avant (aucune colonne Coût %, Effet, Valeur, Soute)', async () => {
    const m = await monde(false);
    const s = await sheets(m);
    for (const k of ['regles-modifications', 'regles-amenagements']) assert.doesNotMatch(s[k], /Coût %|Effet|Valeur \/ points max/, k);
    assert.match(s['regles-amenagements'], /Nom Coût Puissance Masse PV CA Limite Coût × coque Puissance × coque Masse × coque Cabines/);
  });

  it('catalogue qui dit les effets : colonnes « Coût % », « Effet », « Valeur / points max » et libellés français de la liste ; aménagements « Effet » et « Soute »', async () => {
    const m = await monde();
    const s = await sheets(m);
    const mo = s['regles-modifications'];
    assert.match(mo, /Coût %/);
    assert.match(mo, /Effet/);
    assert.match(mo, /Valeur \/ points max/);
    for (const lib of ['Vitesse', 'Armure', 'Échange de points', 'Soutes doublées', 'Magasins doublés', 'Réparation minimale']) assert.match(mo, new RegExp(lib), lib);
    const am = s['regles-amenagements'];
    assert.match(am, /Effet/);
    assert.match(am, /Effet Soute /);
    assert.match(am, /Moteur système/);
  });

  it('texte enregistré : ligne « Soutes 20 », « (→ Soute d’essai) », « (3 points) » et « — 30 000 cr » sur la ligne du pourcentage', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const choix = [l('amenagements', 'soute-r'), mods('cale', 1, { vise: { nature: 'amenagements', cle: 'soute-r' } }), mods('reacteur', 1, { points: 3 }), mods('blindage')];
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix, version: vue.version });
    assert.equal(r.status, 200, r.texte);
    const t = plat((await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html);
    assert.match(t, /Soutes 20/);
    assert.match(t, /Cale d'essai \(→ Soute d'essai\)/);
    assert.match(t, /Réacteur d'essai \(3 points\)/);
    assert.match(t, /Blindage d'essai — 30 000 cr/);
  });
});

describe('Catalogue antérieur sans ces champs : même résultat qu’avant', () => {
  it('« Vent d’Orak » (685 000 cr, 30 PV, CA 14) : aucune alerte, ni soutes, ni compétence de réparation ; l’éclaireur armé du catalogue d’essai donne 54 000 cr', async () => {
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
    assert.equal(res.soutes ?? null, null);
    assert.equal(res.reparation ?? null, null);
    assert.deepEqual(r.json.alertes, []);
  });

  it('importer un catalogue d’effets ne réécrit aucune conception existante : Vent d’Orak garde son prix et son texte', async () => {
    const m = await monde(false);
    const t = async () => plat((await m.lea('GET', `/api/univers/${m.E}/fiches/${m.orak}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html);
    const avant = await t();
    assert.match(avant, /Prix 685 000 cr/);
    assert.equal((await m.antor('POST', `${m.V}/catalogue/application`, catalogue())).status, 200);
    assert.equal(await t(), avant);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json.resultat.prix, 685000);
  });
});
