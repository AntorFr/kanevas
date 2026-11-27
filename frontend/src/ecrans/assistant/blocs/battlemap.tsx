import { ExternalLink, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';

import { aller } from '../adresse';
import type { PropsBloc } from './registre';

function Lien({ href, surOuverture }: { href: string; surOuverture: () => void }): ReactNode {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        surOuverture();
        aller(href);
      }}
    >
      Ouvrir <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
    </a>
  );
}

function Bloc({ libelle, href, note, surOuverture }: { libelle: string; href: string; note?: string; surOuverture: () => void }) {
  return (
    <div className="asst-ecriture">
      <p className="asst-ecriture-mot">
        <PenLine size={12} strokeWidth={1.75} aria-hidden="true" /> Écrit par l’assistant
      </p>
      <p className="asst-ecriture-libelle">{libelle}</p>
      {note && <p className="asst-ecriture-libelle">{note}</p>}
      <Lien href={href} surOuverture={surOuverture} />
    </div>
  );
}

const racine = (universId: number) => `/univers/${universId}`;

/** E-26: the art direction, on its tab. */
export function BlocDirection({ universId, surOuverture }: PropsBloc) {
  return <Bloc libelle="Direction artistique modifiée" href={`${racine(universId)}/outils/battlemap/assets?onglet=direction`} surOuverture={surOuverture} />;
}

/** E-27: the batch is prepared, never launched by the assistant. */
export function BlocLot({ evenement, universId, surOuverture }: PropsBloc) {
  const n = Number(evenement.cible.lignes);
  return <Bloc libelle={`Lot préparé : ${n} assets`} note="À lancer par vous." href={`${racine(universId)}/outils/battlemap/assets?onglet=generation`} surOuverture={surOuverture} />;
}

/** E-28: the composed map. */
export function BlocCarte({ evenement, universId, surOuverture }: PropsBloc) {
  const titre = String(evenement.cible.titre ?? '');
  return <Bloc libelle={`Carte « ${titre} » composée`} href={`${racine(universId)}/outils/battlemap/cartes/${evenement.cible.carteId}`} surOuverture={surOuverture} />;
}

