import { Minus, Plus, ScanSearch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PointerReact } from 'react';
import { useNavigate } from 'react-router-dom';

import { lire, useConnexionPerdue } from '../../../api';
import { chargerModule } from '../../../wasm/charger';
import { Alerte, Bouton, BoutonIcone, Case, useToasts } from '../../../ui';
import { APPUI_LONG_MS, DELAI_FLECHES_MS, pasFleche } from '../../../ui/glisser';
import { centresNuage, coteDemande, ECART_FLECHE_PX, libelleDistance, pointsDeSaut, dimensionsCorps, disposer, grainsAnneau, orbitesAstres, placeApresPas, placeDepuisPoint, COTE_COURONNE_PX, PORTEE_COURONNE, queueDeComete, queuesComete, RAYON_MIN_PX, RAYON_TETE_MIN_PX, rayonOrbite, trajectoireDeComete, U, type CorpsPlace, type Disposition, type Plan } from './carte-geometrie';
import { typeDeRoute, type FamilleRoute } from './type-route';
import { Sprites, dessineurDuCoeur } from './carte-sprites';
import { chargerClasses, cleSprite, eclairages, type Eclairage } from './lumiere-corps';
import { placerEtiquettes, type CorpsEtiquette, type EtiquettePlacee, type Obstacle } from './etiquettes';
import { lireEchecEdition, useEdition, type EchecEdition } from './Edition';
import { COTE_MARQUE, placerMarques } from './elements-geometrie';
import { MarqueElement } from './MarqueElement';
import { modifierAstreSysteme } from './ecriture';
import { libelleGenreElement, nomAstre, nomElement, nomFormation, placeAstre, placeElement, typeAstre } from './systeme-libelles';
import type { AstreSysteme, InterieurSysteme, SortieSysteme } from './types';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
const PAS = 1.5;
const POLICE = '12px';
const HAUTEUR_ETIQUETTE = 15;
/** A jump arrow's disc for the labels (it is 14 × 12 px) and the longest name a jump label carries. */
const RAYON_FLECHE = 9;
// Gap (px) from the hour circle to the centre of its mark: past the arrow of a jump point (12 px high) when the circle is the transition's.
const DECALAGE_REPERE_PX = 14;
const DECALAGE_REPERE_SORTIE_PX = 26;
// Room kept round the fitted view when the transition dominates, so the hour marks and the exit labels stay inside the sky.
const RESERVE_TRANSITION_PX = 30;
const NOM_SORTIE_MAX = 24;
const coupeNom = (nom: string) => ([...nom].length > NOM_SORTIE_MAX ? `${[...nom].slice(0, NOM_SORTIE_MAX - 1).join('').trimEnd()}…` : nom);
/** A body waiting for the server's answer is dimmed by opacity alone (charte, drag gesture). */
const OPACITE_ENVOI = 0.4;
/** A finger that moves this far (px) before the long press is over is panning the view. */
const SEUIL_DEPLACEMENT = 4;

/** What a browser test reads of the map (AD-carte-4: the placement is read through a hook, never by pixels). */
export interface CroquisCarte {
  pret: boolean; largeur: number; hauteur: number; zoom: number; decalage: [number, number];
  corps: { cle: string; genre: string; x: number; y: number; rayon: number }[];
  etiquettes: EtiquettePlacee[];
  sorties: { q: number; r: number; heure: number }[];
}
declare global { interface Window { __carteSysteme?: () => CroquisCarte } }

interface SortieDessinee { q: number; r: number; x: number; y: number; cap: number; distance: number; nom: string; type: string; famille: FamilleRoute }

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
  /** The selected element (a key of `interieur.elements`) and its setter: the marks are buttons of the sky. */
  selectionElement?: string | null;
  onSelectionElement?: (cle: string | null) => void;
}

/** Under this width (px) of the sky, the labels of the elements show on selection only when the map holds more than `ELEMENTS_ETIQUETES`. */
const LARGEUR_COMPACTE = 560;
const ELEMENTS_ETIQUETES = 8;

/** The sky's colours for the canvas, read from the tokens (a canvas cannot take a CSS variable). */
const lireTokens = (el: Element) => {
  const s = getComputedStyle(el);
  return { accent: s.getPropertyValue('--accent').trim(), trait: s.getPropertyValue('--ciel-trait').trim(), or: s.getPropertyValue('--ciel-or').trim() };
};

/** E-23, the canvas (AD-carte-3): the interior as `lireInterieur` answered it, drawn by the core; nothing is filtered here. */
/** A body placed by hand and not yet answered by the server (drag, arrows): shown at once, dropped when the answer is in. */
type Provisoire = Record<string, { orbite: number | null; heure: number }>;
/** The star of rank 0 has no place of its own: it is the centre. */
const deplacable = (a: AstreSysteme | undefined): a is AstreSysteme => a !== undefined && !(a.genre === 'etoile' && a.etoile_rang === 0);

export default function CarteSysteme({ interieur, base, adresseVoisin, suffixe, selection, onSelection, selectionElement = null, onSelectionElement }: Props) {
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
  // The GM's gestures on the bodies (E-23, Déplacer 1 and 2): none of this exists for who may not write.
  const edition = useEdition();
  const editionRef = useRef(edition);
  editionRef.current = edition;
  const mj = edition.peutEcrire;
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
  const [provisoire, setProvisoire] = useState<Provisoire>({});
  const provRef = useRef<Provisoire>({});
  const [enEnvoi, setEnEnvoi] = useState<Set<string>>(new Set());
  const enEnvoiRef = useRef(enEnvoi);
  const [echecGeste, setEchecGeste] = useState<EchecEdition>();
  const poser = (p: Provisoire) => { provRef.current = p; setProvisoire(p); };
  const changerEnvoi = (f: (s: Set<string>) => Set<string>) => { const n = f(enEnvoiRef.current); enEnvoiRef.current = n; setEnEnvoi(n); };
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

  // The interior as shown: the places set by hand over the one the answer gave (a moon follows its planet in `disposer`).
  const affiche = useMemo<InterieurSysteme>(() => (
    Object.keys(provisoire).length === 0 ? interieur
      : { ...interieur, astres: interieur.astres.map((a) => (provisoire[a.cle] ? { ...a, ...provisoire[a.cle] } : a)) }
  ), [interieur, provisoire]);
  const dispo: Disposition | null = useMemo(() => (plan ? disposer(affiche, plan) : null), [plan, affiche]);
  // The scale is that of the answer, so the view does not move under the pointer while a body is dragged.
  const etendue = useMemo(() => (plan ? disposer(interieur, plan).etendue : 1), [plan, interieur]);

  // Size of the sky.
  useEffect(() => {
    const el = racine.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(() => setTaille({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }));
    o.observe(el);
    setTaille({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    return () => o.disconnect();
  }, [etat]);

  const ajuste = dispo && taille.w > 0 ? Math.max(8, Math.min(taille.w, taille.h) / 2 - (dispo.transition > 0 && dispo.transition >= etendue ? RESERVE_TRANSITION_PX : 0)) / (etendue * 1.12) : 1;
  const echelle = ajuste * vue.zoom;
  // Radius and sprite side in screen pixels: from the fit only, so a body keeps its size at every zoom (AD-echelle-1).
  const dims = useMemo(() => (dispo ? dimensionsCorps(dispo.corps, ajuste) : new Map<string, { rayon: number; cote: number }>()), [dispo, ajuste]);
  const dimDe = (cle: string) => dims.get(cle) ?? { rayon: RAYON_MIN_PX, cote: 2 * RAYON_MIN_PX };
  const cx = taille.w / 2 + vue.dx;
  const cy = taille.h / 2 + vue.dy;
  const ecran = useCallback((x: number, y: number): [number, number] => [cx + x * echelle, cy + y * echelle], [cx, cy, echelle]);

  // The light of each body (E-23): the angle toward its star and that star's colour, once the core's class colours are read.
  const [classesLues, setClassesLues] = useState(false);
  useEffect(() => { void chargerClasses().then(() => setClassesLues(true)); }, []);
  const lumieres = useMemo(() => (dispo && classesLues ? eclairages(dispo.corps) : new Map<string, Eclairage>()), [dispo, classesLues]);

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
      for (const c of dispo.corps) {
        const e = lumieres.get(c.cle);
        sprites.current?.demander(cleSprite(c.cle, e), c.aspect, coteDemande(dimDe(c.cle).cote, dpr), e?.angle, e?.lumiere);
      }
    };
    // First pass at once (the blurred versions come first in the queue); later zooms wait for the gesture to settle.
    const t = setTimeout(demander, 0);
    return () => clearTimeout(t);
  }, [dispo, taille.w, dims, dpr, lumieres]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Labels.
  const mesureur = useMemo(() => {
    const c = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    const police = racine.current ? getComputedStyle(racine.current).fontFamily : 'sans-serif';
    if (c) c.font = `${POLICE} ${police}`;
    return (t: string) => ({ largeur: Math.ceil(c ? c.measureText(t).width : t.length * 7) + 2, hauteur: HAUTEUR_ETIQUETTE });
  }, [etat]); // eslint-disable-line react-hooks/exhaustive-deps

  // The marks of the elements the reader reads (the answer holds no other), placed on their orbit or around their body.
  const marques = useMemo(
    () => (dispo && plan ? placerMarques(affiche.elements ?? [], dispo.corps, plan, ecran, echelle, new Map([...dims].map(([k, v]) => [k, v.rayon]))) : []),
    [dispo, plan, affiche, ecran, echelle, dims],
  );

  const cibles = useMemo(() => {
    if (!dispo) return { liste: [] as CorpsEtiquette[], sorties: [] as SortieDessinee[] };
    const liste: CorpsEtiquette[] = dispo.corps.map((c) => {
      const [x, y] = ecran(c.x, c.y);
      return { cle: c.cle, genre: c.genre, nom: nomAstre(c.astre), x, y, rayon: dimDe(c.cle).rayon };
    });
    for (const z of dispo.zones) {
      const [x, y] = ecran(z.ancre[0], z.ancre[1]);
      liste.push({ cle: `zone:${z.cle}`, genre: 'zone', nom: nomFormation(z.formation), x, y, rayon: 0 });
    }
    // At a phone's width a crowded map labels the selected element only (the count is of the elements the reader reads).
    const sobre = taille.w < LARGEUR_COMPACTE && marques.length > ELEMENTS_ETIQUETES;
    for (const m of marques) {
      const visible = !sobre || m.cle === selectionElement;
      liste.push({ cle: `element:${m.cle}`, genre: 'element', nom: visible ? nomElement(m.element) : '', x: m.x, y: m.y, rayon: COTE_MARQUE / 2 });
    }
    const [hx, hy] = ecran(0, 0);
    const ex: SortieDessinee[] = dispo.transition > 0
      ? pointsDeSaut(sorties, dispo.transition * echelle, ECART_FLECHE_PX).map((p) => ({
        q: p.q, r: p.r, x: hx + p.x, y: hy + p.y, cap: p.cap, distance: p.distance,
        nom: p.nom && p.nom !== '' ? p.nom : `Système sans nom (${p.q}, ${p.r})`,
        type: (p.type_lien ?? '').trim(), famille: typeDeRoute(p.type_lien),
      }))
      : [];
    if (dispo.transition > 0) liste.push({ cle: 'zone:transition', genre: 'zone', nom: 'Zone de transition', x: hx - dispo.transition * echelle * Math.SQRT1_2, y: hy - dispo.transition * echelle * Math.SQRT1_2, rayon: 0 });
    for (const e of ex) liste.push({ cle: `sortie:${e.q},${e.r}`, genre: 'comete', nom: `${coupeNom(e.nom)} · ${libelleDistance(e.distance)}`, x: e.x, y: e.y, rayon: RAYON_FLECHE, entier: true });
    return { liste, sorties: ex };
  }, [dispo, ecran, echelle, sorties, marques, taille.w, selectionElement]);

  // A comet's tail as drawn (AD-cometes-1): away from the star it turns round, in screen pixels (its length follows the fit, never the zoom).
  const queueDe = (c: CorpsPlace) => {
    const etoile = dispo?.corps.find((e) => e.astre.genre === 'etoile' && e.astre.etoile_rang === c.astre.etoile_rang)
      ?? dispo?.corps.find((e) => e.astre.genre === 'etoile' && e.astre.etoile_rang === 0) ?? { x: 0, y: 0 };
    const la = typeof c.astre.aspect?.longueur === 'number' ? c.astre.aspect.longueur : 0.55;
    const q = queueDeComete({ x: c.x, y: c.y, orbite: c.astre.orbite ?? undefined, heure: c.astre.heure ?? undefined, aspect: c.astre.aspect }, etoile, la);
    return { etoile, queue: { ...q, longueur: q.longueur * ajuste } };
  };
  const cometeChoisie = dispo?.corps.find((c) => c.genre === 'comete' && c.cle === selection) ?? null;

  // What a label must clear besides the bodies: the hour marks (when drawn) and the transition circle.
  const obstacles = useMemo(() => {
    const liste: Obstacle[] = [];
    const p = planRef.current;
    if (!dispo || !p) return liste;
    const [cx, cy] = ecran(0, 0);
    if (dispo.transition > 0) liste.push({ type: 'anneau', x: cx, y: cy, rayon: dispo.transition * echelle });
    for (const e of cibles.sorties) liste.push({ type: 'disque', x: e.x, y: e.y, rayon: RAYON_FLECHE });
    for (const c of dispo.corps) {
      const [x, y] = ecran(c.x, c.y);
      // A star's glow is drawn out to ~0.9 of its sprite's half-side: a label does not sit on it (an obstacle, never part of the radius).
      if (c.astre.genre === 'etoile') liste.push({ type: 'disque', x, y, rayon: dimDe(c.cle).cote / 2 * PORTEE_COURONNE });
      if (c.genre !== 'comete') continue;
      liste.push(...queuesComete(x, y, dimDe(c.cle).cote, c.astre.aspect, queueDe(c).queue));
    }
    if (heures) {
      const rh = Math.max(dispo.transition, 3 * U);
      const decalageRepere = dispo.transition >= 3 * U ? DECALAGE_REPERE_SORTIE_PX : DECALAGE_REPERE_PX;
      for (let h = 0; h < 12; h += 3) {
        const [tx, ty] = ecran(...p(rh + decalageRepere / Math.max(echelle, 0.01), h));
        const m = mesureur(`${h === 0 ? 12 : h} h`);
        liste.push({ type: 'rect', x: tx - m.largeur / 2, y: ty - m.hauteur / 2, largeur: m.largeur, hauteur: m.hauteur });
      }
    }
    return liste;
  }, [dispo, ecran, echelle, heures, mesureur, plan, dims, cibles.sorties]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // The trajectories (AD-cometes-2) under the sprites: dashes in the sky's trait colour, the chosen comet's whole and gold, on top.
      const cometes = dispo.corps.filter((c) => c.genre === 'comete');
      const rMaxExt = Math.max(0, ...dispo.corps.filter((c) => c.astre.genre !== 'lune').map((c) => c.astre.orbite ?? 0)) * 1.25;
      const trajets: { cle: string; couleur: string; epaisseur: number; tirets: boolean }[] = [];
      for (const c of [...cometes.filter((k) => k.cle !== selection), ...cometes.filter((k) => k.cle === selection)]) {
        const choisie = c.cle === selection;
        const { points } = trajectoireDeComete({ x: c.x, y: c.y, orbite: c.astre.orbite ?? undefined, heure: c.astre.heure ?? undefined, aspect: c.astre.aspect },
          queueDe(c).etoile, Math.max(rMaxExt, c.astre.orbite ?? 0));
        g.strokeStyle = choisie ? jeton.or : jeton.trait; g.lineWidth = choisie ? 2 : 1;
        g.setLineDash(choisie ? [] : [4, 4]);
        g.beginPath();
        points.forEach(([wx, wy], i) => { const [px, py] = ecran(wx, wy); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); });
        g.stroke();
        g.setLineDash([]);
        trajets.push({ cle: c.cle, couleur: g.strokeStyle as string, epaisseur: g.lineWidth, tirets: !choisie });
      }
      t.setAttribute('data-trajet-comete', JSON.stringify(trajets));
      const queues: { cle: string; angle: number; longueur: number }[] = [];
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const maintenant = performance.now();
      for (const c of dispo.corps) {
        const [x, y] = ecran(c.x, c.y);
        const cote = dimDe(c.cle).cote;
        if (x + cote < 0 || y + cote < 0 || x - cote > taille.w || y - cote > taille.h) continue;
        const couches = sprites.current?.couches(cleSprite(c.cle, lumieres.get(c.cle)), coteDemande(cote, dpr), maintenant) ?? [];
        if (c.genre === 'comete') {
          // The picture turned about its head, faded along the tail up to its length (the head offset turns with it).
          const { queue } = queueDe(c);
          const sens = typeof c.astre.aspect?.sens === 'number' && c.astre.aspect.sens < 0 ? -1 : 1;
          queues.push({ cle: c.cle, angle: queue.rotation + Math.atan2(0.6, -sens * 0.8), longueur: queue.longueur });
          const demi = Math.ceil(Math.max(cote * 1.5, queue.longueur + 4));
          const oc = document.createElement('canvas');
          oc.width = oc.height = Math.ceil(2 * demi * dpr);
          const o = oc.getContext('2d');
          if (o) {
            o.setTransform(dpr, 0, 0, dpr, demi * dpr, demi * dpr);
            o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
            o.rotate(queue.rotation);
            for (const { image: im, alpha } of couches) {
              o.globalAlpha = alpha;
              o.drawImage(im, -cote / 2 + c.decalage[0] * cote, -cote / 2 + c.decalage[1] * cote, cote, cote);
            }
            o.setTransform(dpr, 0, 0, dpr, demi * dpr, demi * dpr);
            o.globalAlpha = 1;
            o.globalCompositeOperation = 'destination-in';
            const fondu = o.createLinearGradient(0, 0, queue.dx * queue.longueur, queue.dy * queue.longueur);
            // Eased over the whole length, so the picture's own tail dies out smoothly and never ends in a cut.
            for (const [pos, a] of [[0, 1], [0.15, 0.9], [0.4, 0.55], [0.7, 0.2], [0.9, 0.05], [1, 0]] as const) fondu.addColorStop(pos, `rgba(0,0,0,${a})`);
            o.fillStyle = fondu;
            o.fillRect(-demi, -demi, 2 * demi, 2 * demi);
            g.globalAlpha = enEnvoiRef.current.has(c.cle) ? OPACITE_ENVOI : 1;
            g.drawImage(oc, x - demi, y - demi, 2 * demi, 2 * demi);
          }
          g.globalAlpha = enEnvoiRef.current.has(c.cle) ? OPACITE_ENVOI : 1;
          // The tail itself: a filament along the drawn direction, as long as the geometry says, tapering and fading to nothing.
          {
            const rgb = (() => {
              const h = (typeof c.astre.aspect?.couleur === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.astre.aspect.couleur) ? c.astre.aspect.couleur : jeton.or).slice(1);
              const v = h.length <= 4 ? h.split('').map((k) => k + k) : (h.match(/../g) ?? []);
              const n = v.slice(0, 3).map((k) => parseInt(k, 16));
              return n.length === 3 && n.every(Number.isFinite) ? n : [242, 195, 107];
            })();
            const L = queue.longueur;
            const w0 = Math.max(1.5, Math.min(4, cote * 0.12));
            g.save();
            g.translate(x, y); g.rotate(Math.atan2(queue.dy, queue.dx));
            const f = g.createLinearGradient(0, 0, L, 0);
            for (const [pos, a] of [[0, 0.75], [0.25, 0.45], [0.55, 0.18], [0.85, 0.04], [1, 0]] as const) f.addColorStop(pos, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
            g.fillStyle = f;
            g.beginPath(); g.moveTo(0, -w0); g.lineTo(L, 0); g.lineTo(0, w0); g.closePath(); g.fill();
            g.restore();
          }
          // Readability (AD-cometes-3): a head never under RAYON_TETE_MIN_PX, and a coma when the picture is small.
          const teinte = typeof c.astre.aspect?.couleur === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.astre.aspect.couleur) ? c.astre.aspect.couleur : jeton.or;
          g.globalAlpha = 1;
          if (cote < COTE_COURONNE_PX) {
            const coma = g.createRadialGradient(x, y, 0, x, y, 12);
            coma.addColorStop(0, teinte); coma.addColorStop(1, 'rgba(0,0,0,0)');
            g.globalCompositeOperation = 'lighter';
            g.fillStyle = coma;
            g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill();
            g.globalCompositeOperation = 'source-over';
          }
          if (dimDe(c.cle).rayon < RAYON_TETE_MIN_PX) {
            g.fillStyle = teinte;
            g.beginPath(); g.arc(x, y, RAYON_TETE_MIN_PX, 0, 7); g.fill();
          }
        } else {
          for (const { image: im, alpha } of couches) {
            g.globalAlpha = enEnvoiRef.current.has(c.cle) ? alpha * OPACITE_ENVOI : alpha;
            g.drawImage(im, x - cote / 2 + c.decalage[0] * cote, y - cote / 2 + c.decalage[1] * cote, cote, cote);
          }
        }
        g.globalAlpha = 1;
        if (c.cle === selection) {
          g.strokeStyle = jeton.accent; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, Math.max(8, dimDe(c.cle).rayon + 5), 0, 7); g.stroke();
        }
      }
      t.setAttribute('data-queue-comete', JSON.stringify(queues));
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

  // A body taken by the pointer: waiting (a touch must hold 300 ms; a mouse must move), armed (the hold is done), dragged.
  const corpsGeste = useRef<{ cle: string; id: number; etat: 'attente' | 'arme' | 'glisse'; tactile: boolean; minuteur?: ReturnType<typeof setTimeout>; depart: { x: number; y: number } } | null>(null);
  const finCorps = () => { if (corpsGeste.current) clearTimeout(corpsGeste.current.minuteur); corpsGeste.current = null; };
  useEffect(() => finCorps, []);

  /** The world point under a pointer. */
  const versMonde = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = racine.current!.getBoundingClientRect();
    return [(e.clientX - r.left - cx) / echelle, (e.clientY - r.top - cy) / echelle];
  };
  /** The place a pointer designates for a body: a moon turns around its planet, the others around the centre. */
  const placeSous = (astre: AstreSysteme, e: { clientX: number; clientY: number }) => {
    const [wx, wy] = versMonde(e);
    if (astre.genre === 'lune') {
      const mere = dispo?.corps.find((c) => c.cle === astre.parent_cle);
      return { orbite: null, heure: placeDepuisPoint(wx - (mere?.x ?? 0), wy - (mere?.y ?? 0)).heure };
    }
    return placeDepuisPoint(wx, wy);
  };

  /** Writes a body's place through the anchoring door; the body stays where it was put (dimmed) on a defined system, and goes back otherwise or on a failure. */
  const enregistrer = async (cle: string, place: { orbite: number | null; heure: number }) => {
    const ed = editionRef.current;
    const astre = ed.interieur.astres.find((a) => a.cle === cle);
    if (!astre) { poser({}); return; }
    setEchecGeste(undefined);
    const lune = astre.genre === 'lune';
    const dessous = ed.interieur.etat === 'tire';
    // On a drawn system the anchoring dialog opens now and the body returns to its place under it.
    if (dessous) { const { [cle]: _, ...reste } = provRef.current; poser(reste); } else changerEnvoi((s) => new Set(s).add(cle));
    try {
      const r = await ed.avecAncrage((jeton) => modifierAstreSysteme(ed.place, cle, {
        ...jeton, version: astre.version ?? 1, ...(lune ? { heure: place.heure } : { orbite: place.orbite ?? 0, heure: place.heure }),
      }));
      if (r) toast(`${nomAstre(astre)} déplacé.`);
    } catch (e) {
      const f = lireEchecEdition(e);
      if (f.sorte === 'refus') toast(f.message); else setEchecGeste(f);
    } finally {
      const { [cle]: _, ...reste } = provRef.current;
      poser(reste);
      changerEnvoi((s) => { const n = new Set(s); n.delete(cle); return n; });
    }
  };

  const fleches = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(fleches.current), []);

  const clavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!mj || e.altKey || e.ctrlKey || e.metaKey || selection === null) return;
    const pas = pasFleche(e.key, e.shiftKey);
    const astre = interieur.astres.find((a) => a.cle === selection);
    if (!pas || !deplacable(astre)) return;
    e.preventDefault();
    const lune = astre.genre === 'lune';
    if (perdue || enEnvoiRef.current.has(astre.cle) || (lune && pas.heure === 0)) return;
    setEchecGeste(undefined);
    const avant = provRef.current[astre.cle] ?? { orbite: astre.orbite, heure: astre.heure };
    poser({ ...provRef.current, [astre.cle]: placeApresPas(avant.orbite, avant.heure, pas, lune) });
    clearTimeout(fleches.current);
    const cle = astre.cle;
    fleches.current = setTimeout(() => { const p = provRef.current[cle]; if (p) void enregistrer(cle, p); }, DELAI_FLECHES_MS);
  };

  const abaisse = (e: PointerReact<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.current.size === 1) {
      geste.current = { bouge: false, depart: { x: e.clientX, y: e.clientY }, dist: 0 };
      finCorps();
      const cle = (e.target as HTMLElement).closest<HTMLElement>('.cs-corps')?.dataset.cle;
      const astre = cle === undefined ? undefined : interieur.astres.find((a) => a.cle === cle);
      if (mj && !perdue && deplacable(astre) && !enEnvoiRef.current.has(astre.cle)) {
        const tactile = e.pointerType !== 'mouse';
        const c: NonNullable<typeof corpsGeste.current> = { cle: astre.cle, id: e.pointerId, etat: 'attente', tactile, depart: { x: e.clientX, y: e.clientY } };
        if (tactile) c.minuteur = setTimeout(() => { if (corpsGeste.current === c && !geste.current.bouge) c.etat = 'arme'; }, APPUI_LONG_MS);
        corpsGeste.current = c;
      }
    } else {
      finCorps();
      const [a, b] = [...pointeurs.current.values()]; geste.current.dist = Math.hypot(a!.x - b!.x, a!.y - b!.y); geste.current.bouge = true;
    }
  };
  /** The pointer moves a body: true when this move was the body's (the view stays still). */
  const suivreCorps = (e: PointerReact<HTMLDivElement>): boolean => {
    const c = corpsGeste.current;
    if (!c || c.id !== e.pointerId) return false;
    const loin = Math.hypot(e.clientX - c.depart.x, e.clientY - c.depart.y) > SEUIL_DEPLACEMENT;
    if (c.etat === 'attente') {
      // A mouse takes the body at once; a finger that moves before the hold is over pans the view instead.
      if (c.tactile) { if (loin) finCorps(); return false; }
      if (!loin) return true;
    }
    if (c.etat === 'arme' && !loin) return true;
    if (c.etat !== 'glisse') {
      c.etat = 'glisse';
      geste.current.bouge = true;
      try { racine.current?.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer cannot be captured */ }
      onSelection(c.cle);
      setEchecGeste(undefined);
    }
    const astre = interieur.astres.find((a) => a.cle === c.cle);
    if (astre) poser({ ...provRef.current, [c.cle]: placeSous(astre, e) });
    return true;
  };
  const deplace = (e: PointerReact<HTMLDivElement>) => {
    const avant = pointeurs.current.get(e.pointerId);
    if (!avant) return;
    const r = racine.current!.getBoundingClientRect();
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (suivreCorps(e)) return;
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
    const c = corpsGeste.current;
    if (c && c.id === e.pointerId) {
      finCorps();
      const p = provRef.current[c.cle];
      if (c.etat === 'glisse' && p) {
        if (e.type === 'pointerup') void enregistrer(c.cle, p); else { const { [c.cle]: _, ...reste } = provRef.current; poser(reste); }
        if (pointeurs.current.size < 2) geste.current.dist = 0;
        return;
      }
    }
    if (pointeurs.current.size === 0 && !geste.current.bouge && e.type === 'pointerup' && !(e.target as HTMLElement).closest('button')) {
      onSelection(null);
    }
    if (pointeurs.current.size < 2) geste.current.dist = 0;
  };

  // What a browser test reads.
  useEffect(() => {
    window.__carteSysteme = () => ({
      pret: etat === 'pret' && taille.w > 0, largeur: taille.w, hauteur: taille.h, zoom: vueRef.current.zoom, decalage: [vueRef.current.dx, vueRef.current.dy],
      corps: cibles.liste.filter((c) => c.cle !== 'zone:transition').map((c) => ({ cle: c.cle, genre: c.genre, x: c.x, y: c.y, rayon: dimDe(c.cle).rayon })),
      etiquettes,
      sorties: sorties.map((s) => ({ q: s.q, r: s.r, heure: s.heure })),
    });
    return () => { delete window.__carteSysteme; };
  });

  if (etat === 'indisponible') {
    return <Alerte>La carte ne peut pas s’afficher ici.</Alerte>;
  }

  // One ring per body, at its own orbit (a moon around its planet): AD-echelle-1.
  const anneaux = dispo ? orbitesAstres(dispo) : [];
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
        aria-label={cometeChoisie ? `Carte du système. Trajectoire de ${nomAstre(cometeChoisie.astre)} affichée` : 'Carte du système'}
        aria-describedby="gx-liste-corps"
        data-zoom={vue.zoom.toFixed(3)}
        data-pret={etat === 'pret' && taille.w > 0 ? 'oui' : 'non'}
        onPointerDown={abaisse}
        onPointerMove={deplace}
        onPointerUp={leve}
        onPointerCancel={leve}
        onKeyDown={clavier}
        onContextMenu={(e) => { if (mj && (e.target as HTMLElement).closest('.cs-corps')) e.preventDefault(); }}
      >
        {etat === 'chargement' && <p className="cs-etat" role="status">Chargement du système…</p>}
        {dispo && taille.w > 0 && (
          <>
            <svg className="cs-traits" width={taille.w} height={taille.h} aria-hidden="true">
              {orbites && anneaux.map((o) => {
                const [ox, oy] = ecran(o.cx, o.cy);
                return <circle key={o.cle} className="cs-orbite" data-cle={o.cle} cx={Math.round(ox)} cy={Math.round(oy)} r={o.rayon * echelle} />;
              })}
              {heures && Array.from({ length: 12 }, (_, h) => {
                const [x1, y1] = pointHeure(h, 0);
                const [x2, y2] = pointHeure(h, rayonHeures);
                const [tx, ty] = pointHeure(h, rayonHeures + (dispo.transition >= 3 * U ? DECALAGE_REPERE_SORTIE_PX : DECALAGE_REPERE_PX) / Math.max(echelle, 0.01));
                return (
                  <g key={h} className="cs-heure" data-heure={h}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    {h % 3 === 0 && <text x={Math.round(tx)} y={Math.round(ty)} textAnchor="middle" dominantBaseline="middle">{h === 0 ? 12 : h} h</text>}
                  </g>
                );
              })}
              {dispo.transition > 0 && (
                <>
                  <defs>
                    <radialGradient id="cs-halo-degrade" cx="50%" cy="50%" r="50%">
                      <stop offset="66.7%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
                      <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.22 }} />
                    </radialGradient>
                  </defs>
                  <circle className="cs-halo" cx={ccx} cy={ccy} r={dispo.transition * echelle} fill="url(#cs-halo-degrade)" />
                  <circle className="cs-transition" cx={ccx} cy={ccy} r={dispo.transition * echelle} />
                </>
              )}
            </svg>
            <canvas ref={toile} className="cs-toile" aria-hidden="true"
              width={Math.round(taille.w * dpr)} height={Math.round(taille.h * dpr)} style={{ width: taille.w, height: taille.h }} />
            {dispo.corps.map((c) => (
              <BoutonCorps key={c.cle} c={c} rayon={dimDe(c.cle).rayon} ecran={ecran} choisi={c.cle === selection} onChoisir={() => onSelection(c.cle)}
                glissable={mj && !perdue && deplacable(c.astre)} />
            ))}
            {dispo.corps.filter((c) => enEnvoi.has(c.cle)).map((c) => {
              const [x, y] = ecran(c.x, c.y);
              return <span key={c.cle} className="cs-enregistrement" style={{ left: x, top: y + Math.max(10, dimDe(c.cle).rayon) + 4 }}>Enregistrement…</span>;
            })}
            {marques.map((m) => (
              <MarqueElement key={m.cle} cle={m.cle} x={m.x} y={m.y} icone={m.element.aspect.icone} couleur={m.element.aspect.couleur}
                reserve={m.element.reserve === true} choisi={m.cle === selectionElement}
                libelle={`${nomElement(m.element)}, ${libelleGenreElement(m.element.genre)}, ${placeElement(m.element, interieur.astres)}${m.element.reserve ? ', réservé au MJ' : ''}`}
                onChoisir={() => onSelectionElement?.(m.cle)} />
            ))}
            {cibles.sorties.map((s) => (
              <button
                key={`${s.q},${s.r}`}
                type="button"
                className={`cs-sortie ${s.famille}`}
                data-famille={s.famille}
                style={{ left: s.x, top: s.y }}
                aria-label={`Aller au système ${s.nom}, ${libelleDistance(s.distance)}${s.type ? `, route ${s.type}` : ''}`}
                title={s.type || undefined}
                onClick={() => navigate(`${adresseVoisin}${s.q}/${s.r}${suffixe}`)}
              >
                <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" style={{ transform: `rotate(${s.cap}rad)` }}>
                  <polygon points="7,0 14,12 7,9 0,12" />
                </svg>
              </button>
            ))}
            {etiquettes.filter((e) => e.visible).map((e) => (
              <span key={e.cle} className={`cs-etiquette${e.cle.startsWith('zone:') ? ' zone' : e.cle.startsWith('sortie:') ? ' sortie' : e.cle.startsWith('element:') ? ' element' : ''}`}
                data-cle={e.cle} style={{ left: Math.round(e.x), top: Math.round(e.y) }}>{e.texte}</span>
            ))}
          </>
        )}
      </div>
      {echecGeste && (
        <div className="ed-echec cs-echec-geste">
          <p className="echec" role="alert">{echecGeste.message}</p>
          {echecGeste.recharger && <Bouton petit onClick={() => { void edition.recharger().then(() => setEchecGeste(undefined), () => undefined); }}>Recharger</Bouton>}
        </div>
      )}
    </div>
  );
}

function BoutonCorps({ c, rayon, ecran, choisi, onChoisir, glissable }: {
  c: CorpsPlace; rayon: number; ecran: (x: number, y: number) => [number, number]; choisi: boolean; onChoisir: () => void; glissable: boolean;
}) {
  const [x, y] = ecran(c.x, c.y);
  const d = Math.max(22, rayon * 2);
  return (
    <button
      type="button"
      className={`cs-corps${glissable ? ' glissable' : ''}`}
      data-cle={c.cle}
      aria-pressed={choisi}
      aria-label={`${nomAstre(c.astre)}, ${typeAstre(c.astre)}, ${placeAstre(c.astre)}`}
      style={{ left: x, top: y, width: d, height: d }}
      onClick={onChoisir}
    />
  );
}
