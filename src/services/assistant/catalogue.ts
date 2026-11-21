import { listerHistorique, sousOrigine } from '../historique.js';
import { Readable } from 'node:stream';
import { z } from 'zod';
import type { Db } from '../../db/db.js';
import { exigerRole } from '../droits.js';
import { ErreurService } from '../erreurs.js';
import { ajouterFichier, MAX_FICHIERS_JOINTS, verifierDepot } from '../fichiers.js';
import { cleDeFicheLue, resoudreFiche } from '../cles.js';
import { creerFiche, deplacerFiche, lireFiche, listerFiches } from '../fiches.js';
import { lireFicheApi } from '../lecture-api.js';
import { LIMITE_MENTIONS, mentionsDe } from '../mentions.js';
import { choisirAdaptateur, type AdaptateurChoisi } from '../images/index.js';
import { modulesActifs } from '../../outils/registre.js';
import { accessible } from '../outils.js';
import { creerProposition } from '../propositions.js';
import { ecrireContenu, lireSection } from '../sections.js';
import { TYPES_FICHE } from '../types-fiche.js';
import type { Acteur } from '../types.js';
import { outilsEcritureMcp } from './outils-ecriture-mcp.js';
import type { Catalogue, ContexteDemande, Evenement, Outil, Porte, Resultat } from './types.js';

/** Most sheets a search returns (AD-74). */
export const LIMITE_RECHERCHE = 20;

const INTROUVABLE = 'Introuvable.';
const SECTION_REFUSEE = 'Vous ne pouvez pas modifier cette section.';
const SECTION_PERIMEE = "La section a changé depuis que vous l'avez lue. Relisez-la.";

/** Longest description handed to the image engine (AD-89). */
export const MAX_DESCRIPTION_IMAGE = 500;
export const ECHEC_IMAGE = "Je n'ai pas pu générer l'image.";
const SECTION_PLEINE = `Cette section porte déjà ${MAX_FICHIERS_JOINTS} fichiers joints.`;
const UNE_IMAGE = 'Une seule image par demande.';
const DESCRIPTION_LONGUE = `La description est limitée à ${MAX_DESCRIPTION_IMAGE} caractères.`;

const id = z.number().int().positive();
/** A sheet is cited by key, former key or id (AD-146, AD-mcp-2). */
const refFiche = z.union([z.string().min(1), id]);
const curseur = z.string().min(1).optional();

/** The read tools both doors offer (AD-mcp-2); every other tool is the assistant's own. */
const PARTAGES = new Set(['chercher', 'chercher_texte', 'lire_fiche', 'lire_section', 'mentions']);
const LES_DEUX: readonly Porte[] = ['assistant', 'mcp'];
const ASSISTANT: readonly Porte[] = ['assistant'];

/** What the caller of `catalogueDe` may say beyond account and universe (AD-mcp-2). */
export interface OptionsCatalogue {
  porte?: Porte;
  niveau?: 'lecture' | 'ecriture';
  images?: AdaptateurChoisi;
}

/** The words of a service refusal, as the interface says them (docs/ecrans.md). */
function refus(e: unknown): Resultat {
  if (!(e instanceof ErreurService)) throw e;
  if (e.code === 'introuvable') return { ok: false, erreur: INTROUVABLE };
  if (e.code === 'conflit' && e.detail === 'section_modifiee') {
    return { ok: false, erreur: SECTION_PERIMEE };
  }
  return { ok: false, erreur: e.message };
}

/** Builds a tool whose executor validates its arguments and turns refusals into results. */
function outil<S extends z.ZodObject>(
  nom: string,
  description: string,
  schema: S,
  run: (args: z.infer<S>) => { donnees: unknown; evenement?: Evenement },
): Outil {
  return {
    nom,
    description,
    schema,
    executer(args) {
      const p = schema.safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      try {
        return { ok: true, ...run(p.data) };
      } catch (e) {
        // The tool is GM-only: the GM's wording of the limit, with its figure (docs/ecrans.md).
        if (e instanceof ErreurService && e.detail === 'limite_pieces') {
          return { ok: false, erreur: SECTION_PLEINE };
        }
        return refus(e);
      }
    },
  };
}

/**
 * The tools of the caller in a universe (AD-26: chosen by the server from the
 * role read in `membres`, never by the client). No role → "not found", like an
 * unknown universe. The actor is the account alone, without player mode: a GM
 * keeps the GM catalogue (AD-74). Tools compose service functions in process
 * (AD-27), no SQL here (AD-5).
 */
export function catalogueDe(
  db: Db,
  compteId: number,
  universId: number,
  options: OptionsCatalogue | AdaptateurChoisi = {},
): Catalogue {
  // An image engine alone as 4th argument is the assistant's former form.
  const opts: OptionsCatalogue = 'generateur' in options ? { images: options } : options;
  const porte: Porte = opts.porte ?? 'assistant';
  const niveau = opts.niveau ?? (porte === 'mcp' ? 'lecture' : 'ecriture');
  const role = exigerRole(db, universId, compteId);
  const acteur: Acteur = { compteId };
  const resoudre = (ref: string | number): number => {
    const r = resoudreFiche(db, universId, String(ref));
    if (r === null) throw new ErreurService('introuvable', INTROUVABLE);
    return r.id;
  };
  const cleDe = (ficheId: number): string => cleDeFicheLue(db, compteId, universId, ficheId) ?? String(ficheId);

  const outils: Outil[] = [
    outil(
      'chercher',
      `Cherche des fiches par un ou plusieurs mots (titre, alias, sous-type ou section lisible). Sans \`type\`, cherche dans tous les types. Rend au plus ${LIMITE_RECHERCHE} fiches triées par titre, chacune avec son premier passage correspondant, et un \`curseur\` à repasser pour la page suivante (\`null\` à la dernière).`,
      z.strictObject({ mots: z.string(), type: z.enum(TYPES_FICHE).optional(), curseur }),
      ({ mots, type, curseur: c }) => {
        // One call, every type unless one is given (AD-74, AD-118 (7)): the list's own order, by title.
        const page = listerFiches(db, acteur, universId, {
          type, recherche: mots, limite: LIMITE_RECHERCHE, curseur: c, extraits: true,
        });
        if (page.fiches.length === 0) throw new ErreurService('introuvable', INTROUVABLE); // no result, no event
        const fiches = page.fiches.map((f) => {
          const p = f.passages?.[0];
          return {
            id: f.id, fiche: cleDe(f.id), type: f.type, titre: f.titre,
            ...(p ? { passage: { section: p.section, titre: p.titre, extrait: p.extrait } } : {}),
          };
        });
        return { donnees: { fiches, curseur: page.suivant } };
      },
    ),
    outil(
      'chercher_texte',
      `Cherche des mots dans le texte des sections lisibles et rend tous les passages qui correspondent (fiche, section, extrait), pour au plus ${LIMITE_RECHERCHE} fiches par page, avec un \`curseur\` pour la suivante (\`null\` à la dernière).`,
      z.strictObject({ mots: z.string(), type: z.enum(TYPES_FICHE).optional(), curseur }),
      ({ mots, type, curseur: c }) => {
        const page = listerFiches(db, acteur, universId, {
          type, recherche: mots, limite: LIMITE_RECHERCHE, curseur: c, extraits: true,
        });
        const passages = page.fiches.flatMap((f) =>
          (f.passages ?? []).map((p) => ({
            fiche: cleDe(f.id), ficheId: f.id, titreFiche: f.titre, type: f.type,
            section: p.section, titre: p.titre, extrait: p.extrait,
          })));
        if (passages.length === 0 && page.suivant === null) throw new ErreurService('introuvable', INTROUVABLE); // a page of titles alone still carries its cursor
        return { donnees: { passages, curseur: page.suivant } };
      },
    ),
    outil(
      'lire_fiche',
      'Lit une fiche, citée par `fiche` (clé, ancienne clé ou id) : ses sections lisibles par la personne, avec leur contenu, leur `version` et leur `empreinte`, ses relations lisibles, et l\'empreinte de la fiche et de son en-tête.',
      z.strictObject({ fiche: refFiche }),
      ({ fiche }) => {
        const ficheId = resoudre(fiche);
        const f = lireFiche(db, acteur, universId, ficheId, 'markdown');
        const api = lireFicheApi(db, acteur, universId, String(ficheId));
        const empreintes = new Map(api.sections.map((s) => [s.id, s.empreinte]));
        return {
          donnees: {
            id: f.id,
            fiche: cleDe(f.id),
            type: f.type,
            titre: f.titre,
            empreinte: api.empreinte,
            empreinteEnTete: api.empreinteEntete,
            sections: f.sections.map((s) => ({
              id: s.id,
              titre: s.titre,
              contenu: s.contenu ?? s.html, // source only when the caller may write it, else the reader's rendered view (AD-113)
              version: s.version,
              modifiable: s.peutEcrire,
              empreinte: empreintes.get(s.id) ?? null,
            })),
            relations: api.relations.map((r) => ({
              id: r.id,
              section: r.sectionId,
              cible: { id: r.cible.id, fiche: r.cible.cle ?? String(r.cible.id) },
              nature: r.nature,
              qualificatif: r.qualificatif,
              empreinte: r.empreinte,
            })),
          },
        };
      },
    ),
    outil(
      'lire_section',
      "Lit une section d'une fiche (`fiche` : clé, ancienne clé ou id) : son contenu, sa `version` et son `empreinte`.",
      z.strictObject({ fiche: refFiche, sectionId: id }),
      ({ fiche, sectionId }) => {
        const ficheId = resoudre(fiche);
        const s = lireSection(db, acteur, universId, ficheId, sectionId, 'markdown');
        const api = lireFicheApi(db, acteur, universId, String(ficheId));
        return {
          donnees: {
            id: s.id,
            titre: s.titre,
            contenu: s.contenu ?? s.html, // source only when the caller may write it, else the reader's rendered view (AD-113)
            version: s.version,
            modifiable: s.peutEcrire,
            empreinte: api.sections.find((x) => x.id === s.id)?.empreinte ?? null,
          },
        };
      },
    ),
    outil(
      'mentions',
      `Liste les fiches qui citent une fiche (\`fiche\` : clé, ancienne clé ou id), par lien ou par relation, ${LIMITE_MENTIONS} par page, avec un \`curseur\` pour la suivante (\`null\` à la dernière).`,
      z.strictObject({ fiche: refFiche, curseur: z.string().regex(/^\d+$/).optional() }),
      ({ fiche, curseur: c }) => {
        const ficheId = resoudre(fiche);
        lireFiche(db, acteur, universId, ficheId); // the sheet must be readable: the same « Introuvable. » otherwise
        const apres = c === undefined ? 0 : Number(c);
        const page = mentionsDe(db, role, acteur, universId, ficheId, apres);
        return {
          donnees: {
            mentions: page.mentions.map((m) => ({
              id: m.ficheId, fiche: cleDe(m.ficheId), titre: m.titre, type: m.type, pourquoi: m.pourquoi,
            })),
            curseur: page.suite ? String(apres + LIMITE_MENTIONS) : null,
          },
        };
      },
    ),
    outil(
      'modifier_section',
      'Remplace tout le contenu d’une section que la personne peut écrire. `version` est celle lue.',
      z.strictObject({ fiche: refFiche, sectionId: id, contenu: z.string(), version: z.number().int() }),
      ({ fiche, sectionId, contenu, version }) => {
        const ficheId = resoudre(fiche);
        const s = ecrireContenu(db, compteId, universId, ficheId, sectionId, contenu, version);
        return {
          donnees: { id: s.id, titre: s.titre, version: s.version },
          evenement: {
            type: 'section_modifiee',
            libelle: `Section « ${s.titre} » modifiée`,
            cible: { type: 'fiche', ficheId, sectionId },
          },
        };
      },
    ),
    outil(
      'ajouter_a_section',
      'Ajoute un paragraphe après le contenu existant d’une section que la personne peut écrire, sans recopier le texte existant. `version` est celle lue.',
      z.strictObject({ fiche: refFiche, sectionId: id, texte: z.string(), version: z.number().int() }),
      ({ fiche, sectionId, texte, version }) => {
        const ficheId = resoudre(fiche);
        const lue = lireSection(db, acteur, universId, ficheId, sectionId, 'markdown');
        if (!lue.peutEcrire) throw new ErreurService('refuse', SECTION_REFUSEE);
        const source = lue.contenu ?? '';
        const contenu = source === '' ? texte : `${source}\n\n${texte}`;
        const s = ecrireContenu(db, compteId, universId, ficheId, sectionId, contenu, version);
        return {
          donnees: { id: s.id, titre: s.titre, version: s.version },
          evenement: {
            type: 'section_completee',
            libelle: `Section « ${s.titre} » complétée`,
            cible: { type: 'fiche', ficheId, sectionId },
          },
        };
      },
    ),
  ];

  if (role === 'mj') {
    outils.push(
      outil(
        'creer_fiche',
        'Crée une fiche d’un type activé (hors compte-rendu), avec un titre, un sous-type facultatif et un parent facultatif. Une aventure naît En préparation, fermée aux joueurs. Pour une campagne ou un scénario, utiliser le type aventure et le sous-type Campagne ou Scénario ; chercher le parent pour obtenir son id.',
        z.strictObject({
          type: z.enum(TYPES_FICHE.filter((type) => type !== 'compte_rendu')),
          titre: z.string(),
          sousType: z.string().optional(),
          parentId: id.optional(),
        }),
        ({ type, titre, sousType, parentId }) => db.transaction(() => {
          // Match the sheet form's default for a character: an NPC (no generic payload parameter).
          const fiche = creerFiche(db, compteId, universId, {
            type, titre, sousType, charge: type === 'personnage' ? { pj: false } : undefined, via: 'assistant',
          });
          if (parentId !== undefined) deplacerFiche(db, acteur, universId, fiche.id, parentId);
          return {
            donnees: { id: fiche.id, type: fiche.type, titre: fiche.titre },
            evenement: {
              type: 'fiche_creee' as const,
              libelle: `Fiche « ${fiche.titre} » créée`,
              cible: { type: 'fiche' as const, ficheId: fiche.id },
            },
          };
        })(),
      ),
      outil(
        'proposer_mise_a_jour',
        "Propose un nouveau contenu pour une section, d'après un compte-rendu. N'écrit jamais dans la section : le MJ applique ou abandonne la proposition lui-même. `version` est celle rendue par `lire_section`.",
        z.strictObject({
          section_id: id,
          cr_id: id,
          version: z.number().int(),
          contenu: z.string(),
        }),
        ({ section_id, cr_id, version, contenu }) => {
          const p = creerProposition(db, compteId, universId, {
            sectionId: section_id,
            crId: cr_id,
            contenu,
            version,
          });
          const fiche = lireFiche(db, acteur, universId, p.ficheId);
          const section = fiche.sections.find((x) => x.id === p.sectionId);
          return {
            donnees: { id: p.id, etat: p.etat },
            evenement: {
              type: 'proposition_creee',
              libelle: `Mise à jour proposée : section « ${section?.titre ?? ''} » de « ${fiche.titre} »`,
              cible: { type: 'proposition', propositionId: p.id },
            },
          };
        },
      ),
    );
  }

  // The history is the GM's, on the MCP door only (AD-mcp-6): a player's catalogue has no such name, so a call is « Introuvable. ».
  if (porte === 'mcp' && role === 'mj') {
    outils.push({
      ...outil(
        'lire_historique',
        'Lit l\'historique des écritures de l\'univers, de la plus récente à la plus ancienne (100 lignes par page), éventuellement pour une seule fiche (`fiche` : clé, ancienne clé ou id), avec un `curseur` pour la page suivante (`null` à la dernière).',
        z.strictObject({ fiche: refFiche.optional(), curseur: z.string().regex(/^\d+$/).optional() }),
        ({ fiche, curseur: c }) => {
          const page = listerHistorique(db, acteur, universId, {
            ...(fiche === undefined ? {} : { fiche: String(fiche) }),
            ...(c === undefined ? {} : { apres: c }),
          });
          return { donnees: { lignes: page.lignes, curseur: page.curseur } };
        },
      ),
      portes: ['mcp'] as const,
    });
  }

  // The write tools of the MCP door, only where the token writes (AD-mcp-2, AD-mcp-5): a `lecture` token lists none.
  if (porte === 'mcp' && niveau === 'ecriture') outils.push(...outilsEcritureMcp(db, compteId, universId));

  // The image engine is a GM tool, and absent when no engine exists (AD-45, AD-89).
  const images = opts.images ?? choisirAdaptateur();
  if (role === 'mj' && porte === 'assistant' && images.nom !== 'aucun') {
    outils.push(outilImage(db, compteId, universId, images));
  }

  // The tools declared by the modules, without knowing any by name (AD-136): the role is read above, at each request.
  for (const module of modulesActifs()) {
    for (const declare of module.outils) {
      if (!declare.outilsAssistant || !accessible(db, acteur, universId, declare.cle)) continue;
      outils.push(...declare.outilsAssistant({ db, acteur, universId, role }));
    }
  }

  // Each tool says the doors that offer it; the catalogue keeps those of its door (AD-mcp-2).
  const offerts = outils
    .map((o) => ({ ...o, portes: o.portes ?? (PARTAGES.has(o.nom) ? LES_DEUX : ASSISTANT) }))
    .filter((o) => o.portes.includes(porte));

  // Every write a tool makes through the assistant carries the origin `assistant` (AD-147), the async ones
  // included; the MCP door sets its own origin around the call.
  return {
    role,
    porte,
    niveau,
    outils: porte === 'mcp'
      ? offerts
      : offerts.map((o) => ({
        ...o,
        executer: (args: unknown, contexte?: ContexteDemande) =>
          sousOrigine({ origine: 'assistant' }, () => o.executer(args, contexte)),
      })),
  };
}

/** `image-<date>-<time>.png`, in UTC. */
function nomImage(maintenant = new Date()): string {
  const iso = maintenant.toISOString();
  return `image-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}.png`;
}

/**
 * `generer_image` (AD-89), in this order: the right to write first (the engine is not spent for a
 * refusal), the limits, the generation, the attachment by `ajouterFichier` (AD-117 §6), the event.
 * Every failure is a result, never an exception, and carries no event.
 */
function outilImage(db: Db, compteId: number, universId: number, images: AdaptateurChoisi): Outil {
  const schema = z.strictObject({ sectionId: id, description: z.string().min(1) });
  return {
    nom: 'generer_image',
    description: `Génère une image à partir d'une description (${MAX_DESCRIPTION_IMAGE} caractères au plus) et l'attache à une section que la personne peut écrire (\`sectionId\` : celui que rendent chercher et lire_fiche). Une seule image par demande ; l'opération peut durer plusieurs minutes.`,
    schema,
    horsDelai: true,
    async executer(args, contexte: ContexteDemande = {}): Promise<Resultat> {
      const p = schema.safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      const { sectionId, description } = p.data;
      try {
        const cible = verifierDepot(db, { compteId }, universId, sectionId);
        if (description.length > MAX_DESCRIPTION_IMAGE) {
          return { ok: false, erreur: DESCRIPTION_LONGUE };
        }
        if (contexte.imageGeneree) return { ok: false, erreur: UNE_IMAGE };
        let octets: Buffer;
        try {
          octets = await images.generateur.generer(description, contexte.signal);
        } catch {
          return { ok: false, erreur: ECHEC_IMAGE };
        }
        contexte.imageGeneree = true;
        // A request abandoned during the generation attaches nothing.
        if (contexte.signal?.aborted) return { ok: false, erreur: ECHEC_IMAGE };
        // The media library's one upload function (AD-117 §6): the visibility follows the section.
        const fichier = await ajouterFichier(
          db,
          { compteId },
          universId,
          Readable.from([octets]),
          nomImage(),
          { ou: 'section', sectionId, maniere: 'joint' },
        );
        return {
          ok: true,
          donnees: { fichierId: fichier.id, nom: fichier.nom },
          evenement: {
            type: 'image_attachee',
            libelle: `Image attachée à la section « ${cible.titreSection} » de « ${cible.titreFiche} »`,
            cible: {
              type: 'fiche',
              ficheId: cible.ficheId,
              sectionId,
              fichierId: fichier.id,
              description,
            },
          },
        };
      } catch (e) {
        // The tool is GM-only: the GM's wording of the limit, with its figure (docs/ecrans.md).
        if (e instanceof ErreurService && e.detail === 'limite_pieces') {
          return { ok: false, erreur: SECTION_PLEINE };
        }
        return refus(e);
      }
    },
  };
}
