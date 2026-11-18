import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { assurerCompte } from './comptes.js';
import { changerCleFiche, changerCleUnivers, resoudreFiche, resoudreUnivers } from './cles.js';
import { ErreurService } from './erreurs.js';
import { creerFiche } from './fiches.js';
import { ajouterMembre } from './membres.js';
import { ajouterSection } from './sections.js';
import { creerUnivers } from './univers.js';

function err(fn: () => unknown): ErreurService {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurService) return e;
    throw e;
  }
  assert.fail('une ErreurService était attendue');
}

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const mj = assurerCompte(db, 'mj');
  const lea = assurerCompte(db, 'lea');
  const autreMj = assurerCompte(db, 'autre-mj');
  const u = creerUnivers(db, mj.id, { nom: 'Éneria Prime' });
  const u2 = creerUnivers(db, autreMj.id, { nom: 'Ailleurs' });
  ajouterMembre(db, mj.id, u.id, 'lea', 'joueur');
  const cle = (id: number) => (db.prepare('SELECT cle FROM fiches WHERE id = ?').get(id) as { cle: string }).cle;
  const acteur = { compteId: mj.id };
  return { db, mj, lea, autreMj, u, u2, cle, acteur };
}
const lieu = (m: ReturnType<typeof monde>, titre: string, universId = m.u.id) =>
  creerFiche(m.db, universId === m.u.id ? m.mj.id : m.autreMj.id, universId, { type: 'lieu', titre, charge: {} });
const clesUnivers = (db: Db) => (db.prepare('SELECT cle FROM univers ORDER BY id').all() as { cle: string }[]).map((r) => r.cle);

test('une fiche créée sans clé reçoit type:titre, accents retirés, doublon suffixé', () => {
  const m = monde();
  const a = lieu(m, 'Château d’Éau — Ouest');
  const b = lieu(m, 'Chateau d eau ouest');
  const c = lieu(m, 'Château d’Éau — Ouest');
  assert.equal(m.cle(a.id), 'lieu:chateau-d-eau-ouest');
  assert.equal(m.cle(b.id), 'lieu:chateau-d-eau-ouest-2');
  assert.equal(m.cle(c.id), 'lieu:chateau-d-eau-ouest-3');
  const p = creerFiche(m.db, m.mj.id, m.u.id, { type: 'personnage', titre: 'Château d’Éau — Ouest', charge: { pj: false } });
  assert.equal(m.cle(p.id), 'personnage:chateau-d-eau-ouest', 'the type is in the key: no collision with the lieu');
  assert.equal((m.db.prepare('SELECT creee_via FROM fiches WHERE id = ?').get(a.id) as { creee_via: string }).creee_via, 'ecran');
  // the same title in another universe is not a collision
  const x = lieu(m, 'Château d’Éau — Ouest', m.u2.id);
  assert.equal(m.cle(x.id), 'lieu:chateau-d-eau-ouest');
});

test('un titre sans lettre ni chiffre donne tout de même une clé non vide et unique', () => {
  const m = monde();
  const a = lieu(m, '???');
  const b = lieu(m, '!!!');
  assert.notEqual(m.cle(a.id), m.cle(b.id));
  assert.match(m.cle(a.id), /^lieu:./);
});

test('un titre très long : la clé tient dans 200 caractères et reste unique', () => {
  const m = monde();
  const t = 'a'.repeat(120);
  const a = lieu(m, t);
  const b = lieu(m, t);
  assert.ok(m.cle(a.id).length <= 200 && m.cle(b.id).length <= 200);
  assert.notEqual(m.cle(a.id), m.cle(b.id));
});

test('l’ancienne clé d’une fiche n’est pas redonnée à une fiche nouvelle de même titre', () => {
  const m = monde();
  const a = lieu(m, 'Port');
  changerCleFiche(m.db, m.acteur, m.u.id, a.id, 'lieu:vieux-port');
  const b = lieu(m, 'Port');
  assert.notEqual(m.cle(b.id), 'lieu:port', 'lieu:port still resolves the first sheet');
  assert.equal(resoudreFiche(m.db, m.u.id, 'lieu:port')?.id, a.id);
});

test('une section créée reçoit une clé de son titre, doublon suffixé, par fiche', () => {
  const m = monde();
  const a = lieu(m, 'A');
  const b = lieu(m, 'B');
  const s = (f: number, titre: string) =>
    (m.db.prepare('SELECT cle FROM sections WHERE id = ?').get(ajouterSection(m.db, m.mj.id, m.u.id, f, { titre }).id) as { cle: string }).cle;
  assert.equal(s(a.id, 'Vérité cachée'), 'verite-cachee');
  assert.equal(s(a.id, 'Verite  cachee'), 'verite-cachee-2');
  assert.equal(s(b.id, 'Vérité cachée'), 'verite-cachee', 'unique per sheet only');
  assert.equal(s(a.id, '???'), 'section');
  assert.equal(s(a.id, '!!'), 'section-2');
});

test('un univers créé reçoit une clé de son nom ; doublon suffixé ; sans lettre : univers-<id>', () => {
  const m = monde();
  assert.deepEqual(clesUnivers(m.db), ['eneria-prime', 'ailleurs']);
  const b = creerUnivers(m.db, m.mj.id, { nom: 'ENERIA   prime' });
  const c = creerUnivers(m.db, m.mj.id, { nom: 'Eneria Prime' });
  const n = creerUnivers(m.db, m.mj.id, { nom: '2024' });
  const court = creerUnivers(m.db, m.mj.id, { nom: 'Z' });
  const long = creerUnivers(m.db, m.mj.id, { nom: 'Les chroniques interminables du royaume oublié des brumes' });
  const cles = Object.fromEntries(
    (m.db.prepare('SELECT id, cle FROM univers').all() as { id: number; cle: string }[]).map((r) => [r.id, r.cle]),
  );
  assert.equal(cles[b.id], 'eneria-prime-2');
  assert.equal(cles[c.id], 'eneria-prime-3');
  assert.equal(cles[n.id], `univers-${n.id}`);
  assert.equal(cles[court.id], `univers-${court.id}`, 'one letter is below the 2 minimum');
  assert.ok(cles[long.id]!.length <= 40 && /^[a-z0-9-]+$/.test(cles[long.id]!) && !cles[long.id]!.endsWith('-'));
  assert.equal(new Set(Object.values(cles)).size, Object.keys(cles).length);
});

test('changerCleFiche par un MJ : la nouvelle clé résout, l’ancienne aussi (redirection)', () => {
  const m = monde();
  const a = lieu(m, 'Port-Sel');
  const r = changerCleFiche(m.db, m.acteur, m.u.id, a.id, 'lieu:port');
  assert.deepEqual(r, { cle: 'lieu:port', ancienne: 'lieu:port-sel' });
  assert.equal(m.cle(a.id), 'lieu:port');
  assert.deepEqual(resoudreFiche(m.db, m.u.id, 'lieu:port'), { id: a.id, cle: 'lieu:port', ancienne: false });
  assert.deepEqual(resoudreFiche(m.db, m.u.id, 'lieu:port-sel'), { id: a.id, cle: 'lieu:port', ancienne: true });
  assert.equal(resoudreFiche(m.db, m.u.id, 'lieu:inconnu'), null);
  assert.equal(resoudreFiche(m.db, m.u2.id, 'lieu:port'), null, 'a key belongs to its universe');
  assert.equal(resoudreFiche(m.db, m.u2.id, 'lieu:port-sel'), null, 'so does a former key');
  // same key: nothing to do, no former row
  assert.deepEqual(changerCleFiche(m.db, m.acteur, m.u.id, a.id, 'lieu:port'), { cle: 'lieu:port', ancienne: null });
  // a second change keeps both former keys
  changerCleFiche(m.db, m.acteur, m.u.id, a.id, 'port_sel');
  assert.equal(resoudreFiche(m.db, m.u.id, 'lieu:port')?.cle, 'port_sel');
  assert.equal(resoudreFiche(m.db, m.u.id, 'lieu:port-sel')?.id, a.id);
});

test('une référence de chiffres seuls est un id, jamais une clé', () => {
  const m = monde();
  const a = lieu(m, 'Port-Sel');
  const b = lieu(m, 'Autre');
  assert.deepEqual(resoudreFiche(m.db, m.u.id, String(a.id)), { id: a.id, cle: m.cle(a.id), ancienne: false });
  assert.equal(resoudreFiche(m.db, m.u.id, '9999'), null);
  assert.equal(resoudreFiche(m.db, m.u2.id, String(b.id)), null, 'an id of another universe does not resolve');
  assert.deepEqual(resoudreUnivers(m.db, String(m.u.id)), { id: m.u.id, cle: 'eneria-prime', ancienne: false });
  assert.equal(resoudreUnivers(m.db, '9999'), null);
  assert.equal(resoudreUnivers(m.db, 'inconnu'), null);
});

test('une clé déjà prise est conflit/cle_prise, rien ne bouge', () => {
  const m = monde();
  const a = lieu(m, 'A');
  const b = lieu(m, 'B');
  const e = err(() => changerCleFiche(m.db, m.acteur, m.u.id, b.id, m.cle(a.id)));
  assert.equal(e.code, 'conflit');
  assert.equal(e.detail, 'cle_prise');
  assert.equal(m.cle(b.id), 'lieu:b');
  assert.equal((m.db.prepare('SELECT COUNT(*) n FROM cles_anciennes').get() as { n: number }).n, 0);
  // the same key in another universe is free
  const x = lieu(m, 'X', m.u2.id);
  assert.equal(changerCleFiche(m.db, { compteId: m.autreMj.id }, m.u2.id, x.id, 'lieu:a').cle, 'lieu:a');
});

test('l’ancienne clé d’une autre fiche est cle_prise ; le propriétaire reprend la sienne, la ligne ancienne part', () => {
  const m = monde();
  const a = lieu(m, 'A');
  const b = lieu(m, 'B');
  changerCleFiche(m.db, m.acteur, m.u.id, a.id, 'lieu:nouveau-a'); // 'lieu:a' is now a former key of a
  const e = err(() => changerCleFiche(m.db, m.acteur, m.u.id, b.id, 'lieu:a'));
  assert.deepEqual([e.code, e.detail], ['conflit', 'cle_prise']);
  assert.equal(resoudreFiche(m.db, m.u.id, 'lieu:a')?.id, a.id, 'still resolves a');
  // a takes its own former key back
  const r = changerCleFiche(m.db, m.acteur, m.u.id, a.id, 'lieu:a');
  assert.deepEqual(r, { cle: 'lieu:a', ancienne: 'lieu:nouveau-a' });
  assert.deepEqual(resoudreFiche(m.db, m.u.id, 'lieu:a'), { id: a.id, cle: 'lieu:a', ancienne: false });
  assert.equal(resoudreFiche(m.db, m.u.id, 'lieu:nouveau-a')?.ancienne, true);
  const lignes = m.db.prepare('SELECT cle FROM cles_anciennes WHERE fiche_id = ?').all(a.id) as { cle: string }[];
  assert.deepEqual(lignes.map((l) => l.cle), ['lieu:nouveau-a'], 'the taken-back key is no longer a former one');
});

test('une clé de fiche hors forme est invalide, champ cle', () => {
  const m = monde();
  const a = lieu(m, 'A');
  const mauvaises: unknown[] = [
    '123', // no letter
    '1:2',
    'a:b:c', // two colons
    'Maj', // uppercase
    'avec espace',
    'é-accent',
    'a/b',
    'a.b',
    'x', // 1 char
    '',
    'a'.repeat(201),
    '-',
    null,
    42,
    undefined,
  ];
  for (const cle of mauvaises) {
    const e = err(() => changerCleFiche(m.db, m.acteur, m.u.id, a.id, cle));
    assert.equal(e.code, 'invalide', String(cle));
    assert.equal(e.champ, 'cle', String(cle));
  }
  assert.equal(m.cle(a.id), 'lieu:a');
  // the limits that are valid
  for (const ok of ['ab', 'a'.repeat(200), 'a:1', 'a_b-c', 'lieu:port-sel', 'a1']) {
    assert.equal(changerCleFiche(m.db, m.acteur, m.u.id, a.id, ok).cle, ok);
  }
});

test('un joueur, un MJ étranger, une fiche inconnue ou d’un autre univers : introuvable', () => {
  const m = monde();
  const a = lieu(m, 'A');
  const x = lieu(m, 'X', m.u2.id);
  const cas: [string, () => unknown][] = [
    ['joueur', () => changerCleFiche(m.db, { compteId: m.lea.id }, m.u.id, a.id, 'lieu:z')],
    ['joueur, clé invalide', () => changerCleFiche(m.db, { compteId: m.lea.id }, m.u.id, a.id, '123')],
    ['MJ étranger', () => changerCleFiche(m.db, { compteId: m.autreMj.id }, m.u.id, a.id, 'lieu:z')],
    ['fiche inconnue', () => changerCleFiche(m.db, m.acteur, m.u.id, 99999, 'lieu:z')],
    ['fiche d’un autre univers', () => changerCleFiche(m.db, m.acteur, m.u.id, x.id, 'lieu:z')],
    ['joueur, univers', () => changerCleUnivers(m.db, { compteId: m.lea.id }, m.u.id, 'nouveau')],
    ['MJ étranger, univers', () => changerCleUnivers(m.db, { compteId: m.autreMj.id }, m.u.id, 'nouveau')],
    ['univers inconnu', () => changerCleUnivers(m.db, m.acteur, 9999, 'nouveau')],
  ];
  for (const [nom, fn] of cas) assert.equal(err(fn).code, 'introuvable', nom);
  assert.equal(m.cle(a.id), 'lieu:a');
  assert.equal(clesUnivers(m.db)[0], 'eneria-prime');
});

test('un MJ en mode Joueur ne change aucune clé', () => {
  const m = monde();
  const a = lieu(m, 'A');
  assert.equal(err(() => changerCleFiche(m.db, { compteId: m.mj.id, modeJoueur: true }, m.u.id, a.id, 'lieu:z')).code, 'refuse');
  assert.equal(err(() => changerCleUnivers(m.db, { compteId: m.mj.id, modeJoueur: true }, m.u.id, 'zz')).code, 'refuse');
  assert.equal(m.cle(a.id), 'lieu:a');
});

test('identifiant d’univers hors forme : invalide, champ cle (majuscule, 41 caractères, sans lettre, 1 caractère, symboles)', () => {
  const m = monde();
  for (const cle of ['Maj', 'a'.repeat(41), '12345', '1-2', 'a', '', 'a_b', 'a b', 'é', 'a:b', null, 7]) {
    const e = err(() => changerCleUnivers(m.db, m.acteur, m.u.id, cle));
    assert.equal(e.code, 'invalide', String(cle));
    assert.equal(e.champ, 'cle', String(cle));
  }
  assert.equal(clesUnivers(m.db)[0], 'eneria-prime');
  for (const ok of ['ab', 'a'.repeat(40), 'a1', 'a-b-1']) {
    assert.equal(changerCleUnivers(m.db, m.acteur, m.u.id, ok).cle, ok);
  }
});

test('changerCleUnivers : ancienne clé gardée et résolue, cle_prise (clé ou ancienne d’un autre), reprise de la sienne', () => {
  const m = monde();
  const r = changerCleUnivers(m.db, m.acteur, m.u.id, 'eneria');
  assert.deepEqual(r, { cle: 'eneria', ancienne: 'eneria-prime' });
  assert.deepEqual(resoudreUnivers(m.db, 'eneria'), { id: m.u.id, cle: 'eneria', ancienne: false });
  assert.deepEqual(resoudreUnivers(m.db, 'eneria-prime'), { id: m.u.id, cle: 'eneria', ancienne: true });
  const prise = err(() => changerCleUnivers(m.db, { compteId: m.autreMj.id }, m.u2.id, 'eneria'));
  assert.deepEqual([prise.code, prise.detail], ['conflit', 'cle_prise']);
  const ancienne = err(() => changerCleUnivers(m.db, { compteId: m.autreMj.id }, m.u2.id, 'eneria-prime'));
  assert.deepEqual([ancienne.code, ancienne.detail], ['conflit', 'cle_prise']);
  assert.equal(resoudreUnivers(m.db, 'eneria-prime')?.id, m.u.id, 'unchanged');
  assert.deepEqual(changerCleUnivers(m.db, m.acteur, m.u.id, 'eneria'), { cle: 'eneria', ancienne: null });
  changerCleUnivers(m.db, m.acteur, m.u.id, 'eneria-prime'); // takes its own back
  assert.equal(resoudreUnivers(m.db, 'eneria-prime')?.ancienne, false);
  assert.deepEqual(
    (m.db.prepare('SELECT cle FROM univers_cles_anciennes').all() as { cle: string }[]).map((l) => l.cle),
    ['eneria'],
  );
  // a newly created universe of the same name does not take a former key
  const n = creerUnivers(m.db, m.mj.id, { nom: 'Eneria' });
  assert.notEqual((m.db.prepare('SELECT cle FROM univers WHERE id = ?').get(n.id) as { cle: string }).cle, 'eneria');
});

test('supprimer une fiche libère sa clé et ses anciennes clés ne résolvent plus rien', async () => {
  const { supprimerFiche } = await import('./fiches.js');
  const m = monde();
  const a = lieu(m, 'A');
  changerCleFiche(m.db, m.acteur, m.u.id, a.id, 'lieu:b');
  supprimerFiche(m.db, m.acteur, m.u.id, a.id);
  assert.equal(resoudreFiche(m.db, m.u.id, 'lieu:a'), null);
  assert.equal(resoudreFiche(m.db, m.u.id, 'lieu:b'), null);
  assert.equal((m.db.prepare('SELECT COUNT(*) n FROM cles_anciennes').get() as { n: number }).n, 0);
});

test('creee_via : écran par défaut, assistant, import (clé d’origine gardée telle quelle)', () => {
  const m = monde();
  const via = (id: number) => (m.db.prepare('SELECT creee_via v FROM fiches WHERE id = ?').get(id) as { v: string }).v;
  const a = creerFiche(m.db, m.mj.id, m.u.id, { type: 'lieu', titre: 'A', via: 'assistant' });
  const i = creerFiche(m.db, m.mj.id, m.u.id, {
    type: 'lieu', titre: 'Importée', origine: { cle: 'lieu:ma-cle' },
  });
  assert.deepEqual([via(lieu(m, 'B').id), via(a.id), via(i.id)], ['ecran', 'assistant', 'import']);
  assert.equal(m.cle(i.id), 'lieu:ma-cle');
  assert.equal(m.cle(a.id), 'lieu:a');
});
