import type { Db } from '../../db/db.js';
import { calculer, type AlerteVaisseau, type CoqueResolue, type LigneResolue, type NatureVaisseau,
  type ElementResolu as ElementCalcul, type ResultatVaisseau } from '../../outils/swn/regles/vaisseau.js';
import { lireElement, type ElementResolu } from '../catalogues.js';
import { ErreurService, introuvable } from '../erreurs.js';
import { accessible, lireLigneOutil, resoudreOutil } from '../outils.js';
import type { Acteur } from '../types.js';
import { NATURES_DE_LIGNE } from './catalogue-vaisseaux.js';

/** The tool key and its two catalogue-aware pieces (V-1). */
export const OUTIL_VAISSEAUX = 'swn/vaisseaux';
export const TYPE_CARACTERISTIQUES = 'caracteristiques';

export interface LigneChoix { nature: NatureVaisseau; cle: string; quantite: number; magasins?: number;
  /** X-4: points of an exchange line and the line a doubling aims at. */
  points?: number; vise?: { nature: NatureVaisseau; cle: string } }
/** `equipage`: `undefined` = the hull's minimum (F-2); `null` = no crew, kept as such. */
export interface EntreeCalcul { coque: string; choix: LigneChoix[]; equipage?: number | null; reparation?: number }
export interface SortieCalcul { resultat: ResultatVaisseau | null; alertes: AlerteVaisseau[] }
/** What the stored design already carries: the keys that may still resolve although masked (V-3). */
export interface Porte {
  coque: string;
  lignes: { nature: string; cle: string }[];
  /** Names kept at the last save (`resultat`), so that a withdrawn element still reads. */
  noms: { coque: string | null; lignes: { nature: string; cle: string; nom: string }[] };
}

const EFFETS_VISANT = ['soutes_doublees', 'magasins_doubles', 'montages_specialises', 'surcharge_cumulable'];
const invalide = (message: string, detail: string, champ: string) => new ErreurService('invalide', message, detail, champ);

const viseValide = (v: unknown): boolean => {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === 2
    && typeof o.nature === 'string' && (NATURES_DE_LIGNE as readonly string[]).includes(o.nature)
    && typeof o.cle === 'string' && o.cle.length >= 1 && o.cle.length <= 64;
};

/** Shape of a request: at most 100 lines, one per pair, quantity 1–99, known natures. */
export function validerChoix(coque: unknown, choix: unknown): EntreeCalcul {
  if (typeof coque !== 'string' || coque.length < 1 || coque.length > 64) throw invalide('Coque invalide.', 'coque_invalide', 'coque');
  if (!Array.isArray(choix) || choix.length > 100) throw invalide('Choix invalides.', 'choix_invalide', 'choix');
  const vus = new Set<string>();
  const lignes = choix.map((l: unknown): LigneChoix => {
    const o = l as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || Array.isArray(o)
      || typeof o.nature !== 'string' || !(NATURES_DE_LIGNE as readonly string[]).includes(o.nature)
      || typeof o.cle !== 'string' || o.cle.length < 1 || o.cle.length > 64
      || !Number.isInteger(o.quantite) || (o.quantite as number) < 1 || (o.quantite as number) > 99
      || (o.points !== undefined && (!Number.isInteger(o.points) || (o.points as number) < 0 || (o.points as number) > 99))
      || (o.vise !== undefined && !viseValide(o.vise))
      || (o.magasins !== undefined && (o.nature !== 'armes' || !Number.isInteger(o.magasins) || (o.magasins as number) < 1 || (o.magasins as number) > 9))) {
      throw invalide('Choix invalides.', 'choix_invalide', 'choix');
    }
    const k = JSON.stringify([o.nature, o.cle]);
    if (vus.has(k)) throw invalide('Un élément ne peut figurer qu\'une fois.', 'choix_en_double', 'choix');
    vus.add(k);
    return { nature: o.nature as NatureVaisseau, cle: o.cle, quantite: o.quantite as number,
      ...(o.magasins === undefined ? {} : { magasins: o.magasins as number }),
      ...(o.points === undefined ? {} : { points: o.points as number }),
      ...(o.vise === undefined ? {} : { vise: { nature: (o.vise as { nature: NatureVaisseau }).nature, cle: (o.vise as { cle: string }).cle } }) };
  });
  return { coque, choix: lignes };
}

/** The `equipage` of a request (F-2): absent or `null` = the default, else an integer 0–100 000. */
export function validerEquipage(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100000) throw invalide('Équipage invalide.', 'equipage_invalide', 'equipage');
  return v;
}

/** The `reparation` of a request (X-4): absent or `null` = 0, else an integer 0–20. */
export function validerReparation(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 20) throw invalide('Réparation invalide.', 'reparation_invalide', 'reparation');
  return v;
}

const texteRetire = (nom: string) => `Élément retiré de cet univers : ${nom}. Remplacez-le pour enregistrer.`;
export const alerteRetiree = (nom: string, ligne: number): AlerteVaisseau =>
  ({ niveau: 'bloquante', code: 'element_retire', texte: texteRetire(nom), ligne });

/** The `portee_saut` of the module, resolved for the universe (G-5). */
function porteeSaut(db: Db, universId: number): number {
  const v = resoudreOutil(db, universId, OUTIL_VAISSEAUX).communs.reglages['portee_saut']?.valeur;
  return typeof v === 'number' ? v : 5;
}

function resoudre(db: Db, universId: number, nature: string, cle: string, masque: boolean): ElementResolu | null {
  try {
    return lireElement(db, universId, OUTIL_VAISSEAUX, nature, cle, { inclureMasques: masque });
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'introuvable') return null;
    throw e;
  }
}

export interface Resolution {
  /** `null` when the hull or a line does not resolve: no number is invented. */
  coque: CoqueResolue | null;
  lignes: (LigneResolue | null)[];
  /** The crew of the design, resolved (F-2). */
  equipage: number | null;
  /** The `element_retire` alerts (hull `-1`, then each line by index). */
  retirees: AlerteVaisseau[];
  /** Their names, in the same order. */
  nomsRetires: string[];
  /** The first request field that named an element not carried and not resolvable (never a masked-or-unknown distinction). */
  inconnu: { champ: 'coque' | 'choix' } | null;
  /** The repair skill of the design (X-4). */
  reparation: number;
}

/** X-4: `points` and `vise` must belong to an element that has the effect; one above `points_max` is refused. */
export function controlerChoix(r: Resolution): void {
  r.lignes.forEach((l) => {
    if (l === null) return;
    const e = l.element;
    if (l.points !== undefined) {
      if (e.effet !== 'echange') throw invalide('Points sur un élément sans échange.', 'points_invalides', 'points');
      if (l.points > (e.points_max ?? 0)) throw invalide(`Points : ${e.points_max ?? 0} au plus.`, 'points_invalides', 'points');
    }
    if (l.vise !== undefined && !(e.effet !== undefined && EFFETS_VISANT.includes(e.effet))) {
      throw invalide('Élément visé sur un élément sans effet ciblé.', 'vise_invalide', 'vise');
    }
  });
}

/**
 * Resolves the hull and the lines at the actor's level, once (V-3). A key the design already carries may be masked;
 * a new one may not. An unresolvable element keeps the stored name (or the key) and carries a blocking alert.
 */
export function resoudreChoix(db: Db, universId: number, e: EntreeCalcul, porte: Porte | null): Resolution {
  const retirees: AlerteVaisseau[] = [];
  const nomsRetires: string[] = [];
  let inconnu: Resolution['inconnu'] = null;
  const hull = resoudre(db, universId, 'coques', e.coque, porte?.coque === e.coque);
  let coque: CoqueResolue | null = null;
  if (hull) coque = { cle: hull.cle, nom: hull.nom, ...(hull.donnees as unknown as Omit<CoqueResolue, 'cle' | 'nom'>) };
  else {
    const nom = porte?.coque === e.coque && porte.noms.coque ? porte.noms.coque : e.coque;
    nomsRetires.push(nom);
    retirees.push(alerteRetiree(nom, -1));
    if (porte?.coque !== e.coque) inconnu = { champ: 'coque' };
  }
  const lignes = e.choix.map((l, i): LigneResolue | null => {
    const portee = porte?.lignes.some((p) => p.nature === l.nature && p.cle === l.cle) === true;
    const el = resoudre(db, universId, l.nature, l.cle, portee);
    if (!el) {
      const nom = porte?.noms.lignes.find((p) => p.nature === l.nature && p.cle === l.cle)?.nom ?? l.cle;
      nomsRetires.push(nom);
      retirees.push(alerteRetiree(nom, i));
      if (!portee && !inconnu) inconnu = { champ: 'choix' };
      return null;
    }
    return { nature: l.nature, cle: l.cle, nom: el.nom, quantite: l.quantite,
      ...(l.magasins === undefined ? {} : { magasins: l.magasins }),
      ...(l.points === undefined ? {} : { points: l.points }), ...(l.vise === undefined ? {} : { vise: l.vise }), element: el.donnees as unknown as ElementCalcul };
  });
  const equipage = e.equipage === undefined ? (coque?.equipage_min ?? null) : e.equipage;
  return { coque, lignes, equipage, reparation: e.reparation ?? 0, retirees, nomsRetires, inconnu };
}

/** Calculates from resolved elements; `null` result and the alerts alone when one does not resolve. */
export function calculerResolu(db: Db, universId: number, r: Resolution): SortieCalcul {
  if (r.retirees.length > 0 || !r.coque || r.lignes.some((l) => l === null)) return { resultat: null, alertes: r.retirees };
  const resultat = calculer(r.coque, r.lignes as LigneResolue[], { porteeSaut: porteeSaut(db, universId) }, r.equipage, r.reparation);
  return { resultat, alertes: resultat.alertes };
}

/**
 * The one calculation of the designer (V-3, V-9): the screen, the section and the assistant all call it. Nothing is written.
 * `porte` is what the stored design carries (the caller has already read it under its own guards).
 */
export function calculerDepuisChoix(db: Db, acteur: Acteur, universId: number, entree: unknown,
  porte: Porte | null = null): SortieCalcul {
  if (!accessible(db, acteur, universId, OUTIL_VAISSEAUX)) throw introuvable();
  const o = (entree ?? {}) as { coque?: unknown; choix?: unknown; equipage?: unknown; reparation?: unknown };
  const e = validerChoix(o.coque, o.choix);
  const equipage = validerEquipage(o.equipage);
  if (equipage !== undefined) e.equipage = equipage;
  const reparation = validerReparation(o.reparation);
  if (reparation !== undefined) e.reparation = reparation;
  const r = resoudreChoix(db, universId, e, porte);
  controlerChoix(r);
  return calculerResolu(db, universId, r);
}

/** `-` for a missing row (V-5). */
const v = (n: number | string | null | undefined) => (n === null || n === undefined ? '-' : String(n));

/** The settings and catalogue versions the text depends on, as stored on a design (V-5). */
export function versionsSource(db: Db, universId: number): { reglages: string; catalogue: string } {
  const u = db.prepare('SELECT systeme_id FROM univers WHERE id = ?').get(universId) as { systeme_id: number | null } | undefined;
  const systemeId = u?.systeme_id ?? null;
  const sys = (cle: string) => systemeId === null ? undefined : lireLigneOutil(db, { niveau: 'systeme', id: systemeId }, cle);
  const uni = (cle: string) => lireLigneOutil(db, { niveau: 'univers', id: universId }, cle);
  const module = OUTIL_VAISSEAUX.split('/')[0]!;
  return {
    reglages: `${v(uni(module)?.version_reglages)}.${v(sys(module)?.version_reglages)}/${v(uni(OUTIL_VAISSEAUX)?.version_reglages)}.${v(sys(OUTIL_VAISSEAUX)?.version_reglages)}`,
    catalogue: `${v(sys(OUTIL_VAISSEAUX)?.version_catalogue)}.${v(uni(OUTIL_VAISSEAUX)?.version_catalogue)}`,
  };
}

export function versionSourceVaisseaux(db: Db, universId: number): string {
  const s = versionsSource(db, universId);
  return `vaisseaux:r=${s.reglages};c=${s.catalogue}`;
}
