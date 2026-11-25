import { ecrire } from './historique.js';
import type { Db } from '../db/db.js';
import { aventureLue, campagneDuCompteRendu, exigerMJ, exigerRole, peutVoirFiche, vueMJ } from './droits.js';
import { tirerCleFiche } from './cles.js';
import { introuvable, invalide, refuse } from './erreurs.js';
import { LIMITE_LISTE, chargerFiche, lireFiche, validerTitre, versFiche } from './fiches.js';
import { preparerContenu } from './liens.js';
import { exigerSansBloc, insererSection, validerContenu } from './sections.js';
import type { Acteur, Fiche, FicheVue } from './types.js';
import type { CampagneVue } from './droits.js';
import type { Role } from './types.js';

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
    origine?: { cle: string; creeLe?: string; modifieLe?: string };
    /** Where the report is created from (`creee_via`); the import is `import`, else `ecran` by default. */
    via?: 'ecran' | 'assistant' | 'mcp';
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
  const ficheId = ecrire(db, compteId, () => {
    const f = db
      .prepare(
        `INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via)
         VALUES (?, 'compte_rendu', ?, ?, ?, ?, ?, ?)`,
      )
      .run(universId, titre, JSON.stringify({ v: 1, campagne_id: campagneId }),
        o?.creeLe ?? now, o?.modifieLe ?? now, o?.cle ?? tirerCleFiche(db, universId, 'compte_rendu', titre),
        o ? 'import' : (entree.via ?? 'ecran'));
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
  });
  return lireFiche(db, { compteId }, universId, ficheId);
}

/**
 * The GM moves a session report to another adventure of the same universe (AD-cr-aventure-1): only
 * `charge.campagne_id` is written. Same guards as `changerStatutFiche`; the target is read with
 * `aventureLue` (as at creation); the same adventure writes nothing, so no history line.
 */
export function changerAventureDuCompteRendu(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  campagneId: unknown,
): Fiche {
  const role = exigerRole(db, universId, acteur.compteId);
  const fiche = chargerFiche(db, universId, ficheId);
  if (role !== 'mj' && !peutVoirFiche(db, role, ficheId, acteur)) throw introuvable();
  if (!vueMJ(role, acteur)) throw refuse();
  if (fiche.type !== 'compte_rendu') throw invalide('Cette fiche n\'est pas un compte-rendu.');
  if (typeof campagneId !== 'number' || !Number.isSafeInteger(campagneId)) throw introuvable();
  if (!aventureLue(db, role, acteur, universId, campagneId)) throw introuvable();
  const charge = JSON.parse(fiche.charge) as Record<string, unknown>;
  if (charge.campagne_id !== campagneId) {
    ecrire(db, acteur.compteId, () =>
      db.prepare('UPDATE fiches SET charge = ? WHERE id = ?')
        .run(JSON.stringify({ ...charge, campagne_id: campagneId }), ficheId),
    );
  }
  return versFiche(chargerFiche(db, universId, ficheId));
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

const PROFONDEUR_CHAINE = 50;

/**
 * The adventure `racineId` (already checked as read) and its descendants reached through an
 * unbroken chain of adventures by `parent_id`; the read guard is tested at each node, so an
 * unreadable scenario cuts what is below it, and a non-adventure child is left out.
 */
function aventuresDeLaChaine(db: Db, role: Role, acteur: Acteur, universId: number, racineId: number): number[] {
  const enfants = db.prepare("SELECT id FROM fiches WHERE parent_id = ? AND type = 'aventure' AND univers_id = ?");
  const trouves = new Set<number>([racineId]);
  let niveau = [racineId];
  for (let n = 0; n < PROFONDEUR_CHAINE && niveau.length > 0; n++) {
    const suivant: number[] = [];
    for (const id of niveau) {
      for (const { id: e } of enfants.all(id, universId) as { id: number }[]) {
        if (trouves.has(e) || !aventureLue(db, role, acteur, universId, e)) continue;
        trouves.add(e);
        suivant.push(e);
      }
    }
    niveau = suivant;
  }
  return [...trouves];
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
  // Filtering names an adventure: require the same read guard as its sheet, for every role.
  // Closed, deleted, foreign and unknown adventures all answer not found to a non-reader.
  if (options.campagneId !== undefined) {
    if (!aventureLue(db, role, acteur, universId, options.campagneId)) throw introuvable();
    // The adventure and its scenarios: an unbroken chain of readable adventures by `parent_id`.
    const ids = aventuresDeLaChaine(db, role, acteur, universId, options.campagneId);
    where.push("json_extract(f.charge, '$.campagne_id') IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(ids));
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
