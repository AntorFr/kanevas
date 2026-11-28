// Feature-level black-box tests of kanevas-concepteur-vaisseaux-regles-calcul (B-88, B-90, B-94, P-19 steps 1 to 5), HTTP level: real server in
// stub mode with the stub seed, real SQLite. Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (B-88, B-90, B-94),
// docs/ecrans.md (E-22 criteria and alert texts), docs/vaisseaux-regles.md (L-4, L-9, L-12, L-32, L-35) and ARCHITECTURE.md H-1, H-2, H-3, H-6,
// H-7, H-10. The trial catalogue is written by the test, invented, absent from the seed. Every expected value is a literal worked out by hand.
// The screen is covered by `src/e2e/vaisseaux-atelier-regles-review.test.ts` (E-22); this file proves the effects at their door
// (`POST …/calcul`, `PUT …/conceptions/:id`, `GET …/conceptions/:id`, `POST …/catalogue/application`).
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player and author of « Étoile du soir »)
// Classes of the catalogue are 1 to 4 (ARCHITECTURE: `classe` integers 1–4); hulls: factor of mass = f.
// H-1 arrondi du dièse    nominal : Atelier (masse 0,5 #) sur croiseur f3, masse 30 : 1 → 28 ; frégate f2 masse 30 : 1 → 29
//                         bords   : 3 ateliers sur f3 → 24 (6, jamais 4,5 ni 5) ; f4 : 1 → 28 (2 exact) ; f1 : 1 → 29 (0,5 → 1)
//                         exclusions : masse 0,5 sans dièse ×3 sur f3 → 28,5 ; dièse au produit entier (masse 1, f3 → 3) → 27 ; relu après enregistrement : 24
// H-2 stations            nominal : coque moteur_spike 0 sans moteur : aucune alerte, vitesse et portée null, enregistrée ; échec : moteur Spike sur station → moteur_sur_station bloquante, refus 422
//                         bords   : coque moteur_spike 1 explicite sans moteur : moteur_absent à surveiller (non bloquante, enregistrable) ; coque Spike avec moteur : aucune alerte
// H-3 auto-ciblage        nominal : 2 systèmes + 1 arme → refus « Limite dépassée : 2 système(s) d'auto-ciblage pour 1 arme(s) » ; 2 systèmes + 2 armes → rien
//                         bords   : 1 + 1 rien ; 1 + 0 refus ; une arme en quantité 2 compte 2 ; 3 + 2 → texte 3/2 ; exclusion : un aménagement sans limite_par n'est pas lié aux armes
// H-6 vitesse négative    nominal : vitesse 0 − 1 → −1 + alerte à surveiller ; bords : 3 − 1 = 2 et 1 − 1 = 0 sans alerte ; 0 sans malus → 0 sans alerte ; −9 → −9
// H-7 classe d'arme       nominal : arme classe 2 sur coque 1 → bloquante, refus 422 ; bords : classe égale passe, supérieure passe, arme 3 sur coque 2 bloquée (doc E-22)
// B-94 anciens            conception enregistrée puis catalogue durci : relue avec l'alerte, résultat et version inchangés, lecture sans écriture ; enregistrement refusé ; Vent d'Orak inchangé
// Import / empreinte      moteur_spike 0/1 et limite_par « armes » acceptés, relus ; autres valeurs refusées avec leur champ ; un seul champ qui change = 1 ligne modifiée
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './serveur-lot-vaisseaux.ts';

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
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 30, masse: 30, emports: 4, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const arme = { ...el, emport: 1, munitions: 0, cout_munition: 0 };

const catalogue = (version = 'rc-1', plus: Any = {}): Any => ({
  catalogue: 'swn/vaisseaux', version,
  coques: [
    { cle: 'croiseur-f3', nom: 'Croiseur F3', classe: 2, ...coque, facteur_masse: 3, vitesse: 3, armure: 5 },
    { cle: 'fregate-f2', nom: 'Frégate F2', classe: 1, ...coque, facteur_masse: 2, vitesse: 3, armure: 5 },
    { cle: 'capital-f4', nom: 'Capital F4', classe: 4, ...coque, facteur_masse: 4, vitesse: 3, armure: 5 },
    { cle: 'chasseur-f1', nom: 'Chasseur F1', classe: 1, ...coque, vitesse: 3, armure: 5 },
    { cle: 'lent', nom: 'Lent', classe: 1, ...coque, vitesse: 0, armure: 0 },
    { cle: 'vitesse-1', nom: 'Vitesse 1', classe: 1, ...coque, vitesse: 1, armure: 5 },
    { cle: 'station-s', nom: 'Station S', classe: 2, ...coque, moteur_spike: 0 },
    { cle: 'spike-1', nom: 'Spike explicite', classe: 2, ...coque, vitesse: 3, armure: 5, moteur_spike: 1 },
  ],
  moteurs: [{ cle: 'spike-2', nom: 'Spike 2', niveau: 2, ...el }],
  amenagements: [
    { cle: 'atelier', nom: 'Atelier', ...el, masse: 0.5, x_masse: true },
    { cle: 'demi', nom: 'Demi-masse', ...el, masse: 0.5 },
    { cle: 'poids-1', nom: 'Poids 1', ...el, masse: 1, x_masse: true },
    { cle: 'auto', nom: 'Auto-ciblage', ...el, limite_par: 'armes' },
    { cle: 'banal', nom: 'Banal', ...el },
  ],
  defenses: [
    { cle: 'plaque', nom: 'Plaque', ...el, bonus_vitesse: -1 },
    { cle: 'plaque-9', nom: 'Plaque 9', ...el, bonus_vitesse: -9 },
  ],
  armes: [
    { cle: 'laser-c1', nom: 'Laser C1', ...arme, classe_min: 1 },
    { cle: 'canon-c2', nom: 'Canon C2', ...arme, classe_min: 2 },
    { cle: 'canon-c3', nom: 'Canon C3', ...arme, classe_min: 3 },
  ],
  modifications: [], exemples: [],
  ...plus,
});

interface Monde { E: number; V: string; antor: Client; lea: Client; etoile: number; orak: number }

async function monde(cat: Any = catalogue()): Promise<Monde> {
  const srv = await startServer();
  servers.push(srv);
  const antor = await session(srv.base, 'antor');
  const lea = await session(srv.base, 'lea');
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  const r = await antor('POST', `${V}/catalogue/application`, cat);
  assert.equal(r.status, 200, r.texte);
  assert.equal(r.json.refusTotal, 0, r.texte);
  const liste = (await antor('GET', `${V}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  return { E, V, antor, lea, etoile: fid('Étoile du soir'), orak: fid("Vent d'Orak") };
}

const l = (nature: string, cle: string, quantite = 1) => ({ nature, cle, quantite });
const sur = (coqueCle: string, choix: Any[], plus: Any = {}) => ({ coque: coqueCle, choix, ...plus });
const calc = (m: Monde, corps: Any) => m.lea('POST', `${m.V}/calcul`, corps);
const codes = (r: Rep) => (r.json.alertes as Any[]).map((a) => `${a.niveau}:${a.code}`);
const alerte = (r: Rep, code: string): Any => (r.json.alertes as Any[]).find((a) => a.code === code);
async function enregistrer(m: Monde, corps: Any): Promise<Rep> {
  const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
  return m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { ...corps, version: vue.version });
}

describe('B-90 H-1 : le produit d’un dièse est arrondi à l’entier supérieur, installation par installation', () => {
  it('Atelier (masse 0,5 #) : croiseur de facteur 3 et masse 30 → 28 ; frégate de facteur 2 et masse 30 → 29', async () => {
    const m = await monde();
    const a = await calc(m, sur('croiseur-f3', [l('amenagements', 'atelier')]));
    assert.equal(a.status, 200, a.texte);
    assert.equal(a.json.resultat.masseLibre, 28);
    assert.equal((await calc(m, sur('fregate-f2', [l('amenagements', 'atelier')]))).json.resultat.masseLibre, 29);
  });

  it('bords : trois ateliers sur le facteur 3 → 24 (6 au total, ni 4,5 ni 5) ; facteur 4 → 28 (2 exact) ; facteur 1 → 29 (0,5 monte à 1)', async () => {
    const m = await monde();
    const libre = async (c: string, q: number) => (await calc(m, sur(c, [l('amenagements', 'atelier', q)]))).json.resultat.masseLibre;
    assert.equal(await libre('croiseur-f3', 3), 24);
    assert.equal(await libre('capital-f4', 1), 28);
    assert.equal(await libre('chasseur-f1', 1), 29);
  });

  it('exclusions : une masse 0,5 sans dièse reste exacte (3 sur le facteur 3 → 28,5) ; un dièse au produit entier ne bouge pas (masse 1 ×3 → 27)', async () => {
    const m = await monde();
    assert.equal((await calc(m, sur('croiseur-f3', [l('amenagements', 'demi', 3)]))).json.resultat.masseLibre, 28.5);
    assert.equal((await calc(m, sur('croiseur-f3', [l('amenagements', 'poids-1')]))).json.resultat.masseLibre, 27);
  });

  it('la conception enregistrée avec trois ateliers sur le croiseur se relit avec une masse libre de 24', async () => {
    const m = await monde();
    const s = await enregistrer(m, sur('croiseur-f3', [l('amenagements', 'atelier', 3)]));
    assert.equal(s.status, 200, s.texte);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.resultat.masseLibre, 24);
  });
});

describe('B-90 H-2 : une station sans moteur Spike est acceptée, un vaisseau à coque Spike sans moteur reste à surveiller', () => {
  it('station sans moteur : aucune alerte, vitesse et portée de saut nulles (N/A), enregistrement accepté', async () => {
    const m = await monde();
    const r = await calc(m, sur('station-s', []));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(codes(r), []);
    assert.equal(r.json.resultat.porteeSaut, null);
    assert.equal(r.json.resultat.vitesse, null);
    const s = await enregistrer(m, sur('station-s', []));
    assert.equal(s.status, 200, s.texte);
  });

  it('coque Spike (moteur_spike 1 explicite, et par défaut) sans moteur : moteur_absent à surveiller, jamais bloquante, enregistrable', async () => {
    const m = await monde();
    for (const c of ['spike-1', 'croiseur-f3']) {
      const r = await calc(m, sur(c, []));
      assert.deepEqual(codes(r), ['a_surveiller:moteur_absent'], c);
      assert.equal(alerte(r, 'moteur_absent').texte, 'Aucun moteur de saut : ce vaisseau ne peut pas voyager.');
    }
    const s = await enregistrer(m, sur('spike-1', []));
    assert.equal(s.status, 200, s.texte);
  });

  it('coque Spike avec un moteur Spike : aucune alerte', async () => {
    const m = await monde();
    assert.deepEqual(codes(await calc(m, sur('croiseur-f3', [l('moteurs', 'spike-2')]))), []);
  });

  it('échec : un moteur Spike sur une station est bloquant (moteur_sur_station) et l’enregistrement est refusé', async () => {
    const m = await monde();
    const r = await calc(m, sur('station-s', [l('moteurs', 'spike-2')]));
    assert.deepEqual(codes(r), ['bloquante:moteur_sur_station']);
    assert.equal(alerte(r, 'moteur_sur_station').texte, '« Spike 2 » : une station n\'a pas de moteur de saut ni de moteur système.');
    const s = await enregistrer(m, sur('station-s', [l('moteurs', 'spike-2')]));
    assert.equal(s.status, 422, s.texte);
    assert.equal(s.json.code, 'conception_bloquee');
  });
});

describe('B-90 H-3 : l’auto-ciblage va une fois par arme', () => {
  const texte = (n: number, a: number) => `Limite dépassée : ${n} système(s) d'auto-ciblage pour ${a} arme(s)`;
  const auto = (q: number) => l('amenagements', 'auto', q);

  it('deux auto-ciblages et une seule arme : refus bloquant, enregistrement refusé ; avec deux armes, aucun', async () => {
    const m = await monde();
    const un = await calc(m, sur('croiseur-f3', [auto(2), l('armes', 'laser-c1')]));
    assert.deepEqual(codes(un).filter((c) => c.includes('limite')), ['bloquante:limite_depassee']);
    assert.equal(alerte(un, 'limite_depassee').texte, texte(2, 1));
    const s = await enregistrer(m, sur('croiseur-f3', [auto(2), l('armes', 'laser-c1')]));
    assert.equal(s.status, 422, s.texte);
    const deux = await calc(m, sur('croiseur-f3', [auto(2), l('armes', 'laser-c1'), l('armes', 'canon-c2')]));
    assert.deepEqual(codes(deux).filter((c) => c.includes('limite')), []);
  });

  it('bords : 1 pour 1 passe ; 1 sans arme est refusé (0 arme) ; une arme en quantité 2 compte pour 2 ; 3 pour 2 armes est refusé', async () => {
    const m = await monde();
    const lim = async (choix: Any[]) => codes(await calc(m, sur('croiseur-f3', choix))).filter((c) => c.includes('limite'));
    assert.deepEqual(await lim([auto(1), l('armes', 'laser-c1')]), []);
    const zero = await calc(m, sur('croiseur-f3', [auto(1)]));
    assert.equal(alerte(zero, 'limite_depassee').texte, texte(1, 0));
    assert.deepEqual(await lim([auto(2), l('armes', 'laser-c1', 2)]), []);
    const trois = await calc(m, sur('croiseur-f3', [auto(3), l('armes', 'laser-c1', 2)]));
    assert.equal(alerte(trois, 'limite_depassee').texte, texte(3, 2));
  });

  it('exclusion : un aménagement sans limite_par n’est lié à aucune arme (5 exemplaires, aucune arme, aucune alerte de limite)', async () => {
    const m = await monde();
    assert.deepEqual(codes(await calc(m, sur('croiseur-f3', [l('amenagements', 'banal', 5)]))).filter((c) => c.includes('limite')), []);
  });
});

describe('B-90 H-6 : la vitesse peut être négative, l’armure garde son plancher', () => {
  it('coque de vitesse 0 et défense −1 : vitesse −1 (jamais 0), alerte vitesse_negative à surveiller (non bloquante), armure 0, enregistrable', async () => {
    const m = await monde();
    const r = await calc(m, sur('lent', [l('defenses', 'plaque')]));
    assert.equal(r.json.resultat.vitesse, -1);
    assert.equal(r.json.resultat.armure, 0);
    assert.equal(alerte(r, 'vitesse_negative').niveau, 'a_surveiller');
    assert.equal(alerte(r, 'vitesse_negative').texte, 'Vitesse négative : malus aux jets de Pilotage');
    const s = await enregistrer(m, sur('lent', [l('defenses', 'plaque')]));
    assert.equal(s.status, 200, s.texte);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.resultat.vitesse, -1);
  });

  it('bords : 3 − 1 = 2 et 1 − 1 = 0 sans alerte ; 0 sans malus = 0 sans alerte ; −9 sur vitesse 0 = −9 avec alerte', async () => {
    const m = await monde();
    const a = await calc(m, sur('chasseur-f1', [l('defenses', 'plaque')]));
    assert.equal(a.json.resultat.vitesse, 2);
    const b = await calc(m, sur('vitesse-1', [l('defenses', 'plaque')]));
    assert.equal(b.json.resultat.vitesse, 0);
    const c = await calc(m, sur('lent', []));
    assert.equal(c.json.resultat.vitesse, 0);
    for (const r of [a, b, c]) assert.equal(alerte(r, 'vitesse_negative'), undefined);
    const d = await calc(m, sur('lent', [l('defenses', 'plaque-9')]));
    assert.equal(d.json.resultat.vitesse, -9);
    assert.ok(alerte(d, 'vitesse_negative'));
  });
});

describe('B-90 H-7 : la classe minimale d’une arme est appliquée', () => {
  it('arme de classe 2 sur coque de classe 1 : classe_inadaptee bloquante sur sa ligne, enregistrement refusé', async () => {
    const m = await monde();
    const r = await calc(m, sur('fregate-f2', [l('armes', 'canon-c2')]));
    assert.equal(alerte(r, 'classe_inadaptee').niveau, 'bloquante');
    assert.equal(alerte(r, 'classe_inadaptee').texte, '« Canon C2 » : classe de coque 2 au moins.');
    assert.equal(alerte(r, 'classe_inadaptee').ligne, 0);
    const s = await enregistrer(m, sur('fregate-f2', [l('armes', 'canon-c2')]));
    assert.equal(s.status, 422, s.texte);
    assert.equal(s.json.code, 'conception_bloquee');
  });

  it('bords : classe égale passe (1 sur 1, 2 sur 2) ; coque supérieure passe (1 sur 2) ; arme de classe 3 sur coque 2 bloquée avec « classe de coque 3 au moins »', async () => {
    const m = await monde();
    const bloc = async (c: string, a: string) => codes(await calc(m, sur(c, [l('armes', a)]))).filter((x) => x.includes('classe'));
    assert.deepEqual(await bloc('fregate-f2', 'laser-c1'), []);
    assert.deepEqual(await bloc('croiseur-f3', 'canon-c2'), []);
    assert.deepEqual(await bloc('croiseur-f3', 'laser-c1'), []);
    const r = await calc(m, sur('croiseur-f3', [l('armes', 'canon-c3')]));
    assert.equal(alerte(r, 'classe_inadaptee').texte, '« Canon C3 » : classe de coque 3 au moins.');
  });

  it('la ligne bloquante est celle de l’arme : une arme admise en ligne 0, une arme trop haute en ligne 1', async () => {
    const m = await monde();
    const r = await calc(m, sur('croiseur-f3', [l('armes', 'laser-c1'), l('armes', 'canon-c3')]));
    assert.equal(alerte(r, 'classe_inadaptee').ligne, 1);
  });
});

describe('B-94 : ce qui est enregistré avant se relit comme avant', () => {
  it('une conception avec une arme devenue trop basse se relit avec l’alerte, sans changer de résultat ni de version, et n’est réécrite qu’à l’enregistrement', async () => {
    const m = await monde();
    const s = await enregistrer(m, sur('fregate-f2', [l('moteurs', 'spike-2'), l('armes', 'laser-c1')]));
    assert.equal(s.status, 200, s.texte);
    const avant = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    // The catalogue now asks class 2 of the same weapon: the design was saved when class 1 was enough.
    const durci = catalogue('rc-2', { armes: [
      { cle: 'laser-c1', nom: 'Laser C1', ...arme, classe_min: 2 },
      { cle: 'canon-c2', nom: 'Canon C2', ...arme, classe_min: 2 },
      { cle: 'canon-c3', nom: 'Canon C3', ...arme, classe_min: 3 },
    ] });
    const i = await m.antor('POST', `${m.V}/catalogue/application`, durci);
    assert.equal(i.status, 200, i.texte);
    assert.equal(i.json.refusTotal, 0, i.texte);
    const apres = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.deepEqual((apres.alertes as Any[]).map((a) => a.code), ['classe_inadaptee']);
    assert.equal(apres.alertes[0].niveau, 'bloquante');
    assert.equal(apres.resultat.prix, avant.resultat.prix);
    assert.equal(apres.resultat.prix, 300000);
    assert.equal(apres.version, avant.version);
    assert.deepEqual((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.version, avant.version);
    const refus = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { ...sur('fregate-f2', [l('moteurs', 'spike-2'), l('armes', 'laser-c1')]), version: apres.version });
    assert.equal(refus.status, 422, refus.texte);
    const ok = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { ...sur('fregate-f2', [l('moteurs', 'spike-2')]), version: apres.version });
    assert.equal(ok.status, 200, ok.texte);
  });

  it('un catalogue qui ne dit rien des nouveaux champs se lit comme avant : « Vent d’Orak » 685 000 cr, 30 PV, CA 14, aucune alerte', async () => {
    const m = await monde();
    const orak = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.equal(orak.resultat.prix, 685000);
    assert.equal(orak.resultat.pv, 30);
    assert.equal(orak.resultat.ca, 14);
    assert.deepEqual(orak.alertes, []);
  });
});

describe('H-10 (5) : l’import accepte moteur_spike et limite_par, qui entrent dans l’empreinte', () => {
  const importer = (m: Monde, cat: Any) => m.antor('POST', `${m.V}/catalogue/application`, cat);
  const refus = (r: Rep) => Object.fromEntries((r.json.refus as Any[]).map((x) => [x.cle, x.champ]));
  const ligne = async (m: Monde, nature: string, cle: string) => ((await m.antor('GET', `${m.V}/catalogue?nature=${nature}`)).json.elements as Any[]).find((e) => e.cle === cle);

  it('moteur_spike 0 et 1 et limite_par « armes » passent et se relisent ; 2, −1, « oui » et limite_par « moteurs » sont refusés avec leur champ, les autres lignes passent', async () => {
    const m = await monde();
    const cat = catalogue('i-1', {
      coques: [
        { cle: 'i-ok0', nom: 'I ok0', classe: 2, ...coque, moteur_spike: 0 },
        { cle: 'i-ok1', nom: 'I ok1', classe: 2, ...coque, moteur_spike: 1 },
        { cle: 'i-deux', nom: 'I deux', classe: 2, ...coque, moteur_spike: 2 },
        { cle: 'i-neg', nom: 'I neg', classe: 2, ...coque, moteur_spike: -1 },
        { cle: 'i-txt', nom: 'I txt', classe: 2, ...coque, moteur_spike: 'oui' },
      ],
      amenagements: [
        { cle: 'a-ok', nom: 'A ok', ...el, limite_par: 'armes' },
        { cle: 'a-ko', nom: 'A ko', ...el, limite_par: 'moteurs' },
      ],
    });
    const r = await importer(m, cat);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(refus(r), { 'i-deux': 'moteur_spike', 'i-neg': 'moteur_spike', 'i-txt': 'moteur_spike', 'a-ko': 'limite_par' });
    assert.equal((await ligne(m, 'coques', 'i-ok0')).donnees.moteur_spike, 0);
    assert.equal((await ligne(m, 'coques', 'i-ok1')).donnees.moteur_spike, 1);
    assert.equal((await ligne(m, 'amenagements', 'a-ok')).donnees.limite_par, 'armes');
    assert.equal(await ligne(m, 'coques', 'i-deux'), undefined);
    assert.equal(await ligne(m, 'amenagements', 'a-ko'), undefined);
  });

  it('empreinte : rejouer le même catalogue ne modifie rien ; changer le seul moteur_spike d’une coque, ou le seul limite_par d’un aménagement, modifie une ligne', async () => {
    const m = await monde();
    const rejeu = await importer(m, catalogue());
    assert.deepEqual([rejeu.json.natures.coques.modifies, rejeu.json.natures.amenagements.modifies], [0, 0]);
    const coques = catalogue().coques.map((c: Any) => (c.cle === 'station-s' ? { ...c, moteur_spike: 1 } : c));
    const a = await importer(m, catalogue('rc-2', { coques }));
    assert.deepEqual([a.json.natures.coques.modifies, a.json.natures.amenagements.modifies], [1, 0]);
    const amen = catalogue().amenagements.map((x: Any) => (x.cle === 'auto' ? { ...x, limite_par: undefined } : x));
    const b = await importer(m, catalogue('rc-3', { coques, amenagements: amen }));
    assert.deepEqual([b.json.natures.coques.modifies, b.json.natures.amenagements.modifies], [0, 1]);
    assert.equal((await ligne(m, 'coques', 'station-s')).donnees.moteur_spike, 1);
    assert.equal((await ligne(m, 'amenagements', 'auto')).donnees.limite_par, undefined);
  });
});
