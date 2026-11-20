import { lire } from '../api';

/**
 * After a mask or a withdrawal in E-20 (the catalogue block): a tool may add one sentence read from its own route
 * (E-22 « fiches de règles »). `null` = nothing to say. The common screen names no tool.
 */
export const LIGNE_APRES_MASQUAGE: Record<string, (universId: number) => Promise<string | null>> = {
  'swn/vaisseaux': async (universId) => {
    const fiches = await lire<{ etat: string; propositionId: number | null }[]>(`/api/univers/${universId}/outils/swn/vaisseaux/fiches-regles`);
    return fiches.some((f) => f.etat === 'perimee' && f.propositionId !== null)
      ? 'Les fiches de règles montrent encore cet élément : acceptez la mise à jour proposée.' : null;
  },
};
export const ligneApresMasquage = (cle: string) => (Object.hasOwn(LIGNE_APRES_MASQUAGE, cle) ? LIGNE_APRES_MASQUAGE[cle] : undefined);
