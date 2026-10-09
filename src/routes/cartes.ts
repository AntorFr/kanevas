import '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

import {
  ajouterElement,
  creerCarte,
  deplacerElement,
  lireCarte,
  listerCartes,
  ouvrirFond,
  reglerCarte,
  remplacerFond,
  retirerElement,
  type FormeCarte,
} from '../services/cartes.js';
import { invalide } from '../services/erreurs.js';
import { acteur, corps } from './fiches.js';
import { idDeChemin } from './univers.js';

/** Maps, elements and background; thin routes over `services/cartes.ts` (AD-2): no guard of their own. */
export function registerCartesRoutes(app: FastifyInstance) {
  const base = '/api/univers/:id/cartes';
  type P = { id: string; cid?: string; eid?: string };
  const ids = (request: { params: unknown }) => {
    const p = request.params as P;
    return {
      univers: idDeChemin(p.id),
      carte: p.cid === undefined ? 0 : idDeChemin(p.cid),
      element: p.eid === undefined ? 0 : idDeChemin(p.eid),
    };
  };

  /** The file part of a multipart request as a stream; a truncated body is an error, not a short file. */
  function fluxDe(part: { file: AsyncIterable<unknown> & { truncated?: boolean } }) {
    return (async function* () {
      for await (const morceau of part.file) yield morceau as Buffer;
      if (part.file.truncated) throw invalide('Envoi interrompu.');
    })();
  }

  app.get(base, async (request) => {
    const a = acteur(request);
    const q = request.query as Record<string, unknown>;
    if (q.curseur !== undefined && typeof q.curseur !== 'string') throw invalide('Requête invalide.');
    return listerCartes(app.db, a.compteId, !!a.modeJoueur, ids(request).univers, {
      curseur: q.curseur as string | undefined,
    });
  });

  // JSON `{titre, forme}`, or multipart with `titre` and `forme` before the `fichier` (illustrated map).
  app.post(base, async (request, reply) => {
    const a = acteur(request);
    const univers = ids(request).univers;
    if (request.isMultipart()) {
      const part = await request.file();
      if (!part || part.fieldname !== 'fichier') throw invalide('Champ « fichier » manquant.');
      const champ = (n: string) => (part.fields[n] as { value?: unknown } | undefined)?.value;
      const carte = await creerCarte(app.db, a.compteId, !!a.modeJoueur, univers, {
        titre: champ('titre') as string,
        forme: (champ('forme') ?? 'illustree') as FormeCarte,
        fond: fluxDe(part),
      });
      return reply.code(201).send(carte);
    }
    const b = corps(request);
    if (typeof b.titre !== 'string') throw invalide('Le titre : de 1 à 80 caractères.');
    const carte = await creerCarte(app.db, a.compteId, !!a.modeJoueur, univers, {
      titre: b.titre,
      forme: b.forme as FormeCarte,
    });
    return reply.code(201).send(carte);
  });

  app.get(`${base}/:cid`, async (request) => {
    const a = acteur(request);
    return lireCarte(app.db, a.compteId, !!a.modeJoueur, ids(request).carte);
  });

  app.patch(`${base}/:cid`, async (request) => {
    const a = acteur(request);
    const b = corps(request);
    if (b.titre !== undefined && typeof b.titre !== 'string') throw invalide('Le titre : de 1 à 80 caractères.');
    if (b.visible !== undefined && typeof b.visible !== 'boolean') {
      throw invalide('La visibilité doit être vraie ou fausse.');
    }
    return reglerCarte(app.db, a.compteId, !!a.modeJoueur, ids(request).carte, {
      titre: b.titre as string | undefined,
      visible: b.visible as boolean | undefined,
    });
  });

  // Streamed to the service, which counts the bytes and stops at the limit (AD-69).
  app.put(`${base}/:cid/fond`, async (request) => {
    const a = acteur(request);
    if (!request.isMultipart()) throw invalide('Envoi multipart attendu (champ « fichier »).');
    const part = await request.file();
    if (!part || part.fieldname !== 'fichier') throw invalide('Champ « fichier » manquant.');
    return remplacerFond(app.db, a.compteId, !!a.modeJoueur, ids(request).carte, fluxDe(part));
  });

  // No player mode on a direct read (AD-69): the actor is the account alone.
  app.get(`${base}/:cid/fond`, async (request, reply) => {
    const f = await ouvrirFond(app.db, request.session!.id, ids(request).carte);
    return reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cache-Control', 'private, no-store')
      .header('Content-Length', f.taille)
      .type(f.type)
      .send(f.flux);
  });

  app.post(`${base}/:cid/elements`, async (request, reply) => {
    const a = acteur(request);
    const b = corps(request);
    const e = ajouterElement(app.db, a.compteId, !!a.modeJoueur, ids(request).carte, {
      ficheId: b.ficheId as number,
      x: b.x as number | undefined,
      y: b.y as number | undefined,
    });
    return reply.code(201).send(e);
  });

  app.patch(`${base}/:cid/elements/:eid`, async (request) => {
    const a = acteur(request);
    const b = corps(request);
    const i = ids(request);
    return deplacerElement(app.db, a.compteId, !!a.modeJoueur, i.carte, i.element, {
      x: b.x as number,
      y: b.y as number,
    });
  });

  app.delete(`${base}/:cid/elements/:eid`, async (request, reply) => {
    const a = acteur(request);
    const i = ids(request);
    retirerElement(app.db, a.compteId, !!a.modeJoueur, i.carte, i.element);
    return reply.code(204).send();
  });
}
