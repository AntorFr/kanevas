import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-galaxie-tenir-galaxies : la vie d'une galaxie (T-1, T-6, AD-132).
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { poserActivation, listerCartesOutils } = await import('../outils.js');
const g = await import('./galaxies.js');
const { lireBlocs } = await import('./lecture-carte.js');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const essai = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  const a = (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur });
  const n = (t: string) => (q(`SELECT count(*) n FROM ${t}`)[0].n as number);
  return { db, q, univers, essai, a, n };
}
const err = (f: () => unknown): any => { try { f(); } catch (x) { return x; } assert.fail("pas d'erreur"); };
const total = (w: ReturnType<typeof monde>) => w.q('SELECT * FROM swn_galaxies');

test('création : Antor et Mira, invisible, graine hexadécimale de 12, version 1, densité 0,2', () => {
  const w = monde();
  for (const u of ['antor', 'mira']) {
    const { id } = g.creerGalaxie(w.db, w.a(u), w.univers, { titre: 'Galaxie neuve' });
    const l = w.q('SELECT * FROM swn_galaxies WHERE id=?', id)[0];
    assert.equal(l.titre, 'Galaxie neuve');
    assert.equal(l.visible, 0);
    assert.match(l.graine, /^[0-9a-f]{12}$/);
    assert.equal(l.version, 1);
    assert.equal(l.densite_defaut, 0.2);
    assert.equal(l.univers_id, w.univers);
  }
  const graines = w.q("SELECT graine FROM swn_galaxies WHERE titre='Galaxie neuve'").map((r) => r.graine);
  assert.notEqual(graines[0], graines[1]);
});

test('création : refus selon le rôle, rien écrit', () => {
  const w = monde();
  const avant = total(w);
  const cas: [string, boolean, string, string | undefined][] = [
    ['lea', false, 'refuse', undefined], ['roxane', false, 'refuse', undefined],
    ['antor', true, 'refuse', 'mode_joueur'], ['teo', false, 'introuvable', undefined],
  ];
  for (const [u, mj, code, detail] of cas) {
    const e = err(() => g.creerGalaxie(w.db, w.a(u, mj), w.univers, { titre: 'X' }));
    assert.equal(e.code, code, u);
    assert.equal(e.detail, detail, u);
  }
  assert.equal(err(() => g.creerGalaxie(w.db, w.a('antor'), 999999, { titre: 'X' })).code, 'introuvable');
  assert.deepEqual(total(w), avant);
});

test('création : outil désactivé → introuvable pour le MJ aussi', () => {
  const w = monde();
  poserActivation(w.db, w.a('antor'), { niveau: 'univers', id: w.univers }, 'swn/galaxie', false);
  assert.equal(err(() => g.creerGalaxie(w.db, w.a('antor'), w.univers, { titre: 'X' })).code, 'introuvable');
  assert.equal(err(() => g.renommerGalaxie(w.db, w.a('antor'), w.univers, w.essai, { titre: 'X', version: 1 })).code, 'introuvable');
});

test('titre : vide, blancs, 81 caractères et non-texte → invalide (champ titre) ; 80 passe', () => {
  const w = monde();
  for (const t of ['', '   ', 'a'.repeat(81), undefined, 5, null]) {
    const e = err(() => g.creerGalaxie(w.db, w.a('antor'), w.univers, { titre: t }));
    assert.equal(e.code, 'invalide');
    assert.equal(e.champ, 'titre');
  }
  assert.equal(w.n('swn_galaxies'), 1);
  g.creerGalaxie(w.db, w.a('antor'), w.univers, { titre: 'a'.repeat(80) });
  assert.equal(w.n('swn_galaxies'), 2);
  const e = err(() => g.renommerGalaxie(w.db, w.a('antor'), w.univers, w.essai, { titre: 'a'.repeat(81), version: 1 }));
  assert.equal(e.code, 'invalide');
  assert.equal(w.q('SELECT titre FROM swn_galaxies WHERE id=?', w.essai)[0].titre, "Galaxie d'essai");
});

test('renommer : version lue réussit (v2), version périmée → conflit donnee_modifiee, rien écrit', () => {
  const w = monde();
  assert.deepEqual(g.renommerGalaxie(w.db, w.a('antor'), w.univers, w.essai, { titre: 'Galaxie du bord', version: 1 }), { version: 2 });
  const l = w.q('SELECT titre, version FROM swn_galaxies WHERE id=?', w.essai)[0];
  assert.deepEqual([l.titre, l.version], ['Galaxie du bord', 2]);
  const e = err(() => g.renommerGalaxie(w.db, w.a('mira'), w.univers, w.essai, { titre: 'Autre', version: 1 }));
  assert.equal(e.code, 'conflit');
  assert.equal(e.detail, 'donnee_modifiee');
  assert.equal(w.q('SELECT titre, version FROM swn_galaxies WHERE id=?', w.essai)[0].titre, 'Galaxie du bord');
  for (const v of [undefined, 0, 1.5, '2', null]) {
    assert.equal(err(() => g.renommerGalaxie(w.db, w.a('antor'), w.univers, w.essai, { titre: 'Z', version: v })).code, 'invalide');
  }
});

test('écritures : Léa, Roxane, mode Joueur refuse ; Teo, étranger, galaxie d\'un autre univers introuvable', () => {
  const w = monde();
  const avant = total(w);
  const autreUnivers = w.q('SELECT id FROM univers WHERE nom = ?', 'Univers voisin')[0].id;
  const ops: [string, (u: any) => unknown][] = [
    ['renommer', (u) => g.renommerGalaxie(w.db, u, w.univers, w.essai, { titre: 'X', version: 1 })],
    ['visible', (u) => g.rendreVisibleGalaxie(w.db, u, w.univers, w.essai, false, 1)],
    ['graine', (u) => g.changerGraine(w.db, u, w.univers, w.essai, { graine: 'z', version: 1, confirme: true })],
    ['contenu', (u) => g.contenuGalaxie(w.db, u, w.univers, w.essai)],
    ['supprimer', (u) => g.supprimerGalaxie(w.db, u, w.univers, w.essai, 1, { systemes: 4, routes: 3, zones: 1 })],
  ];
  for (const [nom, op] of ops) {
    assert.equal(err(() => op(w.a('lea'))).code, 'refuse', `${nom} lea`);
    assert.equal(err(() => op(w.a('roxane'))).code, 'refuse', `${nom} roxane`);
    const mj = err(() => op(w.a('antor', true)));
    assert.deepEqual([mj.code, mj.detail], ['refuse', 'mode_joueur'], `${nom} mode joueur`);
    assert.equal(err(() => op(w.a('teo'))).code, 'introuvable', `${nom} teo`);
  }
  assert.equal(err(() => g.renommerGalaxie(w.db, w.a('antor'), autreUnivers, w.essai, { titre: 'X', version: 1 })).code, 'introuvable');
  assert.equal(err(() => g.renommerGalaxie(w.db, w.a('antor'), w.univers, 999999, { titre: 'X', version: 1 })).code, 'introuvable');
  assert.deepEqual(total(w), avant);
  assert.equal(w.n('swn_systemes'), 4);
});

test('visibilité : rendre visible apparaît chez Léa, cacher retire, cachée → introuvable pour Léa', () => {
  const w = monde();
  const { id } = g.creerGalaxie(w.db, w.a('antor'), w.univers, { titre: 'Galaxie neuve' });
  const titres = (u: string) => listerCartesOutils(w.db, w.a(u), w.univers).map((c) => c.titre);
  assert.ok(!titres('lea').includes('Galaxie neuve'));
  assert.ok(titres('antor').includes('Galaxie neuve'));
  assert.equal(err(() => g.galaxieLisible(w.db, w.a('lea'), w.univers, id)).code, 'introuvable');
  assert.deepEqual(g.rendreVisibleGalaxie(w.db, w.a('antor'), w.univers, id, true, 1), { version: 2 });
  assert.ok(titres('lea').includes('Galaxie neuve'));
  assert.equal(g.galaxieLisible(w.db, w.a('lea'), w.univers, id).galaxie.id, id);
  assert.deepEqual(g.rendreVisibleGalaxie(w.db, w.a('antor'), w.univers, id, false, 2), { version: 3 });
  assert.ok(!titres('lea').includes('Galaxie neuve'));
  assert.equal(err(() => g.galaxieLisible(w.db, w.a('lea'), w.univers, id)).code, 'introuvable');
  const e = err(() => g.rendreVisibleGalaxie(w.db, w.a('antor'), w.univers, id, true, 2));
  assert.deepEqual([e.code, e.detail], ['conflit', 'donnee_modifiee']);
  assert.equal(err(() => g.rendreVisibleGalaxie(w.db, w.a('antor'), w.univers, id, 'oui', 3)).code, 'invalide');
  assert.equal(err(() => g.rendreVisibleGalaxie(w.db, w.a('antor'), w.univers, id, 1, 3)).code, 'invalide');
});

test('graine : sans confirme:true → invalide (champ confirme) sans rien changer', () => {
  const w = monde();
  for (const c of [undefined, false, 'true', 1]) {
    const e = err(() => g.changerGraine(w.db, w.a('antor'), w.univers, w.essai, { graine: 'neuve', version: 1, confirme: c }));
    assert.equal(e.code, 'invalide');
    assert.equal(e.champ, 'confirme');
  }
  const l = w.q('SELECT graine, version FROM swn_galaxies WHERE id=?', w.essai)[0];
  assert.deepEqual([l.graine, l.version], ['essai-1', 1]);
  for (const gr of ['', '  ', 'x'.repeat(65), 3]) {
    assert.equal(err(() => g.changerGraine(w.db, w.a('antor'), w.univers, w.essai, { graine: gr, version: 1, confirme: true })).champ, 'graine');
  }
});

test('graine : avec confirme, version +1, système défini garde son (q, r), le bloc (0,0) change', () => {
  const w = monde();
  w.db.prepare(`INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r) VALUES (?, ?, 'inseré', 'Inséré', 9, 9)`)
    .run(w.essai, w.univers);
  const lire = () => JSON.stringify(lireBlocs(w.db, w.a('antor'), w.univers, w.essai, { bx: 0, by: 0 }, { bx: 0, by: 0 }).blocs);
  const avant = lire();
  assert.deepEqual(g.changerGraine(w.db, w.a('antor'), w.univers, w.essai, { graine: 'autre-graine', version: 1, confirme: true }), { version: 2 });
  const apres = lire();
  assert.notEqual(avant, apres);
  const s = w.q("SELECT q, r FROM swn_systemes WHERE cle='inseré'")[0];
  assert.deepEqual([s.q, s.r], [9, 9]);
  assert.equal(w.q('SELECT graine FROM swn_galaxies WHERE id=?', w.essai)[0].graine, 'autre-graine');
  assert.equal(err(() => g.changerGraine(w.db, w.a('antor'), w.univers, w.essai, { graine: 'encore', version: 1, confirme: true })).detail, 'donnee_modifiee');
});

test('contenuGalaxie : 4 systèmes, 3 routes, 1 zone, document absent', () => {
  const w = monde();
  assert.deepEqual(g.contenuGalaxie(w.db, w.a('antor'), w.univers, w.essai), { systemes: 4, routes: 3, zones: 1, document: null });
});

test('suppression : décomptes faux → conflit contenu_change sans rien supprimer ; bons → tout part', () => {
  const w = monde();
  const { id } = g.creerGalaxie(w.db, w.a('antor'), w.univers, { titre: 'Autre' });
  for (const vu of [{ systemes: 3, routes: 3, zones: 1 }, { systemes: 4, routes: 2, zones: 1 }, { systemes: 4, routes: 3, zones: 0 }]) {
    const e = err(() => g.supprimerGalaxie(w.db, w.a('antor'), w.univers, w.essai, 1, vu));
    assert.deepEqual([e.code, e.detail], ['conflit', 'contenu_change']);
  }
  assert.deepEqual([w.n('swn_galaxies'), w.n('swn_systemes'), w.n('swn_routes'), w.n('swn_zones')], [2, 4, 3, 1]);
  for (const vu of [undefined, null, {}, { systemes: '4', routes: 3, zones: 1 }]) {
    assert.equal(err(() => g.supprimerGalaxie(w.db, w.a('antor'), w.univers, w.essai, 1, vu)).code, 'invalide');
  }
  const p = err(() => g.supprimerGalaxie(w.db, w.a('antor'), w.univers, w.essai, 7, { systemes: 4, routes: 3, zones: 1 }));
  assert.deepEqual([p.code, p.detail], ['conflit', 'donnee_modifiee']);
  assert.equal(w.n('swn_galaxies'), 2);
  g.supprimerGalaxie(w.db, w.a('antor'), w.univers, w.essai, 1, { systemes: 4, routes: 3, zones: 1 });
  assert.deepEqual([w.n('swn_galaxies'), w.n('swn_systemes'), w.n('swn_routes'), w.n('swn_zones')], [1, 0, 0, 0]);
  assert.equal(w.q('SELECT id FROM swn_galaxies')[0].id, id);
});
