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

  // Cookie signé porteur de la transaction OIDC (state + PKCE) entre la
  // redirection vers Authelia et le callback (routes/auth.ts). Secret généré
  // à chaque démarrage : la transaction ne survit qu'à l'aller-retour d'un
  // même utilisateur sur la même instance, ce n'est pas un secret
  // d'exploitation à gérer (pas d'entrée pour lui dans technique.md,
  // Secrets).
  await app.register(cookie, {
    secret: randomBytes(32).toString('hex'),
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);

  return app;
}
