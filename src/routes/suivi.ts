import type { FastifyInstance } from 'fastify';

import { changerStatutCampagne, creerCampagne, lireCampagne, listerCampagnes } from '../services/campagnes.js';
import { creerCompteRendu, listerComptesRendus } from '../services/comptes_rendus.js';
import { invalide } from '../services/erreurs.js';
import { ajouterTache, cocherTache, listerTaches } from '../services/preparation.js';
import { creerScenario, ecrireScenario, lireScenario, listerScenarios } from '../services/scenarios.js';
import { acteur, corps } from './fiches.js';
import { idDeChemin } from './univers.js';

function chaine(valeur: unknown, message: string): string {
  if (typeof valeur !== 'string') throw invalide(message);
  return valeur;
}

function facultative(valeur: unknown, message: string): string | undefined {
  if (valeur !== undefined && typeof valeur !== 'string') throw invalide(message);
  return valeur;
}

/**
 * Campaigns, scenarios, preparation tasks and session reports; thin routes over
 * `services/` (AD-2), no guard of their own. Scenarios and tasks are addressed
 * by campaign or by their own id, never with a universe id: the service reads
 * the campaign's universe (AD-47). No delete.
 */
export function registerSuiviRoutes(app: FastifyInstance) {
  type P = { id?: string; cid?: string; sid?: string; tid?: string };
  const ids = (request: { params: unknown }) => {
    const p = request.params as P;
    return {
      univers: p.id === undefined ? 0 : idDeChemin(p.id),
      campagne: p.cid === undefined ? 0 : idDeChemin(p.cid),
      scenario: p.sid === undefined ? 0 : idDeChemin(p.sid),
      tache: p.tid === undefined ? 0 : idDeChemin(p.tid),
    };
  };
  const compte = (request: { session?: { id: number } | null }) => request.session!.id;

  // Campaigns
  app.post('/api/univers/:id/campagnes', async (request, reply) => {
    const b = corps(request);
    const c = creerCampagne(app.db, compte(request), ids(request).univers, {
      nom: chaine(b.nom, 'Le nom doit faire de 1 à 80 caractères.'),
    });
    return reply.code(201).send(c);
  });

  app.get('/api/univers/:id/campagnes', async (request) => ({
    campagnes: listerCampagnes(app.db, compte(request), ids(request).univers),
  }));

  app.get('/api/univers/:id/campagnes/:cid', async (request) => {
    const i = ids(request);
    return lireCampagne(app.db, compte(request), i.univers, i.campagne);
  });

  app.patch('/api/campagnes/:cid', async (request) => {
    const b = corps(request);
    return changerStatutCampagne(app.db, compte(request), ids(request).campagne, chaine(b.statut, 'Statut inconnu.'));
  });

  // Scenarios (GM of the campaign's universe; everyone else: 404)
  app.post('/api/campagnes/:cid/scenarios', async (request, reply) => {
    const b = corps(request);
    const s = creerScenario(app.db, compte(request), ids(request).campagne, {
      titre: chaine(b.titre, 'Le titre : de 1 à 120 caractères.'),
      contenu: facultative(b.contenu, 'Le contenu doit être un texte.'),
    });
    return reply.code(201).send(s);
  });

  app.get('/api/campagnes/:cid/scenarios', async (request) => ({
    scenarios: listerScenarios(app.db, compte(request), ids(request).campagne),
  }));

  app.get('/api/scenarios/:sid', async (request) =>
    lireScenario(app.db, compte(request), ids(request).scenario),
  );

  app.put('/api/scenarios/:sid', async (request) => {
    const b = corps(request);
    const titre = chaine(b.titre, 'Le titre : de 1 à 120 caractères.');
    const contenu = chaine(b.contenu, 'Le contenu doit être un texte.');
    if (typeof b.version !== 'number' || !Number.isInteger(b.version)) throw invalide('Version invalide.');
    return ecrireScenario(app.db, compte(request), ids(request).scenario, { titre, contenu }, b.version);
  });

  // Preparation tasks
  app.post('/api/campagnes/:cid/taches', async (request, reply) => {
    const b = corps(request);
    const t = ajouterTache(app.db, compte(request), ids(request).campagne, {
      categorie: chaine(b.categorie, 'Catégorie inconnue.'),
      libelle: chaine(b.libelle, 'Le libellé : de 1 à 200 caractères.'),
    });
    return reply.code(201).send(t);
  });

  app.get('/api/campagnes/:cid/taches', async (request) => ({
    taches: listerTaches(app.db, compte(request), ids(request).campagne),
  }));

  app.put('/api/taches/:tid', async (request) => {
    const b = corps(request);
    if (typeof b.faite !== 'boolean') throw invalide('Indiquer si la tâche est faite.');
    return cocherTache(app.db, compte(request), ids(request).tache, b.faite);
  });

  // Session reports
  app.post('/api/univers/:id/comptes-rendus', async (request, reply) => {
    const b = corps(request);
    if (typeof b.campagneId !== 'number' || !Number.isSafeInteger(b.campagneId)) {
      throw invalide('Campagne inconnue.');
    }
    const fiche = creerCompteRendu(app.db, compte(request), ids(request).univers, b.campagneId, {
      titre: chaine(b.titre, 'Le titre : de 1 à 120 caractères.'),
      texte: facultative(b.texte, 'Le texte doit être un texte.'),
    });
    return reply.code(201).send(fiche);
  });

  const lister = (request: { session?: { id: number } | null; query?: unknown; params: unknown }, campagne?: number) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const curseur = facultative(q.curseur, 'Curseur invalide.');
    let campagneId = campagne;
    if (campagneId === undefined && q.campagne !== undefined) {
      if (typeof q.campagne !== 'string') throw invalide('Campagne inconnue.');
      campagneId = idDeChemin(q.campagne);
    }
    return listerComptesRendus(app.db, acteur(request), ids(request).univers, { campagneId, curseur });
  };

  app.get('/api/univers/:id/comptes-rendus', async (request) => lister(request));

  app.get('/api/univers/:id/campagnes/:cid/comptes-rendus', async (request) =>
    lister(request, ids(request).campagne),
  );
}
