// Family of a route from its free `type_lien` text (AD-sorties-3): decides the token that colours its arrow.
export type FamilleRoute = 'public' | 'private' | 'pirate' | 'autre';

/** Trimmed, without case or accents: `publique` and `public` → public, `privee` / `privé` → private, `pirate` → pirate; anything else (empty, `null`) → autre. */
export function typeDeRoute(typeLien: string | null | undefined): FamilleRoute {
  const t = (typeLien ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (t === 'public' || t === 'publique') return 'public';
  if (t === 'private' || t === 'prive' || t === 'privee') return 'private';
  if (t === 'pirate') return 'pirate';
  return 'autre';
}
