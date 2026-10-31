import { Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ErreurApi, lire, useConnexionPerdue } from '../../../api';
import { Bouton } from '../../../ui';
import { abreger, BLOCS_MAX, bloc, cases, COTE_BLOC, distanceHex, TAILLE_MAX, tailleMinimale, versHex, versPlan } from './geo';
import type { Reference, RouteCarte, Selection, SystemeCarte, VueBlocs, VueGalaxie, ZoneCarte } from './types';

const RACINE_3 = Math.sqrt(3);
const TAILLE_DEPART = 28;
/** Below this radius (px) the name labels collapse. */
const SEUIL_ETIQUETTES = 18;
const EN_VOL_MAX = 4;
const BLOCS_GARDES = 400;

interface Donnees {
  blocs: Map<string, [number, number][]>;
  systemes: Map<string, SystemeCarte>;
  routes: Map<number, RouteCarte>;
  zones: Map<number, ZoneCarte>;
  /** `q,r` of the defined systems: the generated hexagon under one is not drawn. */
  occupes: Set<string>;
}
const vide = (): Donnees => ({ blocs: new Map(), systemes: new Map(), routes: new Map(), zones: new Map(), occupes: new Set() });
const cleBloc = (bx: number, by: number) => `${bx},${by}`;

interface Vue { vx: number; vy: number; s: number }

export interface PropsCarte {
  base: string;
  suffixe: string;
  galaxie: VueGalaxie;
  selection: Selection | null;
  onSelection: (s: Selection | null) => void;
  /** The system the distances are measured from: the chosen departure, else the galaxy's reference. */
  mesure: Reference | null;
  chemin: { q: number; r: number }[];
  /** A request to centre the view (a link, a search result); `n` makes each request distinct. */
  centrer: { q: number; r: number; n: number } | null;
  onIntrouvable: () => void;
  onVide: (vide: boolean) => void;
}

/** The hexagonal SVG: pan, zoom, pinch, and only the blocks it shows (AD-132, AD-133). */
export function CarteHex({ base, suffixe, galaxie, selection, onSelection, mesure, chemin, centrer, onIntrouvable, onVide }: PropsCarte) {
  const perdue = useConnexionPerdue();
  const cadre = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [taille, setTaille] = useState({ w: 600, h: 400 });
  const depart = galaxie.reference ?? { q: 0, r: 0 };
  const [vue, setVue] = useState<Vue>(() => {
    const p = versPlan(depart.q, depart.r);
    return { vx: p.x, vy: p.y, s: TAILLE_DEPART };
  });
  const [donnees, setDonnees] = useState<Donnees>(vide);
  const [premier, setPremier] = useState(true);
  const [echec, setEchec] = useState(false);
  const [relance, setRelance] = useState(0);
  const [survol, setSurvol] = useState<{ cle: string; x: number; y: number } | null>(null);
  const [legende, setLegende] = useState(false);
  const enVol = useRef(new Set<string>());
  const encours = useRef(0);
  const vueRef = useRef(vue);
  vueRef.current = vue;

  const sMin = tailleMinimale(taille.w, taille.h);
  const borne = useCallback((s: number) => Math.min(TAILLE_MAX, Math.max(sMin, s)), [sMin]);

  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const lireTaille = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setTaille({ w: r.width, h: r.height });
    };
    lireTaille();
    if (typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(lireTaille);
    o.observe(el);
    return () => o.disconnect();
  }, []);

  useEffect(() => { setVue((v) => (v.s < sMin ? { ...v, s: sMin } : v)); }, [sMin]);

  useEffect(() => {
    if (!centrer) return;
    const p = versPlan(centrer.q, centrer.r);
    setVue((v) => ({ ...v, vx: p.x, vy: p.y }));
  }, [centrer]);

  // ----- Which blocks does the view show?
  const visibles = useMemo(() => {
    const { w, h } = taille;
    const coins = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].map(([dx, dy]) => {
      const x = vue.vx + dx! / vue.s;
      const y = vue.vy + dy! / vue.s;
      return { q: (RACINE_3 / 3) * x - y / 3, r: (2 / 3) * y };
    });
    const qs = coins.map((c) => c.q);
    const rs = coins.map((c) => c.r);
    return {
      bx0: bloc(Math.min(...qs) - 1), bx1: bloc(Math.max(...qs) + 1),
      by0: bloc(Math.min(...rs) - 1), by1: bloc(Math.max(...rs) + 1),
    };
  }, [vue, taille]);

  // Missing blocks are asked 150 ms after the view settles, in rectangles of at most 12 × 12 blocks.
  useEffect(() => {
    if (echec) return;
    const t = setTimeout(() => {
      const manquants: [number, number][] = [];
      for (let by = visibles.by0; by <= visibles.by1; by++) {
        for (let bx = visibles.bx0; bx <= visibles.bx1; bx++) {
          const k = cleBloc(bx, by);
          if (!donnees.blocs.has(k) && !enVol.current.has(k)) manquants.push([bx, by]);
        }
      }
      if (manquants.length === 0) return;
      const bxs = manquants.map((m) => m[0]);
      const bys = manquants.map((m) => m[1]);
      const x0 = Math.min(...bxs), x1 = Math.max(...bxs), y0 = Math.min(...bys), y1 = Math.max(...bys);
      for (let ty = y0; ty <= y1; ty += BLOCS_MAX) {
        for (let tx = x0; tx <= x1; tx += BLOCS_MAX) {
          const ax = Math.min(tx + BLOCS_MAX - 1, x1);
          const ay = Math.min(ty + BLOCS_MAX - 1, y1);
          if (!manquants.some(([bx, by]) => bx >= tx && bx <= ax && by >= ty && by <= ay)) continue;
          if (encours.current >= EN_VOL_MAX) return;
          const cles: string[] = [];
          for (let by = ty; by <= ay; by++) for (let bx = tx; bx <= ax; bx++) cles.push(cleBloc(bx, by));
          cles.forEach((k) => enVol.current.add(k));
          encours.current++;
          lire<VueBlocs>(`${base}/blocs?de=${tx},${ty}&a=${ax},${ay}${suffixe ? `&${suffixe.slice(1)}` : ''}`).then(
            (v) => {
              setDonnees((d) => fusion(d, v, cles, vueRef.current));
              setPremier(false);
            },
            (e: unknown) => {
              if (e instanceof ErreurApi && e.statut === 404) return onIntrouvable();
              setEchec(true);
              setPremier(false);
            },
          ).finally(() => {
            cles.forEach((k) => enVol.current.delete(k));
            encours.current--;
            setRelance((n) => n + 1);
          });
        }
      }
    }, 150);
    return () => clearTimeout(t);
  }, [visibles, donnees.blocs, echec, relance, base, suffixe, onIntrouvable]);

  useEffect(() => { onVide(!premier && donnees.systemes.size === 0 && !galaxie.reference); }, [premier, donnees.systemes.size, galaxie.reference, onVide]);

  // ----- Gestures: drag, wheel, pinch (Pointer Events, two pointers).
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const geste = useRef<{ bouge: boolean; d0: number; s0: number; ancre: { x: number; y: number }; depart: { x: number; y: number } | null }>({
    bouge: false, d0: 0, s0: 0, ancre: { x: 0, y: 0 }, depart: null,
  });
  const position = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const versUnite = (p: { x: number; y: number }, v: Vue) => ({ x: v.vx + (p.x - taille.w / 2) / v.s, y: v.vy + (p.y - taille.h / 2) / v.s });
  const zoomerAutour = (v: Vue, s: number, p: { x: number; y: number }): Vue => {
    const a = versUnite(p, v);
    return { s, vx: a.x - (p.x - taille.w / 2) / s, vy: a.y - (p.y - taille.h / 2) / s };
  };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const roue = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      setVue((v) => zoomerAutour(v, borne(v.s * Math.exp(-e.deltaY / 400)), p));
    };
    el.addEventListener('wheel', roue, { passive: false });
    return () => el.removeEventListener('wheel', roue);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const distancePointeurs = () => {
    const [a, b] = [...pointeurs.current.values()];
    return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } } : null;
  };

  const capter = (id: number) => {
    try { svg.current?.setPointerCapture(id); } catch { /* a synthetic pointer cannot be captured */ }
  };

  function bas(e: React.PointerEvent) {
    pointeurs.current.set(e.pointerId, position(e));
    const g = geste.current;
    if (pointeurs.current.size === 1) {
      g.bouge = false;
      g.depart = position(e);
    } else if (pointeurs.current.size === 2) {
      const dm = distancePointeurs()!;
      g.d0 = Math.max(dm.d, 1);
      g.s0 = vueRef.current.s;
      g.ancre = versUnite(dm.m, vueRef.current);
      g.bouge = true;
      capter(e.pointerId);
    }
  }
  function deplace(e: React.PointerEvent) {
    const avant = pointeurs.current.get(e.pointerId);
    if (!avant) return;
    const p = position(e);
    pointeurs.current.set(e.pointerId, p);
    const g = geste.current;
    if (pointeurs.current.size >= 2) {
      const dm = distancePointeurs()!;
      const s = borne((g.s0 * dm.d) / g.d0);
      setVue({ s, vx: g.ancre.x - (dm.m.x - taille.w / 2) / s, vy: g.ancre.y - (dm.m.y - taille.h / 2) / s });
      return;
    }
    if (!g.bouge && g.depart && Math.hypot(p.x - g.depart.x, p.y - g.depart.y) > 4) {
      g.bouge = true;
      capter(e.pointerId);
    }
    if (g.bouge) setVue((v) => ({ ...v, vx: v.vx - (p.x - avant.x) / v.s, vy: v.vy - (p.y - avant.y) / v.s }));
  }
  function haut(e: React.PointerEvent) {
    pointeurs.current.delete(e.pointerId);
    if (pointeurs.current.size === 1) {
      // Back to one finger after a pinch: continue as a drag from where it stands.
      geste.current.depart = null;
    }
    if (pointeurs.current.size === 0) setTimeout(() => { geste.current.bouge = false; }, 0);
  }

  function toucheVide(e: React.MouseEvent) {
    if (geste.current.bouge) return;
    const p = position(e);
    const u = versUnite(p, vue);
    const h = versHex(u.x, u.y);
    const b = donnees.blocs.get(cleBloc(bloc(h.q), bloc(h.r)));
    if (b?.some(([q, r]) => q === h.q && r === h.r)) onSelection({ k: 'genere', q: h.q, r: h.r });
  }

  // ----- Drawing
  const px = (q: number, r: number) => {
    const p = versPlan(q, r);
    return { x: (p.x - vue.vx) * vue.s + taille.w / 2, y: (p.y - vue.vy) * vue.s + taille.h / 2 };
  };
  const systemes = [...donnees.systemes.values()];
  const rayon = (t: number) => vue.s * (0.22 + 0.08 * t);
  const dist = (q: number, r: number) => (mesure ? distanceHex({ q, r }, mesure) : null);
  const survole = survol ? donnees.systemes.get(survol.cle) : undefined;
  const manquants: { bx: number; by: number }[] = [];
  for (let by = visibles.by0; by <= visibles.by1; by++) for (let bx = visibles.bx0; bx <= visibles.bx1; bx++) {
    if (!donnees.blocs.has(cleBloc(bx, by))) manquants.push({ bx, by });
  }
  const blocPoly = ({ bx, by }: { bx: number; by: number }) => [[0, 0], [1, 0], [1, 1], [0, 1]]
    .map(([a, b]) => px(COTE_BLOC * (bx + a! ) - 0.5, COTE_BLOC * (by + b!) - 0.5)).map((p) => `${p.x},${p.y}`).join(' ');
  const l = RACINE_3 * vue.s;
  const decal = { x: taille.w / 2 - vue.vx * vue.s, y: taille.h / 2 - vue.vy * vue.s };
  const hexPath = (cx: number, cy: number) => {
    const pts = [30, 90, 150, 210, 270, 330].map((deg) => {
      const a = (Math.PI / 180) * deg;
      return `${cx + vue.s * Math.cos(a)},${cy + vue.s * Math.sin(a)}`;
    });
    return `M${pts.join('L')}Z`;
  };
  const ligne = chemin.map((c) => px(c.q, c.r)).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="gx-carte" ref={cadre}>
      <svg
        ref={svg}
        className="gx-svg"
        role="img"
        aria-label="Carte de la galaxie"
        onPointerDown={bas}
        onPointerMove={deplace}
        onPointerUp={haut}
        onPointerCancel={haut}
        onClick={toucheVide}
      >
        <defs>
          <pattern id="gx-grille" patternUnits="userSpaceOnUse" width={l} height={3 * vue.s} patternTransform={`translate(${decal.x} ${decal.y})`}>
            {[[0, 0], [l, 0], [0, 3 * vue.s], [l, 3 * vue.s], [l / 2, 1.5 * vue.s]].map(([cx, cy]) => <path key={`${cx}-${cy}`} d={hexPath(cx!, cy!)} className="gx-grille" />)}
          </pattern>
          <pattern id="gx-hachure" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" className="gx-hachure" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#gx-grille)" />
        {manquants.map((m) => <polygon key={cleBloc(m.bx, m.by)} points={blocPoly(m)} fill="url(#gx-hachure)" className="gx-manquant" />)}
        {[...donnees.zones.values()].map((z) => {
          const pts = z.contour.map(([q, r]) => px(q, r));
          const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
          return (
            <g key={z.id} className={`gx-zone gx-c-${z.couleur}${z.secret ? ' secrete' : ''}`}>
              <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
              {vue.s >= SEUIL_ETIQUETTES && <text x={c.x} y={c.y} textAnchor="middle">{abreger(z.nom)}{z.secret ? ' · Secret' : ''}</text>}
            </g>
          );
        })}
        {[...donnees.routes.values()].map((r) => {
          const a = px(r.depuis.q, r.depuis.r);
          const b = px(r.vers.q, r.vers.r);
          const prive = r.publique === false;
          return (
            <g key={r.id} className={`gx-route${prive ? ' privee' : ''}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={prive ? '6 5' : undefined} />
              {prive && vue.s >= SEUIL_ETIQUETTES && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">Privée</text>}
            </g>
          );
        })}
        {chemin.length > 1 && <polyline className="gx-chemin" points={ligne} fill="none" />}
        {[...donnees.blocs.values()].flatMap((g) => g).map(([q, r]) => {
          const p = px(q, r);
          if (p.x < -40 || p.y < -40 || p.x > taille.w + 40 || p.y > taille.h + 40) return null;
          const occupe = donnees.occupes.has(`${q},${r}`);
          return occupe ? null : <circle key={`${q},${r}`} className="gx-genere" cx={p.x} cy={p.y} r={vue.s * 0.2}
            data-genere={`${q},${r}`} />;
        })}
        {systemes.map((s) => {
          const p = px(s.q, s.r);
          if (p.x < -60 || p.y < -60 || p.x > taille.w + 60 || p.y > taille.h + 60) return null;
          const choisi = selection?.k === 'systeme' && selection.cle === s.cle;
          const rr = rayon(s.taille);
          return (
            <g
              key={s.cle}
              className={`gx-systeme gx-c-${s.couleur}${choisi ? ' choisi' : ''}${s.secret ? ' secret' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={s.nom}
              aria-pressed={choisi}
              data-systeme={s.cle}
              onClick={(e) => { e.stopPropagation(); if (!geste.current.bouge) onSelection({ k: 'systeme', cle: s.cle, secret: s.secret }); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelection({ k: 'systeme', cle: s.cle, secret: s.secret }); } }}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setSurvol({ cle: s.cle, x: p.x, y: p.y }); }}
              onPointerLeave={() => setSurvol(null)}
            >
              <circle className="gx-zone-touche" cx={p.x} cy={p.y} r={Math.max(rr, 22)} />
              {choisi && <circle className="gx-halo" cx={p.x} cy={p.y} r={rr + 5} />}
              {mesure?.cle === s.cle && <circle className="gx-depart" cx={p.x} cy={p.y} r={rr + 3} />}
              <circle className="gx-point" cx={p.x} cy={p.y} r={rr} />
              {(vue.s >= SEUIL_ETIQUETTES || choisi) && <text x={p.x} y={p.y + Math.max(rr, 22) - 6 + 14} textAnchor="middle">{abreger(s.nom)}</text>}
            </g>
          );
        })}
      </svg>
      {premier && !echec && <p className="gx-chargement" role="status">Chargement de la carte…</p>}
      {survole && (
        <p className="gx-etiquette" role="tooltip" style={{ left: survol!.x, top: survol!.y - Math.max(rayon(survole.taille), 22) - 4 }}>
          {mesure && mesure.cle !== survole.cle ? `${survole.nom} · ${cases(distanceHex(survole, mesure))}` : survole.nom}
        </p>
      )}
      {echec && (
        <div className="gx-echec echec" role="alert">
          Impossible de charger une partie de la carte.{' '}
          <Bouton petit onClick={() => { setEchec(false); setRelance((n) => n + 1); }}>Réessayer</Bouton>
        </div>
      )}
      <div className="gx-zoom">
        <Bouton aria-label="Zoom avant" title="Zoom avant" onClick={() => setVue((v) => ({ ...v, s: borne(v.s * 1.4) }))} disabled={vue.s >= TAILLE_MAX}><Plus size={16} aria-hidden="true" /></Bouton>
        <Bouton aria-label="Zoom arrière" title="Zoom arrière" onClick={() => setVue((v) => ({ ...v, s: borne(v.s / 1.4) }))} disabled={vue.s <= sMin + 1e-6}><Minus size={16} aria-hidden="true" /></Bouton>
        <Bouton onClick={() => { const p = versPlan(depart.q, depart.r); setVue({ vx: p.x, vy: p.y, s: borne(TAILLE_DEPART) }); }}>Recentrer</Bouton>
      </div>
      <div className="gx-legende-zone">
        <Bouton className="gx-legende-bouton" aria-expanded={legende} onClick={() => setLegende((o) => !o)}>Légende</Bouton>
        <ul className={`gx-legende${legende ? ' ouverte' : ''}`} aria-label="Légende">
          <li><span className="gx-p systeme" />Système</li>
          <li><span className="gx-p choisi" />Sélectionné</li>
          <li><span className="gx-p depart" />Départ / arrivée</li>
          <li><span className="gx-p route" />Route</li>
          <li><span className="gx-p zone" />Zone</li>
        </ul>
      </div>
    </div>
  );
}

/** Merges an answer into the store; blocks far from the view are dropped when too many are kept. */
function fusion(d: Donnees, v: VueBlocs, demandes: string[], vue: Vue): Donnees {
  const blocs = new Map(d.blocs);
  for (const k of demandes) blocs.set(k, []);
  for (const b of v.blocs) blocs.set(cleBloc(b.bx, b.by), b.generes);
  if (blocs.size > BLOCS_GARDES) {
    const q0 = (RACINE_3 / 3) * vue.vx - vue.vy / 3;
    const r0 = (2 / 3) * vue.vy;
    const loin = [...blocs.keys()].sort((a, b) => ecart(b, q0, r0) - ecart(a, q0, r0));
    for (const k of loin.slice(0, blocs.size - BLOCS_GARDES)) blocs.delete(k);
  }
  const systemes = new Map(d.systemes);
  for (const s of v.systemes) systemes.set(s.cle, s);
  const occupes = new Set(d.occupes);
  for (const s of v.systemes) occupes.add(`${s.q},${s.r}`);
  const routes = new Map(d.routes);
  for (const r of v.routes) routes.set(r.id, r);
  const zones = new Map(d.zones);
  for (const z of v.zones) zones.set(z.id, z);
  return { blocs, systemes, routes, zones, occupes };
}
const ecart = (k: string, q0: number, r0: number) => {
  const [bx, by] = k.split(',').map(Number) as [number, number];
  return Math.hypot(bx * COTE_BLOC + 2 - q0, by * COTE_BLOC + 2 - r0);
};
