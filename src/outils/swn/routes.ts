import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify';

import { acteur } from '../../routes/fiches.js';
import { ErreurService } from '../../services/erreurs.js';
import { lireDocument, poserDocumentMJ } from '../../services/swn/document.js';
import {
  dessinerZone, modifierRoute, modifierSysteme, modifierZone, placerSysteme, retirerRoute, retirerSysteme, retirerZone, tracerRoute,
} from '../../services/swn/ecriture-carte.js';
import {
  changerGraine, contenuGalaxie, creerGalaxie, exigerEcritureGalaxie, lireGalaxie, lireGraine, renommerGalaxie, rendreVisibleGalaxie, supprimerGalaxie,
} from '../../services/swn/galaxies.js';
import { illustrationAstre, illustrerFiche } from '../../services/swn/illustration.js';
import {
  ajouterAstre, ajouterZone, ancrer, delierAstre, delierZone, etatMasque, lierAstre, lierZone, masquerSysteme, modifierAstre, modifierZone as modifierZoneSysteme, poserTransition, retirerAstre, retirerZone as retirerZoneSysteme,
  type ResultatEcriture,
} from '../../services/swn/ecriture-systeme.js';
import { lireInterieur } from '../../services/swn/interieur.js';
import { lireSorties } from '../../services/swn/sorties.js';
import { lireBlocs, lireRoute, lireSysteme, lireZone, rechercherSystemes } from '../../services/swn/lecture-carte.js';
import { calculerTrajet } from '../../services/swn/trajet.js';

const RACINE = '/api/univers/:id/outils/swn/galaxie/galaxies';
const BASE = `${RACINE}/:gid`;

/** A path segment as a positive integer, else NaN (the service then answers `introuvable`). */
const entier = (v: unknown) => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : NaN);
/** `bx,by` as two integers; anything else is NaN, which the rectangle check refuses (`invalide`). */
const coord = (v: unknown): { bx: number; by: number } => {
  const m = typeof v === 'string' ? /^(-?\d{1,12}),(-?\d{1,12})$/.exec(v) : null;
  return m ? { bx: Number(m[1]), by: Number(m[2]) } : { bx: NaN, by: NaN };
};
/** A JSON object body; anything else is an empty one (the services then refuse the missing fields). */
const corps = (request: { body?: unknown }): Record<string, unknown> =>
  request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
/** A query value as an integer, else NaN (the service then answers `invalide` with the field). */
const nombre = (v: unknown) => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : NaN);
const texte = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Read routes of the galaxy (G-6), thin over `services/swn/*`. A galaxy, a system or a route the caller
 * cannot read is the same 404 as an unregistered path (AD-124): the service's `introuvable` becomes `callNotFound`.
 */
export function routesGalaxie(app: FastifyInstance, garde: (cle: string) => preHandlerHookHandler): void {
  const ids = (request: { params: unknown }) => {
    const p = request.params as { id: string; gid: string; cle?: string };
    return { univers: entier(p.id), galaxie: entier(p.gid), cle: p.cle };
  };
  const lire = (fn: (request: { params: unknown; query: unknown }, a: ReturnType<typeof acteur>) => unknown) =>
    async (request: { params: unknown; query: unknown }, reply: FastifyReply) => {
      try {
        return fn(request, acteur(request as never));
      } catch (e) {
        if (e instanceof ErreurService && e.code === 'introuvable') return reply.callNotFound();
        throw e;
      }
    };
  const opts = { preHandler: garde('swn/galaxie') };

  app.get(BASE, opts, lire((request, a) => {
    const i = ids(request);
    return lireGalaxie(app.db, a, i.univers, i.galaxie);
  }));

  app.get(`${BASE}/blocs`, opts, lire((request, a) => {
    const i = ids(request);
    const q = request.query as Record<string, unknown>;
    return lireBlocs(app.db, a, i.univers, i.galaxie, coord(q.de), coord(q.a));
  }));

  app.get(`${BASE}/systemes/:cle`, opts, lire((request, a) => {
    const i = ids(request);
    return lireSysteme(app.db, a, i.univers, i.galaxie, i.cle!);
  }));

  // The interior of a system, addressed by its hexagon; a non-integer coordinate is `introuvable`, never a 400.
  app.get(`${BASE}/interieur/:q/:r`, opts, lire((request, a) => {
    const i = ids(request);
    const p = request.params as { q: string; r: string };
    const ent = (v: string) => (/^-?\d{1,12}$/.test(v) ? Number(v) : NaN);
    return lireInterieur(app.db, a, i.univers, i.galaxie, ent(p.q), ent(p.r));
  }));

  // The exits of a system: same guards as the interior, composed from the readable routes (AD-carte-3).
  app.get(`${BASE}/interieur/:q/:r/sorties`, opts, lire((request, a) => {
    const i = ids(request);
    const p = request.params as { q: string; r: string };
    const ent = (v: string) => (/^-?\d{1,12}$/.test(v) ? Number(v) : NaN);
    return lireSorties(app.db, a, i.univers, i.galaxie, ent(p.q), ent(p.r));
  }));

  // The picture of a body: the guards of the interior, then a cached WebP drawn off the request thread (AD-carte-2).
  app.get(`${BASE}/interieur/:q/:r/astres/:cle/illustration`, opts, async (request, reply) => {
    const i = ids(request);
    const p = request.params as { q: string; r: string };
    const ent = (v: string) => (/^-?\d{1,12}$/.test(v) ? Number(v) : NaN);
    const cote = (request.query as Record<string, unknown>).cote;
    try {
      const vue = await illustrationAstre(app.db, acteur(request as never), i.univers, i.galaxie, ent(p.q), ent(p.r), i.cle!,
        typeof cote === 'string' && /^\d{1,15}$/.test(cote) ? Number(cote) : NaN, { siEtag: request.headers['if-none-match'] });
      reply.header('Cache-Control', 'private, no-cache').header('ETag', vue.etag);
      if (vue.octets === null) return reply.code(304).send();
      return reply.type(vue.type).send(vue.octets);
    } catch (e) {
      if (e instanceof ErreurService && e.code === 'introuvable') return reply.callNotFound();
      throw e;
    }
  });

  // « Illustrer la fiche » (AD-liens-4): the GM only; the dialog's `cote` rides in the body. Anchors nothing, writes no `swn_*`.
  app.post(`${BASE}/interieur/:q/:r/astres/:cle/illustrer-fiche`, opts, async (request, reply) => {
    const i = ids(request);
    const p = request.params as { q: string; r: string };
    const ent = (v: string) => (/^-?\d{1,12}$/.test(v) ? Number(v) : NaN);
    const cote = corps(request as { body?: unknown }).cote;
    try {
      return reply.code(200).send(await illustrerFiche(app.db, acteur(request as never), i.univers, i.galaxie, ent(p.q), ent(p.r), i.cle!,
        typeof cote === 'number' ? cote : NaN));
    } catch (e) {
      if (e instanceof ErreurService && e.code === 'introuvable') return reply.callNotFound();
      throw e;
    }
  });

  app.get(`${BASE}/recherche`, opts, lire((request, a) => {
    const i = ids(request);
    return rechercherSystemes(app.db, a, i.univers, i.galaxie, texte((request.query as Record<string, unknown>).q));
  }));

  app.get(`${BASE}/trajet`, opts, lire((request, a) => {
    const i = ids(request);
    const q = request.query as Record<string, unknown>;
    return calculerTrajet(app.db, a, i.univers, i.galaxie, {
      depart: texte(q.depart), arrivee: texte(q.arrivee),
      moteur: q.moteur === undefined ? undefined : typeof q.moteur === 'string' && q.moteur !== '' ? Number(q.moteur) : NaN,
      routes: q.routes as 'toutes' | 'publiques' | undefined,
    });
  }));

  // ---- Writes (T-8): thin over the services, which hold the guard (T-1), the versions (T-2) and the document signal (T-7).
  type Req = { params: unknown; query: unknown; body?: unknown };
  const ecrire = (fn: (request: Req, a: ReturnType<typeof acteur>) => { statut: number; corps?: unknown }) =>
    async (request: Req, reply: FastifyReply) => {
      try {
        const r = fn(request, acteur(request as never));
        return r.corps === undefined ? reply.code(r.statut).send() : reply.code(r.statut).send(r.corps);
      } catch (e) {
        if (e instanceof ErreurService && e.code === 'introuvable') return reply.callNotFound();
        throw e;
      }
    };
  const vueSysteme = (a: ReturnType<typeof acteur>, i: ReturnType<typeof ids>, cle: string) =>
    ({ cle, ...lireSysteme(app.db, a, i.univers, i.galaxie, cle) });

  app.post(RACINE, opts, ecrire((request, a) => {
    const b = corps(request);
    return { statut: 201, corps: creerGalaxie(app.db, a, ids(request).univers, { titre: b.titre }) };
  }));

  app.patch(BASE, opts, ecrire((request, a) => {
    const i = ids(request);
    const b = corps(request);
    const titre = b.titre !== undefined, visible = b.visible !== undefined;
    if (titre === visible) {
      // Both or none: the guard answers first so that a reader never learns anything from the shape of the body.
      exigerEcritureGalaxie(app.db, a, i.univers, i.galaxie);
      throw new ErreurService('invalide', 'Le titre ou la visibilité, un seul à la fois.', undefined, titre ? 'visible' : 'titre');
    }
    if (titre) renommerGalaxie(app.db, a, i.univers, i.galaxie, { titre: b.titre, version: b.version });
    else rendreVisibleGalaxie(app.db, a, i.univers, i.galaxie, b.visible, b.version);
    return { statut: 200, corps: lireGalaxie(app.db, a, i.univers, i.galaxie) };
  }));

  app.put(`${BASE}/graine`, opts, ecrire((request, a) => {
    const i = ids(request);
    const b = corps(request);
    changerGraine(app.db, a, i.univers, i.galaxie, { graine: b.graine, version: b.version, confirme: b.confirme });
    return { statut: 200, corps: lireGalaxie(app.db, a, i.univers, i.galaxie) };
  }));

  app.get(`${BASE}/graine`, opts, ecrire((request, a) => {
    const i = ids(request);
    return { statut: 200, corps: lireGraine(app.db, a, i.univers, i.galaxie) };
  }));

  app.get(`${BASE}/contenu`, opts, ecrire((request, a) => {
    const i = ids(request);
    const { systemes, routes, zones, document } = contenuGalaxie(app.db, a, i.univers, i.galaxie);
    return { statut: 200, corps: { systemes, routes, zones, document: document ? { titre: document.titre } : null } };
  }));

  app.delete(BASE, opts, ecrire((request, a) => {
    const i = ids(request);
    const q = request.query as Record<string, unknown>;
    try {
      supprimerGalaxie(app.db, a, i.univers, i.galaxie, nombre(q.version),
        { systemes: nombre(q.systemes), routes: nombre(q.routes), zones: nombre(q.zones) });
    } catch (e) {
      // The dialog needs the new counts to state them again, not only the sentence.
      if (e instanceof ErreurService && e.detail === 'contenu_change') {
        const { systemes, routes, zones } = contenuGalaxie(app.db, a, i.univers, i.galaxie);
        return { statut: 409, corps: { message: e.message, code: 'contenu_change', systemes, routes, zones } };
      }
      throw e;
    }
    return { statut: 204 };
  }));

  app.post(`${BASE}/systemes`, opts, ecrire((request, a) => {
    const i = ids(request);
    const r = placerSysteme(app.db, a, i.univers, i.galaxie, corps(request) as never);
    return { statut: 201, corps: vueSysteme(a, i, r.cle) };
  }));
  app.patch(`${BASE}/systemes/:cle`, opts, ecrire((request, a) => {
    const i = ids(request);
    modifierSysteme(app.db, a, i.univers, i.galaxie, i.cle!, corps(request));
    return { statut: 200, corps: vueSysteme(a, i, i.cle!) };
  }));
  app.delete(`${BASE}/systemes/:cle`, opts, ecrire((request, a) => {
    const i = ids(request);
    retirerSysteme(app.db, a, i.univers, i.galaxie, i.cle!, nombre((request.query as Record<string, unknown>).version));
    return { statut: 204 };
  }));

  const idRoute = (request: { params: unknown }) => entier((request.params as { rid: string }).rid);
  app.post(`${BASE}/routes`, opts, ecrire((request, a) => {
    const i = ids(request);
    const r = tracerRoute(app.db, a, i.univers, i.galaxie, corps(request) as never);
    return { statut: 201, corps: lireRoute(app.db, a, i.univers, i.galaxie, r.id) };
  }));
  app.patch(`${BASE}/routes/:rid`, opts, ecrire((request, a) => {
    const i = ids(request);
    const rid = idRoute(request);
    modifierRoute(app.db, a, i.univers, i.galaxie, rid, corps(request));
    return { statut: 200, corps: lireRoute(app.db, a, i.univers, i.galaxie, rid) };
  }));
  app.delete(`${BASE}/routes/:rid`, opts, ecrire((request, a) => {
    const i = ids(request);
    retirerRoute(app.db, a, i.univers, i.galaxie, idRoute(request), nombre((request.query as Record<string, unknown>).version));
    return { statut: 204 };
  }));

  app.post(`${BASE}/zones`, opts, ecrire((request, a) => {
    const i = ids(request);
    const r = dessinerZone(app.db, a, i.univers, i.galaxie, corps(request) as never);
    return { statut: 201, corps: lireZone(app.db, a, i.univers, i.galaxie, r.cle) };
  }));
  app.patch(`${BASE}/zones/:cle`, opts, ecrire((request, a) => {
    const i = ids(request);
    modifierZone(app.db, a, i.univers, i.galaxie, i.cle!, corps(request));
    return { statut: 200, corps: lireZone(app.db, a, i.univers, i.galaxie, i.cle!) };
  }));
  app.delete(`${BASE}/zones/:cle`, opts, ecrire((request, a) => {
    const i = ids(request);
    retirerZone(app.db, a, i.univers, i.galaxie, i.cle!, nombre((request.query as Record<string, unknown>).version));
    return { statut: 204 };
  }));

  // ---- Writes of the interior of a system (AD-edition-5), thin over `ecriture-systeme.ts`. The cookie alone opens them
  // (no `Authorization` is read); an unreadable hexagon is the same 404 as the read, an unknown body keeps its `astre_inconnu`.
  const ent = (v: string) => (/^-?\d{1,12}$/.test(v) ? Number(v) : NaN);
  const interieur = (fn: (request: Req, a: ReturnType<typeof acteur>, i: ReturnType<typeof ids>, q: number, r: number) => ResultatEcriture, statut = 200) =>
    async (request: Req, reply: FastifyReply) => {
      try {
        const p = request.params as { q: string; r: string };
        const res = fn(request, acteur(request as never), ids(request), ent(p.q), ent(p.r));
        return reply.code(statut).send(res.interieur);
      } catch (e) {
        if (e instanceof ErreurService && e.code === 'introuvable' && e.detail !== 'astre_inconnu' && e.detail !== 'systeme_inconnu') return reply.callNotFound();
        throw e;
      }
    };
  const INT = `${BASE}/interieur/:q/:r`;
  /** The tokens of a DELETE ride in the query: `version` of the body or zone, `versionSysteme` of the system. */
  const jetons = (request: Req) => {
    const q = request.query as Record<string, unknown>;
    return {
      version: nombre(q.version), versionSysteme: q.versionSysteme === undefined ? undefined : nombre(q.versionSysteme),
      ...(typeof q.nomAncrage === 'string' ? { nomAncrage: q.nomAncrage } : {}),
    };
  };

  app.post(`${INT}/ancrage`, opts, interieur((request, a, i, q, r) => ancrer(app.db, a, i.univers, i.galaxie, q, r, corps(request))));
  app.post(`${INT}/astres`, opts, interieur((request, a, i, q, r) => ajouterAstre(app.db, a, i.univers, i.galaxie, q, r, corps(request)), 201));
  app.patch(`${INT}/astres/:cle`, opts, interieur((request, a, i, q, r) => modifierAstre(app.db, a, i.univers, i.galaxie, q, r, i.cle!, corps(request))));
  app.delete(`${INT}/astres/:cle`, opts, interieur((request, a, i, q, r) => retirerAstre(app.db, a, i.univers, i.galaxie, q, r, i.cle!, jetons(request))));
  app.post(`${INT}/zones`, opts, interieur((request, a, i, q, r) => ajouterZone(app.db, a, i.univers, i.galaxie, q, r, corps(request)), 201));
  app.patch(`${INT}/zones/:cle`, opts, interieur((request, a, i, q, r) => modifierZoneSysteme(app.db, a, i.univers, i.galaxie, q, r, i.cle!, corps(request))));
  app.delete(`${INT}/zones/:cle`, opts, interieur((request, a, i, q, r) => retirerZoneSysteme(app.db, a, i.univers, i.galaxie, q, r, i.cle!, jetons(request))));
  // The link to a sheet (AD-liens-1): the same guard and cookie as the writes above; the body is the interior as the read gives it.
  app.put(`${INT}/astres/:cle/fiche`, opts, interieur((request, a, i, q, r) => lierAstre(app.db, a, i.univers, i.galaxie, q, r, i.cle!, corps(request))));
  app.put(`${INT}/zones/:cle/fiche`, opts, interieur((request, a, i, q, r) => lierZone(app.db, a, i.univers, i.galaxie, q, r, i.cle!, corps(request))));
  app.delete(`${INT}/astres/:cle/fiche`, opts, interieur((request, a, i, q, r) => delierAstre(app.db, a, i.univers, i.galaxie, q, r, i.cle!, jetons(request))));
  app.delete(`${INT}/zones/:cle/fiche`, opts, interieur((request, a, i, q, r) => delierZone(app.db, a, i.univers, i.galaxie, q, r, i.cle!, jetons(request))));
  app.put(`${INT}/secret`, opts, interieur((request, a, i, q, r) => masquerSysteme(app.db, a, i.univers, i.galaxie, q, r, corps(request))));
  app.get(`${INT}/secret`, opts, async (request: Req, reply: FastifyReply) => {
    try {
      const p = request.params as { q: string; r: string };
      const i = ids(request);
      return reply.send(etatMasque(app.db, acteur(request as never), i.univers, i.galaxie, ent(p.q), ent(p.r)));
    } catch (e) {
      if (e instanceof ErreurService && e.code === 'introuvable' && e.detail !== 'systeme_inconnu') return reply.callNotFound();
      throw e;
    }
  });
  app.put(`${INT}/transition`, opts, interieur((request, a, i, q, r) => poserTransition(app.db, a, i.univers, i.galaxie, q, r, corps(request))));

  app.get(`${BASE}/document`, opts, ecrire((request, a) => {
    const i = ids(request);
    return { statut: 200, corps: lireDocument(app.db, a, i.univers, i.galaxie) };
  }));
  app.post(`${BASE}/document`, opts, ecrire((request, a) => {
    const i = ids(request);
    const b = corps(request);
    poserDocumentMJ(app.db, a, i.univers, i.galaxie, { ficheId: b.ficheId, creer: b.creer as never }, b.version);
    return { statut: 201, corps: lireDocument(app.db, a, i.univers, i.galaxie) };
  }));
}
