import type { DeclarationGenerateur } from '../declaration.js';
export const essaiG: DeclarationGenerateur = {
  cle: 'essai/g', libelle: 'Essai G', description: 'Un générateur pour éprouver la conception.',
  type: 'generateur', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [{ nom: 'concevoir', mjSeul: true }],
  reglages: { marge: { libelle: "Marge d'essai", niveau: 'univers',
    forme: { type: 'nombre', min: 0, max: 100 }, defaut: 10 } },
  ecran: { libelle: 'Essai G', icone: 'WandSparkles' },
};
