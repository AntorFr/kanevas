import MarkdownIt from 'markdown-it';
import container from 'markdown-it-container';
import type Token from 'markdown-it/lib/token.mjs';

// Pure Markdown rendering (AD-113): no database, no side effect. Raw HTML is escaped
// (`html: false`); only `http`, `https` and `mailto` links are links, anything else stays text.
const PROTOCOLES_LIEN = /^(https?|mailto):/i;

/**
 * Builds one renderer. With `avecBlocMJ` the `:::mj` container exists (AD-114): only the
 * exact opening line `:::mj` (three colons, lower case, nothing after) opens it.
 */
function creerMoteur(avecBlocMJ: boolean): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false });
  md.enable(['table', 'strikethrough']);

  const validerParDefaut = md.validateLink.bind(md);
  md.validateLink = (url: string): boolean => validerParDefaut(url) && PROTOCOLES_LIEN.test(url.trim());

  // Headings never go above the section title: `#` and `##` become h3, then h4, h5, h6 at most.
  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    const niveau = Number(token.tag.slice(1));
    token.tag = `h${Math.min(Math.max(niveau, 2) + 1, 6)}`;
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.heading_close = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    const niveau = Number(token.tag.slice(1));
    token.tag = `h${Math.min(Math.max(niveau, 2) + 1, 6)}`;
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
    return self.renderToken(tokens, idx, options);
  };

  // Until the media library exists (AD-111) an image is its alternative text.
  md.renderer.rules.image = (tokens, idx, options, env) => {
    const token = tokens[idx]!;
    return md.utils.escapeHtml(md.renderer.renderInlineAsText(token.children ?? [], options, env));
  };

  if (avecBlocMJ) {
    md.use(container, 'mj', {
      validate: (params: string, markup: string) => markup === ':::' && params === 'mj',
      render: (tokens: Token[], idx: number) =>
        tokens[idx]!.nesting === 1
          ? '<div class="bloc-mj" role="note" aria-label="Bloc MJ seul">\n'
          : '</div>\n',
    });
  }
  return md;
}

const mdSection = creerMoteur(true);
const mdTexte = creerMoteur(false);

/**
 * `section`: the text of a section or of a report, where `:::mj` is a GM block (AD-114);
 * `texte` (default): a scenario or a system entry, where `:::mj` stays plain text.
 */
export interface OptionsRendu {
  nature?: 'section' | 'texte';
}

export function rendreMarkdown(source: string, options: OptionsRendu = {}): string {
  return (options.nature === 'section' ? mdSection : mdTexte).render(source);
}

/** A closing fence line, possibly behind the quote or indent marks of its parent. */
const FERMETURE_BLOC = /^[\s>]*:{3,}\s*$/;

/**
 * Indentation of a line once its quote markers are removed, a tab counting for 4. The engine does not
 * close a container on a fence indented by 4 or more: neither do we, so nothing after it leaks.
 */
function indentation(ligne: string): number {
  const reste = ligne.replace(/^(?:\s{0,3}>\s?)+/, '');
  let colonnes = 0;
  for (const c of reste) {
    if (c === ' ') colonnes++;
    else if (c === '\t') colonnes += 4 - (colonnes % 4);
    else break;
  }
  return colonnes;
}

/** Number of quote markers (`>`) leading a line: a fence only pairs with fences of its own quote level. */
function profondeurCitation(ligne: string): number {
  return (ligne.match(/^(?:\s{0,3}>)+/)?.[0].split('>').length ?? 1) - 1;
}

/** An opening line `:::mj`, possibly behind quote or indent marks. */
const OUVERTURE_BLOC = /^[\s>]*:::mj\s*$/;

/**
 * The source without the lines covered by the outermost GM blocks (AD-114): read from the
 * start of the `container_mj_open` tokens, never by regular expression for the start of a block. An unclosed block runs
 * to the end of the source; a `:::mj` line in a code block is not a block. Whole lines are
 * removed. A `:::` line inside a code block of a GM block still closes it, as it does on screen:
 * what the GM sees hatched is always removed from the public text.
 */
export function contenuPublic(source: string): string {
  const lignes = source.split('\n');
  const retirees = new Set<number>();
  for (const t of mdSection.parse(source, {})) {
    if (t.type !== 'container_mj_open' || !t.map) continue;
    // Only the start comes from the token. The block runs to the fence that balances its openings
    // (a `:::mj` line inside opens a nested block, the container itself does not nest); never balanced,
    // it runs to the end of the source, even when the container ended with its list or quote.
    let fin = lignes.length;
    let profondeur = 1;
    const niveau = profondeurCitation(lignes[t.map[0]]!);
    for (let i = t.map[0] + 1; i < lignes.length; i++) {
      if (profondeurCitation(lignes[i]!) !== niveau) continue;
      if (OUVERTURE_BLOC.test(lignes[i]!)) profondeur++;
      else if (FERMETURE_BLOC.test(lignes[i]!) && indentation(lignes[i]!) < 4 && --profondeur === 0) {
        fin = i + 1;
        break;
      }
    }
    for (let i = t.map[0]; i < fin; i++) retirees.add(i);
  }
  if (retirees.size === 0) return source;
  return lignes.filter((_, i) => !retirees.has(i)).join('\n');
}

/**
 * Preview of the editor (AD-113, AD-114 6). Without `nature: 'section'` the text is a scenario or
 * a system entry and `:::mj` stays text; with it, the GM block is rendered only for a GM of the
 * universe outside player mode, and does not exist for anyone else.
 */
export function rendreApercu(source: string, mj: boolean | null): string {
  if (mj === null) return rendreMarkdown(source);
  return mj ? rendreMarkdown(source, { nature: 'section' }) : rendreMarkdown(contenuPublic(source));
}
