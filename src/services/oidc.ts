import * as oidc from 'openid-client';

import { env } from '../config/env.js';

export type OidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Returns the OIDC config if complete, otherwise null (no login possible).
 * The four variables go together: setting only some is a deployment error,
 * not a degraded mode.
 *
 * Reused from Antre-du-maitre (AD-10): carries no role resolution here —
 * `roleFromGroups` is not reused, AD-9 is left to kanevas-identite.
 */
export function getOidcSettings(): OidcSettings | null {
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI } =
    env;

  if (
    !OIDC_ISSUER ||
    !OIDC_CLIENT_ID ||
    !OIDC_CLIENT_SECRET ||
    !OIDC_REDIRECT_URI
  ) {
    return null;
  }

  return {
    issuer: OIDC_ISSUER,
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
    redirectUri: OIDC_REDIRECT_URI,
  };
}

export function isOidcEnabled() {
  return getOidcSettings() !== null;
}

// Lazy, cached discovery: the app must start even if Authelia is briefly
// unreachable. A failure clears the cache so the next attempt retries the
// discovery.
let cachedConfiguration: Promise<oidc.Configuration> | null = null;

export function getOidcConfiguration(settings: OidcSettings) {
  if (!cachedConfiguration) {
    // Explicit client_secret_basic: openid-client v6 defaults to
    // client_secret_post, which Authelia rejects (its default is basic).
    cachedConfiguration = oidc
      .discovery(
        new URL(settings.issuer),
        settings.clientId,
        undefined,
        oidc.ClientSecretBasic(settings.clientSecret),
      )
      .catch((error: unknown) => {
        cachedConfiguration = null;
        throw error;
      });
  }

  return cachedConfiguration;
}
