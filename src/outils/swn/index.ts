import { cartesGalaxies, creerGalaxie, rendreVisibleGalaxie } from '../../services/swn/galaxies.js';
import { produireDocument, versionSourceDocument } from '../../services/swn/document-source.js';
import { importerGalaxie, NATURES_GALAXIE } from '../../services/swn/import-galaxie.js';
import { outilTrajet } from './assistant.js';
import type { DeclarationCarte, DeclarationModule } from '../declaration.js';

export const swnGalaxie: DeclarationCarte = {
  cle: 'swn/galaxie', libelle: 'Galaxie', description: 'La carte hexagonale de la galaxie, systèmes, routes et territoires.',
  type: 'carte', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [{ nom: 'maintenir', mjSeul: true }], reglages: {},
  ecran: { libelle: 'Galaxie', icone: 'Map' },
  cartes: (db, acteur, universId) => cartesGalaxies(db, acteur, universId),
  outilsAssistant: outilTrajet,
  importation: { natures: NATURES_GALAXIE, appliquer: importerGalaxie },
  sections: [{
    type: 'document_mj', libelle: 'Document MJ', usage: 'maintenir', recalcul: 'proposition',
    versionSource: versionSourceDocument, produire: produireDocument,
  }],
  creation: {
    libelle: 'Carte de la galaxie',
    creer: (db, acteur, universId, titre) => creerGalaxie(db, acteur, universId, { titre }),
    rendreVisible: (db, acteur, universId, id, visible, version) => rendreVisibleGalaxie(db, acteur, universId, id, visible, version),
  },
};

/** The module `swn` applies to every game system: `systemes_jeu` has no key (G-1). */
export const swn: DeclarationModule = {
  nom: 'swn', libelle: 'Stars Without Number',
  reglagesCommuns: {
    portee_saut: { libelle: 'Portée de saut', aide: 'Cases par niveau de moteur : la portée est p × (moteur + 1).',
      niveau: 'systeme+univers', forme: { type: 'nombre', min: 1, max: 20, entier: true }, defaut: 5 },
  },
  outils: [swnGalaxie],
  // Loaded at registration of the routes: a static import closes a cycle
  // (registre → swn → routes → routes/fiches → fiches → types-fiche → droits → outils → registre).
  routes: async (app, garde) => (await import('./routes.js')).routesGalaxie(app, garde),
};
