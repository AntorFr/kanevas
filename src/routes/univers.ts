import type { FastifyInstance } from 'fastify';

import { introuvable, invalide } from '../services/erreurs.js';
import {
  ajouterMembre,
  changerRole,
  listerMembres,
  retirerMembre,
} from '../services/membres.js';
import { creerUnivers, lireUnivers, listerUnivers } from '../services/univers.js';
import type { Role } from '../services/types.js';

/** A path identifier that is not a positive integer names nothing: not found. */
export function idDeChemin(valeur: unknown): number {
  const n = Number(valeur);
  if (typeof valeur !== 'string' || !/^\d+$/.test(valeur) || !Number.isSafeInteger(n)) {
    throw introuvable();
  }
  return n;
}

function corps(request: { body?: unknown }): Record<string, unknown> {
  const b = request.body;
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

/** Universes and members; thin routes over `services/` (AD-2, AD-4). Guarded scope only. */
export function registerUniversRoutes(app: FastifyInstance) {
  app.post('/api/univers', async (request, reply) => {
    const b = corps(request);
    if (typeof b.nom !== 'string') throw invalide('Le nom doit faire de 1 à 80 caractères.');
    if (b.description !== undefined && typeof b.description !== 'string') {
      throw invalide('La description doit être un texte.');
    }
    const univers = creerUnivers(app.db, request.session!.id, {
      nom: b.nom,
      description: b.description,
    });
    return reply.code(201).send({ ...univers, role: 'mj' });
  });

  app.get('/api/univers', async (request) => listerUnivers(app.db, request.session!.id));

  app.get('/api/univers/:id', async (request) =>
    lireUnivers(app.db, request.session!.id, idDeChemin((request.params as { id: string }).id)),
  );

  app.get('/api/univers/:id/membres', async (request) =>
    listerMembres(app.db, request.session!.id, idDeChemin((request.params as { id: string }).id)),
  );

  app.post('/api/univers/:id/membres', async (request, reply) => {
    const id = idDeChemin((request.params as { id: string }).id);
    const b = corps(request);
    if (typeof b.username !== 'string') throw invalide("L'identifiant est vide.");
    if (b.role !== undefined && typeof b.role !== 'string') throw invalide('Rôle inconnu.');
    const membre = ajouterMembre(
      app.db,
      request.session!.id,
      id,
      b.username,
      (b.role ?? 'joueur') as Role,
    );
    return reply.code(201).send(membre);
  });

  app.patch('/api/univers/:id/membres/:compteId', async (request) => {
    const p = request.params as { id: string; compteId: string };
    const b = corps(request);
    if (typeof b.role !== 'string') throw invalide('Rôle inconnu.');
    return changerRole(
      app.db,
      request.session!.id,
      idDeChemin(p.id),
      idDeChemin(p.compteId),
      b.role as Role,
    );
  });

  app.delete('/api/univers/:id/membres/:compteId', async (request, reply) => {
    const p = request.params as { id: string; compteId: string };
    retirerMembre(app.db, request.session!.id, idDeChemin(p.id), idDeChemin(p.compteId));
    return reply.code(204).send();
  });
}
