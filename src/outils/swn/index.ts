import { cartesGalaxies } from '../../services/swn/galaxies.js';
import { catalogueVaisseaux } from '../../services/swn/catalogue-vaisseaux.js';
import { apresEcriture, produire, versionSource } from '../../services/swn/section-vaisseaux.js';
import { outilTrajet } from './assistant.js';
import type { DeclarationCarte, DeclarationGenerateur, DeclarationModule } from '../declaration.js';

export const swnGalaxie: DeclarationCarte = {
  cle: 'swn/galaxie', libelle: 'Galaxie', description: 'La carte hexagonale de la galaxie, systèmes, routes et territoires.',
  type: 'carte', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [], reglages: {},
  ecran: { libelle: 'Galaxie', icone: 'Map' },
  cartes: (db, acteur, universId) => cartesGalaxies(db, acteur, universId),
  outilsAssistant: outilTrajet,
};

/** The ship designer (V-1): its section « Caractéristiques » is written by `services/swn/conceptions.ts` (V-4, V-5). */
export const swnVaisseaux: DeclarationGenerateur = {
  cle: 'swn/vaisseaux', libelle: 'Concepteur de vaisseaux', description: 'Conçoit un vaisseau sur le catalogue de coques et d\'équipements.',
  type: 'generateur', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true },
  usages: [{ nom: 'concevoir', mjSeul: false }, { nom: 'creer', mjSeul: true }],
  reglages: {},
  catalogue: catalogueVaisseaux,
  ecran: { libelle: 'Concepteur de vaisseaux', icone: 'Rocket' },
  sections: [{
    type: 'caracteristiques', libelle: 'Caractéristiques', usage: 'concevoir', recalcul: 'geste', composant: true,
    // Lazy: the services import the registry, which imports this file (a cycle).
    versionSource: (ctx) => versionSource(ctx),
    produire: (ctx) => produire(ctx),
    apresEcriture: (ctx, ecrit) => apresEcriture(ctx, ecrit),
  }],
};

/** The module `swn` applies to every game system: `systemes_jeu` has no key (G-1). */
export const swn: DeclarationModule = {
  nom: 'swn', libelle: 'Stars Without Number',
  reglagesCommuns: {
    portee_saut: { libelle: 'Portée de saut', aide: 'Cases par niveau de moteur : la portée est p × (moteur + 1).',
      niveau: 'systeme+univers', forme: { type: 'nombre', min: 1, max: 20, entier: true }, defaut: 5 },
  },
  outils: [swnGalaxie, swnVaisseaux],
  // Loaded at registration of the routes: a static import closes a cycle
  // (registre → swn → routes → routes/fiches → fiches → types-fiche → droits → outils → registre).
  routes: async (app, garde) => (await import('./routes.js')).routesGalaxie(app, garde),
};
