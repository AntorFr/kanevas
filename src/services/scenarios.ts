import type { Db } from '../db/db.js';
import { exigerMJDeCampagne } from './campagnes.js';
import { ErreurService, introuvable, invalide } from './erreurs.js';
import { validerTitre } from './fiches.js';
// A scenario's content has the same ceiling as a section's (AD-91).
import { validerContenu } from './sections.js';

export interface Scenario {
  id: number;
  campagneId: number;
  titre: string;
  contenu: string;
  version: number;
  creeLe: string;
  modifieLe: string;
}

interface ScenarioRow {
  id: number;
  campagne_id: number;
  titre: string;
  contenu: string;
  version: number;
  cree_le: string;
  modifie_le: string;
}

const versScenario = (r: ScenarioRow): Scenario => ({
  id: r.id,
  campagneId: r.campagne_id,
  titre: r.titre,
  contenu: r.contenu,
  version: r.version,
  creeLe: r.cree_le,
  modifieLe: r.modifie_le,
});

/** A scenario, for the GM of ITS campaign's universe only (AD-47); everyone else: not found. */
function chargerPourMJ(db: Db, compteId: number, scenarioId: number): ScenarioRow {
  const s = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(scenarioId) as
    | ScenarioRow
    | undefined;
  if (!s) throw introuvable();
  exigerMJDeCampagne(db, compteId, s.campagne_id);
  return s;
}

/** The GM creates a scenario (title 1 to 120, content up to 20 000), version 1. */
export function creerScenario(
  db: Db,
  compteId: number,
  campagneId: number,
  entree: { titre: string; contenu?: string },
): Scenario {
  exigerMJDeCampagne(db, compteId, campagneId);
  const titre = validerTitre(entree.titre, 120, 'Le titre');
  const contenu = entree.contenu ?? '';
  validerContenu(contenu);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO scenarios (campagne_id, titre, contenu, cree_le, modifie_le) VALUES (?, ?, ?, ?, ?)',
    )
    .run(campagneId, titre, contenu, now, now);
  return versScenario(chargerPourMJ(db, compteId, Number(info.lastInsertRowid)));
}

/** Scenarios of a campaign, oldest first (never carried by the campaign list, AD-30). */
export function listerScenarios(db: Db, compteId: number, campagneId: number): Scenario[] {
  exigerMJDeCampagne(db, compteId, campagneId);
  return (
    db
      .prepare('SELECT * FROM scenarios WHERE campagne_id = ? ORDER BY cree_le, id')
      .all(campagneId) as ScenarioRow[]
  ).map(versScenario);
}

export function lireScenario(db: Db, compteId: number, scenarioId: number): Scenario {
  return versScenario(chargerPourMJ(db, compteId, scenarioId));
}

/**
 * Writes title and content. `version` is the one the caller read: if it is no
 * longer the current one nothing is written and the answer is a conflict
 * `scenario_modifie` (AD-62).
 */
export function ecrireScenario(
  db: Db,
  compteId: number,
  scenarioId: number,
  entree: { titre: string; contenu: string },
  version: number,
): Scenario {
  return db.transaction(() => {
    chargerPourMJ(db, compteId, scenarioId);
    const titre = validerTitre(entree.titre, 120, 'Le titre');
    validerContenu(entree.contenu);
    const info = db
      .prepare(
        `UPDATE scenarios SET titre = ?, contenu = ?, version = version + 1, modifie_le = ?
         WHERE id = ? AND version = ?`,
      )
      .run(titre, entree.contenu, new Date().toISOString(), scenarioId, version);
    if (info.changes === 0) {
      throw new ErreurService('conflit', 'Le scénario a changé.', 'scenario_modifie');
    }
    return versScenario(chargerPourMJ(db, compteId, scenarioId));
  })();
}
