// Complementary ensemble tests (door level, no browser) of kanevas-battlemap-generation (B-99, E-25 draft cards, E-27 stop, tool data),
// written from the feature's exit criterion and the product docs only. Real app, real routes, real SQLite, stub engine.
//
// TEST PLAN (review of the E-25 « Retirer » on drafts: edges)
//  retirer tous les brouillons : le lot se ferme (plus de lot ouvert), le fichier du brouillon disparaît
//  retirer brouillon + asset accepté : la ligne acceptée reste acceptée, son asset aussi
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
const dossier = mkdtempSync(join(tmpdir(), 'bm-gen-retrait-'));
process.env.DB_PATH = join(dossier, 'kanevas.db');
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');
const { executeurEnCours } = await import('../../services/battlemap-generation.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ligne = (nom: string, extra: object = {}) => ({ nom, categorie: 'objet', largeur: 1, hauteur: 1, indice: '', ...extra });

describe('Génération de lots (B-99) : retrait des brouillons', () => {
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

  it('retirer tous les brouillons du lot ferme le lot et efface leurs fichiers', async () => {
    // Panne : le lot reste ouvert sans aucune ligne vivante et bloque l'univers (lot_en_cours).
    await lancerEtAttendre([ligne('urne'), ligne('cierge')]);
    const l = await lot();
    const cartes = (await assets('antor')).filter((a) => l.lignes.some((x: Any) => x.jeton === a.jeton));
    assert.equal(cartes.length, 2);
    const fichiers = cartes.map((c) => (app.db.prepare('SELECT fichier_id FROM bm_assets WHERE id = ?').get(c.id) as Any).fichier_id);
    const r = await q('DELETE', 'antor', `/api/univers/${E}/outils/battlemap/assets`, { ids: cartes.map((c) => c.id) });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await lot(), null);
    for (const f of fichiers) assert.equal(app.db.prepare('SELECT id FROM fichiers WHERE id = ?').get(f), undefined);
    assert.equal((await q('PUT', 'antor', R, { lignes: [ligne('neuf')] })).statusCode, 200);
  });

  it('retirer un brouillon et un asset accepté : la ligne acceptée reste acceptée', async () => {
    // Panne : le retrait écarte aussi la ligne acceptée, ou son asset.
    await lancerEtAttendre([ligne('autel'), ligne('calice')]);
    const l = await lot();
    const autel = l.lignes.find((x: Any) => x.nom === 'autel');
    const calice = l.lignes.find((x: Any) => x.nom === 'calice');
    assert.equal((await q('POST', 'antor', `${R}/lignes/${autel.id}/accepter`)).statusCode, 200);
    const tous = await assets('antor');
    const ids = [tous.find((a) => a.nom === 'autel').id, tous.find((a) => a.jeton === calice.jeton).id];
    const r = await q('DELETE', 'antor', `/api/univers/${E}/outils/battlemap/assets`, { ids });
    assert.equal(r.statusCode, 200, r.body);
    const apres = app.db.prepare("SELECT nom, etat FROM bm_lots_lignes WHERE nom IN ('autel','calice') ORDER BY nom").all();
    assert.deepEqual(apres, [{ nom: 'autel', etat: 'accepte' }, { nom: 'calice', etat: 'ecarte' }]);
  });
});
