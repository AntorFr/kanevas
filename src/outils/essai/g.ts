import { catalogueEssai } from './catalogue.js';
import { resoudreOutil } from '../../services/outils.js';
import type { ContexteSection, DeclarationGenerateur } from '../declaration.js';

/** Source version: the `version_reglages` of the four rows (module/tool, universe/system); activation never moves it (AD-128). */
function versionSource({ db, universId }: ContexteSection): string {
  const r = resoudreOutil(db, universId, 'essai/g');
  return `reglages:${r.communs.versionReglages.univers}.${r.communs.versionReglages.systeme}/${r.versionReglages.univers}.${r.versionReglages.systeme}`;
}
const marge = (ctx: ContexteSection) => resoudreOutil(ctx.db, ctx.universId, 'essai/g').reglages.marge!.valeur;

export const essaiG: DeclarationGenerateur = {
  catalogue: catalogueEssai,
  cle: 'essai/g', libelle: 'Essai G', description: 'Un générateur pour éprouver la conception.',
  type: 'generateur', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [{ nom: 'concevoir', mjSeul: true }],
  reglages: { marge: { libelle: "Marge d'essai", niveau: 'univers',
    forme: { type: 'nombre', min: 0, max: 100 }, defaut: 10 } },
  ecran: { libelle: 'Essai G', icone: 'WandSparkles' },
  sections: [
    { type: 'caracteristiques', libelle: 'Caractéristiques', usage: 'concevoir', recalcul: 'geste', composant: true,
      versionSource,
      produire: (ctx) => ({ contenu: `Marge d'essai : ${marge(ctx)} %`, sourceVersion: versionSource(ctx) }) },
    { type: 'notes', libelle: 'Notes', usage: 'concevoir', recalcul: 'proposition',
      versionSource,
      produire: (ctx) => ({ contenu: `Notes — marge ${marge(ctx)} %`, sourceVersion: versionSource(ctx) }) },
  ],
};
