import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { invalide } from '../services/erreurs.js';
import {
  ajouterMembreInstance,
  changerRoleInstance,
  listerMembresInstance,
  listerUniversInstance,
  retirerMembreInstance,
  type ActeurInstance,
} from '../services/instance.js';
import type { Role } from '../services/types.js';
import { idDeChemin } from './univers.js';

/** Authelia group that makes an instance admin (B-6, AD-86). */
export const GROUPE_ADMIN = 'parents';

function corps(request: { body?: unknown }): Record<string, unknown> {
  const b = request.body;
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

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
    listerUniversInstance(app.db, acteur(request)).map((u) => ({
      id: u.id,
      nom: u.nom,
      nbMembres: u.nbMembres,
    })),
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
    const b = corps(request);
    if (typeof b.username !== 'string') throw invalide("L'identifiant est vide.");
    if (b.role !== undefined && typeof b.role !== 'string') throw invalide('Rôle inconnu.');
    const membre = ajouterMembreInstance(
      app.db,
      acteur(request),
      id,
      b.username,
      (b.role ?? 'joueur') as Role,
    );
    return reply.code(201).send(membre);
  });

  app.patch('/api/instance/univers/:id/membres/:compteId', async (request) => {
    const p = request.params as { id: string; compteId: string };
    const b = corps(request);
    if (typeof b.role !== 'string') throw invalide('Rôle inconnu.');
    return changerRoleInstance(
      app.db,
      acteur(request),
      idDeChemin(p.id),
      idDeChemin(p.compteId),
      b.role as Role,
    );
  });

  app.delete('/api/instance/univers/:id/membres/:compteId', async (request, reply) => {
    const p = request.params as { id: string; compteId: string };
    retirerMembreInstance(app.db, acteur(request), idDeChemin(p.id), idDeChemin(p.compteId));
    return reply.code(204).send();
  });
}
