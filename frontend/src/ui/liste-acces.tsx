import { useId, type ReactNode } from 'react';

import { PastilleRole } from './composants';
import { ChoixSegmente } from './choix-segmente';
import type { Role } from '../types';

export type ChoixAcces = 'comme' | 'aucun' | 'lecture' | 'ecriture';

export interface LigneAcces {
  id: number;
  nom: string;
  /** Null for a line the account has left: it stays, followed by the list's `libelleAbsent`. */
  role: Role | null;
  valeur: ChoixAcces;
  /** The role pill, when the caller has its own (« MJ du système »); else `PastilleRole` of `role`. */
  pastille?: ReactNode;
  /**
   * False: the third choice (« Écriture ») is not offered on this line — absent, or shown disabled when it is the
   * saved value (it can only be lowered). Absent: offered.
   */
  ecritureOfferte?: boolean;
  /** A word after the name (« lecture seule, vous n'êtes plus MJ du système »). */
  suffixe?: string;
  /** A refusal tied to this line alone: under it, `aria-describedby` on its group. */
  erreur?: string;
}

const TOUS: readonly { valeur: ChoixAcces; libelle: string }[] = [
  { valeur: 'comme', libelle: 'Comme le reste' },
  { valeur: 'aucun', libelle: '—' },
  { valeur: 'lecture', libelle: 'Lecture' },
  { valeur: 'ecriture', libelle: 'Lecture + écriture' },
];

/**
 * Access list (charte, « Liste d'accès »): one line per universe or system — name, role pill, a small segmented choice.
 * `avecComme` adds « Comme le reste » (exceptions to a level); without it the list is a plain list.
 * `options` replaces the whole set of choices (a system: « — » / « Lecture » / « Écriture »); `libelleAbsent` is the
 * suffix of a line the account left; `erreur` is tied to the list by `aria-describedby`, `LigneAcces.erreur` to one line;
 * `defile` makes it scroll inside its box after eight lines.
 */
export function ListeAcces({
  etiquette,
  lignes,
  avecComme,
  onChange,
  erreur,
  options: propres,
  libelleAbsent = '(plus membre)',
  defile,
  desactivee,
}: {
  etiquette: string;
  lignes: LigneAcces[];
  avecComme: boolean;
  onChange: (id: number, valeur: ChoixAcces) => void;
  erreur?: string;
  options?: readonly { valeur: ChoixAcces; libelle: string }[];
  libelleAbsent?: string;
  defile?: boolean;
  desactivee?: boolean;
}) {
  const idErreur = useId();
  const options = propres ?? (avecComme ? TOUS : TOUS.filter((o) => o.valeur !== 'comme'));
  return (
    <div>
      <ul
        className={`liste-acces${defile ? ' defile' : ''}`}
        aria-label={etiquette}
        aria-describedby={erreur ? idErreur : undefined}
        tabIndex={defile ? 0 : undefined}
      >
        {lignes.map((l) => {
          const idLigne = `${idErreur}-${l.id}`;
          const choix = options
            .filter((o) => o.valeur !== 'ecriture' || l.ecritureOfferte !== false || l.valeur === 'ecriture')
            .map((o) => (o.valeur === 'ecriture' && l.ecritureOfferte === false ? { ...o, desactive: true } : o));
          return (
            <li key={l.id}>
              <span className="liste-acces-nom">
                <span className="liste-acces-titre" title={l.nom.length > 80 ? l.nom : undefined}>
                  {l.nom.length > 80 ? `${l.nom.slice(0, 79)}…` : l.nom}
                </span>
                {l.pastille ?? (l.role ? <PastilleRole role={l.role} /> : <small>{libelleAbsent}</small>)}
                {l.suffixe && <small className="liste-acces-suffixe">{l.suffixe}</small>}
              </span>
              <ChoixSegmente
                petit
                etiquette={l.nom}
                options={choix}
                valeur={l.valeur}
                disabled={desactivee}
                decritPar={l.erreur ? idLigne : undefined}
                onChange={(v) => onChange(l.id, v)}
              />
              {l.erreur && (
                <p className="liste-acces-ligne-erreur" id={idLigne} role="alert">
                  {l.erreur}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {erreur && (
        <p className="liste-acces-erreur" id={idErreur} role="alert">
          {erreur}
        </p>
      )}
    </div>
  );
}
