import type { Db } from '../../db/db.js';
import { randomBytes } from 'node:crypto';
import { roleDe, vueMJ } from '../droits.js';
import { ErreurService, introuvable, refuse } from '../erreurs.js';
import { retirerSectionGeree } from '../retrait-section.js';
import { accessible, resoudreOutil } from '../outils.js';
import { env } from '../../config/env.js';
import type { Acteur } from '../types.js';
import { densiteParDefaut } from './tirage-etoiles.js';

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
  id: number; galaxie_id: number; depuis_id: number; vers_id: number; publique: number; longueur: number; version: number; type_lien: string | null;
}
export interface LigneZone {
  id: number; galaxie_id: number; cle: string; nom: string; contour: string; plages: string | null; couleur: string;
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
  { id: number; titre: string; visible: boolean; version: number }[] {
  const niveau = niveauLecture(db, acteur, universId);
  if (!niveau) return [];
  const lignes = db.prepare('SELECT id, titre, visible, version FROM swn_galaxies WHERE univers_id = ? ORDER BY titre COLLATE NOCASE, id')
    .all(universId) as { id: number; titre: string; visible: number; version: number }[];
  return lignes.filter((l) => niveau === 'mj' || l.visible === 1)
    .map((l) => ({ id: l.id, titre: l.titre, visible: l.visible === 1, version: l.version }));
}

const acteurDe = (a: Acteur | number): Acteur => typeof a === 'number' ? { compteId: a } : a;
const invalideChamp = (champ: string, message: string) => new ErreurService('invalide', message, undefined, champ);
const MODE_JOUEUR = () => new ErreurService('refuse', 'Passez en mode MJ pour faire cela.', 'mode_joueur');
const PERIME = () => new ErreurService('conflit', "Cette galaxie a changé depuis que vous l'avez ouverte.", 'donnee_modifiee');

/** What a level that is not the GM's gets when it tries to write: the player-mode GM is told why (T-1). */
function refusDeLecteur(db: Db, acteur: Acteur, universId: number): ErreurService {
  return roleDe(db, universId, acteur.compteId) === 'mj' && acteur.modeJoueur ? MODE_JOUEUR() : refuse();
}

/** Guard of the creation, where there is no galaxy yet (T-1): same levels, same words as `exigerEcritureGalaxie`. */
export function exigerMJOutil(db: Db, acteur: Acteur | number, universId: number): void {
  const a = acteurDe(acteur);
  const niveau = niveauLecture(db, a, universId);
  if (!niveau) throw introuvable();
  if (niveau !== 'mj') throw refusDeLecteur(db, a, universId);
}

/** The one place a write to a galaxy is allowed (T-1); returns the galaxy row. */
export function exigerEcritureGalaxie(db: Db, acteur: Acteur | number, universId: number, galaxieId: number): LigneGalaxie {
  const a = acteurDe(acteur);
  const { galaxie, niveau } = galaxieLisible(db, a, universId, galaxieId);
  if (niveau !== 'mj') throw refusDeLecteur(db, a, universId);
  return galaxie;
}

function titreValide(titre: unknown): string {
  const t = typeof titre === 'string' ? titre.trim() : '';
  if (t.length < 1 || t.length > 80) throw invalideChamp('titre', 'Le titre : de 1 à 80 caractères.');
  return t;
}
const versionValide = (version: unknown): number => {
  if (!Number.isInteger(version) || (version as number) < 1) throw invalideChamp('version', 'Version invalide.');
  return version as number;
};
/** Bumps the galaxy's `version` with one update, or `conflit` when the caller's version is stale. */
function modifier(db: Db, galaxie: LigneGalaxie, version: number, colonnes: string, valeurs: unknown[]): { version: number } {
  if (galaxie.version !== version) throw PERIME();
  db.prepare(`UPDATE swn_galaxies SET ${colonnes}, version = version + 1 WHERE id = ? AND version = ?`)
    .run(...valeurs, galaxie.id, version);
  return { version: version + 1 };
}

export function creerGalaxie(db: Db, acteur: Acteur | number, universId: number, { titre }: { titre: unknown }): { id: number } {
  exigerMJOutil(db, acteur, universId);
  const t = titreValide(titre);
  const graine = randomBytes(6).toString('hex');
  const id = Number(db.prepare(`INSERT INTO swn_galaxies (univers_id, titre, visible, graine, densite_defaut, version)
    VALUES (?, ?, 0, ?, ?, 1)`).run(universId, t, graine, densiteParDefaut()).lastInsertRowid);
  return { id };
}

export function renommerGalaxie(db: Db, acteur: Acteur | number, universId: number, galaxieId: number,
  { titre, version }: { titre: unknown; version: unknown }): { version: number } {
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, acteur, universId, galaxieId);
    const t = titreValide(titre);
    return modifier(db, g, versionValide(version), 'titre = ?', [t]);
  })();
}

export function rendreVisibleGalaxie(db: Db, acteur: Acteur | number, universId: number, galaxieId: number,
  visible: unknown, version: unknown): { version: number } {
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, acteur, universId, galaxieId);
    if (typeof visible !== 'boolean') throw invalideChamp('visible', 'Visibilité invalide.');
    return modifier(db, g, versionValide(version), 'visible = ?', [visible ? 1 : 0]);
  })();
}

/** The seed moves every generated system; the defined ones keep their `(q, r)` (AD-132). The server holds the confirmation. */
export function changerGraine(db: Db, acteur: Acteur | number, universId: number, galaxieId: number,
  { graine, version, confirme }: { graine: unknown; version: unknown; confirme: unknown }): { version: number } {
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, acteur, universId, galaxieId);
    if (confirme !== true) throw invalideChamp('confirme', 'Confirmez le changement de graine.');
    const v = typeof graine === 'string' ? graine.trim() : '';
    if (v.length < 1 || v.length > 64) throw invalideChamp('graine', 'La graine : de 1 à 64 caractères.');
    return modifier(db, g, versionValide(version), 'graine = ?', [v]);
  })();
}

/** The seed, read by the GM's « Graine… » dialog (it is not part of the galaxy's view). */
export function lireGraine(db: Db, acteur: Acteur | number, universId: number, galaxieId: number): { graine: string } {
  return { graine: exigerEcritureGalaxie(db, acteur, universId, galaxieId).graine };
}

export interface DecomptesGalaxie { systemes: number; routes: number; zones: number }
function decomptes(db: Db, galaxieId: number): DecomptesGalaxie {
  const n = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE galaxie_id = ?`).get(galaxieId) as { n: number }).n;
  return { systemes: n('swn_systemes'), routes: n('swn_routes'), zones: n('swn_zones') };
}

/** What the deletion dialog states: the counts and the title of the document sheet, if any. */
export function contenuGalaxie(db: Db, acteur: Acteur | number, universId: number, galaxieId: number):
  DecomptesGalaxie & { document: { ficheId: number; titre: string } | null } {
  const g = exigerEcritureGalaxie(db, acteur, universId, galaxieId);
  const fiche = g.fiche_id === null ? undefined
    : db.prepare('SELECT titre FROM fiches WHERE id = ?').get(g.fiche_id) as { titre: string } | undefined;
  return { ...decomptes(db, g.id), document: fiche && g.fiche_id !== null ? { ficheId: g.fiche_id, titre: fiche.titre } : null };
}

export function supprimerGalaxie(db: Db, acteur: Acteur | number, universId: number, galaxieId: number,
  version: unknown, vu: unknown): void {
  const a = acteurDe(acteur);
  db.transaction(() => {
    const g = exigerEcritureGalaxie(db, a, universId, galaxieId);
    const v = versionValide(version);
    const vus = vu as Partial<DecomptesGalaxie> | null | undefined;
    if (!vus || !Number.isInteger(vus.systemes) || !Number.isInteger(vus.routes) || !Number.isInteger(vus.zones)) {
      throw invalideChamp('vu', 'Décomptes invalides.');
    }
    if (g.version !== v) throw PERIME();
    const reel = decomptes(db, g.id);
    if (reel.systemes !== vus.systemes || reel.routes !== vus.routes || reel.zones !== vus.zones) {
      throw new ErreurService('conflit',
        `Le contenu de la galaxie a changé : ${reel.systemes} système(s), ${reel.routes} route(s), ${reel.zones} zone(s).`,
        'contenu_change');
    }
    // The managed document section goes with the galaxy; the sheet stays (T-6, AD-135).
    if (g.fiche_id !== null && g.section_id !== null) retirerSectionGeree(db, a.compteId, universId, g.fiche_id, g.section_id);
    effacerGalaxie(db, g.id);
  })();
}

/** The rows of a galaxy, its systems, routes and zones with it (cascade). No guard, no `vu`: the callers carry them (D-1). */
export function effacerGalaxie(db: Db, galaxieId: number): void {
  db.prepare('DELETE FROM swn_galaxies WHERE id = ?').run(galaxieId);
}

/** Everything the galaxy tool keeps in one universe, for the deletion summary and the erasure of the tool's data (D-1). */
export function donneesGalaxiesDe(db: Db, universId: number): { galaxies: number } & DecomptesGalaxie {
  const n = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE univers_id = ?`).get(universId) as { n: number }).n;
  return { galaxies: n('swn_galaxies'), systemes: n('swn_systemes'), routes: n('swn_routes'), zones: n('swn_zones') };
}
export function effacerGalaxiesDe(db: Db, universId: number): void {
  for (const { id } of db.prepare('SELECT id FROM swn_galaxies WHERE univers_id = ?').all(universId) as { id: number }[]) effacerGalaxie(db, id);
}

/** Seed-only (stub mode): the invented trial galaxy. Never exposed by a route. */
export function semerGalaxieEssai(db: Db, universId: number): number {
  if (env.KANEVAS_STUB !== '1' && env.NODE_ENV !== 'test') throw refuse();
  return db.transaction(() => {
    const g = Number(db.prepare(`INSERT INTO swn_galaxies (univers_id, titre, visible, graine, densite_defaut)
      VALUES (?, 'Galaxie d''essai', 1, 'essai-1', ?)`).run(universId, densiteParDefaut()).lastInsertRowid);
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
