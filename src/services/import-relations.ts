import type { Db } from '../db/db.js';
import { exigerMJ } from './droits.js';
import { ErreurService, introuvable } from './erreurs.js';
import { cleValide } from './import.js';
import type { Jeton } from './jetons.js';
import { lireLot, noterDansLot, type EntreeRapport, type Issue } from './lots.js';
import { relierSection } from './relations.js';

export interface ResultatRelationImport {
  section?: string;
  cible?: string;
  nature?: string;
  qualificatif?: string;
  /** Deprecated spelling of `qualificatif`, echoed as sent. */
  type?: string;
  /** The field a refusal is about, when it is one (`nature`). */
  champ?: string;
  id?: number;
  etat: 'creee' | 'inchangee' | 'ignoree' | 'refusee';
  code?: string;
  avertissements: string[];
  raison?: string;
}

/** Each entry commits independently: a refused neighbour cannot undo a successful relation (AD-121). */
export function assurerRelations(
  db: Db, jeton: Jeton, lotId: number | null, cle: string, corps: unknown, maintenant: Date = new Date(),
): ResultatRelationImport[] {
  const { universId, compteId } = jeton;
  exigerMJ(db, universId, compteId);
  if (lotId !== null && lireLot(db, jeton, lotId, maintenant).closLe !== null) {
    throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
  }
  if (!cleValide(cle)) throw new ErreurService('invalide', "clé d'origine invalide", undefined, 'cle');
  if (!Array.isArray(corps)) throw new ErreurService('invalide', 'relations : une liste est attendue', undefined, 'corps');
  const source = db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle_origine = ?')
    .get(universId, cle) as { id: number } | undefined;
  if (!source) throw introuvable();

  return corps.map((brut: unknown) => db.transaction((): ResultatRelationImport => {
    const b = typeof brut === 'object' && brut !== null && !Array.isArray(brut)
      ? brut as Record<string, unknown> : {};
    const entree = {
      section: typeof b.section === 'string' ? b.section : undefined,
      cible: typeof b.cible === 'string' ? b.cible : undefined,
      nature: typeof b.nature === 'string' ? b.nature.trim() : undefined,
      qualificatif: typeof b.qualificatif === 'string' ? b.qualificatif.trim() : undefined,
      type: typeof b.type === 'string' ? b.type.trim() : undefined,
    };
    const champsTextes = ['nature', 'qualificatif', 'type'].every((k) => b[k] === undefined || b[k] === null || typeof b[k] === 'string');
    // `type` is the deprecated name of `qualificatif` (AD-134): read as such when it is alone.
    const deprecie = entree.type !== undefined && entree.qualificatif === undefined;
    const qualificatif = deprecie ? entree.type : entree.qualificatif;
    const nature = entree.nature ?? '';
    const noter = (issue: Issue | null, raison?: string, code?: string) => {
      const rapport: EntreeRapport[] = raison ? [{
        cle, objet: 'relation', raison, ...(code ? { code } : {}),
        gravite: issue === 'refusees' ? 'refus' : 'avertissement',
      }] : [];
      if (lotId !== null) noterDansLot(db, lotId, 'relations', issue, rapport, maintenant);
    };
    const refuser = (raison: string, code = 'invalide', champ?: string): ResultatRelationImport => {
      noter('refusees', raison, code);
      return { ...entree, etat: 'refusee', code, raison, ...(champ ? { champ } : {}), avertissements: [] };
    };
    // Answered to the script only: the deprecation does not weigh on the batch's warning count.
    const AVERTISSEMENT_TYPE = 'type est déprécié, utilisez qualificatif';
    const avertissements = deprecie ? [AVERTISSEMENT_TYPE] : [];
    if (!entree.section || !cleValide(entree.section) || !entree.cible || !cleValide(entree.cible)
      || !champsTextes || (entree.type !== undefined && entree.qualificatif !== undefined)
      || (qualificatif !== undefined && qualificatif.length > 80)
      || (nature === '' && !qualificatif)) {
      return refuser('relation : clés de section et cible valides, nature connue ou qualificatif de 1 à 80 caractères attendus');
    }
    const section = db.prepare('SELECT id FROM sections WHERE fiche_id = ? AND cle_origine = ?')
      .get(source.id, entree.section) as { id: number } | undefined;
    const cible = db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle_origine = ?')
      .get(universId, entree.cible) as { id: number } | undefined;
    if (!section || !cible) {
      const raison = !section ? `section inconnue : ${entree.section}` : `cible inconnue : ${entree.cible}`;
      noter(null, raison);
      return { ...entree, etat: 'ignoree', avertissements: [raison] };
    }
    try {
      const relation = relierSection(db, compteId, universId, source.id, section.id,
        { cibleFicheId: cible.id, nature, qualificatif: qualificatif ?? '' });
      noter('creees');
      return { ...entree, id: relation.id, etat: 'creee', avertissements };
    } catch (e) {
      if (!(e instanceof ErreurService)) throw e;
      if (e.detail === 'relation_existante') {
        noter('inchangees');
        return { ...entree, etat: 'inchangee', avertissements };
      }
      if (e.detail === 'nature_incompatible') return refuser(e.message, e.detail, 'nature');
      if (e.detail === 'auto_relation' || e.detail === 'limite_relations') return refuser(e.message, e.detail);
      throw e;
    }
  })());
}
