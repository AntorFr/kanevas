import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { disposer, enPixels, tailleCadre } from './disposition';
import { adresseFiche, titreCourt, type Element, type Lien } from './types';

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
  const zone = useRef<HTMLDivElement>(null);
  const [dispo, setDispo] = useState(640);
  const [etiquettes, setEtiquettes] = useState<Array<{ x: number; y: number }>>([]);
  // The frame takes the width the page gives it; what does not fit scrolls, never overlaps.
  useLayoutEffect(() => {
    const el = zone.current;
    if (!el) return;
    const mesure = () => setDispo(el.clientWidth || 640);
    mesure();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(mesure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [n === 0]);
  const { largeur, hauteur } = tailleCadre(n, dispo);

  // The layout depends on the graph this reader received, and on the frame size, and on nothing else.
  const points = useMemo(
    () => enPixels(disposer(elements.map((e) => ({ id: e.ficheId, titre: e.titre })), liens), { largeur, hauteur }),
    [elements, liens, largeur, hauteur],
  );
  const pos = (ficheId: number) => points.get(ficheId) ?? { x: largeur / 2, y: hauteur / 2 };

  const traits = useMemo(() => liens.flatMap((l, i) => {
    if (!points.has(l.de) || !points.has(l.vers)) return [];
    const a = points.get(l.de)!;
    const b = points.get(l.vers)!;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / d;
    const uy = (b.y - a.y) / d;
    // A small side shift keeps opposite links between two nodes apart.
    // Several links on the same pair and direction: rank them, so their labels stack instead of piling up.
    const rang = liens.slice(0, i).filter((m) => m.de === l.de && m.vers === l.vers).length;
    // Parallel lines of one pair are 18 px apart, so no stroke crosses another's label.
    const ox = -uy * (7 + rang * 18);
    const oy = ux * (7 + rang * 18);
    const x1 = a.x + ux * RAYON + ox;
    const y1 = a.y + uy * RAYON + oy;
    const x2 = b.x - ux * (RAYON + 2) + ox;
    const y2 = b.y - uy * (RAYON + 2) + oy;
    return [{ l, i, x1, y1, x2, y2, x: (x1 + x2) / 2 + ox, y: (y1 + y2) / 2 + oy - 4 + rang * 14 * Math.abs(uy) }];
  }), [liens, points]);

  useLayoutEffect(() => {
    const cadre = zone.current?.querySelector('.graphe');
    if (!cadre) return;
    let actif = true;
    const placer = () => {
      if (!actif) return;
      const origine = cadre.getBoundingClientRect();
      // Measure the actual node titles and font metrics, including after web fonts load.
      const obstacles = [...cadre.querySelectorAll('.carte-token')].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x - origine.x, y: r.y - origine.y, width: r.width, height: r.height };
      });
      const textes = cadre.querySelectorAll<SVGTextElement>('.graphe-lien text');
      const places = traits.map((t, i) => {
        const texte = textes[i]!;
        const boite = texte.getBBox();
        const dy = boite.y - Number(texte.getAttribute('y'));
        const libre = (x: number, y: number) => {
          const r = { x: x - boite.width / 2, y: y + dy, width: boite.width, height: boite.height };
          const marge = 4; // Includes the text's background stroke and breathing room.
          return r.x >= marge && r.x + r.width <= largeur - marge && r.y >= marge && r.y + r.height <= hauteur - marge
            && !obstacles.some((o) => r.x < o.x + o.width + marge && o.x < r.x + r.width + marge
              && r.y < o.y + o.height + marge && o.y < r.y + r.height + marge);
        };
        // Prefer the midpoint, then nearby positions along the arrow; move off it only if necessary.
        let place = { x: t.x, y: t.y };
        recherche: for (let rang = 0; rang < Math.ceil(hauteur / 20); rang++) {
          for (const decalage of rang === 0 ? [0] : [-rang * 20, rang * 20]) {
            for (const fraction of [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4]) {
              const x = t.x + (t.x2 - t.x1) * fraction;
              const y = t.y + (t.y2 - t.y1) * fraction + decalage;
              if (libre(x, y)) {
                place = { x, y };
                break recherche;
              }
            }
          }
        }
        obstacles.push({ x: place.x - boite.width / 2, y: place.y + dy, width: boite.width, height: boite.height });
        return place;
      });
      setEtiquettes(places);
    };
    placer();
    void document.fonts.ready.then(placer);
    document.fonts.addEventListener('loadingdone', placer);
    return () => {
      actif = false;
      document.fonts.removeEventListener('loadingdone', placer);
    };
  }, [traits, largeur, hauteur]);

  if (n === 0) {
    return (
      <div className="carte-zone" ref={zone}>
        <div className="carte-cadre graphe-vide">
          <div className="carte-message vide">
            <p>{vide}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="carte-zone graphe-zone" ref={zone}>
      <div className="carte-cadre graphe" style={{ width: largeur, height: hauteur }}>
        <svg className="graphe-liens" width={largeur} height={hauteur} viewBox={`0 0 ${largeur} ${hauteur}`} aria-hidden="true">
          <defs>
            <marker id="pointe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="graphe-pointe" />
            </marker>
          </defs>
          {/* Draw every stroke before the labels, so a later arrow cannot strike through a label. */}
          {traits.map(({ i, x1, y1, x2, y2 }) => (
            <line key={i} className="graphe-trait" x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#pointe)" />
          ))}
          {traits.map(({ l, i, x, y }, index) => {
            return (
              <g key={i} className="graphe-lien">
                <text x={etiquettes[index]?.x ?? x} y={etiquettes[index]?.y ?? y} textAnchor="middle">
                  {Array.from(l.libelle).length > 40 ? `${Array.from(l.libelle).slice(0, 40).join('')}…` : l.libelle}
                </text>
                {Array.from(l.libelle).length > 40 && <title>{l.libelle}</title>}
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
