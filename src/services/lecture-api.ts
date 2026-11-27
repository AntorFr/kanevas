import type { Db } from '../db/db.js';
import { extraireLiens, reecrireLiens } from './markdown.js';
import { audienceDe, lectureSysteme, peutLireSection, peutVoirFiche, resolveurLiens, roleDe, sqlFicheLisible, vueMJ } from './droits.js';
import {
  champsDeCharge,
  empreinteEntete,
  empreinteFiche,
  empreinteRelation,
  empreinteSection,
  type CleDe,
} from './empreintes.js';
import { resoudreFiche } from './cles.js';
import { etiquetageDe } from './etiquettes.js';
import { ErreurService, introuvable } from './erreurs.js';
import { lisiblePar } from './fichiers-lecture.js';
import type { Acteur, Audience, Role, SectionRow } from './types.js';

/**
 * Reading of a sheet in import form, with the fingerprint of each of its parts (AD-139, B-80, B-81).
 * Read only: fingerprints are computed here at each read and never stored. The rights are the token
 * owner's (AD-144): a sheet or a section the account cannot read is neither returned nor counted, a
 * relation needs both guards (AD-64), and only a GM outside player mode reads the Markdown source and
 * the keys (B-50) — anyone else gets the public text, links written with ids.
 */

/** Sheets per page of the list. */
export const PAGE_FICHES = 1000;

export interface RefFiche {
  id: number;
  /** Key of the sheet; null for a reader who is not a GM outside player mode. */
  cle: string | null;
}

export interface SectionApi {
  id: number;
  cle: string | null;
  titre: string;
  ordre: number;
  /** Markdown in import form (the public text for a reader who is not a GM). */
  contenu: string;
  /** GM outside player mode only. */
  audience?: Audience;
  fichiers: { id: number; cle: string | null }[];
  geree: boolean;
  empreinte: string;
}

export interface RelationApi {
  id: number;
  sectionId: number;
  cible: RefFiche;
  nature: string;
  qualificatif: string;
  empreinte: string;
}

export interface EnteteApi {
  titre: string;
  type: string;
  sousType: string | null;
  parent: RefFiche | null;
  alias: string[];
  etiquettes: string[];
  pj?: boolean;
  /** The fields of the payload the type registry declares. */
  charge: Record<string, unknown>;
  creeLe: string;
}

export interface FicheApi {
  id: number;
  cle: string | null;
  creeeVia: string;
  modifieLe: string;
  entete: EnteteApi;
  sections: SectionApi[];
  relations: RelationApi[];
  empreinteEntete: string;
  empreinte: string;
}

export interface LigneFicheApi {
  id: number;
  cle: string | null;
  creee_via: string;
  type: string;
  titre: string;
  empreinte: string;
  empreinte_entete: string;
  modifie_le: string;
}

export interface PageFichesApi {
  fiches: LigneFicheApi[];
  /** `?apres=` of the next page; null on the last. No total is ever given. */
  suivant: number | null;
}

interface LigneFiche {
  id: number;
  univers_id: number;
  titre: string;
  type: string;
  sous_type: string | null;
  parent_id: number | null;
  charge: string;
  cle: string;
  creee_via: string;
  cree_le: string;
  modifie_le: string;
}

interface Lecteur {
  db: Db;
  universId: number;
  role: Role;
  acteur: Acteur;
  mj: boolean;
  cleDe: CleDe;
  lisibles: Map<number, boolean>;
}

function lecteurDe(db: Db, acteur: Acteur, universId: number): Lecteur {
  const role = roleDe(db, universId, acteur.compteId);
  if (role === null) throw introuvable();
  const mj = vueMJ(role, acteur);
  const cles = new Map<number, string | null>();
  const fiche = db.prepare('SELECT cle FROM fiches WHERE id = ?');
  const fichier = db.prepare('SELECT cle_origine AS cle FROM fichiers WHERE id = ?');
  const cleDe: CleDe = (id, nature = 'fiche') => {
    if (!mj) return null;
    if (nature === 'fichier') return (fichier.get(id) as { cle: string | null } | undefined)?.cle ?? null;
    if (!cles.has(id)) cles.set(id, (fiche.get(id) as { cle: string } | undefined)?.cle ?? null);
    return cles.get(id) ?? null;
  };
  return { db, universId, role, acteur, mj, cleDe, lisibles: new Map() };
}

/**
 * The reader of the elements of the system attached to the universe (AD-155): the account's right on the system, but
 * always at player level and never in player mode — the universe's door shows the system as its readers see it. `null`
 * when no system is attached or the account reads none.
 */
function lecteurElements(db: Db, acteur: Acteur, universId: number): Lecteur | null {
  const u = db.prepare('SELECT * FROM univers WHERE id = ?').get(universId) as { systeme_id?: number | null } | undefined;
  if (!u || u.systeme_id == null) return null;
  const droit = lectureSysteme(db, acteur.compteId, u.systeme_id);
  if (!droit) return null;
  return { ...lecteurDe(db, { compteId: acteur.compteId }, droit.espaceId), role: 'joueur', mj: false, cleDe: () => null };
}

function ficheLisible(l: Lecteur, ficheId: number): boolean {
  let v = l.lisibles.get(ficheId);
  if (v === undefined) {
    v = peutVoirFiche(l.db, l.role, ficheId, l.acteur);
    l.lisibles.set(ficheId, v);
  }
  return v;
}

const ref = (l: Lecteur, id: number): RefFiche => ({ id, cle: l.cleDe(id, 'fiche') });

/** The text of a section as this reader gets it, in import form. */
function texteDe(l: Lecteur, s: SectionRow): string {
  if (l.mj) return s.contenu;
  const source = s.contenu_public;
  if (!source.includes('[[')) return source;
  const resolveur = resolveurLiens(l.db, l.universId, l.role, l.acteur, source);
  if (!resolveur) return source;
  // A link the reader may follow is written with the id; any other is its text alone (no key, no id).
  return reecrireLiens(source, extraireLiens(source), (lien) => {
    if (lien.texte === null) return null;
    const cible = resolveur(lien);
    return cible.genre === 'fiche' ? `[[${cible.id}|${lien.texte}]]` : lien.texte;
  });
}

function composer(l: Lecteur, f: LigneFiche): FicheApi | null {
  const { db } = l;
  const toutes = db.prepare('SELECT * FROM sections WHERE fiche_id = ? ORDER BY ordre, id').all(f.id) as SectionRow[];
  const lisibles = toutes.filter((s) => peutLireSection(l.role, s, l.acteur));
  if (lisibles.length === 0 && !l.mj) return null;

  const fichiersDe = db.prepare(
    `SELECT x.id, x.cle_origine AS cle, x.visibilite, x.ajoute_par FROM fichiers_sections fs
       JOIN fichiers x ON x.id = fs.fichier_id WHERE fs.section_id = ? AND fs.joint = 1 ORDER BY x.id`,
  );
  const sections: SectionApi[] = lisibles.map((s) => {
    const joints = (
      fichiersDe.all(s.id) as { id: number; cle: string | null; visibilite: 'joueurs' | 'mj'; ajoute_par: number }[]
    ).filter((x) => lisiblePar(l.role, l.acteur, x));
    const contenu = texteDe(l, s);
    const empreinte = empreinteSection(
      { ...s, contenu, fichiers: joints.map((x) => x.id) },
      l.cleDe,
    );
    return {
      id: s.id,
      cle: l.mj ? s.cle : null,
      titre: s.titre,
      ordre: s.ordre,
      contenu,
      ...(l.mj ? { audience: audienceDe(s) } : {}),
      fichiers: joints.map((x) => ({ id: x.id, cle: l.mj ? x.cle : null })),
      geree: typeof s.gere_par === 'string',
      empreinte,
    };
  });

  const parSection = new Map(lisibles.map((s) => [s.id, s]));
  const lignes = db
    .prepare(
      `SELECT r.id, r.section_id, r.cible_fiche_id, r.nature, r.qualificatif FROM relations r
         JOIN sections s ON s.id = r.section_id JOIN fiches c ON c.id = r.cible_fiche_id
        WHERE s.fiche_id = ? AND c.univers_id = ? ORDER BY s.ordre, s.id, r.id`,
    )
    .all(f.id, l.universId) as {
    id: number;
    section_id: number;
    cible_fiche_id: number;
    nature: string;
    qualificatif: string;
  }[];
  const relations: RelationApi[] = [];
  for (const r of lignes) {
    const s = parSection.get(r.section_id);
    if (s === undefined || !ficheLisible(l, r.cible_fiche_id)) continue;
    relations.push({
      id: r.id,
      sectionId: r.section_id,
      cible: ref(l, r.cible_fiche_id),
      nature: r.nature,
      qualificatif: r.qualificatif,
      empreinte: empreinteRelation(
        { sectionCle: s.cle, cibleId: r.cible_fiche_id, nature: r.nature, qualificatif: r.qualificatif },
        l.cleDe,
      ),
    });
  }

  const { alias, etiquettes } = etiquetageDe(db, f.id);
  const brute = JSON.parse(f.charge) as Record<string, unknown>;
  const charge: Record<string, unknown> = {};
  for (const k of champsDeCharge(f.type)) {
    // A report's adventure leaves the API only for a reader of it (AD-124): a GM reads the id, no one else.
    if (k === 'campagne_id' && !l.mj) continue;
    if (brute[k] !== undefined) charge[k] = brute[k];
  }
  const parentId = f.parent_id !== null && ficheLisible(l, f.parent_id) ? f.parent_id : null;
  const empreinteEnt = empreinteEntete(
    {
      titre: f.titre,
      type: f.type,
      sousType: f.sous_type,
      parentId: f.parent_id === null ? null : parentId ?? -1,
      alias,
      etiquettes,
      charge,
      creeLe: f.cree_le,
    },
    (id, nature) => (id === -1 ? null : l.cleDe(id, nature)),
  );
  const entete: EnteteApi = {
    titre: f.titre,
    type: f.type,
    sousType: f.sous_type,
    parent: parentId === null ? null : ref(l, parentId),
    alias,
    etiquettes,
    ...(f.type === 'personnage' ? { pj: brute.pj === true } : {}),
    charge,
    creeLe: f.cree_le,
  };
  return {
    id: f.id,
    cle: l.mj ? f.cle : null,
    creeeVia: f.creee_via,
    modifieLe: f.modifie_le,
    entete,
    sections,
    relations,
    empreinteEntete: empreinteEnt,
    empreinte: empreinteFiche(
      empreinteEnt,
      sections.map((s) => s.empreinte),
      // A relation is a set: its fingerprints are sorted, so a relation put back under a new id moves nothing.
      relations.map((r) => r.empreinte).sort(),
    ),
  };
}

/**
 * One sheet in import form. `ref`: its key, a former key (the sheet is then returned under its current
 * key) or an id (digits only, AD-146). A sheet the account does not read, unknown or of another
 * universe is the same `introuvable`.
 */
export function lireFicheApi(db: Db, acteur: Acteur, universId: number, reference: string): FicheApi {
  const l = lecteurDe(db, acteur, universId);
  const res = resoudreFiche(db, universId, reference);
  if (res === null) {
    // An element of the attached system, by id only (its key is the space's, which a universe address does not resolve).
    const e = /^\d+$/.test(reference) ? lecteurElements(db, acteur, universId) : null;
    const el = e === null ? undefined : (db.prepare('SELECT * FROM fiches WHERE id = ? AND univers_id = ?').get(Number(reference), e.universId) as LigneFiche | undefined);
    const vue = e === null || el === undefined ? null : composer(e, el);
    if (vue === null) throw introuvable();
    return vue;
  }
  const f = db.prepare('SELECT * FROM fiches WHERE id = ? AND univers_id = ?').get(res.id, universId) as
    | LigneFiche
    | undefined;
  const fiche = f === undefined ? null : composer(l, f);
  if (fiche === null) throw introuvable();
  return fiche;
}

/** `?depuis`: an ISO date or date-time, read as UTC without an offset; anything else is `invalide` (`champ: depuis`). */
export function depuisIso(depuis: string): string {
  const forme = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(depuis);
  const t = forme === null ? NaN : Date.parse(depuis.length > 10 && forme[1] === undefined ? `${depuis.replace(' ', 'T')}Z` : depuis);
  if (Number.isNaN(t)) throw new ErreurService('invalide', '« depuis » doit être une date ISO 8601.', undefined, 'depuis');
  return new Date(t).toISOString();
}

/**
 * The sheets of the universe the account reads, `PAGE_FICHES` at a time in the order of the id
 * (`apres` is the last id of the previous page). `depuis` filters on the date of the last write, it
 * does not order: a sheet modified between two calls is neither returned twice nor lost.
 */
export function listerFichesApi(
  db: Db,
  acteur: Acteur,
  universId: number,
  options: { depuis?: string; apres?: number } = {},
): PageFichesApi {
  const l = lecteurDe(db, acteur, universId);
  const depuis = options.depuis === undefined ? null : depuisIso(options.depuis);
  const apres = options.apres ?? 0;
  if (!Number.isInteger(apres) || apres < 0) {
    throw new ErreurService('invalide', '« apres » doit être un identifiant.', undefined, 'apres');
  }
  const e = lecteurElements(db, acteur, universId);
  const cond = sqlFicheLisible(l.role, l.acteur, 'f');
  const condE = e === null ? null : sqlFicheLisible(e.role, e.acteur, 'f');
  const propres = `(f.univers_id = ?${cond ? ` AND ${cond.sql}` : ''})`;
  const deSysteme = e === null ? '' : ` OR (f.univers_id = ?${condE ? ` AND ${condE.sql}` : ''})`;
  const stmt = db.prepare(
    `SELECT f.* FROM fiches f
      WHERE (${propres}${deSysteme}) AND f.id > ?${depuis === null ? '' : ' AND f.modifie_le > ?'}
      ORDER BY f.id`,
  );
  const params = [
    universId, ...(cond?.params ?? []),
    ...(e === null ? [] : [e.universId, ...(condE?.params ?? [])]),
    apres, ...(depuis === null ? [] : [depuis]),
  ];
  const lignes: LigneFicheApi[] = [];
  let suivant: number | null = null;
  for (const f of stmt.iterate(...params) as Iterable<LigneFiche>) {
    if (lignes.length === PAGE_FICHES) {
      suivant = lignes[lignes.length - 1]!.id;
      break;
    }
    const c = composer(e !== null && f.univers_id === e.universId ? e : l, f);
    if (c === null) continue;
    lignes.push({
      id: c.id,
      cle: c.cle,
      creee_via: c.creeeVia,
      type: c.entete.type,
      titre: c.entete.titre,
      empreinte: c.empreinte,
      empreinte_entete: c.empreinteEntete,
      modifie_le: c.modifieLe,
    });
  }
  return { fiches: lignes, suivant };
}

/**
 * The sheets of the universe the account reads whose `modifie_le` is at or after `depuis` (all of them without it), in id
 * order, each in import form — the one read form of `lireFicheApi` (AD-export-1). `>=` and not `>`: a false alarm is allowed,
 * a miss never. The role is read once; the rights are those of `composer`.
 */
export function parcourirFichesApi(
  db: Db,
  acteur: Acteur,
  universId: number,
  depuis?: string,
): { compte: number; fiches: () => Generator<FicheApi> } {
  const l = lecteurDe(db, acteur, universId);
  const borne = depuis === undefined ? null : depuisIso(depuis);
  const cond = sqlFicheLisible(l.role, l.acteur, 'f');
  const stmt = db.prepare(
    `SELECT f.* FROM fiches f
      WHERE f.univers_id = ?${borne === null ? '' : ' AND f.modifie_le >= ?'}${cond ? ` AND ${cond.sql}` : ''}
      ORDER BY f.id`,
  );
  const params = [universId, ...(borne === null ? [] : [borne]), ...(cond?.params ?? [])];
  const aUneSectionLisible = db.prepare('SELECT * FROM sections WHERE fiche_id = ?');
  const compte = () => {
    let n = 0;
    for (const f of stmt.iterate(...params) as Iterable<LigneFiche>) {
      if (l.mj || (aUneSectionLisible.all(f.id) as SectionRow[]).some((s) => peutLireSection(l.role, s, l.acteur))) n++;
    }
    return n;
  };
  return {
    compte: compte(),
    *fiches() {
      for (const f of stmt.iterate(...params) as Iterable<LigneFiche>) {
        const c = composer(l, f);
        if (c !== null) yield c;
      }
    },
  };
}
