import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { PropsOutil } from '../../types';
import { Atelier } from './Atelier';
import { Liste } from './Liste';
import type { Conception } from './types';
import './vaisseaux.css';

/**
 * E-22, the ship designer: the list at `…/vaisseaux`, a design at `…/vaisseaux?fiche=<id>` (the share link, AD-134).
 * Loaded by dynamic import once the tool has been described to the caller.
 */
export default function Vaisseaux({ universId, prealable, suffixeMode }: PropsOutil) {
  const [params, setParams] = useSearchParams();
  const suffixe = suffixeMode ?? '';
  const brut = params.get('fiche');
  const ficheId = brut !== null && /^\d{1,15}$/.test(brut) ? Number(brut) : null;
  // What the verifier read serves the first opening only: a later opening of the same design reads it again.
  const lue = useRef(prealable as Conception | undefined);
  useEffect(() => {
    if (ficheId !== lue.current?.ficheId) lue.current = undefined;
  }, [ficheId]);
  const ouvrir = useCallback((id: number) => { lue.current = undefined; setParams({ fiche: String(id) }); }, [setParams]);

  if (brut !== null && ficheId === null) return <Atelier key="invalide" universId={universId} ficheId={0} suffixe={suffixe} />;
  if (ficheId !== null) {
    return <Atelier key={ficheId} universId={universId} ficheId={ficheId} suffixe={suffixe} initiale={lue.current} />;
  }
  return <Liste universId={universId} suffixe={suffixe} ouvrir={ouvrir} />;
}
