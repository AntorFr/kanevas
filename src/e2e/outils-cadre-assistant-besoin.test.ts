// Black-box test of what kanevas-outils-cadre delivers to the assistant (B-59, B-69, AD-136): an assistant
// tool declared by « Essai A » is in `catalogueDe` of a GM when the tool is enabled AND visible to the
// role, absent for a player when the tool is « MJ seul », absent when disabled, and absent for an
// account that is no member. The world is the stub's starting data (« Système d'essai » #3, « Éneria
// d'essai » #5 with Antor and Mira GM and Léa Player, « Univers voisin » #6 with Antor alone), seeded
// through the services into a throw-away in-memory database; the assistant's catalogue and the
// tool-writing services are the real ones.
//
// TEST PLAN
//   nominal   : A enabled, visible to both → Antor and Léa have `essai_a_decrire`
//   bords     : A « MJ seul » → Antor has it, Léa not; A visible to players but disabled → nobody
//   exclusion : an account with no role in the universe gets `introuvable`, never a catalogue
//   univers   : forced « Activé » in « Univers voisin » while the system is off: Antor has it there, not in Éneria
//   outil     : executing it is a read: ok, no event, names the tool
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';

async function monde() {
  const { openDb, migrate } = await import('../db/db.js');
  const { semerBouchon } = await import('../bouchon/depart.js');
  const { assurerCompte } = await import('../services/comptes.js');
  const { catalogueDe } = await import('../services/assistant/catalogue.js');
  const outils = await import('../services/outils.js');
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const id = (nom: string) => assurerCompte(db, nom).id;
  const un = (nom: string) => (db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const sys = (db.prepare("SELECT id FROM systemes_jeu WHERE nom = 'Système d''essai'").get() as { id: number }).id;
  const noms = (compte: string, univers: number) => catalogueDe(db, id(compte), univers).outils.map((o) => o.nom);
  return { db, id, un, sys, noms, catalogueDe, outils };
}

const OUTIL = 'essai_a_decrire';

test('assistant : A activé et visible → l’outil d’assistant d’Essai A est chez Antor et chez Léa', async () => {
  const { id, un, sys, noms, outils, db } = await monde();
  outils.poserActivation(db, id('antor'), { niveau: 'systeme', id: sys }, 'essai/a', true);
  assert.ok(noms('antor', un("Éneria d'essai")).includes(OUTIL));
  assert.ok(noms('lea', un("Éneria d'essai")).includes(OUTIL));
});

test('assistant : A désactivé (par défaut) → l’outil n’est chez personne', async () => {
  const { un, noms } = await monde();
  assert.ok(!noms('antor', un("Éneria d'essai")).includes(OUTIL));
  assert.ok(!noms('lea', un("Éneria d'essai")).includes(OUTIL));
});

test('assistant : A « MJ seul » → chez Antor, absent pour Léa', async () => {
  const { id, un, sys, noms, outils, db } = await monde();
  outils.poserActivation(db, id('antor'), { niveau: 'systeme', id: sys }, 'essai/a', true);
  outils.poserVisibilite(db, id('antor'), { niveau: 'systeme', id: sys }, 'essai/a', { joueur: false });
  assert.ok(noms('antor', un("Éneria d'essai")).includes(OUTIL));
  assert.ok(!noms('lea', un("Éneria d'essai")).includes(OUTIL));
  assert.ok(noms('mira', un("Éneria d'essai")).includes(OUTIL));
  // then visible to players again
  outils.poserVisibilite(db, id('antor'), { niveau: 'systeme', id: sys }, 'essai/a', { joueur: true });
  assert.ok(noms('lea', un("Éneria d'essai")).includes(OUTIL));
});

test('assistant : visible aux joueurs mais pas aux MJ → absent chez le MJ, présent chez la joueuse', async () => {
  const { id, un, sys, noms, outils, db } = await monde();
  outils.poserActivation(db, id('antor'), { niveau: 'systeme', id: sys }, 'essai/a', true);
  outils.poserVisibilite(db, id('antor'), { niveau: 'systeme', id: sys }, 'essai/a', { mj: false });
  assert.ok(!noms('antor', un("Éneria d'essai")).includes(OUTIL));
  assert.ok(noms('lea', un("Éneria d'essai")).includes(OUTIL));
});

test('assistant : un compte sans rôle dans l’univers n’a aucun catalogue (introuvable)', async () => {
  const { id, un, catalogueDe, db } = await monde();
  assert.throws(() => catalogueDe(db, id('lea'), un('Univers voisin')), (e: any) => e.code === 'introuvable');
  assert.throws(() => catalogueDe(db, id('teo'), un("Éneria d'essai")), (e: any) => e.code === 'introuvable');
});

test('assistant : activé de force dans Univers voisin alors que le système est éteint → là seulement', async () => {
  const { id, un, noms, outils, db } = await monde();
  outils.poserActivation(db, id('antor'), { niveau: 'univers', id: un('Univers voisin') }, 'essai/a', true);
  assert.ok(noms('antor', un('Univers voisin')).includes(OUTIL));
  assert.ok(!noms('antor', un("Éneria d'essai")).includes(OUTIL));
});

test('assistant : exécuter l’outil est une lecture : réussie, sans événement, elle nomme l’outil', async () => {
  const { id, un, sys, outils, db, catalogueDe } = await monde();
  outils.poserActivation(db, id('antor'), { niveau: 'systeme', id: sys }, 'essai/a', true);
  const o = catalogueDe(db, id('lea'), un("Éneria d'essai")).outils.find((x) => x.nom === OUTIL)!;
  const r: any = await o.executer({});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.evenement, undefined);
  assert.match(JSON.stringify(r), /Essai A/);
});
