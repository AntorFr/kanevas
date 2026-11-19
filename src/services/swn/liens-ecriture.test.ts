import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-liens-service (AD-liens-1, AD-liens-2), on a temporary database.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const E = await import('./ecriture-systeme.js');
const { renommerFiche, supprimerFiche } = await import('../fiches.js');

const FS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
const FG = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const { plagesDe } = await import('../../outils/swn/regles/forme.js');
const cible = FS.systemes[0].entree as { q: number; r: number };

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
  const fiche = (titre: string) => q('SELECT id FROM fiches WHERE titre = ? AND univers_id = ?', titre, univers)[0].id as number;
  const mj = { compteId: cid('antor') };
  const lea = { compteId: cid('lea') };
  const mjJoueur = { compteId: cid('antor'), modeJoueur: true };
  const ver = () => q('SELECT version FROM swn_galaxies WHERE id=?', g)[0].version as number;
  const lire = (a: any) => lireInterieur(db, a, univers, g, cible.q, cible.r) as any;
  const AS = [db, mj, univers, g, cible.q, cible.r] as const;
  return { db, q, univers, g, mj, lea, mjJoueur, ver, lire, AS, fiche, lisible: fiche('Étoile du soir'), cachee: fiche('Aube de Sel') };
}
type W = ReturnType<typeof monde>;
const erreur = (f: () => unknown): any => { try { f(); } catch (e) { return e; } assert.fail('aucune erreur'); };
const planete = (v: any) => v.astres.find((x: any) => x.genre === 'planete');
const nbSystemes = (w: W) => (w.q('SELECT count(*) n FROM swn_systemes')[0].n as number);

test('lier une planète d\'un système tiré l\'ancre dans la même transaction ; lecture {id, titre}', () => {
  const w = monde();
  assert.equal(nbSystemes(w), 0);
  const p = planete(w.lire(w.mj));
  const r = E.lierAstre(...w.AS, p.cle, { ficheId: w.lisible, version: 1, versionSysteme: w.ver() });
  assert.equal(nbSystemes(w), 1);
  assert.equal(r.interieur.etat, 'defini');
  assert.deepEqual(planete(r.interieur).fiche, { id: w.lisible, titre: 'Étoile du soir' });
  assert.equal(planete(r.interieur).version, 2);
  assert.deepEqual(Object.keys(planete(r.interieur)).filter((k) => /fiche/.test(k)), ['fiche']);
});

test('fiche_inconnue : id inconnu, d\'un autre univers, supprimée, non entier — rien écrit, pas même l\'ancrage', () => {
  const w = monde();
  const p = planete(w.lire(w.mj));
  const autre = w.db.prepare("INSERT INTO univers (nom, cree_le) VALUES ('Autre', 1)").run().lastInsertRowid as number;
  const fa = w.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', 'Etrangère', '{}', 1, 1)").run(autre).lastInsertRowid as number;
  for (const ficheId of [999999, fa, 0, -1, 1.5, '1', null, undefined, NaN]) {
    const e = erreur(() => E.lierAstre(...w.AS, p.cle, { ficheId, version: 1, versionSysteme: w.ver() }));
    assert.deepEqual([e.code, e.champ, e.detail], ['invalide', 'ficheId', 'fiche_inconnue'], String(ficheId));
  }
  assert.equal(nbSystemes(w), 0);
  // deleted meanwhile
  const f = w.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', 'Éphémère', '{}', 1, 1)").run(w.univers).lastInsertRowid as number;
  supprimerFiche(w.db, w.mj, w.univers, f);
  assert.equal(erreur(() => E.lierAstre(...w.AS, p.cle, { ficheId: f, version: 1, versionSysteme: w.ver() })).detail, 'fiche_inconnue');
  // same for a zone
  const z = E.ajouterZone(...w.AS, { forme: 'nuage', versionSysteme: w.ver() });
  assert.equal(erreur(() => E.lierZone(...w.AS, z.cle!, { ficheId: fa, version: 1 })).detail, 'fiche_inconnue');
  assert.equal(w.q('SELECT count(*) n FROM swn_astres WHERE fiche_id IS NOT NULL')[0].n, 0);
  assert.equal(w.q('SELECT count(*) n FROM swn_formations WHERE fiche_id IS NOT NULL')[0].n, 0);
});

test('garde : joueuse et MJ en mode joueur refuse sur les quatre fonctions, rien écrit', () => {
  const w = monde();
  const avant = JSON.stringify([w.q('SELECT * FROM swn_astres'), w.q('SELECT * FROM swn_formations'), w.q('SELECT * FROM swn_systemes')]);
  for (const a of [w.lea, w.mjJoueur]) {
    for (const f of [
      () => E.lierAstre(w.db, a, w.univers, w.g, cible.q, cible.r, 'x', { ficheId: w.lisible, version: 1, versionSysteme: w.ver() }),
      () => E.lierZone(w.db, a, w.univers, w.g, cible.q, cible.r, 'x', { ficheId: w.lisible, version: 1, versionSysteme: w.ver() }),
      () => E.delierAstre(w.db, a, w.univers, w.g, cible.q, cible.r, 'x', { version: 1, versionSysteme: w.ver() }),
      () => E.delierZone(w.db, a, w.univers, w.g, cible.q, cible.r, 'x', { version: 1, versionSysteme: w.ver() }),
    ]) assert.equal(erreur(f).code, 'refuse');
  }
  assert.equal(JSON.stringify([w.q('SELECT * FROM swn_astres'), w.q('SELECT * FROM swn_formations'), w.q('SELECT * FROM swn_systemes')]), avant);
});

test('a_change : deux écritures de même version, lier comme délier, corps et zone', () => {
  const w = monde();
  const p = planete(w.lire(w.mj));
  E.lierAstre(...w.AS, p.cle, { ficheId: w.lisible, version: 1, versionSysteme: w.ver() });
  const vide = (f: () => unknown) => { const e = erreur(f); assert.deepEqual([e.code, e.detail], ['conflit', 'a_change']); };
  vide(() => E.lierAstre(...w.AS, p.cle, { ficheId: w.cachee, version: 1 }));
  vide(() => E.delierAstre(...w.AS, p.cle, { version: 1 }));
  assert.equal(planete(w.lire(w.mj)).fiche.id, w.lisible);
  const z = E.ajouterZone(...w.AS, { forme: 'nuage' });
  E.lierZone(...w.AS, z.cle!, { ficheId: w.lisible, version: 1 });
  vide(() => E.lierZone(...w.AS, z.cle!, { ficheId: w.cachee, version: 1 }));
  vide(() => E.delierZone(...w.AS, z.cle!, { version: 1 }));
  for (const bad of [undefined, 'x', 0, 1.5]) {
    assert.equal(erreur(() => E.delierAstre(...w.AS, p.cle, { version: bad as any })).code, 'invalide');
  }
  // an unknown key
  assert.equal(erreur(() => E.lierAstre(...w.AS, 'nope', { ficheId: w.lisible, version: 1 })).detail, 'astre_inconnu');
  assert.equal(erreur(() => E.delierZone(...w.AS, 'nope', { version: 1 })).detail, 'astre_inconnu');
});

test('remplacer, délier, plusieurs corps sur une fiche, zone liée', () => {
  const w = monde();
  const v = w.lire(w.mj);
  const [p, e] = [planete(v), v.astres.find((x: any) => x.genre === 'etoile')];
  E.lierAstre(...w.AS, p.cle, { ficheId: w.lisible, version: 1, versionSysteme: w.ver() });
  E.lierAstre(...w.AS, e.cle, { ficheId: w.lisible, version: 1 });
  let l = w.lire(w.mj);
  assert.equal(l.astres.filter((x: any) => x.fiche?.id === w.lisible).length, 2);
  E.lierAstre(...w.AS, p.cle, { ficheId: w.cachee, version: 2 });
  l = w.lire(w.mj);
  assert.deepEqual(planete(l).fiche, { id: w.cachee, titre: 'Aube de Sel' }); // the GM reads every sheet
  E.delierAstre(...w.AS, p.cle, { version: 3 });
  assert.equal(planete(w.lire(w.mj)).fiche, null);
  assert.equal(w.q('SELECT fiche_id FROM swn_astres WHERE cle = ?', p.cle)[0].fiche_id, null);
  const z = E.ajouterZone(...w.AS, { forme: 'anneau' });
  E.lierZone(...w.AS, z.cle!, { ficheId: w.lisible, version: 1 });
  assert.deepEqual(w.lire(w.mj).formations.find((f: any) => f.cle === z.cle).fiche, { id: w.lisible, titre: 'Étoile du soir' });
  E.delierZone(...w.AS, z.cle!, { version: 2 });
  assert.equal(w.lire(w.mj).formations.find((f: any) => f.cle === z.cle).fiche, null);
  // delier on an unlinked body is not an error
  E.delierZone(...w.AS, z.cle!, { version: 3 });
});

test('Léa : fiche non lisible = JSON d\'un corps non lié ; lisible = {id, titre}, renommage visible', () => {
  const w = monde();
  const p = planete(w.lire(w.mj));
  const nu = JSON.stringify(planete(w.lire(w.lea)));
  E.lierAstre(...w.AS, p.cle, { ficheId: w.cachee, version: 1, versionSysteme: w.ver() });
  const z = E.ajouterZone(...w.AS, { forme: 'nuage' });
  const znu = JSON.stringify(w.lire(w.lea).formations.find((f: any) => f.cle === z.cle));
  E.lierZone(...w.AS, z.cle!, { ficheId: w.cachee, version: 1 });
  const cache = w.lire(w.lea);
  assert.equal(JSON.stringify(planete(cache)), nu);
  assert.equal(planete(cache).fiche, null);
  assert.equal(JSON.stringify(cache.formations.find((f: any) => f.cle === z.cle)), znu);
  assert.ok(!JSON.stringify(cache).includes('Aube'));
  assert.ok(!JSON.stringify(w.lire(w.mjJoueur)).includes('Aube'));
  E.lierAstre(...w.AS, p.cle, { ficheId: w.lisible, version: 2 });
  assert.deepEqual(planete(w.lire(w.lea)).fiche, { id: w.lisible, titre: 'Étoile du soir' });
  assert.deepEqual(planete(w.lire(w.mjJoueur)).fiche, { id: w.lisible, titre: 'Étoile du soir' });
  assert.equal(Object.keys(planete(w.lire(w.lea)).fiche).sort().join(), 'id,titre');
  renommerFiche(w.db, w.mj, w.univers, w.lisible, 'Étoile renommée');
  assert.equal(planete(w.lire(w.lea)).fiche.titre, 'Étoile renommée');
  assert.ok(!/fiche_id/.test(JSON.stringify(w.lire(w.mj))));
});

test('supprimer la fiche liée laisse le corps, fiche: null, sans erreur', () => {
  const w = monde();
  const p = planete(w.lire(w.mj));
  const f = w.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', 'Éphémère', '{}', 1, 1)").run(w.univers).lastInsertRowid as number;
  E.lierAstre(...w.AS, p.cle, { ficheId: f, version: 1, versionSysteme: w.ver() });
  const z = E.ajouterZone(...w.AS, { forme: 'nuage' });
  E.lierZone(...w.AS, z.cle!, { ficheId: f, version: 1 });
  const n = w.lire(w.mj).astres.length;
  supprimerFiche(w.db, w.mj, w.univers, f);
  const l = w.lire(w.mj);
  assert.equal(l.astres.length, n);
  assert.equal(planete(l).fiche, null);
  assert.equal(l.formations.find((x: any) => x.cle === z.cle).fiche, null);
});
