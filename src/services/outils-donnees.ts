import type { Db } from '../db/db.js';
import type { DeclarationOutil, LigneDonnees, Portee } from '../outils/declaration.js';
import { modulesActifs } from '../outils/registre.js';
import { exigerMJ, roleDe } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import { exigerApplicable, exigerResponsable, resoudreOutil } from './outils.js';
import { compterSectionsGerees, libererSections } from './sections-gerees.js';
import type { Acteur } from './types.js';

/**
 * Counting and erasing the data of a tool (AD-135, D-1 to D-4). The only caller of `donnees` and of the port's
 * `compter` / `effacer`; disabling a tool touches none of this, deleting is its own gesture.
 */
export interface ResumeSuppression {
  outil: { cle: string; libelle: string };
  niveau: 'univers' | 'systeme';
  efface: LigneDonnees[];
  total: number;
  sectionsGerees: number;
  encoreUtilise: null | { univers: { id: number; nom: string }[]; lignes: LigneDonnees[] };
}
export interface LigneVue { cle: string; nombre: number }

const CATALOGUE = {
  univers: { singulier: 'élément local de catalogue', pluriel: 'éléments locaux de catalogue' },
  systeme: { singulier: 'élément du catalogue du système', pluriel: 'éléments du catalogue du système' },
};
const sansZero = (l: LigneDonnees[]) => l.filter((x) => x.nombre > 0);

function outilDeclare(cle: string): DeclarationOutil {
  const o = modulesActifs().flatMap((m) => m.outils).find((x) => x.cle === cle);
  if (!o) throw introuvable();
  return o;
}
/** Guards of D-2, in order; the tool may be disabled or hidden from the role. */
function garder(db: Db, acteur: Acteur, portee: Portee, cle: string): DeclarationOutil {
  const outil = outilDeclare(cle);
  const rien = portee.niveau === 'univers' ? !outil.donnees && !outil.catalogue : !outil.catalogue;
  if (rien) throw introuvable();
  if (portee.niveau === 'univers') {
    if (roleDe(db, portee.universId, acteur.compteId) !== 'mj') throw introuvable();
    exigerMJ(db, portee.universId, acteur.compteId);
    if (acteur.modeJoueur) throw refuse();
    exigerApplicable(db, { niveau: 'univers', id: portee.universId }, cle);
  } else {
    exigerResponsable(db, acteur, portee.systemeId);
    exigerApplicable(db, { niveau: 'systeme', id: portee.systemeId }, cle);
  }
  return outil;
}
/** Whether the caller could delete this level of this tool (same guards as `garder`), for the `supprimable` flag. */
export function peutSupprimer(db: Db, acteur: Acteur, portee: Portee, cle: string): boolean {
  try { garder(db, acteur, portee, cle); return true; } catch (e) {
    if (e instanceof ErreurService) return false;
    throw e;
  }
}
const cibleCatalogue = (p: Portee) => p.niveau === 'univers' ? { universId: p.universId } : { systemeId: p.systemeId };

function recompter(db: Db, outil: DeclarationOutil, portee: Portee): LigneDonnees[] {
  const lignes = sansZero(outil.donnees?.compter(db, portee) ?? []);
  if (outil.catalogue) {
    const nombre = outil.catalogue.stockage.compter(db, cibleCatalogue(portee)).reduce((n, l) => n + l.nombre, 0);
    if (nombre > 0) lignes.push({ cle: 'catalogue', ...CATALOGUE[portee.niveau], nombre });
  }
  return lignes;
}

export function resumeSuppression(db: Db, acteur: Acteur, portee: Portee, outilCle: string): ResumeSuppression {
  return db.transaction(() => {
    const outil = garder(db, acteur, portee, outilCle);
    const efface = recompter(db, outil, portee);
    let encoreUtilise: ResumeSuppression['encoreUtilise'] = null;
    if (portee.niveau === 'systeme') {
      const univers = (db.prepare('SELECT id, nom FROM univers WHERE systeme_id = ? ORDER BY nom COLLATE NOCASE, id')
        .all(portee.systemeId) as { id: number; nom: string }[])
        .filter((u) => resoudreOutil(db, u.id, outilCle).active);
      encoreUtilise = { univers, lignes: sansZero(outil.donnees?.utilisations?.(db, portee.systemeId) ?? []) };
    }
    return {
      outil: { cle: outil.cle, libelle: outil.libelle }, niveau: portee.niveau, efface,
      total: efface.reduce((n, l) => n + l.nombre, 0),
      sectionsGerees: portee.niveau === 'univers' ? compterSectionsGerees(db, portee.universId, outilCle) : 0,
      encoreUtilise,
    };
  })();
}

const conflit = () => new ErreurService('conflit', 'Les données ont changé depuis que vous avez ouvert cette fenêtre.', 'contenu_change');
function lignesVues(vu: unknown): LigneVue[] {
  if (!Array.isArray(vu) || vu.some((l) => !l || typeof l !== 'object' || typeof l.cle !== 'string'
    || !Number.isInteger(l.nombre) || l.nombre < 0)) {
    throw new ErreurService('invalide', 'Les lignes lues sont invalides.', undefined, 'vu');
  }
  return vu as LigneVue[];
}
const memeLignes = (a: { cle: string; nombre: number }[], b: { cle: string; nombre: number }[]) =>
  a.length === b.length && new Set(a.map((l) => l.cle)).size === a.length
  && a.every((l) => b.filter((x) => x.cle === l.cle && x.nombre === l.nombre).length === 1);

/**
 * Erases the data of one level of a tool, the user having read `vu`: the count is redone in the transaction and
 * any difference is a `conflit` with nothing erased (AD-119, T-6). Activation, visibility and settings stay.
 */
export function supprimerDonneesOutil(db: Db, acteur: Acteur, portee: Portee, outilCle: string, vu: unknown): LigneDonnees[] {
  const lus = lignesVues(vu);
  return db.transaction(() => {
    const outil = garder(db, acteur, portee, outilCle);
    const lignes = recompter(db, outil, portee);
    if (!memeLignes(lus, lignes)) throw conflit();
    outil.donnees?.effacer(db, portee);
    outil.catalogue?.stockage.effacer(db, cibleCatalogue(portee));
    if (portee.niveau === 'univers') {
      db.prepare('UPDATE outils_univers SET version_catalogue = NULL WHERE univers_id = ? AND outil = ?').run(portee.universId, outilCle);
      libererSections(db, portee.universId, outilCle);
    } else {
      db.prepare('UPDATE outils_systeme SET version_catalogue = NULL WHERE systeme_id = ? AND outil = ?').run(portee.systemeId, outilCle);
    }
    return lignes;
  })();
}

/** Deleting a universe (D-4): every tool's rows go, enabled or not, then the universe's own tool rows; the caller's transaction. */
export function effacerDonneesUniversComplet(db: Db, universId: number): void {
  const portee: Portee = { niveau: 'univers', universId };
  for (const outil of modulesActifs().flatMap((m) => m.outils)) {
    outil.donnees?.effacer(db, portee);
    outil.catalogue?.stockage.effacer(db, { universId });
  }
  db.prepare('DELETE FROM outils_univers WHERE univers_id = ?').run(universId);
}
