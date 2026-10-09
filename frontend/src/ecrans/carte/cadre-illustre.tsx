import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';

import { Bouton, Chargement } from '../../ui';
import { adresseFiche, borner, titreCourt, type Element } from './types';

/** Distance (px) under which a press that moves is still a click, not a drag. */
const SEUIL = 4;

interface Props {
  universId: string;
  /** Address of the background, or none (16/10 neutral frame, AD-70). */
  fond?: string;
  elements: Element[];
  /** GM outside player mode: tokens are selected and moved; otherwise they open the sheet. */
  gerer: boolean;
  selection?: number;
  onSelection: (id: number | undefined) => void;
  /** Saves a position; resolves false when it failed (the token then goes back). */
  onDeplacer: (id: number, x: number, y: number) => Promise<boolean>;
  vide: string;
}

/** The frame of an illustrated map and its tokens (E-11). The positions are in percent of the image. */
export function CadreIllustre({ universId, fond, elements, gerer, selection, onSelection, onDeplacer, vide }: Props) {
  const [charge, setCharge] = useState(fond === undefined);
  const [casse, setCasse] = useState(false);
  const [essai, setEssai] = useState(0);
  // Positions held while dragging or while a save is in flight; the server's value comes back after.
  const [locales, setLocales] = useState<Record<number, { x: number; y: number }>>({});
  const cadre = useRef<HTMLDivElement>(null);
  const glisse = useRef<{ id: number; departX: number; departY: number; px: number; py: number; bouge: boolean } | undefined>(undefined);
  const courantes = useRef(locales);
  courantes.current = locales;

  const posDe = (e: Element) => locales[e.id] ?? { x: e.x ?? 50, y: e.y ?? 50 };

  async function enregistrer(e: Element, x: number, y: number) {
    const cible = { x: borner(x), y: borner(y) };
    setLocales((l) => ({ ...l, [e.id]: cible }));
    // On success the parent holds the new position; on failure the token goes back to the server's.
    await onDeplacer(e.id, cible.x, cible.y);
    setLocales((l) => {
      const c = l[e.id];
      if (!c || c.x !== cible.x || c.y !== cible.y) return l; // a later move is still in flight
      const { [e.id]: _, ...reste } = l;
      return reste;
    });
  }

  function appui(e: Element, ev: PointerEvent<HTMLButtonElement>) {
    if (!gerer || ev.button !== 0) return;
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    const p = posDe(e);
    glisse.current = { id: e.id, departX: p.x, departY: p.y, px: ev.clientX, py: ev.clientY, bouge: false };
  }

  function mouvement(e: Element, ev: PointerEvent<HTMLButtonElement>) {
    const g = glisse.current;
    const boite = cadre.current?.getBoundingClientRect();
    if (!g || g.id !== e.id || !boite || boite.width === 0 || boite.height === 0) return;
    const dx = ev.clientX - g.px;
    const dy = ev.clientY - g.py;
    if (!g.bouge && Math.hypot(dx, dy) < SEUIL) return;
    g.bouge = true;
    const x = borner(g.departX + (dx / boite.width) * 100);
    const y = borner(g.departY + (dy / boite.height) * 100);
    setLocales((l) => ({ ...l, [e.id]: { x, y } }));
  }

  function relache(e: Element) {
    const g = glisse.current;
    glisse.current = undefined;
    if (!g || g.id !== e.id) return;
    if (!g.bouge) return onSelection(e.id);
    const p = courantes.current[e.id];
    if (p) void enregistrer(e, p.x, p.y);
  }

  function touche(e: Element, ev: KeyboardEvent<HTMLButtonElement>) {
    if (!gerer) return;
    const pas = ev.shiftKey ? 5 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-pas, 0],
      ArrowRight: [pas, 0],
      ArrowUp: [0, -pas],
      ArrowDown: [0, pas],
    };
    const d = delta[ev.key];
    if (!d) return;
    ev.preventDefault();
    const p = posDe(e);
    onSelection(e.id);
    void enregistrer(e, p.x + d[0], p.y + d[1]);
  }

  const adresse = fond === undefined ? undefined : `${fond}${fond.includes('?') ? '&' : '?'}essai=${essai}`;
  const place = fond === undefined || charge;

  return (
    <div className="carte-zone">
      <div ref={cadre} className={`carte-cadre${place ? '' : ' en-attente'}${fond === undefined ? ' neutre' : ''}`}>
        {adresse !== undefined && !casse && (
          <img
            key={adresse}
            className="carte-fond"
            src={adresse}
            alt=""
            onLoad={() => setCharge(true)}
            onError={() => setCasse(true)}
          />
        )}
        {adresse !== undefined && !charge && !casse && (
          <div className="carte-message">
            <Chargement />
          </div>
        )}
        {casse && (
          <div className="carte-message" role="alert">
            <p>Le fond de la carte n’a pas pu être chargé.</p>
            <Bouton
              onClick={() => {
                setCasse(false);
                setCharge(false);
                setEssai((n) => n + 1);
              }}
            >
              Réessayer
            </Bouton>
          </div>
        )}
        {place &&
          !casse &&
          elements.map((e) => {
            const p = posDe(e);
            const style = { left: `${p.x}%`, top: `${p.y}%` };
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
                onPointerDown={(ev) => appui(e, ev)}
                onPointerMove={(ev) => mouvement(e, ev)}
                onPointerUp={() => relache(e)}
                onPointerCancel={() => {
                  glisse.current = undefined;
                  setLocales((l) => {
                    const { [e.id]: _, ...reste } = l;
                    return reste;
                  });
                }}
                onKeyDown={(ev) => touche(e, ev)}
                onClick={(ev) => {
                  // A keyboard activation (no pointer) selects; a pointer press is handled on release.
                  if (ev.detail === 0) onSelection(e.id);
                }}
              >
                {contenu}
              </button>
            );
          })}
        {place && !casse && elements.length === 0 && <div className="carte-message vide"><p>{vide}</p></div>}
      </div>
    </div>
  );
}
