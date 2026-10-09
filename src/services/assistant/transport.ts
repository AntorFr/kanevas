import type { Outil } from './types.js';

/** One message of the thread the client keeps (AD-28: the server stores nothing). */
export interface MessageFil {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What a transport receives for one request (AD-73). The tools are the
 * caller's catalogue, already closed over account, universe and role: the
 * transport only exposes them, it never decides what a person may do.
 */
export interface DemandeAgent {
  systeme: string;
  historique: MessageFil[];
  message: string;
  outils: Outil[];
  /** Aborted by the orchestration at the deadline (AD-75). */
  abort: AbortController;
}

/**
 * The agent port (AD-73), distinct from the text transport of Antre-du-maitre.
 * Narrow on purpose: a new tool (images, proposals) joins the catalogue and
 * needs no change here. Events are collected by the orchestration around the
 * tools, not returned by the transport.
 */
export interface AgentTransport {
  readonly nom: string;
  /** Runs the agent and returns its final text. Throws on any failure. */
  repondre(demande: DemandeAgent): Promise<string>;
}
