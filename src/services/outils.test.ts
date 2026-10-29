import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { ajouterMembre } = await import('./membres.js');
const { creerEtRattacherSysteme, creerSysteme, rattacherSysteme } = await import('./systemes.js');
const { creerUnivers } = await import('./univers.js');
const o = await import('./outils.js');
type Db = ReturnType<typeof openDb>;

function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string; champ?: string; message: string }; }
  assert.fail('aucune erreur levée');
}
const U = (id: number) => ({ niveau: 'univers' as const, id });
const S = (id: number) => ({ niveau: 'systeme' as const, id });
const ligne = (db: Db, t: string, k: string, id: number, outil: string) =>
  db.prepare(`SELECT * FROM ${t} WHERE ${k} = ? AND outil = ?`).get(id, outil) as any;

/** Antor: MJ of u1 (Léa player, Mira MJ) and u2; system "Sys" created by Antor, attached to both. */
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const mira = assurerCompte(db, 'mira').id;
  const lea = assurerCompte(db, 'lea').id;
  const etranger = assurerCompte(db, 'zoe').id;
  const admin = assurerCompte(db, 'admin').id;
  const u1 = creerUnivers(db, antor, { nom: 'U1' }).id;
  const u2 = creerUnivers(db, antor, { nom: 'U2' }).id;
  ajouterMembre(db, antor, u1, 'mira', 'mj');
  ajouterMembre(db, antor, u1, 'lea', 'joueur');
  const sys = creerEtRattacherSysteme(db, antor, u1, { nom: 'Sys' }).id;
  rattacherSysteme(db, antor, u2, sys);
  return { db, antor, mira, lea, etranger, admin, u1, u2, sys };
}

test('migration 0017 : colonnes, tables, aucune reprise des responsables', () => {
  const db = openDb(':memory:');
  migrate(db, new URL('../db/migrations/', import.meta.url).pathname);
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name);
  assert.ok(cols('systemes_jeu').includes('responsable_id'));
  assert.deepEqual(cols('outils_systeme').sort(), ['active', 'outil', 'reglages', 'systeme_id', 'version_catalogue',
    'version_reglages', 'visibilite_joueur', 'visibilite_mj']);
  assert.ok(cols('outils_univers').includes('univers_id'));
  assert.deepEqual(migrate(db), []);
});

test('creerSysteme et creerEtRattacherSysteme posent responsable_id', () => {
  const { db, antor, mira, sys } = monde();
  const resp = (id: number) => (db.prepare('SELECT responsable_id r FROM systemes_jeu WHERE id=?').get(id) as any).r;
  assert.equal(resp(sys), antor);
  const s2 = creerSysteme(db, mira, { nom: 'Libre' }); // Mira is a GM
  assert.equal(resp(s2.id), mira);
});

test('responsable supprimé : retour à la règle sans responsable (ON DELETE SET NULL)', () => {
  const { db, antor, mira, sys } = monde();
  db.pragma('foreign_keys = ON');
  db.prepare('UPDATE systemes_jeu SET responsable_id = ? WHERE id = ?').run(mira, sys);
  db.prepare('DELETE FROM membres WHERE compte_id = ?').run(mira);
  db.prepare('DELETE FROM comptes WHERE id = ?').run(mira);
  assert.equal((db.prepare('SELECT responsable_id r FROM systemes_jeu WHERE id=?').get(sys) as any).r, null);
  o.exigerResponsable(db, antor, sys); // any GM writes
});

test('exigerResponsable : matrice', () => {
  const { db, antor, mira, lea, etranger, admin, sys, u1 } = monde();
  o.exigerResponsable(db, antor, sys);
  o.exigerResponsable(db, { compteId: antor }, sys);
  assert.equal(err(() => o.exigerResponsable(db, mira, sys)).code, 'refuse');
  for (const c of [lea, etranger, admin]) assert.equal(err(() => o.exigerResponsable(db, c, sys)).code, 'introuvable');
  assert.equal(err(() => o.exigerResponsable(db, { compteId: antor, modeJoueur: true }, sys)).code, 'refuse');
  assert.equal(err(() => o.exigerResponsable(db, antor, 9999)).code, 'introuvable');
  // le joueur reste introuvable même s'il est le responsable stocké
  db.prepare('UPDATE systemes_jeu SET responsable_id = ? WHERE id = ?').run(lea, sys);
  assert.equal(err(() => o.exigerResponsable(db, lea, sys)).code, 'introuvable');
  // responsable stocké plus MJ d'aucun univers rattaché : repli sur tout MJ rattaché
  o.exigerResponsable(db, antor, sys);
  o.exigerResponsable(db, mira, sys);
  assert.equal(o.responsableEffectif(db, sys), null);
  void u1;
});

test('exigerResponsable : sans responsable, tout MJ d\'un univers rattaché écrit', () => {
  const { db, antor, mira, lea, etranger, sys } = monde();
  db.prepare('UPDATE systemes_jeu SET responsable_id = NULL WHERE id = ?').run(sys);
  o.exigerResponsable(db, antor, sys);
  o.exigerResponsable(db, mira, sys);
  assert.equal(err(() => o.exigerResponsable(db, { compteId: mira, modeJoueur: true }, sys)).code, 'refuse');
  for (const c of [lea, etranger]) assert.equal(err(() => o.exigerResponsable(db, c, sys)).code, 'introuvable');
});

test('exigerResponsable : le créateur d\'un système détaché le garde ; un MJ d\'un univers non rattaché non', () => {
  const { db, antor, mira } = monde();
  const libre = creerSysteme(db, antor, { nom: 'Libre' }).id;
  o.exigerResponsable(db, antor, libre);
  assert.equal(err(() => o.exigerResponsable(db, mira, libre)).code, 'introuvable');
});

test('responsable déclassé (plus MJ de l\'univers rattaché) : perd le système, en reste la trace', () => {
  const { db, antor, mira, sys, u1, u2 } = monde();
  // Antor loses his GM role everywhere the system is attached.
  db.prepare("UPDATE membres SET role = 'joueur' WHERE compte_id = ?").run(antor);
  assert.equal(o.responsableEffectif(db, sys), null);
  assert.equal(err(() => o.exigerResponsable(db, antor, sys)).code, 'introuvable');
  o.exigerResponsable(db, mira, sys);
  assert.equal((db.prepare('SELECT responsable_id r FROM systemes_jeu WHERE id=?').get(sys) as any).r, antor);
  void u1; void u2;
});

test('transfererResponsabilite', () => {
  const { db, antor, mira, lea, etranger, sys } = monde();
  const e = err(() => o.transfererResponsabilite(db, antor, sys, lea));
  assert.deepEqual([e.code, e.champ], ['invalide', 'compte']);
  assert.equal(err(() => o.transfererResponsabilite(db, antor, sys, etranger)).champ, 'compte');
  assert.equal(err(() => o.transfererResponsabilite(db, antor, sys, 9999)).champ, 'compte');
  assert.equal(err(() => o.transfererResponsabilite(db, mira, sys, mira)).code, 'refuse');
  assert.equal(err(() => o.transfererResponsabilite(db, lea, sys, mira)).code, 'introuvable');
  assert.equal(o.responsableEffectif(db, sys), antor);
  o.transfererResponsabilite(db, antor, sys, mira);
  assert.equal(o.responsableEffectif(db, sys), mira);
  assert.equal(err(() => o.transfererResponsabilite(db, antor, sys, antor)).code, 'refuse');
  // Antor a gardé son rôle MJ
  assert.equal(err(() => o.exigerResponsable(db, antor, sys)).code, 'refuse');
  o.transfererResponsabilite(db, mira, sys, antor);
  // MJ d'un univers non rattaché : refusé comme cible
  const u3 = creerUnivers(db, etranger, { nom: 'U3' }).id;
  void u3;
  assert.equal(err(() => o.transfererResponsabilite(db, antor, sys, etranger)).champ, 'compte');
});

test('transfert : un MJ en mode Joueur ne transfère pas', () => {
  const { db, antor, mira, sys } = monde();
  assert.equal(err(() => o.transfererResponsabilite(db, { compteId: antor, modeJoueur: true }, sys, mira)).code, 'refuse');
  assert.equal(o.responsableEffectif(db, sys), antor);
});

// ----- résolution -----

test('résolution : défaut, système, univers, avec origines ; outil désactivé par défaut', () => {
  const { db, antor, u1, sys } = monde();
  let r = o.resoudreOutil(db, u1, 'essai/a');
  assert.equal(r.active, false);
  assert.deepEqual(r.visibilite, { mj: true, joueur: true });
  assert.deepEqual(r.reglages.sansChargesCarburant, { valeur: false, origine: 'defaut' });
  assert.deepEqual(r.versionReglages, { systeme: 0, univers: 0 });

  o.poserActivation(db, antor, S(sys), 'essai/a', true);
  o.poserReglages(db, antor, S(sys), 'essai/a', { version: 0, valeurs: { sansChargesCarburant: true } });
  r = o.resoudreOutil(db, u1, 'essai/a');
  assert.equal(r.active, true);
  assert.deepEqual(r.reglages.sansChargesCarburant, { valeur: true, origine: 'systeme' });
  assert.deepEqual(r.versionReglages, { systeme: 1, univers: 0 });

  // l'univers force : false (valeur non nulle, même fausse), puis suit (null)
  o.poserActivation(db, antor, U(u1), 'essai/a', false);
  o.poserReglages(db, antor, U(u1), 'essai/a', { version: 0, valeurs: { sansChargesCarburant: false } });
  r = o.resoudreOutil(db, u1, 'essai/a');
  assert.equal(r.active, false);
  assert.deepEqual(r.reglages.sansChargesCarburant, { valeur: false, origine: 'univers' });
  assert.deepEqual(o.resoudreOutil(db, monde2(db, antor, sys), 'essai/a').reglages.sansChargesCarburant,
    { valeur: true, origine: 'systeme' });
  o.poserActivation(db, antor, U(u1), 'essai/a', null);
  o.poserReglages(db, antor, U(u1), 'essai/a', { version: 1, valeurs: { sansChargesCarburant: null } });
  r = o.resoudreOutil(db, u1, 'essai/a');
  assert.equal(r.active, true);
  assert.deepEqual(r.reglages.sansChargesCarburant, { valeur: true, origine: 'systeme' });
  assert.deepEqual(r.versionReglages, { systeme: 1, univers: 2 });
});
function monde2(db: Db, antor: number, sys: number): number {
  const u = creerUnivers(db, antor, { nom: 'Autre' }).id;
  rattacherSysteme(db, antor, u, sys);
  return u;
}

test('résolution : activation et visibilité univers non nulles gagnent, nulles suivent le système', () => {
  const { db, antor, u1, sys } = monde();
  o.poserActivation(db, antor, S(sys), 'essai/g', true);
  o.poserVisibilite(db, antor, S(sys), 'essai/g', { mj: true, joueur: false });
  assert.deepEqual(o.resoudreOutil(db, u1, 'essai/g').visibilite, { mj: true, joueur: false });
  o.poserVisibilite(db, antor, U(u1), 'essai/g', { joueur: true });
  assert.deepEqual(o.resoudreOutil(db, u1, 'essai/g').visibilite, { mj: true, joueur: true });
  o.poserVisibilite(db, antor, U(u1), 'essai/g', { mj: false });
  assert.deepEqual(o.resoudreOutil(db, u1, 'essai/g').visibilite, { mj: false, joueur: true });
  o.poserVisibilite(db, antor, U(u1), 'essai/g', { mj: null, joueur: null });
  assert.deepEqual(o.resoudreOutil(db, u1, 'essai/g').visibilite, { mj: true, joueur: false });
});

test('résolution : un réglage de niveau univers ignore la ligne du système', () => {
  const { db, antor, u1, sys } = monde();
  // Corrupt/legacy system row carrying a value for a universe-only setting.
  db.prepare("INSERT INTO outils_systeme (systeme_id, outil, reglages) VALUES (?, 'essai/g', '{\"marge\": 77}')").run(sys);
  assert.deepEqual(o.resoudreOutil(db, u1, 'essai/g').reglages.marge, { valeur: 10, origine: 'defaut' });
  o.poserReglages(db, antor, U(u1), 'essai/g', { version: 0, valeurs: { marge: 0 } });
  assert.deepEqual(o.resoudreOutil(db, u1, 'essai/g').reglages.marge, { valeur: 0, origine: 'univers' });
});

test('résolution : réglages communs à part, mêmes règles', () => {
  const { db, antor, u1, sys } = monde();
  let r = o.resoudreOutil(db, u1, 'essai/a');
  assert.deepEqual(r.communs.reglages.portee, { valeur: 1, origine: 'defaut' });
  assert.equal('portee' in r.reglages, false);
  assert.deepEqual(r.communs.versionReglages, { systeme: 0, univers: 0 });
  o.poserReglages(db, antor, S(sys), 'essai', { version: 0, valeurs: { portee: 3 } });
  r = o.resoudreOutil(db, u1, 'essai/b');
  assert.deepEqual(r.communs.reglages.portee, { valeur: 3, origine: 'systeme' });
  o.poserReglages(db, antor, U(u1), 'essai', { version: 0, valeurs: { portee: 5 } });
  r = o.resoudreOutil(db, u1, 'essai/g');
  assert.deepEqual(r.communs.reglages.portee, { valeur: 5, origine: 'univers' });
  assert.deepEqual(r.communs.versionReglages, { systeme: 1, univers: 1 });
  // les versions de l'outil ne bougent pas
  assert.deepEqual(r.versionReglages, { systeme: 0, univers: 0 });
});

test('résolution : outil inconnu ou univers sans système → introuvable', () => {
  const { db, antor, u1 } = monde();
  assert.equal(err(() => o.resoudreOutil(db, u1, 'essai/zzz')).code, 'introuvable');
  assert.equal(err(() => o.resoudreOutil(db, u1, 'ailleurs/a')).code, 'introuvable');
  const nu = creerUnivers(db, antor, { nom: 'Nu' }).id;
  assert.equal(err(() => o.resoudreOutil(db, nu, 'essai/a')).code, 'introuvable');
  assert.equal(err(() => o.resoudreOutil(db, 9999, 'essai/a')).code, 'introuvable');
});

// ----- accessible -----

test('accessible : activé et visible du rôle lu dans membres', () => {
  const { db, antor, mira, lea, etranger, admin, u1, sys } = monde();
  const ok = (c: number, mode = false) => o.accessible(db, { compteId: c, modeJoueur: mode }, u1, 'essai/g');
  for (const c of [antor, mira, lea, etranger, admin]) assert.equal(ok(c), false, 'désactivé');
  o.poserActivation(db, antor, S(sys), 'essai/g', true);
  assert.deepEqual([antor, mira, lea, etranger, admin].map((c) => ok(c)), [true, true, true, false, false]);
  o.poserVisibilite(db, antor, S(sys), 'essai/g', { mj: true, joueur: false });
  assert.deepEqual([ok(antor), ok(mira), ok(lea), ok(antor, true), ok(etranger)], [true, true, false, false, false]);
  o.poserVisibilite(db, antor, S(sys), 'essai/g', { mj: false, joueur: true });
  assert.deepEqual([ok(antor), ok(lea), ok(antor, true)], [false, true, true]);
  // outil inconnu : faux, sans exception
  assert.equal(o.accessible(db, { compteId: antor }, u1, 'essai/zzz'), false);
  assert.equal(o.accessible(db, { compteId: antor }, 9999, 'essai/g'), false);
  // le rôle est relu à chaque appel
  db.prepare('DELETE FROM membres WHERE compte_id = ? AND univers_id = ?').run(lea, u1);
  assert.equal(ok(lea), false);
  assert.equal(err(() => o.exigerOutil(db, { compteId: lea }, u1, 'essai/g')).code, 'introuvable');
});

// ----- écritures -----

test('poserActivation / poserVisibilite / poserReglages : chacune sa seule colonne', () => {
  const { db, antor, u1, sys } = monde();
  const sl = () => ligne(db, 'outils_systeme', 'systeme_id', sys, 'essai/a');
  o.poserActivation(db, antor, S(sys), 'essai/a', true);
  assert.deepEqual([sl().active, sl().visibilite_mj, sl().visibilite_joueur, sl().reglages, sl().version_reglages], [1, 1, 1, '{}', 0]);
  o.poserVisibilite(db, antor, S(sys), 'essai/a', { joueur: false });
  assert.deepEqual([sl().active, sl().visibilite_mj, sl().visibilite_joueur, sl().version_reglages], [1, 1, 0, 0]);
  o.poserReglages(db, antor, S(sys), 'essai/a', { version: 0, valeurs: { sansChargesCarburant: true } });
  assert.deepEqual([sl().active, sl().visibilite_mj, sl().visibilite_joueur, sl().reglages, sl().version_reglages],
    [1, 1, 0, '{"sansChargesCarburant":true}', 1]);
  o.poserActivation(db, antor, S(sys), 'essai/a', false);
  o.poserVisibilite(db, antor, S(sys), 'essai/a', { mj: false });
  assert.deepEqual([sl().reglages, sl().version_reglages, sl().visibilite_joueur], ['{"sansChargesCarburant":true}', 1, 0]);

  const ul = () => ligne(db, 'outils_univers', 'univers_id', u1, 'essai/a');
  o.poserVisibilite(db, antor, U(u1), 'essai/a', { mj: true });
  assert.deepEqual([ul().active, ul().visibilite_mj, ul().visibilite_joueur, ul().version_reglages], [null, 1, null, 0]);
  o.poserActivation(db, antor, U(u1), 'essai/a', true);
  assert.deepEqual([ul().active, ul().visibilite_mj, ul().reglages, ul().version_reglages], [1, 1, '{}', 0]);
  // la ligne du système n'a pas bougé
  assert.deepEqual([sl().active, sl().version_reglages], [0, 1]);
});

test('poserReglages : version périmée, formes, inconnu, mauvais niveau, protégé', () => {
  const { db, antor, u1, sys } = monde();
  const w = (cible: any, cle: string, version: number, valeurs: any, confirme?: boolean) =>
    () => o.poserReglages(db, antor, cible, cle, { version, valeurs, confirme });
  o.poserReglages(db, antor, U(u1), 'essai/g', { version: 0, valeurs: { marge: 20 } });
  let e = err(w(U(u1), 'essai/g', 0, { marge: 30 }));
  assert.deepEqual([e.code, e.detail], ['conflit', 'version']);
  assert.equal(err(w(U(u1), 'essai/g', 5, { marge: 30 })).detail, 'version');
  assert.equal(ligne(db, 'outils_univers', 'univers_id', u1, 'essai/g').reglages, '{"marge":20}');
  for (const v of [101, -1, '5', true, NaN]) {
    e = err(w(U(u1), 'essai/g', 1, { marge: v }));
    assert.deepEqual([e.code, e.champ], ['invalide', 'marge'], String(v));
  }
  o.poserReglages(db, antor, U(u1), 'essai/g', { version: 1, valeurs: { marge: 100 } });
  o.poserReglages(db, antor, U(u1), 'essai/g', { version: 2, valeurs: { marge: 0 } });
  e = err(w(U(u1), 'essai/g', 3, { inconnu: 1 }));
  assert.deepEqual([e.code, e.champ], ['invalide', 'inconnu']);
  e = err(w(U(u1), 'essai/g', 3, { constructor: 1 }));
  assert.deepEqual([e.code, e.champ], ['invalide', 'constructor']);
  // réglage de niveau univers : pas au système
  e = err(w(S(sys), 'essai/g', 0, { marge: 5 }));
  assert.deepEqual([e.code, e.champ], ['invalide', 'marge']);
  // une valeur nulle n'existe pas au système
  e = err(w(S(sys), 'essai/a', 0, { sansChargesCarburant: null }));
  assert.equal(e.code, 'invalide');
  // aucune écriture partielle : une valeur fausse annule les bonnes
  e = err(w(U(u1), 'essai/g', 3, { marge: 1, inconnu: 2 }));
  assert.equal(JSON.parse(ligne(db, 'outils_univers', 'univers_id', u1, 'essai/g').reglages).marge, 0);
  assert.equal(ligne(db, 'outils_univers', 'univers_id', u1, 'essai/g').version_reglages, 3);
  // version mal formée
  for (const v of [-1, 1.5, '0', undefined]) assert.equal(err(w(U(u1), 'essai/g', v as any, {})).champ, 'version');
});

test('poserReglages : un réglage protégé exige la confirmation', async () => {
  const { db, antor, u1 } = monde();
  const { essaiG } = await import('../outils/essai/g.js');
  (essaiG.reglages.marge as any).protege = true;
  try {
    let e = err(() => o.poserReglages(db, antor, U(u1), 'essai/g', { version: 0, valeurs: { marge: 5 } }));
    assert.deepEqual([e.code, e.detail], ['invalide', 'confirmation_requise']);
    e = err(() => o.poserReglages(db, antor, U(u1), 'essai/g', { version: 0, valeurs: { marge: 5 }, confirme: false }));
    assert.equal(e.detail, 'confirmation_requise');
    assert.equal(ligne(db, 'outils_univers', 'univers_id', u1, 'essai/g'), undefined);
    o.poserReglages(db, antor, U(u1), 'essai/g', { version: 0, valeurs: { marge: 5 }, confirme: true });
    assert.equal(ligne(db, 'outils_univers', 'univers_id', u1, 'essai/g').version_reglages, 1);
  } finally { delete (essaiG.reglages.marge as any).protege; }
});

test('poserActivation / poserVisibilite : valeurs mal formées', () => {
  const { db, antor, u1, sys } = monde();
  assert.equal(err(() => o.poserActivation(db, antor, S(sys), 'essai/a', null)).code, 'invalide');
  assert.equal(err(() => o.poserActivation(db, antor, U(u1), 'essai/a', 1 as any)).code, 'invalide');
  assert.equal(err(() => o.poserVisibilite(db, antor, S(sys), 'essai/a', { mj: null })).code, 'invalide');
  const e = err(() => o.poserVisibilite(db, antor, U(u1), 'essai/a', { autre: true } as any));
  assert.deepEqual([e.code, e.champ], ['invalide', 'autre']);
  assert.equal(err(() => o.poserActivation(db, antor, S(sys), 'essai/zzz', true)).code, 'introuvable');
  assert.equal(ligne(db, 'outils_systeme', 'systeme_id', sys, 'essai/a'), undefined);
  assert.equal(ligne(db, 'outils_univers', 'univers_id', u1, 'essai/a'), undefined);
});

test('écritures : droits au niveau système (responsable) et univers (MJ), mode Joueur refusé', () => {
  const { db, antor, mira, lea, etranger, admin, u1, sys } = monde();
  const ecrire = (c: any, cible: any) => () => o.poserActivation(db, c, cible, 'essai/a', true);
  assert.equal(err(ecrire(mira, S(sys))).code, 'refuse');
  for (const c of [lea, etranger, admin]) assert.equal(err(ecrire(c, S(sys))).code, 'introuvable');
  assert.equal(err(ecrire({ compteId: antor, modeJoueur: true }, S(sys))).code, 'refuse');
  // univers : n'importe quel MJ de l'univers
  o.poserActivation(db, mira, U(u1), 'essai/a', true);
  for (const c of [lea, etranger, admin]) assert.equal(err(ecrire(c, U(u1))).code, 'introuvable');
  assert.equal(err(ecrire({ compteId: antor, modeJoueur: true }, U(u1))).code, 'refuse');
  // MJ d'un autre univers : introuvable
  const u3 = creerUnivers(db, etranger, { nom: 'U3' }).id;
  assert.equal(err(ecrire(etranger, U(u1))).code, 'introuvable');
  assert.equal(err(ecrire(etranger, U(u3))).code, 'introuvable'); // univers sans système
  assert.equal(ligne(db, 'outils_systeme', 'systeme_id', sys, 'essai/a'), undefined);
});

// ----- dépendances -----

test('dépendances : activer B sans A → conflit dependance, et rien n\'est écrit', () => {
  const { db, antor, u1, sys } = monde();
  for (const cible of [S(sys), U(u1)]) {
    const e = err(() => o.poserActivation(db, antor, cible, 'essai/b', true));
    assert.deepEqual([e.code, e.detail, e.message], ['conflit', 'dependance', "Essai B demande Essai A : activez-le d'abord."]);
  }
  assert.equal(ligne(db, 'outils_systeme', 'systeme_id', sys, 'essai/b'), undefined);
  assert.equal(ligne(db, 'outils_univers', 'univers_id', u1, 'essai/b'), undefined);
});

test('dépendances : le niveau compte — A actif au système, B activé à l\'univers', () => {
  const { db, antor, u1, sys } = monde();
  o.poserActivation(db, antor, S(sys), 'essai/a', true);
  // résolu pour l'univers, A est actif : B passe
  o.poserActivation(db, antor, U(u1), 'essai/b', true);
  assert.equal(o.resoudreOutil(db, u1, 'essai/b').active, true);
  // A désactivé à l'univers alors que B actif → dependant
  const e = err(() => o.poserActivation(db, antor, U(u1), 'essai/a', false));
  assert.deepEqual([e.code, e.detail, e.message], ['conflit', 'dependant', "Essai B demande Essai A : désactivez-le d'abord."]);
  assert.equal(ligne(db, 'outils_univers', 'univers_id', u1, 'essai/a'), undefined);
  // idem au système : B est actif pour u1 (univers) mais pas au système — A système off ⇒ B univers voit A inactif
  // → la désactivation de A au système rend B actif sans dépendance pour u1 ; seul le niveau système est vérifié
  o.poserActivation(db, antor, U(u1), 'essai/b', null);
  o.poserActivation(db, antor, S(sys), 'essai/b', true);
  const e2 = err(() => o.poserActivation(db, antor, S(sys), 'essai/a', false));
  assert.equal(e2.detail, 'dependant');
  assert.equal(ligne(db, 'outils_systeme', 'systeme_id', sys, 'essai/a').active, 1);
  o.poserActivation(db, antor, S(sys), 'essai/b', false);
  o.poserActivation(db, antor, S(sys), 'essai/a', false);
  assert.equal(o.resoudreOutil(db, u1, 'essai/a').active, false);
});

test('dépendances : activer A puis B, désactiver dans l\'ordre inverse', () => {
  const { db, antor, u1 } = monde();
  o.poserActivation(db, antor, U(u1), 'essai/a', true);
  o.poserActivation(db, antor, U(u1), 'essai/b', true);
  assert.equal(err(() => o.poserActivation(db, antor, U(u1), 'essai/a', false)).detail, 'dependant');
  assert.equal(err(() => o.poserActivation(db, antor, U(u1), 'essai/a', null)).detail, 'dependant');
  o.poserActivation(db, antor, U(u1), 'essai/b', false);
  o.poserActivation(db, antor, U(u1), 'essai/a', false);
  // la désactivation d'un outil dont personne ne dépend n'est jamais refusée
  o.poserActivation(db, antor, U(u1), 'essai/g', true);
  o.poserActivation(db, antor, U(u1), 'essai/g', false);
});

// ----- semis -----

test('semis du bouchon : systèmes, univers, rôles, responsables, aucun outil activé', async () => {
  const { semerBouchon } = await import('../bouchon/depart.js');
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const roles = (univers: string) => q(`SELECT c.username u, m.role r FROM membres m JOIN comptes c ON c.id=m.compte_id
    JOIN univers x ON x.id=m.univers_id WHERE x.nom = ? ORDER BY c.username`, univers).map((x) => `${x.u}:${x.r}`);
  assert.deepEqual(roles("Éneria d'essai"), ['antor:mj', 'lea:joueur', 'mira:mj', 'roxane:joueur']);
  assert.deepEqual(roles('Univers voisin'), ['antor:mj']);
  assert.deepEqual(roles('Univers ancien'), ['mira:mj']);
  const sys = (nom: string) => q(`SELECT s.nom, c.username resp,
    (SELECT group_concat(u.nom, '|') FROM (SELECT nom FROM univers WHERE systeme_id = s.id ORDER BY nom) u) us
    FROM systemes_jeu s LEFT JOIN comptes c ON c.id = s.responsable_id WHERE s.nom = ?`, nom)[0];
  assert.deepEqual(sys("Système d'essai"), { nom: "Système d'essai", resp: 'antor', us: "Univers voisin|Éneria d'essai" });
  assert.deepEqual(sys('Système ancien'), { nom: 'Système ancien', resp: null, us: 'Univers ancien' });
  assert.equal(q('SELECT 1 FROM outils_systeme').length + q('SELECT 1 FROM outils_univers').length, 0);
  // comportement : responsable effectif / repli
  const id = (u: string) => q('SELECT id FROM comptes WHERE username = ?', u)[0].id as number;
  const sid = (n: string) => q('SELECT id FROM systemes_jeu WHERE nom = ?', n)[0].id as number;
  o.exigerResponsable(db, id('antor'), sid("Système d'essai"));
  assert.equal(err(() => o.exigerResponsable(db, id('mira'), sid("Système d'essai"))).code, 'refuse');
  assert.equal(err(() => o.exigerResponsable(db, id('lea'), sid("Système d'essai"))).code, 'introuvable');
  o.exigerResponsable(db, id('mira'), sid('Système ancien'));
  assert.equal(err(() => o.exigerResponsable(db, id('antor'), sid('Système ancien'))).code, 'introuvable');
  // « Essai B » avec « Essai A » désactivé
  const eneria = q("SELECT id FROM univers WHERE nom = ?", "Éneria d'essai")[0].id;
  assert.equal(err(() => o.poserActivation(db, id('antor'), U(eneria), 'essai/b', true)).detail, 'dependance');
  assert.equal(semerBouchon(db), false);
});

test('creerSystemeAncienPourBouchon est inutilisable hors test et bouchon', async () => {
  const { env } = await import('../config/env.js');
  const db = openDb(':memory:');
  migrate(db);
  const avant = env.NODE_ENV;
  (env as any).NODE_ENV = 'production';
  try { assert.equal(err(() => o.creerSystemeAncienPourBouchon(db, 'X')).code, 'refuse'); }
  finally { (env as any).NODE_ENV = avant; }
});
