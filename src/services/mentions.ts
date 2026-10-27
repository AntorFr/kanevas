import type { Db } from '../db/db.js';
import { sqlSectionLisible, vueMJ } from './droits.js';
import type { Acteur, Mention, PageMentions, Pourquoi, Role, TypeFiche } from './types.js';

// « Mentionnée dans » (B-36, AD-100): the sheets that cite another one by a `[[…]]` link or by a
// relation. Read-only; `liens` and `relations` are written elsewhere. Both guards apply (AD-64):
// the carrying section and the source sheet must be readable by the reader in this mode, and a link
// written inside a GM block counts for a GM outside player mode only. Nothing hidden is counted.

/** One page of sources (the sheet carries the first one). */
export const LIMITE_MENTIONS = 50;

/**
 * The sources of `ficheId` for a reader who has already been allowed to read it. `apres` is the
 * number of sources already shown; the order is title then id. A sheet that cites itself is not listed.
 */
export function mentionsDe(
  db: Db,
  role: Role,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  apres = 0,
): PageMentions {
  const lisible = sqlSectionLisible(role, acteur, 's');
  const sectionLue = lisible ? ` AND ${lisible.sql}` : '';
  const sectionParams = lisible?.params ?? [];
  const horsBlocMJ = vueMJ(role, acteur) ? '' : ' AND l.dans_bloc_mj = 0';
  // A source section is readable ⇒ its sheet is (a sheet is readable by one readable section).
  const src = `WITH src (fiche_id, section_titre, ordre, genre, libelle, rang) AS (
      SELECT s.fiche_id, s.titre, s.ordre, 0, NULL, l.id
        FROM liens l JOIN sections s ON s.id = l.section_id JOIN fiches f ON f.id = s.fiche_id
       WHERE l.cible_fiche_id = ? AND f.univers_id = ? AND f.id <> ?${horsBlocMJ}${sectionLue}
      UNION ALL
      SELECT s.fiche_id, s.titre, s.ordre, 1, r.qualificatif, r.id
        FROM relations r JOIN sections s ON s.id = r.section_id JOIN fiches f ON f.id = s.fiche_id
       WHERE r.cible_fiche_id = ? AND r.nature = '' AND f.univers_id = ? AND f.id <> ?${sectionLue}
    )`;
  const paramsSrc = [ficheId, universId, ficheId, ...sectionParams, ficheId, universId, ficheId, ...sectionParams];
  const pas = Math.max(Math.trunc(apres), 0);
  const page = db
    .prepare(
      `${src} SELECT f.id, f.titre, f.type FROM fiches f
        WHERE f.id IN (SELECT fiche_id FROM src)
        ORDER BY f.titre COLLATE NOCASE, f.id LIMIT ? OFFSET ?`,
    )
    .all(...paramsSrc, LIMITE_MENTIONS + 1, pas) as { id: number; titre: string; type: TypeFiche }[];
  const visibles = page.slice(0, LIMITE_MENTIONS);
  if (visibles.length === 0) return { mentions: [], suite: false, restantes: 0 };
  const raisons = db
    .prepare(
      `${src} SELECT fiche_id, section_titre, genre, libelle FROM src
        WHERE fiche_id IN (${visibles.map(() => '?').join(',')})
        ORDER BY ordre, genre, rang`,
    )
    .all(...paramsSrc, ...visibles.map((v) => v.id)) as {
    fiche_id: number;
    section_titre: string;
    genre: number;
    libelle: string | null;
  }[];
  const parFiche = new Map<number, Pourquoi[]>();
  for (const r of raisons) {
    const p: Pourquoi = r.genre === 0 ? { genre: 'lien', section: r.section_titre } : { genre: 'relation', libelle: r.libelle ?? '' };
    const liste = parFiche.get(r.fiche_id) ?? [];
    // One reason once: two links from the same section read « lien dans « Histoire » » once.
    if (!liste.some((q) => JSON.stringify(q) === JSON.stringify(p))) liste.push(p);
    parFiche.set(r.fiche_id, liste);
  }
  const mentions: Mention[] = visibles.map((v) => ({
    ficheId: v.id,
    titre: v.titre,
    type: v.type,
    pourquoi: parFiche.get(v.id) ?? [],
  }));
  const suite = page.length > LIMITE_MENTIONS;
  // « Afficher les N suivants »: N counts what this reader sees, as the page does.
  const restantes = suite
    ? (db.prepare(`${src} SELECT COUNT(*) AS n FROM fiches f WHERE f.id IN (SELECT fiche_id FROM src)`).get(...paramsSrc) as { n: number }).n - pas - LIMITE_MENTIONS
    : 0;
  return { mentions, suite, restantes };
}
