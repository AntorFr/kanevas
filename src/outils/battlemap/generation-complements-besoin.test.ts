// Complementary ensemble tests (door level, no browser) of kanevas-battlemap-generation (B-99, E-25 draft cards, E-27 stop, tool data),
// written from the feature's exit criterion and the product docs only. Real app, real routes, real SQLite, stub engine.
//
// TEST PLAN (need -> case -> expected, hard-coded)
//  E-25 draft card : « Retirer » (the library's delete) on a draft is « Écarter » : the batch line becomes « ecarte », the draft is gone, Léa never saw it
//  E-27 stop       : « Arrêter le lot » on a batch with an interrupted line discards it too, closes the batch, « reprendre » then refuses
//  E-27 exclusion  : an accepted line cannot be regenerated or accepted again (409), its asset stays
//  compter/effacer : the summary of the generation tool counts 1 batch and 3 lines, the erasure empties both, a player is refused and the
//                    accepted asset of the library is still there
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
const dossier = mkdtempSync(join(tmpdir(), 'bm-gen-compl-'));
process.env.DB_PATH = join(dossier, 'kanevas.db');
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');
const { executeurEnCours } = await import('../../services/battlemap-generation.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ligne = (nom: string, extra: object = {}) => ({ nom, categorie: 'objet', largeur: 1, hauteur: 1, indice: '', ...extra });

describe('Génération de lots (B-99) : compléments d’ensemble', () => {
  let app: App;
  let cookie: Record<string, string>;
  let E: number;
  let R: string;

  const q = (m: 'GET' | 'POST' | 'PUT' | 'DELETE', who: string, url: string, payload?: Any) =>
    app.inject({ method: m, url, headers: { cookie: cookie[who]! }, payload });
  const lot = async () => (await q('GET', 'antor', R)).json().lot as Any;
  const assets = async (who: string) => (await q('GET', who, `/api/univers/${E}/outils/battlemap/assets`)).json().assets as Any[];
  const lancerEtAttendre = async (lignes: Any[]) => {
    assert.equal((await q('PUT', 'antor', R, { lignes })).statusCode, 200);
    assert.equal((await q('POST', 'antor', `${R}/lancer`)).statusCode, 200);
    await executeurEnCours();
  };
  const vider = async () => { if (await lot()) { await q('POST', 'antor', `${R}/arreter`); await executeurEnCours(); } };
  afterEach(vider);

  before(async () => {
    app = await buildApp();
    assert.equal(semerBouchon(app.db), true);
    await semerIllustrations(app.db, join(dossier, 'illustrations'));
    cookie = {};
    for (const nom of ['antor', 'teo', 'lea']) {
      const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${nom}` });
      cookie[nom] = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
    }
    const get = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;
    E = get('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id;
    const S = get('SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id;
    poserActivation(app.db, get("SELECT id FROM comptes WHERE username = 'antor'").id, { niveau: 'systeme', id: S }, 'battlemap/generation', true);
    R = `/api/univers/${E}/outils/battlemap/lots`;
  });

  it('E-25 carte Brouillon : « Retirer » sur un brouillon écarte sa ligne et supprime le brouillon', async () => {
    // Panne : la ligne reste « brouillon » (accepter/écarter proposés sur un asset disparu) ou le brouillon reste dans la bibliothèque.
    await lancerEtAttendre([ligne('tabouret'), ligne('coffre')]);
    const l = await lot();
    const tabouret = l.lignes.find((x: Any) => x.nom === 'tabouret');
    const carte = (await assets('antor')).find((a) => a.jeton === tabouret.jeton);
    assert.equal(carte.etat, 'brouillon');
    const r = await q('DELETE', 'antor', `/api/univers/${E}/outils/battlemap/assets`, { ids: [carte.id] });
    assert.equal(r.statusCode, 200, r.body);
    const apres = await lot();
    assert.deepEqual(apres.lignes.map((x: Any) => [x.nom, x.etat]), [['tabouret', 'ecarte'], ['coffre', 'brouillon']]);
    assert.ok(!(await assets('antor')).some((a) => a.nom === 'tabouret'));
    assert.ok(!(await assets('lea')).some((a) => a.nom === 'tabouret' || a.nom === 'coffre'));
  });

  it('arrêt : une ligne interrompue est écartée avec le reste, le lot est clos, « reprendre » est refusé', async () => {
    // Panne : « Arrêter le lot » laisse l'interrompue vivante, ou le lot reste ouvert et bloque l'univers.
    await lancerEtAttendre([ligne('rouleau'), ligne('sac')]);
    const sac = app.db.prepare("SELECT asset_id FROM bm_lots_lignes WHERE nom = 'sac'").get() as Any;
    app.db.prepare("UPDATE bm_lots_lignes SET etat = 'interrompu', asset_id = NULL WHERE nom = 'sac'").run();
    app.db.prepare('DELETE FROM bm_assets WHERE id = ?').run(sac.asset_id); // a restart leaves an interrupted line with no draft
    assert.equal((await lot()).interrompu, true);
    assert.equal((await q('POST', 'antor', `${R}/arreter`)).statusCode, 200);
    await executeurEnCours();
    assert.equal((await q('GET', 'antor', R)).json().lot, null);
    assert.deepEqual(app.db.prepare("SELECT nom, etat FROM bm_lots_lignes WHERE nom IN ('rouleau','sac') ORDER BY nom").all(), [{ nom: 'rouleau', etat: 'ecarte' }, { nom: 'sac', etat: 'ecarte' }]);
    assert.ok(!(await assets('antor')).some((a) => ['rouleau', 'sac'].includes(a.nom)));
    assert.ok((await q('POST', 'antor', `${R}/reprendre`)).statusCode >= 400);
    assert.equal((await q('PUT', 'antor', R, { lignes: [ligne('neuf')] })).statusCode, 200);
  });

  it('exclusion : une ligne acceptée ne se régénère pas ni ne s’accepte deux fois, son asset reste', async () => {
    // Panne : régénérer une acceptée supprime l'asset de la bibliothèque de Léa.
    await lancerEtAttendre([ligne('fauteuil'), ligne('table')]);
    const f = (await lot()).lignes.find((x: Any) => x.nom === 'fauteuil');
    assert.equal((await q('POST', 'antor', `${R}/lignes/${f.id}/accepter`)).statusCode, 200);
    const regen = await q('POST', 'antor', `${R}/lignes/${f.id}/regenerer`, { remarque: 'plus usé' });
    assert.equal(regen.statusCode, 409, regen.body);
    assert.equal((await q('POST', 'antor', `${R}/lignes/${f.id}/accepter`)).statusCode, 409);
    assert.equal((await assets('lea')).filter((a) => a.nom === 'fauteuil').length, 1);
  });

  it('données de l’outil : 1 lot et 3 lignes comptés, effacés ; l’asset accepté reste ; Léa refusée', async () => {
    // Panne : compter oublie les lignes, effacer laisse un lot (l'univers resterait bloqué), ou un joueur efface.
    const U = `/api/univers/${E}/outils/battlemap/generation/suppression`;
    // batches closed by the previous tests are rows too: the count is read before and after
    const nombre = async (cle: string) => ((await q('GET', 'antor', U)).json().efface as Any[]).find((x) => x.cle === cle)?.nombre ?? 0;
    const lots0 = await nombre('lots'); const lignes0 = await nombre('lignes');
    await lancerEtAttendre([ligne('lampe'), ligne('banc'), ligne('mât')]);
    const l = await lot();
    assert.equal((await q('POST', 'antor', `${R}/lignes/${l.lignes[0].id}/accepter`)).statusCode, 200);
    const resume = await q('GET', 'antor', U);
    assert.equal(resume.statusCode, 200, resume.body);
    const lignes = resume.json().efface as Any[];
    assert.equal(await nombre('lots') - lots0, 1);
    assert.equal(await nombre('lignes') - lignes0, 3);
    assert.ok((await q('POST', 'lea', U, { vu: lignes })).statusCode >= 400);
    assert.equal((await lot()).lignes.length, 3);
    const efface = await q('POST', 'antor', U, { vu: lignes });
    assert.equal(efface.statusCode, 200, efface.body);
    assert.equal(efface.json().total, lots0 + lignes0 + 4);
    assert.equal((await q('GET', 'antor', R)).json().lot, null);
    assert.deepEqual((await q('GET', 'antor', U)).json().efface, []); // no line at 0 (E-20 dialog)
    assert.equal((await assets('lea')).filter((a) => a.nom === 'lampe').length, 1);
  });
});
