import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import { dbPath, env } from './config/env.js';
import { migrate, openDb, type Db } from './db/db.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBouchonRoutes } from './routes/bouchon.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSessionRoutes } from './routes/session.js';
import { chargerCleSession } from './services/session.js';

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

  // Signed cookies: the session (AD-56) and the OIDC transaction (state + PKCE).
  // The secret persists in <data dir>/session.key so sessions survive a restart.
  await app.register(cookie, {
    secret: chargerCleSession(env.SESSION_SECRET, dbPath),
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerBouchonRoutes(app);
  await registerSessionRoutes(app);

  return app;
}
