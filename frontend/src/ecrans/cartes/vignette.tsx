import { useState } from 'react';

import { adresseFond, type Carte } from './commun';

/** Thumbnail of a map: its background when it has one that loads, else the neutral pattern. */
export function Vignette({ universId, carte, classe }: { universId: string | number; carte: Carte; classe: string }) {
  const [casse, setCasse] = useState(false);
  if (carte.forme !== 'illustree' || !carte.fond || casse) return <span className={`${classe} neutre`} aria-hidden="true" />;
  return (
    <img className={classe} src={adresseFond(universId, carte.id)} alt="" loading="lazy" onError={() => setCasse(true)} />
  );
}
