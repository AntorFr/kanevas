import type { Db } from '../../db/db.js';
import { plusCourtChemin } from '../../outils/swn/regles/chemin.js';
import { libelleTrajet } from '../../outils/swn/regles/format.js';
import { introuvable, invalide } from '../erreurs.js';
import { resoudreOutil } from '../outils.js';
import type { Acteur } from '../types.js';
import { galaxieLisible, OUTIL_GALAXIE, routesLisibles, systemesLisibles } from './galaxies.js';

export interface DemandeTrajet {
  depart: string;
  arrivee: string;
  moteur?: number;
  routes?: 'toutes' | 'publiques';
}
export interface EtapeTrajet { cle: string; nom: string; q: number; r: number }
export interface TronconTrajet { depuis: string; vers: string; longueur: number; jours: number }
export type VueTrajet =
  | { trouve: false; libelle: string }
  | { trouve: true; etapes: EtapeTrajet[]; troncons: TronconTrajet[]; cases: number; jours: number; libelle: string };

/**
 * G-5: shortest length on readable stored routes, then the pure rule's tie-breaks.
 * A player's `toutes` has exactly the same result as `publiques`, without a signal.
 */
export function calculerTrajet(
  db: Db, acteur: Acteur, universId: number, galaxieId: number, demande: DemandeTrajet,
): VueTrajet {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  const systemes = systemesLisibles(db, galaxie.id, niveau);
  const parCle = new Map(systemes.map((s) => [s.cle, s]));
  if (!parCle.has(demande.depart) || !parCle.has(demande.arrivee)) throw introuvable();
  const moteur = demande.moteur === undefined ? 2 : demande.moteur;
  const choixRoutes = demande.routes === undefined ? 'toutes' : demande.routes;
  if (!Number.isInteger(moteur) || moteur < 1 || moteur > 6) {
    throw invalide('Choisissez un moteur de 1 à 6.');
  }
  if (choixRoutes !== 'toutes' && choixRoutes !== 'publiques') {
    throw invalide('Choisissez les routes toutes ou publiques.');
  }
  if (demande.depart === demande.arrivee) throw invalide('Choisissez deux systèmes différents.');
  const parId = new Map(systemes.map((s) => [s.id, s]));
  const routes = routesLisibles(db, galaxie.id, niveau)
    .filter((r) => choixRoutes === 'toutes' || r.publique === 1)
    .flatMap((r) => {
      const d = parId.get(r.depuis_id), v = parId.get(r.vers_id);
      return d && v ? [{ a: d.cle, b: v.cle, longueur: r.longueur }] : [];
    });
  const porteeSaut = Number(resoudreOutil(db, universId, OUTIL_GALAXIE).communs.reglages.portee_saut?.valeur ?? 5);
  const resultat = plusCourtChemin(routes, demande.depart, demande.arrivee, moteur, porteeSaut);
  if (!resultat.trouve) return { trouve: false, libelle: 'Aucun trajet avec ce moteur.' };
  return {
    trouve: true,
    etapes: resultat.systemes.map((cle) => {
      const s = parCle.get(cle)!;
      return { cle: s.cle, nom: s.nom, q: s.q, r: s.r };
    }),
    troncons: resultat.troncons.map((t) => ({ depuis: t.de, vers: t.vers, longueur: t.longueur, jours: t.longueur / moteur + 1 })),
    cases: resultat.cases, jours: resultat.jours, libelle: libelleTrajet(resultat.cases, resultat.jours),
  };
}
