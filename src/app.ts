import { randomBytes } from 'node:crypto';

import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import { env } from './config/env.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  // Signed cookie carrying the OIDC transaction (state + PKCE) between the
  // redirect to Authelia and the callback (routes/auth.ts). Secret generated
  // at each start: the transaction only lives for one user's round trip on
  // the same instance, so it is not an operational secret to manage.
  await app.register(cookie, {
    secret: randomBytes(32).toString('hex'),
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);

  return app;
}
