import { Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { Alerte, Bouton, BoutonIcone, Fenetre } from '../../../ui';
import { COTE_FLOU, dessineurDuCoeur } from './carte-sprites';
import { aspectDe } from './carte-geometrie';
import { nomAstre, placeAstre, typeAstre } from './systeme-libelles';
import { LigneFiche } from './Liens';
import type { AstreSysteme } from './types';

type Image =
  | { k: 'chargement' }
  | { k: 'ok'; url: string }
  | { k: 'indisponible' }
  | { k: 'introuvable' };

/** The route's picture of a body at `cote` px (AD-carte-2): `introuvable` for a 404, `indisponible` for anything else. */
function useImage(adresse: string, actif: boolean, essai: number): Image {
  const [etat, setEtat] = useState<Image>({ k: 'chargement' });
  useEffect(() => {
    if (!actif) return;
    setEtat({ k: 'chargement' });
    const arret = new AbortController();
    let url: string | null = null;
    fetch(adresse, { credentials: 'same-origin', signal: arret.signal }).then(
      async (r) => {
        if (r.status === 404) return setEtat({ k: 'introuvable' });
        if (!r.ok) return setEtat({ k: 'indisponible' });
        const blob = await r.blob();
        if (arret.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setEtat({ k: 'ok', url });
      },
      () => { if (!arret.signal.aborted) setEtat({ k: 'indisponible' }); },
    ).catch(() => { if (!arret.signal.aborted) setEtat({ k: 'indisponible' }); });
    return () => { arret.abort(); if (url) URL.revokeObjectURL(url); };
  }, [adresse, actif, essai]);
  return etat;
}

/** The blurred version: the core's own drawing at 16 px, smoothed by the browser (never a flat disc). Null when the core cannot draw. */
function useFlou(aspect: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    setUrl(null);
    dessineurDuCoeur(aspect, COTE_FLOU).then(
      (octets) => {
        if (!vivant) return;
        const c = document.createElement('canvas');
        c.width = c.height = COTE_FLOU;
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(octets.buffer, octets.byteOffset, octets.byteLength).slice(), COTE_FLOU, COTE_FLOU), 0, 0);
        setUrl(c.toDataURL());
      },
      () => { /* the frame stays empty, the sharp version and the messages still work */ },
    );
    return () => { vivant = false; };
  }, [aspect]);
  return url;
}

const COTE_PANNEAU = 512;
/** The side of the dialog's picture: what fits the window (device pixels), 64 to 2048. */
function coteFenetre(): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const dispo = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.65);
  return Math.max(64, Math.min(2048, Math.round(dispo * dpr)));
}

interface Props {
  astre: AstreSysteme;
  q: number;
  r: number;
  /** `…/galaxies/:gid`, the tool's base. */
  base: string;
  /** `?mode=joueur` or empty. */
  suffixe: string;
  /** The GM's gestures (« Retirer l'astre »…), after « Voir l'illustration »: nothing for a player. */
  actions?: ReactNode;
}

/** E-23, the panel of a body: the same for a GM and a player, plus the GM's `actions`. The rows are those of E-21's `gx-panneau`. */
export default function PanneauCorps({ astre, q, r, base, suffixe, actions }: Props) {
  const aspect = aspectDe(astre);
  const flou = useFlou(aspect);
  const [essai, setEssai] = useState(0);
  const [ouverte, setOuverte] = useState(false);
  const adresse = (cote: number) => `${base}/interieur/${q}/${r}/astres/${encodeURIComponent(astre.cle)}/illustration?cote=${cote}${suffixe ? `&${suffixe.slice(1)}` : ''}`;
  const [coteHd] = useState(coteFenetre);
  const net = useImage(adresse(COTE_PANNEAU), true, essai);
  const [essaiHd, setEssaiHd] = useState(0);
  const hd = useImage(adresse(coteHd), ouverte, essaiHd);
  const nom = nomAstre(astre);
  const type = typeAstre(astre);
  const description = typeof (astre as { description?: unknown }).description === 'string' ? (astre as { description: string }).description : '';
  const fermer = useCallback(() => setOuverte(false), []);

  return (
    <section className="gx-bloc gx-panneau cs-panneau" aria-label="Corps sélectionné">
      <Cadre flou={flou} net={net} libelle={`Illustration de ${nom}, ${type}`} />
      {net.k === 'indisponible' && (
        <Alerte action={<Bouton petit onClick={() => setEssai((n) => n + 1)}>Réessayer</Bouton>}>Illustration indisponible.</Alerte>
      )}
      <div className="gx-tete"><h2 title={nom} className="cs-nom">{nom}</h2></div>
      <dl className="gx-kv">
        <dt>Type</dt><dd>{type}</dd>
        <dt>Lieu</dt><dd>{placeAstre(astre)}</dd>
        {description !== '' && <><dt>Description</dt><dd className="gx-notes">{description}</dd></>}
      </dl>
      <p className="gx-note">Hexagone {q}, {r}</p>
      <LigneFiche fiche={astre.fiche} />
      <div className="gx-actions">
        <Bouton disabled={ouverte && hd.k === 'chargement'} onClick={() => setOuverte(true)}>Voir l’illustration</Bouton>
        {actions}
      </div>
      {ouverte && (
        <FenetreImage titre={nom} libelle={`Illustration de ${nom}, ${type}`} flou={flou} hd={hd} onFermer={fermer} onReessayer={() => setEssaiHd((n) => n + 1)} />
      )}
    </section>
  );
}

/** The 4/3 frame: the blurred version first, the sharp one over it in a fade (none under reduced motion, see the CSS). */
function Cadre({ flou, net, libelle }: { flou: string | null; net: Image; libelle: string }) {
  const [charge, setCharge] = useState(false);
  useEffect(() => setCharge(false), [net]);
  return (
    <div className="cs-illustration" role="img" aria-label={libelle}>
      {flou && <img className="cs-flou" src={flou} alt="" />}
      {net.k === 'ok' && <img className={`cs-net${charge ? ' pret' : ''}`} src={net.url} alt="" onLoad={() => setCharge(true)} />}
    </div>
  );
}

function FenetreImage({ titre, libelle, flou, hd, onFermer, onReessayer }: {
  titre: string; libelle: string; flou: string | null; hd: Image; onFermer: () => void; onReessayer: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const pas = (f: number) => setZoom((z) => Math.min(4, Math.max(1, z * f)));
  return (
    <Fenetre titre={titre} onFermer={onFermer} image>
      {hd.k === 'introuvable' ? (
        <>
          <p role="alert">Page introuvable.</p>
          <div className="boite-actions"><Bouton onClick={onFermer}>Fermer</Bouton></div>
        </>
      ) : (
        <>
          <div className="cs-grande" role="img" aria-label={libelle}>
            {hd.k === 'ok'
              ? <img className="cs-net pret" src={hd.url} alt="" style={{ transform: `scale(${zoom})` }} />
              : flou && <img className="cs-flou" src={flou} alt="" />}
          </div>
          {hd.k === 'chargement' && <p role="status" className="gx-note">Chargement de l’illustration…</p>}
          {hd.k === 'indisponible' && (
            <Alerte action={<Bouton petit onClick={onReessayer}>Réessayer</Bouton>}>Illustration indisponible.</Alerte>
          )}
          <div className="boite-actions">
            {hd.k === 'ok' && (
              <>
                <BoutonIcone etiquette="Zoom avant (+)" infobulle="+" icone={Plus} onClick={() => pas(1.5)} />
                <BoutonIcone etiquette="Zoom arrière (−)" infobulle="−" icone={Minus} onClick={() => pas(1 / 1.5)} />
              </>
            )}
            <Bouton onClick={onFermer}>Fermer</Bouton>
          </div>
        </>
      )}
    </Fenetre>
  );
}
