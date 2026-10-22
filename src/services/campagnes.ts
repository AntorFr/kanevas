import type { Db } from '../db/db.js';
import { exigerMJ, exigerRole } from './droits.js';
import { introuvable, invalide } from './erreurs.js';
import { validerTitre } from './fiches.js';
import type { ResultatSuiviImport } from './import.js';

export const MAX_NOM_CAMPAGNE = 80;

export const STATUTS_CAMPAGNE = ['en_preparation', 'active', 'terminee'] as const;
export type StatutCampagne = (typeof STATUTS_CAMPAGNE)[number];

export interface Campagne {
  id: number;
  universId: number;
  nom: string;
  statut: StatutCampagne;
  creeLe: string;
}

interface CampagneRow {
  id: number;
  univers_id: number;
  nom: string;
  statut: StatutCampagne;
  cree_le: string;
  cle_origine: string | null;
  dernier_import: string | null;
}

const versCampagne = (r: CampagneRow): Campagne => ({
  id: r.id,
  universId: r.univers_id,
  nom: r.nom,
  statut: r.statut,
  creeLe: r.cree_le,
});

/** The campaign row, whatever the caller: only for services that then check rights on ITS universe. */
export function campagneBrute(db: Db, campagneId: number): CampagneRow {
  const row = db.prepare('SELECT * FROM campagnes WHERE id = ?').get(campagneId) as
    | CampagneRow
    | undefined;
  if (!row) throw introuvable();
  return row;
}

/**
 * Rights on a campaign's content (scenarios, tasks) are those of the universe
 * OF THE CAMPAIGN, never of an id the caller sends (AD-47). A non-member, a
 * player and an unknown campaign all get "not found" (AD-22).
 */
export function exigerMJDeCampagne(db: Db, compteId: number, campagneId: number): CampagneRow {
  const c = db.prepare('SELECT * FROM campagnes WHERE id = ?').get(campagneId) as
    | CampagneRow
    | undefined;
  if (!c) throw introuvable();
  const role = db
    .prepare('SELECT role FROM membres WHERE univers_id = ? AND compte_id = ?')
    .get(c.univers_id, compteId) as { role: string } | undefined;
  if (role?.role !== 'mj') throw introuvable();
  return c;
}

/** The GM creates a campaign, born "en préparation" (name 1 to 80 characters). Several may be active (AD-60). */
export function creerCampagne(
  db: Db,
  compteId: number,
  universId: number,
  entree: { nom: string },
): Campagne {
  exigerMJ(db, universId, compteId);
  const nom = validerTitre(entree.nom, MAX_NOM_CAMPAGNE, 'Le nom');
  const info = db
    .prepare('INSERT INTO campagnes (univers_id, nom, cree_le) VALUES (?, ?, ?)')
    .run(universId, nom, new Date().toISOString());
  return lireCampagneBrute(db, Number(info.lastInsertRowid));
}

function lireCampagneBrute(db: Db, id: number): Campagne {
  return versCampagne(campagneBrute(db, id));
}

/** Any member reads a campaign (name, status) of their universe; another universe's is unknown. */
export function lireCampagne(
  db: Db,
  compteId: number,
  universId: number,
  campagneId: number,
): Campagne {
  exigerRole(db, universId, compteId);
  const c = campagneBrute(db, campagneId);
  if (c.univers_id !== universId) throw introuvable();
  return versCampagne(c);
}

/** Campaigns of the universe, any member: active first, then in preparation, then finished, each by name (case ignored). */
export function listerCampagnes(db: Db, compteId: number, universId: number): Campagne[] {
  exigerRole(db, universId, compteId);
  return (
    db
      .prepare(
        `SELECT * FROM campagnes WHERE univers_id = ?
         ORDER BY CASE statut WHEN 'active' THEN 0 WHEN 'en_preparation' THEN 1 ELSE 2 END,
                  nom COLLATE NOCASE, id`,
      )
      .all(universId) as CampagneRow[]
  ).map(versCampagne);
}

/** The GM of the campaign's universe sets its status; no other campaign is touched (AD-60). */
export function changerStatutCampagne(
  db: Db,
  compteId: number,
  campagneId: number,
  statut: string,
): Campagne {
  if (!(STATUTS_CAMPAGNE as readonly string[]).includes(statut)) throw invalide('Statut inconnu.');
  exigerMJDeCampagne(db, compteId, campagneId);
  db.prepare('UPDATE campagnes SET statut = ? WHERE id = ?').run(statut, campagneId);
  return lireCampagneBrute(db, campagneId);
}

/** Find an imported campaign only within the GM's universe (also used by scenario/report imports). */
export function campagneDeCle(db: Db, compteId: number, universId: number, cle: string): Campagne | null {
  exigerMJ(db, universId, compteId);
  const row = db.prepare('SELECT * FROM campagnes WHERE univers_id = ? AND cle_origine = ?')
    .get(universId, cle) as CampagneRow | undefined;
  return row ? versCampagne(row) : null;
}

/** The campaign name write, leaving the import's marker alone so a human rename is protected. */
export function renommerCampagne(db: Db, compteId: number, campagneId: number, nom: string): Campagne {
  exigerMJDeCampagne(db, compteId, campagneId);
  const valide = validerTitre(nom, MAX_NOM_CAMPAGNE, 'Le nom');
  db.prepare('UPDATE campagnes SET nom = ? WHERE id = ?').run(valide, campagneId);
  return lireCampagneBrute(db, campagneId);
}

/** AD-121: assure a campaign through the ordinary writes, protecting each hand-edited field. */
export function assurerCampagne(
  db: Db,
  compteId: number,
  universId: number,
  cle: string,
  entree: { nom: string; statut: StatutCampagne },
): ResultatSuiviImport {
  exigerMJ(db, universId, compteId);
  return db.transaction((): ResultatSuiviImport => {
    const row = db.prepare('SELECT * FROM campagnes WHERE univers_id = ? AND cle_origine = ?')
      .get(universId, cle) as CampagneRow | undefined;
    if (!row) {
      const c = creerCampagne(db, compteId, universId, entree);
      changerStatutCampagne(db, compteId, c.id, entree.statut);
      db.prepare('UPDATE campagnes SET cle_origine = ?, dernier_import = ? WHERE id = ?')
        .run(cle, JSON.stringify({ nom: c.nom, statut: entree.statut }), c.id);
      return { id: c.id, etat: 'creee', avertissements: [] };
    }
    const marque = JSON.parse(row.dernier_import ?? '{}') as Partial<Record<'nom' | 'statut', string>>;
    const avertissements: string[] = [];
    let change = false;
    for (const champ of ['nom', 'statut'] as const) {
      if (row[champ] === entree[champ]) marque[champ] = row[champ];
      else if (row[champ] === marque[champ]) {
        if (champ === 'nom') renommerCampagne(db, compteId, row.id, entree.nom);
        else changerStatutCampagne(db, compteId, row.id, entree.statut);
        marque[champ] = entree[champ];
        change = true;
      } else avertissements.push(`${champ} modifié dans Kanevas : non écrasé`);
    }
    const json = JSON.stringify(marque);
    if (json !== row.dernier_import) {
      db.prepare('UPDATE campagnes SET dernier_import = ? WHERE id = ?').run(json, row.id);
    }
    return { id: row.id, etat: change ? 'mise_a_jour' : 'inchangee', avertissements };
  })();
}
