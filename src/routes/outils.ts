import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { modulesActifs } from '../outils/registre.js';
import { roleDe } from '../services/droits.js';
import { ErreurService } from '../services/erreurs.js';
import {
  appliquerCatalogue, ErreurCatalogue, lireCatalogue, lireCatalogueGestion, masquerElement,
  previsualiserCatalogue, retirerElement, type OptionsCatalogue,
} from '../services/catalogues.js';
import {
  decrireOutil, entreesOutils, lireOutils, poserActivation, poserReglages, poserVisibilite,
  resoudreOutil, transfererResponsabilite, accessible, type CibleOutils, type ResolutionOutil,
  lireResponsable, candidatsResponsable,
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

/** Catalogue bodies have their own transport errors; other session APIs keep theirs. */
const MAX_CORPS_CATALOGUE = 8 * 1024 * 1024;
const optionsCatalogue = (request: FastifyRequest): OptionsCatalogue => {
  const q = request.query as Record<string, unknown>;
  for (const nom of ['nature', 'curseur']) {
    if (q[nom] !== undefined && typeof q[nom] !== 'string') {
      throw new ErreurService('invalide', 'Paramètre de catalogue invalide.', undefined, nom);
    }
  }
  return { nature: q.nature as string | undefined, curseur: q.curseur as string | undefined };
};

/**
 * Common API of the tools (C-5, AD-124), in the guarded scope. Thin over `services/outils.ts`.
 * A tool the caller cannot use answers through the not-found handler, like an unregistered path.
 */
export async function registerOutilsRoutes(app: FastifyInstance) {
  const erreurCatalogue = (erreur: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (erreur instanceof ErreurService) {
      if (erreur.code === 'introuvable') return reply.callNotFound();
      const statut = { refuse: 403, invalide: 400, conflit: 409 }[erreur.code];
      return reply.code(statut).send({
        message: erreur.message, code: erreur.detail ?? erreur.code,
        ...(erreur.champ ? { champ: erreur.champ } : {}),
        ...(erreur instanceof ErreurCatalogue ? {
          cause: erreur.cause,
          ...(erreur.attendu !== undefined ? { attendu: erreur.attendu, recu: erreur.recu } : {}),
        } : {}),
      });
    }
    if (erreur.statusCode === 413) return reply.code(413).send({
      message: 'Ce fichier est trop volumineux (8 Mio au plus).', code: 'fichier_trop_gros',
    });
    if (erreur.code?.startsWith('FST_ERR_CTP_') && [400, 415].includes(erreur.statusCode!)) {
      return reply.code(400).send({
        message: "Ce fichier n'est pas un catalogue valide.", code: 'catalogue_invalide',
      });
    }
    if (erreur.statusCode && erreur.statusCode < 500) return app.errorHandler(erreur, request, reply);
    request.log.error(erreur);
    return reply.code(500).send({ message: 'Erreur interne.', code: 'erreur_serveur' });
  };
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
  const garde = (cle: string) => async (request: FastifyRequest, reply: FastifyReply) => verifier(request, reply, cle);

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
    // Imports and management use the service's applicability guard, even on a disabled tool.
    for (const [action, importer] of [
      ['apercu', previsualiserCatalogue], ['application', appliquerCatalogue],
    ] as const) {
      app.post(`${base}/catalogue/${action}`, {
        bodyLimit: MAX_CORPS_CATALOGUE, errorHandler: erreurCatalogue,
      }, async (request) => importer(app.db, acteur(request), cible(request), cleDe(request), request.body));
    }
    app.get(`${base}/catalogue`, {
      errorHandler: erreurCatalogue,
      ...(niveau === 'univers' ? {
        preHandler: async (request: FastifyRequest, reply: FastifyReply) => garde(cleDe(request))(request, reply),
      } : {}),
    }, async (request) => lireCatalogue(app.db, acteur(request), cible(request), cleDe(request), optionsCatalogue(request)));
    if (niveau === 'univers') {
      app.get(`${base}/catalogue/gestion`, { errorHandler: erreurCatalogue }, async (request) =>
        lireCatalogueGestion(app.db, acteur(request), idDe(request), cleDe(request), optionsCatalogue(request)));
      app.put(`${base}/catalogue/:nature/:cle/masque`, { errorHandler: erreurCatalogue }, async (request) => {
        const { nature, cle } = request.params as { nature: string; cle: string };
        const b = corps(request);
        return masquerElement(app.db, acteur(request), idDe(request), cleDe(request), nature, cle, {
          masque: b.masque as boolean, version: b.version as number,
        });
      });
      app.put(`${base}/catalogue/:nature/:cle/retrait`, { errorHandler: erreurCatalogue }, async (request) => {
        const { nature, cle } = request.params as { nature: string; cle: string };
        const b = corps(request);
        retirerElement(app.db, acteur(request), idDe(request), cleDe(request), nature, cle, { retire: b.retire as boolean });
        return { retire: b.retire };
      });
    }
    // Common settings use the module key, with no artificial tool key (C-3).
    app.put(`/api/${niveau === 'univers' ? 'univers' : 'systemes'}/:id/outils/:module/reglages`, async (request, reply) => {
      const b = corps(request);
      poserReglages(app.db, acteur(request), cible(request), (request.params as { module: string }).module, {
        version: b.version as number, valeurs: b.valeurs as Record<string, never>, confirme: b.confirme === true,
      });
      return reply.code(204).send();
    });
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

  app.get('/api/systemes/:id/responsable', async (request) => lireResponsable(app.db, acteur(request), idDe(request)));
  app.get('/api/systemes/:id/responsable/candidats', async (request) => candidatsResponsable(app.db, acteur(request), idDe(request)));
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
