// Doors of the effects that « besoins-relier-chercher » (B-10 relations, B-11 search) proved through the browser.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

async function monde() {
  const w = await monter();
  const section = async (fiche: number, titre: string, contenu: string, ouverte: boolean) => {
    const s = (await w.appel(w.antor, 'POST', `${w.base}/fiches/${fiche}/sections`, { titre, contenu })).json() as { id: number };
    if (ouverte) assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${fiche}/sections/${s.id}`, { joueursLisent: true })).statusCode, 200);
    return s;
  };
  const aldric = await w.creer(w.antor, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  const apparence = await section(aldric.id, 'Apparence', 'Un vieil homme voûté.', true);
  await section(aldric.id, 'Vérité — MJ seul', 'Il trahit le roi.', false);
  const grises = await w.creer(w.antor, { type: 'faction', titre: 'Lames Grises' });
  await section(grises.id, 'Présentation', 'Des lames.', true);
  const rel = `${w.base}/fiches/${aldric.id}/sections/${apparence.id}/relations`;
  return { ...w, aldric, apparence, grises, rel, section };
}

describe('Relations: who writes, what leaves with a section', () => {
  test('a player who may write the section still cannot relate nor unrelate (403 or 404) and nothing is written', async () => {
    const m = await monde();
    assert.equal((await m.appel(m.antor, 'PATCH', `${m.base}/fiches/${m.aldric.id}/sections/${m.apparence.id}`, { joueursEcrivent: true })).statusCode, 200);
    const r = await m.appel(m.lea, 'POST', m.rel, { cibleFicheId: m.grises.id, type: 'membre de' });
    assert.ok(r.statusCode === 403 || r.statusCode === 404, `POST -> ${r.statusCode}`);
    assert.deepEqual((await m.appel(m.antor, 'GET', m.rel)).json().relations, []);
    const cree = (await m.appel(m.antor, 'POST', m.rel, { cibleFicheId: m.grises.id, type: 'membre de' })).json();
    const d = await m.appel(m.lea, 'DELETE', `${m.base}/fiches/relations/${cree.id}`);
    assert.ok(d.statusCode === 403 || d.statusCode === 404, `DELETE -> ${d.statusCode}`);
    assert.equal((await m.appel(m.antor, 'GET', m.rel)).json().relations.length, 1, 'not removed by a player');
  });

  test('removing the « Apparence » section removes its relations and they do not come back when a section of the same title is created', async () => {
    const m = await monde();
    assert.equal((await m.appel(m.antor, 'POST', m.rel, { cibleFicheId: m.grises.id, type: 'membre de' })).statusCode, 201);
    assert.equal((await m.appel(m.antor, 'DELETE', `${m.base}/fiches/${m.aldric.id}/sections/${m.apparence.id}`)).statusCode, 204);
    const neuve = await m.section(m.aldric.id, 'Apparence', 'Autre.', true);
    const l = await m.appel(m.antor, 'GET', `${m.base}/fiches/${m.aldric.id}/sections/${neuve.id}/relations`);
    assert.deepEqual(l.json().relations, []);
    assert.equal((await m.appel(m.antor, 'GET', `${m.base}/fiches/${m.grises.id}`)).statusCode, 200, 'the target stays');
  });

  test('a relation toward a sheet the player no longer reads, or carried by a GM-only section, is absent for the player without any trace', async () => {
    const m = await monde();
    const f = (await m.appel(m.antor, 'GET', `${m.base}/fiches/${m.aldric.id}`)).json();
    const verite = f.sections.find((s: { titre: string }) => s.titre.startsWith('Vérité'));
    assert.equal((await m.appel(m.antor, 'POST', m.rel, { cibleFicheId: m.grises.id, type: 'membre de' })).statusCode, 201);
    assert.equal((await m.appel(m.antor, 'POST', `${m.base}/fiches/${m.aldric.id}/sections/${verite.id}/relations`, { cibleFicheId: m.grises.id, type: 'trahit' })).statusCode, 201);
    const lue = async () => (await m.appel(m.lea, 'GET', m.rel)).body;
    assert.ok((await lue()).includes('Lames Grises'));
    const fermee = await m.appel(m.lea, 'GET', `${m.base}/fiches/${m.aldric.id}/sections/${verite.id}/relations`);
    assert.ok(!fermee.body.includes('trahit') && !fermee.body.includes('Lames Grises'), 'the relation of a GM-only section is not sent');
    const g = (await m.appel(m.antor, 'GET', `${m.base}/fiches/${m.grises.id}`)).json();
    assert.equal((await m.appel(m.antor, 'PATCH', `${m.base}/fiches/${m.grises.id}/sections/${g.sections[0].id}`, { joueursLisent: false })).statusCode, 200);
    const apres = await lue();
    assert.ok(!apres.includes('Lames Grises') && !apres.includes('membre de'));
  });
});

describe('Search: nothing closed comes out', () => {
  test('a player never receives the title, the text or the title of a closed section, whatever the word searched; the GM finds a sheet without sections', async () => {
    const m = await monde();
    const nue = await m.creer(m.antor, { type: 'personnage', titre: 'Dame Nue', charge: { v: 1, pj: false } });
    const vera = await m.creer(m.antor, { type: 'personnage', titre: 'Dame Vérane', charge: { v: 1, pj: false } });
    await m.section(vera.id, 'Secret', 'Espionne.', false);
    for (const q of ['Vérité', 'aldric', 'Dame', 'trahit', 'Secret']) {
      const r = await m.appel(m.lea, 'GET', `${m.base}/fiches?type=personnage&q=${encodeURIComponent(q)}`);
      assert.equal(r.statusCode, 200, q);
      assert.ok(!/Dame Vérane|Dame Nue|trahit|Vérité|Espionne/.test(r.body), `${q}: ${r.body}`);
    }
    const mj = (await m.appel(m.antor, 'GET', `${m.base}/fiches?type=personnage&q=Dame`)).json().fiches as { id: number }[];
    assert.deepEqual(mj.map((f) => f.id).sort(), [nue.id, vera.id].sort());
    const ligne = (await m.appel(m.antor, 'GET', `${m.base}/fiches?type=personnage&q=vieil`)).json();
    assert.ok(!JSON.stringify(ligne).includes('voûté'), 'a result is a list row: no excerpt');
    assert.ok(!('total' in ligne) && !('compte' in ligne), 'no counter');
  });
});
