import { Markdown } from '../../../ui';
import type { PropsSection } from '../../types';
import './vaisseaux.css';

interface Decoupe {
  mesures: [string, string][];
  /** The rendered text with its « Mesure / Valeur » table taken out. */
  reste: string;
}

/** Takes the two-column table of the text version (V-6) out of the server's HTML; null when there is none. */
function decouper(html: string): Decoupe | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const mesures: [string, string][] = [];
  for (const tr of Array.from(table.querySelectorAll('tbody tr'))) {
    const c = tr.querySelectorAll('td');
    const [k, v] = [c[0], c[1]];
    if (c.length === 2 && k && v) mesures.push([k.textContent ?? '', v.textContent ?? '']);
  }
  if (mesures.length === 0) return null;
  table.remove();
  return { mesures, reste: doc.body.innerHTML };
}

/** The display component of the section « Caractéristiques » (E-9, S-7): a framed horizontal table, no editor. */
export default function SectionCaracteristiques({ html }: PropsSection) {
  const d = decouper(html);
  if (!d) {
    return (
      <div className="vx-section" data-testid="composant-caracteristiques">
        <Markdown className="texte" html={html} />
      </div>
    );
  }
  return (
    <div className="vx-section" data-testid="composant-caracteristiques">
      <Markdown className="texte" html={d.reste} />
      <table className="vx-tableau">
        <thead>
          <tr>{d.mesures.map(([k]) => <th key={k} scope="col">{k}</th>)}</tr>
        </thead>
        <tbody>
          <tr>{d.mesures.map(([k, v]) => <td key={k}>{v}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}
