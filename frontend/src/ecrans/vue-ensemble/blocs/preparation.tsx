import { ChevronRight, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { Pastille } from '../../../ui';
import { BlocSuivi, VideBloc } from '../../suivi/blocs-commun';
import type { Fiche } from '../../fiche/types';
import { libelleCategorie, type Tache } from '../../suivi/commun';
import type { Bloc } from '../registre';

interface Groupe {
  aventure: Fiche;
  taches: Tache[];
}

/** E-3 block « Préparation » (GM only): per adventure « En cours », its five oldest unchecked tasks. */
function Preparation({ universId }: { universId: number }) {
  return (
    <BlocSuivi
      titre="Préparation"
      reserveMj
      lignes={3}
      cle={universId}
      charger={async (): Promise<Groupe[]> => {
        const { fiches } = await lire<{ fiches: Fiche[] }>(
          `/api/univers/${universId}/fiches?type=aventure&statut=en_cours`,
        );
        const groupes = await Promise.all(
          fiches.map(async (aventure) => {
            const { taches } = await lire<{ taches: Tache[] }>(`/api/univers/${universId}/fiches/${aventure.id}/taches`);
            return { aventure, taches: taches.filter((t) => !t.faite).sort((a, b) => a.id - b.id).slice(0, 5) };
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
            <div key={g.aventure.id} className="groupe-prep">
              <Link className="groupe-prep-tete" to={`/univers/${universId}/fiche/${g.aventure.id}`}>
                <Flag size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>{g.aventure.titre}</span>
                <span className="ouvrir">
                  Ouvrir
                  <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
                </span>
              </Link>
              <ul className="taches" aria-label={`Tâches non cochées de ${g.aventure.titre}`}>
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
