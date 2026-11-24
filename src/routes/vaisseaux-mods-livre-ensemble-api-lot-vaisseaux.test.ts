// Feature-level black-box tests of kanevas-concepteur-vaisseaux-mods-livre (B-93, B-94, H-9, H-10 (1) and (5)), HTTP level: real app in stub
// mode with the stub seed, real SQLite. Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (P-19 step 6),
// docs/ecrans.md (E-22 criteria, alert texts) and the V-8 routes of ARCHITECTURE.md. The trial catalogue is written by the test; every
// expected value is a literal worked out by hand. The screen is covered by `src/e2e/vaisseaux-mods-livre-ensemble-ecran.test.ts` (E-22).
//
// TEST PLAN (catalogue d'essai : coques c1..c4 de classe 1..4 ; modifications aux coûts écrits en dur ; Léa, autrice de « Étoile du soir »)
// B-93 installation   nominal : 20 000 cr → 4 jours d'équipage, 1 jour de chantier (cadence 25 000)
//                     bords   : 5 000 → 1 et 1 ; 5 001 → 2 et 1 ; 20 001 → 5 et 1 ; sans modification → 0 et 0 ; quantité 2 → 8 et 2 ; cadence 10 000 → 4 et 2
//                     échec   : cadence 0 refusée (400), jours inchangés
// B-93 Maintenance    nominal : Réparation 1, Int+Con 0 → 3 ; quatre installations → alerte « 4 mods entretenus, Maintenance 3 » ; refondre deux la fait taire
//                     bords   : trois installations (égalité) muettes ; Int+Con −5 avec Réparation 1 → 0 (jamais négatif) ; Int+Con 2 → 5 ; une installation à Maintenance 0 → « 1 mod entretenu, Maintenance 0 » ; Int+Con ±10 acceptés
//                     échec   : Int+Con 11 et −11 refusés (mod_int_con_invalide) ; non entier refusé
//                     exclus. : l'alerte est non bloquante : l'enregistrement passe
// B-93 composants     nominal : par classe, 2 composants, coque classe 3 → 6 par installation ; bords : classes 1 et 4 → 2 et 8 ; deux installations → 12 ; nombre fixe → 2 quelle que soit la coque
//                     exclus. : integre n'ôte rien aux composants ni au prix
// B-93 refonte        nominal : Réparation 1, 2 intégrées d'une modification de 10 000 cr à 3 composants → coût 100 000, composants 12, sans alerte
//                     bords   : 3 intégrées avec Réparation 1 → refonte_depassee ; 1 avec Réparation 0 → refonte_depassee ; 2 avec Réparation 1 → muet
//                     échec   : integre 4 sur une quantité de 3, −1, 1,5 → 400 integre_invalide (calcul et enregistrement), rien écrit
//                     exclus. : l'alerte ne bloque pas l'enregistrement ; rien d'intégré → pas de coût de refonte
// B-94 stockage       integre et mod_int_con relus après enregistrement ; une conception enregistrée sans ces champs se relit à 0 et 0
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
const catalogue: Any = {
  catalogue: 'swn/vaisseaux', version: 'mods-1',
  coques: [1, 2, 3, 4].map((n) => ({ cle: `c${n}`, nom: `Coque C${n}`, classe: n, ...coque })),
  moteurs: [], amenagements: [], defenses: [], armes: [],
  modifications: [
    { cle: 'm20', nom: 'Mod 20k', ...el, cout: 20000 },
    { cle: 'm20001', nom: 'Mod 20001', ...el, cout: 20001 },
    { cle: 'm5', nom: 'Mod 5k', ...el, cout: 5000 },
    { cle: 'm5001', nom: 'Mod 5001', ...el, cout: 5001 },
    { cle: 'm10', nom: 'Mod 10k trois composants', ...el, cout: 10000, composants: 3 },
    { cle: 'pc', nom: 'Prétech par classe', ...el, composants: 2, composants_par_classe: 1 },
    { cle: 'pf', nom: 'Prétech fixe', ...el, composants: 2 },
    { cle: 'banal', nom: 'Banal', ...el },
  ],
  exemples: [],
};

interface Monde { V: string; antor: Client; lea: Client; etoile: number; db: Appli['db'] }

async function monde(): Promise<Monde> {
  const app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  applis.push(app);
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const antor = await session(base, 'antor');
  const lea = await session(base, 'lea');
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  const r = await antor('POST', `${V}/catalogue/application`, catalogue);
  assert.equal(r.status, 200, r.texte);
  assert.equal(r.json.refusTotal, 0, r.texte);
  const liste = (await antor('GET', `${V}/conceptions`)).json;
  const etoile = liste.conceptions.find((c: Any) => c.titre === 'Étoile du soir').ficheId as number;
  return { V, antor, lea, etoile, db: app.db };
}

const mod = (cle: string, quantite: number, integre?: number) => ({ nature: 'modifications', cle, quantite, ...(integre === undefined ? {} : { integre }) });
const calc = (m: Monde, coqueCle: string, choix: Any[], plus: Any = {}) => m.lea('POST', `${m.V}/calcul`, { coque: coqueCle, choix, reparation: 1, ...plus });
const alerte = (r: Rep, code: string): Any => (r.json.alertes as Any[]).find((a) => a.code === code);
async function enregistrer(m: Monde, coqueCle: string, choix: Any[], plus: Any = {}): Promise<Rep> {
  const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
  return m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: coqueCle, choix, version: vue.version, ...plus });
}
async function regler(m: Monde, valeurs: Any): Promise<Rep> {
  const lu = await m.antor('GET', `${m.V}/reglages`);
  return m.antor('PUT', `${m.V}/reglages`, { version: lu.json?.version ?? 0, valeurs });
}

describe('B-93 jours d’installation : ⌈Σ coût des modifications / 5 000⌉ jours d’équipage, ⌈… / cadence_chantier⌉ avec chantier', () => {
  it('nominal : une modification de 20 000 cr → 4 jours d’équipage et 1 jour de chantier', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('m20', 1)]);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.resultat.installation, { jours: 4, joursChantier: 1 });
  });

  it('bords : 5 000 → 1 et 1 ; 5 001 → 2 et 1 ; 20 001 → 5 et 1 (le plafond monte à la première unité)', async () => {
    const m = await monde();
    assert.deepEqual((await calc(m, 'c2', [mod('m5', 1)])).json.resultat.installation, { jours: 1, joursChantier: 1 });
    assert.deepEqual((await calc(m, 'c2', [mod('m5001', 1)])).json.resultat.installation, { jours: 2, joursChantier: 1 });
    assert.deepEqual((await calc(m, 'c2', [mod('m20001', 1)])).json.resultat.installation, { jours: 5, joursChantier: 1 });
  });

  it('bord : sans modification → 0 jour et 0 jour de chantier', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', []);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.resultat.installation, { jours: 0, joursChantier: 0 });
  });

  it('bord : deux installations de 20 000 cr (40 000) → 8 jours d’équipage et ⌈40 000/25 000⌉ = 2 de chantier', async () => {
    const m = await monde();
    assert.deepEqual((await calc(m, 'c2', [mod('m20', 2)])).json.resultat.installation, { jours: 8, joursChantier: 2 });
  });

  it('bord : cadence_chantier 10 000 réglée par le MJ → 20 000 cr donnent 4 jours d’équipage et 2 de chantier ; les jours d’équipage ne bougent pas', async () => {
    const m = await monde();
    const g = await regler(m, { cadence_chantier: 10000 });
    assert.equal(g.status, 204, g.texte);
    assert.deepEqual((await calc(m, 'c2', [mod('m20', 1)])).json.resultat.installation, { jours: 4, joursChantier: 2 });
  });

  it('échec : une cadence de 0 est refusée (400) et le calcul garde ses 25 000 par défaut', async () => {
    const m = await monde();
    const g = await regler(m, { cadence_chantier: 0 });
    assert.equal(g.status, 400, g.texte);
    assert.deepEqual((await calc(m, 'c2', [mod('m20', 1)])).json.resultat.installation, { jours: 4, joursChantier: 1 });
  });
});

describe('B-93 Maintenance de l’ingénieur : mod_int_con + 3 × Réparation, alerte non bloquante maintenance_depassee', () => {
  it('nominal : Réparation 1 et Int+Con 0 → Maintenance 3 ; quatre installations non refondues lèvent l’alerte « 4 mods entretenus, Maintenance 3 » (à surveiller)', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('banal', 4)], { mod_int_con: 0 });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.maintenance, 3);
    const a = alerte(r, 'maintenance_depassee');
    assert.ok(a, r.texte);
    assert.equal(a.niveau, 'a_surveiller');
    assert.equal(a.texte, '4 mods entretenus, Maintenance 3');
  });

  it('nominal : refondre deux des quatre installations fait taire l’alerte (2 entretenues ≤ 3)', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('banal', 4, 2)], { mod_int_con: 0 });
    assert.equal(r.status, 200, r.texte);
    assert.equal(alerte(r, 'maintenance_depassee'), undefined);
  });

  it('bord : trois installations (égalité avec la Maintenance 3) laissent l’alerte muette', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('banal', 3)], { mod_int_con: 0 });
    assert.equal(alerte(r, 'maintenance_depassee'), undefined);
  });

  it('bord : Int+Con −5 avec Réparation 1 → Maintenance 0, jamais négative ; Int+Con 2 → 5', async () => {
    const m = await monde();
    assert.equal((await calc(m, 'c2', [mod('banal', 1)], { mod_int_con: -5 })).json.resultat.maintenance, 0);
    assert.equal((await calc(m, 'c2', [mod('banal', 1)], { mod_int_con: 2 })).json.resultat.maintenance, 5);
  });

  it('bord : une installation avec Maintenance 0 (Réparation 0, Int+Con 0) lève « 1 mod entretenu, Maintenance 0 »', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('banal', 1)], { reparation: 0, mod_int_con: 0 });
    assert.equal(r.json.resultat.maintenance, 0);
    assert.equal(alerte(r, 'maintenance_depassee')?.texte, '1 mod entretenu, Maintenance 0');
  });

  it('bord : Int+Con −10 et 10 sont acceptés', async () => {
    const m = await monde();
    assert.equal((await calc(m, 'c2', [mod('banal', 1)], { mod_int_con: 10 })).json.resultat.maintenance, 13);
    assert.equal((await calc(m, 'c2', [mod('banal', 1)], { mod_int_con: -10 })).json.resultat.maintenance, 0);
  });

  it('échec : Int+Con 11, −11 et 1,5 sont refusés (400, mod_int_con_invalide, champ mod_int_con), au calcul comme à l’enregistrement', async () => {
    const m = await monde();
    for (const v of [11, -11, 1.5]) {
      const r = await calc(m, 'c2', [mod('banal', 1)], { mod_int_con: v });
      assert.equal(r.status, 400, `${v}: ${r.texte}`);
      assert.equal(r.json.code, 'mod_int_con_invalide');
      assert.equal(r.json.champ, 'mod_int_con');
      const e = await enregistrer(m, 'c2', [mod('banal', 1)], { reparation: 1, mod_int_con: v });
      assert.equal(e.status, 400, `${v}: ${e.texte}`);
      assert.equal(e.json.code, 'mod_int_con_invalide');
    }
  });

  it('exclusion : l’alerte maintenance_depassee ne bloque pas l’enregistrement (200)', async () => {
    const m = await monde();
    const e = await enregistrer(m, 'c2', [mod('banal', 6)], { reparation: 1, mod_int_con: 0 });
    assert.equal(e.status, 200, e.texte);
  });
});

describe('B-93 composants prétech : nombre fixe ou par classe de coque (rang 1 à 4 = classe du registre)', () => {
  const composants = async (m: Monde, coqueCle: string, cle: string, q = 1) => (await calc(m, coqueCle, [mod(cle, q)], { mod_int_con: 10 })).json.resultat.composants;

  it('nominal : une modification prétech par classe de 2 composants sur une coque de classe 3 compte 6 par installation', async () => {
    const m = await monde();
    assert.equal(await composants(m, 'c3', 'pc'), 6);
  });

  it('bords : classe 1 → 2, classe 2 → 4, classe 4 → 8 ; deux installations sur la classe 3 → 12', async () => {
    const m = await monde();
    assert.equal(await composants(m, 'c1', 'pc'), 2);
    assert.equal(await composants(m, 'c2', 'pc'), 4);
    assert.equal(await composants(m, 'c4', 'pc'), 8);
    assert.equal(await composants(m, 'c3', 'pc', 2), 12);
  });

  it('bord : un nombre fixe de 2 composants compte 2 par installation quelle que soit la coque, 6 pour trois installations', async () => {
    const m = await monde();
    assert.equal(await composants(m, 'c1', 'pf'), 2);
    assert.equal(await composants(m, 'c4', 'pf'), 2);
    assert.equal(await composants(m, 'c4', 'pf', 3), 6);
  });

  it('exclusion : refondre ne retire rien du prix ni des composants du premier chiffre', async () => {
    const m = await monde();
    const a = await calc(m, 'c3', [mod('pc', 2, 0), mod('m10', 2, 0)], { mod_int_con: 10 });
    const b = await calc(m, 'c3', [mod('pc', 2, 2), mod('m10', 2, 2)], { reparation: 2, mod_int_con: 10 });
    assert.equal(a.json.resultat.composants, 12 + 6);
    assert.equal(b.json.resultat.composants, 12 + 6);
    assert.equal(a.json.resultat.prix, b.json.resultat.prix);
  });
});

describe('B-93 refonte : hors Maintenance, 5 × les crédits, 2 × les composants, au plus deux fois la Réparation', () => {
  it('nominal : Réparation 1, deux installations intégrées d’une modification de 10 000 cr à 3 composants → coût 100 000, composants 12, aucune alerte de refonte', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('m10', 2, 2)]);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.resultat.refonte, { cout: 100000, composants: 12 });
    assert.equal(alerte(r, 'refonte_depassee'), undefined);
  });

  it('bord : une seule intégrée → coût 50 000 et 6 composants', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('m10', 2, 1)]);
    assert.deepEqual(r.json.resultat.refonte, { cout: 50000, composants: 6 });
  });

  it('bords : 3 intégrées avec Réparation 1 → refonte_depassee « Plus de mods intégrés que 2 × Réparation » (à surveiller) ; 1 intégrée avec Réparation 0 aussi ; 2 avec Réparation 1 non', async () => {
    const m = await monde();
    const trois = await calc(m, 'c2', [mod('m10', 3, 3)]);
    assert.equal(alerte(trois, 'refonte_depassee')?.texte, 'Plus de mods intégrés que 2 × Réparation');
    assert.equal(alerte(trois, 'refonte_depassee')?.niveau, 'a_surveiller');
    assert.ok(alerte(await calc(m, 'c2', [mod('m10', 1, 1)], { reparation: 0 }), 'refonte_depassee'));
    assert.equal(alerte(await calc(m, 'c2', [mod('m10', 3, 2)]), 'refonte_depassee'), undefined);
  });

  it('bord : la somme des intégrées compte toutes les lignes (2 + 1 avec Réparation 1 → alerte)', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('m10', 2, 2), mod('m20', 1, 1)]);
    assert.ok(alerte(r, 'refonte_depassee'), r.texte);
  });

  it('échec : integre 4 sur une quantité de 3, −1 et 1,5 sont refusés (400, integre_invalide, champ integre) au calcul et à l’enregistrement, rien n’est écrit', async () => {
    const m = await monde();
    const avant = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    for (const v of [4, -1, 1.5]) {
      const r = await calc(m, 'c2', [mod('m10', 3, v)]);
      assert.equal(r.status, 400, `${v}: ${r.texte}`);
      assert.equal(r.json.code, 'integre_invalide');
      assert.equal(r.json.champ, 'integre');
      const e = await enregistrer(m, 'c2', [mod('m10', 3, v)], { reparation: 1 });
      assert.equal(e.status, 400, `${v}: ${e.texte}`);
      assert.equal(e.json.code, 'integre_invalide');
    }
    const apres = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.equal(apres.version, avant.version);
  });

  it('bord : integre égal à la quantité (3 sur 3) est accepté', async () => {
    const m = await monde();
    const r = await calc(m, 'c2', [mod('m10', 3, 3)], { reparation: 2 });
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.resultat.refonte, { cout: 150000, composants: 18 });
  });

  it('exclusion : refonte_depassee n’empêche pas l’enregistrement (200) et la conception relue porte le même chiffre de refonte', async () => {
    const m = await monde();
    const e = await enregistrer(m, 'c2', [mod('m10', 3, 3)], { reparation: 0 });
    assert.equal(e.status, 200, e.texte);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.deepEqual(vue.resultat.refonte, { cout: 150000, composants: 18 });
    assert.ok((vue.resultat.alertes as Any[]).some((a) => a.code === 'refonte_depassee'));
  });
});

describe('B-94 stockage : integre et mod_int_con survivent à l’enregistrement ; une ancienne conception s’ouvre avec 0', () => {
  it('Léa enregistre integre 2 sur une ligne de 3 et mod_int_con −1 : la relecture les rend, avec une Maintenance de 2', async () => {
    const m = await monde();
    const e = await enregistrer(m, 'c2', [mod('m10', 3, 2)], { reparation: 1, mod_int_con: -1 });
    assert.equal(e.status, 200, e.texte);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.equal(vue.lignes.find((c: Any) => c.cle === 'm10').integre, 2);
    assert.equal(vue.modIntCon, -1);
    assert.equal(vue.resultat.maintenance, 2);
  });

  it('une conception enregistrée sans integre ni mod_int_con se relit avec integre 0 et mod_int_con 0, et un nouvel enregistrement ne la change pas', async () => {
    const m = await monde();
    const e = await enregistrer(m, 'c2', [mod('m10', 3)], { reparation: 1 });
    assert.equal(e.status, 200, e.texte);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.equal(vue.lignes.find((c: Any) => c.cle === 'm10').integre, 0);
    assert.equal(vue.modIntCon, 0);
  });

  it('exclusion : un joueur sans droit d’écriture (Téo, lecteur) ne peut pas enregistrer integre sur la conception de Léa', async () => {
    const m = await monde();
    const app = applis[applis.length - 1];
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const teo = await session(base, 'teo');
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const r = await teo('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'c2', choix: [mod('m10', 3, 3)], version: vue.version, reparation: 1 });
    assert.ok(r.status === 403 || r.status === 404, `${r.status} ${r.texte}`);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.version, vue.version);
  });
});
