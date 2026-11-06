import type { Db } from '../../db/db.js';
import { TAILLE_BLOC } from '../../outils/swn/regles/generation.js';
import type { Point } from '../../outils/swn/regles/hex.js';
import { introuvable } from '../erreurs.js';
import type { Acteur } from '../types.js';
import { lireBlocsGeneres, validerRectangle, type BlocGenere, type CoordonneesBloc } from './cache-blocs.js';
import {
  galaxieLisible, routesLisibles, systemesLisibles, zonesLisibles,
  type LigneSysteme, type NiveauLecture,
} from './galaxies.js';

export interface SystemeVue {
  id: number; cle: string; nom: string; q: number; r: number; taille: number; couleur: string; secret?: boolean;
  version?: number;
}
export interface BoutRoute { cle: string; q: number; r: number }
export interface RouteVue { id: number; depuis: BoutRoute; vers: BoutRoute; longueur: number; publique?: boolean; version?: number; type_lien?: string }
export interface ZoneVue { id: number; nom: string; contour: Point[]; couleur: string; secret?: boolean; cle?: string; version?: number; densite?: number | null }
export interface VueBlocs { blocs: BlocGenere[]; systemes: SystemeVue[]; routes: RouteVue[]; zones: ZoneVue[] }

function systemeVue(s: LigneSysteme, niveau: NiveauLecture): SystemeVue {
  const vue: SystemeVue = { id: s.id, cle: s.cle, nom: s.nom, q: s.q, r: s.r, taille: s.taille, couleur: s.couleur };
  if (niveau === 'mj') { vue.secret = s.secret === 1; vue.version = s.version; }
  return vue;
}

/** Only the requested rectangle; routes may extend out of it when one end is inside (G-6). */
export function lireBlocs(
  db: Db, acteur: Acteur, universId: number, galaxieId: number,
  de: CoordonneesBloc, a: CoordonneesBloc,
): VueBlocs {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  validerRectangle(de, a);
  const qMin = de.bx * TAILLE_BLOC, qMax = (a.bx + 1) * TAILLE_BLOC - 1;
  const rMin = de.by * TAILLE_BLOC, rMax = (a.by + 1) * TAILLE_BLOC - 1;
  const dedans = (s: { q: number; r: number }) => s.q >= qMin && s.q <= qMax && s.r >= rMin && s.r <= rMax;
  const lisibles = systemesLisibles(db, galaxie.id, niveau);
  const parId = new Map(lisibles.map((s) => [s.id, s]));
  const dansVue = lisibles.filter(dedans);
  const definis = new Set(dansVue.map((s) => `${s.q},${s.r}`));
  const blocs = lireBlocsGeneres(db, acteur, universId, galaxie.id, de, a).map((b) => ({
    ...b, generes: b.generes.filter(([q, r]) => !definis.has(`${q},${r}`)),
  }));
  const routes: RouteVue[] = [];
  for (const ro of routesLisibles(db, galaxie.id, niveau)) {
    const d = parId.get(ro.depuis_id), v = parId.get(ro.vers_id);
    if (!d || !v || (!dedans(d) && !dedans(v))) continue;
    const route: RouteVue = { id: ro.id, depuis: { cle: d.cle, q: d.q, r: d.r },
      vers: { cle: v.cle, q: v.q, r: v.r }, longueur: ro.longueur };
    if (ro.type_lien !== null) route.type_lien = ro.type_lien;
    if (niveau === 'mj') { route.publique = ro.publique === 1; route.version = ro.version; }
    routes.push(route);
  }
  const zones: ZoneVue[] = [];
  for (const z of zonesLisibles(db, galaxie.id, niveau)) {
    const contour = JSON.parse(z.contour) as Point[];
    if (contour.length === 0) continue;
    const qs = contour.map((p) => p[0]), rs = contour.map((p) => p[1]);
    if (Math.max(...qs) < qMin || Math.min(...qs) > qMax || Math.max(...rs) < rMin || Math.min(...rs) > rMax) continue;
    const zone: ZoneVue = { id: z.id, nom: z.nom, contour, couleur: z.couleur };
    if (niveau === 'mj') { zone.secret = z.secret === 1; zone.cle = z.cle; zone.version = z.version; }
    zones.push(zone);
  }
  return { blocs, systemes: dansVue.map((s) => systemeVue(s, niveau)), routes, zones };
}

export interface PanneauSysteme {
  nom: string; q: number; r: number; taille: number; couleur: string; notes: string;
  routes: { avec: { cle: string; nom: string }; longueur: number }[];
  lien: string;
  /** Level `mj` only. */
  id?: number; secret?: boolean; promu?: boolean; version?: number;
}

/** The stable key is resolved among readable systems, including both ends of every route. */
export function lireSysteme(db: Db, acteur: Acteur, universId: number, galaxieId: number, cle: string): PanneauSysteme {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  const systemes = systemesLisibles(db, galaxie.id, niveau);
  const s = systemes.find((c) => c.cle === cle);
  if (!s) throw introuvable();
  const parId = new Map(systemes.map((c) => [c.id, c]));
  const routes: PanneauSysteme['routes'] = [];
  for (const ro of routesLisibles(db, galaxie.id, niveau)) {
    const voisin = ro.depuis_id === s.id ? ro.vers_id : ro.vers_id === s.id ? ro.depuis_id : null;
    const avec = voisin === null ? undefined : parId.get(voisin);
    if (avec) routes.push({ avec: { cle: avec.cle, nom: avec.nom }, longueur: ro.longueur });
  }
  const panneau: PanneauSysteme = { nom: s.nom, q: s.q, r: s.r, taille: s.taille, couleur: s.couleur, notes: s.notes, routes,
    lien: `/univers/${universId}/outils/swn/galaxie/${galaxie.id}?systeme=${encodeURIComponent(s.cle)}` };
  if (niveau === 'mj') Object.assign(panneau, { id: s.id, secret: s.secret === 1, promu: s.promu === 1, version: s.version });
  return panneau;
}

export interface ResultatRecherche { cle: string; nom: string; q: number; r: number }
const plier = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Search on readable names only; short queries still go through the galaxy guard. */
export function rechercherSystemes(
  db: Db, acteur: Acteur, universId: number, galaxieId: number, recherche: string,
): ResultatRecherche[] {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  const texte = plier(recherche.trim());
  if ([...texte].length < 2) return [];
  return systemesLisibles(db, galaxie.id, niveau)
    .filter((s) => plier(s.nom).includes(texte))
    .sort((x, y) => {
      const nx = plier(x.nom), ny = plier(y.nom);
      return nx < ny ? -1 : nx > ny ? 1 : x.cle < y.cle ? -1 : x.cle > y.cle ? 1 : 0;
    })
    .slice(0, 20).map(({ cle, nom, q, r }) => ({ cle, nom, q, r }));
}

/** One route of a galaxy as the blocks give it (level `mj` carries `publique` and `version`), by its id. */
export function lireRoute(db: Db, acteur: Acteur, universId: number, galaxieId: number, id: number): RouteVue {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  const parId = new Map(systemesLisibles(db, galaxie.id, niveau).map((s) => [s.id, s]));
  const ro = routesLisibles(db, galaxie.id, niveau).find((r) => r.id === id);
  const d = ro && parId.get(ro.depuis_id), v = ro && parId.get(ro.vers_id);
  if (!ro || !d || !v) throw introuvable();
  const route: RouteVue = { id: ro.id, depuis: { cle: d.cle, q: d.q, r: d.r }, vers: { cle: v.cle, q: v.q, r: v.r }, longueur: ro.longueur };
  if (ro.type_lien !== null) route.type_lien = ro.type_lien;
  if (niveau === 'mj') { route.publique = ro.publique === 1; route.version = ro.version; }
  return route;
}

/** One zone of a galaxy as the blocks give it, by its key. */
export function lireZone(db: Db, acteur: Acteur, universId: number, galaxieId: number, cle: string): ZoneVue {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  const z = zonesLisibles(db, galaxie.id, niveau).find((c) => c.cle === cle);
  if (!z) throw introuvable();
  const zone: ZoneVue = { id: z.id, nom: z.nom, contour: JSON.parse(z.contour) as Point[], couleur: z.couleur };
  if (niveau === 'mj') { zone.secret = z.secret === 1; zone.cle = z.cle; zone.version = z.version; zone.densite = z.densite; }
  return zone;
}
