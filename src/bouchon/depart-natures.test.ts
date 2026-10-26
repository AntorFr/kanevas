import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from '../db/db.js';
import { assurerCompte } from '../services/comptes.js';
import { lireRelations } from '../services/relations.js';
import { lireCarte, listerCartes } from '../services/cartes.js';
import { mentionsDe } from '../services/mentions.js';
import { semerBouchon, semerIllustrations } from './depart.js';

async function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  await semerIllustrations(db, mkdtempSync(join(tmpdir(), 'semis-')));
  return db;
}

type R = { id: number; univers_id: number; sid: number };
test('semis des natures : relations, qualificatifs, lecture MJ/Léa/mode Joueur, famille, carte', async () => {
  const db = await monde();
  const univers = (db.prepare("SELECT id FROM univers WHERE nom = ?").get("Lame d'Ébène") as { id: number }).id;
  const fiche = (t: string) => db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(univers, t) as { id: number };
  const section = (f: number, t: string) => (db.prepare('SELECT id FROM sections WHERE fiche_id = ? AND titre = ?').get(f, t) as { id: number }).id;
  const antor = { compteId: assurerCompte(db, 'antor').id };
  const lea = { compteId: assurerCompte(db, 'lea').id };
  const modeJoueur = { ...antor, modeJoueur: true };
  const rel = (a: { compteId: number; modeJoueur?: boolean }, f: string, s: string) =>
    lireRelations(db, a, univers, fiche(f).id, section(fiche(f).id, s)).filter((r) => r.nature !== '').map((r) => [r.nature, r.qualificatif, r.cible.titre]);

  const attendu = [['se_situe', 'habite', 'Port-Sel'], ['membre', 'trésorier', 'La Guilde des Brumes']];
  assert.deepEqual(rel(antor, 'Maître Aldric', 'Apparence').sort(), attendu.sort());
  // Critère : Léa lit aussi les deux (sections lues).
  assert.deepEqual(rel(lea, 'Maître Aldric', 'Apparence').sort(), attendu.sort(), 'Léa : habite + trésorier');
  assert.deepEqual(rel(antor, 'Le Prieur masqué', 'Secret — MJ seul'), [['se_situe', 'se cache', 'Port-Sel']]);
  assert.throws(() => rel(lea, 'Le Prieur masqué', 'Secret — MJ seul'));
  assert.throws(() => rel(modeJoueur, 'Le Prieur masqué', 'Secret — MJ seul'));
  assert.deepEqual(rel(antor, 'Suie', 'Apparence'), [['se_situe', '', 'Les Docks']]);
  assert.deepEqual(rel(antor, 'Dame Ombeline de Val-Fortin', 'Apparence').sort(), [['membre', 'dirige', 'La Guilde des Brumes'], ['membre', 'veuve', 'Les Corvalis']].sort());
  assert.deepEqual(rel(antor, 'Bran Corvalis', 'Apparence'), [['membre', 'aîné', 'Les Corvalis']]);
  const fam = db.prepare('SELECT type FROM fiches WHERE id = ?').get(fiche('Les Corvalis').id) as { type: string };
  assert.equal(fam.type, 'famille');

  // Les trois libres : nature vide, texte en qualificatif ; mention conservée.
  const libres = db.prepare("SELECT qualificatif FROM relations WHERE nature = '' AND cible_fiche_id = ? ORDER BY qualificatif").all(fiche('Port-Sel').id) as { qualificatif: string }[];
  assert.deepEqual(libres.map((l) => l.qualificatif), ['maître de port', 'surveille', 'y fait passer ses cargaisons']);
  const m = mentionsDe(db, 'mj', antor, univers, fiche('Port-Sel').id);
  assert.ok(JSON.stringify(m).includes('La Guilde des Brumes'));
  assert.ok(JSON.stringify(m).includes('surveille') || JSON.stringify(m).includes('Rapport'));

  // Carte graphe.
  const cartes = listerCartes(db, antor.compteId, false, univers).cartes;
  const c = cartes.find((x) => x.titre === 'Carte de la côte')!;
  const lue = lireCarte(db, antor.compteId, false, c.id);
  const ids = lue.elements.map((e) => e.ficheId);
  assert.ok(ids.includes(fiche('Port-Sel').id) && ids.includes(fiche('Maître Aldric').id));
});
