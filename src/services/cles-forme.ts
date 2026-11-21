/**
 * Pure helpers of the keys (AD-146): slug of a text, shapes of a key, and the reservation state the
 * migration 0037 plays through SQL functions (`openDb` registers them). No database access here;
 * the reader and writer of the key columns is `services/cles.ts` (AD-2).
 */

export const CLE_FICHE_MIN = 2;
export const CLE_FICHE_MAX = 200;
export const CLE_UNIVERS_MIN = 2;
export const CLE_UNIVERS_MAX = 40;

/** Lowercase, accents removed, every run of other characters a single hyphen, no hyphen at the ends. */
export function slug(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const aUneLettre = (s: string) => /[a-z]/.test(s);

/** Sheet key: `[a-z0-9_-]`, at most one `:`, 2 to 200 characters, at least one letter. */
export function cleFicheValide(cle: string): boolean {
  if (cle.length < CLE_FICHE_MIN || cle.length > CLE_FICHE_MAX) return false;
  return /^[a-z0-9_:-]+$/.test(cle) && cle.split(':').length <= 2 && aUneLettre(cle);
}

/** Universe key: lowercase letters, digits and hyphens, 2 to 40 characters, at least one letter. */
export function cleUniversValide(cle: string): boolean {
  return (
    cle.length >= CLE_UNIVERS_MIN && cle.length <= CLE_UNIVERS_MAX && /^[a-z0-9-]+$/.test(cle) && aUneLettre(cle)
  );
}

/** A numeric-only reference is an id, never a key. */
export const estId = (reference: string) => /^[0-9]+$/.test(reference);

/** `base`, then `base-2`, `base-3`… — the first one `pris` does not hold; the base is cut to fit `max`. */
export function suffixer(base: string, max: number, pris: (cle: string) => boolean): string {
  const coupe = (b: string, n: number) => {
    const fin = n === 1 ? '' : `-${n}`;
    return b.slice(0, max - fin.length).replace(/-+$/, '') + fin;
  };
  for (let n = 1; ; n++) {
    const cle = coupe(base, n);
    if (!pris(cle)) return cle;
  }
}

/** Base of a sheet key: `type:title`; a title without letter nor digit falls back on `repli` (the id, at migration). */
export function baseCleFiche(type: string, titre: string, repli: string | number): string {
  return `${type}:${slug(titre) || String(repli)}`;
}

/** Base of an universe key; a name that does not give a valid form falls back on `univers-<id>`. */
export function baseCleUnivers(nom: string, id: number): string {
  const s = slug(nom).slice(0, CLE_UNIVERS_MAX).replace(/-+$/, '');
  return cleUniversValide(s) ? s : `univers-${id}`;
}

// ---- state of the migration (one run at a time: better-sqlite3 is synchronous) ----
const reserves = new Map<string, Set<string>>();

export const migrationCles = {
  debut(): number {
    reserves.clear();
    return 0;
  },
  reserver(portee: string, cle: string): string {
    let s = reserves.get(portee);
    if (!s) reserves.set(portee, (s = new Set()));
    s.add(cle);
    return cle;
  },
  tirer(portee: string, base: string, max: number): string {
    let s = reserves.get(portee);
    if (!s) reserves.set(portee, (s = new Set()));
    const cle = suffixer(base, max, (c) => s.has(c));
    s.add(cle);
    return cle;
  },
};
