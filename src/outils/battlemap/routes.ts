import '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { acteur } from '../../routes/fiches.js';
import { ErreurService, invalide } from '../../services/erreurs.js';
import {
  ajouterAsset, ajouterAssetDepuisFichier, compterUsage, listerAssets, listerFichiersDisponibles, modifierAssets, retirerAssets,
  type SaisieAsset,
} from '../../services/battlemap-assets.js';
import {
  ajouterReference, ajouterReferenceDepuisFichier, ecrireDirection, legenderReference, lireDirection, retirerReference,
} from '../../services/battlemap-direction.js';

const RACINE = '/api/univers/:id/outils/battlemap';

const entier = (v: unknown): number => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : NaN);
const corps = (request: { body?: unknown }): Record<string, unknown> =>
  request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
const idsDe = (v: unknown): number[] => {
  if (!Array.isArray(v) || v.length === 0 || v.length > 5000 || !v.every((x) => Number.isSafeInteger(x) && x > 0)) {
    throw invalide('Aucun asset sélectionné.');
  }
  return v as number[];
};
const idCorps = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) throw invalide('Le fichier est invalide.');
  return v;
};
const champTexte = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** The asset fields of a JSON body or of a multipart form (strings there). */
function saisieDe(b: Record<string, unknown>, formulaire: boolean): SaisieAsset {
  const nombre = (v: unknown) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return formulaire ? Number(v) : v as number;
  };
  const s: SaisieAsset = {};
  if (b.nom !== undefined) s.nom = b.nom as string;
  if (b.categorie !== undefined) s.categorie = b.categorie as string;
  const l = nombre(b.largeur), h = nombre(b.hauteur);
  if (l !== undefined) s.largeur = l;
  if (h !== undefined) s.hauteur = h;
  if (b.vueDessus !== undefined) s.vueDessus = formulaire ? b.vueDessus === 'true' : b.vueDessus as boolean;
  if (b.tags !== undefined) {
    s.tags = formulaire ? String(b.tags).split(',').map((t) => t.trim()).filter((t) => t !== '') : b.tags as string[];
  }
  return s;
}

/**
 * Routes of the asset library and the art direction (E-25, E-26), thin over `services/battlemap-*`. Guarded scope only (C-5): an
 * unusable tool, a caller with no write right, a hidden map: all the same 404 as an unregistered path. A GM in Player mode who writes
 * is `refuse` (AD-battlemap-assets-5), an error the common handler already words.
 */
export function routesBattlemap(app: FastifyInstance, garde: (cle: string) => preHandlerHookHandler): void {
  const opts = { preHandler: garde('battlemap/assets') };
  const univers = (request: { params: unknown }) => entier((request.params as { id: string }).id);
  type Req = FastifyRequest;

  const proteger = <T>(fn: (request: Req, reply: FastifyReply) => Promise<T> | T) =>
    async (request: Req, reply: FastifyReply) => {
      try {
        return await fn(request, reply);
      } catch (e) {
        if (e instanceof ErreurService && e.code === 'introuvable') return reply.callNotFound();
        throw e;
      }
    };

  /** The one file of a multipart request (fields before `fichier`), streamed to the service. */
  async function recevoir(request: Req) {
    if (!request.isMultipart()) throw invalide('Envoi multipart attendu (champ « fichier »).');
    const part = await request.file();
    if (!part || part.fieldname !== 'fichier') throw invalide('Champ « fichier » manquant.');
    async function* flux() {
      for await (const morceau of part!.file) yield morceau as Buffer;
      if (part!.file.truncated) throw invalide('Envoi interrompu.');
    }
    const champs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(part.fields)) champs[k] = (v as { value?: unknown } | undefined)?.value;
    return { flux: flux(), nom: part.filename.split(/[\\/]/).pop() ?? '', champs };
  }

  /** A refused upload names its file, so that a batch of requests tells which one fell (E-25). */
  async function nommant<T>(nom: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ErreurService && e.code === 'invalide') throw new ErreurService('invalide', `« ${nom} » : ${e.message}`, e.detail, e.champ);
      throw e;
    }
  }

  // ---- Assets
  app.get(`${RACINE}/assets`, opts, proteger((request) => {
    const q = request.query as Record<string, unknown>;
    const tags = q.tags === undefined ? [] : String(q.tags).split(',').map((t) => t.trim()).filter((t) => t !== '');
    return listerAssets(app.db, acteur(request), univers(request), { categorie: champTexte(q.categorie) || undefined, q: champTexte(q.q), tags });
  }));

  // Declared before the `:aid` routes so that « fichiers-disponibles » is never read as an id.
  app.get(`${RACINE}/assets/fichiers-disponibles`, opts, proteger((request) => ({
    fichiers: listerFichiersDisponibles(app.db, acteur(request), univers(request)),
  })));

  app.post(`${RACINE}/assets`, opts, proteger(async (request, reply) => {
    const { flux, nom, champs } = await recevoir(request);
    const asset = await nommant(nom, () => ajouterAsset(app.db, acteur(request), univers(request), flux, nom, saisieDe(champs, true)));
    return reply.code(201).send(asset);
  }));

  app.post(`${RACINE}/assets/depuis-fichier`, opts, proteger((request, reply) => {
    const b = corps(request);
    const asset = ajouterAssetDepuisFichier(app.db, acteur(request), univers(request), idCorps(b.fichierId), saisieDe(b, false));
    return reply.code(201).send(asset);
  }));

  app.patch(`${RACINE}/assets`, opts, proteger((request) => {
    const b = corps(request);
    const ids = idsDe(b.ids);
    if (b.visible !== undefined && typeof b.visible !== 'boolean') throw invalide('La visibilité est invalide.');
    const changement = { ...saisieDe(b, false), ...(b.visible === undefined ? {} : { visible: b.visible as boolean }) };
    return { assets: modifierAssets(app.db, acteur(request), univers(request), ids, changement) };
  }));

  app.get(`${RACINE}/assets/:aid/utilisation`, opts, proteger((request) => {
    const aid = entier((request.params as { aid: string }).aid);
    return { cartes: compterUsage(app.db, acteur(request), univers(request), [aid]) };
  }));

  app.delete(`${RACINE}/assets`, opts, proteger((request, reply) => {
    const ids = idsDe(corps(request).ids);
    const retires = retirerAssets(app.db, acteur(request), univers(request), ids);
    return reply.code(200).send({ retires });
  }));

  // ---- Art direction
  app.get(`${RACINE}/direction`, opts, proteger((request) => lireDirection(app.db, acteur(request), univers(request))));

  app.put(`${RACINE}/direction`, opts, proteger((request) => {
    const b = corps(request);
    return ecrireDirection(app.db, acteur(request), univers(request), b.texte, b.version);
  }));

  app.post(`${RACINE}/direction/images`, opts, proteger(async (request, reply) => {
    const { flux, nom } = await recevoir(request);
    return reply.code(201).send(await nommant(nom, () => ajouterReference(app.db, acteur(request), univers(request), flux, nom)));
  }));

  app.post(`${RACINE}/direction/images/depuis-fichier`, opts, proteger((request, reply) =>
    reply.code(201).send(ajouterReferenceDepuisFichier(app.db, acteur(request), univers(request), idCorps(corps(request).fichierId)))));

  // The reference to remove is named in the body (`{fichierId}`) or, as well, by the path.
  app.delete(`${RACINE}/direction/images`, opts, proteger((request) =>
    retirerReference(app.db, acteur(request), univers(request), idCorps(corps(request).fichierId))));
  app.delete(`${RACINE}/direction/images/:fid`, opts, proteger((request) =>
    retirerReference(app.db, acteur(request), univers(request), entier((request.params as { fid: string }).fid))));

  app.patch(`${RACINE}/direction/images/:fid`, opts, proteger((request) =>
    legenderReference(app.db, acteur(request), univers(request), entier((request.params as { fid: string }).fid), corps(request).legende)));
}
