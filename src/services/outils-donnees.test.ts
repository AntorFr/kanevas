import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { ajouterMembre } = await import('./membres.js');
const { creerEtRattacherSysteme, rattacherSysteme } = await import('./systemes.js');
const { creerUnivers, supprimerUnivers } = await import('./univers.js');
const { creerFiche } = await import('./fiches.js');
const o = await import('./outils.js');
const d = await import('./outils-donnees.js');
const { poserSectionGeree, libererSections } = await import('./sections-gerees.js');
const { stockageEssai } = await import('../outils/essai/catalogue.js');
const { essai } = await import('../outils/essai/index.js');
type Db = ReturnType<typeof openDb>;

const G = 'essai/g';
const U = (universId: number) => ({ niveau: 'univers' as const, universId });
const S = (systemeId: number) => ({ niveau: 'systeme' as const, systemeId });
const A = (compteId: number, modeJoueur = false) => ({ compteId, ...(modeJoueur ? { modeJoueur } : {}) });
function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string }; }
  assert.fail('aucune erreur levée');
}
const el = (cle: string) => ({ cle, donnees: { nom: cle, masse: 1, cout: 1, portee: 'courte' }, versionCatalogue: 'v1' });
const nbElements = (db: Db, where = '1=1') => (db.prepare(`SELECT COUNT(*) n FROM essai_catalogue_elements WHERE ${where}`).get() as any).n as number;
const nbRetraits = (db: Db, u: number) => (db.prepare('SELECT COUNT(*) n FROM essai_catalogue_retraits WHERE univers_id = ?').get(u) as any).n as number;

/** Antor: responsible and MJ of U1, U2 (Sys); Mira: MJ of U1; Léa: player of U1; Zoé: stranger; V: another universe of Antor, no system. */
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const mira = assurerCompte(db, 'mira').id;
  const lea = assurerCompte(db, 'lea').id;
  const zoe = assurerCompte(db, 'zoe').id;
  const u1 = creerUnivers(db, antor, { nom: 'Éneria d\'essai' }).id;
  const u2 = creerUnivers(db, antor, { nom: 'Univers voisin' }).id;
  ajouterMembre(db, antor, u1, 'mira', 'mj');
  ajouterMembre(db, antor, u1, 'lea', 'joueur');
  const sys = creerEtRattacherSysteme(db, antor, u1, { nom: 'Sys' }).id;
  rattacherSysteme(db, antor, u2, sys);
  o.poserActivation(db, antor, { niveau: 'systeme', id: sys }, G, true);
  o.poserActivation(db, antor, { niveau: 'univers', id: u1 }, G, true);
  o.poserActivation(db, antor, { niveau: 'univers', id: u2 }, G, true);
  // 2 local elements + 1 withdrawal in u1; 1 local in u2; 3 elements at the system level.
  stockageEssai.ecrire(db, { universId: u1 }, 'armes', el('a1'));
  stockageEssai.ecrire(db, { universId: u1 }, 'armes', el('a2'));
  stockageEssai.poserRetrait(db, u1, 'armes', 'x', true);
  stockageEssai.ecrire(db, { universId: u2 }, 'armes', el('b1'));
  for (const c of ['s1', 's2', 's3']) stockageEssai.ecrire(db, { systemeId: sys }, 'armes', el(c));
  return { db, antor, mira, lea, zoe, u1, u2, sys };
}
const vu = (r: { efface: { cle: string; nombre: number }[] }) => r.efface.map((l) => ({ cle: l.cle, nombre: l.nombre }));

test('résumé univers : une ligne de catalogue (3 = éléments + retrait), pas de zéro, sections gérées comptées, encoreUtilise nul', () => {
  const { db, antor, u1 } = monde();
  const f = creerFiche(db, antor, u1, { type: 'personnage', titre: 'A', charge: { pj: false } }).id;
  poserSectionGeree(db, antor, u1, { ficheId: f, outil: G, type: 'caracteristiques', contenu: 'T', sourceVersion: 'v' } as any);
  const r = d.resumeSuppression(db, A(antor), U(u1), G);
  assert.deepEqual(r.efface, [{ cle: 'catalogue', singulier: 'élément local de catalogue', pluriel: 'éléments locaux de catalogue', nombre: 3 }]);
  assert.equal(r.total, 3);
  assert.equal(r.sectionsGerees, 1);
  assert.equal(r.encoreUtilise, null);
  assert.equal(r.niveau, 'univers');
});

test('résumé système : catalogue du système, sections 0, encoreUtilise = univers où l\'outil est effectivement activé', () => {
  const { db, antor, u1, u2, sys } = monde();
  const r = d.resumeSuppression(db, A(antor), S(sys), G);
  assert.equal(r.efface.length, 1);
  assert.equal(r.efface[0].nombre, 3);
  assert.equal(r.sectionsGerees, 0);
  assert.deepEqual(r.encoreUtilise!.univers.map((u) => u.id).sort(), [u1, u2].sort());
  // u2 follows the system, the system disables the tool: u2 no longer uses it; u1 forces it on.
  o.poserActivation(db, antor, { niveau: 'univers', id: u2 }, G, null);
  o.poserActivation(db, antor, { niveau: 'systeme', id: sys }, G, false);
  const r2 = d.resumeSuppression(db, A(antor), S(sys), G);
  assert.deepEqual(r2.encoreUtilise!.univers.map((u) => u.id), [u1]);
});

test('suppression univers : efface ce niveau seulement, garde active/réglages, version_catalogue à nul, vu périmé et rejoué = conflit', () => {
  const { db, antor, u1, u2, sys } = monde();
  db.prepare('UPDATE outils_univers SET version_catalogue = ? WHERE univers_id = ? AND outil = ?').run('v1', u1, G);
  const avantLigne = db.prepare('SELECT active, visibilite_mj, visibilite_joueur, reglages FROM outils_univers WHERE univers_id = ? AND outil = ?').get(u1, G);
  const ok = vu(d.resumeSuppression(db, A(antor), U(u1), G));
  assert.deepEqual(ok, [{ cle: 'catalogue', nombre: 3 }]);
  // stale: wrong count, wrong key, empty
  for (const faux of [[{ cle: 'catalogue', nombre: 2 }], [{ cle: 'autre', nombre: 3 }], []]) {
    const e = err(() => d.supprimerDonneesOutil(db, A(antor), U(u1), G, faux));
    assert.equal(e.code, 'conflit'); assert.equal(e.detail, 'contenu_change');
  }
  assert.equal(nbElements(db), 6); assert.equal(nbRetraits(db, u1), 1);
  d.supprimerDonneesOutil(db, A(antor), U(u1), G, ok);
  assert.equal(nbElements(db, 'univers_id = ' + u1), 0);
  assert.equal(nbRetraits(db, u1), 0);
  assert.equal(nbElements(db, 'univers_id = ' + u2), 1);
  assert.equal(nbElements(db, 'systeme_id = ' + sys), 3);
  assert.equal((db.prepare('SELECT version_catalogue v FROM outils_univers WHERE univers_id = ? AND outil = ?').get(u1, G) as any).v, null);
  assert.deepEqual(db.prepare('SELECT active, visibilite_mj, visibilite_joueur, reglages FROM outils_univers WHERE univers_id = ? AND outil = ?').get(u1, G), avantLigne);
  // replay with the same vu: the recount is empty, the vu is not
  assert.equal(err(() => d.supprimerDonneesOutil(db, A(antor), U(u1), G, ok)).detail, 'contenu_change');
  // with the re-read (empty) vu: succeeds, erases nothing
  assert.deepEqual(d.supprimerDonneesOutil(db, A(antor), U(u1), G, []), []);
});

test('suppression système : efface le système seulement, version nulle, les univers gardent leurs éléments', () => {
  const { db, antor, u1, u2, sys } = monde();
  db.prepare('UPDATE outils_systeme SET version_catalogue = ? WHERE systeme_id = ? AND outil = ?').run('v1', sys, G);
  d.supprimerDonneesOutil(db, A(antor), S(sys), G, [{ cle: 'catalogue', nombre: 3 }]);
  assert.equal(nbElements(db, 'systeme_id = ' + sys), 0);
  assert.equal(nbElements(db, 'univers_id = ' + u1), 2);
  assert.equal(nbElements(db, 'univers_id = ' + u2), 1);
  assert.equal(nbRetraits(db, u1), 1);
  assert.equal((db.prepare('SELECT version_catalogue v, active FROM outils_systeme WHERE systeme_id = ? AND outil = ?').get(sys, G) as any).v, null);
  assert.equal((db.prepare('SELECT active FROM outils_systeme WHERE systeme_id = ? AND outil = ?').get(sys, G) as any).active, 1);
});

test('vu mal formé : invalide, rien écrit', () => {
  const { db, antor, u1 } = monde();
  for (const mauvais of [null, 'x', [{ cle: 'catalogue' }], [{ cle: 'catalogue', nombre: -1 }], [{ cle: 3, nombre: 1 }]]) {
    assert.equal(err(() => d.supprimerDonneesOutil(db, A(antor), U(u1), G, mauvais)).code, 'invalide');
  }
  assert.equal(nbElements(db, 'univers_id = ' + u1), 2);
});

test('vu avec clé en double ne passe pas pour un compte juste', () => {
  const { db, antor, u1 } = monde();
  const e = err(() => d.supprimerDonneesOutil(db, A(antor), U(u1), G, [{ cle: 'catalogue', nombre: 3 }, { cle: 'catalogue', nombre: 3 }]));
  assert.equal(e.code, 'conflit');
  assert.equal(nbElements(db, 'univers_id = ' + u1), 2);
});

test('gardes au niveau univers', () => {
  const { db, antor, mira, lea, zoe, u1, sys } = monde();
  const vuOk = [{ cle: 'catalogue', nombre: 3 }];
  for (const a of [A(lea), A(zoe)]) {
    assert.equal(err(() => d.resumeSuppression(db, a, U(u1), G)).code, 'introuvable');
    assert.equal(err(() => d.supprimerDonneesOutil(db, a, U(u1), G, vuOk)).code, 'introuvable');
  }
  assert.equal(err(() => d.resumeSuppression(db, A(antor, true), U(u1), G)).code, 'refuse');
  assert.equal(err(() => d.supprimerDonneesOutil(db, A(antor, true), U(u1), G, vuOk)).code, 'refuse');
  d.resumeSuppression(db, A(mira), U(u1), G); // a non-responsible GM may at universe level
  // system level: responsible passes, another attached GM refuses, a player/stranger is introuvable
  d.resumeSuppression(db, A(antor), S(sys), G);
  assert.equal(err(() => d.resumeSuppression(db, A(mira), S(sys), G)).code, 'refuse');
  assert.equal(err(() => d.supprimerDonneesOutil(db, A(mira), S(sys), G, [{ cle: 'catalogue', nombre: 3 }])).code, 'refuse');
  assert.equal(err(() => d.resumeSuppression(db, A(lea), S(sys), G)).code, 'introuvable');
  assert.equal(err(() => d.resumeSuppression(db, A(zoe), S(sys), G)).code, 'introuvable');
  assert.equal(nbElements(db, 'systeme_id = ' + sys), 3);
});

test('gardes : outil inconnu, sans données ni catalogue, ne s\'appliquant pas ; désactivé ou invisible ne gêne pas', () => {
  const { db, antor, u1, sys } = monde();
  for (const cle of ['essai/zz', 'inconnu/x', 'essai/b']) {
    // essai/b has neither `donnees` nor `catalogue`
    assert.equal(err(() => d.resumeSuppression(db, A(antor), U(u1), cle)).code, 'introuvable', cle);
    assert.equal(err(() => d.resumeSuppression(db, A(antor), S(sys), cle)).code, 'introuvable', cle);
  }
  // a tool that does not apply to the universe's system
  const outilG = essai.outils.find((x) => x.cle === G)!;
  const portee = outilG.portee;
  outilG.portee = { noms: ['Autre système'] };
  try {
    assert.equal(err(() => d.resumeSuppression(db, A(antor), U(u1), G)).code, 'introuvable');
    assert.equal(err(() => d.resumeSuppression(db, A(antor), S(sys), G)).code, 'introuvable');
    assert.equal(err(() => d.supprimerDonneesOutil(db, A(antor), U(u1), G, [{ cle: 'catalogue', nombre: 3 }])).code, 'introuvable');
  } finally { outilG.portee = portee; }
  assert.equal(nbElements(db, 'univers_id = ' + u1), 2);
  // disabled at both levels: still readable and erasable
  o.poserActivation(db, antor, { niveau: 'univers', id: u1 }, G, false);
  o.poserActivation(db, antor, { niveau: 'systeme', id: sys }, G, false);
  const r = d.resumeSuppression(db, A(antor), U(u1), G);
  assert.equal(r.total, 3);
  d.supprimerDonneesOutil(db, A(antor), U(u1), G, vu(r));
  assert.equal(nbElements(db, 'univers_id = ' + u1), 0);
});

test('module injecté : compter et effacer appelés, résumé sans ligne à zéro ; un effacer qui lève annule tout, catalogue compris', () => {
  const { db, antor, u1, u2 } = monde();
  const outilG = essai.outils.find((x) => x.cle === G)!;
  const original = outilG.donnees;
  let compteur = 4;
  let appels = 0;
  let lever = false;
  outilG.donnees = {
    compter: (_db, p) => [
      { cle: 'plan', singulier: 'plan', pluriel: 'plans', nombre: p.niveau === 'univers' && p.universId === u1 ? compteur : 0 },
      { cle: 'zero', singulier: 'zéro', pluriel: 'zéros', nombre: 0 },
    ],
    effacer: () => { appels++; compteur = 0; if (lever) throw new Error('panne'); },
  };
  try {
    const r = d.resumeSuppression(db, A(antor), U(u1), G);
    assert.deepEqual(r.efface.map((l) => [l.cle, l.nombre]), [['plan', 4], ['catalogue', 3]]);
    assert.equal(r.total, 7);
    // u2: the module has nothing there: only the catalogue line
    assert.deepEqual(d.resumeSuppression(db, A(antor), U(u2), G).efface.map((l) => l.cle), ['catalogue']);
    // a throwing effacer rolls the catalogue back, and so does the release of sections
    lever = true;
    assert.throws(() => d.supprimerDonneesOutil(db, A(antor), U(u1), G, vu(r)), /panne/);
    assert.equal(appels, 1);
    assert.equal(nbElements(db, 'univers_id = ' + u1), 2);
    assert.equal(nbRetraits(db, u1), 1);
    lever = false; compteur = 4;
    d.supprimerDonneesOutil(db, A(antor), U(u1), G, vu(r));
    assert.equal(appels, 2);
    assert.equal(nbElements(db, 'univers_id = ' + u1), 0);
  } finally { outilG.donnees = original; }
});

test('libererSections : verrou seul levé, contenu/version/modifie_le identiques, propositions d\'outil en attente supprimées et rien d\'autre', () => {
  const { db, antor, u1, u2 } = monde();
  const mk = (u: number, outil: string, titre: string) => {
    const f = creerFiche(db, antor, u, { type: 'personnage', titre, charge: { pj: false } }).id;
    return poserSectionGeree(db, antor, u, { ficheId: f, outil, type: 'caracteristiques', contenu: 'Texte ' + titre, sourceVersion: 'sv' } as any).id;
  };
  const s1 = mk(u1, G, 'A');
  const sAutreUnivers = mk(u2, G, 'B');
  const sAutreOutil = mk(u1, G, 'C');
  db.prepare("UPDATE sections SET gere_par = 'essai/a/carte' WHERE id = ?").run(sAutreOutil);
  const prop = (s: number, cr: number | null, sv: string | null, appliquee: string | null, demandeur: number) =>
    db.prepare(`INSERT INTO propositions (univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le, appliquee_le, source_version)
      VALUES ((SELECT f.univers_id FROM sections x JOIN fiches f ON f.id = x.fiche_id WHERE x.id = ?), ?, ?, ?, 'x', 1, 'now', ?, ?)`)
      .run(s, demandeur, s, cr, appliquee, sv);
  const mira = assurerCompte(db, 'mira').id;
  prop(s1, null, 'sv', null, antor);          // tool proposal, pending: goes
  if (mira) prop(s1, null, 'sv', '2020', mira); // tool proposal already applied: stays
  prop(sAutreUnivers, null, 'sv', null, antor);
  prop(sAutreOutil, null, 'sv', null, antor);
  const avant = db.prepare('SELECT id, contenu, contenu_public, version, modifie_le FROM sections WHERE id = ?').get(s1);
  const restantes = (s: number) => (db.prepare('SELECT COUNT(*) n FROM propositions WHERE section_id = ?').get(s) as any).n as number;
  assert.equal(libererSections(db, u1, G), 1);
  assert.deepEqual(db.prepare('SELECT id, contenu, contenu_public, version, modifie_le FROM sections WHERE id = ?').get(s1), avant);
  const ligne = (s: number) => db.prepare('SELECT gere_par, source_version FROM sections WHERE id = ?').get(s) as any;
  assert.deepEqual(ligne(s1), { gere_par: null, source_version: null });
  assert.notEqual(ligne(sAutreUnivers).gere_par, null);
  assert.notEqual(ligne(sAutreUnivers).source_version, null);
  assert.notEqual(ligne(sAutreOutil).gere_par, null);
  assert.equal(restantes(s1), mira ? 1 : 0);
  assert.equal(restantes(sAutreUnivers), 1);
  assert.equal(restantes(sAutreOutil), 1);
});

test('libererSections : une proposition de compte rendu en attente sur la section reste', () => {
  const { db, antor, u1 } = monde();
  const f = creerFiche(db, antor, u1, { type: 'personnage', titre: 'A', charge: { pj: false } }).id;
  const s = poserSectionGeree(db, antor, u1, { ficheId: f, outil: G, type: 'caracteristiques', contenu: 'T', sourceVersion: 'sv' } as any).id;
  // a report-born proposal needs a compte rendu row: reuse the schema, skipping FK checks for this fixture only
  db.pragma('foreign_keys = OFF');
  db.prepare(`INSERT INTO propositions (univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le)
    VALUES (?, ?, ?, ?, 'x', 1, 'now')`).run(u1, antor, s, f);
  db.pragma('foreign_keys = ON');
  libererSections(db, u1, G);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM propositions WHERE section_id = ?').get(s) as any).n, 1);
});

test('supprimerUnivers : plus aucune ligne essai_* ni outils_univers, le voisin intact, foreign_key_check vide', () => {
  const { db, antor, u1, u2 } = monde();
  const f = creerFiche(db, antor, u1, { type: 'personnage', titre: 'A', charge: { pj: false } }).id;
  poserSectionGeree(db, antor, u1, { ficheId: f, outil: G, type: 'caracteristiques', contenu: 'T', sourceVersion: 'sv' } as any);
  o.poserActivation(db, antor, { niveau: 'univers', id: u1 }, G, false); // disabled tools' rows go too
  supprimerUnivers(db, A(antor), u1, "Éneria d'essai");
  assert.equal(nbElements(db, 'univers_id = ' + u1), 0);
  assert.equal(nbRetraits(db, u1), 0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM outils_univers WHERE univers_id = ?').get(u1) as any).n, 0);
  assert.equal(nbElements(db, 'univers_id = ' + u2), 1);
  assert.ok((db.prepare('SELECT COUNT(*) n FROM outils_univers WHERE univers_id = ?').get(u2) as any).n > 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('supprimerUnivers : un effacer de module qui lève annule la suppression', () => {
  const { db, antor, u1 } = monde();
  const outilG = essai.outils.find((x) => x.cle === G)!;
  const original = outilG.donnees;
  outilG.donnees = { compter: () => [], effacer: () => { throw new Error('panne'); } };
  try {
    assert.throws(() => supprimerUnivers(db, A(antor), u1, "Éneria d'essai"), /panne/);
  } finally { outilG.donnees = original; }
  assert.equal((db.prepare('SELECT COUNT(*) n FROM univers WHERE id = ?').get(u1) as any).n, 1);
  assert.equal(nbElements(db, 'univers_id = ' + u1), 2);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM outils_univers WHERE univers_id = ?').get(u1) as any).n > 0, true);
});
