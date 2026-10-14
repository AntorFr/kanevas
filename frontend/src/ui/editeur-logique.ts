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

/** The server's own refusal (« Contenu trop long : 100 000 caractères au plus. ») in the interface's words: its limit wins over the screen's. */
export const refusServeur = (message: string): string => message.replace(/^Contenu trop long\s*:\s*/, '');

/**
 * « Bloc MJ » (AD-114): wraps the selection in a `:::mj` line and a `:::` line, adding the line breaks that
 * are missing so both lines stand alone. Without selection, the two lines with an empty one between and the
 * cursor on it. The selection, when there is one, stays selected between the two lines.
 */
export function entourerBlocMJ(texte: string, debut: number, fin: number): Selection {
  const a = Math.min(debut, fin);
  const b = Math.max(debut, fin);
  const avant = texte.slice(0, a);
  const milieu = texte.slice(a, b);
  const apres = texte.slice(b);
  const ouvre = (avant === '' || avant.endsWith('\n') ? '' : '\n') + ':::mj\n';
  const ferme = (apres === '' || apres.startsWith('\n') ? '' : '\n');
  if (milieu === '') {
    const t = avant + ouvre + '\n:::' + ferme + apres;
    const curseur = avant.length + ouvre.length;
    return { texte: t, debut: curseur, fin: curseur };
  }
  const corps = milieu.endsWith('\n') ? milieu : milieu + '\n';
  const t = avant + ouvre + corps + ':::' + ferme + apres;
  const d = avant.length + ouvre.length;
  return { texte: t, debut: d, fin: d + milieu.length };
}
