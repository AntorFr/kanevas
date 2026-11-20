import { useRef, type ReactNode } from 'react';

import { Bouton } from './composants';

/**
 * Apply bar (charte, « Barre d'application »): sticky at the foot of a settings page. The sentence is an
 * `aria-live="polite"` region (`decompte`; absent → « Rien à appliquer. » and the action is off), `detail`
 * sits small under it, `secondaire` is an optional neutral button before the primary one. The action stays
 * focusable when off (`aria-disabled`); once `onAppliquer` settles, the focus returns to it.
 */
export function BarreApplication({
  decompte,
  detail,
  libelle = 'Appliquer',
  onAppliquer,
  desactive,
  enCours,
  secondaire,
}: {
  decompte?: ReactNode;
  detail?: ReactNode;
  libelle?: string;
  onAppliquer: () => void | Promise<void>;
  /** The count failed or a field is wrong: nothing can be applied. */
  desactive?: boolean;
  enCours?: boolean;
  secondaire?: { libelle: string; onClick: () => void };
}) {
  const racine = useRef<HTMLDivElement>(null);
  const rien = decompte === undefined || decompte === null || decompte === '';
  return (
    <div ref={racine} className="barre-application">
      <p className="phrase-barre" aria-live="polite">
        {rien ? 'Rien à appliquer.' : decompte}
        {!rien && detail && <small>{detail}</small>}
      </p>
      {secondaire && (
        <Bouton onClick={secondaire.onClick} disabled={rien}>
          {secondaire.libelle}
        </Bouton>
      )}
      <Bouton
        variante="principal"
        ecrit
        enCours={enCours}
        disabled={rien || desactive}
        onClick={async () => {
          try {
            await onAppliquer();
          } finally {
            racine.current?.querySelector<HTMLElement>('.bouton.principal')?.focus();
          }
        }}
      >
        {libelle}
      </Bouton>
    </div>
  );
}
