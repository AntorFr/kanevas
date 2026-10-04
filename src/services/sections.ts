import { attachmentsDir } from '../config/env.js';
import type { Db } from '../db/db.js';
import {
  exigerMJ,
  exigerRole,
  peutEcrireSection,
  peutLireSection,
  roleDe,
  vueSection,
} from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { chargerFiche, validerTitre } from './fiches.js';
import { fichiersDeSections } from './pieces-jointes.js';
import { supprimerFichier } from './stockage.js';
import type { Acteur, SectionRow, SectionVue } from './types.js';

/** Ceiling of a section's content, in `String.length` units (AD-91); `/api/moi` hands it to the screen. */
export const MAX_CONTENU_SECTION = 20000;

function validerContenu(contenu: string): void {
  if (contenu.length > MAX_CONTENU_SECTION) {
    throw invalide('Contenu trop long : 20 000 caractères au plus.');
  }
}

function chargerSection(db: Db, ficheId: number, sectionId: number): SectionRow {
  const row = db
    .prepare('SELECT * FROM sections WHERE id = ? AND fiche_id = ?')
    .get(sectionId, ficheId) as SectionRow | undefined;
  if (!row) throw introuvable();
  return row;
}

function toucherFiche(db: Db, ficheId: number, now: string): void {
  db.prepare('UPDATE fiches SET modifie_le = ? WHERE id = ?').run(now, ficheId);
}

/** Renumbers the sections of a sheet 1..n in the given order of ids. */
function renumeroter(db: Db, ficheId: number, ids: number[]): void {
  // Two passes: `ordre` is unique per sheet, so park the values out of the way first.
  db.prepare('UPDATE sections SET ordre = -ordre WHERE fiche_id = ?').run(ficheId);
  const maj = db.prepare('UPDATE sections SET ordre = ? WHERE id = ?');
  ids.forEach((id, i) => maj.run(i + 1, id));
}

/**
 * The GM adds a section at the end. It is born closed to players: the four
 * switches are all false and it has no author (B-8).
 */
export function ajouterSection(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  entree: { titre: string; contenu?: string },
): SectionVue {
  exigerMJ(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  const titre = validerTitre(entree.titre, 80, 'Le titre');
  validerContenu(entree.contenu ?? '');
  const now = new Date().toISOString();
  const id = db.transaction(() => {
    const { n } = db
      .prepare('SELECT COALESCE(MAX(ordre), 0) AS n FROM sections WHERE fiche_id = ?')
      .get(ficheId) as { n: number };
    const info = db
      .prepare(
        'INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le) VALUES (?, ?, ?, ?, ?)',
      )
      .run(ficheId, titre, n + 1, entree.contenu ?? '', now);
    toucherFiche(db, ficheId, now);
    return Number(info.lastInsertRowid);
  })();
  return vueSection('mj', chargerSection(db, ficheId, id), { compteId });
}

/** The GM renames a section. */
export function renommerSection(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  sectionId: number,
  titre: string,
): SectionVue {
  exigerMJ(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  chargerSection(db, ficheId, sectionId);
  const t = validerTitre(titre, 80, 'Le titre');
  db.prepare('UPDATE sections SET titre = ? WHERE id = ?').run(t, sectionId);
  return vueSection('mj', chargerSection(db, ficheId, sectionId), { compteId });
}

/** The GM reorders: `ids` must be exactly the sheet's sections; they are renumbered 1..n. */
export function reordonnerSections(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  ids: number[],
): void {
  exigerMJ(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  db.transaction(() => {
    const existants = (
      db.prepare('SELECT id FROM sections WHERE fiche_id = ?').all(ficheId) as { id: number }[]
    ).map((r) => r.id);
    const voulus = new Set(ids);
    if (
      voulus.size !== ids.length ||
      ids.length !== existants.length ||
      !existants.every((id) => voulus.has(id))
    ) {
      throw invalide("L'ordre doit citer chaque section de la fiche une fois.");
    }
    renumeroter(db, ficheId, ids);
    toucherFiche(db, ficheId, new Date().toISOString());
  })();
}

/** The GM removes a section (a sheet itself is never deleted); the others are renumbered 1..n. */
export function retirerSection(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  sectionId: number,
  racine: string = attachmentsDir,
): void {
  exigerMJ(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  chargerSection(db, ficheId, sectionId);
  // The CASCADE drops the rows, not the files: collect them first, delete them after the commit.
  const fichiers = fichiersDeSections(db, [sectionId]);
  db.transaction(() => {
    db.prepare('DELETE FROM sections WHERE id = ?').run(sectionId);
    const restants = (
      db.prepare('SELECT id FROM sections WHERE fiche_id = ? ORDER BY ordre').all(ficheId) as {
        id: number;
      }[]
    ).map((r) => r.id);
    renumeroter(db, ficheId, restants);
    toucherFiche(db, ficheId, new Date().toISOString());
  })();
  for (const f of fichiers) supprimerFichier(f, racine);
}

export interface ChangementAudience {
  joueursLisent?: boolean;
  joueursEcrivent?: boolean;
  /** A player member of the universe, or null for none. */
  auteurId?: number | null;
  auteurLit?: boolean;
  auteurEcrit?: boolean;
}

/** The GM sets the four switches and the author; the author must be a player of the universe. */
export function changerAudience(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  sectionId: number,
  changement: ChangementAudience,
): SectionVue {
  exigerMJ(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  const s = chargerSection(db, ficheId, sectionId);
  let auteurId = s.auteur_id;
  if (changement.auteurId !== undefined) {
    auteurId = changement.auteurId;
    if (auteurId !== null && roleDe(db, universId, auteurId) !== 'joueur') {
      throw invalide("L'auteur doit être un joueur de l'univers.");
    }
  }
  const bit = (v: boolean | undefined, actuel: number) => (v === undefined ? actuel : v ? 1 : 0);
  // No author, no author rights: they would have no one to apply to.
  const sans = auteurId === null;
  db.prepare(
    `UPDATE sections SET joueurs_lisent = ?, joueurs_ecrivent = ?, auteur_id = ?,
       auteur_lit = ?, auteur_ecrit = ? WHERE id = ?`,
  ).run(
    bit(changement.joueursLisent, s.joueurs_lisent),
    bit(changement.joueursEcrivent, s.joueurs_ecrivent),
    auteurId,
    sans ? 0 : bit(changement.auteurLit, s.auteur_lit),
    sans ? 0 : bit(changement.auteurEcrit, s.auteur_ecrit),
    sectionId,
  );
  return vueSection('mj', chargerSection(db, ficheId, sectionId), { compteId });
}

/** One section, if the caller may read it; otherwise it does not exist for them. */
export function lireSection(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  sectionId: number,
): SectionVue {
  const role = exigerRole(db, universId, acteur.compteId);
  chargerFiche(db, universId, ficheId);
  const s = chargerSection(db, ficheId, sectionId);
  if (!peutLireSection(role, s, acteur)) throw introuvable();
  return vueSection(role, s, acteur);
}

/**
 * Writes the content (AD-18, AD-19) if the audience grants it (the GM always).
 * `version` is the one the caller read; if it is no longer the current one
 * nothing is written and the answer is a conflict (AD-59). A caller who neither
 * reads nor writes the section does not know it exists.
 */
export function ecrireContenu(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  sectionId: number,
  contenu: string,
  version: number,
): SectionVue {
  const role = exigerRole(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  return db.transaction(() => {
    const s = chargerSection(db, ficheId, sectionId);
    if (!peutEcrireSection(role, s, compteId)) {
      if (!peutLireSection(role, s, { compteId })) throw introuvable();
      throw refuse("Vous ne pouvez pas modifier cette section.");
    }
    validerContenu(contenu);
    if (s.version !== version) {
      throw new ErreurService('conflit', 'La section a changé.', 'section_modifiee');
    }
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE sections SET contenu = ?, version = version + 1, modifie_le = ? WHERE id = ?',
    ).run(contenu, now, sectionId);
    toucherFiche(db, ficheId, now);
    return vueSection(role, chargerSection(db, ficheId, sectionId), { compteId });
  })();
}
