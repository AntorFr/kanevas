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

/** The name a file reference shows: no `[` `]` nor line break, which would end the label early. */
export function nomDeReference(nom: string): string {
  return nom.replace(/[[\]\r\n]+/g, ' ').trim();
}

/** The reference put in a text for a file (B-44): an image `![nom](fichier:<id>)`, a document `[nom](fichier:<id>)`. */
export function referenceFichier(nom: string, id: number, image: boolean): string {
  return `${image ? '!' : ''}[${nomDeReference(nom)}](fichier:${id})`;
}

/** Inserts a file reference on its own line, preserving neighbouring Markdown fences and tables. */
export function insererTexte(texte: string, debut: number, fin: number, insertion: string): Selection {
  const a = Math.max(0, Math.min(debut, fin, texte.length));
  const b = Math.min(texte.length, Math.max(debut, fin));
  const avant = texte.slice(0, a);
  const apres = texte.slice(b);
  const prefixe = avant !== '' && !avant.endsWith('\n') ? '\n' : '';
  const suffixe = apres !== '' && !apres.startsWith('\n') ? '\n' : '';
  const f = a + prefixe.length + insertion.length;
  return { texte: avant + prefixe + insertion + suffixe + apres, debut: f, fin: f };
}

/** Whether `position` stands between a `:::mj` line and its closing `:::` line (AD-114). */
export function dansBlocMJ(texte: string, position: number): boolean {
  let ouvert = false;
  let decalage = 0;
  for (const ligne of texte.split('\n')) {
    if (decalage > position) break;
    const t = ligne.trim();
    if (!ouvert && /^:::mj$/.test(t)) ouvert = true;
    else if (ouvert && t === ':::') ouvert = false;
    decalage += ligne.length + 1;
  }
  return ouvert;
}

/** The text without its `:::mj` blocks: what the players could read of it. */
export function sansBlocsMJ(texte: string): string {
  let ouvert = false;
  const gardees: string[] = [];
  for (const ligne of texte.split('\n')) {
    const t = ligne.trim();
    if (!ouvert && /^:::mj$/.test(t)) ouvert = true;
    else if (ouvert && t === ':::') ouvert = false;
    else if (!ouvert) gardees.push(ligne);
  }
  return gardees.join('\n');
}

/** The ids of the files a text references with `(fichier:<id>)`, in order, without repeats. */
export function idsFichiers(texte: string): number[] {
  const ids = new Set<number>();
  for (const m of texte.matchAll(/\(fichier:([1-9]\d{0,14})\)/g)) ids.add(Number(m[1]));
  return [...ids];
}
