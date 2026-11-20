import { demanderOuverture } from './fil';

/**
 * « Demander à l'assistant » (AD-battlemap-assistant-7): a screen opens the panel with a request that
 * is prefilled and never sent. The panel lives in its own React root, so the request travels the way
 * the other openings do — a module-level channel, no shell component involved. A request made while
 * the panel is not mounted yet waits for it.
 */
type Auditeur = (message: string) => void;

const auditeurs = new Set<Auditeur>();
let enAttente: string[] = [];

export function ouvrirAssistant({ message }: { message: string }) {
  if (auditeurs.size === 0) enAttente.push(message);
  else auditeurs.forEach((f) => f(message));
  demanderOuverture();
}

/** The panel listens; what waited for it is delivered at once. */
export function surMessagePrerempli(f: Auditeur): () => void {
  auditeurs.add(f);
  const attendus = enAttente;
  enAttente = [];
  attendus.forEach(f);
  return () => auditeurs.delete(f);
}

/** The request E-26 prefills: its text empty or written (AD-battlemap-assistant-7). */
export const demandeDirection = (texteEcrit: boolean) =>
  texteEcrit ? 'Améliore la direction artistique en gardant son esprit.' : 'Propose une direction artistique pour cet univers.';

/** Adds a request after what is already typed, never replacing it. */
export const ajouterDemande = (saisie: string, message: string) => (saisie.trim() === '' ? message : `${saisie.replace(/\s+$/, '')}\n${message}`);
