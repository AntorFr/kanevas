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
import { preparerContenu, remplacerLiens, resoudreLiens, sectionsEnAttenteDe } from './liens.js';
import { recalculerFichiersSection } from './fichiers.js';
import { contenuPublic, extraireLiens, reecrireLiens } from './markdown.js';
import type { Acteur, Role, SectionRow, SectionVue } from './types.js';

/** Ceiling of a section's content, in `String.length` units (AD-91); `/api/moi` hands it to the screen. */
export const MAX_CONTENU_SECTION = 100000;

/** The one message of the ceiling, for every long text (sections, reports, scenarios, system entries, proposals). */
export const MESSAGE_CONTENU_TROP_LONG = 'Contenu trop long : 100 000 caractères au plus.';

/** The refusal of a GM block written by a non-GM (AD-114 4). */
export const MESSAGE_BLOC_MJ = 'Un bloc MJ ne peut être écrit que par un MJ.';

/** A non-GM may not write a text that holds a GM block: `contenuPublic` would differ from it. */
export function exigerSansBloc(role: Role, contenu: string): void {
  if (role !== 'mj' && contenuPublic(contenu) !== contenu) throw invalide(MESSAGE_BLOC_MJ);
}

export function validerContenu(contenu: string): void {
  if (contenu.length > MAX_CONTENU_SECTION) throw invalide(MESSAGE_CONTENU_TROP_LONG);
}

/**
 * The only place that inserts a section (AD-114): `contenu` and `contenu_public` are written
 * together. Audience columns default to a closed, authorless section (B-8).
 */
export function insererSection(
  db: Db,
  s: {
    ficheId: number;
    titre: string;
    ordre: number;
    contenu: string;
    modifieLe: string;
    joueursLisent?: number;
    joueursEcrivent?: number;
    auteurId?: number | null;
    auteurLit?: number;
    auteurEcrit?: number;
  },
): number {
  const info = db
    .prepare(
      `INSERT INTO sections (fiche_id, titre, ordre, contenu, contenu_public, modifie_le,
         joueurs_lisent, joueurs_ecrivent, auteur_id, auteur_lit, auteur_ecrit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      s.ficheId,
      s.titre,
      s.ordre,
      s.contenu,
      contenuPublic(s.contenu),
      s.modifieLe,
      s.joueursLisent ?? 0,
      s.joueursEcrivent ?? 0,
      s.auteurId ?? null,
      s.auteurLit ?? 0,
      s.auteurEcrit ?? 0,
    );
  const id = Number(info.lastInsertRowid);
  remplacerLiens(db, id, s.contenu);
  recalculerFichiersSection(db, id, s.contenu, contenuPublic(s.contenu));
  return id;
}

/**
 * The only place that rewrites the content of a section (AD-114): keeps both columns in step. With
 * `now` it is an edit: `version` and `modifie_le` move and the `liens` rows are replaced (AD-116).
 * Without it (`null`) it is the resolution of a waiting key: neither moves, `resoudreClesEnAttente`
 * updates the rows.
 */
export function poserContenu(db: Db, sectionId: number, contenu: string, now: string | null): void {
  db.prepare(
    `UPDATE sections SET contenu = ?, contenu_public = ?, version = version + ?,
       modifie_le = COALESCE(?, modifie_le) WHERE id = ?`,
  ).run(contenu, contenuPublic(contenu), now === null ? 0 : 1, now, sectionId);
  if (now !== null) {
    remplacerLiens(db, sectionId, contenu);
    recalculerFichiersSection(db, sectionId, contenu, contenuPublic(contenu));
  }
}

/**
 * A sheet now carries the origin key `cle` (AD-116): the sections that waited for it get
 * `[[<id>|<texte>]]` in `contenu` and `contenu_public`, and their `liens` rows point at the sheet.
 * Neither `version`, nor `version_importee`, nor `modifie_le` moves: the text is not edited, only resolved.
 */
export function resoudreClesEnAttente(db: Db, universId: number, cle: string, ficheId: number): void {
  const attendent = sectionsEnAttenteDe(db, universId, cle);
  for (const { id, contenu } of attendent) {
    const neuf = reecrireLiens(contenu, extraireLiens(contenu), (l) =>
      l.cle === cle ? `[[${ficheId}|${l.texte}]]` : null,
    );
    if (neuf !== contenu) poserContenu(db, id, neuf, null);
  }
  resoudreLiens(
    db,
    attendent.map((a) => a.id),
    cle,
    ficheId,
  );
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
    const contenu = preparerContenu(db, universId, compteId, entree.contenu ?? '');
    validerContenu(contenu);
    const { n } = db
      .prepare('SELECT COALESCE(MAX(ordre), 0) AS n FROM sections WHERE fiche_id = ?')
      .get(ficheId) as { n: number };
    const sid = insererSection(db, {
      ficheId,
      titre,
      ordre: n + 1,
      contenu,
      modifieLe: now,
    });
    toucherFiche(db, ficheId, now);
    return sid;
  })();
  return vueSection(db, universId, 'mj', chargerSection(db, ficheId, id), { compteId });
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
  return vueSection(db, universId, 'mj', chargerSection(db, ficheId, sectionId), { compteId });
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
): void {
  exigerMJ(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  chargerSection(db, ficheId, sectionId);
  // The CASCADE drops the references; the files stay in the media library (AD-105, AD-111).
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
  return vueSection(db, universId, 'mj', chargerSection(db, ficheId, sectionId), { compteId });
}

/** One section, if the caller may read it; otherwise it does not exist for them. */
export function lireSection(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  sectionId: number,
  formeLiens: 'html' | 'markdown' = 'html',
): SectionVue {
  const role = exigerRole(db, universId, acteur.compteId);
  chargerFiche(db, universId, ficheId);
  const s = chargerSection(db, ficheId, sectionId);
  if (!peutLireSection(role, s, acteur)) throw introuvable();
  return vueSection(db, universId, role, s, acteur, formeLiens);
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
    exigerSansBloc(role, contenu);
    if (s.version !== version) {
      throw new ErreurService('conflit', 'La section a changé.', 'section_modifiee');
    }
    const ecrit = preparerContenu(db, universId, compteId, contenu);
    validerContenu(ecrit);
    const now = new Date().toISOString();
    poserContenu(db, sectionId, ecrit, now);
    toucherFiche(db, ficheId, now);
    return vueSection(db, universId, role, chargerSection(db, ficheId, sectionId), { compteId });
  })();
}
