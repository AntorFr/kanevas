import type { FastifyInstance } from 'fastify';

import { creerCompteRendu, listerComptesRendus } from '../services/comptes_rendus.js';
import { introuvable, invalide } from '../services/erreurs.js';
import { ajouterTache, cocherTache, exigerMJDeAventure, listerTaches } from '../services/preparation.js';
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
 * Preparation tasks and session reports; thin routes over `services/` (AD-2), no guard of their own.
 * The tasks hang on an adventure sheet (`/fiches/:fid/taches`, AD-124 (3)); the service reads the
 * adventure's own universe (AD-47) and the path's universe must be that one, else « not found ».
 * A task is addressed by its own id. No delete.
 */
export function registerSuiviRoutes(app: FastifyInstance) {
  type P = { id?: string; fid?: string; tid?: string };
  const ids = (request: { params: unknown }) => {
    const p = request.params as P;
    return {
      univers: p.id === undefined ? 0 : idDeChemin(p.id),
      fiche: p.fid === undefined ? 0 : idDeChemin(p.fid),
      tache: p.tid === undefined ? 0 : idDeChemin(p.tid),
    };
  };
  const compte = (request: { session?: { id: number } | null }) => request.session!.id;

  // Preparation tasks (GM of the adventure's universe; everyone else: 404)
  const aventure = (request: { params: unknown; session?: { id: number } | null }) => {
    const i = ids(request);
    const f = exigerMJDeAventure(app.db, compte(request), i.fiche);
    if (f.univers_id !== i.univers) throw introuvable();
    return f.id;
  };

  app.post('/api/univers/:id/fiches/:fid/taches', async (request, reply) => {
    const fiche = aventure(request);
    const b = corps(request);
    const t = ajouterTache(app.db, compte(request), fiche, {
      categorie: chaine(b.categorie, 'Catégorie inconnue.'),
      libelle: chaine(b.libelle, 'Le libellé : de 1 à 200 caractères.'),
    });
    return reply.code(201).send(t);
  });

  app.get('/api/univers/:id/fiches/:fid/taches', async (request) => ({
    taches: listerTaches(app.db, compte(request), aventure(request)),
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

  app.get('/api/univers/:id/comptes-rendus', async (request) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const curseur = facultative(q.curseur, 'Curseur invalide.');
    let campagneId: number | undefined;
    if (q.campagne !== undefined) {
      if (typeof q.campagne !== 'string') throw invalide('Campagne inconnue.');
      campagneId = idDeChemin(q.campagne);
    }
    return listerComptesRendus(app.db, acteur(request), ids(request).univers, { campagneId, curseur });
  });
}
