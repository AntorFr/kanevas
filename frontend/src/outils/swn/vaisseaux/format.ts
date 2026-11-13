import type { Alerte, Brouillon, Conception, Donnees, ElementCatalogue } from './types';

const NBSP = '\u00A0';
/** « 685 000 » with a no-break space between the groups, like the text version (V-6). */
export const nombre = (n: number) => {
  const signe = n < 0 ? '−' : '';
  return signe + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
};
/** A mass (B-80): a decimal comma only when it has one, « 1,5 », « 7 », « −0,5 ». Twin of `texteMasse` (src/outils/swn/regles/masse.ts). */
export const masse = (n: number) => {
  const signe = n < 0 ? '−' : '';
  const [entiere = '', decimale] = String(Math.abs(n)).split('.');
  return signe + entiere.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + (decimale === undefined ? '' : `,${decimale}`);
};
export const credits = (n: number) => `${nombre(n)}${NBSP}cr`;
export const jours = (n: number) => `${nombre(n)} ${n === 1 ? 'jour' : 'jours'}`;
export const entretien = (n: number) => `${credits(n)} / an`;

export const brouillonDe = (c: Pick<Conception, 'coque' | 'lignes' | 'resultat'>): Brouillon => ({
  coque: { cle: c.coque.cle, nom: c.coque.nom },
  lignes: c.lignes.map((l) => ({ ...l })),
  equipage: c.resultat.equipage?.choisi ?? null,
  reparation: c.resultat.reparation?.choisie ?? 0,
});

export const EQUIPAGE_MAX = 100_000;
/** « 6 à 20 », « 6 au moins », « 20 au plus »; empty when the hull states no bound (the line is then absent). */
export const bornesEquipage = (min: number | null | undefined, max: number | null | undefined) =>
  min != null && max != null ? `${min} à ${max}` : min != null ? `${min} au moins` : max != null ? `${max} au plus` : '';

/** The body of `POST calcul` and `PUT conceptions/:fid`. */
export const choixDe = (b: Brouillon) => ({
  coque: b.coque.cle,
  ...(b.equipage === null ? {} : { equipage: b.equipage }),
  ...(b.reparation > 0 ? { reparation: b.reparation } : {}),
  choix: b.lignes.map((l) => ({
    nature: l.nature, cle: l.cle, quantite: l.quantite,
    ...(l.points === undefined ? {} : { points: l.points }),
    ...(l.vise === undefined ? {} : { vise: { nature: l.vise.nature, cle: l.vise.cle } }),
  })),
});

export const memeBrouillon = (a: Brouillon, b: Brouillon) => JSON.stringify(choixDe(a)) === JSON.stringify(choixDe(b));

/** « Puissance insuffisante : −2 » → « Puissance insuffisante (−2) »: the reason repeated under « Enregistrer ». */
export function motifDe(a: Alerte): string {
  if (a.code === 'element_retire') return 'élément retiré de cet univers';
  const m = /^(.*?) : (−?\d+(?:,\d+)?)\.?$/.exec(a.texte);
  return m ? `${m[1]} (${m[2]})` : a.texte.replace(/\.$/, '');
}

export const AIDES: Record<string, string> = {
  puissance_insuffisante: 'Retirez une arme ou changez de moteur.',
};

export const requete = (suffixe: string, params: Record<string, string | undefined> = {}) => {
  const q = new URLSearchParams(suffixe.replace(/^\?/, ''));
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

/** « classe 2 à 3 », « classe 3 au moins », « classe 2 au plus », « classe 2 seulement » — as the catalogue states it. */
export function plageClasses(d: Donnees | undefined): string {
  const min = d?.classe_min, max = d?.classe_max;
  if (min === undefined && max === undefined) return '';
  if (min !== undefined && max !== undefined) return min === max ? `classe ${min} seulement` : `classe ${min} à ${max}`;
  return min !== undefined ? `classe ${min} au moins` : `classe ${max} au plus`;
}

/** True when the element asks for a repair skill, by the effect or by the field (Y-3). */
export const exigeReparation = (d: Donnees | undefined) => d !== undefined && (d.effet === 'reparation_min' || d.reparation_min !== undefined);

const signe = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + String(Math.abs(n));

/** The effect of a modification in words (B-83), from the fields the catalogue states; empty when it states none. */
export function motEffet(d: Donnees): string {
  switch (d.effet) {
    case 'vitesse': return d.valeur === undefined ? '' : `vitesse ${signe(d.valeur)}`;
    case 'armure': return d.valeur === undefined ? '' : `armure ${signe(d.valeur)}`;
    case 'soutes_doublees': return 'soutes doublées';
    case 'magasins_doubles': return 'magasins doublés';
    case 'reparation_min': return d.valeur === undefined ? '' : `réparation ${d.valeur} au moins`;
    case 'echange': {
      const sens = d.sens === 'masse_vers_puissance' ? 'masse → puissance' : 'puissance → masse';
      const base = d.points_max === undefined ? sens : `${sens}, jusqu’à ${d.points_max} ${d.points_max === 1 ? 'point' : 'points'}`;
      return d.echange_arrondi === 'installation' ? `${base} · arrondi par installation` : base;
    }
    default: return '';
  }
}

/** « 3 points : −3 puissance, +1,5 masse » — written from the deltas of the server's `echange`, nothing computed. */
export function consequencePoints(points: number, e: { puissance: number; masse: number }): string {
  const delta = (n: number) => (n > 0 ? '+' : '') + masse(n);
  return `${points} ${points === 1 ? 'point' : 'points'} : ${delta(e.puissance)} puissance, ${delta(e.masse)} masse`;
}

/** The positive captions of a choice row (E-22): only what the catalogue states, joined by « · ». `classe` is the chosen hull's. */
export function legende(e: Pick<ElementCatalogue, 'nature' | 'donnees'>, classe?: number): string {
  const d = e.donnees;
  if (!d) return '';
  const parts: (string | false)[] = [];
  if (e.nature === 'coques') {
    parts.push(d.vitesse !== undefined && `vitesse ${d.vitesse}`, d.armure !== undefined && `armure ${d.armure}`);
    const b = bornesEquipage(d.equipage_min, d.equipage_max);
    parts.push(b !== '' && `équipage ${b}`);
  } else if (e.nature === 'armes') {
    parts.push(d.degats !== undefined && `dégâts ${d.degats}`, d.perforation !== undefined && `PA ${d.perforation}`,
      d.qualites !== undefined && `qualités : ${d.qualites}`, d.niveau_tech !== undefined && `NT ${d.niveau_tech}`);
  } else if (e.nature === 'moteurs' || e.nature === 'amenagements' || e.nature === 'defenses') {
    parts.push(plageClasses(d) || false);
    parts.push(e.nature === 'defenses' && d.bonus_vitesse !== undefined && `vitesse ${d.bonus_vitesse < 0 ? '−' : d.bonus_vitesse > 0 ? '+' : ''}${Math.abs(d.bonus_vitesse)}`);
    if (e.nature === 'amenagements') {
      if (d.effet === 'moteur_systeme') {
        parts.push('moteur système');
        const p = classe === undefined ? undefined : d.rend_puissance?.[classe - 1];
        const m = classe === undefined ? undefined : d.rend_masse?.[classe - 1];
        parts.push(p !== undefined && m !== undefined && `rend puissance ${nombre(p)} et masse ${masse(m)}`);
        parts.push(d.reduction_cout_pct !== undefined && `coût −${d.reduction_cout_pct} %${d.reduction_base === 'coque' ? ' de la coque' : ''}`);
      }
      // Y-6: a cargo per class (the chosen hull's class) wins over the flat one; nothing without a hull.
      const soute = d.soute_par_classe !== undefined ? (classe === undefined ? undefined : d.soute_par_classe[classe - 1]) : d.soute;
      parts.push(soute !== undefined && `soutes ${nombre(soute)}`);
    }
  } else if (e.nature === 'modifications') {
    parts.push(d.cout_pct !== undefined && `${d.cout_pct} % de la coque`, motEffet(d) || false,
      d.reparation_min !== undefined && d.effet !== 'reparation_min' && `réparation ${d.reparation_min} au moins`);
  }
  return parts.filter(Boolean).join(' · ');
}

/** True when the element's class range excludes the hull's class: the display of the mark only, the alert is the server's. */
export function exclutLaClasse(e: Pick<ElementCatalogue, 'nature' | 'donnees'>, classe: number): boolean {
  if (e.nature !== 'moteurs' && e.nature !== 'amenagements' && e.nature !== 'defenses') return false;
  const d = e.donnees;
  return d !== undefined && (d.classe_min !== undefined && d.classe_min > classe || d.classe_max !== undefined && d.classe_max < classe);
}

/** « masse −1 », « emports −1 », « puissance +5 » — the server's `ajuste` of a targeted line, only the non-zero deltas; empty when none. */
export function ligneAjuste(a: { masse?: number; puissance?: number; emports?: number } | undefined): string {
  if (!a) return '';
  const delta = (n: number) => (n > 0 ? '+' : '−') + masse(Math.abs(n));
  return (['masse', 'puissance', 'emports'] as const)
    .filter((k) => a[k] !== undefined && a[k] !== 0)
    .map((k) => `${k} ${delta(a[k]!)}`).join(', ');
}
