import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { changerStatutFiche } = await import('../services/fiches.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const put = (cle: string, p: unknown, lot?: number) =>
    app.inject({ method: 'PUT', url: `${base}/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`, headers: auth, payload: p as object });
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const ligne = (cle: string) =>
    app.db.prepare('SELECT id, type, charge, parent_id, sous_type, dernier_import FROM fiches WHERE univers_id = ? AND cle_origine = ?').get(u.id, cle) as
      | { id: number; type: string; charge: string; parent_id: number | null; sous_type: string | null; dernier_import: string }
      | undefined;
  const nb = () => (app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(u.id) as { n: number }).n;
  return { app, u, auth, base, put, lot, clore, lire, ligne, nb, antor: trouverCompte(app.db, 'antor')!.id };
}
const CAMP = { type: 'aventure', titre: 'La Couronne', sousType: 'Campagne', statut: 'en_cours', sections: [] };
const SCEN = { type: 'aventure', titre: 'Acte 2', sousType: 'Scénario', parent: 'campagne:couronne', statut: 'prete',
  sections: [{ cle: 's', titre: 'Plan', contenu: 'Secret.', joueursLisent: true }] };

test('campagne puis scénario sous elle, avec leurs statuts', async () => {
  const m = await monter();
  assert.equal((await m.put('campagne:couronne', CAMP)).statusCode, 200);
  assert.equal((await m.put('scenario:acte-2', SCEN)).statusCode, 200);
  const c = m.ligne('campagne:couronne')!;
  const s = m.ligne('scenario:acte-2')!;
  assert.equal(c.type, 'aventure');
  assert.equal(c.sous_type, 'Campagne');
  assert.equal(JSON.parse(c.charge).statut, 'en_cours');
  assert.equal(JSON.parse(s.charge).statut, 'prete');
  assert.equal(s.parent_id, c.id);
});

test('sans statut : en_preparation', async () => {
  const m = await monter();
  const { statut: _s, ...sans } = CAMP;
  assert.equal((await m.put('campagne:couronne', sans)).statusCode, 200);
  assert.equal(JSON.parse(m.ligne('campagne:couronne')!.charge).statut, 'en_preparation');
});

test('statut invalide, null, ou sur un personnage : 400 invalide champ statut, rien écrit', async () => {
  const m = await monter();
  const avant = m.nb();
  const cas: unknown[] = [
    { ...CAMP, statut: 'jouee' },
    { ...CAMP, statut: null },
    { ...CAMP, statut: 3 },
    { type: 'personnage', titre: 'Bob', statut: 'en_cours', sections: [] },
    { type: 'lieu', titre: 'Port', statut: 'en_preparation', sections: [] },
  ];
  for (const c of cas) {
    const r = await m.put('x:y', c);
    assert.equal(r.statusCode, 400, JSON.stringify(c));
    assert.equal(r.json().code, 'invalide');
    assert.equal(r.json().champ, 'statut');
  }
  assert.equal(m.nb(), avant);
});

test('refus avec ?lot= : compté refusée dans le lot', async () => {
  const m = await monter();
  const l = await m.lot();
  assert.equal((await m.put('x:y', { ...CAMP, statut: 'jouee' }, l)).statusCode, 400);
  const lt = await m.lire(l);
  assert.equal(lt.compteurs.fiches.refusees, 1);
});

test('rejeu : statut changé par un MJ non écrasé + avertissement ; rejeu sans statut n’y touche pas', async () => {
  const m = await monter();
  await m.put('campagne:couronne', CAMP);
  const id = (await m.put('scenario:acte-2', SCEN)).json().id as number;
  changerStatutFiche(m.app.db, { compteId: m.antor }, m.u.id, id, 'en_cours');
  const l = await m.lot();
  const r = await m.put('scenario:acte-2', SCEN, l);
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(m.ligne('scenario:acte-2')!.charge).statut, 'en_cours');
  assert.match(JSON.stringify(r.json().avertissements), /statut modifié dans Kanevas : non écrasé/);
  assert.equal((await m.lire(l)).avertissements, 1);
  const { statut: _s, ...sans } = SCEN;
  const r2 = await m.put('scenario:acte-2', sans);
  assert.deepEqual(r2.json().avertissements, []);
  assert.equal(JSON.parse(m.ligne('scenario:acte-2')!.charge).statut, 'en_cours');
});

test('rejeu : statut modifié à la source suivi tant que personne n’y a touché', async () => {
  const m = await monter();
  await m.put('campagne:couronne', CAMP);
  const r = await m.put('campagne:couronne', { ...CAMP, statut: 'terminee' });
  assert.deepEqual(r.json().avertissements, []);
  assert.equal(JSON.parse(m.ligne('campagne:couronne')!.charge).statut, 'terminee');
});

test('changement de type : vers aventure écrit la charge, depuis aventure la retire', async () => {
  const m = await monter();
  await m.put('k:1', { type: 'lieu', titre: 'Port', sections: [] });
  const r = await m.put('k:1', { type: 'aventure', titre: 'Port', statut: 'prete', sections: [] });
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(m.ligne('k:1')!.charge).statut, 'prete');
  assert.equal(JSON.parse(m.ligne('k:1')!.dernier_import).statut, 'prete');
  const r2 = await m.put('k:1', { type: 'lieu', titre: 'Port', sections: [] });
  assert.equal(r2.statusCode, 200);
  assert.equal(m.ligne('k:1')!.type, 'lieu');
  assert.equal(JSON.parse(m.ligne('k:1')!.charge).statut, undefined);
  assert.equal(JSON.parse(m.ligne('k:1')!.dernier_import).statut, undefined);
});

const CR = (campagne: string) => ({ type: 'compte_rendu', titre: 'Mars', campagne, creeLe: '2021-03-03T20:00:00Z',
  sections: [{ cle: 's1', titre: 'x', contenu: 'Récit.', joueursLisent: true }] });

test('compte-rendu : campagne par clé d’aventure ; clé d’un autre type ou inconnue refusée', async () => {
  const m = await monter();
  const id = (await m.put('campagne:couronne', CAMP)).json().id as number;
  await m.put('lieu:a', { type: 'lieu', titre: 'A', sections: [] });
  const ok = await m.put('cr:1', CR('campagne:couronne'));
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(m.ligne('cr:1')!.charge).campagne_id, id);
  for (const k of ['lieu:a', 'campagne:absente']) {
    const r = await m.put('cr:2', CR(k));
    assert.equal(r.statusCode, 400, k);
    assert.equal(r.json().code, 'invalide');
    assert.equal(r.json().champ, 'campagne');
  }
  assert.equal(m.ligne('cr:2'), undefined);
});

test('GET de la base : aventure dans types, statuts, plus de champs campagne/scénario', async () => {
  const m = await monter();
  const j = (await m.app.inject({ method: 'GET', url: m.base, headers: m.auth })).json();
  assert.ok(j.types.some((t: { type: string }) => t.type === 'aventure'));
  assert.deepEqual(j.statuts, ['en_preparation', 'prete', 'en_cours', 'terminee']);
  for (const k of ['nomCampagne', 'titreScenario', 'contenuScenario']) assert.equal(JSON.stringify(j).includes(k), false);
});

test('lot clos : les aventures sont comptées dans fiches, pas de compteur campagnes/scénarios', async () => {
  const m = await monter();
  const l = await m.lot();
  await m.put('campagne:couronne', CAMP, l);
  await m.put('scenario:acte-2', SCEN, l);
  await m.clore(l);
  const lt = await m.lire(l);
  assert.equal(lt.etat, 'clos');
  assert.equal(lt.compteurs.fiches.creees, 2);
  assert.deepEqual(Object.keys(lt.compteurs).sort(), ['fiches', 'fichiers', 'relations']);
});

test('sections d’une aventure née sans statut : fermées aux joueurs si le script le dit', async () => {
  const m = await monter();
  await m.put('campagne:couronne', { ...CAMP, statut: undefined, sections: [{ cle: 's', titre: 'P', contenu: 'x', joueursLisent: false }] });
  const n = (m.app.db.prepare("SELECT s.joueurs_lisent j FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.cle_origine = 'campagne:couronne'").get() as { j: number });
  assert.equal(n.j, 0);
});
