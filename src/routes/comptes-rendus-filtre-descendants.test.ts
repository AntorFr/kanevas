// Door of AD-cr-aventure-3: `?campagne=` lists the reports of the adventure and of its scenarios (unbroken chain of readable adventures).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

type Ligne = { id: number; titre: string; campagneId?: number; campagneNom?: string };
type Monde = Awaited<ReturnType<typeof monter>>;

const lecteurs = (w: Monde) => ({ lea: { h: w.lea, q: '' }, antorModeJoueur: { h: w.antor, q: '&mode=joueur' }, antor: { h: w.antor, q: '' } });

async function sous(w: Monde, parent: number, titre: string, lu: boolean, type = 'aventure') {
  return w.creer(w.antor, { type, ...(type === 'aventure' ? { sousType: 'Scénario' } : {}), titre, parent, sections: [{ titre: 'Scénario', joueursLisent: lu }] });
}
async function cr(w: Monde, aventure: number, titre: string) {
  const r = await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: aventure, titre, texte: 'Texte.' });
  assert.equal(r.statusCode, 201, r.body);
  return r.json().id as number;
}
async function liste(w: Monde, h: Monde['antor'], aventure: number, extra = '') {
  const r = await w.appel(h, 'GET', `${w.base}/comptes-rendus?campagne=${aventure}${extra}`);
  assert.equal(r.statusCode, 200, r.body);
  return r.json() as { comptesRendus: Ligne[]; total: number; suivant: string | null };
}

describe('Reports filter by adventure descends into scenarios', () => {
  test('Campagne → Arc → Étape: three reports, each with its own adventure; ?campagne=étape only its own', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const arc = await sous(w, c.id, 'Arc', true);
    const etape = await sous(w, arc.id, 'Étape', true);
    await cr(w, c.id, 'CR campagne');
    await cr(w, arc.id, 'CR arc');
    await cr(w, etape.id, 'CR étape');
    for (const [nom, { h, q }] of Object.entries(lecteurs(w))) {
      const l = await liste(w, h, c.id, q);
      assert.equal(l.total, 3, nom);
      const par = Object.fromEntries(l.comptesRendus.map((x) => [x.titre, [x.campagneId, x.campagneNom]]));
      assert.deepEqual(par, { 'CR campagne': [c.id, 'Couronne'], 'CR arc': [arc.id, 'Arc'], 'CR étape': [etape.id, 'Étape'] }, nom);
      const e = await liste(w, h, etape.id, q);
      assert.deepEqual(e.comptesRendus.map((x) => x.titre), ['CR étape'], nom);
      assert.equal(e.total, 1);
      const a = await liste(w, h, arc.id, q);
      assert.deepEqual(a.comptesRendus.map((x) => x.titre).sort(), ['CR arc', 'CR étape'], nom);
    }
  });

  test('an unreadable scenario brings neither its reports nor its readable descendant\'s — player and GM in player mode; the GM sees all', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const ferme = await sous(w, c.id, 'Arc fermé', false);
    const dessous = await sous(w, ferme.id, 'Étape lue', true);
    const lu = await sous(w, c.id, 'Arc lu', true);
    await cr(w, c.id, 'CR campagne');
    await cr(w, ferme.id, 'CR fermé');
    await cr(w, dessous.id, 'CR dessous');
    await cr(w, lu.id, 'CR lu');
    for (const { h, q } of [lecteurs(w).lea, lecteurs(w).antorModeJoueur]) {
      const l = await liste(w, h, c.id, q);
      assert.deepEqual(l.comptesRendus.map((x) => x.titre).sort(), ['CR campagne', 'CR lu']);
      assert.equal(l.total, 2, 'the total does not count hidden ones');
      assert.doesNotMatch(JSON.stringify(l), /Arc fermé|Étape lue/);
    }
    const mj = await liste(w, w.antor, c.id);
    assert.equal(mj.total, 4);
  });

  test('an adventure under a sheet of another type is left out, with what is below it', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const lieu = await sous(w, c.id, 'Un lieu', true, 'lieu');
    const perdu = await sous(w, lieu.id, 'Aventure perdue', true);
    await cr(w, c.id, 'CR campagne');
    await cr(w, perdu.id, 'CR perdu');
    for (const { h, q } of Object.values(lecteurs(w))) {
      const l = await liste(w, h, c.id, q);
      assert.deepEqual(l.comptesRendus.map((x) => x.titre), ['CR campagne']);
      assert.equal(l.total, 1);
    }
  });

  test('past 100, the total and the cursor stay coherent across levels', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const arc = await sous(w, c.id, 'Arc', true);
    const ids: number[] = [];
    for (let i = 0; i < 105; i++) ids.push(await cr(w, i % 2 ? arc.id : c.id, `CR ${i}`));
    const p1 = await liste(w, w.antor, c.id);
    assert.equal(p1.total, 105);
    assert.equal(p1.comptesRendus.length, 100);
    assert.ok(p1.suivant);
    const p2 = await liste(w, w.antor, c.id, `&curseur=${p1.suivant}`);
    assert.equal(p2.comptesRendus.length, 5);
    assert.equal(p2.suivant, null);
    const tous = [...p1.comptesRendus, ...p2.comptesRendus].map((x) => x.id);
    assert.equal(new Set(tous).size, 105);
  });

  test('the deletion count of the campaign counts only its direct reports', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const arc = await sous(w, c.id, 'Arc', true);
    await cr(w, c.id, 'CR campagne');
    await cr(w, c.id, 'CR campagne 2');
    await cr(w, arc.id, 'CR arc');
    const b = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${c.id}/suppression`)).json();
    assert.equal(b.comptesRendus, 2);
    assert.equal(b.scenarios, 1);
  });

  test('a non-reader of the named adventure still gets not found', async () => {
    const w = await monter();
    const c = await w.campagneOuverte('Couronne');
    const ferme = await sous(w, c.id, 'Arc fermé', false);
    assert.equal((await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=${ferme.id}`)).statusCode, 404);
  });
});
