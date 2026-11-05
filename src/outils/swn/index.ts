import { cartesGalaxies, creerGalaxie, rendreVisibleGalaxie } from '../../services/swn/galaxies.js';
import { catalogueVaisseaux, NATURES_VAISSEAU } from '../../services/swn/catalogue-vaisseaux.js';
import { apresEcriture, produire, versionSource } from '../../services/swn/section-vaisseaux.js';
import { apresEcritureRegles, produireRegles, versionSourceRegles } from '../../services/swn/regles-hooks.js';
import { produireDocument, versionSourceDocument } from '../../services/swn/document-source.js';
import { importerGalaxie, NATURES_GALAXIE } from '../../services/swn/import-galaxie.js';
import { NATURES_CONCEPTIONS } from '../../services/swn/natures-conceptions.js';
import { outilTrajet } from './assistant.js';
import { outilVaisseau } from './assistant-vaisseaux.js';
import type { DeclarationCarte, DeclarationGenerateur, DeclarationModule, SectionGeree } from '../declaration.js';

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

/** The seven rule and example sections (R-1): one loop over the natures; the type is the `cle` of `swn_fiches_generees`. */
const sectionsRegles: SectionGeree[] = NATURES_VAISSEAU.map((nature) => {
  const type = nature === 'exemples' ? 'exemples' : `regles-${nature}`;
  return {
    type, libelle: nature === 'exemples' ? 'Exemples' : 'Règles', usage: 'generer', recalcul: 'proposition',
    versionSource: (ctx) => versionSourceRegles(ctx.db, ctx.universId, type),
    produire: (ctx) => produireRegles(ctx.db, ctx.universId, type),
    apresEcriture: (ctx, ecrit) => apresEcritureRegles(ctx, ecrit),
  } satisfies SectionGeree;
});

/** The ship designer (V-1): its section « Caractéristiques » is written by `services/swn/conceptions.ts` (V-4, V-5). */
export const swnVaisseaux: DeclarationGenerateur = {
  cle: 'swn/vaisseaux', libelle: 'Concepteur de vaisseaux', description: 'Conçoit un vaisseau sur le catalogue de coques et d\'équipements.',
  type: 'generateur', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true },
  usages: [{ nom: 'concevoir', mjSeul: false }, { nom: 'creer', mjSeul: true }, { nom: 'generer', mjSeul: true }],
  reglages: {},
  catalogue: catalogueVaisseaux,
  // The route applies the file (`import-conceptions-lot.ts`): it needs the sheet services, which this declaration cannot import (M-1).
  importation: { natures: NATURES_CONCEPTIONS },
  ecran: { libelle: 'Concepteur de vaisseaux', icone: 'Rocket' },
  outilsAssistant: outilVaisseau,
  sections: [{
    type: 'caracteristiques', libelle: 'Caractéristiques', usage: 'concevoir', recalcul: 'geste', composant: true,
    // Lazy: the services import the registry, which imports this file (a cycle).
    versionSource: (ctx) => versionSource(ctx),
    produire: (ctx) => produire(ctx),
    apresEcriture: (ctx, ecrit) => apresEcriture(ctx, ecrit),
  }, ...sectionsRegles],
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
  routes: async (app, garde) => {
    const m = await import('./routes.js');
    m.routesGalaxie(app, garde);
    (await import('./routes-vaisseaux.js')).routesVaisseaux(app, garde);
  },
};
