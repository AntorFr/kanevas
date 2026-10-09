import { useSyncExternalStore } from 'react';

import { ErreurApi, appeler } from '../../api';

/** AD-75 limits, mirrored from the server: the screen refuses before the route does. */
export const MAX_MESSAGE = 2000;
export const MAX_HISTORIQUE = 20;

export type TypeEvenement = 'section_modifiee' | 'section_completee' | 'campagne_creee' | 'scenario_cree';

/** What an agent write adds to an answer (AD-76); the client builds the link from `cible`. */
export interface Evenement {
  type: TypeEvenement;
  libelle: string;
  cible: { type: 'fiche' | 'campagne' | 'scenario'; [cle: string]: string | number };
}

export interface MessageAffiche {
  role: 'user' | 'assistant';
  content: string;
  evenements?: Evenement[];
}

export type EtatFil = 'repos' | 'attente' | 'erreur';

export interface InstantaneFil {
  universId: number | null;
  messages: MessageAffiche[];
  etat: EtatFil;
  /** Text of the failure, when `etat` is `erreur`. */
  erreur?: string;
}

export const TEXTE_ERREUR = 'Je n’ai pas pu répondre — réessayer';
const TEXTE_OCCUPE = 'Une demande est déjà en cours. Patientez.';

/**
 * The thread lives here, in memory (AD-28): it outlives screens and the panel being closed, and is
 * written nowhere — not the browser storage, not the server. A page reload empties it; so does
 * a change of universe and « Nouvelle conversation ».
 */
let etat: InstantaneFil = { universId: null, messages: [], etat: 'repos' };
let generation = 0;
const abonnes = new Set<() => void>();

function poser(suite: InstantaneFil) {
  etat = suite;
  abonnes.forEach((f) => f());
}

export const instantane = () => etat;

export function useFil(): InstantaneFil {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat,
  );
}

/** A new universe starts an empty thread; an answer still in flight for the old one is dropped. */
export function choisirUnivers(universId: number | null) {
  if (etat.universId === universId) return;
  generation++;
  poser({ universId, messages: [], etat: 'repos' });
}

export function nouvelleConversation() {
  if (etat.etat === 'attente') return;
  generation++;
  poser({ universId: etat.universId, messages: [], etat: 'repos' });
}

async function demander(universId: number, message: string, historique: MessageAffiche[]) {
  const mine = ++generation;
  poser({ ...etat, etat: 'attente', erreur: undefined });
  try {
    const r = await appeler<{ reponse: string; evenements?: Evenement[] }>(
      'POST',
      `/api/univers/${universId}/assistant/messages`,
      {
        message,
        historique: historique.slice(-MAX_HISTORIQUE).map((m) => ({ role: m.role, content: m.content })),
      },
    );
    if (mine !== generation) return;
    poser({
      ...etat,
      etat: 'repos',
      messages: [...etat.messages, { role: 'assistant', content: r.reponse, evenements: r.evenements ?? [] }],
    });
  } catch (e) {
    if (mine !== generation) return;
    const occupe = e instanceof ErreurApi && e.statut === 429;
    poser({ ...etat, etat: 'erreur', erreur: occupe ? TEXTE_OCCUPE : TEXTE_ERREUR });
  }
}

/** Sends a question: it joins the thread once, whatever happens next. */
export function envoyer(texte: string) {
  if (etat.universId === null || etat.etat === 'attente') return;
  const historique = etat.messages;
  poser({ ...etat, messages: [...historique, { role: 'user', content: texte }] });
  void demander(etat.universId, texte, historique);
}

/** Sends the last question again, as is; it is not shown a second time. */
export function reessayer() {
  if (etat.universId === null || etat.etat !== 'erreur') return;
  const derniere = etat.messages[etat.messages.length - 1];
  if (!derniere || derniere.role !== 'user') return;
  void demander(etat.universId, derniere.content, etat.messages.slice(0, -1));
}
