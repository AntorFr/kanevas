import type { Db } from '../db/db.js';
import type { ContexteSection, SectionGeree } from '../outils/declaration.js';
import { estGeree, exigerMJ, exigerRole, peutEcrireSection, roleDe, vueMJ, vueSection } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { chargerFiche, validerTitre } from './fiches.js';
import { preparerContenu } from './liens.js';
import { declarationOutil, peutUsage, resoudreOutil, accessible } from './outils.js';
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

/** The declaration of a type of managed section, or null when the code does not know it. */
function declarationSection(cle: string, type: string): SectionGeree | null {
  try {
    const d = declarationOutil(cle);
    return d.type === 'generateur' ? (d.sections ?? []).find((s) => s.type === type) ?? null : null;
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'introuvable') return null;
    throw e;
  }
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

export type EtatGere = 'a_jour' | 'perime' | 'desactive';

/** The `geree` object of a section view (AD-128). It never carries the source text. */
export interface Geree {
  outil: string | null;
  libelle: string | null;
  type: string;
  lien: string | null;
  etat: EtatGere;
  recalcul: 'geste' | 'proposition' | null;
  peutRecalculer: boolean;
  peutOuvrir: boolean;
  propositionId: number | null;
  composant: boolean;
}

/** `null` for a free section; the staleness is computed at each read, never stored (AD-128). */
export function etatGere(db: Db, acteur: Acteur, universId: number, s: SectionRow): Geree | null {
  if (!estGeree(s)) return null;
  const gerePar = s.gere_par!;
  const [module, nom, type = ''] = gerePar.split('/');
  const cle = `${module}/${nom}`;
  const sans: Geree = {
    outil: null, libelle: null, type, lien: null, etat: 'desactive', recalcul: null,
    peutRecalculer: false, peutOuvrir: false, propositionId: null, composant: false,
  };
  const role = roleDe(db, universId, acteur.compteId);
  const decl = declarationSection(cle, type);
  if (!role || !decl) return sans;
  let active: boolean;
  try {
    active = resoudreOutil(db, universId, cle).active;
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'introuvable') return sans;
    throw e;
  }
  if (!active) return sans;
  // Enabled but not visible to this reader's role: no name, no link, no state.
  if (!accessible(db, acteur, universId, cle)) return { ...sans, etat: 'a_jour' };

  const ctx: ContexteSection = { db, acteur, universId, ficheId: s.fiche_id, sectionId: s.id };
  const mj = vueMJ(role, acteur);
  const hors = acteur.modeJoueur !== true;
  const peutRecalculer =
    hors && peutUsage(db, acteur, universId, cle, decl.usage) && peutEcrireSection(role, s, acteur.compteId);
  const prop = mj
    ? (db
        .prepare(
          `SELECT id FROM propositions WHERE demandeur_id = ? AND section_id = ?
             AND appliquee_le IS NULL AND source_version IS NOT NULL`,
        )
        .get(acteur.compteId, s.id) as { id: number } | undefined)
    : undefined;
  return {
    outil: cle,
    libelle: declarationOutil(cle).libelle,
    type,
    lien: `/univers/${universId}/outils/${cle}?fiche=${s.fiche_id}`,
    etat: decl.versionSource(ctx) !== s.source_version ? 'perime' : 'a_jour',
    recalcul: decl.recalcul,
    peutRecalculer,
    peutOuvrir: mj || (hors && s.auteur_id === acteur.compteId),
    propositionId: prop?.id ?? null,
    composant: decl.composant === true,
  };
}
