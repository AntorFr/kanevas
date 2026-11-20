import { z } from 'zod';
import type { Db } from '../../db/db.js';
import { exigerMJ } from '../droits.js';
import { ErreurService, introuvable } from '../erreurs.js';
import { cleDeFicheLue, resoudreFiche } from '../cles.js';
import { creerFiche } from '../fiches.js';
import { ecrire } from '../historique.js';
import { ecrireEnTete, validerEnTete } from '../import-entete.js';
import { lireFicheApi } from '../lecture-api.js';
import { sousPrecondition } from '../precondition.js';
import {
  empreinteDeRelation, lireRelationLisible, modifierRelation, relierSection, retirerRelation,
  trouverRelationExistante,
} from '../relations.js';
import { ecrireContenu, lireSection, retirerSection } from '../sections.js';
import { TYPES_FICHE } from '../types-fiche.js';
import type { Evenement, Outil, Resultat } from './types.js';

/**
 * The write tools of the MCP door (AD-mcp-5, B-97). Each composes a service of the targeted writes under the
 * precondition contract (AD-ecriture-1, `sousPrecondition`): the fingerprint read is compared **inside** the
 * transaction, before any write. No SQL here (AD-27); the origin `mcp` and the token are set by the door.
 */
export const OUTILS_ECRITURE_MCP = [
  'creer_fiche', 'modifier_entete', 'ecrire_section', 'supprimer_section', 'relier', 'modifier_relation', 'retirer_relation',
] as const;

const PERIMEE_SECTION = "La section a changé depuis que vous l'avez lue. Relisez-la.";
const PERIMEE_ENTETE = "L'en-tête de la fiche a changé depuis que vous l'avez lu. Relisez la fiche.";
const PERIMEE_RELATION = "La relation a changé depuis que vous l'avez lue. Relisez la fiche.";

const id = z.number().int().positive();
const refFiche = z.union([z.string().min(1), id]);
const empreinte = z.string().regex(/^[0-9a-f]{32}$/);

type Echec = Extract<Resultat, { ok: false }>;

/** A refusal as the agent reads it: the interface's words, and the code (and field) it can act on. */
function echec(e: unknown, perimee: string): Echec {
  if (!(e instanceof ErreurService)) throw e;
  if (e.detail === 'empreinte_perimee' || e.detail === 'section_modifiee') {
    return { ok: false, erreur: perimee, code: 'section_modifiee' };
  }
  if (e.code === 'introuvable') return { ok: false, erreur: 'Introuvable.', code: 'introuvable' };
  const code = e.detail ?? e.code;
  return { ok: false, erreur: e.message, code, ...(e.champ ? { champ: e.champ } : {}) };
}

function ecrireOutil<S extends z.ZodObject>(
  nom: string,
  description: string,
  schema: S,
  perimee: string,
  run: (args: z.infer<S>) => { donnees: unknown; evenement?: Evenement },
): Outil {
  return {
    nom,
    description,
    schema,
    portes: ['mcp'],
    executer(args) {
      const p = schema.safeParse(args ?? {});
      if (!p.success) {
        // A missing or malformed fingerprint is named first: it is what the agent must go and read (AD-mcp-5).
        const champ = p.error.issues.some((i) => i.path[0] === 'empreinte')
          ? 'empreinte'
          : String(p.error.issues[0]?.path[0] ?? '');
        return { ok: false, erreur: 'Paramètres invalides.', code: 'invalide', ...(champ ? { champ } : {}) };
      }
      try {
        return { ok: true, ...run(p.data) };
      } catch (e) {
        return echec(e, perimee);
      }
    },
  };
}

/** The write tools of one caller in one universe. */
export function outilsEcritureMcp(db: Db, compteId: number, universId: number): Outil[] {
  const acteur = { compteId };
  const resoudre = (ref: string | number): number => {
    const r = resoudreFiche(db, universId, String(ref));
    if (r === null) throw introuvable();
    return r.id;
  };
  const cleDe = (ficheId: number): string => cleDeFicheLue(db, compteId, universId, ficheId) ?? String(ficheId);
  const fiche = (ficheId: number) => lireFicheApi(db, acteur, universId, String(ficheId));
  const empreinteSection = (ficheId: number, sectionId: number): string => {
    const s = fiche(ficheId).sections.find((x) => x.id === sectionId);
    if (!s) throw introuvable();
    return s.empreinte;
  };
  const pasDeLot = (cle: string, objet: string) => ({ lotId: null, nature: 'fiches' as const, cle, objet });
  const evenement = (type: Evenement['type'], libelle: string, ficheId: number, plus: Record<string, number> = {}): Evenement =>
    ({ type, libelle, cible: { type: 'fiche', ficheId, ...plus } });

  return [
    ecrireOutil(
      'creer_fiche',
      'Crée une fiche d’un type activé (hors compte-rendu), avec un titre, un sous-type facultatif et un parent facultatif (`parent` : clé, ancienne clé ou id). Rend la `fiche` (sa clé lisible) et ses empreintes. Aucune empreinte à fournir. Réservé au MJ.',
      z.strictObject({
        type: z.enum(TYPES_FICHE.filter((t) => t !== 'compte_rendu')),
        titre: z.string(),
        sousType: z.string().optional(),
        parent: refFiche.optional(),
      }),
      PERIMEE_ENTETE,
      ({ type, titre, sousType, parent }) => {
        const creee = db.transaction(() => creerFiche(db, compteId, universId, {
          type, titre, sousType,
          parent: parent === undefined ? undefined : resoudre(parent),
          charge: type === 'personnage' ? { pj: false } : undefined,
          via: 'mcp',
        }))();
        const f = fiche(creee.id);
        return {
          donnees: {
            id: creee.id, fiche: cleDe(creee.id), type: creee.type, titre: creee.titre,
            empreinte: f.empreinte, empreinteEnTete: f.empreinteEntete,
          },
          evenement: evenement('fiche_creee', `Fiche « ${creee.titre} » créée`, creee.id),
        };
      },
    ),
    ecrireOutil(
      'modifier_entete',
      'Modifie l’en-tête d’une fiche (`fiche` : clé, ancienne clé ou id) : seuls les champs envoyés changent (`titre`, `sousType`, `parent` — clé de fiche ou `null` pour la racine —, `alias` et `etiquettes` remplacent toute la liste, `statut`, `disparu`, `pj`). `empreinte` est celle de l’en-tête (`empreinteEnTete` de `lire_fiche`) : si l’en-tête a changé depuis, rien n’est écrit (`section_modifiee`, relisez). Une section modifiée entre-temps ne gêne pas. Réservé au MJ.',
      z.strictObject({
        fiche: refFiche,
        empreinte,
        titre: z.string().optional(),
        sousType: z.string().nullable().optional(),
        parent: z.string().min(1).nullable().optional(),
        alias: z.array(z.string()).optional(),
        etiquettes: z.array(z.string()).optional(),
        statut: z.string().optional(),
        disparu: z.boolean().optional(),
        pj: z.boolean().optional(),
      }),
      PERIMEE_ENTETE,
      ({ fiche: ref, empreinte: lue, ...champs }) => {
        exigerMJ(db, universId, compteId);
        const ficheId = resoudre(ref);
        const valides = validerEnTete(champs, new Date());
        const r = sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(ref), 'fiche'),
          () => fiche(ficheId).empreinteEntete,
          () => ecrire(db, compteId, () => {
            const ecrit = ecrireEnTete(db, { compteId, universId }, ficheId, valides);
            const f = fiche(ficheId);
            return { ecrit, titre: f.entete.titre, empreinteEnTete: f.empreinteEntete, empreinte: f.empreinte };
          }),
        );
        return {
          donnees: {
            id: ficheId, fiche: cleDe(ficheId), inchangee: !r.ecrit,
            empreinteEnTete: r.empreinteEnTete, empreinte: r.empreinte,
          },
          ...(r.ecrit ? { evenement: evenement('fiche_modifiee', `Fiche « ${r.titre} » modifiée`, ficheId) } : {}),
        };
      },
    ),
    ecrireOutil(
      'ecrire_section',
      'Remplace tout le contenu d’une section que la personne peut écrire (`fiche` : clé, ancienne clé ou id ; `sectionId`). `empreinte` est celle de la section, lue par `lire_fiche` ou `lire_section` : si la section a changé depuis, rien n’est écrit (`section_modifiee`, relisez). Une section gérée par un outil est refusée (`section_geree`).',
      z.strictObject({ fiche: refFiche, sectionId: id, empreinte, contenu: z.string() }),
      PERIMEE_SECTION,
      ({ fiche: ref, sectionId, empreinte: lue, contenu }) => {
        const ficheId = resoudre(ref);
        const s = sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(ref), 'section'),
          () => empreinteSection(ficheId, sectionId),
          () => {
            const version = lireSection(db, acteur, universId, ficheId, sectionId).version;
            return ecrireContenu(db, compteId, universId, ficheId, sectionId, contenu, version);
          },
        );
        return {
          donnees: {
            id: s.id, titre: s.titre, version: s.version,
            empreinte: empreinteSection(ficheId, s.id), empreinteFiche: fiche(ficheId).empreinte,
          },
          evenement: evenement('section_modifiee', `Section « ${s.titre} » modifiée`, ficheId, { sectionId }),
        };
      },
    ),
    ecrireOutil(
      'supprimer_section',
      'Supprime une section (`fiche`, `sectionId`) avec ses relations ; la fiche reste. `empreinte` est celle de la section lue : périmée, rien n’est supprimé (`section_modifiee`, relisez). Réservé au MJ.',
      z.strictObject({ fiche: refFiche, sectionId: id, empreinte }),
      PERIMEE_SECTION,
      ({ fiche: ref, sectionId, empreinte: lue }) => {
        exigerMJ(db, universId, compteId);
        const ficheId = resoudre(ref);
        const titre = lireSection(db, acteur, universId, ficheId, sectionId).titre;
        sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(ref), 'section'),
          () => empreinteSection(ficheId, sectionId),
          () => {
            const s = lireSection(db, acteur, universId, ficheId, sectionId);
            if (s.geree) throw new ErreurService('refuse', 'Cette section est gérée par un outil.', 'section_geree');
            retirerSection(db, compteId, universId, ficheId, sectionId);
          },
        );
        return {
          donnees: { id: sectionId, supprimee: true, empreinteFiche: fiche(ficheId).empreinte },
          evenement: evenement('section_supprimee', `Section « ${titre} » supprimée`, ficheId),
        };
      },
    ),
    ecrireOutil(
      'relier',
      'Relie une section (`fiche`, `sectionId`) à une autre fiche (`cible` : clé, ancienne clé ou id), avec une `nature` connue et/ou un `qualificatif` (80 caractères au plus). Aucune empreinte à fournir ; répété à l’identique, rend la relation existante sans la doubler. Rend son `empreinte`, à fournir pour la modifier ou la retirer. Réservé au MJ.',
      z.strictObject({
        fiche: refFiche, sectionId: id, cible: refFiche,
        nature: z.string().optional(), qualificatif: z.string().optional(),
      }),
      PERIMEE_RELATION,
      ({ fiche: ref, sectionId, cible, nature, qualificatif }) => {
        exigerMJ(db, universId, compteId);
        const ficheId = resoudre(ref);
        const cibleId = resoudre(cible);
        const q = (qualificatif ?? '').trim();
        const n = nature ?? '';
        let cree = true;
        let relationId: number;
        try {
          relationId = db.transaction(() => relierSection(db, compteId, universId, ficheId, sectionId,
            { cibleFicheId: cibleId, nature: n, qualificatif: q }))().id;
        } catch (e) {
          if (!(e instanceof ErreurService) || e.detail !== 'relation_existante') throw e;
          const existante = trouverRelationExistante(db, universId, ficheId, sectionId, cibleId, n, q);
          if (!existante) throw e;
          cree = false;
          relationId = existante.id;
        }
        const lue = lireRelationLisible(db, acteur, universId, relationId);
        return {
          donnees: {
            id: relationId, nature: lue.nature, qualificatif: lue.qualificatif, inchangee: !cree,
            empreinte: empreinteDeRelation(db, lue), empreinteFiche: fiche(ficheId).empreinte,
          },
          ...(cree ? { evenement: evenement('relation_creee', 'Relation créée', ficheId, { sectionId }) } : {}),
        };
      },
    ),
    ecrireOutil(
      'modifier_relation',
      'Modifie la `nature` et/ou le `qualificatif` d’une relation (`relation` : son id, rendu par `lire_fiche` ou `relier`). `empreinte` est celle de la relation lue : périmée, rien n’est écrit (`section_modifiee`, relisez). Réservé au MJ.',
      z.strictObject({
        relation: id, empreinte,
        nature: z.string().nullable().optional(), qualificatif: z.string().optional(),
      }),
      PERIMEE_RELATION,
      ({ relation, empreinte: lue, nature, qualificatif }) => {
        exigerMJ(db, universId, compteId);
        if (nature === undefined && qualificatif === undefined) {
          throw new ErreurService('invalide', 'Une nature ou un qualificatif est attendu.', undefined, 'nature');
        }
        const r = sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(relation), 'relation'),
          () => empreinteDeRelation(db, lireRelationLisible(db, acteur, universId, relation)),
          () => ecrire(db, compteId, () => modifierRelation(db, compteId, universId, relation, { nature, qualificatif })),
        );
        const lue2 = lireRelationLisible(db, acteur, universId, relation);
        return {
          donnees: {
            id: relation, nature: r.relation.nature, qualificatif: r.relation.qualificatif, inchangee: !r.ecrit,
            empreinte: empreinteDeRelation(db, lue2), empreinteFiche: fiche(lue2.ficheId).empreinte,
          },
          ...(r.ecrit ? { evenement: evenement('relation_modifiee', 'Relation modifiée', lue2.ficheId, { sectionId: lue2.sectionId }) } : {}),
        };
      },
    ),
    ecrireOutil(
      'retirer_relation',
      'Retire une relation (`relation` : son id). `empreinte` est celle de la relation lue : périmée, rien n’est retiré (`section_modifiee`, relisez). Réservé au MJ.',
      z.strictObject({ relation: id, empreinte }),
      PERIMEE_RELATION,
      ({ relation, empreinte: lue }) => {
        exigerMJ(db, universId, compteId);
        const avant = lireRelationLisible(db, acteur, universId, relation);
        sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(relation), 'relation'),
          () => empreinteDeRelation(db, lireRelationLisible(db, acteur, universId, relation)),
          () => retirerRelation(db, compteId, universId, relation),
        );
        return {
          donnees: { id: relation, retiree: true, empreinteFiche: fiche(avant.ficheId).empreinte },
          evenement: evenement('relation_retiree', 'Relation retirée', avant.ficheId, { sectionId: avant.sectionId }),
        };
      },
    ),
  ];
}
