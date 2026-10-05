import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';

// Public health route (no OIDC check): probe convention (liveness/readiness).
// Plain-text answer "kanevas <version>", the version coming exclusively from
// APP_VERSION.
export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/healthz', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return `${env.APP_NAME} ${env.APP_VERSION}`;
  });
}
