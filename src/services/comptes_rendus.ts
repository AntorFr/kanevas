import type { Db } from '../db/db.js';
import { campagneBrute } from './campagnes.js';
import { exigerRole } from './droits.js';
import { introuvable, invalide } from './erreurs.js';
import { LIMITE_LISTE, lireFiche, validerTitre } from './fiches.js';
import { MAX_CONTENU_SECTION } from './sections.js';
import type { Acteur, FicheVue } from './types.js';

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
  entree: { titre: string; texte?: string },
): FicheVue {
  const role = exigerRole(db, universId, compteId);
  const campagne = campagneBrute(db, campagneId);
  if (campagne.univers_id !== universId) throw introuvable();
  const titre = validerTitre(entree.titre, 120, 'Le titre');
  const texte = entree.texte ?? '';
  if (texte.length > MAX_CONTENU_SECTION) {
    throw invalide('Contenu trop long : 20 000 caractères au plus.');
  }
  const now = new Date().toISOString();
  const ficheId = db.transaction(() => {
    const f = db
      .prepare(
        `INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le)
         VALUES (?, 'compte_rendu', ?, ?, ?, ?)`,
      )
      .run(universId, titre, JSON.stringify({ v: 1, campagne_id: campagneId }), now, now);
    const id = Number(f.lastInsertRowid);
    const joueur = role === 'joueur';
    db.prepare(
      `INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le,
         joueurs_lisent, joueurs_ecrivent, auteur_id, auteur_lit, auteur_ecrit)
       VALUES (?, ?, 1, ?, ?, 1, 0, ?, ?, ?)`,
    ).run(id, TITRE_SECTION_COMPTE_RENDU, texte, now, joueur ? compteId : null, joueur ? 1 : 0, joueur ? 1 : 0);
    return id;
  })();
  return lireFiche(db, { compteId }, universId, ficheId);
}

export interface CompteRenduResume {
  id: number;
  titre: string;
  campagneId: number;
  campagneNom: string;
  /** Username of the section's author, only when the caller may read that section; else null. */
  auteur: string | null;
  creeLe: string;
}

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
  campagne_id: number;
  campagne_nom: string;
  auteur: string | null;
}

/**
 * Session reports of the universe the caller reads at least one section of,
 * newest first (`cree_le`, then `id`, descending), at most 100 a page. A report
 * with no readable section is neither returned nor counted (B-9, AD-22).
 * `campagneId` narrows to one campaign.
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
  if (options.campagneId !== undefined) {
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
       c.nom AS campagne_nom,
       (SELECT a.username FROM sections s JOIN comptes a ON a.id = s.auteur_id
         WHERE s.fiche_id = f.id AND s.auteur_id IS NOT NULL AND ${auteurLisible}
         ORDER BY s.ordre LIMIT 1) AS auteur
     FROM fiches f
     JOIN campagnes c ON c.id = json_extract(f.charge, '$.campagne_id')
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
      campagneId: r.campagne_id,
      campagneNom: r.campagne_nom,
      auteur: r.auteur,
      creeLe: r.cree_le,
    })),
    total,
    suivant,
  };
}
