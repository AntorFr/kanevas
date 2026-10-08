import { ArrowRight, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { BlocSuivi, VideBloc } from '../../suivi/blocs-commun';
import type { Campagne } from '../../suivi/commun';
import type { Bloc } from '../registre';

/** E-3 block « Campagnes actives »: every active campaign, one per line, linking to E-6. */
function CampagnesActives({ universId }: { universId: number }) {
  return (
    <BlocSuivi
      titre="Campagnes actives"
      cle={universId}
      lignes={1}
      charger={async () =>
        (await lire<{ campagnes: Campagne[] }>(`/api/univers/${universId}/campagnes`)).campagnes.filter(
          (c) => c.statut === 'active',
        )
      }
    >
      {(campagnes) =>
        campagnes.length === 0 ? (
          <VideBloc>
            Aucune campagne active.
            <Link className="lien-action" to={`/univers/${universId}/campagnes`}>
              <Flag size={14} strokeWidth={1.75} aria-hidden="true" />
              Voir les campagnes
            </Link>
          </VideBloc>
        ) : (
          <div className="lignes">
            {campagnes.map((c) => (
              <Link key={c.id} className="ligne campagne" to={`/univers/${universId}/campagnes/${c.id}`}>
                <span className="tuile">
                  <Flag size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="corps">
                  <span className="titre">{c.nom}</span>
                </span>
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" className="fleche" />
              </Link>
            ))}
          </div>
        )
      }
    </BlocSuivi>
  );
}

export default { id: 'campagnes-actives', roles: ['mj', 'joueur'], rang: 10, composant: CampagnesActives } satisfies Bloc;
