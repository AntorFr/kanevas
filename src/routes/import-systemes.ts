import type { FastifyInstance, FastifyRequest } from 'fastify';

import { espaceDe } from '../services/droits.js';
import { ErreurService, introuvable } from '../services/erreurs.js';
import { estId } from '../services/cles-forme.js';
import { resoudreFiche, tirerCleFiche } from '../services/cles.js';
import { modifierEnTete } from '../services/import-entete.js';
import { assurerFiche, supprimerFicheImport } from '../services/import-fiches.js';
import { ecrireSectionImport, retirerSectionImport } from '../services/import-sections.js';
import type { JetonRequete, JetonSysteme } from '../services/jetons.js';
import { lireFicheApi, listerFichesApi } from '../services/lecture-api.js';
import { lireSysteme } from '../services/systemes.js';

/** `?depuis` and `?apres` of a list of sheets, shared by the universe's door and the system's. */
export function optionsListe(q: { depuis?: unknown; apres?: unknown }): { depuis?: string; apres?: number } {
  const options: { depuis?: string; apres?: number } = {};
  if (q.depuis !== undefined) {
    if (typeof q.depuis !== 'string') throw new ErreurService('invalide', '« depuis » doit être une date ISO 8601.', undefined, 'depuis');
    options.depuis = q.depuis;
  }
  if (q.apres !== undefined) {
    if (typeof q.apres !== 'string' || !estId(q.apres)) {
      throw new ErreurService('invalide', '« apres » doit être un identifiant.', undefined, 'apres');
    }
    options.apres = Number(q.apres);
  }
  return options;
}

/**
 * The system door of the token scope (AD-systemes-api-1): elements of a system by id, `/api/v1` only. The hook of
 * `routes/import.ts` has already read the token's row and the account's right (`request.jeton` carries `systemeId`);
 * each handler calls the service of the universe's door on the system's hidden space, with the account as actor.
 * No relation, file, map, export, history, tool or batch route exists here.
 */
export function enregistrerRoutesSystemes(scope: FastifyInstance, app: FastifyInstance): void {
  const base = '/api/v1/systemes/:sid';
  const portee = { config: { portee: 'contenu' as const } };

  /** The token as the element services read it: the space plays the universe. */
  const jetonEspace = (request: FastifyRequest): JetonRequete => {
    const j = request.jeton as JetonSysteme;
    const espace = espaceDe(app.db, j.systemeId);
    if (espace === null) throw introuvable();
    return { ...j, universId: espace };
  };
  const reference = (j: JetonRequete, fid: string): string => {
    if (!estId(fid)) throw introuvable();
    // An element is addressed by id; the services read its key. Unknown: a placeholder, so each service answers as it would.
    return resoudreFiche(app.db, j.universId, fid)?.cle ?? 'inconnue';
  };

  scope.get(base, portee, async (request) => {
    const j = request.jeton as JetonSysteme;
    return { id: j.systemeId, nom: lireSysteme(app.db, j.compteId, j.systemeId).nom, niveau: j.niveau };
  });

  scope.get(`${base}/fiches`, portee, async (request) => {
    const j = jetonEspace(request);
    return listerFichesApi(app.db, { compteId: j.compteId }, j.universId, optionsListe(request.query as Record<string, unknown>));
  });

  scope.get(`${base}/fiches/:fid`, portee, async (request) => {
    const j = jetonEspace(request);
    const { fid } = request.params as { fid: string };
    if (!estId(fid)) throw introuvable();
    return lireFicheApi(app.db, { compteId: j.compteId }, j.universId, fid);
  });

  // Create: the body of the universe's `PUT`, no key in the address — one is drawn (AD-146).
  scope.post(`${base}/fiches`, portee, async (request, reply) => {
    const j = jetonEspace(request);
    const b = request.body;
    const c = b !== null && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
    const type = typeof c.type === 'string' ? c.type : 'fiche';
    const titre = typeof c.titre === 'string' ? c.titre : '';
    const cle = tirerCleFiche(app.db, j.universId, type, titre);
    return reply.code(201).send(assurerFiche(app.db, j, null, cle, b, app.horloge(), request.headers));
  });

  scope.patch(`${base}/fiches/:fid`, portee, async (request) => {
    const j = jetonEspace(request);
    const { fid } = request.params as { fid: string };
    return modifierEnTete(app.db, j, null, reference(j, fid), request.body, request.headers, app.horloge());
  });

  scope.delete(`${base}/fiches/:fid`, portee, async (request, reply) => {
    const j = jetonEspace(request);
    const { fid } = request.params as { fid: string };
    supprimerFicheImport(app.db, j, null, reference(j, fid), app.horloge());
    return reply.code(204).send();
  });

  scope.put(`${base}/fiches/:fid/sections/:scle`, portee, async (request) => {
    const j = jetonEspace(request);
    const { fid, scle } = request.params as { fid: string; scle: string };
    return ecrireSectionImport(app.db, j, null, reference(j, fid), scle, request.body, request.headers, app.horloge());
  });

  scope.delete(`${base}/fiches/:fid/sections/:scle`, portee, async (request, reply) => {
    const j = jetonEspace(request);
    const { fid, scle } = request.params as { fid: string; scle: string };
    retirerSectionImport(app.db, j, null, reference(j, fid), scle, request.headers, app.horloge());
    return reply.code(204).send();
  });
}
