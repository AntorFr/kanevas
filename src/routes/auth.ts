import * as oidcClient from 'openid-client';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
import {
  getOidcConfiguration,
  getOidcSettings,
  isOidcEnabled,
} from '../services/oidc.js';

// Cookie signé portant state + PKCE entre la redirection Authelia et le
// callback. Secret de signature généré à chaque démarrage du process (voir
// app.ts) : la transaction ne survit qu'à l'aller-retour d'un même
// utilisateur sur la même instance, pas un secret d'exploitation à gérer.
const OIDC_TX_COOKIE = 'kanevas_oidc_tx';

const oidcTxSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
});

/**
 * Mécanique OIDC générique reprise d'Antre-du-maitre (AD-10), arrêtée à
 * l'authentification de l'identité : aucune résolution de rôle (AD-9), aucune
 * session posée, aucune écriture en base (AD-5 réserve l'emplacement, vide à
 * ce stade). kanevas-identite construit la suite sur ce contrat
 * (client_id kanevas, redirect_uri .../api/auth/oidc/callback — technique.md,
 * Interfaces).
 */
export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/api/auth/config', async () => ({
    oidcEnabled: isOidcEnabled(),
  }));

  app.get('/api/auth/oidc/login', async (_request, reply) => {
    const settings = getOidcSettings();

    if (!settings) {
      return reply.code(404).send({
        message: 'OIDC login is not configured.',
      });
    }

    const configuration = await getOidcConfiguration(settings);

    const codeVerifier = oidcClient.randomPKCECodeVerifier();
    const codeChallenge =
      await oidcClient.calculatePKCECodeChallenge(codeVerifier);
    const state = oidcClient.randomState();

    const authorizationUrl = oidcClient.buildAuthorizationUrl(configuration, {
      redirect_uri: settings.redirectUri,
      scope: 'openid profile email groups',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    const transaction = Buffer.from(
      JSON.stringify({
        state,
        codeVerifier,
      }),
    ).toString('base64url');

    reply.setCookie(OIDC_TX_COOKIE, transaction, {
      path: '/api/auth/oidc',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      signed: true,
      maxAge: 600,
    });

    return reply.redirect(authorizationUrl.href);
  });

  app.get('/api/auth/oidc/callback', async (request, reply) => {
    const settings = getOidcSettings();

    if (!settings) {
      return reply.code(404).send({
        message: 'OIDC login is not configured.',
      });
    }

    reply.clearCookie(OIDC_TX_COOKIE, {
      path: '/api/auth/oidc',
    });

    try {
      const rawTransaction = request.cookies[OIDC_TX_COOKIE];

      if (!rawTransaction) {
        throw new Error('Missing OIDC transaction cookie.');
      }

      const unsigned = request.unsignCookie(rawTransaction);

      if (!unsigned.valid || !unsigned.value) {
        throw new Error('Invalid OIDC transaction cookie signature.');
      }

      const transaction = oidcTxSchema.parse(
        JSON.parse(Buffer.from(unsigned.value, 'base64url').toString('utf8')),
      );

      const configuration = await getOidcConfiguration(settings);

      // request.url = chemin + query string ; l'origine vient du redirect URI.
      const currentUrl = new URL(request.url, settings.redirectUri);

      const tokens = await oidcClient.authorizationCodeGrant(
        configuration,
        currentUrl,
        {
          pkceCodeVerifier: transaction.codeVerifier,
          expectedState: transaction.state,
        },
      );

      const claims = tokens.claims();

      if (!claims) {
        throw new Error('Missing ID token claims.');
      }

      // Le scope "groups" est exposé via userinfo ; ce socle ne le lit pas
      // encore (aucune résolution de rôle, AD-9) — kanevas-identite le fera.
      const userInfo = await oidcClient.fetchUserInfo(
        configuration,
        tokens.access_token,
        claims.sub,
      );

      const username =
        typeof userInfo.preferred_username === 'string'
          ? userInfo.preferred_username.trim()
          : '';

      if (!username) {
        throw new Error('Missing preferred_username claim.');
      }

      // Aucune session posée, aucune écriture : rien ne consomme encore une
      // identité authentifiée (fonctionnelle.md, hors périmètre) — se
      // connecter en vrai n'a ici aucun effet observable différent de ne pas
      // se connecter.
      return reply.send({
        authenticated: true,
        subject: claims.sub,
        username,
      });
    } catch (error) {
      request.log.error({ err: error }, 'OIDC login failed.');
      return reply.code(401).send({
        authenticated: false,
      });
    }
  });
}
