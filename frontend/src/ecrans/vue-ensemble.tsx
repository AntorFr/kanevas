import { useParams } from 'react-router-dom';

import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Chargement, ErreurChargement, PageIntrouvable, PastilleRole } from '../ui';
import './ecrans.css';
import { blocsVisibles } from './vue-ensemble/registre';

/** E-3 Vue d'ensemble (shell): name, description, role, then the region of independent blocks. */
function VueEnsemble() {
  const { id } = useParams();
  const [univers, recharger] = useCharge<UniversListe>(`/api/univers/${id}`);

  if (univers.etat === 'chargement') return <Chargement />;
  if (univers.etat === 'erreur') {
    // Unknown universe or no role: the same answer, and no name anywhere.
    if (univers.statut === 404) return <PageIntrouvable />;
    return <ErreurChargement onReessayer={recharger} />;
  }
  const u = univers.valeur;
  const blocs = blocsVisibles(u.role);
  return (
    <>
      <div className="titre-univers">
        <h1>{u.nom}</h1>
        <PastilleRole role={u.role} />
      </div>
      {u.description && <p className="description-univers">{u.description}</p>}
      <div className="blocs">
        {blocs.length === 0 ? (
          <div className="etat">Rien à afficher pour l’instant. Les campagnes, les comptes-rendus et les cartes s’afficheront ici.</div>
        ) : (
          blocs.map((b) => <b.composant key={b.id} universId={u.id} role={u.role} />)
        )}
      </div>
    </>
  );
}

export default { chemin: '/univers/:id', composant: VueEnsemble } satisfies Ecran;
