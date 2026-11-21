import '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { acteur } from '../../routes/fiches.js';
import { ErreurService, invalide, refuse } from '../../services/erreurs.js';
import { accessible } from '../../services/outils.js';
import {
  ajouterAsset, ajouterAssetDepuisFichier, compterUsage, listerAssets, listerFichiersDisponibles, modifierAssets, retirerAssets,
  type SaisieAsset,
} from '../../services/battlemap-assets.js';
import { fermerTout, ouvrirFlux } from '../../services/battlemap-flux.js';
import { moteurOccupe } from '../../services/battlemap-generation.js';
import {
  accepterLigne, arreterLot, ecarterLigne, enregistrerLot, lancerLot, lireLot, reessayerLigne, regenererLigne, reprendreLot,
} from '../../services/battlemap-lots.js';
import { appliquerCommandes, creerCarte, lireCarte, reglerCarte, supprimerCarte } from '../../services/battlemap-cartes.js';
import { appliquerCommandesTable, creerTable, definirProprietaire, lireTable, ouvertureFlux } from '../../services/battlemap-tables.js';
import {
  ajouterReference, ajouterReferenceDepuisFichier, annulerDirection, ecrireDirection, legenderReference, lireDirection, retirerReference,
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

  app.post(`${RACINE}/direction/annuler`, opts, proteger((request) =>
    annulerDirection(app.db, acteur(request), univers(request), corps(request).version)));

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

  // ---- Composed maps (AD-battlemap-editeur-2). Same guard as the generic routes of `routes/outils.ts`, which these shadow for this
  // tool; a service refusal (`introuvable` for a hidden map, `refuse` in Player mode, `conflit`, `invalide`) is worded by the common handler.
  const cartes = { preHandler: garde('battlemap/cartes') };
  const carte = (request: Req) => entier((request.params as { cid: string }).cid);

  app.post(`${RACINE}/cartes`, cartes, (request, reply) => {
    const b = corps(request);
    return reply.code(201).send(creerCarte(app.db, acteur(request), univers(request), { titre: b.titre, largeur: b.largeur, hauteur: b.hauteur }));
  });

  app.get(`${RACINE}/cartes/:cid(^[0-9]+$)`, cartes, (request) => lireCarte(app.db, acteur(request), univers(request), carte(request)));

  app.post(`${RACINE}/cartes/:cid(^[0-9]+$)/commandes`, cartes, (request) => {
    const b = corps(request);
    return appliquerCommandes(app.db, acteur(request), univers(request), carte(request), b.version, b.commandes);
  });

  app.patch(`${RACINE}/cartes/:cid(^[0-9]+$)`, cartes, (request) => {
    const { version, ...reglages } = corps(request);
    return reglerCarte(app.db, acteur(request), univers(request), carte(request), version, {
      titre: reglages.titre, visible: reglages.visible, tailleCase: reglages.tailleCase, largeur: reglages.largeur, hauteur: reglages.hauteur,
    });
  });

  app.delete(`${RACINE}/cartes/:cid(^[0-9]+$)`, cartes, (request, reply) => {
    supprimerCarte(app.db, acteur(request), univers(request), carte(request));
    return reply.code(204).send();
  });

  // ---- Game tables (AD-battlemap-table-5). Same guard as the maps. A map the caller cannot read, a hidden map for a player or for a GM in
  // Player mode: `introuvable` (the common handler's 404); a readable map with no table is `{commencee: false}`. `limite_depassee` is a 422 here.
  app.get(`${RACINE}/cartes/:cid(^[0-9]+$)/table`, cartes, (request) => lireTable(app.db, acteur(request), univers(request), carte(request)));

  app.post(`${RACINE}/cartes/:cid(^[0-9]+$)/table`, cartes, (request, reply) => {
    const r = creerTable(app.db, acteur(request), univers(request), carte(request));
    return reply.code(r.creee ? 201 : 200).send(r.table);
  });

  app.post(`${RACINE}/cartes/:cid(^[0-9]+$)/table/commandes`, cartes, (request, reply) => {
    const b = corps(request);
    try {
      return appliquerCommandesTable(app.db, acteur(request), univers(request), carte(request), b.version, b.commandes);
    } catch (e) {
      if (e instanceof ErreurService && e.detail === 'limite_depassee') {
        return reply.code(422).send({ message: e.message, code: 'limite_depassee', ...(e.champ ? { champ: e.champ } : {}) });
      }
      throw e;
    }
  });

  app.put(`${RACINE}/cartes/:cid(^[0-9]+$)/table/pions/:pid/proprietaire`, cartes, (request) => {
    const pid = (request.params as { pid: string }).pid;
    const b = corps(request);
    return definirProprietaire(app.db, acteur(request), univers(request), carte(request), pid, b.compte_id);
  });

  // The stream of AD-159 (AD-battlemap-table-6): versions and a display count only. Same refusals as the table's read.
  app.addHook('onClose', async () => fermerTout());
  app.get(`${RACINE}/cartes/:cid(^[0-9]+$)/flux`, cartes, proteger((request, reply) => {
    const affichage = (request.query as Record<string, unknown>).role === 'affichage';
    const v = ouvertureFlux(app.db, acteur(request), univers(request), carte(request), affichage);
    reply.hijack();
    const sortie = reply.raw;
    sortie.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive',
    });
    sortie.write('retry: 3000\n\n');
    const fermer = () => { if (!sortie.writableEnded) sortie.end(); };
    const liberer = ouvrirFlux(carte(request), v, affichage ? 'affichage' : 'jeu', v.mj && !affichage,
      (octets) => { sortie.write(octets); }, fermer);
    request.raw.on('close', liberer);
    sortie.on('close', liberer);
  }));

  // ---- Generation batches (AD-battlemap-generation-1). Guarded by the tool `generation`: without an image engine it is absent and
  // each of these paths is a `callNotFound`. No route serves a draft's picture: its GM-only file goes through the library's file route.
  // E-27: a GM in Player mode is `refuse` on a write (the tool is hidden from the Player view, so the common guard would answer 404),
  // `introuvable` on a read. A write by whoever could not use the tool even outside Player mode stays the 404 of an unknown path.
  const gardeLots = garde('battlemap/generation');
  const lots = {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.method !== 'GET') {
        const a = acteur(request);
        const id = Number((request.params as { id?: string }).id);
        if (a.modeJoueur && Number.isSafeInteger(id) && accessible(app.db, { ...a, modeJoueur: false }, id, 'battlemap/generation')) {
          throw refuse();
        }
      }
      return gardeLots.call(app, request, reply, () => undefined);
    },
  };
  const ligne = (request: Req) => entier((request.params as { lid: string }).lid);
  const MAX_DIRECTION_VUE = 140;

  app.get(`${RACINE}/lots`, lots, proteger((request) => {
    const a = acteur(request), u = univers(request);
    const lot = lireLot(app.db, a, u);
    const texte = lireDirection(app.db, a, u).texte.trim();
    return {
      lot, moteurOccupe: moteurOccupe(), directionArtistique: texte === '' ? null : Array.from(texte).slice(0, MAX_DIRECTION_VUE).join(''),
    };
  }));

  app.put(`${RACINE}/lots`, lots, proteger((request) =>
    ({ lot: enregistrerLot(app.db, acteur(request), univers(request), corps(request).lignes) })));

  app.post(`${RACINE}/lots/lancer`, lots, proteger((request) => ({ lot: lancerLot(app.db, acteur(request), univers(request)) })));
  app.post(`${RACINE}/lots/reprendre`, lots, proteger((request) => ({ lot: reprendreLot(app.db, acteur(request), univers(request)) })));
  app.post(`${RACINE}/lots/arreter`, lots, proteger((request) => ({ lot: arreterLot(app.db, acteur(request), univers(request)) })));

  const LIGNE = `${RACINE}/lots/lignes/:lid(^[0-9]+$)`;
  app.post(`${LIGNE}/accepter`, lots, proteger((request) => ({ lot: accepterLigne(app.db, acteur(request), univers(request), ligne(request)) })));
  app.post(`${LIGNE}/regenerer`, lots, proteger((request) =>
    ({ lot: regenererLigne(app.db, acteur(request), univers(request), ligne(request), corps(request).remarque) })));
  app.post(`${LIGNE}/ecarter`, lots, proteger((request) => ({ lot: ecarterLigne(app.db, acteur(request), univers(request), ligne(request)) })));
  app.post(`${LIGNE}/reessayer`, lots, proteger((request) => ({ lot: reessayerLigne(app.db, acteur(request), univers(request), ligne(request)) })));
}
