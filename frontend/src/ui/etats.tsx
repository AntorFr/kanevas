import { CircleAlert, FileQuestion, Library, RotateCcw } from 'lucide-react';
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

/** Inline alert (icon, text, optional action): a failure that stays on the page. */
export function Alerte({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="alerte en-ligne" role="alert">
      <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
      <div className="corps-alerte">
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}

/**
 * The load failure and its « Réessayer ». `page` is the whole-page version (a heading, centred);
 * otherwise an inline alert, for a list or a block.
 */
export function ErreurChargement({
  texte = 'Impossible de charger cette page.',
  onReessayer,
  page,
}: {
  texte?: string;
  onReessayer: () => void;
  page?: boolean;
}) {
  if (page) {
    return (
      <div className="page-message erreur" role="alert">
        <div className="ic-message">
          <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h1>{texte}</h1>
        <div className="actions">
          <Bouton icone={RotateCcw} onClick={onReessayer}>
            Réessayer
          </Bouton>
        </div>
      </div>
    );
  }
  return (
    <Alerte
      action={
        <Bouton petit icone={RotateCcw} onClick={onReessayer}>
          Réessayer
        </Bouton>
      }
    >
      {texte}
    </Alerte>
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
    <div className="page-message" role="alert">
      <div className="ic-message">
        <FileQuestion size={20} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h1>Page introuvable.</h1>
      <div className="actions">
        <Link className="bouton neutre" to="/">
          <Library size={14} strokeWidth={1.75} aria-hidden="true" />
          Mes univers
        </Link>
      </div>
    </div>
  );
}
