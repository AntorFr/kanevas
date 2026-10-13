import type { MouseEvent } from 'react';

import './markdown.css';

interface Props {
  /** The HTML produced by the server's `rendreMarkdown` (AD-113): escaped, links restricted. */
  html: string;
  className?: string;
  /** Accessible name; the box scrolls sideways (wide tables), so it must be reachable by keyboard. */
  label?: string;
}

/** A link to a sheet opens inside the app (a history entry the router takes as a navigation), not by a page load. */
function ouvrirLienFiche(e: MouseEvent<HTMLDivElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest?.('a.lien-fiche');
  const href = a?.getAttribute('href');
  if (!a || !href || !href.startsWith('/')) return;
  e.preventDefault();
  window.history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * The only place where HTML from the server is inserted into the page (AD-95, AD-113):
 * no screen builds HTML itself, and none inserts anything else.
 */
export function Markdown({ html, className, label }: Props) {
  return (
    <div
      className={`md${className ? ` ${className}` : ''}`}
      onClick={ouvrirLienFiche}
      aria-label={label}
      role={label ? 'region' : undefined}
      // eslint-disable-next-line react/no-danger -- server-rendered, see above
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
