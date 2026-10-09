import { z } from 'zod';
import type { Db } from '../../db/db.js';
import { creerCampagne, lireCampagne, listerCampagnes } from '../campagnes.js';
import { exigerRole } from '../droits.js';
import { ErreurService } from '../erreurs.js';
import { lireFiche, listerFiches } from '../fiches.js';
import { creerProposition } from '../propositions.js';
import { creerScenario } from '../scenarios.js';
import { ecrireContenu, lireSection } from '../sections.js';
import { TYPES_FICHE } from '../types.js';
import type { Acteur } from '../types.js';
import type { Catalogue, Evenement, Outil, Resultat } from './types.js';

/** Most sheets a search returns (AD-74). */
export const LIMITE_RECHERCHE = 20;

const INTROUVABLE = 'Introuvable.';
const SECTION_REFUSEE = 'Vous ne pouvez pas modifier cette section.';
const SECTION_PERIMEE = "La section a changé depuis que vous l'avez lue. Relisez-la.";

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
export function catalogueDe(db: Db, compteId: number, universId: number): Catalogue {
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

  return { role, outils };
}
