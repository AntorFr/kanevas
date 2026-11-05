import type { Db } from '../../db/db.js';
import type { ContexteSection, EcritSection } from '../../outils/declaration.js';
import type { AlerteVaisseau, ResultatVaisseau } from '../../outils/swn/regles/vaisseau.js';
import { texteVaisseau } from '../../outils/swn/regles/texte-vaisseau.js';
import { ErreurService, introuvable } from '../erreurs.js';
import { calculerResolu, resoudreChoix, versionSourceVaisseaux, versionsSource, type LigneChoix, type Porte } from './calcul-vaisseau.js';

// The hooks of the section « Caractéristiques » (V-4, V-5), declared in `outils/swn/index.ts`. Apart from `conceptions.ts` on
// purpose: the registry imports the declaration, which imports these hooks, and `conceptions.ts` needs `sections-gerees.ts`
// and `fiches.ts` — importing those from the declaration closes the cycle that left `TYPES_FICHE` uninitialised.
// With `conceptions.ts`, the only SQL on `swn_conceptions`.

export interface LigneConception {
  id: number; univers_id: number; fiche_id: number; section_id: number | null; coque_cle: string; choix: string;
  version_reglages: string; version_catalogue: string; resultat: string; version: number;
}
/** Everything the hook stores; the opaque `charge` of V-4. */
export interface ChargeConception {
  coque: string; lignes: LigneChoix[]; resultat: ResultatVaisseau; versionReglages: string; versionCatalogue: string;
}

export const ligneDe = (db: Db, ficheId: number): LigneConception | undefined =>
  db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ?').get(ficheId) as LigneConception | undefined;

export function porteDe(l: LigneConception): Porte {
  const choix = JSON.parse(l.choix) as LigneChoix[];
  const r = JSON.parse(l.resultat) as ResultatVaisseau;
  return {
    coque: l.coque_cle,
    lignes: choix.map(({ nature, cle }) => ({ nature, cle })),
    noms: { coque: r.coque?.cle === l.coque_cle ? r.coque.nom : null, lignes: r.lignes ?? [] },
  };
}

export const versionSource = (ctx: ContexteSection): string => versionSourceVaisseaux(ctx.db, ctx.universId);

/** The text now, against the current catalogue and settings; never partial (an unresolvable line throws). */
export function produire(ctx: ContexteSection): { contenu: string; sourceVersion: string; charge: unknown } {
  const l = ligneDe(ctx.db, ctx.ficheId);
  if (!l) throw introuvable();
  const choix = JSON.parse(l.choix) as LigneChoix[];
  const r = resoudreChoix(ctx.db, ctx.universId, { coque: l.coque_cle, choix }, porteDe(l));
  const s = calculerResolu(ctx.db, ctx.universId, r);
  if (s.resultat === null) {
    throw new ErreurService('invalide', `Élément retiré de cet univers : ${r.nomsRetires[0] ?? ''}. Remplacez-le dans le concepteur.`,
      'element_retire');
  }
  const v = versionsSource(ctx.db, ctx.universId);
  const charge: ChargeConception = { coque: l.coque_cle, lignes: choix, resultat: s.resultat,
    versionReglages: v.reglages, versionCatalogue: v.catalogue };
  return { contenu: texteVaisseau(s.resultat), sourceVersion: versionSourceVaisseaux(ctx.db, ctx.universId), charge };
}

/** Same transaction, after the section write: the row follows the section, its `version` bumps with it. */
export function apresEcriture(ctx: ContexteSection, ecrit: EcritSection): void {
  const c = ecrit.charge as ChargeConception | undefined;
  if (!c || ctx.sectionId === null) {
    throw new ErreurService('invalide', 'Cette section ne s\'écrit que par le concepteur de vaisseaux.', 'section_geree');
  }
  const valeurs = [ctx.sectionId, c.coque, JSON.stringify(c.lignes), c.versionReglages, c.versionCatalogue, JSON.stringify(c.resultat)];
  if (ligneDe(ctx.db, ctx.ficheId)) {
    ctx.db.prepare(`UPDATE swn_conceptions SET section_id = ?, coque_cle = ?, choix = ?, version_reglages = ?,
      version_catalogue = ?, resultat = ?, version = version + 1 WHERE fiche_id = ?`).run(...valeurs, ctx.ficheId);
  } else {
    ctx.db.prepare(`INSERT INTO swn_conceptions (univers_id, fiche_id, section_id, coque_cle, choix, version_reglages,
      version_catalogue, resultat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(ctx.universId, ctx.ficheId, ...valeurs);
  }
}
