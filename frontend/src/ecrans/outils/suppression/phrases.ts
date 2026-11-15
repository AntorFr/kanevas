import type { LigneDonnees, Niveau } from '../types';

/** Thin-space grouping (« 14 000 »), whatever the browser's locale data. */
export const nombre = (n: number) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** « 1 conception », « 14 000 conceptions »: the plural is the summary's own. */
export const compte = (l: LigneDonnees) => `${nombre(l.nombre)} ${l.nombre === 1 ? l.singulier : l.pluriel}`;

/** Lines comma-separated, « et » before the last one when there are three or more. */
export function enumerer(lignes: LigneDonnees[]): string {
  const c = lignes.map(compte);
  return c.length < 3 ? c.join(', ') : `${c.slice(0, -1).join(', ')} et ${c[c.length - 1]}`;
}

/** The sentence of the dialog (E-20): « 2 conceptions, 2 éléments locaux de catalogue seront effacés. » */
export function phrase(lignes: LigneDonnees[], niveau: Niveau, galaxie: boolean): string {
  const seul = lignes.length === 1 && lignes[0]!.nombre === 1;
  const verbe = seul ? 'sera effacé' : 'seront effacés';
  if (galaxie && niveau === 'univers') return `Les ${enumerer(lignes)} de cette galaxie seront effacés.`;
  return `${enumerer(lignes)} ${verbe}.`;
}

export const phraseResultat = (lignes: LigneDonnees[]) => `Données supprimées : ${lignes.map(compte).join(', ')}.`;
