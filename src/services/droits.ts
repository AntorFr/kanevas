import type { Db } from '../db/db.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import { resolveurFichiers, resolveurFichiersEnAttente } from './fichiers-lecture.js';
import { etatGere } from './sections-gerees-etat.js';
import { extraireLiens, rendreMarkdown, type ResolveurLiens } from './markdown.js';
import type { Acteur, Audience, Role, SectionRow, SectionVue } from './types.js';

/** The caller's role in a universe, read from `membres` on every call (AD-9). */
export function roleDe(db: Db, universId: number, compteId: number): Role | null {
  const row = db
    .prepare('SELECT role FROM membres WHERE univers_id = ? AND compte_id = ?')
    .get(universId, compteId) as { role: Role } | undefined;
  if (row) return row.role;
  // The space of a system (AD-151) has no player rows: whoever reads the system reads its space as a player
  // (AD-152), so the sheet services refuse a write with 403 and not 404 (AD-157).
  const u = db.prepare('SELECT * FROM univers WHERE id = ?').get(universId) as
    | { espace_systeme_id?: number | null }
    | undefined;
  if (u?.espace_systeme_id == null) return null;
  return lectureSysteme(db, compteId, u.espace_systeme_id)?.role ?? null;
}

/** A caller without a role gets "not found", as if the universe did not exist (B-4). */
export function exigerRole(db: Db, universId: number, compteId: number): Role {
  const role = roleDe(db, universId, compteId);
  if (!role) throw introuvable();
  return role;
}

/** The id of the hidden space of a system (AD-151), `null` for an unknown system. */
export function espaceDe(db: Db, systemeId: number): number | null {
  const r = db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(systemeId) as { id: number } | undefined;
  return r?.id ?? null;
}

/**
 * The one read of a system's space (AD-152): the account's right on it, `null` when it has none. `role: 'mj'` for a GM of
 * the system (a `membres` row of the space: every section, whichever address it enters by), `role: 'joueur'` for a member
 * of an attached universe (the sections the players read). The role is the one to give `peutLireSection` /
 * `sqlSectionLisible`, with no player mode: the right is the account's, never the address's.
 */
export function lectureSysteme(
  db: Db,
  compteId: number,
  systemeId: number,
): { espaceId: number; role: Role } | null {
  const espaceId = espaceDe(db, systemeId);
  if (espaceId === null) return null;
  const ligne = db.prepare('SELECT role FROM membres WHERE univers_id = ? AND compte_id = ?').get(espaceId, compteId) as
    | { role: Role }
    | undefined;
  if (ligne?.role === 'mj') return { espaceId, role: 'mj' };
  const rattache = db
    .prepare(
      `SELECT 1 FROM univers u JOIN membres m ON m.univers_id = u.id
       WHERE u.systeme_id = ? AND m.compte_id = ? LIMIT 1`,
    )
    .get(systemeId, compteId);
  return rattache ? { espaceId, role: 'joueur' } : null;
}

/** Whether the account is a GM of the system (writes its elements, AD-152). */
export function estMJDuSysteme(db: Db, compteId: number, systemeId: number): boolean {
  return lectureSysteme(db, compteId, systemeId)?.role === 'mj';
}

/**
 * The sections of a system's sheet that the account reads, in order; empty when it reads nothing (unknown system or
 * sheet, another space's sheet, no right). A GM of the system who is also a member of an attached universe reads all.
 */
export function sectionsDuSysteme(db: Db, compteId: number, systemeId: number, ficheId: number): SectionRow[] {
  const droit = lectureSysteme(db, compteId, systemeId);
  if (!droit) return [];
  const f = db.prepare('SELECT 1 FROM fiches WHERE id = ? AND univers_id = ?').get(ficheId, droit.espaceId);
  if (!f) return [];
  const rows = db.prepare('SELECT * FROM sections WHERE fiche_id = ? ORDER BY ordre, id').all(ficheId) as SectionRow[];
  return rows.filter((s) => peutLireSection(droit.role, s, { compteId }));
}

/** GM only. No role → not found; a player → refused. */
export function exigerMJ(db: Db, universId: number, compteId: number): void {
  if (exigerRole(db, universId, compteId) !== 'mj') throw refuse();
}

/**
 * How a read is made: the GM reads everything (AD-18) unless in player mode
 * (AD-39), which reads as a player who authors no section.
 */
function regard(role: Role, acteur: Acteur): { mj: boolean; auteurId: number | null } {
  if (acteur.modeJoueur) return { mj: false, auteurId: null };
  return { mj: role === 'mj', auteurId: acteur.compteId };
}

/** True when the read view of this caller is the full GM one. */
/** Managed by a tool (AD-127). A schema older than 0018 has no `gere_par` at all: that is a free section. */
export const estGeree = (s: SectionRow): boolean => typeof s.gere_par === 'string';

export function vueMJ(role: Role, acteur: Acteur): boolean {
  return regard(role, acteur).mj;
}

export function peutLireSection(role: Role, s: SectionRow, acteur: Acteur): boolean {
  const r = regard(role, acteur);
  if (r.mj) return true;
  return s.joueurs_lisent === 1 || (s.auteur_id !== null && s.auteur_id === r.auteurId && s.auteur_lit === 1);
}

/**
 * SQL condition "this section row (alias `alias`) is readable by the caller",
 * the SQL twin of `peutLireSection`. Empty when the caller reads everything.
 */
export function sqlSectionLisible(
  role: Role,
  acteur: Acteur,
  alias: string,
): { sql: string; params: number[] } | null {
  const r = regard(role, acteur);
  if (r.mj) return null;
  return {
    sql: `(${alias}.joueurs_lisent = 1 OR (${alias}.auteur_lit = 1 AND ${alias}.auteur_id = ?))`,
    params: [r.auteurId ?? -1],
  };
}

/**
 * SQL condition "this sheet row (alias `alias`) is readable by the caller":
 * at least one readable section; the GM outside player mode reads every sheet.
 */
export function sqlFicheLisible(
  role: Role,
  acteur: Acteur,
  alias: string,
): { sql: string; params: number[] } | null {
  const lisible = sqlSectionLisible(role, acteur, 's');
  if (!lisible) return null;
  return {
    sql: `EXISTS (SELECT 1 FROM sections s WHERE s.fiche_id = ${alias}.id AND ${lisible.sql})`,
    params: lisible.params,
  };
}

/** True when the caller reads this sheet (of the universe they hold `role` in), B-9, AD-38. */
export function peutVoirFiche(db: Db, role: Role, ficheId: number, acteur: Acteur): boolean {
  const cond = sqlFicheLisible(role, acteur, 'f');
  const row = db
    .prepare(`SELECT 1 AS ok FROM fiches f WHERE f.id = ?${cond ? ` AND ${cond.sql}` : ''}`)
    .get(ficheId, ...(cond?.params ?? []));
  return row !== undefined;
}

/**
 * The adventure a report names, as this reader sees it (AD-124 (4)): its id and title only when the
 * reader reads that adventure; `{supprimee: true}` for a GM (outside player mode) when the id matches
 * no sheet at all; nothing otherwise — a closed adventure, a deleted one, a sheet of another
 * universe or of another type are the same answer for a player, and no title leaves by any other way.
 */
export interface CampagneVue {
  campagneId?: number;
  campagneNom?: string;
  campagneSupprimee?: true;
}

export function aventureLue(db: Db, role: Role, acteur: Acteur, universId: number, id: number): { id: number; titre: string } | null {
  const f = db.prepare('SELECT id, titre, type, univers_id FROM fiches WHERE id = ?').get(id) as
    | { id: number; titre: string; type: string; univers_id: number }
    | undefined;
  if (!f || f.type !== 'aventure' || f.univers_id !== universId) return null;
  return peutVoirFiche(db, role, f.id, acteur) ? { id: f.id, titre: f.titre } : null;
}

export function campagneDuCompteRendu(
  db: Db,
  role: Role,
  acteur: Acteur,
  universId: number,
  campagneId: unknown,
): CampagneVue {
  if (typeof campagneId !== 'number' || !Number.isSafeInteger(campagneId)) return {};
  const a = aventureLue(db, role, acteur, universId, campagneId);
  if (a) return { campagneId: a.id, campagneNom: a.titre };
  if (vueMJ(role, acteur) && !db.prepare('SELECT 1 FROM fiches WHERE id = ?').get(campagneId)) {
    return { campagneSupprimee: true };
  }
  return {};
}

/** Write rights come from the audience (AD-19); the GM always writes (AD-18). */
export function peutEcrireSection(role: Role, s: SectionRow, compteId: number): boolean {
  if (role === 'mj') return true;
  // A section that holds a GM block (`contenu_public` differs, AD-114) is never written by a non-GM.
  if (s.contenu_public !== s.contenu) return false;
  return s.joueurs_ecrivent === 1 || (s.auteur_id === compteId && s.auteur_ecrit === 1);
}

export function audienceDe(s: SectionRow): Audience {
  return {
    joueursLisent: s.joueurs_lisent === 1,
    joueursEcrivent: s.joueurs_ecrivent === 1,
    auteurId: s.auteur_id,
    auteurLit: s.auteur_lit === 1,
    auteurEcrit: s.auteur_ecrit === 1,
  };
}

/**
 * The copies a universe holds of elements of its system (AD-surcharge-2): `{original → copie}` for the given ids.
 * A base held short of migration 0053 has no column and no copy.
 */
export function copiesDeUnivers(db: Db, universId: number, originalIds: number[]): Map<number, number> {
  const copies = new Map<number, number>();
  if (originalIds.length === 0) return copies;
  let lignes: { id: number; surcharge_de: number }[];
  try {
    lignes = db
      .prepare(
        `SELECT id, surcharge_de FROM fiches
          WHERE univers_id = ? AND surcharge_de IN (SELECT value FROM json_each(?))`,
      )
      .all(universId, JSON.stringify(originalIds)) as { id: number; surcharge_de: number }[];
  } catch {
    return copies;
  }
  for (const l of lignes) copies.set(l.surcharge_de, l.id);
  return copies;
}

/**
 * The resolver of the `[[…]]` links of a text for one reader (AD-116, AD-96): one query for all the
 * links, the rendering decided by the target — a readable sheet is a link, an unreadable one is text,
 * a vanished one (`casse`) or a waiting key (`attente`) is marked for the GM outside player mode only.
 * Undefined when the text holds no link (the renderer then has nothing to ask).
 */
export function resolveurLiens(
  db: Db,
  universId: number,
  role: Role,
  acteur: Acteur,
  source: string,
): ResolveurLiens | undefined {
  if (!source.includes('[[')) return undefined;
  const trouves = extraireLiens(source).filter((l) => l.texte !== null);
  if (trouves.length === 0) return undefined;
  const ids = [...new Set(trouves.flatMap((l) => (l.id !== null ? [l.id] : [])))];
  const cles = [...new Set(trouves.flatMap((l) => (l.cle !== null ? [l.cle] : [])))];
  const lisible = sqlFicheLisible(role, acteur, 'f');
  const lignes = db
    .prepare(
      `SELECT f.id, f.type, f.cle, ${lisible ? `(${lisible.sql})` : '1'} AS lisible
         FROM fiches f
        WHERE f.univers_id = ?
          AND (f.id IN (${ids.map(() => '?').join(',')}) OR f.cle IN (${cles.map(() => '?').join(',')}))`,
    )
    .all(...(lisible?.params ?? []), universId, ...ids, ...cles) as {
    id: number;
    type: string;
    cle: string | null;
    lisible: number;
  }[];
  const parId = new Map(lignes.map((l) => [l.id, l]));
  // A link written on an element of the system reads as the universe's copy of it (AD-surcharge-2): the copy is
  // read at the reader's right like any sheet of the universe; the link keeps the id it was written with.
  const absents = ids.filter((i) => !parId.has(i));
  const copies = copiesDeUnivers(db, universId, absents);
  if (copies.size > 0) {
    const ciblees = db
      .prepare(
        `SELECT f.id, f.type, f.cle, ${lisible ? `(${lisible.sql})` : '1'} AS lisible
           FROM fiches f WHERE f.univers_id = ? AND f.id IN (SELECT value FROM json_each(?))`,
      )
      .all(...(lisible?.params ?? []), universId, JSON.stringify([...copies.values()])) as {
      id: number;
      type: string;
      cle: string | null;
      lisible: number;
    }[];
    const parCopie = new Map(ciblees.map((l) => [l.id, l]));
    for (const [original, copie] of copies) {
      const l = parCopie.get(copie);
      if (l) parId.set(original, l);
    }
  }
  const parCle = new Map(lignes.flatMap((l) => (l.cle !== null ? [[l.cle, l] as const] : [])));
  // An element of the attached system without a copy here reads as itself, at the account's right on the system
  // (AD-157): the link keeps its id, the universe's address opens it (`lireFiche`).
  const restants = ids.filter((i) => !parId.has(i));
  if (restants.length > 0) {
    const u = db.prepare('SELECT * FROM univers WHERE id = ?').get(universId) as { systeme_id?: number | null } | undefined;
    const droit = u?.systeme_id != null ? lectureSysteme(db, acteur.compteId, u.systeme_id) : null;
    if (droit) {
      const lisibleSys = sqlFicheLisible(droit.role, { compteId: acteur.compteId }, 'f');
      const elements = db
        .prepare(
          `SELECT f.id, f.type, f.cle, ${lisibleSys ? `(${lisibleSys.sql})` : '1'} AS lisible
             FROM fiches f WHERE f.univers_id = ? AND f.id IN (SELECT value FROM json_each(?))`,
        )
        .all(...(lisibleSys?.params ?? []), droit.espaceId, JSON.stringify(restants)) as {
        id: number;
        type: string;
        cle: string | null;
        lisible: number;
      }[];
      for (const l of elements) parId.set(l.id, l);
    }
  }
  const marques = vueMJ(role, acteur);
  return (cible) => {
    const f = cible.id !== null ? parId.get(cible.id) : parCle.get(cible.cle ?? '');
    if (f) {
      return f.lisible === 1
        ? { genre: 'fiche', id: f.id, type: f.type, href: `/univers/${universId}/fiche/${f.id}` }
        : { genre: 'texte' };
    }
    if (!marques) return { genre: 'texte' };
    return cible.id !== null ? { genre: 'casse' } : { genre: 'attente', cle: cible.cle ?? '' };
  };
}

/**
 * The rendered text of a section for a reader (AD-96, AD-114 5): the GM outside player mode reads the
 * whole source with the block container, everyone else the public text, links resolved for them.
 * `markdown` is the form the assistant receives for a readable link.
 */
export function rendreSection(
  db: Db,
  universId: number,
  role: Role,
  s: SectionRow,
  acteur: Acteur,
  formeLiens: 'html' | 'markdown' = 'html',
): string {
  const lecteurMJ = vueMJ(role, acteur);
  const source = lecteurMJ ? s.contenu : s.contenu_public;
  return rendreMarkdown(source, {
    nature: lecteurMJ ? 'section' : 'scenario',
    reglagesImage: true,
    liens: resolveurLiens(db, universId, role, acteur, source),
    fichiers: resolveurFichiers(db, universId, role, acteur, source),
    fichiersEnAttente: resolveurFichiersEnAttente(role, acteur),
    formeLiens,
  });
}

/** The view of a section for a caller who may read it. */
export function vueSection(
  db: Db,
  universId: number,
  role: Role,
  s: SectionRow,
  acteur: Acteur,
  formeLiens: 'html' | 'markdown' = 'html',
): SectionVue {
  // Player mode is a read view: it never shows a write right the player lacks as a non-author.
  // A managed section is written by its tool only (AD-127): nobody edits it here, so no source in the view.
  const peutEcrire = estGeree(s)
    ? false
    : acteur.modeJoueur
      ? peutEcrireSection('joueur', s, -1)
      : peutEcrireSection(role, s, acteur.compteId);
  const lecteurMJ = vueMJ(role, acteur);
  const vue: SectionVue = {
    id: s.id,
    titre: s.titre,
    ordre: s.ordre,
    // Reader's view (AD-96, AD-114 5): the GM outside player mode reads the whole source with the
    // block container, everyone else reads the public text, where no container can exist.
    html: rendreSection(db, universId, role, s, acteur, formeLiens),
    version: s.version,
    modifieLe: s.modifie_le,
    peutEcrire,
  };
  if (peutEcrire || (estGeree(s) && formeLiens === 'markdown')) vue.contenu = lecteurMJ ? s.contenu : s.contenu_public; // the source goes only to who may write it (AD-113)
  if (lecteurMJ) {
    vue.audience = audienceDe(s);
    vue.cle = s.cle;
  }
  const geree = etatGere(db, acteur, universId, s);
  if (geree) vue.geree = geree;
  return vue;
}

export { ErreurService };
