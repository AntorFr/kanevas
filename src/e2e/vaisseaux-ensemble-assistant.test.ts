// Feature-level test of the assistant tool « calculer un vaisseau » of kanevas-outils-vaisseaux (B-69, V-9 of
// ARCHITECTURE.md: delivered without a screen, so the contract is the entry point). The world is the stub's starting
// data seeded into a throw-away in-memory database; the assistant's catalogue and the services are the real ones.
// Expected values are literals calculated by hand from the trial catalogue.
//
// TEST PLAN
//   nominal   : by names (frégate, Moteur 2, Soute, Laser, Lance d'essai) the tool gives 685 000 cr, 28 jours, puissance libre 4,
//               masse libre 7 — the very figures of « Vent d'Orak » on screen — and no event
//   bords     : a design that is over budget is still *calculated* (blocking alert), a design by its title gives its stored figures
//   échec     : a design the account does not read → { ok:false, erreur:'Introuvable.' } and no event; an account without role has no catalogue
//   exclusion : the tool is absent when the designer is disabled for the universe
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';

async function monde() {
  const { openDb, migrate } = await import('../db/db.js');
  const { semerBouchon } = await import('../bouchon/depart.js');
  const { assurerCompte } = await import('../services/comptes.js');
  const { catalogueDe } = await import('../services/assistant/catalogue.js');
  const outils = await import('../services/outils.js');
  const membres = await import('../services/membres.js');
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const id = (nom: string) => assurerCompte(db, nom).id;
  const E = (db.prepare("SELECT id FROM univers WHERE nom = 'Éneria d''essai'").get() as { id: number }).id;
  const outil = (compte: string) => catalogueDe(db, id(compte), E).outils.find((o) => o.nom === 'swn_vaisseau_calculer');
  return { db, id, E, outil, catalogueDe, outils, membres };
}

const ORAK = { coque: "Frégate d'essai", choix: [{ nature: 'moteurs', nom: 'Moteur 2' }, { nature: 'amenagements', nom: 'Soute' }, { nature: 'armes', nom: 'Laser' }, { nature: 'armes', nom: "Lance d'essai" }] };

test('B-69 : par noms, l’outil rend les chiffres de « Vent d’Orak » à l’écran, sans événement', async () => {
  const { outil } = await monde();
  const o = outil('lea');
  assert.ok(o, 'Léa has the tool');
  const r: any = await o.executer(ORAK);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.evenement, undefined);
  const res = (r.resultat ?? r.donnees?.resultat ?? r.donnees ?? r);
  const txt = JSON.stringify(r);
  assert.equal(res.prix, 685000, txt);
  assert.equal(res.chantierJours, 28);
  assert.equal(res.entretien, 34250);
  assert.equal(res.puissanceLibre, 4);
  assert.equal(res.masseLibre, 7);
  assert.equal(res.pv, 30);
  assert.equal(res.ca, 14);
});

test('B-69 : l’outil calcule une conception qui dépasse la puissance (deux lances) avec l’alerte bloquante', async () => {
  const { outil } = await monde();
  const r: any = await outil('lea')!.executer({ coque: "Frégate d'essai", choix: [{ nature: 'moteurs', nom: 'Moteur 2' }, { nature: 'armes', nom: 'Laser' }, { nature: 'armes', nom: "Lance d'essai", quantite: 2 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(JSON.stringify(r), /Puissance insuffisante : −2/);
});

test('B-69 : par le titre d’une conception lisible, l’outil rend le résultat enregistré', async () => {
  const { outil } = await monde();
  const r: any = await outil('lea')!.executer({ conception: "Vent d'Orak" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.evenement, undefined);
  assert.match(JSON.stringify(r), /685000/);
});

test('B-69 exclusion : une conception que le compte ne lit pas → { ok:false } « Introuvable. », sans événement', async () => {
  const { outil, db, E, id, membres } = await monde();
  // Teo is made a player of the universe: he reads « Étoile du soir » but not « Vent d'Orak ».
  membres.ajouterMembre(db, id('antor'), E, 'teo', 'joueur');
  const o = outil('teo');
  assert.ok(o, 'Teo, a player, has the tool');
  const r: any = await o.executer({ conception: "Vent d'Orak" });
  assert.equal(r.ok, false);
  assert.equal(r.erreur, 'Introuvable.');
  assert.equal(r.evenement, undefined);
  const lisible: any = await o.executer({ conception: 'Étoile du soir' });
  assert.equal(lisible.ok, true, JSON.stringify(lisible));
});

test('B-69 exclusion : un compte sans rôle dans l’univers n’a aucun catalogue', async () => {
  const { catalogueDe, id, E, db } = await monde();
  assert.throws(() => catalogueDe(db, id('teo'), E), (e: any) => e.code === 'introuvable');
});

test('B-69 : l’outil est absent quand le concepteur est désactivé pour le système', async () => {
  const { outil, outils, db, id } = await monde();
  const sys = (db.prepare("SELECT id FROM systemes_jeu WHERE nom = 'Système d''essai'").get() as { id: number }).id;
  assert.ok(outil('lea'));
  outils.poserActivation(db, id('antor'), { niveau: 'systeme', id: sys }, 'swn/vaisseaux', false);
  assert.equal(outil('lea'), undefined);
  assert.equal(outil('antor'), undefined);
});
