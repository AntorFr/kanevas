import './markdown.css';

interface Props {
  /** The HTML produced by the server's `rendreMarkdown` (AD-112): escaped, links restricted. */
  html: string;
  className?: string;
  /** Accessible name; the box scrolls sideways (wide tables), so it must be reachable by keyboard. */
  label?: string;
}

/**
 * The only place where HTML from the server is inserted into the page (AD-95, AD-112):
 * no screen builds HTML itself, and none inserts anything else.
 */
export function Markdown({ html, className, label }: Props) {
  return (
    <div
      className={`md${className ? ` ${className}` : ''}`}
      aria-label={label}
      role={label ? 'region' : undefined}
      // eslint-disable-next-line react/no-danger -- server-rendered, see above
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
