import { compterAssets, compterDirection, compterLots, effacerDonneesBattlemap, effacerLots } from '../../services/battlemap-donnees.js';
import { cartesComposees, compterCartes, creerCarte, effacerCartes, rendreVisibleCarte, supprimerCarte, utilisationsCartes } from '../../services/battlemap-cartes.js';
import { lignesTables } from '../../services/battlemap-tables.js';
import { choisirAdaptateur } from '../../services/images/index.js';
import { outilsAssets, outilsCartes, outilsGeneration } from './assistant.js';
import type { DeclarationAide, DeclarationCarte, DeclarationGenerateur, DeclarationModule, LigneDonnees } from '../declaration.js';

const ligne = (cle: string, singulier: string, pluriel: string, nombre: number): LigneDonnees => ({ cle, singulier, pluriel, nombre });

/**
 * The generation of assets (AD-157): absent from the registry without an image engine (AD-88, decided at each read). Its
 * rows are counted and erased before the library's (lines and batches first; `outils` lists it first).
 */
export const battlemapGeneration: DeclarationGenerateur = {
  cle: 'battlemap/generation', libelle: 'Génération', description: 'Génère des assets de battle map par lots dans le style de l’univers.',
  type: 'generateur', portee: 'tous', dependances: ['battlemap/assets'],
  visibiliteParDefaut: { mj: true, joueur: false }, usages: [{ nom: 'concevoir', mjSeul: true }], reglages: {},
  ecran: { libelle: 'Génération', icone: 'Sparkles' },
  disponible: () => choisirAdaptateur().nom !== 'aucun',
  outilsAssistant: outilsGeneration,
  donnees: {
    compter(db, portee) {
      if (portee.niveau !== 'univers') return [];
      const c = compterLots(db, portee.universId);
      return [
        ligne('lots', 'lot de génération', 'lots de génération', c.lots),
        ligne('lignes', 'ligne de lot', 'lignes de lot', c.lignes),
      ];
    },
    effacer(db, portee) {
      if (portee.niveau === 'univers') effacerLots(db, portee.universId);
    },
  },
};

/** The asset library and the art direction (AD-150): what `compter` lists is what `effacer` removes; the files stay. */
export const battlemapAssets: DeclarationAide = {
  cle: 'battlemap/assets', libelle: 'Bibliothèque', description: 'Les assets de la battle map et sa direction artistique.',
  type: 'aide', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [], reglages: {},
  ecran: { libelle: 'Bibliothèque', icone: 'Images' },
  outilsAssistant: outilsAssets,
  donnees: {
    compter(db, portee) {
      if (portee.niveau !== 'univers') return [];
      const d = compterDirection(db, portee.universId);
      return [
        ligne('assets', 'asset', 'assets', compterAssets(db, portee.universId)),
        ligne('references', 'image de référence', 'images de référence', d.references),
        ligne('direction', 'direction artistique', 'directions artistiques', d.texte),
      ];
    },
    effacer(db, portee) {
      if (portee.niveau !== 'univers') return;
      effacerDonneesBattlemap(db, portee.universId);
    },
  },
};

/** The composed maps (AD-155): listed in E-10 like the galaxy, created with their size; the table slice adds its own rows later. */
export const battlemapCartes: DeclarationCarte = {
  cle: 'battlemap/cartes', libelle: 'Cartes', description: 'Les cartes composées de la battle map : sols, murs, assets, calques.',
  type: 'carte', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [],
  reglages: {
    tailleCase: {
      libelle: 'Taille de case par défaut', aide: 'En pixels, de 20 à 300 ; appliquée aux cartes créées ensuite.',
      niveau: 'systeme+univers', forme: { type: 'nombre', min: 20, max: 300, entier: true }, defaut: 70,
    },
    jeu_a_distance: {
      libelle: 'Jeu à distance', aide: 'Les joueurs déplacent eux-mêmes leurs pions sur la table.',
      niveau: 'univers', forme: { type: 'booleen' }, defaut: true,
    },
  },
  ecran: { libelle: 'Cartes', icone: 'Map' },
  cartes: (db, acteur, universId) => cartesComposees(db, acteur, universId),
  outilsAssistant: outilsCartes,
  creation: {
    libelle: 'Carte composée',
    creer: (db, acteur, universId, titre, taille) => creerCarte(db, acteur, universId, { titre, ...taille }),
    rendreVisible: (db, acteur, universId, id, visible, version) => rendreVisibleCarte(db, acteur, universId, id, visible, version),
    supprimer: (db, acteur, universId, id) => supprimerCarte(db, acteur, universId, id),
  },
  donnees: {
    compter: (db, portee) => (portee.niveau === 'univers' ? [...compterCartes(db, portee.universId), ...lignesTables(db, portee.universId)] : []),
    effacer(db, portee) {
      if (portee.niveau === 'univers') effacerCartes(db, portee.universId);
    },
    utilisations: (db, systemeId) => utilisationsCartes(db, systemeId),
  },
};

export const battlemap: DeclarationModule = {
  nom: 'battlemap', libelle: 'Battle map', reglagesCommuns: {}, outils: [battlemapGeneration, battlemapAssets, battlemapCartes],
  // Loaded at registration of the routes (same cycle as `swn`).
  routes: async (app, garde) => {
    (await import('./routes.js')).routesBattlemap(app, garde);
  },
};
