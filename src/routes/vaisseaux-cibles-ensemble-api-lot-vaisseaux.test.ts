// Feature-level black-box tests of kanevas-concepteur-vaisseaux-cibles (B-89, B-94, H-8, H-10 (1) to (3)), HTTP level: real app in stub mode
// with the stub seed, real SQLite. Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (P-19 step 6), docs/ecrans.md (E-22
// criteria, alert texts) and the contracts of ARCHITECTURE.md (V-8 routes). The trial catalogue is written by the test. Every expected value is a
// literal worked out by hand. The screen is covered by `src/e2e/vaisseaux-cibles-ensemble-ecran.test.ts` (E-22).
//
// TEST PLAN (coque « Coque C2 » classe 2, puissance 30, masse 30; Léa Player, author of « Étoile du soir »; used = what the elements draw)
// B-89 montages spécialisés  nominal : laser (3/3) et canon (5/5) visés, une installation chacun → besoin 1 et 2, libre 27 / 27 (baisse 2+3), ajuste 2 et 3
//                            bords   : puissance 0 reste 0 (masse 4 → 2) ; puissance et masse 1 inchangées (alerte effet_sans_objet) ; une arme de quantité 2 : par installation
//                            échec   : somme des quantités ≠ quantité de la ligne, élément absent de la conception, nature interdite → cible_invalide 
//                            exclus. : arrondi supérieur refusé (3 → 1 et non 2) ; cibles sur une modification qui ne vise rien → 400 champ cibles
// B-89 surcharge             nominal : lance (puissance 4) visée une fois +2, deux fois +4 ; bords : même arme que le montage (4 → 2 puis +1) ; échec : sur un aménagement → cible_invalide
// B-89 cible_deja_visee      deux rangées d'une ligne ; deux lignes ; refus 422 à l'enregistrement ; une surcharge sur un élément déjà surchargé ou déjà monté : pas de refus
// B-89 surdimensionne        arme classe 2 sur coque classe 1 : bloquée sans, passe avec ; sur un élément sans besoin → effet_sans_objet, non bloquante, enregistrable
// B-89 moteur_niveau         rang 2 +1 = rang 3 (portée 20 comme un moteur 3), rang 5 +1 = rang 6 (35), plafond : rang 6 +1 reste 35 ; sans cible
// B-89 magasins / soutes     magasins doublés sans cible : +4 000 (deux armes à munitions), un `vise` envoyé est ignoré ; soutes doublées garde son `vise` (soutes 10 → 20)
// B-94 anciens               conception stockée avec un `vise` : rouverte en cibles (quantité de la ligne), mêmes totaux, rien réécrit (version et stockage inchangés) ;
//                            sans `vise` : cible_invalide ; enregistrement écrit `cibles` et plus de `vise`
// Catalogue                  `vise` toléré et ignoré à l'import (pas de refus) ; un montage n'exige plus de cible ni de « limite 1 » (3 installations acceptées)
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { Any } from './serveur-lot-vaisseaux.ts';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

type Appli = Awaited<ReturnType<typeof buildApp>>;
const applis: Appli[] = [];
after(() => applis.forEach((a) => void a.close()));

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
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 30, masse: 30, emports: 4, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5 };
const arme = (puissance: number, masse: number, plus: Any = {}) => ({ ...el, puissance, masse, emport: 1, munitions: 0, cout_munition: 0, classe_min: 1, ...plus });

const catalogue = (version = 'cibles-1', plus: Any = {}): Any => ({
  catalogue: 'swn/vaisseaux', version,
  coques: [
    { cle: 'c2', nom: 'Coque C2', classe: 2, ...coque, moteur_spike: 0 },
    { cle: 'c1', nom: 'Coque C1', classe: 1, ...coque, moteur_spike: 0 },
    { cle: 'v2', nom: 'Vaisseau V2', classe: 2, ...coque },
  ],
  moteurs: [1, 2, 3, 5, 6].map((n) => ({ cle: `m${n}`, nom: `Moteur ${n}`, niveau: n, ...el })),
  amenagements: [
    { cle: 'soute', nom: 'Soute', ...el, soute: 10 },
    { cle: 'baie', nom: 'Baie', ...el, puissance: 2, masse: 2 },
  ],
  defenses: [{ cle: 'plaque', nom: 'Plaque', ...el }],
  armes: [
    { cle: 'laser', nom: 'Laser', ...arme(3, 3) },
    { cle: 'canon', nom: 'Canon', ...arme(5, 5) },
    { cle: 'lance', nom: 'Lance', ...arme(4, 4) },
    { cle: 'zero', nom: 'Arme sans puissance', ...arme(0, 4) },
    { cle: 'un', nom: 'Arme de un', ...arme(1, 1) },
    { cle: 'lourd', nom: 'Arme lourde', ...arme(2, 2, { classe_min: 2 }) },
    { cle: 'missile', nom: 'Missile', ...arme(1, 1, { munitions: 10, cout_munition: 100 }) },
    { cle: 'torpille', nom: 'Torpille', ...arme(1, 1, { munitions: 10, cout_munition: 100 }) },
  ],
  modifications: [
    { cle: 'montage', nom: 'Montage', ...el, effet: 'montages_specialises' },
    { cle: 'montage-b', nom: 'Montage B', ...el, effet: 'montages_specialises' },
    { cle: 'surcharge', nom: 'Surcharge', ...el, limite: 5, effet: 'surcharge_cumulable', effet_pct: 50 },
    { cle: 'surcharge-b', nom: 'Surcharge B', ...el, limite: 5, effet: 'surcharge_cumulable', effet_pct: 50 },
    { cle: 'surdim', nom: 'Surdimensionné', ...el, limite: 1, effet: 'surdimensionne' },
    { cle: 'rang', nom: 'Rang', ...el, limite: 1, effet: 'moteur_niveau' },
    { cle: 'mag', nom: 'Magasins', ...el, limite: 1, effet: 'magasins_doubles' },
    { cle: 'cale', nom: 'Cale', ...el, limite: 1, effet: 'soutes_doublees' },
    { cle: 'banal', nom: 'Banal', ...el, effet: 'armure', valeur: 1 },
  ],
  exemples: [],
  ...plus,
});

interface Monde { E: number; V: string; antor: Client; lea: Client; etoile: number; db: Appli['db'] }

async function monde(cat: Any = catalogue()): Promise<Monde> {
  const app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  applis.push(app);
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const antor = await session(base, 'antor');
  const lea = await session(base, 'lea');
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  const r = await antor('POST', `${V}/catalogue/application`, cat);
  assert.equal(r.status, 200, r.texte);
  assert.equal(r.json.refusTotal, 0, r.texte);
  const liste = (await antor('GET', `${V}/conceptions`)).json;
  const etoile = liste.conceptions.find((c: Any) => c.titre === 'Étoile du soir').ficheId as number;
  return { E, V, antor, lea, etoile, db: app.db };
}

const l = (nature: string, cle: string, quantite = 1, plus: Any = {}) => ({ nature, cle, quantite, ...plus });
const arm = (cle: string, q = 1) => l('armes', cle, q);
const cib = (cle: string, quantite = 1, nature = 'armes') => ({ nature, cle, quantite });
const mod = (cle: string, quantite: number, cibles?: Any[], plus: Any = {}) => l('modifications', cle, quantite, cibles ? { cibles, ...plus } : plus);
// Repair 1 (Maintenance 3) keeps the watch alert `maintenance_depassee` (H-mods-1 (4)) out of these lists: no test here counts modifications kept up.
const calc = (m: Monde, coqueCle: string, choix: Any[]) => m.lea('POST', `${m.V}/calcul`, { coque: coqueCle, choix, reparation: 1 });
const codes = (r: Rep) => (r.json.alertes as Any[]).map((a) => `${a.niveau}:${a.code}`);
const ligne = (r: Rep, cle: string): Any => (r.json.resultat.lignes as Any[]).find((x) => x.cle === cle);
async function enregistrer(m: Monde, coqueCle: string, choix: Any[]): Promise<Rep> {
  const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
  return m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: coqueCle, choix, version: vue.version });
}

describe('B-89 montages spécialisés : un montage par installation, moitié arrondie à l’inférieur, au moins 1', () => {
  it('nominal : un montage sur le laser (3/3) et un sur le canon (5/5) → besoins 1 et 2, usage baissé de 2 et 3, libres 27 et 27', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('laser'), arm('canon'), mod('montage', 2, [cib('laser'), cib('canon')])]);
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.puissanceLibre, 27);
    assert.equal(r.json.resultat.masseLibre, 27);
    assert.deepEqual(r.json.alertes, []);
    assert.deepEqual(ligne(r, 'montage').ajuste, { masse: -5, puissance: -5 });
    assert.deepEqual(ligne(r, 'montage').cibles, [cib('laser'), cib('canon')]);
  });

  it('chaque cible seule : le laser baisse de 2 (libre 29), le canon baisse de 3 (libre 28) ; l’arrondi supérieur (besoin 2 et 3) est refusé', async () => {
    const m = await monde();
    const a = await calc(m, 'c2', [arm('laser'), mod('montage', 1, [cib('laser')])]);
    assert.equal(a.json.resultat.puissanceLibre, 29);
    assert.equal(a.json.resultat.masseLibre, 29);
    const b = await calc(m, 'c2', [arm('canon'), mod('montage', 1, [cib('canon')])]);
    assert.equal(b.json.resultat.puissanceLibre, 28);
    assert.equal(b.json.resultat.masseLibre, 28);
  });

  it('bords : un élément de puissance 0 reste à 0 (sa masse 4 passe à 2 : libre puissance 30, masse 28) ; puissance et masse 1 restent à 1 avec une alerte « effet_sans_objet »', async () => {
    const m = await monde();
    const z = await calc(m, 'c2', [arm('zero'), mod('montage', 1, [cib('zero')])]);
    assert.equal(z.json.resultat.puissanceLibre, 30);
    assert.equal(z.json.resultat.masseLibre, 28);
    const u = await calc(m, 'c2', [arm('un'), mod('montage', 1, [cib('un')])]);
    assert.equal(u.json.resultat.puissanceLibre, 29);
    assert.equal(u.json.resultat.masseLibre, 29);
    assert.deepEqual(codes(u), ['a_surveiller:effet_sans_objet']);
  });

  it('bord : une arme en deux exemplaires et deux installations de la ligne qui la visent est refusée ; un montage de la ligne sur chaque exemplaire n’existe pas, la moitié se prend par installation (laser ×2 + un montage → libre 30 − (6 − 2) = 26)', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('laser', 2), mod('montage', 1, [cib('laser')])]);
    assert.equal(r.json.resultat.puissanceLibre, 26);
    assert.equal(r.json.resultat.masseLibre, 26);
  });

  it('bord : trois installations du même montage, une par arme (laser, canon, lance) sont acceptées, sans limite à une installation → 1 + 2 + 2 = 5 utilisés, libre 25', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('laser'), arm('canon'), arm('lance'), mod('montage', 3, [cib('laser'), cib('canon'), cib('lance')])]);
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.puissanceLibre, 25);
    assert.deepEqual(r.json.alertes, []);
  });

  it('un montage peut viser un aménagement : baie 2/2 → 1/1, libre 29', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [l('amenagements', 'baie'), mod('montage', 1, [cib('baie', 1, 'amenagements')])]);
    assert.equal(r.json.resultat.puissanceLibre, 29);
    assert.equal(r.json.resultat.masseLibre, 29);
  });
});

describe('B-89 cible_invalide : ce que la visée d’une installation doit être', () => {
  const refus = (r: Rep) => (r.json.alertes as Any[]).filter((a) => a.code === 'cible_invalide');
  it('une installation sans visée (cibles vide) : alerte bloquante cible_invalide sur la ligne 2', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('laser'), mod('montage', 1, [])]);
    assert.equal(refus(r).length, 1, r.texte);
    assert.equal(refus(r)[0].niveau, 'bloquante');
    assert.equal(refus(r)[0].ligne, 1);
  });

  it('somme des quantités des cibles (1) inférieure à la quantité de la ligne (3) : cible_invalide, texte « Choisissez l’élément visé » ; supérieure (2 pour 1) : cible_invalide aussi', async () => {
    const m = await monde();
    const court = await calc(m, 'c2', [arm('laser'), arm('canon'), mod('montage', 3, [cib('laser')])]);
    assert.equal(refus(court).length, 1, court.texte);
    assert.match(refus(court)[0].texte.toLowerCase(), /choisissez l'élément visé/);
    const long = await calc(m, 'c2', [arm('laser'), arm('canon'), mod('montage', 1, [cib('laser'), cib('canon')])]);
    assert.equal(refus(long).length, 1, long.texte);
  });

  it('élément visé absent de la conception : cible_invalide', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('laser'), mod('montage', 1, [cib('canon')])]);
    assert.equal(refus(r).length, 1, r.texte);
  });

  it('natures interdites (H-10 (3)) : une défense visée par un montage, un aménagement visé par une surcharge → cible_invalide', async () => {
    const m = await monde();
    const a = await calc(m, 'c2', [l('defenses', 'plaque'), mod('montage', 1, [cib('plaque', 1, 'defenses')])]);
    assert.equal(refus(a).length, 1, a.texte);
    const b = await calc(m, 'c2', [l('amenagements', 'baie'), mod('surcharge', 1, [cib('baie', 1, 'amenagements')])]);
    assert.equal(refus(b).length, 1, b.texte);
  });

  it('cibles sur une modification qui ne vise rien (armure) : requête refusée en 400, champ « cibles »', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('laser'), mod('banal', 1, [cib('laser')])]);
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.champ, 'cibles');
  });

  it('une conception avec cible_invalide n’est pas enregistrée (422 conception_bloquee)', async () => {
    const m = await monde();
    const r = await enregistrer(m, 'c2', [arm('laser'), mod('montage', 1, [])]);
    assert.equal(r.status, 422, r.texte);
    assert.equal(r.json.code ?? r.json.erreur, 'conception_bloquee');
  });
});

describe('B-89 cible_deja_visee : un montage spécialisé par élément et par conception', () => {
  const deja = (r: Rep) => (r.json.alertes as Any[]).filter((a) => a.code === 'cible_deja_visee');
  it('deux rangées d’une même ligne sur le laser → une alerte bloquante unique, ', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('laser'), mod('montage', 2, [cib('laser', 2)])]);
    assert.equal(deja(r).length, 1, r.texte);
    assert.equal(deja(r)[0].niveau, 'bloquante');
  });

  it('deux lignes de la conception sur le laser → refus sur la seconde ligne seulement ; enregistrement refusé en 422', async () => {
    const m = await monde();
    const choix = [arm('laser'), mod('montage', 1, [cib('laser')]), mod('montage-b', 1, [cib('laser')])];
    const r = await calc(m, 'c2', choix);
    assert.equal(deja(r).length, 1, r.texte);
    assert.equal(deja(r)[0].ligne, 2);
    const s = await enregistrer(m, 'c2', choix);
    assert.equal(s.status, 422, s.texte);
  });

  it('99 installations sur la même arme : une seule alerte, pas 98', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('laser'), mod('montage', 99, [cib('laser', 99)])]);
    assert.equal(deja(r).length, 1, r.texte);
  });

  it('exclusion : deux montages sur deux éléments différents ne sont pas refusés ; deux surcharges sur la même arme non plus', async () => {
    const m = await monde();
    const a = await calc(m, 'c2', [arm('laser'), arm('canon'), mod('montage', 1, [cib('laser')]), mod('montage-b', 1, [cib('canon')])]);
    assert.equal(deja(a).length, 0);
    const b = await calc(m, 'c2', [arm('lance'), mod('surcharge', 2, [cib('lance', 2)])]);
    assert.equal(deja(b).length, 0);
    assert.equal((await enregistrer(m, 'c2', [arm('lance'), mod('surcharge', 2, [cib('lance', 2)])])).status, 200);
  });
});

describe('B-89 surcharge cumulable : +50 % de la puissance de la cible par installation, armes seules', () => {
  it('une surcharge sur la lance (puissance 4) ajoute 2 (libre 24) ; deux installations sur la même arme ajoutent 4 (libre 22), la masse ne bouge pas', async () => {
    const m = await monde();
    const a = await calc(m, 'c2', [arm('lance'), mod('surcharge', 1, [cib('lance')])]);
    assert.equal(a.json.resultat.puissanceLibre, 24);
    assert.equal(a.json.resultat.masseLibre, 26);
    const b = await calc(m, 'c2', [arm('lance'), mod('surcharge', 2, [cib('lance', 2)])]);
    assert.equal(b.json.resultat.puissanceLibre, 22);
    assert.equal(b.json.resultat.masseLibre, 26);
  });

  it('deux lignes de surcharge sur la même arme se cumulent aussi : 2 + 2, libre 22', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('lance'), mod('surcharge', 1, [cib('lance')]), mod('surcharge-b', 1, [cib('lance')])]);
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.puissanceLibre, 22);
  });

  it('la moitié d’abord, la surcharge ensuite sur le résultat : lance montée (4 → 2) puis surchargée (+1) → puissance utilisée 3 (libre 27), masse utilisée 2 (libre 28)', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('lance'), mod('montage', 1, [cib('lance')]), mod('surcharge', 1, [cib('lance')])]);
    assert.equal(r.json.resultat.puissanceLibre, 27);
    assert.equal(r.json.resultat.masseLibre, 28);
  });

  it('bord : surcharger une arme de puissance 0 ne change rien (libre 30) et lève « effet_sans_objet » sans bloquer', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('zero'), mod('surcharge', 1, [cib('zero')])]);
    assert.equal(r.json.resultat.puissanceLibre, 30);
    assert.deepEqual(codes(r), ['a_surveiller:effet_sans_objet']);
  });
});

describe('B-89 surdimensionne : une installation visant un élément lève sa classe_inadaptee', () => {
  const inadaptee = (r: Rep) => (r.json.alertes as Any[]).filter((a) => a.code === 'classe_inadaptee');
  it('arme de classe 2 sur coque de classe 1 : bloquée seule (422 à l’enregistrement), passe avec un surdimensionné qui la vise', async () => {
    const m = await monde();
    const seule = await calc(m, 'c1', [arm('lourd')]);
    assert.equal(inadaptee(seule).length, 1, seule.texte);
    assert.equal(inadaptee(seule)[0].niveau, 'bloquante');
    assert.equal((await enregistrer(m, 'c1', [arm('lourd')])).status, 422);
    const avec = await calc(m, 'c1', [arm('lourd'), mod('surdim', 1, [cib('lourd')])]);
    assert.equal(inadaptee(avec).length, 0, avec.texte);
    assert.deepEqual(avec.json.alertes, []);
    assert.equal((await enregistrer(m, 'c1', [arm('lourd'), mod('surdim', 1, [cib('lourd')])])).status, 200);
  });

  it('exclusion : un surdimensionné qui vise une autre arme ne lève pas la classe de la première', async () => {
    const m = await monde();
    const r = await calc(m, 'c1', [arm('lourd'), arm('laser'), mod('surdim', 1, [cib('laser')])]);
    assert.equal(inadaptee(r).length, 1, r.texte);
  });

  it('sur un élément que la coque accepte déjà : alerte « effet_sans_objet » non bloquante, enregistrement accepté', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [arm('lourd'), mod('surdim', 1, [cib('lourd')])]);
    assert.deepEqual(codes(r), ['a_surveiller:effet_sans_objet']);
    assert.equal((await enregistrer(m, 'c2', [arm('lourd'), mod('surdim', 1, [cib('lourd')])])).status, 200);
  });
});

describe('B-89 moteur_niveau : le moteur compte un rang plus haut, plafond 6', () => {
  const portee = async (m: Monde, moteur: string, avec: boolean) => {
    const r = await calc(m, 'v2', [l('moteurs', moteur), ...(avec ? [mod('rang', 1)] : [])]);
    assert.equal(r.status, 200, r.texte);
    return r.json.resultat.porteeSaut;
  };
  it('rang 2 + « rang » = portée du rang 3 (20) ; rang 1 + « rang » = portée du rang 2 (15) ; rang 5 + « rang » = portée du rang 6 (35)', async () => {
    const m = await monde();
    assert.equal(await portee(m, 'm2', false), 15);
    assert.equal(await portee(m, 'm2', true), 20);
    assert.equal(await portee(m, 'm1', true), 15);
    assert.equal(await portee(m, 'm5', true), 35);
  });

  it('plafond : rang 6 + « rang » reste à 35 avec l’alerte « effet_sans_objet » non bloquante', async () => {
    const m = await monde();
    const r = await calc(m, 'v2', [l('moteurs', 'm6'), mod('rang', 1)]);
    assert.equal(r.json.resultat.porteeSaut, 35);
    assert.deepEqual(codes(r), ['a_surveiller:effet_sans_objet']);
  });

  it('exclusion : « rang » ne porte aucune cible (cibles refusées en 400)', async () => {
    const m = await monde();
    const r = await calc(m, 'v2', [l('moteurs', 'm2'), arm('laser'), mod('rang', 1, [cib('laser')])]);
    assert.equal(r.status, 400, r.texte);
  });
});

describe('B-89 magasins doublés sans cible ; soutes doublées garde son choix', () => {
  const ca = (m: Monde, extra: Any[]) => calc(m, 'c2', [arm('missile'), arm('torpille'), arm('laser'), ...extra]);
  it('magasins_doubles double les munitions de toutes les armes à munitions : +2 000 par arme (10 × 100 × 2 en classe 2), soit +4 000, masse libre inchangée ; un « vise » envoyé est ignoré', async () => {
    const m = await monde();
    const sans = await ca(m, []);
    const avec = await ca(m, [mod('mag', 1)]);
    assert.equal(avec.json.resultat.prix - sans.json.resultat.prix, 4000);
    assert.equal(avec.json.resultat.masseLibre, sans.json.resultat.masseLibre);
    const vise = await ca(m, [mod('mag', 1, undefined, { vise: { nature: 'armes', cle: 'missile' } })]);
    assert.equal(vise.status, 200, vise.texte);
    assert.equal(vise.json.resultat.prix - sans.json.resultat.prix, 4000);
  });

  it('soutes_doublees vise une soute : soutes 10 → 20 ; sans visée → alerte bloquante cible_invalide', async () => {
    const m = await monde();
    const ok = await calc(m, 'c2', [l('amenagements', 'soute'), mod('cale', 1, undefined, { vise: { nature: 'amenagements', cle: 'soute' } })]);
    assert.equal(ok.json.resultat.soutes, 20, ok.texte);
    const sans = await calc(m, 'c2', [l('amenagements', 'soute'), mod('cale', 1)]);
    assert.ok(codes(sans).includes('bloquante:cible_invalide'), sans.texte);
  });
});

describe('B-94 une conception d’avant l’epic se rouvre en cibles par installation', () => {
  // Une conception « d’avant » : enregistrée normalement, puis le stockage (choix et lignes du résultat) est ramené à l’ancienne forme,
  // un seul « vise » par ligne (ou aucun), sans « cibles ».
  const ancien = (m: Monde, vise: boolean) => {
    const ancienne = (lignes: Any[]) => lignes.map((x) => {
      if (!x.cibles) return x;
      const { cibles, ...reste } = x;
      return vise ? { ...reste, vise: { nature: cibles[0].nature, cle: cibles[0].cle } } : reste;
    });
    const row = m.db.prepare('SELECT choix, resultat FROM swn_conceptions WHERE fiche_id = ?').get(m.etoile) as Any;
    const resultat = JSON.parse(row.resultat);
    resultat.lignes = ancienne(resultat.lignes);
    m.db.prepare('UPDATE swn_conceptions SET choix = ?, resultat = ? WHERE fiche_id = ?').run(JSON.stringify(ancienne(JSON.parse(row.choix))), JSON.stringify(resultat), m.etoile);
  };
  const brut = (m: Monde) => (m.db.prepare('SELECT choix, version, resultat FROM swn_conceptions WHERE fiche_id = ?').get(m.etoile) as Any);
  const rouvrir = async (m: Monde) => {
    const vue = await m.lea('GET', `${m.V}/conceptions/${m.etoile}`);
    assert.equal(vue.status, 200, vue.texte);
    return vue;
  };
  const lignesDe = (vue: Rep) => (vue.json.lignes as Any[]).map(({ nom: _n, ...x }) => x);

  it('une ligne de surcharge de 2 installations avec un seul « vise » sur la lance : relue en cibles [lance ×2], mêmes totaux (libre 22), rien réécrit', async () => {
    const m = await monde();
    assert.equal((await enregistrer(m, 'c2', [arm('lance'), mod('surcharge', 2, [cib('lance', 2)])])).status, 200);
    ancien(m, true);
    assert.ok(brut(m).choix.includes('"vise"') && !brut(m).choix.includes('cibles'), 'stockage à l’ancienne forme');
    const avant = brut(m);
    const vue = await rouvrir(m);
    assert.deepEqual((vue.json.lignes as Any[]).find((x) => x.cle === 'surcharge').cibles, [cib('lance', 2)]);
    const r = await calc(m, 'c2', lignesDe(vue));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.puissanceLibre, 22);
    assert.deepEqual(r.json.alertes, []);
    assert.deepEqual(brut(m), avant, 'la lecture n’écrit rien');
  });

  it('une ligne de montage d’une installation avec un « vise » sur le laser : libre 29 à la relecture ; enregistrée telle quelle, elle écrit « cibles » et plus de « vise »', async () => {
    const m = await monde();
    assert.equal((await enregistrer(m, 'c2', [arm('laser'), mod('montage', 1, [cib('laser')])])).status, 200);
    ancien(m, true);
    const vue = await rouvrir(m);
    assert.deepEqual((vue.json.lignes as Any[]).find((x) => x.cle === 'montage').cibles, [cib('laser')]);
    const r = await calc(m, 'c2', lignesDe(vue));
    assert.equal(r.json.resultat.puissanceLibre, 29);
    const s = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'c2', choix: lignesDe(vue), version: vue.json.version });
    assert.equal(s.status, 200, s.texte);
    const sm = (JSON.parse(brut(m).choix) as Any[]).find((x) => x.cle === 'montage');
    assert.deepEqual(sm.cibles, [cib('laser')]);
    assert.equal('vise' in sm, false);
  });

  it('une ligne de montage sans aucun « vise » : rouverte sans erreur, avec l’alerte bloquante cible_invalide', async () => {
    const m = await monde();
    assert.equal((await enregistrer(m, 'c2', [arm('laser'), mod('montage', 1, [cib('laser')])])).status, 200);
    ancien(m, false);
    const vue = await rouvrir(m);
    const r = await calc(m, 'c2', lignesDe(vue));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(codes(r), ['bloquante:cible_invalide']);
  });

  it('une ligne de magasins doublés qui portait un « vise » : la cible est ignorée, tous les magasins doublent (+4 000 pour 2 armes à munitions)', async () => {
    const m = await monde();
    const base = await calc(m, 'c2', [arm('missile'), arm('torpille')]);
    assert.equal((await enregistrer(m, 'c2', [arm('missile'), arm('torpille'), mod('mag', 1)])).status, 200);
    const row = m.db.prepare('SELECT choix FROM swn_conceptions WHERE fiche_id = ?').get(m.etoile) as Any;
    const choix = (JSON.parse(row.choix) as Any[]).map((x) => (x.cle === 'mag' ? { ...x, vise: { nature: 'armes', cle: 'missile' } } : x));
    m.db.prepare('UPDATE swn_conceptions SET choix = ? WHERE fiche_id = ?').run(JSON.stringify(choix), m.etoile);
    const vue = await rouvrir(m);
    const r = await calc(m, 'c2', lignesDe(vue).map((x) => (x.cle === 'mag' ? { ...x, vise: { nature: 'armes', cle: 'missile' } } : x)));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.prix - base.json.resultat.prix, 4000);
  });
});

describe('B-89 stockage : les cibles se relisent après enregistrement', () => {
  it('montage sur laser et canon enregistré puis relu : lignes avec leurs cibles, résultat libre 27, version +1', async () => {
    const m = await monde();
    const avant = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.version as number;
    const s = await enregistrer(m, 'c2', [arm('laser'), arm('canon'), mod('montage', 2, [cib('laser'), cib('canon')])]);
    assert.equal(s.status, 200, s.texte);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.deepEqual((vue.lignes as Any[]).find((x) => x.cle === 'montage').cibles, [cib('laser'), cib('canon')]);
    assert.equal(vue.resultat.puissanceLibre, 27);
    assert.equal(vue.version, avant + 1);
  });
});

describe('Catalogue : il ne dit jamais la cible', () => {
  it('un « vise » dans une ligne du catalogue est toléré à l’import (aucun refus) et sans effet : le montage reste à viser dans la conception', async () => {
    const cat = catalogue('cibles-2');
    cat.modifications[0] = { ...cat.modifications[0], vise: { nature: 'armes', cle: 'laser' } };
    const m = await monde(cat);
    const r = await calc(m, 'c2', [arm('laser'), arm('canon'), mod('montage', 1, [cib('canon')])]);
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.puissanceLibre, 25);
    const sans = await calc(m, 'c2', [arm('laser'), mod('montage', 1, [])]);
    assert.ok(codes(sans).includes('bloquante:cible_invalide'), sans.texte);
  });

  it('un montage « limite 1 » du catalogue n’est pas exigé : un montage sans limite accepte 3 installations (testé plus haut) et le catalogue sans « vise » s’importe sans refus', async () => {
    const m = await monde(catalogue('cibles-3'));
    const e = (await m.antor('GET', `${m.V}/catalogue?nature=modifications`)).json.elements.find((x: Any) => x.cle === 'montage');
    assert.ok(e, 'montage importé');
  });
});
