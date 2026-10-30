import type { DeclarationAide } from '../declaration.js';
export const essaiB: DeclarationAide = {
  cle: 'essai/b', libelle: 'Essai B', description: "Une aide de jeu dépendant d'Essai A.",
  type: 'aide', portee: 'tous', dependances: ['essai/a'],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [], reglages: {},
  ecran: { libelle: 'Essai B', icone: 'BookOpen' },
};
