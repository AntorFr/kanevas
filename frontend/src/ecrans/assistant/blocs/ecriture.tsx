import { ExternalLink, PenLine } from 'lucide-react';

import { aller } from '../adresse';
import type { Evenement } from '../fil';

/** Address of what an event names, built from its `cible` (AD-76). */
export function lienDe(universId: number, cible: Evenement['cible']): string | null {
  switch (cible.type) {
    case 'fiche':
      return `/univers/${universId}/fiche/${cible.ficheId}`;
    case 'campagne':
      return `/univers/${universId}/campagnes/${cible.campagneId}`;
    case 'scenario':
      return `/univers/${universId}/scenarios/${cible.scenarioId}`;
    default:
      return null;
  }
}

/** « Écrit par l'assistant »: what a write did, and a link to it. */
export function Ecriture({ evenement, universId, surOuverture }: { evenement: Evenement; universId: number; surOuverture: () => void }) {
  const lien = lienDe(universId, evenement.cible);
  return (
    <div className="asst-ecriture">
      <p className="asst-ecriture-mot">
        <PenLine size={12} strokeWidth={1.75} aria-hidden="true" /> Écrit par l’assistant
      </p>
      <p className="asst-ecriture-libelle">{evenement.libelle}</p>
      {lien && (
        <a
          href={lien}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            surOuverture();
            aller(lien);
          }}
        >
          Ouvrir <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
