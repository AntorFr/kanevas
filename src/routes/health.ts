import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';

// Route de santé publique (aucune vérification OIDC) : convention de sonde
// (liveness/readiness). Réponse texte brut "kanevas <version>", la version
// venant exclusivement de APP_VERSION (technique.md, Interfaces).
export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/healthz', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return `${env.APP_NAME} ${env.APP_VERSION}`;
  });
}
