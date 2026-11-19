import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { creerFiche } = await import('./fiches.js');
const { ajouterMembre } = await import('./membres.js');
const { appliquerProposition, abandonnerProposition, lireProposition } = await import('./propositions.js');
const { creerEtRattacherSysteme } = await import('./systemes.js');
const { creerUnivers } = await import('./univers.js');
const { poserActivation, poserReglages, poserVisibilite } = await import('./outils.js');
const { poserSectionGeree, recalculerSection, proposerRecalcul, etatGere } = await import('./sections-gerees.js');

function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string }; }
  assert.fail('aucune erreur levée');
}

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const lea = assurerCompte(db, 'lea').id;
  const bob = assurerCompte(db, 'bob').id;
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  ajouterMembre(db, antor, u, 'lea', 'joueur');
  ajouterMembre(db, antor, u, 'bob', 'mj');
  const sys = creerEtRattacherSysteme(db, antor, u, { nom: 'Sys' }).id;
  poserActivation(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', true);
  poserVisibilite(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', { mj: true, joueur: true });
  const fiche = creerFiche(db, antor, u, { type: 'personnage', titre: 'Aldric', charge: { pj: false } }).id;
  const pose = (type: string, sourceVersion = 'vieux') =>
    poserSectionGeree(db, antor, u, {
      ficheId: fiche, outil: 'essai/g', type, contenu: 'Texte initial', sourceVersion,
      audience: { joueursLisent: true },
    } as any);
  const ligne = (id: number) => db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as any;
  const marge = (compte: number, version: number, v: number | null) =>
    poserReglages(db, compte, { niveau: 'univers', id: u }, 'essai/g', { version, valeurs: { marge: v } });
  const props = (sid: number) => db.prepare('SELECT * FROM propositions WHERE section_id = ? ORDER BY id').all(sid) as any[];
  return { db, antor, lea, bob, u, sys, fiche, pose, ligne, marge, props };
}

test('recalculerSection : met à jour texte + source_version, puis a_jour ne bouge pas version', () => {
  const { db, antor, u, fiche, pose, ligne } = monde();
  const s = pose('caracteristiques');
  const v = recalculerSection(db, antor, u, fiche, s.id, 1);
  const r = ligne(s.id);
  assert.equal(r.contenu, "Marge d'essai : 10 %");
  assert.notEqual(r.source_version, 'vieux');
  assert.equal(r.version, 2);
  assert.equal((v as any).id ?? s.id, s.id);
  assert.equal(etatGere(db, { compteId: antor }, u, r)!.etat, 'a_jour');
  // À jour : la vue sans bouger la version, même avec la version courante.
  recalculerSection(db, antor, u, fiche, s.id, 2);
  assert.equal(ligne(s.id).version, 2);
});

test('recalculerSection : réglage changé → périmé puis recalculé au nouveau texte', () => {
  const { db, antor, u, fiche, pose, ligne, marge } = monde();
  const s = pose('caracteristiques');
  recalculerSection(db, antor, u, fiche, s.id, 1);
  marge(antor, 0, 25);
  assert.equal(etatGere(db, { compteId: antor }, u, ligne(s.id))!.etat, 'perime');
  recalculerSection(db, antor, u, fiche, s.id, 2);
  assert.equal(ligne(s.id).contenu, "Marge d'essai : 25 %");
  assert.equal(ligne(s.id).version, 3);
});

test('recalculerSection : refuse Léa sans l\'usage ; conflit section_modifiee ; invalide sur notes ; introuvable désactivé', () => {
  const { db, antor, lea, u, sys, fiche, pose, ligne } = monde();
  const s = pose('caracteristiques');
  assert.equal(err(() => recalculerSection(db, lea, u, fiche, s.id, 1)).code, 'refuse');
  const c = err(() => recalculerSection(db, antor, u, fiche, s.id, 7));
  assert.deepEqual([c.code, c.detail], ['conflit', 'section_modifiee']);
  const n = pose('notes');
  const i = err(() => recalculerSection(db, antor, u, fiche, n.id, 1));
  assert.deepEqual([i.code, i.detail], ['invalide', 'recalcul_sur_proposition']);
  assert.equal(ligne(s.id).contenu, 'Texte initial');
  poserActivation(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', false);
  assert.equal(err(() => recalculerSection(db, antor, u, fiche, s.id, 1)).code, 'introuvable');
  assert.equal(ligne(s.id).contenu, 'Texte initial');
});

test('recalculerSection : section libre, section d\'ailleurs, id inconnu → introuvable', () => {
  const { db, antor, u, fiche, pose } = monde();
  const s = pose('caracteristiques');
  assert.equal(err(() => recalculerSection(db, antor, u, fiche, 9999, 1)).code, 'introuvable');
  const u2 = creerUnivers(db, antor, { nom: 'U2' }).id;
  assert.equal(err(() => recalculerSection(db, antor, u2, fiche, s.id, 1)).code, 'introuvable');
});

test('poserReglages univers : proposition au nom d\'Antor sur notes seulement, remplacée, rien pour Bob ni pour le niveau système', () => {
  const { db, antor, bob, u, sys, pose, props, marge } = monde();
  const notes = pose('notes');
  const car = pose('caracteristiques');
  marge(antor, 0, 20);
  let p = props(notes.id);
  assert.equal(p.length, 1);
  assert.equal(p[0].demandeur_id, antor);
  assert.equal(p[0].cr_id, null);
  assert.equal(p[0].contenu_propose, 'Notes — marge 20 %');
  assert.equal(props(car.id).length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propositions WHERE demandeur_id = ?').get(bob).n, 0);
  const premier = p[0].id;
  marge(antor, 1, 30);
  p = props(notes.id);
  assert.equal(p.length, 1, 'la précédente en attente est remplacée');
  assert.notEqual(p[0].id, premier);
  assert.equal(p[0].contenu_propose, 'Notes — marge 30 %');
  // Bob écrit à son tour : la sienne s'ajoute, celle d'Antor reste.
  marge(bob, 2, 40);
  assert.deepEqual(props(notes.id).map((x) => x.demandeur_id).sort(), [antor, bob].sort());
  // Écriture de niveau système : rien.
  const avant = db.prepare('SELECT COUNT(*) n FROM propositions').get().n;
  poserReglages(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', { version: 0, valeurs: {} });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propositions').get().n, avant);
  void u;
});

test('poserReglages invalide : aucune proposition, transaction annulée', () => {
  const { db, antor, pose, props, marge } = monde();
  const notes = pose('notes');
  assert.equal(err(() => marge(antor, 0, 500)).code, 'invalide');
  assert.equal(props(notes.id).length, 0);
});

test('proposerRecalcul : MJ dépose ; a_jour → conflit ; joueur introuvable ; geste → invalide', () => {
  const { db, antor, lea, u, pose, props, ligne } = monde();
  const notes = pose('notes');
  const v: any = proposerRecalcul(db, antor, u, notes.id);
  assert.equal(props(notes.id).length, 1);
  assert.equal(v.id ?? props(notes.id)[0].id, props(notes.id)[0].id);
  assert.equal(err(() => proposerRecalcul(db, lea, u, notes.id)).code, 'introuvable');
  const car = pose('caracteristiques');
  assert.equal(err(() => proposerRecalcul(db, antor, u, car.id)).detail, 'recalcul_par_geste');
  // Un second dépôt remplace.
  proposerRecalcul(db, antor, u, notes.id);
  assert.equal(props(notes.id).length, 1);
  // À jour : appliquer puis re-proposer → conflit a_jour.
  appliquerProposition(db, antor, u, props(notes.id)[0].id);
  const e = err(() => proposerRecalcul(db, antor, u, notes.id));
  assert.deepEqual([e.code, e.detail], ['conflit', 'a_jour']);
  assert.equal(ligne(notes.id).contenu, 'Notes — marge 10 %');
});

test('appliquerProposition de recalcul : texte et source_version changent à l\'application, pas avant ; abandon sans effet', () => {
  const { db, antor, u, pose, props, ligne, marge } = monde();
  const notes = pose('notes');
  marge(antor, 0, 20);
  const avant = ligne(notes.id);
  assert.equal(avant.contenu, 'Texte initial');
  assert.equal(avant.source_version, 'vieux');
  const id = props(notes.id)[0].id;
  assert.equal(lireProposition(db, antor, u, id).etat, 'en_attente');
  appliquerProposition(db, antor, u, id);
  const apres = ligne(notes.id);
  assert.equal(apres.contenu, 'Notes — marge 20 %');
  assert.notEqual(apres.source_version, 'vieux');
  assert.equal(apres.version, avant.version + 1);
  assert.equal(etatGere(db, { compteId: antor }, u, apres)!.etat, 'a_jour');
});

test('abandonnerProposition de recalcul : la section ne change pas', () => {
  const { db, antor, u, pose, props, ligne, marge } = monde();
  const notes = pose('notes');
  marge(antor, 0, 20);
  const avant = ligne(notes.id);
  abandonnerProposition(db, antor, u, props(notes.id)[0].id);
  assert.deepEqual(ligne(notes.id), avant);
  assert.equal(props(notes.id).length, 0);
});

test('appliquerProposition de recalcul : outil désactivé → introuvable, la proposition reste, section inchangée', () => {
  const { db, antor, u, sys, pose, props, ligne, marge } = monde();
  const notes = pose('notes');
  marge(antor, 0, 20);
  const avant = ligne(notes.id);
  poserActivation(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', false);
  const id = props(notes.id)[0].id;
  assert.equal(err(() => appliquerProposition(db, antor, u, id)).code, 'introuvable');
  assert.equal(props(notes.id).length, 1);
  assert.equal(props(notes.id)[0].appliquee_le, null);
  assert.deepEqual(ligne(notes.id), avant);
});

test('appliquerProposition de recalcul : version de section bougée → conflit section_modifiee', () => {
  const { db, antor, u, pose, props, ligne, marge } = monde();
  const notes = pose('notes');
  marge(antor, 0, 20);
  db.prepare('UPDATE sections SET version = version + 1 WHERE id = ?').run(notes.id);
  const e = err(() => appliquerProposition(db, antor, u, props(notes.id)[0].id));
  assert.equal(e.code, 'conflit');
  assert.equal(ligne(notes.id).contenu, 'Texte initial');
});
