// The generator settings and the catalogue's overrides of a galaxy (AD-reglages-1 to 5): the only reader and writer of
// `swn_reglages` and `swn_aspects` (a source-scan test holds it). The core validates, merges and draws (AD-140); this
// file stores the override the GM moved, counts what a proposal would move with `tirage-etoiles.ts`'s own code path,
// and applies it in one transaction. `ecriture-systeme.ts` never calls `reglagesDe`: a defined system is rows.
import type { Db } from '../../db/db.js';
import { TAILLE_BLOC } from '../../outils/swn/regles/generation.js';
import { lirePlages } from '../../outils/swn/regles/forme.js';
import type { Point } from '../../outils/swn/regles/hex.js';
import { chargerModule } from '../../wasm/charger.js';
import { roleDe, vueMJ } from '../droits.js';
import { ErreurService, introuvable } from '../erreurs.js';
import type { Acteur } from '../types.js';
import { niveauLecture, zonesLisibles, type LigneGalaxie } from './galaxies.js';
import { tirerInterieur } from './interieur.js';
import { entreesBloc, systemesExclusants, tirerEtoileComplete, type EtoileTiree } from './tirage-etoiles.js';

interface Coeur {
  reglages_defaut(version: number): string;
  valider_reglages(version: number, surcharge: string): string;
  fusionner_reglages(version: number, surcharge: string): string;
  versions_generateur(): Uint32Array;
  version_generateur_courante(): number;
  valider_aspect_type(type: string, json: string): string;
  types_catalogue(): string;
}

// Loaded once at import so that the service stays synchronous; a failed load makes every call throw the generic error.
let coeur: Coeur | undefined;
try {
  coeur = await chargerModule<Coeur>('coeur');
} catch {
  coeur = undefined;
}
function leCoeur(): Coeur {
  if (!coeur) throw new Error('Wasm module "coeur" is missing or unreadable.');
  return coeur;
}

/** The version of a galaxy with no row: every galaxy existing at the migration (AD-reglages-2). */
export const VERSION_GENERATEUR_ORIGINE = 1;
/** Deadline of a count (AD-reglages-4). */
const DELAI_APERCU_MS = 10_000;
/** Half-side, in blocks, of the square of origin: 25 blocks of radius, 125 hexagons (AD-reglages-4). */
const RAYON_ORIGINE = 25;
const MARGE_BLOCS = 2;
const PLAFOND_BLOCS = 160;

type Objet = Record<string, unknown>;

export interface ReglagesDe {
  versionGenerateur: number;
  /** The override the GM moved (canonical, only the keys that differ from the defaults). */
  surcharge: Objet;
  /** The override as JSON, as `tirer_systeme` takes it (it merges it over the defaults itself). */
  valeurs: string;
  /** Own `version` of the row, 0 without row. */
  version: number;
}

/** What a galaxy draws with now; no guard (the callers carry theirs). A galaxy without row: version 1, the defaults. */
export function reglagesDe(db: Db, galaxieId: number): ReglagesDe {
  const l = db.prepare('SELECT version_generateur, valeurs, version FROM swn_reglages WHERE galaxie_id = ?')
    .get(galaxieId) as { version_generateur: number; valeurs: string; version: number } | undefined;
  if (!l) return { versionGenerateur: VERSION_GENERATEUR_ORIGINE, surcharge: {}, valeurs: '{}', version: 0 };
  return { versionGenerateur: l.version_generateur, surcharge: JSON.parse(l.valeurs) as Objet, valeurs: l.valeurs, version: l.version };
}

/** The row of a galaxy being created, at the core's current version (AD-reglages-2). */
export function inscrireReglagesGalaxie(db: Db, galaxieId: number): void {
  db.prepare('INSERT INTO swn_reglages (galaxie_id, version_generateur) VALUES (?, ?)')
    .run(galaxieId, leCoeur().version_generateur_courante());
}

// ---- Guards -----------------------------------------------------------------------------------------------------

const acteurDe = (a: Acteur | number): Acteur => (typeof a === 'number' ? { compteId: a } : a);
const MODE_JOUEUR = () => new ErreurService('refuse', 'Passez en mode MJ pour faire cela.', 'mode_joueur');
const aChange = () => new ErreurService('conflit', 'Ces réglages ont changé depuis que vous les avez ouverts.', 'a_change');
const indisponible = () => new ErreurService('indisponible', "Le décompte n'est pas disponible.");
const champ = (c: string, message: string, detail = 'reglage_invalide') => new ErreurService('invalide', message, detail, c);

/**
 * The GM of the galaxy's universe: any other role, an unknown galaxy and a tool the caller cannot use are the same
 * `introuvable`. A GM in Player mode reads; a write answers `refuse` / `mode_joueur`.
 */
function galaxieDuMJ(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, ecriture: boolean): LigneGalaxie {
  const a = acteurDe(acteur);
  const role = roleDe(db, universId, a.compteId);
  if (role !== 'mj' || !niveauLecture(db, a, universId)) throw introuvable();
  const g = Number.isInteger(galaxieId)
    ? db.prepare('SELECT * FROM swn_galaxies WHERE id = ? AND univers_id = ?').get(galaxieId, universId) as LigneGalaxie | undefined
    : undefined;
  if (!g) throw introuvable();
  if (ecriture && !vueMJ(role, a)) throw MODE_JOUEUR();
  return g;
}

// ---- Validation (the core's, never a second set of bounds) ---------------------------------------------------------

const estObjet = (v: unknown): v is Objet => typeof v === 'object' && v !== null && !Array.isArray(v);

function versionsConnues(): number[] { return Array.from(leCoeur().versions_generateur()); }

interface Verdict { ok: boolean; canonique?: unknown; champ?: string; borne?: string; message?: string }
function refus(v: Verdict): ErreurService {
  const message = v.borne || v.message || 'Valeur invalide.';
  return champ(v.champ || 'valeurs', message);
}

export interface Proposition {
  densite?: unknown; version_generateur?: unknown; valeurs?: unknown; aspects?: unknown;
}
interface Etat { densite: number; versionGenerateur: number; surcharge: Objet; valeurs: string }
interface Validee { propose: Etat; touchePose: boolean; valeursDonnees: boolean; versionDonnee: boolean; densiteDonnee: boolean }

/** The proposed state, validated exactly as the write validates it (the preview and the write share this function). */
function valider(g: LigneGalaxie, courant: ReglagesDe, p: Proposition): Validee {
  let densite = g.densite_defaut;
  if (p.densite !== undefined) {
    if (typeof p.densite !== 'number' || !Number.isFinite(p.densite) || p.densite < 0 || p.densite > 1) {
      throw champ('densite', 'Entre 0 et 1.');
    }
    densite = p.densite;
  }
  let version = courant.versionGenerateur;
  if (p.version_generateur !== undefined) {
    if (!Number.isInteger(p.version_generateur) || !versionsConnues().includes(p.version_generateur as number)) {
      throw champ('version_generateur', 'Version inconnue.');
    }
    version = p.version_generateur as number;
  }
  let surcharge = courant.surcharge;
  const valeursDonnees = p.valeurs !== undefined;
  if (p.valeurs === null) surcharge = {};
  else if (valeursDonnees || version !== courant.versionGenerateur) {
    const source = valeursDonnees ? p.valeurs : surcharge;
    if (!estObjet(source)) throw champ('valeurs', 'Objet JSON attendu.');
    const v = JSON.parse(leCoeur().valider_reglages(version, JSON.stringify(source))) as Verdict;
    if (!v.ok) throw refus(v);
    surcharge = v.canonique as Objet;
  }
  if (p.aspects !== undefined) {
    if (!estObjet(p.aspects)) throw champ('aspects', 'Objet JSON attendu.');
    for (const [type, params] of Object.entries(p.aspects)) validerAspect(type, params);
  }
  return {
    propose: { densite, versionGenerateur: version, surcharge, valeurs: JSON.stringify(surcharge) },
    touchePose: valeursDonnees || p.version_generateur !== undefined, valeursDonnees,
    versionDonnee: p.version_generateur !== undefined, densiteDonnee: p.densite !== undefined,
  };
}

function validerAspect(type: string, parametres: unknown): Objet | null {
  if (parametres === null) {
    if (!(type in (JSON.parse(leCoeur().types_catalogue()) as Objet))) throw champ('type', 'Type inconnu.');
    return null;
  }
  if (!estObjet(parametres)) throw champ('parametres', 'Objet JSON attendu.');
  const v = JSON.parse(leCoeur().valider_aspect_type(type, JSON.stringify(parametres))) as Verdict;
  if (!v.ok) throw refus(v);
  return v.canonique as Objet;
}

// ---- Count (AD-reglages-4) -------------------------------------------------------------------------------------

export interface Etendue { de: { bx: number; by: number }; a: { bx: number; by: number }; largeur: number; hauteur: number }
/** What the count says: hexagons of the extent, in `largeur × hauteur`. */
export interface Apercu { tires_changent: number; definis_inchangent: number; etendue: Etendue }

const bloc = (n: number): number => Math.floor(n / TAILLE_BLOC);

/** The extent of the count: the square of origin widened to the defined systems and the zones plus two blocks, capped. */
export function etendueApercu(db: Db, galaxieId: number): Etendue {
  let x0 = -RAYON_ORIGINE, x1 = RAYON_ORIGINE - 1, y0 = -RAYON_ORIGINE, y1 = RAYON_ORIGINE - 1;
  const etendre = (q: number, r: number): void => {
    x0 = Math.min(x0, bloc(q) - MARGE_BLOCS); x1 = Math.max(x1, bloc(q) + MARGE_BLOCS);
    y0 = Math.min(y0, bloc(r) - MARGE_BLOCS); y1 = Math.max(y1, bloc(r) + MARGE_BLOCS);
  };
  for (const s of db.prepare('SELECT q, r FROM swn_systemes WHERE galaxie_id = ?').all(galaxieId) as { q: number; r: number }[]) etendre(s.q, s.r);
  for (const z of zonesLisibles(db, galaxieId, 'mj')) for (const [q, r] of JSON.parse(z.contour) as Point[]) etendre(q, r);
  const rogner = (a: number, b: number): [number, number] => {
    if (b - a + 1 <= PLAFOND_BLOCS) return [a, b];
    const milieu = Math.floor((a + b) / 2), debut = milieu - PLAFOND_BLOCS / 2;
    return [debut, debut + PLAFOND_BLOCS - 1];
  };
  [x0, x1] = rogner(x0, x1); [y0, y1] = rogner(y0, y1);
  return { de: { bx: x0, by: y0 }, a: { bx: x1, by: y1 }, largeur: (x1 - x0 + 1) * TAILLE_BLOC, hauteur: (y1 - y0 + 1) * TAILLE_BLOC };
}

const memeEtat = (a: Etat, b: Etat): boolean =>
  a.densite === b.densite && a.versionGenerateur === b.versionGenerateur && a.valeurs === b.valeurs;

/** The drawn systems whose interior (or existence) differs between two states, over the extent. Writes nothing. */
function compter(db: Db, g: LigneGalaxie, avant: Etat, apres: Etat): Apercu {
  const etendue = etendueApercu(db, g.id);
  const definis = (db.prepare('SELECT count(*) AS n FROM swn_systemes WHERE galaxie_id = ?').get(g.id) as { n: number }).n;
  const sortie = (n: number): Apercu => ({ tires_changent: n, definis_inchangent: definis, etendue });
  if (memeEtat(avant, apres)) return sortie(0);
  const lignes = new Set((db.prepare('SELECT q, r FROM swn_systemes WHERE galaxie_id = ?').all(g.id) as { q: number; r: number }[])
    .map((s) => `${s.q},${s.r}`));
  const zones = zonesLisibles(db, g.id, 'mj').map((z) => ({
    contour: JSON.parse(z.contour) as Point[], plages: z.plages === null ? null : lirePlages(z.plages), densite: z.densite,
  }));
  const exclusants = systemesExclusants(db, g.id, etendue.de, etendue.a);
  const echeance = Date.now() + DELAI_APERCU_MS;
  const memeDensite = avant.densite === apres.densite;
  let n = 0;
  const compte = (e: EtoileTiree | null): e is EtoileTiree => e !== null && !lignes.has(`${e.q},${e.r}`);
  try {
    for (let by = etendue.de.by; by <= etendue.a.by; by++) {
      for (let bx = etendue.de.bx; bx <= etendue.a.bx; bx++) {
        if (Date.now() > echeance) throw indisponible();
        const ea = entreesBloc(bx, by, zones, avant.densite, exclusants);
        const A = tirerEtoileComplete(g.graine, bx, by, ea);
        const B = memeDensite ? A : tirerEtoileComplete(g.graine, bx, by, entreesBloc(bx, by, zones, apres.densite, exclusants));
        const a = compte(A) ? A : null, b = compte(B) ? B : null;
        if (a && b && a.q === b.q && a.r === b.r) {
          if (tirerInterieur(a, avant.versionGenerateur, avant.valeurs) !== tirerInterieur(b, apres.versionGenerateur, apres.valeurs)) n++;
        } else {
          if (a) n++;
          if (b) n++;
        }
      }
    }
  } catch (e) {
    throw e instanceof ErreurService ? e : indisponible();
  }
  return sortie(n);
}

const etatCourant = (g: LigneGalaxie, r: ReglagesDe): Etat =>
  ({ densite: g.densite_defaut, versionGenerateur: r.versionGenerateur, surcharge: r.surcharge, valeurs: JSON.stringify(r.surcharge) });

/**
 * What a proposal `{ densite?, version_generateur?, valeurs?, aspects? }` would move, validated as the write validates
 * it, without writing. A proposal that cannot move a position or an interior (aspects only, or nothing) counts 0.
 */
export function apercuReglages(db: Db, acteur: Acteur | number, universId: number, galaxieId: number, proposition: Proposition): Apercu {
  const g = galaxieDuMJ(db, acteur, universId, galaxieId, true);
  const courant = reglagesDe(db, g.id);
  const v = valider(g, courant, proposition ?? {});
  return compter(db, g, etatCourant(g, courant), v.propose);
}

// ---- Read ------------------------------------------------------------------------------------------------------------

export interface LigneAspect { type: string; parametres: Objet; version: number }
/** The overrides of the galaxy's catalogue, by type. No guard: `catalogue-aspects.ts` and `lireReglages` carry theirs. */
export function lireAspects(db: Db, galaxieId: number): LigneAspect[] {
  return (db.prepare('SELECT type, parametres, version FROM swn_aspects WHERE galaxie_id = ? ORDER BY type').all(galaxieId) as
    { type: string; parametres: string; version: number }[]).map((l) => ({ ...l, parametres: JSON.parse(l.parametres) as Objet }));
}

export interface VueReglages {
  /** The galaxy's `version`: the token of the writes of the tab (and of an anchoring). */
  version: number; version_generateur: number; versions_connues: number[]; densite_defaut: number;
  /** The complete object the draw uses now. */
  valeurs: Objet;
  /** Only what the GM moved. */
  surcharge: Objet;
  /** The core's complete defaults of this version. */
  defauts: Objet;
  par_defaut: boolean;
  /** One entry per type of the core's catalogue: the override stored (`{}` without), the core's default parameters and the
   * row's own `version` (0 without row). The effective merge is `catalogue-aspects.ts`'s. */
  aspects: { type: string; surcharge: Objet; defaut: Objet; version: number }[];
}

function vue(db: Db, g: LigneGalaxie): VueReglages {
  const r = reglagesDe(db, g.id);
  const c = leCoeur();
  const lignes = new Map(lireAspects(db, g.id).map((a) => [a.type, a]));
  const defauts = JSON.parse(c.types_catalogue()) as Record<string, Objet>;
  return {
    version: g.version, version_generateur: r.versionGenerateur, versions_connues: versionsConnues(), densite_defaut: g.densite_defaut,
    valeurs: JSON.parse(c.fusionner_reglages(r.versionGenerateur, r.valeurs)) as Objet,
    surcharge: r.surcharge, defauts: JSON.parse(c.reglages_defaut(r.versionGenerateur)) as Objet,
    par_defaut: Object.keys(r.surcharge).length === 0,
    aspects: Object.entries(defauts).map(([type, defaut]) =>
      ({ type, surcharge: lignes.get(type)?.parametres ?? {}, defaut, version: lignes.get(type)?.version ?? 0 })),
  };
}

/** The settings of a galaxy, for its GM (in Player mode too); any other role gets the `introuvable` of an unknown galaxy. */
export function lireReglages(db: Db, acteur: Acteur | number, universId: number, galaxieId: number): VueReglages {
  return vue(db, galaxieDuMJ(db, acteur, universId, galaxieId, false));
}

// ---- Writes ----------------------------------------------------------------------------------------------------------

/**
 * Applies a proposal in one `BEGIN IMMEDIATE` (AD-reglages-5): the galaxy's `version` is the token, `confirme: true` is
 * required when the count is above zero, `valeurs: null` returns to the defaults, the default density rides with it.
 * The galaxy's `version` + 1 refuses every anchoring token read before. Answers `lireReglages` as it reads now.
 */
export function poserReglages(
  db: Db, acteur: Acteur | number, universId: number, galaxieId: number,
  entree: Proposition & { version: unknown; confirme?: unknown },
): VueReglages {
  const g0 = galaxieDuMJ(db, acteur, universId, galaxieId, true);
  if (!Number.isInteger(entree.version) || (entree.version as number) < 1) throw new ErreurService('invalide', 'Version invalide.', undefined, 'version');
  const jeton = entree.version as number;
  const v = valider(g0, reglagesDe(db, g0.id), entree);
  return db.transaction(() => {
    const g = db.prepare('SELECT * FROM swn_galaxies WHERE id = ?').get(g0.id) as LigneGalaxie | undefined;
    if (!g) throw introuvable();
    if (g.version !== jeton) throw aChange();
    const courant = reglagesDe(db, g.id);
    // Validated again on the state read under the lock: the same function, so the write is what the count announced.
    const w = valider(g, courant, entree);
    const compte = compter(db, g, etatCourant(g, courant), w.propose);
    if (compte.tires_changent > 0 && entree.confirme !== true) {
      throw champ('confirme', 'Confirmez les changements.', 'confirmation_requise');
    }
    if (w.touchePose) {
      db.prepare(`INSERT INTO swn_reglages (galaxie_id, version_generateur, valeurs, version) VALUES (?, ?, ?, 1)
        ON CONFLICT (galaxie_id) DO UPDATE SET version_generateur = excluded.version_generateur, valeurs = excluded.valeurs,
        version = swn_reglages.version + 1`).run(g.id, w.propose.versionGenerateur, w.propose.valeurs);
    }
    if (w.densiteDonnee) db.prepare('UPDATE swn_galaxies SET densite_defaut = ? WHERE id = ?').run(w.propose.densite, g.id);
    db.prepare('UPDATE swn_galaxies SET version = version + 1 WHERE id = ?').run(g.id);
    return vue(db, { ...g, version: g.version + 1, densite_defaut: w.propose.densite });
  }).immediate();
}

/**
 * The one write of `swn_aspects`: the override of one type, with the row's own `version` (0 without row) as the token.
 * `parametres: null` deletes the row. It validates through the core and never moves the galaxy's `version` (a catalogue
 * change moves no position, so anchoring tokens stay valid). No role guard: `catalogue-aspects.ts` carries it.
 * Returns the new version of the row (0 once deleted).
 */
export function ecrireAspect(db: Db, galaxieId: number, type: string, parametres: unknown, version: number): number {
  const canonique = validerAspect(type, parametres);
  return db.transaction(() => {
    const ligne = db.prepare('SELECT version FROM swn_aspects WHERE galaxie_id = ? AND type = ?').get(galaxieId, type) as { version: number } | undefined;
    if ((ligne?.version ?? 0) !== version) throw aChange();
    if (canonique === null) {
      db.prepare('DELETE FROM swn_aspects WHERE galaxie_id = ? AND type = ?').run(galaxieId, type);
      return 0;
    }
    if (!ligne) {
      db.prepare('INSERT INTO swn_aspects (galaxie_id, type, parametres, version) VALUES (?, ?, ?, 1)').run(galaxieId, type, JSON.stringify(canonique));
      return 1;
    }
    db.prepare('UPDATE swn_aspects SET parametres = ?, version = version + 1 WHERE galaxie_id = ? AND type = ?')
      .run(JSON.stringify(canonique), galaxieId, type);
    return ligne.version + 1;
  }).immediate();
}
