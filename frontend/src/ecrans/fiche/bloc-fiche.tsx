import { useId, type ReactNode } from 'react';
import { Lock, RotateCcw, type LucideIcon } from 'lucide-react';

import { useConnexionPerdue } from '../../api';
import { Bouton, Pastille } from '../../ui';
import './blocs-fiche.css';

/** Independent loading and failure, keeping the sheet and its other blocks readable. */
export function CadreBlocFiche({ titre, icone: Icone, mj, chargement, erreur, recharger, action, children }: {
  titre: string;
  icone: LucideIcon;
  mj?: boolean;
  chargement: boolean;
  erreur: boolean;
  recharger: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const perdue = useConnexionPerdue();
  return (
    <section className={`bloc-fiche${mj ? ' preparation-fiche' : ''}`} aria-labelledby={id}>
      <header className="bloc-fiche-tete">
        <h2 id={id}><Icone size={16} strokeWidth={1.75} aria-hidden="true" />{titre}</h2>
        {mj && <Pastille sens="mj" icone={Lock}>MJ seul</Pastille>}
        {action && <div className="bloc-fiche-action">{action}</div>}
      </header>
      {chargement ? (
        <div className="chargement-bloc-fiche" role="status">
          <div className="squelette" aria-hidden="true" />
          Chargement…
        </div>
      ) : erreur ? (
        <div className="echec" role="alert">
          Impossible de charger ce bloc.{' '}
          <Bouton petit icone={RotateCcw} disabled={perdue} onClick={recharger}>Réessayer</Bouton>
        </div>
      ) : children}
    </section>
  );
}
