import type { FastifyInstance } from 'fastify';

import { ErreurService, introuvable } from '../services/erreurs.js';
import { creerJeton, listerJetons, listerOutilsProposables, revoquerJeton } from '../services/jetons.js';
import { listerLots } from '../services/lots.js';
import { idDeChemin } from './univers.js';

/**
 * Session side of E-18 (B-45, B-46, B-49): create, list and revoke the API tokens of a universe,
 * list its import batches. GM only. A read by a non-GM is the same « not found » as an unknown
 * universe ("Page introuvable."); a write by one who lost the role is a 403 (the screen says so).
 * Thin over `services/jetons.ts` and `services/lots.ts`; the value of a token is in the
 * answer of its creation only.
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

  app.get('/api/univers/:id/jetons', async (request) => {
    const univers = universDe(request);
    return lecture(() => listerJetons(app.db, request.session!.id, univers, app.horloge()));
  });

  app.get('/api/univers/:id/jetons/outils', async (request) => {
    const univers = universDe(request);
    return lecture(() => listerOutilsProposables(app.db, request.session!.id, univers));
  });

  app.post('/api/univers/:id/jetons', async (request, reply) => {
    const univers = universDe(request);
    const corps = (request.body ?? {}) as { nom?: unknown; dureeJours?: unknown; outils?: unknown };
    const { jeton, valeur } = creerJeton(
      app.db,
      request.session!.id,
      univers,
      { nom: corps.nom, dureeJours: corps.dureeJours, outils: corps.outils },
      app.horloge(),
    );
    return reply.code(201).send({ jeton, valeur });
  });

  app.post('/api/univers/:id/jetons/:jid/revoquer', async (request, reply) => {
    const univers = universDe(request);
    const jid = idDeChemin((request.params as { jid: string }).jid);
    revoquerJeton(app.db, request.session!.id, univers, jid, app.horloge());
    return reply.code(204).send();
  });

  app.get('/api/univers/:id/lots', async (request) => {
    const univers = universDe(request);
    return lecture(() => listerLots(app.db, request.session!.id, univers, app.horloge()));
  });
}
