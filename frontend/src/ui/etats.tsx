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
    <div className="etat">
      <p role="alert">{texte}</p>
      <Bouton onClick={onReessayer}>Réessayer</Bouton>
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
