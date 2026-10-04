import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ErreurApi, lire } from './api';
import type { Moi, UniversListe } from './types';

type Charge<T> = { etat: 'chargement' } | { etat: 'erreur'; statut?: number } | { etat: 'ok'; valeur: T };

export function useCharge<T>(chemin: string): [Charge<T>, () => void] {
  const [etat, setEtat] = useState<Charge<T>>({ etat: 'chargement' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setEtat({ etat: 'chargement' });
    lire<T>(chemin).then(
      (valeur) => actif && setEtat({ etat: 'ok', valeur }),
      (e: unknown) => actif && setEtat({ etat: 'erreur', statut: e instanceof ErreurApi ? e.statut : undefined }),
    );
    return () => {
      actif = false;
    };
  }, [chemin, essai]);
  return [etat, () => setEssai((n) => n + 1)];
}

interface Cadre {
  moi: Charge<Moi>;
  univers: Charge<UniversListe[]>;
  /** Reloads the list of universes (after a creation, or « Réessayer »). */
  recharger: () => void;
}

const Contexte = createContext<Cadre | null>(null);

/** Data shared by the frame and the screens: who I am and my universes. */
export function FournisseurCadre({ children }: { children: ReactNode }) {
  const [moi] = useCharge<Moi>('/api/moi');
  const [univers, recharger] = useCharge<UniversListe[]>('/api/univers');
  const valeur = useMemo(
    () => ({ moi, univers, recharger }),
    [moi, univers, recharger],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

function useCadre(): Cadre {
  const c = useContext(Contexte);
  if (!c) throw new Error('FournisseurCadre manquant');
  return c;
}

export const useMoi = () => useCadre().moi;
export const useUnivers = () => {
  const { univers, recharger } = useCadre();
  return { univers, recharger };
};

/** Ceiling of a section's content, once `/api/moi` has answered; `undefined` before (or if it failed): the screen then checks nothing. */
export function useLimiteContenu(): number | undefined {
  const moi = useContext(Contexte)?.moi;
  return moi?.etat === 'ok' ? moi.valeur.limites?.contenuSection : undefined;
}
