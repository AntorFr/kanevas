// Test helper: seeds the stub on a database still at a schema BEFORE migration 0051 (`swn_systemes.taille` an integer 1..5, `couleur` a name).
// The seeds write the new shape (0.75, `#8b9bf0`); the proxy turns those two values back into the old ones on the way in, so a
// « montée avec le semis » test keeps its old-schema starting point.
import type { Db } from './db.js';

const TAILLES: Record<string, number> = { '0.15': 1, '0.45': 2, '0.75': 3, '0.9': 4, '1': 5 };
const COULEURS: Record<string, string> = { '#8b9bf0': 'accent', '#3fc79a': 'table', '#f2a33c': 'ambre', '#ec7b6f': 'danger', '#ebecf0': 'clair' };

export function ancienSchema(db: Db): Db {
  return new Proxy(db, {
    get(cible, nom) {
      if (nom !== 'prepare') { const v = Reflect.get(cible, nom, cible); return typeof v === 'function' ? v.bind(cible) : v; }
      return (sql: string) => {
        const st = cible.prepare(sql.replace("0.45, '#f2a33c'", "2, 'ambre'"));
        if (!/INSERT INTO swn_systemes/.test(sql)) return st;
        const colonnes = /\(([^)]*)\)\s*VALUES/s.exec(sql)?.[1]?.split(',').map((c) => c.trim()) ?? [];
        const it = colonnes.indexOf('taille'), ic = colonnes.indexOf('couleur');
        return new Proxy(st, {
          get(s, k) {
            if (k !== 'run') { const v = Reflect.get(s, k, s); return typeof v === 'function' ? v.bind(s) : v; }
            return (...a: unknown[]) => {
              const b = [...a];
              if (it >= 0 && typeof b[it] === 'number' && String(b[it]) in TAILLES) b[it] = TAILLES[String(b[it])];
              if (ic >= 0 && typeof b[ic] === 'string' && (b[ic] as string) in COULEURS) b[ic] = COULEURS[b[ic] as string];
              return s.run(...b);
            };
          },
        });
      };
    },
  });
}

const TAILLE_NOUVELLE: Record<number, number> = { 1: 0.15, 2: 0.45, 3: 0.75, 4: 0.9, 5: 1 };
const COULEUR_NOUVELLE: Record<string, string | null> = { accent: '#8b9bf0', table: '#3fc79a', ambre: '#f2a33c', danger: '#ec7b6f', clair: '#ebecf0', neutre: null };
/** An old-schema `swn_systemes` row as migration 0051 must leave it (conversion table of `docs/donnees.md`; `classe` and `voile` null). */
export function ligneApres0051<T extends { taille: number; couleur: string }>(l: T): Record<string, unknown> {
  return { ...l, taille: TAILLE_NOUVELLE[l.taille], couleur: COULEUR_NOUVELLE[l.couleur] ?? null, classe: null, voile: null };
}
