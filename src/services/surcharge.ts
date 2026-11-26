import type { Db } from '../db/db.js';
import { espaceDe, exigerRole, lectureSysteme } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import { creerFiche, lireFiche, poserDetacheurDeCopies, supprimerFiche } from './fiches.js';
import { ecrire } from './historique.js';
import { poserDetacheurDUnivers } from './systemes.js';
import { insererSection } from './sections.js';
import type { Acteur, FicheVue } from './types.js';

/**
 * Customising an element of a game system (AD-153, AD-surcharge-1): this file is the only writer of
 * `fiches.surcharge_de`. The copy is an ordinary sheet of the universe, created through `creerFiche` and
 * `insererSection` (keys, links and public content are the services' own), tied to its original by the column.
 */

interface FicheLigne {
  id: number;
  univers_id: number;
  type: string;
  titre: string;
  charge: string;
  sous_type: string | null;
  surcharge_de: number | null;
}

interface SectionLigne {
  titre: string;
  ordre: number;
  contenu: string;
  joueurs_lisent: number;
  joueurs_ecrivent: number;
}

/** GM of the universe outside player mode; the universe's attached system. No role → `introuvable`, a player → `refuse`. */
function garde(db: Db, acteur: Acteur, universId: number): number {
  const role = exigerRole(db, universId, acteur.compteId);
  if (role !== 'mj') throw refuse();
  if (acteur.modeJoueur) throw new ErreurService('refuse', 'Action réservée au MJ.', 'mode_joueur');
  const u = db.prepare('SELECT systeme_id FROM univers WHERE id = ? AND espace_systeme_id IS NULL').get(universId) as
    | { systeme_id: number | null }
    | undefined;
  if (!u || u.systeme_id === null) throw introuvable();
  return u.systeme_id;
}

const ligne = (db: Db, id: number): FicheLigne | undefined =>
  db.prepare('SELECT id, univers_id, type, titre, charge, sous_type, surcharge_de FROM fiches WHERE id = ?').get(id) as
    | FicheLigne
    | undefined;

const copieDe = (db: Db, universId: number, originalId: number): number | null =>
  (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND surcharge_de = ?').get(universId, originalId) as
    | { id: number }
    | undefined)?.id ?? null;

/**
 * The GM copies an element of the universe's system into the universe (B-115): the title, type, payload,
 * aliases and the sections the players read, with their audience flags. Never the GM-only sections, labels,
 * relations, files, parent or keys. If the copy exists, it is returned untouched (`creee: false`).
 */
export function personnaliser(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
): { creee: boolean; fiche: FicheVue } {
  const systemeId = garde(db, acteur, universId);
  const f = ligne(db, ficheId);
  if (!f) throw introuvable();
  // The id of a copy of this universe answers with that copy.
  if (f.univers_id === universId && f.surcharge_de !== null) {
    return { creee: false, fiche: lireFiche(db, acteur, universId, f.id) };
  }
  if (f.univers_id !== espaceDe(db, systemeId)) throw introuvable();
  const existante = copieDe(db, universId, f.id);
  if (existante !== null) return { creee: false, fiche: lireFiche(db, acteur, universId, existante) };

  const id = ecrire(db, acteur.compteId, () => {
    const copie = creerFiche(db, acteur.compteId, universId, {
      type: f.type,
      titre: f.titre,
      charge: JSON.parse(f.charge) as Record<string, unknown>,
      sousType: f.sous_type,
    });
    db.prepare('UPDATE fiches SET surcharge_de = ? WHERE id = ?').run(f.id, copie.id);
    for (const { alias } of db.prepare('SELECT alias FROM fiche_alias WHERE fiche_id = ? ORDER BY rowid').all(f.id) as {
      alias: string;
    }[]) {
      db.prepare('INSERT INTO fiche_alias (fiche_id, alias) VALUES (?, ?)').run(copie.id, alias);
    }
    const now = new Date().toISOString();
    const sections = db
      .prepare('SELECT titre, ordre, contenu, joueurs_lisent, joueurs_ecrivent FROM sections WHERE fiche_id = ? AND joueurs_lisent = 1 ORDER BY ordre, id')
      .all(f.id) as SectionLigne[];
    for (const s of sections) {
      insererSection(db, {
        ficheId: copie.id,
        titre: s.titre,
        ordre: s.ordre,
        contenu: s.contenu,
        modifieLe: now,
        joueursLisent: s.joueurs_lisent,
        joueursEcrivent: s.joueurs_ecrivent,
      });
    }
    return copie.id;
  });
  return { creee: true, fiche: lireFiche(db, acteur, universId, id) };
}

/**
 * The GM goes back to the element (B-115): the copy is deleted as a sheet (`supprimerFiche`, AD-119). `ficheId` is
 * the element or its copy; no copy in this universe → `introuvable`.
 */
export function revenir(db: Db, acteur: Acteur, universId: number, ficheId: number): void {
  garde(db, acteur, universId);
  const f = ligne(db, ficheId);
  if (!f) throw introuvable();
  const copie = f.univers_id === universId && f.surcharge_de !== null ? f.id : copieDe(db, universId, f.id);
  if (copie === null) throw introuvable();
  supprimerFiche(db, acteur, universId, copie);
}

/** What the confirmations of an element announce (AD-surcharge-4): how many universes customised it, and the names of the account's own. */
export function copiesDeElement(
  db: Db,
  compteId: number,
  systemeId: number,
  ficheId: number,
): { nbUnivers: number; mesUnivers: { id: number; nom: string }[] } {
  const droit = lectureSysteme(db, compteId, systemeId);
  if (!droit) throw introuvable();
  if (droit.role !== 'mj') throw refuse();
  const f = ligne(db, ficheId);
  if (!f || f.univers_id !== droit.espaceId) throw introuvable();
  const n = db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE surcharge_de = ?').get(f.id) as { n: number };
  const mesUnivers = db
    .prepare(
      `SELECT u.id, u.nom FROM fiches c JOIN univers u ON u.id = c.univers_id
         JOIN membres m ON m.univers_id = u.id AND m.compte_id = ?
        WHERE c.surcharge_de = ? ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all(compteId, f.id) as { id: number; nom: string }[];
  return { nbUnivers: n.n, mesUnivers };
}

/** Number of customised sheets of a universe (`systeme.personnalisees` for its GM). */
export function nombreDePersonnalisees(db: Db, universId: number): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE univers_id = ? AND surcharge_de IS NOT NULL').get(universId) as { n: number }).n;
}

/**
 * The element goes (AD-surcharge-3, B-120): every copy of it, in any universe, becomes an ordinary sheet. Called inside the
 * caller's write context, so the `detachee` line of the trigger carries the account that deletes. Writes nothing without a copy.
 * Returns the number of copies detached.
 */
export function detacherCopiesDe(db: Db, ficheId: number): number {
  return db.prepare('UPDATE fiches SET surcharge_de = NULL WHERE surcharge_de = ?').run(ficheId).changes;
}

/** The universe leaves its system: its copies become ordinary sheets, in the transaction of the change. */
export function detacherCopiesDeUnivers(db: Db, universId: number): number {
  return db.prepare('UPDATE fiches SET surcharge_de = NULL WHERE univers_id = ? AND surcharge_de IS NOT NULL').run(universId).changes;
}

/** Copies of the element (the bilan of its deletion counts them as sheets that become ordinary). */
const compterCopies = (db: Db, ficheId: number): number =>
  (db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE surcharge_de = ?').get(ficheId) as { n: number }).n;

poserDetacheurDeCopies(detacherCopiesDe, compterCopies);
poserDetacheurDUnivers(detacherCopiesDeUnivers);
