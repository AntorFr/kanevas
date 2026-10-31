import type { DeclarationModule } from '../declaration.js';
import { essaiA } from './a.js';
import { essaiB } from './b.js';
import { essaiG } from './g.js';
export const essai: DeclarationModule = {
  nom: 'essai', libelle: 'Essai', outils: [essaiA, essaiB, essaiG],
  // Loaded at registration of the routes: `routes.ts` reaches `services/fiches.ts`, and a static import would close a cycle
  // (registre → essai → routes → sections-gerees → fiches → types-fiche → droits → outils → registre).
  routes: async (app, garde) => (await import('./routes.js')).routesEssai(app, garde),
  reglagesCommuns: { portee: { libelle: "Portée d'essai", niveau: 'systeme+univers',
    forme: { type: 'nombre', min: 1, max: 6 }, defaut: 1 } },
};
