import type { FastifyInstance } from 'fastify';

import { ErreurService, type CodeErreur } from '../services/erreurs.js';

const STATUT: Record<CodeErreur, number> = {
  introuvable: 404,
  refuse: 403,
  invalide: 400,
  conflit: 409,
};

/**
 * Maps a service error to its HTTP answer: `{message}`, plus `code` for a stale
 * section write (`section_modifiee`, AD-59). Anything else stays a 500.
 */
export function registerErreurs(app: FastifyInstance) {
  app.setErrorHandler((erreur, request, reply) => {
    if (erreur instanceof ErreurService) {
      const corps: { message: string; code?: string } = { message: erreur.message };
      if (erreur.code === 'conflit' && erreur.detail) corps.code = erreur.detail;
      return reply.code(STATUT[erreur.code]).send(corps);
    }
    const statut = (erreur as { statusCode?: number }).statusCode;
    if (statut && statut >= 400 && statut < 500) {
      return reply.code(statut).send({ message: 'Requête invalide.' });
    }
    request.log.error(erreur);
    return reply.code(500).send({ message: 'Erreur interne.' });
  });
}
