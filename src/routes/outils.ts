import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { modulesActifs } from '../outils/registre.js';
import { roleDe } from '../services/droits.js';
import { ErreurService } from '../services/erreurs.js';
import {
  decrireOutil, entreesOutils, lireOutils, poserActivation, poserReglages, poserVisibilite,
  resoudreOutil, transfererResponsabilite, accessible, type CibleOutils, type ResolutionOutil,
} from '../services/outils.js';
import type { Acteur, Role } from '../services/types.js';
import { acteur, corps } from './fiches.js';
import { idDeChemin } from './univers.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `garde(cle)` on a module route: who calls, in which role, and the resolved tool. */
    outil?: { acteur: Acteur; role: Role; modeJoueur: boolean; resolution: ResolutionOutil };
  }
}

const idDe = (request: { params: unknown }) => idDeChemin((request.params as { id: string }).id);
const cleDe = (request: { params: unknown }) => {
  const p = request.params as { module: string; outil: string };
  return `${p.module}/${p.outil}`;
};

/**
 * Common API of the tools (C-5, AD-124), in the guarded scope. Thin over `services/outils.ts`.
 * A tool the caller cannot use answers through the not-found handler, like an unregistered path.
 */
export async function registerOutilsRoutes(app: FastifyInstance) {
  /** Pre-handler of a tool's routes: `accessible` or the same 404 as an unknown address. */
  const verifier = async (request: FastifyRequest, reply: FastifyReply, cle: string) => {
    const id = Number((request.params as { id?: string }).id);
    const a = acteur(request);
    if (!Number.isSafeInteger(id) || !accessible(app.db, a, id, cle)) return reply.callNotFound();
    request.outil = {
      acteur: a, role: roleDe(app.db, id, a.compteId)!, modeJoueur: !!a.modeJoueur,
      resolution: resoudreOutil(app.db, id, cle),
    };
  };
  const garde = (cle: string): preHandlerHookHandler => async (request, reply) => verifier(request, reply, cle);

  app.get('/api/univers/:id/outils/entrees', async (request) => entreesOutils(app.db, acteur(request), idDe(request)));

  app.get('/api/univers/:id/outils/:module/:outil/description', {
    preHandler: async (request, reply) => {
      return verifier(request, reply, cleDe(request));
    },
  }, async (request) => decrireOutil(app.db, acteur(request), idDe(request), cleDe(request)));

  app.get('/api/univers/:id/outils', async (request) =>
    lireOutils(app.db, acteur(request), { niveau: 'univers', id: idDe(request) }));
  app.get('/api/systemes/:id/outils', async (request) =>
    lireOutils(app.db, acteur(request), { niveau: 'systeme', id: idDe(request) }));

  for (const niveau of ['univers', 'systeme'] as const) {
    const base = `/api/${niveau === 'univers' ? 'univers' : 'systemes'}/:id/outils/:module/:outil`;
    const cible = (request: { params: unknown }): CibleOutils => ({ niveau, id: idDe(request) });
    app.put(`${base}/activation`, async (request, reply) => {
      const b = corps(request);
      poserActivation(app.db, acteur(request), cible(request), cleDe(request), b.active as boolean | null);
      return reply.code(204).send();
    });
    app.put(`${base}/visibilite`, async (request, reply) => {
      poserVisibilite(app.db, acteur(request), cible(request), cleDe(request), corps(request));
      return reply.code(204).send();
    });
    app.put(`${base}/reglages`, async (request, reply) => {
      const b = corps(request);
      poserReglages(app.db, acteur(request), cible(request), cleDe(request), {
        version: b.version as number, valeurs: b.valeurs as Record<string, never>, confirme: b.confirme === true,
      });
      return reply.code(204).send();
    });
  }

  app.post('/api/systemes/:id/responsable', async (request, reply) => {
    const b = corps(request);
    if (!Number.isInteger(b.compteId)) {
      throw new ErreurService('invalide', "Ce compte n'est plus MJ d'un univers de ce système.", undefined, 'compte');
    }
    transfererResponsabilite(app.db, acteur(request), idDe(request), b.compteId as number);
    return reply.code(204).send();
  });

  for (const module of modulesActifs()) await module.routes?.(app, garde);
}
