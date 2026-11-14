import assert from 'node:assert/strict';
import { test } from 'node:test';

// B-84 at the service level (Z-1, Z-2, Z-3, Z-7, Z-8): both shapes through dessinerZone / modifierZone, read, document.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const e = await import('./ecriture-carte.js');
const { lireBlocs, lireZone } = await import('./lecture-carte.js');
const { produireGalaxie } = await import('./document-source.js');
const { galaxieLisible } = await import('./galaxies.js');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const gid = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  return { db, q, univers, gid, antor: { compteId: cid('antor'), modeJoueur: false }, lea: { compteId: cid('lea'), modeJoueur: false } };
}
const err = (f: () => unknown): any => { try { f(); } catch (x) { return x; } assert.fail("pas d'erreur"); };
const carre = (n: number): [number, number][] => Array.from({ length: n * n }, (_, i) => [i % n, Math.floor(i / n)]);

test('une zone d\'ensemble garde exactement une forme ; passer d\'une forme à l\'autre réécrit les deux colonnes', () => {
  const w = monde();
  const { cle, version } = e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Carré', contour: { hexagones: carre(10) } });
  const l1 = w.q('SELECT contour, plages FROM swn_zones WHERE cle = ?', cle)[0];
  assert.deepEqual([l1.contour, l1.plages], ['[]', JSON.stringify(Array.from({ length: 10 }, (_, r) => [r, 0, 9]))]);
  const v2 = e.modifierZone(w.db, w.antor, w.univers, w.gid, cle, { contour: [[0, 0], [5, 0], [0, 5]], version }).version;
  const l2 = w.q('SELECT contour, plages FROM swn_zones WHERE cle = ?', cle)[0];
  assert.deepEqual([l2.contour, l2.plages], ['[[0,0],[5,0],[0,5]]', null]);
  e.modifierZone(w.db, w.antor, w.univers, w.gid, cle, { contour: { hexagones: [[2, 2], [3, 2]] }, version: v2 });
  const l3 = w.q('SELECT contour, plages FROM swn_zones WHERE cle = ?', cle)[0];
  assert.deepEqual([l3.contour, l3.plages], ['[]', '[[2,2,3]]']);
});

test('refus par le service : champ contour pour 0, 5 001 hexagones et un hexagone mal formé', () => {
  const w = monde();
  for (const h of [[], carre(71).slice(0, 5001), [[0, 0], [0.5, 1]]]) {
    const x = err(() => e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Mauvaise', contour: { hexagones: h } }));
    assert.equal(x.code, 'invalide');
    assert.equal(x.champ, 'contour');
  }
});

test('lecture d\'une zone d\'ensemble : bloc et panneau rendent plages et décompte, polygone sans ces clés ; rectangle hors boîte : absente', () => {
  const w = monde();
  e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Ensemble', contour: { hexagones: [[0, 0], [1, 0], [2, 0], [0, 1]] } });
  e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Poly', contour: [[0, 0], [4, 0], [0, 4]] });
  const vue = lireBlocs(w.db, w.antor, w.univers, w.gid, { bx: 0, by: 0 }, { bx: 0, by: 0 });
  const ens = vue.zones.find((z) => z.nom === 'Ensemble')!;
  assert.deepEqual([ens.contour, ens.plages, ens.hexagones], [[], [[0, 0, 2], [1, 0, 0]], 4]);
  const poly = vue.zones.find((z) => z.nom === 'Poly')!;
  assert.equal('plages' in poly || 'hexagones' in poly, false);
  const loin = lireBlocs(w.db, w.antor, w.univers, w.gid, { bx: 5, by: 5 }, { bx: 6, by: 6 });
  assert.equal(loin.zones.some((z) => z.nom === 'Ensemble'), false);
  const panneau = lireZone(w.db, w.antor, w.univers, w.gid, 'ensemble');
  assert.deepEqual([panneau.plages, panneau.hexagones], [[[0, 0, 2], [1, 0, 0]], 4]);
});

test('la densité d\'une zone d\'ensemble agit sur les blocs ; un trou de l\'ensemble n\'en reçoit pas', () => {
  // The core draws block (20,20) of seed 'essai-1' at the candidate hexagon (101,103): its density decides whether the star is kept.
  const w = monde();
  const bloc = () => lireBlocs(w.db, w.antor, w.univers, w.gid, { bx: 20, by: 20 }, { bx: 20, by: 20 }).blocs[0]!.generes;
  const sans = bloc(); assert.deepEqual(sans, [[101, 103]]);
  const carreZone = carre(5).map(([q, r]) => [q + 100, r + 100]);
  const vide = e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Vide', contour: { hexagones: carreZone }, densite: 0 });
  assert.deepEqual(bloc(), [], 'densité 0 sur le candidat : aucune étoile');
  e.modifierZone(w.db, w.antor, w.univers, w.gid, vide.cle, { densite: 1, version: vide.version });
  assert.deepEqual(bloc(), [[101, 103]], 'densité 1 sur le candidat : l\'étoile tirée');
  // a hole at the candidate: the zone's density does not reach it, the galaxy default (as without any zone) decides
  e.modifierZone(w.db, w.antor, w.univers, w.gid, vide.cle, { contour: { hexagones: carreZone.filter(([q, r]) => !(q === 101 && r === 103)) }, densite: 0, version: vide.version + 1 });
  assert.deepEqual(bloc(), sans, 'trou : densité par défaut');
});

test('document MJ : « n hexagones » pour un ensemble (« 1 hexagone » au singulier), polygone inchangé', () => {
  const w = monde();
  e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Grande', contour: { hexagones: carre(10) } });
  e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Seule', contour: { hexagones: [[0, 0]] }, secret: true });
  e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Poly', contour: [[0, 0], [4, 0], [0, 4]], densite: 0.5 });
  const { galaxie } = galaxieLisible(w.db, w.antor, w.univers, w.gid);
  const { contenu } = produireGalaxie(w.db, w.antor, w.univers, galaxie);
  assert.ok(contenu.includes('\n- Grande · 100 hexagones · densité automatique\n'), contenu);
  assert.ok(contenu.includes('\n- Seule · 1 hexagone · densité automatique (secrète)\n'), contenu);
  assert.ok(contenu.includes('\n- Poly · densité 50 %\n'), contenu);
});

test('zone secrète d\'ensemble : absente de la lecture d\'un joueur', () => {
  const w = monde();
  e.dessinerZone(w.db, w.antor, w.univers, w.gid, { nom: 'Cachee', contour: { hexagones: [[0, 0], [1, 0]] }, secret: true });
  const lea = JSON.stringify(lireBlocs(w.db, w.lea, w.univers, w.gid, { bx: 0, by: 0 }, { bx: 0, by: 0 }));
  assert.equal(lea.includes('Cachee'), false);
  assert.equal(err(() => lireZone(w.db, w.lea, w.univers, w.gid, 'cachee')).code, 'introuvable');
});
