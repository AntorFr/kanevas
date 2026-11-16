// Door of the lot « vaisseaux » for `src/e2e/format-evolue-masses-ensemble.test.ts`: the API describes of that file, moved here (the app listens in this process,
// same HTTP, same seeded world). The screen file keeps its « à l'écran » describe: what the user reads.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';


const servers: Server[] = [];
after(async () => { servers.forEach((s) => s.stop()); });

interface Rep { status: number; json: Any; texte: string }
interface Monde {
  base: string; E: number; V: string; aube: number;
  api: (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  imp: (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  importer: (fichier: Any, apercu?: boolean) => Promise<Rep>;
}

const CLE = 'coupleur-essai';
const element = (cle: string, masse: unknown, plus: Any = {}) => ({
  cle, nom: cle === CLE ? "Coupleur d'essai" : `Élément ${cle}`, cout: 4, puissance: 0, masse,
  x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0, ...plus,
});
const fichier = (natures: Any) => ({ catalogue: 'swn/vaisseaux', version: 'essai-format-evolue', ...natures });
const choix = (quantite: number) => [{ nature: 'amenagements', cle: CLE, quantite }];

async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  const jeton = (await api('antor', 'POST', `/api/univers/${E}/jetons`, { nom: 'Script masses', dureeJours: 30, outils: ['swn/vaisseaux'] })).json.valeur as string;
  const imp = async (methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
    const r = await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const lot = (await imp('POST', '/lots?outil=swn/vaisseaux')).json.lotId as number;
  const importer = (f: Any) => imp('PUT', `/outils/swn/vaisseaux/catalogue?niveau=univers&lot=${lot}`, f);
  const liste = (await api('antor', 'GET', `${V}/conceptions`)).json;
  const aube = liste.fichesSansConception.find((f: Any) => f.titre === 'Aube de Sel').ficheId as number;
  return { base: srv.base, E, V, aube, api, imp, importer };
}

/** The invented element is imported; returns the world. */
async function mondeAvecCoupleur(plus: Any = {}): Promise<Monde> {
  const m = await monde();
  const r = await m.importer(fichier({ amenagements: [element(CLE, 0.5, plus)] }));
  assert.equal(r.status, 200, r.texte);
  assert.equal(r.json.natures.amenagements.ajoutes, 1, r.texte);
  return m;
}
const calcul = (m: Monde, quantite: number, coque = 'eclaireur') => m.api('lea', 'POST', `${m.V}/calcul`, { coque, choix: choix(quantite) });
const codes = (r: Rep) => (r.json.alertes as Any[]).map((a) => a.code);

import { startServer, type Any, type Server } from './serveur-lot-vaisseaux.ts';
describe('B-80 import du catalogue : une masse multiple de 0,5', () => {
  it('nominal : un élément de masse 0,5 est créé, inchangé au rejeu, sans doublon ; son résumé dit « masse 0,5 »', async () => {
    const m = await monde();
    const un = await m.importer(fichier({ amenagements: [element(CLE, 0.5)] }));
    assert.equal(un.status, 200, un.texte);
    assert.equal(un.json.natures.amenagements.ajoutes, 1);
    assert.equal(un.json.refusTotal, 0);
    const deux = await m.importer(fichier({ amenagements: [element(CLE, 0.5)] }));
    assert.equal(deux.json.natures.amenagements.inchanges, 1);
    assert.equal(deux.json.natures.amenagements.ajoutes, 0);
    assert.equal(deux.json.natures.amenagements.modifies, 0);
    const cat = (await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.filter((e: Any) => e.cle === CLE);
    assert.equal(cat.length, 1);
    assert.match(cat[0].resume, /masse 0,5/);
    assert.ok(!cat[0].resume.includes('0.5'), cat[0].resume);
  });

  it('bords : 0, 1,5 et 7,5 passent ; une coque de masse 7,5 passe', async () => {
    const m = await monde();
    const r = await m.importer(fichier({
      amenagements: [element('zero', 0), element('un-et-demi', 1.5), element('sept-et-demi', 7.5)],
      coques: [{ cle: 'coque-demi', nom: 'Coque demie', classe: 1, cout: 1000, pv: 5, ca: 10, puissance: 10, masse: 7.5, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 }],
    }));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.refusTotal, 0, r.texte);
    assert.equal(r.json.natures.amenagements.ajoutes, 3);
    assert.equal(r.json.natures.coques.ajoutes, 1);
    const res = (await m.api('lea', 'POST', `${m.V}/calcul`, { coque: 'coque-demi', choix: [{ nature: 'amenagements', cle: 'un-et-demi', quantite: 1 }] })).json.resultat;
    assert.equal(res.masseLibre, 6);
  });

  it('échec : 0,3, 1,25, 0,7, −0,5, "1" et null sont refusés avec champ masse ; l’élément correct du même fichier passe et rien des refusés n’est écrit', async () => {
    const m = await monde();
    const mauvais: Array<[string, unknown, string]> = [
      ['m-03', 0.3, 'multiple de 0,5 attendu'], ['m-125', 1.25, 'multiple de 0,5 attendu'], ['m-07', 0.7, 'multiple de 0,5 attendu'],
      ['m-neg', -0.5, ''], ['m-texte', '1', 'nombre attendu'], ['m-null', null, ''],
    ];
    const r = await m.importer(fichier({ amenagements: [element(CLE, 0.5), ...mauvais.map(([c, v]) => element(c, v))] }));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.natures.amenagements.ajoutes, 1);
    assert.equal(r.json.natures.amenagements.refuses, 6);
    assert.equal(r.json.refusTotal, 6);
    for (const [cle, , raison] of mauvais) {
      const refus = (r.json.refus as Any[]).find((x) => x.cle === cle);
      assert.ok(refus, `refus de ${cle} : ${r.texte}`);
      assert.equal(refus.champ, 'masse', cle);
      if (raison) assert.equal(refus.raison, raison, cle);
    }
    const cles = (await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.map((e: Any) => e.cle);
    assert.ok(cles.includes(CLE));
    for (const [cle] of mauvais) assert.ok(!cles.includes(cle), `${cle} ne doit pas être écrit`);
  });

  it('échec : une coque de masse 0,3 est refusée avec champ masse', async () => {
    const m = await monde();
    const r = await m.importer(fichier({ coques: [{ cle: 'coque-fausse', nom: 'Coque fausse', classe: 1, cout: 1000, pv: 5, ca: 10, puissance: 10, masse: 0.3, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 }] }));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.refus.map((x: Any) => [x.nature, x.cle, x.champ]), [['coques', 'coque-fausse', 'masse']]);
    assert.ok(!(await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.some((e: Any) => e.cle === 'coque-fausse'));
  });

  it('session : l’aperçu d’un fichier à masse 0,5 et masse 0,3 écrit rien et refuse 0,3 avec son champ ; l’application ne crée que 0,5', async () => {
    const m = await monde();
    const contenu = fichier({ amenagements: [element(CLE, 0.5), element('mauvais', 0.3)] });
    const ap = await m.api('antor', 'POST', `${m.V}/catalogue/apercu`, contenu);
    assert.equal(ap.status, 200, ap.texte);
    assert.deepEqual(ap.json.refus.map((x: Any) => [x.nature, x.cle, x.champ]), [['amenagements', 'mauvais', 'masse']]);
    assert.ok(!(await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.some((e: Any) => e.cle === CLE), 'the preview writes nothing');
    const ok = await m.api('antor', 'POST', `${m.V}/catalogue/application`, contenu);
    assert.equal(ok.status, 200, ok.texte);
    const cles = (await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.map((e: Any) => e.cle);
    assert.ok(cles.includes(CLE));
    assert.ok(!cles.includes('mauvais'));
  });

  it('exclusion : une masse entière du catalogue se lit sans virgule dans son résumé (« masse 2 », jamais « 2,0 »)', async () => {
    const m = await monde();
    const cabines = (await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.find((e: Any) => e.cle === 'cabines');
    assert.match(cabines.resume, /masse 2$/);
  });
});

describe('B-80 calcul exact et alertes', () => {
  it('trois éléments de 0,5 : masse libre 6,5 ; quinze : 0,5 ; quatre-vingt-dix-neuf : −41,5', async () => {
    const m = await mondeAvecCoupleur();
    assert.equal((await calcul(m, 3)).json.resultat.masseLibre, 6.5);
    assert.equal((await calcul(m, 15)).json.resultat.masseLibre, 0.5);
    assert.equal((await calcul(m, 99)).json.resultat.masseLibre, -41.5);
  });

  it('la masse libre est exactement 0 à seize éléments : pas d’alerte masse_insuffisante ; à dix-sept (−0,5) : bloquante « Masse insuffisante : −0,5 »', async () => {
    const m = await mondeAvecCoupleur();
    const zero = await calcul(m, 16);
    assert.equal(zero.json.resultat.masseLibre, 0);
    assert.ok(!codes(zero).includes('masse_insuffisante'), zero.texte);
    const trop = await calcul(m, 17);
    assert.equal(trop.json.resultat.masseLibre, -0.5);
    assert.deepEqual(trop.json.alertes.filter((a: Any) => a.code === 'masse_insuffisante').map((a: Any) => [a.niveau, a.texte]), [['bloquante', 'Masse insuffisante : −0,5']]);
    const demi = await calcul(m, 15);
    assert.ok(!codes(demi).includes('masse_insuffisante'));
  });

  it('un enregistrement à masse libre 0 passe, à −0,5 est refusé 422 sans rien écrire', async () => {
    const m = await mondeAvecCoupleur();
    const cree = await m.api('antor', 'POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' });
    assert.equal(cree.status, 201, cree.texte);
    const refus = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: choix(17), version: cree.json.version });
    assert.equal(refus.status, 422, refus.texte);
    assert.equal((await m.api('antor', 'GET', `${m.V}/conceptions/${m.aube}`)).json.version, cree.json.version);
    const ok = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: choix(16), version: cree.json.version });
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(ok.json.resultat.masseLibre, 0);
  });

  it('le facteur de coque multiplie exactement : coque de masse 7,5 facteur 3, élément x_masse de 0,5 pris trois fois → masse libre 3', async () => {
    const m = await monde();
    const r = await m.importer(fichier({
      coques: [{ cle: 'coque-x3', nom: 'Coque x3', classe: 1, cout: 1000, pv: 5, ca: 10, puissance: 10, masse: 7.5, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 3 }],
      amenagements: [element(CLE, 0.5, { x_masse: true })],
    }));
    assert.equal(r.json.refusTotal, 0, r.texte);
    const res = (await calcul(m, 3, 'coque-x3')).json.resultat;
    assert.equal(res.masseLibre, 3);
  });

  it('exclusion : une masse entière reste entière (Éclaireur nu : masse libre 7)', async () => {
    const m = await monde();
    const r = await m.api('lea', 'POST', `${m.V}/calcul`, { coque: 'eclaireur', choix: [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1 }] });
    assert.equal(r.json.resultat.masseLibre, 7);
  });
});

describe('B-80 textes de la conception enregistrée et des fiches de règles', () => {
  it('la section « Caractéristiques » dit « Masse libre » 6,5 ; la fiche de règles des aménagements dit 0,5 pour le coupleur et 3 pour la soute', async () => {
    const m = await mondeAvecCoupleur();
    const cree = await m.api('antor', 'POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' });
    const ok = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: choix(3), version: cree.json.version });
    assert.equal(ok.status, 200, ok.texte);
    const fiche = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches/${m.aube}`)).json;
    const section = fiche.sections.find((s: Any) => s.titre === 'Caractéristiques');
    const plat = (section.html as string).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(plat, /Masse libre 6,5/);
    assert.ok(!plat.includes('6.5'));

    const gen = await m.api('antor', 'POST', `${m.V}/fiches-regles`);
    assert.equal(gen.status, 200, gen.texte);
    const regles = gen.json.fiches.find((f: Any) => f.cle === 'regles-amenagements');
    const fr = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches/${regles.ficheId}`)).json;
    const lignes = (fr.sections[0].html as string).split('<tr>').map((l) => l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const coupleur = lignes.find((l) => l.startsWith("Coupleur d'essai"))!;
    assert.match(coupleur, /^Coupleur d'essai \(Univers\) 4 cr 0 0,5 0 0 /);
    assert.match(lignes.find((l) => l.startsWith('Soute'))!, /^Soute 10 000 cr 0 3 /);
    assert.ok(!coupleur.includes('0.5'));
  });
});

