import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { Bouton } from '../../../ui';
import { EQUIPAGE_MAX } from './format';

const REFUS = 'Équipage : un nombre entier de 0 à 100 000.';
const valide = (t: string) => /^\d+$/.test(t.trim()) && Number(t) <= EQUIPAGE_MAX;

/** The crew stepper of the workshop (E-22, F-6): a whole number 0–100 000; a refused typed value stays in the field. */
export function Equipage({ valeur, bornes, lecture, desactive, onChange, onInvalide }: {
  valeur: number | null;
  /** « 6 à 20 »; empty when the hull states no bound. */
  bornes: string;
  lecture: boolean;
  desactive: boolean;
  onChange: (n: number) => void;
  onInvalide: (invalide: boolean) => void;
}) {
  const id = useId();
  const [texte, setTexte] = useState(valeur === null ? '' : String(valeur));
  const [invalide, setInvalide] = useState(false);

  // An outside change (hull refill, cancel, save) replaces what is shown, unless the user is mid-typing something refused.
  useEffect(() => {
    if (invalide) return;
    setTexte(valeur === null ? '' : String(valeur));
  }, [valeur]); // eslint-disable-line react-hooks/exhaustive-deps

  const decrit = bornes || invalide ? `${id}-b` : undefined;
  const ligne = invalide
    ? <p className="vx-equipage-bornes vx-equipage-erreur" id={`${id}-b`}>{REFUS}</p>
    : bornes ? <p className="vx-equipage-bornes" id={`${id}-b`}>{bornes}</p> : null;

  if (lecture) {
    return (
      <div className="vx-equipage" role="group" aria-label="Équipage">
        <output className="vx-equipage-lu" aria-describedby={decrit}>{valeur ?? '—'}</output>
        {ligne}
      </div>
    );
  }

  const saisir = (t: string) => {
    setTexte(t);
    if (valide(t)) {
      setInvalide(false);
      onInvalide(false);
      onChange(Number(t));
    } else {
      setInvalide(true);
      onInvalide(true);
    }
  };
  const pas = (delta: number) => {
    const base = invalide || texte === '' ? (valeur ?? 0) : Number(texte);
    saisir(String(Math.max(0, Math.min(EQUIPAGE_MAX, base + delta))));
  };

  return (
    <div className="vx-equipage" role="group" aria-label="Équipage">
      <div className="vx-equipage-controle">
        <Bouton petit aria-label="Diminuer l’équipage" icone={Minus} disabled={desactive || !invalide && (valeur ?? 0) <= 0} onClick={() => pas(-1)} />
        <input
          className="vx-equipage-champ" type="number" inputMode="numeric" min={0} max={EQUIPAGE_MAX} step={1}
          aria-label="Équipage" aria-invalid={invalide || undefined} aria-describedby={decrit}
          disabled={desactive} value={texte} onChange={(e) => saisir(e.target.value)}
        />
        <Bouton petit aria-label="Augmenter l’équipage" icone={Plus} disabled={desactive || !invalide && (valeur ?? 0) >= EQUIPAGE_MAX} onClick={() => pas(1)} />
      </div>
      {ligne}
    </div>
  );
}
