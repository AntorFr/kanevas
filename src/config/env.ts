import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
});

const envSchema = z.object({
  APP_NAME: z.string().min(1).default('kanevas'),
  // Seule source de vérité pour la version affichée par /healthz et publiée
  // par la CI : le build-arg Docker `APP_VERSION` (voir Dockerfile), jamais
  // `package.json` — deux sources non synchronisées sinon (plan.md).
  APP_VERSION: z.string().min(1).default('0.0.0-dev'),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Les quatre vont ensemble : en poser une partie est une erreur de
  // déploiement, pas un mode dégradé (services/oidc.ts).
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  // Transports LLM repris d'Antre-du-maitre (AD-10) : aucune route de ce
  // socle ne les appelle encore (fonctionnelle.md, hors périmètre).
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  LLM_PROVIDER: z.enum(['mock', 'anthropic', 'claude-agent']).default('mock'),
});

export const env = envSchema.parse(process.env);
