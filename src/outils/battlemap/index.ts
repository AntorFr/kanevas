import { compterAssets, effacerAssets } from '../../services/battlemap-assets.js';
import { compterDirection, effacerDirection } from '../../services/battlemap-direction.js';
import type { DeclarationAide, DeclarationModule, LigneDonnees } from '../declaration.js';

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
      effacerAssets(db, portee.universId);
      effacerDirection(db, portee.universId);
    },
  },
};

export const battlemap: DeclarationModule = {
  nom: 'battlemap', libelle: 'Battle map', reglagesCommuns: {}, outils: [battlemapAssets],
};
