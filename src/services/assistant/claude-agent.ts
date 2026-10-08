import { createSdkMcpServer, query as queryReelle, tool } from '@anthropic-ai/claude-agent-sdk';
import type { MessageFil } from './transport.js';
import type { AgentTransport, DemandeAgent } from './transport.js';
import { ErreurTransport } from './erreurs.js';
import type { Outil } from './types.js';

/** Name of the in-process MCP server, hence the prefix of every tool (AD-73). */
export const SERVEUR = 'kanevas';
export const MAX_TOURS = 12;

type Query = typeof queryReelle;

export interface OptionsClaudeAgent {
  /** Value of CLAUDE_CODE_OAUTH_TOKEN, read by the configuration module only. */
  jeton: string;
  modele: string;
  /** Replaced by a fake in tests. */
  query?: Query;
}

/** `mcp__kanevas__<outil>`: the only names the agent may call. */
export const nomMcp = (outil: Outil) => `mcp__${SERVEUR}__${outil.nom}`;

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : JSON.stringify(valeur);
}

function serveur(outils: Outil[]) {
  return createSdkMcpServer({
    name: SERVEUR,
    version: '1.0.0',
    tools: outils.map((o) =>
      tool(o.nom, o.description, o.schema.shape, async (args) => {
        const r = o.executer(args);
        return r.ok
          ? { content: [{ type: 'text' as const, text: texte(r.donnees) }] }
          : { content: [{ type: 'text' as const, text: r.erreur }], isError: true };
      }),
    ),
  });
}

/** The thread is folded into the single prompt the SDK takes (AD-75: no server state). */
function prompt(historique: MessageFil[], message: string): string {
  if (historique.length === 0) return message;
  const fil = historique
    .map((m) => `${m.role === 'user' ? 'Personne' : 'Assistant'} : ${m.content}`)
    .join('\n');
  return `Conversation jusqu'ici :\n${fil}\n\nNouveau message de la personne :\n${message}`;
}

/**
 * Agent SDK adapter (AD-54, AD-73): the Claude subscription, no built-in tool
 * (`tools: []`), no setting loaded from the pod, only the catalogue's tools.
 */
export class ClaudeAgentTransport implements AgentTransport {
  readonly nom = 'claude-agent';

  constructor(private readonly options: OptionsClaudeAgent) {}

  async repondre(demande: DemandeAgent): Promise<string> {
    const query = this.options.query ?? queryReelle;
    let resultat: string | null = null;

    for await (const m of query({
      prompt: prompt(demande.historique, demande.message),
      options: {
        systemPrompt: demande.systeme,
        model: this.options.modele,
        tools: [],
        settingSources: [],
        permissionMode: 'dontAsk',
        maxTurns: MAX_TOURS,
        abortController: demande.abort,
        mcpServers: { [SERVEUR]: serveur(demande.outils) },
        allowedTools: demande.outils.map(nomMcp),
        env: { CLAUDE_CODE_OAUTH_TOKEN: this.options.jeton },
      },
    })) {
      if (m.type === 'result' && m.subtype === 'success') resultat = m.result;
    }

    if (resultat === null) throw new ErreurTransport("Le SDK n'a rendu aucune réponse.");
    return resultat.trim();
  }
}
