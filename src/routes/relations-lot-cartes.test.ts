// Doors of the effects that the badge « PJ / PNJ » of a relation proved through the browser (AD-64: the `cible` of a relation carries
// `charge: {pj}` for a personnage and nothing else). The cases of `relations-badge-pj.test.ts` stay the base; this file adds what they
// do not pin: the exact keys of a target, a compte-rendu target that leaks nothing of its campaign, a hidden target absent for a player.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

async function monde() {
  const w = await monter();
  const section = async (fiche: number, titre: string, ouverte: boolean) => {
    const s = (await w.appel(w.antor, 'POST', `${w.base}/fiches/${fiche}/sections`, { titre, contenu: 'Texte.' })).json() as { id: number };
    if (ouverte) assert.equal((await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${fiche}/sections/${s.id}`, { joueursLisent: true })).statusCode, 200);
    return s.id;
  };
  const depart = await w.creer(w.antor, { type: 'lieu', titre: 'Port-Sel' });
  const secDepart = await section(depart.id, 'Apparence', true);
  const rel = `${w.base}/fiches/${depart.id}/sections/${secDepart}/relations`;
  const cible = async (type: string, titre: string, ouverte: boolean, charge?: object) => {
    const f = await w.creer(w.antor, { type, titre, ...(charge ? { charge } : {}) });
    await section(f.id, 'Résumé', ouverte);
    return f.id;
  };
  return { ...w, rel, cible, section };
}

describe('Relation target: the badge and nothing more', () => {
  test('a personnage target carries {id, titre, type, charge:{pj}} and a faction or a place carries no charge; no section nor text of the target comes with it', async () => {
    const m = await monde();
    const pj = await m.cible('personnage', 'Mira la Lame', true, { v: 1, pj: true });
    const pnj = await m.cible('personnage', 'Gorbal', true, { v: 1, pj: false });
    const faction = await m.cible('faction', 'Lames Grises', true);
    const lieu = await m.cible('lieu', 'Port-Sombre', true);
    for (const [id, type] of [[pj, 'allié de'], [pnj, 'forgé par'], [faction, 'membre de'], [lieu, 'habite']] as const) {
      const r = await m.appel(m.antor, 'POST', m.rel, { cibleFicheId: id, type });
      assert.equal(r.statusCode, 201, r.body);
    }
    const lue = await m.appel(m.antor, 'GET', m.rel);
    const cibles = (lue.json().relations as { cible: Record<string, unknown> }[]).map((r) => r.cible);
    assert.equal(cibles.length, 4);
    for (const c of cibles) {
      assert.deepEqual(Object.keys(c).sort(), c.type === 'personnage' ? ['charge', 'id', 'titre', 'type'] : ['id', 'titre', 'type'], String(c.titre));
      if (c.charge) assert.deepEqual(Object.keys(c.charge as object), ['pj']);
    }
    assert.ok(!lue.body.includes('Résumé') && !lue.body.includes('Texte.') && !lue.body.includes('"contenu"'));
  });

  test('a compte-rendu target gives nothing of its campaign, and a player reads the badge of a target she reads and no trace of one she does not', async () => {
    const m = await monde();
    const campagne = await m.campagneOuverte();
    const cr = (await m.appel(m.lea, 'POST', `${m.base}/comptes-rendus`, { campagneId: campagne.id, titre: 'Séance 3', texte: 'Aldric parle.' })).json() as { id: number };
    assert.ok(cr.id);
    const pj = await m.cible('personnage', 'Mira la Lame', true, { v: 1, pj: true });
    const cachee = await m.cible('personnage', 'Spectre', false, { v: 1, pj: true });
    for (const [id, type] of [[cr.id, 'raconté dans'], [pj, 'allié de'], [cachee, 'hante']] as const) {
      const r = await m.appel(m.antor, 'POST', m.rel, { cibleFicheId: id, type });
      assert.equal(r.statusCode, 201, r.body);
      if (id === cr.id) assert.ok(!JSON.stringify(r.json().cible).includes('campagne'), r.body);
    }
    const mj = (await m.appel(m.antor, 'GET', m.rel)).json().relations as { cible: Record<string, unknown> }[];
    assert.ok(!JSON.stringify(mj.find((r) => r.cible.titre === 'Séance 3')!.cible).includes('campagne'));
    assert.equal(mj.find((r) => r.cible.titre === 'Séance 3')!.cible.charge, undefined);
    const lea = await m.appel(m.lea, 'GET', m.rel);
    assert.equal(lea.statusCode, 200);
    assert.deepEqual(lea.json().relations.find((r: { cible: { titre: string } }) => r.cible.titre === 'Mira la Lame').cible.charge, { pj: true });
    assert.ok(!lea.body.includes('Spectre') && !lea.body.includes('hante'));
  });
});
