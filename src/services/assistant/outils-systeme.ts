import { z } from 'zod';
import type { Db } from '../../db/db.js';
import { estMJDuSysteme, lectureSysteme } from '../droits.js';
import { ErreurService, introuvable } from '../erreurs.js';
import { cleDeFicheLue, resoudreFiche } from '../cles.js';
import { creerFiche, lireFiche, listerFiches, supprimerFiche } from '../fiches.js';
import { ecrire } from '../historique.js';
import { ecrireEnTete, validerEnTete } from '../import-entete.js';
import { lireFicheApi } from '../lecture-api.js';
import { sousPrecondition } from '../precondition.js';
import { ecrireContenu, lireSection, retirerSection } from '../sections.js';
import { personnaliser, revenir } from '../surcharge.js';
import { systemeRattache } from '../systemes.js';
import { TYPES_FICHE } from '../types-fiche.js';
import type { Acteur } from '../types.js';
import type { Evenement, Outil, Resultat } from './types.js';
import { ecrireOutil, PERIMEE_ENTETE, PERIMEE_SECTION } from './outils-ecriture-mcp.js';

/**
 * The read tools of the universe's game system (AD-159, AD-mcp-sj-1 to 4). The system is closed over like the account
 * and the universe: no tool takes a system id. Tools only compose services (AD-27, no SQL here — a source-scan test
 * fails on any); the right on the system is read again at **each call** (`lectureSysteme`, AD-152), so a tool listed for
 * a right the account lost since answers « Introuvable. ». Reads go through the sheet services on the system's space,
 * which return the sections the account may read: all for a GM of the system, the players' ones for anyone else.
 */
export const OUTILS_LECTURE_SYSTEME = ['systeme_chercher', 'systeme_lire_fiche', 'systeme_lire_section'] as const;

const INTROUVABLE = 'Introuvable.';
/** Most elements a search returns, as the sheet tool's. */
const LIMITE = 20;

const empreinte = z.string().regex(/^[0-9a-f]{32}$/);
const id = z.number().int().positive();
const refFiche = z.union([z.string().min(1), id]);

const evenement = (type: Evenement['type'], libelle: string, ficheId: number, plus: Record<string, number> = {}): Evenement =>
  ({ type, libelle, cible: { type: 'fiche', ficheId, ...plus } });

function refus(e: unknown): Resultat {
  if (!(e instanceof ErreurService)) throw e;
  return { ok: false, erreur: e.code === 'introuvable' ? INTROUVABLE : e.message };
}

/** The three read tools of one caller in one universe, for the system attached to it (`systemeId`, named `nomSysteme`). */
export function outilsLectureSysteme(
  db: Db,
  compteId: number,
  universId: number,
  systemeId: number,
  nomSysteme: string,
): Outil[] {
  const acteur: Acteur = { compteId };
  /** The space, or « introuvable »: the right now, and the system still the universe's own. */
  const espace = (): number => {
    const droit = lectureSysteme(db, compteId, systemeId);
    if (!droit || systemeRattache(db, universId)?.id !== systemeId) throw new ErreurService('introuvable', INTROUVABLE);
    return droit.espaceId;
  };
  const resoudre = (esp: number, ref: string | number): number => {
    const r = resoudreFiche(db, esp, String(ref));
    if (r === null) throw new ErreurService('introuvable', INTROUVABLE);
    return r.id;
  };
  const cleDe = (esp: number, ficheId: number): string => cleDeFicheLue(db, compteId, esp, ficheId) ?? String(ficheId);

  const construire = <S extends z.ZodObject>(
    nom: string,
    description: string,
    schema: S,
    run: (args: z.infer<S>) => unknown,
  ): Outil => ({
    nom,
    description,
    schema,
    portes: ['assistant', 'mcp'],
    executer(args) {
      const p = schema.safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      try {
        return { ok: true, donnees: run(p.data) };
      } catch (e) {
        return refus(e);
      }
    },
  });

  return [
    construire(
      'systeme_chercher',
      `Cherche des éléments du système « ${nomSysteme} » (règles, créatures, objets…) par un ou plusieurs mots. Sans \`type\`, cherche dans tous les types. Rend au plus ${LIMITE} éléments triés par titre, chacun avec son premier passage correspondant, et un \`curseur\` pour la page suivante (\`null\` à la dernière).`,
      z.strictObject({ mots: z.string(), type: z.enum(TYPES_FICHE).optional(), curseur: z.string().min(1).optional() }),
      ({ mots, type, curseur }) => {
        const esp = espace();
        const page = listerFiches(db, acteur, esp, { type, recherche: mots, limite: LIMITE, curseur, extraits: true });
        if (page.fiches.length === 0) throw new ErreurService('introuvable', INTROUVABLE); // no result, no event
        return {
          fiches: page.fiches.map((f) => {
            const p = f.passages?.[0];
            return {
              id: f.id, fiche: cleDe(esp, f.id), type: f.type, titre: f.titre,
              ...(p ? { passage: { section: p.section, titre: p.titre, extrait: p.extrait } } : {}),
            };
          }),
          curseur: page.suivant,
        };
      },
    ),
    construire(
      'systeme_lire_fiche',
      `Lit un élément du système « ${nomSysteme} », cité par \`fiche\` (clé ou id dans le système) : ses sections lisibles par la personne, avec leur contenu, leur \`version\` et leur \`empreinte\`, et l'empreinte de l'élément et de son en-tête.`,
      z.strictObject({ fiche: refFiche }),
      ({ fiche }) => {
        const esp = espace();
        const ficheId = resoudre(esp, fiche);
        const f = lireFiche(db, acteur, esp, ficheId, 'markdown');
        const api = lireFicheApi(db, acteur, esp, String(ficheId));
        const empreintes = new Map(api.sections.map((s) => [s.id, s.empreinte]));
        return {
          id: f.id,
          fiche: cleDe(esp, f.id),
          type: f.type,
          titre: f.titre,
          empreinte: api.empreinte,
          empreinteEnTete: api.empreinteEntete,
          sections: f.sections.map((s) => ({
            id: s.id,
            titre: s.titre,
            contenu: s.contenu ?? s.html, // source only for who may write it, else the reader's rendered view (AD-113)
            version: s.version,
            modifiable: s.peutEcrire,
            empreinte: empreintes.get(s.id) ?? null,
          })),
        };
      },
    ),
    construire(
      'systeme_lire_section',
      `Lit une section d'un élément du système « ${nomSysteme} » (\`fiche\` : clé ou id dans le système) : son contenu, sa \`version\` et son \`empreinte\`.`,
      z.strictObject({ fiche: refFiche, sectionId: id }),
      ({ fiche, sectionId }) => {
        const esp = espace();
        const ficheId = resoudre(esp, fiche);
        const s = lireSection(db, acteur, esp, ficheId, sectionId, 'markdown');
        const api = lireFicheApi(db, acteur, esp, String(ficheId));
        return {
          id: s.id,
          titre: s.titre,
          contenu: s.contenu ?? s.html,
          version: s.version,
          modifiable: s.peutEcrire,
          empreinte: api.sections.find((x) => x.id === s.id)?.empreinte ?? null,
        };
      },
    ),
  ];
}

/** The five writers of the system (AD-mcp-sj-2), for a GM of the system; `via` is the door that creates a sheet. */
export const OUTILS_ECRITURE_SYSTEME = [
  'systeme_creer_fiche', 'systeme_modifier_entete', 'systeme_ecrire_section', 'systeme_supprimer_section',
  'systeme_supprimer_fiche',
] as const;

/**
 * The writers of the universe's system. Like the readers, the right (GM of the system) and the attachment are read
 * again at each call; every write goes through the services of the system's space under the fingerprint (AD-140).
 * The origin (`mcp` with the token, `assistant`) is set around the call by the door, never here (AD-147).
 */
export function outilsEcritureSysteme(
  db: Db,
  compteId: number,
  universId: number,
  systemeId: number,
  nomSysteme: string,
  via: 'assistant' | 'mcp',
): Outil[] {
  const acteur: Acteur = { compteId };
  const espace = (): number => {
    const droit = lectureSysteme(db, compteId, systemeId);
    if (!droit || !estMJDuSysteme(db, compteId, systemeId) || systemeRattache(db, universId)?.id !== systemeId) {
      throw introuvable();
    }
    return droit.espaceId;
  };
  const resoudre = (esp: number, ref: string | number): number => {
    const r = resoudreFiche(db, esp, String(ref));
    if (r === null) throw introuvable();
    return r.id;
  };
  const cleDe = (esp: number, ficheId: number): string => cleDeFicheLue(db, compteId, esp, ficheId) ?? String(ficheId);
  const fiche = (esp: number, ficheId: number) => lireFicheApi(db, acteur, esp, String(ficheId));
  const empreinteSection = (esp: number, ficheId: number, sectionId: number): string => {
    const s = fiche(esp, ficheId).sections.find((x) => x.id === sectionId);
    if (!s) throw introuvable();
    return s.empreinte;
  };
  const pasDeLot = (cle: string, objet: string) => ({ lotId: null, nature: 'fiches' as const, cle, objet });
  const ecr = <S extends z.ZodObject>(
    nom: string,
    description: string,
    schema: S,
    perimee: string,
    run: (args: z.infer<S>) => { donnees: unknown; evenement?: Evenement },
  ): Outil => ecrireOutil(nom, description, schema, perimee, run, ['assistant', 'mcp']);

  return [
    ecr(
      'systeme_creer_fiche',
      `Crée un élément du système « ${nomSysteme} » d'un type activé dans ce système (hors compte-rendu), avec un titre et un sous-type facultatif. Rend la \`fiche\` (sa clé) et ses empreintes. Réservé au MJ du système.`,
      z.strictObject({
        type: z.enum(TYPES_FICHE.filter((t) => t !== 'compte_rendu')),
        titre: z.string(),
        sousType: z.string().optional(),
      }),
      PERIMEE_ENTETE,
      ({ type, titre, sousType }) => {
        const esp = espace();
        const creee = db.transaction(() => creerFiche(db, compteId, esp, {
          type, titre, sousType, charge: type === 'personnage' ? { pj: false } : undefined, via,
        }))();
        const f = fiche(esp, creee.id);
        return {
          donnees: {
            id: creee.id, fiche: cleDe(esp, creee.id), type: creee.type, titre: creee.titre,
            empreinte: f.empreinte, empreinteEnTete: f.empreinteEntete,
          },
          evenement: evenement('fiche_creee', `Élément « ${creee.titre} » créé`, creee.id),
        };
      },
    ),
    ecr(
      'systeme_modifier_entete',
      `Modifie l'en-tête d'un élément du système « ${nomSysteme} » (\`fiche\` : clé ou id dans le système) : seuls les champs envoyés changent (\`titre\`, \`sousType\`, \`alias\` et \`etiquettes\` remplacent toute la liste). \`empreinte\` est celle de l'en-tête (\`empreinteEnTete\` de \`systeme_lire_fiche\`) : si l'en-tête a changé depuis, rien n'est écrit (\`section_modifiee\`, relisez). Réservé au MJ du système.`,
      z.strictObject({
        fiche: refFiche,
        empreinte,
        titre: z.string().optional(),
        sousType: z.string().nullable().optional(),
        alias: z.array(z.string()).optional(),
        etiquettes: z.array(z.string()).optional(),
      }),
      PERIMEE_ENTETE,
      ({ fiche: ref, empreinte: lue, ...champs }) => {
        const esp = espace();
        const ficheId = resoudre(esp, ref);
        const valides = validerEnTete(champs, new Date());
        const r = sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(ref), 'fiche'),
          () => fiche(esp, ficheId).empreinteEntete,
          () => ecrire(db, compteId, () => {
            const ecrit = ecrireEnTete(db, { compteId, universId: esp }, ficheId, valides);
            const f = fiche(esp, ficheId);
            return { ecrit, titre: f.entete.titre, empreinteEnTete: f.empreinteEntete, empreinte: f.empreinte };
          }),
        );
        return {
          donnees: {
            id: ficheId, fiche: cleDe(esp, ficheId), inchangee: !r.ecrit,
            empreinteEnTete: r.empreinteEnTete, empreinte: r.empreinte,
          },
          ...(r.ecrit ? { evenement: evenement('fiche_modifiee', `Élément « ${r.titre} » modifié`, ficheId) } : {}),
        };
      },
    ),
    ecr(
      'systeme_ecrire_section',
      `Remplace tout le contenu d'une section d'un élément du système « ${nomSysteme} » (\`fiche\`, \`sectionId\`). \`empreinte\` est celle de la section, lue par \`systeme_lire_fiche\` ou \`systeme_lire_section\` : si la section a changé depuis, rien n'est écrit (\`section_modifiee\`, relisez). Réservé au MJ du système.`,
      z.strictObject({ fiche: refFiche, sectionId: id, empreinte, contenu: z.string() }),
      PERIMEE_SECTION,
      ({ fiche: ref, sectionId, empreinte: lue, contenu }) => {
        const esp = espace();
        const ficheId = resoudre(esp, ref);
        const s = sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(ref), 'section'),
          () => empreinteSection(esp, ficheId, sectionId),
          () => {
            const version = lireSection(db, acteur, esp, ficheId, sectionId).version;
            return ecrireContenu(db, compteId, esp, ficheId, sectionId, contenu, version);
          },
        );
        return {
          donnees: {
            id: s.id, titre: s.titre, version: s.version,
            empreinte: empreinteSection(esp, ficheId, s.id), empreinteFiche: fiche(esp, ficheId).empreinte,
          },
          evenement: evenement('section_modifiee', `Section « ${s.titre} » modifiée`, ficheId, { sectionId }),
        };
      },
    ),
    ecr(
      'systeme_supprimer_section',
      `Supprime une section d'un élément du système « ${nomSysteme} » (\`fiche\`, \`sectionId\`) ; l'élément reste. \`empreinte\` est celle de la section lue : périmée, rien n'est supprimé (\`section_modifiee\`, relisez). Réservé au MJ du système.`,
      z.strictObject({ fiche: refFiche, sectionId: id, empreinte }),
      PERIMEE_SECTION,
      ({ fiche: ref, sectionId, empreinte: lue }) => {
        const esp = espace();
        const ficheId = resoudre(esp, ref);
        const titre = lireSection(db, acteur, esp, ficheId, sectionId).titre;
        sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(ref), 'section'),
          () => empreinteSection(esp, ficheId, sectionId),
          () => {
            const s = lireSection(db, acteur, esp, ficheId, sectionId);
            if (s.geree) throw new ErreurService('refuse', 'Cette section est gérée par un outil.', 'section_geree');
            retirerSection(db, compteId, esp, ficheId, sectionId);
          },
        );
        return {
          donnees: { id: sectionId, supprimee: true, empreinteFiche: fiche(esp, ficheId).empreinte },
          evenement: evenement('section_supprimee', `Section « ${titre} » supprimée`, ficheId),
        };
      },
    ),
    ecr(
      'systeme_supprimer_fiche',
      `Supprime un élément du système « ${nomSysteme} » (\`fiche\`) avec ses sections ; les univers qui l'avaient personnalisé en gardent leur copie, devenue une fiche ordinaire. \`empreinte\` est celle de l'élément lu (\`empreinte\` de \`systeme_lire_fiche\`) : périmée, rien n'est supprimé (\`section_modifiee\`, relisez). Réservé au MJ du système.`,
      z.strictObject({ fiche: refFiche, empreinte }),
      PERIMEE_SECTION,
      ({ fiche: ref, empreinte: lue }) => {
        const esp = espace();
        const ficheId = resoudre(esp, ref);
        const titre = lireFiche(db, acteur, esp, ficheId).titre;
        sousPrecondition(
          db, { siEmpreinte: lue }, pasDeLot(String(ref), 'fiche'),
          () => fiche(esp, ficheId).empreinte,
          () => supprimerFiche(db, acteur, esp, ficheId),
        );
        return {
          donnees: { id: ficheId, supprimee: true },
          evenement: { type: 'fiche_supprimee', libelle: `Élément « ${titre} » supprimé`, cible: { type: 'systeme', systemeId } },
        };
      },
    ),
  ];
}

/**
 * `personnaliser_fiche` and `revenir_au_systeme` (AD-mcp-sj-2): for a GM of the universe, with no right on the system —
 * they compose `services/surcharge.ts`, which reads the original at player level through the universe (AD-155).
 */
export function outilsPersonnalisation(db: Db, compteId: number, universId: number, nomSysteme: string): Outil[] {
  const acteur: Acteur = { compteId };
  const cleDe = (ficheId: number): string => cleDeFicheLue(db, compteId, universId, ficheId) ?? String(ficheId);
  const resoudre = (ref: string | number): number => {
    const r = resoudreFiche(db, universId, String(ref), compteId);
    if (r === null) throw introuvable();
    return r.id;
  };
  const ecr = <S extends z.ZodObject>(
    nom: string,
    description: string,
    schema: S,
    run: (args: z.infer<S>) => { donnees: unknown; evenement?: Evenement },
  ): Outil => ecrireOutil(nom, description, schema, PERIMEE_ENTETE, run, ['assistant', 'mcp']);
  return [
    ecr(
      'personnaliser_fiche',
      `Personnalise pour cet univers un élément du système « ${nomSysteme} » (\`fiche\` : l'élément ou sa copie, clé ou id) : crée la copie de l'univers, ou rend celle qui existe. Rend la clé de la copie et ses empreintes. Réservé au MJ de l'univers.`,
      z.strictObject({ fiche: refFiche }),
      ({ fiche: ref }) => {
        const r = personnaliser(db, acteur, universId, resoudre(ref));
        const copie = r.fiche.id;
        const api = lireFicheApi(db, acteur, universId, String(copie));
        return {
          donnees: {
            id: copie, fiche: cleDe(copie), type: r.fiche.type, titre: r.fiche.titre, creee: r.creee,
            empreinte: api.empreinte, empreinteEnTete: api.empreinteEntete,
          },
          evenement: evenement(
            'fiche_modifiee', `Élément « ${r.fiche.titre} » personnalisé`, copie,
          ),
        };
      },
    ),
    ecr(
      'revenir_au_systeme',
      `Revient à l'élément d'origine du système « ${nomSysteme} » (\`fiche\` : l'élément ou sa copie) : la copie de cet univers est supprimée. Rend la clé de l'original. Réservé au MJ de l'univers.`,
      z.strictObject({ fiche: refFiche }),
      ({ fiche: ref }) => {
        const vue = lireFiche(db, acteur, universId, resoudre(ref));
        const originalId = vue.surchargeDe ?? vue.id;
        revenir(db, acteur, universId, vue.id);
        return {
          donnees: { id: originalId, fiche: cleDe(originalId), revenue: true },
          evenement: evenement('fiche_modifiee', `Élément « ${vue.titre} » revenu au système`, originalId),
        };
      },
    ),
  ];
}
