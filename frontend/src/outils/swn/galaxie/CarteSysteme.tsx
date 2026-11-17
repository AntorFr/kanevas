import { Minus, Plus, ScanSearch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PointerReact } from 'react';
import { useNavigate } from 'react-router-dom';

import { lire } from '../../../api';
import { chargerModule } from '../../../wasm/charger';
import { Alerte, BoutonIcone, Case } from '../../../ui';
import { centresNuage, coteDemande, disposer, grainsAnneau, PORTEE_COURONNE, queuesComete, rayonOrbite, U, type CorpsPlace, type Disposition, type Plan } from './carte-geometrie';
import { Sprites, dessineurDuCoeur } from './carte-sprites';
import { placerEtiquettes, type CorpsEtiquette, type EtiquettePlacee, type Obstacle } from './etiquettes';
import { nomAstre, nomFormation, placeAstre, typeAstre } from './systeme-libelles';
import type { InterieurSysteme, SortieSysteme } from './types';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
const PAS = 1.5;
const POLICE = '12px';
const HAUTEUR_ETIQUETTE = 15;

/** What a browser test reads of the map (AD-carte-4: the placement is read through a hook, never by pixels). */
export interface CroquisCarte {
  pret: boolean; largeur: number; hauteur: number; zoom: number; decalage: [number, number];
  corps: { cle: string; genre: string; x: number; y: number; rayon: number }[];
  etiquettes: EtiquettePlacee[];
  sorties: { q: number; r: number; heure: number }[];
}
declare global { interface Window { __carteSysteme?: () => CroquisCarte } }

type Etat = 'chargement' | 'pret' | 'indisponible';

interface Props {
  interieur: InterieurSysteme;
  /** `…/galaxies/:gid`, the base of the tool's routes. */
  base: string;
  /** Address of the neighbouring system: `…/interieur/` (the screen appends `q/r`). */
  adresseVoisin: string;
  /** `?mode=joueur` or empty. */
  suffixe: string;
  selection: string | null;
  onSelection: (cle: string | null) => void;
}

/** The sky's colours for the canvas, read from the tokens (a canvas cannot take a CSS variable). */
const lireTokens = (el: Element) => {
  const s = getComputedStyle(el);
  return { accent: s.getPropertyValue('--accent').trim(), trait: s.getPropertyValue('--ciel-trait').trim() };
};

/** E-23, the canvas (AD-carte-3): the interior as `lireInterieur` answered it, drawn by the core; nothing is filtered here. */
export default function CarteSysteme({ interieur, base, adresseVoisin, suffixe, selection, onSelection }: Props) {
  const navigate = useNavigate();
  const racine = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [etat, setEtat] = useState<Etat>('chargement');
  const planRef = useRef<Plan | null>(null);
  const [taille, setTaille] = useState({ w: 0, h: 0 });
  const [vue, setVue] = useState({ zoom: 1, dx: 0, dy: 0 });
  const vueRef = useRef(vue);
  vueRef.current = vue;
  const [orbites, setOrbites] = useState(true);
  const [heures, setHeures] = useState(true);
  const [sorties, setSorties] = useState<SortieSysteme[]>([]);
  const [, retracer] = useState(0);
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const reduit = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  // The core loads once per page (the socle's loader caches it); a failure puts the lists in its place.
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    let vivant = true;
    chargerModule('coeur').then(
      (c) => {
        if (!vivant) return;
        const p: Plan = (r, h) => { const v = c.orbite_heure_vers_plan(r, h); return [v[0]!, v[1]!]; };
        planRef.current = p;
        setPlan(() => p);
        setEtat('pret');
      },
      () => { if (vivant) setEtat('indisponible'); },
    );
    return () => { vivant = false; };
  }, []);

  // The exits: a second read of the tool, under the same guards; a failure draws none (the map is not blocked by it).
  useEffect(() => {
    let vivant = true;
    lire<SortieSysteme[]>(`${base}/interieur/${interieur.q}/${interieur.r}/sorties${suffixe}`).then(
      (l) => { if (vivant && Array.isArray(l)) setSorties(l); },
      () => { if (vivant) setSorties([]); },
    );
    return () => { vivant = false; };
  }, [base, interieur.q, interieur.r, suffixe]);

  const dispo: Disposition | null = useMemo(() => (plan ? disposer(interieur, plan) : null), [plan, interieur]);

  // Size of the sky.
  useEffect(() => {
    const el = racine.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(() => setTaille({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }));
    o.observe(el);
    setTaille({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    return () => o.disconnect();
  }, [etat]);

  const ajuste = dispo && taille.w > 0 ? Math.min(taille.w, taille.h) / 2 / (dispo.etendue * 1.12) : 1;
  const echelle = ajuste * vue.zoom;
  const cx = taille.w / 2 + vue.dx;
  const cy = taille.h / 2 + vue.dy;
  const ecran = useCallback((x: number, y: number): [number, number] => [cx + x * echelle, cy + y * echelle], [cx, cy, echelle]);

  // Sprites: the blurred version of every body at once, the sharp one once the zoom has settled.
  const sprites = useRef<Sprites | null>(null);
  useEffect(() => {
    const s = new Sprites(dessineurDuCoeur, () => retracer((n) => n + 1), reduit, () => setEtat('indisponible'));
    sprites.current = s;
    return () => { s.arreter(); sprites.current = null; };
  }, [reduit]);
  useEffect(() => {
    if (!dispo || taille.w === 0) return;
    const demander = () => {
      for (const c of dispo.corps) sprites.current?.demander(c.cle, c.aspect, coteDemande(c.cote * echelle, dpr));
    };
    // First pass at once (the blurred versions come first in the queue); later zooms wait for the gesture to settle.
    const t = setTimeout(demander, 0);
    return () => clearTimeout(t);
  }, [dispo, taille.w, echelle, dpr]);

  // Labels.
  const mesureur = useMemo(() => {
    const c = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    const police = racine.current ? getComputedStyle(racine.current).fontFamily : 'sans-serif';
    if (c) c.font = `${POLICE} ${police}`;
    return (t: string) => ({ largeur: Math.ceil(c ? c.measureText(t).width : t.length * 7) + 2, hauteur: HAUTEUR_ETIQUETTE });
  }, [etat]); // eslint-disable-line react-hooks/exhaustive-deps

  const cibles = useMemo(() => {
    if (!dispo) return { liste: [] as CorpsEtiquette[], sorties: [] as { q: number; r: number; x: number; y: number; nom: string }[] };
    const liste: CorpsEtiquette[] = dispo.corps.map((c) => {
      const [x, y] = ecran(c.x, c.y);
      const rayon = Math.max(4, c.rayon * echelle);
      // A star's glow is drawn out to ~0.9 of its sprite's half-side: a label does not sit on it.
      const halo = c.astre.genre === 'etoile' ? Math.max(rayon, (c.cote * echelle) / 2 * PORTEE_COURONNE) : undefined;
      return { cle: c.cle, genre: c.genre, nom: nomAstre(c.astre), x, y, rayon, ...(halo ? { halo } : {}) };
    });
    for (const z of dispo.zones) {
      const [x, y] = ecran(z.ancre[0], z.ancre[1]);
      liste.push({ cle: `zone:${z.cle}`, genre: 'zone', nom: nomFormation(z.formation), x, y, rayon: 0 });
    }
    const ex = planRef.current && dispo.transition > 0
      ? sorties.map((s) => {
        const [wx, wy] = planRef.current!(dispo.transition, s.heure);
        const [x, y] = ecran(wx, wy);
        return { q: s.q, r: s.r, x, y, nom: s.nom && s.nom !== '' ? s.nom : `Système sans nom (${s.q}, ${s.r})` };
      })
      : [];
    for (const e of ex) liste.push({ cle: `sortie:${e.q},${e.r}`, genre: 'comete', nom: e.nom, x: e.x, y: e.y, rayon: 7 });
    return { liste, sorties: ex };
  }, [dispo, ecran, echelle, sorties]);

  // What a label must clear besides the bodies: the hour marks (when drawn) and the transition circle.
  const obstacles = useMemo(() => {
    const liste: Obstacle[] = [];
    const p = planRef.current;
    if (!dispo || !p) return liste;
    const [cx, cy] = ecran(0, 0);
    if (dispo.transition > 0) liste.push({ type: 'anneau', x: cx, y: cy, rayon: dispo.transition * echelle });
    for (const c of dispo.corps) {
      if (c.genre !== 'comete') continue;
      const [x, y] = ecran(c.x, c.y);
      liste.push(...queuesComete(x, y, c.cote * echelle, c.astre.aspect));
    }
    if (heures) {
      const rh = Math.max(dispo.transition, 3 * U);
      for (let h = 0; h < 12; h += 3) {
        const [tx, ty] = ecran(...p(rh + 14 / Math.max(echelle, 0.01), h));
        const m = mesureur(`${h === 0 ? 12 : h} h`);
        liste.push({ type: 'rect', x: tx - m.largeur / 2, y: ty - m.hauteur / 2, largeur: m.largeur, hauteur: m.hauteur });
      }
    }
    return liste;
  }, [dispo, ecran, echelle, heures, mesureur, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const etiquettes = useMemo(
    () => (taille.w > 0 ? placerEtiquettes(cibles.liste, { largeur: taille.w, hauteur: taille.h, zoom: vue.zoom }, mesureur, obstacles) : []),
    [cibles, taille, vue.zoom, mesureur, obstacles],
  );

  // The canvas: zones, then sprites, then the selection ring.
  useEffect(() => {
    const t = toile.current;
    if (!t || !dispo || taille.w === 0) return;
    let image = 0;
    const tracer = () => {
      const g = t.getContext('2d');
      if (!g) return;
      const jeton = lireTokens(t);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, taille.w, taille.h);
      const p = planRef.current!;
      for (const z of dispo.zones) {
        if (z.forme === 'anneau') {
          g.fillStyle = jeton.trait;
          for (const gr of grainsAnneau(z.formation, p)) {
            const [x, y] = ecran(gr.x, gr.y);
            g.globalAlpha = gr.l;
            g.beginPath(); g.arc(x, y, Math.max(0.5, gr.r * Math.sqrt(echelle)), 0, 7); g.fill();
          }
          g.globalAlpha = 1;
        } else {
          for (const [o, h, tn] of centresNuage(z.formation)) {
            const [wx, wy] = p(rayonOrbite(o), h);
            const [x, y] = ecran(wx, wy);
            const r = Math.max(8, tn * U * echelle);
            // A soft area: concentric discs, the widest the faintest (no colour outside the tokens).
            g.fillStyle = jeton.trait;
            for (let k = 0; k < 7; k++) {
              g.globalAlpha = 0.09;
              g.beginPath(); g.arc(x, y, r * (1 - k / 7), 0, 7); g.fill();
            }
            g.globalAlpha = 1;
          }
        }
      }
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const maintenant = performance.now();
      for (const c of dispo.corps) {
        const [x, y] = ecran(c.x, c.y);
        const cote = c.cote * echelle;
        if (x + cote < 0 || y + cote < 0 || x - cote > taille.w || y - cote > taille.h) continue;
        for (const { image: im, alpha } of sprites.current?.couches(c.cle, coteDemande(cote, dpr), maintenant) ?? []) {
          g.globalAlpha = alpha;
          g.drawImage(im, x - cote / 2 + c.decalage[0] * cote, y - cote / 2 + c.decalage[1] * cote, cote, cote);
        }
        g.globalAlpha = 1;
        if (c.cle === selection) {
          g.strokeStyle = jeton.accent; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, Math.max(8, c.rayon * echelle + 5), 0, 7); g.stroke();
        }
      }
      if (sprites.current?.enFondu(performance.now())) image = requestAnimationFrame(tracer);
    };
    tracer();
    return () => cancelAnimationFrame(image);
  });

  // Gestures: drag moves the view, wheel and pinch zoom it between 0,5× and 4×.
  const zoomer = useCallback((facteur: number, px?: number, py?: number) => {
    setVue((v) => {
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * facteur));
      const k = z / v.zoom;
      const ox = (px ?? taille.w / 2) - taille.w / 2;
      const oy = (py ?? taille.h / 2) - taille.h / 2;
      return { zoom: z, dx: ox - (ox - v.dx) * k, dy: oy - (oy - v.dy) * k };
    });
  }, [taille.w, taille.h]);
  const recentrer = useCallback(() => setVue({ zoom: 1, dx: 0, dy: 0 }), []);

  useEffect(() => {
    const el = racine.current;
    if (!el || etat !== 'pret') return;
    const roue = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomer(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', roue, { passive: false });
    return () => el.removeEventListener('wheel', roue);
  }, [etat, zoomer]);

  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const geste = useRef({ bouge: false, depart: { x: 0, y: 0 }, dist: 0 });

  const abaisse = (e: PointerReact<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.current.size === 1) geste.current = { bouge: false, depart: { x: e.clientX, y: e.clientY }, dist: 0 };
    else { const [a, b] = [...pointeurs.current.values()]; geste.current.dist = Math.hypot(a!.x - b!.x, a!.y - b!.y); geste.current.bouge = true; }
  };
  const deplace = (e: PointerReact<HTMLDivElement>) => {
    const avant = pointeurs.current.get(e.pointerId);
    if (!avant) return;
    const r = racine.current!.getBoundingClientRect();
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.current.size >= 2) {
      const [a, b] = [...pointeurs.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (geste.current.dist > 0 && d > 0) zoomer(d / geste.current.dist, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
      geste.current.dist = d;
      return;
    }
    if (!geste.current.bouge && Math.hypot(e.clientX - geste.current.depart.x, e.clientY - geste.current.depart.y) < 5) return;
    geste.current.bouge = true;
    const ddx = e.clientX - avant.x, ddy = e.clientY - avant.y;
    setVue((v) => ({ ...v, dx: v.dx + ddx, dy: v.dy + ddy }));
  };
  const leve = (e: PointerReact<HTMLDivElement>) => {
    if (!pointeurs.current.delete(e.pointerId)) return;
    if (pointeurs.current.size === 0 && !geste.current.bouge && e.type === 'pointerup' && !(e.target as HTMLElement).closest('button')) {
      onSelection(null);
    }
    if (pointeurs.current.size < 2) geste.current.dist = 0;
  };

  // What a browser test reads.
  useEffect(() => {
    window.__carteSysteme = () => ({
      pret: etat === 'pret' && taille.w > 0, largeur: taille.w, hauteur: taille.h, zoom: vueRef.current.zoom, decalage: [vueRef.current.dx, vueRef.current.dy],
      corps: cibles.liste.map((c) => ({ cle: c.cle, genre: c.genre, x: c.x, y: c.y, rayon: c.rayon })),
      etiquettes,
      sorties: sorties.map((s) => ({ q: s.q, r: s.r, heure: s.heure })),
    });
    return () => { delete window.__carteSysteme; };
  });

  if (etat === 'indisponible') {
    return <Alerte>La carte ne peut pas s’afficher ici.</Alerte>;
  }

  const orbitesTracees = dispo
    ? Array.from({ length: Math.min(40, Math.max(1, Math.ceil(Math.max(
      ...interieur.astres.map((a) => (typeof a.orbite === 'number' ? a.orbite : 0)),
      ...interieur.formations.map((f) => Number(f.forme === 'anneau' ? f.parametres.a : f.parametres.orbite) || 0),
      Number(interieur.transition) || 0,
    ) - 0.3))) }, (_, i) => i + 1)
    : [];
  const rayonHeures = dispo ? Math.max(dispo.transition, 3 * U) : 0;
  const pointHeure = (h: number, r: number): [number, number] => { const p = planRef.current; return p ? ecran(...p(r, h)) : [0, 0]; };
  const [ccx, ccy] = ecran(0, 0);

  return (
    <div className="cs-carte">
      <div className="cs-controles">
        <Case etiquette="orbites" checked={orbites} onChange={(e) => setOrbites(e.target.checked)} />
        <Case etiquette="heures" checked={heures} onChange={(e) => setHeures(e.target.checked)} />
        <span className="cs-boutons">
          <BoutonIcone etiquette="Zoom avant (+)" infobulle="+" icone={Plus} onClick={() => zoomer(PAS)} />
          <BoutonIcone etiquette="Zoom arrière (−)" infobulle="−" icone={Minus} onClick={() => zoomer(1 / PAS)} />
          <BoutonIcone etiquette="Recentrer" icone={ScanSearch} onClick={recentrer} />
        </span>
      </div>
      <div
        ref={racine}
        className="cs-ciel"
        role="application"
        aria-label="Carte du système"
        aria-describedby="gx-liste-corps"
        data-zoom={vue.zoom.toFixed(3)}
        data-pret={etat === 'pret' && taille.w > 0 ? 'oui' : 'non'}
        onPointerDown={abaisse}
        onPointerMove={deplace}
        onPointerUp={leve}
        onPointerCancel={leve}
      >
        {etat === 'chargement' && <p className="cs-etat" role="status">Chargement du système…</p>}
        {dispo && taille.w > 0 && (
          <>
            <svg className="cs-traits" width={taille.w} height={taille.h} aria-hidden="true">
              {orbites && orbitesTracees.map((o) => (
                <circle key={o} className="cs-orbite" cx={ccx} cy={ccy} r={rayonOrbite(o) * echelle} />
              ))}
              {heures && Array.from({ length: 12 }, (_, h) => {
                const [x1, y1] = pointHeure(h, 0);
                const [x2, y2] = pointHeure(h, rayonHeures);
                const [tx, ty] = pointHeure(h, rayonHeures + 14 / Math.max(echelle, 0.01));
                return (
                  <g key={h} className="cs-heure" data-heure={h}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    {h % 3 === 0 && <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle">{h === 0 ? 12 : h} h</text>}
                  </g>
                );
              })}
              {dispo.transition > 0 && <circle className="cs-transition" cx={ccx} cy={ccy} r={dispo.transition * echelle} />}
            </svg>
            <canvas ref={toile} className="cs-toile" aria-hidden="true"
              width={Math.round(taille.w * dpr)} height={Math.round(taille.h * dpr)} style={{ width: taille.w, height: taille.h }} />
            {dispo.corps.map((c) => <BoutonCorps key={c.cle} c={c} ecran={ecran} echelle={echelle} choisi={c.cle === selection} onChoisir={() => onSelection(c.cle)} />)}
            {cibles.sorties.map((s) => (
              <button
                key={`${s.q},${s.r}`}
                type="button"
                className="cs-sortie"
                style={{ left: s.x, top: s.y }}
                aria-label={`Aller au système ${s.nom}`}
                onClick={() => navigate(`${adresseVoisin}${s.q}/${s.r}${suffixe}`)}
              />
            ))}
            {etiquettes.filter((e) => e.visible).map((e) => (
              <span key={e.cle} className={`cs-etiquette${e.cle.startsWith('zone:') ? ' zone' : e.cle.startsWith('sortie:') ? ' sortie' : ''}`}
                data-cle={e.cle} style={{ left: e.x, top: e.y }}>{e.texte}</span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function BoutonCorps({ c, ecran, echelle, choisi, onChoisir }: {
  c: CorpsPlace; ecran: (x: number, y: number) => [number, number]; echelle: number; choisi: boolean; onChoisir: () => void;
}) {
  const [x, y] = ecran(c.x, c.y);
  const d = Math.max(22, c.rayon * echelle * 2);
  return (
    <button
      type="button"
      className="cs-corps"
      data-cle={c.cle}
      aria-pressed={choisi}
      aria-label={`${nomAstre(c.astre)}, ${typeAstre(c.astre)}, ${placeAstre(c.astre)}`}
      style={{ left: x, top: y, width: d, height: d }}
      onClick={onChoisir}
    />
  );
}
