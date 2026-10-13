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

/**
 * The source without the lines covered by the outermost GM blocks (AD-114): read from the
 * `map` of the `container_mj_open` tokens, never by regular expression. An unclosed block runs
 * to the end of its parent; a `:::mj` line in a code block is not a block. Whole lines are
 * removed, so it can remove more than the block, never less.
 */
/** A closing fence line, possibly behind the quote or indent marks of its parent. */
const FERMETURE_BLOC = /^[\s>]*:{3,}\s*$/;

export function contenuPublic(source: string): string {
  const lignes = source.split('\n');
  const retirees = new Set<number>();
  for (const t of mdSection.parse(source, {})) {
    if (t.type !== 'container_mj_open' || !t.map) continue;
    // `map` ends on the closing fence (excluded) or, for an unclosed block, on the end of its parent.
    const fin = t.map[1] < lignes.length && FERMETURE_BLOC.test(lignes[t.map[1]]!) ? t.map[1] + 1 : t.map[1];
    for (let i = t.map[0]; i < fin; i++) retirees.add(i);
  }
  if (retirees.size === 0) return source;
  return lignes.filter((_, i) => !retirees.has(i)).join('\n');
}
