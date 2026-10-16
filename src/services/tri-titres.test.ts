// Review of kanevas-arbre-fiche: title order ignores accents and case (« Léa » with « Lea », before « Les »),
// and the page cursor neither skips nor repeats a sheet across such titles.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { creerUnivers } = await import('./univers.js');
const { creerFiche, listerFiches, listerEnfants, deplacerFiche } = await import('./fiches.js');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const c = assurerCompte(db, 'mj');
  const u = creerUnivers(db, c.id, { nom: 'U' });
  return { db, c, u };
}

const TITRES = ['Les Docks', 'Léa', 'Zoé', 'Élan', 'abel', 'Lea', 'Les Sphères'];
// Expected key order, by hand: abel, Élan, Léa/Lea (tie broken by id: Léa created first), Les Docks, Les Sphères, Zoé.
const ATTENDU = ['abel', 'Élan', 'Léa', 'Lea', 'Les Docks', 'Les Sphères', 'Zoé'];

test('listerFiches : tri sans accents ni casse, curseur sans trou ni doublon', () => {
  const { db, c, u } = monde();
  for (const t of TITRES) creerFiche(db, c.id, u.id, { type: 'lieu', titre: t });
  const tout = listerFiches(db, { compteId: c.id }, u.id, {}).fiches.map((f) => f.titre);
  assert.deepEqual(tout, ATTENDU);
  const vus: string[] = [];
  let curseur: string | undefined;
  for (let i = 0; i < 10; i++) {
    const p = listerFiches(db, { compteId: c.id }, u.id, { limite: 2, curseur });
    vus.push(...p.fiches.map((f) => f.titre));
    if (p.suivant === null) break;
    curseur = p.suivant;
  }
  assert.deepEqual(vus, ATTENDU);
});

test('listerEnfants : même ordre accent-insensible', () => {
  const { db, c, u } = monde();
  const racine = creerFiche(db, c.id, u.id, { type: 'lieu', titre: 'Racine' });
  for (const t of TITRES) {
    const f = creerFiche(db, c.id, u.id, { type: 'lieu', titre: t });
    deplacerFiche(db, { compteId: c.id }, u.id, f.id, racine.id);
  }
  const e = listerEnfants(db, { compteId: c.id }, u.id, racine.id).enfants.map((x) => x.titre);
  assert.deepEqual(e, ATTENDU);
});
