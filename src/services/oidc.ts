import * as oidc from 'openid-client';

import { env } from '../config/env.js';

export type OidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Renvoie la config OIDC si elle est complète, sinon null (pas de connexion
 * possible). Les quatre variables vont ensemble : en poser une partie est une
 * erreur de déploiement, pas un mode dégradé.
 *
 * Repris d'Antre-du-maitre (AD-10) : ne porte, ici, aucune résolution de rôle
 * — `roleFromGroups` n'est pas repris, AD-9 reste pour kanevas-identite.
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

// Découverte paresseuse et mise en cache : l'app doit démarrer même si
// Authelia est momentanément injoignable. Un échec vide le cache pour que la
// tentative suivante refasse la découverte.
let cachedConfiguration: Promise<oidc.Configuration> | null = null;

export function getOidcConfiguration(settings: OidcSettings) {
  if (!cachedConfiguration) {
    // client_secret_basic explicite : openid-client v6 utilise
    // client_secret_post par défaut, qu'Authelia refuse (son défaut est basic).
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
