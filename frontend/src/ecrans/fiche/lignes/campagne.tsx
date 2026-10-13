import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import type { Fiche } from '../types';
import type { LigneTitre } from './registre';

/**
 * « Campagne : <nom> » under the title of a session report, linking to E-6. Absent while loading
 * and, without any message, when the campaign cannot be read (the report stays readable).
 */
function LigneCampagne({ universId, fiche }: { universId: string; fiche: Fiche }) {
  const campagneId = (fiche.charge as { campagne_id?: number }).campagne_id;
  const [nom, setNom] = useState<string>();
  useEffect(() => {
    let actif = true;
    setNom(undefined);
    if (typeof campagneId === 'number') {
      lire<{ nom: string }>(`/api/univers/${universId}/campagnes/${campagneId}`).then(
        (c) => actif && setNom(c.nom),
        () => undefined,
      );
    }
    return () => {
      actif = false;
    };
  }, [universId, campagneId]);
  if (nom === undefined) return null;
  return (
    <p className="ligne-campagne titre-long">
      Campagne : <Link to={`/univers/${universId}/campagnes/${campagneId}`}>{nom}</Link>
    </p>
  );
}

export default { type: 'compte_rendu', composant: LigneCampagne } satisfies LigneTitre;
