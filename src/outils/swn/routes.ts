import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify';

import { acteur } from '../../routes/fiches.js';
import { ErreurService } from '../../services/erreurs.js';
import { lireGalaxie } from '../../services/swn/galaxies.js';
import { lireBlocs, lireSysteme, rechercherSystemes } from '../../services/swn/lecture-carte.js';
import { calculerTrajet } from '../../services/swn/trajet.js';

const BASE = '/api/univers/:id/outils/swn/galaxie/galaxies/:gid';

/** A path segment as a positive integer, else NaN (the service then answers `introuvable`). */
const entier = (v: unknown) => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : NaN);
/** `bx,by` as two integers; anything else is NaN, which the rectangle check refuses (`invalide`). */
const coord = (v: unknown): { bx: number; by: number } => {
  const m = typeof v === 'string' ? /^(-?\d{1,12}),(-?\d{1,12})$/.exec(v) : null;
  return m ? { bx: Number(m[1]), by: Number(m[2]) } : { bx: NaN, by: NaN };
};
const texte = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Read routes of the galaxy (G-6), thin over `services/swn/*`. A galaxy, a system or a route the caller
 * cannot read is the same 404 as an unregistered path (AD-124): the service's `introuvable` becomes `callNotFound`.
 */
export function routesGalaxie(app: FastifyInstance, garde: (cle: string) => preHandlerHookHandler): void {
  const ids = (request: { params: unknown }) => {
    const p = request.params as { id: string; gid: string; cle?: string };
    return { univers: entier(p.id), galaxie: entier(p.gid), cle: p.cle };
  };
  const lire = (fn: (request: { params: unknown; query: unknown }, a: ReturnType<typeof acteur>) => unknown) =>
    async (request: { params: unknown; query: unknown }, reply: FastifyReply) => {
      try {
        return fn(request, acteur(request as never));
      } catch (e) {
        if (e instanceof ErreurService && e.code === 'introuvable') return reply.callNotFound();
        throw e;
      }
    };
  const opts = { preHandler: garde('swn/galaxie') };

  app.get(BASE, opts, lire((request, a) => {
    const i = ids(request);
    return lireGalaxie(app.db, a, i.univers, i.galaxie);
  }));

  app.get(`${BASE}/blocs`, opts, lire((request, a) => {
    const i = ids(request);
    const q = request.query as Record<string, unknown>;
    return lireBlocs(app.db, a, i.univers, i.galaxie, coord(q.de), coord(q.a));
  }));

  app.get(`${BASE}/systemes/:cle`, opts, lire((request, a) => {
    const i = ids(request);
    return lireSysteme(app.db, a, i.univers, i.galaxie, i.cle!);
  }));

  app.get(`${BASE}/recherche`, opts, lire((request, a) => {
    const i = ids(request);
    return rechercherSystemes(app.db, a, i.univers, i.galaxie, texte((request.query as Record<string, unknown>).q));
  }));

  app.get(`${BASE}/trajet`, opts, lire((request, a) => {
    const i = ids(request);
    const q = request.query as Record<string, unknown>;
    return calculerTrajet(app.db, a, i.univers, i.galaxie, {
      depart: texte(q.depart), arrivee: texte(q.arrivee),
      moteur: q.moteur === undefined ? undefined : typeof q.moteur === 'string' && q.moteur !== '' ? Number(q.moteur) : NaN,
      routes: q.routes as 'toutes' | 'publiques' | undefined,
    });
  }));
}
