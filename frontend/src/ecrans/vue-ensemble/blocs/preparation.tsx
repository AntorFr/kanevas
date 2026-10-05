import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { BlocSuivi } from '../../suivi/blocs-commun';
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
          <div className="etat">
            <p>Rien à préparer pour l’instant.</p>
          </div>
        ) : (
          groupes.map((g) => (
            <div key={g.campagne.id}>
              <h3>
                <Link to={`/univers/${universId}/campagnes/${g.campagne.id}`}>
                  <span className="titre-long">{g.campagne.nom}</span>
                </Link>
              </h3>
              <ul className="suivi-liste">
                {g.taches.map((t) => (
                  <li key={t.id} className="ligne-suivi">
                    <span className="titre-long">{t.libelle}</span>
                    <small>{libelleCategorie(t.categorie)}</small>
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

export default { id: 'preparation', roles: ['mj'], rang: 30, composant: Preparation } satisfies Bloc;
