import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useConnexionPerdue } from '../../../api';
import { Bouton } from '../../../ui';
import { ChangerAventure } from '../changer-aventure';
import type { LigneTitre, PropsLigneTitre } from './registre';

/**
 * « Campagne : <titre> » under the title of a session report, linking to the adventure's sheet. The server
 * names the adventure only to a reader of it (AD-124 (4)): absent otherwise, without any message; « Aventure
 * supprimée » for a GM when it is gone. The GM outside player mode also gets « Changer d'aventure… » (E-9).
 */
function LigneCampagne({ universId, fiche, gestion, rafraichir }: PropsLigneTitre) {
  const [ouvert, setOuvert] = useState(false);
  const perdue = useConnexionPerdue();
  const supprimee = fiche.campagneSupprimee === true;
  if (!supprimee && (fiche.campagneId === undefined || fiche.campagneNom === undefined)) return null;
  return (
    <>
    <p className="ligne-campagne titre-long">
      {supprimee ? (
        <>Campagne : Aventure supprimée</>
      ) : (
        <>
          Campagne :{' '}
          <Link className="nom-campagne" title={fiche.campagneNom} to={`/univers/${universId}/fiche/${fiche.campagneId}`}>{fiche.campagneNom}</Link>
        </>
      )}
      {gestion && (
        <>
          {' '}
          <Bouton petit disabled={perdue} onClick={() => setOuvert(true)}>
            Changer d’aventure…
          </Bouton>
        </>
      )}
    </p>
    {ouvert && <ChangerAventure universId={universId} fiche={fiche} onFermer={() => setOuvert(false)} rafraichir={rafraichir} />}
    </>
  );
}

export default { type: 'compte_rendu', composant: LigneCampagne } satisfies LigneTitre;
