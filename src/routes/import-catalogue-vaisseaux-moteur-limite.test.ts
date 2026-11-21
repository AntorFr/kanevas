import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-concepteur-vaisseaux-regles-calcul-catalogue (B-94, H-2, H-3, H-10 (5)): invented trial catalogue written by the test,
// imported through the session route, read back by GET catalogue, replayed; the catalogue version is read from the tool's line.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserActivation } = await import('../services/outils.js');
const { versionsSource } = await import('../services/swn/calcul-vaisseau.js');

const T = 'swn/vaisseaux';
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 10, pv: 5, ca: 10, puissance: 10, masse: 8, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
function catalogue(version: string, c: { moteur?: unknown; limite?: unknown } = {}): any {
  const m: any = {}; if (c.moteur !== undefined) m.moteur_spike = c.moteur;
  const l: any = {}; if (c.limite !== undefined) l.limite_par = c.limite;
  return {
    catalogue: T, version,
    coques: [{ cle: 'station', nom: 'Station', ...coque, ...m }, { cle: 'nue', nom: 'Nue', ...coque }],
    moteurs: [{ cle: 'm1', nom: 'M1', niveau: 1, ...el }],
    amenagements: [{ cle: 'baie', nom: 'Baie', ...el, ...l }, { cle: 'plain', nom: 'Plain', ...el }],
    defenses: [], armes: [], modifications: [], exemples: [],
  };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  poserActivation(app.db, antor, { niveau: 'univers', id: E }, T, true);
  const c = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  const cookie = `kanevas_session=${c.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  const base = `/api/univers/${E}/outils/${T}/catalogue`;
  const post = (corps: unknown) => app.inject({ method: 'POST', url: base + '/application', headers: { cookie }, payload: corps as any });
  const lire = async (nature: string) => (await app.inject({ method: 'GET', url: `${base}?nature=${nature}`, headers: { cookie } })).json();
  const ligne = async (nature: string, cle: string) => (await lire(nature)).elements.find((e: any) => e.cle === cle);
  const version = () => versionsSource(app.db, E).catalogue;
  const col = (t: string, c: string, k: string) => (app.db.prepare(`SELECT ${k} v FROM swn_catalogue_${t} WHERE cle = ? AND proprietaire = 'univers'`).get(c) as any).v;
  return { app, E, post, lire, ligne, version, col };
}

test('H-2 : moteur_spike 0 est créé, relu, inchangé au rejeu ; absent il vaut 1', async () => {
  const w = await monde();
  const r = await w.post(catalogue('v1', { moteur: 0 }));
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, []);
  assert.equal(w.col('coques', 'station', 'moteur_spike'), 0);
  assert.equal(w.col('coques', 'nue', 'moteur_spike'), 1);
  assert.equal((await w.ligne('coques', 'station')).donnees.moteur_spike, 0);
  assert.equal((await w.ligne('coques', 'nue')).donnees.moteur_spike, 1);
  const vers = w.version();
  const r2 = await w.post(catalogue('v1', { moteur: 0 }));
  assert.equal(r2.statusCode, 200);
  for (const [n, s] of Object.entries<any>(r2.json().natures)) { assert.equal(s.ajoutes, 0, n); assert.equal(s.modifies ?? 0, 0, n); }
  assert.equal(w.version(), vers);
  assert.equal((await w.ligne('coques', 'station')).donnees.moteur_spike, 0);
  // an explicit 1 equals the default: replay of a catalogue that states it is unchanged against one that does not
  const w2 = await monde();
  await w2.post(catalogue('v1'));
  const r3 = await w2.post(catalogue('v1', { moteur: 1 }));
  assert.equal(r3.json().natures.coques.modifies ?? 0, 0, 'explicit 1 = default');
});

test('H-2 : moteur_spike hors 0/1 refusé avec son champ, les autres lignes passent', async () => {
  for (const v of [2, -1, 0.5, '0', true, null, 'oui']) {
    const w = await monde();
    const r = await w.post(catalogue('v1', { moteur: v }));
    assert.equal(r.statusCode, 200, r.body);
    const refus = r.json().refus;
    assert.equal(refus.length, 1, `${JSON.stringify(v)} ${JSON.stringify(refus)}`);
    assert.equal(refus[0].nature, 'coques'); assert.equal(refus[0].cle, 'station'); assert.equal(refus[0].champ, 'moteur_spike');
    assert.equal(w.app.db.prepare("SELECT COUNT(*) n FROM swn_catalogue_coques WHERE proprietaire = 'univers' AND cle = 'station'").get().n, 0);
    assert.equal(w.col('coques', 'nue', 'moteur_spike'), 1, 'the other hull passes');
    assert.equal(w.col('amenagements', 'baie', 'cout'), 1000, 'the other natures pass');
  }
});

test('H-3 : limite_par armes est créé, relu, inchangé au rejeu ; absent il est null (omis)', async () => {
  const w = await monde();
  const r = await w.post(catalogue('v1', { limite: 'armes' }));
  assert.deepEqual(r.json().refus, []);
  assert.equal(w.col('amenagements', 'baie', 'limite_par'), 'armes');
  assert.equal(w.col('amenagements', 'plain', 'limite_par'), null);
  assert.equal((await w.ligne('amenagements', 'baie')).donnees.limite_par, 'armes');
  assert.ok(!('limite_par' in (await w.ligne('amenagements', 'plain')).donnees));
  const vers = w.version();
  const r2 = await w.post(catalogue('v1', { limite: 'armes' }));
  for (const [n, s] of Object.entries<any>(r2.json().natures)) { assert.equal(s.ajoutes, 0, n); assert.equal(s.modifies ?? 0, 0, n); }
  assert.equal(w.version(), vers);
});

test('H-3 : limite_par hors liste refusé avec son champ, les autres lignes passent', async () => {
  for (const v of ['moteurs', '', 'Armes', 1, null, ['armes']]) {
    const w = await monde();
    const r = await w.post(catalogue('v1', { limite: v }));
    assert.equal(r.statusCode, 200, r.body);
    const refus = r.json().refus;
    assert.equal(refus.length, 1, `${JSON.stringify(v)} ${JSON.stringify(refus)}`);
    assert.equal(refus[0].nature, 'amenagements'); assert.equal(refus[0].cle, 'baie'); assert.equal(refus[0].champ, 'limite_par');
    assert.equal(w.col('amenagements', 'plain', 'limite_par'), null);
    assert.equal(w.app.db.prepare("SELECT COUNT(*) n FROM swn_catalogue_amenagements WHERE proprietaire = 'univers' AND cle = 'baie'").get().n, 0);
  }
});

test('H-10 (5) : ajouter, changer ou retirer moteur_spike / limite_par modifie la ligne et change la version du catalogue', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const seq: [string, any, string, number][] = [
    ['v2', { moteur: 0 }, 'coques', 1],            // added (differs from the default)
    ['v3', { moteur: 0, limite: 'armes' }, 'amenagements', 1], // fitting added
    ['v4', { moteur: 1, limite: 'armes' }, 'coques', 1],       // hull changed back
    ['v5', { moteur: 1 }, 'amenagements', 1],                  // fitting field removed
  ];
  for (const [v, c, nature, n] of seq) {
    const avant = w.version();
    const r = await w.post(catalogue(v, c));
    assert.deepEqual(r.json().refus, [], v);
    assert.equal(r.json().natures[nature].modifies, n, `${v} ${nature}`);
    assert.notEqual(w.version(), avant, `${v}: the catalogue version moves`);
  }
  assert.equal(w.col('coques', 'station', 'moteur_spike'), 1);
  assert.equal(w.col('amenagements', 'baie', 'limite_par'), null);
  assert.ok(!('limite_par' in (await w.ligne('amenagements', 'baie')).donnees));
  // a replay of the same file moves nothing
  const avant = w.version();
  await w.post(catalogue('v5', { moteur: 1 }));
  assert.equal(w.version(), avant);
});
