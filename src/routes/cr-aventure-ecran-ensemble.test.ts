// Ensemble de kanevas-cr-aventure-ecran, écrit depuis le besoin (B-cr-aventure-1, P-4 étape 3) : la porte PATCH /fiches/:fid {campagne}.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

async function monde() {
  const w = await monter();
  const a = await w.campagneOuverte('Couronne');
  const scenario = await w.scenarioFerme(a.id, 'Acte II');
  const r = await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: a.id, titre: 'Séance 1', texte: 'Texte.' });
  assert.equal(r.statusCode, 201, r.body);
  const cr = r.json().id as number;
  const patch = (h: typeof w.antor, id: number, corps: object, q = '') => w.appel(h, 'PATCH', `${w.base}/fiches/${id}${q}`, corps);
  const lire = async (id: number) => (await w.appel(w.antor, 'GET', `${w.base}/fiches/${id}`)).json();
  return { ...w, a, scenario, cr, patch, lire };
}
const histo = (m: Awaited<ReturnType<typeof monde>>) => m.n('historique');

describe('kanevas-cr-aventure-ecran ensemble, porte PATCH {campagne}', () => {
  test('le MJ range le compte rendu sous un scénario fermé aux joueurs : 200, fiche rendue, titre et sections inchangés', async () => {
    const m = await monde();
    const avant = await m.lire(m.cr);
    const res = await m.patch(m.antor, m.cr, { campagne: m.scenario.id });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().charge.campagne_id, m.scenario.id);
    const apres = await m.lire(m.cr);
    assert.equal(apres.titre, 'Séance 1');
    assert.equal(apres.id, m.cr);
    assert.equal(apres.sections.length, avant.sections.length);
    assert.deepEqual(apres.sections.map((s: { contenu?: string }) => s.contenu), avant.sections.map((s: { contenu?: string }) => s.contenu));
  });

  test('changer puis revenir à la première aventure : la dernière écrite fait foi', async () => {
    const m = await monde();
    assert.equal((await m.patch(m.antor, m.cr, { campagne: m.scenario.id })).statusCode, 200);
    assert.equal((await m.patch(m.antor, m.cr, { campagne: m.a.id })).statusCode, 200);
    assert.equal((await m.lire(m.cr)).campagneId, m.a.id);
  });

  test('un vrai changement laisse de l’historique, la même aventure aucune ligne', async () => {
    const m = await monde();
    const n0 = histo(m);
    assert.equal((await m.patch(m.antor, m.cr, { campagne: m.a.id })).statusCode, 200);
    assert.equal(histo(m), n0);
    assert.equal((await m.patch(m.antor, m.cr, { campagne: m.scenario.id })).statusCode, 200);
    assert.ok(histo(m) > n0);
  });

  test('un joueur ne change pas l’aventure : refusé, rien n’est écrit', async () => {
    const m = await monde();
    const n0 = histo(m);
    const r = await m.patch(m.lea, m.cr, { campagne: m.scenario.id });
    assert.equal(r.statusCode, 403, r.body);
    assert.equal((await m.lire(m.cr)).campagneId, m.a.id);
    assert.equal(histo(m), n0);
  });

  test('un MJ en mode joueur est refusé', async () => {
    const m = await monde();
    const r = await m.patch(m.antor, m.cr, { campagne: m.scenario.id }, '?mode=joueur');
    assert.equal(r.statusCode, 403, r.body);
    assert.equal((await m.lire(m.cr)).campagneId, m.a.id);
  });

  test('un MJ d’un autre univers ne voit pas la fiche : 404, rien n’est écrit', async () => {
    const m = await monde();
    const r = await m.patch(m.mira, m.cr, { campagne: m.scenario.id });
    assert.equal(r.statusCode, 404, r.body);
    assert.equal((await m.lire(m.cr)).campagneId, m.a.id);
  });

  test('une aventure d’un autre univers est refusée en 404 et le compte rendu reste où il est', async () => {
    const m = await monde();
    const u2 = (await m.appel(m.mira, 'POST', '/api/univers', { nom: 'Ailleurs' })).json();
    const etr = await m.appel(m.mira, 'POST', `/api/univers/${u2.id}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'Étrangère', sections: [{ titre: 'P', joueursLisent: true }] });
    assert.equal(etr.statusCode, 201, etr.body);
    const r = await m.patch(m.antor, m.cr, { campagne: etr.json().id });
    assert.equal(r.statusCode, 404, r.body);
    assert.equal((await m.lire(m.cr)).campagneId, m.a.id);
  });

  test('une cible qui n’est pas une aventure (un personnage) donne 404', async () => {
    const m = await monde();
    const p = await m.creer(m.antor, { type: 'personnage', titre: 'Aldric', charge: { v: 1, pj: false } });
    const r = await m.patch(m.antor, m.cr, { campagne: p.id });
    assert.equal(r.statusCode, 404, r.body);
    assert.equal((await m.lire(m.cr)).campagneId, m.a.id);
  });

  test('une cible inconnue donne 404', async () => {
    const m = await monde();
    assert.equal((await m.patch(m.antor, m.cr, { campagne: 987654 })).statusCode, 404);
  });

  test('une fiche qui n’est pas un compte rendu donne 400, une aventure comprise', async () => {
    const m = await monde();
    const p = await m.creer(m.antor, { type: 'personnage', titre: 'Aldric', charge: { v: 1, pj: false } });
    assert.equal((await m.patch(m.antor, p.id, { campagne: m.scenario.id })).statusCode, 400);
    assert.equal((await m.patch(m.antor, m.a.id, { campagne: m.scenario.id })).statusCode, 400);
  });

  test('le compte rendu dont l’aventure a été supprimée peut être rattaché à une autre aventure', async () => {
    const m = await monde();
    const b = await m.campagneOuverte('Landes');
    const sup = await m.appel(m.antor, 'DELETE', `${m.base}/fiches/${b.id}`);
    assert.ok(sup.statusCode < 300, sup.body);
    // le compte rendu rangé sous Couronne n’est pas concerné ; on en crée un sous une aventure qu’on supprime ensuite
    const c = await m.campagneOuverte('Éphémère');
    const r = await m.appel(m.antor, 'POST', `${m.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance orpheline', texte: 'T.' });
    assert.equal(r.statusCode, 201, r.body);
    const id = r.json().id as number;
    const del = await m.appel(m.antor, 'DELETE', `${m.base}/fiches/${c.id}`);
    assert.ok(del.statusCode < 300, del.body);
    const res = await m.patch(m.antor, id, { campagne: m.a.id });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await m.lire(id)).campagneId, m.a.id);
  });
});
