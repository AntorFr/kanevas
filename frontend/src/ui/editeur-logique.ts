/** Pure helpers of the Markdown editor (no DOM), so they can be tested alone. */

export interface Selection {
  texte: string;
  debut: number;
  fin: number;
}

/**
 * Wraps the selection in `marque` (« ** » bold, « * » italic). An empty selection puts two marks
 * and the cursor between them; a selection stays selected, inside the marks.
 */
export function entourer(texte: string, debut: number, fin: number, marque: string): Selection {
  const a = Math.min(debut, fin);
  const b = Math.max(debut, fin);
  return {
    texte: texte.slice(0, a) + marque + texte.slice(a, b) + marque + texte.slice(b),
    debut: a + marque.length,
    fin: b + marque.length,
  };
}

/** Whether `texte` goes past the ceiling (`max` unknown until `/api/moi` answered: nothing is checked). */
export const depasse = (texte: string, max: number | undefined): boolean => max !== undefined && texte.length > max;

/** « 100 000 caractères au plus. » — the words of the interface and of the server's refusal (plain spaces, as the server writes it). */
export const messageTropLong = (max: number): string => `${String(max).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} caractères au plus.`;
