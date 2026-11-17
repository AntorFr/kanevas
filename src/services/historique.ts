import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from '../db/db.js';
import { empreinteEntete, empreinteSection, type CleDe } from './empreintes.js';

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
  const fiche = db.prepare('SELECT cle FROM fiches WHERE id = ?');
  const fichier = db.prepare('SELECT cle_origine AS cle FROM fichiers WHERE id = ?');
  return (id, nature = 'fiche') => {
    const r = (nature === 'fichier' ? fichier : fiche).get(id) as { cle: string | null } | undefined;
    return r?.cle ?? null;
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
