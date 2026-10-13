import type { Readable } from 'node:stream';

import { attachmentsDir } from '../config/env.js';
import type { Db } from '../db/db.js';
import { peutEcrireSection, peutLireSection, roleDe, vueMJ } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import {
  abandonner,
  ecrireFlux,
  lireFichier,
  promouvoir,
  supprimerFichier,
} from './stockage.js';
import type { Acteur, PieceJointeVue, Role, SectionRow } from './types.js';

/** At most this many attachments per section (docs/donnees.md). */
export const MAX_PIECES_PAR_SECTION = 50;
const MAX_NOM = 200;

interface PieceRow {
  id: number;
  section_id: number;
  nom: string;
  type: string;
  taille: number;
  fichier: string;
  secrete: number;
  cree_le: string;
}

/** The section, its universe and the caller's role there; no role or no section → not found. */
function contexte(db: Db, compteId: number, sectionId: number): { s: SectionRow; role: Role } {
  const s = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId) as
    | SectionRow
    | undefined;
  if (!s) throw introuvable();
  const { univers_id } = db
    .prepare('SELECT univers_id FROM fiches WHERE id = ?')
    .get(s.fiche_id) as { univers_id: number };
  const role = roleDe(db, univers_id, compteId);
  if (!role) throw introuvable();
  return { s, role };
}

/**
 * Who writes, who reads. Player mode (AD-39) reads as a player who authors
 * nothing, and — here — also writes only where players write.
 */
function droits(role: Role, s: SectionRow, acteur: Acteur) {
  const mj = vueMJ(role, acteur);
  return {
    mj,
    lit: peutLireSection(role, s, acteur),
    ecrit: acteur.modeJoueur
      ? peutEcrireSection('joueur', s, -1)
      : peutEcrireSection(role, s, acteur.compteId),
  };
}

/** A section the caller does not read does not exist for them; one they read but may not write is refused. */
function exigerEcriture(role: Role, s: SectionRow, acteur: Acteur): { mj: boolean } {
  const d = droits(role, s, acteur);
  if (!d.lit) throw introuvable();
  if (!d.ecrit) throw refuse('Vous ne pouvez pas modifier cette section.');
  return d;
}

function nombre(db: Db, sectionId: number): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM pieces_jointes WHERE section_id = ?').get(sectionId) as {
      n: number;
    }
  ).n;
}

function exigerPlace(db: Db, sectionId: number): void {
  if (nombre(db, sectionId) >= MAX_PIECES_PAR_SECTION) {
    throw new ErreurService(
      'invalide',
      // Neutral: the number would tell a player what they must not know (AD-67); the screen words it by role.
      "Cette section ne peut pas recevoir d'autre fichier.",
      'limite_pieces',
    );
  }
}

/** Where a deposit would land: the sheet and section titles an event names (AD-89). */
export interface CibleDepot {
  ficheId: number;
  titreFiche: string;
  titreSection: string;
}

/**
 * Checks, without writing anything, that the account may attach a file to this section of this
 * universe: unknown, foreign or unreadable → not found; readable but not writable → refused;
 * full → the limit refusal. Lets a caller refuse before spending a costly step (AD-44, AD-89).
 */
export function verifierDepot(
  db: Db,
  compteId: number,
  universId: number,
  sectionId: number,
): CibleDepot {
  const { s, role } = contexte(db, compteId, sectionId);
  const f = db
    .prepare('SELECT id, titre, univers_id FROM fiches WHERE id = ?')
    .get(s.fiche_id) as { id: number; titre: string; univers_id: number };
  if (f.univers_id !== universId) throw introuvable();
  exigerEcriture(role, s, { compteId });
  exigerPlace(db, sectionId);
  return { ficheId: f.id, titreFiche: f.titre, titreSection: s.titre };
}


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

function vuePiece(p: PieceRow, avecSecrete: boolean): PieceJointeVue {
  const v: PieceJointeVue = {
    id: p.id,
    nom: p.nom,
    taille: p.taille,
    image: p.type.startsWith('image/'),
  };
  if (avecSecrete) v.secrete = p.secrete === 1;
  return v;
}

/**
 * The one upload function (AD-65). Write rights are checked before the stream
 * is read, then again inside the transaction that writes the row. Nothing is
 * left behind on a refusal: no row, no file, nothing in `tmp/`.
 */
export async function deposerPieceJointe(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  sectionId: number,
  flux: Readable | AsyncIterable<Buffer | Uint8Array>,
  nom: string,
  secrete: boolean,
  racine: string = attachmentsDir,
): Promise<PieceJointeVue> {
  const acteur: Acteur = { compteId, modeJoueur };
  const nomPropre = nom.trim();
  if (nomPropre.length < 1 || nomPropre.length > MAX_NOM) {
    throw invalide(`Le nom du fichier : de 1 à ${MAX_NOM} caractères.`);
  }
  const verifier = () => {
    const { s, role } = contexte(db, compteId, sectionId);
    const d = exigerEcriture(role, s, acteur);
    // Only the GM, outside player mode, sets "secrète" (B-24).
    if (secrete && !d.mj) throw refuse('Seul le MJ peut marquer une pièce secrète.');
    exigerPlace(db, sectionId);
  };
  verifier();
  const ecrit = await ecrireFlux(flux, racine);
  let fichier: string | null = null;
  try {
    if (ecrit.taille === 0) {
      throw new ErreurService('invalide', 'Le fichier est vide.', 'fichier_vide');
    }
    const type = typeParSignature(ecrit.debut);
    const id = db.transaction(() => {
      verifier();
      fichier = promouvoir(ecrit.temporaire, racine);
      const info = db
        .prepare(
          `INSERT INTO pieces_jointes (section_id, nom, type, taille, fichier, secrete, cree_le)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(sectionId, nomPropre, type, ecrit.taille, fichier, secrete ? 1 : 0, new Date().toISOString());
      return Number(info.lastInsertRowid);
    })();
    return vuePiece(
      db.prepare('SELECT * FROM pieces_jointes WHERE id = ?').get(id) as PieceRow,
      true,
    );
  } catch (e) {
    await abandonner(ecrit.temporaire, racine);
    if (fichier) supprimerFichier(fichier, racine);
    throw e;
  }
}

/** A piece the caller may see (a secret one is invisible to a non-GM), with its section. */
function pieceVisible(db: Db, acteur: Acteur, pieceId: number) {
  const p = db.prepare('SELECT * FROM pieces_jointes WHERE id = ?').get(pieceId) as
    | PieceRow
    | undefined;
  if (!p) throw introuvable();
  const { s, role } = contexte(db, acteur.compteId, p.section_id);
  const d = droits(role, s, acteur);
  if (!d.lit || (p.secrete === 1 && !d.mj)) throw introuvable();
  return { p, s, role, d };
}

/** The GM (outside player mode) marks or lifts "secrète"; the section's version is untouched. */
export function marquerSecrete(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  pieceId: number,
  secrete: boolean,
): PieceJointeVue {
  const acteur: Acteur = { compteId, modeJoueur };
  return db.transaction(() => {
    const { p, d } = pieceVisible(db, acteur, pieceId);
    if (!d.mj) throw refuse('Seul le MJ peut marquer une pièce secrète.');
    db.prepare('UPDATE pieces_jointes SET secrete = ? WHERE id = ?').run(secrete ? 1 : 0, p.id);
    return vuePiece({ ...p, secrete: secrete ? 1 : 0 }, true);
  })();
}

/** Removes the row, then the file (AD-65): who writes the section may. */
export async function retirerPieceJointe(
  db: Db,
  compteId: number,
  modeJoueur: boolean,
  pieceId: number,
  racine: string = attachmentsDir,
): Promise<void> {
  const acteur: Acteur = { compteId, modeJoueur };
  const fichier = db.transaction(() => {
    const { p, s, role } = pieceVisible(db, acteur, pieceId);
    exigerEcriture(role, s, acteur);
    db.prepare('DELETE FROM pieces_jointes WHERE id = ?').run(p.id);
    return p.fichier;
  })();
  supprimerFichier(fichier, racine);
}

/** The attachments of a section the caller reads; `secrete` is shown to the GM outside player mode only. */
export function piecesDeSection(db: Db, acteur: Acteur, sectionId: number): PieceJointeVue[] {
  const { s, role } = contexte(db, acteur.compteId, sectionId);
  const d = droits(role, s, acteur);
  if (!d.lit) throw introuvable();
  return lireLignes(db, sectionId, d.mj);
}

/** Same, for a section already known readable by `d.mj` view (used by sheet reads). */
export function lireLignes(db: Db, sectionId: number, mj: boolean): PieceJointeVue[] {
  const rows = db
    .prepare(
      `SELECT * FROM pieces_jointes WHERE section_id = ? ${mj ? '' : 'AND secrete = 0'} ORDER BY id`,
    )
    .all(sectionId) as PieceRow[];
  return rows.map((p) => vuePiece(p, mj));
}

/** Opens a file under the same read rules; no mode parameter beyond the actor's. */
export async function ouvrirPieceJointe(
  db: Db,
  acteur: Acteur,
  pieceId: number,
  racine: string = attachmentsDir,
): Promise<{ flux: Readable; nom: string; type: string; taille: number }> {
  const { p } = pieceVisible(db, acteur, pieceId);
  const f = await lireFichier(p.fichier, racine);
  if (!f) throw introuvable();
  return { flux: f.flux, nom: p.nom, type: p.type, taille: f.taille };
}

/** Files of every attachment of the given sections (to delete after the rows are gone). */
export function fichiersDeSections(db: Db, sectionIds: number[]): string[] {
  const out: string[] = [];
  const q = db.prepare('SELECT fichier FROM pieces_jointes WHERE section_id = ?');
  for (const id of sectionIds) out.push(...(q.all(id) as { fichier: string }[]).map((r) => r.fichier));
  return out;
}
