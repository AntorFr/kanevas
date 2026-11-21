import { z } from 'zod';

import { estMasque } from '../../services/swn/lisibilite.js';
import { ErreurService } from '../../services/erreurs.js';
import { cartesGalaxies, galaxieLisible } from '../../services/swn/galaxies.js';
import { systemesLisibles } from '../../services/swn/galaxies.js';
import { lireInterieur, type InterieurVue } from '../../services/swn/interieur.js';
import { orbiteHeureVersPlan } from '../../wasm/coeur.js';
import { calculerTrajet } from '../../services/swn/trajet.js';
import type { Db } from '../../db/db.js';
import type { Acteur } from '../../services/types.js';
import type { Outil, Resultat } from '../../services/assistant/types.js';
import type { ContexteOutil } from '../declaration.js';

const INTROUVABLE: Resultat = { ok: false, erreur: 'Introuvable.' };
const plier = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** The galaxy a tool names (or the only one the actor reads): its id, `null` when none, or the message of G-9. */
function galaxieChoisie(db: Db, acteur: Acteur, universId: number, galaxie: string | undefined): number | null | Resultat {
  const lisibles = cartesGalaxies(db, acteur, universId);
  if (galaxie !== undefined) {
    const trouvees = lisibles.filter((g) => plier(g.titre) === plier(galaxie));
    if (trouvees.length > 1) return { ok: false, erreur: 'Précisez la galaxie.' };
    return trouvees[0]?.id ?? null;
  }
  if (lisibles.length > 1) return { ok: false, erreur: 'Précisez la galaxie.' };
  return lisibles[0]?.id ?? null;
}

const schema = z.strictObject({
  galaxie: z.string().optional(),
  depart: z.string(),
  arrivee: z.string(),
  moteur: z.number().int().min(1).max(6).optional(),
  routes: z.enum(['toutes', 'publiques']).optional(),
});

/** `swn_galaxie_trajet` (G-9): names in, the object of the journey route out; never an event. */
export function outilTrajet({ db, acteur, universId }: ContexteOutil): Outil[] {
  return [{
    nom: 'swn_galaxie_trajet',
    description: "Calcule le trajet le plus court entre deux systèmes d'une galaxie, par leurs noms. `moteur` de 1 à 6 (2 par défaut), `routes` : `toutes` ou `publiques`. `galaxie` est facultative si une seule galaxie est lisible.",
    schema,
    executer(args): Resultat {
      const p = schema.safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      const { galaxie, depart, arrivee, moteur, routes } = p.data;
      try {
        const choisie = galaxieChoisie(db, acteur, universId, galaxie);
        if (choisie !== null && typeof choisie === 'object') return choisie;
        if (!choisie) return INTROUVABLE;
        const { galaxie: g, niveau } = galaxieLisible(db, acteur, universId, choisie);
        const systemes = systemesLisibles(db, g.id, niveau);
        const cleDe = (nom: string): string | Resultat => {
          const m = systemes.filter((s) => plier(s.nom) === plier(nom));
          if (m.length === 0) return INTROUVABLE;
          if (m.length > 1) return { ok: false, erreur: 'Plusieurs systèmes portent ce nom.' };
          return m[0]!.cle;
        };
        const d = cleDe(depart);
        if (typeof d !== 'string') return d;
        const a = cleDe(arrivee);
        if (typeof a !== 'string') return a;
        return { ok: true, donnees: calculerTrajet(db, acteur, universId, g.id, { depart: d, arrivee: a, moteur, routes }) };
      } catch (e) {
        if (!(e instanceof ErreurService)) throw e;
        return e.code === 'introuvable' ? INTROUVABLE : { ok: false, erreur: e.message };
      }
    },
  }];
}

/** Every assistant tool of the `swn/galaxie` tool (AD-outils-1). */
export function outilsAssistant(ctx: ContexteOutil): Outil[] {
  return [...outilTrajet(ctx), ...outilLireSysteme(ctx)];
}

const schemaLecture = z.strictObject({
  galaxie: z.string().optional(),
  q: z.number().int(),
  r: z.number().int(),
});

/** The place of a body or element in the plane of the system, computed by the core (AD-143); none without an orbit (the star). */
async function plan(orbite: number | null, heure: number): Promise<{ x: number; y: number } | null> {
  if (orbite === null) return null;
  const [x, y] = await orbiteHeureVersPlan(orbite, heure);
  return { x, y };
}

/** The interior of a system as data (AD-outils-2): no image, no row id, the GM's marks for the GM only. */
async function systemeEnDonnees(vue: InterieurVue, masque: boolean, mj: boolean): Promise<Record<string, unknown>> {
  const coord = async (orbite: number | null, heure: number) => ({ orbite, heure, plan: await plan(orbite, heure) });
  const corps = [];
  for (const a of vue.astres) {
    corps.push({
      cle: a.cle, genre: a.genre, type: a.type, nom: a.nom, parent: a.parent_cle, rang_etoile: a.etoile_rang,
      aspect: a.aspect, lien: a.fiche, version: a.version,
      systeme: { q: vue.q, r: vue.r }, interieur: await coord(a.orbite, a.heure),
    });
  }
  const formations = vue.formations.map((f) => ({
    cle: f.cle, forme: f.forme, nom: f.nom, parametres: f.parametres, rang_etoile: f.etoile_rang, lien: f.fiche, version: f.version,
    systeme: { q: vue.q, r: vue.r },
  }));
  const elements = [];
  for (const e of vue.elements) {
    elements.push({
      cle: e.cle, genre: e.genre, nom: e.nom, sur: e.sur, aspect: e.aspect, lien: e.fiche, version: e.version,
      systeme: { q: vue.q, r: vue.r }, interieur: await coord(e.orbite, e.heure),
      ...(mj ? { secret: e.reserve === true } : {}),
    });
  }
  return {
    q: vue.q, r: vue.r, nom: vue.nom, etat: vue.etat, transition: vue.transition,
    version_generateur: vue.version_generateur, version_systeme: vue.versionSysteme,
    ...(mj ? { masque } : {}),
    corps, formations, elements,
  };
}

/** `swn_lire_systeme` (B-94): names and coordinates in, data out; `lireInterieur` is the only read. */
export function outilLireSysteme({ db, acteur, universId, role }: ContexteOutil): Outil[] {
  return [{
    nom: 'swn_lire_systeme',
    description: "Lit le système d'une galaxie à l'hexagone (`q`, `r`) : corps, formations et éléments avec leurs coordonnées (hexagone, orbite et heure), leurs versions et leurs liens. `galaxie` est facultative si une seule galaxie est lisible.",
    schema: schemaLecture,
    async executer(args): Promise<Resultat> {
      const p = schemaLecture.safeParse(args ?? {});
      if (!p.success) return { ok: false, erreur: 'Paramètres invalides.' };
      const { galaxie, q, r } = p.data;
      try {
        const id = galaxieChoisie(db, acteur, universId, galaxie);
        if (id !== null && typeof id === 'object') return id;
        if (id === null) return INTROUVABLE;
        const vue = lireInterieur(db, acteur, universId, id, q, r);
        const mj = role === 'mj';
        const { niveau } = galaxieLisible(db, acteur, universId, id);
        const masque = systemesLisibles(db, id, niveau).some((s) => s.q === q && s.r === r && estMasque(s));
        return { ok: true, donnees: await systemeEnDonnees(vue, masque, mj) };
      } catch (e) {
        if (!(e instanceof ErreurService)) throw e;
        return e.code === 'introuvable' ? INTROUVABLE : { ok: false, erreur: e.message };
      }
    },
  }];
}
