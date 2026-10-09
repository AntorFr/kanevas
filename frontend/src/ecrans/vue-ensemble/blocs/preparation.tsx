import { ChevronRight, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { Pastille } from '../../../ui';
import { BlocSuivi, VideBloc } from '../../suivi/blocs-commun';
import { libelleCategorie, type Campagne, type Tache } from '../../suivi/commun';
import type { Bloc } from '../registre';

interface Groupe {
  campagne: Campagne;
  taches: Tache[];
}

/** E-3 block « Préparation » (GM only): per active campaign, its five oldest unchecked tasks. */
function Preparation({ universId }: { universId: number }) {
  return (
    <BlocSuivi
      titre="Préparation"
      reserveMj
      lignes={3}
      cle={universId}
      charger={async (): Promise<Groupe[]> => {
        const { campagnes } = await lire<{ campagnes: Campagne[] }>(`/api/univers/${universId}/campagnes`);
        const actives = campagnes.filter((c) => c.statut === 'active');
        const groupes = await Promise.all(
          actives.map(async (campagne) => {
            const { taches } = await lire<{ taches: Tache[] }>(`/api/campagnes/${campagne.id}/taches`);
            return { campagne, taches: taches.filter((t) => !t.faite).sort((a, b) => a.id - b.id).slice(0, 5) };
          }),
        );
        return groupes.filter((g) => g.taches.length > 0);
      }}
    >
      {(groupes) =>
        groupes.length === 0 ? (
          <VideBloc>Rien à préparer pour l’instant.</VideBloc>
        ) : (
          groupes.map((g) => (
            <div key={g.campagne.id} className="groupe-prep">
              <Link className="groupe-prep-tete" to={`/univers/${universId}/campagnes/${g.campagne.id}`}>
                <Flag size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>{g.campagne.nom}</span>
                <span className="ouvrir">
                  Ouvrir
                  <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
                </span>
              </Link>
              <ul className="taches" aria-label={`Tâches non cochées de ${g.campagne.nom}`}>
                {g.taches.map((t) => (
                  <li key={t.id} className="tache">
                    <span className="rond" aria-hidden="true" />
                    <span className="lib">{t.libelle}</span>
                    <Pastille sens="neutre">{libelleCategorie(t.categorie)}</Pastille>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )
      }
    </BlocSuivi>
  );
}

export default { id: 'preparation', roles: ['mj'], rang: 30, composant: Preparation, colonne: 'laterale' } satisfies Bloc;
