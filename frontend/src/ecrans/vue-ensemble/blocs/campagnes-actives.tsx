import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { BlocSuivi } from '../../suivi/blocs-commun';
import type { Campagne } from '../../suivi/commun';
import type { Bloc } from '../registre';

/** E-3 block « Campagnes actives »: every active campaign, one per line, linking to E-6. */
function CampagnesActives({ universId }: { universId: number }) {
  return (
    <BlocSuivi
      titre="Campagnes actives"
      cle={universId}
      charger={async () =>
        (await lire<{ campagnes: Campagne[] }>(`/api/univers/${universId}/campagnes`)).campagnes.filter(
          (c) => c.statut === 'active',
        )
      }
    >
      {(campagnes) =>
        campagnes.length === 0 ? (
          <div className="etat">
            <p>Aucune campagne active.</p>
            <Link to={`/univers/${universId}/campagnes`}>Voir les campagnes</Link>
          </div>
        ) : (
          <ul className="suivi-liste">
            {campagnes.map((c) => (
              <li key={c.id} className="ligne-suivi">
                <Link className="grand" to={`/univers/${universId}/campagnes/${c.id}`}>
                  <span className="titre-long">{c.nom}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    </BlocSuivi>
  );
}

export default { id: 'campagnes-actives', roles: ['mj', 'joueur'], rang: 10, composant: CampagnesActives } satisfies Bloc;
