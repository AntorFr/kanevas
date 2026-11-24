import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  creerJeton,
  listerJetonsDuCompte,
  listerJetonsInstance,
  outilsOffrables,
  modifierAcces,
  revoquerJeton,
  universChoisissables,
  type ActeurJeton,
} from '../services/jetons.js';
import { GROUPE_ADMIN } from './instance.js';
import { corps, idDeChemin } from './univers.js';

/**
 * Session side of the API tokens (B-45, B-46, B-94, B-95, AD-149): the account's own (`/api/compte/jetons`, the owner
 * alone — another's token is « not found », even for the admin) and the instance's (`/api/instance/jetons`, admin only,
 * answered like an unregistered path for anyone else before any validation, see `registerInstanceRoutes`).
 * Thin over `services/jetons.ts`; the value of a token is in the answer of its creation only.
 * Each list carries the universes its owner may choose (`univers`; for the instance, by owner id).
 */
export function registerJetonsRoutes(app: FastifyInstance) {
  const proprietaire = (request: FastifyRequest): ActeurJeton => ({ compteId: request.session!.id, admin: false });
  const admin = (request: FastifyRequest): ActeurJeton => ({
    compteId: request.session!.id,
    admin: request.session!.groups.includes(GROUPE_ADMIN),
  });
  const jid = (request: FastifyRequest) => idDeChemin((request.params as { jid: string }).jid);

  app.get('/api/compte/jetons', async (request) => {
    const compteId = request.session!.id;
    return {
      jetons: listerJetonsDuCompte(app.db, compteId, app.horloge()),
      univers: universChoisissables(app.db, compteId),
      outilsOffrables: outilsOffrables(app.db, compteId),
    };
  });

  app.post('/api/compte/jetons', async (request, reply) => {
    const b = corps(request);
    const { jeton, valeur } = creerJeton(
      app.db,
      request.session!.id,
      { nom: b.nom, dureeJours: b.dureeJours, acces: b.acces, outils: b.outils, contenu: b.contenu },
      app.horloge(),
    );
    return reply.code(201).send({ jeton, valeur });
  });

  app.patch('/api/compte/jetons/:jid', async (request) =>
    ({ jeton: modifierAcces(app.db, proprietaire(request), jid(request), corps(request).acces, app.horloge()) }));

  app.delete('/api/compte/jetons/:jid', async (request) =>
    ({ jeton: revoquerJeton(app.db, proprietaire(request), jid(request), app.horloge()) }));

  app.get('/api/instance/jetons', async (request) => {
    const q = (request.query ?? {}) as { proprietaire?: string };
    const filtre = q.proprietaire === undefined ? {} : { proprietaire: idDeChemin(q.proprietaire) };
    const jetons = listerJetonsInstance(app.db, admin(request), filtre, app.horloge());
    const univers: Record<number, ReturnType<typeof universChoisissables>> = {};
    const outils: Record<number, ReturnType<typeof outilsOffrables>> = {};
    for (const j of jetons) {
      univers[j.compteId] ??= universChoisissables(app.db, j.compteId);
      outils[j.compteId] ??= outilsOffrables(app.db, j.compteId);
    }
    return { jetons, univers, outilsOffrables: outils };
  });

  app.patch('/api/instance/jetons/:jid', async (request) =>
    ({ jeton: modifierAcces(app.db, admin(request), jid(request), corps(request).acces, app.horloge()) }));

  app.delete('/api/instance/jetons/:jid', async (request) =>
    ({ jeton: revoquerJeton(app.db, admin(request), jid(request), app.horloge()) }));
}
