import { CircleAlert, RotateCcw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Bouton } from './composants';

/** Screen states of B-29 (texts of docs/ecrans.md, « Textes communs »). */
export function Chargement({ texte = 'Chargement…' }: { texte?: string }) {
  return (
    <div className="etat" role="status">
      {texte}
    </div>
  );
}

export function ErreurChargement({ texte = 'Impossible de charger cette page.', onReessayer }: { texte?: string; onReessayer: () => void }) {
  return (
    <div className="etat alerte">
      <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" className="alerte-icone" />
      <div className="corps-alerte">
        <p role="alert">{texte}</p>
        <Bouton petit icone={RotateCcw} onClick={onReessayer}>
          Réessayer
        </Bouton>
      </div>
    </div>
  );
}

export function EtatVide({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <div className="etat">
      <h2>{titre}</h2>
      {children}
    </div>
  );
}

/**
 * The refusal, which is also the answer for an unknown address: never « accès refusé ».
 * The bar needs no hint: it shows a selector only for a universe the account has.
 */
export function PageIntrouvable() {
  return (
    <div className="etat">
      <h1>Page introuvable.</h1>
      <p>
        <Link to="/">Mes univers</Link>
      </p>
    </div>
  );
}

/** Empty state of a list: a round icon, the sentence, then the action (`children`). */
export function VideIcone({ icone: Icone, children }: { icone: LucideIcon; children: ReactNode }) {
  return (
    <div className="etat vide-liste">
      <span className="rond" aria-hidden="true">
        <Icone size={20} strokeWidth={1.75} />
      </span>
      {children}
    </div>
  );
}

/** Loading of a list: shimmerless skeleton rows, the sentence stays read and written. */
export function ChargementListe({ texte }: { texte: string }) {
  return (
    <div role="status" className="chargement-liste">
      <ul className="lignes squelettes" aria-hidden="true">
        {[34, 46, 28, 52, 38].map((l, i) => (
          <li key={i}>
            <span className="squelette os-mono" />
            <span className="squelette os-titre" style={{ width: `${l}%` }} />
            <span className="os-espace" />
            <span className="squelette os-pastille" />
          </li>
        ))}
      </ul>
      <p className="squelette-texte">{texte}</p>
    </div>
  );
}
