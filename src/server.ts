import { buildApp } from './app.js';
import { semerBouchon, semerIllustrations } from './bouchon/depart.js';
import { env } from './config/env.js';

const app = await buildApp();

// Stub mode only (AD-55): the starting world, on a database that has no universe yet.
if (env.KANEVAS_STUB && !env.KANEVAS_SANS_SEMIS && semerBouchon(app.db)) {
  await semerIllustrations(app.db);
  app.log.info('Stub starting data seeded.');
}

try {
  await app.listen({
    host: '0.0.0.0',
    port: env.PORT,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
