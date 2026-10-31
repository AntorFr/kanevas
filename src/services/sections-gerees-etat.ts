import type { Db } from '../db/db.js';
import type { ContexteSection, SectionGeree } from '../outils/declaration.js';
import { estGeree, peutEcrireSection, roleDe, vueMJ } from './droits.js';
import { ErreurService } from './erreurs.js';
import { declarationOutil, peutUsage, resoudreOutil, accessible } from './outils.js';
import type { Acteur, SectionRow } from './types.js';

/**
 * Read side of the managed sections, apart from `sections-gerees.ts` on purpose: `droits.ts` (the section
 * views) needs `etatGere`, and `sections-gerees.ts` needs `fiches.ts`, which needs `droits.ts` through
 * `types-fiche.ts` — one import cycle that left `TYPES_FICHE` uninitialised.
 */

/** The declaration of a type of managed section, or null when the code does not know it. */
export function declarationSection(cle: string, type: string): SectionGeree | null {
  try {
    const d = declarationOutil(cle);
    return d.type === 'generateur' ? (d.sections ?? []).find((s) => s.type === type) ?? null : null;
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'introuvable') return null;
    throw e;
  }
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

