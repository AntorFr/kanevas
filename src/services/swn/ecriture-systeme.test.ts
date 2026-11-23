import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-edition-service (AD-edition-1 to 3), on a temporary database.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const E = await import('./ecriture-systeme.js');

const FS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
const FG = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const { plagesDe } = await import('../../outils/swn/regles/forme.js');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run(FS.graine, FG.densites.defaut, g);
  for (const z of FG.densites.zones) {
    db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, univers, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const mj = { compteId: cid('antor') };
  const mjJoueur = { compteId: cid('antor'), modeJoueur: true };
  const lea = { compteId: cid('lea') };
  const lire = (a: any, c = cible) => lireInterieur(db, a, univers, g, c.q, c.r);
  const ver = () => (q('SELECT version FROM swn_galaxies WHERE id=?', g)[0].version as number);
  const lignes = () => ({
    a: q('SELECT * FROM swn_astres ORDER BY id'), f: q('SELECT * FROM swn_formations ORDER BY id'), s: q('SELECT * FROM swn_systemes ORDER BY id'),
  });
  return { db, q, univers, g, mj, mjJoueur, lea, lire, ver, lignes };
}
const cible = FS.systemes[0].entree as { q: number; r: number };
const erreur = (f: () => unknown): any => { try { f(); } catch (e) { return e; } assert.fail('aucune erreur'); };
type W = ReturnType<typeof monde>;
const ancrer = (w: W, c = cible) => E.ancrer(w.db, w.mj, w.univers, w.g, c.q, c.r, { versionSysteme: w.ver() });
const AS = (w: W) => [w.db, w.mj, w.univers, w.g, cible.q, cible.r] as const;

test('ancrer : lignes égales à la réponse de tirer_systeme, voisins inchangés', () => {
  const w = monde();
  const avant = w.lire(w.mj);
  const voisins = FS.systemes.slice(1).map((s: any) => w.lire(w.mj, s.entree));
  const r = ancrer(w);
  assert.equal(r.interieur.etat, 'defini');
  assert.equal(r.interieur.nom, `Système (${cible.q}, ${cible.r})`);
  const att = FS.systemes[0].sortie;
  const { a, f } = w.lignes();
  assert.equal(a.length, att.astres.length); assert.equal(f.length, att.formations.length);
  for (const e of att.astres) {
    const x = a.find((y: any) => y.cle === e.cle);
    assert.ok(x, e.cle);
    assert.equal(x.version, 1);
    for (const k of ['genre', 'etoile_rang', 'type', 'nom']) assert.equal(x[k], e[k], k);
    for (const k of ['orbite', 'heure', 'taille']) {
      if (e[k] === null) assert.equal(x[k], null); else assert.ok(Math.abs(x[k] - e[k]) < 1e-9, `${e.cle}.${k}`);
    }
  }
  // same bodies as the read before anchoring
  const strip = (v: any) => v.astres.map((x: any) => [x.cle, x.genre, x.parent_cle, x.orbite, x.heure, x.taille, x.type, JSON.stringify(x.aspect)]);
  assert.deepEqual(strip(r.interieur), strip(avant));
  assert.deepEqual(r.interieur.formations.map((z: any) => [z.cle, z.parametres]), avant.formations.map((z: any) => [z.cle, z.parametres]));
  // neighbours' draw is unchanged
  for (const [i, s] of FS.systemes.slice(1).entries()) {
    const apres = w.lire(w.mj, s.entree);
    assert.deepEqual(apres.astres, voisins[i].astres, `voisin ${i}`);
    assert.equal(apres.etat, voisins[i].etat);
  }
  assert.deepEqual(w.lire(w.lea).astres.map((x: any) => x.cle), avant.astres.map((x: any) => x.cle));
  // idempotent on a defined system
  const deux = E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, {});
  assert.equal(w.lignes().a.length, a.length);
  assert.deepEqual(deux.interieur, r.interieur);
});

test('une écriture ancre dans la même transaction ; un refus ne laisse rien, ancrage compris', () => {
  const w = monde();
  const vide = w.lignes();
  for (const [champ, entree, code] of [
    ['orbite -1', { orbite: -1 }, 'orbite_invalide'],
    ['heure 12', { heure: 12 }, 'orbite_invalide'],
  ] as const) {
    const e = erreur(() => E.ajouterAstre(...AS(w), { genre: 'planete', versionSysteme: w.ver(), ...entree }));
    assert.equal(e.code, 'invalide', champ); assert.equal(e.detail, code, champ);
    assert.deepEqual(w.lignes(), vide, champ);
  }
  const ok = E.ajouterAstre(...AS(w), { genre: 'planete', nom: 'Neuve', orbite: 3, heure: 4, versionSysteme: w.ver() });
  assert.equal(ok.interieur.etat, 'defini');
  assert.equal(w.lignes().s.length, 1);
  const n = ok.interieur.astres.find((x: any) => x.cle === ok.cle)!;
  assert.deepEqual([n.nom, n.orbite, n.heure, n.version], ['Neuve', 3, 4, 1]);
  assert.equal(w.lignes().a.length, FS.systemes[0].sortie.astres.length + 1);
});

test('cle inconnue : astre_inconnu, sans ancrage', () => {
  const w = monde();
  const vide = w.lignes();
  for (const f of [
    () => E.modifierAstre(...AS(w), 'nope', { version: 1, nom: 'x', versionSysteme: w.ver() }),
    () => E.retirerAstre(...AS(w), 'nope', { version: 1, versionSysteme: w.ver() }),
    () => E.modifierZone(...AS(w), 'nope', { version: 1, nom: 'x', versionSysteme: w.ver() }),
    () => E.retirerZone(...AS(w), 'nope', { version: 1, versionSysteme: w.ver() }),
    () => E.ajouterAstre(...AS(w), { genre: 'lune', parent_cle: 'nope', versionSysteme: w.ver() }),
    () => E.ajouterAstre(...AS(w), { genre: 'planete', etoile_rang: 9, versionSysteme: w.ver() }),
  ]) { const e = erreur(f); assert.equal(e.code, 'introuvable'); assert.equal(e.detail, 'astre_inconnu'); }
  assert.deepEqual(w.lignes(), vide);
});

test('a_change : même version deux fois, graine changée entre lecture et écriture', () => {
  const w = monde();
  ancrer(w);
  const v = w.lire(w.mj);
  const p = v.astres.find((x: any) => x.genre === 'planete')!;
  assert.equal(v.peutEcrire, true);
  E.modifierAstre(...AS(w), p.cle, { version: p.version, nom: 'A' });
  const e = erreur(() => E.modifierAstre(...AS(w), p.cle, { version: p.version, nom: 'B' }));
  assert.deepEqual([e.code, e.detail], ['conflit', 'a_change']);
  assert.equal(w.lire(w.mj).astres.find((x: any) => x.cle === p.cle)!.nom, 'A');
  assert.equal(w.lire(w.mj).astres.find((x: any) => x.cle === p.cle)!.version, 2);

  const w2 = monde();
  const jeton = w2.lire(w2.mj).versionSysteme;
  w2.db.prepare('UPDATE swn_galaxies SET graine = ?, version = version + 1 WHERE id = ?').run('autre', w2.g);
  const vide = w2.lignes();
  for (const f of [
    () => E.ajouterAstre(...AS(w2), { genre: 'comete', versionSysteme: jeton }),
    () => E.ancrer(w2.db, w2.mj, w2.univers, w2.g, cible.q, cible.r, { versionSysteme: jeton }),
    () => E.poserTransition(...AS(w2), { transition: 5, versionSysteme: jeton }),
  ]) { const e2 = erreur(f); assert.deepEqual([e2.code, e2.detail], ['conflit', 'a_change']); }
  assert.deepEqual(w2.lignes(), vide);
});

test('jeton absent ou invalide sur un système tiré : invalide, rien écrit', () => {
  const w = monde();
  const vide = w.lignes();
  assert.equal(erreur(() => E.ajouterAstre(...AS(w), { genre: 'comete' })).code, 'invalide');
  assert.equal(erreur(() => E.ajouterAstre(...AS(w), { genre: 'comete', versionSysteme: 'x' })).code, 'invalide');
  assert.deepEqual(w.lignes(), vide);
});

test('garde : joueuse et MJ en mode joueur refuse, système masqué introuvable comme la lecture', () => {
  const w = monde();
  const vide = w.lignes();
  const gestes = (a: any) => [
    () => E.ancrer(w.db, a, w.univers, w.g, cible.q, cible.r, { versionSysteme: w.ver() }),
    () => E.ajouterAstre(w.db, a, w.univers, w.g, cible.q, cible.r, { genre: 'comete', versionSysteme: w.ver() }),
    () => E.ajouterZone(w.db, a, w.univers, w.g, cible.q, cible.r, { forme: 'anneau', versionSysteme: w.ver() }),
    () => E.modifierAstre(w.db, a, w.univers, w.g, cible.q, cible.r, 'x', { version: 1 }),
    () => E.modifierZone(w.db, a, w.univers, w.g, cible.q, cible.r, 'x', { version: 1 }),
    () => E.retirerAstre(w.db, a, w.univers, w.g, cible.q, cible.r, 'x', { version: 1 }),
    () => E.retirerZone(w.db, a, w.univers, w.g, cible.q, cible.r, 'x', { version: 1 }),
    () => E.poserTransition(w.db, a, w.univers, w.g, cible.q, cible.r, { transition: 3 }),
  ];
  for (const a of [w.lea, w.mjJoueur]) for (const f of gestes(a)) assert.equal(erreur(f).code, 'refuse');
  assert.deepEqual(w.lignes(), vide);
  // no peutEcrire / version / versionSysteme for them
  for (const a of [w.lea, w.mjJoueur]) {
    const v: any = w.lire(a);
    assert.equal(v.peutEcrire, undefined); assert.equal(v.versionSysteme, undefined);
    assert.ok(v.astres.every((x: any) => x.version === undefined));
  }
  // hidden system: same body as the read
  ancrer(w);
  w.db.prepare('UPDATE swn_systemes SET secret = 1').run();
  const lecture = erreur(() => w.lire(w.lea));
  const ecriture = erreur(() => E.modifierAstre(w.db, w.lea, w.univers, w.g, cible.q, cible.r, 'x', { version: 1 }));
  assert.deepEqual([ecriture.code, ecriture.message], [lecture.code, lecture.message]);
  assert.equal(lecture.code, 'introuvable');
  // unknown / foreign account
  assert.equal(erreur(() => E.ancrer(w.db, { compteId: 99999 }, w.univers, w.g, cible.q, cible.r, {})).code, 'introuvable');
  // a hex with no star
  assert.equal(erreur(() => E.ancrer(w.db, w.mj, w.univers, w.g, 0.5 as any, 1, { versionSysteme: w.ver() })).code, 'introuvable');
  assert.equal(erreur(() => E.ancrer(w.db, w.mj, w.univers, w.g, cible.q + 1000, cible.r, { versionSysteme: w.ver() })).code, 'introuvable');
});

test('lune : suit sa planète ; retirer une planète retire ses lunes et les compte ; lune plan/galactique invalide', () => {
  const w = monde();
  ancrer(w);
  const p = E.ajouterAstre(...AS(w), { genre: 'planete', nom: 'Mère', orbite: 2, heure: 3 });
  const l1 = E.ajouterAstre(...AS(w), { genre: 'lune', parent_cle: p.cle, nom: 'L1', heure: 1, orbite: 0.3 });
  const l2 = E.ajouterAstre(...AS(w), { genre: 'lune', parent_cle: p.cle, nom: 'L2' });
  const lu = (c: string) => w.lire(w.mj).astres.find((x: any) => x.cle === c)!;
  assert.equal(lu(l1.cle!).parent_cle, p.cle);
  const avant = [lu(l1.cle!).orbite, lu(l1.cle!).heure];
  const m = E.modifierAstre(...AS(w), p.cle!, { version: lu(p.cle!).version, orbite: 7, heure: 9 });
  assert.deepEqual([lu(l1.cle!).orbite, lu(l1.cle!).heure], avant);
  assert.equal(lu(l1.cle!).parent_cle, p.cle);
  assert.equal(m.interieur.astres.find((x: any) => x.cle === p.cle)!.orbite, 7);
  const vide = w.lignes();
  for (const [k, v, champ] of [['plan', { x: 1, y: 1 }, 'plan'], ['galactique', { q: 1, r: 1 }, 'galactique']] as const) {
    const e = erreur(() => E.modifierAstre(...AS(w), l1.cle!, { version: 1, [k]: v }));
    assert.deepEqual([e.code, e.champ], ['invalide', champ]);
    const e2 = erreur(() => E.ajouterAstre(...AS(w), { genre: 'lune', parent_cle: p.cle, [k]: v }));
    assert.deepEqual([e2.code, e2.champ], ['invalide', champ]);
  }
  assert.deepEqual(w.lignes(), vide);
  // a moon cannot be re-parented, nor a moon of a moon
  assert.equal(erreur(() => E.modifierAstre(...AS(w), l1.cle!, { version: 1, parent_cle: 'x' })).code, 'invalide');
  assert.equal(erreur(() => E.ajouterAstre(...AS(w), { genre: 'lune', parent_cle: l1.cle! })).detail, 'astre_inconnu');
  const n = w.lignes().a.length;
  const r = E.retirerAstre(...AS(w), p.cle!, { version: lu(p.cle!).version });
  assert.equal(r.lunesRetirees, 2); assert.equal(r.retires, 3);
  assert.equal(w.lignes().a.length, n - 3);
  assert.ok(!r.interieur.astres.some((x: any) => [p.cle, l1.cle, l2.cle].includes(x.cle)));
  // keys never reused
  const nv = E.ajouterAstre(...AS(w), { genre: 'planete', nom: 'Mère' });
  assert.notEqual(nv.cle, p.cle);
});

test("l'étoile principale ne se retire pas ; une compagne non plus ; une étoile ne s'ajoute pas", () => {
  const w = monde();
  const v = w.lire(w.mj);
  const e0 = v.astres.find((x: any) => x.genre === 'etoile' && x.etoile_rang === 0)!;
  const vide = w.lignes();
  const e = erreur(() => E.retirerAstre(...AS(w), e0.cle, { version: 1, versionSysteme: v.versionSysteme }));
  assert.deepEqual([e.code, e.detail], ['refuse', 'etoile_principale']);
  assert.equal(erreur(() => E.ajouterAstre(...AS(w), { genre: 'etoile', versionSysteme: v.versionSysteme })).champ, 'genre');
  assert.deepEqual(w.lignes(), vide);
  // an unknown type for the genre, a bad size, an aspect with an unknown key
  for (const entree of [{ type: 'nope' }, { taille: 0 }, { taille: 101 }, { nom: 'x'.repeat(81) }, { description: 'x'.repeat(2001) },
    { aspect: { cleinconnue: 1 } }, { aspect: 'x' }, { aspect: { a: 'x'.repeat(5000) } }, { orbite: 1001 }, { orbite: NaN }, { heure: -0.1 }]) {
    const x = erreur(() => E.ajouterAstre(...AS(w), { genre: 'planete', versionSysteme: v.versionSysteme, ...entree }));
    assert.equal(x.code, 'invalide', JSON.stringify(entree).slice(0, 40));
  }
  assert.deepEqual(w.lignes(), vide);
  // a star is edited like any body
  const m = E.modifierAstre(...AS(w), e0.cle, { version: 1, nom: 'Soleil', versionSysteme: v.versionSysteme });
  assert.equal(m.interieur.astres.find((x: any) => x.cle === e0.cle)!.nom, 'Soleil');
});

test('trois formes de position du même point sont stockées identiques ; deux formes invalides', () => {
  const w = monde();
  ancrer(w);
  const base = E.ajouterAstre(...AS(w), { genre: 'planete', orbite: 4, heure: 7 });
  const b = w.lire(w.mj).astres.find((x: any) => x.cle === base.cle)!;
  // Plan: 12 at the top, hours clockwise: x = o sin(h·π/6), y = o cos(h·π/6)
  const ang = (7 * Math.PI) / 6;
  const plan = { x: 4 * Math.sin(ang), y: -4 * Math.cos(ang) };
  const p = E.ajouterAstre(...AS(w), { genre: 'planete', plan });
  const pv = p.interieur.astres.find((x: any) => x.cle === p.cle)!;
  assert.ok(Math.abs(pv.orbite! - b.orbite!) < 0.011, `plan ${pv.orbite}`);
  assert.ok(Math.abs(pv.heure - b.heure) < 0.011, `plan ${pv.heure}`);
  // Galactic: the point of the plan, via the transition radius, same stored values as the plan form for the same point
  const rayon = w.lire(w.mj).transition;
  const q0 = cible.q, r0 = cible.r;
  const g1 = E.ajouterAstre(...AS(w), { genre: 'planete', galactique: { q: q0, r: r0 } });
  const gv = g1.interieur.astres.find((x: any) => x.cle === g1.cle)!;
  assert.equal(gv.orbite, 0);
  assert.ok(rayon > 0);
  const g2 = E.ajouterAstre(...AS(w), { genre: 'planete', galactique: { q: q0 + 1, r: r0 } });
  const gv2 = g2.interieur.astres.find((x: any) => x.cle === g2.cle)!;
  assert.ok(Math.abs(gv2.orbite! - rayon) < 0.011, `rayon ${gv2.orbite} vs ${rayon}`);
  const plan2 = E.ajouterAstre(...AS(w), { genre: 'planete', plan: { x: gv2.orbite! * Math.sin((gv2.heure * Math.PI) / 6), y: -gv2.orbite! * Math.cos((gv2.heure * Math.PI) / 6) } });
  const pv2 = plan2.interieur.astres.find((x: any) => x.cle === plan2.cle)!;
  const o2 = E.ajouterAstre(...AS(w), { genre: 'planete', orbite: gv2.orbite!, heure: gv2.heure });
  const ov2 = o2.interieur.astres.find((x: any) => x.cle === o2.cle)!;
  assert.deepEqual([pv2.orbite, pv2.heure], [ov2.orbite, ov2.heure]);
  assert.deepEqual([gv2.orbite, gv2.heure], [ov2.orbite, ov2.heure]);
  // Two forms / half pairs
  const vide = w.lignes();
  for (const e of [{ plan: { x: 1, y: 1 }, orbite: 2 }, { galactique: { q: 1, r: 1 }, plan: { x: 1, y: 1 } }, { galactique: { q: 1, r: 1 }, heure: 2 },
    { plan: { x: 1 } }, { galactique: { q: 1 } }, { plan: { x: 1, y: 1, z: 2 } }, { plan: { x: 'a', y: 1 } }, { plan: null }]) {
    const x = erreur(() => E.ajouterAstre(...AS(w), { genre: 'planete', ...e }));
    assert.equal(x.code, 'invalide', JSON.stringify(e));
  }
  assert.deepEqual(w.lignes(), vide);
  // Far points: plan beyond 1000 is orbite_invalide
  const far = erreur(() => E.ajouterAstre(...AS(w), { genre: 'planete', plan: { x: 2000, y: 0 } }));
  assert.equal(far.detail, 'orbite_invalide');
});

test('zones : ajout, modification, retrait, bornes ; transition', () => {
  const w = monde();
  const v0 = w.lire(w.mj);
  const z = E.ajouterZone(...AS(w), { forme: 'anneau', nom: 'Anneau', parametres: { de: 3, a: 3.5 }, versionSysteme: v0.versionSysteme });
  const zv = () => w.lire(w.mj).formations.find((f: any) => f.cle === z.cle)!;
  assert.deepEqual([zv().nom, zv().parametres, zv().version], ['Anneau', { de: 3, a: 3.5 }, 1]);
  const vide = w.lignes();
  for (const p of [{ de: 5, a: 4 }, { de: -1, a: 2 }, { de: 1, a: 2, zzz: 1 }]) {
    assert.equal(erreur(() => E.modifierZone(...AS(w), z.cle!, { version: 1, parametres: p })).code, 'invalide');
  }
  assert.equal(erreur(() => E.ajouterZone(...AS(w), { forme: 'cube' })).champ, 'forme');
  assert.equal(erreur(() => E.modifierZone(...AS(w), z.cle!, { version: 1, forme: 'nuage' })).champ, 'forme');
  assert.deepEqual(w.lignes(), vide);
  E.modifierZone(...AS(w), z.cle!, { version: 1, parametres: { de: 3, a: 4 }, nom: null });
  assert.deepEqual([zv().parametres, zv().nom, zv().version], [{ de: 3, a: 4 }, null, 2]);
  assert.equal(erreur(() => E.retirerZone(...AS(w), z.cle!, { version: 1 })).detail, 'a_change');
  E.retirerZone(...AS(w), z.cle!, { version: 2 });
  assert.equal(w.lire(w.mj).formations.find((f: any) => f.cle === z.cle), undefined);
  const n = E.ajouterZone(...AS(w), { forme: 'nuage' });
  assert.ok(w.lire(w.mj).formations.some((f: any) => f.cle === n.cle));
  // transition
  const t = E.poserTransition(...AS(w), { transition: 7, versionSysteme: w.lire(w.mj).versionSysteme });
  assert.equal(t.interieur.transition, 7);
  assert.equal(erreur(() => E.poserTransition(...AS(w), { transition: 7, versionSysteme: 1 })).detail, 'a_change');
  for (const bad of [-1, 1001, 'x', undefined]) assert.equal(erreur(() => E.poserTransition(...AS(w), { transition: bad, versionSysteme: t.interieur.versionSysteme })).code, 'invalide');
  const def = E.poserTransition(...AS(w), { transition: null, versionSysteme: t.interieur.versionSysteme });
  assert.notEqual(def.interieur.transition, 7);
});

test('balayage des sources : seul ecriture-systeme.ts écrit swn_astres / swn_formations', () => {
  const racine = fileURLToPath(new URL('../../', import.meta.url));
  const motif = /(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+swn_(astres|formations)\b/i;
  const fautifs: string[] = [];
  const marche = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { marche(p); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(n) || /\.test\.tsx?$/.test(n) || p.endsWith(join('swn', 'ecriture-systeme.ts'))) continue;
      if (motif.test(readFileSync(p, 'utf8'))) fautifs.push(p.slice(racine.length));
    }
  };
  marche(racine);
  assert.deepEqual(fautifs, []);
});
