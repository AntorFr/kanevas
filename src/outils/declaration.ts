import { z } from 'zod';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Db } from '../db/db.js';
import type { Acteur, Role } from '../services/types.js';
import type { Outil } from '../services/assistant/types.js';

export type ValeurReglage = boolean | number | string;
export type Forme =
  | { type: 'booleen' }
  | { type: 'nombre'; min: number; max: number; entier?: boolean }
  | { type: 'texte'; max: number }
  | { type: 'choix'; valeurs: string[] };
export interface Reglage {
  libelle: string;
  aide?: string;
  niveau: 'systeme+univers' | 'univers';
  forme: Forme;
  defaut: ValeurReglage;
  protege?: boolean;
}
export type Reglages = Record<string, Reglage>;
export interface ContexteOutil {
  db: Db;
  acteur: Acteur;
  universId: number;
  role: Role;
}
interface BaseOutil {
  cle: string;
  libelle: string;
  description: string;
  portee: 'tous' | { noms: string[] };
  dependances: string[];
  visibiliteParDefaut: { mj: boolean; joueur: boolean };
  usages: { nom: string; mjSeul: boolean }[];
  reglages: Reglages;
  outilsAssistant?(ctx: ContexteOutil): Outil[];
  ecran: { libelle: string; icone: string };
}
export interface CarteOutil { titre: string; visible: boolean }
/** Maps recompute on read after a setting changes (AD-128). */
export interface DeclarationCarte extends BaseOutil {
  type: 'carte';
  cartes(db: Db, acteur: Acteur, universId: number): CarteOutil[];
}
export interface ContexteSection {
  db: Db;
  acteur: Acteur;
  universId: number;
  ficheId: number;
  sectionId: number | null;
}
/** A section a generator writes and locks (AD-122, AD-127): the section holds the text version only. */
export interface SectionGeree {
  /** Third part of `gere_par` (`module/outil/type`). */
  type: string;
  libelle: string;
  /** The declared usage (AD-126) the writer needs, e.g. `concevoir`. */
  usage: string;
  recalcul: 'geste' | 'proposition';
  /** The module ships a display component for this type (the browser then loads it, S-7). */
  composant?: boolean;
  /** The current version of the sources (catalogue, settings): cheap, read-only. */
  versionSource(ctx: ContexteSection): string;
  /** The text version and the source version it was made with; reads what the actor may read, never writes. */
  produire(ctx: ContexteSection): { contenu: string; sourceVersion: string };
}
/** Generators record settings versions to mark designs stale (AD-128). */
export interface DeclarationGenerateur extends BaseOutil { type: 'generateur'; sections?: SectionGeree[] }
/** A play aid reads its settings live (AD-128); its screen is its entry point. */
export interface DeclarationAide extends BaseOutil { type: 'aide' }
export type DeclarationOutil = DeclarationCarte | DeclarationGenerateur | DeclarationAide;
export interface DeclarationModule {
  nom: string;
  libelle: string;
  reglagesCommuns: Reglages;
  outils: DeclarationOutil[];
  routes?(app: FastifyInstance, garde: (cle: string) => preHandlerHookHandler): void | Promise<void>;
}

export function schemaValeur(forme: Forme): z.ZodType<ValeurReglage> {
  switch (forme.type) {
    case 'booleen': return z.boolean();
    case 'nombre': {
      const nombre = z.number().min(forme.min).max(forme.max);
      return forme.entier ? nombre.int() : nombre;
    }
    case 'texte': return z.string().max(forme.max);
    case 'choix': return z.enum(forme.valeurs);
  }
}
const forme = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('booleen') }),
  z.strictObject({ type: z.literal('nombre'), min: z.number(), max: z.number(), entier: z.boolean().optional() })
    .refine((f) => f.min <= f.max),
  z.strictObject({ type: z.literal('texte'), max: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal('choix'), valeurs: z.array(z.string()).min(1) }),
]);
const reglages = z.record(z.string().min(1), z.strictObject({
  libelle: z.string().min(1), aide: z.string().optional(),
  niveau: z.enum(['systeme+univers', 'univers']), forme,
  defaut: z.union([z.boolean(), z.number(), z.string()]), protege: z.boolean().optional(),
}));
const fonction = z.custom<(...args: never[]) => unknown>((v) => typeof v === 'function');
const declaration = z.strictObject({
  nom: z.string().regex(/^[a-z][a-z0-9-]*$/), libelle: z.string().min(1), reglagesCommuns: reglages,
  outils: z.array(z.strictObject({
    cle: z.string(), libelle: z.string().min(1), description: z.string(),
    type: z.enum(['carte', 'generateur', 'aide']),
    portee: z.union([z.literal('tous'), z.strictObject({ noms: z.array(z.string().trim().min(1)).min(1) })]),
    dependances: z.array(z.string()),
    visibiliteParDefaut: z.strictObject({ mj: z.boolean(), joueur: z.boolean() }),
    usages: z.array(z.strictObject({ nom: z.string().min(1), mjSeul: z.boolean() })),
    reglages, outilsAssistant: fonction.optional(), cartes: fonction.optional(),
    sections: z.array(z.strictObject({
      type: z.string().regex(/^[a-z][a-z0-9-]*$/), libelle: z.string().min(1), usage: z.string().min(1),
      recalcul: z.enum(['geste', 'proposition']), composant: z.boolean().optional(), versionSource: fonction, produire: fonction,
    })).optional(),
    ecran: z.strictObject({ libelle: z.string().min(1), icone: z.string().min(1) }),
  })), routes: fonction.optional(),
});

/** Developer errors abort registration, before a module can serve anything. */
export function verifierDeclaration(module: DeclarationModule): void {
  declaration.parse(module);
  const outils = new Map<string, DeclarationOutil>();
  const verifierReglages = (r: Reglages) => {
    for (const [nom, reglage] of Object.entries(r)) {
      if (!schemaValeur(reglage.forme).safeParse(reglage.defaut).success) {
        throw new Error(`Invalid default for ${module.nom}/${nom}.`);
      }
    }
  };
  verifierReglages(module.reglagesCommuns);
  for (const outil of module.outils) {
    if (!new RegExp(`^${module.nom}/[a-z][a-z0-9-]*$`).test(outil.cle) || outils.has(outil.cle)) {
      throw new Error(`Invalid or duplicate tool key: ${outil.cle}.`);
    }
    if (outil.type === 'carte' && typeof outil.cartes !== 'function') throw new Error('A map needs its map reader.');
    if (outil.type === 'generateur' && !outil.usages.some((u) => u.nom === 'concevoir')) {
      throw new Error('A generator needs the concevoir usage.');
    }
    const sections = (outil as { sections?: SectionGeree[] }).sections;
    if (sections !== undefined) {
      if (outil.type !== 'generateur') throw new Error('Only a generator declares sections.');
      if (new Set(sections.map((s) => s.type)).size !== sections.length) {
        throw new Error(`Duplicate section type in ${outil.cle}.`);
      }
      for (const s of sections) {
        if (!outil.usages.some((u) => u.nom === s.usage)) throw new Error(`Unknown usage ${s.usage} for ${outil.cle}/${s.type}.`);
      }
    }
    if (new Set(outil.usages.map((u) => u.nom)).size !== outil.usages.length) throw new Error('Duplicate usage.');
    verifierReglages(outil.reglages);
    outils.set(outil.cle, outil);
  }
  const enCours = new Set<string>();
  const vus = new Set<string>();
  const visiter = (cle: string) => {
    if (enCours.has(cle)) throw new Error(`Cyclic dependency: ${cle}.`);
    if (vus.has(cle)) return;
    const outil = outils.get(cle);
    if (!outil) throw new Error(`Unknown dependency: ${cle}.`);
    enCours.add(cle);
    outil.dependances.forEach(visiter);
    enCours.delete(cle);
    vus.add(cle);
  };
  outils.forEach((o) => visiter(o.cle));
}

export function applicable(outil: DeclarationOutil, nomSysteme: string): boolean {
  const plier = (s: string) => s.trim().toLowerCase();
  return outil.portee === 'tous' || outil.portee.noms.some((n) => plier(n) === plier(nomSysteme));
}
