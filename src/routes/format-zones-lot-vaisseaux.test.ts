// Door of the lot « vaisseaux » for `src/e2e/format-zones-ensemble.test.ts`: the API describes of that file, moved here (the app listens in this process,
// same HTTP, same seeded world). The screen file keeps its « à l'écran » describe: what the user reads.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';


const servers: Server[] = [];
after(async () => { servers.forEach((s) => s.stop()); });

interface Rep { status: number; json: Any; texte: string }
interface Monde {
  base: string; E: number; G: string; gid: number;
  api: (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  imp: (jeton: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  jeton: string;
  put: (zones: unknown[]) => Promise<Rep>;
}

async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  const lire = async (r: Response): Promise<Rep> => {
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    return lire(await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) }));
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const gid = (await api('antor', 'GET', `/api/univers/${E}/cartes`)).json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id as number;
  const G = `/api/univers/${E}/outils/swn/galaxie/galaxies/${gid}`;
  const imp = async (jeton: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> =>
    lire(await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) }));
  const jeton = (await api('antor', 'POST', `/api/univers/${E}/jetons`, { nom: 'Script zones', dureeJours: 30, outils: ['swn/galaxie'] })).json.valeur as string;
  const put = (zones: unknown[]) => imp(jeton, 'PUT', `/outils/swn/galaxie/galaxies/${gid}`, { zones });
  return { base: srv.base, E, G, gid, api, imp, jeton, put };
}

type Hex = [number, number];
/** The invented zone: q −15..14 × r −10..19 minus the hole q −3..6 × r −3..6 = 800 hexagons. */
function anneau(): Hex[] {
  const h: Hex[] = [];
  for (let q = -15; q <= 14; q++) for (let r = -10; r <= 19; r++) if (!(q >= -3 && q <= 6 && r >= -3 && r <= 6)) h.push([q, r]);
  return h;
}
const enTrou = (q: number, r: number) => q >= -3 && q <= 6 && r >= -3 && r <= 6;
/** 5 000 hexagons: q −50..49 × r −25..24. */
function grande(): Hex[] {
  const h: Hex[] = [];
  for (let q = -50; q <= 49; q++) for (let r = -25; r <= 24; r++) h.push([q, r]);
  return h;
}
/** A simple polygon of exactly 64 distinct vertices (the perimeter of a 16 × 16 square) shifted by (dq, dr). */
function polygone64(dq: number, dr: number): Hex[] {
  const v: Hex[] = [];
  for (let i = 0; i < 16; i++) v.push([dq + i, dr]);
  for (let i = 0; i < 16; i++) v.push([dq + 16, dr + i]);
  for (let i = 0; i < 16; i++) v.push([dq + 16 - i, dr + 16]);
  for (let i = 0; i < 16; i++) v.push([dq, dr + 16 - i]);
  return v;
}
/** Hexagons said by a canonical range list `[[r, q0, q1], …]` (docs/donnees.md), as sorted « q,r » strings. */
const developper = (plages: [number, number, number][]): string[] => {
  const s: string[] = [];
  for (const [r, q0, q1] of plages) for (let q = q0; q <= q1; q++) s.push(`${q},${r}`);
  return s.sort();
};
const cles = (h: Hex[]): string[] => h.map(([q, r]) => `${q},${r}`).sort();

const FENETRE = '/blocs?de=-4,-4&a=4,4';
const zone = async (m: Monde, compte: string, cle: string, suffixe = ''): Promise<Any> =>
  ((await m.api(compte, 'GET', `${m.G}${FENETRE}${suffixe}`)).json.zones as Any[]).find((z) => z.cle === cle);
const prive = (h: Hex[], cle = 'reserve', nom = 'Réserve privée', extra: Any = {}) => ({ cle, nom, contour: { hexagones: h }, couleur: 'accent', secret: true, ...extra });
const ANNEAU = () => ({ cle: 'anneau', nom: "Anneau d'essai", contour: { hexagones: anneau() }, couleur: 'accent' });
const compteurs = (r: Rep, nature = 'zones') => r.json.natures[nature] as { creees: number; mises_a_jour: number; inchangees: number; refusees: number };

import { startServer, type Any, type Server } from './serveur-lot-vaisseaux.ts';
describe('B-84 import par l’API : une zone de 800 hexagones', () => {
  it('nominal : l’import crée l’anneau ; la lecture rend exactement ses 800 hexagones, ni plus ni moins, et le compte 800', async () => {
    const m = await monde();
    const r = await m.put([ANNEAU()]);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(compteurs(r), { creees: 1, mises_a_jour: 0, inchangees: 0, refusees: 0 });
    assert.equal(r.json.refusTotal, 0);
    for (const compte of ['antor']) {
      const z = await zone(m, compte, 'anneau');
      assert.ok(z, 'la zone est lue');
      assert.equal(z.nom, "Anneau d'essai");
      assert.equal(z.hexagones, 800);
      assert.deepEqual(z.contour, []);
      const lus = developper(z.plages);
      assert.equal(lus.length, 800);
      assert.deepEqual(lus, cles(anneau()), 'exactement les hexagones importés');
      for (const [q, rr] of [[0, 0], [-3, -3], [6, 6], [1, 5]]) assert.ok(!lus.includes(`${q},${rr}`), `(${q},${rr}) est dans le trou`);
      for (const [q, rr] of [[-15, -10], [14, 19], [-4, 0], [7, 0], [0, 7]]) assert.ok(lus.includes(`${q},${rr}`), `(${q},${rr}) est dans l’anneau`);
      for (const [q, rr] of [[-16, 0], [15, 0], [0, -11], [0, 20]]) assert.ok(!lus.includes(`${q},${rr}`), `(${q},${rr}) est hors de l’anneau`);
    }
  });

  it('rejeu : le même fichier laisse la zone inchangée (même version) ; le même ensemble dans un autre ordre aussi ; un hexagone déplacé la met à jour', async () => {
    const m = await monde();
    await m.put([ANNEAU()]);
    const avant = await zone(m, 'antor', 'anneau');
    const b = await m.put([ANNEAU()]);
    assert.deepEqual(compteurs(b), { creees: 0, mises_a_jour: 0, inchangees: 1, refusees: 0 });
    assert.equal((await zone(m, 'antor', 'anneau')).version, avant.version, 'aucune montée de version au rejeu');
    const autreOrdre = { ...ANNEAU(), contour: { hexagones: anneau().reverse() } };
    const c = await m.put([autreOrdre]);
    assert.deepEqual(compteurs(c), { creees: 0, mises_a_jour: 0, inchangees: 1, refusees: 0 }, 'un ensemble n’a pas d’ordre');
    const modifie = anneau().filter(([q, r]) => !(q === 14 && r === 19)).concat([[15, 19]]);
    const d = await m.put([{ ...ANNEAU(), contour: { hexagones: modifie } }]);
    assert.deepEqual(compteurs(d), { creees: 0, mises_a_jour: 1, inchangees: 0, refusees: 0 });
    const z = await zone(m, 'antor', 'anneau');
    assert.equal(z.hexagones, 800);
    assert.deepEqual(developper(z.plages), cles(modifie));
    assert.ok(z.version > avant.version);
  });

  it('bords : un hexagone seul et 5 000 hexagones passent ; les doublons se fondent (3 paires dont 2 égales = 2 hexagones)', async () => {
    const m = await monde();
    const r = await m.put([
      { cle: 'seul', nom: 'Seul', contour: { hexagones: [[3, 4]] } },
      { cle: 'plein', nom: 'Plein', contour: { hexagones: grande() } },
      { cle: 'doublon', nom: 'Doublon', contour: { hexagones: [[0, 20], [1, 20], [0, 20]] } },
    ]);
    assert.equal(r.json.refusTotal, 0, r.texte);
    assert.equal(compteurs(r).creees, 3);
    assert.equal((await zone(m, 'antor', 'seul')).hexagones, 1);
    assert.deepEqual(developper((await zone(m, 'antor', 'seul')).plages), ['3,4']);
    const plein = await m.api('antor', 'GET', `${m.G}/blocs?de=-4,-4&a=4,4`);
    assert.equal((plein.json.zones as Any[]).find((z) => z.cle === 'plein').hexagones, 5000);
    const d = await zone(m, 'antor', 'doublon');
    assert.equal(d.hexagones, 2);
    assert.deepEqual(developper(d.plages), ['0,20', '1,20']);
  });

  it('échec : chaque hexagone mal formé et chaque ensemble de plus de 5 000 est refusé avec champ « zones[i].contour », les bonnes zones du fichier passent, rien du refusé n’est écrit', async () => {
    const m = await monde();
    const trop = Array.from({ length: 5001 }, (_, i): Hex => [i % 100, Math.floor(i / 100) + 40]);
    const zones = [
      { cle: 'bonne', nom: 'Bonne', contour: { hexagones: [[0, 0], [1, 0]] } },
      { cle: 'demi', nom: 'Demi', contour: { hexagones: [[0, 0], [1.5, 2]] } },
      { cle: 'court', nom: 'Court', contour: { hexagones: [[0, 0], [1]] } },
      { cle: 'texte', nom: 'Texte', contour: { hexagones: [[0, 0], ['a', 1]] } },
      { cle: 'loin', nom: 'Loin', contour: { hexagones: [[100001, 0]] } },
      { cle: 'vide', nom: 'Vide', contour: { hexagones: [] } },
      { cle: 'enorme', nom: 'Énorme', contour: { hexagones: trop } },
      { cle: 'extra', nom: 'Extra', contour: { hexagones: [[0, 0]], couleur: 'accent' } },
      { cle: 'pleine', nom: 'Pleine', contour: { hexagones: grande() } },
    ];
    const r = await m.put(zones);
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(compteurs(r), { creees: 2, mises_a_jour: 0, inchangees: 0, refusees: 7 });
    const refus = new Map<string, string>((r.json.refus as Any[]).map((x) => [x.cle, x.champ]));
    const attendu: [string, number][] = [['demi', 1], ['court', 2], ['texte', 3], ['loin', 4], ['vide', 5], ['enorme', 6], ['extra', 7]];
    for (const [cle, i] of attendu) assert.equal(refus.get(cle), `zones[${i}].contour`, `${cle} : ${r.texte.slice(0, 600)}`);
    assert.equal(refus.has('bonne'), false);
    assert.equal(refus.has('pleine'), false);
    const lues = ((await m.api('antor', 'GET', `${m.G}/blocs?de=-4,-4&a=4,4`)).json.zones as Any[]).map((z) => z.cle).sort();
    assert.deepEqual(lues, ['bonne', 'marches-interdites', 'pleine']);
  });

  it('échec : plus de 50 000 hexagones dans une même requête refusent toute la requête (champ « zones »), rien n’est écrit', async () => {
    const m = await monde();
    const zones = Array.from({ length: 11 }, (_, k) => ({ cle: `z${k}`, nom: `Z${k}`, contour: { hexagones: grande().map(([q, r]): Hex => [q, r + 100 * k]) } }));
    const r = await m.put(zones);
    assert.equal(r.status, 400, r.texte.slice(0, 300));
    assert.equal(r.json.champ, 'zones');
    assert.deepEqual(((await m.api('antor', 'GET', `${m.G}/blocs?de=-4,-4&a=4,4`)).json.zones as Any[]).map((z) => z.cle), ['marches-interdites']);
  });

  it('exclusion : le monde de départ ne porte aucune zone d’hexagones, et sa zone à contour est lue comme avant', async () => {
    const m = await monde();
    const zs = (await m.api('antor', 'GET', `${m.G}${FENETRE}`)).json.zones as Any[];
    assert.equal(zs.length, 1);
    assert.equal(zs[0].cle, 'marches-interdites');
    assert.deepEqual(zs[0].contour, [[-12, 2], [-4, 2], [-4, 8], [-12, 8]]);
    assert.equal(zs[0].plages, undefined);
    assert.equal(zs[0].hexagones, undefined);
    assert.equal(zs[0].secret, true);
  });

  it('exclusion : une zone de 64 sommets tracée avant se lit comme avant, et son rejeu par import est inchangé', async () => {
    const m = await monde();
    const p = polygone64(20, 20);
    assert.equal(p.length, 64);
    const t = await m.api('antor', 'POST', `${m.G}/zones`, { nom: 'Ancienne', contour: p });
    assert.equal(t.status, 201, t.texte);
    const z = await zone(m, 'antor', t.json.cle);
    assert.deepEqual(z.contour, p);
    assert.equal(z.plages, undefined);
    assert.equal(z.hexagones, undefined);
    const rej = await m.put([{ cle: t.json.cle, nom: 'Ancienne', contour: p, couleur: z.couleur }]);
    assert.equal(rej.json.refusTotal, 0, rej.texte);
    assert.equal(compteurs(rej).creees, 0);
  });
});

describe('B-84 par les routes de session', () => {
  it('Antor trace une zone d’hexagones : 201, le compte est lu ; un hexagone mal formé ou 5 001 hexagones : 400 champ « contour » sans rien écrire', async () => {
    const m = await monde();
    const ok = await m.api('antor', 'POST', `${m.G}/zones`, { nom: 'Trois', contour: { hexagones: [[0, 20], [1, 20], [2, 20]] } });
    assert.equal(ok.status, 201, ok.texte);
    assert.equal((await zone(m, 'antor', ok.json.cle)).hexagones, 3);
    for (const hexagones of [[[0, 0], [1.5, 0]], [], Array.from({ length: 5001 }, (_, i): Hex => [i % 100, Math.floor(i / 100)])]) {
      const r = await m.api('antor', 'POST', `${m.G}/zones`, { nom: 'Refusée', contour: { hexagones } });
      assert.equal(r.status, 400, r.texte.slice(0, 300));
      assert.equal(r.json.champ, 'contour');
    }
    assert.equal(((await m.api('antor', 'GET', `${m.G}${FENETRE}`)).json.zones as Any[]).length, 2, 'la zone du départ et « Trois »');
  });

  it('exclusion : renommer une zone d’hexagones laisse ses 800 hexagones ; modifiée dans Kanevas, elle n’est plus écrasée par l’import (B-48)', async () => {
    const m = await monde();
    await m.put([ANNEAU()]);
    const avant = await zone(m, 'antor', 'anneau');
    const p = await m.api('antor', 'PATCH', `${m.G}/zones/anneau`, { nom: 'Anneau renommé', version: avant.version });
    assert.equal(p.status, 200, p.texte);
    const apres = await zone(m, 'antor', 'anneau');
    assert.equal(apres.nom, 'Anneau renommé');
    assert.equal(apres.hexagones, 800);
    assert.deepEqual(developper(apres.plages), cles(anneau()));
    const modifie = anneau().slice(1);
    const r = await m.put([{ ...ANNEAU(), contour: { hexagones: modifie } }]);
    assert.equal(compteurs(r).refusees, 1, r.texte);
    assert.match(r.texte, /Modifié dans Kanevas depuis le dernier import\./);
    assert.equal((await zone(m, 'antor', 'anneau')).hexagones, 800, 'la forme n’a pas bougé');
  });
});

describe('B-84 droits d’une zone privée (B-73)', () => {
  const secret = () => prive([[-1, -1], [0, -1], [-1, 0], [0, 0]]);

  it('la zone privée est absente de Léa (nom, clé, forme) et d’Antor en mode Joueur, présente pour Antor ; la publique est lue des deux', async () => {
    const m = await monde();
    const r = await m.put([ANNEAU(), secret()]);
    assert.equal(r.json.refusTotal, 0, r.texte);
    const lea = await m.api('lea', 'GET', `${m.G}${FENETRE}`);
    assert.deepEqual((lea.json.zones as Any[]).map((z) => z.nom), ["Anneau d'essai"]);
    assert.equal(lea.json.zones[0].hexagones, 800);
    for (const mot of ['Réserve', 'reserve', 'privée', 'Marches', 'marches']) assert.ok(!lea.texte.includes(mot), `« ${mot} » absent de la lecture de Léa`);
    assert.deepEqual(developper(lea.json.zones[0].plages), cles(anneau()));
    const antor = (await m.api('antor', 'GET', `${m.G}${FENETRE}`)).json.zones as Any[];
    assert.deepEqual(antor.map((z) => z.cle).sort(), ['anneau', 'marches-interdites', 'reserve']);
    assert.equal(antor.find((z) => z.cle === 'reserve').hexagones, 4);
    const joueur = await m.api('antor', 'GET', `${m.G}${FENETRE}&mode=joueur`);
    assert.deepEqual(joueur.json, lea.json);
  });

  it('exclusion : la densité d’une zone privée ne change pas les blocs de Léa, et change ceux du MJ', async () => {
    const m = await monde();
    const fenetre = '/blocs?de=-3,-3&a=3,3';
    const leaAvant = (await m.api('lea', 'GET', `${m.G}${fenetre}`)).json.blocs;
    const mjAvant = (await m.api('antor', 'GET', `${m.G}${fenetre}`)).json.blocs;
    const grand: Hex[] = [];
    for (let q = 8; q <= 13; q++) for (let r = 8; r <= 13; r++) grand.push([q, r]);
    const r = await m.put([prive(grand, 'dense', 'Dense', { densite: 1 })]);
    assert.equal(r.json.refusTotal, 0, r.texte);
    assert.deepEqual((await m.api('lea', 'GET', `${m.G}${fenetre}`)).json.blocs, leaAvant);
    assert.notDeepEqual((await m.api('antor', 'GET', `${m.G}${fenetre}`)).json.blocs, mjAvant, 'le MJ voit le bloc modifié');
  });

  it('exclusion : Léa n’écrit pas de zone d’hexagones (403), ni par le tracé ni par la modification', async () => {
    const m = await monde();
    await m.put([ANNEAU()]);
    const t = await m.api('lea', 'POST', `${m.G}/zones`, { nom: 'Pirate', contour: { hexagones: [[0, 30]] } });
    assert.equal(t.status, 403, t.texte);
    const z = await zone(m, 'antor', 'anneau');
    const p = await m.api('lea', 'PATCH', `${m.G}/zones/anneau`, { nom: 'Pris', version: z.version });
    assert.equal(p.status, 403, p.texte);
    assert.equal((await zone(m, 'antor', 'anneau')).nom, "Anneau d'essai");
  });
});

describe('B-84 densité générée sous une zone d’hexagones', () => {
  it('une zone de densité 0 vide exactement les systèmes générés sous ses hexagones ; le trou reste généré comme avant', async () => {
    const m = await monde();
    const generes = async (): Promise<string[]> => {
      const r = await m.api('antor', 'GET', `${m.G}/blocs?de=-4,-4&a=4,4`);
      return (r.json.blocs as Any[]).flatMap((b) => b.generes as Hex[]).map(([q, rr]) => `${q},${rr}`).sort();
    };
    const avant = await generes();
    const dansAnneau = (k: string) => { const [q, r] = k.split(',').map(Number); return q >= -15 && q <= 14 && r >= -10 && r <= 19 && !enTrou(q, r); };
    const dansTrou = (k: string) => { const [q, r] = k.split(',').map(Number); return enTrou(q, r); };
    assert.ok(avant.filter(dansAnneau).length > 20, 'avant, l’anneau porte des systèmes générés');
    assert.ok(avant.filter(dansTrou).length > 0, 'avant, le trou porte des systèmes générés');
    const r = await m.put([{ ...ANNEAU(), densite: 0 }]);
    assert.equal(r.json.refusTotal, 0, r.texte);
    const apres = await generes();
    assert.deepEqual(apres.filter(dansAnneau), [], 'plus aucun système généré sous l’anneau');
    assert.deepEqual(apres.filter((k) => !dansAnneau(k)), avant.filter((k) => !dansAnneau(k)), 'le trou et le dehors ne changent pas');
  });
});

describe('B-84 document MJ', () => {
  const plat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const creerDoc = async (m: Monde) => {
    const cree = await m.api('antor', 'POST', `${m.G}/document`, { creer: { titre: 'Galaxie — notes MJ' }, version: 1 });
    assert.equal(cree.status, 201, cree.texte);
    return cree.json.fiche.id as number;
  };
  const texteDoc = async (m: Monde, fid: number) =>
    plat(((await m.api('antor', 'GET', `/api/univers/${m.E}/fiches/${fid}`)).json.sections as Any[]).find((s) => s.titre === 'Document MJ').html);

  it('le document dit « Anneau d’essai · 800 hexagones » et « Un point · 1 hexagone » ; la zone à contour du départ reste dite comme avant', async () => {
    const m = await monde();
    await m.put([ANNEAU(), { cle: 'point', nom: 'Un point', contour: { hexagones: [[3, 30]] } }]);
    const fid = await creerDoc(m);
    const t = await texteDoc(m, fid);
    assert.match(t, /Anneau d'essai · 800 hexagones/);
    assert.match(t, /Un point · 1 hexagone(?!s)/);
    assert.match(t, /Marches interdites/);
    assert.doesNotMatch(t, /Marches interdites · \d+ hexagone/);
  });

  it('changer la zone périme le document ; la proposition appliquée dit le nouveau compte ; Léa ne lit pas la fiche', async () => {
    const m = await monde();
    await m.put([ANNEAU()]);
    const fid = await creerDoc(m);
    assert.equal((await m.api('antor', 'GET', `${m.G}/document`)).json.etat, 'a_jour');
    await m.put([{ ...ANNEAU(), contour: { hexagones: anneau().slice(0, 799) } }]);
    const d = (await m.api('antor', 'GET', `${m.G}/document`)).json;
    assert.equal(d.etat, 'perime');
    assert.match(await texteDoc(m, fid), /800 hexagones/, 'le texte ne change qu’à l’application');
    const ap = await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${d.propositionId}/appliquer`, {});
    assert.equal(ap.status, 200, ap.texte);
    const t = await texteDoc(m, fid);
    assert.match(t, /Anneau d'essai · 799 hexagones/);
    assert.doesNotMatch(t, /800 hexagones/);
    assert.equal((await m.api('lea', 'GET', `/api/univers/${m.E}/fiches/${fid}`)).status, 404);
  });
});

describe('B-84 mesure : 5 000 hexagones lus par l’API', () => {
  it('la zone de 5 000 hexagones se lit en moins d’une seconde, exacte', async () => {
    const m = await monde();
    const r = await m.put([{ cle: 'grande', nom: 'Grande', contour: { hexagones: grande() } }]);
    assert.equal(r.json.refusTotal, 0, r.texte);
    const duree: number[] = [];
    let lue: Any;
    for (const fenetre of ['/blocs?de=0,0&a=0,0', '/blocs?de=-4,-4&a=4,4']) {
      const t0 = performance.now();
      const rep = await m.api('antor', 'GET', `${m.G}${fenetre}`);
      duree.push(performance.now() - t0);
      lue = (rep.json.zones as Any[]).find((z) => z.cle === 'grande');
      assert.ok(lue, `la zone est lue par ${fenetre}`);
    }
    assert.equal(lue.hexagones, 5000);
    assert.deepEqual(developper(lue.plages), cles(grande()));
    for (const d of duree) assert.ok(d < 1000, `lecture en ${Math.round(d)} ms (borne 1 000 ms) : ${duree.join(', ')}`);
  });
});

