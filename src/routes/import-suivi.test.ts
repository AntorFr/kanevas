import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { changerStatutCampagne, listerCampagnes, lireCampagne } = await import('../services/campagnes.js');
const { ecrireScenario, lireScenario } = await import('../services/scenarios.js');
const { morceauxLot } = await import('../../frontend/src/ecrans/acces-api/format.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const q = (lot?: number) => (lot ? `?lot=${lot}` : '');
  const putC = (cle: string, payload: unknown, lot?: number) =>
    app.inject({ method: 'PUT', url: `${base}/campagnes/${encodeURIComponent(cle)}${q(lot)}`, headers: auth, payload: payload as object });
  const putS = (cle: string, scle: string, payload: unknown, lot?: number) =>
    app.inject({
      method: 'PUT',
      url: `${base}/campagnes/${encodeURIComponent(cle)}/scenarios/${encodeURIComponent(scle)}${q(lot)}`,
      headers: auth, payload: payload as object,
    });
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  return { app, u, putC, putS, lot, clore, lire, antor: trouverCompte(app.db, 'antor')!.id, lea: trouverCompte(app.db, 'lea')!.id, auth, base };
}
const n = (app: { db: any }, sql: string, ...a: unknown[]) => (app.db.prepare(sql).get(...a) as { n: number }).n;

test('critère : créées, rejouées inchangées, E-18 lit « Campagnes : 1 inchangée · Scénarios : 1 inchangé »', async () => {
  const { app, putC, putS, lot, clore, lire } = await monter();
  const l1 = await lot();
  const c1 = await putC('c:brumes', { nom: 'Les Brumes', statut: 'active' }, l1);
  assert.equal(c1.statusCode, 200, c1.body);
  assert.equal(c1.json().etat, 'creee');
  const s1 = await putS('c:brumes', 's:1', { titre: 'Arrivée au port', contenu: 'Le **brouillard**.' }, l1);
  assert.equal(s1.json().etat, 'creee');
  await clore(l1);
  const row = app.db.prepare('SELECT nom, statut FROM campagnes WHERE cle_origine = ?').get('c:brumes');
  assert.deepEqual(row, { nom: 'Les Brumes', statut: 'active' });

  const avant = app.db.prepare('SELECT id, version, modifie_le FROM scenarios').all();
  const l2 = await lot();
  assert.equal((await putC('c:brumes', { nom: 'Les Brumes', statut: 'active' }, l2)).json().etat, 'inchangee');
  const r = await putS('c:brumes', 's:1', { titre: 'Arrivée au port', contenu: 'Le **brouillard**.' }, l2);
  assert.equal(r.json().etat, 'inchangee');
  assert.equal(r.json().id, s1.json().id);
  await clore(l2);
  assert.deepEqual(app.db.prepare('SELECT id, version, modifie_le FROM scenarios').all(), avant);
  assert.equal(n(app, 'SELECT COUNT(*) n FROM campagnes WHERE cle_origine IS NOT NULL'), 1);
  const lot2 = await lire(l2);
  assert.deepEqual(morceauxLot(lot2).slice(0, 2), ['Campagnes : 1 inchangée', 'Scénarios : 1 inchangé']);
});

test('statut changé par le service puis rejoué avec active : reste terminee, avertissement nommant le champ', async () => {
  const { app, putC, lot, clore, lire, antor } = await monter();
  const r1 = await putC('c:b', { nom: 'Brumes', statut: 'active' });
  changerStatutCampagne(app.db, antor, r1.json().id, 'terminee');
  const l = await lot();
  const r = await putC('c:b', { nom: 'Brumes', statut: 'active' }, l);
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(r.json().avertissements, ['statut modifié dans Kanevas : non écrasé']);
  assert.equal(app.db.prepare('SELECT statut FROM campagnes').get().statut, 'terminee');
  await clore(l);
  assert.equal((await lire(l)).avertissements, 1);
  // Replayed again: still protected, still terminee.
  const r3 = await putC('c:b', { nom: 'Brumes', statut: 'active' });
  assert.equal(r3.json().avertissements.length, 1);
  assert.equal(app.db.prepare('SELECT statut FROM campagnes').get().statut, 'terminee');
});

test('nom retouché dans Kanevas : laissé ; nom non retouché : mis à jour', async () => {
  const { app, putC, antor } = await monter();
  const id = (await putC('c:n', { nom: 'Ancien' })).json().id;
  const m = await putC('c:n', { nom: 'Nouveau' });
  assert.equal(m.json().etat, 'mise_a_jour');
  assert.equal(lireCampagne(app.db, antor, app.db.prepare('SELECT univers_id u FROM campagnes WHERE id=?').get(id).u, id).nom, 'Nouveau');
  app.db.prepare('UPDATE campagnes SET nom = ? WHERE id = ?').run('Humain', id);
  const r = await putC('c:n', { nom: 'Autre' });
  assert.deepEqual(r.json().avertissements, ['nom modifié dans Kanevas : non écrasé']);
  assert.equal(app.db.prepare('SELECT nom FROM campagnes WHERE id = ?').get(id).nom, 'Humain');
});

test('contenu modifié par le service de scénario puis rejoué : laissé, avertissement', async () => {
  const { app, putC, putS, antor } = await monter();
  await putC('c:b', { nom: 'Brumes' });
  const s = (await putS('c:b', 's:1', { titre: 'T', contenu: 'import' })).json().id;
  ecrireScenario(app.db, antor, s, { titre: 'T', contenu: 'humain' }, 1);
  const r = await putS('c:b', 's:1', { titre: 'T', contenu: 'import' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(r.json().avertissements, ['contenu modifié dans Kanevas : non écrasé']);
  assert.equal(lireScenario(app.db, antor, s).contenu, 'humain');
});

test('contenu non retouché : mis à jour par l’import, et un contenu humain ensuite reste protégé malgré une mise à jour du titre', async () => {
  const { app, putC, putS, antor } = await monter();
  await putC('c:b', { nom: 'Brumes' });
  const s = (await putS('c:b', 's:1', { titre: 'T', contenu: 'v1' })).json().id;
  const m = await putS('c:b', 's:1', { titre: 'T2', contenu: 'v2' });
  assert.equal(m.json().etat, 'mise_a_jour');
  const cur = lireScenario(app.db, antor, s);
  assert.equal(cur.titre, 'T2');
  assert.equal(cur.contenu, 'v2');
  ecrireScenario(app.db, antor, s, { titre: 'T2', contenu: 'humain' }, cur.version);
  const r = await putS('c:b', 's:1', { titre: 'T3', contenu: 'v3' });
  assert.equal(lireScenario(app.db, antor, s).contenu, 'humain');
  assert.ok(r.json().avertissements.includes('contenu modifié dans Kanevas : non écrasé'));
  const r2 = await putS('c:b', 's:1', { titre: 'T3', contenu: 'v3' });
  assert.equal(lireScenario(app.db, antor, s).contenu, 'humain');
  assert.ok(r2.json().avertissements.includes('contenu modifié dans Kanevas : non écrasé'));
});

test('titre retouché dans Kanevas : laissé avec avertissement', async () => {
  const { app, putC, putS, antor } = await monter();
  await putC('c:b', { nom: 'Brumes' });
  const s = (await putS('c:b', 's:1', { titre: 'T', contenu: 'c' })).json().id;
  const v = lireScenario(app.db, antor, s).version;
  ecrireScenario(app.db, antor, s, { titre: 'Humain', contenu: 'c' }, v);
  const r = await putS('c:b', 's:1', { titre: 'Import', contenu: 'c' });
  assert.deepEqual(r.json().avertissements, ['titre modifié dans Kanevas : non écrasé']);
  assert.equal(lireScenario(app.db, antor, s).titre, 'Humain');
});

test('100 000 caractères acceptés ; 100 001 : 400 invalide champ contenu, rien d’écrit, un refus au lot', async () => {
  const { app, putC, putS, lot, lire } = await monter();
  await putC('c:b', { nom: 'Brumes' });
  assert.equal((await putS('c:b', 's:ok', { titre: 'ok', contenu: 'a'.repeat(100000) })).statusCode, 200);
  const l = await lot();
  const r = await putS('c:b', 's:gros', { titre: 'gros', contenu: 'a'.repeat(100001) }, l);
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'invalide');
  assert.equal(r.json().champ, 'contenu');
  assert.equal(n(app, "SELECT COUNT(*) n FROM scenarios WHERE cle_origine = 's:gros'"), 0);
  assert.equal(n(app, 'SELECT COUNT(*) n FROM scenarios'), 1);
  const c = (await lire(l)).compteurs.scenarios;
  assert.equal(c.refusees, 1);
  assert.equal(c.creees ?? 0, 0);
});

test('scénario sous campagne inconnue : 404 campagne_inconnue, un refus au lot, rien d’écrit', async () => {
  const { app, putS, lot, lire } = await monter();
  const l = await lot();
  const r = await putS('c:nulle', 's:1', { titre: 'T', contenu: 'x' }, l);
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'campagne_inconnue');
  assert.equal(n(app, 'SELECT COUNT(*) n FROM scenarios'), 0);
  assert.equal((await lire(l)).compteurs.scenarios.refusees, 1);
});

test('entrées fausses : nom vide, statut inconnu, clé invalide, corps absent → 400 invalide avec champ, rien d’écrit', async () => {
  const { app, putC, putS } = await monter();
  const avant = n(app, 'SELECT COUNT(*) n FROM campagnes');
  const cas: [any, string][] = [
    [{ nom: '  ' }, 'nom'], [{ nom: 'x'.repeat(81) }, 'nom'], [{ nom: 'ok', statut: 'zzz' }, 'statut'], [{}, 'nom'],
  ];
  for (const [corps, champ] of cas) {
    const r = await putC('c:x', corps);
    assert.equal(r.statusCode, 400, JSON.stringify(corps));
    assert.equal(r.json().champ, champ);
  }
  assert.equal(n(app, 'SELECT COUNT(*) n FROM campagnes'), avant);
  await putC('c:b', { nom: 'B' });
  const r = await putS('c:b', 's:1', { titre: 'T' });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().champ, 'contenu');
  assert.equal((await putS('c:b', 's:1', { titre: 'x'.repeat(121), contenu: '' })).json().champ, 'titre');
});

test('mêmes clés dans deux campagnes : deux scénarios distincts ; sans jeton : 401 ; lot clos : 409', async () => {
  const { app, putC, putS, lot, clore, base } = await monter();
  await putC('c:a', { nom: 'A' });
  await putC('c:b', { nom: 'B' });
  const a = (await putS('c:a', 's:1', { titre: 'SA', contenu: '' })).json();
  const b = (await putS('c:b', 's:1', { titre: 'SB', contenu: '' })).json();
  assert.notEqual(a.id, b.id);
  assert.equal(a.etat, 'creee');
  assert.equal(b.etat, 'creee');
  const sans = await app.inject({ method: 'PUT', url: `${base}/campagnes/c:a`, payload: { nom: 'A' } });
  assert.equal(sans.statusCode, 401);
  const l = await lot();
  await clore(l);
  const r = await putC('c:z', { nom: 'Z' }, l);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'lot_clos');
  assert.equal(n(app, "SELECT COUNT(*) n FROM campagnes WHERE cle_origine = 'c:z'"), 0);
});

test('jeton d’un autre univers : 404, aucune campagne écrite', async () => {
  const { app, putC, auth, u } = await monter();
  const r = await app.inject({
    method: 'PUT', url: `/api/import/v1/univers/${u.id + 999}/campagnes/c:a`, headers: auth, payload: { nom: 'A' },
  });
  assert.equal(r.statusCode, 404);
  assert.equal(n(app, "SELECT COUNT(*) n FROM campagnes WHERE cle_origine = 'c:a'"), 0);
  void putC;
});

test('Léa lit nom et statut de la campagne, mais le scénario lui répond introuvable', async () => {
  const { app, u, putC, putS, lea } = await monter();
  const c = (await putC('c:brumes', { nom: 'Les Brumes', statut: 'active' })).json();
  const s = (await putS('c:brumes', 's:1', { titre: 'Arrivée', contenu: 'secret' })).json();
  const vues = listerCampagnes(app.db, lea, u.id);
  const v = vues.find((x) => x.id === c.id)!;
  assert.equal(v.nom, 'Les Brumes');
  assert.equal(v.statut, 'active');
  assert.throws(() => lireScenario(app.db, lea, s.id), (e: any) => e.code === 'introuvable');
});

test('GET / rend les limites à jour', async () => {
  const { app, base, auth } = await monter();
  const g = await app.inject({ method: 'GET', url: base, headers: auth });
  const l = g.json().limites;
  assert.equal(l.contenuScenario, 100000);
  assert.equal(l.nomCampagne, 80);
  assert.equal(l.titreScenario, 120);
});
