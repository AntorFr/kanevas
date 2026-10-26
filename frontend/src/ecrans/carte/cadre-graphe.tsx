import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { disposer, enPixels, tailleCadre } from './disposition';
import { adresseFiche, titreCourt, type Element, type Lien } from './types';

const RAYON = 15;
/** Perpendicular step between the parallel links of a pair. */
const PAS = 18;

interface Boite { x: number; y: number; width: number; height: number }

/** Whether the segment enters a label's padded box, including at either endpoint. */
function traverse(boite: Boite, trait: { x1: number; y1: number; x2: number; y2: number }, marge: number) {
  let debut = 0;
  let fin = 1;
  for (const [origine, delta, min, max] of [
    [trait.x1, trait.x2 - trait.x1, boite.x - marge, boite.x + boite.width + marge],
    [trait.y1, trait.y2 - trait.y1, boite.y - marge, boite.y + boite.height + marge],
  ] as const) {
    if (Math.abs(delta) < 1e-6) {
      if (origine < min || origine > max) return false;
    } else {
      const a = (min - origine) / delta;
      const b = (max - origine) / delta;
      debut = Math.max(debut, Math.min(a, b));
      fin = Math.min(fin, Math.max(a, b));
      if (debut > fin) return false;
    }
  }
  return true;
}

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
    // One axis per pair of nodes, whatever the direction of its links: the links of the pair are
    // spread around it by a fixed step, once, so opposite links and parallel ones never share a line.
    const [premier, second] = l.de < l.vers ? [l.de, l.vers] : [l.vers, l.de];
    const a = points.get(premier)!;
    const b = points.get(second)!;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / d;
    const uy = (b.y - a.y) / d;
    const dupliquees = liens.filter((m) => points.has(m.de) && points.has(m.vers)
      && Math.min(m.de, m.vers) === premier && Math.max(m.de, m.vers) === second);
    const rang = dupliquees.indexOf(l);
    // Every parallel must still meet both discs: shrink the step when a pair carries many links.
    const pas = dupliquees.length > 1 ? Math.min(PAS, (2 * (RAYON - 2)) / (dupliquees.length - 1)) : 0;
    const decalage = (rang - (dupliquees.length - 1) / 2) * pas;
    // The ends are where the parallel meets the two discs, not the disc centres shifted.
    const coupe = Math.sqrt(Math.max(RAYON * RAYON - decalage * decalage, 0));
    const px = -uy * decalage;
    const py = ux * decalage;
    const sens = l.de === premier ? 1 : -1;
    const x1 = (sens === 1 ? a.x : b.x) + sens * ux * coupe + px;
    const y1 = (sens === 1 ? a.y : b.y) + sens * uy * coupe + py;
    const x2 = (sens === 1 ? b.x : a.x) - sens * ux * (coupe + 1) + px;
    const y2 = (sens === 1 ? b.y : a.y) - sens * uy * (coupe + 1) + py;
    return [{ l, i, x1, y1, x2, y2, x: (x1 + x2) / 2, y: (y1 + y2) / 2, nx: -uy * sens, ny: ux * sens }];
  }), [liens, points]);

  // A node's pill sits on the far side of its disc from the strokes: below or above, whichever
  // leaves it crossed by fewer strokes (measured from the real pill sizes).
  const [dessus, setDessus] = useState<Set<number>>(new Set());
  useLayoutEffect(() => {
    const cadre = zone.current?.querySelector('.graphe');
    if (!cadre) return;
    let actif = true;
    const choisir = () => {
      if (!actif) return;
      const haut = new Set<number>();
      for (const e of elements) {
        const p = points.get(e.ficheId);
        const pilule = cadre.querySelector<HTMLElement>(`[data-fiche="${e.ficheId}"] span`);
        if (!p || !pilule) continue;
        const w = pilule.offsetWidth;
        const h = pilule.offsetHeight;
        const touches = (y: number) => traits.filter((t) => traverse({ x: p.x - w / 2, y, width: w, height: h }, t, 2)).length;
        if (touches(p.y - RAYON - 2 - h) < touches(p.y + RAYON + 2)) haut.add(e.ficheId);
      }
      setDessus((avant) => (avant.size === haut.size && [...haut].every((f) => avant.has(f)) ? avant : haut));
    };
    choisir();
    void document.fonts.ready.then(choisir);
    return () => { actif = false; };
  }, [traits, points, elements]);

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
        const boiteDe = (x: number, y: number) => ({ x: x - boite.width / 2, y: y + dy, width: boite.width, height: boite.height });
        const libre = (x: number, y: number) => {
          const r = boiteDe(x, y);
          const marge = 4; // Includes the text's background stroke and breathing room.
          return r.x >= marge && r.x + r.width <= largeur - marge && r.y >= marge && r.y + r.height <= hauteur - marge
            && !obstacles.some((o) => r.x < o.x + o.width + marge && o.x < r.x + r.width + marge
              && r.y < o.y + o.height + marge && o.y < r.y + r.height + marge)
            && !traits.some((trait) => traverse(r, trait, 3));
        };
        // Anchor the measured box next to its own stroke, with 4 px of clearance.
        // Try both sides along that arrow before increasing the distance from it.
        const cote = t.ny <= 0 ? 1 : -1;
        const distance = Math.abs(t.nx) * boite.width / 2 + Math.abs(t.ny) * boite.height / 2 + 5;
        const presDuTrait = (fraction: number, ecart: number) => ({
          x: t.x + (t.x2 - t.x1) * fraction + t.nx * ecart,
          y: t.y + (t.y2 - t.y1) * fraction + t.ny * ecart - dy - boite.height / 2,
        });
        let place = presDuTrait(0, cote * distance);
        recherche: for (let rang = 0; rang < Math.ceil(hauteur / 20); rang++) {
          for (const sens of [cote, -cote]) {
            for (const fraction of [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4]) {
              const candidat = presDuTrait(fraction, sens * (distance + rang * 20));
              if (libre(candidat.x, candidat.y)) {
                place = candidat;
                break recherche;
              }
            }
          }
        }
        obstacles.push(boiteDe(place.x, place.y));
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
  }, [traits, largeur, hauteur, dessus]);

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
          const classe = `carte-token${dessus.has(e.ficheId) ? ' dessus' : ''}`;
          const contenu = (
            <>
              <i aria-hidden="true">{Array.from(e.titre)[0]?.toUpperCase() ?? '?'}</i>
              <span>{titreCourt(e.titre)}</span>
            </>
          );
          if (!gerer) {
            return (
              <Link key={e.id} className={classe} data-fiche={e.ficheId} style={style} to={adresseFiche(universId, e.ficheId)} aria-label={e.titre}>
                {contenu}
              </Link>
            );
          }
          return (
            <button
              key={e.id}
              type="button"
              className={`${classe}${selection === e.id ? ' sel' : ''}`}
              data-fiche={e.ficheId}
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
