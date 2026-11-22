import { Upload } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

import { Bouton } from './composants';

const glisse = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Whole-page drop veil (the overlay of E-19, extracted): shown while files are dragged over the page. `actif` false ignores
 * the drag (a reader). The caller spreads `props` on its root element.
 */
export function useSurvolPage(actif: boolean, onFichiers: (f: File[]) => void) {
  const compteur = useRef(0);
  const [survol, setSurvol] = useState(false);
  const props = {
    onDragEnter: (e: React.DragEvent) => {
      if (!actif || !glisse(e)) return;
      compteur.current += 1;
      setSurvol(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (actif && glisse(e)) e.preventDefault();
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!actif || !glisse(e)) return;
      compteur.current = Math.max(0, compteur.current - 1);
      if (compteur.current === 0) setSurvol(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!actif || !glisse(e)) return;
      e.preventDefault();
      compteur.current = 0;
      setSurvol(false);
      onFichiers(Array.from(e.dataTransfer.files));
    },
  };
  return { survol, props };
}

export function VoileDepot({ texte = 'Déposez les fichiers pour les ajouter.' }: { texte?: string }) {
  return (
    <div className="med-depot" role="status">
      <Upload size={24} strokeWidth={1.75} aria-hidden="true" />
      {texte}
    </div>
  );
}

/**
 * Drop zone (charte, « Zone de dépôt »): a dashed zone and a button that opens the picker (several files); a file over it
 * takes the accent. `annonce` is read aloud politely (« 3 images déposées »). Refused files are the caller's `Alerte`s.
 */
export function ZoneDepot({
  onFichiers,
  libelle = 'Ajouter des images',
  texte = 'Déposez des images ici',
  accept = 'image/*',
  desactive,
  annonce,
  children,
}: {
  onFichiers: (fichiers: File[]) => void;
  libelle?: string;
  texte?: string;
  accept?: string;
  desactive?: boolean;
  annonce?: string;
  /** More buttons beside the main one (« Choisir dans la médiathèque »). */
  children?: ReactNode;
}) {
  const saisie = useRef<HTMLInputElement>(null);
  const [dessus, setDessus] = useState(false);
  const compteur = useRef(0);
  return (
    <div
      className={`zone-depot${dessus ? ' dessus' : ''}`}
      onDragEnter={(e) => {
        if (desactive || !glisse(e)) return;
        compteur.current += 1;
        setDessus(true);
      }}
      onDragOver={(e) => {
        if (!desactive && glisse(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (desactive || !glisse(e)) return;
        compteur.current = Math.max(0, compteur.current - 1);
        if (compteur.current === 0) setDessus(false);
      }}
      onDrop={(e) => {
        if (desactive || !glisse(e)) return;
        e.preventDefault();
        e.stopPropagation();
        compteur.current = 0;
        setDessus(false);
        onFichiers(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={saisie}
        type="file"
        multiple
        hidden
        accept={accept}
        onChange={(e) => {
          onFichiers(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="zone-depot-texte">{texte}</span>
      <Bouton variante="principal" petit disabled={desactive} ecrit onClick={() => saisie.current?.click()}>{libelle}</Bouton>
      {children}
      <span className="zone-depot-annonce" aria-live="polite">{annonce}</span>
    </div>
  );
}
