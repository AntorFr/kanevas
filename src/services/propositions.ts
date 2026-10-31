import { rendreMarkdown } from './markdown.js';
import type { Db } from '../db/db.js';
import { estGeree, exigerMJ, resolveurLiens, roleDe } from './droits.js';
import { ErreurService, introuvable, invalide } from './erreurs.js';
import { declarationOutil } from './outils.js';
import { appliquerRecalcul } from './sections-gerees.js';
import { ecrireContenu, MESSAGE_SECTION_GEREE, validerContenu } from './sections.js';
import type { SectionRow } from './types.js';

/** `appliquee` once applied (whatever the section did since), else `perimee` if the section moved on. */
export type EtatProposition = 'en_attente' | 'perimee' | 'appliquee';

export interface PropositionVue {
  id: number;
  universId: number;
  sectionId: number;
  ficheId: number;
  /** The session report it comes from; null for a recalculation proposal (AD-128). */
  crId: number | null;
  /** `compte_rendu` (a session report) or `recalcul` (a managed section gone stale, AD-128). */
  source: 'compte_rendu' | 'recalcul';
  /** The tool's name for a recalculation proposal; null otherwise or when the tool is unknown. */
  outilLibelle: string | null;
  /** Current content of the section, for the side-by-side view. */
  contenuActuel: string;
  contenuPropose: string;
  /** Rendered `contenuActuel` and `contenuPropose` (the reader is always the requesting GM, who has the sources). */
  htmlActuel: string;
  htmlPropose: string;
  versionOrigine: number;
  etat: EtatProposition;
  creeLe: string;
  appliqueeLe: string | null;
}

interface PropositionRow {
  id: number;
  univers_id: number;
  demandeur_id: number;
  section_id: number;
  cr_id: number | null;
  source_version: string | null;
  contenu_propose: string;
  version_origine: number;
  creee_le: string;
  appliquee_le: string | null;
}

function etatDe(p: PropositionRow, s: SectionRow): EtatProposition {
  if (p.appliquee_le !== null) return 'appliquee';
  return s.version !== p.version_origine ? 'perimee' : 'en_attente';
}

function libelleOutil(s: SectionRow): string | null {
  if (sansOutil(s)) return null;
  const [module, nom] = s.gere_par!.split('/');
  try {
    return declarationOutil(`${module}/${nom}`).libelle;
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'introuvable') return null;
    throw e;
  }
}
const sansOutil = (s: SectionRow): boolean => !estGeree(s);

function vue(db: Db, p: PropositionRow, s: SectionRow): PropositionVue {
  // The reader is the requesting GM, outside player mode: links read as they do on the sheet (AD-116).
  const acteur = { compteId: p.demandeur_id };
  const html = (source: string) =>
    rendreMarkdown(source, { nature: 'section', liens: resolveurLiens(db, p.univers_id, 'mj', acteur, source) });
  return {
    id: p.id,
    universId: p.univers_id,
    sectionId: p.section_id,
    ficheId: s.fiche_id,
    crId: p.cr_id,
    source: p.source_version === null ? 'compte_rendu' : 'recalcul',
    outilLibelle: libelleOutil(s),
    contenuActuel: s.contenu,
    contenuPropose: p.contenu_propose,
    htmlActuel: html(s.contenu),
    htmlPropose: html(p.contenu_propose),
    versionOrigine: p.version_origine,
    etat: etatDe(p, s),
    creeLe: p.creee_le,
    appliqueeLe: p.appliquee_le,
  };
}

/**
 * The requester's own proposal, if they are still a GM of its universe; for anyone
 * else (another account, a removed GM, another universe, a player) it does not
 * exist (AD-79, AD-22).
 */
function charger(
  db: Db,
  compteId: number,
  universId: number,
  id: number,
): { p: PropositionRow; s: SectionRow } {
  const p = db
    .prepare('SELECT * FROM propositions WHERE id = ? AND univers_id = ? AND demandeur_id = ?')
    .get(id, universId, compteId) as PropositionRow | undefined;
  if (!p) throw introuvable();
  if (roleDe(db, universId, compteId) !== 'mj') throw introuvable();
  const s = db.prepare('SELECT * FROM sections WHERE id = ?').get(p.section_id) as SectionRow;
  return { p, s };
}

/**
 * A GM files a proposal for a section of their universe, from a session report.
 * `version` is the one they read (AD-59); a stale one is refused like
 * `ecrireContenu` does. A pending proposal of the same requester on the same
 * section is replaced in the same transaction. Nothing touches the section.
 */
export function creerProposition(
  db: Db,
  compteId: number,
  universId: number,
  entree: { sectionId: number; crId: number; contenu: string; version: number },
): PropositionVue {
  exigerMJ(db, universId, compteId);
  const s = db
    .prepare(
      `SELECT s.* FROM sections s JOIN fiches f ON f.id = s.fiche_id
       WHERE s.id = ? AND f.univers_id = ?`,
    )
    .get(entree.sectionId, universId) as SectionRow | undefined;
  if (!s) throw introuvable();
  if (estGeree(s)) throw new ErreurService('refuse', MESSAGE_SECTION_GEREE, 'section_geree');
  const cr = db
    .prepare("SELECT 1 AS ok FROM fiches WHERE id = ? AND univers_id = ? AND type = 'compte_rendu'")
    .get(entree.crId, universId);
  if (!cr) throw invalide("La source doit être un compte-rendu de cet univers.");
  if (entree.contenu.trim() === '') throw invalide('Le contenu proposé est vide.');
  validerContenu(entree.contenu);
  if (s.version !== entree.version) {
    throw new ErreurService('conflit', 'La section a changé.', 'section_modifiee');
  }
  const now = new Date().toISOString();
  const id = db.transaction(() => {
    db.prepare(
      'DELETE FROM propositions WHERE demandeur_id = ? AND section_id = ? AND appliquee_le IS NULL',
    ).run(compteId, s.id);
    const info = db
      .prepare(
        `INSERT INTO propositions (univers_id, demandeur_id, section_id, cr_id,
           contenu_propose, version_origine, creee_le) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(universId, compteId, s.id, entree.crId, entree.contenu, entree.version, now);
    return Number(info.lastInsertRowid);
  })();
  return lireProposition(db, compteId, universId, id);
}

/** Files a recalculation proposal (no report), replacing the requester's pending one on the section (AD-79). */
export function deposerRecalcul(
  db: Db,
  e: { universId: number; compteId: number; sectionId: number; contenu: string; versionOrigine: number; source: string },
): number {
  return db.transaction(() => {
    db.prepare(
      'DELETE FROM propositions WHERE demandeur_id = ? AND section_id = ? AND appliquee_le IS NULL',
    ).run(e.compteId, e.sectionId);
    const info = db
      .prepare(
        `INSERT INTO propositions (univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine,
           creee_le, source_version) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .run(e.universId, e.compteId, e.sectionId, e.contenu, e.versionOrigine, new Date().toISOString(), e.source);
    return Number(info.lastInsertRowid);
  })();
}

/** The proposal with the current section, and its state computed at each read. */
export function lireProposition(
  db: Db,
  compteId: number,
  universId: number,
  id: number,
): PropositionVue {
  const { p, s } = charger(db, compteId, universId, id);
  return vue(db, p, s);
}

/**
 * Applies the proposal through `ecrireContenu` (AD-59) with `version_origine`, and
 * marks it in the same transaction: a section changed since refuses with
 * `section_modifiee` and nothing is written or marked; an applied one with
 * `proposition_appliquee`.
 */
export function appliquerProposition(
  db: Db,
  compteId: number,
  universId: number,
  id: number,
): PropositionVue {
  return db.transaction(() => {
    const { p, s } = charger(db, compteId, universId, id);
    if (p.appliquee_le !== null) {
      throw new ErreurService('conflit', 'La proposition est déjà appliquée.', 'proposition_appliquee');
    }
    if (p.source_version !== null && estGeree(s)) {
      // A recalculation proposal: the managed write, with the checks of the tool (usage, enabled; AD-128).
      appliquerRecalcul(db, compteId, universId, s, p.contenu_propose, p.source_version, p.version_origine);
    } else {
      ecrireContenu(db, compteId, universId, s.fiche_id, s.id, p.contenu_propose, p.version_origine);
    }
    db.prepare('UPDATE propositions SET appliquee_le = ? WHERE id = ?').run(
      new Date().toISOString(),
      id,
    );
    return lireProposition(db, compteId, universId, id);
  })();
}

/** Drops the row; an applied proposal stays as the trace of what was written. */
export function abandonnerProposition(
  db: Db,
  compteId: number,
  universId: number,
  id: number,
): void {
  const { p } = charger(db, compteId, universId, id);
  if (p.appliquee_le !== null) {
    throw new ErreurService('conflit', 'La proposition est déjà appliquée.', 'proposition_appliquee');
  }
  db.prepare('DELETE FROM propositions WHERE id = ?').run(id);
}
