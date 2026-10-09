import type { Db } from '../../db/db.js';
import { env } from '../../config/env.js';
import { BouchonTransport } from './bouchon.js';
import { catalogueDe } from './catalogue.js';
import { ClaudeAgentTransport } from './claude-agent.js';
import { disponibilite, type ConfigAssistant } from './disponibilite.js';
import { ErreurAssistant } from './erreurs.js';
import { INSTRUCTION_SYSTEME } from './instruction.js';
import type { AgentTransport, MessageFil } from './transport.js';
import type { Evenement, Outil } from './types.js';

/** AD-75 limits, checked by the routes (400) and read by the screen. */
export const MAX_MESSAGE = 2000;
export const MAX_HISTORIQUE = 20;
export const DELAI_MS = 120_000;

export interface Reponse {
  reponse: string;
  evenements: Evenement[];
}

export interface DepsRepondre {
  config?: ConfigAssistant;
  /** Replaces the transport chosen by availability (tests). */
  transport?: AgentTransport;
  delaiMs?: number;
}

function transportDe(config: ConfigAssistant): AgentTransport {
  if (disponibilite(config) === 'bouchon') return new BouchonTransport();
  return new ClaudeAgentTransport({
    jeton: config.CLAUDE_CODE_OAUTH_TOKEN!.trim(),
    modele: config.ANTHROPIC_MODEL ?? env.ANTHROPIC_MODEL,
  });
}

/**
 * One request, one answer (AD-75). Availability is checked first: without a
 * token neither the stub nor the SDK is called (AD-77). The catalogue comes from
 * the role read in `membres` (no role → `introuvable`, AD-26); each tool is
 * wrapped to collect the events of its successful writes (AD-76). Any transport
 * failure or the deadline becomes `assistant_erreur`, whose message never carries
 * the cause (it could quote the token); no event is returned then.
 */
export async function repondre(
  db: Db,
  compteId: number,
  universId: number,
  message: string,
  historique: MessageFil[],
  deps: DepsRepondre = {},
): Promise<Reponse> {
  const config = deps.config ?? env;
  // Availability first (AD-77): without a token no adapter is even built.
  if (disponibilite(config) === 'aucune') {
    throw new ErreurAssistant('assistant_indisponible', "L'assistant n'est pas disponible.");
  }
  const transport = deps.transport ?? transportDe(config);

  const catalogue = catalogueDe(db, compteId, universId);
  const evenements: Evenement[] = [];
  const outils: Outil[] = catalogue.outils.map((o) => ({
    ...o,
    executer(args) {
      const r = o.executer(args);
      if (r.ok && r.evenement) evenements.push(r.evenement);
      return r;
    },
  }));

  const abort = new AbortController();
  let minuteur: NodeJS.Timeout | undefined;
  const delai = new Promise<never>((_, rejet) => {
    minuteur = setTimeout(() => {
      abort.abort();
      rejet(new Error('delai'));
    }, deps.delaiMs ?? DELAI_MS);
  });

  try {
    const texte = await Promise.race([
      transport.repondre({
        systeme: INSTRUCTION_SYSTEME,
        historique: historique.slice(-MAX_HISTORIQUE),
        message,
        outils,
        abort,
      }),
      delai,
    ]);
    return { reponse: texte, evenements };
  } catch {
    abort.abort();
    throw new ErreurAssistant('assistant_erreur', "L'assistant n'a pas pu répondre.");
  } finally {
    clearTimeout(minuteur);
  }
}
