import { ArrowRight, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { BlocSuivi, VideBloc } from '../../suivi/blocs-commun';
import { BadgeStatutAventure, type Statut } from '../../fiche/statut';
import type { Fiche } from '../../fiche/types';
import type { Bloc } from '../registre';

/** E-3 block « Campagnes en cours »: the campaigns (adventures) « En cours » the account reads, one per line, linking to their sheet. */
function CampagnesActives({ universId }: { universId: number }) {
  return (
    <BlocSuivi
      titre="Campagnes en cours"
      cle={universId}
      lignes={1}
      charger={async () =>
        (await lire<{ fiches: Fiche[] }>(
          `/api/univers/${universId}/fiches?type=aventure&sousType=Campagne&statut=en_cours`,
        )).fiches
      }
    >
      {(campagnes) =>
        campagnes.length === 0 ? (
          <VideBloc>
            Aucune campagne en cours.
            <Link className="lien-action" to={`/univers/${universId}/fiches/aventures`}>
              <Flag size={14} strokeWidth={1.75} aria-hidden="true" />
              Voir les aventures
            </Link>
          </VideBloc>
        ) : (
          <div className="lignes">
            {campagnes.map((c) => (
              <Link key={c.id} className="ligne campagne" to={`/univers/${universId}/fiche/${c.id}`}>
                <span className="tuile">
                  <Flag size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="corps">
                  <span className="titre">{c.titre}</span>
                </span>
                <BadgeStatutAventure statut={c.charge.statut as Statut} />
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
