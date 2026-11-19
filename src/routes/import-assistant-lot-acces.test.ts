// Doors of lot « acces » for `src/e2e/import-assistant-besoin.test.ts` (kanevas-scenarios-import-assistant, B-61, B-62):
// campaigns and scenarios are `aventure` sheets, imported with the stub token and created by the assistant; no browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
type App = Awaited<ReturnType<typeof buildApp>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

async function monde() {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db));
  const id = (nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const kanka = id('Essai Kanka');
  const lame = id("Lame d'Ébène");
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const base = `/api/import/v1/univers/${kanka}`;
  const m = {
    app, kanka, lame, antor, lea,
    put: (cle: string, corps: unknown, lot?: number, headers: Record<string, string> = { authorization: `Bearer ${JETON_BOUCHON}` }) =>
      app.inject({ method: 'PUT', url: `${base}/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`, headers, payload: corps as object }),
    async lot(): Promise<number> {
      return (await app.inject({ method: 'POST', url: `${base}/lots`, headers: { authorization: `Bearer ${JETON_BOUCHON}` } })).json().lotId;
    },
    async clore(l: number): Promise<Any> {
      return (await app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: { authorization: `Bearer ${JETON_BOUCHON}` } })).json();
    },
    rest: (h: { cookie: string }, methode: string, url: string, payload?: unknown) => app.inject({ method: methode as 'GET', url, headers: h, payload: payload as object | undefined }),
    async aventures(h: { cookie: string }, univers: number): Promise<Any[]> {
      return (await app.inject({ method: 'GET', url: `/api/univers/${univers}/fiches?type=aventure`, headers: h })).json().fiches;
    },
    dit: (h: { cookie: string }, univers: number, message: string) => app.inject({ method: 'POST', url: `/api/univers/${univers}/assistant/messages`, headers: h, payload: { message } }),
  };
  return m;
}
const parTitre = (l: Any[], t: string) => l.find((f) => f.titre === t);
const CAMPAGNE = { type: 'aventure', sousType: 'Campagne', statut: 'en_cours', titre: 'La Couronne brisée', sections: [] };
const SCENARIO = { type: 'aventure', sousType: 'Scénario', statut: 'prete', parent: 'campagne:couronne', titre: 'Acte II', sections: [] };

test('B-61 criterion > the campaign then the scenario under it are created with their statuses, the lot counts them among the sheets, no « campagnes » nor « scenarios » counter', async () => {
  const m = await monde();
  const l = await m.lot();
  const a = await m.put('campagne:couronne', CAMPAGNE, l);
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().etat, 'creee');
  const b = await m.put('scenario:acte-2', SCENARIO, l);
  assert.equal(b.statusCode, 200);
  assert.equal(b.json().etat, 'creee');
  const rapport = await m.clore(l);
  assert.equal(rapport.compteurs.fiches.creees, 2);
  assert.equal(rapport.compteurs.campagnes, undefined);
  assert.equal(rapport.compteurs.scenarios, undefined);
  const liste = await m.aventures(m.antor, m.kanka);
  const camp = parTitre(liste, 'La Couronne brisée');
  const scen = parTitre(liste, 'Acte II');
  assert.equal(camp.sousType, 'Campagne');
  assert.equal(camp.charge.statut, 'en_cours');
  assert.equal(scen.sousType, 'Scénario');
  assert.equal(scen.charge.statut, 'prete');
  const fiche = (await m.rest(m.antor, 'GET', `/api/univers/${m.kanka}/fiches/${scen.id}`)).json();
  assert.deepEqual(fiche.ancetres.map((x: Any) => x.titre), ['La Couronne brisée']);
  const lots = JSON.stringify((await m.rest(m.antor, 'GET', `/api/univers/${m.kanka}/lots`)).json());
  assert.ok(!/Campagnes|Scénarios/.test(lots), 'no per-kind counter in the batch listing');
});

test('B-61 bounds > an identical replay is inchangee, an omitted status is en_preparation, an unknown status is 400 and creates no sheet', async () => {
  const m = await monde();
  const l = await m.lot();
  await m.put('campagne:couronne', CAMPAGNE, l);
  await m.put('scenario:acte-2', SCENARIO, l);
  assert.equal((await m.put('campagne:couronne', CAMPAGNE, l)).json().etat, 'inchangee');
  assert.equal((await m.put('scenario:acte-2', SCENARIO, l)).json().etat, 'inchangee');
  const n = await m.put('scenario:acte-3', { type: 'aventure', sousType: 'Scénario', titre: 'Acte III', parent: 'campagne:couronne', sections: [] }, l);
  assert.equal(n.json().etat, 'creee');
  const mauvais = await m.put('scenario:acte-4', { type: 'aventure', titre: 'Acte IV', statut: 'archivee', sections: [] }, l);
  assert.equal(mauvais.statusCode, 400);
  assert.equal(mauvais.json().code, 'invalide');
  await m.clore(l);
  const liste = await m.aventures(m.antor, m.kanka);
  assert.equal(parTitre(liste, 'Acte III').charge.statut, 'en_preparation');
  assert.equal(parTitre(liste, 'Acte IV'), undefined);
});

test('B-48 adventures > a status set in Kanevas is not rewritten by the replay and the warning says « statut modifié dans Kanevas »', async () => {
  const m = await monde();
  const l0 = await m.lot();
  await m.put('campagne:couronne', CAMPAGNE, l0);
  await m.put('scenario:acte-2', SCENARIO, l0);
  await m.clore(l0);
  const scen = parTitre(await m.aventures(m.antor, m.kanka), 'Acte II');
  const p = await m.rest(m.antor, 'PATCH', `/api/univers/${m.kanka}/fiches/${scen.id}`, { statut: 'en_cours' });
  assert.equal(p.statusCode, 200);
  const l = await m.lot();
  const r = await m.put('scenario:acte-2', SCENARIO, l);
  assert.equal(r.statusCode, 200);
  assert.match(JSON.stringify(r.json().avertissements), /statut modifié dans Kanevas/);
  assert.match(JSON.stringify((await m.clore(l)).rapport), /statut modifié dans Kanevas/);
  assert.equal(parTitre(await m.aventures(m.antor, m.kanka), 'Acte II').charge.statut, 'en_cours');
});

test('B-48 adventures > a sub-type and a parent changed in Kanevas are not overwritten by the replay', async () => {
  const m = await monde();
  const l0 = await m.lot();
  await m.put('campagne:couronne', CAMPAGNE, l0);
  await m.put('scenario:acte-3', { type: 'aventure', sousType: 'Scénario', titre: 'Acte III', parent: 'campagne:couronne', sections: [] }, l0);
  await m.clore(l0);
  const a3 = parTitre(await m.aventures(m.antor, m.kanka), 'Acte III');
  assert.equal((await m.rest(m.antor, 'PATCH', `/api/univers/${m.kanka}/fiches/${a3.id}`, { sousType: 'One-shot' })).statusCode, 200);
  assert.equal((await m.rest(m.antor, 'PATCH', `/api/univers/${m.kanka}/fiches/${a3.id}`, { parent: null })).statusCode, 200);
  const l = await m.lot();
  const r = await m.put('scenario:acte-3', { type: 'aventure', sousType: 'Scénario', titre: 'Acte III', parent: 'campagne:couronne', sections: [] }, l);
  assert.equal(r.statusCode, 200);
  const avert = JSON.stringify(r.json().avertissements);
  assert.match(avert, /sous-type modifié dans Kanevas/);
  assert.match(avert, /parent modifié dans Kanevas/);
  await m.clore(l);
  const apres = (await m.rest(m.antor, 'GET', `/api/univers/${m.kanka}/fiches/${a3.id}`)).json();
  assert.equal(apres.sousType, 'One-shot');
  assert.deepEqual(apres.ancetres, []);
});

test('B-61 report > a report imported with campagne:campagne:couronne names its adventure; an unknown adventure key is refused 400 (champ campagne)', async () => {
  const m = await monde();
  const l = await m.lot();
  await m.put('campagne:couronne', CAMPAGNE, l);
  const r = await m.put('cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', campagne: 'campagne:couronne', sections: [{ cle: 'texte', titre: 'Récit', contenu: 'La table a gagné la crypte.', joueursLisent: true }] }, l);
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().etat, 'creee');
  const inconnu = await m.put('cr:seance-2', { type: 'compte_rendu', titre: 'Séance 2', campagne: 'campagne:absente', sections: [] }, l);
  assert.equal(inconnu.statusCode, 400);
  assert.equal(inconnu.json().champ, 'campagne');
  await m.clore(l);
  const vue = (await m.rest(m.antor, 'GET', `/api/univers/${m.kanka}/fiches/${r.json().id}`)).json();
  assert.equal(vue.campagneNom ?? vue.charge?.campagneNom, 'La Couronne brisée');
});

test('B-61 refusal > a wrong token is refused 401 and writes no adventure', async () => {
  const m = await monde();
  const r = await m.put('campagne:intruse', { type: 'aventure', titre: 'Intruse', sections: [] }, undefined, { authorization: 'Bearer kvs_faux' });
  assert.equal(r.statusCode, 401);
  assert.equal(r.json().code, 'jeton_invalide');
  assert.equal(parTitre(await m.aventures(m.antor, m.kanka), 'Intruse'), undefined);
});

test('B-61 seed > « Lame d’Ébène » carries « La Couronne brisée » (Campagne) and « Acte II » (Scénario) under it; Léa reads the campaign, never the scenario', async () => {
  const m = await monde();
  const liste = await m.aventures(m.antor, m.lame);
  const camp = parTitre(liste, 'La Couronne brisée');
  const acte = liste.find((f) => f.titre.startsWith('Acte II'));
  assert.equal(camp.sousType, 'Campagne');
  assert.equal(acte.sousType, 'Scénario');
  const f = (await m.rest(m.antor, 'GET', `/api/univers/${m.lame}/fiches/${acte.id}`)).json();
  assert.deepEqual(f.ancetres.map((x: Any) => x.titre), ['La Couronne brisée']);
  assert.deepEqual((await m.aventures(m.lea, m.lame)).map((x) => x.titre), ['La Couronne brisée']);
});

test('B-62 assistant > an unknown parent creates nothing and writes no event; a player gets no creation tool and sees nothing of the GM’s adventures', async () => {
  const m = await monde();
  const avant = (await m.aventures(m.antor, m.lame)).length;
  const r = await m.dit(m.antor, m.lame, 'Crée un scénario « Orphelin » dans « Nulle part »');
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().evenements, []);
  assert.match(r.json().reponse, /Introuvable/);
  assert.equal((await m.aventures(m.antor, m.lame)).length, avant);
  assert.equal((await m.dit(m.antor, m.lame, 'Crée une campagne « Les Cendres »')).json().evenements[0].type, 'fiche_creee');
  const l = await m.dit(m.lea, m.lame, 'Crée une campagne « Les Braises »');
  assert.deepEqual(l.json().evenements, []);
  const titresLea = (await m.aventures(m.lea, m.lame)).map((x) => x.titre);
  for (const t of ['Les Braises', 'Les Cendres']) assert.ok(!titresLea.includes(t), t);
  assert.equal(parTitre(await m.aventures(m.antor, m.lame), 'Les Braises'), undefined);
});

test('B-61 / B-62 exclusion > with the type « aventure » disabled the import warns type_desactive and the assistant creates nothing', async () => {
  const m = await monde();
  const off = await m.rest(m.antor, 'PUT', `/api/univers/${m.kanka}/types/aventure`, { etat: 'desactive' });
  assert.equal(off.statusCode, 200);
  const l = await m.lot();
  const r = await m.put('campagne:fermee', { type: 'aventure', sousType: 'Campagne', titre: 'Fermée', sections: [] }, l);
  assert.match(r.body, /type_desactive/);
  await m.clore(l);
  const a = await m.dit(m.antor, m.kanka, 'Crée une campagne « Fermée aussi »');
  assert.deepEqual(a.json().evenements, []);
  assert.equal(parTitre(await m.aventures(m.antor, m.kanka), 'Fermée aussi'), undefined);
});
