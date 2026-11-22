import { ErreurApi } from '../../../api';
import type { EchecEdition } from './Edition';

/** The words of docs/ecrans.md (« E-23 — elements », States added). */
export const MESSAGES_ELEMENT = {
  conflit: 'Cet élément a changé depuis que vous l’avez ouvert.',
  element: 'Cet élément n’existe plus.',
  astre: 'Cet astre n’existe plus.',
  systeme: 'Ce système n’existe plus.',
  refus: 'Vous ne pouvez plus modifier ce système.',
  erreur: 'Impossible d’enregistrer l’élément.',
  perdu: 'Connexion perdue.',
  nom: 'Donnez un nom à cet élément.',
  description: 'Description trop longue (2 000 caractères au plus).',
} as const;

/**
 * What a refused write of an element says. `astre`: the gesture names a body (« Poser sur un astre », a body chosen in the form), so an
 * unknown target is that body; otherwise it is the element itself. A 404 is the system (deleted meanwhile, for the GM who read it).
 */
export function lireEchecElement(e: unknown, astre = false): EchecEdition {
  if (!(e instanceof ErreurApi)) return { sorte: 'autre', message: MESSAGES_ELEMENT.erreur };
  if (e.statut === 0) return { sorte: 'perdu', message: MESSAGES_ELEMENT.perdu };
  if (e.code === 'a_change') return { sorte: 'conflit', message: MESSAGES_ELEMENT.conflit, recharger: true };
  if (e.code === 'astre_inconnu') return { sorte: 'inconnu', message: astre ? MESSAGES_ELEMENT.astre : MESSAGES_ELEMENT.element, recharger: true };
  if (e.code === 'orbite_invalide') return { sorte: 'champ', message: 'Orbite invalide.' };
  if (e.statut === 404) return { sorte: 'inconnu', message: MESSAGES_ELEMENT.systeme, recharger: true };
  if (e.statut === 403) return { sorte: 'refus', message: MESSAGES_ELEMENT.refus };
  if (e.statut === 400 || e.statut === 413) return { sorte: 'champ', message: e.message };
  return { sorte: 'autre', message: MESSAGES_ELEMENT.erreur };
}
