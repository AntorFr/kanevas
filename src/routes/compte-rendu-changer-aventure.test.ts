// Door of AD-cr-aventure-1 / AD-cr-aventure-5: PATCH /fiches/:fid {campagne} moves a session report to another adventure.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

async function monde() {
  const w = await monter();
  const a = await w.campagneOuverte('Couronne');
  const b = await w.campagneOuverte('Landes');
  const r = await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: a.id, titre: 'Séance 1', texte: 'Texte.' });
  assert.equal(r.statusCode, 201, r.body);
  const cr = r.json().id as number;
  const patch = (h: typeof w.antor, id: number, campagne: unknown, q = '') =>
    w.appel(h, 'PATCH', `${w.base}/fiches/${id}${q}`, { campagne });
  const lire = async (id: number) => (await w.appel(w.antor, 'GET', `${w.base}/fiches/${id}`)).json();
  const lignes = () => w.n('historique');
  return { ...w, a, b, cr, patch, lire, lignes };
}

describe('Change the adventure of a session report', () => {
  test('the GM gets 200 and the sheet; only campagne_id moves, id, key, sections, relation and link stay', async () => {
    const m = await monde();
    const autre = await m.creer(m.antor, { type: 'personnage', titre: 'Aldric', charge: { v: 1, pj: false }, sections: [{ titre: 'Notes', joueursLisent: true }] });
    const avant = await m.lire(m.cr);
    const fa = await m.lire(autre.id);
    const sid = fa.sections[0].id as number;
    const put = await m.appel(m.antor, 'PUT', `${m.base}/fiches/${autre.id}/sections/${sid}/contenu`, { contenu: `Vu en [[${m.cr}|Séance 1]].`, version: fa.sections[0].version });
    assert.equal(put.statusCode, 200, put.body);
    const rel = await m.appel(m.antor, 'POST', `${m.base}/fiches/${autre.id}/sections/${sid}/relations`, { cibleFicheId: m.cr, qualificatif: 'a vécu' });
    assert.equal(rel.statusCode, 201, rel.body);
    const liensAvant = m.app.db.prepare('SELECT cible_fiche_id, texte FROM liens WHERE cible_fiche_id = ?').all(m.cr);
    assert.equal(liensAvant.length, 1);
    const relsAvant = m.app.db.prepare('SELECT COUNT(*) n FROM relations WHERE cible_fiche_id = ?').get(m.cr) as { n: number };
    assert.equal(relsAvant.n, 1);

    const res = await m.patch(m.antor, m.cr, m.b.id);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().id, m.cr);
    assert.equal(res.json().charge.campagne_id, m.b.id);
    const apres = await m.lire(m.cr);
    assert.equal(apres.campagneId, m.b.id);
    assert.equal(apres.cle, avant.cle);
    assert.deepEqual(apres.sections.map((s: { id: number; titre: string; version: number }) => [s.id, s.titre, s.version]),
      avant.sections.map((s: { id: number; titre: string; version: number }) => [s.id, s.titre, s.version]));
    assert.deepEqual(apres.ancetres, avant.ancetres);
    assert.deepEqual(m.app.db.prepare('SELECT cible_fiche_id, texte FROM liens WHERE cible_fiche_id = ?').all(m.cr), liensAvant);
    assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM relations WHERE cible_fiche_id = ?').get(m.cr) as { n: number }).n, 1);
    const liste = (await m.appel(m.antor, 'GET', `${m.base}/comptes-rendus`)).json().comptesRendus as { id: number; campagneId?: number }[];
    assert.equal(liste.find((x) => x.id === m.cr)?.campagneId, m.b.id);
  });

  test('the parent of the report does not move', async () => {
    const m = await monde();
    const avant = (m.app.db.prepare('SELECT parent_id p FROM fiches WHERE id = ?').get(m.cr) as { p: number | null }).p;
    assert.equal((await m.patch(m.antor, m.cr, m.b.id)).statusCode, 200);
    assert.equal((m.app.db.prepare('SELECT parent_id p FROM fiches WHERE id = ?').get(m.cr) as { p: number | null }).p, avant);
  });

  test('the same adventure answers 200 and writes no history line', async () => {
    const m = await monde();
    const n = m.lignes();
    const res = await m.patch(m.antor, m.cr, m.a.id);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().charge.campagne_id, m.a.id);
    assert.equal(m.lignes(), n);
    assert.equal((await m.patch(m.antor, m.cr, m.b.id)).statusCode, 200);
    assert.ok(m.lignes() > n, 'a real change does write history');
  });

  test('a player, a GM of another universe and a GM in player mode are refused like for {statut}', async () => {
    const m = await monde();
    const statut = async (h: typeof m.antor, q = '') => (await m.appel(h, 'PATCH', `${m.base}/fiches/${m.cr}${q}`, { statut: 'prete' })).statusCode;
    const n = m.lignes();
    // Léa reads the report (open to players): same code as {statut}
    const attendLea = await statut(m.lea);
    assert.equal((await m.patch(m.lea, m.cr, m.b.id)).statusCode, attendLea);
    assert.equal(attendLea, 403);
    const attendMira = await statut(m.mira);
    assert.equal((await m.patch(m.mira, m.cr, m.b.id)).statusCode, attendMira);
    assert.equal(attendMira, 404);
    const attendMode = await statut(m.antor, '?mode=joueur');
    assert.equal((await m.patch(m.antor, m.cr, m.b.id, '?mode=joueur')).statusCode, attendMode);
    assert.equal(attendMode, 403);
    assert.equal((await m.lire(m.cr)).campagneId, m.a.id);
    assert.equal(m.lignes(), n);
  });

  test('a player who cannot read the report gets 404 (as for {statut})', async () => {
    const m = await monde();
    const g = await m.lire(m.cr);
    assert.equal((await m.appel(m.antor, 'PATCH', `${m.base}/fiches/${m.cr}/sections/${g.sections[0].id}`, { joueursLisent: false })).statusCode, 200);
    assert.equal((await m.appel(m.teo, 'PATCH', `${m.base}/fiches/${m.cr}`, { statut: 'prete' })).statusCode, 404);
    assert.equal((await m.patch(m.teo, m.cr, m.b.id)).statusCode, 404);
  });

  test('an unknown target, a target of another universe, a non-adventure, a hidden adventure and a bad value give 404', async () => {
    const m = await monde();
    const autreU = (await m.appel(m.mira, 'POST', '/api/univers', { nom: 'Ailleurs2' })).json();
    const etr = await m.appel(m.mira, 'POST', `/api/univers/${autreU.id}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'Étrangère', sections: [{ titre: 'P', joueursLisent: true }] });
    assert.equal(etr.statusCode, 201, etr.body);
    const perso = await m.creer(m.antor, { type: 'personnage', titre: 'Aldric', charge: { v: 1, pj: false } });
    const cachee = await m.scenarioFerme(m.a.id, 'Cachée');
    const n = m.lignes();
    for (const cible of [999999, etr.json().id, perso.id, m.cr, 'abc', null, 1.5, -1]) {
      const r = await m.patch(m.antor, m.cr, cible);
      assert.equal(r.statusCode, 404, `${String(cible)} : ${r.body}`);
    }
    // a GM reads the closed scenario: it is an adventure, so allowed
    assert.equal((await m.patch(m.antor, m.cr, cachee.id)).statusCode, 200);
    assert.equal(m.lignes() > n, true);
    assert.equal((await m.lire(m.cr)).campagneId, cachee.id);
  });

  test('a sheet that is not a session report gives 400, an adventure included', async () => {
    const m = await monde();
    const perso = await m.creer(m.antor, { type: 'personnage', titre: 'Aldric', charge: { v: 1, pj: false } });
    for (const id of [perso.id, m.a.id]) {
      const r = await m.patch(m.antor, id, m.b.id);
      assert.equal(r.statusCode, 400, r.body);
    }
    assert.equal((await m.lire(m.a.id)).campagneId, undefined);
  });

  test('a sheet outside the universe path is 404', async () => {
    const m = await monde();
    const r = await m.appel(m.mira, 'PATCH', `/api/univers/${m.base.split('/').pop()}/fiches/${m.cr}`, { campagne: m.b.id });
    assert.equal(r.statusCode, 404);
  });
});
