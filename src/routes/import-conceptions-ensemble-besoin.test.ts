// Feature-level black-box tests of kanevas-concepteur-vaisseaux-import-conceptions (B-95, P-22 step 1, I-1 to I-5).
// Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (B-95, P-22) and the contracts of
// ARCHITECTURE.md (I-1 to I-5, V-8), then run through the HTTP door of the import (real server in stub mode, real SQLite,
// real tokens). Every expected figure is a literal calculated by hand from the trial catalogues
// (src/outils/swn/exemples/catalogue-essai*.json) and the rules of docs/vaisseaux-regles.md; none is read back from the code.
//
// TEST PLAN (world « Éneria d'essai » #5, Antor GM; token of Antor reaching #5 with the tool swn/vaisseaux)
//   B-95 nominal   : catalogues then conceptions-essai.json -> 4 creees; éclaireur léger 25 000 cr, libre 8 / 7; éclaireur blindé
//                    29 000 cr, 13 PV, CA 15, libre 8 / 5; frégate de ligne 650 000 cr, libre 5 / 10; croiseur complet carries
//                    magasins, integre, cibles, pj, robots, equipage and PV 68, CA 15, libre 30 / 12; the frégate is readable by Léa
//   I-3 rejeu      : same file -> 4 inchangees, no version moved, no sheet added; one change -> 1 mises_a_jour + 3 inchangees,
//                    the changed price is rewritten; reordered lines -> inchangees
//   I-2 échec      : each refusal (coque, élément inconnu, élément masqué, double, quantité 0 and 100, cible hors lignes,
//                    deux montages sur un élément, alerte bloquante, clé d'une autre fiche) is reported with its champ, the
//                    other items pass and the refused ones leave no sheet
//   jetons         : content token, swn/galaxie token, revoked token -> 401 jeton_invalide and no lot opened; closed lot -> 409
//                    lot_clos; 501 items -> 400; another universe -> 404; tool disabled -> byte-identical to an unknown path
//   exclusions     : without ?lot= nothing is counted; no token value nor sheet title in a response
//   parité         : the stored result of an imported design equals POST calcul of the same design
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './serveur-lot-vaisseaux.ts';

const exemple = (n: string): Any => JSON.parse(readFileSync(new URL(`../outils/swn/exemples/${n}`, import.meta.url), 'utf8'));
const servers: Server[] = [];
after(() => servers.forEach((s) => s.stop()));

type Rep = { status: number; json: Any; texte: string };
type Client = (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

async function appel(base: string, entetes: Record<string, string>, methode: string, chemin: string, corps?: unknown): Promise<Rep> {
  const rep = await fetch(base + chemin, {
    method: methode,
    headers: { ...entetes, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await rep.text();
  let json: Any = null;
  try { json = JSON.parse(texte); } catch { /* html or empty */ }
  return { status: rep.status, json, texte };
}
async function session(base: string, compte: string): Promise<Client> {
  const r = await fetch(`${base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie);
  return (m, c, b) => appel(base, { cookie }, m, c, b);
}

const T = 'swn/vaisseaux';
interface Monde {
  E: number; V: string; antor: Client; lea: Client; srv: Server; jeton: string;
  api: (methode: string, chemin: string, corps?: unknown, jeton?: string) => Promise<Rep>;
  lot: () => Promise<number>;
  conceptions: (lot: number | null, corps: unknown, jeton?: string) => Promise<Rep>;
  catalogues: (lot: number) => Promise<void>;
  detail: (titre: string) => Promise<Any>;
  nbFiches: () => Promise<number>;
}
async function monde(): Promise<Monde> {
  const srv = await startServer();
  servers.push(srv);
  const antor = await session(srv.base, 'antor');
  const lea = await session(srv.base, 'lea');
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const jeton = srv.jeton('antor', E, 'import des conceptions', [T]);
  const api: Monde['api'] = (m, c, b, j = jeton) => appel(srv.base, { authorization: `Bearer ${j}` }, m, `/api/import/v1/univers/${E}${c}`, b);
  // A lot is opened per call; an open lot of the tool is closed first so that each lot counts its own request only.
  let precedent: number | null = null;
  const lot = async () => {
    if (precedent !== null) await api('POST', `/lots/${precedent}/clore`);
    const r = await api('POST', `/lots?outil=${T}`); assert.ok([200, 201].includes(r.status), r.texte);
    precedent = r.json.lotId as number; return precedent;
  };
  // The documented route is `…/outils/swn/vaisseaux/conceptions` (fiche, I-1, README). The B-95 test below plays it alone.
  const conceptions: Monde['conceptions'] = async (l, corps, j) => {
    const q = l === null ? '' : `?lot=${l}`;
    return api('PUT', `/outils/swn/vaisseaux/conceptions${q}`, corps, j);
  };
  const catalogues = async (l: number) => {
    for (const f of ['catalogue-essai.json', 'catalogue-essai-conceptions.json']) {
      const r = await api('PUT', `/outils/swn/vaisseaux/catalogue?niveau=univers&lot=${l}`, exemple(f));
      assert.equal(r.status, 200, r.texte);
    }
  };
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  const detail = async (titre: string) => {
    const liste = (await antor('GET', `${V}/conceptions`)).json.conceptions as Any[];
    const c = liste.find((x) => x.titre === titre);
    assert.ok(c, `no design titled ${titre}`);
    return (await antor('GET', `${V}/conceptions/${c.ficheId}`)).json;
  };
  const nbFiches = async () => ((await antor('GET', `/api/univers/${E}/fiches`)).json.fiches as Any[]).length;
  return { E, V, antor, lea, srv, jeton, api, lot, conceptions, catalogues, detail, nbFiches };
}
const compteurs = (r: Rep) => r.json.natures.conceptions;
const l = (nature: string, cle: string, quantite = 1, plus: Any = {}) => ({ nature, cle, quantite, ...plus });
const bonne = (cle = 'essai-ok', titre = 'Éclaireur correct') => ({ cle, titre, coque: 'eclaireur', choix: [l('moteurs', 'moteur-1')] });

describe('I-1 la route documentée', () => {
  it('PUT /api/v1/univers/:id/outils/swn/vaisseaux/conceptions?lot= importe, comme son alias /api/import/v1', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    const h = { authorization: `Bearer ${m.jeton}` };
    const r = await appel(m.srv.base, h, 'PUT', `/api/v1/univers/${m.E}/outils/swn/vaisseaux/conceptions?lot=${lot}`, exemple('conceptions-essai.json'));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.natures.conceptions, { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });
    const alias = await appel(m.srv.base, h, 'PUT', `/api/import/v1/univers/${m.E}/outils/swn/vaisseaux/conceptions?lot=${lot}`, exemple('conceptions-essai.json'));
    assert.equal(alias.status, 200, alias.texte);
    assert.deepEqual(alias.json.natures.conceptions, { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
  });
});

describe('B-95 nominal : le catalogue d\'essai puis les quatre conceptions', () => {
  it('quatre conceptions créées dans un lot, avec les prix, puissances et masses calculés à la main', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    const r = await m.conceptions(lot, exemple('conceptions-essai.json'));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(compteurs(r), { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });
    assert.deepEqual(r.json.refus, []);
    const lotVu = (await m.api('GET', `/lots/${lot}`)).json;
    assert.deepEqual(lotVu.compteurs.conceptions, { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });

    const leger = (await m.detail('Éclaireur léger')).resultat;
    assert.equal(leger.prix, 25000); assert.equal(leger.pv, 8); assert.equal(leger.ca, 14);
    assert.equal(leger.puissanceLibre, 8); assert.equal(leger.masseLibre, 7);
    const blinde = (await m.detail('Éclaireur blindé')).resultat;
    assert.equal(blinde.prix, 29000); assert.equal(blinde.pv, 13); assert.equal(blinde.ca, 15);
    assert.equal(blinde.puissanceLibre, 8); assert.equal(blinde.masseLibre, 5);
    const fregate = (await m.detail('Frégate de ligne')).resultat;
    assert.equal(fregate.prix, 650000); assert.equal(fregate.pv, 30); assert.equal(fregate.ca, 14);
    assert.equal(fregate.puissanceLibre, 5); assert.equal(fregate.masseLibre, 10);
  });

  it('la conception complète porte magasins, intégré, cibles, pj, robots et équipage, et rend les valeurs attendues', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    assert.equal((await m.conceptions(lot, exemple('conceptions-essai.json'))).status, 200);
    const c = await m.detail('Croiseur complet');
    assert.equal(c.coque.cle, 'croiseur');
    assert.equal(c.pj, 2); assert.equal(c.robots, 1);
    assert.equal(c.resultat.equipage.choisi, 10);
    const canon = c.lignes.find((x: Any) => x.cle === 'canon-leger');
    assert.equal(canon.magasins, 2);
    assert.equal(c.lignes.find((x: Any) => x.cle === 'renfort').integre, 1);
    assert.deepEqual(c.lignes.find((x: Any) => x.cle === 'montage').cibles, [{ nature: 'armes', cle: 'laser', quantite: 1 }]);
    // by hand: PV 60 + 2 × 4; CA 15; hardpoints 2 lasers + 1 cannon of 5;
    // power 9 + 1 + (2 × 6 − 3 for the specialised mount) + 1 = 20 of 50; mass 2 + 12 + 1 + 2 + 1 + 8 + 2 magazines = 28 of 40
    assert.equal(c.resultat.pv, 68); assert.equal(c.resultat.ca, 15);
    assert.deepEqual(c.resultat.emports, { utilises: 3, total: 5 });
    assert.equal(c.resultat.puissanceLibre, 30); assert.equal(c.resultat.masseLibre, 12);
  });

  it('la visibilité « joueurs » d\'une conception est celle de sa fiche : Léa lit la frégate, pas l\'éclaireur (mj par défaut)', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    assert.equal((await m.conceptions(lot, exemple('conceptions-essai.json'))).status, 200);
    const vue = (await m.lea('GET', `${m.V}/conceptions`)).json.conceptions as Any[];
    const titres = vue.map((c) => c.titre);
    assert.ok(titres.includes('Frégate de ligne'));
    assert.ok(!titres.includes('Éclaireur léger'));
    assert.ok(!titres.includes('Croiseur complet'));
  });

  it('parité : le résultat d\'une conception importée est celui du calcul de l\'écran pour la même conception', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    assert.equal((await m.conceptions(lot, exemple('conceptions-essai.json'))).status, 200);
    for (const c of exemple('conceptions-essai.json').conceptions as Any[]) {
      const calcul = await m.antor('POST', `${m.V}/calcul`, { coque: c.coque, choix: c.choix, ...(c.equipage !== undefined ? { equipage: c.equipage } : {}), ...(c.pj !== undefined ? { pj: c.pj } : {}), ...(c.robots !== undefined ? { robots: c.robots } : {}) });
      assert.equal(calcul.status, 200, calcul.texte);
      const stocke = (await m.detail(c.titre)).resultat;
      assert.deepEqual(stocke, calcul.json.resultat, c.titre);
    }
  });
});

describe('I-3 rejeu sans doublon ni version qui bouge', () => {
  it('le même fichier deux fois : 4 inchangées, aucune version ni fiche ne bouge', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    await m.conceptions(lot, exemple('conceptions-essai.json'));
    const avant = await Promise.all(['Éclaireur léger', 'Éclaireur blindé', 'Frégate de ligne', 'Croiseur complet'].map((t) => m.detail(t)));
    const fiches = await m.nbFiches();
    const lot2 = await m.lot();
    const r = await m.conceptions(lot2, exemple('conceptions-essai.json'));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(compteurs(r), { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
    const apres = await Promise.all(['Éclaireur léger', 'Éclaireur blindé', 'Frégate de ligne', 'Croiseur complet'].map((t) => m.detail(t)));
    assert.deepEqual(apres.map((d) => [d.ficheId, d.version, d.sectionVersion]), avant.map((d) => [d.ficheId, d.version, d.sectionVersion]));
    assert.equal(await m.nbFiches(), fiches);
  });

  it('un seul changement de lignes : 1 mise à jour, 3 inchangées, le prix suit', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    await m.conceptions(lot, exemple('conceptions-essai.json'));
    const f = exemple('conceptions-essai.json');
    f.conceptions[1].choix[1].quantite = 2; // second blindage on the éclaireur blindé
    const r = await m.conceptions(await m.lot(), f);
    assert.deepEqual(compteurs(r), { creees: 0, mises_a_jour: 1, inchangees: 3, refusees: 0 });
    // hand: 20 000 + 5 000 + 4 000 + 4 000 = 33 000 (blindage costs ×1 on a class 1 hull); 18 PV
    const d = (await m.detail('Éclaireur blindé')).resultat;
    assert.equal(d.prix, 33000); assert.equal(d.pv, 18);
  });

  it('l\'ordre des lignes change : inchangée (les lignes sont un ensemble)', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    await m.conceptions(lot, exemple('conceptions-essai.json'));
    const f = exemple('conceptions-essai.json');
    for (const c of f.conceptions) c.choix.reverse();
    const r = await m.conceptions(await m.lot(), f);
    assert.deepEqual(compteurs(r), { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
  });

  it('un changement de pj, de robots ou de magasins est une mise à jour (chaque champ porté compte)', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    await m.conceptions(lot, exemple('conceptions-essai.json'));
    for (const [champ, valeur] of [['pj', 3], ['robots', 0], ['equipage', 11]] as const) {
      const f = exemple('conceptions-essai.json');
      f.conceptions[3][champ] = valeur;
      const r = await m.conceptions(await m.lot(), f);
      assert.equal(compteurs(r).mises_a_jour, 1, champ);
      assert.equal(compteurs(r).inchangees, 3, champ);
      assert.equal((await m.detail('Croiseur complet'))[champ === 'equipage' ? 'resultat' : champ]?.equipage?.choisi ?? (await m.detail('Croiseur complet'))[champ], champ === 'equipage' ? 11 : valeur);
      // back to the file's value for the next field
      await m.conceptions(await m.lot(), exemple('conceptions-essai.json'));
    }
    const f = exemple('conceptions-essai.json');
    f.conceptions[3].choix.find((x: Any) => x.cle === 'canon-leger').magasins = 3;
    assert.equal(compteurs(await m.conceptions(await m.lot(), f)).mises_a_jour, 1);
    const g = exemple('conceptions-essai.json');
    g.conceptions[3].choix.find((x: Any) => x.cle === 'renfort').integre = 0;
    assert.equal(compteurs(await m.conceptions(await m.lot(), g)).mises_a_jour, 1);
  });
});

describe('I-2 refus par champ, les autres passent, aucune fiche laissée', () => {
  async function refuse(champ: string | RegExp, mauvaise: Any, preparer?: (m: Monde) => Promise<void>) {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    if (preparer) await preparer(m);
    const avant = await m.nbFiches();
    const r = await m.conceptions(lot, { conceptions: [bonne('essai-a', 'Avant'), mauvaise, bonne('essai-b', 'Après')] });
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(compteurs(r), { creees: 2, mises_a_jour: 0, inchangees: 0, refusees: 1 });
    assert.equal(r.json.refus.length, 1);
    const c = r.json.refus[0].champ as string;
    if (typeof champ === 'string') assert.equal(c, champ); else assert.match(c, champ);
    assert.equal(await m.nbFiches(), avant + 2, 'the refused item leaves no sheet');
    return { m, r };
  }

  it('coque inconnue : conceptions[1].coque', async () => {
    await refuse('conceptions[1].coque', { cle: 'essai-x', titre: 'Mauvaise coque', coque: 'nexiste-pas', choix: [] });
  });
  it('élément inconnu : conceptions[1].choix[0].cle', async () => {
    await refuse('conceptions[1].choix[0].cle', { ...bonne('essai-x', 'Inconnu'), choix: [l('moteurs', 'nexiste-pas')] });
  });
  it('élément masqué de l\'univers : conceptions[1].choix[1].cle', async () => {
    await refuse('conceptions[1].choix[1].cle', { ...bonne('essai-x', 'Masqué'), choix: [l('moteurs', 'moteur-1'), l('armes', 'laser')] }, async (m) => {
      const g = (await m.antor('GET', `${m.V}/catalogue/gestion?nature=armes`)).json.elements.find((e: Any) => e.cle === 'laser');
      const r = await m.antor('PUT', `${m.V}/catalogue/armes/laser/masque`, { masque: true, version: g.version });
      assert.equal(r.status, 200, r.texte);
    });
  });
  it('élément en double : refusé sur la ligne répétée', async () => {
    await refuse(/^conceptions\[1\]\.choix\[1\]/, { ...bonne('essai-x', 'Double'), choix: [l('moteurs', 'moteur-1'), l('moteurs', 'moteur-1')] });
  });
  it('quantité 0 et quantité 100 : refusées (bornes 1 à 99)', async () => {
    await refuse(/^conceptions\[1\]\.choix\[0\]/, { ...bonne('essai-x', 'Zéro'), choix: [l('moteurs', 'moteur-1', 0)] });
    await refuse(/^conceptions\[1\]\.choix\[0\]/, { ...bonne('essai-x', 'Cent'), choix: [l('moteurs', 'moteur-1', 100)] });
  });
  it('cible hors des lignes : cible_invalide sous conceptions[1].choix', async () => {
    const { r } = await refuse(/^conceptions\[1\]\.choix/, {
      ...bonne('essai-x', 'Cible perdue'), coque: 'croiseur',
      choix: [l('moteurs', 'moteur-2'), l('modifications', 'montage', 1, { cibles: [l('armes', 'laser')] })],
    });
    assert.match(r.json.refus[0].raison, /l'élément visé n'est pas dans cette conception/);
  });
  it('deux montages spécialisés sur un même élément : refusés (un seul montage spécialisé par élément)', async () => {
    const { r } = await refuse(/^conceptions\[1\]\.choix/, {
      ...bonne('essai-x', 'Deux montages'), coque: 'croiseur',
      choix: [l('moteurs', 'moteur-2'), l('armes', 'laser'), l('modifications', 'montage', 1, { cibles: [l('armes', 'laser')] }), l('modifications', 'montage-b', 1, { cibles: [l('armes', 'laser')] })],
    }, async (m) => {
      const cat = exemple('catalogue-essai-conceptions.json');
      cat.version = '2026-11-essai-montage-b';
      cat.amenagements = [];
      cat.modifications = [{ ...cat.modifications[0], cle: 'montage-b', nom: 'Montage spécialisé bis' }];
      assert.equal((await m.api('PUT', `/outils/swn/vaisseaux/catalogue?niveau=univers`, cat)).status, 200);
    });
    assert.match(r.json.refus[0].raison, /un seul montage spécialisé par élément/);
  });
  it('alerte bloquante (puissance libre −1) : refusée sur conceptions[1].choix', async () => {
    // by hand: frégate 20 power; moteur-2 3 × 2 = 6, cabines 3 × 1 = 3, 3 lasers 3 × (2 × 2) = 12 -> 21 used, free −1
    await refuse('conceptions[1].choix', {
      cle: 'essai-x', titre: 'Gourmande', coque: 'fregate',
      choix: [l('moteurs', 'moteur-2'), l('amenagements', 'cabines', 3), l('armes', 'laser', 3)],
    });
  });
  it('clé d\'une fiche d\'un autre type : conceptions[1].cle, la fiche n\'est pas touchée', async () => {
    const m = await monde();
    const cree = await m.antor('POST', `/api/univers/${m.E}/fiches`, { type: 'lieu', titre: 'Port d\'essai' });
    assert.equal(cree.status, 201, cree.texte);
    const autre = ((await m.antor('GET', `/api/univers/${m.E}/fiches`)).json.fiches as Any[]).find((f) => f.titre === 'Port d\'essai');
    assert.ok(autre?.cle, JSON.stringify(autre));
    const lot = await m.lot();
    await m.catalogues(lot);
    const avant = await m.nbFiches();
    const r = await m.conceptions(lot, { conceptions: [bonne(autre.cle, 'Usurpateur'), bonne('essai-b', 'Après')] });
    assert.deepEqual(compteurs(r), { creees: 1, mises_a_jour: 0, inchangees: 0, refusees: 1 });
    assert.equal(r.json.refus[0].champ, 'conceptions[0].cle');
    assert.equal(await m.nbFiches(), avant + 1);
    const apres = ((await m.antor('GET', `/api/univers/${m.E}/fiches`)).json.fiches as Any[]).find((f) => f.id === autre.id);
    assert.equal(apres.type, autre.type);
    assert.equal(apres.titre, autre.titre);
  });
  it('un élément seul d\'un fichier de 500 est refusé sans arrêter les 499 autres (bord haut)', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    const items = Array.from({ length: 500 }, (_, i) => bonne(`lot-${i}`, `Éclaireur ${i}`));
    items[499] = { cle: 'lot-499', titre: 'Mauvais', coque: 'nexiste-pas', choix: [] } as Any;
    const r = await m.conceptions(lot, { conceptions: items });
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(compteurs(r), { creees: 499, mises_a_jour: 0, inchangees: 0, refusees: 1 });
    assert.equal(r.json.refus[0].champ, 'conceptions[499].coque');
  });
});

describe('jetons, lot, taille, univers, outil désactivé', () => {
  it('un jeton de contenu, un jeton swn/galaxie et un jeton révoqué reçoivent 401 jeton_invalide sans ouvrir de lot', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    const contenu = m.srv.jeton('antor', m.E, 'contenu');
    const galaxie = m.srv.jeton('antor', m.E, 'galaxie', ['swn/galaxie']);
    const rev = (await m.antor('POST', '/api/compte/jetons', {
      nom: 'revoque', dureeJours: 30, outils: [T], acces: { tous: false, univers: [{ universId: m.E, niveau: 'ecriture' }] },
    })).json;
    assert.equal((await m.antor('DELETE', `/api/compte/jetons/${rev.jeton.id}`)).status, 200);
    const avant = (await m.api('GET', `/lots/${lot}`)).json;
    for (const [nom, j] of [['contenu', contenu], ['galaxie', galaxie], ['révoqué', rev.valeur]] as const) {
      const r = await m.conceptions(lot, exemple('conceptions-essai.json'), j);
      assert.equal(r.status, 401, nom);
      assert.equal(r.json.code ?? r.json.erreur, 'jeton_invalide', nom);
      const sans = await m.conceptions(null, exemple('conceptions-essai.json'), j);
      assert.equal(sans.status, 401, nom);
    }
    assert.deepEqual((await m.api('GET', `/lots/${lot}`)).json.compteurs, avant.compteurs);
    assert.equal(((await m.antor('GET', `${m.V}/conceptions`)).json.conceptions as Any[]).length, 2, 'only the 2 seeded designs');
  });

  it('un lot clos : 409 lot_clos, rien n\'est écrit', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    assert.equal((await m.api('POST', `/lots/${lot}/clore`)).status, 200);
    const avant = await m.nbFiches();
    const r = await m.conceptions(lot, exemple('conceptions-essai.json'));
    assert.equal(r.status, 409);
    assert.equal(r.json.code ?? r.json.erreur, 'lot_clos');
    assert.equal(await m.nbFiches(), avant);
  });

  it('501 éléments : 400 avant toute écriture ; 500 éléments passent (bord)', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    const avant = await m.nbFiches();
    const trop = await m.conceptions(lot, { conceptions: Array.from({ length: 501 }, (_, i) => bonne(`t-${i}`, `T ${i}`)) });
    assert.equal(trop.status, 400);
    assert.equal(await m.nbFiches(), avant);
    const juste = await m.conceptions(lot, { conceptions: Array.from({ length: 500 }, (_, i) => bonne(`t-${i}`, `T ${i}`)) });
    assert.equal(juste.status, 200, juste.texte);
    assert.equal(compteurs(juste).creees, 500);
  });

  it('un autre univers : 404 comme un univers inconnu', async () => {
    const m = await monde();
    const lot = await m.lot();
    const voisin = ((await m.antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === 'Univers voisin').id;
    const chemin = (u: number) => `/api/import/v1/univers/${u}/outils/swn/vaisseaux/conceptions?lot=${lot}`;
    const h = { authorization: `Bearer ${m.jeton}` };
    const autre = await appel(m.srv.base, h, 'PUT', chemin(voisin), exemple('conceptions-essai.json'));
    const inconnu = await appel(m.srv.base, h, 'PUT', chemin(99999), exemple('conceptions-essai.json'));
    assert.equal(autre.status, 404);
    assert.equal(inconnu.status, 404);
    assert.equal(autre.texte, inconnu.texte);
  });

  it('l\'outil désactivé répond comme un chemin inconnu, et n\'écrit rien', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    const off = await m.antor('PUT', `/api/univers/${m.E}/outils/swn/vaisseaux/activation`, { active: false });
    assert.ok([200, 204].includes(off.status), off.texte);
    const avant = await m.nbFiches();
    const r = await m.conceptions(lot, exemple('conceptions-essai.json'));
    const inconnu = await m.api('PUT', `/outils/swn/vaisseaux/rien-du-tout?lot=${lot}`, exemple('conceptions-essai.json'));
    assert.equal(r.status, 404);
    assert.equal(r.texte, inconnu.texte);
    assert.equal(await m.nbFiches(), avant);
  });

  it('sans ?lot= rien n\'est compté, mais les conceptions sont écrites', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    const r = await m.conceptions(null, exemple('conceptions-essai.json'));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual((await m.api('GET', `/lots/${lot}`)).json.compteurs.conceptions ?? { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 }, { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 });
    assert.equal((await m.detail('Frégate de ligne')).resultat.prix, 650000);
  });

  it('aucune valeur de fiche ni jeton dans la réponse d\'un refus', async () => {
    const m = await monde();
    const lot = await m.lot();
    await m.catalogues(lot);
    const r = await m.conceptions(lot, { conceptions: [{ cle: 'essai-secret', titre: 'Titre-secret-du-vaisseau', coque: 'nexiste-pas', choix: [] }, bonne()] });
    assert.equal(r.status, 200, r.texte);
    assert.ok(!r.texte.includes('Titre-secret-du-vaisseau'));
    assert.ok(!r.texte.includes(m.jeton));
    assert.ok(!r.texte.includes('kvs_'));
  });
});
