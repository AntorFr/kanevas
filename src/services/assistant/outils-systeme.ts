import { z } from 'zod';
import type { Db } from '../../db/db.js';
import { lectureSysteme } from '../droits.js';
import { ErreurService } from '../erreurs.js';
import { cleDeFicheLue, resoudreFiche } from '../cles.js';
import { lireFiche, listerFiches } from '../fiches.js';
import { lireFicheApi } from '../lecture-api.js';
import { lireSection } from '../sections.js';
import { systemeRattache } from '../systemes.js';
import { TYPES_FICHE } from '../types-fiche.js';
import type { Acteur } from '../types.js';
import type { Outil, Resultat } from './types.js';

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

const id = z.number().int().positive();
const refFiche = z.union([z.string().min(1), id]);

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
