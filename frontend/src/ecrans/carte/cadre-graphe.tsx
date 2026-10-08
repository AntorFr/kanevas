import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { disposer } from './disposition';
import { adresseFiche, titreCourt, type Element, type Lien } from './types';

/** Room kept around the outer nodes, and the least room per node on each side (E-11). */
const MARGE = 60;
const PAR_NOEUD = 60;
const LARGEUR_MIN = 640;
const HAUTEUR_MIN = 400;
const RAYON = 15;

interface Props {
  universId: string;
  elements: Element[];
  liens: Lien[];
  /** GM outside player mode: a node is selected; otherwise it opens the sheet. */
  gerer: boolean;
  selection?: number;
  onSelection: (id: number | undefined) => void;
  vide: string;
}

/** The frame of a graph: one node per sheet, one arrow per link, laid out in the browser (AD-71). */
export function CadreGraphe({ universId, elements, liens, gerer, selection, onSelection, vide }: Props) {
  const n = elements.length;
  const largeur = Math.max(LARGEUR_MIN, n * PAR_NOEUD + 2 * MARGE);
  const hauteur = Math.max(HAUTEUR_MIN, n * PAR_NOEUD + 2 * MARGE);

  // The layout depends on the graph this reader received, and on nothing else.
  const points = useMemo(
    () => disposer(elements.map((e) => ({ id: e.ficheId, titre: e.titre })), liens),
    [elements, liens],
  );
  const pos = (ficheId: number) => {
    const p = points.get(ficheId) ?? { x: 0.5, y: 0.5 };
    return { x: MARGE + p.x * (largeur - 2 * MARGE), y: MARGE + p.y * (hauteur - 2 * MARGE) };
  };

  if (n === 0) {
    return (
      <div className="carte-zone">
        <div className="carte-cadre graphe-vide">
          <div className="carte-message vide">
            <p>{vide}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="carte-zone graphe-zone">
      <div className="carte-cadre graphe" style={{ width: largeur, height: hauteur }}>
        <svg className="graphe-liens" width={largeur} height={hauteur} viewBox={`0 0 ${largeur} ${hauteur}`} aria-hidden="true">
          <defs>
            <marker id="pointe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="graphe-pointe" />
            </marker>
          </defs>
          {liens.map((l, i) => {
            if (!points.has(l.de) || !points.has(l.vers)) return null;
            const a = pos(l.de);
            const b = pos(l.vers);
            const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const ux = (b.x - a.x) / d;
            const uy = (b.y - a.y) / d;
            // A small side shift keeps opposite links between two nodes apart.
            const ox = -uy * 7;
            const oy = ux * 7;
            const x1 = a.x + ux * RAYON + ox;
            const y1 = a.y + uy * RAYON + oy;
            const x2 = b.x - ux * (RAYON + 2) + ox;
            const y2 = b.y - uy * (RAYON + 2) + oy;
            return (
              <g key={i} className="graphe-lien">
                <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#pointe)" />
                <text x={(x1 + x2) / 2 + ox} y={(y1 + y2) / 2 + oy - 4} textAnchor="middle">
                  {l.type}
                </text>
              </g>
            );
          })}
        </svg>
        {elements.map((e) => {
          const p = pos(e.ficheId);
          const style = { left: p.x, top: p.y };
          const contenu = (
            <>
              <i aria-hidden="true">{Array.from(e.titre)[0]?.toUpperCase() ?? '?'}</i>
              <span>{titreCourt(e.titre)}</span>
            </>
          );
          if (!gerer) {
            return (
              <Link key={e.id} className="carte-token" style={style} to={adresseFiche(universId, e.ficheId)} aria-label={e.titre}>
                {contenu}
              </Link>
            );
          }
          return (
            <button
              key={e.id}
              type="button"
              className={`carte-token${selection === e.id ? ' sel' : ''}`}
              style={style}
              aria-label={e.titre}
              aria-pressed={selection === e.id}
              onClick={() => onSelection(e.id)}
            >
              {contenu}
            </button>
          );
        })}
      </div>
    </div>
  );
}
