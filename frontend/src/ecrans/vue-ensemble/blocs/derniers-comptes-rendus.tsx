import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { BlocSuivi } from '../../suivi/blocs-commun';
import { dateCourte, type PageComptesRendus } from '../../suivi/commun';
import type { Bloc } from '../registre';
import type { Role } from '../../../types';

/** E-3 block « Derniers comptes-rendus »: the five newest the account can read, no counter. */
function DerniersComptesRendus({ universId, role }: { universId: number; role: Role }) {
  return (
    <BlocSuivi
      titre="Derniers comptes-rendus"
      cle={universId}
      charger={async () =>
        (await lire<PageComptesRendus>(`/api/univers/${universId}/comptes-rendus`)).comptesRendus.slice(0, 5)
      }
    >
      {(liste) => (
        <>
          {liste.length === 0 ? (
            <div className="etat">
              <p>{role === 'mj' ? 'Aucun compte-rendu pour l’instant.' : 'Aucun compte-rendu à lire pour l’instant.'}</p>
            </div>
          ) : (
            <ul className="suivi-liste">
              {liste.map((cr) => (
                <li key={cr.id} className="ligne-suivi">
                  <Link className="grand" to={`/univers/${universId}/fiche/${cr.id}`}>
                    <span className="titre-long">{cr.titre}</span>
                    <small> — {cr.campagneNom}</small>
                  </Link>
                  <span className="date">{dateCourte(cr.creeLe)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/univers/${universId}/comptes-rendus`}>Tous les comptes-rendus</Link>
        </>
      )}
    </BlocSuivi>
  );
}

export default { id: 'derniers-comptes-rendus', roles: ['mj', 'joueur'], rang: 20, composant: DerniersComptesRendus } satisfies Bloc;
