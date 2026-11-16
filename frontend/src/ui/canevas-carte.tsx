import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Apercu, Interaction, Issue } from '../outils/battlemap/cartes/interaction';
import type { Document } from '../outils/battlemap/cartes/types';
import type { Empreintes, Point } from '../outils/battlemap/cartes/geometrie';
import { boiteElement } from '../outils/battlemap/cartes/geometrie';
import './carte-editeur.css';

export const ZOOM_PETIT = 0.25;
export const ZOOM_GRAND = 4;

/** The image of an asset: loading, a placeholder for a removed one, or the picture. */
export type ImageAsset = HTMLImageElement | 'retire' | null;

interface Vue { zoom: number; ox: number; oy: number }

const bornes = (z: number) => Math.min(ZOOM_GRAND, Math.max(ZOOM_PETIT, z));

/** The colour of a token, read where the canvas is (the two themes), never written in the drawing code. */
function jeton(el: Element, nom: string): string {
  return getComputedStyle(el).getPropertyValue(nom).trim() || 'currentColor';
}

/**
 * The canvas of the map (charte, « Canevas de carte »): Canvas 2D drawn from the document it is given (the server sent it
 * filtered; this draws, it filters nothing). Wheel / pinch zoom 25–400 %, pan by space-drag, middle-drag or two fingers.
 * The tools' gestures are `Interaction`s made by `commencer`; this component only turns the pointer into cell units.
 */
export function CanevasCarte({
  doc, tailleCase, empreinte, image, selection, commencer, surIssue, lecture, annonce, vide, enChargement, surTouche,
}: {
  doc: Document;
  /** Pixels of a cell at 100 %. */
  tailleCase: number;
  empreinte: Empreintes;
  image: (assetId: string) => ImageAsset;
  selection: readonly string[];
  /** The gesture a press starts (`null`: the tool cannot start here, its message already said). */
  commencer: (p: Point, maj: boolean) => Interaction | null;
  surIssue: (issue: Issue) => void;
  /** Phone: one finger pans, a tap selects, no tool draws. */
  lecture: boolean;
  /** Polite summary for the live region. */
  annonce: string;
  vide: boolean;
  /** Bumped by the parent when an image arrives: redraw. */
  enChargement: number;
  surTouche: (ev: React.KeyboardEvent) => void;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [taille, setTaille] = useState({ w: 0, h: 0 });
  const [vue, setVue] = useState<Vue>({ zoom: 1, ox: 0, oy: 0 });
  const ajuste = useRef(false);
  const geste = useRef<Interaction | null>(null);
  const [apercu, setApercu] = useState<Apercu>({});
  const pointeurs = useRef(new Map<number, Point>());
  const deplacement = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pincement = useRef<{ distance: number; zoom: number } | null>(null);
  const espace = useRef(false);

  const echelle = vue.zoom * tailleCase;

  const ajuster = useCallback(() => {
    if (taille.w === 0) return;
    const z = bornes(Math.min(taille.w / (doc.largeur * tailleCase), taille.h / (doc.hauteur * tailleCase)) * 0.92);
    setVue({ zoom: z, ox: (taille.w - doc.largeur * tailleCase * z) / 2, oy: (taille.h - doc.hauteur * tailleCase * z) / 2 });
  }, [taille, doc.largeur, doc.hauteur, tailleCase]);

  useLayoutEffect(() => {
    const el = zone.current;
    if (!el) return;
    const mesurer = () => setTaille({ w: el.clientWidth, h: el.clientHeight });
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(mesurer);
    o.observe(el);
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    if (!ajuste.current && taille.w > 0) {
      ajuste.current = true;
      ajuster();
    }
  }, [taille, ajuster]);

  const zoomerSur = useCallback((facteur: number, cx: number, cy: number) => {
    setVue((v) => {
      const z = bornes(v.zoom * facteur);
      const k = z / v.zoom;
      return { zoom: z, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k };
    });
  }, []);

  // The wheel must be able to prevent the page scroll: a non-passive native listener.
  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    const roue = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoomerSur(ev.deltaY < 0 ? 1.1 : 1 / 1.1, ev.clientX - r.left, ev.clientY - r.top);
    };
    el.addEventListener('wheel', roue, { passive: false });
    return () => el.removeEventListener('wheel', roue);
  }, [zoomerSur]);

  useEffect(() => {
    const bas = (ev: KeyboardEvent) => { if (ev.code === 'Space') espace.current = true; };
    const haut = (ev: KeyboardEvent) => { if (ev.code === 'Space') espace.current = false; };
    window.addEventListener('keydown', bas);
    window.addEventListener('keyup', haut);
    return () => {
      window.removeEventListener('keydown', bas);
      window.removeEventListener('keyup', haut);
    };
  }, []);

  const pointDe = (ev: { clientX: number; clientY: number }): Point => {
    const r = toile.current!.getBoundingClientRect();
    return { x: (ev.clientX - r.left - vue.ox) / echelle, y: (ev.clientY - r.top - vue.oy) / echelle };
  };

  function bas(ev: React.PointerEvent<HTMLCanvasElement>) {
    toile.current!.setPointerCapture?.(ev.pointerId);
    toile.current!.focus();
    const r = toile.current!.getBoundingClientRect();
    pointeurs.current.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
    if (pointeurs.current.size === 2) {
      // Two fingers: pinch and pan; any gesture in progress is dropped.
      geste.current = null;
      setApercu({});
      const [a, b] = [...pointeurs.current.values()] as [Point, Point];
      pincement.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: vue.zoom };
      deplacement.current = null;
      return;
    }
    if (ev.button === 1 || espace.current || lecture) {
      deplacement.current = { x: ev.clientX - r.left, y: ev.clientY - r.top, ox: vue.ox, oy: vue.oy };
      // In reading mode a tap (no move) still selects: the gesture is kept and dropped as soon as the finger moves.
      geste.current = lecture && ev.button === 0 ? commencer(pointDe(ev), ev.shiftKey) : null;
      return;
    }
    if (ev.button !== 0) return;
    geste.current = commencer(pointDe(ev), ev.shiftKey);
    setApercu(geste.current?.apercu() ?? {});
  }

  function bouge(ev: React.PointerEvent<HTMLCanvasElement>) {
    const r = toile.current!.getBoundingClientRect();
    if (pointeurs.current.has(ev.pointerId)) pointeurs.current.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
    if (pointeurs.current.size === 2 && pincement.current) {
      const [a, b] = [...pointeurs.current.values()] as [Point, Point];
      const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = bornes(pincement.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / (pincement.current.distance || 1)));
      setVue((v) => {
        const k = z / v.zoom;
        return { zoom: z, ox: milieu.x - (milieu.x - v.ox) * k, oy: milieu.y - (milieu.y - v.oy) * k };
      });
      return;
    }
    const d = deplacement.current;
    if (d) {
      const dx = ev.clientX - r.left - d.x;
      const dy = ev.clientY - r.top - d.y;
      if (Math.hypot(dx, dy) > 4) geste.current = null; // it was a pan, not a tap
      setVue((v) => ({ ...v, ox: d.ox + dx, oy: d.oy + dy }));
      return;
    }
    if (geste.current) {
      geste.current.deplacer(pointDe(ev), ev.shiftKey);
      setApercu(geste.current.apercu());
    }
  }

  function haut(ev: React.PointerEvent<HTMLCanvasElement>) {
    pointeurs.current.delete(ev.pointerId);
    if (pointeurs.current.size < 2) pincement.current = null;
    if (deplacement.current) {
      deplacement.current = null;
      const g = geste.current; // a tap in reading mode
      geste.current = null;
      if (g && pointeurs.current.size === 0) surIssue(g.terminer());
      return;
    }
    const g = geste.current;
    geste.current = null;
    setApercu({});
    if (g) surIssue(g.terminer());
  }

  function annuler() {
    pointeurs.current.clear();
    geste.current = null;
    deplacement.current = null;
    pincement.current = null;
    setApercu({});
  }

  // The drawing.
  useEffect(() => {
    const el = toile.current;
    if (!el || taille.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(taille.w * dpr);
    el.height = Math.round(taille.h * dpr);
    const c = el.getContext('2d');
    if (!c) return;
    const t = {
      sol: jeton(el, '--surface-2'), carte: jeton(el, '--surface'), grille: jeton(el, '--bord'), accent: jeton(el, '--accent'),
      mj: jeton(el, '--mj-bord'), trame: jeton(el, '--mj-trame'), texte: jeton(el, '--texte-3'), neutre: jeton(el, '--surface-3'),
    };
    c.fillStyle = t.sol;
    c.fillRect(0, 0, el.width, el.height);
    c.setTransform(dpr * echelle, 0, 0, dpr * echelle, dpr * vue.ox, dpr * vue.oy);
    c.fillStyle = t.carte;
    c.fillRect(0, 0, doc.largeur, doc.hauteur);
    const px = 1 / echelle;

    for (const calque of doc.calques) {
      if (!calque.visible) continue;
      for (const s of doc.sols) {
        if (s.calque !== calque.id) continue;
        const im = image(s.asset_id);
        if (im && im !== 'retire') c.drawImage(im, s.x, s.y, 1, 1);
        else { c.fillStyle = t.neutre; c.fillRect(s.x, s.y, 1, 1); }
        if (calque.mj_seul) { c.fillStyle = t.trame; c.fillRect(s.x, s.y, 1, 1); }
      }
    }
    // The grid sits over the floors, under the walls and the objects.
    c.strokeStyle = t.grille;
    c.lineWidth = px;
    c.beginPath();
    for (let x = 0; x <= doc.largeur; x++) { c.moveTo(x, 0); c.lineTo(x, doc.hauteur); }
    for (let y = 0; y <= doc.hauteur; y++) { c.moveTo(0, y); c.lineTo(doc.largeur, y); }
    c.stroke();

    const epais = Math.max(0.1, 3 * px);
    for (const calque of doc.calques) {
      if (!calque.visible) continue;
      for (const m of doc.murs) {
        if (m.calque !== calque.id) continue;
        const [x, y, w, h] = m.cote === 'h' ? [m.x, m.y - epais / 2, 1, epais] : [m.x - epais / 2, m.y, epais, 1];
        const im = image(m.asset_id);
        if (im && im !== 'retire') c.drawImage(im, x, y, w, h);
        else { c.fillStyle = t.texte; c.fillRect(x, y, w, h); }
        if (m.porte) {
          c.fillStyle = t.accent;
          const [px0, py0, pw, ph] = m.cote === 'h' ? [m.x + 0.15, m.y - epais, 0.7, epais * 2] : [m.x - epais, m.y + 0.15, epais * 2, 0.7];
          c.fillRect(px0, py0, pw, ph);
        }
      }
      for (const e of doc.elements) {
        if (e.calque !== calque.id) continue;
        const b = boiteElement(e, empreinte);
        const { largeur, hauteur } = empreinte(e.asset_id);
        const echelleE = e.echelle ?? 1;
        const im = image(e.asset_id);
        c.save();
        c.translate(e.x, e.y);
        c.rotate(((e.rotation ?? 0) * Math.PI) / 180);
        if (e.miroir) c.scale(-1, 1);
        const [w, h] = [largeur * echelleE, hauteur * echelleE];
        if (im && im !== 'retire') c.drawImage(im, -w / 2, -h / 2, w, h);
        else {
          c.fillStyle = t.neutre;
          c.fillRect(-w / 2, -h / 2, w, h);
          c.setLineDash([4 * px, 3 * px]);
          c.strokeStyle = t.texte;
          c.lineWidth = px;
          c.strokeRect(-w / 2, -h / 2, w, h);
        }
        c.restore();
        if (calque.mj_seul) {
          c.fillStyle = t.trame;
          c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
          c.setLineDash([4 * px, 3 * px]);
          c.strokeStyle = t.mj;
          c.lineWidth = px;
          c.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
          c.setLineDash([]);
        }
      }
    }

    // Selection: a 2 px outline and 8 px handles.
    c.setLineDash([]);
    for (const id of selection) {
      const e = doc.elements.find((x) => x.id === id);
      if (!e) continue;
      const b0 = boiteElement(e, empreinte);
      const dx = apercu.decalage?.x ?? 0;
      const dy = apercu.decalage?.y ?? 0;
      const b = { x0: b0.x0 + dx, y0: b0.y0 + dy, x1: b0.x1 + dx, y1: b0.y1 + dy };
      c.strokeStyle = t.accent;
      c.lineWidth = 2 * px;
      c.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      c.fillStyle = t.accent;
      for (const [hx, hy] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]] as const) c.fillRect(hx - 4 * px, hy - 4 * px, 8 * px, 8 * px);
    }
    // The gesture in progress.
    c.globalAlpha = 0.45;
    c.fillStyle = t.accent;
    for (const k of apercu.cellules ?? []) c.fillRect(k.x, k.y, 1, 1);
    c.globalAlpha = 1;
    c.fillStyle = t.accent;
    for (const s of apercu.segments ?? []) {
      const [x, y, w, h] = s.cote === 'h' ? [s.x, s.y - epais / 2, 1, epais] : [s.x - epais / 2, s.y, epais, 1];
      c.fillRect(x, y, w, h);
    }
    if (apercu.cadre) {
      const b = apercu.cadre;
      c.setLineDash([4 * px, 3 * px]);
      c.strokeStyle = t.accent;
      c.lineWidth = px;
      c.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
  }, [doc, vue, taille, apercu, selection, empreinte, image, echelle, enChargement]);

  return (
    <div className="canevas-zone" ref={zone}>
      <canvas
        ref={toile}
        className="canevas-carte"
        style={{ width: taille.w, height: taille.h }}
        tabIndex={0}
        aria-label="Carte"
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={annuler}
        onKeyDown={surTouche}
      />
      <div className="sr-carte" role="status" aria-live="polite">{annonce}</div>
      {vide && <p className="canevas-conseil">Choisissez un outil à gauche, puis cliquez sur la grille.</p>}
      <div className="canevas-zoom" role="group" aria-label="Zoom">
        <button type="button" className="canevas-zoom-bouton" aria-label="Zoom arrière" title="Zoom arrière" onClick={() => zoomerSur(1 / 1.25, taille.w / 2, taille.h / 2)}>
          <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" className="canevas-zoom-bouton" aria-label="Ajuster" title="Ajuster" onClick={ajuster}>
          <Maximize2 size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span className="canevas-zoom-valeur" aria-live="off">{Math.round(vue.zoom * 100)} %</span>
        <button type="button" className="canevas-zoom-bouton" aria-label="Zoom avant" title="Zoom avant" onClick={() => zoomerSur(1.25, taille.w / 2, taille.h / 2)}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
