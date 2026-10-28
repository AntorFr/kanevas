import type { Db } from '../db/db.js';
import { peutVoirFiche, sqlFicheLisible, sqlSectionLisible } from './droits.js';
import { introuvable, invalide } from './erreurs.js';
import { etiquetageDe } from './etiquettes.js';
import { chargerFiche, descendantsDe, versFiche } from './fiches.js';
import { lisiblePar } from './fichiers.js';
import { estNature, NATURES, type TypeNature } from './natures.js';
import { TYPES_FICHE, type Acteur, type Fiche, type Role, type TypeFiche } from './types.js';

export interface OptionsLiees {
  nature?: TypeNature;
  descendants?: boolean;
  apres?: number;
}

export interface FicheLiee extends Fiche {
  qualificatif?: string;
}

export interface GroupeLiees {
  nature: TypeNature;
  libelle: string;
  types: { type: TypeFiche; total: number; totalAvecDescendants: number }[];
  fiches: FicheLiee[];
  suivant: string | null;
}

export interface PageLiees {
  profondeurAtteinte: boolean;
  groupes: GroupeLiees[];
}

interface LienLu {
  fiche_id: number;
  type: TypeFiche;
  nature: TypeNature;
  qualificatif: string;
  lieu_id: number;
  lieu_titre: string;
}

/**
 * The natured relations read backwards (AD-130), once per sheet in each group. Counts and
 * lines use the same guarded rows; a hidden endpoint or carrying section leaves no trace.
 */
export function liees(
  db: Db,
  role: Role,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  opts: OptionsLiees = {},
): PageLiees {
  const fiche = chargerFiche(db, universId, ficheId);
  if (!peutVoirFiche(db, role, ficheId, acteur)) throw introuvable();
  if (opts.nature !== undefined && !estNature(opts.nature)) throw invalide('Requête invalide.');
  const apres = opts.apres ?? 0;
  if (!Number.isSafeInteger(apres) || apres < 0) throw invalide('Requête invalide.');

  const natures = NATURES.filter((n) =>
    (opts.nature === undefined || n.cle === opts.nature)
    && (n.typesCible.includes(fiche.type) || (n.symetrique && n.typesSource.includes(fiche.type))),
  );
  const descente = fiche.type === 'lieu'
    ? descendantsDe(db, ficheId)
    : { ids: [ficheId], profondeurAtteinte: false };
  if (natures.length === 0) return { profondeurAtteinte: descente.profondeurAtteinte, groupes: [] };

  const ids = descente.ids;
  const places = ids.map(() => '?').join(',');
  const gardes = [
    sqlSectionLisible(role, acteur, 'porteuse'),
    sqlFicheLisible(role, acteur, 'source'),
    sqlFicheLisible(role, acteur, 'cible'),
  ];
  const gardeSql = gardes.map((g) => g ? ` AND ${g.sql}` : '').join('');
  const gardeParams = gardes.flatMap((g) => g?.params ?? []);
  const depuis = `FROM relations r
    JOIN sections porteuse ON porteuse.id = r.section_id
    JOIN fiches source ON source.id = porteuse.fiche_id
    JOIN fiches cible ON cible.id = r.cible_fiche_id
    WHERE source.univers_id = ? AND cible.univers_id = ?${gardeSql}`;
  const branches = [
    `SELECT source.id, cible.id, r.nature, r.qualificatif, r.id ${depuis}
      AND cible.id IN (${places}) AND r.nature IN (${natures.map(() => '?').join(',')})`,
  ];
  const params: (string | number)[] = [universId, universId, ...gardeParams, ...ids, ...natures.map((n) => n.cle)];
  const symetriques = natures.filter((n) => n.symetrique);
  if (symetriques.length > 0) {
    branches.push(`SELECT cible.id, source.id, r.nature, r.qualificatif, r.id ${depuis}
      AND source.id IN (${places}) AND r.nature IN (${symetriques.map(() => '?').join(',')})`);
    params.push(universId, universId, ...gardeParams, ...ids, ...symetriques.map((n) => n.cle));
  }
  // The first endpoint is the direct one when present, otherwise the first readable sub-place.
  // The order also makes each group's map follow the line order without a second title comparator.
  const liens = db.prepare(`
    WITH lues(fiche_id, lieu_id, nature, qualificatif, rang) AS (${branches.join(' UNION ALL ')})
    SELECT l.fiche_id, f.type, l.nature, l.qualificatif, l.lieu_id, p.titre AS lieu_titre
      FROM lues l JOIN fiches f ON f.id = l.fiche_id JOIN fiches p ON p.id = l.lieu_id
     ORDER BY f.titre COLLATE NOCASE, f.id, (p.id = ?) DESC, plier(p.titre), p.id, l.rang
  `).all(...params, ficheId) as LienLu[];

  const groupes: GroupeLiees[] = [];
  for (const nature of natures) {
    const parFiche = new Map<number, [LienLu, ...LienLu[]]>();
    for (const lien of liens) {
      if (lien.nature !== nature.cle) continue;
      const liste = parFiche.get(lien.fiche_id);
      if (liste) liste.push(lien);
      else parFiche.set(lien.fiche_id, [lien]);
    }
    if (parFiche.size === 0) continue;
    const toutes = [...parFiche.values()];
    const types = TYPES_FICHE.map((type) => ({
      type,
      total: toutes.filter((ls) => ls[0].type === type && ls.some((l) => l.lieu_id === ficheId)).length,
      totalAvecDescendants: toutes.filter((ls) => ls[0].type === type).length,
    })).filter((t) => t.totalAvecDescendants > 0);
    const selection = toutes.map((ls) => opts.descendants ? ls : ls.filter((l) => l.lieu_id === ficheId))
      .filter((ls): ls is [LienLu, ...LienLu[]] => ls.length > 0);
    const limite = opts.nature === undefined ? 5 : 50;
    const fiches = selection.slice(apres, apres + limite).map((ls): FicheLiee => {
      const premier = ls[0];
      const e = etiquetageDe(db, premier.fiche_id);
      const ligne: FicheLiee = {
        ...versFiche(chargerFiche(db, universId, premier.fiche_id), (f) => lisiblePar(role, acteur, f)),
        alias: e.alias,
        etiquettes: e.etiquettes,
      };
      const qualificatif = [...new Set(ls.map((l) => l.qualificatif).filter(Boolean))].join(' · ');
      if (qualificatif) ligne.qualificatif = qualificatif;
      if (opts.descendants && premier.lieu_id !== ficheId) {
        ligne.via = { id: premier.lieu_id, titre: premier.lieu_titre };
      }
      return ligne;
    });
    groupes.push({
      nature: nature.cle,
      libelle: nature.symetrique ? nature.libelleSource : nature.libelleCible,
      types,
      fiches,
      suivant: selection.length > apres + limite ? String(apres + limite) : null,
    });
  }
  return { profondeurAtteinte: descente.profondeurAtteinte, groupes };
}
