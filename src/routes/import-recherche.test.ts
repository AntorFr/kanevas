import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const put = (cle: string, payload: unknown, lot?: number) =>
    app.inject({
      method: 'PUT',
      url: `${base}/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`,
      headers: auth,
      payload: payload as object,
    });
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = async (l: number) =>
    (await app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth })).json();
  const login = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'compte=antor',
  });
  const cookie = `kanevas_session=${login.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  const etiqueter = (ficheId: number, corps: unknown) =>
    app.inject({
      method: 'PUT',
      url: `/api/univers/${u.id}/fiches/${ficheId}/etiquetage`,
      headers: { cookie },
      payload: corps as object,
    });
  const lire = (fid: number) => ({
    alias: (app.db.prepare('SELECT alias FROM fiche_alias WHERE fiche_id = ? ORDER BY alias').all(fid) as { alias: string }[]).map((x) => x.alias),
    etiquettes: (
      app.db
        .prepare('SELECT e.nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = ? ORDER BY e.nom')
        .all(fid) as { nom: string }[]
    ).map((x) => x.nom),
  });
  const fiche = (fid: number) => app.db.prepare('SELECT modifie_le FROM fiches WHERE id = ?').get(fid);
  const sections = (fid: number) => app.db.prepare('SELECT id, version, modifie_le FROM sections WHERE fiche_id = ? ORDER BY id').all(fid);
  return { app, u, put, lot, clore, base, auth, etiqueter, lire, fiche, sections };
}

const PORT = (extra: object) => ({
  type: 'lieu',
  titre: 'Port-Sel',
  sections: [{ cle: 'desc', titre: 'Description', contenu: 'Un port.', joueursLisent: true }],
  ...extra,
});

test('critère : alias et étiquettes créés, rejoués inchangés (ordre et casse libres), modif Kanevas non écrasée', async () => {
  const t = await monter();
  const l1 = await t.lot();
  const r1 = await t.put('lieu:port-sel', PORT({ alias: ['Salport', 'Port-aux-Sels'], etiquettes: ['Côte des Brumes'] }), l1);
  assert.equal(r1.statusCode, 200, r1.body);
  assert.equal(r1.json().etat, 'creee');
  const id = r1.json().id as number;
  assert.deepEqual(t.lire(id), { alias: ['Port-aux-Sels', 'Salport'], etiquettes: ['Côte des Brumes'] });
  assert.equal((await t.clore(l1)).compteurs.fiches.creees, 1);

  const f0 = t.fiche(id);
  const s0 = t.sections(id);
  const r2 = await t.put('lieu:port-sel', PORT({ alias: ['Salport', 'Port-aux-Sels'], etiquettes: ['Côte des Brumes'] }), await t.lot());
  assert.equal(r2.json().etat, 'inchangee');
  const r3 = await t.put('lieu:port-sel', PORT({ alias: ['PORT-AUX-SELS', 'salport'], etiquettes: ['côte des brumes'] }));
  assert.equal(r3.json().etat, 'inchangee', r3.body);
  assert.deepEqual(r3.json().avertissements, []);
  assert.deepEqual(t.fiche(id), f0);
  assert.deepEqual(t.sections(id), s0);
  assert.deepEqual(t.lire(id), { alias: ['Port-aux-Sels', 'Salport'], etiquettes: ['Côte des Brumes'] });

  // Antor adds an alias in Kanevas.
  const m = await t.etiqueter(id, { alias: ['Salport', 'Port-aux-Sels', 'Salt Harbour'], etiquettes: ['Côte des Brumes'] });
  assert.equal(m.statusCode, 200, m.body);
  const l3 = await t.lot();
  const r4 = await t.put('lieu:port-sel', PORT({ alias: ['Salport', 'Port-aux-Sels'], etiquettes: ['Côte des Brumes'] }), l3);
  assert.equal(r4.json().etat, 'inchangee');
  assert.deepEqual(t.lire(id).alias, ['Port-aux-Sels', 'Salport', 'Salt Harbour']);
  assert.deepEqual(t.lire(id).etiquettes, ['Côte des Brumes']);
  const rap = await t.clore(l3);
  assert.ok(JSON.stringify(rap).includes('alias modifiés dans Kanevas : non écrasés'), JSON.stringify(rap));
  assert.ok(!JSON.stringify(rap).includes('étiquettes modifiées'));
});

test('ensemble inchangé dans Kanevas : le nouvel envoi remplace, mise_a_jour', async () => {
  const t = await monter();
  const r1 = await t.put('lieu:x', PORT({ alias: ['A'], etiquettes: ['E1'] }));
  const id = r1.json().id as number;
  const r2 = await t.put('lieu:x', PORT({ alias: ['B', 'C'], etiquettes: ['E2'] }));
  assert.equal(r2.json().etat, 'mise_a_jour');
  assert.deepEqual(t.lire(id), { alias: ['B', 'C'], etiquettes: ['E2'] });
  assert.equal((t.app.db.prepare("SELECT COUNT(*) n FROM etiquettes WHERE nom = 'E1'").get() as { n: number }).n, 0);
});

test('un envoi sans alias ni étiquettes ne touche pas ceux de Kanevas ; [] vide un ensemble écrit par l’import', async () => {
  const t = await monter();
  const id = (await t.put('lieu:y', PORT({ alias: ['A'], etiquettes: ['E'] }))).json().id as number;
  const r = await t.put('lieu:y', PORT({}));
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(t.lire(id), { alias: ['A'], etiquettes: ['E'] });
  const r2 = await t.put('lieu:y', PORT({ alias: [] }));
  assert.equal(r2.json().etat, 'mise_a_jour');
  assert.deepEqual(t.lire(id), { alias: [], etiquettes: ['E'] });
});

test('21 alias : fiche écrite sans eux, avertissement ; 20 alias passent ; étiquette de 41 caractères laissée', async () => {
  const t = await monter();
  const l = await t.lot();
  const vingtEtUn = Array.from({ length: 21 }, (_, i) => `alias ${i}`);
  const r = await t.put('lieu:z', PORT({ alias: vingtEtUn, etiquettes: ['x'.repeat(41)] }), l);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'creee');
  assert.deepEqual(t.lire(r.json().id), { alias: [], etiquettes: [] });
  assert.equal(r.json().avertissements.length, 2, r.body);
  assert.equal((await t.clore(l)).avertissements, 2);
  const r20 = await t.put('lieu:z', PORT({ alias: vingtEtUn.slice(0, 20), etiquettes: ['x'.repeat(40)] }));
  assert.equal(r20.json().etat, 'mise_a_jour');
  assert.equal(t.lire(r.json().id).alias.length, 20);
  assert.deepEqual(t.lire(r.json().id).etiquettes, ['x'.repeat(40)]);
  const r120 = await t.put('lieu:w', PORT({ alias: ['a'.repeat(121)] }));
  assert.equal(r120.json().etat, 'creee');
  assert.deepEqual(t.lire(r120.json().id).alias, []);
});

test('hors bornes sur une fiche existante : ensemble laissé tel quel', async () => {
  const t = await monter();
  const id = (await t.put('lieu:v', PORT({ alias: ['A'] }))).json().id as number;
  const r = await t.put('lieu:v', PORT({ alias: Array.from({ length: 21 }, (_, i) => `a${i}`) }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(t.lire(id).alias, ['A']);
  assert.equal(r.json().avertissements.length, 1);
});

test('valeur non-liste : 400 avec champ, rien créé', async () => {
  const t = await monter();
  const r = await t.put('lieu:q', PORT({ alias: 'Salport' }));
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().champ, 'alias');
  const r2 = await t.put('lieu:q', PORT({ etiquettes: [1] }));
  assert.equal(r2.statusCode, 400);
  assert.equal((t.app.db.prepare("SELECT COUNT(*) n FROM fiches WHERE cle_origine = 'lieu:q'").get() as { n: number }).n, 0);
});

test('doublons sans casse et vides fusionnés', async () => {
  const t = await monter();
  const id = (await t.put('lieu:d', PORT({ alias: ['Salport', ' salport ', ''] }))).json().id as number;
  assert.deepEqual(t.lire(id).alias, ['Salport']);
});

test('GET / rend les quatre limites', async () => {
  const t = await monter();
  const r = await t.app.inject({ method: 'GET', url: t.base, headers: t.auth });
  const l = r.json().limites;
  assert.equal(l.aliasParFiche, 20);
  assert.equal(l.longueurAlias, 120);
  assert.equal(l.etiquettesParFiche, 20);
  assert.equal(l.longueurEtiquette, 40);
});

test('un autre univers : 404, aucun alias écrit', async () => {
  const t = await monter();
  const autre = t.app.db.prepare("SELECT id FROM univers WHERE nom <> 'Essai Kanka' LIMIT 1").get() as { id: number } | undefined;
  assert.ok(autre, 'le bouchon sème un autre univers');
  const r = await t.app.inject({
    method: 'PUT',
    url: `/api/import/v1/univers/${autre.id}/fiches/lieu:a`,
    headers: t.auth,
    payload: PORT({ alias: ['Fuite'] }) as object,
  });
  assert.equal(r.statusCode, 404);
  assert.equal((t.app.db.prepare('SELECT COUNT(*) n FROM fiche_alias WHERE alias = \'Fuite\'').get() as { n: number }).n, 0);
});
