import { useEffect, useState } from 'react';

import { ErreurApi } from '../../../api';
import { BoiteDialogue, Bouton, Interrupteur } from '../../../ui';
import { masquerSysteme } from './ecriture';
import type { Place } from './ecriture';

/** The words of docs/ecrans.md (« E-21 — hiding a system », States). */
export const MESSAGES_MASQUE = {
  inconnu: 'Ce système n’existe plus.',
  conflit: 'Ce système a changé depuis que vous l’avez ouvert.',
  reseau: 'Impossible d’enregistrer. Réessayer.',
  refus: 'Action refusée.',
} as const;

type Echec = { sorte: 'inconnu' | 'conflit' | 'reseau' | 'refus'; message: string };

function lireEchecMasque(e: unknown): Echec | 'page' {
  if (e instanceof ErreurApi) {
    if (e.code === 'a_change') return { sorte: 'conflit', message: MESSAGES_MASQUE.conflit };
    if (e.code === 'systeme_inconnu') return { sorte: 'inconnu', message: MESSAGES_MASQUE.inconnu };
    if (e.statut === 403) return { sorte: 'refus', message: MESSAGES_MASQUE.refus };
    // A tool disabled or a galaxy hidden meanwhile: the whole page is « Page introuvable. », not a message here.
    if (e.statut === 404) return 'page';
  }
  return { sorte: 'reseau', message: MESSAGES_MASQUE.reseau };
}

/**
 * The « Secret (MJ seul) » switch of the system panel (E-21, GM outside Player mode). On a defined system it writes the flag
 * at once; on a drawn one it asks « Masquer ce système ? » first and anchors and hides in one call. Turning it off never asks.
 */
export function CommutateurMasque({ place, secret, jeton, tire, onFait, onRecharger, onIntrouvable }: {
  place: Place; secret: boolean;
  /** `version` of the defined system, or the galaxy's `version` for a drawn one. */
  jeton: number | undefined; tire: boolean;
  /** The write went through (or the state is stale): the map and the panel read again. */
  onFait: () => void; onRecharger: () => void; onIntrouvable: () => void;
}) {
  const [coche, setCoche] = useState(secret);
  const [enCours, setEnCours] = useState(false);
  const [dialogue, setDialogue] = useState(false);
  const [echec, setEchec] = useState<Echec>();
  useEffect(() => { setCoche(secret); setEchec(undefined); }, [secret, place.q, place.r]);

  async function ecrire(valeur: boolean) {
    if (enCours) return;
    setEnCours(true);
    setEchec(undefined);
    if (!tire) setCoche(valeur);
    try {
      await masquerSysteme(place, { secret: valeur, versionSysteme: jeton });
      setDialogue(false);
      onFait();
    } catch (e) {
      const f = lireEchecMasque(e);
      setDialogue(false);
      setCoche(secret);
      if (f === 'page') return onIntrouvable();
      setEchec(f);
      if (f.sorte === 'inconnu') onRecharger();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="gx-masque">
      <Interrupteur etiquette="Secret (MJ seul)" coche={coche} ecrit disabled={enCours}
        onChange={(v) => { if (v && tire) setDialogue(true); else void ecrire(v); }} />
      {enCours && !dialogue && <p className="gx-note" role="status">Enregistrement…</p>}
      {echec && (
        <p className="echec" role="alert">{echec.message}{' '}
          {echec.sorte === 'conflit' && <Bouton petit onClick={() => { setEchec(undefined); onRecharger(); }}>Recharger</Bouton>}
        </p>
      )}
      {dialogue && (
        <BoiteDialogue
          variante="neutre"
          titre="Masquer ce système ?"
          texte="Masquer ce système le définit : son intérieur sera figé tel que vous le voyez, les réglages du générateur ne le changeront plus."
          action="Masquer"
          libelleEnCours="Enregistrement…"
          enCours={enCours}
          onConfirmer={() => void ecrire(true)}
          onFermer={() => { if (!enCours) setDialogue(false); }}
        />
      )}
    </div>
  );
}
