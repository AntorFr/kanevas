import { Copy, Info } from 'lucide-react';
import { useId } from 'react';

import { Bouton } from './composants';
import { useToasts } from './toast';

/**
 * Copyable value (charte, « Valeur copiable »): a value shown to be copied — the token (`secret`, with its note), the
 * base address of E-18. « Copier » never fires by itself; it copies, then a toast says so.
 */
export function ValeurCopiable({
  etiquette,
  valeur,
  secret,
  messageCopie,
}: {
  etiquette: string;
  valeur: string;
  /** A value shown once: the stronger line and the note « Il ne sera plus affiché. ». */
  secret?: boolean;
  messageCopie: string;
}) {
  const id = useId();
  const { toast } = useToasts();
  async function copier() {
    try {
      await navigator.clipboard.writeText(valeur);
      toast(messageCopie);
    } catch {
      toast('Copie impossible : sélectionnez la valeur.');
    }
  }
  return (
    <div className="valeur-copiable-bloc">
      <div className={`valeur-copiable${secret ? ' secret' : ''}`}>
        <code id={id} aria-label={etiquette} tabIndex={0}>
          {valeur}
        </code>
        <Bouton icone={Copy} aria-label={`Copier : ${etiquette}`} onClick={() => void copier()}>
          Copier
        </Bouton>
      </div>
      {secret && (
        <p className="valeur-copiable-note">
          <Info size={16} strokeWidth={1.75} aria-hidden="true" />
          Il ne sera plus affiché.
        </p>
      )}
    </div>
  );
}
