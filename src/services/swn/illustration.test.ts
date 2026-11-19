import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-carte-illustration: illustrationAstre under the guard of lireInterieur,
// the cache, the two-at-a-time queue, the ETag, no `*.tmp` left, the aspect in the hash.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const { illustrationAstre, RENDUS_SIMULTANES } = await import('./illustration.js');
const { viderTemporaires } = await import('../stockage.js');
const { plagesDe } = await import('../../outils/swn/regles/forme.js');

const lire = (n: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../rust/modules/coeur/tests/fixtures/${n}`, import.meta.url)), 'utf8'));
const FS = lire('generation-systemes.json');
const FG = lire('generation-galaxie.json');
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
  const a = (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur });
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run(FS.graine, FG.densites.defaut, g);
  for (const z of FG.densites.zones) {
    db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, univers, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const poser = (q_: number, r: number, secret = false) =>
    db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)")
      .run(g, univers, `s${q_}_${r}`, `S ${q_} ${r}`, q_, r, secret ? 1 : 0).lastInsertRowid as number;
  const astre = (sid: number, cle: string, type: string, aspect = '{}') =>
    db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille, aspect) VALUES (?,?,'planete',?,1,3,0.1,?)").run(sid, cle, type, aspect).lastInsertRowid as number;
  return { db, univers, g, a, poser, astre };
}
type W = ReturnType<typeof monde>;
const dossier = () => mkdtempSync(join(tmpdir(), 'illustration-test-'));
const faux = (n = 0) => async (aspect: string, cote: number) => new Uint8Array([82, 73, 70, 70, n, cote & 255, ...Buffer.from(aspect).subarray(0, 8)]);
const erreur = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e; } return null; };
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('système tiré : l\'image est rendue par le vrai worker, en WebP, et relue du cache au second appel', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  const cle = lireInterieur(w.db, w.a('lea'), w.univers, w.g, q, r).astres[0].cle;
  const v = await illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, cle, 64, {}, { racine });
  assert.equal(v.type, 'image/webp');
  const o = v.octets!;
  assert.equal(o.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.equal(o.subarray(8, 12).toString('latin1'), 'WEBP');
  assert.equal(o.readUInt32LE(4), o.length - 8);
  assert.equal(readdirSync(racine).length, 1);
  const bis = await illustrationAstre(w.db, w.a('antor'), w.univers, w.g, q, r, cle, 64, {}, { racine });
  assert.equal(bis.etag, v.etag);
  assert.ok(o.equals(bis.octets!));
}, { timeout: 60_000 });

test('système défini : une image par corps, rendue avec l\'aspect du corps (JSON canonique transmis au rendeur)', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  const sid = w.poser(q, r);
  w.astre(sid, 'p1', 'rocheux', '{"b":1,"a":2}');
  const vus: string[] = [];
  const rendre = async (a: string, c: number) => { vus.push(a); return faux()(a, c); };
  const v = await illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 128, {}, { racine, rendre, versionRendu: 1 });
  assert.equal(vus.length, 1);
  assert.equal(JSON.parse(vus[0]).type, 'rocheux');
  assert.ok(v.octets!.length > 0);
});

test('introuvable : cle inconnue, hexagone inconnu, secret (joueuse et MJ en mode joueur) : même erreur, même message', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  const sid = w.poser(q, r, true);
  w.astre(sid, 'p1', 'rocheux');
  const d = { racine, rendre: faux(), versionRendu: 1 };
  const essais = [
    () => illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q + 5, r + 5, 'p1', 64, {}, d), // unknown hexagon
    () => illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, {}, d),          // hidden
    () => illustrationAstre(w.db, w.a('antor', true), w.univers, w.g, q, r, 'p1', 64, {}, d),  // GM in player mode
    () => illustrationAstre(w.db, w.a('antor'), w.univers, w.g, q, r, 'inconnu', 64, {}, d),   // unknown cle
    () => illustrationAstre(w.db, w.a('antor'), w.univers, w.g, 1.5, r, 'p1', 64, {}, d),      // q not an integer
    () => illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 3, {}, d),           // bad cote on a hidden system: still introuvable
  ];
  const vus = [];
  for (const e of essais) { const x = await erreur(e()); assert.equal(x?.code, 'introuvable'); vus.push(`${x.code}|${x.message}|${x.detail}|${x.champ}`); }
  assert.equal(new Set(vus).size, 1, vus.join('\n'));
  assert.equal(readdirSync(racine).length, 0);
  // The GM outside player mode reads it.
  assert.ok((await illustrationAstre(w.db, w.a('antor'), w.univers, w.g, q, r, 'p1', 64, {}, d)).octets);
});

test('cote : hors [64, 2048], non entier, NaN : invalide champ cote ; les bornes passent', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  const sid = w.poser(q, r);
  w.astre(sid, 'p1', 'rocheux');
  const d = { racine, rendre: faux(), versionRendu: 1 };
  for (const c of [63, 2049, 0, -64, 64.5, Number.NaN, Infinity, 1e15]) {
    const e = await erreur(illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', c, {}, d));
    assert.equal(e?.code, 'invalide', String(c));
    assert.equal(e.champ, 'cote');
  }
  assert.equal(readdirSync(racine).length, 0);
  for (const c of [64, 2048]) assert.ok((await illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', c, {}, d)).octets);
});

test('cache : le second appel ne rend pas ; un autre côté ou un autre aspect écrit un autre fichier ; la version de rendu aussi', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  const sid = w.poser(q, r);
  const id = w.astre(sid, 'p1', 'rocheux', '{"a":1}');
  let rendus = 0;
  const rendre = async (a: string, c: number) => { rendus++; return faux()(a, c); };
  const ap = (v = 1) => illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, {}, { racine, rendre, versionRendu: v });
  const a1 = await ap();
  const a2 = await ap();
  assert.equal(rendus, 1);
  assert.equal(a1.etag, a2.etag);
  await illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 65, {}, { racine, rendre, versionRendu: 1 });
  assert.equal(rendus, 2);
  const v2 = await ap(2);
  assert.notEqual(v2.etag, a1.etag);
  w.db.prepare('UPDATE swn_astres SET aspect=? WHERE id=?').run('{"a":2}', id);
  const modif = await ap();
  assert.notEqual(modif.etag, a1.etag);
  assert.equal(rendus, 4);
  assert.equal(readdirSync(racine).length, 4);
  // The same aspect with its keys in another order is the same file.
  w.db.prepare('UPDATE swn_astres SET aspect=? WHERE id=?').run('{"z":1,"a":2}', id);
  const e1 = await ap();
  w.db.prepare('UPDATE swn_astres SET aspect=? WHERE id=?').run('{"a":2,"z":1}', id);
  const e2 = await ap();
  assert.equal(e1.etag, e2.etag);
});

test('ETag : If-None-Match (fort, faible, liste, *) rend octets null sans rendre ni lire ; un autre ETag rend l\'image', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  const sid = w.poser(q, r);
  w.astre(sid, 'p1', 'rocheux');
  let rendus = 0;
  const rendre = async (a: string, c: number) => { rendus++; return faux()(a, c); };
  const d = { racine, rendre, versionRendu: 1 };
  const ap = (siEtag?: string) => illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, { siEtag }, d);
  const v = await ap('"x"');
  assert.ok(v.octets);
  assert.equal(rendus, 1);
  for (const h of [v.etag, `W/${v.etag}`, `"x", ${v.etag}`, '*']) assert.equal((await ap(h)).octets, null, h);
  assert.equal(rendus, 1);
  // A fresh directory: the ETag alone answers, nothing is rendered.
  const neuf = dossier();
  const sans = await illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, { siEtag: v.etag }, { ...d, racine: neuf });
  assert.equal(sans.octets, null);
  assert.equal(rendus, 1);
  assert.equal(readdirSync(neuf).length, 0);
  assert.ok((await ap('"autre"')).octets);
  // The ETag does not open the guard: a hidden system with the right ETag stays introuvable.
  w.db.prepare('UPDATE swn_systemes SET secret=1').run();
  const e = await erreur(illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, { siEtag: v.etag }, d));
  assert.equal(e?.code, 'introuvable');
});

test('file : trois rendus simultanés, au plus deux en cours, tous aboutissent', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  const sid = w.poser(q, r);
  for (const c of ['a', 'b', 'c', 'd']) w.astre(sid, c, 'rocheux', `{"n":"${c}"}`);
  let en = 0, max = 0, total = 0;
  const rendre = async (a: string, c: number) => { en++; total++; max = Math.max(max, en); await attendre(60); en--; return faux()(a, c); };
  const d = { racine, rendre, versionRendu: 1 };
  const res = await Promise.all(['a', 'b', 'c', 'd'].map((c) => illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, c, 64, {}, d)));
  assert.equal(RENDUS_SIMULTANES, 2);
  assert.equal(max, 2);
  assert.equal(total, 4);
  assert.ok(res.every((x) => x.octets && x.octets.length > 0));
});

test('même image demandée deux fois en même temps : un seul rendu', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  w.astre(w.poser(q, r), 'p1', 'rocheux');
  let rendus = 0;
  const rendre = async (a: string, c: number) => { rendus++; await attendre(50); return faux()(a, c); };
  const d = { racine, rendre, versionRendu: 1 };
  const [x, y] = await Promise.all([1, 2].map(() => illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, {}, d)));
  assert.equal(rendus, 1);
  assert.ok(x.octets!.equals(y.octets!));
});

test('rendu en échec : indisponible, message fixe sans la cause, aucun fichier ni .tmp ; le rendu suivant repart', async () => {
  const w = monde();
  const racine = dossier();
  const { q, r } = cible;
  w.astre(w.poser(q, r), 'p1', 'rocheux');
  const d = (rendre: any) => ({ racine, rendre, versionRendu: 1 });
  const e = await erreur(illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, {}, d(async () => { throw new Error('SECRET /data/chemin auth.json'); })));
  assert.equal(e?.code, 'indisponible');
  assert.ok(!/SECRET|auth|chemin/.test(`${e.message}${e.detail}${e.stack?.split('\n')[0]}`));
  assert.deepEqual(readdirSync(racine), []);
  // The queue is not blocked by the failures (more than two in a row).
  for (let i = 0; i < 3; i++) assert.equal((await erreur(illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, {}, d(async () => { throw new Error('x'); }))))?.code, 'indisponible');
  const ok = await illustrationAstre(w.db, w.a('lea'), w.univers, w.g, q, r, 'p1', 64, {}, d(faux()));
  assert.ok(ok.octets);
});

test('démarrage : viderTemporaires retire les *.tmp et laisse les .webp', async () => {
  const racine = dossier();
  writeFileSync(join(racine, `${'a'.repeat(64)}.webp`), 'x');
  writeFileSync(join(racine, `${'a'.repeat(64)}.webp.1234.tmp`), 'x');
  writeFileSync(join(racine, 'autre.tmp'), 'x');
  await viderTemporaires(racine);
  assert.deepEqual(readdirSync(racine), [`${'a'.repeat(64)}.webp`]);
  assert.equal(existsSync(join(racine, 'autre.tmp')), false);
});
