import { z } from 'zod';

import { ErreurService } from '../../services/erreurs.js';
import {
  ajouterAstre, ajouterZone, ancrer, delierAstre, lierAstre, modifierAstre, modifierZone, type ResultatEcriture,
} from '../../services/swn/ecriture-systeme.js';
import type { Evenement, Outil, Resultat } from '../../services/assistant/types.js';
import type { ContexteOutil } from '../declaration.js';
import { donneesDuSysteme, galaxieChoisie, INTROUVABLE } from './assistant.js';

// The write tools of the `swn/galaxie` tool (AD-outils-1, AD-outils-2, AD-outils-4): they compose the writers of
// `services/swn/` and nothing else — no SQL, no table name. Given to a GM only (the caller of this file checks the role).

/** A service refusal as the interface says it, its code kept for the agent; never an event. */
function refus(e: ErreurService): Resultat {
  if (e.code === 'introuvable' && !e.detail) return INTROUVABLE;
  const erreur = e.detail === 'orbite_invalide' ? 'Orbite ou heure hors bornes.' : e.message;
  return { ok: false, erreur, ...(e.detail ? { code: e.detail } : {}), ...(e.champ ? { champ: e.champ } : {}) };
}

const POSITION = {
  galaxie: z.string().optional(),
  q: z.number().int(),
  r: z.number().int(),
  version_systeme: z.number().int().optional(),
};
const VERSION_LUE = z.number().int();

type Geste = (galaxieId: number, args: Record<string, unknown>) => ResultatEcriture & { libelle: string };

/** The frame of the five tools: validate, pick the galaxy, run the gesture, answer the system and the event. */
function outil(ctx: ContexteOutil, nom: string, description: string, forme: z.ZodRawShape, geste: Geste): Outil {
  const schema = z.strictObject({ ...POSITION, ...forme });
  return {
    nom, description, schema,
    async executer(args): Promise<Resultat> {
      const p = schema.safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      const { db, acteur, universId } = ctx;
      try {
        const id = galaxieChoisie(db, acteur, universId, p.data.galaxie);
        if (id !== null && typeof id === 'object') return id;
        if (id === null) return INTROUVABLE;
        const r = geste(id, p.data as Record<string, unknown>);
        const evenement: Evenement = {
          type: 'systeme_modifie', libelle: r.libelle,
          cible: { type: 'systeme', galaxieId: id, q: r.interieur.q, r: r.interieur.r },
        };
        return { ok: true, donnees: await donneesDuSysteme(db, acteur, universId, id, r.interieur, true), evenement };
      } catch (e) {
        if (!(e instanceof ErreurService)) throw e;
        return refus(e);
      }
    },
  };
}

const nomDuSysteme = (r: ResultatEcriture): string => r.interieur.nom ?? `Système (${r.interieur.q}, ${r.interieur.r})`;
const jeton = (a: Record<string, unknown>) => ({ versionSysteme: a.version_systeme });

/** The tools that write a system; present for a GM alone. */
export function outilsEcriture(ctx: ContexteOutil): Outil[] {
  const { db, acteur, universId } = ctx;
  const ecrire = <T>(f: () => T): T => db.transaction(f)();

  const placer = outil(ctx, 'swn_placer_astre',
    "Place un corps (planète, lune ou comète) dans un système, à l'orbite (0 à 1 000) et à l'heure (0 incluse à 12 exclue). Une lune donne `parent`, la `cle` de sa planète. Sur un système tiré, `version_systeme` (lue avec le système) est obligatoire et le système est ancré.",
    {
      genre: z.enum(['planete', 'lune', 'comete']), orbite: z.number(), heure: z.number(),
      nom: z.string().nullable().optional(), description: z.string().nullable().optional(), type: z.string().optional(),
      taille: z.number().optional(), aspect: z.record(z.string(), z.unknown()).optional(),
      parent: z.string().optional(), etoile_rang: z.number().int().optional(),
    },
    (id, a) => {
      const r = ajouterAstre(db, acteur, universId, id, a.q as number, a.r as number, {
        ...jeton(a), genre: a.genre, orbite: a.orbite, heure: a.heure, nom: a.nom, description: a.description, type: a.type,
        taille: a.taille, aspect: a.aspect, parent_cle: a.parent, etoile_rang: a.etoile_rang,
      });
      return { ...r, libelle: `Corps placé dans « ${nomDuSysteme(r)} »` };
    });

  const deplacer = outil(ctx, 'swn_deplacer_astre',
    "Déplace un corps (sa `cle`) à une autre orbite et/ou heure. `version_lue` : la version du corps lue (1 pour un corps tiré). Sur un système tiré, `version_systeme` est obligatoire et le système est ancré.",
    { cle: z.string(), version_lue: VERSION_LUE, orbite: z.number().optional(), heure: z.number().optional() },
    (id, a) => {
      const r = modifierAstre(db, acteur, universId, id, a.q as number, a.r as number, a.cle as string,
        { ...jeton(a), version: a.version_lue, orbite: a.orbite, heure: a.heure });
      return { ...r, libelle: `Corps déplacé dans « ${nomDuSysteme(r)} »` };
    });

  const completer = outil(ctx, 'swn_completer_astre',
    "Complète un corps (sa `cle`) : nom, description, type, taille, aspect, et `lien` (l'id d'une fiche, ou null pour retirer le lien). `version_lue` : la version du corps lue (1 pour un corps tiré). Sur un système tiré, `version_systeme` est obligatoire et le système est ancré.",
    {
      cle: z.string(), version_lue: VERSION_LUE,
      nom: z.string().nullable().optional(), description: z.string().nullable().optional(), type: z.string().optional(),
      taille: z.number().optional(), aspect: z.record(z.string(), z.unknown()).optional(),
      lien: z.number().int().nullable().optional(),
    },
    (id, a) => ecrire(() => {
      const modif = { nom: a.nom, description: a.description, type: a.type, taille: a.taille, aspect: a.aspect };
      const champs = Object.values(modif).some((v) => v !== undefined);
      if (!champs && a.lien === undefined) throw new ErreurService('invalide', 'Rien à modifier.', undefined, 'nom');
      const q = a.q as number, r = a.r as number, cle = a.cle as string;
      let version = a.version_lue as number;
      let res: ResultatEcriture | undefined;
      if (champs) {
        res = modifierAstre(db, acteur, universId, id, q, r, cle, { ...jeton(a), version, ...modif });
        version += 1;
      }
      // The system is anchored by now when it was drawn: the second call needs no token.
      if (a.lien !== undefined) {
        res = a.lien === null
          ? delierAstre(db, acteur, universId, id, q, r, cle, { ...jeton(a), version })
          : lierAstre(db, acteur, universId, id, q, r, cle, { ...jeton(a), version, ficheId: a.lien });
      }
      return { ...res!, libelle: `Corps complété dans « ${nomDuSysteme(res!)} »` };
    }));

  const tracer = outil(ctx, 'swn_tracer_formation',
    "Trace une formation (anneau ou nuage) dans un système ; avec `cle` et `version_lue`, remplace celle qui existe. `parametres` : l'objet de la forme. Sur un système tiré, `version_systeme` est obligatoire et le système est ancré.",
    {
      forme: z.enum(['anneau', 'nuage']).optional(), nom: z.string().nullable().optional(), description: z.string().nullable().optional(),
      parametres: z.record(z.string(), z.unknown()).optional(), etoile_rang: z.number().int().optional(),
      cle: z.string().optional(), version_lue: VERSION_LUE.optional(),
    },
    (id, a) => {
      const q = a.q as number, r = a.r as number;
      if ((a.cle === undefined) !== (a.version_lue === undefined)) {
        throw new ErreurService('invalide', 'Pour remplacer une formation, donnez sa clé et la version lue.', undefined, 'cle');
      }
      const corps = { ...jeton(a), forme: a.forme, nom: a.nom, description: a.description, parametres: a.parametres };
      if (a.cle === undefined) {
        const res = ajouterZone(db, acteur, universId, id, q, r, { ...corps, etoile_rang: a.etoile_rang });
        return { ...res, libelle: `Formation tracée dans « ${nomDuSysteme(res)} »` };
      }
      const res = modifierZone(db, acteur, universId, id, q, r, a.cle as string, { ...corps, version: a.version_lue, etoile_rang: a.etoile_rang });
      return { ...res, libelle: `Formation remplacée dans « ${nomDuSysteme(res)} »` };
    });

  const ancrerOutil = outil(ctx, 'swn_ancrer_systeme',
    "Ancre un système tiré : ses corps et formations deviennent des lignes, le tirage des voisins ne bouge pas. `version_systeme` (lue avec le système) est obligatoire ; `nom` facultatif.",
    { nom: z.string().optional() },
    (id, a) => {
      const res = ancrer(db, acteur, universId, id, a.q as number, a.r as number, { ...jeton(a), nom: a.nom });
      return { ...res, libelle: `Système « ${nomDuSysteme(res)} » ancré` };
    });

  return [placer, deplacer, completer, tracer, ancrerOutil];
}
