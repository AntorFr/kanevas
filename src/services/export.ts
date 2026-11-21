import { ouvrirLecture, type Db } from '../db/db.js';
import { listerCartesApi, type CarteApi } from './cartes.js';
import { listerFichiersApi, type FichierApi } from './fichiers.js';
import { parcourirFichesApi, type FicheApi } from './lecture-api.js';
import { introuvable } from './erreurs.js';
import type { Acteur } from './types.js';

/**
 * The lines of the export of a universe (B-92, AD-148, AD-export-1): a header, the sheets, the files, the maps,
 * a closing line. Every line is the read form the read services already give (rights of both guards, import
 * form, fingerprints) — no visibility rule is written here. All of it is read from one snapshot: a dedicated
 * read connection on the same WAL file, `BEGIN` before the first row, closed at the end, on `return()` of the
 * generator or on error; the write connection of the application is never held.
 */

export interface OptionsExport {
  /** ISO date: only the sheets whose `modifie_le` is at least this are written (files and maps are always all listed). */
  depuis?: string;
  /** The fingerprint list alone: a sheet line has no header field, section or relation. */
  empreintes?: boolean;
}

export interface LigneEntete {
  type: 'entete';
  univers: string;
  cle: string;
  genere_le: string;
  depuis: string | null;
  fiches: number;
  fichiers: number;
  cartes: number;
}

export type LigneEmpreinte = {
  type: 'fiche';
  id: number;
  cle: string | null;
  empreinte: string;
  empreinte_entete: string;
  modifie_le: string;
};

export type LigneFiche = ({ type: 'fiche' } & FicheApi) | LigneEmpreinte;
export type LigneFichier = { type: 'fichier' } & FichierApi;
export type LigneCarte = { type: 'carte' } & CarteApi;
export interface LigneFin {
  type: 'fin';
  /** The lines written before this one, the header included. */
  lignes: number;
}
export type LigneExport = LigneEntete | LigneFiche | LigneFichier | LigneCarte | LigneFin;

/** Every page of a list function, in id order. */
async function toutes<T extends { id: number }, K extends string>(
  page: (apres: string | undefined) => Promise<{ suivant: number | null } & Record<K, T[]>>,
  cle: K,
): Promise<T[]> {
  const lignes: T[] = [];
  for (let apres: string | undefined, suite = true; suite; ) {
    const p = await page(apres);
    lignes.push(...p[cle]);
    suite = p.suivant !== null;
    apres = String(p.suivant);
  }
  return lignes;
}

function ligneFiche(f: FicheApi, empreintes: boolean): LigneFiche {
  if (!empreintes) return { type: 'fiche', ...f };
  return { type: 'fiche', id: f.id, cle: f.cle, empreinte: f.empreinte, empreinte_entete: f.empreinteEntete, modifie_le: f.modifieLe };
}

export async function* exporterUnivers(
  base: Db,
  acteur: Acteur,
  universId: number,
  options: OptionsExport = {},
): AsyncGenerator<LigneExport, void, undefined> {
  const empreintes = options.empreintes === true;
  // `:memory:` (tests) has no second connection: the base is read on the application's, the sheets in one synchronous pass.
  const separee = base.name !== ':memory:';
  const lecture = separee ? ouvrirLecture(base.name) : base;
  try {
    const univers = lecture.prepare('SELECT nom, cle FROM univers WHERE id = ?').get(universId) as
      | { nom: string; cle: string }
      | undefined;
    if (univers === undefined) throw introuvable();
    const parcours = parcourirFichesApi(lecture, acteur, universId, options.depuis);
    // Without a second connection nothing may separate the reading of the sheets from the first row: take them now.
    const enMemoire = separee ? null : [...parcours.fiches()];
    const fichiers = await toutes((apres) => listerFichiersApi(lecture, acteur, universId, apres), 'fichiers');
    const cartes = await toutes((apres) => listerCartesApi(lecture, acteur.compteId, universId, apres), 'cartes');

    let ecrites = 0;
    yield {
      type: 'entete',
      univers: univers.nom,
      cle: univers.cle,
      genere_le: new Date().toISOString(),
      depuis: options.depuis ?? null,
      fiches: parcours.compte,
      fichiers: fichiers.length,
      cartes: cartes.length,
    };
    ecrites++;
    for (const f of enMemoire ?? parcours.fiches()) {
      yield ligneFiche(f, empreintes);
      ecrites++;
    }
    for (const f of fichiers) {
      yield { type: 'fichier', ...f };
      ecrites++;
    }
    for (const c of cartes) {
      yield { type: 'carte', ...c };
      ecrites++;
    }
    yield { type: 'fin', lignes: ecrites };
  } finally {
    if (separee && lecture.open) lecture.close();
  }
}
