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

/** The server's refusal of a bare `[[<id>]]` the author cannot read (AD-116): shown as it comes, under the field. */
export const MESSAGE_LIEN_ILLISIBLE = 'Cette fiche n’existe pas ou vous ne pouvez pas la lire.';

/** Whether a refusal is that one (the server writes a plain apostrophe). */
export const estLienIllisible = (message: string): boolean => message.replace(/’/g, "'") === MESSAGE_LIEN_ILLISIBLE.replace(/’/g, "'");

/** Longest search the server accepts (B-11). */
const MAX_RECHERCHE = 100;

/**
 * The `[[` the caret stands in (P-14 step 1): the text typed after it, up to the caret, holds no `[`, `]`, `|` nor line
 * break. Returns where the `[[` starts and what follows it (the search), or null when the caret is not inside one.
 */
export function ouvertureLien(texte: string, caret: number): { debut: number; requete: string } | null {
  const avant = texte.slice(0, caret);
  const m = /\[\[([^[\]|\n]*)$/.exec(avant);
  if (!m) return null;
  return { debut: m.index, requete: m[1]!.slice(0, MAX_RECHERCHE) };
}

/** The text a link shows: the server's rules (1 to 200 characters, no `]`, `|` nor line break). */
export function texteDeLien(titre: string): string {
  return titre.replace(/[\]|\r\n]+/g, ' ').trim().slice(0, 200).trim();
}

/** Replaces the `[[…` typed between `debut` and `caret` by `[[<id>|<titre>]]`, the caret landing after it. */
export function insererLien(texte: string, debut: number, caret: number, id: number, titre: string): Selection {
  const t = texteDeLien(titre);
  const lien = t === '' ? `[[${id}]]` : `[[${id}|${t}]]`;
  const fin = debut + lien.length;
  return { texte: texte.slice(0, debut) + lien + texte.slice(caret), debut: fin, fin };
}

/** « Lien vers une fiche »: opens a `[[` at the selection, which becomes the first letters of the search. */
export function ouvrirLien(texte: string, debut: number, fin: number): Selection {
  const a = Math.min(debut, fin);
  const b = Math.max(debut, fin);
  const choisi = texte.slice(a, b).replace(/[[\]|\n]/g, ' ').trim();
  const f = a + 2 + choisi.length;
  return { texte: texte.slice(0, a) + '[[' + choisi + texte.slice(b), debut: f, fin: f };
}
