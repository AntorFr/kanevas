import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-format-evolue-routes : B-81, T-4, T-7, T-9 (service, import, document MJ, montée).
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const e = await import('./ecriture-carte.js');
const { lireBlocs, lireRoute } = await import('./lecture-carte.js');
const { importerGalaxie } = await import('./import-galaxie.js');
const { creerGalaxie } = await import('./galaxies.js');
const d = await import('./document.js');
const src = await import('./document-source.js');
const { etatGere } = await import('../sections-gerees.js');
const { redigerDocumentMJ } = await import('../../outils/swn/regles/document.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');

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
type W = ReturnType<typeof monde>;
const err = (f: () => unknown): any => { try { f(); } catch (x) { return x; } assert.fail("pas d'erreur"); };
const R0 = { bx: -3, by: -3 }, R1 = { bx: 3, by: 3 };
const type = (w: W, id: number) => w.q('SELECT type_lien FROM swn_routes WHERE id=?', id)[0].type_lien as string | null;
function route(w: W, extra: object = {}) {
  e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { nom: 'Port Noir', q: 30, r: 30 });
  return e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'port-noir', vers: 'vael', ...extra });
}

test('tracer avec un type : écrit, rogné, lu au niveau mj et joueur ; sans type : nul et clé absente', () => {
  const w = monde();
  const r = route(w, { type_lien: '  Pirate ' });
  assert.equal(type(w, r.id), 'Pirate');
  assert.equal(lireRoute(w.db, w.a('antor'), w.univers, w.g, r.id).type_lien, 'Pirate');
  const vue = lireBlocs(w.db, w.a('antor'), w.univers, w.g, R0, R1);
  for (const ro of vue.routes.filter((x) => x.id !== r.id)) assert.equal(Object.hasOwn(ro, 'type_lien'), false, 'les routes du semis, sans type, n’ont pas la clé');
  // Léa lit les routes publiques du semis : aucune clé type_lien
  for (const ro of lireBlocs(w.db, w.a('lea'), w.univers, w.g, R0, R1).routes.filter((x) => x.id !== r.id)) assert.equal(Object.hasOwn(ro, 'type_lien'), false);
});

test('type de 40 caractères accepté, 41 refusé (champ type_lien), espaces seuls refusés, jamais écrit', () => {
  const w = monde();
  const avant = w.q('SELECT count(*) n FROM swn_routes')[0].n;
  e.placerSysteme(w.db, w.a('antor'), w.univers, w.g, { nom: 'Port Noir', q: 30, r: 30 });
  for (const mauvais of ['x'.repeat(41), '   ', '', '\n\t', 12, true]) {
    const x = err(() => e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'port-noir', vers: 'vael', type_lien: mauvais }));
    assert.equal(x.code, 'invalide', String(mauvais));
    assert.equal(x.champ, 'type_lien');
  }
  assert.equal(w.q('SELECT count(*) n FROM swn_routes')[0].n, avant);
  const ok = e.tracerRoute(w.db, w.a('antor'), w.univers, w.g, { depuis: 'port-noir', vers: 'vael', type_lien: 'y'.repeat(40) });
  assert.equal(type(w, ok.id), 'y'.repeat(40));
  // 40 caractères + espaces autour = 40 après rognage
  const r2 = e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, ok.id, { type_lien: `  ${'z'.repeat(40)}  `, version: 1 });
  assert.equal(r2.version, 2);
  const m = err(() => e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, ok.id, { type_lien: 'x'.repeat(41), version: 2 }));
  assert.equal(m.champ, 'type_lien');
  const b = err(() => e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, ok.id, { type_lien: '  ', version: 2 }));
  assert.equal(b.code, 'invalide');
  assert.equal(b.champ, 'type_lien');
  assert.equal(type(w, ok.id), 'z'.repeat(40));
});

test('modifier : type seul monte la version, null le retire, absent le laisse ; publique seule garde le type', () => {
  const w = monde();
  const r = route(w);
  assert.equal(type(w, r.id), null);
  assert.equal(e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, r.id, { type_lien: 'Pirate', version: 1 }).version, 2);
  assert.equal(w.q('SELECT publique FROM swn_routes WHERE id=?', r.id)[0].publique, 1);
  assert.equal(e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, r.id, { publique: false, version: 2 }).version, 3);
  assert.equal(type(w, r.id), 'Pirate');
  assert.equal(e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, r.id, { type_lien: null, version: 3 }).version, 4);
  assert.equal(type(w, r.id), null);
  assert.equal(w.q('SELECT publique FROM swn_routes WHERE id=?', r.id)[0].publique, 0);
  // version périmée : rien n'est écrit
  const p = err(() => e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, r.id, { type_lien: 'Tard', version: 1 }));
  assert.equal(p.code, 'conflit');
  assert.equal(type(w, r.id), null);
});

test('Léa et Roxane (non MJ) ne peuvent ni tracer ni modifier un type ; Antor en mode joueur non plus', () => {
  const w = monde();
  const r = route(w);
  for (const who of [w.a('lea'), w.a('roxane'), w.a('antor', true)]) {
    err(() => e.tracerRoute(w.db, who, w.univers, w.g, { depuis: 'vael', vers: 'argent', type_lien: 'Pirate' }));
    err(() => e.modifierRoute(w.db, who, w.univers, w.g, r.id, { type_lien: 'Pirate', version: 1 }));
  }
  assert.equal(type(w, r.id), null);
  assert.equal(w.q("SELECT count(*) n FROM swn_routes WHERE type_lien IS NOT NULL")[0].n, 0);
});

test('vue : route privée avec type — absente de la vue de Léa (type compris) et d’Antor en mode joueur, portée par Antor pour les deux états', () => {
  const w = monde();
  const r = route(w, { type_lien: 'Pirate' });
  const ids = (who: ReturnType<W['a']>) => lireBlocs(w.db, who, w.univers, w.g, { bx: -2, by: -2 }, { bx: 9, by: 9 }).routes;
  const trouve = (who: ReturnType<W['a']>) => ids(who).find((x) => x.id === r.id);
  assert.equal(trouve(w.a('lea'))?.type_lien, 'Pirate');
  assert.equal(trouve(w.a('antor'))?.type_lien, 'Pirate');
  e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, r.id, { publique: false, version: 1 });
  viderCacheBlocs();
  assert.equal(trouve(w.a('lea')), undefined);
  assert.equal(JSON.stringify(ids(w.a('lea'))).includes('Pirate'), false);
  assert.equal(trouve(w.a('antor', true)), undefined);
  assert.equal(JSON.stringify(ids(w.a('antor', true))).includes('Pirate'), false);
  assert.equal(trouve(w.a('antor'))?.type_lien, 'Pirate');
  assert.equal(trouve(w.a('antor'))?.publique, false);
  err(() => lireRoute(w.db, w.a('lea'), w.univers, w.g, r.id));
});

// --- document MJ (T-7) ---
const vueDoc = (routes: object[]) => ({ titre: 'G', systemes: [], zones: [], routes }) as never;
test('redigerDocumentMJ : le type vient après la longueur et avant « privée », aplati sur une ligne', () => {
  const t = (r: object) => redigerDocumentMJ(vueDoc([{ depuis: 'Port-Sel', vers: 'Vael', longueur: 7, publique: true, ...r }])).split('\n').filter((l) => l.startsWith('- Port'));
  assert.deepEqual(t({ typeLien: 'Pirate' }), ['- Port-Sel — Vael · 7 cases · Pirate']);
  assert.deepEqual(t({ typeLien: 'Pirate', publique: false }), ['- Port-Sel — Vael · 7 cases · Pirate · privée']);
  assert.deepEqual(t({}), ['- Port-Sel — Vael · 7 cases']);
  assert.deepEqual(t({ typeLien: null, publique: false }), ['- Port-Sel — Vael · 7 cases · privée']);
  assert.deepEqual(t({ typeLien: 'Rou\n\n  te  :::\nfausse' }), ['- Port-Sel — Vael · 7 cases · Rou te ::: fausse']);
  const doc = redigerDocumentMJ(vueDoc([{ depuis: 'A', vers: 'B', longueur: 1, publique: true, typeLien: 'x\n:::\ny' }]));
  assert.equal(doc.split('\n').filter((l) => l.startsWith(':::')).length, 2, 'aucune ligne :::  ajoutée par le type');
});

test('document MJ de la base : « Port-Sel — Vael · 7 cases · Pirate », puis privée ; section périmée après un changement de type seul', () => {
  const w = monde();
  const ro = w.q(`SELECT ro.* FROM swn_routes ro JOIN swn_systemes a ON a.id=ro.depuis_id JOIN swn_systemes b ON b.id=ro.vers_id
    WHERE a.cle IN ('port-sel','vael') AND b.cle IN ('port-sel','vael')`)[0];
  const doc = d.poserDocumentMJ(w.db, w.a('antor'), w.univers, w.g, { creer: { titre: 'Notes' } }, w.q('SELECT version FROM swn_galaxies WHERE id=?', w.g)[0].version);
  const s = () => w.q('SELECT * FROM sections WHERE id = ?', doc.sectionId)[0];
  assert.equal(etatGere(w.db, w.a('antor'), w.univers, s())!.etat, 'a_jour');
  e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, ro.id, { type_lien: 'Pirate', version: ro.version });
  assert.equal(etatGere(w.db, w.a('antor'), w.univers, s())!.etat, 'perime');
  const g = w.q('SELECT * FROM swn_galaxies WHERE id=?', w.g)[0];
  const texte = src.produireGalaxie(w.db, w.a('antor'), w.univers, g).contenu;
  assert.ok(texte.split('\n').includes('- Port-Sel — Vael · 7 cases · Pirate'), texte);
  e.modifierRoute(w.db, w.a('antor'), w.univers, w.g, ro.id, { publique: false, version: ro.version + 1 });
  assert.ok(src.produireGalaxie(w.db, w.a('antor'), w.univers, g).contenu.split('\n').includes('- Port-Sel — Vael · 7 cases · Pirate · privée'));
});

// --- import (T-9) ---
function galaxieImport() {
  const w = monde();
  const gid = creerGalaxie(w.db, w.a('antor').compteId, w.univers, { titre: 'Import' }).id;
  const A = { compteId: w.a('antor').compteId };
  const f = (type?: unknown, extra: object = {}) => ({
    systemes: [{ cle: 'aa', nom: 'Aa', q: 0, r: 0 }, { cle: 'bb', nom: 'Bb', q: 3, r: 0 }],
    routes: [{ depuis: 'aa', vers: 'bb', ...(type === undefined ? {} : { type_lien: type }), ...extra }],
  });
  const imp = (corps: unknown) => importerGalaxie(w.db, A, w.univers, gid, corps);
  const ro = () => w.q('SELECT * FROM swn_routes WHERE galaxie_id=?', gid)[0];
  return { w, gid, A, f, imp, ro };
}
const HORS = 'Modifié dans Kanevas depuis le dernier import.';

test('import : route avec type créée, rejeu inchangé sans version montée ; type absent du fichier = aucun type', () => {
  const { f, imp, ro } = galaxieImport();
  assert.equal(imp(f('Pirate')).natures.routes.creees, 1);
  assert.equal(ro().type_lien, 'Pirate');
  assert.equal(ro().version_importee, ro().version);
  const v = ro().version;
  const r2 = imp(f('Pirate'));
  assert.deepEqual(r2.natures.routes, { creees: 0, mises_a_jour: 0, inchangees: 1, refusees: 0 });
  assert.equal(ro().version, v);
  const sans = imp(f());
  assert.deepEqual(sans.natures.routes, { creees: 0, mises_a_jour: 1, inchangees: 0, refusees: 0 }, 'rejeu sans type_lien = item différent');
  assert.equal(ro().type_lien, null);
  assert.equal(ro().version, v + 1);
  assert.equal(ro().version_importee, ro().version);
  assert.equal(imp(f(null)).natures.routes.inchangees, 1, 'null = aucun');
});

test('import : autre type = mises_a_jour en phase ; route éditée par le MJ : refus « Modifié… » pour un autre type et pour un type retiré, rien écrit', () => {
  const { w, gid, A, f, imp, ro } = galaxieImport();
  imp(f('Pirate'));
  assert.equal(imp(f('Marchande')).natures.routes.mises_a_jour, 1);
  assert.equal(ro().type_lien, 'Marchande');
  e.modifierRoute(w.db, A, w.univers, gid, ro().id, { publique: false, version: ro().version });
  for (const corps of [f('Autre', { publique: false }), f(undefined, { publique: false })]) {
    const r = imp(corps);
    assert.equal(r.natures.routes.refusees, 1);
    assert.equal(r.refus[0]!.raison, HORS);
    assert.equal(ro().type_lien, 'Marchande');
  }
  // égal au fichier : inchangé même hors phase
  assert.equal(imp(f('Marchande', { publique: false })).natures.routes.inchangees, 1);
  // un type modifié à la main hors fichier, puis fichier avec ce type : inchangé
  e.modifierRoute(w.db, A, w.univers, gid, ro().id, { type_lien: 'Main', version: ro().version });
  assert.equal(imp(f('Main', { publique: false })).natures.routes.inchangees, 1);
  assert.equal(imp(f('Main', { publique: false })).natures.routes.refusees, 0);
});

test('import : type de 41 caractères ou d’espaces refusé avec champ routes[0].type_lien, le reste passe, rien écrit pour la route', () => {
  const { imp, ro, f } = galaxieImport();
  for (const mauvais of ['x'.repeat(41), '    ', '', 5]) {
    const r = imp(f(mauvais));
    assert.equal(r.natures.routes.refusees, 1, String(mauvais));
    assert.equal(r.refus[0]!.champ, 'routes[0].type_lien');
    assert.equal(r.natures.systemes.creees + r.natures.systemes.inchangees, 2);
  }
  assert.equal(ro(), undefined);
  assert.equal(imp(f('x'.repeat(40))).natures.routes.creees, 1);
});

test('import : déplacer un système remet en phase une route typée ; le type est gardé', () => {
  const { imp, ro, f } = galaxieImport();
  imp(f('Pirate'));
  const g = f('Pirate');
  g.systemes[1]!.q = 5;
  imp(g);
  assert.equal(ro().type_lien, 'Pirate');
  assert.equal(ro().version_importee, ro().version);
  assert.equal(imp(f('Autre').systemes && { ...g, routes: [{ depuis: 'aa', vers: 'bb', type_lien: 'Autre' }] }).natures.routes.mises_a_jour, 1);
});

// --- montée ---
test('0027 : montée depuis 0026 peuplée, routes conservées, type_lien nul ; CHECK 1–40 en base', () => {
  const SRC = new URL('../../db/migrations/', import.meta.url).pathname;
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const fch of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(fch) && Number(fch.slice(0, 4)) <= 26) copyFileSync(SRC + fch, dir + fch);
  const db = openDb(':memory:');
  migrate(db, dir);
  const dt = '2026-10-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(dt);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', ?)").run(dt);
  db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, visible, graine, densite_defaut, version) VALUES (1, 1, 'G', 0, 'abc', 0.2, 1)").run();
  for (const [id, cle, q] of [[1, 'a', 0], [2, 'b', 3]] as const) {
    db.prepare("INSERT INTO swn_systemes (id, galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?, 1, 1, ?, ?, ?, 0, 3, 'accent', '', 0, 0)").run(id, cle, cle, q);
  }
  db.prepare("INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (1, 1, 1, 2, 0, 3)").run();
  const avant = db.prepare('SELECT * FROM swn_routes').all() as any[];
  assert.deepEqual(migrate(db), [27, 28, 29, 30, 31, 32, 33, 34, 35]);
  const apres = db.prepare('SELECT * FROM swn_routes').all() as any[];
  assert.equal(apres.length, 1);
  assert.equal(apres[0].type_lien, null);
  const { type_lien, ...reste } = apres[0];
  assert.deepEqual(reste, avant[0]);
  const ecrire = (t: string) => db.prepare('UPDATE swn_routes SET type_lien = ?').run(t);
  assert.throws(() => ecrire(''));
  assert.throws(() => ecrire('x'.repeat(41)));
  ecrire('x'.repeat(40));
});
