import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { Panneau } from '../../../ui';
import type { Bloc } from '../registre';

/**
 * E-3 block « Système de jeu »: the system's name and a link to E-15. Without a system, while
 * loading, or on any error, the block does not exist (nothing is rendered).
 */
function BlocSysteme({ universId }: { universId: number }) {
  const [nom, setNom] = useState<string>();
  useEffect(() => {
    let actif = true;
    setNom(undefined);
    lire<{ nom: string }>(`/api/univers/${universId}/systeme?type=regle`).then(
      (s) => actif && setNom(s.nom),
      () => actif && setNom(undefined),
    );
    return () => {
      actif = false;
    };
  }, [universId]);
  if (nom === undefined) return null;
  return (
    <Panneau titre="Système de jeu">
      <div className="systeme-courant">
        <strong className="nom-systeme" title={nom}>
          {nom}
        </strong>
        <Link className="bouton neutre" to={`/univers/${universId}/systeme`}>
          Ouvrir le système
        </Link>
      </div>
    </Panneau>
  );
}

export default { id: 'systeme', roles: ['mj', 'joueur'], rang: 90, composant: BlocSysteme } satisfies Bloc;
