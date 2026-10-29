import { z } from 'zod';
import { roleDe, vueMJ } from '../../services/droits.js';
import type { DeclarationCarte } from '../declaration.js';

export const essaiA: DeclarationCarte = {
  cle: 'essai/a', libelle: 'Essai A', description: "Une carte pour éprouver le cadre des outils.",
  type: 'carte', portee: 'tous', dependances: [],
  visibiliteParDefaut: { mj: true, joueur: true }, usages: [],
  ecran: { libelle: 'Essai A', icone: 'Map' },
  reglages: {
    sansChargesCarburant: { libelle: 'Pas de charges de carburant', niveau: 'systeme+univers',
      forme: { type: 'booleen' }, defaut: false },
  },
  cartes(db, acteur, universId) {
    const role = roleDe(db, universId, acteur.compteId);
    if (!role) return [];
    const cartes = [{ titre: 'Carte visible', visible: true }, { titre: 'Carte MJ', visible: false }];
    return vueMJ(role, acteur) ? cartes : cartes.filter((c) => c.visible);
  },
  outilsAssistant: () => [{
    nom: 'essai_a_decrire', description: "Décrire l'outil Essai A.", schema: z.strictObject({}),
    executer(args) {
      if (!z.strictObject({}).safeParse(args ?? {}).success) return { ok: false, erreur: 'Paramètres invalides.' };
      return { ok: true, donnees: { description: essaiA.description } };
    },
  }],
};
