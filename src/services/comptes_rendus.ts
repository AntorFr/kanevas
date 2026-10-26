import type { Db } from '../db/db.js';
import { aventureLue, campagneDuCompteRendu, exigerMJ, exigerRole } from './droits.js';
import { introuvable, invalide } from './erreurs.js';
import { LIMITE_LISTE, lireFiche, validerTitre } from './fiches.js';
import { preparerContenu } from './liens.js';
import { exigerSansBloc, insererSection, validerContenu } from './sections.js';
import type { Acteur, FicheVue } from './types.js';
import type { CampagneVue } from './droits.js';

export const TITRE_SECTION_COMPTE_RENDU = 'Compte-rendu';

/**
 * Any member creates a session report of a campaign of THEIR universe (B-19,
 * AD-61): in one transaction, the sheet and its single "Compte-rendu" section,
 * readable by players, not writable by them. A player creator is its author
 * (reads and writes it); a GM's has no author. Any failure writes nothing.
 */
export function creerCompteRendu(
  db: Db,
  compteId: number,
  universId: number,
  campagneId: number,
  entree: {
    titre: string;
    texte?: string;
    /** Import only: origin metadata, validated by the import service before creation. */
    origine?: { cle: string; creeLe?: string; modifieLe?: string; dernierImport: unknown };
  },
): FicheVue {
  const role = exigerRole(db, universId, compteId);
  if (entree.origine) exigerMJ(db, universId, compteId);
  // The adventure must be one the caller reads, in this universe: else it does not exist for them.
  if (!aventureLue(db, role, { compteId }, universId, campagneId)) throw introuvable();
  const titre = validerTitre(entree.titre, 120, 'Le titre');
  const texte = entree.texte ?? '';
  validerContenu(texte);
  exigerSansBloc(role, texte);
  const now = new Date().toISOString();
  const o = entree.origine;
  const ficheId = db.transaction(() => {
    const f = db
      .prepare(
        `INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le, cle_origine, dernier_import)
         VALUES (?, 'compte_rendu', ?, ?, ?, ?, ?, ?)`,
      )
      .run(universId, titre, JSON.stringify({ v: 1, campagne_id: campagneId }),
        o?.creeLe ?? now, o?.modifieLe ?? now, o?.cle ?? null,
        o ? JSON.stringify(o.dernierImport) : null);
    const id = Number(f.lastInsertRowid);
    const joueur = role === 'joueur';
    const contenu = preparerContenu(db, universId, compteId, texte);
    validerContenu(contenu);
    insererSection(db, {
      ficheId: id,
      titre: TITRE_SECTION_COMPTE_RENDU,
      ordre: 1,
      contenu,
      modifieLe: now,
      joueursLisent: 1,
      auteurId: joueur ? compteId : null,
      auteurLit: joueur ? 1 : 0,
      auteurEcrit: joueur ? 1 : 0,
    });
    return id;
  })();
  return lireFiche(db, { compteId }, universId, ficheId);
}

export type CompteRenduResume = {
  id: number;
  titre: string;
  /** Username of the section's author, only when the caller may read that section; else null. */
  auteur: string | null;
  creeLe: string;
} & CampagneVue;

export interface PageComptesRendus {
  comptesRendus: CompteRenduResume[];
  /** Readable reports matching the filter, all pages together. */
  total: number;
  suivant: string | null;
}

interface LigneCR {
  id: number;
  titre: string;
  cree_le: string;
  campagne_id: unknown;
  auteur: string | null;
}

/**
 * Session reports of the universe the caller reads at least one section of,
 * newest first (`cree_le`, then `id`, descending), at most 100 a page. A report
 * with no readable section is neither returned nor counted (B-9, AD-22).
 * `campagneId` narrows to one adventure (one the caller reads).
 */
export function listerComptesRendus(
  db: Db,
  acteur: Acteur,
  universId: number,
  options: { campagneId?: number; curseur?: string; limite?: number } = {},
): PageComptesRendus {
  const role = exigerRole(db, universId, acteur.compteId);
  const limite = Math.min(Math.max(Math.trunc(options.limite ?? LIMITE_LISTE), 1), LIMITE_LISTE);
  const mj = role === 'mj' && !acteur.modeJoueur;
  const lecteur = acteur.modeJoueur ? -1 : acteur.compteId;
  // Section readable by the caller, as in `peutLireSection` (player view).
  const lisible = mj
    ? '1'
    : `EXISTS (SELECT 1 FROM sections s WHERE s.fiche_id = f.id AND
         (s.joueurs_lisent = 1 OR (s.auteur_lit = 1 AND s.auteur_id = ?)))`;
  const where = ["f.univers_id = ?", "f.type = 'compte_rendu'", lisible];
  const params: (string | number)[] = [universId];
  if (!mj) params.push(lecteur);
  // The filter by adventure answers nothing for a reader who does not read that adventure: closed,
  // deleted and unknown are the same empty list, so the filter cannot tell a hidden adventure.
  if (options.campagneId !== undefined) {
    if (!mj && !aventureLue(db, role, acteur, universId, options.campagneId)) {
      return { comptesRendus: [], total: 0, suivant: null };
    }
    where.push("json_extract(f.charge, '$.campagne_id') = ?");
    params.push(options.campagneId);
  }
  const { n: total } = db
    .prepare(`SELECT COUNT(*) AS n FROM fiches f WHERE ${where.join(' AND ')}`)
    .get(...params) as { n: number };
  const filtres = [...where];
  const p = [...params];
  if (options.curseur !== undefined) {
    let c: { t: string; i: number };
    try {
      c = JSON.parse(Buffer.from(options.curseur, 'base64url').toString('utf8'));
      if (typeof c.t !== 'string' || !Number.isInteger(c.i)) throw new Error();
    } catch {
      throw invalide('Curseur invalide.');
    }
    filtres.push('(f.cree_le < ? OR (f.cree_le = ? AND f.id < ?))');
    p.push(c.t, c.t, c.i);
  }
  // The author is named only through a section the caller can read (AD-61).
  const auteurLisible = mj
    ? '1'
    : '(s.joueurs_lisent = 1 OR (s.auteur_lit = 1 AND s.auteur_id = ?))';
  const sql = `SELECT f.id, f.titre, f.cree_le,
       json_extract(f.charge, '$.campagne_id') AS campagne_id,
       (SELECT a.username FROM sections s JOIN comptes a ON a.id = s.auteur_id
         WHERE s.fiche_id = f.id AND s.auteur_id IS NOT NULL AND ${auteurLisible}
         ORDER BY s.ordre LIMIT 1) AS auteur
     FROM fiches f
     WHERE ${filtres.join(' AND ')}
     ORDER BY f.cree_le DESC, f.id DESC LIMIT ?`;
  const args = mj ? [...p, limite + 1] : [lecteur, ...p, limite + 1];
  const rows = db.prepare(sql).all(...args) as LigneCR[];
  const page = rows.slice(0, limite);
  const dernier = page[page.length - 1];
  const suivant =
    rows.length > limite && dernier
      ? Buffer.from(JSON.stringify({ t: dernier.cree_le, i: dernier.id })).toString('base64url')
      : null;
  return {
    comptesRendus: page.map((r) => ({
      id: r.id,
      titre: r.titre,
      auteur: r.auteur,
      creeLe: r.cree_le,
      ...campagneDuCompteRendu(db, role, acteur, universId, r.campagne_id),
    })),
    total,
    suivant,
  };
}
