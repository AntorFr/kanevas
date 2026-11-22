import type { ReactNode } from 'react';

import { nomFormation, placeFormation, typeFormation } from './systeme-libelles';
import { LigneFiche } from './Liens';
import type { FormationSysteme } from './types';

/** E-23, the panel of a zone: its name, its form and its place; the GM's `actions` (« Retirer la zone ») follow. */
export default function PanneauFormation({ zone, q, r, actions }: { zone: FormationSysteme; q: number; r: number; actions?: ReactNode }) {
  const nom = nomFormation(zone);
  return (
    <section className="gx-bloc gx-panneau" aria-label="Zone sélectionnée">
      <div className="gx-tete"><h2 title={nom} className="cs-nom">{nom}</h2></div>
      <dl className="gx-kv">
        <dt>Forme</dt><dd>{typeFormation(zone)}</dd>
        <dt>Lieu</dt><dd>{placeFormation(zone)}</dd>
      </dl>
      <p className="gx-note">Hexagone {q}, {r}</p>
      <LigneFiche fiche={zone.fiche} />
      {actions && <div className="gx-actions">{actions}</div>}
    </section>
  );
}
