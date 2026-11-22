import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-reglages-service: the settings of a galaxy read, count and apply through
// reglages.ts alone. Expected values are written by hand or observed through lireInterieur / lireBlocsGeneres (the reads).
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs, lireBlocsGeneres } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const { creerGalaxie } = await import('./galaxies.js');
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
  return { db, q, univers, g, mj, mjJoueur, lea, ver };
}
type W = ReturnType<typeof monde>;
const erreur = (f: () => unknown): any => { try { f(); } catch (e) { return e; } assert.fail('aucune erreur'); };

/** Every drawn star of the extent with its interior, read the way a player's screen reads it. */
function observer(w: W): Map<string, string> {
  const e = R.etendueApercu(w.db, w.g);
  const m = new Map<string, string>();
  for (let by = e.de.by; by <= e.a.by; by += 12) for (let bx = e.de.bx; bx <= e.a.bx; bx += 12) {
    const blocs = lireBlocsGeneres(w.db, w.mj, w.univers, w.g, { bx, by }, { bx: Math.min(bx + 11, e.a.bx), by: Math.min(by + 11, e.a.by) });
    for (const b of blocs) for (const [q, r] of b.generes) {
      const v: any = lireInterieur(w.db, w.mj, w.univers, w.g, q, r);
      if (v.etat === 'tire') { delete v.versionSysteme; m.set(`${q},${r}`, JSON.stringify(v)); }
    }
  }
  return m;
}
const differents = (a: Map<string, string>, b: Map<string, string>): number => {
  let n = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) n++;
  return n;
};
const comete = (json: string): boolean => (JSON.parse(json).astres as any[]).some((x) => x.genre === 'comete');

test('une galaxie sans ligne lit les défauts, la version 1 ; rien n’est écrit par la lecture', () => {
  const w = monde();
  assert.equal(w.q('SELECT count(*) n FROM swn_reglages')[0].n, 0, 'la montée n’insère aucune ligne');
  const v = R.lireReglages(w.db, w.mj, w.univers, w.g);
  assert.equal(v.version_generateur, 1);
  assert.equal(v.par_defaut, true);
  assert.deepEqual(v.surcharge, {});
  assert.deepEqual(v.valeurs, v.defauts);
  assert.ok(v.versions_connues.includes(1));
  assert.equal(v.version, w.ver());
  assert.equal(w.q('SELECT count(*) n FROM swn_reglages')[0].n, 0);
  assert.equal(w.q('SELECT count(*) n FROM swn_aspects')[0].n, 0);
});

test('lecture : le MJ lit même en mode joueur ; une joueuse et un compte étranger reçoivent l’introuvable d’une galaxie inconnue', () => {
  const w = monde();
  assert.doesNotThrow(() => R.lireReglages(w.db, w.mjJoueur, w.univers, w.g));
  const inconnue = erreur(() => R.lireReglages(w.db, w.mj, w.univers, 99999));
  const joueuse = erreur(() => R.lireReglages(w.db, w.lea, w.univers, w.g));
  assert.equal(inconnue.code, 'introuvable');
  assert.equal(joueuse.code, 'introuvable');
  assert.equal(joueuse.message, inconnue.message);
  assert.equal(joueuse.detail, inconnue.detail);
});

test('écriture : la joueuse reçoit introuvable, le MJ en mode joueur refuse ; l’aperçu aussi ; rien n’est écrit', () => {
  const w = monde();
  const v = w.ver();
  const entree = { version: v, valeurs: { frequences: { comete: 1 } }, confirme: true };
  assert.equal(erreur(() => R.poserReglages(w.db, w.lea, w.univers, w.g, entree)).code, 'introuvable');
  const e = erreur(() => R.poserReglages(w.db, w.mjJoueur, w.univers, w.g, entree));
  assert.equal(e.code, 'refuse'); assert.equal(e.detail, 'mode_joueur');
  assert.equal(erreur(() => R.apercuReglages(w.db, w.lea, w.univers, w.g, entree)).code, 'introuvable');
  assert.equal(erreur(() => R.apercuReglages(w.db, w.mjJoueur, w.univers, w.g, entree)).code, 'refuse');
  assert.equal(w.q('SELECT count(*) n FROM swn_reglages')[0].n, 0);
  assert.equal(w.ver(), v);
});

test('un jeton périmé est a_change sans ligne écrite ; un jeton absent est invalide', () => {
  const w = monde();
  const v = w.ver();
  const e = erreur(() => R.poserReglages(w.db, w.mj, w.univers, w.g, { version: v + 1, valeurs: { frequences: { comete: 0.5 } }, confirme: true }));
  assert.equal(e.code, 'conflit'); assert.equal(e.detail, 'a_change');
  assert.equal(w.q('SELECT count(*) n FROM swn_reglages')[0].n, 0);
  assert.equal(w.ver(), v);
  assert.equal(erreur(() => R.poserReglages(w.db, w.mj, w.univers, w.g, { version: undefined, valeurs: {} })).code, 'invalide');
});

test('confirme absent avec un décompte non nul : confirmation_requise, rien écrit ; confirme: false de même', () => {
  const w = monde();
  const v = w.ver();
  for (const confirme of [undefined, false, 'true', 1]) {
    const e = erreur(() => R.poserReglages(w.db, w.mj, w.univers, w.g, { version: v, valeurs: { frequences: { comete: 1 } }, confirme }));
    assert.equal(e.code, 'invalide'); assert.equal(e.detail, 'confirmation_requise'); assert.equal(e.champ, 'confirme');
  }
  assert.equal(w.q('SELECT count(*) n FROM swn_reglages')[0].n, 0);
  assert.equal(w.ver(), v);
});

test('une valeur hors borne est reglage_invalide avec son champ ; une version inconnue est invalide sur version_generateur', () => {
  const w = monde();
  const v = w.ver();
  const e = erreur(() => R.poserReglages(w.db, w.mj, w.univers, w.g, { version: v, valeurs: { frequences: { comete: 2 } }, confirme: true }));
  assert.equal(e.code, 'invalide'); assert.equal(e.detail, 'reglage_invalide'); assert.equal(e.champ, 'frequences.comete');
  assert.equal(e.message, 'Entre 0 et 1.');
  const x = erreur(() => R.poserReglages(w.db, w.mj, w.univers, w.g, { version: v, version_generateur: 9999, confirme: true }));
  assert.equal(x.code, 'invalide'); assert.equal(x.champ, 'version_generateur'); assert.equal(x.message, 'Version inconnue.');
  const a = erreur(() => R.apercuReglages(w.db, w.mj, w.univers, w.g, { version_generateur: 9999 }));
  assert.equal(a.champ, 'version_generateur'); assert.equal(a.message, 'Version inconnue.');
  const b = erreur(() => R.apercuReglages(w.db, w.mj, w.univers, w.g, { valeurs: { frequences: { comete: 2 } } }));
  assert.equal(b.champ, 'frequences.comete');
  assert.equal(w.q('SELECT count(*) n FROM swn_reglages')[0].n, 0);
});

test('comète à 1 : toute étoile tirée a une comète, les positions sont celles d’avant, un système défini est intact ; l’aperçu égale l’observation', () => {
  const w = monde();
  // A defined system, anchored at the fixtures' target.
  E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, { versionSysteme: w.ver() });
  const lignes = () => ({ a: w.q('SELECT * FROM swn_astres ORDER BY id'), f: w.q('SELECT * FROM swn_formations ORDER BY id'), s: w.q('SELECT * FROM swn_systemes ORDER BY id') });
  const lignesAvant = lignes();
  const definiAvant = lireInterieur(w.db, w.mj, w.univers, w.g, cible.q, cible.r);
  assert.equal(definiAvant.etat, 'defini');
  const avant = observer(w);
  assert.ok(avant.size > 50, 'l’étendue tire des étoiles');
  const proposition = { valeurs: { frequences: { comete: 1 } } };
  const apercu = R.apercuReglages(w.db, w.mj, w.univers, w.g, proposition);
  assert.equal(w.q('SELECT count(*) n FROM swn_reglages')[0].n, 0, 'l’aperçu n’écrit rien');
  assert.equal(apercu.definis_inchangent, 1);
  assert.deepEqual(apercu.etendue, R.etendueApercu(w.db, w.g));

  const confirme = R.poserReglages(w.db, w.mj, w.univers, w.g, { version: w.ver(), ...proposition, confirme: true });
  assert.deepEqual(confirme.surcharge, { frequences: { comete: 1 } });
  assert.equal(confirme.par_defaut, false);
  const apres = observer(w);
  assert.deepEqual([...apres.keys()].sort(), [...avant.keys()].sort(), 'mêmes hexagones d’étoiles');
  for (const [k, json] of apres) assert.ok(comete(json), `comète en ${k}`);
  assert.equal(apercu.tires_changent, differents(avant, apres), 'l’aperçu égale la lecture avant / après');
  assert.ok(apercu.tires_changent > 0);
  assert.deepEqual(lignes(), lignesAvant, 'les lignes du système défini ne bougent pas');
  assert.deepEqual(lireInterieur(w.db, w.mj, w.univers, w.g, cible.q, cible.r), { ...definiAvant, version_generateur: definiAvant.version_generateur });
});

test('la densité par défaut déplace des étoiles tirées, aucun système défini ; l’aperçu égale l’observation', () => {
  const w = monde();
  E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, { versionSysteme: w.ver() });
  const avantDefini = w.q('SELECT * FROM swn_systemes ORDER BY id');
  const avant = observer(w);
  const apercu = R.apercuReglages(w.db, w.mj, w.univers, w.g, { densite: 0.1 });
  const vue = R.poserReglages(w.db, w.mj, w.univers, w.g, { version: w.ver(), densite: 0.1, confirme: true });
  assert.equal(vue.densite_defaut, 0.1);
  assert.equal(w.q('SELECT densite_defaut d FROM swn_galaxies WHERE id=?', w.g)[0].d, 0.1);
  const apres = observer(w);
  assert.ok(apres.size < avant.size, 'moins dense : moins d’étoiles');
  assert.equal(apercu.tires_changent, differents(avant, apres));
  assert.ok(apercu.tires_changent > 0);
  assert.equal(apercu.definis_inchangent, 1);
  assert.deepEqual(w.q('SELECT * FROM swn_systemes ORDER BY id'), avantDefini);
});

test('aspects seuls : l’aperçu compte zéro, la pose n’exige pas de confirmation', () => {
  const w = monde();
  const type = Object.keys(R.lireReglages(w.db, w.mj, w.univers, w.g).defauts ? {} : {})[0];
  const types = R.lireReglages(w.db, w.mj, w.univers, w.g).aspects.map((a) => a.type);
  assert.ok(types.length > 0);
  void type;
  const apercu = R.apercuReglages(w.db, w.mj, w.univers, w.g, { aspects: { [types[0]]: null } });
  assert.equal(apercu.tires_changent, 0);
  assert.equal(R.apercuReglages(w.db, w.mj, w.univers, w.g, {}).tires_changent, 0);
  const v = w.ver();
  R.poserReglages(w.db, w.mj, w.univers, w.g, { version: v, aspects: { [types[0]]: null } });
  assert.equal(w.ver(), v + 1);
});

test('valeurs: null revient aux défauts ; la version de la galaxie monte de 1 par pose ; la réponse est lireReglages', () => {
  const w = monde();
  const v0 = w.ver();
  const a = R.poserReglages(w.db, w.mj, w.univers, w.g, { version: v0, valeurs: { frequences: { comete: 1 } }, confirme: true });
  assert.equal(a.version, v0 + 1);
  assert.deepEqual(a, R.lireReglages(w.db, w.mj, w.univers, w.g));
  const b = R.poserReglages(w.db, w.mj, w.univers, w.g, { version: v0 + 1, valeurs: null, confirme: true });
  assert.equal(b.version, v0 + 2);
  assert.deepEqual(b.surcharge, {});
  assert.equal(b.par_defaut, true);
  assert.deepEqual(b.valeurs, b.defauts);
  // The same token twice: the second is a_change.
  assert.equal(erreur(() => R.poserReglages(w.db, w.mj, w.univers, w.g, { version: v0 + 1, valeurs: null, confirme: true })).detail, 'a_change');
});

test('un jeton d’ancrage lu avant un réglage est refusé après (a_change), sans ligne écrite', () => {
  const w = monde();
  const vue: any = lireInterieur(w.db, w.mj, w.univers, w.g, cible.q, cible.r);
  assert.equal(vue.etat, 'tire');
  const jeton = vue.versionSysteme;
  R.poserReglages(w.db, w.mj, w.univers, w.g, { version: w.ver(), valeurs: { frequences: { comete: 1 } }, confirme: true });
  const e = erreur(() => E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, { versionSysteme: jeton }));
  assert.equal(e.detail, 'a_change');
  assert.equal(w.q('SELECT count(*) n FROM swn_systemes')[0].n, 0);
  // Anchoring at the fresh token freezes what the settings of the moment draw: a comet.
  const frais: any = lireInterieur(w.db, w.mj, w.univers, w.g, cible.q, cible.r);
  E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, { versionSysteme: frais.versionSysteme });
  assert.ok(w.q("SELECT 1 FROM swn_astres WHERE genre='comete'").length > 0);
});

test('ecrireAspect : version propre par type (0 sans ligne), a_change si périmée, null supprime, la version de la galaxie ne bouge pas', () => {
  const w = monde();
  const types = R.lireReglages(w.db, w.mj, w.univers, w.g).aspects;
  const t = types[0];
  const v = w.ver();
  assert.equal(t.version, 0);
  const defaut = t.defaut;
  assert.equal(erreur(() => R.ecrireAspect(w.db, w.g, t.type, defaut, 1)).detail, 'a_change');
  assert.equal(R.ecrireAspect(w.db, w.g, t.type, defaut, 0), 1);
  assert.equal(R.ecrireAspect(w.db, w.g, t.type, defaut, 1), 2);
  assert.equal(erreur(() => R.ecrireAspect(w.db, w.g, t.type, defaut, 1)).detail, 'a_change');
  assert.deepEqual(R.lireAspects(w.db, w.g).map((a) => [a.type, a.version]), [[t.type, 2]]);
  assert.equal(R.lireReglages(w.db, w.mj, w.univers, w.g).aspects.find((a) => a.type === t.type)!.version, 2);
  assert.equal(w.ver(), v);
  assert.equal(R.ecrireAspect(w.db, w.g, t.type, null, 2), 0);
  assert.deepEqual(R.lireAspects(w.db, w.g), []);
  assert.equal(erreur(() => R.ecrireAspect(w.db, w.g, 'type-inexistant', {}, 0)).code, 'invalide');
  assert.equal(erreur(() => R.ecrireAspect(w.db, w.g, 'type-inexistant', null, 0)).code, 'invalide');
});

test('creerGalaxie inscrit sa ligne à la version courante du cœur', () => {
  const w = monde();
  const { id } = creerGalaxie(w.db, w.mj, w.univers, { titre: 'Neuve' } as any);
  const l = w.q('SELECT * FROM swn_reglages WHERE galaxie_id = ?', id);
  assert.equal(l.length, 1);
  assert.equal(l[0].version_generateur, R.lireReglages(w.db, w.mj, w.univers, id).versions_connues.at(-1));
  assert.equal(l[0].valeurs, '{}');
  assert.equal(R.reglagesDe(w.db, id).versionGenerateur, l[0].version_generateur);
});

test('0045 : montée depuis 0044 avec le semis, galaxies inchangées, défauts et version 1, aucune ligne insérée', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-0045-'));
  const db = openDb(':memory:');
  const source = new URL('../../db/migrations/', import.meta.url);
  for (const f of readdirSync(source).filter((x) => /^\d{4}-.+\.sql$/.test(x))) if (Number(f.slice(0, 4)) <= 44) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  assert.equal(semerBouchon(db), true);
  const galaxies = () => db.prepare('SELECT * FROM swn_galaxies ORDER BY id').all();
  const avant = galaxies();
  assert.ok(avant.length > 0);
  assert.deepEqual(migrate(db), [45, 46]);
  assert.deepEqual(galaxies(), avant);
  for (const t of ['swn_reglages', 'swn_aspects']) assert.equal((db.prepare(`SELECT count(*) n FROM ${t}`).get() as any).n, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  for (const g of avant as any[]) {
    const r = R.reglagesDe(db, g.id);
    assert.equal(r.versionGenerateur, 1); assert.equal(r.valeurs, '{}'); assert.equal(r.version, 0);
  }
  assert.deepEqual(migrate(db), []);
});

test('balayage des sources : seul reglages.ts écrit swn_reglages / swn_aspects ; ecriture-systeme.ts n’appelle jamais reglagesDe', () => {
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
  assert.ok(fichiers.length > 50);
  const ecriture = /(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+swn_(reglages|aspects)\b/i;
  const fautifs = fichiers.filter((f) => !f.endsWith('/services/swn/reglages.ts') && ecriture.test(readFileSync(f, 'utf8')));
  assert.deepEqual(fautifs, []);
  assert.ok(ecriture.test(readFileSync(join(racine, 'services/swn/reglages.ts'), 'utf8')), 'le balayage reconnaît une écriture');
  assert.equal(/reglagesDe/.test(readFileSync(join(racine, 'services/swn/ecriture-systeme.ts'), 'utf8')), false);
});
