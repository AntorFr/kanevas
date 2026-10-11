import { Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { useCharge, useMoi, useUnivers } from '../cadre-contexte';
import { ListeMembres, type Membre } from '../ListeMembres';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { ChargementListe, ErreurChargement, PageIntrouvable } from '../ui';
import './ecrans.css';
import './liste.css';
import './reglages.css';

/** E-4 Membres (GM only): the shared member list over the universe's own routes. */
function Membres() {
  const { id } = useParams();
  const navigate = useNavigate();
  const moi = useMoi();
  const { recharger: rechargerUnivers } = useUnivers();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [membres, recharger] = useCharge<Membre[]>(`/api/univers/${id}/membres`);

  if (membres.etat === 'chargement' || univers.etat === 'chargement') return <ChargementListe texte="Chargement des membres…" />;
  // A player, or an unknown universe: the same answer.
  if (membres.etat === 'erreur' && membres.statut === 404) return <PageIntrouvable />;
  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (membres.etat === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les membres." onReessayer={recharger} />;
  }
  const monIdentifiant = moi.etat === 'ok' ? moi.valeur.username : undefined;

  return (
    <div className="page-liste">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <Users size={20} strokeWidth={1.75} />
        </span>
        <h1>Membres</h1>
      </header>
      <ListeMembres
        base={`/api/univers/${id}/membres`}
        nomUnivers={univers.valeur.nom}
        membres={membres.valeur}
        apres={(m, evenement) => {
          // No longer a GM: this screen is not ours any more.
          if (m.username === monIdentifiant && (evenement === 'retrait' || (evenement === 'role' && m.role !== 'mj'))) {
            rechargerUnivers();
            navigate('/');
          }
        }}
      />
    </div>
  );
}

export default { chemin: '/univers/:id/membres', composant: Membres } satisfies Ecran;
