import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { Bouton } from '../../../ui';
import { EQUIPAGE_MAX } from './format';


/** The crew stepper of the workshop (E-22, F-6): a whole number 0 to `EQUIPAGE_MAX`; a refused typed value stays in the field. */
export function Equipage({ valeur, bornes, lecture, desactive, onChange, onInvalide, nom = 'Équipage', maximum = EQUIPAGE_MAX, ligne: ligneBornes, diminuer, augmenter, etiquette }: {
  valeur: number | null;
  /** The field's own name (the refusal line, the labels) and its upper bound: the crew by default, the repair skill (0–20) or the points of an exchange. */
  nom?: string;
  maximum?: number;
  /** A line shown under the stepper in place of the bounds (the consequence of the points). */
  ligne?: string;
  /** Accessible name when several steppers carry the same `nom` (one per line). */
  etiquette?: string;
  diminuer?: string;
  augmenter?: string;
  /** « 6 à 20 »; empty when the hull states no bound. */
  bornes: string;
  lecture: boolean;
  desactive: boolean;
  onChange: (n: number) => void;
  onInvalide: (invalide: boolean) => void;
}) {
  const id = useId();
  const aria = etiquette ?? nom;
  const moins = diminuer ?? (nom === 'Équipage' ? 'Diminuer l’équipage' : `Diminuer : ${aria}`);
  const plus = augmenter ?? (nom === 'Équipage' ? 'Augmenter l’équipage' : `Augmenter : ${aria}`);
  const REFUS = `${nom} : un nombre entier de 0 à ${nom === 'Équipage' ? String(EQUIPAGE_MAX).replace(/\B(?=(\d{3})+$)/g, ' ') : maximum}.`;
  const valide = (t: string) => /^\d+$/.test(t.trim()) && Number(t) <= maximum;
  const [texte, setTexte] = useState(valeur === null ? '' : String(valeur));
  const [invalide, setInvalide] = useState(false);

  // An outside change (hull refill, cancel, save) replaces what is shown, unless the user is mid-typing something refused.
  useEffect(() => {
    if (invalide) return;
    setTexte(valeur === null ? '' : String(valeur));
  }, [valeur]); // eslint-disable-line react-hooks/exhaustive-deps

  const decrit = bornes || ligneBornes || invalide ? `${id}-b` : undefined;
  const ligne = invalide
    ? <p className="vx-equipage-bornes vx-equipage-erreur" id={`${id}-b`}>{REFUS}</p>
    : bornes || ligneBornes ? <p className="vx-equipage-bornes" id={`${id}-b`}>{ligneBornes ?? bornes}</p> : null;

  if (lecture) {
    return (
      <div className="vx-equipage" role="group" aria-label={aria}>
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
    saisir(String(Math.max(0, Math.min(maximum, base + delta))));
  };

  return (
    <div className="vx-equipage" role="group" aria-label={aria}>
      <div className="vx-equipage-controle">
        <Bouton petit aria-label={moins} icone={Minus} disabled={desactive || !invalide && (valeur ?? 0) <= 0} onClick={() => pas(-1)} />
        <input
          className="vx-equipage-champ" type="number" inputMode="numeric" min={0} max={maximum} step={1}
          aria-label={aria} aria-invalid={invalide || undefined} aria-describedby={decrit}
          disabled={desactive} value={texte} onChange={(e) => saisir(e.target.value)}
        />
        <Bouton petit aria-label={plus} icone={Plus} disabled={desactive || !invalide && (valeur ?? 0) >= maximum} onClick={() => pas(1)} />
      </div>
      {ligne}
    </div>
  );
}
