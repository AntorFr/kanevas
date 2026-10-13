import type { FastifyInstance, FastifyRequest } from 'fastify';

import { MAX_CONTENU_SECTION } from '../services/sections.js';
import { ErreurService, introuvable } from '../services/erreurs.js';
import { verifierJeton, type Jeton } from '../services/jetons.js';
import { cloreLot, lireLot, MAX_RAPPORT, ouvrirLot } from '../services/lots.js';
import { lireContexteImport } from '../services/import.js';
import { assurerFiche, lotDeRequete } from '../services/import-fiches.js';
import { TYPES_FICHE, typeActif } from '../services/types-fiche.js';
import { registerErreurs } from './erreurs.js';

/** Body cap of the import API (AD-103/104). */
export const MAX_CORPS_IMPORT = 8 * 1024 * 1024;

declare module 'fastify' {
  interface FastifyInstance {
    /** The clock of the token guard and the batches; tests move it (token expiry). */
    horloge: () => Date;
  }
  interface FastifyRequest {
    /** The verified API token of the import scope; never set elsewhere. */
    jeton: Jeton | null;
  }
}

const JETON_INVALIDE = { message: 'Jeton invalide.', code: 'jeton_invalide' };

/**
 * `/api/import/v1` (AD-103): a scope beside the session guard. Only a Bearer token opens it —
 * the session cookie is never read here, and no other route reads `Authorization`.
 */
export async function registerImportRoutes(app: FastifyInstance) {
  app.decorate('horloge', () => new Date());
  app.decorateRequest('jeton', null);

  await app.register(async (scope) => {
    registerErreurs(scope);
    // Every route of this scope (including those of later slices) takes up to 8 MiB.
    scope.addHook('onRoute', (route) => {
      route.bodyLimit = MAX_CORPS_IMPORT;
    });
    // JSON, tolerating an empty body (POST /lots carries none).
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string', bodyLimit: MAX_CORPS_IMPORT },
      (_request, corps, fait) => {
        if (corps === '') return fait(null, {});
        try {
          fait(null, JSON.parse(corps as string));
        } catch {
          const e = new ErreurService('invalide', 'JSON invalide.');
          fait(e as unknown as Error);
        }
      },
    );

    scope.addHook('onRequest', async (request, reply) => {
      request.jeton = null;
      const entete = request.headers.authorization;
      const m = typeof entete === 'string' ? /^Bearer (\S+)$/.exec(entete) : null;
      const jeton = m ? verifierJeton(app.db, m[1]!, app.horloge()) : null;
      if (!jeton) return reply.code(401).send(JETON_INVALIDE);
      request.jeton = jeton;
      // Another universe than the token's: unknown, like any resource out of reach.
      const { id } = request.params as { id?: string };
      if (id !== undefined && String(jeton.universId) !== id) throw introuvable();
    });

    const jetonDe = (request: FastifyRequest) => request.jeton!;
    const entier = (v: string) => (/^\d+$/.test(v) ? Number(v) : -1);
    const base = '/api/import/v1/univers/:id';

    scope.get(`${base}`, async (request) => {
      const ctx = lireContexteImport(app.db, jetonDe(request));
      return {
        univers: ctx.univers,
        compte: ctx.compte,
        // The product list; activation follows the settings (typeActif: no decision means inactive by default), except compte_rendu, never active here.
        // `compte_rendu` is listed but not accepted by `PUT /fiches` until kanevas-import-reprise.
        types: TYPES_FICHE.map((type) => ({
          type,
          active: type !== 'compte_rendu' && typeActif(app.db, ctx.univers.id, type),
        })),
        limites: { contenuSection: MAX_CONTENU_SECTION, entreesRapport: MAX_RAPPORT },
      };
    });

    scope.post(`${base}/lots`, async (request, reply) => {
      const { lot, repris } = ouvrirLot(app.db, jetonDe(request), app.horloge());
      return reply.code(repris ? 200 : 201).send(lot);
    });

    scope.get(`${base}/lots/:lid`, async (request) => {
      const { lid } = request.params as { lid: string };
      return lireLot(app.db, jetonDe(request), entier(lid), app.horloge());
    });

    scope.put(`${base}/fiches/:cle`, async (request) => {
      const { cle } = request.params as { cle: string };
      const { lot } = request.query as { lot?: unknown };
      return assurerFiche(app.db, jetonDe(request), lotDeRequete(lot), cle, request.body, app.horloge());
    });

    scope.post(`${base}/lots/:lid/clore`, async (request) => {
      const { lid } = request.params as { lid: string };
      return cloreLot(app.db, jetonDe(request), entier(lid), app.horloge());
    });
  });
}
