import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../config/env.js';
import { assurerCompte, lireCompte } from '../services/comptes.js';
import { MAX_CONTENU_SECTION } from '../services/sections.js';
import {
  decoderSession,
  encoderSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  type Session,
} from '../services/session.js';
import multipart from '@fastify/multipart';
import { registerErreurs } from './erreurs.js';
import { registerFichesRoutes } from './fiches.js';
import { registerUniversRoutes } from './univers.js';
import { registerSystemesRoutes } from './systemes.js';
import { registerSuiviRoutes } from './suivi.js';
import { registerAssistantRoutes } from './assistant.js';
import { chargerFrontend } from './frontend.js';
import { pageIntrouvable, urlConnexion } from './pages.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The verified session, or null: absent, forged or pointing to no account all mean "none". */
    session: Session | null;
  }
}

/** Sets the session cookie after an authentication (OIDC callback or stub choice). */
export function ouvrirSession(
  app: FastifyInstance,
  reply: FastifyReply,
  username: string,
  groups: string[],
) {
  const compte = assurerCompte(app.db, username); // B-1 / AD-13: created on first sign-in
  reply.setCookie(SESSION_COOKIE, encoderSession({ id: compte.id, groups }), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production' && !env.KANEVAS_STUB,
    signed: true,
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function registerSessionRoutes(app: FastifyInstance) {
  app.decorateRequest('session', null);
  const frontend = chargerFrontend();

  // Resolve the session on every request; the guard below decides what to do without one.
  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.session = null;
    const brut = request.cookies[SESSION_COOKIE];
    if (!brut) return;
    const signe = request.unsignCookie(brut);
    if (!signe.valid || !signe.value) return;
    const session = decoderSession(signe.value);
    if (session && lireCompte(app.db, session.id)) request.session = session;
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { loginUrl: urlConnexion() };
  });

  // Unknown addresses: /api answers 404 even without a session; elsewhere no session means the sign-in.
  app.setNotFoundHandler(async (request, reply) => {
    const chemin = request.url.split('?')[0]!;
    if (!chemin.startsWith('/api') && !request.session) {
      return reply.redirect(urlConnexion());
    }
    // An address no server route owns is a frontend screen (or its "Page introuvable.", AD-57).
    if (frontend && request.method === 'GET' && !chemin.startsWith('/api') && !chemin.startsWith('/assets/')) {
      return reply
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-cache')
        .send(frontend.index);
    }
    return reply.code(404).type('text/html; charset=utf-8').send(pageIntrouvable());
  });

  // Every route registered in this scope requires a session (AD-15): 401 under /api,
  // a redirect to the sign-in elsewhere.
  await app.register(async (garde) => {
    garde.addHook('onRequest', async (request, reply) => {
      if (request.session) return;
      if (request.url.startsWith('/api')) {
        return reply.code(401).send({ message: 'Non authentifié.' });
      }
      return reply.redirect(urlConnexion());
    });
    registerErreurs(garde);
    // Uploads are streamed to the service, never buffered: no size cap on the file (AD-65),
    // one file and a couple of small fields per request.
    await garde.register(multipart, {
      limits: { fileSize: Number.MAX_SAFE_INTEGER, files: 1, fields: 4, parts: 6 },
    });
    // Build assets (Vite's `assets/`) sit behind the session guard; every other address falls
    // through to the not-found handler, which serves `index.html`.
    if (frontend) {
      await garde.register(fastifyStatic, {
        root: join(frontend.racine, 'assets'),
        prefix: '/assets/',
        index: false,
      });
    }
    registerGuardedRoutes(garde);
    registerUniversRoutes(garde);
    registerFichesRoutes(garde);
    registerSystemesRoutes(garde);
    registerSuiviRoutes(garde);
    registerAssistantRoutes(garde);
  });
}

function registerGuardedRoutes(app: FastifyInstance) {
  app.get('/api/moi', async (request) => {
    const compte = lireCompte(app.db, request.session!.id)!;
    return {
      username: compte.username,
      groups: request.session!.groups,
      limites: { contenuSection: MAX_CONTENU_SECTION },
    };
  });
}
