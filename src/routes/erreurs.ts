import type { FastifyInstance } from 'fastify';

import { ErreurCatalogue } from '../services/catalogues.js';
import { ErreurFondTropLourd } from '../services/cartes.js';
import { ErreurService, type CodeErreur } from '../services/erreurs.js';

const STATUT: Record<CodeErreur, number> = {
  introuvable: 404,
  refuse: 403,
  invalide: 400,
  conflit: 409,
  indisponible: 503,
};

/**
 * Maps a service error to its HTTP answer: `{message}`, plus `code` when the service gives one
 * (`section_modifiee` AD-59, `relation_existante`, `auto_relation`…). Anything else stays a 500.
 */
export function registerErreurs(app: FastifyInstance) {
  app.setErrorHandler((erreur, request, reply) => {
    if (erreur instanceof ErreurService) {
      const corps: { message: string; code?: string; champ?: string; cause?: string; attendu?: string; recu?: unknown; limiteMo?: number } =
        { message: erreur.message };
      if (erreur instanceof ErreurCatalogue) {
        corps.cause = erreur.cause;
        if (erreur.attendu !== undefined) Object.assign(corps, { attendu: erreur.attendu, recu: erreur.recu });
      }
      if (erreur.detail) corps.code = erreur.detail;
      if (erreur.champ) {
        corps.champ = erreur.champ;
        corps.code ??= 'invalide';
      }
      let statut = STATUT[erreur.code];
      // Attachments: an empty file is a 400, a full section a 409 or 403 (B-24, AD-117); both carry their code.
      if (erreur.detail === 'fichier_vide') corps.code = erreur.detail;
      // The 101st joined file keeps its code; the status is the error's own (409 for the GM, 403 for a player).
      if (erreur.detail === 'limite_pieces') corps.code = erreur.detail;
      // A background over the instance ceiling (AD-69, AD-143): 413, carrying the limit in MB.
      if (erreur.detail === 'fond_trop_lourd') {
        statut = 413;
        if (erreur instanceof ErreurFondTropLourd) corps.limiteMo = erreur.limiteMo;
      }
      // A stale fingerprint on an import write (AD-140): 412, where `section_modifiee` stays 409.
      if (erreur.detail === 'empreinte_perimee') statut = 412;
      return reply.code(statut).send(corps);
    }
    const statut = (erreur as { statusCode?: number }).statusCode;
    if (statut === 413) return reply.code(413).send({ message: 'Corps de requête trop volumineux.' });
    if (statut && statut >= 400 && statut < 500) {
      return reply.code(statut).send({ message: 'Requête invalide.' });
    }
    request.log.error(erreur);
    return reply.code(500).send({ message: 'Erreur interne.' });
  });
}
