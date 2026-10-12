import type { Db } from '../../db/db.js';
import { env } from '../../config/env.js';
import { BouchonTransport } from './bouchon.js';
import { catalogueDe } from './catalogue.js';
import { ClaudeAgentTransport } from './claude-agent.js';
import { disponibilite, type ConfigAssistant } from './disponibilite.js';
import { ErreurAssistant } from './erreurs.js';
import { INSTRUCTION_SYSTEME } from './instruction.js';
import type { AgentTransport, MessageFil } from './transport.js';
import type { AdaptateurChoisi } from '../images/index.js';
import type { ContexteDemande, Evenement, Outil, Resultat } from './types.js';

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
  /** Image engine of the catalogue; default: the one the configuration picks (AD-88). */
  images?: AdaptateurChoisi;
  /** Aborted when the client leaves: stops the engine, nothing is attached (AD-89). */
  signal?: AbortSignal;
}

/**
 * The deadline of a request (AD-75). It stops while a `horsDelai` tool runs (AD-90: the time spent
 * in the image tool is not counted), and resumes with what was left.
 */
class Echeance {
  private minuteur: NodeJS.Timeout | undefined;
  private reste: number;
  private debut = 0;
  private enCours = 0;
  readonly depasse: Promise<never>;

  constructor(
    delaiMs: number,
    private readonly surDelai: () => void,
  ) {
    this.reste = delaiMs;
    let rejeter!: (e: Error) => void;
    this.depasse = new Promise<never>((_, rejet) => (rejeter = rejet));
    this.depasse.catch(() => {});
    this.rejeter = rejeter;
    this.armer();
  }
  private rejeter: (e: Error) => void;

  private armer() {
    this.debut = Date.now();
    this.minuteur = setTimeout(() => {
      this.surDelai();
      this.rejeter(new Error('delai'));
    }, this.reste);
  }

  pause() {
    if (this.enCours++ > 0) return;
    clearTimeout(this.minuteur);
    this.reste = Math.max(0, this.reste - (Date.now() - this.debut));
  }

  reprendre() {
    if (--this.enCours > 0) return;
    this.armer();
  }

  arreter() {
    clearTimeout(this.minuteur);
  }
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

  const catalogue = catalogueDe(db, compteId, universId, deps.images);
  const evenements: Evenement[] = [];
  const abort = new AbortController();
  const echeance = new Echeance(deps.delaiMs ?? DELAI_MS, () => abort.abort());
  if (deps.signal) {
    if (deps.signal.aborted) abort.abort();
    else deps.signal.addEventListener('abort', () => abort.abort(), { once: true });
  }
  // Shared by every tool call of this request (AD-89: one image per request).
  const contexte: ContexteDemande = { signal: abort.signal };
  const collecter = (r: Resultat): Resultat => {
    if (r.ok && r.evenement) evenements.push(r.evenement);
    return r;
  };
  const outils: Outil[] = catalogue.outils.map((o) => ({
    ...o,
    executer(args, c = contexte) {
      if (!o.horsDelai) {
        const r = o.executer(args, c);
        return r instanceof Promise ? r.then(collecter) : collecter(r);
      }
      echeance.pause();
      return Promise.resolve(o.executer(args, c)).then(collecter).finally(() => echeance.reprendre());
    },
  }));

  try {
    const texte = await Promise.race([
      transport.repondre({
        systeme: INSTRUCTION_SYSTEME,
        historique: historique.slice(-MAX_HISTORIQUE),
        message,
        outils,
        abort,
      }),
      echeance.depasse,
    ]);
    return { reponse: texte, evenements };
  } catch {
    abort.abort();
    throw new ErreurAssistant('assistant_erreur', "L'assistant n'a pas pu répondre.");
  } finally {
    echeance.arreter();
  }
}
