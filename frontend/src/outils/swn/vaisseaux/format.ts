import type { Alerte, Brouillon, Conception } from './types';

const NBSP = '\u00A0';
/** « 685 000 » with a no-break space between the groups, like the text version (V-6). */
export const nombre = (n: number) => {
  const signe = n < 0 ? '−' : '';
  return signe + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
};
export const credits = (n: number) => `${nombre(n)}${NBSP}cr`;
export const jours = (n: number) => `${nombre(n)} ${n === 1 ? 'jour' : 'jours'}`;
export const entretien = (n: number) => `${credits(n)} / an`;

export const brouillonDe = (c: Pick<Conception, 'coque' | 'lignes'>): Brouillon => ({
  coque: { cle: c.coque.cle, nom: c.coque.nom },
  lignes: c.lignes.map((l) => ({ ...l })),
});

/** The body of `POST calcul` and `PUT conceptions/:fid`. */
export const choixDe = (b: Brouillon) => ({
  coque: b.coque.cle,
  choix: b.lignes.map((l) => ({ nature: l.nature, cle: l.cle, quantite: l.quantite })),
});

export const memeBrouillon = (a: Brouillon, b: Brouillon) => JSON.stringify(choixDe(a)) === JSON.stringify(choixDe(b));

/** « Puissance insuffisante : −2 » → « Puissance insuffisante (−2) »: the reason repeated under « Enregistrer ». */
export function motifDe(a: Alerte): string {
  if (a.code === 'element_retire') return 'élément retiré de cet univers';
  const m = /^(.*?) : (−?\d+)\.?$/.exec(a.texte);
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
