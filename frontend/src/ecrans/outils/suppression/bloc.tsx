import { useState } from 'react';

import { Bouton } from '../../../ui';
import type { Niveau, Outil } from '../types';
import { SuppressionDialog } from './dialog';
import './suppression.css';

/** Foot of a card that declares data (E-20): present only when the API says the caller may delete (`supprimable`). */
export function BlocSuppression({ base, niveau, outil }: { base: string; niveau: Niveau; outil: Outil }) {
  const [ouvert, setOuvert] = useState(false);
  return <div className="suppression-bloc">
    <p>Désactiver garde tout ; supprimer efface.</p>
    <Bouton variante="danger" ecrit onClick={() => setOuvert(true)}>Supprimer les données de l’outil…</Bouton>
    {ouvert && <SuppressionDialog base={base} niveau={niveau} outil={outil} onFermer={() => setOuvert(false)} />}
  </div>;
}
