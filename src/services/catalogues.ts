import { jsonCanonique } from '../outils/catalogue-json.js';
import type { z } from 'zod';
import type { Db } from '../db/db.js';
import { applicable, type CibleCatalogue, type DeclarationCatalogue, type LigneCatalogue } from '../outils/declaration.js';
import { roleDe, vueMJ } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import { declarationOutil, exigerOutil, exigerResponsable, lireLigneOutil, lireResponsable,
  poserVersionCatalogue, type CibleOutils } from './outils.js';
import type { Acteur } from './types.js';

export interface RefusCatalogue { nature: string; cle: string; champ: string; raison: string }
export interface CompteursCatalogue { ajoutes: number; modifies: number; inchanges: number; refuses: number }
export interface RapportCatalogue {
  version: string; apercu: boolean; natures: Record<string, CompteursCatalogue>;
  remplacements: number; absents: number; refus: RefusCatalogue[]; refusTotal: number;
  versionCatalogue: string | null;
}
export type OrigineCatalogue = 'systeme' | 'univers' | 'remplace' | 'retire';
export interface ElementResolu extends LigneCatalogue { origine: OrigineCatalogue }
export interface VueElementCatalogue {
  nature: string; cle: string; nom: string; resume: string;
  origine?: OrigineCatalogue; masque?: boolean; version?: number; donnees?: Record<string, unknown>;
}
export interface PageCatalogue { elements: VueElementCatalogue[]; suivant: string | null }
export interface OptionsCatalogue { nature?: string; curseur?: string }
export interface ResumeCatalogue {
  natures: { nom: string; libelle: string; libellePluriel: string }[];
  systeme: { version: string | null; comptes: Record<string, number> };
  univers: { version: string | null; comptes: Record<string, number> };
}

/** Raw counts for the GM tools list, whose caller has already guarded the target. */
export function resumeCatalogue(db: Db, cible: CibleOutils, outil: string): ResumeCatalogue {
  const { catalogue, systemeId } = context(db, cible, outil);
  const niveau = (target: CibleOutils | null) => {
    const comptes = Object.fromEntries(catalogue.natures.map((n) => [n.nom, 0]));
    if (target) {
      for (const row of catalogue.stockage.lister(db, storageTarget(target))) comptes[row.nature]!++;
    }
    return { version: target ? lireLigneOutil(db, target, outil)?.version_catalogue ?? null : null, comptes };
  };
  return {
    natures: catalogue.natures.map(({ nom, libelle, libellePluriel }) => ({ nom, libelle, libellePluriel })),
    systeme: niveau({ niveau: 'systeme', id: systemeId }),
    univers: niveau(cible.niveau === 'univers' ? cible : null),
  };
}

/** Structured file errors are kept in the service, for both import entry points. */
export class ErreurCatalogue extends ErreurService {
  constructor(readonly cause: string, champ?: string, readonly attendu?: string, readonly recu?: unknown) {
    super('invalide', "Ce fichier n'est pas un catalogue valide.", 'catalogue_invalide', champ);
  }
}
const storageTarget = (c: CibleOutils): CibleCatalogue => c.niveau === 'systeme' ? { systemeId: c.id } : { universId: c.id };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const key = (nature: string, cle: string) => JSON.stringify([nature, cle]);
const invalid = (champ: string, detail?: string) => new ErreurService('invalide', 'Élément de catalogue invalide.', detail, champ);
function declaration(cle: string): DeclarationCatalogue {
  const catalogue = declarationOutil(cle).catalogue;
  if (!catalogue) throw introuvable();
  return catalogue;
}
function context(db: Db, cible: CibleOutils, cle: string) {
  const outil = declarationOutil(cle);
  const catalogue = declaration(cle);
  const s = cible.niveau === 'systeme'
    ? db.prepare('SELECT id, nom FROM systemes_jeu WHERE id = ?').get(cible.id)
    : db.prepare('SELECT s.id, s.nom FROM univers u JOIN systemes_jeu s ON s.id = u.systeme_id WHERE u.id = ?').get(cible.id);
  const systeme = s as { id: number; nom: string } | undefined;
  if (!systeme || !applicable(outil, systeme.nom)) throw introuvable();
  return { catalogue, systemeId: systeme.id };
}
function writeGuard(db: Db, acteur: Acteur, cible: CibleOutils, cle: string) {
  if (cible.niveau === 'systeme') exigerResponsable(db, acteur, cible.id);
  else {
    if (roleDe(db, cible.id, acteur.compteId) !== 'mj') throw introuvable();
    if (acteur.modeJoueur) throw refuse();
  }
  return context(db, cible, cle);
}
function natureOf(catalogue: DeclarationCatalogue, nom: string) {
  const nature = catalogue.natures.find((n) => n.nom === nom);
  if (!nature) throw invalid('nature');
  return nature;
}
function issueReason(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type': return issue.expected === 'number' ? 'nombre attendu'
      : issue.expected === 'int' ? 'entier attendu'
      : issue.expected === 'boolean' ? 'oui ou non attendu' : 'texte attendu';
    case 'too_small': return `au moins ${issue.minimum}`;
    case 'too_big': return `au plus ${issue.maximum}`;
    case 'invalid_value': return `valeur attendue : ${issue.values.join(', ')}`;
    case 'unrecognized_keys': return 'champ inconnu';
    default: return 'texte attendu';
  }
}
function parseFile(fichier: unknown, cle: string, catalogue: DeclarationCatalogue): Record<string, unknown> & { version: string } {
  if (!object(fichier)) throw new ErreurCatalogue('pas_un_objet');
  if (fichier.catalogue !== cle) throw new ErreurCatalogue('mauvais_outil', undefined, cle, fichier.catalogue ?? null);
  if (typeof fichier.version !== 'string' || fichier.version.length < 1 || fichier.version.length > 40) {
    throw new ErreurCatalogue('version');
  }
  const noms = new Set(catalogue.natures.map((n) => n.nom));
  let total = 0;
  for (const [nom, liste] of Object.entries(fichier)) {
    if (nom === 'catalogue' || nom === 'version') continue;
    if (!noms.has(nom)) throw new ErreurCatalogue('section_inconnue', nom);
    if (!Array.isArray(liste)) throw new ErreurCatalogue('section_non_liste', nom);
    total += liste.length;
  }
  if (total > 5000) throw new ErreurService('invalide', 'Ce catalogue dépasse 5 000 éléments.', 'catalogue_trop_grand');
  return fichier as Record<string, unknown> & { version: string };
}

/** Both entry points recompute the same report against the current target level. */
function importCatalogue(db: Db, acteur: Acteur, cible: CibleOutils, cle: string, fichier: unknown, apercu: boolean): RapportCatalogue {
  const run = () => {
    const { catalogue, systemeId } = writeGuard(db, acteur, cible, cle);
    const file = parseFile(fichier, cle, catalogue);
    const target = storageTarget(cible);
    const rapport: RapportCatalogue = { version: file.version, apercu, natures: {}, remplacements: 0,
      absents: 0, refus: [], refusTotal: 0, versionCatalogue: lireLigneOutil(db, cible, cle)?.version_catalogue ?? null };
    const present = new Set<string>();
    let changed = false;
    const reject = (nature: string, elementKey: string, champ: string, raison: string) => {
      rapport.natures[nature]!.refuses++;
      rapport.refusTotal++;
      if (rapport.refus.length < 1000) rapport.refus.push({ nature, cle: elementKey, champ, raison });
    };
    for (const nature of catalogue.natures) {
      const counts = rapport.natures[nature.nom] = { ajoutes: 0, modifies: 0, inchanges: 0, refuses: 0 };
      const seen = new Set<string>();
      for (const item of (Object.hasOwn(file, nature.nom) ? file[nature.nom] : []) as unknown[]) {
        const itemKey = object(item) && typeof item.cle === 'string' ? item.cle : '';
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(itemKey)) {
          reject(nature.nom, itemKey, 'cle', 'clé invalide'); continue;
        }
        present.add(key(nature.nom, itemKey));
        if (seen.has(itemKey)) { reject(nature.nom, itemKey, 'cle', 'clé en double dans le fichier'); continue; }
        seen.add(itemKey);
        const { cle: _cle, ...fields } = item as Record<string, unknown>;
        const parsed = nature.schema.safeParse(fields);
        if (!parsed.success) {
          const issue = parsed.error.issues[0]!;
          const champ = issue.code === 'unrecognized_keys' ? issue.keys[0]! : issue.path.map(String).join('.');
          reject(nature.nom, itemKey, champ, issueReason(issue)); continue;
        }
        const donnees = parsed.data as Record<string, unknown>;
        const old = catalogue.stockage.lirePar(db, target, nature.nom, itemKey);
        const status = !old ? 'ajoutes' : old.nom !== donnees.nom || jsonCanonique(old.donnees) !== jsonCanonique(donnees) ? 'modifies' : 'inchanges';
        counts[status]++;
        if (status !== 'inchanges') {
          changed = true;
          if (status === 'ajoutes' && cible.niveau === 'univers' &&
            catalogue.stockage.lirePar(db, { systemeId }, nature.nom, itemKey)) rapport.remplacements++;
        }
        if (!apercu) catalogue.stockage.ecrire(db, target, nature.nom, { cle: itemKey, donnees, versionCatalogue: file.version });
      }
    }
    rapport.absents = catalogue.stockage.lister(db, target).filter((r) => !present.has(key(r.nature, r.cle))).length;
    if (!apercu && changed) {
      poserVersionCatalogue(db, acteur, cible, cle, file.version);
      rapport.versionCatalogue = file.version;
    }
    return rapport;
  };
  return apercu ? run() : db.transaction(run)();
}
export function previsualiserCatalogue(db: Db, acteur: Acteur, cible: CibleOutils, outil: string, fichier: unknown): RapportCatalogue {
  return importCatalogue(db, acteur, cible, outil, fichier, true);
}
export function appliquerCatalogue(db: Db, acteur: Acteur, cible: CibleOutils, outil: string, fichier: unknown): RapportCatalogue {
  return importCatalogue(db, acteur, cible, outil, fichier, false);
}

/** Resolve before filtering: a hidden replacement must never reveal the system row underneath. */
function resolve(db: Db, universId: number, cle: string, nature?: string): ElementResolu[] {
  const { catalogue, systemeId } = context(db, { niveau: 'univers', id: universId }, cle);
  if (nature !== undefined) natureOf(catalogue, nature);
  const system = catalogue.stockage.lister(db, { systemeId }, nature);
  const universe = catalogue.stockage.lister(db, { universId }, nature);
  const withdrawn = new Set(catalogue.stockage.retraits(db, universId).map((r) => key(r.nature, r.cle)));
  const rows = new Map<string, ElementResolu>(system.map((r) => [key(r.nature, r.cle), {
    ...r, origine: withdrawn.has(key(r.nature, r.cle)) ? 'retire' : 'systeme',
  }]));
  for (const r of universe) {
    const k = key(r.nature, r.cle);
    rows.set(k, { ...r, origine: rows.has(k) ? 'remplace' : 'univers' });
  }
  return [...rows.values()];
}
/** Module computations receive only effective entries; withdrawals are management metadata. */
export function resoudreElements(db: Db, universId: number, outil: string, nature: string): ElementResolu[] {
  return resolve(db, universId, outil, nature).filter((r) => r.origine !== 'retire');
}
function page(catalogue: DeclarationCatalogue, rows: ElementResolu[], mj: boolean, options: OptionsCatalogue): PageCatalogue {
  let readable = rows.filter((r) => mj || (!r.masque && r.origine !== 'retire'));
  readable.sort((a, b) => a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : a.nature.localeCompare(b.nature));
  if (options.curseur) {
    const index = readable.findIndex((r) => r.cle === options.curseur);
    readable = index < 0 ? [] : readable.slice(index + 1);
  }
  const elements = readable.slice(0, 50).map((r): VueElementCatalogue => ({
    nature: r.nature, cle: r.cle, nom: r.nom, resume: natureOf(catalogue, r.nature).resume(r.donnees),
    ...(mj ? { origine: r.origine, masque: r.masque, version: r.version } : { donnees: r.donnees }),
  }));
  return { elements, suivant: readable.length > 50 ? elements.at(-1)!.cle : null };
}
export function lireCatalogue(db: Db, acteur: Acteur, cible: CibleOutils, outil: string, options: OptionsCatalogue = {}): PageCatalogue {
  let mj: boolean;
  if (cible.niveau === 'univers') {
    exigerOutil(db, acteur, cible.id, outil);
    mj = vueMJ(roleDe(db, cible.id, acteur.compteId)!, acteur);
  } else { lireResponsable(db, acteur, cible.id); mj = true; }
  const { catalogue } = context(db, cible, outil);
  if (options.nature !== undefined) natureOf(catalogue, options.nature);
  const rows: ElementResolu[] = cible.niveau === 'univers' ? resolve(db, cible.id, outil, options.nature)
    : catalogue.stockage.lister(db, storageTarget(cible), options.nature).map((r) => ({ ...r, origine: 'systeme' }));
  return page(catalogue, rows, mj, options);
}
export function lireCatalogueGestion(db: Db, acteur: Acteur, universId: number, outil: string, options: OptionsCatalogue = {}): PageCatalogue {
  if (roleDe(db, universId, acteur.compteId) !== 'mj' || acteur.modeJoueur) throw introuvable();
  const { catalogue } = context(db, { niveau: 'univers', id: universId }, outil);
  return page(catalogue, resolve(db, universId, outil, options.nature), true, options);
}
/** Single-item counterpart of resoudreElements, for computations already guarded by tool usage. */
export function lireElement(db: Db, universId: number, outil: string, nature: string, cle: string): ElementResolu {
  const element = resoudreElements(db, universId, outil, nature).find((r) => r.cle === cle);
  if (!element) throw introuvable();
  return element;
}
export function masquerElement(db: Db, acteur: Acteur, universId: number, outil: string, nature: string, cle: string,
  entree: { masque: boolean; version: number }): LigneCatalogue {
  return db.transaction(() => {
    const { catalogue, systemeId } = writeGuard(db, acteur, { niveau: 'univers', id: universId }, outil);
    natureOf(catalogue, nature);
    if (!entree || typeof entree.masque !== 'boolean') throw invalid('masque');
    if (!Number.isInteger(entree.version) || entree.version < 1) throw invalid('version');
    if (!catalogue.stockage.lirePar(db, { universId }, nature, cle)) {
      if (!catalogue.stockage.lirePar(db, { systemeId }, nature, cle)) throw introuvable();
      throw new ErreurService('invalide', "Un élément du système ne se masque pas.", 'element_systeme', 'cle');
    }
    return catalogue.stockage.poserMasque(db, universId, nature, cle, entree.masque, entree.version);
  })();
}
export function retirerElement(db: Db, acteur: Acteur, universId: number, outil: string, nature: string, cle: string,
  entree: { retire: boolean }): void {
  db.transaction(() => {
    const { catalogue, systemeId } = writeGuard(db, acteur, { niveau: 'univers', id: universId }, outil);
    natureOf(catalogue, nature);
    if (!entree || typeof entree.retire !== 'boolean') throw invalid('retire');
    if (catalogue.stockage.lirePar(db, { universId }, nature, cle)) {
      throw new ErreurService('invalide', "Cet élément est remplacé pour l'univers.", 'element_remplace', 'cle');
    }
    if (!catalogue.stockage.lirePar(db, { systemeId }, nature, cle)) throw introuvable();
    catalogue.stockage.poserRetrait(db, universId, nature, cle, entree.retire);
  })();
}
