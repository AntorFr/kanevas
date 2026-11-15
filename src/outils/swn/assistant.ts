import { z } from 'zod';

import { ErreurService } from '../../services/erreurs.js';
import { cartesGalaxies, galaxieLisible } from '../../services/swn/galaxies.js';
import { systemesLisibles } from '../../services/swn/galaxies.js';
import { calculerTrajet } from '../../services/swn/trajet.js';
import type { Outil, Resultat } from '../../services/assistant/types.js';
import type { ContexteOutil } from '../declaration.js';

const INTROUVABLE: Resultat = { ok: false, erreur: 'Introuvable.' };
const plier = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

const schema = z.strictObject({
  galaxie: z.string().optional(),
  depart: z.string(),
  arrivee: z.string(),
  moteur: z.number().int().min(1).max(6).optional(),
  routes: z.enum(['toutes', 'publiques']).optional(),
});

/** `swn_galaxie_trajet` (G-9): names in, the object of the journey route out; never an event. */
export function outilTrajet({ db, acteur, universId }: ContexteOutil): Outil[] {
  return [{
    nom: 'swn_galaxie_trajet',
    description: "Calcule le trajet le plus court entre deux systèmes d'une galaxie, par leurs noms. `moteur` de 1 à 6 (2 par défaut), `routes` : `toutes` ou `publiques`. `galaxie` est facultative si une seule galaxie est lisible.",
    schema,
    executer(args): Resultat {
      const p = schema.safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      const { galaxie, depart, arrivee, moteur, routes } = p.data;
      try {
        const lisibles = cartesGalaxies(db, acteur, universId);
        let choisie = lisibles[0];
        if (galaxie !== undefined) {
          const trouvees = lisibles.filter((g) => plier(g.titre) === plier(galaxie));
          if (trouvees.length > 1) return { ok: false, erreur: 'Précisez la galaxie.' };
          choisie = trouvees[0];
        } else if (lisibles.length > 1) return { ok: false, erreur: 'Précisez la galaxie.' };
        if (!choisie) return INTROUVABLE;
        const { galaxie: g, niveau } = galaxieLisible(db, acteur, universId, choisie.id);
        const systemes = systemesLisibles(db, g.id, niveau);
        const cleDe = (nom: string): string | Resultat => {
          const m = systemes.filter((s) => plier(s.nom) === plier(nom));
          if (m.length === 0) return INTROUVABLE;
          if (m.length > 1) return { ok: false, erreur: 'Plusieurs systèmes portent ce nom.' };
          return m[0]!.cle;
        };
        const d = cleDe(depart);
        if (typeof d !== 'string') return d;
        const a = cleDe(arrivee);
        if (typeof a !== 'string') return a;
        return { ok: true, donnees: calculerTrajet(db, acteur, universId, g.id, { depart: d, arrivee: a, moteur, routes }) };
      } catch (e) {
        if (!(e instanceof ErreurService)) throw e;
        return e.code === 'introuvable' ? INTROUVABLE : { ok: false, erreur: e.message };
      }
    },
  }];
}
