import { useId } from 'react';

import { PastilleRole } from './composants';
import { ChoixSegmente } from './choix-segmente';
import type { Role } from '../types';

export type ChoixAcces = 'comme' | 'aucun' | 'lecture' | 'ecriture';

export interface LigneAcces {
  id: number;
  nom: string;
  /** Null for a universe the account has left: the line stays, followed by « (plus membre) ». */
  role: Role | null;
  valeur: ChoixAcces;
}

const TOUS: { valeur: ChoixAcces; libelle: string }[] = [
  { valeur: 'comme', libelle: 'Comme le reste' },
  { valeur: 'aucun', libelle: '—' },
  { valeur: 'lecture', libelle: 'Lecture' },
  { valeur: 'ecriture', libelle: 'Lecture + écriture' },
];

/**
 * Access list (charte, « Liste d'accès »): one line per universe — name, role pill, a small segmented choice.
 * `avecComme` adds « Comme le reste » (exceptions to a level); without it the list is a plain list.
 * `erreur` is tied to the list by `aria-describedby`.
 */
export function ListeAcces({
  etiquette,
  lignes,
  avecComme,
  onChange,
  erreur,
}: {
  etiquette: string;
  lignes: LigneAcces[];
  avecComme: boolean;
  onChange: (id: number, valeur: ChoixAcces) => void;
  erreur?: string;
}) {
  const idErreur = useId();
  const options = avecComme ? TOUS : TOUS.filter((o) => o.valeur !== 'comme');
  return (
    <div>
      <ul className="liste-acces" aria-label={etiquette} aria-describedby={erreur ? idErreur : undefined}>
        {lignes.map((l) => (
          <li key={l.id}>
            <span className="liste-acces-nom">
              <span className="liste-acces-titre">{l.nom}</span>
              {l.role ? <PastilleRole role={l.role} /> : <small>(plus membre)</small>}
            </span>
            <ChoixSegmente petit etiquette={l.nom} options={options} valeur={l.valeur} onChange={(v) => onChange(l.id, v)} />
          </li>
        ))}
      </ul>
      {erreur && (
        <p className="liste-acces-erreur" id={idErreur} role="alert">
          {erreur}
        </p>
      )}
    </div>
  );
}
