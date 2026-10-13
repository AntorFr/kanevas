import type { FastifyInstance } from 'fastify';

import { invalide } from '../services/erreurs.js';
import {
  creerEtRattacherSysteme,
  creerGabarit,
  creerSysteme,
  listerGabarits,
  lireSysteme,
  listerCatalogue,
  listerSystemes,
  modifierGabarit,
  rattacherSysteme,
} from '../services/systemes.js';
import { modifierUnivers } from '../services/univers.js';
import { idDeChemin } from './univers.js';

function corps(request: { body?: unknown }): Record<string, unknown> {
  const b = request.body;
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

const idUnivers = (request: { params: unknown }) => idDeChemin((request.params as { id: string }).id);

/**
 * Game systems, templates and universe editing; thin routes over `services/`
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
    if (typeof b.nom !== 'string') throw invalide('Le nom doit faire de 1 à 80 caractères.');
    if (typeof b.description !== 'string') throw invalide('La description doit être un texte.');
    return modifierUnivers(app.db, request.session!.id, idUnivers(request), {
      nom: b.nom,
      description: b.description,
    });
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
    const q = request.query as { type?: unknown; curseur?: unknown };
    if (q.type !== undefined && typeof q.type !== 'string') throw invalide('Type de gabarit inconnu.');
    if (q.curseur !== undefined && typeof q.curseur !== 'string') throw invalide('Curseur invalide.');
    const compte = request.session!.id;
    const id = sid(request);
    const systeme = lireSysteme(app.db, compte, id);
    const page = listerGabarits(app.db, compte, id, { type: q.type ?? 'regle', curseur: q.curseur });
    return { ...systeme, gabarits: page.gabarits, suivant: page.suivant };
  });

  app.post('/api/systemes/:sid/gabarits', async (request, reply) => {
    const b = corps(request);
    if (typeof b.type !== 'string') throw invalide('Type de gabarit inconnu.');
    if (typeof b.nom !== 'string') throw invalide('Le nom doit faire de 1 à 120 caractères.');
    if (b.contenu !== undefined && typeof b.contenu !== 'string') throw invalide('Le contenu doit être un texte.');
    const g = creerGabarit(app.db, request.session!.id, sid(request), {
      type: b.type,
      nom: b.nom,
      contenu: b.contenu,
    });
    return reply.code(201).send(g);
  });

  app.put('/api/systemes/:sid/gabarits/:gabaritId', async (request) => {
    const b = corps(request);
    if (typeof b.nom !== 'string') throw invalide('Le nom doit faire de 1 à 120 caractères.');
    if (typeof b.contenu !== 'string') throw invalide('Le contenu doit être un texte.');
    if (typeof b.version !== 'number' || !Number.isInteger(b.version)) throw invalide('Version invalide.');
    return modifierGabarit(
      app.db,
      request.session!.id,
      sid(request),
      idDeChemin((request.params as { gabaritId: string }).gabaritId),
      { nom: b.nom, contenu: b.contenu, version: b.version },
    );
  });
}
