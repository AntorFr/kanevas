import type { Readable } from 'node:stream';

import { attachmentsDir } from '../config/env.js';
import type { Db } from '../db/db.js';
import { cleValide } from './import.js';
import type { Jeton } from './jetons.js';
import { lireLot, noterDansLot, type EntreeRapport, type Issue } from './lots.js';
import {
  exigerRole,
  peutEcrireSection,
  peutLireSection,
  peutVoirFiche,
  roleDe,
  sqlFicheLisible,
  sqlSectionLisible,
  vueMJ,
} from './droits.js';
import {
  FICHIER_RESERVE,
  IMAGE_RESERVEE,
  contenuPublic,
  extraireClesFichier,
  extraireReferencesFichier,
  reecrireClesFichier,
} from './markdown.js';
import type { RenduFichier, ResolveurFichiers, ResolveurFichiersEnAttente } from './markdown.js';
import { poserContenu } from './sections.js';
import { TYPES_IMAGE, compterReferences, estImage, lisiblePar } from './fichiers-lecture.js';
export { lisiblePar, resolveurFichiers, resolveurFichiersEnAttente } from './fichiers-lecture.js';
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

export interface ResultatFichierImport {
  id: number;
  etat: 'creee' | 'mise_a_jour' | 'inchangee';
  avertissements: string[];
}

/**
 * Ensures an imported library file (AD-104, B-48). Unlike an interactive upload, the import
 * explicitly chooses its visibility. The origin key, never the name, identifies the file.
 * Bytes, metadata and batch outcome are committed together; an unchanged upload keeps its disk token.
 */
export async function assurerFichier(
  db: Db,
  jeton: Jeton,
  lotId: number | null,
  cle: string,
  entree: { nom: unknown; visibilite?: unknown; flux: FluxEntrant | null },
  maintenant: Date = new Date(),
  racine: string = attachmentsDir,
): Promise<ResultatFichierImport> {
  const acteur = { compteId: jeton.compteId };
  const autoriserImport = () => {
    exigerMJReel(db, jeton.universId, acteur);
    if (lotId !== null && lireLot(db, jeton, lotId, maintenant).closLe !== null) {
      throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
    }
  };
  autoriserImport();
  const invalider = (champ: string, raison: string): never => {
    throw new ErreurService('invalide', raison, undefined, champ);
  };
  let temporaire: string | null = null;
  let nouveauDisque: string | null = null;
  let ancienDisque: string | null = null;
  let valide = false;
  try {
    if (!cleValide(cle)) invalider('cle', "Clé d'origine invalide.");
    if (typeof entree.nom !== 'string') invalider('nom', 'Nom du fichier manquant.');
    const nom = nomPropre(entree.nom as string);
    const visibilite = entree.visibilite ?? 'joueurs';
    if (visibilite !== 'joueurs' && visibilite !== 'mj') {
      invalider('visibilite', 'La visibilité doit être « joueurs » ou « mj ».');
    }
    if (!entree.flux) invalider('fichier', 'Champ « fichier » manquant.');
    const ecrit = await ecrireFlux(entree.flux!, racine);
    temporaire = ecrit.temporaire;
    if (ecrit.taille === 0) invalider('fichier', 'fichier vide : 0 octet, refusé');
    const type = typeParSignature(ecrit.debut);
    const resultat = db.transaction((): ResultatFichierImport => {
      // Uploading yields to other requests: check the role and the batch again before writing.
      autoriserImport();
      const courant = db.prepare('SELECT * FROM fichiers WHERE univers_id = ? AND cle_origine = ?')
        .get(jeton.universId, cle) as (FichierRow & { dernier_import: string | null }) | undefined;
      const avertissements: string[] = [];
      let id: number;
      let etat: ResultatFichierImport['etat'];
      if (!courant) {
        nouveauDisque = promouvoir(ecrit.temporaire, racine);
        const info = db.prepare(
          `INSERT INTO fichiers (univers_id, nom, type, taille, disque, empreinte, visibilite,
             cle_origine, ajoute_par, ajoute_le, dernier_import) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(jeton.universId, nom, type, ecrit.taille, nouveauDisque, ecrit.empreinte, visibilite,
          cle, jeton.compteId, maintenant.toISOString(), JSON.stringify({ nom, visibilite }));
        id = Number(info.lastInsertRowid);
        etat = 'creee';
        // The sheets that waited for this key now point at the file, in this transaction (AD-111).
        avertissements.push(...resoudreFichierEnAttente(db, jeton.universId, cle, { id, type }));
      } else {
        id = courant.id;
        const marque = courant.dernier_import
          ? JSON.parse(courant.dernier_import) as { nom?: string; visibilite?: Visibilite }
          : {};
        const noms = courant.nom === nom || marque.nom === courant.nom;
        const visibilites = courant.visibilite === visibilite || marque.visibilite === courant.visibilite;
        const nomEcrit = noms ? nom : courant.nom;
        const visibiliteEcrite = visibilites ? visibilite as Visibilite : courant.visibilite;
        if (noms) marque.nom = nom;
        else avertissements.push('nom modifié dans Kanevas : non écrasé');
        if (visibilites) marque.visibilite = visibilite as Visibilite;
        else avertissements.push('visibilité modifiée dans Kanevas : non écrasée');
        const octetsChanges = courant.empreinte !== ecrit.empreinte;
        if (octetsChanges) {
          nouveauDisque = promouvoir(ecrit.temporaire, racine);
          ancienDisque = courant.disque;
        }
        const change = octetsChanges || nomEcrit !== courant.nom || visibiliteEcrite !== courant.visibilite;
        const json = JSON.stringify(marque);
        if (change || json !== courant.dernier_import) {
          db.prepare(`UPDATE fichiers SET nom = ?, visibilite = ?, type = ?, taille = ?, disque = ?,
            empreinte = ?, dernier_import = ? WHERE id = ?`)
            .run(nomEcrit, visibiliteEcrite, type, ecrit.taille, nouveauDisque ?? courant.disque,
              ecrit.empreinte, json, id);
        }
        etat = change ? 'mise_a_jour' : 'inchangee';
      }
      if (lotId !== null) {
        const issues: Record<ResultatFichierImport['etat'], Issue> = {
          creee: 'creees', mise_a_jour: 'mises_a_jour', inchangee: 'inchangees',
        };
        const rapport: EntreeRapport[] = avertissements.map((raison) => ({
          cle, objet: 'fichier', raison, gravite: 'avertissement',
        }));
        noterDansLot(db, lotId, 'fichiers', issues[etat], rapport, maintenant);
      }
      return { id, etat, avertissements };
    })();
    valide = true;
    if (ancienDisque) supprimerFichier(ancienDisque, racine);
    return resultat;
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'invalide') {
      const erreur = e.champ ? e : new ErreurService('invalide', e.message, undefined, 'nom');
      if (lotId !== null) {
        noterDansLot(db, lotId, 'fichiers', 'refusees', [
          { cle, objet: 'fichier', raison: erreur.message, gravite: 'refus' },
        ], maintenant);
      }
      throw erreur;
    }
    throw e;
  } finally {
    if (temporaire) await abandonner(temporaire, racine);
    if (!valide && nouveauDisque) supprimerFichier(nouveauDisque, racine);
  }
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
}

function autoriser(db: Db, acteur: Acteur, universId: number, cible: CibleFichier): Decision {
  const role = exigerRole(db, universId, acteur.compteId);
  switch (cible.ou) {
    case 'mediatheque':
      if (role !== 'mj') throw refuse();
      return { visibilite: 'joueurs' };
    case 'illustration': {
      exigerMJDeFiche(db, universId, acteur, cible.ficheId);
      // Visible of the players when at least one section of the sheet is read by them (AD-111).
      const lue = db
        .prepare('SELECT 1 AS ok FROM sections WHERE fiche_id = ? AND joueurs_lisent = 1 LIMIT 1')
        .get(cible.ficheId);
      return { visibilite: lue ? 'joueurs' : 'mj' };
    }
    case 'section': {
      const { s } = contexteSection(db, acteur, universId, null, cible.sectionId);
      exigerEcritureSection(role, s, acteur);
      if (cible.dansBlocMj && !vueMJ(role, acteur)) {
        throw refuse('Seul le MJ peut ajouter un fichier dans un bloc MJ.');
      }
      if (cible.maniere === 'joint') exigerPlace(db, role, acteur, s.id);
      // The place decides, never the client: a GM block, or a section the players do not all read.
      return { visibilite: cible.dansBlocMj || s.joueurs_lisent !== 1 ? 'mj' : 'joueurs' };
    }
  }
}

/** Where a deposit would land: the sheet and section titles an event names (AD-89). */
export interface CibleDepot {
  ficheId: number;
  titreFiche: string;
  titreSection: string;
}

/**
 * Checks, without writing anything, that the caller may join a file to this section of this universe:
 * unknown or unreadable → not found; readable but not writable → refused; full → the limit refusal.
 * Lets the assistant refuse before spending the image engine (AD-44, AD-89).
 */
export function verifierDepot(db: Db, acteur: Acteur, universId: number, sectionId: number): CibleDepot {
  const { role, s } = contexteSection(db, acteur, universId, null, sectionId);
  exigerEcritureSection(role, s, acteur);
  exigerPlace(db, role, acteur, s.id);
  const f = db.prepare('SELECT id, titre FROM fiches WHERE id = ?').get(s.fiche_id) as { id: number; titre: string };
  return { ficheId: f.id, titreFiche: f.titre, titreSection: s.titre };
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
 * go in one transaction, the bytes after the commit. `fichier:<id>` references in texts stay.
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

export type TriFichiers = 'recent' | 'nom';

export interface FiltresFichiers {
  nature?: 'images' | 'documents';
  visibilite?: Visibilite;
  usage?: 'utilises' | 'non_utilises';
  /** Part of the name, without case. */
  q?: string;
  tri?: TriFichiers;
  /** Cursor returned as `suite` by the previous page. */
  apres?: number | string;
}

function decoderCurseurNom(apres: number | string | undefined): { n: string; i: number } | null {
  if (apres === undefined) return null;
  try {
    const c = JSON.parse(Buffer.from(String(apres), 'base64url').toString('utf8')) as { n: string; i: number };
    if (typeof c.n !== 'string' || !Number.isInteger(c.i)) throw new Error();
    return c;
  } catch {
    throw invalide('Le curseur est invalide.');
  }
}

/**
 * The files of the library the caller reads, 100 per page, newest first or by name. Every file goes
 * through the one read rule; « used » is computed on the usages the caller reads (D1), never on all of
 * them. `suite` is the cursor of the next page, or null at the end; `total` is the number of files
 * the caller reads in the library, whatever the filters.
 */
export function listerFichiers(
  db: Db,
  acteur: Acteur,
  universId: number,
  filtres: FiltresFichiers = {},
): { fichiers: FichierVue[]; suite: number | string | null; total: number } {
  const role = exigerRole(db, universId, acteur.compteId);
  const tri = filtres.tri ?? 'recent';
  if (tri !== 'recent' && tri !== 'nom') throw invalide('Le tri est « recent » ou « nom ».');
  const where = ['univers_id = ?'];
  const params: (string | number)[] = [universId];
  if (filtres.nature !== undefined) {
    if (filtres.nature !== 'images' && filtres.nature !== 'documents') throw invalide('La nature est « images » ou « documents ».');
    where.push(
      `type ${filtres.nature === 'images' ? 'IN' : 'NOT IN'} (${TYPES_IMAGE.map(() => '?').join(',')})`,
    );
    params.push(...TYPES_IMAGE);
  }
  if (filtres.visibilite !== undefined) {
    if (filtres.visibilite !== 'joueurs' && filtres.visibilite !== 'mj') throw invalide('La visibilité est « joueurs » ou « mj ».');
    where.push('visibilite = ?');
    params.push(filtres.visibilite);
  }
  if (filtres.usage !== undefined && filtres.usage !== 'utilises' && filtres.usage !== 'non_utilises') {
    throw invalide('L’usage est « utilises » ou « non_utilises ».');
  }
  const q = filtres.q?.trim().toLocaleLowerCase();
  let curseur: { n: string; i: number } | number | null = null;
  if (tri === 'nom') curseur = decoderCurseurNom(filtres.apres);
  else if (filtres.apres !== undefined) {
    const n = Number(filtres.apres);
    if (!Number.isSafeInteger(n) || n < 1) throw invalide('Le curseur est invalide.');
    curseur = n;
  }
  const lus: FichierRow[] = [];
  const requete = (c: typeof curseur) => {
    const w = [...where];
    const p = [...params];
    if (c !== null && typeof c === 'object') {
      w.push('(nom COLLATE NOCASE > ? OR (nom COLLATE NOCASE = ? AND id > ?))');
      p.push(c.n, c.n, c.i);
    } else if (c !== null) {
      w.push('id < ?');
      p.push(c);
    }
    const ordre = tri === 'nom' ? 'nom COLLATE NOCASE, id' : 'id DESC';
    return db.prepare(`SELECT * FROM fichiers WHERE ${w.join(' AND ')} ORDER BY ${ordre} LIMIT 200`).all(...p) as FichierRow[];
  };
  let fini = false;
  while (!fini && lus.length <= LIMITE_FICHIERS) {
    const lot = requete(curseur);
    for (const f of lot) {
      curseur = tri === 'nom' ? { n: f.nom, i: f.id } : f.id;
      if (!lisiblePar(role, acteur, f)) continue;
      if (q && !f.nom.toLocaleLowerCase().includes(q)) continue;
      if (filtres.usage !== undefined) {
        const employe = usagesLisibles(db, acteur, role, universId, f.id).length > 0;
        if (employe !== (filtres.usage === 'utilises')) continue;
      }
      lus.push(f);
      if (lus.length > LIMITE_FICHIERS) break;
    }
    if (lot.length < 200) fini = true;
  }
  const page100 = lus.slice(0, LIMITE_FICHIERS);
  const dernier = page100[page100.length - 1];
  let suite: number | string | null = null;
  if (lus.length > LIMITE_FICHIERS && dernier) {
    suite = tri === 'nom' ? Buffer.from(JSON.stringify({ n: dernier.nom, i: dernier.id })).toString('base64url') : dernier.id;
  }
  // The library the caller reads, filters aside: counted under the one read rule, never a count of what is closed.
  const total = (db.prepare('SELECT visibilite, ajoute_par FROM fichiers WHERE univers_id = ?').all(universId) as Pick<
    FichierRow,
    'visibilite' | 'ajoute_par'
  >[]).filter((f) => lisiblePar(role, acteur, f)).length;
  return { fichiers: page100.map(vue), suite, total };
}

/** One place where a file serves, as the reader may see it (AD-117 §2, D1). */
export interface UsageFichier {
  ficheId: number;
  ficheTitre: string;
  ficheType: string;
  /** The file is the illustration of the sheet. */
  illustration: boolean;
  sectionId: number | null;
  sectionTitre: string | null;
  dansTexte: boolean;
  joint: boolean;
  /** The line the interface prints: « Sheet — « Section » » (+ « (jointe) »). */
  libelle: string;
}

function libelleUsage(u: Omit<UsageFichier, 'libelle'>): string {
  if (u.illustration) return `${u.ficheTitre} (illustration)`;
  return `${u.ficheTitre} — « ${u.sectionTitre} »${u.joint && !u.dansTexte ? ' (jointe)' : ''}`;
}

/**
 * The usages of a file the reader may read, computed per request under both guards: the sheet
 * (illustration) or the section read, and for anyone but the GM no use inside a `:::mj` block. A file
 * only cited in a GM block has no usage for a player.
 */
function usagesLisibles(db: Db, acteur: Acteur, role: Role, universId: number, fichierId: number): UsageFichier[] {
  const sorties: Omit<UsageFichier, 'libelle'>[] = [];
  const ficheLue = sqlFicheLisible(role, acteur, 'f');
  const illustrations = db
    .prepare(
      `SELECT f.id, f.titre, f.type FROM fiches f
        WHERE f.univers_id = ? AND f.illustration_fichier_id = ?${ficheLue ? ` AND ${ficheLue.sql}` : ''}`,
    )
    .all(universId, fichierId, ...(ficheLue?.params ?? [])) as { id: number; titre: string; type: string }[];
  for (const f of illustrations) {
    sorties.push({
      ficheId: f.id,
      ficheTitre: f.titre,
      ficheType: f.type,
      illustration: true,
      sectionId: null,
      sectionTitre: null,
      dansTexte: false,
      joint: false,
    });
  }
  const sectionLue = sqlSectionLisible(role, acteur, 's');
  const mj = vueMJ(role, acteur);
  const lignes = db
    .prepare(
      `SELECT s.id AS sid, s.titre AS stitre, s.ordre, fi.id AS fid, fi.titre AS ftitre, fi.type AS ftype,
              fs.joint, fs.dans_texte AS texte,
              s.contenu_public AS public_texte
         FROM fichiers_sections fs
         JOIN sections s ON s.id = fs.section_id
         JOIN fiches fi ON fi.id = s.fiche_id
        WHERE fs.fichier_id = ? AND fi.univers_id = ?${sectionLue ? ` AND ${sectionLue.sql}` : ''}
        ORDER BY s.ordre`,
    )
    .all(fichierId, universId, ...(sectionLue?.params ?? [])) as {
    sid: number;
    stitre: string;
    fid: number;
    ftitre: string;
    ftype: string;
    joint: number;
    texte: number;
    public_texte: string;
  }[];
  for (const l of lignes) {
    const dansTexte = l.texte === 1 && (mj || extraireReferencesFichier(l.public_texte ?? '').includes(fichierId));
    if (!dansTexte && l.joint !== 1) continue;
    sorties.push({
      ficheId: l.fid,
      ficheTitre: l.ftitre,
      ficheType: l.ftype,
      illustration: false,
      sectionId: l.sid,
      sectionTitre: l.stitre,
      dansTexte,
      joint: l.joint === 1,
    });
  }
  return sorties
    .map((u, i) => ({ u, i }))
    .sort(
      (a, b) =>
        a.u.ficheTitre.localeCompare(b.u.ficheTitre, 'fr', { sensitivity: 'base' }) ||
        a.u.ficheId - b.u.ficheId ||
        Number(b.u.illustration) - Number(a.u.illustration) ||
        a.i - b.i,
    )
    .map(({ u }) => ({ ...u, libelle: libelleUsage(u) }));
}

export const USAGES_PAR_PAGE = 10;

export interface DetailFichier {
  fichier: FichierVue & { ajouteParNom: string; cleOrigine?: string };
  usages: UsageFichier[];
  /** Usages that follow this page, for this reader. */
  restantes: number;
}

/**
 * The panel of a file (E-19): the file under the read rule, then its usages the reader reads — 10, and
 * with `apresUsage` all those after the first ones. No count of what is hidden, ever.
 */
export function detailFichier(
  db: Db,
  acteur: Acteur,
  universId: number,
  fichierId: number,
  apresUsage = 0,
): DetailFichier {
  const f = fichierVisible(db, acteur, universId, fichierId);
  const role = exigerRole(db, universId, acteur.compteId);
  const tous = usagesLisibles(db, acteur, role, universId, f.id);
  const debut = Math.max(0, Math.trunc(apresUsage));
  const usages = debut === 0 ? tous.slice(0, USAGES_PAR_PAGE) : tous.slice(debut);
  const par = db.prepare('SELECT username FROM comptes WHERE id = ?').get(f.ajoute_par) as { username: string } | undefined;
  const fichier: DetailFichier['fichier'] = { ...vue(f), ajouteParNom: par?.username ?? '' };
  if (vueMJ(role, acteur) && f.cle_origine) fichier.cleOrigine = f.cle_origine;
  return { fichier, usages, restantes: Math.max(0, tous.length - debut - usages.length) };
}

/**
 * What the GM would take from the readers by closing or deleting a file (E-19). `reserver`: the usages
 * the players read today; `supprimer`: every usage. The caller's real GM rights, never player mode; a
 * file they cannot read does not exist, a reader who is not GM is refused.
 */
export function impactFichier(
  db: Db,
  acteur: Acteur,
  universId: number,
  fichierId: number,
  action: string,
): { usages: UsageFichier[] } {
  if (action !== 'reserver' && action !== 'supprimer') throw invalide('L’action est « reserver » ou « supprimer ».');
  const reel: Acteur = { compteId: acteur.compteId };
  const f = fichierVisible(db, reel, universId, fichierId);
  exigerMJReel(db, universId, reel);
  if (action === 'supprimer') return { usages: usagesLisibles(db, reel, 'mj', universId, f.id) };
  // Seen as a player who authors nothing: what the players of the table read.
  if (f.visibilite === 'mj') return { usages: [] };
  return { usages: usagesLisibles(db, { compteId: acteur.compteId, modeJoueur: true }, 'mj', universId, f.id) };
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

/** The files joined to a section the caller already reads, oldest first; one closed to the caller comes back as a closed line. */
export function lireLignes(db: Db, acteur: Acteur, universId: number, role: Role, sectionId: number): PieceJointeVue[] {
  const rows = db
    .prepare(
      `SELECT f.* FROM fichiers_sections fs JOIN fichiers f ON f.id = fs.fichier_id
        WHERE fs.section_id = ? AND fs.joint = 1 AND f.univers_id = ? ORDER BY fs.rowid`,
    )
    .all(sectionId, universId) as FichierRow[];
  const mj = vueMJ(role, acteur);
  const lignes = rows.map((f) => {
    if (!lisiblePar(role, acteur, f)) {
      // Closed to this reader: the line stays, with the sentence only — no name, size or address.
      return { id: f.id, nom: estImage(f.type) ? IMAGE_RESERVEE : FICHIER_RESERVE, taille: 0, image: false, ferme: true };
    }
    const p: PieceJointeVue = { id: f.id, nom: f.nom, taille: f.taille, image: estImage(f.type) };
    if (mj) p.secrete = f.visibilite === 'mj';
    return p;
  });
  if (!mj) return lignes;
  // The files the import named and has not delivered yet: a line for the GM only, never counted (E-9).
  const attente = db
    .prepare("SELECT cle FROM fichiers_attente WHERE section_id = ? AND maniere = 'joint' ORDER BY id")
    .all(sectionId) as { cle: string }[];
  attente.forEach((a, i) =>
    lignes.push({ id: -(i + 1), nom: `Fichier en attente d'import : « ${a.cle} ».`, taille: 0, image: false, attente: a.cle }),
  );
  return lignes;
}

/**
 * Recomputes `dans_texte` and `dans_bloc_mj` of a section from its text (AD-117 §1), in the
 * transaction that writes the content — called only by the single content writer of `sections.ts`.
 * A file cited by a `fichier:<id>` image or link of the same universe is in the text; it is in a GM block when it is
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
  // The keys the text still carries wait for their file (AD-111): one row per section and key.
  db.prepare("DELETE FROM fichiers_attente WHERE section_id = ? AND maniere = 'texte'").run(sectionId);
  const cles = new Set(extraireClesFichier(contenu));
  if (cles.size > 0) {
    const { univers_id: universId } = db
      .prepare('SELECT fi.univers_id FROM sections s JOIN fiches fi ON fi.id = s.fiche_id WHERE s.id = ?')
      .get(sectionId) as { univers_id: number };
    for (const cle of cles) if (!fichierDeCle(db, universId, cle)) noterAttente(db, universId, cle, { sectionId, maniere: 'texte' });
  }
}

/** The file of an origin key in a universe, if the import has delivered it. */
export function fichierDeCle(db: Db, universId: number, cle: string): FichierRow | undefined {
  return db.prepare('SELECT * FROM fichiers WHERE univers_id = ? AND cle_origine = ?').get(universId, cle) as
    | FichierRow
    | undefined;
}

/**
 * The text as it is stored (AD-111): `fichier:cle:<clé>` whose file the universe knows, and the author reads,
 * becomes `fichier:<id>`; an unknown key stays as written, waiting. Pure of any write.
 */
export function preparerFichiers(db: Db, universId: number, compteId: number, contenu: string): string {
  if (!contenu.includes('fichier:cle:')) return contenu;
  const role = roleDe(db, universId, compteId);
  return reecrireClesFichier(contenu, (cle) => {
    const f = fichierDeCle(db, universId, cle);
    return f && role !== null && lisiblePar(role, { compteId }, f) ? f.id : null;
  });
}

type CibleAttente = { sectionId: number; maniere: 'texte' | 'joint' } | { ficheId: number; maniere: 'illustration' };

/** Records that a section or a sheet waits for the file of `cle`; once per place (the UNIQUE ignores NULLs). */
export function noterAttente(db: Db, universId: number, cle: string, cible: CibleAttente): void {
  const section = 'sectionId' in cible ? cible.sectionId : null;
  const fiche = 'ficheId' in cible ? cible.ficheId : null;
  const deja = db
    .prepare(
      `SELECT 1 AS ok FROM fichiers_attente WHERE univers_id = ? AND cle = ? AND maniere = ?
         AND section_id IS ? AND fiche_id IS ?`,
    )
    .get(universId, cle, cible.maniere, section, fiche);
  if (deja) return;
  db.prepare(
    'INSERT INTO fichiers_attente (univers_id, cle, section_id, fiche_id, maniere) VALUES (?, ?, ?, ?, ?)',
  ).run(universId, cle, section, fiche, cible.maniere);
}

/** The sheet no longer waits for any illustration (it has one, or none is wanted). */
export function oublierAttenteIllustration(db: Db, ficheId: number): void {
  db.prepare("DELETE FROM fichiers_attente WHERE fiche_id = ? AND maniere = 'illustration'").run(ficheId);
}

/** References still waiting for their file in a universe: what a batch reports at its closing. */
export function compterFichiersEnAttente(db: Db, universId: number): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM fichiers_attente WHERE univers_id = ?').get(universId) as { n: number }).n;
}

/** The ids of the files joined to a section. */
export function jointsDe(db: Db, sectionId: number): number[] {
  return (
    db.prepare('SELECT fichier_id AS id FROM fichiers_sections WHERE section_id = ? AND joint = 1').all(sectionId) as {
      id: number;
    }[]
  ).map((r) => r.id);
}

/** The import joins a file to a section, within the 100 files limit; false when the section is full. */
export function joindreParImport(db: Db, sectionId: number, fichierId: number): boolean {
  if (nombreJoints(db, sectionId) >= MAX_FICHIERS_JOINTS) return false;
  poserJointure(db, fichierId, sectionId);
  return true;
}

const lireJsonObjet = (brut: string | null): Record<string, unknown> =>
  brut === null ? {} : (JSON.parse(brut) as Record<string, unknown>);

/**
 * The file of `cle` has just arrived (AD-111, AD-104): the texts that carried its key get `fichier:<id>`, the
 * joined references and the illustration that waited are set, and the rows go — all in the caller's
 * transaction, with neither `version`, nor `version_importee`, nor `modifie_le` moving. Returns the warnings.
 */
export function resoudreFichierEnAttente(
  db: Db,
  universId: number,
  cle: string,
  fichier: { id: number; type: string },
): string[] {
  const lignes = db
    .prepare('SELECT id, section_id, fiche_id, maniere FROM fichiers_attente WHERE univers_id = ? AND cle = ? ORDER BY id')
    .all(universId, cle) as { id: number; section_id: number | null; fiche_id: number | null; maniere: string }[];
  const avertissements: string[] = [];
  const supprimer = db.prepare('DELETE FROM fichiers_attente WHERE id = ?');
  const textes = new Set(lignes.filter((l) => l.maniere === 'texte').map((l) => l.section_id!));
  for (const sid of textes) {
    const { contenu } = db.prepare('SELECT contenu FROM sections WHERE id = ?').get(sid) as { contenu: string };
    const neuf = reecrireClesFichier(contenu, (k) => (k === cle ? fichier.id : null));
    if (neuf !== contenu) poserContenu(db, sid, neuf, null);
    recalculerFichiersSection(db, sid, neuf, contenuPublic(neuf));
  }
  for (const l of lignes) {
    if (l.maniere === 'texte') {
      supprimer.run(l.id);
    } else if (l.maniere === 'joint') {
      const s = db.prepare('SELECT titre, dernier_import FROM sections WHERE id = ?').get(l.section_id) as
        | { titre: string; dernier_import: string | null }
        | undefined;
      if (!s) continue;
      if (!joindreParImport(db, l.section_id!, fichier.id)) {
        avertissements.push(`section « ${s.titre} » : ${MAX_FICHIERS_JOINTS} fichiers joints au plus, « ${cle} » reste en attente`);
        continue;
      }
      const marque = lireJsonObjet(s.dernier_import);
      const fichiers = (marque.fichiers ?? { ecrits: [] }) as { ecrits: number[] };
      if (!fichiers.ecrits.includes(fichier.id)) fichiers.ecrits.push(fichier.id);
      marque.fichiers = fichiers;
      db.prepare('UPDATE sections SET dernier_import = ? WHERE id = ?').run(JSON.stringify(marque), l.section_id);
      supprimer.run(l.id);
    } else {
      supprimer.run(l.id);
      const f = db.prepare('SELECT illustration_fichier_id AS ill, dernier_import FROM fiches WHERE id = ?').get(l.fiche_id) as
        | { ill: number | null; dernier_import: string | null }
        | undefined;
      if (!f) continue;
      if (!estImage(fichier.type)) {
        avertissements.push(`« ${cle} » n'est pas une image : illustration non posée`);
      } else if (f.ill !== null) {
        avertissements.push(`illustration modifiée dans Kanevas : « ${cle} » non posée`);
      } else {
        db.prepare('UPDATE fiches SET illustration_fichier_id = ? WHERE id = ?').run(fichier.id, l.fiche_id);
        const marque = lireJsonObjet(f.dernier_import);
        marque.illustration = { demande: cle, ecrit: fichier.id };
        db.prepare('UPDATE fiches SET dernier_import = ? WHERE id = ?').run(JSON.stringify(marque), l.fiche_id);
      }
    }
  }
  return avertissements;
}

/** The key an illustration waits for, shown to a GM outside player mode only (E-9); null when none. */
export function illustrationEnAttente(db: Db, ficheId: number): string | null {
  const r = db
    .prepare("SELECT cle FROM fichiers_attente WHERE fiche_id = ? AND maniere = 'illustration'")
    .get(ficheId) as { cle: string } | undefined;
  return r?.cle ?? null;
}

