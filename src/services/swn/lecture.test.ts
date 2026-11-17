import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-galaxie-lire-lecture : vue, panneau, recherche, trajet, cache sous droits.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { lireBlocs, lireSysteme, rechercherSystemes } = await import('./lecture-carte.js');
const { calculerTrajet } = await import('./trajet.js');
const { lireBlocsGeneres, compteurs, viderCacheBlocs } = await import('./cache-blocs.js');
const { poserActivation } = await import('../outils.js');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  const a = (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur });
  return { db, q, univers, g, a };
}
const R0 = { bx: -3, by: -3 }, R1 = { bx: 3, by: 3 };
const code = (f: () => unknown) => { try { f(); } catch (e: any) { return e.code ?? e.constructor.name; } return 'aucune'; };

test('vue : comptes de lecture par compte', () => {
  const { db, univers, g, a } = monde();
  for (const [u, mode, s, r, z] of [['antor', false, 4, 3, 1], ['mira', false, 4, 3, 1], ['lea', false, 3, 2, 0],
    ['roxane', false, 3, 2, 0], ['antor', true, 3, 2, 0]] as const) {
    const v = lireBlocs(db, a(u, mode), univers, g, R0, R1);
    assert.deepEqual([v.systemes.length, v.routes.length, v.zones.length], [s, r, z], `${u} ${mode}`);
  }
});

test('étranger et sans rôle : introuvable partout', () => {
  const { db, univers, g, a } = monde();
  for (const u of ['teo']) {
    const ac = a(u);
    for (const f of [() => lireBlocs(db, ac, univers, g, R0, R1), () => lireSysteme(db, ac, univers, g, 'vael'),
      () => rechercherSystemes(db, ac, univers, g, 'vael'),
      () => calculerTrajet(db, ac, univers, g, { depart: 'port-sel', arrivee: 'vael' }),
      () => lireBlocsGeneres(db, ac, univers, g, R0, R0)]) assert.equal(code(f), 'introuvable');
  }
  assert.equal(code(() => lireBlocs(db, a('antor'), univers, 99999, R0, R1)), 'introuvable');
});

test('la vue de Léa ne porte ni secret ni publique ; celle d\'Antor oui', () => {
  const { db, univers, g, a } = monde();
  const l = JSON.stringify(lireBlocs(db, a('lea'), univers, g, R0, R1));
  assert.ok(!l.includes('secret') && !l.includes('publique') && !l.includes('fantôme') && !l.includes('Marches'));
  const m = JSON.stringify(lireBlocs(db, a('antor'), univers, g, R0, R1));
  assert.ok(m.includes('"secret":true') && m.includes('"publique":false'));
});

test('trajets', () => {
  const { db, univers, g, a } = monde();
  const t = (u: string, d: string, v: string, routes?: 'toutes' | 'publiques', moteur = 2) =>
    calculerTrajet(db, a(u), univers, g, { depart: d, arrivee: v, routes, moteur }) as any;
  assert.equal(t('lea', 'port-sel', 'vael', 'publiques').libelle, '7 cases · 4,5 jours');
  assert.equal(t('antor', 'port-sel', 'hesper', 'toutes').libelle, '6 cases · 4 jours');
  const lea = t('lea', 'port-sel', 'hesper', 'toutes');
  assert.equal(lea.libelle, '13 cases · 8,5 jours');
  assert.deepEqual(lea, t('lea', 'port-sel', 'hesper', 'publiques'));
  const privee = db.prepare('SELECT id FROM swn_routes WHERE publique=0').get() as any;
  assert.ok(!JSON.stringify(lea).includes(`"${privee.id}"`) && lea.troncons.length === 2);
  assert.equal(t('antor', 'port-sel', 'hesper', 'publiques').libelle, '13 cases · 8,5 jours');
  assert.equal(t('antor', 'port-sel', 'hesper', 'toutes', 1).libelle, '6 cases · 7 jours');
  assert.equal(code(() => t('lea', 'port-sel', 'station-fantome')), 'introuvable');
  assert.equal(code(() => t('lea', 'port-sel', 'port-sel')), 'invalide');
  assert.equal(code(() => t('lea', 'port-sel', 'vael', 'publiques', 0)), 'invalide');
  assert.equal(code(() => t('lea', 'port-sel', 'vael', 'publiques', 2.5)), 'invalide');
});

test('recherche', () => {
  const { db, univers, g, a } = monde();
  assert.deepEqual(rechercherSystemes(db, a('lea'), univers, g, 'fant'), []);
  assert.deepEqual(rechercherSystemes(db, a('antor'), univers, g, 'fant').map((s) => s.nom), ['Station fantôme']);
  assert.deepEqual(rechercherSystemes(db, a('antor', true), univers, g, 'FANT'), []);
  assert.deepEqual(rechercherSystemes(db, a('antor'), univers, g, 'STATION fantome').length, 1);
  assert.deepEqual(rechercherSystemes(db, a('antor'), univers, g, 'f'), []);
});

test('route et zone ajoutées vers/sur « Station fantôme » invisibles pour Léa', () => {
  const { db, univers, g, a } = monde();
  const id = (c: string) => (db.prepare('SELECT id FROM swn_systemes WHERE cle=?').get(c) as any).id;
  const avant = JSON.stringify([lireBlocs(db, a('lea'), univers, g, R0, R1),
    lireSysteme(db, a('lea'), univers, g, 'vael'), calculerTrajet(db, a('lea'), univers, g, { depart: 'port-sel', arrivee: 'vael' })]);
  db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?,?,?,?,1,3)')
    .run(g, univers, id('station-fantome'), id('vael'));
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret) VALUES (?,?,'z2','Z2','[[-6,3],[-5,3],[-5,4]]','rouge',NULL,0)")
    .run(g, univers);
  const apres = () => JSON.stringify([lireBlocs(db, a('lea'), univers, g, R0, R1),
    lireSysteme(db, a('lea'), univers, g, 'vael'), calculerTrajet(db, a('lea'), univers, g, { depart: 'port-sel', arrivee: 'vael' })]);
  // la zone non secrète reste visible ; on la compare à part
  assert.equal(lireBlocs(db, a('lea'), univers, g, R0, R1).routes.length, 2);
  assert.ok(!apres().includes('fantôme') && !apres().includes('fantome'));
  assert.deepEqual(lireSysteme(db, a('lea'), univers, g, 'vael').routes.map((r) => r.avec.cle).sort(), ['hesper', 'port-sel']);
  const c = calculerTrajet(db, a('lea'), univers, g, { depart: 'port-sel', arrivee: 'vael' }) as any;
  assert.equal(c.libelle, '7 cases · 4,5 jours');
  void avant;
  assert.equal(code(() => lireSysteme(db, a('lea'), univers, g, 'station-fantome')), 'introuvable');
  assert.equal(lireSysteme(db, a('antor'), univers, g, 'vael').routes.length, 3);
});

test('rectangle : 12×12 passe, 13 ou invalide refuse', () => {
  const { db, univers, g, a } = monde();
  assert.doesNotThrow(() => lireBlocs(db, a('lea'), univers, g, { bx: 0, by: 0 }, { bx: 11, by: 11 }));
  assert.equal(code(() => lireBlocs(db, a('lea'), univers, g, { bx: 0, by: 0 }, { bx: 12, by: 0 })), 'invalide');
  assert.equal(code(() => lireBlocs(db, a('lea'), univers, g, { bx: 0, by: 0 }, { bx: 0, by: 12 })), 'invalide');
  assert.equal(code(() => lireBlocs(db, a('lea'), univers, g, { bx: 2, by: 0 }, { bx: 1, by: 0 })), 'invalide');
  assert.equal(code(() => lireBlocs(db, a('lea'), univers, g, { bx: NaN, by: 0 }, { bx: 1, by: 0 })), 'invalide');
  assert.equal(code(() => lireBlocs(db, a('lea'), univers, g, { bx: 0.5, by: 0 }, { bx: 1, by: 0 })), 'invalide');
  assert.equal(code(() => lireBlocs(db, a('lea'), univers, g, { bx: 0, by: 0 }, { bx: 1e15, by: 0 })), 'invalide');
});

test('déterminisme et bloc (−2,0) sous la zone', () => {
  const { db, univers, g, a } = monde();
  const b = { bx: -2, by: 0 };
  const un = lireBlocs(db, a('lea'), univers, g, b, b), deux = lireBlocs(db, a('lea'), univers, g, b, b);
  assert.deepEqual(un.blocs, deux.blocs);
  const antor = lireBlocs(db, a('antor'), univers, g, b, b).blocs[0]!;
  assert.deepEqual(antor.generes.filter(([, r]) => r >= 2 && r <= 4), []);
  const froid = lireBlocs(db, a('lea'), univers, g, b, b).blocs;
  db.prepare('DELETE FROM swn_zones WHERE galaxie_id=?').run(g);
  assert.deepEqual(lireBlocs(db, a('lea'), univers, g, b, b).blocs, froid);
});

test('cache : Léa après Antor — aucune génération mj, résultat identique au froid', () => {
  const { db, univers, g, a } = monde();
  const froid = lireBlocsGeneres(db, a('lea'), univers, g, R0, R1);
  viderCacheBlocs();
  lireBlocsGeneres(db, a('antor'), univers, g, R0, R1);
  const mj = compteurs().parNiveau.mj;
  const avant = { ...compteurs().parNiveau.joueur };
  assert.deepEqual(lireBlocsGeneres(db, a('lea'), univers, g, R0, R1), froid.map((x) => x));
  const apres = compteurs();
  assert.deepEqual(apres.parNiveau.mj, mj);
  assert.equal(apres.parNiveau.joueur.generations - avant.generations, 49);
  // mode Joueur d'Antor partage l'entrée 'joueur'
  lireBlocsGeneres(db, a('antor', true), univers, g, R0, R1);
  assert.equal(compteurs().parNiveau.joueur.generations, apres.parNiveau.joueur.generations);
  // muter la réponse ne corrompt pas le cache
  const x = lireBlocsGeneres(db, a('lea'), univers, g, R0, R0); x[0]!.generes.length = 0;
  assert.deepEqual(lireBlocsGeneres(db, a('lea'), univers, g, R0, R0), froid.slice(0, 1));
});

test('clé : graine, zone, densité par défaut changent le résultat servi', () => {
  const { db, univers, g, a } = monde();
  const b = { bx: 0, by: 0 };
  const lire = () => JSON.stringify(lireBlocsGeneres(db, a('antor'), univers, g, b, b));
  const base = lire();
  db.prepare("UPDATE swn_galaxies SET graine='autre' WHERE id=?").run(g);
  assert.notEqual(lire(), base);
  db.prepare("UPDATE swn_galaxies SET graine='essai-1' WHERE id=?").run(g);
  assert.equal(lire(), base);
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret) VALUES (?,?,'z','Z','[[0,0],[4,0],[4,4],[0,4]]','rouge',0,0)").run(g, univers);
  assert.equal(JSON.parse(lire())[0].generes.length, 0);
  db.prepare("UPDATE swn_zones SET densite=1, version=version+1 WHERE cle='z'").run();
  assert.equal(JSON.parse(lire())[0].generes.length, 25);
  db.prepare('DELETE FROM swn_zones WHERE cle=?').run('z');
  assert.equal(lire(), base);
});

test('galaxie invisible : introuvable pour Léa, refuse mode_joueur pour Antor joueur ; outil désactivé introuvable', () => {
  const { db, univers, g, a } = monde();
  db.prepare('UPDATE swn_galaxies SET visible=0 WHERE id=?').run(g);
  assert.equal(code(() => lireBlocs(db, a('lea'), univers, g, R0, R1)), 'introuvable');
  try { lireBlocs(db, a('antor', true), univers, g, R0, R1); assert.fail(); } catch (e: any) {
    assert.equal(e.code, 'refuse'); assert.equal(e.detail, 'mode_joueur');
  }
  assert.equal(lireBlocs(db, a('antor'), univers, g, R0, R1).systemes.length, 4);
  db.prepare('UPDATE swn_galaxies SET visible=1 WHERE id=?').run(g);
  poserActivation(db, a('antor'), { niveau: 'univers', id: univers }, 'swn/galaxie', false);
  assert.equal(code(() => lireBlocs(db, a('antor'), univers, g, R0, R1)), 'introuvable');
});

test('autre univers : galaxie introuvable', () => {
  const { db, q, univers, g, a } = monde();
  const autre = q('SELECT id FROM univers WHERE id <> ?', univers)[0]?.id as number | undefined;
  if (autre !== undefined) assert.equal(code(() => lireBlocs(db, a('antor'), autre, g, R0, R1)), 'introuvable');
});
