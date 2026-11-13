import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { BoutonIcone } from './composants';

/**
 * Attachment thumbnail with an editable caption (charte, « Variants added »; E-26 reference images). The caption is a field
 * labelled « Légende de <nom> »; `onLegende` is called on blur when the text changed. The remove button is an icon button
 * « Retirer la référence <légende> ».
 */
export function VignetteReference({ nom, src, legende, ecriture = true, onLegende, onRetirer }: {
  nom: string;
  src: string;
  legende: string;
  ecriture?: boolean;
  onLegende: (legende: string) => void;
  onRetirer: () => void;
}) {
  const [texte, setTexte] = useState(legende);
  const [cassee, setCassee] = useState(false);
  const [precedente, setPrecedente] = useState(legende);
  if (legende !== precedente) {
    setPrecedente(legende);
    setTexte(legende);
  }
  return (
    <div className="vignette-ref">
      <span className="vignette-ref-image">{cassee ? null : <img src={src} alt={legende || nom} loading="lazy" onError={() => setCassee(true)} />}</span>
      <input
        className="vignette-ref-legende"
        aria-label={`Légende de ${nom}`}
        placeholder="Légende"
        maxLength={200}
        value={texte}
        readOnly={!ecriture}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => texte.trim() !== legende && onLegende(texte)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {ecriture && <BoutonIcone icone={Trash2} etiquette={`Retirer la référence ${legende || nom}`} ecrit onClick={onRetirer} />}
    </div>
  );
}
