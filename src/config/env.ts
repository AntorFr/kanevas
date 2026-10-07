import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
});

const envSchema = z.object({
  APP_NAME: z.string().min(1).default('kanevas'),
  // Single source of truth for the version shown by /healthz and published
  // by the CI: the Docker build-arg `APP_VERSION` (see Dockerfile), never
  // `package.json` — two unsynchronised sources otherwise.
  APP_VERSION: z.string().min(1).default('0.0.0-dev'),
  // SQLite file (AD-5). Defaults: the /data volume in production, memory in tests.
  DB_PATH: z.string().min(1).optional(),
  // Attachment directory (AD-7); defaults to <db dir>/attachments.
  ATTACHMENTS_DIR: z.string().min(1).optional(),
  // Stub mode (AD-55): sign in by picking a test account, no Authelia. Never in production.
  KANEVAS_STUB: z.enum(['1']).optional(),
  // Stub mode only: `1` skips the starting-world seeding (e2e servers that build their own world).
  KANEVAS_SANS_SEMIS: z.enum(['1']).optional(),
  // Session cookie signing secret (AD-56); absent, one is created once in <data dir>/session.key.
  SESSION_SECRET: z.string().min(16).optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // All four go together: setting only some leaves OIDC unconfigured (routes
  // return 404 — services/oidc.ts); an empty or invalid value fails here.
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  // LLM transports reused from Antre-du-maitre (AD-10): no route of this
  // socle calls them yet.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  LLM_PROVIDER: z.enum(['mock', 'anthropic', 'claude-agent']).default('mock'),
});

export const env = envSchema.parse(process.env);

// AD-55: the stub lets anyone pick any account, so it must never coexist with a
// real OIDC configuration. Any OIDC_* variable counts, even an empty one.
if (env.KANEVAS_STUB) {
  const posees = Object.keys(process.env).filter((k) => k.startsWith('OIDC_'));
  if (posees.length > 0) {
    throw new Error(
      `KANEVAS_STUB=1 refuses to start with OIDC variables set (${posees.join(', ')}).`,
    );
  }
}

// Production writes to the /data volume (the image creates it). Without that
// directory nothing durable can be written: fall back to memory and say so
// (app.ts) rather than refuse to start — /healthz must answer on a bare host.
export const dbPath =
  env.DB_PATH ??
  (env.NODE_ENV === 'production'
    ? existsSync('/data')
      ? '/data/kanevas.db'
      : ':memory:'
    : env.NODE_ENV === 'test'
      ? ':memory:'
      : './data/kanevas.db');

// Attachment bytes (AD-7) live next to the database, on the same volume. In
// memory (tests, bare host) they go under the OS temp dir.
export const attachmentsDir =
  env.ATTACHMENTS_DIR ??
  (dbPath === ':memory:' ? join(tmpdir(), 'kanevas-attachments') : join(dirname(dbPath), 'attachments'));
