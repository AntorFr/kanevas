import type { Db } from '../db/db.js';
import { exigerRole } from './droits.js';
import type { TypeFiche } from './types-fiche.js';

/**
 * The natures of a relation (AD-128): the product's list, in code like the types. A nature is
 * added by a line, never removed once used. « dirige » is a qualifier of « membre », not a nature.
 * The place-in-place relation is the tree, never a nature.
 */
const def = <K extends string>(n: {
  cle: K;
  libelleSource: string;
  libelleCible: string;
  symetrique: boolean;
  typesSource: readonly TypeFiche[];
  typesCible: readonly TypeFiche[];
}) => n;

const ALLIES: readonly TypeFiche[] = ['faction', 'famille', 'personnage'];

export const NATURES = [
  def({ cle: 'se_situe', libelleSource: 'se situe à', libelleCible: "s'y trouvent", symetrique: false, typesSource: ['personnage', 'creature', 'objet', 'faction', 'famille', 'vaisseau'], typesCible: ['lieu'] }),
  def({ cle: 'membre', libelleSource: 'membre de', libelleCible: 'membres', symetrique: false, typesSource: ['personnage', 'creature'], typesCible: ['faction', 'famille'] }),
  def({ cle: 'detient', libelleSource: 'détient', libelleCible: 'détenu par', symetrique: false, typesSource: ['personnage', 'faction', 'famille', 'lieu'], typesCible: ['objet', 'vaisseau'] }),
  def({ cle: 'allie', libelleSource: 'allié de', libelleCible: 'allié de', symetrique: true, typesSource: ALLIES, typesCible: ALLIES }),
  def({ cle: 'ennemi', libelleSource: 'ennemi de', libelleCible: 'ennemi de', symetrique: true, typesSource: ALLIES, typesCible: ALLIES }),
] as const;

export type TypeNature = (typeof NATURES)[number]['cle'];

export const estNature = (cle: string): cle is TypeNature => NATURES.some((n) => n.cle === cle);

export function natureDe(cle: string) {
  return NATURES.find((n) => n.cle === cle);
}

/** True when the nature relates a sheet of type `source` to a sheet of type `cible`; a symmetric one in either orientation. */
export function natureConvient(cle: string, source: string, cible: string): boolean {
  const n = natureDe(cle);
  if (!n) return false;
  const dans = (liste: readonly string[], t: string) => liste.includes(t);
  if (dans(n.typesSource, source) && dans(n.typesCible, cible)) return true;
  return n.symetrique && dans(n.typesSource, cible) && dans(n.typesCible, source);
}

/** The label of a relation line / graph link: the nature's, the qualifier after « — »; a free one keeps its qualifier. */
export function libelleRelation(nature: string, qualificatif: string): string {
  const n = natureDe(nature);
  if (!n) return qualificatif;
  return qualificatif ? `${n.libelleSource} — ${qualificatif}` : n.libelleSource;
}

export interface NatureVue {
  cle: TypeNature;
  libelleSource: string;
  libelleCible: string;
  symetrique: boolean;
  typesSource: readonly TypeFiche[];
  typesCible: readonly TypeFiche[];
}

/** The list for any member of the universe (metadata, no sheet): a non-member gets `introuvable`. */
export function listerNatures(db: Db, compteId: number, universId: number): NatureVue[] {
  exigerRole(db, universId, compteId);
  return NATURES.map((n) => ({ ...n }));
}
