// Doors of the lot « outils » for `src/e2e/sections-gerees-besoin-ensemble.test.ts` and `src/e2e/sections-gerees-ecran.test.ts`
// (docs/tests-ecran/lot-outils.md): a managed section recalculated, found by the search, hidden from the players with its sheet, and the
// proposal path of a setting change, in-process on the trial world (no browser). The rest is `src/routes/sections-gerees-api.test.ts`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

async function monde() {
  const m = await monter({ semis: true });
  const un = (sql: string, ...p: unknown[]) => m.app.db.prepare(sql).get(...p) as Any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = un('SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const leaId = un('SELECT id FROM comptes WHERE username = ?', 'lea').id as number;
  const api = `/api/univers/${E}`;
  assert.equal((await m.dire(m.antor, 'PUT', `/api/systemes/${S}/outils/essai/g/activation`, { active: true })).status, 204);
  const f = await m.dire(m.antor, 'POST', `${api}/fiches`, { type: 'objet', titre: "Vaisseau d'essai" });
  assert.equal(f.status, 201);
  const generer = async (fiche: number, type: string, auteurId?: number) => {
    const r = await m.dire(m.antor, 'POST', `${api}/outils/essai/g/sections`, { ficheId: fiche, type, ...(auteurId ? { auteurId } : {}) });
    assert.equal(r.status, 201, JSON.stringify(r.corps));
    return r.corps.id as number;
  };
  const section = async (h: Any, fiche: number, sid: number) => {
    const r = await m.dire(h, 'GET', `${api}/fiches/${fiche}`);
    assert.equal(r.status, 200, JSON.stringify(r.corps));
    return (r.corps.sections as Any[]).find((s) => s.id === sid);
  };
  const marge = async (v: number) => {
    const g = ((await m.dire(m.antor, 'GET', `${api}/outils`)).corps.outils as Any[]).find((o) => o.cle === 'essai/g');
    assert.equal((await m.dire(m.antor, 'PUT', `${api}/outils/essai/g/reglages`, { version: g.univers.versionReglages, valeurs: { marge: v } })).status, 204);
  };
  const titres = async (h: Any, q: string) => ((await m.dire(h, 'GET', `${api}/fiches?q=${q}`)).corps.fiches as Any[]).map((x) => x.titre);
  return { ...m, E, api, fiche: f.corps.id as number, generer, section, marge, titres, leaId };
}

test('recalculating a section that is already up to date moves neither its version nor its text; once stale, the recalculation brings it up to date for the reader', async () => {
  const w = await monde();
  const sid = await w.generer(w.fiche, 'caracteristiques', w.leaId);
  const vue = await w.section(w.lea, w.fiche, sid);
  assert.match(vue.html, /Marge d'essai : 10 %/);
  assert.equal(vue.geree.etat, 'a_jour');
  const route = `${w.api}/fiches/${w.fiche}/sections/${sid}/recalcul`;
  const avant = await w.section(w.antor, w.fiche, sid);
  assert.equal((await w.dire(w.antor, 'POST', route, { version: avant.version })).status, 200);
  assert.equal((await w.section(w.antor, w.fiche, sid)).version, avant.version);
  await w.marge(25);
  const perime = await w.section(w.lea, w.fiche, sid);
  assert.equal(perime.geree.etat, 'perime');
  assert.equal(perime.version, avant.version);
  assert.match(perime.html, /Marge d'essai : 10 %/);
  const cou = await w.section(w.antor, w.fiche, sid);
  assert.equal((await w.dire(w.antor, 'POST', route, { version: cou.version })).status, 200);
  const apres = await w.section(w.lea, w.fiche, sid);
  assert.equal(apres.geree.etat, 'a_jour');
  assert.match(apres.html, /Marge d'essai : 25 %/);
});

test('the search finds the text of a managed section, for the player who reads it and for the GM', async () => {
  const w = await monde();
  await w.generer(w.fiche, 'caracteristiques', w.leaId);
  assert.ok((await w.titres(w.lea, 'Marge')).includes("Vaisseau d'essai"));
  assert.ok((await w.titres(w.antor, 'Marge')).includes("Vaisseau d'essai"));
});

test('a managed section of the GM alone leaves no trace for the player (sheet, text, search) and the GM finds it', async () => {
  const w = await monde();
  const f = await w.dire(w.antor, 'POST', `${w.api}/fiches`, { type: 'objet', titre: 'Plan secret' });
  const secret = f.corps.id as number;
  await w.generer(secret, 'notes');
  const rf = await w.dire(w.lea, 'GET', `${w.api}/fiches/${secret}`);
  assert.ok(rf.status === 404 || !JSON.stringify(rf.corps).includes('marge'), 'no trace of the text');
  assert.ok(!(await w.titres(w.lea, 'Notes')).includes('Plan secret'));
  assert.ok((await w.titres(w.antor, 'marge')).includes('Plan secret'), 'the GM finds it');
});

test('a setting change on a « notes » section keeps the text and offers a proposal to its requester only; abandoned it leaves the text, applied it updates it, not before', async () => {
  const w = await monde();
  const sid = await w.generer(w.fiche, 'notes', w.leaId);
  assert.match((await w.section(w.antor, w.fiche, sid)).html, /Notes — marge 10 %/);
  await w.marge(25);
  const vA = await w.section(w.antor, w.fiche, sid);
  assert.match(vA.html, /Notes — marge 10 %/, 'the text did not move');
  assert.equal(vA.geree.etat, 'perime');
  assert.ok(Number.isInteger(vA.geree.propositionId), 'a proposal for Antor');
  assert.equal((await w.section(w.mira, w.fiche, sid)).geree.propositionId, null, 'Mira, another GM, does not see it');
  const pid = vA.geree.propositionId as number;
  assert.equal((await w.dire(w.mira, 'GET', `${w.api}/propositions/${pid}`)).status, 404);
  assert.equal((await w.dire(w.antor, 'POST', `${w.api}/propositions/${pid}/abandonner`)).status, 204);
  assert.match((await w.section(w.antor, w.fiche, sid)).html, /Notes — marge 10 %/);
  await w.marge(60);
  const v2 = await w.section(w.antor, w.fiche, sid);
  assert.match(v2.html, /Notes — marge 10 %/, 'not before the acceptance');
  assert.ok(Number.isInteger(v2.geree.propositionId));
  assert.equal((await w.dire(w.antor, 'POST', `${w.api}/propositions/${v2.geree.propositionId}/appliquer`)).status, 200);
  const v3 = await w.section(w.lea, w.fiche, sid);
  assert.match(v3.html, /Notes — marge 60 %/);
  assert.equal(v3.geree.etat, 'a_jour');
});
