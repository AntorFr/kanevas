import type { Readable } from 'node:stream';

import { attachmentsDir } from '../config/env.js';
import type { Db } from '../db/db.js';
import { exigerRole, peutEcrireSection, peutLireSection, peutVoirFiche, roleDe, vueMJ } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import {
  abandonner,
  ecrireFlux,
  lireFichier,
  promouvoir,
  supprimerFichier,
} from './stockage.js';
import type { Acteur, PieceJointeVue, Role, SectionRow } from './types.js';

/**
 * The media library of a universe (AD-111, AD-117): the one place that writes `fichiers`,
 * `fichiers_sections` and `fiches.illustration_fichier_id`. Routes, the seed and the assistant
 * call these functions; none of them carries SQL on these tables (AD-2).
 */

/** At most this many files joined to one section (AD-117 §2 bis). */
export const MAX_FICHIERS_JOINTS = 100;
/** Page size of the library list (AD-117 §3). */
export const LIMITE_FICHIERS = 100;
const MAX_NOM = 200;

const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export type Visibilite = 'joueurs' | 'mj';

export interface FichierRow {
  id: number;
  univers_id: number;
  nom: string;
  type: string;
  taille: number;
  disque: string;
  empreinte: string | null;
  visibilite: Visibilite;
  cle_origine: string | null;
  ajoute_par: number;
  ajoute_le: string;
}

export interface FichierVue {
  id: number;
  nom: string;
  type: string;
  taille: number;
  image: boolean;
  visibilite: Visibilite;
  ajoutePar: number;
  ajouteLe: string;
  /** Name on the disk: the cache token of the bytes route (`?v=`, AD-93). */
  jeton: string;
  /** Only for a text insertion: the reference the editor inserts. */
  reference?: string;
}

/** Where a file is added from (AD-117 §1). The visibility is never part of it. */
export type CibleFichier =
  | { ou: 'mediatheque' }
  | { ou: 'section'; sectionId: number; maniere: 'joint' | 'texte'; dansBlocMj?: boolean }
  | { ou: 'illustration'; ficheId: number };

export type FluxEntrant = Readable | AsyncIterable<Buffer | Uint8Array>;

/**
 * Type of the file from its first bytes, never from what the client says
 * (AD-66): four image formats, everything else is an opaque download.
 */
export function typeParSignature(debut: Buffer): string {
  const b = debut;
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')))
    return 'image/gif';
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return 'application/octet-stream';
}

const estImage = (type: string) => TYPES_IMAGE.includes(type);

function vue(f: FichierRow): FichierVue {
  return {
    id: f.id,
    nom: f.nom,
    type: f.type,
    taille: f.taille,
    image: estImage(f.type),
    visibilite: f.visibilite,
    ajoutePar: f.ajoute_par,
    ajouteLe: f.ajoute_le,
    jeton: f.disque,
  };
}

/** The role-aware core of the one read rule; `fichierLisible` is its public door. */
function lisiblePar(role: Role | null, acteur: Acteur, f: Pick<FichierRow, 'visibilite' | 'ajoute_par'>): boolean {
  if (role === null) return false;
  if (vueMJ(role, acteur)) return true;
  return f.visibilite === 'joueurs' || f.ajoute_par === acteur.compteId;
}

/**
 * THE read rule of a file (AD-117 §2): the GM outside player mode reads every file; anyone else a
 * `joueurs` file or one they added themselves. The bytes route, the list, the panels and the
 * sheet's view all call it — a second `WHERE` written by hand is a defect.
 */
export function fichierLisible(
  db: Db,
  acteur: Acteur,
  f: Pick<FichierRow, 'univers_id' | 'visibilite' | 'ajoute_par'>,
): boolean {
  return lisiblePar(roleDe(db, f.univers_id, acteur.compteId), acteur, f);
}

function chargerFichier(db: Db, universId: number, fichierId: number): FichierRow {
  const f = db
    .prepare('SELECT * FROM fichiers WHERE id = ? AND univers_id = ?')
    .get(fichierId, universId) as FichierRow | undefined;
  if (!f) throw introuvable();
  return f;
}

/** A file the caller reads, else it does not exist for them. */
function fichierVisible(db: Db, acteur: Acteur, universId: number, fichierId: number): FichierRow {
  exigerRole(db, universId, acteur.compteId);
  const f = chargerFichier(db, universId, fichierId);
  if (!fichierLisible(db, acteur, f)) throw introuvable();
  return f;
}

function exigerMJReel(db: Db, universId: number, acteur: Acteur): void {
  if (exigerRole(db, universId, acteur.compteId) !== 'mj') throw refuse();
}

/**
 * The GM of the sheet's universe, for an illustration (AD-93): an unknown or invisible sheet is not found
 * (same answer for both), a visible one is refused to who is not GM. Real rights, never the player mode.
 */
function exigerMJDeFiche(db: Db, universId: number, acteur: Acteur, ficheId: number): void {
  const role = exigerRole(db, universId, acteur.compteId);
  const f = db.prepare('SELECT 1 AS ok FROM fiches WHERE id = ? AND univers_id = ?').get(ficheId, universId);
  if (!f || !peutVoirFiche(db, role, ficheId, { compteId: acteur.compteId })) throw introuvable();
  if (role !== 'mj') throw refuse();
}

/** The section of this sheet of this universe with the caller's role, or not found. */
function contexteSection(db: Db, acteur: Acteur, universId: number, ficheId: number | null, sectionId: number) {
  const role = exigerRole(db, universId, acteur.compteId);
  const s = db
    .prepare(
      `SELECT s.* FROM sections s JOIN fiches f ON f.id = s.fiche_id
        WHERE s.id = ? AND f.univers_id = ?${ficheId === null ? '' : ' AND f.id = ?'}`,
    )
    .get(sectionId, universId, ...(ficheId === null ? [] : [ficheId])) as SectionRow | undefined;
  if (!s) throw introuvable();
  return { role, s };
}

/** A section the caller does not read does not exist for them; one they read but may not write is refused. */
function exigerEcritureSection(role: Role, s: SectionRow, acteur: Acteur): void {
  if (!peutLireSection(role, s, acteur)) throw introuvable();
  const ecrit = acteur.modeJoueur
    ? peutEcrireSection('joueur', s, -1)
    : peutEcrireSection(role, s, acteur.compteId);
  if (!ecrit) throw refuse('Vous ne pouvez pas modifier cette section.');
}

function nombreJoints(db: Db, sectionId: number): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM fichiers_sections WHERE section_id = ? AND joint = 1')
      .get(sectionId) as { n: number }
  ).n;
}

/** The 101st file: a conflict for the GM, a refusal without the number for anyone else (AD-117 §2 bis). */
function exigerPlace(db: Db, role: Role, acteur: Acteur, sectionId: number): void {
  if (nombreJoints(db, sectionId) < MAX_FICHIERS_JOINTS) return;
  if (vueMJ(role, acteur)) {
    throw new ErreurService('conflit', 'Cette section porte déjà 100 fichiers joints.', 'limite_pieces');
  }
  throw new ErreurService('refuse', "Cette section ne peut pas recevoir d'autre fichier.", 'limite_pieces');
}

function poserJointure(db: Db, fichierId: number, sectionId: number): void {
  db.prepare(
    `INSERT INTO fichiers_sections (fichier_id, section_id, joint) VALUES (?, ?, 1)
     ON CONFLICT (fichier_id, section_id) DO UPDATE SET joint = 1`,
  ).run(fichierId, sectionId);
}

function nomPropre(nom: string): string {
  const n = nom.trim();
  if (n.length < 1 || n.length > MAX_NOM) {
    throw invalide(`Le nom du fichier : de 1 à ${MAX_NOM} caractères.`);
  }
  return n;
}

/** What a target allows, checked before the stream is read and again in the writing transaction. */
interface Decision {
  visibilite: Visibilite;
  role: Role;
}

function autoriser(db: Db, acteur: Acteur, universId: number, cible: CibleFichier): Decision {
  const role = exigerRole(db, universId, acteur.compteId);
  switch (cible.ou) {
    case 'mediatheque':
      if (role !== 'mj') throw refuse();
      return { visibilite: 'joueurs', role };
    case 'illustration': {
      exigerMJDeFiche(db, universId, acteur, cible.ficheId);
      // Visible of the players when at least one section of the sheet is read by them (AD-111).
      const lue = db
        .prepare('SELECT 1 AS ok FROM sections WHERE fiche_id = ? AND joueurs_lisent = 1 LIMIT 1')
        .get(cible.ficheId);
      return { visibilite: lue ? 'joueurs' : 'mj', role };
    }
    case 'section': {
      const { s } = contexteSection(db, acteur, universId, null, cible.sectionId);
      exigerEcritureSection(role, s, acteur);
      if (cible.dansBlocMj && !vueMJ(role, acteur)) {
        throw refuse('Seul le MJ peut ajouter un fichier dans un bloc MJ.');
      }
      if (cible.maniere === 'joint') exigerPlace(db, role, acteur, s.id);
      // The place decides, never the client: a GM block, or a section the players do not all read.
      return { visibilite: cible.dansBlocMj || s.joueurs_lisent !== 1 ? 'mj' : 'joueurs', role };
    }
  }
}

/**
 * The one function that adds a file to the library (AD-117 §1): the file and its reference (joined,
 * for a text, or as the illustration) in a single transaction. Rights are checked before the stream
 * is read, then again in the transaction. A refusal leaves no row, no byte, no reference.
 * `acteur` may be `{compteId}` alone (the assistant, AD-117 §6).
 */
export async function ajouterFichier(
  db: Db,
  acteur: Acteur,
  universId: number,
  flux: FluxEntrant,
  nom: string,
  cible: CibleFichier,
  racine: string = attachmentsDir,
): Promise<FichierVue> {
  const propre = nomPropre(nom);
  autoriser(db, acteur, universId, cible);
  const ecrit = await ecrireFlux(flux, racine);
  let disque: string | null = null;
  try {
    if (ecrit.taille === 0) {
      throw new ErreurService('invalide', 'Le fichier est vide.', 'fichier_vide');
    }
    const type = typeParSignature(ecrit.debut);
    if (cible.ou === 'illustration' && !estImage(type)) {
      throw new ErreurService(
        'invalide',
        'Ce fichier n’est pas une image (PNG, JPEG, GIF ou WebP).',
        'pas_une_image',
      );
    }
    const id = db.transaction(() => {
      const { visibilite } = autoriser(db, acteur, universId, cible);
      disque = promouvoir(ecrit.temporaire, racine);
      const info = db
        .prepare(
          `INSERT INTO fichiers (univers_id, nom, type, taille, disque, visibilite, ajoute_par, ajoute_le)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(universId, propre, type, ecrit.taille, disque, visibilite, acteur.compteId, new Date().toISOString());
      const fichierId = Number(info.lastInsertRowid);
      if (cible.ou === 'section' && cible.maniere === 'joint') poserJointure(db, fichierId, cible.sectionId);
      if (cible.ou === 'illustration') {
        db.prepare('UPDATE fiches SET illustration_fichier_id = ? WHERE id = ?').run(fichierId, cible.ficheId);
      }
      return fichierId;
    })();
    const v = vue(chargerFichier(db, universId, id));
    if (cible.ou === 'section' && cible.maniere === 'texte') v.reference = `fichier:${id}`;
    return v;
  } catch (e) {
    await abandonner(ecrit.temporaire, racine);
    if (disque) supprimerFichier(disque, racine);
    throw e;
  }
}

/** Joins a file the caller reads to a section they write; its visibility does not change (B-55). */
export function joindreFichier(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  sectionId: number,
  fichierId: number,
): FichierVue {
  return db.transaction(() => {
    const { role, s } = contexteSection(db, acteur, universId, ficheId, sectionId);
    exigerEcritureSection(role, s, acteur);
    const f = fichierVisible(db, acteur, universId, fichierId);
    const deja = db
      .prepare('SELECT joint FROM fichiers_sections WHERE fichier_id = ? AND section_id = ?')
      .get(f.id, s.id) as { joint: number } | undefined;
    if (!deja || deja.joint === 0) {
      exigerPlace(db, role, acteur, s.id);
      poserJointure(db, f.id, s.id);
    }
    return vue(f);
  })();
}

/** Removes the reference of a joined file (the file stays in the library); who writes the section may. */
export function retirerJointure(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  sectionId: number,
  fichierId: number,
): void {
  db.transaction(() => {
    const { role, s } = contexteSection(db, acteur, universId, ficheId, sectionId);
    exigerEcritureSection(role, s, acteur);
    const ligne = db
      .prepare('SELECT joint, dans_texte FROM fichiers_sections WHERE fichier_id = ? AND section_id = ?')
      .get(fichierId, s.id) as { joint: number; dans_texte: number } | undefined;
    if (!ligne || ligne.joint === 0) throw introuvable();
    // A file the caller cannot read is not theirs to unjoin either.
    fichierVisible(db, acteur, universId, fichierId);
    if (ligne.dans_texte === 1) {
      db.prepare('UPDATE fichiers_sections SET joint = 0 WHERE fichier_id = ? AND section_id = ?').run(fichierId, s.id);
    } else {
      db.prepare('DELETE FROM fichiers_sections WHERE fichier_id = ? AND section_id = ?').run(fichierId, s.id);
    }
  })();
}

/** The GM sets an existing image of the library as the illustration of a sheet. */
export function choisirIllustration(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  fichierId: number,
): FichierVue {
  return db.transaction(() => {
    exigerMJDeFiche(db, universId, acteur, ficheId);
    const f = chargerFichier(db, universId, fichierId);
    if (!estImage(f.type)) {
      throw new ErreurService(
        'invalide',
        'Ce fichier n’est pas une image (PNG, JPEG, GIF ou WebP).',
        'pas_une_image',
      );
    }
    db.prepare('UPDATE fiches SET illustration_fichier_id = ? WHERE id = ?').run(f.id, ficheId);
    return vue(f);
  })();
}

/** Removes the illustration of a sheet (a no-op when there is none); the file stays in the library. */
export function retirerIllustration(db: Db, acteur: Acteur, universId: number, ficheId: number): void {
  db.transaction(() => {
    exigerMJDeFiche(db, universId, acteur, ficheId);
    db.prepare('UPDATE fiches SET illustration_fichier_id = NULL WHERE id = ?').run(ficheId);
  })();
}

/** The GM renames a file and/or changes its visibility. */
export function modifierFichier(
  db: Db,
  acteur: Acteur,
  universId: number,
  fichierId: number,
  changement: { nom?: string; visibilite?: string },
): FichierVue {
  return db.transaction(() => {
    exigerMJReel(db, universId, acteur);
    const f = chargerFichier(db, universId, fichierId);
    const nom = changement.nom === undefined ? f.nom : nomPropre(changement.nom);
    let visibilite = f.visibilite;
    if (changement.visibilite !== undefined) {
      if (changement.visibilite !== 'joueurs' && changement.visibilite !== 'mj') {
        throw invalide('La visibilité est « joueurs » ou « mj ».');
      }
      visibilite = changement.visibilite;
    }
    db.prepare('UPDATE fichiers SET nom = ?, visibilite = ? WHERE id = ?').run(nom, visibilite, f.id);
    return vue({ ...f, nom, visibilite });
  })();
}

/**
 * The GM deletes a file (AD-117 §5): the row, its references and the illustrations that pointed at it
 * go in one transaction, the bytes after the commit. `(fichier:<id>)` in texts stay.
 */
export function effacerFichier(
  db: Db,
  acteur: Acteur,
  universId: number,
  fichierId: number,
  racine: string = attachmentsDir,
): void {
  const disque = db.transaction(() => {
    exigerMJReel(db, universId, acteur);
    const f = chargerFichier(db, universId, fichierId);
    db.prepare('UPDATE fiches SET illustration_fichier_id = NULL WHERE illustration_fichier_id = ?').run(f.id);
    db.prepare('DELETE FROM fichiers_sections WHERE fichier_id = ?').run(f.id);
    db.prepare('DELETE FROM fichiers WHERE id = ?').run(f.id);
    return f.disque;
  })();
  supprimerFichier(disque, racine);
}

/**
 * The files of the library the caller reads, newest first, 100 per page. `apres` is the id of the
 * last file of the previous page; `suite` is the cursor of the next page, or null at the end.
 */
export function listerFichiers(
  db: Db,
  acteur: Acteur,
  universId: number,
  page: { apres?: number } = {},
): { fichiers: FichierVue[]; suite: number | null } {
  const role = exigerRole(db, universId, acteur.compteId);
  const lus: FichierRow[] = [];
  let curseur = page.apres ?? Number.MAX_SAFE_INTEGER;
  const requete = db.prepare('SELECT * FROM fichiers WHERE univers_id = ? AND id < ? ORDER BY id DESC LIMIT ?');
  let fini = false;
  while (!fini && lus.length <= LIMITE_FICHIERS) {
    const lot = requete.all(universId, curseur, 200) as FichierRow[];
    for (const f of lot) {
      curseur = f.id;
      if (lisiblePar(role, acteur, f)) lus.push(f);
      if (lus.length > LIMITE_FICHIERS) break;
    }
    if (lot.length < 200) fini = true;
  }
  const page100 = lus.slice(0, LIMITE_FICHIERS);
  const suite = lus.length > LIMITE_FICHIERS ? page100[page100.length - 1]!.id : null;
  return { fichiers: page100.map(vue), suite };
}

/** Opens the bytes of a file under the one read rule; the caller's real rights, no player mode (AD-37). */
export async function ouvrirFichier(
  db: Db,
  acteur: Acteur,
  universId: number,
  fichierId: number,
  jeton: string | undefined,
  racine: string = attachmentsDir,
): Promise<{ flux: Readable; nom: string; type: string; taille: number; courant: boolean }> {
  const f = fichierVisible(db, { compteId: acteur.compteId }, universId, fichierId);
  const o = await lireFichier(f.disque, racine);
  if (!o) throw introuvable();
  return { flux: o.flux, nom: f.nom, type: f.type, taille: o.taille, courant: jeton === f.disque };
}

/** The files joined to a section the caller already reads, those they may read, oldest first. */
export function lireLignes(db: Db, acteur: Acteur, universId: number, role: Role, sectionId: number): PieceJointeVue[] {
  const rows = db
    .prepare(
      `SELECT f.* FROM fichiers_sections fs JOIN fichiers f ON f.id = fs.fichier_id
        WHERE fs.section_id = ? AND fs.joint = 1 AND f.univers_id = ? ORDER BY fs.rowid`,
    )
    .all(sectionId, universId) as FichierRow[];
  const mj = vueMJ(role, acteur);
  return rows
    .filter((f) => lisiblePar(role, acteur, f))
    .map((f) => {
      const p: PieceJointeVue = { id: f.id, nom: f.nom, taille: f.taille, image: estImage(f.type) };
      if (mj) p.secrete = f.visibilite === 'mj';
      return p;
    });
}

const REFERENCE = /\(fichier:(\d+)\)/g;

function compterReferences(source: string): Map<number, number> {
  const n = new Map<number, number>();
  for (const m of source.matchAll(REFERENCE)) {
    const id = Number(m[1]);
    n.set(id, (n.get(id) ?? 0) + 1);
  }
  return n;
}

/**
 * Recomputes `dans_texte` and `dans_bloc_mj` of a section from its text (AD-117 §1), in the
 * transaction that writes the content — called only by the single content writer of `sections.ts`.
 * A file cited by `(fichier:<id>)` of the same universe is in the text; it is in a GM block when it is
 * cited more in the source than in the public text. A row that is no longer joined nor cited goes.
 */
export function recalculerFichiersSection(
  db: Db,
  sectionId: number,
  contenu: string,
  contenuPublic: string,
): void {
  const total = compterReferences(contenu);
  const publics = compterReferences(contenuPublic);
  const existants = new Set<number>();
  if (total.size > 0) {
    const ids = [...total.keys()];
    const rows = db
      .prepare(
        `SELECT f.id FROM fichiers f
          WHERE f.id IN (${ids.map(() => '?').join(',')})
            AND f.univers_id = (SELECT fi.univers_id FROM sections s JOIN fiches fi ON fi.id = s.fiche_id WHERE s.id = ?)`,
      )
      .all(...ids, sectionId) as { id: number }[];
    for (const r of rows) existants.add(r.id);
  }
  db.prepare('DELETE FROM fichiers_sections WHERE section_id = ? AND joint = 0').run(sectionId);
  db.prepare('UPDATE fichiers_sections SET dans_texte = 0, dans_bloc_mj = 0 WHERE section_id = ?').run(sectionId);
  const poser = db.prepare(
    `INSERT INTO fichiers_sections (fichier_id, section_id, joint, dans_texte, dans_bloc_mj)
     VALUES (?, ?, 0, 1, ?)
     ON CONFLICT (fichier_id, section_id) DO UPDATE SET dans_texte = 1, dans_bloc_mj = excluded.dans_bloc_mj`,
  );
  for (const id of existants) {
    poser.run(id, sectionId, (total.get(id) ?? 0) > (publics.get(id) ?? 0) ? 1 : 0);
  }
  db.prepare('DELETE FROM fichiers_sections WHERE section_id = ? AND joint = 0 AND dans_texte = 0').run(sectionId);
}
