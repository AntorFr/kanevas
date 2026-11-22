import type { FastifyInstance } from 'fastify';

import { invalide } from '../services/erreurs.js';
import {
  creerEtRattacherSysteme,
  creerSysteme,
  lireSysteme,
  listerCatalogue,
  listerSystemes,
  rattacherSysteme,
} from '../services/systemes.js';
import { reglerTypeSysteme, reglerTypeUnivers, typesDeLUnivers, typesDuSysteme } from '../services/types-fiche.js';
import { changerCleUnivers } from '../services/cles.js';
import { lireUnivers, modifierUnivers } from '../services/univers.js';
import { acteur } from './fiches.js';
import { idDeChemin } from './univers.js';

function corps(request: { body?: unknown }): Record<string, unknown> {
  const b = request.body;
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

const idUnivers = (request: { params: unknown }) => idDeChemin((request.params as { id: string }).id);

/**
 * Game systems and universe editing; thin routes over `services/`
 * (AD-2, AD-4). A system has its own address, guarded by "attached to a universe
 * the caller belongs to" (AD-94). No delete.
 */
export function registerSystemesRoutes(app: FastifyInstance) {
  app.get('/api/systemes', async (request) => listerSystemes(app.db, request.session!.id));

  app.get('/api/systemes/catalogue', async (request) => listerCatalogue(app.db, request.session!.id));

  app.post('/api/systemes', async (request, reply) => {
    const b = corps(request);
    if (typeof b.nom !== 'string') throw invalide('Le nom doit faire de 1 à 80 caractères.');
    return reply.code(201).send(creerSysteme(app.db, request.session!.id, { nom: b.nom }));
  });

  app.patch('/api/univers/:id', async (request) => {
    const b = corps(request);
    const compteId = request.session!.id;
    const id = idUnivers(request);
    // The identifier (AD-146) may travel with the name and the description, or alone; without it both are required.
    if (b.cle === undefined) {
      if (typeof b.nom !== 'string') throw invalide('Le nom doit faire de 1 à 80 caractères.');
      if (typeof b.description !== 'string') throw invalide('La description doit être un texte.');
      return modifierUnivers(app.db, compteId, id, { nom: b.nom, description: b.description });
    }
    if (b.nom !== undefined && typeof b.nom !== 'string') throw invalide('Le nom doit faire de 1 à 80 caractères.');
    if (b.description !== undefined && typeof b.description !== 'string') throw invalide('La description doit être un texte.');
    // One transaction: a refused identifier saves neither the name nor the description.
    return app.db.transaction(() => {
      changerCleUnivers(app.db, acteur(request), id, b.cle);
      const u = lireUnivers(app.db, compteId, id);
      if (b.nom === undefined && b.description === undefined) return u;
      return modifierUnivers(app.db, compteId, id, {
        nom: (b.nom as string | undefined) ?? u.nom,
        description: (b.description as string | undefined) ?? u.description,
      });
    })();
  });

  app.put('/api/univers/:id/systeme', async (request, reply) => {
    const b = corps(request);
    const sid = b.systemeId;
    if (sid !== null && !(typeof sid === 'number' && Number.isSafeInteger(sid))) {
      throw invalide('Système inconnu.');
    }
    rattacherSysteme(app.db, request.session!.id, idUnivers(request), sid);
    return reply.code(204).send();
  });

  app.post('/api/univers/:id/systeme-nouveau', async (request, reply) => {
    const b = corps(request);
    if (typeof b.nom !== 'string') throw invalide('Le nom doit faire de 1 à 80 caractères.');
    const s = creerEtRattacherSysteme(app.db, request.session!.id, idUnivers(request), { nom: b.nom });
    return reply.code(201).send(s);
  });

  // `:sid` is checked by `idDeChemin` in the handler; the static `/api/systemes/catalogue` route wins over `:sid`, so "catalogue" is never taken for an identifier.
  const sid = (request: { params: unknown }) => idDeChemin((request.params as { sid: string }).sid);

  app.get('/api/systemes/:sid', async (request) => {
    const id = sid(request);
    const systeme = lireSysteme(app.db, request.session!.id, id);
    return { ...systeme, types: typesDuSysteme(app.db, id) };
  });

  app.get('/api/univers/:id/types', async (request) =>
    typesDeLUnivers(app.db, request.session!.id, idUnivers(request)),
  );

  app.put('/api/univers/:id/types/:type', async (request) => {
    const etat = corps(request).etat;
    if (typeof etat !== 'string') throw invalide('État inconnu.');
    return reglerTypeUnivers(
      app.db,
      request.session!.id,
      idUnivers(request),
      (request.params as { type: string }).type,
      etat,
    );
  });

  app.put('/api/systemes/:sid/types/:type', async (request) =>
    reglerTypeSysteme(
      app.db,
      request.session!.id,
      sid(request),
      (request.params as { type: string }).type,
      corps(request).active,
    ),
  );
}
