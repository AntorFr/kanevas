// The wording of the size popover (E-28 top bar). The limit is the core's (`tailleMax`), never a number written here.
export const MESSAGE_HORS_LIMITES = 'Des éléments sont hors des nouvelles limites.';

export const messageTropGrand = (max: number) => `${max} cases au plus.`;
export const MESSAGE_ENTIER = 'Entrez un nombre entier de cases.';

/** `null` when the text is a size the editor may send; else the sentence to show under the field. */
export function erreurTaille(texte: string, max: number): string | null {
  const t = texte.trim();
  if (!/^\d+$/.test(t)) return MESSAGE_ENTIER;
  const n = Number(t);
  if (n > max) return messageTropGrand(max);
  if (n < 1) return MESSAGE_ENTIER;
  return null;
}

/** The sentence for a refusal of the server on a resize: the elements left outside, or the field's own message. */
export function messageRefusTaille(e: { statut: number; code?: string; message: string }, max: number, largeur: number, hauteur: number): string {
  if (e.code === 'limite_depassee') return largeur > max || hauteur > max ? messageTropGrand(max) : MESSAGE_HORS_LIMITES;
  return e.message;
}
