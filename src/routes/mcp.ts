import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { catalogueDe } from '../services/assistant/catalogue.js';
import type { Outil, Resultat } from '../services/assistant/types.js';
import { resoudreUnivers } from '../services/cles.js';
import { sousOrigine } from '../services/historique.js';
import { niveauEffectif, universDuJeton, verifierJeton } from '../services/jetons.js';
import { registerErreurs } from './erreurs.js';

/** Body cap of the MCP door (AD-mcp-1). */
export const MAX_CORPS_MCP = 1024 * 1024;

const JETON_INVALIDE = { message: 'Jeton invalide.', code: 'jeton_invalide' };
const INTROUVABLE = 'Introuvable.';

interface AccesMcp {
  jetonId: number;
  compteId: number;
  /** Absent on bare `/mcp`. */
  universId?: number;
  niveau?: 'lecture' | 'ecriture';
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The verified access of the MCP door; never set elsewhere. */
    accesMcp: AccesMcp | null;
  }
}

/** An MCP text result from a tool result: a refusal is a tool error with the interface's words (AD-mcp-5). */
function versResultatMcp(r: Resultat) {
  if (!r.ok) return { isError: true, content: [{ type: 'text' as const, text: r.erreur }] };
  const texte = JSON.stringify(r.evenement ? { ...(r.donnees as object), evenement: r.evenement } : r.donnees);
  return { content: [{ type: 'text' as const, text: texte }] };
}

/** `lister_univers` of bare `/mcp` (AD-mcp-1): the universes the token reaches, with the address to configure. */
function outilListerUnivers(app: FastifyInstance, acces: AccesMcp): Outil {
  return {
    nom: 'lister_univers',
    description:
      'Liste les univers que ce jeton atteint, avec l\'adresse MCP de chacun (`adresse`, à configurer pour travailler dans cet univers), 20 par page, et un `curseur` pour la page suivante (`null` à la dernière).',
    schema: z.strictObject({ curseur: z.string().min(1).optional() }),
    executer(args) {
      const p = z.strictObject({ curseur: z.string().min(1).optional() }).safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      const page = universDuJeton(app.db, { id: acces.jetonId, compteId: acces.compteId }, p.data.curseur);
      return {
        ok: true,
        donnees: {
          univers: page.univers.map((u) => ({
            cle: u.cle, nom: u.nom, niveau: u.niveau, role: u.role, adresse: `/mcp/${u.cle}`,
          })),
          curseur: page.suivant,
        },
      };
    },
  };
}

/** One server per request (stateless, AD-mcp-1): the tools of the door, closed over the caller. */
function serveurDe(app: FastifyInstance, acces: AccesMcp): Server {
  const outils: Outil[] = acces.universId === undefined
    ? [outilListerUnivers(app, acces)]
    : catalogueDe(app.db, acces.compteId, acces.universId, {
      porte: 'mcp', niveau: acces.niveau, jeton: { id: acces.jetonId },
    }).outils;
  const serveur = new Server({ name: 'kanevas', version: '1' }, { capabilities: { tools: {} } });
  serveur.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: outils.map((o) => ({
      name: o.nom,
      description: o.description,
      inputSchema: z.toJSONSchema(o.schema) as { type: 'object'; [k: string]: unknown },
    })),
  }));
  serveur.setRequestHandler(CallToolRequestSchema, async (requete) => {
    const outil = outils.find((o) => o.nom === requete.params.name);
    // A name the door does not offer (a player's `lire_historique` included) is the same « Introuvable. ».
    if (!outil) return versResultatMcp({ ok: false, erreur: INTROUVABLE });
    // Every write of the call carries the origin `mcp` and the token (AD-147), set here and never by a tool.
    const r = await sousOrigine(
      { origine: 'mcp', compteId: acces.compteId, jetonId: acces.jetonId },
      async () => outil.executer(requete.params.arguments ?? {}),
    );
    return versResultatMcp(r);
  });
  return serveur;
}

/**
 * `/mcp` and `/mcp/:univers` (AD-145, AD-mcp-1): the MCP door, beside the session guard like `/api/v1` — only a
 * `Bearer kvs_…` content token opens it, the cookie is never read. Streamable HTTP, stateless, JSON answers.
 */
export async function registerMcpRoutes(app: FastifyInstance) {
  app.decorateRequest('accesMcp', null);

  await app.register(async (scope) => {
    registerErreurs(scope);
    scope.addHook('onRoute', (route) => {
      route.bodyLimit = MAX_CORPS_MCP;
    });

    scope.addHook('onRequest', async (request, reply) => {
      request.accesMcp = null;
      // An agent is not a browser (the spec asks servers to check `Origin`).
      if (request.headers.origin !== undefined) {
        return reply.code(403).send({ message: 'Origine refusée.', code: 'origine_refusee' });
      }
      const entete = request.headers.authorization;
      const m = typeof entete === 'string' ? /^Bearer (\S+)$/.exec(entete) : null;
      const jeton = m ? verifierJeton(app.db, m[1]!, app.horloge()) : null;
      // A tool token opens no content route (K-6): the same refusal as any other.
      if (!jeton || jeton.outils.length > 0) return reply.code(401).send(JETON_INVALIDE);
      const { univers: cle } = request.params as { univers?: string };
      if (cle === undefined) {
        request.accesMcp = { jetonId: jeton.id, compteId: jeton.compteId };
        return;
      }
      // Unknown, out of the token's reach, or no current role: the same 404 (AD-144).
      const univers = resoudreUnivers(app.db, cle);
      const { niveau } = univers ? niveauEffectif(app.db, jeton, univers.id) : { niveau: 'aucun' as const };
      if (!univers || niveau === 'aucun') return reply.code(404).send({ message: INTROUVABLE });
      request.accesMcp = { jetonId: jeton.id, compteId: jeton.compteId, universId: univers.id, niveau };
    });

    const poster = async (request: FastifyRequest, reply: import('fastify').FastifyReply) => {
      const serveur = serveurDe(app, request.accesMcp!);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      reply.hijack();
      reply.raw.on('close', () => {
        void transport.close();
        void serveur.close();
      });
      await serveur.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    };
    const refuser = async (_request: FastifyRequest, reply: import('fastify').FastifyReply) =>
      reply.code(405).header('Allow', 'POST').send({ message: 'Méthode non permise.' });

    for (const chemin of ['/mcp', '/mcp/:univers']) {
      scope.post(chemin, poster);
      scope.get(chemin, refuser);
      scope.delete(chemin, refuser);
    }
  });
}
