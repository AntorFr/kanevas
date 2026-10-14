import { useCallback, useEffect, useRef, useState } from 'react';

import { lire } from '../api';
import { iconeDuType, libelleDuType, useTypes } from '../types-contexte';
import { Bouton } from './composants';
import './liste-liens.css';

/** What the list shows of a sheet. */
export interface FicheLien {
  id: number;
  titre: string;
  type: string;
}

/** Rows shown at most; beyond, « Affinez la recherche pour voir les autres. ». */
export const MAX_LIGNES_LIENS = 50;

export type RechercheLiens =
  | { etat: 'cours' }
  | { etat: 'erreur' }
  | { etat: 'ok'; fiches: FicheLien[]; plus: boolean };

const plier = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Titles that match the text first (prefix, then inside), the rest after; stable within each rank. */
export function classerParTitre(fiches: FicheLien[], requete: string): FicheLien[] {
  const q = plier(requete.trim());
  if (q === '') return fiches;
  const rang = (f: FicheLien) => {
    const i = plier(f.titre).indexOf(q);
    return i === 0 ? 0 : i > 0 ? 1 : 2;
  };
  return fiches
    .map((f, i) => ({ f, i, r: rang(f) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.f);
}

/**
 * The search behind the list opened by `[[` (P-14 step 1): the sheets the account reads, any type, by title
 * (`GET /api/univers/:id/fiches?q=`). The previous list is dropped as soon as the text changes; an answer that
 * arrives after another request, or after the list closed, is ignored.
 */
export function useRechercheLiens(universId: string, requete: string, actif: boolean): [RechercheLiens, () => void] {
  const [etat, setEtat] = useState<RechercheLiens>({ etat: 'cours' });
  const [essai, setEssai] = useState(0);
  const demande = useRef(0);

  useEffect(() => {
    if (!actif) {
      demande.current += 1;
      return;
    }
    const n = ++demande.current;
    setEtat({ etat: 'cours' });
    const q = requete.trim();
    const chemin = `/api/univers/${universId}/fiches${q === '' ? '' : `?q=${encodeURIComponent(q)}`}`;
    const minuteur = setTimeout(() => {
      lire<{ fiches: FicheLien[]; suivant: string | null }>(chemin).then(
        (p) => {
          if (n === demande.current) setEtat({ etat: 'ok', fiches: classerParTitre(p.fiches, q).slice(0, MAX_LIGNES_LIENS), plus: p.suivant !== null || p.fiches.length > MAX_LIGNES_LIENS });
        },
        () => {
          if (n === demande.current) setEtat({ etat: 'erreur' });
        },
      );
    }, 120);
    return () => clearTimeout(minuteur);
  }, [universId, requete, actif, essai]);

  const reessayer = useCallback(() => setEssai((x) => x + 1), []);
  return [etat, reessayer];
}

interface Props {
  id: string;
  recherche: RechercheLiens;
  /** Highlighted row (↑ ↓). */
  courant: number;
  onCourant: (i: number) => void;
  onChoisir: (f: FicheLien) => void;
  onReessayer: () => void;
}

/** The list of sheets under the field: loading, empty, error and 50+ states of docs/ecrans.md. */
export function ListeLiens({ id, recherche, courant, onCourant, onChoisir, onReessayer }: Props) {
  const { types } = useTypes();
  // Keeps the focus in the field: a click on the list must not take it.
  const garder = (e: { preventDefault: () => void }) => e.preventDefault();
  if (recherche.etat === 'cours') {
    return (
      <div className="liste-liens" id={id} role="listbox" aria-label="Fiches à lier" aria-busy="true">
        <div className="option etat">Recherche…</div>
      </div>
    );
  }
  if (recherche.etat === 'erreur') {
    return (
      <div className="liste-liens" id={id} role="alert">
        <div className="option etat">Impossible de chercher.</div>
        <div className="option" onMouseDown={garder}>
          <Bouton petit onClick={onReessayer}>
            Réessayer
          </Bouton>
        </div>
      </div>
    );
  }
  if (recherche.fiches.length === 0) {
    return (
      <div className="liste-liens" id={id} role="status">
        <div className="option etat">Aucune fiche.</div>
      </div>
    );
  }
  return (
    <div className="liste-liens" id={id} role="listbox" aria-label="Fiches à lier">
      {recherche.fiches.map((f, i) => {
        const Icone = iconeDuType(types, f.type);
        return (
          <div
            key={f.id}
            id={`${id}-${i}`}
            role="option"
            className="option"
            aria-selected={i === courant}
            onMouseDown={garder}
            onMouseMove={() => i !== courant && onCourant(i)}
            onClick={() => onChoisir(f)}
          >
            <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="titre-option" title={f.titre}>
              {f.titre}
            </span>
            <span className="type-option">{libelleDuType(types, f.type)}</span>
          </div>
        );
      })}
      {recherche.plus && <div className="option etat">Affinez la recherche pour voir les autres.</div>}
    </div>
  );
}
