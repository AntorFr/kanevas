import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';

import type { Document } from '../outils/battlemap/cartes/types';
import type { Empreintes, Point } from '../outils/battlemap/cartes/geometrie';
import { boiteElement } from '../outils/battlemap/cartes/geometrie';
import type { Grille, PionVu, Rect } from '../outils/battlemap/table/logique';
import { ZOOM_GRAND, ZOOM_PETIT, type ImageAsset } from './canevas-carte';
import './carte-editeur.css';

interface Vue { zoom: number; ox: number; oy: number }
const bornes = (z: number) => Math.min(ZOOM_GRAND, Math.max(ZOOM_PETIT, z));
const jeton = (el: Element, nom: string) => getComputedStyle(el).getPropertyValue(nom).trim() || 'currentColor';

/** What the canvas draws over the map while a gesture lasts. */
export interface ApercuJeu { rects?: Rect[]; reveler?: boolean; pion?: { id: string; x: number; y: number } }

/** The handle the screen keeps: where the centre of what is shown is, in cells (a new token lands near it). */
export interface PoigneeJeu { centre(): Point; rect(): Rect }

/**
 * The canvas of a played map (charte, variants of « Canevas de carte » for E-29): the same drawing as the editor's, plus the fog
 * (GM: an amber hatched veil over what the players do not see; player: black), the tokens, and a view the screen can ask to fit
 * a rectangle (the GM's shared view). It filters nothing: the server sent the document filtered for this reader.
 * A press goes to the screen as a point in cell units (`pas` of a tool) or, with `libre`, pans the view.
 */
export function CanevasJeu({
  doc, tailleCase, empreinte, image, pions, selection, grille, mj, calquesMasques, apercu, libre, suivre, annonce, message,
  surBas, surBouge, surHaut, surVue, poignee,
}: {
  doc: Document;
  tailleCase: number;
  empreinte: Empreintes;
  image: (assetId: string) => ImageAsset;
  pions: readonly PionVu[];
  selection: string | null;
  grille: Grille | null;
  mj: boolean;
  /** GM: the layers the players do not see (drawn faded). */
  calquesMasques: ReadonlySet<string>;
  apercu: ApercuJeu;
  /** No tool: a drag pans the view. */
  libre: boolean;
  /** A rectangle (cells) to fit the view on; each new value replaces the view (the GM's shared view, followed). */
  suivre: Rect | null;
  annonce: string;
  message: string;
  surBas: (p: Point, ev: { shiftKey: boolean }) => boolean;
  surBouge: (p: Point) => void;
  surHaut: (p: Point) => void;
  /** The user moved or zoomed the view (not a followed one): its rectangle in cells. */
  surVue?: (r: Rect) => void;
  poignee?: Ref<PoigneeJeu>;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [taille, setTaille] = useState({ w: 0, h: 0 });
  const [vue, setVueBrut] = useState<Vue>({ zoom: 1, ox: 0, oy: 0 });
  const [, bumper] = useState(0);
  const ajuste = useRef(false);
  const actif = useRef(false);
  const pointeurs = useRef(new Map<number, Point>());
  const deplacement = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pincement = useRef<{ distance: number; zoom: number } | null>(null);
  const espace = useRef(false);
  const parUtilisateur = useRef(false);
  const echelle = vue.zoom * tailleCase;

  const setVue = useCallback((f: Vue | ((v: Vue) => Vue)) => { parUtilisateur.current = true; setVueBrut(f); }, []);

  const sur = useCallback((r: Rect, t = taille) => {
    if (t.w === 0 || r.l <= 0 || r.h <= 0) return;
    const z = bornes(Math.min(t.w / (r.l * tailleCase), t.h / (r.h * tailleCase)));
    const e = z * tailleCase;
    parUtilisateur.current = false;
    setVueBrut({ zoom: z, ox: t.w / 2 - (r.x + r.l / 2) * e, oy: t.h / 2 - (r.y + r.h / 2) * e });
  }, [taille, tailleCase]);
  const ajuster = useCallback(() => {
    if (taille.w === 0) return;
    const z = bornes(Math.min(taille.w / (doc.largeur * tailleCase), taille.h / (doc.hauteur * tailleCase)) * 0.92);
    parUtilisateur.current = true;
    setVueBrut({ zoom: z, ox: (taille.w - doc.largeur * tailleCase * z) / 2, oy: (taille.h - doc.hauteur * tailleCase * z) / 2 });
  }, [taille, doc.largeur, doc.hauteur, tailleCase]);

  useImperativeHandle(poignee, () => ({
    centre: () => ({ x: (taille.w / 2 - vue.ox) / echelle, y: (taille.h / 2 - vue.oy) / echelle }),
    rect: () => ({ x: -vue.ox / echelle, y: -vue.oy / echelle, l: taille.w / echelle, h: taille.h / echelle }),
  }), [taille, vue, echelle]);

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
      if (suivre) sur(suivre); else ajuster();
    }
  }, [taille, ajuster, suivre, sur]);

  // A followed rectangle replaces the view each time it changes (or the canvas resizes).
  const cleSuivre = suivre ? `${suivre.x},${suivre.y},${suivre.l},${suivre.h}` : '';
  useEffect(() => { if (suivre && ajuste.current) sur(suivre); }, [cleSuivre, taille]); // eslint-disable-line react-hooks/exhaustive-deps

  // The user's own moves are told to the screen (it settles them for 300 ms before sharing).
  useEffect(() => {
    if (!parUtilisateur.current || !actif.current || taille.w === 0) return;
    surVue?.({ x: -vue.ox / echelle, y: -vue.oy / echelle, l: taille.w / echelle, h: taille.h / echelle });
  }, [vue]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomerSur = useCallback((facteur: number, cx: number, cy: number) => {
    actif.current = true;
    setVue((v) => {
      const z = bornes(v.zoom * facteur);
      const k = z / v.zoom;
      return { zoom: z, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k };
    });
  }, [setVue]);

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
    return () => { window.removeEventListener('keydown', bas); window.removeEventListener('keyup', haut); };
  }, []);

  const pointDe = (ev: { clientX: number; clientY: number }): Point => {
    const r = toile.current!.getBoundingClientRect();
    return { x: (ev.clientX - r.left - vue.ox) / echelle, y: (ev.clientY - r.top - vue.oy) / echelle };
  };
  const geste = useRef(false);

  function bas(ev: React.PointerEvent<HTMLCanvasElement>) {
    toile.current!.setPointerCapture?.(ev.pointerId);
    const r = toile.current!.getBoundingClientRect();
    pointeurs.current.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
    if (pointeurs.current.size === 2) {
      geste.current = false;
      bumper((n) => n + 1);
      const [a, b] = [...pointeurs.current.values()] as [Point, Point];
      pincement.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: vue.zoom };
      deplacement.current = null;
      return;
    }
    if (ev.button === 1 || espace.current || libre) {
      actif.current = true;
      deplacement.current = { x: ev.clientX - r.left, y: ev.clientY - r.top, ox: vue.ox, oy: vue.oy };
      // A tap without a tool still reaches the screen (opening a token's sheet).
      geste.current = libre && ev.button === 0 ? surBas(pointDe(ev), ev) : false;
      return;
    }
    if (ev.button !== 0) return;
    geste.current = surBas(pointDe(ev), ev);
    // A press the tool does not take (nothing under it) pans, as with no tool.
    if (!geste.current) {
      actif.current = true;
      deplacement.current = { x: ev.clientX - r.left, y: ev.clientY - r.top, ox: vue.ox, oy: vue.oy };
    }
  }
  function bouge(ev: React.PointerEvent<HTMLCanvasElement>) {
    const r = toile.current!.getBoundingClientRect();
    if (pointeurs.current.has(ev.pointerId)) pointeurs.current.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
    if (pointeurs.current.size === 2 && pincement.current) {
      actif.current = true;
      const [a, b] = [...pointeurs.current.values()] as [Point, Point];
      const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = bornes(pincement.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / (pincement.current.distance || 1)));
      setVue((v) => { const k = z / v.zoom; return { zoom: z, ox: milieu.x - (milieu.x - v.ox) * k, oy: milieu.y - (milieu.y - v.oy) * k }; });
      return;
    }
    const d = deplacement.current;
    if (d) {
      const dx = ev.clientX - r.left - d.x;
      const dy = ev.clientY - r.top - d.y;
      if (Math.hypot(dx, dy) > 4) geste.current = false;
      setVue((v) => ({ ...v, ox: d.ox + dx, oy: d.oy + dy }));
      return;
    }
    if (geste.current) surBouge(pointDe(ev));
  }
  function haut(ev: React.PointerEvent<HTMLCanvasElement>) {
    pointeurs.current.delete(ev.pointerId);
    if (pointeurs.current.size < 2) pincement.current = null;
    const g = geste.current;
    if (deplacement.current) {
      deplacement.current = null;
      geste.current = false;
      if (g && pointeurs.current.size === 0) surHaut(pointDe(ev));
      return;
    }
    geste.current = false;
    if (g) surHaut(pointDe(ev));
  }
  function annuler() {
    pointeurs.current.clear();
    geste.current = false;
    deplacement.current = null;
    pincement.current = null;
  }

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
      encre: jeton(el, '--texte'), fond: jeton(el, '--fond'),
    };
    const joueur = !mj;
    c.fillStyle = joueur ? '#000' : t.sol;
    c.fillRect(0, 0, el.width, el.height);
    c.setTransform(dpr * echelle, 0, 0, dpr * echelle, dpr * vue.ox, dpr * vue.oy);
    c.fillStyle = t.carte;
    c.fillRect(0, 0, doc.largeur, doc.hauteur);
    const px = 1 / echelle;

    for (const calque of doc.calques) {
      if (!calque.visible) continue;
      c.globalAlpha = calquesMasques.has(calque.id) ? 0.45 : 1;
      for (const s of doc.sols) {
        if (s.calque !== calque.id) continue;
        const im = image(s.asset_id);
        if (im && im !== 'retire') c.drawImage(im, s.x, s.y, 1, 1);
        else { c.fillStyle = t.neutre; c.fillRect(s.x, s.y, 1, 1); }
        if (calque.mj_seul) { c.fillStyle = t.trame; c.fillRect(s.x, s.y, 1, 1); }
      }
    }
    c.globalAlpha = 1;
    c.strokeStyle = t.grille;
    c.lineWidth = px;
    c.beginPath();
    for (let x = 0; x <= doc.largeur; x++) { c.moveTo(x, 0); c.lineTo(x, doc.hauteur); }
    for (let y = 0; y <= doc.hauteur; y++) { c.moveTo(0, y); c.lineTo(doc.largeur, y); }
    c.stroke();

    const epais = Math.max(0.1, 3 * px);
    for (const calque of doc.calques) {
      if (!calque.visible) continue;
      c.globalAlpha = calquesMasques.has(calque.id) ? 0.45 : 1;
      for (const m of doc.murs) {
        if (m.calque !== calque.id) continue;
        const [x, y, w, h] = m.cote === 'h' ? [m.x, m.y - epais / 2, 1, epais] : [m.x - epais / 2, m.y, epais, 1];
        const im = image(m.asset_id);
        if (im && im !== 'retire') c.drawImage(im, x, y, w, h);
        else { c.fillStyle = t.texte; c.fillRect(x, y, w, h); }
        if (m.porte) {
          c.fillStyle = t.accent;
          const [a, b, w2, h2] = m.cote === 'h' ? [m.x + 0.15, m.y - epais, 0.7, epais * 2] : [m.x - epais, m.y + 0.15, epais * 2, 0.7];
          c.fillRect(a, b, w2, h2);
        }
      }
      for (const e of doc.elements) {
        if (e.calque !== calque.id) continue;
        const { largeur, hauteur } = empreinte(e.asset_id);
        const k = e.echelle ?? 1;
        const im = image(e.asset_id);
        c.save();
        c.translate(e.x, e.y);
        c.rotate(((e.rotation ?? 0) * Math.PI) / 180);
        if (e.miroir) c.scale(-1, 1);
        const [w, h] = [largeur * k, hauteur * k];
        if (im && im !== 'retire') c.drawImage(im, -w / 2, -h / 2, w, h);
        else {
          c.fillStyle = t.neutre;
          c.fillRect(-w / 2, -h / 2, w, h);
          c.setLineDash([4 * px, 3 * px]);
          c.strokeStyle = t.texte;
          c.lineWidth = px;
          c.strokeRect(-w / 2, -h / 2, w, h);
          c.setLineDash([]);
        }
        c.restore();
        if (calque.mj_seul) {
          const b = boiteElement(e, empreinte);
          c.fillStyle = t.trame;
          c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        }
      }
    }
    c.globalAlpha = 1;

    // The fog: black for a player (the unrevealed cells), an amber hatched veil for the GM.
    if (grille) {
      const cache: [number, number][] = [];
      for (let y = 0; y < doc.hauteur; y++) for (let x = 0; x < doc.largeur; x++) if (!grille.revele(x, y)) cache.push([x, y]);
      if (joueur) {
        c.fillStyle = '#000';
        for (const [x, y] of cache) c.fillRect(x, y, 1.02, 1.02);
      } else {
        c.save();
        c.beginPath();
        for (const [x, y] of cache) c.rect(x, y, 1, 1);
        c.clip();
        c.globalAlpha = 0.3;
        c.fillStyle = t.mj;
        c.fillRect(0, 0, doc.largeur, doc.hauteur);
        c.globalAlpha = 1;
        c.strokeStyle = t.mj;
        c.lineWidth = px;
        c.beginPath();
        const pas = 8 * px;
        for (let k = -doc.hauteur; k < doc.largeur + doc.hauteur; k += pas) { c.moveTo(k, 0); c.lineTo(k + doc.hauteur, doc.hauteur); }
        c.stroke();
        c.restore();
      }
    }

    // Tokens, in creation order.
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.font = `${12 * px}px sans-serif`;
    for (const p of pions) {
      const pos = apercu.pion?.id === p.id ? apercu.pion : p;
      const [x, y] = [pos.x, pos.y];
      const im = p.asset_id !== null ? image(p.asset_id) : null;
      c.globalAlpha = p.visible ? 1 : 0.45;
      if (im && im !== 'retire') c.drawImage(im, x, y, p.l, p.h);
      else {
        c.fillStyle = t.accent;
        c.beginPath();
        c.ellipse(x + p.l / 2, y + p.h / 2, p.l / 2 - 0.06, p.h / 2 - 0.06, 0, 0, Math.PI * 2);
        c.fill();
      }
      if (!p.visible) {
        c.strokeStyle = t.fond;
        c.lineWidth = 3 * px;
        c.beginPath();
        c.moveTo(x + 0.15, y + p.h - 0.15);
        c.lineTo(x + p.l - 0.15, y + 0.15);
        c.stroke();
      }
      if (selection === p.id) {
        c.globalAlpha = 1;
        c.strokeStyle = t.encre;
        c.lineWidth = 3 * px;
        c.strokeRect(x + 0.03, y + 0.03, p.l - 0.06, p.h - 0.06);
      }
      c.globalAlpha = p.visible ? 1 : 0.6;
      const nom = p.nom.length > 14 ? `${p.nom.slice(0, 13)}…` : p.nom;
      c.lineWidth = 3 * px;
      c.strokeStyle = t.fond;
      c.strokeText(nom, x + p.l / 2, y + p.h + 0.04);
      c.fillStyle = t.encre;
      c.fillText(nom, x + p.l / 2, y + p.h + 0.04);
      c.globalAlpha = 1;
    }

    if (apercu.rects?.length) {
      c.globalAlpha = 0.45;
      c.fillStyle = t.accent;
      for (const r of apercu.rects) c.fillRect(r.x, r.y, r.l, r.h);
      c.globalAlpha = 1;
    }
  }, [doc, vue, taille, pions, selection, grille, mj, calquesMasques, apercu, empreinte, image, echelle]);

  return (
    <div className="canevas-zone" ref={zone}>
      <canvas
        ref={toile}
        className="canevas-carte"
        style={{ width: taille.w, height: taille.h, touchAction: 'none' }}
        tabIndex={0}
        aria-label="Carte"
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={annuler}
      />
      <div className="sr-carte" role="status" aria-live="polite">{annonce}</div>
      {message !== '' && <div className="canevas-message" role="status">{message}</div>}
      <div className="canevas-zoom" role="group" aria-label="Zoom">
        <button type="button" className="canevas-zoom-bouton" aria-label="Zoom arrière" title="Zoom arrière" onClick={() => zoomerSur(1 / 1.25, taille.w / 2, taille.h / 2)}>
          <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" className="canevas-zoom-bouton" aria-label="Ajuster" title="Ajuster" onClick={() => { actif.current = true; ajuster(); }}>
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
