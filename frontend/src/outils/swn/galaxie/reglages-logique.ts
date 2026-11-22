// The draft of E-24, « Générateur »: text fields in, the core's settings object out. Pure: no network, no core call.
// The defaults come from the server's read (`defauts`, which the core produced); nothing is copied here.
import type { ApercuReglages, PropositionReglages, VueReglages } from './reglages-api';

type Objet = Record<string, unknown>;

export const FREQUENCES = [
  { cle: 'comete', libelle: 'Comètes' },
  { cle: 'zone', libelle: 'Zones (anneaux, nuages)' },
  { cle: 'nebuleuse', libelle: 'Nébuleuses' },
] as const;
export type CleFrequence = (typeof FREQUENCES)[number]['cle'];

/** The columns of the table of ranges, with the bound of each (the core's: 0-12, 0-8, 0-2, 0-16). */
export const CHAMPS_PLAGE = [
  { cle: 'planetes', libelle: 'Planètes', max: 12 },
  { cle: 'lunes', libelle: 'Lunes par planète', max: 8 },
  { cle: 'ceintures', libelle: 'Ceintures', max: 2 },
  { cle: 'total', libelle: 'Total', max: 16 },
] as const;
export type ChampPlage = (typeof CHAMPS_PLAGE)[number]['cle'];

/** The star classes of the draw, in the order of the table, with their label on screen. */
export const CLASSES = [
  { cle: 'naine_rouge', libelle: 'Naine rouge (M)' },
  { cle: 'orange', libelle: 'Étoile orange (K)' },
  { cle: 'jaune', libelle: 'Étoile jaune (G)' },
  { cle: 'jaune_vert', libelle: 'Étoile jaune-blanc (F)' },
  { cle: 'blanche', libelle: 'Étoile blanche (A)' },
  { cle: 'naine_blanche', libelle: 'Naine blanche (A)' },
  { cle: 'geante_rouge', libelle: 'Géante rouge (M)' },
  { cle: 'geante_bleue', libelle: 'Étoile bleue (B)' },
] as const;

export interface Brouillon {
  /** Percent, as typed. */
  densite: string;
  version: number;
  frequences: Record<CleFrequence, string>;
  /** `classes[classe][champ] = [min, max]`, as typed. */
  classes: Record<string, Record<ChampPlage, [string, string]>>;
}

/** What the fields say, read: the proposal pieces and the error of each field (by field name). */
export interface Lecture {
  erreurs: Record<string, string>;
  densite: number | undefined;
  /** The override over the defaults (only what differs), or `null` for none. */
  surcharge: Objet | null;
}

export const texteNombre = (n: number): string => String(Math.round(n * 1e6) / 1e6).replace('.', ',');

const nombre = (t: string): number => (t.trim() === '' ? NaN : Number(t.trim().replace(',', '.')));
const entier = (t: string): number => (/^\s*\d+\s*$/.test(t) ? Number(t) : NaN);

const pairesDe = (v: unknown): [number, number] => {
  const a = Array.isArray(v) ? v : [0, 0];
  return [Number(a[0]), Number(a[1])];
};

/** The draft showing a complete settings object (the saved state, or the defaults). */
export function brouillonDe(valeurs: Objet, densiteDefaut: number, version: number): Brouillon {
  const f = (valeurs.frequences ?? {}) as Record<string, number>;
  const pc = (valeurs.par_classe ?? {}) as Record<string, Record<string, unknown>>;
  const classes: Brouillon['classes'] = {};
  for (const c of CLASSES) {
    const ligne = {} as Record<ChampPlage, [string, string]>;
    for (const ch of CHAMPS_PLAGE) {
      const [a, b] = pairesDe(pc[c.cle]?.[ch.cle]);
      ligne[ch.cle] = [String(a), String(b)];
    }
    classes[c.cle] = ligne;
  }
  return {
    densite: texteNombre(densiteDefaut * 100),
    version,
    frequences: { comete: texteNombre(f.comete ?? 0), zone: texteNombre(f.zone ?? 0), nebuleuse: texteNombre(f.nebuleuse ?? 0) },
    classes,
  };
}

/** The name of a field in the error map. */
export const champFrequence = (c: CleFrequence) => `frequences.${c}`;
export const champPlage = (classe: string, ch: ChampPlage, i: 0 | 1) => `${classe}.${ch}.${i}`;

/** Reads the draft against the core's defaults: the errors of the fields and the override that remains. */
export function lireBrouillon(b: Brouillon, defauts: Objet): Lecture {
  const erreurs: Record<string, string> = {};
  const dp = Number(String(b.densite).replace(',', '.'));
  let densite: number | undefined;
  if (b.densite.trim() === '' || !Number.isFinite(nombre(b.densite)) || nombre(b.densite) < 0 || nombre(b.densite) > 100) {
    erreurs.densite = 'Entre 0 et 100.';
  } else densite = Math.round(dp * 1e4) / 1e6;

  const df = (defauts.frequences ?? {}) as Record<string, number>;
  const frequences: Record<string, number> = {};
  for (const f of FREQUENCES) {
    const n = nombre(b.frequences[f.cle]);
    if (!Number.isFinite(n) || n < 0 || n > 1) erreurs[champFrequence(f.cle)] = 'Entre 0 et 1.';
    else if (n !== df[f.cle]) frequences[f.cle] = n;
  }

  const dc = (defauts.par_classe ?? {}) as Record<string, Record<string, unknown>>;
  const parClasse: Record<string, Record<string, [number, number]>> = {};
  for (const c of CLASSES) {
    for (const ch of CHAMPS_PLAGE) {
      const [ta, tb] = b.classes[c.cle]![ch.cle];
      const a = entier(ta), z = entier(tb);
      const borne = `Entre 0 et ${ch.max}.`;
      if (!(a >= 0 && a <= ch.max)) erreurs[champPlage(c.cle, ch.cle, 0)] = borne;
      if (!(z >= 0 && z <= ch.max)) erreurs[champPlage(c.cle, ch.cle, 1)] = borne;
      if (a >= 0 && z >= 0 && a > z && !erreurs[champPlage(c.cle, ch.cle, 0)] && !erreurs[champPlage(c.cle, ch.cle, 1)]) {
        erreurs[champPlage(c.cle, ch.cle, 0)] = 'Le minimum dépasse le maximum.';
      }
      if (erreurs[champPlage(c.cle, ch.cle, 0)] || erreurs[champPlage(c.cle, ch.cle, 1)]) continue;
      const [da, dz] = pairesDe(dc[c.cle]?.[ch.cle]);
      if (a !== da || z !== dz) (parClasse[c.cle] ??= {})[ch.cle] = [a, z];
    }
  }
  const surcharge: Objet = {};
  if (Object.keys(frequences).length > 0) surcharge.frequences = frequences;
  if (Object.keys(parClasse).length > 0) surcharge.par_classe = parClasse;
  return { erreurs, densite, surcharge: Object.keys(surcharge).length > 0 ? surcharge : null };
}

/** Canonical JSON (sorted keys), to compare two overrides. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Objet;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** The saved override, as the draft's own reading produces it (so that « unchanged » compares like with like). */
export function surchargeEnregistree(vue: VueReglages): Objet | null {
  const l = lireBrouillon(brouillonDe(vue.valeurs, vue.densite_defaut, vue.version_generateur), vue.defauts);
  return l.surcharge;
}

/** What the draft proposes beyond what is saved: only the keys that moved; `null` when nothing moved. */
export function proposition(b: Brouillon, l: Lecture, vue: VueReglages): PropositionReglages | null {
  const p: PropositionReglages = {};
  if (l.densite !== undefined && Math.abs(l.densite - vue.densite_defaut) > 1e-9) p.densite = l.densite;
  if (b.version !== vue.version_generateur) p.version_generateur = b.version;
  if (canon(l.surcharge) !== canon(surchargeEnregistree(vue))) p.valeurs = l.surcharge;
  return Object.keys(p).length > 0 ? p : null;
}

/** « 214 systèmes tirés changent d'intérieur. 12 systèmes définis ne bougent pas. » */
export function phraseDecompte(a: ApercuReglages): string {
  const t = a.tires_changent;
  const tires = t === 0 ? 'Aucun système tiré ne change d\'intérieur.' : t === 1 ? '1 système tiré change d\'intérieur.'
    : `${t} systèmes tirés changent d'intérieur.`;
  const d = a.definis_inchangent;
  const definis = d === 0 ? 'Aucun système défini.' : d === 1 ? '1 système défini ne bouge pas.' : `${d} systèmes définis ne bougent pas.`;
  return `${tires} ${definis}`;
}

/** The extent sentence, only when it is not the default square of 250 × 250 hexagones. */
export function phraseEtendue(a: ApercuReglages): string | null {
  return a.etendue.largeur === 250 && a.etendue.hauteur === 250 ? null : `sur ${a.etendue.largeur} × ${a.etendue.hauteur} hexagones`;
}
