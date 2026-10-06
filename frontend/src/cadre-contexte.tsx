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
  const [mode, setMode] = useState<ModeVue>('mj');
  const [bascule, setBascule] = useState(false);
  const [titre, setTitre] = useState<string>();
  const vue = useMemo(() => ({ mode, setMode, bascule, setBascule, titre, setTitre }), [mode, bascule, titre]);
  return (
    <Contexte.Provider value={valeur}>
      <ContexteVue.Provider value={vue}>{children}</ContexteVue.Provider>
    </Contexte.Provider>
  );
}

/** « Mode MJ » / « Mode Joueur » (AD-39): the GM looks at a sheet as a player would. */
export type ModeVue = 'mj' | 'joueur';

interface Vue {
  mode: ModeVue;
  setMode: (m: ModeVue) => void;
  /** A screen offers the toggle: the top bar shows it. */
  bascule: boolean;
  setBascule: (b: boolean) => void;
  /** Last crumb of the breadcrumb, set by the screen that knows it (a sheet's title). */
  titre?: string;
  setTitre: (t?: string) => void;
}

const ContexteVue = createContext<Vue>({
  mode: 'mj',
  setMode: () => {},
  bascule: false,
  setBascule: () => {},
  setTitre: () => {},
});

/** What the frame needs to draw the top bar: the mode, whether to offer the toggle, the last crumb. */
export const useVue = () => useContext(ContexteVue);

/**
 * A screen that has a GM / player view calls this with « the caller is GM »: the top bar then offers
 * the toggle, and the current mode comes back. Leaving the screen withdraws the toggle and resets the mode.
 */
export function useBasculeMode(active: boolean): ModeVue {
  const { mode, setMode, setBascule } = useVue();
  useEffect(() => {
    setBascule(active);
    if (!active) setMode('mj');
    return () => {
      setBascule(false);
      setMode('mj');
    };
  }, [active, setBascule, setMode]);
  return active ? mode : 'mj';
}

/** Gives the breadcrumb its last crumb (the whole text, truncated by the bar if long). */
export function useTitreAriane(titre: string | undefined): void {
  const { setTitre } = useVue();
  useEffect(() => {
    setTitre(titre);
    return () => setTitre(undefined);
  }, [titre, setTitre]);
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
