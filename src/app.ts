import { randomBytes } from 'node:crypto';

import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import { dbPath, env } from './config/env.js';
import { migrate, openDb, type Db } from './db/db.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  // The only connection to the SQLite file; migrations are applied at startup (AD-14).
  const db = openDb(dbPath);
  migrate(db);
  if (dbPath === ':memory:' && env.NODE_ENV !== 'test') {
    app.log.warn('No /data volume: the database lives in memory and is lost at shutdown.');
  }
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    db.close();
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
