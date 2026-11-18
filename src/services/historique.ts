import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from '../db/db.js';
import { empreinteEntete, empreinteSection, type CleDe } from './empreintes.js';
import { cleDeFiche, resoudreFiche } from './cles.js';
import { roleDe } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { changerSousType, changerTypeFiche, deplacerFiche, renommerFiche } from './fiches.js';
import { etiquetageDe, poserEtiquetage } from './etiquettes.js';
import { ecrireContenu, recreerSection, renommerSection } from './sections.js';
import type { Acteur } from './types.js';

// The history of the writes on a sheet (AD-147). The lines are written by the SQL triggers of migration
// 0039, from the one-row table `contexte_ecriture`; this file is its only writer and the one place that
// fills `empreinte_apres` (the triggers cannot hash). No service inserts into `historique` by hand.

export type OrigineEcriture = 'ecran' | 'assistant' | 'import' | 'mcp' | 'outil' | 'systeme' | 'inconnu';

export interface ContexteEcriture {
  /** Null for a caller with no account yet (the import before `api`). */
  compteId: number | null;
  jetonId: number | null;
  origine: OrigineEcriture;
  lotId: number | null;
}

interface Etat {
  profondeur: number;
  /** The table exists (migration 0039 played): a base short of it, seeded by a migration test, has no history. */
  table?: boolean;
}
const etats = new WeakMap<Db, Etat>();

interface LigneContexte {
  compte_id: number | null;
  jeton_id: number | null;
  origine: string;
  lot_id: number | null;
}

/**
 * Plays `fn` in a transaction under the context: the triggers record every write it makes with the
 * account, token, origin and batch of the context. Origin `systeme` records nothing. The context is
 * cleared (or the outer one put back) at the end, and the `empreinte_apres` of the section and header
 * lines inserted meanwhile is filled from the state at the end of the outermost transaction, before the
 * commit.
 */
export function avecContexte<T>(db: Db, contexte: ContexteEcriture, fn: () => T): T {
  const etat = etats.get(db) ?? { profondeur: 0 };
  etats.set(db, etat);
  if (etat.table !== true) {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'contexte_ecriture'").get() === undefined) {
      return db.transaction(fn)();
    }
    etat.table = true;
  }
  return db.transaction(() => {
    const precedent = db.prepare('SELECT compte_id, jeton_id, origine, lot_id FROM contexte_ecriture WHERE id = 1').get() as
      | LigneContexte
      | undefined;
    const dernier = etat.profondeur === 0 ? derniereLigne(db) : 0;
    db.prepare(
      `INSERT OR REPLACE INTO contexte_ecriture (id, compte_id, jeton_id, origine, lot_id) VALUES (1, ?, ?, ?, ?)`,
    ).run(contexte.compteId, contexte.jetonId, contexte.origine, contexte.lotId);
    etat.profondeur += 1;
    try {
      const resultat = fn();
      if (etat.profondeur === 1) remplirEmpreintes(db, dernier);
      return resultat;
    } finally {
      etat.profondeur -= 1;
      if (precedent === undefined) db.prepare('DELETE FROM contexte_ecriture WHERE id = 1').run();
      else
        db.prepare(
          'INSERT OR REPLACE INTO contexte_ecriture (id, compte_id, jeton_id, origine, lot_id) VALUES (1, ?, ?, ?, ?)',
        ).run(precedent.compte_id, precedent.jeton_id, precedent.origine, precedent.lot_id);
    }
  })();
}

const ambiant = new AsyncLocalStorage<Partial<ContexteEcriture>>();

/**
 * Runs `fn` (and what it awaits) with an origin, a batch or a token that the write services read through
 * `ecrire`: the assistant's tools say `assistant`, the import `import` with its batch. A service called
 * with none is a screen write (`ecran`) for the account it is given.
 */
export function sousOrigine<T>(partiel: Partial<ContexteEcriture>, fn: () => T): T {
  return ambiant.run({ ...ambiant.getStore(), ...partiel }, fn);
}

/**
 * The door of every write service: inside a context it just runs `fn` (the outer origin stands), outside
 * it opens one from the ambient origin (`ecran` by default) and the account given, or the ambient one.
 */
export function ecrire<T>(db: Db, compteId: number | null, fn: () => T): T {
  if ((etats.get(db)?.profondeur ?? 0) > 0) return fn();
  const a = ambiant.getStore();
  return avecContexte(
    db,
    {
      compteId: compteId ?? a?.compteId ?? null,
      jetonId: a?.jetonId ?? null,
      origine: a?.origine ?? 'ecran',
      lotId: a?.lotId ?? null,
    },
    fn,
  );
}

/** A link resolution or a cache rewrite: changes nothing a reader sees, writes no line (`systeme`). */
export function ecrireSysteme<T>(db: Db, fn: () => T): T {
  return avecContexte(db, { compteId: null, jetonId: null, origine: 'systeme', lotId: null }, fn);
}

function derniereLigne(db: Db): number {
  return (db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM historique').get() as { n: number }).n;
}

/** The key of a sheet or of a file, for the import form of a link or of a file reference. */
export function cleDe(db: Db): CleDe {
  const fichier = db.prepare('SELECT cle_origine AS cle FROM fichiers WHERE id = ?');
  return (id, nature = 'fiche') => {
    if (nature !== 'fichier') return cleDeFiche(db, id);
    return (fichier.get(id) as { cle: string | null } | undefined)?.cle ?? null;
  };
}

interface LigneAremplir {
  id: number;
  fiche_id: number;
  objet: string;
  objet_cle: string | null;
  action: string;
}

/**
 * `empreinte_apres` of the lines inserted after `dernier`: a section line gets the fingerprint of the
 * section as it stands now (two writes of one section in the context give the same one), a header line
 * the header's. A line whose section no longer exists, a deletion, a relation or sheet line, stays null.
 */
function remplirEmpreintes(db: Db, dernier: number): void {
  const lignes = db
    .prepare(
      `SELECT id, fiche_id, objet, objet_cle, action FROM historique
        WHERE id > ? AND fiche_id IS NOT NULL AND objet IN ('section', 'entete') AND action <> 'supprimee'
        ORDER BY id`,
    )
    .all(dernier) as LigneAremplir[];
  if (lignes.length === 0) return;
  const cle = cleDe(db);
  const maj = db.prepare('UPDATE historique SET empreinte_apres = ? WHERE id = ?');
  const section = db.prepare('SELECT * FROM sections WHERE fiche_id = ? AND cle = ?');
  const fichiers = db.prepare('SELECT fichier_id FROM fichiers_sections WHERE section_id = ? AND joint = 1');
  const fiche = db.prepare('SELECT * FROM fiches WHERE id = ?');
  const alias = db.prepare('SELECT alias FROM fiche_alias WHERE fiche_id = ?');
  const etiquettes = db.prepare(
    'SELECT e.nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = ?',
  );
  const memo = new Map<string, string | null>();
  for (const l of lignes) {
    const k = `${l.objet}:${l.fiche_id}:${l.objet_cle ?? ''}`;
    if (!memo.has(k)) {
      let valeur: string | null = null;
      if (l.objet === 'section') {
        const s = section.get(l.fiche_id, l.objet_cle) as
          | (Record<string, unknown> & { id: number })
          | undefined;
        if (s !== undefined) {
          valeur = empreinteSection(
            {
              ...(s as unknown as Parameters<typeof empreinteSection>[0]),
              fichiers: (fichiers.all(s.id) as { fichier_id: number }[]).map((r) => r.fichier_id),
            },
            cle,
          );
        }
      } else {
        const f = fiche.get(l.fiche_id) as
          | { titre: string; type: string; sous_type: string | null; parent_id: number | null; charge: string; cree_le: string }
          | undefined;
        if (f !== undefined) {
          valeur = empreinteEntete(
            {
              titre: f.titre,
              type: f.type,
              sousType: f.sous_type,
              parentId: f.parent_id,
              alias: (alias.all(l.fiche_id) as { alias: string }[]).map((r) => r.alias),
              etiquettes: (etiquettes.all(l.fiche_id) as { nom: string }[]).map((r) => r.nom),
              charge: JSON.parse(f.charge) as Record<string, unknown>,
              creeLe: f.cree_le,
            },
            cle,
          );
        }
      }
      memo.set(k, valeur);
    }
    maj.run(memo.get(k) ?? null, l.id);
  }
}

const JOUR_MS = 24 * 60 * 60 * 1000;

/** `valeur_avant` is kept 30 days, the line itself 90 (B-93). Returns what it emptied and deleted. */
export function purgerHistorique(db: Db, maintenant: Date): { videes: number; supprimees: number } {
  const avant = (jours: number) => new Date(maintenant.getTime() - jours * JOUR_MS).toISOString();
  return db.transaction(() => {
    const supprimees = db.prepare('DELETE FROM historique WHERE cree_le < ?').run(avant(90)).changes;
    const videes = db
      .prepare('UPDATE historique SET valeur_avant = NULL WHERE cree_le < ? AND valeur_avant IS NOT NULL')
      .run(avant(30)).changes;
    return { videes, supprimees };
  })();
}

/** The lines of a universe go with it (`supprimerUnivers`). */
export function retirerHistoriqueUnivers(db: Db, universId: number): void {
  db.prepare('DELETE FROM historique WHERE univers_id = ?').run(universId);
}

// ---- reading and restoring (B-102, B-103, AD-149) ----

export const LIGNES_PAR_PAGE = 100;
const CONSERVATION_JOURS = 30;

export interface FiltresHistorique {
  fiche?: string;
  compte?: string;
  jeton?: string;
  action?: string;
  depuis?: string;
  apres?: string;
}

interface LigneRow {
  id: number;
  univers_id: number;
  fiche_id: number | null;
  fiche_cle: string;
  fiche_titre: string;
  objet: 'entete' | 'section' | 'relation' | 'fiche';
  objet_cle: string | null;
  action: 'creee' | 'modifiee' | 'supprimee';
  compte_id: number | null;
  compte_nom: string | null;
  jeton_id: number | null;
  jeton_nom: string | null;
  origine: string;
  lot_id: number | null;
  cree_le: string;
  valeur_avant: string | null;
}

export interface LigneHistorique {
  id: number;
  creeLe: string;
  ficheId: number | null;
  ficheCle: string;
  ficheTitre: string;
  objet: LigneRow['objet'];
  objetCle: string | null;
  action: LigneRow['action'];
  compte: { id: number; username: string } | null;
  jeton: { id: number; nom: string } | null;
  origine: string;
  lotId: number | null;
  /** False once `valeur_avant` is gone (purged, or past 30 days) or never existed. */
  valeurConservee: boolean;
  restaurable: boolean;
}

/** The history is the GM's: a player never learns a line exists (a line can reveal a GM block). */
function exigerMJHistorique(db: Db, acteur: Acteur, universId: number): void {
  const role = roleDe(db, universId, acteur.compteId);
  if (role === null) throw introuvable();
  if (role !== 'mj' || acteur.modeJoueur) throw refuse();
}

const SELECT_LIGNE = `SELECT h.*, c.username AS compte_nom, j.nom AS jeton_nom
  FROM historique h LEFT JOIN comptes c ON c.id = h.compte_id LEFT JOIN jetons_api j ON j.id = h.jeton_id`;

const expiree = (l: LigneRow, maintenant: Date): boolean =>
  l.valeur_avant === null || Date.parse(l.cree_le) < maintenant.getTime() - CONSERVATION_JOURS * JOUR_MS;

function restaurableLigne(l: LigneRow): boolean {
  if (l.fiche_id === null) return false;
  if (l.objet === 'section') return l.action !== 'creee';
  if (l.objet === 'entete') return l.action === 'modifiee';
  return false;
}

function versLigne(l: LigneRow, maintenant: Date): LigneHistorique {
  return {
    id: l.id,
    creeLe: l.cree_le,
    ficheId: l.fiche_id,
    ficheCle: l.fiche_cle,
    ficheTitre: l.fiche_titre,
    objet: l.objet,
    objetCle: l.objet_cle,
    action: l.action,
    compte: l.compte_id === null ? null : { id: l.compte_id, username: l.compte_nom ?? '' },
    jeton: l.jeton_id === null ? null : { id: l.jeton_id, nom: l.jeton_nom ?? '' },
    origine: l.origine,
    lotId: l.lot_id,
    valeurConservee: !expiree(l, maintenant),
    restaurable: restaurableLigne(l),
  };
}

const entier = (valeur: string | undefined, quoi: string): number | null => {
  if (valeur === undefined) return null;
  if (!/^\d{1,15}$/.test(valeur)) throw invalide(`${quoi} invalide.`);
  return Number(valeur);
};

/**
 * The lines of a universe, newest first, 100 per page; `apres` is the cursor a page returns. No total.
 * `jeton` is a token name (not unique: every token of that name counts), `compte` an account id.
 */
export function listerHistorique(
  db: Db,
  acteur: Acteur,
  universId: number,
  filtres: FiltresHistorique = {},
  maintenant: Date = new Date(),
): { lignes: LigneHistorique[]; curseur: string | null } {
  exigerMJHistorique(db, acteur, universId);
  const conditions = ['h.univers_id = ?'];
  const params: (string | number)[] = [universId];
  if (filtres.fiche !== undefined) {
    const r = resoudreFiche(db, universId, filtres.fiche);
    if (r !== null) {
      conditions.push('h.fiche_id = ?');
      params.push(r.id);
    } else {
      conditions.push('h.fiche_cle = ?');
      params.push(filtres.fiche);
    }
  }
  const compte = entier(filtres.compte, 'Le compte');
  if (compte !== null) {
    conditions.push('h.compte_id = ?');
    params.push(compte);
  }
  if (filtres.jeton !== undefined) {
    conditions.push('j.nom = ?');
    params.push(filtres.jeton);
  }
  if (filtres.action !== undefined) {
    if (!['creee', 'modifiee', 'supprimee'].includes(filtres.action)) throw invalide("L'action est inconnue.");
    conditions.push('h.action = ?');
    params.push(filtres.action);
  }
  if (filtres.depuis !== undefined) {
    if (Number.isNaN(Date.parse(filtres.depuis))) throw invalide('La date est invalide.');
    conditions.push('h.cree_le >= ?');
    params.push(new Date(filtres.depuis).toISOString());
  }
  const apres = entier(filtres.apres, 'Le curseur');
  if (apres !== null) {
    conditions.push('h.id < ?');
    params.push(apres);
  }
  const rows = db
    .prepare(`${SELECT_LIGNE} WHERE ${conditions.join(' AND ')} ORDER BY h.id DESC LIMIT ?`)
    .all(...params, LIGNES_PAR_PAGE + 1) as LigneRow[];
  const page = rows.slice(0, LIGNES_PAR_PAGE);
  return {
    lignes: page.map((r) => versLigne(r, maintenant)),
    curseur: rows.length > LIGNES_PAR_PAGE ? String(page[page.length - 1]!.id) : null,
  };
}

/** The accounts and token names present in the lines of the universe (the filter of E-24). */
export function listerContributeurs(
  db: Db,
  acteur: Acteur,
  universId: number,
): { comptes: { id: number; username: string }[]; jetons: { nom: string }[] } {
  exigerMJHistorique(db, acteur, universId);
  const comptes = db
    .prepare(
      `SELECT c.id, c.username FROM comptes c
        WHERE c.id IN (SELECT compte_id FROM historique WHERE univers_id = ?) ORDER BY c.username COLLATE NOCASE`,
    )
    .all(universId) as { id: number; username: string }[];
  const jetons = db
    .prepare(
      `SELECT DISTINCT nom FROM jetons_api
        WHERE id IN (SELECT jeton_id FROM historique WHERE univers_id = ?) ORDER BY nom COLLATE NOCASE`,
    )
    .all(universId) as { nom: string }[];
  return { comptes, jetons };
}

function chargerLigne(db: Db, universId: number, hid: number): LigneRow {
  const l = db.prepare(`${SELECT_LIGNE} WHERE h.id = ? AND h.univers_id = ?`).get(hid, universId) as LigneRow | undefined;
  if (l === undefined) throw introuvable();
  return l;
}

interface SectionAvant {
  cle: string;
  titre: string;
  ordre: number;
  contenu: string;
  joueurs_lisent: number;
  joueurs_ecrivent: number;
  auteur_id: number | null;
  auteur_lit: number;
  auteur_ecrit: number;
}

interface EnteteAvant {
  titre: string;
  type: string;
  sous_type: string | null;
  parent_id: number | null;
  charge: Record<string, unknown>;
  alias: string[];
  etiquettes: string[];
  sections?: SectionAvant[];
}

const lireAvant = <T>(l: LigneRow): T | null => (l.valeur_avant === null ? null : (JSON.parse(l.valeur_avant) as T));

interface SectionCourante extends SectionAvant {
  id: number;
  version: number;
  gere_par: string | null;
  fichiers: number[];
}

function sectionCourante(db: Db, l: LigneRow): SectionCourante | null {
  if (l.fiche_id === null || l.objet_cle === null) return null;
  const s = db.prepare('SELECT * FROM sections WHERE fiche_id = ? AND cle = ?').get(l.fiche_id, l.objet_cle) as
    | (SectionCourante & Record<string, unknown>)
    | undefined;
  if (s === undefined) return null;
  const fichiers = (
    db.prepare('SELECT fichier_id FROM fichiers_sections WHERE section_id = ? AND joint = 1 ORDER BY fichier_id').all(s.id) as {
      fichier_id: number;
    }[]
  ).map((r) => r.fichier_id);
  return { ...s, fichiers };
}

interface EnteteCourante extends EnteteAvant {
  empreinte: string;
}

/** The header as it stands, with its fingerprint (AD-139), computed at each read. */
function enteteCourante(db: Db, ficheId: number): EnteteCourante | null {
  const f = db.prepare('SELECT * FROM fiches WHERE id = ?').get(ficheId) as
    | { titre: string; type: string; sous_type: string | null; parent_id: number | null; charge: string; cree_le: string }
    | undefined;
  if (f === undefined) return null;
  const { alias, etiquettes } = etiquetageDe(db, ficheId);
  const charge = JSON.parse(f.charge) as Record<string, unknown>;
  const e = {
    titre: f.titre,
    type: f.type,
    sous_type: f.sous_type,
    parent_id: f.parent_id,
    charge,
    alias,
    etiquettes,
  };
  const empreinte = empreinteEntete(
    { titre: f.titre, type: f.type, sousType: f.sous_type, parentId: f.parent_id, alias, etiquettes, charge, creeLe: f.cree_le },
    cleDe(db),
  );
  return { ...e, empreinte };
}

const resumeSection = (s: SectionAvant) => ({ cle: s.cle, titre: s.titre, ordre: s.ordre, contenu: s.contenu });
const resumeEntete = (e: EnteteAvant) => ({
  titre: e.titre,
  type: e.type,
  sousType: e.sous_type,
  parentId: e.parent_id,
  alias: e.alias,
  etiquettes: e.etiquettes,
});

export interface DetailLigne {
  ligne: LigneHistorique;
  /** The value before the write (source Markdown), null past 30 days or when the line has none. */
  avant: Record<string, unknown> | null;
  /** The value as it stands now, null when the object is gone. */
  courante: Record<string, unknown> | null;
  /** A deleted sheet: its sections as they were. */
  sections?: { cle: string; titre: string; ordre: number; contenu: string }[];
  /** What a restoration must carry back: a section's `version`. */
  version?: number | null;
  /** What a restoration must carry back: the header fingerprint. */
  empreinte?: string;
}

/** One line opened: the previous and the current value, and what to restore against. GM only. */
export function lireLigne(
  db: Db,
  acteur: Acteur,
  universId: number,
  hid: number,
  maintenant: Date = new Date(),
): DetailLigne {
  exigerMJHistorique(db, acteur, universId);
  const l = chargerLigne(db, universId, hid);
  const ligne = versLigne(l, maintenant);
  const gardee = !expiree(l, maintenant);
  if (l.objet === 'fiche') {
    if (l.action !== 'supprimee') return { ligne, avant: null, courante: null };
    const avant = gardee ? lireAvant<EnteteAvant>(l) : null;
    return { ligne, avant: null, courante: null, sections: (avant?.sections ?? []).map(resumeSection) };
  }
  if (l.objet === 'section') {
    const courante = sectionCourante(db, l);
    const avant = gardee ? lireAvant<SectionAvant>(l) : null;
    return {
      ligne,
      avant: avant === null ? null : resumeSection(avant),
      courante: courante === null ? null : { ...resumeSection(courante), version: courante.version },
      version: courante?.version ?? null,
    };
  }
  if (l.objet === 'entete') {
    const courante = l.fiche_id === null ? null : enteteCourante(db, l.fiche_id);
    const avant = gardee ? lireAvant<EnteteAvant>(l) : null;
    return {
      ligne,
      avant: avant === null ? null : resumeEntete(avant),
      courante: courante === null ? null : resumeEntete(courante),
      ...(courante === null ? {} : { empreinte: courante.empreinte }),
    };
  }
  return { ligne, avant: gardee ? lireAvant<Record<string, unknown>>(l) : null, courante: null };
}

const perime = () =>
  new ErreurService('conflit', 'La fiche a changé depuis l’affichage.', 'historique_perime');
const memeEnsemble = (a: readonly string[], b: readonly string[]) => {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/**
 * Restores the value of a line (B-103): a section rewritten or deleted, or the header of a sheet. A write
 * of origin `ecran` like any other, so it adds a line of its own. `entree` carries what the detail showed;
 * a change since is `historique_perime`.
 */
export function restaurer(
  db: Db,
  acteur: Acteur,
  universId: number,
  hid: number,
  entree: { version?: unknown; empreinte?: unknown },
  maintenant: Date = new Date(),
): DetailLigne {
  exigerMJHistorique(db, acteur, universId);
  const l = chargerLigne(db, universId, hid);
  if (!restaurableLigne(l)) throw invalide('Cette ligne ne se restaure pas.');
  if (expiree(l, maintenant)) {
    throw new ErreurService('conflit', 'La valeur précédente n’est plus conservée.', 'valeur_expiree');
  }
  const ficheId = l.fiche_id as number;
  if (db.prepare('SELECT 1 FROM fiches WHERE id = ? AND univers_id = ?').get(ficheId, universId) === undefined) {
    throw invalide('Cette ligne ne se restaure pas.');
  }
  if (l.objet === 'section') {
    const avant = lireAvant<SectionAvant>(l) as SectionAvant;
    const courante = sectionCourante(db, l);
    if (l.action === 'supprimee') {
      recreerSection(db, acteur.compteId, universId, ficheId, {
        cle: avant.cle,
        titre: avant.titre,
        contenu: avant.contenu,
        joueursLisent: avant.joueurs_lisent,
        joueursEcrivent: avant.joueurs_ecrivent,
        auteurId: avant.auteur_id,
        auteurLit: avant.auteur_lit,
        auteurEcrit: avant.auteur_ecrit,
      });
    } else {
      if (courante === null) throw perime();
      if (typeof entree.version !== 'number' || !Number.isInteger(entree.version)) throw invalide('La version est requise.');
      if (entree.version !== courante.version) throw perime();
      ecrire(db, acteur.compteId, () => {
        ecrireContenu(db, acteur.compteId, universId, ficheId, courante.id, avant.contenu, entree.version as number);
        if (avant.titre !== courante.titre) renommerSection(db, acteur.compteId, universId, ficheId, courante.id, avant.titre);
      });
    }
  } else {
    const avant = lireAvant<EnteteAvant>(l) as EnteteAvant;
    const courante = enteteCourante(db, ficheId) as EnteteCourante;
    if (typeof entree.empreinte !== 'string') throw invalide("L'empreinte est requise.");
    if (entree.empreinte !== courante.empreinte) throw perime();
    if (
      avant.parent_id !== null &&
      db.prepare('SELECT 1 FROM fiches WHERE id = ? AND univers_id = ?').get(avant.parent_id, universId) === undefined
    ) {
      throw perime();
    }
    ecrire(db, acteur.compteId, () => {
      if (avant.type !== courante.type) {
        changerTypeFiche(db, acteur.compteId, universId, ficheId, avant.type, avant.charge, avant.sous_type);
      } else if (avant.sous_type !== courante.sous_type) {
        changerSousType(db, acteur.compteId, universId, ficheId, avant.sous_type);
      }
      if (avant.titre !== courante.titre) renommerFiche(db, acteur, universId, ficheId, avant.titre);
      if (avant.parent_id !== courante.parent_id) deplacerFiche(db, acteur, universId, ficheId, avant.parent_id);
      if (!memeEnsemble(avant.alias, courante.alias) || !memeEnsemble(avant.etiquettes, courante.etiquettes)) {
        poserEtiquetage(db, acteur, universId, ficheId, { alias: avant.alias, etiquettes: avant.etiquettes });
      }
    });
  }
  return lireLigne(db, acteur, universId, hid, maintenant);
}
