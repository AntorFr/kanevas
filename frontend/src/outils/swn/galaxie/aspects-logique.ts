// The draft of E-24, « Aspects »: the text fields of one type in, the partial aspect the core and the server take out.
// Pure: no network, no core call. The defaults come from the server's read (`AspectReglage.defaut`, which is the core's
// `types_catalogue()`); the bounds of the numbers come from the core's own refusal (`borneDe`), never from a copy.
import { texteNombre } from './reglages-logique';

type Objet = Record<string, unknown>;

/** The draft of one type: every editable key of its aspect as typed (`palette.0`, `halo_couleur`, `relief`…). */
export type BrouillonAspect = Record<string, string>;

export interface BorneNombre { min: number; max: number; entier: boolean }

const COULEUR = /^#[0-9a-f]{6}$/i;
export const estCouleur = (t: string): boolean => COULEUR.test(t.trim());

const LIBELLES: Record<string, string> = {
  palette: 'Palette', halo_couleur: 'Couleur du halo', lumiere_couleur: 'Couleur de la lumière', couleur: 'Couleur', gaz: 'Couleur du gaz',
  poussiere: 'Couleur de la poussière', brume: 'Couleur de la brume', fond: 'Couleur du fond',
  mer: 'Mers', nuages: 'Nuages', calottes: 'Calottes', relief: 'Relief', echelle: 'Échelle', halo: 'Atmosphère', bord: 'Assombrissement du bord',
  fissures: 'Fissures', cratere: 'Cratères', bandes: 'Bandes', tempete: 'Tempête', terminateur: 'Terminateur', couronne: 'Couronne',
  granulation: 'Granulation', taches: 'Taches', densite: 'Densité', etoiles: 'Étoiles', rochers: 'Rochers', torsion: 'Torsion',
  longueur: 'Longueur', ouverture: 'Ouverture', courbure: 'Courbure', force_gaz: 'Force du gaz', force_poussiere: 'Force de la poussière',
  tete: 'Tête', perihelie: 'Périhélie', rayons: 'Rayons', bras: 'Bras', graine: 'Graine',
};
const humain = (c: string) => { const s = c.replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
export const libelleChamp = (cle: string): string => {
  const [base, i] = cle.split('.');
  if (base === 'palette') return `Palette, couleur ${Number(i) + 1}`;
  return LIBELLES[base!] ?? humain(base!);
};

/** The fields a type's aspect lets the GM edit, in the order of its default: palette entries, colours, numbers. */
export interface ChampsAspect { palette: string[]; couleurs: string[]; nombres: string[] }
export function champsDe(defaut: Objet): ChampsAspect {
  const palette = Array.isArray(defaut.palette) ? defaut.palette.map((_, i) => `palette.${i}`) : [];
  const couleurs: string[] = [];
  const nombres: string[] = [];
  for (const [k, v] of Object.entries(defaut)) {
    if (k === 'palette') continue;
    if (typeof v === 'string' && estCouleur(v)) couleurs.push(k);
    else if (typeof v === 'number' && k !== 'sens') nombres.push(k);
  }
  return { palette, couleurs, nombres };
}

const valeurDe = (o: Objet, cle: string): unknown => {
  const [base, i] = cle.split('.');
  return i === undefined ? o[base!] : (o[base!] as unknown[] | undefined)?.[Number(i)];
};
const texteDe = (v: unknown): string => (typeof v === 'number' ? texteNombre(v) : String(v ?? ''));

/** The draft showing the effective aspect: the default under the saved override. */
export function brouillonAspect(defaut: Objet, surcharge: Objet): BrouillonAspect {
  const c = champsDe(defaut);
  const effectif: Objet = { ...defaut, ...surcharge };
  const b: BrouillonAspect = {};
  for (const k of [...c.palette, ...c.couleurs, ...c.nombres]) b[k] = texteDe(valeurDe(effectif, k));
  return b;
}

const lireNombre = (t: string): number => (t.trim() === '' ? NaN : Number(t.trim().replace(',', '.')));

export interface LectureAspect {
  erreurs: Record<string, string>;
  /** Only what differs from the default, or `{}`. */
  surcharge: Objet;
}

/** Reads the draft against the default and the bounds (those of the numbers, once known). */
export function lireAspect(
  b: BrouillonAspect, defaut: Objet, bornes: Record<string, BorneNombre | undefined>, enregistree: Objet = {},
): LectureAspect {
  const c = champsDe(defaut);
  const erreurs: Record<string, string> = {};
  // Keys the screen does not edit (a variant, a direction) stay as saved.
  const surcharge: Objet = {};
  for (const [k, v] of Object.entries(enregistree)) if (!(k in defaut) || !(k === 'palette' || c.couleurs.includes(k) || c.nombres.includes(k))) surcharge[k] = v;
  const palette = (defaut.palette as string[] | undefined)?.slice();
  let paletteChange = false;
  for (const k of c.palette) {
    const t = (b[k] ?? '').trim();
    if (!estCouleur(t)) { erreurs[k] = 'Couleur invalide : #rrggbb.'; continue; }
    const i = Number(k.split('.')[1]);
    if (t.toLowerCase() !== palette![i]!.toLowerCase()) { palette![i] = t.toLowerCase(); paletteChange = true; }
  }
  if (paletteChange) surcharge.palette = palette;
  for (const k of c.couleurs) {
    const t = (b[k] ?? '').trim();
    if (!estCouleur(t)) { erreurs[k] = 'Couleur invalide : #rrggbb.'; continue; }
    if (t.toLowerCase() !== String(defaut[k]).toLowerCase()) surcharge[k] = t.toLowerCase();
  }
  for (const k of c.nombres) {
    const n = lireNombre(b[k] ?? '');
    const born = bornes[k];
    if (!Number.isFinite(n)) { erreurs[k] = 'Nombre attendu.'; continue; }
    if (born && (n < born.min || n > born.max)) { erreurs[k] = `Entre ${texteNombre(born.min)} et ${texteNombre(born.max)}.`; continue; }
    if (born?.entier && !Number.isInteger(n)) { erreurs[k] = 'Nombre entier attendu.'; continue; }
    if (n !== defaut[k]) surcharge[k] = n;
  }
  return { erreurs, surcharge };
}

/** Canonical JSON (sorted keys), to compare two overrides. */
export function canonAspect(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonAspect).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Objet;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonAspect(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** What a thumbnail draws: the type and the partial aspect (the core merges it over the type's default). */
export const aspectADessiner = (type: string, surcharge: Objet): string => JSON.stringify({ type, taille: 1, aspect: surcharge });

/** « Entre 0 et 1. » (the core's refusal) → its bounds. */
export function lireBorne(phrase: string): { min: number; max: number } | null {
  const m = /^Entre (-?[\d.]+) et (-?[\d.]+)\.$/.exec(phrase);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : null;
}

const STELLAIRE = (defaut: Objet) => 'couronne' in defaut;
export const estEtoile = STELLAIRE;

const CORPS: Record<string, string> = {
  rocheux: 'Rocheux', tellurique: 'Tellurique', gazeuse: 'Gazeuse', glace: 'Glace', lave: 'Lave', verrouillee: 'Verrouillée',
  anomalie: 'Anomalie', comete: 'Comète', nebuleuse: 'Nébuleuse', ceinture: 'Ceinture', asteroides: 'Astéroïdes',
};
const ETOILES: Record<string, string> = {
  naine_rouge: 'naine rouge (M)', orange: 'orange (K)', jaune_orange: 'jaune-orange', jaune: 'jaune (G)', jaune_vert: 'jaune-blanc (F)',
  blanche: 'blanche (A)', geante_rouge: 'géante rouge', naine_blanche: 'naine blanche', geante_bleue: 'bleue (B)',
};

/** The label of a type in the list; a type the table does not know shows its key, humanised (no screen line per type). */
export function libelleDeType(type: string, defaut: Objet): string {
  if (estEtoile(defaut)) return type === 'etoile' ? 'Étoile (sans classe)' : `Étoile ${ETOILES[type] ?? type.replace(/_/g, ' ')}`;
  return CORPS[type] ?? humain(type);
}

export interface GroupeTypes { titre: string; types: string[] }
/** « Corps » then « Étoile »: the star classes are grouped under one title. */
export function grouperTypes(aspects: readonly { type: string; defaut: Objet }[]): GroupeTypes[] {
  const corps = aspects.filter((a) => !estEtoile(a.defaut)).map((a) => a.type);
  const etoiles = aspects.filter((a) => estEtoile(a.defaut)).map((a) => a.type);
  return [{ titre: 'Corps', types: corps }, { titre: 'Étoile', types: etoiles }].filter((g) => g.types.length > 0);
}
