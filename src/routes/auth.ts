import * as oidcClient from 'openid-client';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
import { pageIndisponible, pageRefusee } from './pages.js';
import { ouvrirSession } from './session.js';
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
 * Mécanique OIDC reprise d'Antre-du-maitre (AD-10). Le callback ouvre la
 * session (cookie signé, AD-56) et crée le compte à la première connexion
 * (AD-13) ; aucun rôle d'univers ne vient d'Authelia (AD-9).
 */
export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/api/auth/config', async () => ({
    oidcEnabled: isOidcEnabled(),
  }));

  app.get('/api/auth/oidc/login', async (request, reply) => {
    const settings = getOidcSettings();

    if (!settings) {
      return reply.code(404).send({
        message: 'OIDC login is not configured.',
      });
    }

    let configuration;
    try {
      configuration = await getOidcConfiguration(settings);
    } catch (error) {
      request.log.error({ err: error }, 'OIDC discovery failed.');
      return reply.code(503).type('text/html; charset=utf-8').send(pageIndisponible());
    }

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

      let configuration;
      try {
        configuration = await getOidcConfiguration(settings);
      } catch (error) {
        request.log.error({ err: error }, 'OIDC discovery failed.');
        return reply.code(503).type('text/html; charset=utf-8').send(pageIndisponible());
      }

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

      // Authelia says who (AD-9): the groups go into the session, the universe roles
      // never come from it. The account is created on first sign-in (AD-13).
      const groups = Array.isArray(userInfo.groups)
        ? userInfo.groups.filter((g): g is string => typeof g === 'string')
        : [];
      ouvrirSession(app, reply, username, groups);
      return reply.redirect('/');
    } catch (error) {
      request.log.error({ err: error }, 'OIDC login failed.');
      // Browsers navigating here get the "Connexion refusée" page; API clients the JSON.
      if (String(request.headers.accept ?? '').includes('text/html')) {
        return reply.code(401).type('text/html; charset=utf-8').send(pageRefusee());
      }
      return reply.code(401).send({
        authenticated: false,
      });
    }
  });
}
