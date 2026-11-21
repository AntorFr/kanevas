// Précondition d'une écriture d'import (AD-140, AD-ecriture-1, B-85) : service et route, sur un objet de test.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { default: Fastify } = await import('fastify');
const { buildApp } = await import('../app.js');
const { registerErreurs } = await import('../routes/erreurs.js');
const { creerJeton } = await import('./jetons.js');
const { ouvrirLot, lireLot } = await import('./lots.js');
const { trouverCompte } = await import('./comptes.js');
const { lirePrecondition, sousPrecondition, verifierPrecondition } = await import('./precondition.js');
const { ErreurService } = await import('./erreurs.js');

const EMP = 'a'.repeat(32);
const AUTRE = 'b'.repeat(32);
const cite = (e: string) => `"${e}"`;

function refus(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ErreurService, String(e));
    return e;
  }
  assert.fail('un refus était attendu');
}

test('lirePrecondition : sans en-tête rien ; If-Match cité lu ; If-None-Match * lu sur une création', () => {
  assert.deepEqual(lirePrecondition({}), {});
  assert.deepEqual(lirePrecondition({ 'if-match': cite(EMP) }), { siEmpreinte: EMP });
  assert.deepEqual(lirePrecondition({ 'if-none-match': '*' }, { creation: true }), { siAbsent: true });
});

test('lirePrecondition : If-Match mal formé = 400 invalide champ if_match', () => {
  for (const v of [EMP, '*', '""', cite('A'.repeat(32)), cite('a'.repeat(31)), cite('g'.repeat(32)), `W/${cite(EMP)}`, '', `${cite(EMP)}, ${cite(AUTRE)}`]) {
    const e = refus(() => lirePrecondition({ 'if-match': v }));
    assert.equal(e.code, 'invalide', v);
    assert.equal(e.champ, 'if_match', v);
  }
  assert.equal(refus(() => lirePrecondition({ 'if-match': ['"x"', '"y"'] })).champ, 'if_match');
});

test('lirePrecondition : If-None-Match autre que * ou hors création = 400 champ if_none_match ; les deux ensemble = 400', () => {
  for (const v of [cite(EMP), '', '**']) {
    assert.equal(refus(() => lirePrecondition({ 'if-none-match': v }, { creation: true })).champ, 'if_none_match', v);
  }
  const e = refus(() => lirePrecondition({ 'if-none-match': '*' }));
  assert.equal(e.code, 'invalide');
  assert.equal(e.champ, 'if_none_match');
  const deux = refus(() => lirePrecondition({ 'if-match': cite(EMP), 'if-none-match': '*' }, { creation: true }));
  assert.equal(deux.code, 'invalide');
});

test('verifierPrecondition : égale passe, différente 412, absente passe, If-None-Match * sur existant refusé', () => {
  verifierPrecondition(undefined, EMP);
  verifierPrecondition({}, EMP);
  verifierPrecondition({ siEmpreinte: EMP }, EMP);
  for (const e of [
    refus(() => verifierPrecondition({ siEmpreinte: AUTRE }, EMP)),
    refus(() => verifierPrecondition({ siEmpreinte: EMP }, null)),
    refus(() => verifierPrecondition({ siAbsent: true }, EMP)),
  ]) {
    assert.equal(e.code, 'conflit');
    assert.equal(e.detail, 'empreinte_perimee');
  }
  verifierPrecondition({ siAbsent: true }, null);
});

async function monter() {
  const app = await buildApp();
  const db = app.db;
  const antor = (await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' })).cookies[0]!;
  const u = (await app.inject({ method: 'POST', url: '/api/univers', headers: { cookie: `kanevas_session=${antor.value}` }, payload: { nom: 'Pre' } })).json() as { id: number };
  const { jeton } = creerJeton(db, trouverCompte(db, 'antor')!.id, u.id, { nom: 'Mac', dureeJours: 30 });
  const { lot } = ouvrirLot(db, jeton);
  db.exec('CREATE TABLE objet_test (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, empreinte TEXT NOT NULL)');
  db.prepare('INSERT INTO objet_test VALUES (?, ?, ?)').run('o1', 'avant', EMP);
  const histo = () => (db.prepare('SELECT COUNT(*) n FROM historique').get() as { n: number }).n;
  return { app, db, jeton, lot, histo };
}

test('sousPrecondition : empreinte courante écrit ; périmée refuse sans rien écrire ni compter sans lot', async () => {
  const { db, histo } = await monter();
  const courante = () => (db.prepare("SELECT empreinte FROM objet_test WHERE cle='o1'").get() as { empreinte: string }).empreinte;
  const ecrire = () => db.prepare("UPDATE objet_test SET valeur='apres', empreinte=? WHERE cle='o1'").run(AUTRE);
  const sansLot = { lotId: null, nature: 'fiches' as const, cle: 'o1', objet: 'fiche' };
  const h0 = histo();
  const e = refus(() => sousPrecondition(db, { siEmpreinte: AUTRE }, sansLot, courante, ecrire));
  assert.equal(e.detail, 'empreinte_perimee');
  assert.equal((db.prepare("SELECT valeur FROM objet_test").get() as { valeur: string }).valeur, 'avant');
  assert.equal(histo(), h0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM lots_import WHERE avertissements > 0 OR rapport <> ?').get('[]') as { n: number }).n, 0);

  sousPrecondition(db, { siEmpreinte: EMP }, sansLot, courante, ecrire);
  assert.equal((db.prepare("SELECT valeur FROM objet_test").get() as { valeur: string }).valeur, 'apres');
});

test('sousPrecondition : sans en-tête l’écriture passe ; une écriture qui échoue est annulée dans la transaction', async () => {
  const { db } = await monter();
  const sansLot = { lotId: null, nature: 'fiches' as const, cle: 'o1', objet: 'fiche' };
  sousPrecondition(db, undefined, sansLot, () => EMP, () => db.prepare("UPDATE objet_test SET valeur='sans'").run());
  assert.equal((db.prepare("SELECT valeur FROM objet_test").get() as { valeur: string }).valeur, 'sans');
  assert.throws(() => sousPrecondition(db, {}, sansLot, () => EMP, () => {
    db.prepare("UPDATE objet_test SET valeur='moitie'").run();
    throw new Error('boom');
  }), /boom/);
  assert.equal((db.prepare("SELECT valeur FROM objet_test").get() as { valeur: string }).valeur, 'sans');
});

test('sousPrecondition avec lot : « 1 refusée », clé et « modifiée depuis la lecture » ; la nature comptée est celle de l’appelant', async () => {
  const { db, jeton, lot } = await monter();
  for (const nature of ['fiches', 'relations'] as const) {
    const e = refus(() => sousPrecondition(db, { siEmpreinte: AUTRE }, { lotId: lot.lotId, nature, cle: `k-${nature}`, objet: 'fiche' }, () => EMP, () => assert.fail('écrit')));
    assert.equal(e.detail, 'empreinte_perimee');
  }
  const l = lireLot(db, jeton, lot.lotId);
  assert.equal(l.compteurs.fiches.refusees, 1);
  assert.equal(l.compteurs.relations.refusees, 1);
  assert.equal(l.compteurs.fiches.creees + l.compteurs.fiches.mises_a_jour + l.compteurs.fiches.inchangees, 0);
  assert.equal(l.rapport.length, 2);
  assert.equal(l.rapport[0]!.cle, 'k-fiches');
  assert.equal(l.rapport[0]!.raison, 'modifiée depuis la lecture');
  assert.equal(l.rapport[0]!.gravite, 'refus');
  assert.equal(l.avertissements, 0);
});

test('sousPrecondition avec lot : une écriture qui passe ne compte rien (c’est au service appelant)', async () => {
  const { db, jeton, lot } = await monter();
  sousPrecondition(db, { siEmpreinte: EMP }, { lotId: lot.lotId, nature: 'fiches', cle: 'o1', objet: 'fiche' }, () => EMP, () => 1);
  const l = lireLot(db, jeton, lot.lotId);
  assert.equal(l.compteurs.fiches.refusees, 0);
  assert.equal(l.rapport.length, 0);
});

test('route : If-Match / If-None-Match → 200, 412 empreinte_perimee, 400 champ ; avec ?lot= « 1 refusée », sans lot rien', async () => {
  const { db, jeton, lot, histo } = await monter();
  const app = Fastify();
  registerErreurs(app);
  app.put('/objet', async (req) => {
    const q = req.query as { lot?: string };
    const precondition = lirePrecondition(req.headers, { creation: true });
    const courante = () => (db.prepare("SELECT empreinte FROM objet_test WHERE cle='o1'").get() as { empreinte: string } | undefined)?.empreinte ?? null;
    sousPrecondition(db, precondition, { lotId: q.lot ? Number(q.lot) : null, nature: 'fiches', cle: 'o1', objet: 'fiche' }, courante,
      () => db.prepare("UPDATE objet_test SET valeur='route'").run());
    return { ok: true };
  });
  const put = (headers: Record<string, string>, lotId?: number) =>
    app.inject({ method: 'PUT', url: `/objet${lotId ? `?lot=${lotId}` : ''}`, headers });
  const valeur = () => (db.prepare('SELECT valeur FROM objet_test').get() as { valeur: string }).valeur;
  const h0 = histo();

  let r = await put({ 'if-match': cite(AUTRE) });
  assert.equal(r.statusCode, 412);
  assert.equal(r.json().code, 'empreinte_perimee');
  assert.equal(valeur(), 'avant');
  r = await put({ 'if-none-match': '*' });
  assert.equal(r.statusCode, 412);
  assert.equal(valeur(), 'avant');
  r = await put({ 'if-match': 'pas-une-empreinte' });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().champ, 'if_match');
  assert.equal(r.json().code, 'invalide');
  r = await put({ 'if-match': cite(EMP), 'if-none-match': '*' });
  assert.equal(r.statusCode, 400);
  r = await put({ 'if-none-match': 'x' });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().champ, 'if_none_match');
  assert.equal(lireLot(db, jeton, lot.lotId).compteurs.fiches.refusees, 0);
  assert.equal(histo(), h0);

  r = await put({ 'if-match': cite(AUTRE) }, lot.lotId);
  assert.equal(r.statusCode, 412);
  const l = lireLot(db, jeton, lot.lotId);
  assert.equal(l.compteurs.fiches.refusees, 1);
  assert.deepEqual(l.rapport.map((x) => [x.cle, x.raison]), [['o1', 'modifiée depuis la lecture']]);
  assert.equal(valeur(), 'avant');

  r = await put({});
  assert.equal(r.statusCode, 200);
  assert.equal(valeur(), 'route');
  db.prepare("UPDATE objet_test SET valeur='avant'").run();
  r = await put({ 'if-match': cite(EMP) });
  assert.equal(r.statusCode, 200);
});
