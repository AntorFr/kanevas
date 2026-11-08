import { z } from 'zod';

import { ErreurService } from '../../services/erreurs.js';
import { NATURES_DE_LIGNE } from '../../services/swn/catalogue-vaisseaux.js';
import type { Outil, Resultat } from '../../services/assistant/types.js';
import type { ContexteOutil } from '../declaration.js';

const INTROUVABLE: Resultat = { ok: false, erreur: 'Introuvable.' };
const PLUSIEURS: Resultat = { ok: false, erreur: 'Plusieurs éléments portent ce nom.' };
const PRECISER: Resultat = { ok: false, erreur: 'Précisez une conception, ou une coque et des choix.' };
const plier = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

const schema = z.strictObject({
  conception: z.string().optional(),
  coque: z.string().optional(),
  equipage: z.number().int().min(0).max(100000).optional(),
  choix: z.array(z.strictObject({
    nature: z.enum(NATURES_DE_LIGNE), nom: z.string(), quantite: z.number().int().min(1).max(99).optional(),
  })).max(100).optional(),
});

/** `swn_vaisseau_calculer` (V-9, AD-136): names in, the object of `GET conceptions/:fid` or of `POST calcul` out; never an event. */
export function outilVaisseau({ db, acteur, universId }: ContexteOutil): Outil[] {
  /** The key of the one readable element of that nature carrying that name. */
  const cleDe = (
    resoudreElements: typeof import('../../services/catalogues.js').resoudreElements, OUTIL_VAISSEAUX: string, nature: string, nom: string,
  ): string | Resultat => {
    const m = resoudreElements(db, universId, OUTIL_VAISSEAUX, nature, { inclureMasques: false })
      .filter((e) => plier(e.nom) === plier(nom));
    if (m.length === 0) return INTROUVABLE;
    return m.length > 1 ? PLUSIEURS : m[0]!.cle;
  };
  return [{
    nom: 'swn_vaisseau_calculer',
    description: "Calcule un vaisseau : soit `conception` (le titre d'une conception lisible : son résultat enregistré et ses alertes), soit `coque` (nom) et `choix` (`nature` : moteurs, amenagements, defenses, armes ou modifications, `nom`, `quantite` facultative) et `equipage` facultatif (entier, le minimum de la coque par défaut) : vitesse, armure, équipage, prix, budgets, chantier, alertes. N'écrit rien.",
    schema,
    // The services are loaded at the call: a static import closes a cycle (see `index.ts`).
    async executer(args): Promise<Resultat> {
      const p = schema.safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      const { conception, coque, choix, equipage } = p.data;
      if ((conception !== undefined) === (coque !== undefined) || (conception !== undefined && (choix !== undefined || equipage !== undefined))) return PRECISER;
      const { resoudreElements } = await import('../../services/catalogues.js');
      const { calculerDepuisChoix, OUTIL_VAISSEAUX } = await import('../../services/swn/calcul-vaisseau.js');
      const { lireConception, listerConceptions } = await import('../../services/swn/conceptions.js');
      try {
        if (conception !== undefined) {
          const m = listerConceptions(db, acteur, universId).conceptions.filter((c) => plier(c.titre) === plier(conception));
          if (m.length === 0) return INTROUVABLE;
          if (m.length > 1) return PLUSIEURS;
          return { ok: true, donnees: lireConception(db, acteur, universId, m[0]!.ficheId) };
        }
        const c = cleDe(resoudreElements, OUTIL_VAISSEAUX, 'coques', coque!);
        if (typeof c !== 'string') return c;
        const lignes = [];
        for (const l of choix ?? []) {
          const cle = cleDe(resoudreElements, OUTIL_VAISSEAUX, l.nature, l.nom);
          if (typeof cle !== 'string') return cle;
          lignes.push({ nature: l.nature, cle, quantite: l.quantite ?? 1 });
        }
        return { ok: true, donnees: calculerDepuisChoix(db, acteur, universId, { coque: c, choix: lignes, equipage }) };
      } catch (e) {
        if (!(e instanceof ErreurService)) throw e;
        return e.code === 'introuvable' ? INTROUVABLE : { ok: false, erreur: e.message };
      }
    },
  }];
}
