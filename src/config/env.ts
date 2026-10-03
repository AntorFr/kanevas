import { config as loadEnv } from 'dotenv';
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
