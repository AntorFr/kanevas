import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-carte-sorties: lireSorties lists the readable routes towards a readable
// neighbour at the neighbour's hour (12 at the top, 3 at the right); a private route or a hidden neighbour leaves no
// entry, no gap, no count; a hidden origin answers the very `introuvable` of lireInterieur.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const { lireSorties } = await import('./sorties.js');

const FS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
const FG = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const O = { q: 40, r: -20 };

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
  const poser = (q_: number, r: number, o: { secret?: boolean; nom?: string | null } = {}) =>
    db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',?,0)")
      .run(g, univers, `s${q_}_${r}`, o.nom === undefined ? `S ${q_} ${r}` : o.nom, q_, r, o.secret ? 1 : 0).lastInsertRowid as number;
  const route = (d: number, v: number, publique: boolean) =>
    db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?,?,?,?,?,3)')
      .run(g, univers, d, v, publique ? 1 : 0);
  return { db, univers, g, a, poser, route };
}
const code = (f: () => unknown) => { try { f(); } catch (e: any) { return `${e.code ?? e.constructor.name}|${e.message}`; } return 'aucune'; };
const tri = <T extends { q: number; r: number }>(l: T[]) => [...l].sort((x, y) => x.q - y.q || x.r - y.r);

test('une route publique vers un voisin lisible donne son entrée à l\'heure attendue, dans les deux sens', () => {
  const w = monde();
  const o = w.poser(O.q, O.r, { nom: 'Origine' });
  const e = w.poser(O.q + 1, O.r, { nom: 'Est' });      // 3 h
  const sw = w.poser(O.q, O.r + 1, { nom: 'Sud-est' }); // 5 h
  const no = w.poser(O.q, O.r - 1, { nom: 'Nord' });    // 11 h
  w.route(o, e, true);
  w.route(sw, o, true); // inverse direction
  w.route(o, no, true);
  for (const u of ['lea', 'antor']) {
    assert.deepEqual(tri(lireSorties(w.db, w.a(u), w.univers, w.g, O.q, O.r)), tri([
      { q: O.q + 1, r: O.r, heure: 3, nom: 'Est' },
      { q: O.q, r: O.r + 1, heure: 5, nom: 'Sud-est' },
      { q: O.q, r: O.r - 1, heure: 11, nom: 'Nord' },
    ]));
  }
  // From the neighbour, the exit points back at the opposite hour.
  assert.deepEqual(lireSorties(w.db, w.a('lea'), w.univers, w.g, O.q + 1, O.r), [{ q: O.q, r: O.r, heure: 9, nom: 'Origine' }]);
});

test('une route privée ne donne aucune entrée à la joueuse ni au MJ en mode joueur ; le MJ la lit', () => {
  const w = monde();
  const o = w.poser(O.q, O.r);
  const pub = w.poser(O.q + 1, O.r);
  const priv = w.poser(O.q - 1, O.r);
  w.route(o, pub, true);
  w.route(o, priv, false);
  const un = [{ q: O.q + 1, r: O.r, heure: 3, nom: `S ${O.q + 1} ${O.r}` }];
  assert.deepEqual(lireSorties(w.db, w.a('lea'), w.univers, w.g, O.q, O.r), un);
  assert.deepEqual(lireSorties(w.db, w.a('antor', true), w.univers, w.g, O.q, O.r), un);
  assert.deepEqual(tri(lireSorties(w.db, w.a('antor'), w.univers, w.g, O.q, O.r)).map((s) => s.heure), [9, 3]);
});

test('une route vers un voisin masqué ne donne aucune entrée à la joueuse ni au MJ en mode joueur ; le MJ la lit', () => {
  const w = monde();
  const o = w.poser(O.q, O.r);
  const cache = w.poser(O.q + 1, O.r, { secret: true, nom: 'Caché' });
  w.route(o, cache, true);
  assert.deepEqual(lireSorties(w.db, w.a('lea'), w.univers, w.g, O.q, O.r), []);
  assert.deepEqual(lireSorties(w.db, w.a('antor', true), w.univers, w.g, O.q, O.r), []);
  assert.deepEqual(lireSorties(w.db, w.a('antor'), w.univers, w.g, O.q, O.r), [{ q: O.q + 1, r: O.r, heure: 3, nom: 'Caché' }]);
});

test('la réponse ne trahit pas les sorties cachées : même liste avec ou sans elles, une seule entrée par voisin', () => {
  const w = monde();
  const o = w.poser(O.q, O.r);
  const v = w.poser(O.q + 1, O.r);
  w.route(o, v, true);
  const avant = lireSorties(w.db, w.a('lea'), w.univers, w.g, O.q, O.r);
  w.route(o, w.poser(O.q - 1, O.r), false);
  w.route(o, w.poser(O.q, O.r + 1, { secret: true }), true);
  assert.deepEqual(lireSorties(w.db, w.a('lea'), w.univers, w.g, O.q, O.r), avant);
  w.route(v, o, true); // a second public route to the same neighbour: still one exit
  assert.equal(lireSorties(w.db, w.a('lea'), w.univers, w.g, O.q, O.r).length, 1);
});

test('une origine masquée répond le même introuvable que lireInterieur, pour la joueuse et le MJ en mode joueur', () => {
  const w = monde();
  const o = w.poser(O.q, O.r, { secret: true });
  w.route(o, w.poser(O.q + 1, O.r), true);
  for (const [u, m] of [['lea', false], ['antor', true]] as const) {
    const attendu = code(() => lireInterieur(w.db, w.a(u, m), w.univers, w.g, O.q, O.r));
    assert.match(attendu, /^introuvable/);
    assert.equal(code(() => lireSorties(w.db, w.a(u, m), w.univers, w.g, O.q, O.r)), attendu);
  }
  assert.equal(lireSorties(w.db, w.a('antor'), w.univers, w.g, O.q, O.r).length, 1);
});

test('hexagone sans système ni étoile, galaxie inconnue : introuvable ; sans route : liste vide', () => {
  const w = monde();
  w.poser(O.q, O.r);
  assert.deepEqual(lireSorties(w.db, w.a('lea'), w.univers, w.g, O.q, O.r), []);
  assert.equal(code(() => lireSorties(w.db, w.a('lea'), w.univers, w.g + 99, O.q, O.r)), code(() => lireInterieur(w.db, w.a('lea'), w.univers, w.g + 99, O.q, O.r)));
  assert.equal(code(() => lireSorties(w.db, w.a('lea'), w.univers, w.g, NaN, 0)), code(() => lireInterieur(w.db, w.a('lea'), w.univers, w.g, NaN, 0)));
});
