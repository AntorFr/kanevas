import type { FastifyInstance } from 'fastify';

import { invalide } from '../services/erreurs.js';
import { listerContributeurs, listerHistorique, lireLigne, restaurer } from '../services/historique.js';
import { acteur, corps } from './fiches.js';
import { idDeChemin } from './univers.js';

/** The history of a universe for its GM (B-102, B-103, AD-149): thin routes over `services/historique.ts`. */
export function registerHistoriqueRoutes(app: FastifyInstance) {
  const base = '/api/univers/:id/historique';
  const univers = (request: { params: unknown }) => idDeChemin((request.params as { id: string }).id);
  const ligne = (request: { params: unknown }) => idDeChemin((request.params as { hid: string }).hid);

  app.get(base, async (request) => {
    const q = request.query as Record<string, unknown>;
    const f: Record<string, string> = {};
    for (const nom of ['fiche', 'compte', 'jeton', 'action', 'depuis', 'apres']) {
      const v = q[nom];
      if (v === undefined) continue;
      if (typeof v !== 'string' || v === '') throw invalide('Requête invalide.');
      f[nom] = v;
    }
    return listerHistorique(app.db, acteur(request), univers(request), f, app.horloge());
  });

  app.get(`${base}/contributeurs`, async (request) =>
    listerContributeurs(app.db, acteur(request), univers(request)),
  );

  app.get(`${base}/:hid`, async (request) =>
    lireLigne(app.db, acteur(request), univers(request), ligne(request), app.horloge()),
  );

  app.post(`${base}/:hid/restaurer`, async (request) =>
    restaurer(app.db, acteur(request), univers(request), ligne(request), corps(request), app.horloge()),
  );
}
