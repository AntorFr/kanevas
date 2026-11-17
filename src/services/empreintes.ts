import { createHash } from 'node:crypto';

import { CHARGES, type TypeFiche } from './types-fiche.js';
import { extraireLiens, reecrireLiens, reecrireReferencesFichierEnCles } from './markdown.js';

/**
 * Fingerprints of a section and of a sheet's header (AD-139, B-105, B-106). Pure: no database, no
 * clock. The caller hands objects it has already read and a resolver `cleDe(id, nature)` giving the
 * origin key of a sheet (link target) or of a file, or null. A fingerprint is computed at each read
 * and never stored; `modifie_le` is never part of it, so a write that changes nothing changes nothing.
 */
export type CleDe = (id: number, nature?: 'fiche' | 'fichier') => string | null;

/** Canonical JSON: keys sorted at every level, no space. `undefined` members are dropped, as JSON does. */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur) ?? 'null';
  if (Array.isArray(valeur)) return `[${valeur.map((v) => jsonCanonique(v === undefined ? null : v)).join(',')}]`;
  const o = valeur as Record<string, unknown>;
  const membres = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${jsonCanonique(o[k])}`);
  return `{${membres.join(',')}}`;
}

/** SHA-256, hexadecimal, first 32 characters. */
export function empreinte(valeur: unknown): string {
  return createHash('sha256').update(jsonCanonique(valeur)).digest('hex').slice(0, 32);
}

/**
 * The text in import form: a link or a file reference whose target has an origin key is written with
 * it, otherwise with its id — so a waiting link that later resolves does not move the fingerprint.
 */
export function contenuEnFormeImport(contenu: string, cleDe: CleDe): string {
  let texte = contenu;
  if (texte.includes('[[')) {
    texte = reecrireLiens(texte, extraireLiens(texte), (l) => {
      if (l.id === null || l.texte === null) return null;
      const cle = cleDe(l.id, 'fiche');
      return cle === null ? null : `[[cle:${cle}|${l.texte}]]`;
    });
  }
  if (texte.includes('fichier:')) texte = reecrireReferencesFichierEnCles(texte, (id) => cleDe(id, 'fichier'));
  return texte;
}

/** What `empreinteSection` reads of a section: nothing that moves on its own (`modifie_le`, `version`). */
export interface SectionEmpreinte {
  cle: string;
  titre: string;
  contenu: string;
  ordre: number;
  joueurs_lisent: number | boolean;
  joueurs_ecrivent: number | boolean;
  auteur_id: number | null;
  auteur_lit: number | boolean;
  auteur_ecrit: number | boolean;
  /** `module/outil/type` of the managing tool, null for a free section. */
  gere_par: string | null;
  /** Ids of the files joined to the section (the media library rows it uses). */
  fichiers?: readonly number[];
}

const bool = (v: number | boolean): boolean => v === true || v === 1;

export function empreinteSection(section: SectionEmpreinte, cleDe: CleDe): string {
  const fichiers = (section.fichiers ?? []).map((id) => cleDe(id, 'fichier') ?? `#${id}`).sort();
  return empreinte({
    cle: section.cle,
    titre: section.titre,
    contenu: contenuEnFormeImport(section.contenu, cleDe),
    audience: {
      joueursLisent: bool(section.joueurs_lisent),
      joueursEcrivent: bool(section.joueurs_ecrivent),
      auteurId: section.auteur_id,
      auteurLit: bool(section.auteur_lit),
      auteurEcrit: bool(section.auteur_ecrit),
    },
    fichiers,
    ordre: section.ordre,
    geree: section.gere_par !== null,
  });
}

/** What `empreinteEntete` reads of a sheet: the header, with no section and no relation. */
export interface EnteteEmpreinte {
  titre: string;
  type: TypeFiche | string;
  sousType: string | null;
  /** Id of the parent sheet, null at the root. */
  parentId: number | null;
  alias: readonly string[];
  etiquettes: readonly string[];
  charge: Record<string, unknown>;
  creeLe: string;
}

/** The keys of the payload that the registry declares for the type (the schema's shape), `v` aside. */
function champsDeCharge(type: string): string[] {
  const schema = (CHARGES as Record<string, unknown>)[type] as { shape?: Record<string, unknown> } | undefined;
  return Object.keys(schema?.shape ?? {})
    .filter((k) => k !== 'v')
    .sort();
}

export function empreinteEntete(fiche: EnteteEmpreinte, cleDe: CleDe): string {
  const charge: Record<string, unknown> = {};
  for (const k of champsDeCharge(fiche.type)) charge[k] = fiche.charge[k] ?? null;
  const ensemble = (valeurs: readonly string[]) => [...new Set(valeurs)].sort();
  return empreinte({
    titre: fiche.titre,
    type: fiche.type,
    sousType: fiche.sousType,
    parent: fiche.parentId === null ? null : (cleDe(fiche.parentId, 'fiche') ?? `#${fiche.parentId}`),
    alias: ensemble(fiche.alias),
    etiquettes: ensemble(fiche.etiquettes),
    charge,
    creeLe: fiche.creeLe,
  });
}
