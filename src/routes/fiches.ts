import '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

import { invalide } from '../services/erreurs.js';
import {
  deposerPieceJointe,
  marquerSecrete,
  ouvrirPieceJointe,
  retirerPieceJointe,
} from '../services/pieces-jointes.js';
import { creerFiche, lireFiche, listerFiches } from '../services/fiches.js';
import {
  ajouterSection,
  changerAudience,
  ecrireContenu,
  lireSection,
  renommerSection,
  reordonnerSections,
  retirerSection,
  type ChangementAudience,
} from '../services/sections.js';
import { lireRelations, relierSection, retirerRelation } from '../services/relations.js';
import type { Acteur } from '../services/types.js';
import { idDeChemin } from './univers.js';

export function corps(request: { body?: unknown }): Record<string, unknown> {
  const b = request.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/**
 * Player mode (AD-39) is asked with `?mode=joueur`; the service computes it,
 * it only ever restricts a read.
 */
export function acteur(request: { session?: { id: number } | null; query?: unknown }): Acteur {
  const q = (request.query ?? {}) as Record<string, unknown>;
  if (q.mode !== undefined && q.mode !== 'joueur' && q.mode !== 'mj') {
    throw invalide('Mode inconnu.');
  }
  return { compteId: request.session!.id, modeJoueur: q.mode === 'joueur' };
}

function chaine(valeur: unknown, message: string): string {
  if (typeof valeur !== 'string') throw invalide(message);
  return valeur;
}

const BASCULES = ['joueursLisent', 'joueursEcrivent', 'auteurLit', 'auteurEcrit'] as const;

/** Sheets and sections; thin routes over `services/` (AD-2): no guard of their own. */
export function registerFichesRoutes(app: FastifyInstance) {
  const base = '/api/univers/:id/fiches';
  type P = { id: string; fid?: string; sid?: string; rid?: string };
  const ids = (request: { params: unknown }) => {
    const p = request.params as P;
    return {
      univers: idDeChemin(p.id),
      fiche: p.fid === undefined ? 0 : idDeChemin(p.fid),
      section: p.sid === undefined ? 0 : idDeChemin(p.sid),
      relation: p.rid === undefined ? 0 : idDeChemin(p.rid),
    };
  };

  app.post(base, async (request, reply) => {
    const b = corps(request);
    const charge = b.charge;
    if (charge !== undefined && (charge === null || typeof charge !== 'object' || Array.isArray(charge))) {
      throw invalide('Charge utile invalide pour ce type de fiche.');
    }
    const fiche = creerFiche(app.db, request.session!.id, ids(request).univers, {
      type: chaine(b.type, 'Type de fiche inconnu.'),
      titre: chaine(b.titre, 'Le titre : de 1 à 120 caractères.'),
      charge: charge as Record<string, unknown> | undefined,
    });
    return reply.code(201).send(fiche);
  });

  app.get(base, async (request) => {
    const q = request.query as Record<string, unknown>;
    for (const k of ['type', 'curseur', 'q']) {
      if (q[k] !== undefined && typeof q[k] !== 'string') throw invalide('Requête invalide.');
    }
    return listerFiches(app.db, acteur(request), ids(request).univers, {
      type: q.type as string | undefined,
      curseur: q.curseur as string | undefined,
      recherche: q.q as string | undefined,
    });
  });

  app.get(`${base}/:fid`, async (request) => {
    const i = ids(request);
    return lireFiche(app.db, acteur(request), i.univers, i.fiche);
  });

  app.post(`${base}/:fid/sections`, async (request, reply) => {
    const i = ids(request);
    const b = corps(request);
    if (b.contenu !== undefined && typeof b.contenu !== 'string') {
      throw invalide('Le contenu doit être un texte.');
    }
    const s = ajouterSection(app.db, request.session!.id, i.univers, i.fiche, {
      titre: chaine(b.titre, 'Le titre : de 1 à 80 caractères.'),
      contenu: b.contenu as string | undefined,
    });
    return reply.code(201).send(s);
  });

  // Reorder: the body names every section id of the sheet, in the new order.
  app.put(`${base}/:fid/ordre`, async (request, reply) => {
    const i = ids(request);
    const l = corps(request).ids;
    if (!Array.isArray(l) || !l.every((n) => Number.isSafeInteger(n))) {
      throw invalide("L'ordre doit citer chaque section de la fiche une fois.");
    }
    reordonnerSections(app.db, request.session!.id, i.univers, i.fiche, l as number[]);
    return reply.code(204).send();
  });

  app.get(`${base}/:fid/sections/:sid`, async (request) => {
    const i = ids(request);
    return lireSection(app.db, acteur(request), i.univers, i.fiche, i.section);
  });

  // GM: rename and/or audience (four switches + author), one call.
  app.patch(`${base}/:fid/sections/:sid`, async (request) => {
    const i = ids(request);
    const b = corps(request);
    const changement: ChangementAudience = {};
    for (const k of BASCULES) {
      if (b[k] === undefined) continue;
      if (typeof b[k] !== 'boolean') throw invalide('Réglage d’audience invalide.');
      changement[k] = b[k] as boolean;
    }
    if (b.auteurId !== undefined) {
      if (b.auteurId !== null && !Number.isSafeInteger(b.auteurId)) {
        throw invalide("L'auteur doit être un joueur de l'univers.");
      }
      changement.auteurId = b.auteurId as number | null;
    }
    if (b.titre !== undefined) {
      renommerSection(
        app.db,
        request.session!.id,
        i.univers,
        i.fiche,
        i.section,
        chaine(b.titre, 'Le titre : de 1 à 80 caractères.'),
      );
    }
    return changerAudience(app.db, request.session!.id, i.univers, i.fiche, i.section, changement);
  });

  app.delete(`${base}/:fid/sections/:sid`, async (request, reply) => {
    const i = ids(request);
    retirerSection(app.db, request.session!.id, i.univers, i.fiche, i.section);
    return reply.code(204).send();
  });

  // Content write with the version read (AD-59); stale → 409 `section_modifiee`.
  app.put(`${base}/:fid/sections/:sid/contenu`, async (request) => {
    const i = ids(request);
    const b = corps(request);
    if (typeof b.contenu !== 'string') throw invalide('Le contenu doit être un texte.');
    if (!Number.isSafeInteger(b.version)) throw invalide('Version manquante.');
    return ecrireContenu(
      app.db,
      request.session!.id,
      i.univers,
      i.fiche,
      i.section,
      b.contenu,
      b.version as number,
    );
  });

  // Relations of a section (AD-64): read under both guards by the service.
  app.get(`${base}/:fid/sections/:sid/relations`, async (request) => {
    const i = ids(request);
    return { relations: lireRelations(app.db, acteur(request), i.univers, i.fiche, i.section) };
  });

  app.post(`${base}/:fid/sections/:sid/relations`, async (request, reply) => {
    const i = ids(request);
    const b = corps(request);
    if (!Number.isSafeInteger(b.cibleFicheId)) throw invalide('La fiche cible est invalide.');
    const r = relierSection(app.db, request.session!.id, i.univers, i.fiche, i.section, {
      cibleFicheId: b.cibleFicheId as number,
      type: chaine(b.type, 'Le type : de 1 à 80 caractères.'),
    });
    return reply.code(201).send(r);
  });

  app.delete(`${base}/relations/:rid`, async (request, reply) => {
    const i = ids(request);
    retirerRelation(app.db, request.session!.id, i.univers, i.relation);
    return reply.code(204).send();
  });

  registerPiecesJointesRoutes(app, base);
}

/** `secrete` as a form field or JSON boolean; anything else is a bad request. */
function booleen(valeur: unknown): boolean {
  if (valeur === undefined || valeur === '' || valeur === 'false' || valeur === false) return false;
  if (valeur === 'true' || valeur === true) return true;
  throw invalide('Le réglage « secrète » doit être vrai ou faux.');
}

function secreteDuCorps(valeur: unknown): boolean {
  if (typeof valeur !== 'boolean') throw invalide('Le réglage « secrète » doit être vrai ou faux.');
  return valeur;
}

/** Content-Disposition for a download: ASCII fallback plus the RFC 5987 UTF-8 name. */
function dispositionAttachement(nom: string): string {
  const ascii = nom.replace(/[^\x20-\x7e]|["\\%;]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/** Attachments of a section: thin routes, the services own every rule (AD-2, AD-67). No list route, no static serving. */
function registerPiecesJointesRoutes(app: FastifyInstance, base: string) {
  const idPiece = (request: { params: unknown }) =>
    idDeChemin((request.params as { pid: string }).pid);

  // One file per request, streamed to the service. Field `secrete` must precede `fichier`.
  app.post(`${base}/:fid/sections/:sid/pieces-jointes`, async (request, reply) => {
    const a = acteur(request);
    const section = idDeChemin((request.params as { sid: string }).sid);
    if (!request.isMultipart()) throw invalide('Envoi multipart attendu (champ « fichier »).');
    const premiere = await request.file();
    if (!premiere || premiere.fieldname !== 'fichier') throw invalide('Champ « fichier » manquant.');
    const part = premiere;
    const secrete = booleen((part.fields.secrete as { value?: unknown } | undefined)?.value);
    const nom = part.filename.split(/[\\/]/).pop() ?? '';
    // An interrupted or truncated body must not look like a complete file.
    async function* flux() {
      for await (const morceau of part.file) yield morceau as Buffer;
      if (part.file.truncated) throw invalide('Envoi interrompu.');
    }
    const vue = await deposerPieceJointe(app.db, a.compteId, !!a.modeJoueur, section, flux(), nom, secrete);
    return reply.code(201).send(vue);
  });

  app.patch(`${base}/:fid/pieces-jointes/:pid`, async (request) => {
    const a = acteur(request);
    return marquerSecrete(
      app.db,
      a.compteId,
      !!a.modeJoueur,
      idPiece(request),
      secreteDuCorps(corps(request).secrete),
    );
  });

  app.delete(`${base}/:fid/pieces-jointes/:pid`, async (request, reply) => {
    const a = acteur(request);
    await retirerPieceJointe(app.db, a.compteId, !!a.modeJoueur, idPiece(request));
    return reply.code(204).send();
  });

  // No player mode on a direct read (AD-37): the actor is the account alone.
  app.get(`${base}/:fid/pieces-jointes/:pid/fichier`, async (request, reply) => {
    const f = await ouvrirPieceJointe(
      app.db,
      { compteId: request.session!.id, modeJoueur: false },
      idPiece(request),
    );
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cache-Control', 'private, no-store')
      .header('Content-Length', f.taille);
    if (f.type.startsWith('image/')) return reply.type(f.type).send(f.flux);
    return reply
      .type('application/octet-stream')
      .header('Content-Disposition', dispositionAttachement(f.nom))
      .send(f.flux);
  });
}
