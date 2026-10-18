import { env } from '../../config/env.js';
import { jetonEffectif } from './jeton.js';

export type Disponibilite = 'bouchon' | 'claude-agent' | 'aucune';

/** The variables the assistant reads, passed in so tests need no process.env. */
export interface ConfigAssistant {
  KANEVAS_STUB?: string | undefined;
  CLAUDE_CODE_OAUTH_TOKEN?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
  /** Directory of the token file (AD-112). */
  CLAUDE_DIR?: string | undefined;
}

/**
 * AD-77: the stub with `KANEVAS_STUB=1`, the Agent SDK with a non-empty token,
 * otherwise nothing — never a silent fall back to the stub.
 */
export function disponibilite(config: ConfigAssistant = env): Disponibilite {
  if (config.KANEVAS_STUB === '1') return 'bouchon';
  if (jetonEffectif(config)) return 'claude-agent';
  return 'aucune';
}
