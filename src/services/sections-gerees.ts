import type { Db } from '../db/db.js';
import { declarationSection, etatGere, type EtatGere, type Geree } from './sections-gerees-etat.js';
export { declarationSection, etatGere, type EtatGere, type Geree };
import type { ContexteSection, SectionGeree } from '../outils/declaration.js';
import { estGeree, exigerMJ, exigerRole, peutEcrireSection, peutLireSection, roleDe, vueMJ, vueSection } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { deposerRecalcul, lireProposition, type PropositionVue } from './propositions.js';
import { chargerFiche, validerTitre } from './fiches.js';
import { preparerContenu } from './liens.js';
import { surSourceModifiee } from './crochets-outils.js';
import { accessible, declarationOutil, peutUsage } from './outils.js';
import { ecrireContenu, exigerSansBloc, insererSection, toucherFiche, validerContenu } from './sections.js';
import type { Acteur, SectionRow, SectionVue } from './types.js';

/**
 * The only caller of the lock of `ecrireContenu` (AD-127): a source-scan test fails if another file
 * passes `geree`. A generator writes **on behalf of the account**, never with more rights than it has.
 */

export interface AudienceGeree {
  joueursLisent?: boolean;
  joueursEcrivent?: boolean;
  auteurId?: number | null;
  auteurLit?: boolean;
  auteurEcrit?: boolean;
}

export interface EntreeSectionGeree {
  ficheId: number;
  /** `module/outil` */
  outil: string;
  type: string;
  titre?: string;
  /** Absent: creation (a GM gesture); present: rewrite (needs `version`). */
  sectionId?: number;
  /** Read at creation only. */
  audience?: AudienceGeree;
  contenu: string;
  sourceVersion: string;
  version?: number;
}

const bit = (v: boolean | undefined): number => (v ? 1 : 0);

export function poserSectionGeree(
  db: Db,
  compteId: number,
  universId: number,
  e: EntreeSectionGeree,
): SectionVue {
  const role = exigerRole(db, universId, compteId);
  const acteur: Acteur = { compteId };
  // Disabled, invisible to the role or unknown: the answer of an absent address (AD-124).
  if (!accessible(db, acteur, universId, e.outil)) throw introuvable();
  const decl = declarationSection(e.outil, e.type);
  if (!decl) throw introuvable();
  if (!peutUsage(db, acteur, universId, e.outil, decl.usage)) throw refuse();
  chargerFiche(db, universId, e.ficheId);
  if (e.contenu.trim() === '') throw invalide('Le texte de la section est vide.');
  const gerePar = `${e.outil}/${e.type}`;

  if (e.sectionId !== undefined) {
    if (!Number.isInteger(e.version)) throw invalide('La version lue est requise.');
    return ecrireContenu(db, compteId, universId, e.ficheId, e.sectionId, e.contenu, e.version!, {
      outil: e.outil,
      sourceVersion: e.sourceVersion,
    });
  }

  // Creation: a GM gesture like `ajouterSection`.
  exigerMJ(db, universId, compteId);
  const titre = validerTitre(e.titre ?? decl.libelle, 80, 'Le titre');
  const a = e.audience ?? {};
  const auteurId = a.auteurId ?? null;
  if (auteurId !== null && roleDe(db, universId, auteurId) !== 'joueur') {
    throw invalide("L'auteur doit être un joueur de l'univers.");
  }
  validerContenu(e.contenu);
  exigerSansBloc(role, e.contenu);
  const now = new Date().toISOString();
  const id = db.transaction(() => {
    const contenu = preparerContenu(db, universId, compteId, e.contenu);
    validerContenu(contenu);
    const { n } = db
      .prepare('SELECT COALESCE(MAX(ordre), 0) AS n FROM sections WHERE fiche_id = ?')
      .get(e.ficheId) as { n: number };
    const sid = insererSection(db, {
      ficheId: e.ficheId,
      titre,
      ordre: n + 1,
      contenu,
      modifieLe: now,
      joueursLisent: bit(a.joueursLisent),
      joueursEcrivent: bit(a.joueursEcrivent),
      auteurId,
      // No author, no author rights (as `changerAudience`).
      auteurLit: auteurId === null ? 0 : bit(a.auteurLit),
      auteurEcrit: auteurId === null ? 0 : bit(a.auteurEcrit),
      gerePar,
      sourceVersion: e.sourceVersion,
    });
    toucherFiche(db, e.ficheId, now);
    return sid;
  })();
  const s = db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as SectionRow;
  return vueSection(db, universId, role, s, acteur);
}

/** The section of this universe (a managed one), with its sheet; `introuvable` when it is not in it. */
function sectionGeree(db: Db, universId: number, ficheId: number | null, sectionId: number): SectionRow {
  const s = db
    .prepare(
      `SELECT s.* FROM sections s JOIN fiches f ON f.id = s.fiche_id
       WHERE s.id = ? AND f.univers_id = ? AND (? IS NULL OR f.id = ?)`,
    )
    .get(sectionId, universId, ficheId, ficheId) as SectionRow | undefined;
  if (!s) throw introuvable();
  return s;
}

/** `module/outil` and the declared type of a managed section; `null` when the code no longer knows the type. */
function declareeDe(s: SectionRow): { cle: string; type: string; decl: SectionGeree | null } {
  const [module, nom, type = ''] = s.gere_par!.split('/');
  const cle = `${module}/${nom}`;
  return { cle, type, decl: declarationSection(cle, type) };
}

/**
 * The recalculation gesture (S-5): the tool produces the text again, written through the lock on behalf of the
 * account. Up to date: the unchanged view, `version` untouched. A `'proposition'` type is never recalculated here.
 */
export function recalculerSection(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  sectionId: number,
  version: number,
): SectionVue {
  const role = exigerRole(db, universId, compteId);
  const acteur: Acteur = { compteId };
  return db.transaction(() => {
    const s = sectionGeree(db, universId, ficheId, sectionId);
    if (!peutLireSection(role, s, acteur) || !estGeree(s)) throw introuvable();
    const { cle, decl } = declareeDe(s);
    if (!decl || !accessible(db, acteur, universId, cle)) throw introuvable();
    if (!peutUsage(db, acteur, universId, cle, decl.usage)) throw refuse();
    if (decl.recalcul !== 'geste') {
      throw new ErreurService('invalide', 'Cette section se recalcule sur proposition.', 'recalcul_sur_proposition');
    }
    if (s.version !== version) throw new ErreurService('conflit', 'La section a changé.', 'section_modifiee');
    const ctx: ContexteSection = { db, acteur, universId, ficheId, sectionId };
    if (decl.versionSource(ctx) === s.source_version) return vueSection(db, universId, role, s, acteur);
    const p = decl.produire(ctx);
    return poserSectionGeree(db, compteId, universId, {
      ficheId, outil: cle, type: decl.type, sectionId, contenu: p.contenu, sourceVersion: p.sourceVersion, version,
    });
  })();
}

/** Files (or replaces) the requester's pending recalculation proposal for a stale section. */
function proposer(db: Db, compteId: number, universId: number, s: SectionRow, decl: SectionGeree, cle: string): number {
  const ctx: ContexteSection = { db, acteur: { compteId }, universId, ficheId: s.fiche_id, sectionId: s.id };
  const p = decl.produire(ctx);
  return deposerRecalcul(db, {
    universId, compteId, sectionId: s.id, contenu: p.contenu, versionOrigine: s.version, source: p.sourceVersion,
  });
}

/** A GM asks for the proposal of a stale `'proposition'` section (the gesture of « Proposer un recalcul »). */
export function proposerRecalcul(db: Db, compteId: number, universId: number, sectionId: number, ficheId: number | null = null): PropositionVue {
  const role = exigerRole(db, universId, compteId);
  if (role !== 'mj') throw introuvable();
  const acteur: Acteur = { compteId };
  const id = db.transaction(() => {
    const s = sectionGeree(db, universId, ficheId, sectionId);
    if (!estGeree(s)) throw introuvable();
    const { cle, decl } = declareeDe(s);
    if (!decl || !accessible(db, acteur, universId, cle)) throw introuvable();
    if (!peutUsage(db, acteur, universId, cle, decl.usage)) throw refuse();
    if (decl.recalcul !== 'proposition') {
      throw new ErreurService('invalide', 'Cette section se recalcule par un geste.', 'recalcul_par_geste');
    }
    const ctx: ContexteSection = { db, acteur, universId, ficheId: s.fiche_id, sectionId };
    if (decl.versionSource(ctx) === s.source_version) throw new ErreurService('conflit', 'La section est à jour.', 'a_jour');
    return proposer(db, compteId, universId, s, decl, cle);
  })();
  return lireProposition(db, compteId, universId, id);
}

/**
 * A source changed (a setting written at universe level, a catalogue imported): files a proposal for that GM on every
 * stale `'proposition'` section of the universe whose tool belongs to `cle` (a module or a tool). Never throws for
 * a section it cannot serve; `'geste'` sections only become stale on read (S-5).
 */
export function signalerSourceModifiee(db: Db, compteId: number, universId: number, cle: string): void {
  if (roleDe(db, universId, compteId) !== 'mj') return;
  const acteur: Acteur = { compteId };
  const lignes = db
    .prepare(
      `SELECT s.* FROM sections s JOIN fiches f ON f.id = s.fiche_id
       WHERE f.univers_id = ? AND s.gere_par IS NOT NULL AND s.gere_par LIKE ? ESCAPE '\\'`,
    )
    .all(universId, `${cle.replace(/[\\%_]/g, '\\$&')}/%`) as SectionRow[];
  for (const s of lignes) {
    const { cle: outil, decl } = declareeDe(s);
    if (!decl || decl.recalcul !== 'proposition') continue;
    if (!peutUsage(db, acteur, universId, outil, decl.usage)) continue;
    const ctx: ContexteSection = { db, acteur, universId, ficheId: s.fiche_id, sectionId: s.id };
    if (decl.versionSource(ctx) === s.source_version) continue;
    proposer(db, compteId, universId, s, decl, outil);
  }
}

surSourceModifiee.appeler = signalerSourceModifiee;

/** Writes the text of an applied recalculation proposal through the lock (the checks of the tool apply). */
export function appliquerRecalcul(
  db: Db,
  compteId: number,
  universId: number,
  s: SectionRow,
  contenu: string,
  sourceVersion: string,
  version: number,
): void {
  const { cle, type, decl } = declareeDe(s);
  if (!decl) throw introuvable();
  poserSectionGeree(db, compteId, universId, { ficheId: s.fiche_id, outil: cle, type, sectionId: s.id, contenu, sourceVersion, version });
}
