import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  ajouterMembreInstance,
  changerRoleInstance,
  listerMembresInstance,
  listerUniversInstance,
  retirerMembreInstance,
  type ActeurInstance,
} from '../services/instance.js';
import { corpsAjout, corpsRole, idDeChemin } from './univers.js';

/** Authelia group that makes an instance admin (B-6, AD-86). */
export const GROUPE_ADMIN = 'parents';

/**
 * Instance administration routes (B-6, AD-86): thin wrappers over `services/instance`.
 * The admin actor is built here from the session groups, never from the request.
 * Without the group every route answers exactly like an unknown address (AD-87).
 * Guarded scope only.
 */
export function registerInstanceRoutes(app: FastifyInstance) {
  const acteur = (request: FastifyRequest): ActeurInstance => ({
    compteId: request.session!.id,
    admin: request.session!.groups.includes(GROUPE_ADMIN),
  });

  // Runs before any parameter or body validation, so a non-admin learns nothing.
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith('/api/instance')) return;
    if (!acteur(request).admin) return reply.callNotFound();
  });

  app.get('/api/instance/univers', async (request) =>
    listerUniversInstance(app.db, acteur(request)),
  );

  app.get('/api/instance/univers/:id/membres', async (request) =>
    listerMembresInstance(
      app.db,
      acteur(request),
      idDeChemin((request.params as { id: string }).id),
    ),
  );

  app.post('/api/instance/univers/:id/membres', async (request, reply) => {
    const id = idDeChemin((request.params as { id: string }).id);
    const { username, role } = corpsAjout(request);
    const membre = ajouterMembreInstance(app.db, acteur(request), id, username, role);
    return reply.code(201).send(membre);
  });

  app.patch('/api/instance/univers/:id/membres/:compteId', async (request) => {
    const p = request.params as { id: string; compteId: string };
    return changerRoleInstance(
      app.db,
      acteur(request),
      idDeChemin(p.id),
      idDeChemin(p.compteId),
      corpsRole(request),
    );
  });

  app.delete('/api/instance/univers/:id/membres/:compteId', async (request, reply) => {
    const p = request.params as { id: string; compteId: string };
    retirerMembreInstance(app.db, acteur(request), idDeChemin(p.id), idDeChemin(p.compteId));
    return reply.code(204).send();
  });
}
