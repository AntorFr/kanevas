import { rendreMarkdown } from './markdown.js';
import type { Db } from '../db/db.js';
import { campagneBrute, exigerMJDeCampagne } from './campagnes.js';
import { resolveurLiens } from './droits.js';
import { ErreurService, introuvable, invalide } from './erreurs.js';
import { validerTitre } from './fiches.js';
// A scenario's content has the same ceiling as a section's (AD-91).
import { validerContenu } from './sections.js';
import type { ResultatSuiviImport } from './import.js';

export const MAX_TITRE_SCENARIO = 120;

export interface Scenario {
  id: number;
  campagneId: number;
  titre: string;
  contenu: string;
  /** The source rendered by `rendreMarkdown` (the reader is always the GM, who also gets the source). */
  html: string;
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
  cle_origine: string | null;
  dernier_import: string | null;
  version_importee: number | null;
}

/**
 * A scenario as its GM reads it (AD-97): the links resolve in the universe of its campaign, under the
 * GM's rights (everything is readable, vanished and waiting targets are marked); `:::mj` stays text.
 */
const versScenario = (db: Db, compteId: number, r: ScenarioRow): Scenario => ({
  id: r.id,
  campagneId: r.campagne_id,
  titre: r.titre,
  contenu: r.contenu,
  html: rendreMarkdown(r.contenu, {
    nature: 'scenario',
    liens: resolveurLiens(db, campagneBrute(db, r.campagne_id).univers_id, 'mj', { compteId }, r.contenu),
  }),
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

/** The GM creates a scenario (title 1 to 120, content up to 100 000), version 1. */
export function creerScenario(
  db: Db,
  compteId: number,
  campagneId: number,
  entree: { titre: string; contenu?: string },
): Scenario {
  exigerMJDeCampagne(db, compteId, campagneId);
  const titre = validerTitre(entree.titre, MAX_TITRE_SCENARIO, 'Le titre');
  const contenu = entree.contenu ?? '';
  validerContenu(contenu);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO scenarios (campagne_id, titre, contenu, cree_le, modifie_le) VALUES (?, ?, ?, ?, ?)',
    )
    .run(campagneId, titre, contenu, now, now);
  return versScenario(db, compteId, chargerPourMJ(db, compteId, Number(info.lastInsertRowid)));
}

/** Scenarios of a campaign, oldest first (never carried by the campaign list, AD-30). */
export function listerScenarios(db: Db, compteId: number, campagneId: number): Scenario[] {
  exigerMJDeCampagne(db, compteId, campagneId);
  return (
    db
      .prepare('SELECT * FROM scenarios WHERE campagne_id = ? ORDER BY cree_le, id')
      .all(campagneId) as ScenarioRow[]
  ).map((r) => versScenario(db, compteId, r));
}

export function lireScenario(db: Db, compteId: number, scenarioId: number): Scenario {
  return versScenario(db, compteId, chargerPourMJ(db, compteId, scenarioId));
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
    const titre = validerTitre(entree.titre, MAX_TITRE_SCENARIO, 'Le titre');
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
    return versScenario(db, compteId, chargerPourMJ(db, compteId, scenarioId));
  })();
}

/** AD-121: scenario keys are scoped to THEIR campaign; no caller-supplied universe (AD-47). */
export function assurerScenario(
  db: Db,
  compteId: number,
  campagneId: number,
  cle: string,
  entree: { titre: string; contenu: string },
): ResultatSuiviImport {
  exigerMJDeCampagne(db, compteId, campagneId);
  return db.transaction((): ResultatSuiviImport => {
    const row = db.prepare('SELECT * FROM scenarios WHERE campagne_id = ? AND cle_origine = ?')
      .get(campagneId, cle) as ScenarioRow | undefined;
    if (!row) {
      const s = creerScenario(db, compteId, campagneId, entree);
      db.prepare('UPDATE scenarios SET cle_origine = ?, dernier_import = ?, version_importee = ? WHERE id = ?')
        .run(cle, JSON.stringify({ titre: s.titre }), s.version, s.id);
      return { id: s.id, etat: 'creee', avertissements: [] };
    }
    const marque = JSON.parse(row.dernier_import ?? '{}') as { titre?: string };
    const avertissements: string[] = [];
    let titre = row.titre;
    let contenu = row.contenu;
    if (titre === entree.titre) marque.titre = titre;
    else if (titre === marque.titre) titre = marque.titre = entree.titre;
    else avertissements.push('titre modifié dans Kanevas : non écrasé');

    const contenuImporte = row.version_importee !== null && row.version === row.version_importee;
    if (contenu !== entree.contenu) {
      if (contenuImporte) contenu = entree.contenu;
      else avertissements.push('contenu modifié dans Kanevas : non écrasé');
    }
    const change = titre !== row.titre || contenu !== row.contenu;
    let versionImportee = row.version_importee;
    if (change) {
      const s = ecrireScenario(db, compteId, row.id, { titre, contenu }, row.version);
      // Updating an imported title must not adopt a hand-edited content as ours (B-48).
      if (contenuImporte) versionImportee = s.version;
    }
    const json = JSON.stringify(marque);
    if (json !== row.dernier_import || versionImportee !== row.version_importee) {
      db.prepare('UPDATE scenarios SET dernier_import = ?, version_importee = ? WHERE id = ?')
        .run(json, versionImportee, row.id);
    }
    return { id: row.id, etat: change ? 'mise_a_jour' : 'inchangee', avertissements };
  })();
}
