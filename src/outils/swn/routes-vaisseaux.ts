import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { acteur } from '../../routes/fiches.js';
import { ErreurService } from '../../services/erreurs.js';
import { etatFichesRegles, genererFichesRegles } from '../../services/swn/fiches-regles.js';
import {
  calculerConception, creerConception, enregistrerConception, ErreurConceptionBloquee, lireConception, listerConceptions,
} from '../../services/swn/conceptions.js';

const BASE = '/api/univers/:id/outils/swn/vaisseaux';
const entier = (v: unknown) => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : NaN);
const objet = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

/**
 * Routes of the ship designer (V-8, AD-124), thin over `services/swn/conceptions.ts`. An unreadable, hidden or unknown
 * address is the same 404 as an unregistered path; a blocking design is a 422 carrying its alerts.
 */
export function routesVaisseaux(app: FastifyInstance, garde: (cle: string) => preHandlerHookHandler): void {
  const errorHandler = (erreur: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (erreur instanceof ErreurService && erreur.code === 'introuvable') return reply.callNotFound();
    if (erreur instanceof ErreurConceptionBloquee) {
      return reply.code(422).send({ message: erreur.message, code: 'conception_bloquee', alertes: erreur.alertes });
    }
    return app.errorHandler(erreur, request, reply);
  };
  const opts = { preHandler: garde('swn/vaisseaux'), errorHandler };
  const univers = (request: { params: unknown }) => entier((request.params as { id: string }).id);
  const fiche = (request: { params: unknown }) => entier((request.params as { fid: string }).fid);

  app.get(`${BASE}/fiches-regles`, opts, async (request) => etatFichesRegles(app.db, acteur(request), univers(request)));
  app.post(`${BASE}/fiches-regles`, opts, async (request) => genererFichesRegles(app.db, acteur(request), univers(request)));
  app.get(`${BASE}/conceptions`, opts, async (request) => listerConceptions(app.db, acteur(request), univers(request)));
  app.get(`${BASE}/conceptions/:fid`, opts, async (request) =>
    lireConception(app.db, acteur(request), univers(request), fiche(request)));
  app.post(`${BASE}/calcul`, opts, async (request) =>
    calculerConception(app.db, acteur(request), univers(request), request.body));
  app.post(`${BASE}/conceptions`, opts, async (request, reply) => {
    const b = objet(request.body);
    const creee = creerConception(app.db, acteur(request), univers(request), {
      ficheId: b.ficheId as number, coque: b.coque as string, auteurId: (b.auteurId ?? null) as number | null,
    });
    return reply.code(201).send(creee);
  });
  app.put(`${BASE}/conceptions/:fid`, opts, async (request) => {
    const b = objet(request.body);
    return enregistrerConception(app.db, acteur(request), univers(request), fiche(request),
      { coque: b.coque, choix: b.choix, version: b.version, equipage: b.equipage });
  });
}
