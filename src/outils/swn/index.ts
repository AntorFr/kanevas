import { cartesGalaxies } from '../../services/swn/galaxies.js';
import type { DeclarationCarte, DeclarationModule } from '../declaration.js';

export const swnGalaxie: DeclarationCarte = {
  cle: 'swn/galaxie', libelle: 'Galaxie', description: 'La carte hexagonale de la galaxie, systèmes, routes et territoires.',
  type: 'carte', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [], reglages: {},
  ecran: { libelle: 'Galaxie', icone: 'Map' },
  cartes: (db, acteur, universId) => cartesGalaxies(db, acteur, universId),
};

/** The module `swn` applies to every game system: `systemes_jeu` has no key (G-1). */
export const swn: DeclarationModule = {
  nom: 'swn', libelle: 'Stars Without Number',
  reglagesCommuns: {
    portee_saut: { libelle: 'Portée de saut', aide: 'Cases par niveau de moteur : la portée est p × (moteur + 1).',
      niveau: 'systeme+univers', forme: { type: 'nombre', min: 1, max: 20, entier: true }, defaut: 5 },
  },
  outils: [swnGalaxie],
};
