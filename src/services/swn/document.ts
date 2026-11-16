import type { Db } from '../../db/db.js';
import { ErreurService, invalide } from '../erreurs.js';
import { creerFiche } from '../fiches.js';
import { etatGere, poserSectionGeree } from '../sections-gerees.js';
import type { EtatGere } from '../sections-gerees-etat.js';
import type { Acteur, SectionRow } from '../types.js';
import { produireGalaxie } from './document-source.js';
import { exigerEcritureGalaxie, OUTIL_GALAXIE } from './galaxies.js';

/** The GM document of a galaxy (T-7, B-74): a managed section of a `savoir` sheet, GM only. */

export const TYPE_DOCUMENT = 'document_mj';

const acteurDe = (a: Acteur | number): Acteur => typeof a === 'number' ? { compteId: a } : a;
const conflit = (message: string, code: string) => new ErreurService('conflit', message, code);

export function poserDocumentMJ(
  db: Db, acteur: Acteur | number, universId: number, galaxieId: number,
  cible: { ficheId?: unknown; creer?: { titre?: unknown } }, version: unknown,
): { ficheId: number; sectionId: number } {
  const a = acteurDe(acteur);
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, a, universId, galaxieId);
    if (!Number.isInteger(version) || (version as number) < 1) throw new ErreurService('invalide', 'Version invalide.', undefined, 'version');
    if (g.version !== version) throw conflit("Cette galaxie a changé depuis que vous l'avez ouverte.", 'donnee_modifiee');
    if (g.fiche_id !== null || g.section_id !== null) throw conflit('Cette galaxie a déjà son document.', 'document_existant');
    const c = (cible ?? {}) as { ficheId?: unknown; creer?: { titre?: unknown } };
    if ((c.ficheId === undefined) === (c.creer === undefined)) throw invalide('Une fiche existante ou un titre, pas les deux.');
    let ficheId: number;
    if (c.creer !== undefined) {
      const titre = typeof c.creer?.titre === 'string' ? c.creer.titre : '';
      ficheId = creerFiche(db, a.compteId, universId, { type: 'savoir', titre }).id;
    } else {
      if (!Number.isInteger(c.ficheId)) throw invalide('Fiche invalide.');
      ficheId = c.ficheId as number;
    }
    const p = produireGalaxie(db, a, universId, g);
    const section = poserSectionGeree(db, a.compteId, universId, {
      ficheId, outil: OUTIL_GALAXIE, type: TYPE_DOCUMENT, contenu: p.contenu, sourceVersion: p.sourceVersion,
      audience: { joueursLisent: false },
    });
    db.prepare('UPDATE swn_galaxies SET fiche_id = ?, section_id = ? WHERE id = ?').run(ficheId, section.id, g.id);
    return { ficheId, sectionId: section.id };
  })();
}

export interface VueDocumentGalaxie {
  fiche: { id: number; titre: string } | null;
  sectionId: number | null;
  etat: EtatGere | null;
  propositionId: number | null;
}

/** The document of a galaxy for its GM: the sheet, the section, its state and the caller's pending proposal. */
export function lireDocument(db: Db, acteur: Acteur | number, universId: number, galaxieId: number): VueDocumentGalaxie {
  const a = acteurDe(acteur);
  const g = exigerEcritureGalaxie(db, a, universId, galaxieId);
  const vide: VueDocumentGalaxie = { fiche: null, sectionId: null, etat: null, propositionId: null };
  if (g.fiche_id === null || g.section_id === null) return vide;
  const fiche = db.prepare('SELECT id, titre FROM fiches WHERE id = ?').get(g.fiche_id) as { id: number; titre: string } | undefined;
  const s = db.prepare('SELECT * FROM sections WHERE id = ?').get(g.section_id) as SectionRow | undefined;
  if (!fiche || !s) return vide;
  const geree = etatGere(db, a, universId, s);
  return { fiche, sectionId: s.id, etat: geree?.etat ?? null, propositionId: geree?.propositionId ?? null };
}
