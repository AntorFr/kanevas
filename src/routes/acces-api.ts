import type { FastifyInstance } from 'fastify';

import { ErreurService, introuvable } from '../services/erreurs.js';
import { listerLots } from '../services/lots.js';
import { idDeChemin } from './univers.js';

/**
 * Session side of E-18 (B-49): the import batches of a universe. GM only. Tokens left for
 * `routes/jetons.ts` (E-23, E-5). A read by a non-GM is the same « not found » as an unknown
 * universe ("Page introuvable."). Thin over `services/lots.ts`.
 */
export function registerAccesApiRoutes(app: FastifyInstance) {
  const universDe = (request: { params: unknown }) => idDeChemin((request.params as { id: string }).id);
  const lecture = <T>(f: () => T): T => {
    try {
      return f();
    } catch (e) {
      if (e instanceof ErreurService && e.code === 'refuse') throw introuvable();
      throw e;
    }
  };

  app.get('/api/univers/:id/lots', async (request) => {
    const univers = universDe(request);
    return lecture(() => listerLots(app.db, request.session!.id, univers, app.horloge()));
  });
}
