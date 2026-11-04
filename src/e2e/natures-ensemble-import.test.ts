// Tests d'ensemble de kanevas-fiches-liees-natures, par l'API d'import (B-68, AD-134 pour le contrat), écrits depuis le
// besoin : « une entrée {section, cible, nature, qualificatif} crée la relation, rejouée elle est inchangée, `type` seul est
// lu comme qualificatif, une nature inconnue est refusée et comptée », « type: famille ». Vrai serveur en mode bouchon, avec
// son monde de départ (« Essai Kanka », jeton du bouchon, README) ; l'application lit ensuite ce que l'import a écrit.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
let lot = 0;

const api = (chemin: string, init: RequestInit = {}) =>
  fetch(`${srv.base}/api/import/v1/univers/${U}${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
const fiche = async (cle: string, type: string, titre: string) => {
  const r = await api(`/fiches/${encodeURIComponent(cle)}`, {
    method: 'PUT',
    body: JSON.stringify({ type, titre, sections: [{ cle: 's', titre: 'Apparence', contenu: 'x', joueursLisent: true }] }),
  });
  return { status: r.status, body: (await r.json()) as Any };
};
const relier = async (cle: string, entrees: Any[]) => {
  const r = await api(`/fiches/${encodeURIComponent(cle)}/relations?lot=${lot}`, { method: 'POST', body: JSON.stringify(entrees) });
  return { status: r.status, body: (await r.json()) as Any };
};
/** Relations of the first section of a sheet, as the application serves them to Antor. */
async function lues(id: number): Promise<Any[]> {
  const f = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${id}`)).json();
  const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${id}/sections/${f.sections[0].id}/relations`)).json();
  return r.relations;
}
async function compteurs(): Promise<Any> {
  const r = await (await api(`/lots/${lot}`)).json();
  return r;
}

describe('kanevas-fiches-liees-natures, l’import connaît natures, qualificatifs et familles (B-68)', { skip: skipBrowser }, () => {
  const ids: Record<string, number> = {};
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await (await antor.request.fetch(`${srv.base}/api/univers`)).json();
    U = (us.univers ?? us).find((u: Any) => u.nom === 'Essai Kanka').id;
    lot = (await (await api('/lots', { method: 'POST' })).json()).lotId;
    for (const [cle, type, titre] of [
      ['personnage:zed', 'personnage', 'Zed'],
      ['lieu:zone', 'lieu', 'Zone'],
      ['lieu:autrezone', 'lieu', 'Autre zone'],
      ['faction:zeds', 'faction', 'Les Zeds'],
    ] as const) {
      const r = await fiche(cle, type, titre);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      ids[cle] = r.body.id;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Panne visée : l'import ignore `nature`/`qualificatif` (relation libre à la place), ou n'est plus rejouable.
  test('{section, cible, nature: "se_situe", qualificatif: "habite"} crée la relation ; rejouée, elle est « inchangee »', opts, async () => {
    const entree = { section: 's', cible: 'lieu:zone', nature: 'se_situe', qualificatif: 'habite' };
    const un = await relier('personnage:zed', [entree]);
    assert.equal(un.status, 200);
    assert.equal(un.body[0].etat, 'creee');
    const deux = await relier('personnage:zed', [entree]);
    assert.equal(deux.body[0].etat, 'inchangee');
    const rels = await lues(ids['personnage:zed']);
    assert.equal(rels.filter((r) => r.nature === 'se_situe' && r.qualificatif === 'habite' && r.cible.titre === 'Zone').length, 1);
  });

  // Panne visée : le qualificatif ne distingue plus (une seule relation par cible et nature).
  test('même cible et même nature, autre qualificatif : deuxième relation ; nature sans qualificatif acceptée', opts, async () => {
    const r = await relier('personnage:zed', [
      { section: 's', cible: 'lieu:zone', nature: 'se_situe', qualificatif: 'travaille' },
      { section: 's', cible: 'lieu:autrezone', nature: 'se_situe' },
    ]);
    assert.deepEqual(r.body.map((x: Any) => x.etat), ['creee', 'creee']);
    const rels = await lues(ids['personnage:zed']);
    assert.ok(rels.some((x) => x.cible.titre === 'Zone' && x.qualificatif === 'travaille'));
    assert.ok(rels.some((x) => x.cible.titre === 'Autre zone' && x.nature === 'se_situe' && x.qualificatif === ''));
    assert.equal(rels.filter((x) => x.cible.titre === 'Zone' && x.nature === 'se_situe').length, 2);
  });

  // Panne visée : `type` n'est plus lu (les scripts d'aujourd'hui cassent), ou il devient une nature.
  test('`type` seul est lu comme qualificatif d’une relation libre', opts, async () => {
    const r = await relier('personnage:zed', [{ section: 's', cible: 'faction:zeds', type: 'ancien texte' }]);
    assert.equal(r.status, 200);
    assert.equal(r.body[0].etat, 'creee');
    const rels = await lues(ids['personnage:zed']);
    assert.ok(rels.some((x) => x.cible.titre === 'Les Zeds' && x.nature === '' && x.qualificatif === 'ancien texte'));
  });

  // Panne visée : une nature inconnue devient une relation libre, ou n'est pas comptée.
  test('nature inconnue ou « dirige » ou hors du couple : refusée « nature_incompatible », comptée, et aucune relation libre n’en naît', opts, async () => {
    const avant = (await lues(ids['personnage:zed'])).length;
    const avantLot = (await compteurs()).compteurs.relations.refusees;
    const r = await relier('personnage:zed', [
      { section: 's', cible: 'faction:zeds', nature: 'inconnue', qualificatif: 'a' },
      { section: 's', cible: 'faction:zeds', nature: 'dirige', qualificatif: 'b' },
      { section: 's', cible: 'lieu:zone', nature: 'detient', qualificatif: 'c' },
    ]);
    for (const x of r.body) {
      assert.equal(x.etat, 'refusee');
      assert.equal(x.code, 'nature_incompatible');
    }
    assert.equal((await lues(ids['personnage:zed'])).length, avant, 'aucune relation écrite');
    assert.equal((await compteurs()).compteurs.relations.refusees, avantLot + 3);
  });

  // Panne visée : une nature « membre de » vers une famille, ou le type « famille », refusés par l'import.
  test('`type: "famille"` crée une famille ; « membre de » vers elle est acceptée et l’application la lit', opts, async () => {
    const f = await fiche('famille:zedi', 'famille', 'Les Zedi');
    assert.equal(f.status, 200);
    assert.equal(f.body.etat, 'creee');
    assert.equal((await fiche('famille:zedi', 'famille', 'Les Zedi')).body.etat, 'inchangee');
    const r = await relier('personnage:zed', [{ section: 's', cible: 'famille:zedi', nature: 'membre', qualificatif: 'aîné' }]);
    assert.equal(r.body[0].etat, 'creee');
    const fams = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=famille`)).json();
    assert.ok(fams.fiches.some((x: Any) => x.titre === 'Les Zedi'));
    assert.ok((await lues(ids['personnage:zed'])).some((x) => x.nature === 'membre' && x.qualificatif === 'aîné' && x.cible.titre === 'Les Zedi'));
  });

  // Panne visée : le rapport du lot ne compte pas les natures (créées, inchangées, refusées).
  test('le lot clos compte les relations créées, inchangées et refusées, et son rapport nomme « nature_incompatible »', opts, async () => {
    const clos = await (await api(`/lots/${lot}/clore`, { method: 'POST' })).json();
    assert.deepEqual(clos.compteurs.relations, { creees: 5, mises_a_jour: 0, inchangees: 1, refusees: 3 });
    assert.equal(clos.rapport.filter((x: Any) => x.code === 'nature_incompatible').length, 3);
  });
});
