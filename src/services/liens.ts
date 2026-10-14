import type { Db } from '../db/db.js';
import { peutVoirFiche, roleDe } from './droits.js';
import { ErreurService } from './erreurs.js';
import { extraireLiens, reecrireLiens } from './markdown.js';

// The `[[…]]` links of a section (AD-116). This file is the only writer of the `liens` table
// (AD-2, AD-21): the rows follow the content, replaced as a whole at each write (`sections.ts`).

/** The refusal of a link to a sheet the author does not read; the code goes to the route as `code`. */
export const MESSAGE_LIEN_ILLISIBLE = "Cette fiche n'existe pas ou vous ne pouvez pas la lire.";
export const lienIllisible = () => new ErreurService('invalide', MESSAGE_LIEN_ILLISIBLE, 'lien_illisible');

/** A title as the text of a link: no `]`, `|` nor line break, 200 characters at most. */
function texteDeLien(titre: string, id: number): string {
  const t = titre.replace(/[\]|\r\n]+/g, ' ').trim().slice(0, 200);
  return t === '' ? `Fiche ${id}` : t;
}

/**
 * The content as it is stored, before it is written (AD-116): `[[cle:<clé>|<texte>]]` whose key is
 * known to the universe becomes `[[<id>|<texte>]]`, and a bare `[[<id>]]` becomes `[[<id>|<titre>]]`.
 * A bare id of a sheet the author does not read (or that does not exist) is refused with
 * `lien_illisible`. A key known but not readable by the author is left as written, like an unknown one:
 * resolving it would tell a player that the sheet exists. Pure of any write.
 */
export function preparerContenu(db: Db, universId: number, compteId: number, contenu: string): string {
  if (!contenu.includes('[[')) return contenu;
  const liens = extraireLiens(contenu);
  if (liens.length === 0) return contenu;
  const role = roleDe(db, universId, compteId);
  const lisible = (ficheId: number) => role !== null && peutVoirFiche(db, role, ficheId, { compteId });
  const parId = db.prepare('SELECT id, titre FROM fiches WHERE id = ? AND univers_id = ?');
  const parCle = db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle_origine = ?');
  return reecrireLiens(contenu, liens, (l) => {
    if (l.cle !== null) {
      const f = parCle.get(universId, l.cle) as { id: number } | undefined;
      return f && lisible(f.id) ? `[[${f.id}|${l.texte}]]` : null;
    }
    if (l.texte !== null) return null;
    const f = parId.get(l.id, universId) as { id: number; titre: string } | undefined;
    if (!f || !lisible(f.id)) throw lienIllisible();
    return `[[${f.id}|${texteDeLien(f.titre, f.id)}]]`;
  });
}

/** Replaces the rows of a section by the links its content carries now (same transaction as the write). */
export function remplacerLiens(db: Db, sectionId: number, contenu: string): void {
  db.prepare('DELETE FROM liens WHERE section_id = ?').run(sectionId);
  if (!contenu.includes('[[')) return;
  const liens = extraireLiens(contenu).filter((l) => l.texte !== null);
  if (liens.length === 0) return;
  const { univers_id: universId } = db
    .prepare('SELECT f.univers_id FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE s.id = ?')
    .get(sectionId) as { univers_id: number };
  const parId = db.prepare('SELECT id FROM fiches WHERE id = ? AND univers_id = ?');
  const parCle = db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle_origine = ?');
  const inserer = db.prepare(
    `INSERT INTO liens (section_id, cible_fiche_id, cible_cle, texte, dans_bloc_mj) VALUES (?, ?, ?, ?, ?)`,
  );
  for (const l of liens) {
    let fiche: number | null = null;
    let cle: string | null = null;
    if (l.id !== null) {
      fiche = (parId.get(l.id, universId) as { id: number } | undefined)?.id ?? null;
    } else {
      fiche = (parCle.get(universId, l.cle) as { id: number } | undefined)?.id ?? null;
      if (fiche === null) cle = l.cle;
    }
    inserer.run(sectionId, fiche, cle, l.texte, l.dansBlocMJ ? 1 : 0);
  }
}

/** The sections of a universe that wait for an origin key, with their content. */
export function sectionsEnAttenteDe(
  db: Db,
  universId: number,
  cle: string,
): { id: number; contenu: string }[] {
  return db
    .prepare(
      `SELECT DISTINCT s.id, s.contenu FROM liens l
         JOIN sections s ON s.id = l.section_id JOIN fiches f ON f.id = s.fiche_id
        WHERE f.univers_id = ? AND l.cible_cle = ?`,
    )
    .all(universId, cle) as { id: number; contenu: string }[];
}

/** Points the waiting rows of the given sections at the sheet that now carries the key. */
export function resoudreLiens(db: Db, sectionIds: number[], cle: string, ficheId: number): void {
  const maj = db.prepare(
    'UPDATE liens SET cible_fiche_id = ?, cible_cle = NULL WHERE section_id = ? AND cible_cle = ?',
  );
  for (const id of sectionIds) maj.run(ficheId, id, cle);
}

/** Links of a universe still waiting for an origin key: what a batch reports at its closing. */
export function compterEnAttente(db: Db, universId: number): number {
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM liens l
         JOIN sections s ON s.id = l.section_id JOIN fiches f ON f.id = s.fiche_id
        WHERE f.univers_id = ? AND l.cible_cle IS NOT NULL`,
    )
    .get(universId) as { n: number };
  return n;
}
