import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../config/env.js';
import { assurerCompte, lireCompte } from '../services/comptes.js';
import { invalide } from '../services/erreurs.js';
import { contenuPublic, rendreApercu } from '../services/markdown.js';
import { exigerMJDeCampagne } from '../services/campagnes.js';
import { exigerRole, resolveurLiens } from '../services/droits.js';
import { MAX_CONTENU_SECTION, validerContenu } from '../services/sections.js';
import {
  decoderSession,
  encoderSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  type Session,
} from '../services/session.js';
import multipart from '@fastify/multipart';
import { registerErreurs } from './erreurs.js';
import { registerCartesRoutes } from './cartes.js';
import { registerInstanceRoutes } from './instance.js';
import { registerFichesRoutes } from './fiches.js';
import { registerFichiersRoutes } from './fichiers.js';
import { registerUniversRoutes } from './univers.js';
import { registerSystemesRoutes } from './systemes.js';
import { registerSuiviRoutes } from './suivi.js';
import { registerAssistantRoutes } from './assistant.js';
import { registerAccesApiRoutes } from './acces-api.js';
import { registerOutilsRoutes } from './outils.js';
import { registerPropositionsRoutes } from './propositions.js';
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
    // The components demo page exists only in stub mode (docs/ecrans.md, « Maquettes »): otherwise it is unknown.
    const demoAbsente = chemin.replace(/\/+$/, '') === '/demo-composants' && !env.KANEVAS_STUB;
    // An address no server route owns is a frontend screen (or its "Page introuvable.", AD-57).
    if (frontend && !demoAbsente && request.method === 'GET' && !chemin.startsWith('/api') && !chemin.startsWith('/assets/')) {
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
      limits: { fileSize: Number.MAX_SAFE_INTEGER, files: 1, fields: 6, parts: 8 },
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
    registerInstanceRoutes(garde);
    registerFichesRoutes(garde);
    registerFichiersRoutes(garde);
    registerSystemesRoutes(garde);
    registerSuiviRoutes(garde);
    registerCartesRoutes(garde);
    registerAssistantRoutes(garde);
    registerPropositionsRoutes(garde);
    registerAccesApiRoutes(garde);
    await registerOutilsRoutes(garde);
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

  // Preview (AD-113): renders what the reading would, reads and writes nothing.
  app.post('/api/apercu', async (request) => {
    const corps = (request.body ?? {}) as Record<string, unknown>;
    const texte = corps.texte;
    if (typeof texte !== 'string') throw invalide('Le texte doit être une chaîne.');
    validerContenu(texte);
    // Optional context, nested under `contexte` or flat in the body: `{nature, univers_id, mode}`.
    const ctx =
      corps.contexte !== null && typeof corps.contexte === 'object'
        ? (corps.contexte as Record<string, unknown>)
        : corps;
    if (ctx.nature === 'scenario' && Number.isInteger(ctx.campagne_id)) {
      // A scenario's links read in the universe of its campaign, for its GM (AD-97).
      const campagne = exigerMJDeCampagne(app.db, request.session!.id, ctx.campagne_id as number);
      const liens = resolveurLiens(app.db, campagne.univers_id, 'mj', { compteId: request.session!.id }, texte);
      return { html: rendreApercu(texte, null, liens, 'scenario') };
    }
    if (ctx.nature !== 'section') return { html: rendreApercu(texte, null) };
    if (!Number.isInteger(ctx.univers_id)) throw invalide("L'univers est requis pour l'aperçu d'une section.");
    const role = exigerRole(app.db, ctx.univers_id as number, request.session!.id);
    const acteur = { compteId: request.session!.id, modeJoueur: ctx.mode === 'joueur' };
    const mj = role === 'mj' && !acteur.modeJoueur;
    // The links resolve against what the preview shows: the public text for a non-GM.
    const liens = resolveurLiens(app.db, ctx.univers_id as number, role, acteur, mj ? texte : contenuPublic(texte));
    return { html: rendreApercu(texte, mj, liens) };
  });
}
