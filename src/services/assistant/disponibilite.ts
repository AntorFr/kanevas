import { env } from '../../config/env.js';

export type Disponibilite = 'bouchon' | 'claude-agent' | 'aucune';

/** The only two variables the assistant reads, passed in so tests need no process.env. */
export interface ConfigAssistant {
  KANEVAS_STUB?: string | undefined;
  CLAUDE_CODE_OAUTH_TOKEN?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
}

/**
 * AD-77: the stub with `KANEVAS_STUB=1`, the Agent SDK with a non-empty token,
 * otherwise nothing — never a silent fall back to the stub.
 */
export function disponibilite(config: ConfigAssistant = env): Disponibilite {
  if (config.KANEVAS_STUB === '1') return 'bouchon';
  if (config.CLAUDE_CODE_OAUTH_TOKEN?.trim()) return 'claude-agent';
  return 'aucune';
}
