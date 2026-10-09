import type { FastifyInstance } from 'fastify';

import { exigerRole } from '../services/droits.js';
import { disponibilite } from '../services/assistant/disponibilite.js';
import { ErreurAssistant } from '../services/assistant/erreurs.js';
import { MAX_HISTORIQUE, MAX_MESSAGE, repondre } from '../services/assistant/repondre.js';
import type { MessageFil } from '../services/assistant/transport.js';
import { env } from '../config/env.js';
import { invalide } from '../services/erreurs.js';
import { corps } from './fiches.js';
import { idDeChemin } from './univers.js';

function lireMessage(valeur: unknown): string {
  if (typeof valeur !== 'string' || valeur.trim() === '' || valeur.length > MAX_MESSAGE) {
    throw invalide(`Le message doit faire de 1 à ${MAX_MESSAGE} caractères.`);
  }
  return valeur;
}

function lireHistorique(valeur: unknown): MessageFil[] {
  if (valeur === undefined) return [];
  if (!Array.isArray(valeur) || valeur.length > MAX_HISTORIQUE) {
    throw invalide(`L'historique ne peut pas dépasser ${MAX_HISTORIQUE} messages.`);
  }
  return valeur.map((m) => {
    const o = m as { role?: unknown; content?: unknown } | null;
    if (
      !o ||
      typeof o !== 'object' ||
      (o.role !== 'user' && o.role !== 'assistant') ||
      typeof o.content !== 'string'
    ) {
      throw invalide('Historique invalide.');
    }
    return { role: o.role, content: o.content };
  });
}

/**
 * Assistant routes (AD-75): thin, everything goes through `repondre`. One request
 * at a time per account, held in this process (single instance, AD-5), released
 * on success, error and deadline.
 */
export function registerAssistantRoutes(app: FastifyInstance) {
  const occupes = new Set<number>();
  const idUnivers = (request: { params: unknown }) => idDeChemin((request.params as { id: string }).id);

  app.get('/api/univers/:id/assistant', async (request) => {
    const role = exigerRole(app.db, idUnivers(request), request.session!.id);
    const config = app.assistantDeps.config ?? env;
    return { disponible: disponibilite(config) !== 'aucune', catalogue: role };
  });

  app.post('/api/univers/:id/assistant/messages', async (request, reply) => {
    const compteId = request.session!.id;
    const universId = idUnivers(request);
    exigerRole(app.db, universId, compteId);
    const b = corps(request);
    const message = lireMessage(b.message);
    const historique = lireHistorique(b.historique);

    if (occupes.has(compteId)) {
      return reply.code(429).send({ message: 'Une demande est déjà en cours.', code: 'assistant_occupe' });
    }
    occupes.add(compteId);
    try {
      return await repondre(app.db, compteId, universId, message, historique, app.assistantDeps);
    } catch (e) {
      if (e instanceof ErreurAssistant) {
        return reply
          .code(e.code === 'assistant_indisponible' ? 503 : 502)
          .send({ message: e.message, code: e.code });
      }
      throw e;
    } finally {
      occupes.delete(compteId);
    }
  });
}
