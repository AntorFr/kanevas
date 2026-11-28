import { Check } from 'lucide-react';
import { useState } from 'react';

import { Pastille } from './composants';

/**
 * Asset card (charte, « Carte d'asset »): the card is a button that opens the side panel, the selection box is a separate
 * checkbox « Sélectionner <nom> » (shift-click extends a range). A reader without a write right gets no box and, with no
 * `onOuvrir`, a card that opens nothing.
 */
export function CarteAsset({
  nom,
  src,
  empreinte,
  vueDessus,
  mj,
  brouillon,
  selectionnable,
  selectionnee,
  ouverte,
  onOuvrir,
  onSelection,
}: {
  nom: string;
  src: string;
  /** « 2×1 », or `null` for a floor or a wall. */
  empreinte: string | null;
  vueDessus: boolean;
  /** GM-only asset. */
  mj: boolean;
  brouillon: boolean;
  selectionnable: boolean;
  selectionnee: boolean;
  ouverte?: boolean;
  onOuvrir?: () => void;
  /** `etendre`: shift was held. */
  onSelection?: (etendre: boolean) => void;
}) {
  const [cassee, setCassee] = useState(false);
  const corps = (
    <>
      <span className="carte-asset-vignette">
        {cassee ? null : <img src={src} alt="" loading="lazy" onError={() => setCassee(true)} />}
      </span>
      <span className="carte-asset-nom" title={nom}>{nom}</span>
      {empreinte !== null && <small className="carte-asset-empreinte">{empreinte}</small>}
    </>
  );
  return (
    <div className={`carte-asset${selectionnee ? ' selectionnee' : ''}${mj ? ' mj' : ''}${ouverte ? ' ouverte' : ''}`}>
      {onOuvrir ? (
        <button type="button" className="carte-asset-bouton" aria-label={nom} onClick={onOuvrir}>{corps}</button>
      ) : (
        <div className="carte-asset-bouton statique">{corps}</div>
      )}
      <span className="carte-asset-marques">
        {vueDessus && <Pastille sens="neutre">Vue de dessus</Pastille>}
        {brouillon && <Pastille sens="neutre">Brouillon</Pastille>}
        {mj && <Pastille sens="mj">MJ</Pastille>}
      </span>
      {selectionnable && (
        <label className="carte-asset-case">
          <input
            type="checkbox"
            aria-label={`Sélectionner ${nom}`}
            checked={selectionnee}
            onChange={() => {}}
            onClick={(e) => onSelection?.(e.shiftKey)}
          />
          <span className="carte-asset-coche" aria-hidden="true">{selectionnee && <Check size={12} strokeWidth={2.5} />}</span>
        </label>
      )}
    </div>
  );
}
