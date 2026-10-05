/**
 * Error raised by the service functions. `code` tells the routes which HTTP
 * answer to give; `message` is the French text shown to the user when the
 * refusal is meant to be displayed (docs/ecrans.md).
 *
 *  - introuvable : 404 — also what a caller without a role gets (B-4, AD-22)
 *  - refuse      : 403 — the caller can see the thing but may not do this
 *  - invalide    : 400/422 — bad input or a rule broken by the request
 *  - conflit     : 409 — stale version (`section_modifiee`, AD-59), `relation_existante`, `limite_relations`
 */
export type CodeErreur = 'introuvable' | 'refuse' | 'invalide' | 'conflit';

export class ErreurService extends Error {
  constructor(
    readonly code: CodeErreur,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ErreurService';
  }
}

export const introuvable = () => new ErreurService('introuvable', 'Page introuvable.');
export const refuse = (message = 'Action réservée au MJ.') =>
  new ErreurService('refuse', message);
export const invalide = (message: string) => new ErreurService('invalide', message);
