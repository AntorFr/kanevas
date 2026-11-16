import type { ChoixAcces, LigneAcces } from '../../ui';
import type { Role } from '../../types';

export type Niveau = 'lecture' | 'ecriture' | 'aucun';

export interface AccesVue {
  universId: number;
  nom: string;
  niveau: Niveau;
}

/** A token as the routes of `/api/compte/jetons` and `/api/instance/jetons` return it. */
export interface JetonVue {
  id: number;
  compteId: number;
  nom: string;
  creeLe: string;
  expireLe: string;
  revoqueLe: string | null;
  revoquePar: number | null;
  dernierUsageLe: string | null;
  tous: boolean;
  niveauTous: 'lecture' | 'ecriture' | null;
  univers: AccesVue[];
  modifieParAdmin: { par: number; le: string } | null;
  etat: 'actif' | 'revoque' | 'expire';
  proprietaire: string;
}

/** A universe the owner may choose. */
export interface UniversChoix {
  id: number;
  cle: string;
  nom: string;
  role: Role;
}

export const MOT_NIVEAU: Record<Niveau, string> = { lecture: 'lecture', ecriture: 'lecture + écriture', aucun: '—' };

/** The accesses of the form, as the body of a creation or a change (`AccesEntree` of the service). */
export interface FormeAcces {
  tous: boolean;
  niveauTous: 'lecture' | 'ecriture';
  /** One entry per universe, by id: with `tous` the exceptions (`comme` = none), else the list (`aucun` by default). */
  exceptions: Record<number, ChoixAcces>;
  liste: Record<number, ChoixAcces>;
}

export function formeVide(): FormeAcces {
  return { tous: true, niveauTous: 'ecriture', exceptions: {}, liste: {} };
}

/** The form filled with the accesses of a token (the owner's and the admin's alike). */
export function formeDe(j: JetonVue): FormeAcces {
  const par: Record<number, ChoixAcces> = {};
  for (const u of j.univers) par[u.universId] = u.niveau;
  return {
    tous: j.tous,
    niveauTous: j.niveauTous ?? 'ecriture',
    exceptions: j.tous ? par : {},
    liste: j.tous ? {} : par,
  };
}

/** One line per universe the owner may choose, plus the ones the token keeps and the account has left. */
export function lignesDe(univers: UniversChoix[], forme: FormeAcces, j?: JetonVue): LigneAcces[] {
  const valeurs = forme.tous ? forme.exceptions : forme.liste;
  const defaut: ChoixAcces = forme.tous ? 'comme' : 'aucun';
  const lignes: LigneAcces[] = univers.map((u) => ({ id: u.id, nom: u.nom, role: u.role, valeur: valeurs[u.id] ?? defaut }));
  const connus = new Set(univers.map((u) => u.id));
  for (const a of j?.univers ?? []) {
    if (!connus.has(a.universId)) lignes.push({ id: a.universId, nom: a.nom, role: null, valeur: valeurs[a.universId] ?? defaut });
  }
  return lignes;
}

/** The body `acces` sent to the service. */
export function corpsAcces(forme: FormeAcces): unknown {
  if (forme.tous) {
    const univers = Object.entries(forme.exceptions)
      .filter(([, v]) => v !== 'comme')
      .map(([id, niveau]) => ({ universId: Number(id), niveau }));
    return { tous: true, niveauTous: forme.niveauTous, univers };
  }
  const univers = Object.entries(forme.liste)
    .filter(([, v]) => v !== 'aucun' && v !== 'comme')
    .map(([id, niveau]) => ({ universId: Number(id), niveau }));
  return { tous: false, univers };
}

/** At least one universe above « — » in a list. */
export const listeVide = (forme: FormeAcces): boolean =>
  !forme.tous && !Object.entries(forme.liste).some(([id, v]) => v !== 'aucun' && v !== 'comme');

export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** « dernier usage il y a 3 min », « jamais utilisé ». */
export function dernierUsage(iso: string | null, maintenant: number): string {
  if (!iso) return 'jamais utilisé';
  const min = Math.max(0, Math.floor((maintenant - Date.parse(iso)) / 60000));
  if (min < 1) return 'dernier usage à l’instant';
  if (min < 60) return `dernier usage il y a ${min} min`;
  if (min < 24 * 60) return `dernier usage il y a ${Math.floor(min / 60)} h`;
  return `dernier usage le ${dateCourte(iso)}`;
}

/** The meta line of a token: created, last use, expiry. */
export function metaJeton(j: JetonVue, maintenant: number): string[] {
  return [
    `créé le ${dateCourte(j.creeLe)}`,
    dernierUsage(j.dernierUsageLe, maintenant),
    j.etat === 'expire' ? `expiré le ${dateCourte(j.expireLe)}` : `expire le ${dateCourte(j.expireLe)}`,
  ];
}
