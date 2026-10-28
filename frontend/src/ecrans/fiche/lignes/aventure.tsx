import { StatutAventure } from '../statut';
import type { LigneTitre, PropsLigneTitre } from './registre';
import './aventure.css';

/** E-9: the same status control as E-8, including for an existing disabled type. */
function LigneStatutAventure({ universId, fiche, gestion, rafraichir }: PropsLigneTitre) {
  return (
    <div className="ligne-statut-aventure">
      <span>Statut :</span>
      <StatutAventure universId={universId} fiche={fiche} gestion={gestion} onChange={() => void rafraichir()} />
    </div>
  );
}

export default { type: 'aventure', composant: LigneStatutAventure } satisfies LigneTitre;
