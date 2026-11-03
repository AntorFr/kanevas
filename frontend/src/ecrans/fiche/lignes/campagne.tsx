import { Link } from 'react-router-dom';

import type { Fiche } from '../types';
import type { LigneTitre } from './registre';

/**
 * « Campagne : <titre> » under the title of a session report, linking to the adventure's sheet. The server
 * names the adventure only to a reader of it (AD-124 (4)): absent otherwise, without any message; « Aventure
 * supprimée » for a GM when it is gone.
 */
function LigneCampagne({ universId, fiche }: { universId: string; fiche: Fiche }) {
  if (fiche.campagneSupprimee) return <p className="ligne-campagne titre-long">Campagne : Aventure supprimée</p>;
  if (fiche.campagneId === undefined || fiche.campagneNom === undefined) return null;
  return (
    <p className="ligne-campagne titre-long">
      Campagne : <Link to={`/univers/${universId}/fiche/${fiche.campagneId}`}>{fiche.campagneNom}</Link>
    </p>
  );
}

export default { type: 'compte_rendu', composant: LigneCampagne } satisfies LigneTitre;
