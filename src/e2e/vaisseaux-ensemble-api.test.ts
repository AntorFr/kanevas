// Feature-level black-box tests of kanevas-outils-vaisseaux (HTTP level, real server in stub mode with the
// stub's starting data, real SQLite). Written from the feature sheet (« Livre », exit criterion), docs/parcours.md
// (B-68, B-70, B-75, B-76, B-78, P-19) and docs/ecrans.md (E-22), then from the V-2 rules and V-8 routes of
// ARCHITECTURE.md for what is delivered without a screen. Every expected value is a literal calculated by hand
// from the trial catalogue (src/outils/swn/exemples/*.json) and the rules (prix, puissance, masse, ceil(prix/25 000),
// 5 % of the price); none is read back from the code under test.
//
// TEST PLAN (world: « Éneria d'essai » #5, Antor and Mira GM, Léa Player and author of the two designs)
//   B-75 nominal  : « Vent d'Orak » stored result = 685 000 cr, 30 PV, CA 14, puissance libre 4, masse libre 7, 28 jours, 34 250 cr/an
//   B-78 nominal  : the 7 example ships of the trial catalogue (POST calcul) give the hand-calculated figures and alerts
//   B-75 bords    : free power of exactly 0 is only a watch alert and saves; −1 is blocking and refused (422 + alerts);
//                   a hold in quantity 2 (limit 1) is refused; 4 weapons on 3 hardpoints is refused
//   B-75 échec    : the blocking refusal writes nothing (stored result and version unchanged); a calculation writes nothing
//   B-76 / P-19   : the author saves; a second save of the same version is refused with the conflict text
//   B-68 / droits : unreadable design = byte-identical 404 of an unregistered path; list holds readable designs only;
//                   non-author reads « Étoile du soir » without writing (403); a player never creates (403)
//   exclusions    : list gives no count of hidden designs; an account without role gets the 404 for the whole tool
//   B-62 retrait  : withdrawing the hull « Éclaireur » of the universe: blocking « Élément retiré de cet univers », save refused,
//                   section text unchanged, changing the hull lets the save through
//   B-62 masque   : masking « Lance d'essai »: still on « Vent d'Orak », re-saved without alert, absent from Léa's choices
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './harnais.test.ts';

const servers: Server[] = [];
after(() => servers.forEach((s) => s.stop()));

type Rep = { status: number; json: Any; texte: string };
type Client = (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

async function session(base: string, compte: string): Promise<Client> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `compte=${compte}`,
  });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, `no session cookie for ${compte}`);
  return async (methode, chemin, corps) => {
    const rep = await fetch(base + chemin, {
      method: methode,
      headers: { cookie, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const texte = await rep.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* html or empty */ }
    return { status: rep.status, json, texte };
  };
}

interface Monde { E: number; V: string; antor: Client; lea: Client; mira: Client; teo: Client; orak: number; etoile: number; aube: number }

async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const antor = await session(srv.base, 'antor');
  const lea = await session(srv.base, 'lea');
  const mira = await session(srv.base, 'mira');
  const teo = await session(srv.base, 'teo');
  const us = (await antor('GET', '/api/univers')).json as Any[];
  const E = us.find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  const liste = (await antor('GET', `${V}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  return { E, V, antor, lea, mira, teo, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir'), aube: liste.fichesSansConception.find((f: Any) => f.titre === 'Aube de Sel').ficheId };
}

const l = (nature: string, cle: string, quantite = 1) => ({ nature, cle, quantite });
const ORAK = () => [l('moteurs', 'moteur-2'), l('amenagements', 'soute'), l('armes', 'laser'), l('armes', 'lance-d-essai')];
const NON_TROUVE = /Page introuvable\./;

describe('B-75 « Vent d’Orak » : le résultat enregistré par le bouchon', () => {
  it('685 000 cr, 28 jours, 34 250 cr/an, 4 de puissance libre et 7 de masse libre', async () => {
    const m = await monde();
    const r = await m.lea('GET', `${m.V}/conceptions/${m.orak}`);
    assert.equal(r.status, 200);
    const res = r.json.resultat;
    assert.equal(res.prix, 685000);
    assert.equal(res.pv, 30);
    assert.equal(res.ca, 14);
    assert.equal(res.puissanceLibre, 4);
    assert.equal(res.masseLibre, 7);
    assert.deepEqual(res.emports, { utilises: 2, total: 3 });
    assert.equal(res.chantierJours, 28);
    assert.equal(res.entretien, 34250);
    assert.equal(res.porteeSaut, 15);
    assert.deepEqual(r.json.alertes, []);
    assert.equal(r.json.peutEcrire, true);
  });
});

// [clé de l'exemple, coque, choix, prix, pv, ca, puissance libre, masse libre, emports utilisés, emports totaux, chantier, entretien, portée, alertes]
const REFERENCES: Array<[string, string, Any[], number, number, number, number, number, number, number, number, number, number | null, Array<[string, string]>]> = [
  ['eclaireur-nu', 'eclaireur', [l('moteurs', 'moteur-1')], 25000, 8, 14, 8, 7, 0, 1, 1, 1250, 10, []],
  ['eclaireur-arme', 'eclaireur', [l('moteurs', 'moteur-1'), l('armes', 'laser'), l('defenses', 'blindage')], 54000, 13, 15, 6, 4, 1, 1, 3, 2700, 10, []],
  ['fregate-de-ligne', 'fregate', [l('moteurs', 'moteur-2'), l('amenagements', 'cabines'), l('amenagements', 'soute'), l('armes', 'laser', 2)], 700000, 30, 14, 5, 1, 2, 3, 28, 35000, 15, []],
  ['fregate-a-l-extreme', 'fregate', [l('moteurs', 'moteur-2'), l('amenagements', 'cabines', 2), l('armes', 'laser', 3)], 815000, 30, 14, 0, 3, 3, 3, 33, 40750, 15, [['a_surveiller', 'Plus aucune réserve de puissance.']]],
  ['fregate-gourmande', 'fregate', [l('moteurs', 'moteur-2'), l('amenagements', 'cabines', 3), l('armes', 'laser', 3)], 855000, 30, 14, -1, -3, 3, 3, 35, 42750, 15, [['bloquante', 'Puissance insuffisante : −1'], ['bloquante', 'Masse insuffisante : −3']]],
  ['croiseur-de-transport', 'croiseur', [l('moteurs', 'moteur-2'), l('amenagements', 'soute'), l('amenagements', 'cabines'), l('armes', 'laser', 2), l('armes', 'canon-leger'), l('modifications', 'renfort'), l('defenses', 'blindage')], 1966000, 69, 16, 27, 3, 3, 5, 79, 98300, 15, []],
  ['fregate-sans-moteur', 'fregate', [l('amenagements', 'cabines'), l('armes', 'laser')], 465000, 30, 14, 15, 13, 1, 3, 19, 23250, null, [['a_surveiller', 'Aucun moteur de saut : ce vaisseau ne peut pas voyager.']]],
];

describe('B-78 les sept vaisseaux d’exemple du catalogue d’essai', () => {
  for (const [nom, coque, choix, prix, pv, ca, pu, ma, eu, et, ch, ent, saut, alertes] of REFERENCES) {
    it(`${nom} : ${prix} cr, ${ch} jours, puissance libre ${pu}, masse libre ${ma}`, async () => {
      const m = await monde();
      const r = await m.lea('POST', `${m.V}/calcul`, { coque, choix });
      assert.equal(r.status, 200, r.texte);
      const res = r.json.resultat;
      assert.equal(res.prix, prix);
      assert.equal(res.pv, pv);
      assert.equal(res.ca, ca);
      assert.equal(res.puissanceLibre, pu);
      assert.equal(res.masseLibre, ma);
      assert.deepEqual(res.emports, { utilises: eu, total: et });
      assert.equal(res.chantierJours, ch);
      assert.equal(res.entretien, ent);
      assert.equal(res.porteeSaut, saut);
      assert.deepEqual(r.json.alertes.map((a: Any) => [a.niveau, a.texte]), alertes);
    });
  }

  it('un calcul n’écrit rien : « Vent d’Orak » garde sa version et son prix', async () => {
    const m = await monde();
    const avant = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    await m.lea('POST', `${m.V}/calcul`, { coque: 'croiseur', choix: [l('moteurs', 'moteur-2')], ficheId: m.orak });
    const apres = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.equal(apres.version, avant.version);
    assert.equal(apres.resultat.prix, 685000);
  });
});

describe('B-75 enregistrement : alertes bloquantes, bords', () => {
  it('une seconde Lance d’essai : « Puissance insuffisante : −2 », enregistrement refusé, rien d’écrit ; la retirer puis enregistrer passe', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    const trop = [l('moteurs', 'moteur-2'), l('amenagements', 'soute'), l('armes', 'laser'), l('armes', 'lance-d-essai', 2)];
    const calc = await m.lea('POST', `${m.V}/calcul`, { coque: 'fregate', choix: trop, ficheId: m.orak });
    assert.equal(calc.json.resultat.puissanceLibre, -2);
    assert.deepEqual(calc.json.alertes.map((a: Any) => [a.niveau, a.texte]), [['bloquante', 'Puissance insuffisante : −2']]);
    const refus = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix: trop, version: vue.version });
    assert.equal(refus.status, 422, refus.texte);
    assert.equal(refus.json.alertes[0].texte, 'Puissance insuffisante : −2');
    const intact = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.equal(intact.version, vue.version, 'a refused save leaves the version alone');
    assert.equal(intact.resultat.prix, 685000);
    const ok = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix: ORAK(), version: vue.version });
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(ok.json.resultat.prix, 685000);
    assert.ok(ok.json.version > vue.version);
  });

  it('puissance libre exactement 0 : alerte à surveiller seulement, l’enregistrement passe', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    const choix = [l('moteurs', 'moteur-2'), l('amenagements', 'cabines', 2), l('armes', 'laser', 3)];
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix, version: vue.version });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.puissanceLibre, 0);
    assert.deepEqual(r.json.alertes.map((a: Any) => a.niveau), ['a_surveiller']);
  });

  it('puissance libre −1 (et masse −3) : refusé', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    const choix = [l('moteurs', 'moteur-2'), l('amenagements', 'cabines', 3), l('armes', 'laser', 3)];
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix, version: vue.version });
    assert.equal(r.status, 422, r.texte);
    assert.deepEqual(r.json.alertes.map((a: Any) => a.texte), ['Puissance insuffisante : −1', 'Masse insuffisante : −3']);
  });

  it('une soute limitée à 1, prise en 2 : refusée avec « Soute » : 1 au plus.', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    const choix = [l('moteurs', 'moteur-2'), l('amenagements', 'soute', 2)];
    const calc = await m.lea('POST', `${m.V}/calcul`, { coque: 'fregate', choix });
    assert.deepEqual(calc.json.alertes.filter((a: Any) => a.niveau === 'bloquante').map((a: Any) => a.texte), ['« Soute » : 1 au plus.']);
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix, version: vue.version });
    assert.equal(r.status, 422, r.texte);
    assert.equal(r.json.alertes[0].texte, '« Soute » : 1 au plus.');
  });

  it('quatre armes sur trois emports : refusé', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    const choix = [l('moteurs', 'moteur-2'), l('armes', 'canon-leger', 4)];
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix, version: vue.version });
    assert.equal(r.status, 422, r.texte);
    assert.ok(r.json.alertes.some((a: Any) => a.niveau === 'bloquante' && a.texte === 'Emports insuffisants : 4 sur 3'), r.texte);
  });

  it('une conception sans choix (coque seule) : alerte à surveiller « Aucun moteur de saut », prix de la coque', async () => {
    const m = await monde();
    const r = await m.antor('POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' });
    assert.equal(r.status, 201, r.texte);
    assert.equal(r.json.resultat.prix, 20000);
    assert.equal(r.json.resultat.porteeSaut, null);
    assert.deepEqual(r.json.alertes.map((a: Any) => [a.niveau, a.texte]), [['a_surveiller', 'Aucun moteur de saut : ce vaisseau ne peut pas voyager.']]);
  });
});

describe('B-76 · P-19 : « Nouvelle conception » et les droits d’écriture', () => {
  it('Antor crée la conception de « Aube de Sel » avec Léa pour autrice ; Léa l’enregistre ; une seconde création est refusée', async () => {
    const m = await monde();
    const leaId = ((await m.antor('GET', `/api/univers/${m.E}/membres`)).json as Any[] | Any)?.find?.((x: Any) => x.username === 'lea')?.compteId;
    assert.ok(leaId, 'Léa must be listed as a member');
    const c = await m.antor('POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur', auteurId: leaId });
    assert.equal(c.status, 201, c.texte);
    const fiche = (await m.antor('GET', `/api/univers/${m.E}/fiches/${m.aube}`)).json;
    const section = fiche.sections.find((s: Any) => s.titre === 'Caractéristiques');
    assert.ok(section, 'the « Caractéristiques » section is created');
    assert.equal(section.geree.outil, 'swn/vaisseaux');
    assert.equal(section.peutEcrire, false, 'nobody writes a managed section by hand');
    const sauve = await m.lea('PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: [l('moteurs', 'moteur-1')], version: c.json.version });
    assert.equal(sauve.status, 200, sauve.texte);
    assert.equal(sauve.json.resultat.prix, 25000);
    const bis = await m.antor('POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' });
    assert.equal(bis.status, 409);
    assert.equal(bis.json.message, 'Cette fiche a déjà une conception.');
  });

  it('exclusion : Léa (joueuse, autrice) ne crée pas de conception et ne reçoit ni « peutCreer » ni liste de fiches', async () => {
    const m = await monde();
    const liste = await m.lea('GET', `${m.V}/conceptions`);
    assert.equal(liste.json.peutCreer, false);
    assert.equal(liste.json.fichesSansConception, undefined);
    assert.equal((await m.lea('POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' })).status, 403);
  });

  it('deux enregistrements de la même version lue : le second reçoit le message de conflit', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    const a = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix: ORAK(), version: vue.version });
    assert.equal(a.status, 200);
    const b = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix: [l('moteurs', 'moteur-2')], version: vue.version });
    assert.equal(b.status, 409, b.texte);
    assert.equal(b.json.message, "Cette conception a changé depuis que vous l'avez ouverte.");
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json.resultat.prix, 685000, 'the second save wrote nothing');
  });
});

describe('B-68 lecture : qui lit quelle conception', () => {
  it('un joueur sans lecture de « Vent d’Orak » reçoit le 404 identique à un chemin inconnu, et ne le voit pas dans la liste', async () => {
    const m = await monde();
    assert.equal((await m.antor('POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' })).status, 201);
    const refuse = await m.teo('GET', `${m.V}/conceptions/${m.orak}`);
    const inconnu = await m.teo('GET', `${m.V}/conceptions/999999`);
    assert.equal(refuse.status, 404);
    assert.match(refuse.texte, NON_TROUVE);
    assert.equal(refuse.texte, inconnu.texte, 'byte for byte');
    const liste = await m.teo('GET', `${m.V}/conceptions`);
    assert.deepEqual(liste.json.conceptions.map((c: Any) => c.titre), ['Étoile du soir']);
    assert.ok(!/Orak/.test(liste.texte), 'no trace of the hidden design in the list');
    assert.deepEqual(Object.keys(liste.json).sort(), ['conceptions', 'peutCreer']);
  });

  it('un lecteur non auteur lit « Étoile du soir » sans pouvoir écrire : peutEcrire faux, PUT refusé 403, rien d’écrit', async () => {
    const m = await monde();
    await m.antor('POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' });
    const vue = await m.teo('GET', `${m.V}/conceptions/${m.etoile}`);
    assert.equal(vue.status, 200);
    assert.equal(vue.json.peutEcrire, false);
    assert.equal(vue.json.resultat.prix, 50000);
    const put = await m.teo('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'eclaireur', choix: [], version: vue.json.version });
    assert.equal(put.status, 403);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.resultat.prix, 50000);
  });

  it('un compte sans rôle dans l’univers reçoit « Page introuvable. » pour la liste comme pour une conception', async () => {
    const m = await monde();
    const liste = await m.teo('GET', `${m.V}/conceptions`);
    const une = await m.teo('GET', `${m.V}/conceptions/${m.etoile}`);
    assert.equal(liste.status, 404);
    assert.equal(une.status, 404);
    assert.match(liste.texte, NON_TROUVE);
    assert.equal(liste.texte, une.texte);
  });

  it('un compte sans rôle ne peut pas calculer non plus', async () => {
    const m = await monde();
    assert.equal((await m.teo('POST', `${m.V}/calcul`, { coque: 'eclaireur', choix: [] })).status, 404);
  });
});

describe('B-62 · P-19 : élément retiré et élément masqué par Antor', () => {
  it('Antor retire la coque « Éclaireur » : « Étoile du soir » garde son texte, dit « Élément retiré de cet univers » et refuse l’enregistrement jusqu’au changement de coque', async () => {
    const m = await monde();
    const avant = (await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html;
    const r = await m.antor('PUT', `/api/univers/${m.E}/outils/swn/vaisseaux/catalogue/coques/eclaireur/retrait`, { retire: true });
    assert.equal(r.status, 200, r.texte);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const retire = vue.alertes.filter((a: Any) => a.texte.startsWith('Élément retiré de cet univers'));
    assert.equal(retire.length, 1, JSON.stringify(vue.alertes));
    assert.equal(retire[0].niveau, 'bloquante');
    const lecture = (await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html;
    assert.equal(lecture, avant, 'the section keeps its text');
    const liste = (await m.lea('GET', `${m.V}/conceptions`)).json.conceptions.find((c: Any) => c.titre === 'Étoile du soir');
    assert.equal(liste.bloquantes, 1, 'the list badge counts the withdrawn element (E-22, « N bloquante(s) »)');
    // saving the same hull: refused
    const refus = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'eclaireur', choix: [l('moteurs', 'moteur-1'), l('armes', 'laser')], version: vue.version });
    assert.ok(refus.status >= 400 && refus.status < 500 && refus.status !== 404, `refused, got ${refus.status} ${refus.texte}`);
    assert.equal((await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html, avant);
    // the removed hull is no longer offered
    const coques = (await m.lea('GET', `${m.V}/catalogue?nature=coques`)).json.elements.map((e: Any) => e.cle).sort();
    assert.deepEqual(coques, ['croiseur', 'fregate']);
    // changing the hull lets the save through: frégate, engine 1 and laser = 300 000 + 25 000 + 125 000 = 450 000
    const ok = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate', choix: [l('moteurs', 'moteur-1'), l('armes', 'laser')], version: vue.version });
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(ok.json.resultat.prix, 450000);
    assert.deepEqual(ok.json.alertes, []);
  });

  it('Antor masque « Lance d’essai » : Léa la voit toujours sur « Vent d’Orak », réenregistre sans alerte, et ne la trouve plus dans ses choix', async () => {
    const m = await monde();
    const g = (await m.antor('GET', `${m.V}/catalogue/gestion?nature=armes`)).json.elements.find((e: Any) => e.cle === 'lance-d-essai');
    const r = await m.antor('PUT', `${m.V}/catalogue/armes/lance-d-essai/masque`, { masque: true, version: g.version });
    assert.equal(r.status, 200, r.texte);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.ok(vue.lignes.some((x: Any) => x.cle === 'lance-d-essai'), 'still on the design');
    assert.deepEqual(vue.alertes, []);
    const ok = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate', choix: ORAK(), version: vue.version });
    assert.equal(ok.status, 200, ok.texte);
    assert.deepEqual(ok.json.alertes, []);
    assert.equal(ok.json.resultat.prix, 685000);
    const armes = (await m.lea('GET', `${m.V}/catalogue?nature=armes`)).json.elements.map((e: Any) => e.cle).sort();
    assert.deepEqual(armes, ['canon-leger', 'laser']);
    const armesMJ = (await m.antor('GET', `${m.V}/catalogue/gestion?nature=armes`)).json.elements.map((e: Any) => e.cle).sort();
    assert.deepEqual(armesMJ, ['canon-leger', 'lance-d-essai', 'laser'], 'the GM still sees it');
  });
});
