import {
  BookOpen,
  Dna,
  FileText,
  Gem,
  Hourglass,
  Lightbulb,
  MapPin,
  PawPrint,
  Scale,
  ScrollText,
  Shield,
  Ship,
  StickyNote,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

import { lire } from './api';
import { useUnivers } from './cadre-contexte';

/** A type as `GET /api/univers/:id/types` returns it (AD-113): the server owns the list, nothing is copied here. */
export interface TypeVue {
  type: string;
  slug: string;
  singulier: string;
  pluriel: string;
  nouveau: string;
  aucun: string;
  icone: string;
  reglable: boolean;
  active: boolean;
  origine: 'univers' | 'systeme' | 'defaut';
  forcage: 'active' | 'desactive' | null;
  systeme?: boolean | null;
  nbFiches?: number;
}

/** The Lucide name the server sends → its component. An unknown name falls back to a sheet icon. */
const ICONES: Record<string, LucideIcon> = {
  'users-round': UsersRound,
  'map-pin': MapPin,
  shield: Shield,
  gem: Gem,
  hourglass: Hourglass,
  'scroll-text': ScrollText,
  'paw-print': PawPrint,
  dna: Dna,
  ship: Ship,
  lightbulb: Lightbulb,
  'book-open': BookOpen,
  scale: Scale,
  'sticky-note': StickyNote,
  'file-text': FileText,
};

export const iconeDeNom = (nom: string | undefined): LucideIcon => (nom ? ICONES[nom] : undefined) ?? FileText;

export type EtatTypes = { etat: 'chargement' } | { etat: 'erreur' } | { etat: 'ok' };

export interface TypesUnivers {
  /** `ok` once a list has been read; a later failure keeps the last list (lost connection, refetch). */
  etat: EtatTypes['etat'];
  types: TypeVue[];
  recharger: () => void;
}

const Contexte = createContext<TypesUnivers>({ etat: 'chargement', types: [], recharger: () => {} });

/**
 * The types of the universe in the address, read once and shared (bar, list, creation, map window,
 * badge). Re-read when the tab comes back, never in the middle of a keystroke: the list is replaced
 * only if it changed. Without a role in the universe nothing is requested.
 */
export function FournisseurTypes({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { univers } = useUnivers();
  const brut = matchPath({ path: '/univers/:id/*' }, pathname)?.params.id;
  const id = brut && /^\d+$/.test(brut) ? Number(brut) : null;
  const connu = id !== null && univers.etat === 'ok' && univers.valeur.some((u) => u.id === id);
  const cible = connu ? id : null;
  const [etat, setEtat] = useState<{ univers: number | null; etat: EtatTypes['etat']; types: TypeVue[] }>({
    univers: null,
    etat: 'chargement',
    types: [],
  });
  const [essai, setEssai] = useState(0);
  const courant = useRef(cible);
  courant.current = cible;

  useEffect(() => {
    if (cible === null) return;
    let actif = true;
    lire<TypeVue[]>(`/api/univers/${cible}/types`).then(
      (types) =>
        actif &&
        setEtat((e) => {
          const meme = e.univers === cible && e.etat === 'ok' && JSON.stringify(e.types) === JSON.stringify(types);
          return meme ? e : { univers: cible, etat: 'ok', types };
        }),
      () =>
        actif &&
        // A list already read for this universe stays; otherwise it is the error state.
        setEtat((e) => (e.univers === cible && e.etat === 'ok' ? e : { univers: cible, etat: 'erreur', types: [] })),
    );
    return () => {
      actif = false;
    };
  }, [cible, essai]);

  useEffect(() => {
    if (cible === null) return;
    const retour = () => {
      if (document.visibilityState === 'visible') setEssai((n) => n + 1);
    };
    document.addEventListener('visibilitychange', retour);
    return () => document.removeEventListener('visibilitychange', retour);
  }, [cible]);

  const recharger = useCallback(() => {
    setEtat((e) => (e.etat === 'erreur' ? { univers: e.univers, etat: 'chargement', types: [] } : e));
    setEssai((n) => n + 1);
  }, []);

  const valeur = useMemo<TypesUnivers>(
    () =>
      etat.univers === cible && cible !== null
        ? { etat: etat.etat, types: etat.types, recharger }
        : { etat: 'chargement', types: [], recharger },
    [etat, cible, recharger],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export const useTypes = () => useContext(Contexte);

/** The type whose address is `slug`, whether enabled or not (a disabled type's list still opens). */
export const typeParSlug = (types: TypeVue[], slug: string | undefined) => types.find((t) => t.slug === slug);
export const typeParType = (types: TypeVue[], type: string) => types.find((t) => t.type === type);
export const typesActifs = (types: TypeVue[]) => types.filter((t) => t.active);

/** The label of a type, its identifier while the list is not read. */
export const libelleDuType = (types: TypeVue[], type: string) => typeParType(types, type)?.singulier ?? type;

/** The badge of a sheet: PJ or PNJ for a character, the type's label otherwise. */
export function badgeFiche(types: TypeVue[], f: { type: string; charge: { pj?: boolean } }): string {
  if (f.type === 'personnage') return f.charge.pj ? 'PJ' : 'PNJ';
  return libelleDuType(types, f.type);
}

/** The icon of a sheet type, the same as its sidebar item. */
export const iconeDuType = (types: TypeVue[], type: string): LucideIcon => iconeDeNom(typeParType(types, type)?.icone);
