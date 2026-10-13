import { NotebookPen } from 'lucide-react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { BlocSuivi, VideBloc } from '../../suivi/blocs-commun';
import { dateCourte, type PageComptesRendus } from '../../suivi/commun';
import type { Bloc } from '../registre';
import type { Role } from '../../../types';

/** E-3 block « Derniers comptes-rendus »: the five newest the account can read, no counter. */
function DerniersComptesRendus({ universId, role }: { universId: number; role: Role }) {
  return (
    <BlocSuivi
      titre="Derniers comptes-rendus"
      cle={universId}
      lignes={3}
      lien={
        <Link className="lien-action" to={`/univers/${universId}/comptes-rendus`}>
          <NotebookPen size={14} strokeWidth={1.75} aria-hidden="true" />
          Tous les comptes-rendus
        </Link>
      }
      charger={async () =>
        (await lire<PageComptesRendus>(`/api/univers/${universId}/comptes-rendus`)).comptesRendus.slice(0, 5)
      }
    >
      {(liste) =>
        liste.length === 0 ? (
          <VideBloc>{role === 'mj' ? 'Aucun compte-rendu pour l’instant.' : 'Aucun compte-rendu à lire pour l’instant.'}</VideBloc>
        ) : (
          <div className="lignes">
            {liste.map((cr) => (
              <Link key={cr.id} className="ligne" to={`/univers/${universId}/fiche/${cr.id}`}>
                <span className="tuile">
                  <NotebookPen size={14} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="corps">
                  <span className="titre">{cr.titre}</span>
                  <span className="sous">
                    {cr.campagneNom}
                    <span className="date-tel"> · {dateCourte(cr.creeLe)}</span>
                  </span>
                </span>
                <span className="meta">{dateCourte(cr.creeLe)}</span>
              </Link>
            ))}
          </div>
        )
      }
    </BlocSuivi>
  );
}

export default { id: 'derniers-comptes-rendus', roles: ['mj', 'joueur'], rang: 20, composant: DerniersComptesRendus } satisfies Bloc;
