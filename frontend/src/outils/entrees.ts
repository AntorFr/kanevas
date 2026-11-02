import { useEffect, useState } from 'react';

import { lire } from '../api';
import { outilClient } from './registre';
import type { EntreeOutil } from './types';

/** Fired by E-20 after every successful write (C-6): the bar asks the entries again. */
export const EVENEMENT_OUTILS = 'kanevas:outils-modifies';

/** Keeps the entries whose `module/outil` the client knows and shows in the bar (an unknown one, or one reached from its list, is not shown). */
export const entreesConnues = (entrees: EntreeOutil[]) => entrees.filter((e) => outilClient(e.cle) && !outilClient(e.cle)?.horsBarre);

/**
 * The tool entries the server shows this caller in this universe. While loading, or on an error,
 * there are none (the section is absent). `mode` is the GM's player mode: the bar then shows what a player sees.
 */
export function useEntreesOutils(universId: number | null, mode: 'mj' | 'joueur'): EntreeOutil[] {
  const [lu, setLu] = useState<{ cle: string; entrees: EntreeOutil[] } | null>(null);
  const [essai, setEssai] = useState(0);
  const cle = universId === null ? null : `${universId}${mode === 'joueur' ? '?mode=joueur' : ''}`;

  useEffect(() => {
    const surEvenement = () => setEssai((n) => n + 1);
    window.addEventListener(EVENEMENT_OUTILS, surEvenement);
    return () => window.removeEventListener(EVENEMENT_OUTILS, surEvenement);
  }, []);

  useEffect(() => {
    if (cle === null) return;
    let actif = true;
    lire<EntreeOutil[]>(`/api/univers/${universId}/outils/entrees${mode === 'joueur' ? '?mode=joueur' : ''}`).then(
      (entrees) => actif && setLu({ cle, entrees }),
      () => actif && setLu(null),
    );
    return () => {
      actif = false;
    };
  }, [cle, essai]); // eslint-disable-line react-hooks/exhaustive-deps

  return lu !== null && lu.cle === cle ? entreesConnues(lu.entrees) : [];
}
