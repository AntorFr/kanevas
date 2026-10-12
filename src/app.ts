import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import { dbPath, env } from './config/env.js';
import { migrate, openDb, type Db } from './db/db.js';
import { viderTmp } from './services/stockage.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBouchonRoutes } from './routes/bouchon.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSessionRoutes } from './routes/session.js';
import { ConnexionClaude } from './services/assistant/connexion-claude.js';
import type { ConfigAssistant } from './services/assistant/disponibilite.js';
import type { DepsRepondre } from './services/assistant/repondre.js';
import { chargerCleSession } from './services/session.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    /** Config/transport/deadline overrides of the assistant; empty in production, set by tests. */
    assistantDeps: DepsRepondre;
    /** The single token connection session (AD-112); tests set its `options`. */
    connexionClaude: ConnexionClaude;
    /** The one configuration the assistant reads: the test override if any, else the environment. */
    configAssistant: () => ConfigAssistant;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  // The only connection to the SQLite file; migrations are applied at startup (AD-14).
  const db = openDb(dbPath);
  migrate(db);
  // Uploads cut short by a restart leave files in tmp/ (AD-65); in memory (tests) the dir is shared, leave it.
  if (dbPath !== ':memory:') await viderTmp();
  if (dbPath === ':memory:' && env.NODE_ENV !== 'test') {
    app.log.warn('No /data volume: the database lives in memory and is lost at shutdown.');
  }
  app.decorate('db', db);
  app.decorate('assistantDeps', {});
  app.decorate('configAssistant', () => app.assistantDeps.config ?? env);
  app.decorate('connexionClaude', new ConnexionClaude({ config: () => app.configAssistant() }));
  app.addHook('onClose', async () => {
    await app.connexionClaude.fermer();
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
