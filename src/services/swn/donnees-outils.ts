import type { Db } from '../../db/db.js';
import type { DonneesOutil, LigneDonnees, Portee } from '../../outils/declaration.js';
import { resoudreOutil } from '../outils.js';
import { compterConceptions, effacerConceptions } from './section-vaisseaux.js';
import { donneesGalaxiesDe, effacerGalaxiesDe } from './galaxies.js';
import { compterFichesGenerees, effacerFichesGenerees } from './regles-hooks.js';
import { OUTIL_VAISSEAUX } from './calcul-vaisseau.js';

// What the two SWN tools keep besides sheets and catalogue, counted and erased for the core (D-1, D-3, D-4).
// The system level holds no data of these tools but the catalogue (the core's): `compter` and `effacer` do nothing there.

const ligne = (cle: string, singulier: string, pluriel: string, nombre: number): LigneDonnees => ({ cle, singulier, pluriel, nombre });

export const donneesGalaxie: DonneesOutil = {
  compter(db, portee) {
    if (portee.niveau !== 'univers') return [];
    const d = donneesGalaxiesDe(db, portee.universId);
    return [ligne('systemes', 'système', 'systèmes', d.systemes), ligne('routes', 'route', 'routes', d.routes),
      ligne('zones', 'zone', 'zones', d.zones)];
  },
  effacer(db, portee: Portee) {
    if (portee.niveau === 'univers') effacerGalaxiesDe(db, portee.universId);
  },
};

export const donneesVaisseaux: DonneesOutil = {
  compter(db, portee) {
    if (portee.niveau !== 'univers') return [];
    return [ligne('conceptions', 'conception', 'conceptions', compterConceptions(db, portee.universId)),
      ligne('fiches-generees', 'fiche de règles générée', 'fiches de règles générées', compterFichesGenerees(db, portee.universId))];
  },
  effacer(db, portee) {
    if (portee.niveau !== 'univers') return;
    effacerConceptions(db, portee.universId);
    effacerFichesGenerees(db, portee.universId);
  },
  /** The designs of the universes of the system where the designer is on: they keep reading the system's catalogue. */
  utilisations(db, systemeId) {
    const univers = db.prepare('SELECT id FROM univers WHERE systeme_id = ?').all(systemeId) as { id: number }[];
    const nombre = univers.filter((u) => resoudreOutil(db, u.id, OUTIL_VAISSEAUX).active)
      .reduce((n, u) => n + compterConceptions(db, u.id), 0);
    return [ligne('conceptions', 'conception', 'conceptions', nombre)];
  },
};
