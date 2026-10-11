import MarkdownIt from 'markdown-it';

/**
 * Pure Markdown rendering (AD-112): no database, no side effect. Raw HTML is escaped
 * (`html: false`); only `http`, `https` and `mailto` links are links, anything else stays text.
 */
const md = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false });
md.enable(['table', 'strikethrough']);

const PROTOCOLES_LIEN = /^(https?|mailto):/i;
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

export function rendreMarkdown(source: string): string {
  return md.render(source);
}
