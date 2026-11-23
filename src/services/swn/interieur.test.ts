import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-systeme-lecture: lireInterieur on the neutral seed (drawn = fixtures of Éneria's
// systeme()), a defined system is its own rows, the secret guard, the same refusal everywhere, no fiche_id/secret/count.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const { plagesDe } = await import('../../outils/swn/regles/forme.js');

const lire = (n: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../rust/modules/coeur/tests/fixtures/${n}`, import.meta.url)), 'utf8'));
const FS = lire('generation-systemes.json');
const FG = lire('generation-galaxie.json');

/** The bouchon's galaxy emptied and re-set on the neutral seed and the fixtures' zones. */
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
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run(FS.graine, FG.densites.defaut, g);
  // The fixtures' two density zones (the 20th system sits in the high one), no defined system.
  for (const z of FG.densites.zones) {
    db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, univers, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const poser = (q_: number, r: number, o: { secret?: boolean; nom?: string; transition?: number | null } = {}) => {
    const id = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu, transition) VALUES (?,?,?,?,?,?,3,'accent','',?,0,?)")
      .run(g, univers, `s${q_}_${r}`, o.nom ?? `S ${q_} ${r}`, q_, r, o.secret ? 1 : 0, o.transition ?? null).lastInsertRowid as number;
    return id;
  };
  const astre = (sid: number, cle: string, genre: string, type: string, extra: Record<string, unknown> = {}) => {
    const o = { nom: null, orbite: 1, heure: 3, taille: 0.1, parent: null, rang: 0, aspect: '{}', fiche: null, ...extra } as any;
    return db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect, fiche_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(sid, cle, genre, o.parent, o.rang, type, o.nom, o.orbite, o.heure, o.taille, o.aspect, o.fiche).lastInsertRowid as number;
  };
  return { db, q, univers, g, a, poser, astre };
}
type W = ReturnType<typeof monde>;
/** What the GM alone holds (AD-edition-2): the write tokens. Removed to compare what every reader sees. */
const sansJetons = (v: any) => {
  const { peutEcrire, versionSysteme, ...reste } = v;
  return { ...reste, astres: v.astres.map(({ version, ...a }: any) => a), formations: v.formations.map(({ version, ...f }: any) => f) };
};
const code = (f: () => unknown) => { try { f(); } catch (e: any) { return `${e.code ?? e.constructor.name}|${e.message}`; } return 'aucune'; };
const cible = FS.systemes[0].entree as { q: number; r: number };

/** A defined system with a star, two planets (the farther inserted first), a moon, an anomaly, a comet, a ring. */
function definir(w: W, o: { secret?: boolean; transition?: number | null } = {}) {
  const { q, r } = cible;
  const sid = w.poser(q, r, { nom: 'Port défini', ...o });
  w.astre(sid, 'e', 'etoile', 'orange', { orbite: 0, heure: 0, taille: 0.2 });
  w.astre(sid, 'p-loin', 'planete', 'gazeux', { orbite: 4, heure: 7, nom: 'Géante' });
  const proche = w.astre(sid, 'p-proche', 'planete', 'rocheux', { orbite: 1.5, heure: 2 });
  w.astre(sid, 'l1', 'lune', 'rocheux', { parent: proche, orbite: null, heure: 9, nom: 'Petite lune' });
  w.astre(sid, 'ano', 'planete', 'anomalie', { orbite: 3, heure: 5, nom: 'Faille' });
  w.astre(sid, 'c', 'comete', 'comete', { orbite: 6, heure: 1 });
  w.db.prepare("INSERT INTO swn_formations (systeme_id, cle, forme, nom, parametres) VALUES (?,?,?,?,?)").run(sid, 'f1', 'anneau', null, '{"de":2.9,"a":3.3}');
  return sid;
}

type L = { cle: string; genre: string; type: string; parent_cle: string | null; etoile_rang: number; orbite: number | null };
/** Independent reference of E-23's order: star, companions; planets by orbit each followed by its moons; comets and anomalies by orbit. */
function ordreE23(as: L[]): L[] {
  const o = (x: L) => x.orbite ?? 0;
  const etoiles = as.filter((x) => x.genre === 'etoile').sort((x, y) => x.etoile_rang - y.etoile_rang);
  const planetes = as.filter((x) => x.genre === 'planete' && x.type !== 'anomalie').sort((x, y) => o(x) - o(y));
  const autres = as.filter((x) => x.genre === 'comete' || (x.genre === 'planete' && x.type === 'anomalie')).sort((x, y) => o(x) - o(y));
  return [...etoiles, ...planetes.flatMap((p) => [p, ...as.filter((l) => l.genre === 'lune' && l.parent_cle === p.cle)]), ...autres];
}
const ordreZones = <T extends { forme: string; parametres: Record<string, unknown> }>(fs: T[]): T[] => {
  const o = (f: T) => Number(f.forme === 'anneau' ? f.parametres.de : f.parametres.orbite);
  return [...fs].sort((x, y) => o(x) - o(y) || (x.forme === y.forme ? 0 : x.forme === 'anneau' ? -1 : 1));
};

test('système tiré : deux lectures identiques, état tire, nom nul, MJ et joueuse mêmes corps', () => {
  const w = monde();
  const { q, r } = cible;
  const a = lireInterieur(w.db, w.a('antor'), w.univers, w.g, q, r);
  assert.deepEqual(lireInterieur(w.db, w.a('antor'), w.univers, w.g, q, r), a);
  const joueuse = lireInterieur(w.db, w.a('lea'), w.univers, w.g, q, r);
  assert.deepEqual(joueuse, sansJetons(a));
  assert.deepEqual(lireInterieur(w.db, w.a('antor', true), w.univers, w.g, q, r), joueuse);
  assert.equal(a.peutEcrire, true); assert.equal(a.versionSysteme, w.q('SELECT version FROM swn_galaxies WHERE id=?', w.g)[0].version);
  assert.ok(a.astres.every((x) => x.version === 1));
  assert.equal(a.etat, 'tire'); assert.equal(a.nom, null);
  assert.deepEqual([a.q, a.r], [q, r]);
  assert.ok(a.astres.length >= 4);
  assert.equal(a.astres[0]!.genre, 'etoile');
  assert.ok(a.transition > 0);
});

test('vingt systèmes de la graine neutre : structure, comptes et réels des fixtures (1e-9), ordre E-23', () => {
  const w = monde();
  assert.equal(FS.systemes.length, 20);
  for (const s of FS.systemes) {
    const v = code(() => lireInterieur(w.db, w.a('antor'), w.univers, w.g, s.entree.q, s.entree.r)) === 'aucune' ? lireInterieur(w.db, w.a('antor'), w.univers, w.g, s.entree.q, s.entree.r) : (() => { throw new Error(`introuvable ${s.entree.q},${s.entree.r}`); })();
    const att = s.sortie;
    assert.equal(v.astres.length, att.astres.length, `${s.entree.q},${s.entree.r} astres`);
    assert.equal(v.formations.length, att.formations.length);
    const parCle = new Map(v.astres.map((x) => [x.cle, x]));
    assert.equal(parCle.size, v.astres.length);
    for (const e of att.astres) {
      const x = parCle.get(e.cle)!;
      assert.ok(x, e.cle);
      for (const k of ['genre', 'parent_cle', 'etoile_rang', 'type', 'nom'] as const) assert.equal((x as any)[k], e[k], `${e.cle}.${k}`);
      for (const k of ['orbite', 'heure', 'taille'] as const) {
        if (e[k] === null) assert.equal(x[k], null); else assert.ok(Math.abs((x as any)[k] - e[k]) < 1e-9, `${e.cle}.${k}`);
      }
    }
    const fCle = new Map(v.formations.map((x) => [x.cle, x]));
    for (const e of att.formations) {
      const x = fCle.get(e.cle)!;
      assert.ok(x, e.cle);
      assert.equal(x.forme, e.forme); assert.equal(x.etoile_rang, e.etoile_rang);
    }
    assert.ok(Math.abs(v.transition - att.transition) < 1e-9);
    assert.deepEqual(v.astres.map((x) => x.cle), ordreE23(v.astres).map((x) => x.cle), `${s.entree.q},${s.entree.r} ordre E-23`);
    assert.deepEqual(v.formations.map((x) => x.cle), ordreZones(v.formations).map((x) => x.cle), 'zones');
  }
});

test('système défini : ses lignes (anomalie et lune comprises), état defini, pas le tirage, ordre E-23', () => {
  const w = monde();
  definir(w);
  const v = lireInterieur(w.db, w.a('lea'), w.univers, w.g, cible.q, cible.r);
  assert.equal(v.etat, 'defini'); assert.equal(v.nom, 'Port défini');
  assert.deepEqual(v.astres.map((x) => x.cle), ['e', 'p-proche', 'l1', 'p-loin', 'ano', 'c']);
  assert.equal(v.astres.find((x) => x.cle === 'ano')!.type, 'anomalie');
  const lune = v.astres[2]!;
  assert.equal(lune.parent_cle, 'p-proche'); assert.equal(lune.orbite, null); assert.equal(lune.nom, 'Petite lune');
  assert.equal(v.astres[0]!.nom, null);
  assert.deepEqual(v.formations.map((f) => [f.cle, f.forme, f.parametres]), [['f1', 'anneau', { de: 2.9, a: 3.3 }]]);
  assert.ok(v.transition > 0);
  assert.ok(!v.astres.some((x) => x.cle.startsWith(`${cible.q},${cible.r}.`)));
});

test('transition : la valeur de la ligne si posée, sinon le défaut du cœur ; défini sans corps lisible', () => {
  const w = monde();
  const sid = definir(w, { transition: 7.5 });
  assert.equal(lireInterieur(w.db, w.a('antor'), w.univers, w.g, cible.q, cible.r).transition, 7.5);
  w.db.prepare('UPDATE swn_systemes SET transition = NULL WHERE id = ?').run(sid);
  const def = lireInterieur(w.db, w.a('antor'), w.univers, w.g, cible.q, cible.r).transition;
  assert.ok(def > 0 && def !== 7.5);
  w.db.prepare('UPDATE swn_systemes SET transition = 0 WHERE id = ?').run(sid);
  assert.equal(lireInterieur(w.db, w.a('antor'), w.univers, w.g, cible.q, cible.r).transition, 0);
  // A defined system placed by hand starts with no body.
  const vide = w.poser(0, 0, { nom: 'Vide' });
  void vide;
  const v = lireInterieur(w.db, w.a('antor'), w.univers, w.g, 0, 0);
  assert.deepEqual([v.etat, v.astres, v.formations], ['defini', [], []]);
});

test('secret : introuvable pour la joueuse et le MJ en mode joueur, le même corps que l\'hexagone sans étoile ; le MJ lit', () => {
  const w = monde();
  definir(w, { secret: true });
  const { q, r } = cible;
  const vide = code(() => lireInterieur(w.db, w.a('lea'), w.univers, w.g, q + 1, r + 7777));
  assert.ok(vide.startsWith('introuvable|'));
  assert.equal(code(() => lireInterieur(w.db, w.a('lea'), w.univers, w.g, q, r)), vide);
  assert.equal(code(() => lireInterieur(w.db, w.a('antor', true), w.univers, w.g, q, r)), vide);
  assert.equal(code(() => lireInterieur(w.db, w.a('antor'), w.univers, w.g, q + 1, r + 7777)), vide);
  assert.equal(code(() => lireInterieur(w.db, w.a('lea'), w.univers, w.g, 99999, w.g)), vide);
  assert.equal(code(() => lireInterieur(w.db, w.a('lea'), w.univers, 999999, q, r)), vide);
  assert.equal(code(() => lireInterieur(w.db, w.a('teo'), w.univers, w.g, q, r)), vide); // étranger
  assert.equal(code(() => lireInterieur(w.db, w.a('antor'), 999999, w.g, q, r)), vide);
  const v = lireInterieur(w.db, w.a('antor'), w.univers, w.g, q, r);
  assert.equal(v.etat, 'defini'); assert.equal(v.astres.length, 6);
});

test('hexagone sans étoile, coordonnées non entières ou hors borne : introuvable', () => {
  const w = monde();
  const bloc = new Set(FG.blocs.filter((b: any) => b.etoile).map((b: any) => `${b.etoile.q},${b.etoile.r}`));
  let n = 0;
  for (let q = 0; q < 12 && n < 5; q++) for (let r = 0; r < 12 && n < 5; r++) {
    if (bloc.has(`${q},${r}`)) continue;
    n++;
    assert.ok(code(() => lireInterieur(w.db, w.a('antor'), w.univers, w.g, q, r)).startsWith('introuvable|'), `${q},${r}`);
  }
  for (const [q, r] of [[NaN, 0], [0, NaN], [1.5, 0], [0, Infinity], [1e300, 0]] as const) {
    assert.ok(code(() => lireInterieur(w.db, w.a('antor'), w.univers, w.g, q, r)).startsWith('introuvable|'), `${q},${r}`);
  }
});

test('un défini non promu ou autre à côté exclut l\'étoile tirée voisine : pas de tirage à un hexagone exclu', () => {
  const w = monde();
  // (22,-49) holds a drawn star; a defined system next to it empties it (exclusion of tirage-etoiles).
  const avant = code(() => lireInterieur(w.db, w.a('lea'), w.univers, w.g, 22, -49));
  assert.equal(avant, 'aucune');
  w.poser(23, -49, { nom: 'Voisin' });
  assert.ok(code(() => lireInterieur(w.db, w.a('lea'), w.univers, w.g, 22, -49)).startsWith('introuvable|'));
});

test('aucune réponse ne porte fiche_id, secret, id ni compte de caché (tiré, défini, secret lu par le MJ)', () => {
  const w = monde();
  const sid = definir(w, { secret: true });
  w.db.prepare("UPDATE swn_astres SET fiche_id = (SELECT id FROM fiches LIMIT 1) WHERE systeme_id = ? AND cle = 'p-loin'").run(sid);
  w.db.prepare("UPDATE swn_formations SET fiche_id = (SELECT id FROM fiches LIMIT 1) WHERE systeme_id = ?").run(sid);
  const lectures = [
    lireInterieur(w.db, w.a('antor'), w.univers, w.g, cible.q, cible.r),
    lireInterieur(w.db, w.a('antor'), w.univers, w.g, FS.systemes[1].entree.q, FS.systemes[1].entree.r),
  ];
  for (const v of lectures) {
    const s = JSON.stringify(sansJetons(v));
    assert.ok(!/fiche_id|secret|cach|masqu|compte|systeme_id|version"/i.test(s), s.slice(0, 200));
    // The GM's reading adds only the tokens of AD-edition-2.
    assert.deepEqual(Object.keys(v).sort(), ['astres', 'elements', 'etat', 'formations', 'nom', 'peutEcrire', 'q', 'r', 'transition', 'versionSysteme', 'version_generateur']);
    for (const a of v.astres) assert.deepEqual(Object.keys(a).sort(), ['aspect', 'cle', 'etoile_rang', 'fiche', 'genre', 'heure', 'nom', 'orbite', 'parent_cle', 'taille', 'type', 'version']);
    for (const f of v.formations) assert.deepEqual(Object.keys(f).sort(), ['cle', 'etoile_rang', 'fiche', 'forme', 'nom', 'parametres', 'version']);
    const p = sansJetons(v);
    assert.deepEqual(Object.keys(p).sort(), ['astres', 'elements', 'etat', 'formations', 'nom', 'q', 'r', 'transition', 'version_generateur']);
    for (const a of p.astres) assert.deepEqual(Object.keys(a).sort(), ['aspect', 'cle', 'etoile_rang', 'fiche', 'genre', 'heure', 'nom', 'orbite', 'parent_cle', 'taille', 'type']);
  }
});

test('cascade : supprimer le système efface ses astres et formations ; supprimer la fiche liée délie sans effacer le corps', () => {
  const w = monde();
  const sid = definir(w);
  const n = (t: string) => (w.q(`SELECT COUNT(*) n FROM ${t} WHERE systeme_id = ?`, sid)[0].n as number);
  assert.deepEqual([n('swn_astres'), n('swn_formations')], [6, 1]);
  const fid = w.db.prepare("INSERT INTO fiches (cle, creee_via, univers_id, type, titre, charge, cree_le, modifie_le) VALUES ('k' || hex(randomblob(6)), 'ecran', ?, 'lieu', 'Lien', '{}', 'x', 'x')").run(w.univers).lastInsertRowid;
  w.db.prepare("UPDATE swn_astres SET fiche_id = ? WHERE systeme_id = ? AND cle = 'c'").run(fid, sid);
  w.db.pragma('foreign_keys = ON');
  w.db.prepare('DELETE FROM fiches WHERE id = ?').run(fid);
  assert.equal(w.q("SELECT fiche_id f FROM swn_astres WHERE systeme_id = ? AND cle = 'c'", sid)[0].f, null);
  w.db.prepare('DELETE FROM swn_systemes WHERE id = ?').run(sid);
  assert.deepEqual([n('swn_astres'), n('swn_formations')], [0, 0]);
});

test('contraintes de la migration : lune sans parent, heure 12, orbite négative, doublon de cle, transition négative refusés', () => {
  const w = monde();
  const sid = definir(w);
  const ins = (cle: string, genre: string, o: Record<string, unknown> = {}) => () => w.astre(sid, cle, genre, 'x', o);
  assert.throws(ins('m', 'lune', { parent: null }));
  assert.throws(ins('m', 'planete', { parent: w.q("SELECT id FROM swn_astres WHERE cle='e'")[0].id }));
  assert.throws(ins('m', 'planete', { heure: 12 }));
  assert.throws(ins('m', 'planete', { heure: -0.1 }));
  assert.throws(ins('m', 'planete', { orbite: -1 }));
  assert.throws(ins('m', 'planete', { taille: 0 }));
  assert.throws(ins('p-loin', 'planete'));
  assert.throws(ins('m', 'planete', { aspect: '[1]' }));
  assert.doesNotThrow(ins('m', 'planete', { heure: 0 }));
  assert.throws(() => w.db.prepare('UPDATE swn_systemes SET transition = -1 WHERE id = ?').run(sid));
});

test('0043 : montée depuis 0042 avec le semis, systèmes inchangés, transition nulle, tables vides, foreign_key_check vide', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-0043-'));
  const db = openDb(':memory:');
  const source = new URL('../../db/migrations/', import.meta.url);
  for (const f of readdirSync(source).filter((x) => /^\d{4}-.+\.sql$/.test(x))) if (Number(f.slice(0, 4)) <= 42 || Number(f.slice(0, 4)) === 51) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  assert.equal(semerBouchon(db), true);
  const lignes = () => db.prepare('SELECT * FROM swn_systemes ORDER BY id').all();
  const avant = lignes();
  assert.ok(avant.length > 0);
  assert.ok(!('transition' in (avant[0] as object)));
  assert.deepEqual(migrate(db), [43, 44, 45, 46, 47, 48, 49, 50, 52]);
  const apres = lignes() as any[];
  assert.equal(apres.length, avant.length);
  for (let i = 0; i < avant.length; i++) assert.deepEqual({ ...apres[i], transition: undefined }, { ...(avant[i] as object), transition: undefined });
  assert.ok(apres.every((l) => l.transition === null));
  for (const t of ['swn_astres', 'swn_formations']) assert.equal((db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('ordre exact E-23 : étoile, 2 compagnes, 3 planètes dont une anomalie, lunes, comète, zones (système défini)', () => {
  const w = monde();
  const sid = w.poser(cible.q, cible.r, { nom: 'Ordre' });
  // Inserted in a deliberately wrong order.
  w.astre(sid, 'c1', 'comete', 'comete', { orbite: 2 });
  w.astre(sid, 'ano', 'planete', 'anomalie', { orbite: 3.5 });
  const p3 = w.astre(sid, 'p3', 'planete', 'glace', { orbite: 5 });
  w.astre(sid, 'l3', 'lune', 'glace', { parent: p3, orbite: null });
  const p2 = w.astre(sid, 'p2', 'planete', 'gazeux', { orbite: 3 });
  w.astre(sid, 'l2b', 'lune', 'rocheux', { parent: p2, orbite: null });
  w.astre(sid, 'k2', 'etoile', 'naine_rouge', { rang: 2, orbite: 0.8 });
  const p1 = w.astre(sid, 'p1', 'planete', 'rocheux', { orbite: 1 });
  w.astre(sid, 'l1', 'lune', 'rocheux', { parent: p1, orbite: null });
  w.astre(sid, 'k1', 'etoile', 'naine_rouge', { rang: 1, orbite: 0.5 });
  w.astre(sid, 'e', 'etoile', 'jaune', { orbite: 0 });
  const f = w.db.prepare('INSERT INTO swn_formations (systeme_id, cle, forme, nom, parametres) VALUES (?,?,?,?,?)');
  f.run(sid, 'nuage-2', 'nuage', null, '{"orbite":2,"rayon":0.5}');
  f.run(sid, 'anneau-5', 'anneau', null, '{"de":5,"a":5.5}');
  f.run(sid, 'anneau-2', 'anneau', null, '{"de":2,"a":2.4}');
  const v = lireInterieur(w.db, w.a('lea'), w.univers, w.g, cible.q, cible.r);
  assert.deepEqual(v.astres.map((x) => x.cle), ['e', 'k1', 'k2', 'p1', 'l1', 'p2', 'l2b', 'p3', 'l3', 'c1', 'ano']);
  assert.deepEqual(v.formations.map((x) => x.cle), ['anneau-2', 'nuage-2', 'anneau-5']);
});
