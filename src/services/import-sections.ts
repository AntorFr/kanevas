import type { Db } from '../db/db.js';
import { estGeree, exigerMJ, exigerRole } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import { cleValide } from './import.js';
import { estId } from './cles-forme.js';
import { resoudreFiche } from './cles.js';
import { avecContexte } from './historique.js';
import { MAX_FICHIERS_JOINTS } from './fichiers.js';
import { creerSection, majSection, type SectionEntree } from './import-fiches.js';
import type { JetonRequete as Jeton } from './jetons.js';
import { lireFicheApi } from './lecture-api.js';
import { lireLot, noterDansLot, type Issue } from './lots.js';
import { lirePrecondition, sousPrecondition, type CompteLot } from './precondition.js';
import {
  MAX_CONTENU_SECTION,
  MESSAGE_BLOC_MJ,
  MESSAGE_CONTENU_TROP_LONG,
  MESSAGE_SECTION_GEREE,
  reordonnerSections,
  retirerSection,
} from './sections.js';
import type { SectionRow } from './types.js';

/** The fields of `PUT /fiches/:cle/sections/:scle` (AD-ecriture-1). */
export const CHAMPS_SECTION = ['titre', 'contenu', 'joueursLisent', 'joueursEcrivent', 'fichiers', 'position'] as const;

/** The body of the request once its shape is checked (`undefined`: not sent, left as is). */
export interface ChampsSection {
  titre?: string;
  contenu?: string;
  joueursLisent?: boolean;
  joueursEcrivent?: boolean;
  fichiers?: string[];
  /** 1-based place among the sheet's sections. */
  position?: number;
}

export type EtatSection = 'creee' | 'mise_a_jour' | 'inchangee';

export interface ResultatSection {
  id: number;
  cle: string;
  etat: EtatSection;
  avertissements: string[];
  /** Fingerprint of the section, then of the sheet (AD-139). */
  empreinte: string;
  empreinteFiche: string;
}

const invalide = (champ: string, message: string, detail?: string) =>
  new ErreurService('invalide', message, detail, champ);

/** Checks the body (400 `invalide` with `champ`, before any transaction). An unknown field is refused. */
export function validerSection(corps: unknown): ChampsSection {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    throw invalide('corps', 'Corps de la requête : un objet est attendu.');
  }
  const c = corps as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (!(CHAMPS_SECTION as readonly string[]).includes(k)) throw invalide(k, `${k} : champ inconnu.`, 'champ_inconnu');
  }
  const champs: ChampsSection = {};
  if (c.titre !== undefined) {
    const t = typeof c.titre === 'string' ? c.titre.trim() : '';
    if (t.length < 1 || t.length > 80) throw invalide('titre', 'titre : de 1 à 80 caractères.');
    champs.titre = t;
  }
  if (c.contenu !== undefined) {
    if (typeof c.contenu !== 'string') throw invalide('contenu', 'contenu : un texte est attendu.');
    if (c.contenu.length > MAX_CONTENU_SECTION) throw invalide('contenu', MESSAGE_CONTENU_TROP_LONG);
    champs.contenu = c.contenu;
  }
  for (const k of ['joueursLisent', 'joueursEcrivent'] as const) {
    if (c[k] === undefined) continue;
    if (typeof c[k] !== 'boolean') throw invalide(k, `${k} : un booléen est attendu.`);
    champs[k] = c[k] as boolean;
  }
  if (c.fichiers !== undefined) {
    if (!Array.isArray(c.fichiers)) throw invalide('fichiers', 'fichiers : une liste de clés est attendue.');
    if (c.fichiers.length > MAX_FICHIERS_JOINTS) {
      throw invalide('fichiers', `fichiers : ${MAX_FICHIERS_JOINTS} fichiers joints au plus.`);
    }
    if (c.fichiers.some((k) => typeof k !== 'string' || !cleValide(k))) {
      throw invalide('fichiers', "fichiers : clé d'origine absente ou invalide.");
    }
    champs.fichiers = [...new Set(c.fichiers as string[])];
  }
  if (c.position !== undefined) {
    if (typeof c.position !== 'number' || !Number.isInteger(c.position) || c.position < 1) {
      throw invalide('position', 'position : un entier de 1 au plus petit est attendu.');
    }
    champs.position = c.position;
  }
  return champs;
}

function exigerLotOuvert(db: Db, jeton: Jeton, lotId: number | null, maintenant: Date): void {
  if (lotId === null) return;
  if (lireLot(db, jeton, lotId, maintenant).closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
}

const sectionGeree = () => new ErreurService('refuse', MESSAGE_SECTION_GEREE, 'section_geree', 'scle');

function ligneDe(db: Db, ficheId: number, cle: string): SectionRow | undefined {
  return db.prepare('SELECT * FROM sections WHERE fiche_id = ? AND cle = ?').get(ficheId, cle) as SectionRow | undefined;
}

/** The fingerprints of a section and of its sheet, as the account reads them (a section it cannot read is unknown). */
function empreintesDe(db: Db, compteId: number, universId: number, ficheId: number, sectionId: number) {
  const f = lireFicheApi(db, { compteId }, universId, String(ficheId));
  const s = f.sections.find((x) => x.id === sectionId);
  if (!s) throw introuvable();
  return { section: s.empreinte, fiche: f.empreinte };
}

/** The sheet addressed by key or former key (AD-146); a section never creates its sheet. */
function ficheAdressee(db: Db, universId: number, reference: string): number {
  const res = estId(reference) ? null : resoudreFiche(db, universId, reference);
  if (res === null) throw introuvable();
  return res.id;
}

const ISSUE_MAJ: Issue = 'mises_a_jour';

/** Counts a refusal that is not a stale fingerprint (that one is counted by `sousPrecondition`). */
function noterRefus(db: Db, lotId: number | null, reference: string, e: unknown, maintenant: Date): void {
  if (!(e instanceof ErreurService) || e.detail === 'empreinte_perimee' || lotId === null) return;
  noterDansLot(db, lotId, 'fiches', 'refusees', [
    { cle: reference, objet: 'section', raison: e.message, gravite: 'refus', ...(e.detail ? { code: e.detail } : {}) },
  ], maintenant);
}

/** A content refusal of the services carries no field: it is the content's. */
function surContenu<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'invalide' && !e.champ) {
      throw new ErreurService('invalide', e.message, e.detail ?? (e.message === MESSAGE_BLOC_MJ ? 'bloc_mj' : undefined), 'contenu');
    }
    throw e;
  }
}

/**
 * `PUT /fiches/:cle/sections/:scle` (B-83, AD-ecriture-1): creates the section when the key is new on the addressed
 * sheet, else rewrites the fields sent (nothing is removed by omission). Order of refusals is the contract's — body
 * shape (400), then in one transaction the sheet (404), the `If-Match` fingerprint of the section (412), the write.
 * A GM writes every field; anyone else only the content of a section its audience lets it write.
 */
export function ecrireSectionImport(
  db: Db,
  jeton: Jeton,
  lotId: number | null,
  reference: string,
  scle: string,
  corps: unknown,
  entetes: Record<string, string | string[] | undefined>,
  maintenant: Date = new Date(),
): ResultatSection {
  const { universId, compteId } = jeton;
  exigerRole(db, universId, compteId);
  exigerLotOuvert(db, jeton, lotId, maintenant);
  const compte: CompteLot = { lotId, nature: 'fiches', cle: reference, objet: 'section', maintenant };
  try {
    const precondition = lirePrecondition(entetes);
    if (!cleValide(scle)) throw invalide('scle', "clé de section : clé d'origine absente ou invalide.");
    const champs = validerSection(corps);
    let ficheId = 0;
    return sousPrecondition(
      db,
      precondition,
      compte,
      () => {
        ficheId = ficheAdressee(db, universId, reference);
        const ligne = ligneDe(db, ficheId, scle);
        // Reading the sheet first: one the account does not read is unknown, whatever the key.
        const f = lireFicheApi(db, { compteId }, universId, String(ficheId));
        if (!ligne) return null;
        return f.sections.find((x) => x.id === ligne.id)?.empreinte ?? null;
      },
      () =>
        avecContexte(db, { compteId, jetonId: jeton.id, origine: 'import', lotId }, (): ResultatSection => {
          const role = exigerRole(db, universId, compteId);
          const avertissements: string[] = [];
          const prevenir = (_objet: string, raison: string) => void avertissements.push(raison);
          let ligne = ligneDe(db, ficheId, scle);
          let etat: EtatSection;
          let ecrit = false;
          if (ligne && estGeree(ligne)) throw sectionGeree();
          if (!ligne) {
            if (role !== 'mj') throw refuse();
            if (champs.titre === undefined) throw invalide('titre', 'titre : obligatoire pour créer une section.');
            const entree: SectionEntree = { cle: scle, titre: champs.titre, ...champs, fichiers: champs.fichiers };
            surContenu(() => creerSection(db, jeton, ficheId, entree, prevenir));
            ligne = ligneDe(db, ficheId, scle)!;
            etat = 'creee';
            ecrit = true;
          } else {
            if (role !== 'mj') {
              // A player writes the text of a section it may write, and nothing else of it (B-8).
              const autre =
                (champs.titre !== undefined && champs.titre !== ligne.titre) ||
                (champs.joueursLisent !== undefined && champs.joueursLisent !== (ligne.joueurs_lisent === 1)) ||
                (champs.joueursEcrivent !== undefined && champs.joueursEcrivent !== (ligne.joueurs_ecrivent === 1)) ||
                champs.fichiers !== undefined ||
                champs.position !== undefined;
              if (autre) throw refuse();
            }
            const entree: SectionEntree = { cle: scle, titre: champs.titre ?? ligne.titre, ...champs };
            ecrit = surContenu(() => majSection(db, jeton, ficheId, ligne!, entree, prevenir));
            etat = ecrit ? 'mise_a_jour' : 'inchangee';
          }
          if (champs.position !== undefined && deplacer(db, compteId, universId, ficheId, ligne.id, champs.position)) {
            ecrit = true;
            if (etat === 'inchangee') etat = 'mise_a_jour';
          }
          if (lotId !== null) noterDansLot(db, lotId, 'fiches', etat === 'inchangee' ? 'inchangees' : ISSUE_MAJ, [], maintenant);
          const e = empreintesDe(db, compteId, universId, ficheId, ligne.id);
          return { id: ligne.id, cle: scle, etat, avertissements, empreinte: e.section, empreinteFiche: e.fiche };
        }),
    );
  } catch (e) {
    noterRefus(db, lotId, reference, e, maintenant);
    throw e;
  }
}

/** Puts the section at the 1-based place `position` (clamped to the last); true when it moved. */
function deplacer(db: Db, compteId: number, universId: number, ficheId: number, sectionId: number, position: number): boolean {
  const ids = (db.prepare('SELECT id FROM sections WHERE fiche_id = ? ORDER BY ordre, id').all(ficheId) as { id: number }[]).map(
    (r) => r.id,
  );
  const voulu = Math.min(position, ids.length) - 1;
  if (ids.indexOf(sectionId) === voulu) return false;
  const autres = ids.filter((id) => id !== sectionId);
  autres.splice(voulu, 0, sectionId);
  reordonnerSections(db, compteId, universId, ficheId, autres);
  return true;
}

/**
 * `DELETE /fiches/:cle/sections/:scle` (B-83): removes the section with its relations and its joins (the files stay
 * in the media library). A key the addressed sheet does not hold is 204 (idempotent; a key is read on that sheet
 * only); an unknown sheet is 404. A section managed by a tool is refused (403 `section_geree`).
 */
export function retirerSectionImport(
  db: Db,
  jeton: Jeton,
  lotId: number | null,
  reference: string,
  scle: string,
  entetes: Record<string, string | string[] | undefined>,
  maintenant: Date = new Date(),
): void {
  const { universId, compteId } = jeton;
  exigerMJ(db, universId, compteId);
  exigerLotOuvert(db, jeton, lotId, maintenant);
  const compte: CompteLot = { lotId, nature: 'fiches', cle: reference, objet: 'section', maintenant };
  try {
    const precondition = lirePrecondition(entetes);
    let ficheId = 0;
    sousPrecondition(
      db,
      precondition,
      compte,
      () => {
        ficheId = ficheAdressee(db, universId, reference);
        const ligne = cleValide(scle) ? ligneDe(db, ficheId, scle) : undefined;
        if (!ligne) return null;
        return empreintesDe(db, compteId, universId, ficheId, ligne.id).section;
      },
      () =>
        avecContexte(db, { compteId, jetonId: jeton.id, origine: 'import', lotId }, () => {
          const ligne = cleValide(scle) ? ligneDe(db, ficheId, scle) : undefined;
          if (!ligne) {
            if (lotId !== null) noterDansLot(db, lotId, 'fiches', 'inchangees', [], maintenant);
            return;
          }
          if (estGeree(ligne)) throw sectionGeree();
          retirerSection(db, compteId, universId, ficheId, ligne.id);
          if (lotId !== null) noterDansLot(db, lotId, 'fiches', ISSUE_MAJ, [], maintenant);
        }),
    );
  } catch (e) {
    noterRefus(db, lotId, reference, e, maintenant);
    throw e;
  }
}
