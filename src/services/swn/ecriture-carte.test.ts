import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-galaxie-tenir-elements : T-2 à T-5, placer, promouvoir, déplacer, tracer, dessiner.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const e = await import('./ecriture-carte.js');
const { lireBlocs, lireSysteme, rechercherSystemes } = await import('./lecture-carte.js');
const { calculerTrajet } = await import('./trajet.js');
const { lireBlocsGeneres, viderCacheBlocs } = await import('./cache-blocs.js');
const { distanceHex } = await import('../../outils/swn/regles/hex.js');

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
  const sys = (cle: string) => q('SELECT * FROM swn_systemes WHERE galaxie_id=? AND cle=?', g, cle)[0];
  return { db, q, univers, g, a, sys };
}
type W = ReturnType<typeof monde>;
const err = (f: () => unknown): any => { try { f(); } catch (x) { return x; } assert.fail("pas d'erreur"); };
const R0 = { bx: -3, by: -3 }, R1 = { bx: 3, by: 3 };

function positions(w: W) {
  const [b] = lireBlocsGeneres(w.db, w.a('antor'), w.univers, w.g, { bx: 0, by: 0 }, { bx: 0, by: 0 });
  assert.ok(b && b.generes.length > 0, 'le bloc (0,0) rend au moins un système');
  const libre = [];
  for (let q = 0; q < 8; q++) for (let r = 0; r < 8; r++) {
    if (!b.generes.some(([x, y]) => x === q && y === r) && !w.q('SELECT 1 FROM swn_systemes WHERE q=? AND r=?', q, r).length) libre.push([q, r]);
  }
  const occupe = (x: number, y: number) => w.q('SELECT 1 FROM swn_systemes WHERE q=? AND r=?', x, y).length > 0;
  const genere = b.generes.find(([x, y]) => !occupe(x, y));
  assert.ok(genere, 'un généré libre');
  return { genere: genere!, libre: libre[0]! };
}

test('placer : promu vrai sur un généré, faux ailleurs ; clés port-noir puis port-noir-2', () => {
  const w = monde();
  const { genere, libre } = positions(w);
  const p1 = e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { nom: 'Port Noir', q: genere[0], r: genere[1] });
  assert.equal(p1.cle, 'port-noir');
  assert.equal(p1.promu, true);
  assert.equal(p1.version, 1);
  const p2 = e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { nom: 'Port Noir', q: libre[0], r: libre[1] });
  assert.equal(p2.cle, 'port-noir-2');
  assert.equal(p2.promu, false);
  assert.equal(w.sys('port-noir').promu, 1);
  assert.equal(w.sys('port-noir-2').promu, 0);
});

test('placer : hexagone pris → conflit case_occupee ; entrées fausses → invalide avec champ', () => {
  const w = monde();
  const v = w.sys('vael');
  const pris = err(() => e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { nom: 'X', q: v.q, r: v.r }));
  assert.equal(pris.code, 'conflit');
  assert.equal(pris.detail, 'case_occupee');
  const avant = w.q('SELECT count(*) n FROM swn_systemes')[0].n;
  const base = { nom: 'Ok', q: 40, r: 40 };
  const cas: [string, Record<string, unknown>][] = [
    ['nom', { nom: '' }], ['nom', { nom: '   ' }], ['nom', { nom: 'a'.repeat(81) }], ['nom', { nom: 5 }],
    ['taille', { taille: 'géante' }], ['taille', { taille: 9 }], ['taille', { taille: 1.5 }],
    ['couleur', { couleur: 'fuchsia' }], ['couleur', { couleur: 7 }],
    ['q', { q: 100001 }], ['q', { q: -100001 }], ['q', { q: 1.5 }], ['q', { q: '3' }], ['r', { r: 100001 }], ['r', { r: null }],
    ['secret', { secret: 'oui' }], ['notes', { notes: 'x'.repeat(2001) }],
  ];
  for (const [champ, patch] of cas) {
    const x = err(() => e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { ...base, ...patch }));
    assert.equal(x.code, 'invalide', JSON.stringify(patch));
    assert.equal(x.champ, champ, JSON.stringify(patch));
  }
  assert.equal(w.q('SELECT count(*) n FROM swn_systemes')[0].n, avant);
  e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { nom: 'a'.repeat(80), q: 100000, r: -100000 });
});

test('routes : longueur de la grille, jamais celle du corps ; doublon dans les deux sens ; extrémités égales', () => {
  const w = monde();
  e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { nom: 'Port Noir', q: 30, r: 30 });
  const bad = err(() => e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'port-noir', vers: 'vael', longueur: 1 }));
  assert.equal(bad.code, 'invalide');
  assert.equal(bad.champ, 'longueur');
  const r = e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'port-noir', vers: 'vael', publique: false });
  assert.equal(r.longueur, Math.max(1, distanceHex({ q: 30, r: 30 }, w.sys('vael'))));
  assert.equal(r.version, 1);
  const rev = err(() => e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'vael', vers: 'port-noir' }));
  assert.equal(rev.code, 'conflit');
  assert.equal(rev.detail, 'route_existante');
  const same = err(() => e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'vael', vers: 'vael' }));
  assert.equal(same.code, 'invalide');
  const inconnu = err(() => e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'vael', vers: 'nulle-part' }));
  assert.equal(inconnu.code, 'invalide');
  assert.equal(inconnu.champ, 'vers');
});

test('zones : secrète écrite, contour croisé / court refusés', () => {
  const w = monde();
  const z = e.dessinerZone(w.db, w.a('antor'), w.univers, w.g, { nom: 'Triangle', contour: [[2, 2], [6, 2], [4, 6]], secret: true });
  assert.equal(z.cle, 'triangle');
  assert.equal(w.q('SELECT secret FROM swn_zones WHERE cle=?', 'triangle')[0].secret, 1);
  for (const contour of [[[0, 0], [4, 4], [4, 0], [0, 4]], [[0, 0], [1, 1]], 'x', null]) {
    const x = err(() => e.dessinerZone(w.db, w.a('antor'), w.univers, w.g, { nom: 'Mauvaise', contour }));
    assert.equal(x.code, 'invalide');
    assert.equal(x.champ, 'contour');
  }
  const x = err(() => e.modifierZone(w.db, w.a('antor'), w.univers, w.g, 'triangle', { version: 1, contour: [[0, 0], [4, 4], [4, 0], [0, 4]] }));
  assert.equal(x.code, 'invalide');
  assert.equal(w.q('SELECT version FROM swn_zones WHERE cle=?', 'triangle')[0].version, 1);
});

test('Léa ne voit rien du secret : vue, panneau, trajet, recherche, bloc recoupé identique', () => {
  const w = monde();
  const lea = w.a('lea');
  const { genere } = positions(w);
  const avant = JSON.stringify(lireBlocs(w.db, lea, w.univers, w.g, R0, R1));
  const blocsAvant = JSON.stringify(lireBlocsGeneres(w.db, lea, w.univers, w.g, R0, R1));
  e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { nom: 'Port Noir', q: genere[0], r: genere[1], secret: true });
  e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'port-noir', vers: 'vael', publique: false });
  e.dessinerZone(w.db, w.a('antor'), w.univers, w.g, { nom: 'Triangle', contour: [[2, 2], [6, 2], [4, 6]], secret: true });
  assert.equal(JSON.stringify(lireBlocs(w.db, lea, w.univers, w.g, R0, R1)), avant);
  assert.equal(JSON.stringify(lireBlocsGeneres(w.db, lea, w.univers, w.g, R0, R1)), blocsAvant);
  assert.equal(e.COULEURS.length > 0, true);
  const code = (f: () => unknown) => { try { f(); } catch (x: any) { return x.code; } return 'aucune'; };
  assert.equal(code(() => lireSysteme(w.db, lea, w.univers, w.g, 'port-noir')), 'introuvable');
  assert.deepEqual(rechercherSystemes(w.db, lea, w.univers, w.g, 'Port Noir'), []);
  const t = JSON.stringify(calculerTrajet(w.db, lea, w.univers, w.g, { depart: 'port-sel', arrivee: 'vael' }));
  assert.ok(!t.includes('port-noir') && !t.includes('Port Noir'));
  const mj = JSON.stringify(lireBlocs(w.db, w.a('antor'), w.univers, w.g, R0, R1));
  assert.ok(mj.includes('Port Noir') && mj.includes('Triangle'));
});

test('lectures : version, id, secret, promu au niveau mj seulement', () => {
  const w = monde();
  const mj = lireBlocs(w.db, w.a('antor'), w.univers, w.g, R0, R1);
  for (const s of mj.systemes) assert.equal(typeof s.version, 'number');
  for (const r of mj.routes) assert.equal(typeof r.version, 'number');
  for (const z of mj.zones) assert.equal(typeof z.version, 'number');
  const pm = lireSysteme(w.db, w.a('antor'), w.univers, w.g, 'vael') as any;
  assert.equal(pm.version, 1);
  assert.equal(typeof pm.id, 'number');
  assert.equal(typeof pm.promu, 'boolean');
  assert.equal(pm.secret, false);
  const pj = JSON.stringify(lireSysteme(w.db, w.a('lea'), w.univers, w.g, 'vael'));
  for (const k of ['version', '"id"', 'promu', 'secret']) assert.ok(!pj.includes(k), k);
  const vj = JSON.stringify(lireBlocs(w.db, w.a('lea'), w.univers, w.g, R0, R1));
  assert.ok(!vj.includes('version') && !vj.includes('promu'));
  for (const s of JSON.parse(vj).systemes) assert.equal(s.version, undefined);
});

test('déplacer Vael : version +1, longueurs de la grille, version des routes +1 ; périmé → conflit', () => {
  const w = monde();
  const v0 = w.sys('vael');
  const avant = w.q('SELECT * FROM swn_routes ro WHERE depuis_id=? OR vers_id=?', v0.id, v0.id);
  assert.ok(avant.length > 0);
  const lu = v0.version;
  const nouveau = { q: v0.q + 1, r: v0.r };
  const res = e.modifierSysteme(w.db, w.a('antor'), w.univers, w.g, 'vael', { ...nouveau, version: lu });
  assert.equal(res.version, lu + 1);
  assert.equal(w.sys('vael').version, lu + 1);
  for (const ro of avant) {
    const apres = w.q('SELECT * FROM swn_routes WHERE id=?', ro.id)[0];
    const d = w.q('SELECT q,r FROM swn_systemes WHERE id=?', apres.depuis_id)[0];
    const v = w.q('SELECT q,r FROM swn_systemes WHERE id=?', apres.vers_id)[0];
    assert.equal(apres.longueur, Math.max(1, distanceHex(d, v)));
    assert.equal(apres.version, ro.version + 1);
  }
  const perime = err(() => e.modifierSysteme(w.db, w.a('mira'), w.univers, w.g, 'vael', { nom: 'Autre', version: lu }));
  assert.equal(perime.code, 'conflit');
  assert.equal(perime.detail, 'donnee_modifiee');
  assert.equal(w.sys('vael').nom, v0.nom);
  // sur une case prise
  const pris = w.sys('port-sel');
  const c = err(() => e.modifierSysteme(w.db, w.a('antor'), w.univers, w.g, 'vael', { q: pris.q, r: pris.r, version: lu + 1 }));
  assert.equal(c.detail, 'case_occupee');
  assert.equal(w.sys('vael').version, lu + 1);
  // version absente
  assert.equal(err(() => e.modifierSysteme(w.db, w.a('antor'), w.univers, w.g, 'vael', { nom: 'Z' })).champ, 'version');
});

test('périmé : route et zone, modification et retrait', () => {
  const w = monde();
  const ro = w.q('SELECT * FROM swn_routes')[0];
  const lu = ro.version;
  e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, ro.id, { publique: !ro.publique, version: lu });
  const p = err(() => e.modifierRoute(w.db, w.a('mira'), w.univers, w.g, ro.id, { publique: !!ro.publique, version: lu }));
  assert.deepEqual([p.code, p.detail], ['conflit', 'donnee_modifiee']);
  assert.equal(w.q('SELECT publique FROM swn_routes WHERE id=?', ro.id)[0].publique, ro.publique ? 0 : 1);
  assert.equal(err(() => e.retirerRoute(w.db, w.a('mira'), w.univers, w.g, ro.id, lu)).detail, 'donnee_modifiee');
  assert.equal(w.q('SELECT count(*) n FROM swn_routes WHERE id=?', ro.id)[0].n, 1);
  const z = w.q('SELECT * FROM swn_zones')[0];
  e.modifierZone(w.db, w.a('antor'), w.univers, w.g, z.cle, { nom: 'Renommée', version: z.version });
  const pz = err(() => e.modifierZone(w.db, w.a('mira'), w.univers, w.g, z.cle, { nom: 'Autre', version: z.version }));
  assert.deepEqual([pz.code, pz.detail], ['conflit', 'donnee_modifiee']);
  assert.equal(w.q('SELECT nom FROM swn_zones WHERE id=?', z.id)[0].nom, 'Renommée');
  assert.equal(err(() => e.retirerZone(w.db, w.a('mira'), w.univers, w.g, z.cle, z.version)).detail, 'donnee_modifiee');
  const s = w.sys('port-sel');
  e.modifierSysteme(w.db, w.a('antor'), w.univers, w.g, 'port-sel', { nom: 'Port-Sel II', version: s.version });
  assert.equal(err(() => e.retirerSysteme(w.db, w.a('mira'), w.univers, w.g, 'port-sel', s.version)).detail, 'donnee_modifiee');
});

test('retirer Vael efface ses routes ; retirer route / zone', () => {
  const w = monde();
  const v = w.sys('vael');
  e.retirerSysteme(w.db, w.a('antor'), w.univers, w.g, 'vael', v.version);
  assert.equal(w.sys('vael'), undefined);
  assert.equal(w.q('SELECT count(*) n FROM swn_routes WHERE depuis_id=? OR vers_id=?', v.id, v.id)[0].n, 0);
  const ro = w.q('SELECT * FROM swn_routes')[0];
  e.retirerRoute(w.db, w.a('antor'), w.univers, w.g, ro.id, ro.version);
  assert.equal(w.q('SELECT count(*) n FROM swn_routes WHERE id=?', ro.id)[0].n, 0);
  const z = w.q('SELECT * FROM swn_zones')[0];
  e.retirerZone(w.db, w.a('antor'), w.univers, w.g, z.cle, z.version);
  assert.equal(w.q('SELECT count(*) n FROM swn_zones')[0].n, 0);
  assert.equal(err(() => e.retirerSysteme(w.db, w.a('antor'), w.univers, w.g, 'vael', 1)).code, 'introuvable');
});

test('modifierRoute : depuis / vers / longueur → invalide, rien écrit', () => {
  const w = monde();
  const ro = w.q('SELECT * FROM swn_routes')[0];
  for (const k of ['depuis', 'vers', 'longueur']) {
    const x = err(() => e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, ro.id, { [k]: k === 'longueur' ? 3 : 'vael', publique: true, version: ro.version }));
    assert.equal(x.code, 'invalide', k);
    assert.equal(x.champ, k);
  }
  assert.deepEqual(w.q('SELECT * FROM swn_routes WHERE id=?', ro.id)[0], ro);
});

test('rôles : Léa, Roxane, Antor en mode Joueur refusent ; Teo et un étranger introuvables ; rien écrit', () => {
  const w = monde();
  const ro = w.q('SELECT * FROM swn_routes')[0], z = w.q('SELECT * FROM swn_zones')[0], v = w.sys('vael');
  const dump = () => JSON.stringify([w.q('SELECT * FROM swn_systemes'), w.q('SELECT * FROM swn_routes'), w.q('SELECT * FROM swn_zones')]);
  const avant = dump();
  const appels = (ac: any, u = w.univers, g = w.g): (() => unknown)[] => [
    () => e.placerSysteme(w.db, ac, u, g, { nom: 'N', q: 50, r: 50 }),
    () => e.modifierSysteme(w.db, ac, u, g, 'vael', { nom: 'N', version: v.version }),
    () => e.retirerSysteme(w.db, ac, u, g, 'vael', v.version),
    () => e.tracerRoute(w.db, ac, u, g, { depuis: 'vael', vers: 'port-sel' }),
    () => e.modifierRoute(w.db, ac, u, g, ro.id, { publique: true, version: ro.version }),
    () => e.retirerRoute(w.db, ac, u, g, ro.id, ro.version),
    () => e.dessinerZone(w.db, ac, u, g, { nom: 'N', contour: [[0, 0], [3, 0], [0, 3]] }),
    () => e.modifierZone(w.db, ac, u, g, z.cle, { nom: 'N', version: z.version }),
    () => e.retirerZone(w.db, ac, u, g, z.cle, z.version),
  ];
  for (const [u, mj, code, detail] of [['lea', false, 'refuse', undefined], ['roxane', false, 'refuse', undefined],
    ['antor', true, 'refuse', 'mode_joueur'], ['teo', false, 'introuvable', undefined]] as const) {
    appels(w.a(u, mj)).forEach((f, i) => { const x = err(f); assert.equal(x.code, code, `${u} #${i}`); assert.equal(x.detail, detail, `${u} #${i}`); });
  }
  appels(w.a('antor'), 999999).forEach((f, i) => assert.equal(err(f).code, 'introuvable', `univers #${i}`));
  appels(w.a('antor'), w.univers, 999999).forEach((f, i) => assert.equal(err(f).code, 'introuvable', `galaxie #${i}`));
  assert.equal(dump(), avant);
});

test('source : seuls les fichiers de services/swn écrivent swn_systemes, swn_routes, swn_zones', () => {
  const fichiers: string[] = [];
  const marche = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? marche(p) : fichiers.push(p); } };
  marche('src');
  const ecrit = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+swn_(systemes|routes|zones)\b/i;
  const fautifs = fichiers.filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !f.replace(/\\/g, '/').includes('services/swn/') && !f.includes('bouchon/'))
    .filter((f) => ecrit.test(readFileSync(f, 'utf8')));
  assert.deepEqual(fautifs, []);
});
