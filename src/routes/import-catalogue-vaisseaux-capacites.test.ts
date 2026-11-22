import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-concepteur-vaisseaux-capacites-equipage-donnees (B-94, H-4, H-5, H-10 (5), H-capacites-1 (1)): invented trial catalogue written
// by the test, imported through the session route, read back by GET catalogue, replayed; the catalogue version is read from the tool's line.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserActivation } = await import('../services/outils.js');
const { versionsSource } = await import('../services/swn/calcul-vaisseau.js');
const { CODES_CAPACITE } = await import('../outils/swn/regles/capacites.js');

const T = 'swn/vaisseaux';
const NEUF = ['fret_cache', 'equipage_max_pct', 'provisions', 'hydroponie', 'sommeil_froid', 'soute_exode', 'canots', 'cabines_luxe', 'colonie'];
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 10, pv: 5, ca: 10, puissance: 10, masse: 8, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
interface Choix { capacite?: unknown; jeu?: unknown; effet?: unknown; limite?: number }
/** `jeu` goes on every nature but the examples; `capacite` / `effet` on the fitting `baie`. */
function catalogue(version: string, c: Choix = {}): any {
  const j: any = c.jeu === undefined ? {} : { effet_jeu: c.jeu };
  const b: any = { ...j };
  if (c.capacite !== undefined) b.capacite = c.capacite;
  if (c.effet !== undefined) b.effet = c.effet;
  return {
    catalogue: T, version,
    coques: [{ cle: 'c1', nom: 'C1', ...coque, ...j }],
    moteurs: [{ cle: 'm1', nom: 'M1', niveau: 1, ...el, ...j }],
    amenagements: [{ cle: 'baie', nom: 'Baie', ...el, limite: c.limite ?? 0, ...b }, { cle: 'plain', nom: 'Plain', ...el }],
    defenses: [{ cle: 'd1', nom: 'D1', ...el, ...j }],
    armes: [{ cle: 'a1', nom: 'A1', emport: 1, munitions: 0, cout_munition: 0, ...el, ...j }],
    modifications: [{ cle: 'x1', nom: 'X1', ...el, ...j }],
    exemples: [],
  };
}
const NATURES = ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications'];

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
  const nbLignes = (t: string, c: string) => (app.db.prepare(`SELECT COUNT(*) n FROM swn_catalogue_${t} WHERE cle = ? AND proprietaire = 'univers'`).get(c) as any).n as number;
  return { app, E, post, lire, ligne, version, col, nbLignes };
}
const rejeuInchange = (r: any) => { for (const [n, s] of Object.entries<any>(r.json().natures)) { assert.equal(s.ajoutes, 0, n); assert.equal(s.modifies ?? 0, 0, n); } };

test('la liste des codes en code est celle de H-4, neuf codes, dans l\'ordre', () => {
  assert.deepEqual([...CODES_CAPACITE], NEUF);
});

test('H-4 : capacite canots est créée, relue par GET catalogue, inchangée au rejeu ; absente elle est null et omise', async () => {
  const w = await monde();
  const r = await w.post(catalogue('v1', { capacite: 'canots' }));
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, []);
  assert.equal(w.col('amenagements', 'baie', 'capacite'), 'canots');
  assert.equal(w.col('amenagements', 'plain', 'capacite'), null);
  assert.equal((await w.ligne('amenagements', 'baie')).donnees.capacite, 'canots');
  assert.ok(!('capacite' in (await w.ligne('amenagements', 'plain')).donnees));
  const vers = w.version();
  rejeuInchange(await w.post(catalogue('v1', { capacite: 'canots' })));
  assert.equal(w.version(), vers);
});

test('H-4 : les neuf codes sont acceptés', async () => {
  for (const code of NEUF) {
    const w = await monde();
    const r = await w.post(catalogue('v1', { capacite: code }));
    assert.deepEqual(r.json().refus, [], code);
    assert.equal(w.col('amenagements', 'baie', 'capacite'), code);
  }
});

test('H-4 : capacite hors liste refusée avec champ capacite, les autres lignes passent, rien d\'écrit pour la ligne', async () => {
  for (const v of ['turbo', '', 'Canots', 'canots ', 1, null, ['canots'], true]) {
    const w = await monde();
    const r = await w.post(catalogue('v1', { capacite: v }));
    assert.equal(r.statusCode, 200, r.body);
    const refus = r.json().refus;
    assert.equal(refus.length, 1, `${JSON.stringify(v)} ${JSON.stringify(refus)}`);
    assert.equal(refus[0].nature, 'amenagements'); assert.equal(refus[0].cle, 'baie'); assert.equal(refus[0].champ, 'capacite');
    assert.equal(w.nbLignes('amenagements', 'baie'), 0);
    assert.equal(w.col('amenagements', 'plain', 'cout'), 1000, 'the other fitting passes');
    assert.equal(w.col('coques', 'c1', 'cout'), 10, 'the other natures pass');
  }
});

test('H-4 : capacite n\'existe pas hors des aménagements (une coque qui la porte est refusée avec son champ)', async () => {
  const w = await monde();
  const f = catalogue('v1'); f.coques[0].capacite = 'canots'; f.armes[0].capacite = 'canots';
  const r = await w.post(f);
  assert.deepEqual(r.json().refus.map((x: any) => [x.nature, x.champ]).sort(), [['armes', 'capacite'], ['coques', 'capacite']]);
});

test('H-4 : effet_jeu de 1 à 200 caractères accepté sur les six natures, relu, inchangé au rejeu ; 201 ou vide refusé avec champ effet_jeu', async () => {
  for (const texte of ['x', 'Une ligne d\'effet', 'é'.repeat(200)]) {
    const w = await monde();
    const r = await w.post(catalogue('v1', { jeu: texte }));
    assert.deepEqual(r.json().refus, [], texte.slice(0, 10));
    for (const n of NATURES) {
      const cle = { coques: 'c1', moteurs: 'm1', amenagements: 'baie', defenses: 'd1', armes: 'a1', modifications: 'x1' }[n]!;
      assert.equal(w.col(n, cle, 'effet_jeu'), texte, n);
      assert.equal((await w.ligne(n, cle)).donnees.effet_jeu, texte, n);
    }
    assert.equal(w.col('amenagements', 'plain', 'effet_jeu'), null);
    const vers = w.version();
    rejeuInchange(await w.post(catalogue('v1', { jeu: texte })));
    assert.equal(w.version(), vers);
  }
  for (const v of ['x'.repeat(201), '', 1, null, ['x'], true]) {
    const w = await monde();
    const r = await w.post(catalogue('v1', { jeu: v }));
    const refus = r.json().refus;
    assert.equal(refus.length, 6, `${JSON.stringify(v).slice(0, 12)} ${JSON.stringify(refus)}`);
    assert.ok(refus.every((x: any) => x.champ === 'effet_jeu'));
    assert.deepEqual(refus.map((x: any) => x.nature).sort(), [...NATURES].sort());
    assert.equal(w.col('amenagements', 'plain', 'cout'), 1000, 'the line without it passes');
  }
});

test('H-4 : effet_jeu refusé sur un exemple (champ effet_jeu), jamais évalué', async () => {
  const w = await monde();
  const f = catalogue('v1'); f.exemples = [{ cle: 'e1', nom: 'E', coque: 'c1', choix: [], effet_jeu: 'x' }];
  const r = await w.post(f);
  assert.deepEqual(r.json().refus.map((x: any) => [x.nature, x.cle, x.champ]), [['exemples', 'e1', 'effet_jeu']]);
});

test('H-capacites-1 (1) : support_automatisation est accepté (limite 1) et refusé sans limite 1, comme les autres effets uniques', async () => {
  const w = await monde();
  const r = await w.post(catalogue('v1', { effet: 'support_automatisation', limite: 1 }));
  assert.deepEqual(r.json().refus, []);
  assert.equal(w.col('amenagements', 'baie', 'effet'), 'support_automatisation');
  assert.equal((await w.ligne('amenagements', 'baie')).donnees.effet, 'support_automatisation');
  rejeuInchange(await w.post(catalogue('v1', { effet: 'support_automatisation', limite: 1 })));
  for (const limite of [0, 2]) {
    const w2 = await monde();
    const r2 = await w2.post(catalogue('v1', { effet: 'support_automatisation', limite }));
    assert.deepEqual(r2.json().refus.map((x: any) => [x.cle, x.champ]), [['baie', 'limite']], String(limite));
  }
  // an effect of another nature is still refused on a fitting, and the old one still passes
  const w3 = await monde();
  const r3 = await w3.post(catalogue('v1', { effet: 'vitesse' }));
  assert.deepEqual(r3.json().refus.map((x: any) => [x.cle, x.champ]), [['baie', 'effet']]);
});

test('H-4 : le champ du code d\'effet peut porter capacite et effet_jeu ensemble', async () => {
  const w = await monde();
  const r = await w.post(catalogue('v1', { capacite: 'colonie', jeu: 'Vingt colons', effet: 'support_automatisation', limite: 1 }));
  assert.deepEqual(r.json().refus, []);
  const d = (await w.ligne('amenagements', 'baie')).donnees;
  assert.deepEqual([d.capacite, d.effet_jeu, d.effet], ['colonie', 'Vingt colons', 'support_automatisation']);
});

test('H-10 (5) : ajouter, changer ou retirer capacite / effet_jeu modifie la ligne et change la version du catalogue', async () => {
  const w = await monde();
  await w.post(catalogue('v1'));
  const seq: [string, Choix, string, number][] = [
    ['v2', { capacite: 'canots' }, 'amenagements', 1],                      // capacity added
    ['v3', { capacite: 'colonie' }, 'amenagements', 1],                     // capacity changed
    ['v4', { capacite: 'colonie', jeu: 'Texte' }, 'amenagements', 1],       // the effect line added (and on the other natures)
    ['v5', { capacite: 'colonie', jeu: 'Autre' }, 'amenagements', 1],       // the effect line changed
    ['v6', { jeu: 'Autre' }, 'amenagements', 1],                            // capacity removed
    ['v7', {}, 'amenagements', 1],                                          // effect line removed
  ];
  for (const [v, c, nature, n] of seq) {
    const avant = w.version();
    const r = await w.post(catalogue(v, c));
    assert.deepEqual(r.json().refus, [], v);
    assert.equal(r.json().natures[nature].modifies, n, `${v} ${nature}`);
    assert.notEqual(w.version(), avant, `${v}: the catalogue version moves`);
  }
  assert.equal(w.col('amenagements', 'baie', 'capacite'), null);
  assert.equal(w.col('coques', 'c1', 'effet_jeu'), null);
  assert.ok(!('capacite' in (await w.ligne('amenagements', 'baie')).donnees));
  const avant = w.version();
  rejeuInchange(await w.post(catalogue('v7')));
  assert.equal(w.version(), avant);
});

test('H-10 (5) : un effet_jeu seul, sur une coque, change la version du catalogue (l\'empreinte couvre les six natures)', async () => {
  for (const n of NATURES) {
    const w = await monde();
    await w.post(catalogue('v1'));
    const avant = w.version();
    const f = catalogue('v2');
    const cle = { coques: 'c1', moteurs: 'm1', amenagements: 'baie', defenses: 'd1', armes: 'a1', modifications: 'x1' }[n]!;
    (f[n] as any[]).find((x) => x.cle === cle).effet_jeu = 'Nouveau';
    const r = await w.post(f);
    assert.equal(r.json().natures[n].modifies, 1, n);
    assert.notEqual(w.version(), avant, n);
  }
});
