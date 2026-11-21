import { useEffect, useRef, useState } from 'react';

import { chargerModule } from '../../../wasm/charger';
import { coteDemande, disposer, grainsAnneau, type Plan } from './carte-geometrie';
import { Sprites, dessineurDuCoeur } from './carte-sprites';
import type { InterieurSysteme } from './types';

/** No body is drawn larger than this, in CSS pixels (AD-reglages-7). */
const COTE_MAX = 64;

/**
 * The system map in its compact mode (AD-reglages-7): the same placement (`disposer`) and the same drawing of the core
 * (`Sprites`) as the map of E-23, with no labels, orbits, hours, zoom nor gesture, in a square of `cote` pixels.
 * A sprite never exceeds 64 px. Decoration: the counts are said in words by the caller.
 */
export default function CarteCompacte({ systeme, cote }: { systeme: InterieurSysteme | null; cote: number }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [, retracer] = useState(0);
  const sprites = useRef<Sprites | null>(null);
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);

  useEffect(() => {
    let vivant = true;
    chargerModule('coeur').then((c) => {
      if (vivant) setPlan(() => (r: number, h: number): [number, number] => { const v = c.orbite_heure_vers_plan(r, h); return [v[0]!, v[1]!]; });
    }, () => undefined);
    return () => { vivant = false; };
  }, []);

  const dispo = systeme && plan ? disposer(systeme, plan) : null;
  const echelle = dispo ? cote / 2 / (dispo.etendue * 1.1) : 1;

  // One set of sprites per draw: the keys of two draws do not mean the same body.
  useEffect(() => {
    if (!dispo) return;
    const s = new Sprites(dessineurDuCoeur, () => retracer((n) => n + 1), true, () => undefined);
    sprites.current = s;
    for (const c of dispo.corps) s.demander(c.cle, c.aspect, coteDemande(Math.min(COTE_MAX, c.cote * echelle), dpr, 128));
    return () => { s.arreter(); sprites.current = null; };
  }, [systeme, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = toile.current;
    const g = t?.getContext('2d');
    if (!t || !g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cote, cote);
    if (!dispo || !plan) return;
    const s = getComputedStyle(t);
    const trait = s.getPropertyValue('--ciel-trait').trim() || s.getPropertyValue('--bord-fort').trim();
    const [cx, cy] = [cote / 2, cote / 2];
    g.fillStyle = trait;
    for (const z of dispo.zones) {
      if (z.forme !== 'anneau') continue;
      for (const gr of grainsAnneau(z.formation, plan)) {
        g.globalAlpha = gr.l;
        g.beginPath(); g.arc(cx + gr.x * echelle, cy + gr.y * echelle, Math.max(0.5, gr.r * Math.sqrt(echelle)), 0, 7); g.fill();
      }
    }
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    for (const c of dispo.corps) {
      const cc = Math.min(COTE_MAX, Math.max(8, c.cote * echelle));
      for (const { image, alpha } of sprites.current?.couches(c.cle, coteDemande(cc, dpr, 128), performance.now()) ?? []) {
        g.globalAlpha = alpha;
        g.drawImage(image, cx + c.x * echelle - cc / 2 + c.decalage[0] * cc, cy + c.y * echelle - cc / 2 + c.decalage[1] * cc, cc, cc);
      }
    }
    g.globalAlpha = 1;
  });

  return <canvas ref={toile} className="rg-carte" width={Math.round(cote * dpr)} height={Math.round(cote * dpr)} style={{ width: cote, height: cote }} aria-hidden="true" />;
}
