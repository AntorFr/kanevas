import type { Db } from '../../db/db.js';
import { roleDe, vueMJ } from '../droits.js';
import { ErreurService, introuvable, refuse } from '../erreurs.js';
import { accessible, resoudreOutil } from '../outils.js';
import { env } from '../../config/env.js';
import type { Acteur } from '../types.js';

/** The tool key; the module `swn` declares it (`src/outils/swn/index.ts`). */
export const OUTIL_GALAXIE = 'swn/galaxie';

export type NiveauLecture = 'mj' | 'joueur';

export interface LigneGalaxie {
  id: number; univers_id: number; titre: string; visible: number; graine: string; densite_defaut: number;
  fiche_id: number | null; section_id: number | null; version: number;
}
export interface LigneSysteme {
  id: number; galaxie_id: number; cle: string; nom: string; q: number; r: number; taille: number;
  couleur: string; notes: string; secret: number; promu: number; version: number;
}
export interface LigneRoute {
  id: number; galaxie_id: number; depuis_id: number; vers_id: number; publique: number; longueur: number; version: number;
}
export interface LigneZone {
  id: number; galaxie_id: number; cle: string; nom: string; contour: string; couleur: string;
  densite: number | null; secret: number; version: number;
}

/**
 * The one place a role becomes a reading level (G-2): `'mj'` for a GM outside Player mode, `'joueur'` for a
 * player and for a GM in Player mode, `null` without a role or when the tool is not accessible to the actor.
 */
export function niveauLecture(db: Db, acteur: Acteur, universId: number): NiveauLecture | null {
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) return null;
  if (!accessible(db, acteur, universId, OUTIL_GALAXIE)) return null;
  return vueMJ(role, acteur) ? 'mj' : 'joueur';
}

/** Row filters of G-2, written once: every read of the galaxy (view, system, search, journey, cache) uses them. */
export const FILTRE_SYSTEMES: Record<NiveauLecture, string> = { mj: '1 = 1', joueur: 's.secret = 0' };
export const FILTRE_ZONES: Record<NiveauLecture, string> = { mj: '1 = 1', joueur: 'z.secret = 0' };
/** Routes: aliased `ro`, with the systems of their ends joined as `d` and `v`. */
export const FILTRE_ROUTES: Record<NiveauLecture, string> = {
  mj: '1 = 1', joueur: 'ro.publique = 1 AND d.secret = 0 AND v.secret = 0',
};

export function systemesLisibles(db: Db, galaxieId: number, niveau: NiveauLecture): LigneSysteme[] {
  return db.prepare(`SELECT s.* FROM swn_systemes s WHERE s.galaxie_id = ? AND ${FILTRE_SYSTEMES[niveau]} ORDER BY s.id`)
    .all(galaxieId) as LigneSysteme[];
}
export function zonesLisibles(db: Db, galaxieId: number, niveau: NiveauLecture): LigneZone[] {
  return db.prepare(`SELECT z.* FROM swn_zones z WHERE z.galaxie_id = ? AND ${FILTRE_ZONES[niveau]} ORDER BY z.id`)
    .all(galaxieId) as LigneZone[];
}
export function routesLisibles(db: Db, galaxieId: number, niveau: NiveauLecture): LigneRoute[] {
  return db.prepare(`SELECT ro.* FROM swn_routes ro
    JOIN swn_systemes d ON d.id = ro.depuis_id JOIN swn_systemes v ON v.id = ro.vers_id
    WHERE ro.galaxie_id = ? AND ${FILTRE_ROUTES[niveau]} ORDER BY ro.id`).all(galaxieId) as LigneRoute[];
}

/**
 * A galaxy read under the caller's level. Unknown, foreign, or hidden to a player: `introuvable`;
 * hidden to a GM in Player mode: `refuse` / `mode_joueur` (same convention as `lireCarte`).
 */
export function galaxieLisible(db: Db, acteur: Acteur, universId: number, galaxieId: number):
  { galaxie: LigneGalaxie; niveau: NiveauLecture } {
  const niveau = niveauLecture(db, acteur, universId);
  if (!niveau) throw introuvable();
  const galaxie = Number.isInteger(galaxieId)
    ? db.prepare('SELECT * FROM swn_galaxies WHERE id = ? AND univers_id = ?').get(galaxieId, universId) as LigneGalaxie | undefined
    : undefined;
  if (!galaxie) throw introuvable();
  if (galaxie.visible !== 1 && niveau === 'joueur') {
    if (roleDe(db, universId, acteur.compteId) === 'mj' && acteur.modeJoueur) {
      throw new ErreurService('refuse', "Les joueurs ne voient pas cette carte : elle n'est pas visible.", 'mode_joueur');
    }
    throw introuvable();
  }
  return { galaxie, niveau };
}

export interface ReferenceGalaxie { cle: string; nom: string; q: number; r: number }
/** The galaxy's first *readable* defined system by identifier, at the caller's level (G-6). */
export function referenceGalaxie(db: Db, galaxieId: number, niveau: NiveauLecture): ReferenceGalaxie | null {
  const s = db.prepare(`SELECT s.cle, s.nom, s.q, s.r FROM swn_systemes s
    WHERE s.galaxie_id = ? AND ${FILTRE_SYSTEMES[niveau]} ORDER BY s.id LIMIT 1`).get(galaxieId) as ReferenceGalaxie | undefined;
  return s ?? null;
}

export interface VueGalaxie {
  id: number; titre: string; visible?: boolean; version: number; niveau: NiveauLecture;
  porteeSaut: number; reference: ReferenceGalaxie | null;
}
export function lireGalaxie(db: Db, acteur: Acteur, universId: number, galaxieId: number): VueGalaxie {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  const porteeSaut = Number(resoudreOutil(db, universId, OUTIL_GALAXIE).communs.reglages.portee_saut?.valeur ?? 5);
  const vue: VueGalaxie = { id: galaxie.id, titre: galaxie.titre, version: galaxie.version, niveau, porteeSaut,
    reference: referenceGalaxie(db, galaxie.id, niveau) };
  if (niveau === 'mj') vue.visible = galaxie.visible === 1;
  return vue;
}

/** The galaxies of the universe for the map contract (E-10): a player gets the visible ones only. */
export function cartesGalaxies(db: Db, acteur: Acteur, universId: number):
  { id: number; titre: string; visible: boolean }[] {
  const niveau = niveauLecture(db, acteur, universId);
  if (!niveau) return [];
  const lignes = db.prepare('SELECT id, titre, visible FROM swn_galaxies WHERE univers_id = ? ORDER BY titre COLLATE NOCASE, id')
    .all(universId) as { id: number; titre: string; visible: number }[];
  return lignes.filter((l) => niveau === 'mj' || l.visible === 1)
    .map((l) => ({ id: l.id, titre: l.titre, visible: l.visible === 1 }));
}

/** Seed-only (stub mode): the invented trial galaxy. Never exposed by a route. */
export function semerGalaxieEssai(db: Db, universId: number): number {
  if (env.KANEVAS_STUB !== '1' && env.NODE_ENV !== 'test') throw refuse();
  return db.transaction(() => {
    const g = Number(db.prepare(`INSERT INTO swn_galaxies (univers_id, titre, visible, graine, densite_defaut)
      VALUES (?, 'Galaxie d''essai', 1, 'essai-1', 0.2)`).run(universId).lastInsertRowid);
    const sys = db.prepare(`INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const id = (cle: string, nom: string, q: number, r: number, taille: number, couleur: string, notes: string, secret: number) =>
      Number(sys.run(g, universId, cle, nom, q, r, taille, couleur, notes, secret).lastInsertRowid);
    const port = id('port-sel', 'Port-Sel', 0, 0, 3, 'bleu', 'Un port franc, inventé.', 0);
    const vael = id('vael', 'Vael', 7, 0, 2, 'vert', 'Un monde agricole, inventé.', 0);
    const hesper = id('hesper', 'Hesper', 1, 5, 2, 'ambre', 'Une station minière, inventée.', 0);
    id('station-fantome', 'Station fantôme', -4, 2, 1, 'rouge', 'Secret du MJ, inventé.', 1);
    const route = db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?, ?, ?, ?, ?, ?)');
    route.run(g, universId, port, vael, 1, 7);
    route.run(g, universId, vael, hesper, 1, 6);
    route.run(g, universId, port, hesper, 0, 6);
    db.prepare(`INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret)
      VALUES (?, ?, 'marches-interdites', 'Marches interdites', '[[-12,2],[-4,2],[-4,8],[-12,8]]', 'rouge', 0, 1)`).run(g, universId);
    return g;
  })();
}
