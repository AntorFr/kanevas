import { Readable } from 'node:stream';
import { z } from 'zod';
import type { Db } from '../../db/db.js';
import { creerCampagne, lireCampagne, listerCampagnes } from '../campagnes.js';
import { exigerRole } from '../droits.js';
import { ErreurService } from '../erreurs.js';
import { lireFiche, listerFiches } from '../fiches.js';
import { choisirAdaptateur, type AdaptateurChoisi } from '../images/index.js';
import { deposerPieceJointe, MAX_PIECES_PAR_SECTION, verifierDepot } from '../pieces-jointes.js';
import { creerScenario } from '../scenarios.js';
import { ecrireContenu, lireSection } from '../sections.js';
import { TYPES_FICHE } from '../types.js';
import type { Acteur } from '../types.js';
import type { Catalogue, ContexteDemande, Evenement, Outil, Resultat } from './types.js';

/** Most sheets a search returns (AD-74). */
export const LIMITE_RECHERCHE = 20;

const INTROUVABLE = 'Introuvable.';
const SECTION_REFUSEE = 'Vous ne pouvez pas modifier cette section.';
const SECTION_PERIMEE = "La section a changé depuis que vous l'avez lue. Relisez-la.";

/** Longest description handed to the image engine (AD-89). */
export const MAX_DESCRIPTION_IMAGE = 500;
export const ECHEC_IMAGE = "Je n'ai pas pu générer l'image.";
const SECTION_PLEINE = `Cette section porte déjà ${MAX_PIECES_PAR_SECTION} pièces jointes.`;
const UNE_IMAGE = 'Une seule image par demande.';
const DESCRIPTION_LONGUE = `La description est limitée à ${MAX_DESCRIPTION_IMAGE} caractères.`;

const id = z.number().int().positive();

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
  images: AdaptateurChoisi = choisirAdaptateur(),
): Catalogue {
  const role = exigerRole(db, universId, compteId);
  const acteur: Acteur = { compteId };

  const outils: Outil[] = [
    outil(
      'chercher',
      `Cherche des fiches par un ou plusieurs mots (titre ou section lisible). Sans \`type\`, cherche dans tous les types. Rend au plus ${LIMITE_RECHERCHE} fiches triées par type puis titre, et dit si la liste est tronquée.`,
      z.strictObject({ mots: z.string(), type: z.enum(TYPES_FICHE).optional() }),
      ({ mots, type }) => {
        const types = type ? [type] : TYPES_FICHE;
        const trouvees: { id: number; type: string; titre: string }[] = [];
        let tronquee = false;
        for (const t of types) {
          const page = listerFiches(db, acteur, universId, {
            type: t,
            recherche: mots,
            limite: LIMITE_RECHERCHE,
          });
          if (page.suivant !== null) tronquee = true;
          for (const f of page.fiches) trouvees.push({ id: f.id, type: f.type, titre: f.titre });
        }
        if (trouvees.length > LIMITE_RECHERCHE) tronquee = true;
        return { donnees: { fiches: trouvees.slice(0, LIMITE_RECHERCHE), tronquee } };
      },
    ),
    outil(
      'lire_fiche',
      'Lit une fiche : ses sections lisibles par la personne, avec leur contenu et leur `version`.',
      z.strictObject({ ficheId: id }),
      ({ ficheId }) => {
        const f = lireFiche(db, acteur, universId, ficheId);
        return {
          donnees: {
            id: f.id,
            type: f.type,
            titre: f.titre,
            sections: f.sections.map((s) => ({
              id: s.id,
              titre: s.titre,
              contenu: s.contenu,
              version: s.version,
              modifiable: s.peutEcrire,
            })),
          },
        };
      },
    ),
    outil(
      'lire_section',
      "Lit une section d'une fiche : son contenu et sa `version`.",
      z.strictObject({ ficheId: id, sectionId: id }),
      ({ ficheId, sectionId }) => {
        const s = lireSection(db, acteur, universId, ficheId, sectionId);
        return {
          donnees: {
            id: s.id,
            titre: s.titre,
            contenu: s.contenu,
            version: s.version,
            modifiable: s.peutEcrire,
          },
        };
      },
    ),
    outil(
      'modifier_section',
      'Remplace tout le contenu d’une section que la personne peut écrire. `version` est celle lue.',
      z.strictObject({ ficheId: id, sectionId: id, contenu: z.string(), version: z.number().int() }),
      ({ ficheId, sectionId, contenu, version }) => {
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
      z.strictObject({ ficheId: id, sectionId: id, texte: z.string(), version: z.number().int() }),
      ({ ficheId, sectionId, texte, version }) => {
        const lue = lireSection(db, acteur, universId, ficheId, sectionId);
        if (!lue.peutEcrire) throw new ErreurService('refuse', SECTION_REFUSEE);
        const contenu = lue.contenu === '' ? texte : `${lue.contenu}\n\n${texte}`;
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
    outil(
      'lister_campagnes',
      "Liste les campagnes de l'univers.",
      z.strictObject({}),
      () => ({
        donnees: {
          campagnes: listerCampagnes(db, compteId, universId).map((c) => ({
            id: c.id,
            nom: c.nom,
            statut: c.statut,
          })),
        },
      }),
    ),
  ];

  if (role === 'mj') {
    outils.push(
      outil(
        'creer_campagne',
        "Crée une campagne (en préparation) dans l'univers.",
        z.strictObject({ nom: z.string() }),
        ({ nom }) => {
          const c = creerCampagne(db, compteId, universId, { nom });
          return {
            donnees: { id: c.id, nom: c.nom, statut: c.statut },
            evenement: {
              type: 'campagne_creee',
              libelle: `Campagne « ${c.nom} » créée`,
              cible: { type: 'campagne', campagneId: c.id },
            },
          };
        },
      ),
      outil(
        'creer_scenario',
        "Crée un scénario dans une campagne de l'univers.",
        z.strictObject({ campagneId: id, titre: z.string(), contenu: z.string().optional() }),
        ({ campagneId, titre, contenu }) => {
          // The campaign must belong to THIS universe, not just to one the account is GM of.
          const campagne = lireCampagne(db, compteId, universId, campagneId);
          const s = creerScenario(db, compteId, campagneId, { titre, contenu });
          return {
            donnees: { id: s.id, titre: s.titre, campagneId },
            evenement: {
              type: 'scenario_cree',
              libelle: `Scénario « ${s.titre} » créé dans ${campagne.nom}`,
              cible: { type: 'scenario', campagneId, scenarioId: s.id },
            },
          };
        },
      ),
    );
  }

  // The image engine is a GM tool, and absent when no engine exists (AD-45, AD-89).
  if (role === 'mj' && images.nom !== 'aucun') outils.push(outilImage(db, compteId, universId, images));

  return { role, outils };
}

/** `image-<date>-<time>.png`, in UTC. */
function nomImage(maintenant = new Date()): string {
  const iso = maintenant.toISOString();
  return `image-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}.png`;
}

/**
 * `generer_image` (AD-89), in this order: the right to write first (the engine is not spent for a
 * refusal), the limits, the generation, the attachment by `deposerPieceJointe` (AD-65), the event.
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
        const cible = verifierDepot(db, compteId, universId, sectionId);
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
        const piece = await deposerPieceJointe(
          db,
          compteId,
          false,
          sectionId,
          Readable.from([octets]),
          nomImage(),
          false,
        );
        return {
          ok: true,
          donnees: { pieceId: piece.id, nom: piece.nom },
          evenement: {
            type: 'image_attachee',
            libelle: `Image attachée à la section « ${cible.titreSection} » de « ${cible.titreFiche} »`,
            cible: {
              type: 'fiche',
              ficheId: cible.ficheId,
              sectionId,
              pieceId: piece.id,
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
