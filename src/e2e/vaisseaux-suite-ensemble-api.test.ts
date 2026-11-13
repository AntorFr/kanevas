// Feature-level black-box tests of kanevas-outils-format-vaisseaux-suite (B-86), HTTP level: real server in stub mode with the stub
// seed, real SQLite. Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (B-86, P-19 step 2) and, for what is
// delivered without a screen (import, calculation, rule sheets, saved text), ARCHITECTURE.md Z-1 to Z-7 (the hand-calculated figures
// of Z-5 are re-derived here). The trial catalogue is written by the test, invented, absent from the seed. Every expected value is a literal.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player and author of « Étoile du soir »)
// Hull Frégate R: class 2, cost 300 000, power 20, mass 20, emports 3, factors 1, speed 3, armour 5. Frégate 333: same, cost 333 335.
// B-86 (1) base de la réduction  nominal : moteur système 40 000 / 10 %, base coque → ligne 10 000, prix 310 000 ; base absente ou « amenagement » → 36 000 / 336 000
//                bords    : coque coûtant 333 335 → réduction 33 334 (moitié vers le haut), ligne 6 666, prix 340 001 ; fitting 20 000 < réduction 30 000 → ligne 0, prix 300 000 ;
//                           100 % → ligne 0 ; puissance 3 et masse 1,5 rendues comme avant
//                échec    : reduction_base sans reduction_cout_pct, « caisse », « coque » sur un autre élément → refusés (champ reduction_base)
// B-86 (2) échange arrondi       nominal : 3 points puissance→masse (1 pour 0,5) → −3 / +1 ; sans arrondi → +1,5
//                bords    : 1 → +0 ; 4 → +2 ; 5 → +2 ; deux installations de 3 → −6 / +2 ; trois de 1 → −3 / 0 ; masse→puissance 3 points → −1 / +3 ; 6 points refusé (champ points)
//                échec    : arrondi autre que « installation », sur un autre effet → refusé ; exclusion : échange non arrondi avec limite 3 refusé
// B-86 import   : champs créés, relus, inchangés au rejeu ; effet inconnu refusé avec champ effet et le reste passe ; paramètre sur un autre effet / manquant refusés
// B-86 fiches de règles et texte : colonnes Pourcentage, Arrondi de l'échange, Base de la réduction ; rien si le catalogue n'en dit rien ; texte « → Soute Z »
// Ancien : un catalogue qui n'en dit rien rend les mêmes valeurs qu'avant (Vent d'Orak 685 000 cr), le semis ne dit rien de B-86
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
const sys = { effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] };
const arme = { ...el, puissance: 10, masse: 1, emport: 1, munitions: 0, cout_munition: 0 };

const catalogue = (version = 'suite-1', surcharge: Any = {}): Any => ({
  catalogue: 'swn/vaisseaux', version,
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5 },
    { cle: 'fregate-r3', nom: 'Frégate R3', classe: 3, ...coque, cout: 400000, vitesse: 3, armure: 5 },
    { cle: 'fregate-r1', nom: 'Frégate R1', classe: 1, ...coque, vitesse: 3, armure: 5 },
    { cle: 'fregate-333', nom: 'Frégate 333', classe: 2, ...coque, cout: 333335, vitesse: 3, armure: 5 },
  ],
  amenagements: [
    { cle: 'moteur-coque', nom: 'Moteur base coque', ...el, cout: 40000, ...sys, reduction_cout_pct: 10, reduction_base: 'coque' },
    { cle: 'moteur-amen', nom: 'Moteur base aménagement', ...el, cout: 40000, ...sys, reduction_cout_pct: 10, reduction_base: 'amenagement' },
    { cle: 'moteur-muet', nom: 'Moteur sans base', ...el, cout: 40000, ...sys, reduction_cout_pct: 10 },
    { cle: 'moteur-petit', nom: 'Moteur à 20 000', ...el, cout: 20000, ...sys, reduction_cout_pct: 10, reduction_base: 'coque' },
    { cle: 'moteur-cent', nom: 'Moteur à 100 %', ...el, cout: 40000, ...sys, reduction_cout_pct: 100, reduction_base: 'coque' },
    { cle: 'soute-z', nom: 'Soute Z', ...el, masse: 8, soute: 10 },
    { cle: 'soute-5', nom: 'Soute 5', ...el, masse: 5, soute: 10 },
    { cle: 'soute-1', nom: 'Soute 1', ...el, masse: 1, soute: 10 },
    { cle: 'soute-classe', nom: 'Soute par classe Z', ...el, masse: 8, soute_par_classe: [10, 20, 40, 80] },
    { cle: 'cabine-z', nom: 'Cabine Z', ...el, masse: 2 },
  ],
  armes: [
    { cle: 'laser-z', nom: 'Laser Z', ...arme },
    { cle: 'laser-3', nom: 'Laser 3', ...arme, puissance: 3 },
  ],
  modifications: [
    { cle: 'optimise-l', nom: 'Optimise L', ...el, limite: 1, effet: 'soutes_optimisees_livre' },
    { cle: 'blindage-l', nom: 'Blindage L', ...el, limite: 1, effet: 'blindage_renforce', valeur: 2 },
    { cle: 'montage-l', nom: 'Montage L', ...el, limite: 1, effet: 'montages_specialises', vise: { nature: 'armes', cle: 'laser-z' } },
    { cle: 'surcharge-l', nom: 'Surcharge L', ...el, limite: 2, effet: 'surcharge_cumulable', effet_pct: 50, vise: { nature: 'armes', cle: 'laser-z' } },
    { cle: 'reacteur-i', nom: 'Réacteur arrondi', ...el, limite: 3, effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5, echange_arrondi: 'installation' },
    { cle: 'inverse-i', nom: 'Inverse arrondi', ...el, limite: 3, effet: 'echange', sens: 'masse_vers_puissance', points_max: 5, echange_puissance: 1, echange_masse: 0.5, echange_arrondi: 'installation' },
    { cle: 'reacteur', nom: 'Réacteur libre', ...el, limite: 1, effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5 },
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
const sur = (coqueCle: string, choix: Any[]) => ({ coque: coqueCle, choix });

describe('B-86 (1) base de la réduction du moteur système', () => {
  const un = (m: Monde, cle: string, coqueCle = 'fregate-r') => calc(m, sur(coqueCle, [amen(cle)]));

  it('coût 40 000 réduit de 10 % de la coque (300 000) : ligne 10 000, prix 310 000, 3 de puissance et 1,5 de masse rendus', async () => {
    const m = await monde();
    const r = await un(m, 'moteur-coque');
    assert.equal(r.status, 200, r.texte);
    assert.equal(ligne(r, 'moteur-coque').cout, 10000);
    assert.equal(r.json.resultat.prix, 310000);
    assert.equal(r.json.resultat.puissanceLibre, 23);
    assert.equal(r.json.resultat.masseLibre, 21.5);
  });

  it('base absente ou « amenagement » : ligne 36 000, prix 336 000, comme avant', async () => {
    const m = await monde();
    for (const cle of ['moteur-muet', 'moteur-amen']) {
      const r = await un(m, cle);
      assert.equal(ligne(r, cle).cout, 36000, cle);
      assert.equal(r.json.resultat.prix, 336000, cle);
    }
  });

  it('bord : coque à 333 335 → réduction 33 334 (33 333,5 arrondi vers le haut), ligne 6 666, prix 340 001', async () => {
    const m = await monde();
    const r = await un(m, 'moteur-coque', 'fregate-333');
    assert.equal(ligne(r, 'moteur-coque').cout, 6666);
    assert.equal(r.json.resultat.prix, 340001);
  });

  it('bord : aménagement à 20 000 sous une réduction de 30 000 → ligne 0 (le surplus se perd), prix 300 000 ; 100 % → ligne 0', async () => {
    const m = await monde();
    const a = await un(m, 'moteur-petit');
    assert.equal(ligne(a, 'moteur-petit').cout, 0);
    assert.equal(a.json.resultat.prix, 300000);
    const b = await un(m, 'moteur-cent');
    assert.equal(ligne(b, 'moteur-cent').cout, 0);
    assert.equal(b.json.resultat.prix, 300000);
  });

  it('sur la coque de classe 3 (400 000), la réduction de 40 000 dépasse le moteur : ligne 0, prix 400 000, sans report sur la coque', async () => {
    const m = await monde();
    const r = await un(m, 'moteur-coque', 'fregate-r3');
    assert.equal(ligne(r, 'moteur-coque').cout, 0);
    assert.equal(r.json.resultat.prix, 400000);
  });

  it('import : reduction_base sans reduction_cout_pct, « caisse », ou posée sur un aménagement sans moteur système → refusés (champ reduction_base), le reste passe', async () => {
    const m = await monde(false);
    const cat = catalogue('base-1', { amenagements: [
      { cle: 'b-ok', nom: 'B ok', ...el, cout: 40000, ...sys, reduction_cout_pct: 10, reduction_base: 'coque' },
      { cle: 'b-sans-pct', nom: 'B sans pct', ...el, cout: 40000, ...sys, reduction_base: 'coque' },
      { cle: 'b-caisse', nom: 'B caisse', ...el, cout: 40000, ...sys, reduction_cout_pct: 10, reduction_base: 'caisse' },
      { cle: 'b-nul', nom: 'B nul', ...el, cout: 40000, ...sys, reduction_cout_pct: 10, reduction_base: null },
      { cle: 'b-autre', nom: 'B autre', ...el, reduction_base: 'coque' },
    ] });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'b-sans-pct': 'reduction_base', 'b-caisse': 'reduction_base', 'b-nul': 'reduction_base', 'b-autre': 'reduction_base' });
    assert.equal(r.json.natures.amenagements.ajoutes, 1);
    assert.equal(r.json.natures.coques.ajoutes, 4);
  });
});

describe('B-86 (2) échange de points arrondi par installation', () => {
  const ech = (m: Monde, cle: string, points: number, q = 1) => calc(m, sur('fregate-r', [mods(cle, q, { points })]));
  const libres = (r: Rep) => [r.json.resultat.puissanceLibre, r.json.resultat.masseLibre];

  it('3 points (1 de puissance pour 0,5 de masse) : −3 de puissance, +1 de masse (1,5 arrondi vers le bas) ; sans arrondi +1,5', async () => {
    const m = await monde();
    const r = await ech(m, 'reacteur-i', 3);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(libres(r), [17, 21]);
    assert.deepEqual(ligne(r, 'reacteur-i').echange, { puissance: -3, masse: 1 });
    assert.deepEqual(libres(await ech(m, 'reacteur', 3)), [17, 21.5]);
  });

  it('une installation : 1 point → −1 / +0 ; 4 → −4 / +2 ; 5 → −5 / +2 ; 0 → rien', async () => {
    const m = await monde();
    assert.deepEqual(libres(await ech(m, 'reacteur-i', 1)), [19, 20]);
    assert.deepEqual(libres(await ech(m, 'reacteur-i', 4)), [16, 22]);
    assert.deepEqual(libres(await ech(m, 'reacteur-i', 5)), [15, 22]);
    assert.deepEqual(libres(await ech(m, 'reacteur-i', 0)), [20, 20]);
  });

  it('plusieurs installations : deux de 3 points → −6 / +2 ; trois de 1 point → −3 / 0 (l’arrondi est par installation)', async () => {
    const m = await monde();
    const a = await ech(m, 'reacteur-i', 3, 2);
    assert.equal(a.status, 200, a.texte);
    assert.deepEqual(libres(a), [14, 22]);
    assert.deepEqual(libres(await ech(m, 'reacteur-i', 1, 3)), [17, 20]);
  });

  it('sens inverse (masse → puissance) : 3 points → −1 de masse, +3 de puissance', async () => {
    const m = await monde();
    assert.deepEqual(libres(await ech(m, 'inverse-i', 3)), [23, 19]);
  });

  it('bord : 6 points au-delà du maximum 5 → refusé (400, champ points) ; 5 passe', async () => {
    const m = await monde();
    const r = await ech(m, 'reacteur-i', 6);
    assert.equal(r.status, 400, r.texte);
    assert.equal(r.json.champ, 'points');
  });

  it('import : arrondi « installation » avec limite 3 accepté ; arrondi autre, arrondi sur un autre effet, échange non arrondi à limite 3 → refusés', async () => {
    const m = await monde(false);
    const e = { ...el, effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5 };
    const cat = catalogue('ech-1', { modifications: [
      { cle: 'e-ok', nom: 'E ok', ...e, limite: 3, echange_arrondi: 'installation' },
      { cle: 'e-autre', nom: 'E autre', ...e, limite: 1, echange_arrondi: 'entier' },
      { cle: 'e-sur-armure', nom: 'E sur armure', ...el, effet: 'armure', valeur: 1, echange_arrondi: 'installation' },
      { cle: 'e-libre3', nom: 'E libre 3', ...e, limite: 3 },
      { cle: 'e-libre1', nom: 'E libre 1', ...e, limite: 1 },
    ] });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'e-autre': 'echange_arrondi', 'e-sur-armure': 'echange_arrondi', 'e-libre3': 'limite' });
    assert.equal(r.json.natures.modifications.ajoutes, 2);
  });
});

describe('B-86 import : champs créés, relus, inchangés au rejeu', () => {
  const lire = async (m: Monde, nature: string, cle: string) => (await m.antor('GET', `${m.V}/catalogue?nature=${nature}`)).json.elements.find((e: Any) => e.cle === cle);

  it('chaque champ nouveau est créé puis relu tel quel ; le rejeu du même fichier ne crée, ne modifie ni ne double rien', async () => {
    const m = await monde(false);
    const ok = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('imp-1'));
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(ok.json.refusTotal, 0, ok.texte);
    assert.equal(ok.json.natures.amenagements.ajoutes, 10);
    assert.equal(ok.json.natures.modifications.ajoutes, 7);
    assert.equal((await lire(m, 'amenagements', 'moteur-coque')).donnees.reduction_base, 'coque');
    assert.equal((await lire(m, 'modifications', 'surcharge-l')).donnees.effet_pct, 50);
    assert.equal((await lire(m, 'modifications', 'blindage-l')).donnees.valeur, 2);
    assert.equal((await lire(m, 'modifications', 'optimise-l')).donnees.effet, 'soutes_optimisees_livre');
    assert.equal((await lire(m, 'modifications', 'montage-l')).donnees.effet, 'montages_specialises');
    assert.equal((await lire(m, 'modifications', 'reacteur-i')).donnees.echange_arrondi, 'installation');
    const bis = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('imp-2'));
    assert.equal(bis.status, 200, bis.texte);
    assert.equal(bis.json.natures.amenagements.inchanges, 10);
    assert.equal(bis.json.natures.modifications.inchanges, 7);
    for (const n of ['coques', 'amenagements', 'armes', 'modifications']) {
      assert.equal(bis.json.natures[n].ajoutes, 0, n);
      assert.equal(bis.json.natures[n].modifies, 0, n);
    }
    assert.equal(bis.json.refusTotal, 0);
  });

  it('un effet inconnu est refusé avec champ « effet » et le reste du fichier passe', async () => {
    const m = await monde(false);
    const cat = catalogue('inconnu-1', { modifications: [
      { cle: 'bon', nom: 'Bon', ...el, limite: 1, effet: 'soutes_optimisees_livre' },
      { cle: 'mauvais', nom: 'Mauvais', ...el, effet: 'teleportation' },
    ] });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.refus.map((x: Any) => [x.cle, x.champ]), [['mauvais', 'effet']]);
    assert.equal(r.json.natures.modifications.ajoutes, 1);
    assert.equal(r.json.natures.coques.ajoutes, 4);
    assert.equal(r.json.natures.armes.ajoutes, 2);
    assert.equal(await lire(m, 'modifications', 'mauvais'), undefined);
  });

  it('un paramètre posé sur un autre effet, ou un effet sans son paramètre, est refusé avec le champ du paramètre', async () => {
    const m = await monde(false);
    const cat = catalogue('param-1', { modifications: [
      { cle: 'pct-sur-armure', nom: 'Pct sur armure', ...el, effet: 'armure', valeur: 1, effet_pct: 10 },
      { cle: 'vise-sur-vitesse', nom: 'Vise sur vitesse', ...el, effet: 'vitesse', valeur: 1, vise: { nature: 'armes', cle: 'laser-z' } },
      { cle: 'pct-sans-effet', nom: 'Pct sans effet', ...el, effet_pct: 10 },
      { cle: 'surcharge-sans-pct', nom: 'Surcharge sans pct', ...el, limite: 1, effet: 'surcharge_cumulable', vise: { nature: 'armes', cle: 'laser-z' } },
      { cle: 'bon', nom: 'Bon', ...el, effet: 'armure', valeur: 1 },
    ] });
    const r = await m.antor('POST', `${m.V}/catalogue/application`, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'pct-sur-armure': 'effet_pct', 'vise-sur-vitesse': 'vise', 'pct-sans-effet': 'effet_pct', 'surcharge-sans-pct': 'effet_pct' });
    assert.equal(r.json.natures.modifications.ajoutes, 1);
  });

  it('un fichier qui retire un champ au rejeu modifie l’élément : la base de la réduction disparaît, le moteur revient à 36 000', async () => {
    const m = await monde();
    const r = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('imp-3', { amenagements: [{ cle: 'moteur-coque', nom: 'Moteur base coque', ...el, cout: 40000, ...sys, reduction_cout_pct: 10 }] }));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.natures.amenagements.modifies, 1);
    const c = await calc(m, sur('fregate-r', [amen('moteur-coque')]));
    assert.equal(ligne(c, 'moteur-coque').cout, 36000);
  });

  it('exclusion : une joueuse ne peut pas importer (403 ou 404), rien n’est écrit', async () => {
    const m = await monde(false);
    const r = await m.lea('POST', `${m.V}/catalogue/application`, catalogue('joueuse'));
    assert.ok(r.status === 403 || r.status === 404, `got ${r.status}`);
    assert.equal(await lire(m, 'modifications', 'optimise-l'), undefined);
  });

  it('les fichiers d’essai du semis ne disent aucun champ ni effet de B-86 (les décomptes de retrait restent vrais)', () => {
    for (const f of ['catalogue-essai.json', 'catalogue-essai-univers.json']) {
      const texte = readFileSync(`src/outils/swn/exemples/${f}`, 'utf8');
      for (const k of ['reduction_base', 'effet_pct', 'echange_arrondi', 'blindage_renforce', 'montages_specialises', 'surcharge_cumulable']) assert.equal(texte.includes(k), false, `${f} states ${k}`);
    }
  });
});

describe('B-86 fiches de règles et texte de la conception', () => {
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

  it('catalogue qui dit B-86 : colonnes Pourcentage (50 %), sans Armure par classe, Arrondi de l’échange (par installation), Base de la réduction (Coque) et les quatre libellés d’effet', async () => {
    const m = await monde();
    const s = await sheets(m);
    assert.match(s['regles-modifications'], /Pourcentage/);
    assert.doesNotMatch(s['regles-modifications'], /Armure par classe/);
    assert.match(s['regles-modifications'], /50 %/);
    assert.match(s['regles-modifications'], /Arrondi de l['’]échange/);
    assert.match(s['regles-modifications'], /par installation/);
    assert.match(s['regles-modifications'], /Soutes optimisées/);
    assert.match(s['regles-modifications'], /Montages spécialisés/);
    assert.match(s['regles-modifications'], /Blindage renforcé/);
    assert.match(s['regles-modifications'], /Surcharge d['’]arme/);
    assert.match(s['regles-amenagements'], /Base de la réduction/);
    assert.match(s['regles-amenagements'], /Coque/);
  });

  it('catalogue qui n’en dit rien (le semis) : aucune de ces colonnes dans les fiches de règles', async () => {
    const m = await monde(false);
    const s = await sheets(m);
    for (const k of ['regles-modifications', 'regles-amenagements']) assert.doesNotMatch(s[k], /Pourcentage|Armure par classe|Arrondi de l['’]échange|Base de la réduction/, k);
  });

  it('texte enregistré : l’élément visé est nommé « → Laser Z » et les points « 3 points »', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const choix = [armes('laser-z'), mods('montage-l', 1, vise('armes', 'laser-z')), mods('reacteur-i', 1, { points: 3 })];
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix, version: vue.version });
    assert.equal(r.status, 200, r.texte);
    const t = plat((await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((x: Any) => x.titre === 'Caractéristiques').html);
    assert.match(t, /Montage L \(→ Laser Z\)/);
    assert.match(t, /Réacteur arrondi \(3 points\)/);
    const relue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.equal(relue.resultat.masseLibre, 20);
  });
});

describe('Catalogue antérieur sans ces champs : même résultat qu’avant', () => {
  it('« Vent d’Orak » : 685 000 cr, 30 PV, CA 14, aucune alerte ; l’éclaireur armé donne 54 000 cr', async () => {
    const m = await monde(false);
    const orak = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.equal(orak.resultat.prix, 685000);
    assert.equal(orak.resultat.pv, 30);
    assert.equal(orak.resultat.ca, 14);
    assert.deepEqual(orak.alertes, []);
    const r = await calc(m, { coque: 'eclaireur', choix: [l('moteurs', 'moteur-1'), l('armes', 'laser'), l('defenses', 'blindage')] });
    const res = r.json.resultat;
    assert.deepEqual([res.prix, res.pv, res.ca, res.puissanceLibre, res.masseLibre, res.chantierJours, res.entretien, res.porteeSaut], [54000, 13, 15, 6, 4, 3, 2700, 10]);
    assert.deepEqual(r.json.alertes, []);
  });

  it('un catalogue qui ne dit rien de B-86 : réduction 36 000, échange non arrondi +1,5, ligne sans « ajuste » ; importer le même catalogue deux fois ne change rien', async () => {
    const ancien = catalogue('ancien-1', { amenagements: [{ cle: 'moteur-muet', nom: 'Moteur sans base', ...el, cout: 40000, ...sys, reduction_cout_pct: 10 }], armes: [], modifications: [{ cle: 'reacteur', nom: 'Réacteur libre', ...el, limite: 1, effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5 }] });
    const m = await monde(true, ancien);
    const choix = [amen('moteur-muet'), mods('reacteur', 1, { points: 3 })];
    const avant = await calc(m, sur('fregate-r', choix));
    assert.equal(ligne(avant, 'moteur-muet').cout, 36000);
    assert.equal(avant.json.resultat.prix, 336000);
    assert.deepEqual(ligne(avant, 'reacteur').echange, { puissance: -3, masse: 1.5 });
    assert.equal(avant.json.resultat.masseLibre, 23);
    assert.equal(ligne(avant, 'reacteur').ajuste, undefined);
    const bis = await m.antor('POST', `${m.V}/catalogue/application`, { ...ancien, version: 'ancien-2' });
    assert.equal(bis.status, 200, bis.texte);
    assert.deepEqual((await calc(m, sur('fregate-r', choix))).json, avant.json);
  });
});
