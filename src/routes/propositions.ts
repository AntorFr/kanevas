import type { FastifyInstance } from 'fastify';

import {
  abandonnerProposition,
  appliquerProposition,
  lireProposition,
} from '../services/propositions.js';
import { idDeChemin } from './univers.js';

/**
 * Update proposals (AD-81): read, apply and abandon, nothing else. There is no
 * creation route — a proposal is born only from the assistant tool (AD-48). Thin
 * over `services/propositions.ts`, which hides every proposal that is not the
 * caller's own behind `introuvable`.
 */
export function registerPropositionsRoutes(app: FastifyInstance) {
  const ids = (request: { params: unknown }) => {
    const p = request.params as { id: string; pid: string };
    return { univers: idDeChemin(p.id), proposition: idDeChemin(p.pid) };
  };

  app.get('/api/univers/:id/propositions/:pid', async (request) => {
    const i = ids(request);
    return lireProposition(app.db, request.session!.id, i.univers, i.proposition);
  });

  app.post('/api/univers/:id/propositions/:pid/appliquer', async (request) => {
    const i = ids(request);
    return appliquerProposition(app.db, request.session!.id, i.univers, i.proposition);
  });

  app.post('/api/univers/:id/propositions/:pid/abandonner', async (request, reply) => {
    const i = ids(request);
    abandonnerProposition(app.db, request.session!.id, i.univers, i.proposition);
    return reply.code(204).send();
  });
}
