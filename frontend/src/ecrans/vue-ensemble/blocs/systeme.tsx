import { ArrowRight, Dices } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import type { Bloc } from '../registre';

/**
 * E-3 block « Système de jeu »: the system's name and a link to E-15. Without a system, while
 * loading, or on any error, the block does not exist (nothing is rendered).
 */
function BlocSysteme({ universId }: { universId: number }) {
  const id = useId();
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
    <section className="bloc-ve" aria-labelledby={id}>
      <div className="bloc-tete">
        <h2 id={id}>Système de jeu</h2>
      </div>
      <div className="lignes">
        <Link className="ligne systeme" to={`/univers/${universId}/systeme`}>
          <span className="tuile">
            <Dices size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="corps">
            <span className="titre" title={nom}>
              {nom}
            </span>
            <span className="sous">Ouvrir le système</span>
          </span>
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" className="fleche" />
        </Link>
      </div>
    </section>
  );
}

export default { id: 'systeme', roles: ['mj', 'joueur'], rang: 90, composant: BlocSysteme, colonne: 'laterale' } satisfies Bloc;
