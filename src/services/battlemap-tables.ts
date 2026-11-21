import type { Db } from '../db/db.js';
import type { LigneDonnees } from '../outils/declaration.js';
import * as coeur from '../outils/battlemap/coeur.js';
import { etatAssets } from './battlemap-donnees.js';
import {
  assetsDe, contexteFiltre, fichesDe, fichesLisibles, invalideChamp, ligne, maintenant, type Document, type Ligne,
} from './battlemap-cartes.js';
import { annoncer } from './battlemap-flux.js';
import { roleDe, vueMJ } from './droits.js';
import { resoudreOutil } from './outils.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import type { Acteur } from './types.js';

/**
 * The game tables of the battle map (AD-battlemap-table-1 to 5, 7): the only reader and writer of `bm_tables` and
 * `bm_pions_proprietaires`. Every rule (commands, limits, fog, resize, player view) is the core's, called through `coeur.ts`;
 * what the core cannot know — footprints of the assets, readable sheets, GM-only assets — is built here from the database for
 * the reader, never given by a caller. A table has its own `version`, apart from the map's.
 */

interface LigneTable { carte_id: number; etat: string; version: number }

/** What the GM reads of a table: the whole state and the owners (`proprietaires`: token id → account id). */
export interface TableMJ {
  commencee: true; version: number; peutEcrire: true; etat: coeur.EtatTable; proprietaires: Record<string, number>;
}
/** What anyone else reads (a player, or a GM in Player mode): the view of the core, no owner, no `peutEcrire`. */
export interface TableJoueur {
  commencee: true; version: number; document: unknown; pions: unknown[]; brouillard: string; vue: unknown;
  /** Ids of the tokens the reader owns and sees (AD-battlemap-distance-3); never the owners of the others. */
  mesPions: string[];
  /** Remote play is on, the table has started, the reader is a real player owning a token she sees. */
  deplacement: boolean;
  /** The setting « Jeu à distance » itself, for the line « Seul le MJ déplace les pions. » of a reader who owns no token. */
  jeuADistance: boolean;
}
export type TableLue = TableMJ | TableJoueur | { commencee: false; peutEcrire?: true };

const TABLE_PLEINE = () => new ErreurService('conflit', 'La table est pleine : 200 pions au plus.', 'table_pleine');
const PERIMEE = () => new ErreurService('conflit', 'Cette table a changé depuis que vous l’avez ouverte.', 'version');

/** Same rule as `lireCarte` except for a hidden map, which is `introuvable` for a GM in Player mode too (AD-battlemap-table-5). */
function carteLue(db: Db, acteur: Acteur, universId: number, id: number): { l: Ligne; role: 'mj' | 'joueur'; mj: boolean } {
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) throw introuvable();
  const l = ligne(db, universId, id);
  if (!l) throw introuvable();
  const mj = vueMJ(role, acteur);
  if (l.visible !== 1 && !mj) throw introuvable();
  return { l, role, mj };
}

/** A write: the caller must read the map (else `introuvable`), then be a GM outside Player mode (else `refuse`). */
function carteEcrite(db: Db, acteur: Acteur, universId: number, id: number): Ligne {
  const { l, mj } = carteLue(db, acteur, universId, id);
  if (!mj) throw refuse('Seul le MJ peut faire cela.');
  return l;
}

const tableDe = (db: Db, carteId: number): LigneTable | undefined =>
  db.prepare('SELECT carte_id, etat, version FROM bm_tables WHERE carte_id = ?').get(carteId) as LigneTable | undefined;

/** Footprints in cells (`[largeur, hauteur]`) of the assets among `ids` of the universe that have one (floors and walls have none). */
function empreintesDe(db: Db, universId: number, ids: Iterable<string>): Record<string, [number, number]> {
  const lire = db.prepare('SELECT largeur, hauteur FROM bm_assets WHERE univers_id = ? AND id = ? AND largeur IS NOT NULL');
  const sortie: Record<string, [number, number]> = {};
  for (const id of new Set(ids)) {
    if (!/^[1-9][0-9]{0,15}$/.test(id)) continue;
    const r = lire.get(universId, Number(id)) as { largeur: number; hauteur: number } | undefined;
    if (r) sortie[id] = [r.largeur, r.hauteur];
  }
  return sortie;
}

const assetsDesPions = (etat: coeur.EtatTable): string[] =>
  etat.pions.flatMap((p) => (p.asset_id !== null ? [p.asset_id] : []));

function empreintesTable(db: Db, universId: number, document: Document, etat: coeur.EtatTable): Record<string, [number, number]> {
  return empreintesDe(db, universId, [...assetsDe(document), ...assetsDesPions(etat)]);
}

/** The core's refusals of a batch, as the interface's codes (`detail` is the code the route sends). */
function refusTable(r: coeur.RefusCoeur): ErreurService {
  switch (r.code) {
    case 'table_pleine': return TABLE_PLEINE();
    case 'id_existant': return new ErreurService('conflit', 'Ce pion existe déjà.', 'id_existant');
    case 'refuse': return refuse('Seul le MJ peut faire cela.');
    case 'pion_non_proprietaire': return new ErreurService('refuse', 'Ce pion n’est pas à vous.', 'pion_non_proprietaire');
    case 'position_invalide': case 'limite_depassee':
      return new ErreurService('invalide', 'Cela sort de la carte.', 'limite_depassee', r.champ);
    default: return new ErreurService('invalide', 'Commande refusée.', r.code, r.champ);
  }
}

function ecrireEtat(db: Db, carteId: number, etat: string, version: number): number {
  const suivante = version + 1;
  db.prepare('UPDATE bm_tables SET etat = ?, version = ?, modifie_le = ? WHERE carte_id = ?').run(etat, suivante, maintenant(), carteId);
  return suivante;
}

function proprietairesDe(db: Db, carteId: number): Record<string, number> {
  const lignes = db.prepare('SELECT pion_id, compte_id FROM bm_pions_proprietaires WHERE carte_id = ?')
    .all(carteId) as { pion_id: string; compte_id: number }[];
  return Object.fromEntries(lignes.map((r) => [r.pion_id, r.compte_id]));
}

/** What a player reads of a played map (the core's `vue_joueur`): hidden layers, elements under the fog and secret assets are gone. */
function vueJoueurDe(db: Db, acteur: Acteur, role: 'mj' | 'joueur', universId: number, l: Ligne, t: LigneTable, etat: coeur.EtatTable) {
  const doc = JSON.parse(l.document) as Document;
  // The tokens' assets and sheets are filtered like the document's own (a GM-only or removed asset → a plain disc, an unreadable sheet dropped).
  const contexteDoc: Document = {
    sols: doc.sols, murs: doc.murs,
    elements: [
      ...(doc.elements ?? []),
      ...etat.pions.flatMap((p) => (p.asset_id !== null ? [{ asset_id: p.asset_id, ...(p.fiche_id !== null ? { fiche_id: p.fiche_id } : {}) }] : [])),
    ],
  };
  const fiches = new Set([...fichesDe(doc), ...etat.pions.flatMap((p) => (p.fiche_id !== null ? [p.fiche_id] : []))]);
  const base = contexteFiltre(db, role, acteur, universId, contexteDoc);
  const contexte: coeur.ContexteVue = {
    ...base, fiches_lisibles: [...fichesLisibles(db, role, acteur, universId, fiches)],
    empreintes: empreintesTable(db, universId, doc, etat),
  };
  return coeur.vueJoueur(l.document, t.etat, contexte);
}

/**
 * The document of a map as a non-GM reads it when the map is played: the table's filter (hidden layers, fog) on top of the
 * document's own. `null` when the map has no table (the plain filtered document applies).
 */
export function documentJoueurDeTable(db: Db, acteur: Acteur, role: 'mj' | 'joueur', universId: number, l: Ligne): unknown | null {
  const t = tableDe(db, l.id);
  if (!t) return null;
  return vueJoueurDe(db, acteur, role, universId, l, t, JSON.parse(t.etat) as coeur.EtatTable).document;
}

/**
 * The table of a map for the caller. A map the caller cannot read, a hidden map for a player or a GM in Player mode and an
 * unknown id are the same `introuvable`; a readable map with no table is `{commencee: false}` (not an error).
 */
export function lireTable(db: Db, acteur: Acteur, universId: number, carteId: number): TableLue {
  const { l, role, mj } = carteLue(db, acteur, universId, carteId);
  const t = tableDe(db, l.id);
  if (!t) return mj ? { commencee: false, peutEcrire: true } : { commencee: false };
  const etat = JSON.parse(t.etat) as coeur.EtatTable;
  if (mj) return { commencee: true, version: t.version, peutEcrire: true, etat, proprietaires: proprietairesDe(db, l.id) };
  const v = vueJoueurDe(db, acteur, role, universId, l, t, etat);
  const siens = new Set(mesPropres(db, l.id, acteur.compteId));
  const mesPions = (v.pions as { id: string }[]).filter((p) => siens.has(p.id)).map((p) => p.id);
  const reglage = jeuADistance(db, universId);
  const deplacement = role === 'joueur' && !acteur.modeJoueur && mesPions.length > 0 && reglage;
  return { commencee: true, version: t.version, document: v.document, pions: v.pions, brouillard: v.brouillard, vue: v.vue, mesPions, deplacement, jeuADistance: reglage };
}

/** The « Jeu à distance » setting of the maps tool, read at each call (AD-battlemap-distance-2), never cached. */
function jeuADistance(db: Db, universId: number): boolean {
  try {
    return resoudreOutil(db, universId, 'battlemap/cartes').reglages.jeu_a_distance?.valeur !== false;
  } catch (e) {
    // A universe the tool does not apply to (no game system) has no setting to read: the declared default holds.
    if (e instanceof ErreurService && e.code === 'introuvable') return true;
    throw e;
  }
}

function mesPropres(db: Db, carteId: number, compteId: number): string[] {
  return (db.prepare('SELECT pion_id FROM bm_pions_proprietaires WHERE carte_id = ? AND compte_id = ?')
    .all(carteId, compteId) as { pion_id: string }[]).map((r) => r.pion_id);
}

/** « Jouer » on a map: creates its table, hidden everywhere, once. GM outside Player mode; a second call changes nothing. */
export function creerTable(db: Db, acteur: Acteur, universId: number, carteId: number): { creee: boolean; table: TableLue } {
  let annonce = false;
  const r = db.transaction(() => {
    const l = carteEcrite(db, acteur, universId, carteId);
    let creee = false;
    if (!tableDe(db, l.id)) {
      const now = maintenant();
      db.prepare('INSERT INTO bm_tables (carte_id, etat, version, cree_le, modifie_le) VALUES (?, ?, 1, ?, ?)')
        .run(l.id, coeur.etatVide(l.largeur, l.hauteur), now, now);
      creee = true;
      annonce = true;
    }
    return { creee, table: lireTable(db, acteur, universId, carteId) };
  })();
  if (annonce) annoncer(db, carteId);
  return r;
}

export const MAX_COMMANDES_TABLE = 500;

/** The assets and sheets a batch places on a token: an asset of the universe, a sheet of the universe (the GM reads them all). */
function verifierReferences(db: Db, acteur: Acteur, universId: number, commandes: unknown[]): void {
  const assets = new Set<string>();
  const fiches = new Set<string>();
  for (const c of commandes) {
    if (typeof c !== 'object' || c === null) continue;
    const o = c as { type?: unknown; asset_id?: unknown; fiche_id?: unknown };
    if (o.type !== 'ajouter_pion' && o.type !== 'regler_pion') continue;
    if (o.asset_id !== undefined && o.asset_id !== null) assets.add(String(o.asset_id));
    if (o.fiche_id !== undefined && o.fiche_id !== null) fiches.add(String(o.fiche_id));
  }
  if (assets.size > 0 && !(() => { const { connus } = etatAssets(db, universId, assets); return [...assets].every((a) => connus.has(a)); })()) {
    throw new ErreurService('invalide', 'Cet asset n’existe pas dans la bibliothèque.', 'asset_inconnu', 'asset_id');
  }
  if (fiches.size > 0) {
    const lisibles = fichesLisibles(db, 'mj', acteur, universId, fiches);
    if ([...fiches].some((f) => !lisibles.has(f))) {
      throw new ErreurService('invalide', 'Cette fiche n’existe pas dans cet univers.', 'fiche_inconnue', 'fiche_id');
    }
  }
}

/**
 * A batch of the core's table commands, applied whole or refused whole, at the version the writer read. A GM outside Player mode
 * (the setting « Jeu à distance » is ignored), or a real player who moves her own tokens (AD-battlemap-distance-1/2: setting off →
 * `jeu_a_distance_coupe`, 403, nothing written; the core refuses anything else with `pion_non_proprietaire`). A GM in Player
 * mode is `refuse` / `mode_joueur`. A stale version is `conflit` (`version`); `table_pleine` is `conflit`;
 * `limite_depassee` is `invalide`. The owners of tokens that are gone (`retirer_pion`, `reinitialiser`) go in the same transaction.
 */
export function appliquerCommandesTable(db: Db, acteur: Acteur, universId: number, carteId: number,
  version: unknown, commandes: unknown): { version: number } {
  const r = db.transaction(() => {
    const { l, role, mj } = carteLue(db, acteur, universId, carteId);
    if (!mj && role === 'mj') throw new ErreurService('refuse', 'Seul le MJ peut faire cela.', 'mode_joueur');
    if (!mj && !jeuADistance(db, universId)) throw new ErreurService('refuse', 'Le jeu à distance est coupé.', 'jeu_a_distance_coupe');
    if (!Number.isInteger(version) || (version as number) < 1) throw invalideChamp('version', 'Version invalide.');
    if (!Array.isArray(commandes) || commandes.length === 0 || commandes.length > MAX_COMMANDES_TABLE) {
      throw invalideChamp('commandes', `Un lot compte de 1 à ${MAX_COMMANDES_TABLE} commandes.`);
    }
    const t = tableDe(db, l.id);
    if (!t) throw new ErreurService('introuvable', 'Page introuvable.', 'table_absente');
    if (version !== t.version) throw PERIMEE();
    if (mj) verifierReferences(db, acteur, universId, commandes);
    const avant = JSON.parse(t.etat) as coeur.EtatTable;
    // Footprints of the tokens already there and of those the batch adds.
    const nouveaux = commandes.flatMap((c) => {
      const a = (c as { asset_id?: unknown } | null)?.asset_id;
      return typeof a === 'string' || typeof a === 'number' ? [String(a)] : [];
    });
    const empreintes = empreintesDe(db, universId, [...assetsDesPions(avant), ...nouveaux]);
    const r = coeur.appliquerTable(l.document, t.etat, commandes, mj
      ? { empreintes, acteur: 'mj' }
      : { empreintes, acteur: 'joueur', proprietaires: mesPropres(db, l.id, acteur.compteId) });
    if (!r.ok) throw refusTable(r);
    const apres = JSON.parse(r.etat) as coeur.EtatTable;
    const restants = new Set(apres.pions.map((p) => p.id));
    const supprimer = db.prepare('DELETE FROM bm_pions_proprietaires WHERE carte_id = ? AND pion_id = ?');
    for (const pid of Object.keys(proprietairesDe(db, l.id))) if (!restants.has(pid)) supprimer.run(l.id, pid);
    return { version: ecrireEtat(db, l.id, r.etat, t.version) };
  })();
  annoncer(db, carteId);
  return r;
}

/**
 * Sets (`compteId`: a member of the universe) or clears (`null`) the owner of a token, and bumps the table's version in the
 * same transaction. GM outside Player mode. The owner is never part of the state.
 */
export function definirProprietaire(db: Db, acteur: Acteur, universId: number, carteId: number,
  pionId: string, compteId: unknown): { version: number } {
  const r = db.transaction(() => {
    const l = carteEcrite(db, acteur, universId, carteId);
    const t = tableDe(db, l.id);
    if (!t) throw new ErreurService('introuvable', 'Page introuvable.', 'table_absente');
    const etat = JSON.parse(t.etat) as coeur.EtatTable;
    if (!etat.pions.some((p) => p.id === pionId)) throw new ErreurService('introuvable', 'Page introuvable.', 'pion_inconnu');
    if (compteId !== null && (!Number.isSafeInteger(compteId) || (compteId as number) < 1)) {
      throw invalideChamp('compte_id', 'Le propriétaire doit être un membre de l’univers.', 'proprietaire_invalide');
    }
    if (compteId !== null && !roleDe(db, universId, compteId as number)) {
      throw invalideChamp('compte_id', 'Le propriétaire doit être un membre de l’univers.', 'proprietaire_invalide');
    }
    db.prepare('DELETE FROM bm_pions_proprietaires WHERE carte_id = ? AND pion_id = ?').run(l.id, pionId);
    if (compteId !== null) {
      db.prepare('INSERT INTO bm_pions_proprietaires (carte_id, pion_id, compte_id) VALUES (?, ?, ?)').run(l.id, pionId, compteId);
    }
    return { version: ecrireEtat(db, l.id, t.etat, t.version) };
  })();
  annoncer(db, carteId);
  return r;
}

/**
 * Called by `reglerCarte`, in its transaction, when a map changes size: the table (if any) follows — bitmap extended with hidden
 * cells or cropped, shared view clamped — or the whole change is refused (`limite_depassee`, `champ` = `taille`) when a token's
 * footprint would leave the map.
 */
export function redimensionnerTable(db: Db, carte: Ligne, largeur: number, hauteur: number): void {
  const t = tableDe(db, carte.id);
  if (!t) return;
  const etat = JSON.parse(t.etat) as coeur.EtatTable;
  const empreintes = empreintesDe(db, carte.univers_id, assetsDesPions(etat));
  const r = coeur.redimensionnerEtat(t.etat, [carte.largeur, carte.hauteur], [largeur, hauteur], { empreintes });
  if (!r.ok) {
    throw new ErreurService('invalide', 'Des éléments sont hors des nouvelles limites.', 'limite_depassee', r.champ ?? 'taille');
  }
  ecrireEtat(db, carte.id, r.etat, t.version);
}

/** What `compter` / `effacer` of the module see (D-1): tables and owners of the universe's maps. */
export function compterTables(db: Db, universId: number): { tables: number; proprietaires: number } {
  const tables = (db.prepare('SELECT COUNT(*) AS n FROM bm_tables WHERE carte_id IN (SELECT id FROM bm_cartes WHERE univers_id = ?)')
    .get(universId) as { n: number }).n;
  const proprietaires = (db.prepare('SELECT COUNT(*) AS n FROM bm_pions_proprietaires WHERE carte_id IN (SELECT id FROM bm_cartes WHERE univers_id = ?)')
    .get(universId) as { n: number }).n;
  return { tables, proprietaires };
}

export function lignesTables(db: Db, universId: number): LigneDonnees[] {
  const c = compterTables(db, universId);
  return [
    { cle: 'tables', singulier: 'table de jeu', pluriel: 'tables de jeu', nombre: c.tables },
    { cle: 'proprietaires', singulier: 'propriétaire de pion', pluriel: 'propriétaires de pion', nombre: c.proprietaires },
  ];
}

/** Owners, then tables, before the maps' rows (AD-battlemap-table-1). */
export function effacerTables(db: Db, universId: number): void {
  const cartes = 'SELECT id FROM bm_cartes WHERE univers_id = ?';
  db.prepare(`DELETE FROM bm_pions_proprietaires WHERE carte_id IN (${cartes})`).run(universId);
  db.prepare(`DELETE FROM bm_tables WHERE carte_id IN (${cartes})`).run(universId);
}

/**
 * What opening the stream of a map needs (AD-battlemap-table-6): the versions to announce and whether the reader is a GM. The map
 * is read like the table is — a map the caller cannot read, a hidden one for a player (or a GM in Player mode) and an unknown id
 * are the same `introuvable`. A display (`affichage`, AD-160) always reads as a player, whatever the session's mode.
 */
export function ouvertureFlux(db: Db, acteur: Acteur, universId: number, carteId: number, affichage: boolean):
  { carte: number; table: number | null; mj: boolean } {
  const lecteur: Acteur = affichage ? { ...acteur, modeJoueur: true } : acteur;
  const { l, mj } = carteLue(db, lecteur, universId, carteId);
  return { carte: l.version, table: tableDe(db, l.id)?.version ?? null, mj };
}
