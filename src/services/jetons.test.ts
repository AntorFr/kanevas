// Tokens of an account (kanevas-synchro-jetons-noyau, AD-144, B-45, B-46, B-94, B-95).
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { ajouterMembre, changerRoleNoyau } = await import('./membres.js');
const { creerUnivers, supprimerUnivers } = await import('./univers.js');
const J = await import('./jetons.js');

function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string; champ?: string; message: string }; }
  assert.fail('aucune erreur levée');
}

/** Ana (owner of tokens, GM of A and B), Bob (admin-like other account), Cy (joins A as player). */
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const ana = assurerCompte(db, 'ana').id;
  const bob = assurerCompte(db, 'bob').id;
  const cy = assurerCompte(db, 'cy').id;
  const a = creerUnivers(db, ana, { nom: 'A' }).id;
  const b = creerUnivers(db, ana, { nom: 'B' }).id;
  const c = creerUnivers(db, bob, { nom: 'C' }).id; // Ana is no member
  return { db, ana, bob, cy, a, b, c };
}
const moi = (compteId: number) => ({ compteId, admin: false });
const adm = (compteId: number) => ({ compteId, admin: true });
const base = { nom: 'Mon jeton', dureeJours: 30 as const };

test('« tous » en lecture avec exception aucun : aucun là, lecture ailleurs, y compris un univers rejoint après la création', () => {
  const { db, ana, bob, a, b, c } = monde();
  const { jeton } = J.creerJeton(db, ana, { ...base, acces: { tous: true, niveauTous: 'lecture', univers: [{ universId: b, niveau: 'aucun' }] } });
  assert.equal(J.accesDe(db, jeton.id, a), 'lecture');
  assert.equal(J.accesDe(db, jeton.id, b), 'aucun');
  ajouterMembre(db, bob, c, 'ana', 'joueur'); // joined after the creation
  assert.equal(J.accesDe(db, jeton.id, c), 'lecture');
  const d = creerUnivers(db, ana, { nom: 'D' }).id;
  assert.equal(J.accesDe(db, jeton.id, d), 'lecture');
  assert.equal(J.accesDe(db, jeton.id, 9999), 'lecture', 'tous reaches by rule, the role is what limits');
  assert.equal(J.niveauEffectif(db, jeton, 9999).niveau, 'aucun', 'no role: nothing');
  assert.equal(J.niveauEffectif(db, jeton, b).niveau, 'aucun');
  assert.equal(J.niveauEffectif(db, jeton, a).niveau, 'lecture');
});

test('une exception de même niveau que « tous » n’est pas stockée ; une exception plus haute l’est', () => {
  const { db, ana, a, b } = monde();
  const { jeton } = J.creerJeton(db, ana, { ...base, acces: { tous: true, niveauTous: 'lecture', univers: [{ universId: a, niveau: 'lecture' }, { universId: b, niveau: 'ecriture' }] } });
  assert.deepEqual(jeton.univers.map((u) => [u.universId, u.niveau]), [[b, 'ecriture']]);
  assert.equal(J.accesDe(db, jeton.id, b), 'ecriture');
  assert.equal(J.accesDe(db, jeton.id, a), 'lecture');
});

test('liste : seuls les univers listés ; ailleurs aucun', () => {
  const { db, ana, a, b } = monde();
  const { jeton } = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'ecriture' }, { universId: b, niveau: 'lecture' }] } });
  assert.equal(J.accesDe(db, jeton.id, a), 'ecriture');
  assert.equal(J.accesDe(db, jeton.id, b), 'lecture');
  assert.equal(jeton.tous, false);
  assert.equal(jeton.niveauTous, null);
  const d = creerUnivers(db, ana, { nom: 'D' }).id;
  assert.equal(J.accesDe(db, jeton.id, d), 'aucun');
});

test('acces invalides : liste sans ligne au-dessus de aucun, liste vide, non-membre, doublon, niveau inconnu, tous sans niveau', () => {
  const { db, ana, a, b, c } = monde();
  const cas: [string, unknown][] = [
    ['liste vide', { tous: false, univers: [] }],
    ['liste absente', { tous: false }],
    ['liste d’aucun', { tous: false, univers: [{ universId: a, niveau: 'aucun' }] }],
    ['non-membre', { tous: false, univers: [{ universId: c, niveau: 'lecture' }] }],
    ['non-membre en exception', { tous: true, niveauTous: 'lecture', univers: [{ universId: c, niveau: 'aucun' }] }],
    ['univers inconnu', { tous: false, univers: [{ universId: 9999, niveau: 'lecture' }] }],
    ['doublon', { tous: false, univers: [{ universId: a, niveau: 'lecture' }, { universId: a, niveau: 'ecriture' }] }],
    ['niveau inconnu', { tous: false, univers: [{ universId: b, niveau: 'admin' }] }],
    ['tous sans niveau', { tous: true }],
    ['tous niveau aucun', { tous: true, niveauTous: 'aucun' }],
    ['tous non booléen', { tous: 1, niveauTous: 'lecture' }],
    ['null', null],
    ['absent', undefined],
    ['univers non entier', { tous: false, univers: [{ universId: '1', niveau: 'lecture' }] }],
  ];
  for (const [nom, acces] of cas) {
    const e = err(() => J.creerJeton(db, ana, { ...base, acces }));
    assert.equal(e.code, 'invalide', nom);
    assert.equal(e.champ, 'acces', nom);
  }
  assert.equal((db.prepare('SELECT count(*) AS n FROM jetons_api').get() as { n: number }).n, 0, 'nothing written by a refusal');
  assert.equal((db.prepare('SELECT count(*) AS n FROM jetons_univers').get() as { n: number }).n, 0);
});

test('nom et durée invalides portent leur champ', () => {
  const { db, ana, a } = monde();
  const acces = { tous: false, univers: [{ universId: a, niveau: 'lecture' }] };
  for (const nom of ['', '   ', 'x'.repeat(81), 12, null]) assert.equal(err(() => J.creerJeton(db, ana, { nom, dureeJours: 30, acces })).champ, 'nom');
  for (const dureeJours of [0, 8, '30', null, 366]) {
    const e = err(() => J.creerJeton(db, ana, { nom: 'n', dureeJours, acces }));
    assert.equal(e.code, 'invalide');
    assert.equal(e.champ, 'duree');
  }
  assert.equal(J.creerJeton(db, ana, { nom: ` ${'x'.repeat(80)} `, dureeJours: 365, acces }).jeton.nom.length, 80);
});

test('la valeur kvs_ est rendue une fois, jamais gardée ; durée et empreinte', () => {
  const { db, ana, a } = monde();
  const t = new Date('2026-01-01T00:00:00.000Z');
  const { jeton, valeur } = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }] } }, t);
  assert.match(valeur, /^kvs_[A-Za-z0-9_-]{40,}$/);
  assert.equal(jeton.expireLe, '2026-01-31T00:00:00.000Z');
  assert.equal(JSON.stringify(jeton).includes(valeur), false);
  const autre = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }] } }).valeur;
  assert.notEqual(autre, valeur);
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]) {
    const lignes = JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all());
    assert.equal(lignes.includes(valeur), false, name);
  }
  const liste = JSON.stringify([J.listerJetonsDuCompte(db, ana), J.listerJetonsInstance(db, adm(ana))]);
  assert.equal(liste.includes(valeur), false);
  assert.equal(liste.includes(J.empreinteDe(valeur)), false, 'nor its fingerprint');
  assert.equal((db.prepare('SELECT empreinte FROM jetons_api WHERE id = ?').get(jeton.id) as { empreinte: string }).empreinte, J.empreinteDe(valeur));
});

test('l’admin qui change les accès pose « modifié par l’admin » ; le propriétaire qui enregistre l’efface', () => {
  const { db, ana, bob, a, b } = monde();
  const { jeton } = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }] } });
  assert.equal(jeton.modifieParAdmin, null);
  const t = new Date('2026-05-05T10:00:00.000Z');
  const m1 = J.modifierAcces(db, adm(bob), jeton.id, { tous: false, univers: [{ universId: a, niveau: 'ecriture' }] }, t);
  assert.deepEqual(m1.modifieParAdmin, { par: bob, le: t.toISOString() });
  assert.equal(m1.compteId, ana, 'still Ana’s');
  assert.equal(J.accesDe(db, jeton.id, a), 'ecriture');
  const m2 = J.modifierAcces(db, moi(ana), jeton.id, { tous: true, niveauTous: 'lecture', univers: [{ universId: b, niveau: 'aucun' }] });
  assert.equal(m2.modifieParAdmin, null);
  assert.equal(m2.tous, true);
  assert.equal(J.accesDe(db, jeton.id, b), 'aucun');
  assert.equal(J.accesDe(db, jeton.id, a), 'lecture');
  // an admin who is the owner is the owner
  const own = J.creerJeton(db, bob, { ...base, acces: { tous: false, univers: [{ universId: creerUnivers(db, bob, { nom: 'Z' }).id, niveau: 'lecture' }] } }).jeton;
  assert.equal(J.modifierAcces(db, adm(bob), own.id, { tous: true, niveauTous: 'lecture' }).modifieParAdmin, null);
});

test('un refus de modification laisse le jeton intact (et la marque admin)', () => {
  const { db, ana, bob, a } = monde();
  const { jeton } = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }] } });
  const e = err(() => J.modifierAcces(db, adm(bob), jeton.id, { tous: false, univers: [] }));
  assert.equal(e.champ, 'acces');
  const apres = J.listerJetonsDuCompte(db, ana)[0]!;
  assert.equal(apres.modifieParAdmin, null);
  assert.deepEqual(apres.univers.map((u) => [u.universId, u.niveau]), [[a, 'lecture']]);
});

test('modifier les accès d’un jeton révoqué ou expiré : conflit jeton_revoque', () => {
  const { db, ana, a } = monde();
  const acces = { tous: false, univers: [{ universId: a, niveau: 'lecture' }] };
  const r = J.creerJeton(db, ana, { ...base, acces }).jeton;
  J.revoquerJeton(db, moi(ana), r.id);
  const e = err(() => J.modifierAcces(db, moi(ana), r.id, acces));
  assert.equal(e.code, 'conflit');
  assert.equal(e.detail, 'jeton_revoque');
  const t0 = new Date('2020-01-01T00:00:00.000Z');
  const x = J.creerJeton(db, ana, { ...base, dureeJours: 7, acces }, t0).jeton;
  const e2 = err(() => J.modifierAcces(db, moi(ana), x.id, acces));
  assert.equal(e2.code, 'conflit');
  assert.equal(e2.detail, 'jeton_revoque');
});

test('le jeton d’un autre : introuvable pour un non-admin (modifier, révoquer, lister), même réponse qu’un id inconnu', () => {
  const { db, ana, bob, a } = monde();
  const { jeton } = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }] } });
  const acces = { tous: false, univers: [{ universId: a, niveau: 'lecture' }] };
  for (const id of [jeton.id, 9999]) {
    assert.equal(err(() => J.modifierAcces(db, moi(bob), id, acces)).code, 'introuvable');
    assert.equal(err(() => J.revoquerJeton(db, moi(bob), id)).code, 'introuvable');
  }
  assert.equal(err(() => J.listerJetonsInstance(db, moi(bob))).code, 'introuvable');
  assert.deepEqual(J.listerJetonsDuCompte(db, bob), []);
  assert.equal(J.listerJetonsDuCompte(db, ana).length, 1);
  // untouched
  assert.equal(J.listerJetonsDuCompte(db, ana)[0]!.revoqueLe, null);
  // a flag on the actor is only taken as `true`
  assert.equal(err(() => J.revoquerJeton(db, { compteId: bob, admin: 'true' as any }, jeton.id)).code, 'introuvable');
});

test('révocation : propriétaire ou admin, revoque_par dit qui, la première date reste', () => {
  const { db, ana, bob, a } = monde();
  const acces = { tous: false, univers: [{ universId: a, niveau: 'lecture' }] };
  const j1 = J.creerJeton(db, ana, { ...base, acces }).jeton;
  const j2 = J.creerJeton(db, ana, { ...base, acces }).jeton;
  const t1 = new Date('2026-06-01T00:00:00.000Z');
  const r1 = J.revoquerJeton(db, moi(ana), j1.id, t1);
  assert.deepEqual([r1.revoqueLe, r1.revoquePar], [t1.toISOString(), ana]);
  const r2 = J.revoquerJeton(db, adm(bob), j2.id, t1);
  assert.deepEqual([r2.revoqueLe, r2.revoquePar], [t1.toISOString(), bob]);
  const again = J.revoquerJeton(db, adm(bob), j1.id, new Date('2027-01-01T00:00:00.000Z'));
  assert.deepEqual([again.revoqueLe, again.revoquePar], [t1.toISOString(), ana], 'first revocation kept');
  assert.equal(J.listerJetonsDuCompte(db, ana).find((j) => j.id === j1.id)!.etat, 'revoque');
});

test('verifierJeton : sans univers ; refuse révoqué, expiré, inconnu, sans préfixe ; dernier usage au plus une fois par minute', () => {
  const { db, ana, a } = monde();
  const t0 = new Date('2026-03-01T12:00:00.000Z');
  const { jeton, valeur } = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'ecriture' }] } }, t0);
  const v = J.verifierJeton(db, valeur, t0)!;
  assert.equal(v.id, jeton.id);
  assert.equal(v.compteId, ana);
  assert.equal('universId' in v, false);
  assert.equal(v.dernierUsageLe, t0.toISOString());
  const dernier = () => (db.prepare('SELECT dernier_usage_le AS d FROM jetons_api WHERE id = ?').get(jeton.id) as { d: string }).d;
  J.verifierJeton(db, valeur, new Date(t0.getTime() + 59_000));
  assert.equal(dernier(), t0.toISOString(), 'within the minute: not written');
  J.verifierJeton(db, valeur, new Date(t0.getTime() + 60_000));
  assert.equal(dernier(), new Date(t0.getTime() + 60_000).toISOString());
  assert.equal(J.verifierJeton(db, valeur + 'x', t0), null);
  assert.equal(J.verifierJeton(db, 'kvs_', t0), null);
  assert.equal(J.verifierJeton(db, '', t0), null);
  assert.equal(J.verifierJeton(db, valeur.replace('kvs_', 'abc_'), t0), null);
  assert.equal(J.verifierJeton(db, valeur, new Date('2026-04-01T12:00:00.000Z')), null, 'expired (30 days)');
  assert.equal(J.verifierJeton(db, valeur, new Date('2026-03-31T12:00:00.000Z')), null, 'expiry instant excluded');
  J.revoquerJeton(db, moi(ana), jeton.id, t0);
  assert.equal(J.verifierJeton(db, valeur, t0), null);
  const avant = dernier();
  J.verifierJeton(db, valeur, new Date(t0.getTime() + 3_600_000));
  assert.equal(dernier(), avant, 'a refused token leaves no usage');
});

test('outils : vide sans ligne jetons_outils, les outils de ses lignes sinon', () => {
  const { db, ana, a } = monde();
  const { jeton, valeur } = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }] } });
  assert.deepEqual(J.verifierJeton(db, valeur)!.outils, []);
  db.prepare("INSERT INTO jetons_outils (jeton_id, outil) VALUES (?, 'essai/g')").run(jeton.id);
  assert.deepEqual(J.verifierJeton(db, valeur)!.outils, ['essai/g']);
});

test('niveau effectif : un jeton ecriture d’un compte devenu joueur a le niveau d’un joueur ; sans rôle, aucun ; rétabli MJ, MJ', () => {
  const { db, ana, bob, a } = monde();
  ajouterMembre(db, ana, a, 'bob', 'mj');
  const { jeton } = J.creerJeton(db, bob, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'ecriture' }] } });
  assert.deepEqual(J.niveauEffectif(db, jeton, a), { niveau: 'ecriture', role: 'mj' });
  changerRoleNoyau(db, a, bob, 'joueur');
  assert.deepEqual(J.niveauEffectif(db, jeton, a), { niveau: 'ecriture', role: 'joueur' });
  changerRoleNoyau(db, a, bob, 'mj');
  assert.deepEqual(J.niveauEffectif(db, jeton, a), { niveau: 'ecriture', role: 'mj' });
  db.prepare('DELETE FROM membres WHERE univers_id = ? AND compte_id = ?').run(a, bob);
  assert.deepEqual(J.niveauEffectif(db, jeton, a), { niveau: 'aucun', role: null });
  // the level of the token still caps: lecture stays lecture for a GM
  const l = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }] } }).jeton;
  assert.deepEqual(J.niveauEffectif(db, l, a), { niveau: 'lecture', role: 'mj' });
});

test('un compte qui a quitté un univers garde sa ligne ; la modification la conserve, un univers jamais rejoint est refusé', () => {
  const { db, ana, bob, a, b } = monde();
  ajouterMembre(db, ana, a, 'bob', 'joueur');
  const { jeton } = J.creerJeton(db, bob, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }] } });
  db.prepare('DELETE FROM membres WHERE univers_id = ? AND compte_id = ?').run(a, bob);
  assert.equal(J.accesDe(db, jeton.id, a), 'lecture');
  assert.equal(J.niveauEffectif(db, jeton, a).niveau, 'aucun');
  assert.equal(err(() => J.modifierAcces(db, moi(bob), jeton.id, { tous: false, univers: [{ universId: b, niveau: 'lecture' }] })).champ, 'acces');
});

test('listes : actifs tous puis 20 derniers révoqués ou expirés ; filtre propriétaire ; nom du propriétaire', () => {
  const { db, ana, bob, a, c } = monde();
  const acces = { tous: false, univers: [{ universId: a, niveau: 'lecture' }] };
  const accesBob = { tous: false, univers: [{ universId: c, niveau: 'lecture' }] };
  const base0 = Date.parse('2026-01-01T00:00:00.000Z');
  const maintenant = new Date('2026-07-01T00:00:00.000Z');
  for (let i = 0; i < 25; i++) {
    const { jeton } = J.creerJeton(db, ana, { ...base, nom: `r${i}`, acces }, new Date(base0 + i * 3600_000));
    J.revoquerJeton(db, moi(ana), jeton.id, new Date(base0 + i * 3600_000));
  }
  for (let i = 0; i < 3; i++) J.creerJeton(db, ana, { ...base, nom: `e${i}`, dureeJours: 7, acces }, new Date(base0 + i * 3600_000)); // expired at `maintenant`
  for (let i = 0; i < 22; i++) J.creerJeton(db, ana, { ...base, nom: `a${i}`, dureeJours: 365, acces }, new Date(base0 + i * 3600_000)); // 22 actifs
  J.creerJeton(db, bob, { ...base, nom: 'bob-actif', dureeJours: 365, acces: accesBob }, new Date(base0));
  J.creerJeton(db, bob, { ...base, nom: 'bob-expire', dureeJours: 7, acces: accesBob }, new Date(base0));

  const inst = J.listerJetonsInstance(db, adm(bob), {}, maintenant);
  assert.equal(inst.filter((j) => j.etat === 'actif').length, 23, 'every active one, past 20');
  assert.equal(inst.filter((j) => j.etat !== 'actif').length, 20);
  assert.ok(inst.slice(0, 23).every((j) => j.etat === 'actif'), 'active first');
  assert.equal(inst.find((j) => j.nom === 'bob-actif')!.proprietaire, 'bob');
  const filtre = J.listerJetonsInstance(db, adm(bob), { proprietaire: bob }, maintenant);
  assert.deepEqual(filtre.map((j) => j.nom).sort(), ['bob-actif', 'bob-expire']);
  assert.equal(filtre.find((j) => j.nom === 'bob-expire')!.etat, 'expire');

  const compte = J.listerJetonsDuCompte(db, ana, maintenant);
  assert.equal(compte.filter((j) => j.etat === 'actif').length, 22);
  assert.ok(compte.every((j) => j.compteId === ana));
  assert.ok(compte.length <= 22 + 20);
  assert.ok(compte.length >= 22);
  assert.ok(J.listerJetonsDuCompte(db, ana, maintenant).filter((j) => j.etat !== 'actif').length <= 20);
});

test('supprimer un univers retire ses lignes de jetons_univers ; les jetons restent', () => {
  const { db, ana, a, b } = monde();
  const { jeton } = J.creerJeton(db, ana, { ...base, acces: { tous: false, univers: [{ universId: a, niveau: 'lecture' }, { universId: b, niveau: 'ecriture' }] } });
  supprimerUnivers(db, { compteId: ana }, a, 'A');
  assert.deepEqual(J.listerJetonsDuCompte(db, ana)[0]!.univers.map((u) => u.universId), [b]);
  assert.equal(J.accesDe(db, jeton.id, a), 'aucun');
  assert.equal(J.listerJetonsDuCompte(db, ana).length, 1);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('creerJetonDeValeur : monde de départ, une ligne ecriture, la valeur ouvre', () => {
  const { db, ana, a } = monde();
  const j = J.creerJetonDeValeur(db, ana, a, { nom: 'Bouchon', dureeJours: 365, valeur: 'kvs_BOUCHON' });
  assert.equal(J.verifierJeton(db, 'kvs_BOUCHON')!.id, j.id);
  assert.equal(J.accesDe(db, j.id, a), 'ecriture');
  assert.equal(j.compteId, ana);
});
