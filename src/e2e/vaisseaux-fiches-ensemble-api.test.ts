// Feature-level black-box tests of kanevas-outils-format-vaisseaux-fiches (B-82), HTTP level: real server in stub mode with the stub seed,
// real SQLite. Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (P-19 step 2), docs/ecrans.md (« What
// kanevas-outils-format-vaisseaux-fiches builds of E-22 »: texts, rule sheets, E-9) and, for what is delivered without a screen
// (import, calculation, stored crew), ARCHITECTURE.md F-1 to F-4. The trial catalogue is written here, invented, absent from the seed
// (F-8). Every expected value is a literal calculated by hand; none is read back from the code under test.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player and author of « Vent d'Orak » and « Étoile du soir »)
// Hand-calculated figures: hull Frégate R (class 2) speed 3, armour 5, crew 6 to 20; Voiles +1 speed each.
// B-82 coque      nominal : Frégate R + 1 Voiles → vitesse 4, armure 5, équipage { choisi 6, min 6, max 20 } (default = hull minimum)
//                 bords   : 2 Voiles → 5 ; hull without speed + Voiles → null ; hull without any stated value → null, null, null
// B-82 équipage   bords   : 5 → « Équipage insuffisant : 5 sur 6 au moins. » (watch, saves) ; 6 and 20 → no alert ; 21 → « Équipage excessif :
//                           21 sur 20 au plus. » ; a hull with a minimum only: 3 → insuffisant, 100000 → nothing
//                 échec   : −1, 100001, 2.5, "5" → 400 equipage_invalide champ equipage ; 100000 accepted ; null = absent (default)
//                 exclusions : a hull stating nothing raises no crew alert whatever the number ; the crew is stored with the design
// B-82 classe     nominal : Hangar (min 3) on class 2 → blocking « classe de coque 3 au moins. », save 422 and nothing written
//                 bords   : class 3 passes ; Salle (2 to 3) passes on 2 and 3, blocked on 4 (« 3 au plus. ») ; Étroit (max 1) blocked on 2,
//                           passes on 1 ; Cale (2 to 2) passes on 2, blocked on 3 (« 2 seulement. »)
// B-82 import     nominal : preview writes nothing ; application creates (ajoutes) ; replay unchanged (inchanges) ; read back by the API
//                           (hull, weapon, example crew) ; a changed value is « modifie »
//                 échec   : malformed fields refused with their champ and the rest of the file passes
//                 exclusions : the trial seed files state none of the new fields
// B-82 règles     nominal : rule sheets gain the columns only when a row states the value, « — » for the others
//                 exclusions : a catalogue stating none prints the tables as before ; E-9's text gains no row
// B-82 E-9        nominal : « Caractéristiques » of a saved design reads Vitesse, Armure, Équipage after Portée de saut
// Ancien          : the seed designs and the seven example ships give the figures they gave before
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
const coque = { cout: 100000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const arme = { emport: 1, munitions: 0, cout_munition: 0, ...el };
/** The invented trial catalogue of the slice, as the dialog of E-20 would send it (version changes per import). */
const catalogue = (version = 'fiches-1', surcharge: Any = {}): Any => ({
  catalogue: 'swn/vaisseaux', version,
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5, equipage_min: 6, equipage_max: 20 },
    { cle: 'croiseur-r', nom: 'Croiseur R', classe: 3, ...coque, vitesse: 2 },
    { cle: 'cuirasse-r', nom: 'Cuirassé R', classe: 4, ...coque },
    { cle: 'sans-vitesse-r', nom: 'Sans vitesse R', classe: 2, ...coque, armure: 1 },
    { cle: 'mini-r', nom: 'Mini R', classe: 1, ...coque, equipage_min: 4 },
  ],
  amenagements: [
    { cle: 'hangar', nom: "Hangar d'essai", ...el, classe_min: 3, condition: 'Technologie 4 | 5, coût doublé' },
    { cle: 'salle', nom: "Salle d'essai", ...el, classe_min: 2, classe_max: 3 },
    { cle: 'etroit', nom: "Étroit d'essai", ...el, classe_max: 1 },
    { cle: 'cale', nom: "Cale d'essai", ...el, classe_min: 2, classe_max: 2 },
    { cle: 'libre', nom: "Libre d'essai", ...el },
  ],
  defenses: [{ cle: 'voiles', nom: "Voiles d'essai", ...el, bonus_vitesse: 1, condition: 'Technologie 4' }],
  armes: [{ cle: 'canon-r', nom: 'Canon R', ...arme, degats: '1d8', perforation: 3, qualites: 'Bruyant', niveau_tech: 3 }],
  exemples: [{ cle: 'ex-r', nom: 'Exemple R', coque: 'fregate-r', choix: [], equipage: 8 }],
  ...surcharge,
});

interface Monde { E: number; V: string; antor: Client; lea: Client; teo: Client; orak: number; etoile: number; aube: number }

async function monde(importer = true): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const antor = await session(srv.base, 'antor');
  const lea = await session(srv.base, 'lea');
  const teo = await session(srv.base, 'teo');
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  if (importer) {
    const r = await antor('POST', `${V}/catalogue/application`, catalogue());
    assert.equal(r.status, 200, r.texte);
  }
  const liste = (await antor('GET', `${V}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  return { E, V, antor, lea, teo, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir'), aube: liste.fichesSansConception.find((f: Any) => f.titre === 'Aube de Sel').ficheId };
}

const l = (nature: string, cle: string, quantite = 1) => ({ nature, cle, quantite });
const calc = (m: Monde, corps: Any) => m.lea('POST', `${m.V}/calcul`, corps);
const codes = (r: Rep): string[] => r.json.alertes.map((a: Any) => a.code);
const plat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

describe('B-82 coque : vitesse, armure, équipage dits par la coque', () => {
  it('Frégate R + 1 Voiles : vitesse 4, armure 5, équipage 6 (minimum de la coque par défaut, bornes 6 et 20)', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'fregate-r', choix: [l('defenses', 'voiles')] });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.vitesse, 4);
    assert.equal(r.json.resultat.armure, 5);
    assert.deepEqual(r.json.resultat.equipage, { choisi: 6, min: 6, max: 20 });
    assert.deepEqual(codes(r).filter((c) => /equipage|classe/.test(c)), []);
  });

  it('bords : 2 Voiles → vitesse 5 ; une coque sans vitesse + Voiles → vitesse null ; armure seule → armure 1, vitesse null', async () => {
    const m = await monde();
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [l('defenses', 'voiles', 2)] })).json.resultat.vitesse, 5);
    const r = await calc(m, { coque: 'sans-vitesse-r', choix: [l('defenses', 'voiles')] });
    assert.equal(r.json.resultat.vitesse, null);
    assert.equal(r.json.resultat.armure, 1);
  });

  it('exclusion : une coque qui ne dit rien (Éclaireur du catalogue d’essai) rend vitesse, armure et équipage null, sans alerte d’équipage', async () => {
    const m = await monde();
    const r = await calc(m, { coque: 'eclaireur', choix: [l('moteurs', 'moteur-1')], equipage: 3 });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.vitesse, null);
    assert.equal(r.json.resultat.armure, null);
    assert.deepEqual(r.json.resultat.equipage, { choisi: 3, min: null, max: null });
    assert.deepEqual(codes(r), []);
    const sans = await calc(m, { coque: 'eclaireur', choix: [l('moteurs', 'moteur-1')] });
    assert.equal(sans.json.resultat.equipage, null, 'no stated crew, no crew line');
  });
});

describe('B-82 équipage : une saisie de la conception, alerte exactement à la borne', () => {
  const alerteEquipage = async (m: Monde, n: number) => (await calc(m, { coque: 'fregate-r', choix: [], equipage: n })).json.alertes.filter((a: Any) => /equipage/.test(a.code));
  it('5 sur 6 au moins : à surveiller ; 6 et 20 : rien ; 21 : « Équipage excessif : 21 sur 20 au plus. »', async () => {
    const m = await monde();
    assert.deepEqual(await alerteEquipage(m, 5), [{ niveau: 'a_surveiller', code: 'equipage_insuffisant', texte: 'Équipage insuffisant : 5 sur 6 au moins.' }]);
    assert.deepEqual(await alerteEquipage(m, 6), []);
    assert.deepEqual(await alerteEquipage(m, 20), []);
    assert.deepEqual(await alerteEquipage(m, 21), [{ niveau: 'a_surveiller', code: 'equipage_excessif', texte: 'Équipage excessif : 21 sur 20 au plus.' }]);
    assert.deepEqual(await alerteEquipage(m, 0), [{ niveau: 'a_surveiller', code: 'equipage_insuffisant', texte: 'Équipage insuffisant : 0 sur 6 au moins.' }]);
  });

  it('coque à minimum seul (4) : 3 lève l’alerte, 100 000 non ; pas de borne haute à dépasser', async () => {
    const m = await monde();
    const a = (n: number) => calc(m, { coque: 'mini-r', choix: [], equipage: n }).then((r) => r.json.alertes.filter((x: Any) => /equipage/.test(x.code)).map((x: Any) => x.texte));
    assert.deepEqual(await a(3), ['Équipage insuffisant : 3 sur 4 au moins.']);
    assert.deepEqual(await a(4), []);
    assert.deepEqual(await a(100000), []);
  });

  it('une alerte d’équipage ne bloque pas l’enregistrement : 5 est enregistré avec la conception et relu', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [], equipage: 5, version: vue.version });
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.resultat.equipage, { choisi: 5, min: 6, max: 20 });
    const relu = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.deepEqual(relu.resultat.equipage, { choisi: 5, min: 6, max: 20 });
    assert.ok(relu.alertes.some((a: Any) => a.texte === 'Équipage insuffisant : 5 sur 6 au moins.'));
  });

  it('enregistrement sans équipage : le minimum de la coque (6) est enregistré', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [], version: vue.version });
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.resultat.equipage, { choisi: 6, min: 6, max: 20 });
  });

  it('échec : −1, 100001, 2.5 et "5" sont refusés (400, equipage_invalide, champ equipage) ; 100000 passe ; null vaut absent', async () => {
    const m = await monde();
    for (const n of [-1, 100001, 2.5, '5']) {
      const r = await calc(m, { coque: 'fregate-r', choix: [], equipage: n });
      assert.equal(r.status, 400, `${JSON.stringify(n)} ${r.texte}`);
      assert.equal(r.json.code, 'equipage_invalide');
      assert.equal(r.json.champ, 'equipage');
    }
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [], equipage: 100000 })).json.resultat.equipage.choisi, 100000);
    assert.equal((await calc(m, { coque: 'fregate-r', choix: [], equipage: null })).json.resultat.equipage.choisi, 6);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const refus = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [], equipage: 100001, version: vue.version });
    assert.equal(refus.status, 400, refus.texte);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.version, vue.version, 'a refused save writes nothing');
  });
});

describe('B-82 classe de coque : un élément trop petit ou trop grand pour la coque lève l’alerte bloquante', () => {
  const bloquantes = async (m: Monde, coque: string, cle: string) =>
    (await calc(m, { coque, choix: [l('amenagements', cle)] })).json.alertes.filter((a: Any) => a.code === 'classe_inadaptee');

  it('Hangar (classe 3 au moins) sur la coque de classe 2 : bloquante, ligne 0, texte exact ; l’enregistrement est refusé et n’écrit rien', async () => {
    const m = await monde();
    assert.deepEqual(await bloquantes(m, 'fregate-r', 'hangar'), [{ niveau: 'bloquante', code: 'classe_inadaptee', texte: "« Hangar d'essai » : classe de coque 3 au moins.", ligne: 0 }]);
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json;
    const avant = (await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html;
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.etoile}`, { coque: 'fregate-r', choix: [l('amenagements', 'hangar')], version: vue.version });
    assert.equal(r.status, 422, r.texte);
    assert.equal(r.json.alertes.some((a: Any) => a.code === 'classe_inadaptee'), true);
    assert.equal((await m.lea('GET', `${m.V}/conceptions/${m.etoile}`)).json.version, vue.version);
    assert.equal((await m.lea('GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html, avant);
  });

  it('bords de classe minimale : Hangar passe sur la classe 3 et sur la classe 4', async () => {
    const m = await monde();
    assert.deepEqual(await bloquantes(m, 'croiseur-r', 'hangar'), []);
    assert.deepEqual(await bloquantes(m, 'cuirasse-r', 'hangar'), []);
  });

  it('classe maximale : Salle (2 à 3) passe sur 2 et 3, « classe de coque 3 au plus. » sur 4 ; Étroit (1 au plus) bloqué sur 2, passe sur 1', async () => {
    const m = await monde();
    assert.deepEqual(await bloquantes(m, 'fregate-r', 'salle'), []);
    assert.deepEqual(await bloquantes(m, 'croiseur-r', 'salle'), []);
    assert.deepEqual((await bloquantes(m, 'cuirasse-r', 'salle')).map((a: Any) => a.texte), ["« Salle d'essai » : classe de coque 3 au plus."]);
    assert.deepEqual((await bloquantes(m, 'fregate-r', 'etroit')).map((a: Any) => a.texte), ["« Étroit d'essai » : classe de coque 1 au plus."]);
    assert.deepEqual(await bloquantes(m, 'mini-r', 'etroit'), []);
  });

  it('bornes égales : Cale (2 à 2) passe sur la classe 2, « classe de coque 2 seulement. » sur la classe 3', async () => {
    const m = await monde();
    assert.deepEqual(await bloquantes(m, 'fregate-r', 'cale'), []);
    assert.deepEqual((await bloquantes(m, 'croiseur-r', 'cale')).map((a: Any) => a.texte), ["« Cale d'essai » : classe de coque 2 seulement."]);
  });

  it('exclusion : un aménagement qui ne dit rien de sa classe ne lève jamais l’alerte, ni une arme', async () => {
    const m = await monde();
    for (const c of ['mini-r', 'fregate-r', 'cuirasse-r']) assert.deepEqual(await bloquantes(m, c, 'libre'), []);
    const r = await calc(m, { coque: 'mini-r', choix: [l('armes', 'canon-r')] });
    assert.equal(codes(r).includes('classe_inadaptee'), false);
  });
});

describe('B-82 import : champs nouveaux créés, inchangés au rejeu, relus par l’API', () => {
  const V = (m: Monde, chemin: string) => `${m.V}${chemin}`;
  it('l’aperçu n’écrit rien ; l’application crée 5 coques, 5 aménagements, 1 défense, 1 arme, 1 exemple ; le rejeu les trouve inchangés', async () => {
    const m = await monde(false);
    const avant = (await m.antor('GET', V(m, '/catalogue?nature=coques'))).json.elements.length;
    const ap = await m.antor('POST', V(m, '/catalogue/apercu'), catalogue('essai-1'));
    assert.equal(ap.status, 200, ap.texte);
    assert.equal(ap.json.natures.coques.ajoutes, 5);
    assert.equal((await m.antor('GET', V(m, '/catalogue?nature=coques'))).json.elements.length, avant, 'preview writes nothing');
    const ok = await m.antor('POST', V(m, '/catalogue/application'), catalogue('essai-1'));
    assert.equal(ok.status, 200, ok.texte);
    const n = ok.json.natures;
    assert.deepEqual([n.coques.ajoutes, n.amenagements.ajoutes, n.defenses.ajoutes, n.armes.ajoutes, n.exemples.ajoutes], [5, 5, 1, 1, 1]);
    assert.equal(ok.json.refusTotal, 0);
    const bis = await m.antor('POST', V(m, '/catalogue/application'), catalogue('essai-2'));
    const b = bis.json.natures;
    assert.deepEqual([b.coques.inchanges, b.amenagements.inchanges, b.defenses.inchanges, b.armes.inchanges, b.exemples.inchanges], [5, 5, 1, 1, 1]);
    assert.deepEqual([b.coques.ajoutes, b.coques.modifies, b.armes.modifies, b.exemples.modifies], [0, 0, 0, 0]);
  });

  it('relecture par l’API : la coque dit sa vitesse, son armure et son équipage ; l’arme ses dégâts, perforation, qualités, niveau ; l’exemple son équipage 8', async () => {
    const m = await monde();
    const coques = (await m.antor('GET', V(m, '/catalogue?nature=coques'))).json.elements;
    const f = coques.find((e: Any) => e.cle === 'fregate-r').donnees;
    assert.deepEqual([f.vitesse, f.armure, f.equipage_min, f.equipage_max], [3, 5, 6, 20]);
    const armes = (await m.antor('GET', V(m, '/catalogue?nature=armes'))).json.elements;
    const c = armes.find((e: Any) => e.cle === 'canon-r').donnees;
    assert.deepEqual([c.degats, c.perforation, c.qualites, c.niveau_tech], ['1d8', 3, 'Bruyant', 3]);
    const ex = (await m.antor('GET', V(m, '/catalogue?nature=exemples'))).json.elements.find((e: Any) => e.cle === 'ex-r').donnees;
    assert.equal(ex.equipage, 8);
    const joueuse = (await m.lea('GET', V(m, '/catalogue?nature=armes'))).json.elements.find((e: Any) => e.cle === 'canon-r').donnees;
    assert.equal(joueuse.degats, '1d8', 'a player reads the same catalogue row');
  });

  it('une valeur changée est « modifie » (vitesse 3 → 4), et un fichier qui supprime le champ aussi', async () => {
    const m = await monde();
    const c2 = catalogue('essai-v2');
    c2.coques[0].vitesse = 4;
    const r = await m.antor('POST', V(m, '/catalogue/application'), c2);
    assert.equal(r.json.natures.coques.modifies, 1);
    assert.equal(r.json.natures.coques.inchanges, 4);
    assert.equal((await m.antor('GET', V(m, '/catalogue?nature=coques'))).json.elements.find((e: Any) => e.cle === 'fregate-r').donnees.vitesse, 4);
    const c3 = catalogue('essai-v3');
    delete c3.coques[0].vitesse;
    const r3 = await m.antor('POST', V(m, '/catalogue/application'), c3);
    assert.equal(r3.json.natures.coques.modifies, 1, 'the file is the truth: a dropped field is a modification');
    assert.equal((await m.antor('GET', V(m, '/catalogue?nature=coques'))).json.elements.find((e: Any) => e.cle === 'fregate-r').donnees.vitesse, undefined);
  });

  it('échec : chaque champ mal formé est refusé avec son champ, les autres éléments du fichier passent', async () => {
    const m = await monde(false);
    const mal = catalogue('mal-1', {
      coques: [
        ...catalogue().coques.slice(0, 1),
        { cle: 'vite-r', nom: 'Vite R', classe: 2, ...coque, vitesse: 100 },
        { cle: 'ordre-r', nom: 'Ordre R', classe: 2, ...coque, equipage_min: 10, equipage_max: 5 },
        { cle: 'texte-r', nom: 'Texte R', classe: 2, ...coque, armure: '5' },
      ],
      amenagements: [
        { cle: 'ok-a', nom: 'OK A', ...el, classe_min: 2 },
        { cle: 'classe-a', nom: 'Classe A', ...el, classe_min: 5 },
        { cle: 'ordre-a', nom: 'Ordre A', ...el, classe_min: 3, classe_max: 2 },
        { cle: 'cond-a', nom: 'Cond A', ...el, condition: 'x'.repeat(201) },
        { cle: 'vide-a', nom: 'Vide A', ...el, condition: '' },
        { cle: 'nul-a', nom: 'Nul A', ...el, classe_max: null },
        { cle: 'hors-a', nom: 'Hors A', ...el, bonus_vitesse: 1 },
      ],
      armes: [
        { cle: 'ok-w', nom: 'OK W', ...arme, degats: '1d8+1' },
        { cle: 'perf-w', nom: 'Perf W', ...arme, perforation: 100 },
        { cle: 'degats-w', nom: 'Degats W', ...arme, degats: 'x'.repeat(41) },
        { cle: 'qual-w', nom: 'Qual W', ...arme, qualites: 'q'.repeat(121) },
        { cle: 'nt-w', nom: 'NT W', ...arme, niveau_tech: 10 },
        { cle: 'cond-w', nom: 'Cond W', ...arme, condition: 'non' },
      ],
      defenses: [{ cle: 'bonus-d', nom: 'Bonus D', ...el, bonus_vitesse: 10 }],
      exemples: [{ cle: 'eq-x', nom: 'Eq X', coque: 'fregate-r', choix: [], equipage: 100001 }],
    });
    const r = await m.antor('POST', V(m, '/catalogue/application'), mal);
    assert.equal(r.status, 200, r.texte);
    const refus = new Map<string, string>((r.json.refus as Any[]).map((x) => [`${x.nature}/${x.cle}`, x.champ]));
    assert.deepEqual(Object.fromEntries(refus), {
      'coques/vite-r': 'vitesse', 'coques/ordre-r': 'equipage_max', 'coques/texte-r': 'armure',
      'amenagements/classe-a': 'classe_min', 'amenagements/ordre-a': 'classe_max', 'amenagements/cond-a': 'condition', 'amenagements/vide-a': 'condition',
      'amenagements/nul-a': 'classe_max', 'amenagements/hors-a': 'bonus_vitesse',
      'armes/perf-w': 'perforation', 'armes/degats-w': 'degats', 'armes/qual-w': 'qualites', 'armes/nt-w': 'niveau_tech', 'armes/cond-w': 'condition',
      'defenses/bonus-d': 'bonus_vitesse', 'exemples/eq-x': 'equipage',
    });
    assert.deepEqual([r.json.natures.coques.ajoutes, r.json.natures.amenagements.ajoutes, r.json.natures.armes.ajoutes], [1, 1, 1], 'the rest passes');
    const cles = (n: string) => m.antor('GET', V(m, `/catalogue?nature=${n}`)).then((x) => x.json.elements.filter((e: Any) => e.origine === 'univers').map((e: Any) => e.cle));
    assert.deepEqual(await cles('coques'), ['fregate-r']);
    assert.deepEqual(await cles('amenagements'), ['ok-a']);
    assert.deepEqual(await cles('armes'), ['lance-d-essai', 'ok-w'], 'Lance d’essai is the seed’s own universe weapon');
  });

  it('exclusion : un joueur ne peut pas importer un catalogue', async () => {
    const m = await monde(false);
    const r = await m.lea('POST', V(m, '/catalogue/application'), catalogue('joueuse'));
    assert.ok(r.status === 403 || r.status === 404, `got ${r.status}`);
    assert.equal((await m.antor('GET', V(m, '/catalogue?nature=coques'))).json.elements.some((e: Any) => e.cle === 'fregate-r'), false);
  });

  it('les fichiers d’essai du semis ne disent aucun des champs nouveaux (les décomptes de retrait restent vrais)', () => {
    const nouveaux = ['vitesse', 'armure', 'equipage', 'equipage_min', 'equipage_max', 'classe_max', 'condition', 'bonus_vitesse', 'degats', 'perforation', 'qualites', 'niveau_tech'];
    for (const f of ['catalogue-essai.json', 'catalogue-essai-univers.json']) {
      const txt = readFileSync(`src/outils/swn/exemples/${f}`, 'utf8');
      const cles = new Set<string>();
      const parcours = (v: Any): void => { if (Array.isArray(v)) v.forEach(parcours); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { cles.add(k); parcours(x); } };
      parcours(JSON.parse(txt));
      for (const k of nouveaux) assert.equal(cles.has(k), false, `${f} states ${k}`);
    }
  });
});

describe('B-82 fiches de règles : colonnes nouvelles seulement quand une ligne dit la valeur', () => {
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

  it('catalogue qui ne dit rien : aucune colonne nouvelle dans les sept fiches ; les en-têtes des coques et des armes sont ceux d’avant', async () => {
    const m = await monde(false);
    const s = await sheets(m);
    assert.equal(Object.keys(s).length, 7);
    for (const [cle, t] of Object.entries(s)) assert.doesNotMatch(t, /Vitesse|Armure|Équipage min|Équipage max|Classe min|Classe max|Condition|Bonus de vitesse|Dégâts|Perforation|Qualités|Niveau tech/, cle);
    assert.match(s['regles-coques'], /Nom Classe Coût PV CA Puissance Masse Emports Facteur de coût Facteur de puissance Facteur de masse Croiseur d'essai 3 1 000 000 cr 60 15 50 40 5 10 3 4 Éclaireur 1 20 000 cr 8 14 10 8 1 1 1 1 Frégate d'essai 2 300 000 cr 30 14 20 20 3 5 2 3 $/);
  });

  it('catalogue qui dit les valeurs : coques, aménagements, défenses et armes gagnent leurs colonnes, « — » pour les lignes qui se taisent', async () => {
    const m = await monde();
    const s = await sheets(m);
    assert.match(s['regles-coques'], /Facteur de masse Vitesse Armure Équipage min Équipage max /);
    assert.match(s['regles-coques'], /Croiseur d'essai 3 1 000 000 cr 60 15 50 40 5 10 3 4 — — — —/);
    assert.match(s['regles-coques'], /Frégate R \(Univers\) 2 100 000 cr 20 12 20 20 3 1 1 1 3 5 6 20/);
    assert.match(s['regles-coques'], /Cuirassé R \(Univers\) 4 100 000 cr 20 12 20 20 3 1 1 1 — — — —/);
    assert.match(s['regles-coques'], /Mini R \(Univers\) 1 100 000 cr 20 12 20 20 3 1 1 1 — — 4 —/);
    assert.match(s['regles-amenagements'], /Classe min Classe max Condition /);
    assert.match(s['regles-amenagements'], /Technologie 4 \| 5, coût doublé/, 'the condition is printed as plain text');
    assert.match(s['regles-defenses'], /Masse × coque Condition Bonus de vitesse /);
    assert.doesNotMatch(s['regles-defenses'], /Classe min|Classe max/, 'no defence states a class');
    assert.match(s['regles-defenses'], /Voiles d'essai \(Univers\) 1 000 cr 1 1 0 0 — — — — Technologie 4 1/);
    assert.match(s['regles-armes'], /Dégâts Perforation Qualités Niveau tech\./);
    assert.match(s['regles-armes'], /Canon R \(Univers\) 1 0 0 cr 1 000 cr 1 1 0 0 — — — — 1d8 3 Bruyant 3/);
    assert.match(s['regles-armes'], /Laser 1 0 0 cr 25 000 cr 2 1 0 0 — × coque × coque — — — — —/);
    assert.doesNotMatch(s['regles-moteurs'], /Condition|Classe min/, 'a nature nobody states gains nothing');
    assert.doesNotMatch(s['regles-modifications'], /Condition|Classe min/);
  });
});

describe('B-82 E-9 : « Caractéristiques » d’une conception enregistrée', () => {
  const caracteristiques = async (m: Monde, id: number) =>
    plat((await m.lea('GET', `/api/univers/${m.E}/fiches/${id}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html);

  it('Frégate R, moteur 1, Voiles, équipage 8 : Vitesse 4, Armure 5, Équipage 8 après la portée de saut', async () => {
    const m = await monde();
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    const r = await m.lea('PUT', `${m.V}/conceptions/${m.orak}`, { coque: 'fregate-r', choix: [l('moteurs', 'moteur-1'), l('defenses', 'voiles')], equipage: 8, version: vue.version });
    assert.equal(r.status, 200, r.texte);
    const t = await caracteristiques(m, m.orak);
    assert.match(t, /Portée de saut \d+ cases Vitesse 4 Armure 5 Équipage 8/);
  });

  it('exclusion : les conceptions du semis (catalogue qui ne dit rien) n’ont ni Vitesse, ni Armure, ni Équipage, avant comme après l’import', async () => {
    const m = await monde(false);
    const avant = await caracteristiques(m, m.orak);
    assert.doesNotMatch(avant, /Vitesse|Armure|Équipage/);
    assert.match(avant, /Prix 685 000 cr/);
    const imp = await m.antor('POST', `${m.V}/catalogue/application`, catalogue());
    assert.equal(imp.status, 200);
    assert.equal(await caracteristiques(m, m.orak), avant, 'importing fields rewrites no design text');
    const vue = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.equal(vue.resultat.equipage ?? null, null);
    assert.equal(vue.resultat.vitesse ?? null, null);
  });
});

describe('Catalogue antérieur sans ces champs : même résultat qu’avant', () => {
  const l2 = l;
  it('« Vent d’Orak » (685 000 cr, 30 PV, CA 14) et l’éclaireur armé du catalogue d’essai (54 000 cr, 13 PV, CA 15, 3 jours) sans vitesse, armure ni équipage', async () => {
    const m = await monde(false);
    const orak = (await m.lea('GET', `${m.V}/conceptions/${m.orak}`)).json;
    assert.equal(orak.resultat.prix, 685000);
    assert.equal(orak.resultat.pv, 30);
    assert.equal(orak.resultat.ca, 14);
    assert.deepEqual(orak.alertes, []);
    const r = await calc(m, { coque: 'eclaireur', choix: [l2('moteurs', 'moteur-1'), l2('armes', 'laser'), l2('defenses', 'blindage')] });
    const res = r.json.resultat;
    assert.deepEqual([res.prix, res.pv, res.ca, res.puissanceLibre, res.masseLibre, res.chantierJours, res.entretien, res.porteeSaut], [54000, 13, 15, 6, 4, 3, 2700, 10]);
    assert.deepEqual([res.vitesse, res.armure, res.equipage], [null, null, null]);
    assert.deepEqual(r.json.alertes, []);
  });
});
