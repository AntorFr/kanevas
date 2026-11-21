import { assurerRelations, modifierRelationImport, retirerRelationImport } from '../services/import-relations.js';
import { ecrireSectionImport, retirerSectionImport } from '../services/import-sections.js';
import { LIMITE_RELATIONS } from '../services/relations.js';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { LONGUEUR_ALIAS, LONGUEUR_ETIQUETTE, MAX_ALIAS, MAX_ETIQUETTES } from '../services/etiquettes.js';
import { MAX_CONTENU_SECTION } from '../services/sections.js';
import { resoudreUnivers } from '../services/cles.js';
import { ErreurService, introuvable } from '../services/erreurs.js';
import { niveauEffectif, verifierJeton, type Jeton, type JetonRequete } from '../services/jetons.js';
import { cloreLot, lireLot, MAX_RAPPORT, ouvrirLot } from '../services/lots.js';
import {
  appliquerCatalogueParJeton, apercuCatalogueParJeton, niveauDeRequete,
} from '../services/import-catalogue.js';
import { importerAtlasParJeton, importerGalaxieParJeton } from '../services/swn/import-galaxie-lot.js';
import { listerGalaxiesImport } from '../services/swn/import-galaxie.js';
import { OUTIL_GALAXIE } from '../services/swn/galaxies.js';
import { lireContexteImport } from '../services/import.js';
import { modifierEnTete } from '../services/import-entete.js';
import { assurerFiche, lotDeRequete, supprimerFicheImport } from '../services/import-fiches.js';
import { listerHistorique } from '../services/historique.js';
import { assurerFichier, listerFichiersApi, MAX_FICHIERS_JOINTS, ouvrirFichierParReference } from '../services/fichiers.js';
import { lireFicheApi, listerFichesApi } from '../services/lecture-api.js';
import { estId } from '../services/cles-forme.js';
import { listerCartesApi } from '../services/cartes.js';
import { exporterUnivers, type LigneExport, type OptionsExport } from '../services/export.js';
import { Readable } from 'node:stream';
import { assurerCarte } from '../services/import-cartes.js';
import { dispositionAttachement } from './fichiers.js';
import { STATUT_AVENTURE, TYPES_FICHE, typeActif } from '../services/types-fiche.js';
import { registerErreurs } from './erreurs.js';

/** Body cap of the import API (AD-103/104). */
export const MAX_CORPS_IMPORT = 8 * 1024 * 1024;

declare module 'fastify' {
  interface FastifyInstance {
    /** The clock of the token guard and the batches; tests move it (token expiry). */
    horloge: () => Date;
  }
  interface FastifyRequest {
    /** The verified API token of the import scope; never set elsewhere. */
    jeton: JetonRequete | null;
  }
}

/**
 * What a route of this scope accepts (K-6): `contenu` the content token only, `outil` a token
 * carrying the tool of the address, `ouverture` the opening of a batch (the token's kind decides),
 * `lot` any token (a batch of its universe). A route without one is refused.
 */
export type PorteeImport = 'contenu' | 'outil' | 'ouverture' | 'lot';

declare module 'fastify' {
  interface FastifyContextConfig {
    portee?: PorteeImport;
  }
}

function porteeOuverte(portee: PorteeImport | undefined, jeton: Jeton, request: FastifyRequest): boolean {
  switch (portee) {
    case 'contenu': return jeton.outils.length === 0;
    case 'lot': return true;
    case 'ouverture': {
      const { outil } = request.query as { outil?: unknown };
      if (outil === undefined) return jeton.outils.length === 0;
      return typeof outil === 'string' && jeton.outils.includes(outil);
    }
    case 'outil': {
      const { module, outil } = request.params as { module?: string; outil?: string };
      return jeton.outils.includes(`${module}/${outil}`);
    }
    default: return false;
  }
}

/** The two prefixes of the token scope (AD-jetons-1). */
const PREFIXES = ['/api/v1', '/api/import/v1'] as const;

const JETON_INVALIDE = { message: 'Jeton invalide.', code: 'jeton_invalide' };

/**
 * `/api/import/v1` (AD-103): a scope beside the session guard. Only a Bearer token opens it —
 * the session cookie is never read here, and no other route reads `Authorization`.
 */
export async function registerImportRoutes(app: FastifyInstance) {
  app.decorate('horloge', () => new Date());
  app.decorateRequest('jeton', null);

  await app.register(async (scope) => {
    registerErreurs(scope);
    // The JSON cap does not cap streamed files (AD-7, AD-65).
    await scope.register(multipart, {
      limits: { fileSize: Number.MAX_SAFE_INTEGER, files: 1, fields: 6, parts: 7 },
    });
    // JSON routes of this scope (including those of later slices) take up to 8 MiB.
    scope.addHook('onRoute', (route) => {
      route.bodyLimit = MAX_CORPS_IMPORT;
    });
    // JSON, tolerating an empty body (POST /lots carries none).
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string', bodyLimit: MAX_CORPS_IMPORT },
      (_request, corps, fait) => {
        if (corps === '') return fait(null, {});
        try {
          fait(null, JSON.parse(corps as string));
        } catch {
          const e = new ErreurService('invalide', 'JSON invalide.');
          fait(e as unknown as Error);
        }
      },
    );

    scope.addHook('onRequest', async (request, reply) => {
      request.jeton = null;
      const entete = request.headers.authorization;
      const m = typeof entete === 'string' ? /^Bearer (\S+)$/.exec(entete) : null;
      const jeton = m ? verifierJeton(app.db, m[1]!, app.horloge()) : null;
      if (!jeton) return reply.code(401).send(JETON_INVALIDE);
      // No route escapes the scope; an unmatched path is left to the not-found handler.
      if (!request.is404 && !porteeOuverte(request.routeOptions.config?.portee, jeton, request)) {
        return reply.code(401).send(JETON_INVALIDE);
      }
      // The universe of the address (AD-jetons-1): a key or an id; unknown, out of the token's reach or without
      // a current role for its account, it is the same 404. The level is that of the request, never stored.
      const { id } = request.params as { id?: string };
      if (id === undefined) return;
      const univers = resoudreUnivers(app.db, id);
      if (!univers) throw introuvable();
      const { niveau } = niveauEffectif(app.db, jeton, univers.id);
      if (niveau === 'aucun') throw introuvable();
      request.jeton = { ...jeton, universId: univers.id, niveau };
      if (niveau === 'lecture' && request.method !== 'GET' && request.method !== 'HEAD') {
        return reply.code(403).send({ message: 'Ce jeton est en lecture seule.', code: 'lecture_seule' });
      }
    });

    const jetonDe = (request: FastifyRequest) => request.jeton!;
    const entier = (v: string) => (/^\d+$/.test(v) ? Number(v) : -1);

    // One registration, two prefixes: the alias keeps the existing import script running.
    for (const prefixe of PREFIXES) {
      const base = `${prefixe}/univers/:id`;

      scope.get(`${base}`, { config: { portee: 'contenu' } }, async (request) => {
        const ctx = lireContexteImport(app.db, jetonDe(request));
        return {
          univers: ctx.univers,
          compte: ctx.compte,
          // The product list with its activation (AD-102): no universe or system decision means active (origin `defaut`).
          types: TYPES_FICHE.map((type) => ({
            type,
            active: typeActif(app.db, ctx.univers.id, type),
          })),
          statuts: STATUT_AVENTURE.options,
          limites: {
            relationsParSection: LIMITE_RELATIONS,
            contenuSection: MAX_CONTENU_SECTION,
            entreesRapport: MAX_RAPPORT,
            aliasParFiche: MAX_ALIAS,
            longueurAlias: LONGUEUR_ALIAS,
            etiquettesParFiche: MAX_ETIQUETTES,
            longueurEtiquette: LONGUEUR_ETIQUETTE,
            fichiersJointsParSection: MAX_FICHIERS_JOINTS,
          },
        };
      });

      // The history of the universe (B-96, B-102, AD-149): the screen's service, for a token of a GM.
      scope.get(`${base}/historique`, { config: { portee: 'contenu' } }, async (request) => {
        const q = request.query as Record<string, unknown>;
        const f: Record<string, string> = {};
        for (const nom of ['fiche', 'compte', 'jeton', 'action', 'depuis', 'apres']) {
          const v = q[nom];
          if (v === undefined) continue;
          if (typeof v !== 'string' || v === '') throw new ErreurService('invalide', 'Requête invalide.');
          f[nom] = v;
        }
        const j = jetonDe(request);
        return listerHistorique(app.db, { compteId: j.compteId }, j.universId, f, app.horloge());
      });

      scope.post(`${base}/lots`, { config: { portee: 'ouverture' } }, async (request, reply) => {
        const { outil } = request.query as { outil?: string };
        const { lot, repris } = ouvrirLot(app.db, jetonDe(request), app.horloge(), outil ?? null);
        return reply.code(repris ? 200 : 201).send(lot);
      });

      scope.get(`${base}/lots/:lid`, { config: { portee: 'lot' } }, async (request) => {
        const { lid } = request.params as { lid: string };
        return lireLot(app.db, jetonDe(request), entier(lid), app.horloge());
      });

      scope.put(`${base}/fiches/:cle`, { config: { portee: 'contenu' } }, async (request) => {
        const { cle } = request.params as { cle: string };
        const { lot } = request.query as { lot?: unknown };
        return assurerFiche(app.db, jetonDe(request), lotDeRequete(lot), cle, request.body, app.horloge(), request.headers);
      });

      // Targeted write of the header (B-82, AD-ecriture-1): only the fields sent move; a former key reaches the sheet (AD-146).
      scope.patch(`${base}/fiches/:cle`, { config: { portee: 'contenu' } }, async (request) => {
        const { cle } = request.params as { cle: string };
        const { lot } = request.query as { lot?: unknown };
        return modifierEnTete(app.db, jetonDe(request), lotDeRequete(lot), cle, request.body, request.headers, app.horloge());
      });

      // Targeted write of one section (B-83, AD-ecriture-1): the key is read on the addressed sheet only.
      scope.put(`${base}/fiches/:cle/sections/:scle`, { config: { portee: 'contenu' } }, async (request) => {
        const { cle, scle } = request.params as { cle: string; scle: string };
        const { lot } = request.query as { lot?: unknown };
        return ecrireSectionImport(app.db, jetonDe(request), lotDeRequete(lot), cle, scle, request.body, request.headers, app.horloge());
      });

      scope.delete(`${base}/fiches/:cle/sections/:scle`, { config: { portee: 'contenu' } }, async (request, reply) => {
        const { cle, scle } = request.params as { cle: string; scle: string };
        const { lot } = request.query as { lot?: unknown };
        retirerSectionImport(app.db, jetonDe(request), lotDeRequete(lot), cle, scle, request.headers, app.horloge());
        return reply.code(204).send();
      });

      // One relation (B-84): nature and qualifier; both guards of AD-64 hold.
      scope.patch(`${base}/relations/:rid`, { config: { portee: 'contenu' } }, async (request) => {
        const { rid } = request.params as { rid: string };
        const { lot } = request.query as { lot?: unknown };
        return modifierRelationImport(app.db, jetonDe(request), lotDeRequete(lot), rid, request.body, request.headers, app.horloge());
      });

      scope.delete(`${base}/relations/:rid`, { config: { portee: 'contenu' } }, async (request, reply) => {
        const { rid } = request.params as { rid: string };
        const { lot } = request.query as { lot?: unknown };
        retirerRelationImport(app.db, jetonDe(request), lotDeRequete(lot), rid, request.headers, app.horloge());
        return reply.code(204).send();
      });

      scope.post(`${base}/fiches/:cle/relations`, { config: { portee: 'contenu' } }, async (request) => {
        const { cle } = request.params as { cle: string };
        const { lot } = request.query as { lot?: unknown };
        return assurerRelations(app.db, jetonDe(request), lotDeRequete(lot), cle, request.body, app.horloge());
      });

      // Reads of the sheets (B-80, B-81, AD-149): the account's rights; unreadable, unknown or foreign is one 404.
      scope.get(`${base}/fiches`, { config: { portee: 'contenu' } }, async (request) => {
        const j = jetonDe(request);
        const q = request.query as { depuis?: unknown; apres?: unknown };
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
        return listerFichesApi(app.db, { compteId: j.compteId }, j.universId, options);
      });

      // Static `id/` wins over `:cle`: only this route reads by id.
      scope.get(`${base}/fiches/id/:fid`, { config: { portee: 'contenu' } }, async (request) => {
        const j = jetonDe(request);
        const { fid } = request.params as { fid: string };
        if (!estId(fid)) throw introuvable();
        return lireFicheApi(app.db, { compteId: j.compteId }, j.universId, fid);
      });

      // A key or a former key; digits only is never a key, so an id is never read here.
      scope.get(`${base}/fiches/:cle`, { config: { portee: 'contenu' } }, async (request) => {
        const j = jetonDe(request);
        const { cle } = request.params as { cle: string };
        if (estId(cle)) throw introuvable();
        return lireFicheApi(app.db, { compteId: j.compteId }, j.universId, cle);
      });

      // Reads of the library and of the maps (B-90, AD-149): the account's rights, a closed object is a 404.
      scope.get(`${base}/fichiers`, { config: { portee: 'contenu' } }, async (request) => {
        const j = jetonDe(request);
        return listerFichiersApi(app.db, { compteId: j.compteId }, j.universId, (request.query as { apres?: unknown }).apres);
      });

      scope.get(`${base}/fichiers/:cle/contenu`, { config: { portee: 'contenu' } }, async (request, reply) => {
        const j = jetonDe(request);
        const { cle } = request.params as { cle: string };
        const f = await ouvrirFichierParReference(app.db, { compteId: j.compteId }, j.universId, cle);
        reply
          .header('X-Content-Type-Options', 'nosniff')
          .header('Content-Security-Policy', "default-src 'none'; sandbox")
          .header('Cache-Control', 'private, no-store')
          .header('Content-Length', f.taille);
        if (f.type.startsWith('image/')) return reply.type(f.type).header('Content-Disposition', 'inline').send(f.flux);
        return reply
          .type('application/octet-stream')
          .header('Content-Disposition', dispositionAttachement(f.nom))
          .send(f.flux);
      });

      // The whole universe in one call (B-92, AD-149): NDJSON, one line per object, streamed with back-pressure.
      // The first line is pulled before any byte goes out, so a refusal (`depuis`) is still a JSON error.
      scope.get(`${base}/export`, { config: { portee: 'contenu' } }, async (request, reply) => {
        const j = jetonDe(request);
        const q = request.query as { depuis?: unknown; empreintes?: unknown };
        const options: OptionsExport = {};
        if (q.depuis !== undefined) {
          if (typeof q.depuis !== 'string') throw new ErreurService('invalide', '« depuis » doit être une date ISO 8601.', undefined, 'depuis');
          options.depuis = q.depuis;
        }
        if (q.empreintes === '1') options.empreintes = true;
        const lignes = exporterUnivers(app.db, { compteId: j.compteId }, j.universId, options);
        let premiere: IteratorResult<LigneExport, void>;
        try {
          premiere = await lignes.next();
        } catch (e) {
          await lignes.return();
          throw e;
        }
        const corps = Readable.from(
          (async function* () {
            if (premiere.done) return;
            yield `${JSON.stringify(premiere.value)}\n`;
            for await (const ligne of lignes) yield `${JSON.stringify(ligne)}\n`;
          })(),
          { objectMode: false },
        );
        // The client leaving or the response ending closes the generator (and its read connection).
        reply.raw.on('close', () => corps.destroy());
        return reply
          .header('Cache-Control', 'private, no-store')
          .type('application/x-ndjson; charset=utf-8')
          .send(corps);
      });

      scope.get(`${base}/cartes`, { config: { portee: 'contenu' } }, async (request) => {
        const j = jetonDe(request);
        return listerCartesApi(app.db, j.compteId, j.universId, (request.query as { apres?: unknown }).apres);
      });

      // The script sends its fields (`titre`, `visible`, `fiche`, `texte`) before the streamed `fond` part (B-87).
      scope.put(`${base}/cartes/:cle`, { config: { portee: 'contenu' } }, async (request) => {
        const { cle } = request.params as { cle: string };
        const lot = lotDeRequete((request.query as { lot?: unknown }).lot);
        const champs: Record<string, unknown> = {};
        let flux: AsyncIterable<Buffer> | null = null;
        let suite: (() => Promise<void>) | null = null;
        if (request.isMultipart()) {
          const parties = request.parts();
          const it = parties[Symbol.asyncIterator]();
          for (;;) {
            const { value, done } = await it.next();
            if (done) break;
            if (value.type === 'field') { champs[value.fieldname] = value.value; continue; }
            if (value.fieldname !== 'fond') { value.file.resume(); continue; }
            const fichier = value.file;
            flux = (async function* () {
              for await (const morceau of fichier) yield morceau as Buffer;
              if (fichier.truncated) throw new ErreurService('invalide', 'Envoi interrompu.', undefined, 'fond');
            })();
            suite = async () => { for await (const _ of parties) { /* drain */ } };
            break;
          }
        }
        const resultat = await assurerCarte(app.db, jetonDe(request), lot, cle, { ...champs, titre: champs.titre, flux },
          app.horloge(), undefined, request.headers);
        if (suite) await suite();
        return resultat;
      });

      // The script sends `nom` and optional `visibilite` before the streamed `fichier` part.
      scope.put(`${base}/fichiers/:cle`, { config: { portee: 'contenu' } }, async (request) => {
        const { cle } = request.params as { cle: string };
        const lot = lotDeRequete((request.query as { lot?: unknown }).lot);
        const part = request.isMultipart() ? await request.file() : undefined;
        const champ = (nom: string): unknown => {
          const field = part?.fields[nom];
          return field && !Array.isArray(field) && field.type === 'field' ? field.value : undefined;
        };
        async function* flux() {
          for await (const morceau of part!.file) yield morceau as Buffer;
          if (part!.file.truncated) {
            throw new ErreurService('invalide', 'Envoi interrompu.', undefined, 'fichier');
          }
        }
        return assurerFichier(app.db, jetonDe(request), lot, cle, {
          nom: champ('nom'),
          visibilite: champ('visibilite'),
          flux: part?.fieldname === 'fichier' ? flux() : null,
        }, app.horloge(), undefined, request.headers);
      });

      scope.delete(`${base}/fiches/:cle`, { config: { portee: 'contenu' } }, async (request, reply) => {
        const { cle } = request.params as { cle: string };
        const { lot } = request.query as { lot?: unknown };
        supprimerFicheImport(app.db, jetonDe(request), lotDeRequete(lot), cle, app.horloge());
        return reply.code(204).send();
      });

      // The file is read by the catalogue core; its 413 has a code of its own (K-3).
      const erreurFichier = (erreur: Error & { statusCode?: number }, request: FastifyRequest, reply: FastifyReply) => {
        if (erreur.statusCode === 413) {
          return reply.code(413).send({ message: 'Ce fichier est trop volumineux (8 Mio au plus).', code: 'fichier_trop_gros' });
        }
        // A refusal carries its code, like the session route (K-6): 403 `refuse`.
        if (erreur instanceof ErreurService && erreur.code === 'refuse' && !erreur.detail) {
          return reply.code(403).send({ message: erreur.message, code: 'refuse' });
        }
        return scope.errorHandler(erreur as never, request, reply);
      };
      const cleOutil = (request: FastifyRequest) => {
        const p = request.params as { module: string; outil: string };
        return `${p.module}/${p.outil}`;
      };

      scope.put(`${base}/outils/:module/:outil/catalogue`, {
        config: { portee: 'outil' }, errorHandler: erreurFichier,
      }, async (request) => {
        const q = request.query as { niveau?: unknown; lot?: unknown };
        return appliquerCatalogueParJeton(app.db, jetonDe(request), lotDeRequete(q.lot), niveauDeRequete(q.niveau),
          cleOutil(request), request.body, app.horloge());
      });

      scope.post(`${base}/outils/:module/:outil/catalogue/apercu`, {
        config: { portee: 'outil' }, errorHandler: erreurFichier,
      }, async (request) => {
        const q = request.query as { niveau?: unknown };
        return apercuCatalogueParJeton(app.db, jetonDe(request), niveauDeRequete(q.niveau), cleOutil(request), request.body);
      });

      // The galaxy of the map tool (T-9): the token carries `swn/galaxie`, the address names a galaxy of its universe.
      scope.get(`${base}/outils/:module/:outil/galaxies`, { config: { portee: 'outil' } }, async (request) => {
        if (cleOutil(request) !== OUTIL_GALAXIE) throw introuvable();
        const j = jetonDe(request);
        return listerGalaxiesImport(app.db, j.compteId, j.universId);
      });

      scope.put(`${base}/outils/:module/:outil/galaxies/:gid`, {
        config: { portee: 'outil' }, errorHandler: erreurFichier,
      }, async (request) => {
        if (cleOutil(request) !== OUTIL_GALAXIE) throw introuvable();
        const { gid } = request.params as { gid: string };
        const { lot } = request.query as { lot?: unknown };
        return importerGalaxieParJeton(app.db, jetonDe(request), lotDeRequete(lot), entier(gid), request.body, app.horloge());
      });

      // The atlas of one system of the galaxy (AD-atlas-1): one request, one transaction.
      scope.put(`${base}/outils/:module/:outil/galaxies/:gid/systemes/:cle/atlas`, {
        config: { portee: 'outil' }, errorHandler: erreurFichier,
      }, async (request) => {
        if (cleOutil(request) !== OUTIL_GALAXIE) throw introuvable();
        const { gid, cle } = request.params as { gid: string; cle: string };
        const { lot } = request.query as { lot?: unknown };
        return importerAtlasParJeton(app.db, jetonDe(request), lotDeRequete(lot), entier(gid), cle, request.body, app.horloge());
      });

      scope.post(`${base}/lots/:lid/clore`, { config: { portee: 'lot' } }, async (request) => {
        const { lid } = request.params as { lid: string };
        return cloreLot(app.db, jetonDe(request), entier(lid), app.horloge());
      });
    }
  });
}
