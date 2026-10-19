import '@fastify/multipart';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  ajouterFichier,
  choisirIllustration,
  detailFichier,
  impactFichier,
  effacerFichier,
  joindreFichier,
  listerFichiers,
  modifierFichier,
  ouvrirFichier,
  retirerIllustration,
  retirerJointure,
  type CibleFichier,
  type FichierVue,
} from '../services/fichiers.js';
import { invalide } from '../services/erreurs.js';
import { acteur, corps } from './fiches.js';
import { idDeChemin } from './univers.js';

/** A form field or JSON boolean; anything else is a bad request. */
function booleen(valeur: unknown, nom: string): boolean {
  if (valeur === undefined || valeur === null || valeur === '') return false;
  if (valeur === 'true' || valeur === true) return true;
  if (valeur === 'false' || valeur === false) return false;
  throw invalide(`Le réglage « ${nom} » doit être vrai ou faux.`);
}

function entier(valeur: unknown, message: string): number {
  const n = typeof valeur === 'string' ? Number(valeur) : valeur;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) throw invalide(message);
  return n;
}

/** Content-Disposition for a download: ASCII fallback plus the RFC 5987 UTF-8 name. */
function dispositionAttachement(nom: string): string {
  const ascii = nom.replace(/[^\x20-\x7e]|["\\%;]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

function champ(part: { fields: Record<string, unknown> }, nom: string): unknown {
  return (part.fields[nom] as { value?: unknown } | undefined)?.value;
}

/**
 * The media library (AD-111, AD-117 §3): thin routes over `services/fichiers.ts`, which owns every
 * rule. The client never says a visibility — whatever it puts in the form is not read.
 */
export function registerFichiersRoutes(app: FastifyInstance) {
  const base = '/api/univers/:id/fichiers';
  const univers = (request: { params: unknown }) => idDeChemin((request.params as { id: string }).id);
  const fichier = (request: { params: unknown }) => idDeChemin((request.params as { fid: string }).fid);

  /** The one file of a multipart request, streamed to the service; a cut body is not a complete file. */
  async function recevoir(request: Parameters<typeof acteur>[0] & {
    isMultipart(): boolean;
    file(): Promise<
      | {
          fieldname: string;
          filename: string;
          file: AsyncIterable<Buffer | Uint8Array> & { truncated?: boolean };
          fields: Record<string, unknown>;
        }
      | undefined
    >;
  }) {
    if (!request.isMultipart()) throw invalide('Envoi multipart attendu (champ « fichier »).');
    const part = await request.file();
    if (!part || part.fieldname !== 'fichier') throw invalide('Champ « fichier » manquant.');
    async function* flux() {
      for await (const morceau of part!.file) yield morceau as Buffer;
      if (part!.file.truncated) throw invalide('Envoi interrompu.');
    }
    return { part, flux: flux(), nom: part.filename.split(/[\\/]/).pop() ?? '' };
  }

  // Fields (`section`, `maniere`, `blocMj`, `fiche`) must precede `fichier`.
  app.post(base, async (request, reply) => {
    const { part, flux, nom } = await recevoir(request as never);
    const section = champ(part, 'section');
    const fiche = champ(part, 'fiche');
    let cible: CibleFichier;
    if (section !== undefined && section !== '') {
      const maniere = champ(part, 'maniere') ?? 'joint';
      if (maniere !== 'joint' && maniere !== 'texte') throw invalide('La manière est « joint » ou « texte ».');
      cible = {
        ou: 'section',
        sectionId: entier(section, 'La section est invalide.'),
        maniere,
        dansBlocMj: booleen(champ(part, 'blocMj'), 'blocMj'),
      };
    } else if (fiche !== undefined && fiche !== '') {
      cible = { ou: 'illustration', ficheId: entier(fiche, 'La fiche est invalide.') };
    } else {
      cible = { ou: 'mediatheque' };
    }
    const vue = await ajouterFichier(app.db, acteur(request), univers(request), flux, nom, cible);
    return reply.code(201).send(vue);
  });

  app.get(base, async (request) => {
    const q = request.query as Record<string, unknown>;
    const texte = (k: string) => (typeof q[k] === 'string' && q[k] !== '' ? (q[k] as string) : undefined);
    const tri = texte('tri');
    return listerFichiers(app.db, acteur(request), univers(request), {
      nature: texte('nature') as 'images' | 'documents' | undefined,
      visibilite: texte('visibilite') as 'joueurs' | 'mj' | undefined,
      usage: texte('usage') as 'utilises' | 'non_utilises' | undefined,
      q: texte('q'),
      tri: tri as 'recent' | 'nom' | undefined,
      apres: texte('apres'),
    });
  });

  // The panel of a file: its usages the caller reads, 10 then the rest (`apresUsage`).
  app.get(`${base}/:fid/detail`, async (request) => {
    const q = request.query as Record<string, unknown>;
    const apres = q.apresUsage === undefined ? 0 : Number(q.apresUsage);
    if (!Number.isSafeInteger(apres) || apres < 0) throw invalide('Le curseur est invalide.');
    return detailFichier(app.db, acteur(request), univers(request), fichier(request), apres);
  });

  // What the GM loses by closing or deleting a file; the caller's real rights (AD-117 §3).
  app.get(`${base}/:fid/impact`, async (request) => {
    const action = (request.query as Record<string, unknown>).action;
    return impactFichier(app.db, acteur(request), univers(request), fichier(request), String(action ?? ''));
  });

  // The only route of the bytes of a file. Real rights: no player mode on a direct read (AD-37).
  app.get(`${base}/:fid`, async (request, reply) => {
    const v = (request.query as Record<string, unknown>).v;
    const f = await ouvrirFichier(
      app.db,
      { compteId: request.session!.id },
      univers(request),
      fichier(request),
      typeof v === 'string' ? v : undefined,
    );
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cache-Control', f.courant ? 'private, max-age=31536000, immutable' : 'private, no-store')
      .header('Content-Length', f.taille);
    if (f.type.startsWith('image/')) return reply.type(f.type).header('Content-Disposition', 'inline').send(f.flux);
    return reply
      .type('application/octet-stream')
      .header('Content-Disposition', dispositionAttachement(f.nom))
      .send(f.flux);
  });

  app.patch(`${base}/:fid`, async (request) => {
    const b = corps(request);
    if (b.nom === undefined && b.visibilite === undefined) throw invalide('Rien à modifier.');
    if (b.nom !== undefined && typeof b.nom !== 'string') throw invalide('Le nom du fichier : de 1 à 200 caractères.');
    if (b.visibilite !== undefined && typeof b.visibilite !== 'string') {
      throw invalide('La visibilité est « joueurs » ou « mj ».');
    }
    return modifierFichier(app.db, acteur(request), univers(request), fichier(request), {
      nom: b.nom as string | undefined,
      visibilite: b.visibilite as string | undefined,
    });
  });

  app.delete(`${base}/:fid`, async (request, reply) => {
    effacerFichier(app.db, acteur(request), univers(request), fichier(request));
    return reply.code(204).send();
  });

  const sections = '/api/univers/:id/fiches/:fid/sections/:sid/fichiers';
  const fiche = (request: { params: unknown }) => idDeChemin((request.params as { fid: string }).fid);
  const section = (request: { params: unknown }) => idDeChemin((request.params as { sid: string }).sid);

  app.post(sections, async (request, reply) => {
    const b = corps(request);
    const vue = joindreFichier(
      app.db,
      acteur(request),
      univers(request),
      fiche(request),
      section(request),
      entier(b.fichierId, 'Le fichier est invalide.'),
    );
    return reply.code(201).send(vue);
  });

  app.delete(`${sections}/:fichierId`, async (request, reply) => {
    const id = idDeChemin((request.params as { fichierId: string }).fichierId);
    retirerJointure(app.db, acteur(request), univers(request), fiche(request), section(request), id);
    return reply.code(204).send();
  });

  const illustration = '/api/univers/:id/fiches/:fid/illustration';
  const reponse = (v: FichierVue) => ({
    illustration: { id: v.id, jeton: v.jeton, type: v.type, taille: v.taille },
  });

  // Choose an existing image (JSON `{fichierId}`) or add one (multipart); the GM only, real rights.
  app.put(illustration, async (request, reply: FastifyReply) => {
    const a = { compteId: request.session!.id };
    if (request.isMultipart()) {
      const { flux, nom } = await recevoir(request as never);
      const v = await ajouterFichier(app.db, a, univers(request), flux, nom, {
        ou: 'illustration',
        ficheId: fiche(request),
      });
      return reply.send(reponse(v));
    }
    const b = corps(request);
    const v = choisirIllustration(
      app.db,
      a,
      univers(request),
      fiche(request),
      entier(b.fichierId, 'Le fichier est invalide.'),
    );
    return reply.send(reponse(v));
  });

  app.delete(illustration, async (request, reply) => {
    retirerIllustration(app.db, { compteId: request.session!.id }, univers(request), fiche(request));
    return reply.code(204).send();
  });
}
