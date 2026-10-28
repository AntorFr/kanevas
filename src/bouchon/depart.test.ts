import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb } from '../db/db.js';
import { assurerCompte } from '../services/comptes.js';
import { listerSystemes } from '../services/systemes.js';
import { listerUnivers } from '../services/univers.js';
import { semerBouchon } from './depart.js';

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

test('semis : univers, rôles et systèmes des critères ; Teo n’a rien ; Mira son seul univers', () => {
  const db = monde();
  assert.equal(semerBouchon(db), true);
  const id = (u: string) => assurerCompte(db, u).id;
  const rolesAntor = listerUnivers(db, id('antor')).map((u) => [u.nom, u.role, u.systeme?.nom]);
  assert.deepEqual(rolesAntor, [
    ['Essai Kanka', 'mj', undefined],
    ["Lame d'Ébène", 'mj', 'CoF Mini'],
    ['Les Cendres de Vaëlis', 'joueur', 'Chroniques Oubliées Fantasy'],
  ]);
  assert.deepEqual(listerUnivers(db, id('lea')).map((u) => [u.nom, u.role]), [['Essai Kanka', 'joueur'], ["Lame d'Ébène", 'joueur']]);
  assert.deepEqual(listerUnivers(db, id('teo')), []);
  assert.deepEqual(listerSystemes(db, id('teo')), []);
  const mira = listerSystemes(db, id('mira'));
  assert.equal(mira.length, 1);
  assert.equal(mira[0]!.nom, 'CoF Mini');
  assert.equal(mira[0]!.nbUnivers, 2);
  assert.deepEqual(mira[0]!.mesUnivers.map((u) => u.nom), ['Les Landes grises']);
  assert.deepEqual(mira[0]!.entrees, { regle: 3, creature: 4, objet: 2 });
});

test('semis : fiches sans illustration, une seule fois, jamais sur une base qui a un univers', () => {
  const db = monde();
  semerBouchon(db);
  const titres = (db.prepare('SELECT titre FROM fiches ORDER BY titre').all() as { titre: string }[]).map((r) => r.titre);
  for (const t of ['Maître Aldric', 'Le Prieur masqué', "Le Portrait de l'échec", 'La Fresque effacée', 'Cercle des Cendres']) {
    assert.ok(titres.includes(t), t);
  }
  assert.equal((db.prepare('SELECT COUNT(*) n FROM pieces_jointes').get() as { n: number }).n, 0);
  assert.equal(semerBouchon(db), false);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM univers').get() as { n: number }).n, 4);
});

// ---- AD-126: la campagne « La Couronne brisée » et « Acte II » ----
import { lireFiche, listerFiches } from '../services/fiches.js';
import { listerTaches } from '../services/preparation.js';
import { listerComptesRendus } from '../services/comptes_rendus.js';

function couronne() {
  const db = monde();
  semerBouchon(db);
  const antor = assurerCompte(db, 'antor').id;
  const lea = assurerCompte(db, 'lea').id;
  const ligne = (t: string) => db.prepare('SELECT id, univers_id u, parent_id p FROM fiches WHERE titre = ?').get(t) as
    { id: number; u: number; p: number | null };
  return { db, antor, lea, camp: ligne('La Couronne brisée'), acte: ligne('Acte II — Le sceau brisé') };
}

test('semis : Antor voit La Couronne brisée (Campagne, En cours, Présentation ouverte) et Acte II dessous (Scénario, Prête)', () => {
  const { db, antor, camp, acte } = couronne();
  assert.equal(acte.u, camp.u);
  assert.equal(acte.p, camp.id);
  assert.equal(camp.p, null);
  const c = lireFiche(db, { compteId: antor }, camp.u, camp.id) as any;
  assert.equal(c.type, 'aventure');
  assert.equal(c.sousType, 'Campagne');
  assert.equal(c.charge.statut, 'en_cours');
  const pres = c.sections.find((s: any) => s.titre === 'Présentation');
  assert.equal(pres.audience.joueursLisent, true);
  const a = lireFiche(db, { compteId: antor }, acte.u, acte.id) as any;
  assert.equal(a.sousType, 'Scénario');
  assert.equal(a.charge.statut, 'prete');
  assert.deepEqual(a.ancetres.map((x: any) => x.titre), ['La Couronne brisée']);
  assert.ok(a.sections.length > 0);
  assert.ok(a.sections.every((s: any) => s.audience.joueursLisent === false));
});

test('semis : Léa voit la campagne mais jamais Acte II, ni par la liste, ni par la lecture, ni par la recherche', () => {
  const { db, lea, camp, acte } = couronne();
  const l = listerFiches(db, { compteId: lea }, camp.u, { type: 'aventure' }) as any;
  const titres = (l.fiches ?? l).map((f: any) => f.titre);
  assert.deepEqual(titres, ['La Couronne brisée']);
  assert.throws(() => lireFiche(db, { compteId: lea }, acte.u, acte.id), (e: any) => e.code === 'introuvable');
  const r = listerFiches(db, { compteId: lea }, camp.u, { recherche: 'sceau' }) as any;
  assert.ok(!(r.fiches ?? r).some((f: any) => /Acte II/.test(f.titre)));
  const c = lireFiche(db, { compteId: lea }, camp.u, camp.id) as any;
  assert.ok(!JSON.stringify(c).includes('Acte II'));
});

test('semis : deux tâches de préparation sur la campagne et le CR « Séance 12 »', () => {
  const { db, antor, lea, camp } = couronne();
  assert.equal(listerTaches(db, antor, camp.id).length, 2);
  assert.throws(() => listerTaches(db, lea, camp.id), (e: any) => e.code === 'introuvable');
  const crs = listerComptesRendus(db, { compteId: antor }, camp.u) as any;
  assert.deepEqual((crs.comptesRendus ?? crs.items ?? crs.liste).map((c: any) => c.titre), ['Séance 12']);
  assert.equal((db.prepare("SELECT count(*) n FROM fiches WHERE type='compte_rendu'").get() as any).n, 1);
});
