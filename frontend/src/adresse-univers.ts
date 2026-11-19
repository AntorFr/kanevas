import { matchPath } from 'react-router-dom';

/** Id of the universe in the address, or null outside a universe (or when the address uses its key). */
export function universDeLAdresse(chemin: string): number | null {
  const ref = refUniversDeLAdresse(chemin);
  return ref && /^\d+$/.test(ref) ? Number(ref) : null;
}

/** The universe reference of the address (an id, a key or a former key, B-101), or null outside a universe. */
export function refUniversDeLAdresse(chemin: string): string | null {
  const m = matchPath({ path: '/univers/:id/*' }, chemin);
  const ref = m?.params.id;
  return ref && ref !== 'nouveau' ? ref : null;
}

/** The universe a reference names in the account's list: by id (digits only) or by current key. */
export function universDeRef<T extends { id: number; cle?: string }>(liste: T[], ref: string | null): T | undefined {
  if (ref === null) return undefined;
  return /^\d+$/.test(ref) ? liste.find((u) => u.id === Number(ref)) : liste.find((u) => u.cle === ref);
}

/** What a link to a universe carries: its key when the answer has it, else its id. */
export const adresseUnivers = (u: { id: number; cle?: string }): string => u.cle ?? String(u.id);
