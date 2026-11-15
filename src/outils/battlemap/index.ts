import { compterAssets, compterDirection, effacerDonneesBattlemap } from '../../services/battlemap-donnees.js';
import { cartesComposees, compterCartes, creerCarte, effacerCartes, rendreVisibleCarte, supprimerCarte, utilisationsCartes } from '../../services/battlemap-cartes.js';
import type { DeclarationAide, DeclarationCarte, DeclarationModule, LigneDonnees } from '../declaration.js';

const ligne = (cle: string, singulier: string, pluriel: string, nombre: number): LigneDonnees => ({ cle, singulier, pluriel, nombre });

/** The asset library and the art direction (AD-150): what `compter` lists is what `effacer` removes; the files stay. */
export const battlemapAssets: DeclarationAide = {
  cle: 'battlemap/assets', libelle: 'Bibliothèque', description: 'Les assets de la battle map et sa direction artistique.',
  type: 'aide', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [], reglages: {},
  ecran: { libelle: 'Bibliothèque', icone: 'Images' },
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
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [], reglages: {},
  ecran: { libelle: 'Cartes', icone: 'Map' },
  cartes: (db, acteur, universId) => cartesComposees(db, acteur, universId),
  creation: {
    libelle: 'Carte composée',
    creer: (db, acteur, universId, titre, taille) => creerCarte(db, acteur, universId, { titre, ...taille }),
    rendreVisible: (db, acteur, universId, id, visible, version) => rendreVisibleCarte(db, acteur, universId, id, visible, version),
    supprimer: (db, acteur, universId, id) => supprimerCarte(db, acteur, universId, id),
  },
  donnees: {
    compter: (db, portee) => (portee.niveau === 'univers' ? compterCartes(db, portee.universId) : []),
    effacer(db, portee) {
      if (portee.niveau === 'univers') effacerCartes(db, portee.universId);
    },
    utilisations: (db, systemeId) => utilisationsCartes(db, systemeId),
  },
};

export const battlemap: DeclarationModule = {
  nom: 'battlemap', libelle: 'Battle map', reglagesCommuns: {}, outils: [battlemapAssets, battlemapCartes],
  // Loaded at registration of the routes (same cycle as `swn`).
  routes: async (app, garde) => {
    (await import('./routes.js')).routesBattlemap(app, garde);
  },
};
