import { z } from 'zod';
import { roleDe, vueMJ } from '../../services/droits.js';
import { resoudreOutil } from '../../services/outils.js';
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
    const cartes = [{ id: 1, titre: 'Carte visible', visible: true }, { id: 2, titre: 'Carte MJ', visible: false }];
    return vueMJ(role, acteur) ? cartes : cartes.filter((c) => c.visible);
  },
  outilsAssistant: ({ db, universId }) => [{
    nom: 'essai_a_decrire', description: "Décrire l'outil Essai A et la valeur de « Pas de charges de carburant ».",
    schema: z.strictObject({}),
    executer(args) {
      if (!z.strictObject({}).safeParse(args ?? {}).success) return { ok: false, erreur: 'Paramètres invalides.' };
      const r = resoudreOutil(db, universId, 'essai/a');
      return { ok: true, donnees: { libelle: essaiA.libelle,
        sansChargesCarburant: r.reglages.sansChargesCarburant!.valeur } };
    },
  }],
};
