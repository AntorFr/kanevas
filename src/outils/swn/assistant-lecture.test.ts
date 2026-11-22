import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Critère de sortie de kanevas-carte-spatiale-outils-lecture : `swn_lire_systeme` par `catalogueDe` (B-94, AD-outils-1 à 3).
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('../../services/swn/cache-blocs.js');
const { plagesDe } = await import('./regles/forme.js');
const { poserActivation } = await import('../../services/outils.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');

const FS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
const tire = { q: FS.systemes[0].entree.q as number, r: FS.systemes[0].entree.r as number };
const DEF = { q: 40, r: -7 };
const CACHE = { q: 41, r: -7 };

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
  const FG = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
  db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run(FS.graine, FG.densites.defaut, g);
  for (const z of FG.densites.zones) {
    db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, univers, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const fiche = (titre: string, lisent: boolean) => {
    const id = db.prepare("INSERT INTO fiches (cle, creee_via, univers_id, type, titre, charge, cree_le, modifie_le) VALUES ('k' || hex(randomblob(6)), 'ecran', ?, 'lieu', ?, '{}', 1, 1)").run(univers, titre).lastInsertRowid as number;
    db.prepare("INSERT INTO sections (cle, fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES ('k' || hex(randomblob(6)), ?, 'Texte', 1, '', '2026-01-01', ?)").run(id, lisent ? 1 : 0);
    return id;
  };
  const lisible = fiche('Port public', true);
  const cachee = fiche('Port du MJ', false);
  const poser = (c: { q: number; r: number }, nom: string, secret: boolean) => db.prepare(
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)")
    .run(g, univers, `s${c.q}`, nom, c.q, c.r, secret ? 1 : 0).lastInsertRowid as number;
  const sid = poser(DEF, 'Port défini', false);
  const astre = (cle: string, genre: string, type: string, o: Record<string, unknown>) => db.prepare(
    "INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect, fiche_id) VALUES (?,?,?,?,0,?,?,?,?,0.1,'{}',?)")
    .run(sid, cle, genre, o.parent ?? null, type, o.nom ?? null, o.orbite ?? null, o.heure, o.fiche ?? null).lastInsertRowid as number;
  astre('e', 'etoile', 'orange', { orbite: 0, heure: 0 });
  const p = astre('p1', 'planete', 'rocheux', { orbite: 2, heure: 3, nom: 'Bellone', fiche: lisible });
  astre('p2', 'planete', 'gazeux', { orbite: 4, heure: 6, nom: 'Ombre', fiche: cachee });
  db.prepare("INSERT INTO swn_formations (systeme_id, cle, forme, nom, parametres) VALUES (?,?,?,?,?)").run(sid, 'f1', 'anneau', 'Anneau', '{"de":2.9,"a":3.3}');
  const el = db.prepare("INSERT INTO swn_elements (systeme_id, cle, genre, nom, astre_id, orbite, heure, secret) VALUES (?,?,?,?,?,?,?,?)");
  el.run(sid, 'ville', 'ville', 'Ville haute', p, null, null, 0);
  el.run(sid, 'base', 'base', 'Base secrète', null, 1, 8, 1);
  poser(CACHE, 'Station cachée', true);
  const sans = (u: string) => catalogueDe(db, cid(u), univers);
  const outil = (u: string) => (sans(u) as any).outils.find((o: any) => o.nom === 'swn_lire_systeme');
  const lire = async (u: string, args: object) => await outil(u).executer(args) as any;
  return { db, q, cid, univers, g, lire, outil, sans, cachee };
}
const INTROUVABLE = { ok: false, erreur: 'Introuvable.' };

test('catalogue : le MJ et la joueuse ont swn_lire_systeme, la joueuse aucun outil d’écriture, sans rôle introuvable', () => {
  const w = monde();
  const noms = (u: string) => (w.sans(u) as any).outils.map((o: any) => o.nom) as string[];
  assert.ok(noms('antor').includes('swn_lire_systeme'));
  assert.ok(noms('lea').includes('swn_lire_systeme'));
  assert.deepEqual(noms('lea').filter((n) => /^swn_(placer|deplacer|completer|tracer|masquer|retirer|ancrer)/.test(n)), []);
  assert.throws(() => catalogueDe(w.db, w.cid('teo'), w.univers), (e: any) => e.code === 'introuvable');
});

test('le MJ lit un système défini : deux systèmes de coordonnées, versions, lien lisible, masque et secret', async () => {
  const w = monde();
  const r = await w.lire('antor', DEF);
  assert.equal(r.ok, true);
  const d = r.donnees;
  assert.deepEqual([d.q, d.r, d.nom, d.etat, d.masque], [DEF.q, DEF.r, 'Port défini', 'defini', false]);
  assert.equal(typeof d.version_systeme, 'number');
  assert.equal(typeof d.version_generateur, 'number');
  assert.ok('transition' in d);
  const bellone = d.corps.find((c: any) => c.cle === 'p1');
  assert.deepEqual(bellone.systeme, { q: DEF.q, r: DEF.r });
  assert.equal(bellone.interieur.orbite, 2);
  assert.equal(bellone.interieur.heure, 3);
  assert.equal(typeof bellone.interieur.plan.x, 'number');
  assert.equal(typeof bellone.version, 'number');
  assert.equal(bellone.lien.titre, 'Port public');
  assert.deepEqual(Object.keys(bellone.lien).sort(), ['id', 'titre']);
  assert.equal(typeof d.formations[0].version, 'number');
  const ville = d.elements.find((e: any) => e.cle === 'ville');
  assert.equal(ville.sur, 'p1');
  assert.equal(ville.interieur.orbite, 2, 'l’élément suit son corps');
  assert.equal(ville.secret, false);
  assert.equal(typeof ville.version, 'number');
  const base = d.elements.find((e: any) => e.cle === 'base');
  assert.equal(base.secret, true);
  assert.equal(base.sur, null);
  assert.equal(JSON.stringify(d).includes('fiche_id'), false);
});

test('un lien vers une fiche illisible n’apparaît pas pour la joueuse, ni le secret, ni le masque, ni les versions', async () => {
  const w = monde();
  const r = await w.lire('lea', DEF);
  assert.equal(r.ok, true);
  const d = r.donnees;
  const txt = JSON.stringify(d);
  assert.equal(d.corps.find((c: any) => c.cle === 'p2').lien, null);
  assert.equal(d.corps.find((c: any) => c.cle === 'p1').lien.titre, 'Port public');
  assert.equal(txt.includes('Port du MJ'), false);
  assert.equal(txt.includes('Base secrète'), false);
  assert.deepEqual(d.elements.map((e: any) => e.cle), ['ville']);
  assert.equal('secret' in d.elements[0], false);
  assert.equal('masque' in d, false);
  assert.equal(txt.includes('"secret"'), false);
  assert.equal(txt.includes('"masque"'), false);
});

test('système masqué : au MJ avec masque:true, à la joueuse « Introuvable. » comme un inconnu', async () => {
  const w = monde();
  const mj = await w.lire('antor', CACHE);
  assert.equal(mj.ok, true);
  assert.equal(mj.donnees.masque, true);
  assert.deepEqual(await w.lire('lea', CACHE), INTROUVABLE);
  assert.deepEqual(await w.lire('lea', { q: 999, r: 999 }), INTROUVABLE);
  assert.deepEqual(await w.lire('antor', { q: 999, r: 999 }), INTROUVABLE);
});

test('système tiré : état, graine neutre, version_systeme = version de la galaxie pour le MJ ; la joueuse n’a aucun jeton', async () => {
  const w = monde();
  const mj = await w.lire('antor', tire);
  assert.equal(mj.ok, true, JSON.stringify(mj));
  assert.equal(mj.ok, true);
  assert.equal(mj.donnees.etat, 'tire');
  assert.equal(mj.donnees.nom, null);
  assert.equal(mj.donnees.version_systeme, (w.q('SELECT version FROM swn_galaxies WHERE id=?', w.g)[0]).version);
  assert.ok(mj.donnees.corps.length > 0);
  assert.ok(mj.donnees.corps.every((c: any) => c.version === 1));
  assert.equal(mj.donnees.corps[0].interieur.heure !== undefined, true);
  const lea = await w.lire('lea', tire);
  assert.equal(lea.ok, true);
  assert.equal(lea.donnees.etat, 'tire');
  assert.ok(lea.donnees.corps.every((c: any) => !('version' in c) || c.version === undefined));
  assert.equal(lea.donnees.version_systeme, undefined);
  assert.equal('masque' in lea.donnees, false);
});

test('galaxie facultative si une seule lisible ; deux lisibles : « Précisez la galaxie. » ; nom inconnu ; paramètres faux', async () => {
  const w = monde();
  assert.equal((await w.lire('lea', DEF)).ok, true);
  assert.equal((await w.lire('lea', { ...DEF, galaxie: "galaxie d'ESSAI" })).ok, true);
  assert.deepEqual(await w.lire('lea', { ...DEF, galaxie: 'Nulle part' }), INTROUVABLE);
  for (const mauvais of [{ q: 1 }, { q: 1.5, r: 0 }, { q: 'a', r: 0 }, { ...DEF, depart: 'x' }, { ...DEF, galaxie: 3 }])
    assert.deepEqual(await w.lire('lea', mauvais), { ok: false, erreur: 'Paramètres invalides.' }, JSON.stringify(mauvais));
  w.db.prepare("INSERT INTO swn_galaxies (univers_id, titre, visible, graine) VALUES (?, 'Autre', 1, 'x')").run(w.univers);
  assert.deepEqual(await w.lire('lea', DEF), { ok: false, erreur: 'Précisez la galaxie.' });
  assert.equal((await w.lire('lea', { ...DEF, galaxie: "Galaxie d'essai" })).ok, true);
  w.db.prepare('UPDATE swn_galaxies SET visible = 0').run();
  assert.deepEqual(await w.lire('lea', DEF), INTROUVABLE);
});

test('aucun écrit, aucun événement', async () => {
  const w = monde();
  const photo = () => ['swn_astres', 'swn_formations', 'swn_systemes', 'swn_elements', 'swn_galaxies'].map((t) => JSON.stringify(w.q(`SELECT * FROM ${t}`)));
  const avant = photo();
  const r = await w.lire('antor', DEF);
  assert.equal('evenement' in r, false);
  await w.lire('antor', tire);
  assert.deepEqual(photo(), avant);
});

test('outil désactivé : absent du catalogue de chacun', () => {
  const w = monde();
  const noms = (u: string) => (w.sans(u) as any).outils.map((o: any) => o.nom) as string[];
  poserActivation(w.db, w.cid('antor'), { niveau: 'systeme', id: w.q('SELECT systeme_id FROM univers WHERE id = ?', w.univers)[0].systeme_id }, 'swn/galaxie', false);
  assert.equal(noms('antor').includes('swn_lire_systeme'), false);
  assert.equal(noms('lea').includes('swn_lire_systeme'), false);
});

test('source : ni SQL ni nom de table swn_ (hors le nom des outils) dans assistant*.ts', () => {
  for (const f of ['assistant.ts']) {
    const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
    assert.equal(/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|SELECT\s)/i.test(src), false, 'SQL');
    assert.equal(/\bswn_(astres|formations|elements|systemes|galaxies|routes|zones|reglages|aspects)\b/.test(src), false, 'table');
  }
});
