// Complement to import-conceptions-ensemble-besoin.test.ts: feature-level black-box tests of
// kanevas-concepteur-vaisseaux-import-conceptions (B-95, P-22 step 1, I-1, I-3), written from the sheet and I-1 / I-3 of ARCHITECTURE.md.
// Real server in stub mode, real SQLite, real import token; expected figures written by hand from the trial catalogues.
//
// TEST PLAN
//   I-3 écrasement : a design saved at the screen (a blindage added to the éclaireur léger: 29 000 cr) is overwritten by the replay of
//                    the file, whoever last saved it -> 1 mises_a_jour + 3 inchangees, price back to 25 000 cr, no sheet added
//   I-3 titre      : replay of a known key under another titre -> inchangees, the sheet keeps its title (no rename by this route)
//   I-1 clé inconnue : a choix line carrying a key outside the contract is refused under conceptions[1].choix[0], the others pass, no sheet
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './serveur-lot-vaisseaux.ts';

const exemple = (n: string): Any => JSON.parse(readFileSync(new URL(`../outils/swn/exemples/${n}`, import.meta.url), 'utf8'));
const servers: Server[] = [];
after(() => servers.forEach((s) => s.stop()));

type Rep = { status: number; json: Any; texte: string };
async function appel(base: string, entetes: Record<string, string>, methode: string, chemin: string, corps?: unknown): Promise<Rep> {
  const rep = await fetch(base + chemin, {
    method: methode,
    headers: { ...entetes, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await rep.text();
  let json: Any = null;
  try { json = JSON.parse(texte); } catch { /* not json */ }
  return { status: rep.status, json, texte };
}

const T = 'swn/vaisseaux';
async function monde() {
  const srv = await startServer();
  servers.push(srv);
  const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'compte=antor' });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie);
  const antor = (m: string, c: string, b?: unknown) => appel(srv.base, { cookie }, m, c, b);
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const jeton = srv.jeton('antor', E, 'import des conceptions', [T]);
  const api = (m: string, c: string, b?: unknown) => appel(srv.base, { authorization: `Bearer ${jeton}` }, m, `/api/import/v1/univers/${E}${c}`, b);
  const ouvrirLot = async () => { const o = await api('POST', `/lots?outil=${T}`); assert.ok([200, 201].includes(o.status), o.texte); return o.json.lotId as number; };
  const lot0 = await ouvrirLot();
  for (const f of ['catalogue-essai.json', 'catalogue-essai-conceptions.json']) {
    const c = await api('PUT', `/outils/swn/vaisseaux/catalogue?niveau=univers&lot=${lot0}`, exemple(f));
    assert.equal(c.status, 200, c.texte);
  }
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  const importer = async (corps: unknown) => {
    const lot = await ouvrirLot();
    const rep = await api('PUT', `/outils/swn/vaisseaux/conceptions?lot=${lot}`, corps);
    await api('POST', `/lots/${lot}/clore`);
    return rep;
  };
  const liste = async () => (await antor('GET', `${V}/conceptions`)).json.conceptions as Any[];
  const detail = async (titre: string) => {
    const c = (await liste()).find((x) => x.titre === titre);
    assert.ok(c, `no design titled ${titre}`);
    return (await antor('GET', `${V}/conceptions/${c.ficheId}`)).json;
  };
  const nbFiches = async () => ((await antor('GET', `/api/univers/${E}/fiches`)).json.fiches as Any[]).length;
  return { V, antor, importer, liste, detail, nbFiches };
}
const compteurs = (r: Rep) => r.json.natures.conceptions;

describe('I-3 le rejeu écrit ce que le fichier porte, quel que soit le dernier à avoir enregistré', () => {
  it('une conception enregistrée à l\'écran puis rejouée depuis le fichier : 1 mise à jour, prix revenu à 25 000, aucune fiche en plus', async () => {
    const m = await monde();
    assert.deepEqual(compteurs(await m.importer(exemple('conceptions-essai.json'))), { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });
    const avant = await m.detail('Éclaireur léger');
    assert.equal(avant.resultat.prix, 25000);
    const fiches = await m.nbFiches();
    // the GM adds a blindage at the screen: 20 000 + 5 000 + 4 000 = 29 000 cr (same figure as the éclaireur blindé of the file)
    const p = await m.antor('PUT', `${m.V}/conceptions/${avant.ficheId}`, {
      coque: 'eclaireur', version: avant.version,
      choix: [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1 }, { nature: 'defenses', cle: 'blindage', quantite: 1 }],
    });
    assert.equal(p.status, 200, p.texte);
    assert.equal((await m.detail('Éclaireur léger')).resultat.prix, 29000);
    const r = await m.importer(exemple('conceptions-essai.json'));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(compteurs(r), { creees: 0, mises_a_jour: 1, inchangees: 3, refusees: 0 });
    assert.equal((await m.detail('Éclaireur léger')).resultat.prix, 25000);
    assert.equal(await m.nbFiches(), fiches);
  });

  it('un titre différent sur une clé connue : inchangée, la fiche garde son titre', async () => {
    const m = await monde();
    await m.importer(exemple('conceptions-essai.json'));
    const f = exemple('conceptions-essai.json');
    f.conceptions[0].titre = 'Un tout autre titre';
    const r = await m.importer(f);
    assert.deepEqual(compteurs(r), { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
    const titres = (await m.liste()).map((c) => c.titre);
    assert.ok(titres.includes('Éclaireur léger'));
    assert.ok(!titres.includes('Un tout autre titre'));
  });
});

describe('I-1 une ligne de choix ne porte que ce que le contrat dit', () => {
  it('une clé hors contrat dans une ligne : refusée sous conceptions[1].choix[0], les autres passent, aucune fiche laissée', async () => {
    const m = await monde();
    const avant = await m.nbFiches();
    const bonne = (cle: string, titre: string) => ({ cle, titre, coque: 'eclaireur', choix: [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1 }] });
    const r = await m.importer({ conceptions: [
      bonne('essai-a', 'Avant'),
      { cle: 'essai-x', titre: 'Clé étrangère', coque: 'eclaireur', choix: [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1, bidule: 3 }] },
      bonne('essai-b', 'Après'),
    ] });
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(compteurs(r), { creees: 2, mises_a_jour: 0, inchangees: 0, refusees: 1 });
    assert.equal(r.json.refus.length, 1);
    assert.match(r.json.refus[0].champ, /^conceptions\[1\]\.choix\[0\]/);
    assert.equal(await m.nbFiches(), avant + 2);
  });
});
