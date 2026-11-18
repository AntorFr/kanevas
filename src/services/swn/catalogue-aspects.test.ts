import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-reglages-aspects: the catalogue of aspects of a galaxy is overridden per type
// through catalogue-aspects.ts alone, and every body of the interior carries its effective aspect.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const C = await import('./catalogue-aspects.js');
const R = await import('./reglages.js');
const E = await import('./ecriture-systeme.js');

const lire = (n: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../rust/modules/coeur/tests/fixtures/${n}`, import.meta.url)), 'utf8'));
const FS = lire('generation-systemes.json');
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
  db.prepare('UPDATE swn_galaxies SET graine=? WHERE id=?').run(FS.graine, g);
  const mj = { compteId: cid('antor') };
  const mjJoueur = { compteId: cid('antor'), modeJoueur: true };
  const lea = { compteId: cid('lea') };
  const ver = () => q('SELECT version FROM swn_galaxies WHERE id=?', g)[0].version as number;
  const interieur = (acteur: any = mj) => lireInterieur(db, acteur, univers, g, cible.q, cible.r) as any;
  return { db, q, univers, g, mj, mjJoueur, lea, ver, interieur };
}
const erreur = (f: () => unknown): any => { try { f(); } catch (e) { return e; } assert.fail('aucune erreur'); };
const pose = (w: ReturnType<typeof monde>, type: string, parametres: unknown, version = 0, acteur: any = w.mj) =>
  C.poserAspect(w.db, acteur, w.univers, w.g, type, { version, parametres });

test('palette d’un type : tous les astres du type (tirés et définis) la rendent, lignes et positions intactes', () => {
  const w = monde();
  const tire = w.interieur();
  assert.equal(tire.etat, 'tire');
  const typeCible = tire.astres.find((a: any) => a.genre === 'planete').type as string;
  const autres = tire.astres.filter((a: any) => a.type !== typeCible);
  const positionsTire = tire.astres.map((a: any) => [a.type, a.orbite, a.heure, a.taille]);

  const v = pose(w, typeCible, { palette: ['#112233', '#445566', '#778899'] });
  assert.equal(v, 1);
  const apres = w.interieur();
  const memes = apres.astres.filter((a: any) => a.type === typeCible);
  assert.ok(memes.length > 0);
  for (const a of memes) assert.deepEqual(a.aspect.palette, ['#112233', '#445566', '#778899']);
  for (const a of apres.astres.filter((x: any) => x.type !== typeCible)) {
    assert.equal(JSON.stringify(a.aspect).includes('#112233'), false, 'les autres types ne bougent pas');
  }
  assert.ok(autres.length >= 0);
  assert.deepEqual(apres.astres.map((a: any) => [a.type, a.orbite, a.heure, a.taille]), positionsTire, 'rien ne bouge');

  // Defined: rows frozen, picture follows the catalogue.
  E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, { versionSysteme: w.ver() });
  const lignes = () => ({ a: w.q('SELECT * FROM swn_astres ORDER BY id'), f: w.q('SELECT * FROM swn_formations ORDER BY id'), s: w.q('SELECT * FROM swn_systemes ORDER BY id') });
  const avantLignes = lignes();
  const defini = w.interieur();
  assert.equal(defini.etat, 'defini');
  for (const a of defini.astres.filter((x: any) => x.type === typeCible)) assert.deepEqual(a.aspect.palette, ['#112233', '#445566', '#778899']);
  const versionGalaxie = w.ver();
  assert.equal(pose(w, typeCible, { palette: ['#aabbcc', '#445566', '#778899'] }, 1), 2);
  assert.equal(w.ver(), versionGalaxie, 'la version de la galaxie ne bouge pas');
  assert.deepEqual(lignes(), avantLignes, 'aucune ligne d’astre ne change');
  for (const a of w.interieur().astres.filter((x: any) => x.type === typeCible)) assert.equal(a.aspect.palette[0], '#aabbcc');
});

test('un paramètre propre au corps l’emporte sur la surcharge ; « Revenir au défaut » supprime la ligne', () => {
  const w = monde();
  E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, { versionSysteme: w.ver() });
  const defini = w.interieur();
  const astre = defini.astres.find((a: any) => a.genre === 'planete');
  const type = astre.type as string;
  const avant = JSON.parse(w.q('SELECT aspect FROM swn_astres WHERE cle=?', astre.cle)[0].aspect);
  pose(w, type, { palette: ['#010203', '#040506', '#070809'] });
  const propre = w.interieur().astres.find((a: any) => a.cle === astre.cle).aspect;
  // what the row sets itself is still what the row says
  for (const [k, v] of Object.entries(avant)) if (k !== 'palette') assert.deepEqual(propre[k], v);
  // body's own palette wins
  const info = w.q('SELECT version FROM swn_astres WHERE cle=?', astre.cle)[0];
  E.modifierAstre(w.db, w.mj, w.univers, w.g, cible.q, cible.r, astre.cle,
    { version: info.version, aspect: { ...avant, palette: ['#ffffff', '#eeeeee', '#dddddd'] }, versionSysteme: w.q('SELECT version FROM swn_systemes')[0].version } as any);
  assert.deepEqual(w.interieur().astres.find((a: any) => a.cle === astre.cle).aspect.palette, ['#ffffff', '#eeeeee', '#dddddd']);

  // Revert: row gone, version 0, the surcharge no longer shows.
  assert.equal(pose(w, type, null, 1), 0);
  assert.equal(w.q('SELECT count(*) n FROM swn_aspects')[0].n, 0);
  const t2 = w.interieur().astres.filter((a: any) => a.type === type);
  for (const a of t2) assert.equal(JSON.stringify(a.aspect).includes('#010203'), false);
  // Reverting again, version 0 without row: nothing to delete, still fine.
  assert.equal(pose(w, type, null, 0), 0);
});

test('refus avec champ : #12, clé inconnue, 5 Kio, type inconnu, version fausse ; rien n’est écrit', () => {
  const w = monde();
  const type = (w.interieur().astres[0].type) as string;
  const refus = (type_: string, parametres: unknown, version: unknown = 0) =>
    erreur(() => C.poserAspect(w.db, w.mj, w.univers, w.g, type_, { version, parametres } as any));
  let e = refus(type, { palette: ['#12', '#445566', '#778899'] });
  assert.ok(e.champ, '#12 → champ');
  e = refus(type, { couleurInconnue: 1 });
  assert.ok(e.champ, 'clé inconnue → champ'); assert.equal(e.champ, 'couleurInconnue');
  e = refus(type, { palette: ['#aaaaaa'], bourrage: 'x'.repeat(5 * 1024) });
  assert.ok(e.champ, '5 Kio → champ');
  e = refus('licorne', { palette: ['#aaaaaa'] });
  assert.equal(e.champ, 'type');
  e = refus('licorne', null);
  assert.equal(e.champ, 'type', 'supprimer un type inconnu est refusé aussi');
  e = refus(type, { palette: ['#aaaaaa', '#bbbbbb', '#cccccc'] }, '1');
  assert.equal(e.champ, 'version');
  e = refus(type, { palette: ['#aaaaaa', '#bbbbbb', '#cccccc'] }, -1);
  assert.equal(e.champ, 'version');
  e = refus(type, 'texte');
  assert.ok(e.champ);
  e = refus(type, [1]);
  assert.ok(e.champ);
  assert.equal(w.q('SELECT count(*) n FROM swn_aspects')[0].n, 0);
  // stale version
  pose(w, type, { palette: ['#aaaaaa', '#bbbbbb', '#cccccc'] });
  e = refus(type, { palette: ['#aaaaaa', '#bbbbbb', '#cccccc'] }, 0);
  assert.equal(e.detail, 'a_change');
  e = erreur(() => C.poserAspect(w.db, w.mj, w.univers, w.g, type, undefined as any));
  assert.ok(e.champ || e.code, 'entrée absente refusée');
});

test('rôles : une joueuse et un compte étranger ne posent rien (introuvable), le MJ en mode joueur est refusé ; une joueuse lit l’aspect effectif', () => {
  const w = monde();
  const type = (w.interieur().astres[0].type) as string;
  const p = { palette: ['#abcdef', '#abcdef', '#abcdef'] };
  assert.equal(erreur(() => pose(w, type, p, 0, w.lea)).code, 'introuvable');
  const mode = erreur(() => pose(w, type, p, 0, w.mjJoueur));
  assert.equal(mode.code, 'refuse'); assert.equal(mode.detail, 'mode_joueur');
  assert.equal(w.q('SELECT count(*) n FROM swn_aspects')[0].n, 0);
  pose(w, type, p);
  const vue = w.interieur(w.lea);
  assert.ok(vue.astres.filter((a: any) => a.type === type).every((a: any) => JSON.stringify(a.aspect.palette) === JSON.stringify(p.palette)));
  const brut = JSON.stringify(vue);
  assert.equal(/swn_aspects|surcharge/.test(brut), false, 'aucune table ni surcharge');
});

test('apercuReglages d’une proposition d’aspects seuls compte zéro', () => {
  const w = monde();
  E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, { versionSysteme: w.ver() });
  const type = (w.interieur().astres[0].type) as string;
  const a = R.apercuReglages(w.db, w.mj, w.univers, w.g, { aspects: { [type]: { palette: ['#123456', '#123456', '#123456'] } } } as any);
  assert.equal(a.tires_changent, 0);
});

test('aspectEffectif : couches, type sans surcharge, type inconnu, objet profond', () => {
  const w = monde();
  assert.deepEqual(C.aspectEffectif(w.db, w.g, 'tellurique', { relief: 1 }), { relief: 1 }, 'sans surcharge : l’aspect du corps');
  pose(w, 'tellurique', { palette: ['#111111', '#222222', '#333333'], relief: 0.2 });
  assert.deepEqual(C.aspectEffectif(w.db, w.g, 'tellurique', { relief: 1 }),
    { palette: ['#111111', '#222222', '#333333'], relief: 1 });
  assert.deepEqual(C.aspectEffectif(w.db, w.g, 'gazeuse', { x: 1 }), { x: 1 });
  assert.deepEqual(C.aspectEffectif(w.db, w.g, 'inconnu', {}), {});
  const brut = { relief: 1 };
  C.aspectEffectif(w.db, w.g, 'tellurique', brut);
  assert.deepEqual(brut, { relief: 1 }, 'l’entrée n’est pas mutée');
});

test('galaxie étrangère : la surcharge d’une galaxie ne touche pas l’autre', () => {
  const w = monde();
  const type = (w.interieur().astres[0].type) as string;
  pose(w, type, { palette: ['#111111', '#222222', '#333333'] });
  assert.deepEqual(C.aspectEffectif(w.db, w.g + 999, type, { z: 1 }), { z: 1 });
});

test('balayage des sources : seul catalogue-aspects.ts fusionne une surcharge d’aspect (lireAspects, surchargesDe, fusion)', () => {
  const racine = fileURLToPath(new URL('../../', import.meta.url));
  const fichiers: string[] = [];
  const parcourir = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { parcourir(p); continue; }
      if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) fichiers.push(p);
    }
  };
  parcourir(racine);
  const lit = /\blireAspects\b|\bsurchargesDe\b|\bfusionSurcharges\b|FROM\s+swn_aspects/i;
  const permis = ['/services/swn/catalogue-aspects.ts', '/services/swn/reglages.ts', '/services/swn/interieur.ts'];
  const fautifs = fichiers.filter((f) => lit.test(readFileSync(f, 'utf8')) && !permis.some((p) => f.endsWith(p)));
  assert.deepEqual(fautifs, []);
  // interieur.ts must go through catalogue-aspects, never read the table itself
  const interieur = readFileSync(join(racine, 'services/swn/interieur.ts'), 'utf8');
  assert.equal(/lireAspects|FROM\s+swn_aspects/i.test(interieur), false);
  assert.equal(/catalogue-aspects/.test(readFileSync(join(racine, 'services/swn/interieur.ts'), 'utf8')), true);
  // and no SQL in catalogue-aspects.ts
  assert.equal(/\bprepare\(|\bexec\(/.test(readFileSync(join(racine, 'services/swn/catalogue-aspects.ts'), 'utf8')), false);
});
