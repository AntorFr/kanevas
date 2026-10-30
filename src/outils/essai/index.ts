import type { DeclarationModule } from '../declaration.js';
import { essaiA } from './a.js';
import { essaiB } from './b.js';
import { essaiG } from './g.js';
export const essai: DeclarationModule = {
  nom: 'essai', libelle: 'Essai', outils: [essaiA, essaiB, essaiG],
  reglagesCommuns: { portee: { libelle: "Portée d'essai", niveau: 'systeme+univers',
    forme: { type: 'nombre', min: 1, max: 6 }, defaut: 1 } },
};
