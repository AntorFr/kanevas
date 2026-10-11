import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../config/env.js';
import { ErreurConnexion } from '../services/assistant/connexion-claude.js';
import { disponibilite } from '../services/assistant/disponibilite.js';
import { etatJeton } from '../services/assistant/jeton.js';
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

  // AD-112: the state of the assistant token, never its value.
  app.get('/api/instance/assistant/jeton', async () => {
    const config = app.assistantDeps.config ?? env;
    return { ...etatJeton(config), assistant: disponibilite(config) };
  });

  // The session refuses with a fixed message and a code, never the cause (AD-112 4).
  const STATUT_CONNEXION = { connexion_impossible: 502, connexion_echouee: 400, connexion_expiree: 410 } as const;
  const refus = (reply: FastifyReply, e: unknown) => {
    if (!(e instanceof ErreurConnexion)) throw e;
    return reply.code(STATUT_CONNEXION[e.code]).send({ message: e.message, code: e.code });
  };

  app.post('/api/instance/assistant/jeton/connexion', async (_request, reply) => {
    try {
      return reply.code(201).send(await app.connexionClaude.demarrer());
    } catch (e) {
      return refus(reply, e);
    }
  });

  app.post('/api/instance/assistant/jeton/code', async (request, reply) => {
    const code = (request.body as { code?: unknown } | null | undefined)?.code;
    try {
      const etat = await app.connexionClaude.soumettreCode(code);
      const config = app.assistantDeps.config ?? env;
      return { ...etat, assistant: disponibilite(config) };
    } catch (e) {
      return refus(reply, e);
    }
  });

  app.delete('/api/instance/assistant/jeton/connexion', async (_request, reply) => {
    await app.connexionClaude.annuler();
    return reply.code(204).send();
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
