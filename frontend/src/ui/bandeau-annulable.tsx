import type { ReactNode } from 'react';

import { Bouton } from './composants';

/** Words of the notice (docs/charte.md § 4, « Reversible notice »). */
export const NOM_ANNULER = 'Annuler la modification de l’assistant';
export const TEXTE_ANNULATION = 'Annulation…';
export const TEXTE_HORS_CONNEXION = 'Connexion perdue : « Annuler » est désactivé.';

/**
 * A notice attached to a content, with one reversible gesture (not the `Bandeau`, which is an
 * application state). `role="status"`, not dismissible: the caller removes it when the server stops
 * saying the content comes from the assistant. « Annuler » is `aria-disabled` offline and says
 * « Annulation… » while the request is in flight.
 */
export function BandeauAnnulable({ children, onAnnuler, enCours, horsConnexion, erreur }: {
  children: ReactNode;
  onAnnuler: () => void;
  enCours?: boolean;
  horsConnexion?: boolean;
  /** Text of a failed attempt (« Annuler » stays enabled for another try). */
  erreur?: string;
}) {
  return (
    <div className="bandeau-annulable" role="status">
      <span className="ba-texte">{children}</span>
      <Bouton petit disabled={horsConnexion} enCours={enCours} onClick={onAnnuler} aria-label={enCours ? undefined : NOM_ANNULER}>
        {enCours ? TEXTE_ANNULATION : 'Annuler'}
      </Bouton>
      {horsConnexion && <span className="ba-note">{TEXTE_HORS_CONNEXION}</span>}
      {erreur && <span className="ba-note ba-erreur" role="alert">{erreur}</span>}
    </div>
  );
}
