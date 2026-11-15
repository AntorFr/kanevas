import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

import { acteur, corps } from '../../routes/fiches.js';
import { idDeChemin } from '../../routes/univers.js';
import { introuvable, invalide, refuse } from '../../services/erreurs.js';
import { declarationSection, poserSectionGeree } from '../../services/sections-gerees.js';

/**
 * The trial generator's own route (S-6): it creates or rewrites its trial section through `poserSectionGeree`,
 * on behalf of the caller. It exists only where the `essai` module does (stub or test).
 */
export function routesEssai(app: FastifyInstance, garde: (cle: string) => preHandlerHookHandler): void {
  app.post('/api/univers/:id/outils/essai/g/sections', { preHandler: garde('essai/g') }, async (request, reply) => {
    const a = acteur(request);
    if (a.modeJoueur) throw refuse();
    const universId = idDeChemin((request.params as { id: string }).id);
    const b = corps(request);
    if (!Number.isSafeInteger(b.ficheId)) throw invalide('La fiche est requise.');
    if (typeof b.type !== 'string') throw invalide('Le type de section est requis.');
    if (b.sectionId !== undefined && !Number.isSafeInteger(b.sectionId)) throw invalide('Section invalide.');
    if (b.auteurId !== undefined && b.auteurId !== null && !Number.isSafeInteger(b.auteurId)) {
      throw invalide("L'auteur doit être un joueur de l'univers.");
    }
    if (b.version !== undefined && !Number.isSafeInteger(b.version)) throw invalide('Version invalide.');
    const decl = declarationSection('essai/g', b.type);
    if (!decl) throw introuvable();
    const ficheId = b.ficheId as number;
    const sectionId = b.sectionId as number | undefined;
    const p = decl.produire({ db: app.db, acteur: a, universId, ficheId, sectionId: sectionId ?? null });
    const vue = poserSectionGeree(app.db, a.compteId, universId, {
      ficheId,
      outil: 'essai/g',
      type: b.type,
      sectionId,
      version: b.version as number | undefined,
      contenu: p.contenu,
      sourceVersion: p.sourceVersion,
      audience: { auteurId: (b.auteurId as number | null | undefined) ?? null, auteurLit: true, auteurEcrit: true },
    });
    return reply.code(sectionId === undefined ? 201 : 200).send(vue);
  });
}
