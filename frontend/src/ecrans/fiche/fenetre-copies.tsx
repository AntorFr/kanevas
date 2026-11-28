import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { lire } from '../../api';

/** What the confirmations of an element announce (AD-surcharge-4): the count, and only the account's own universes by name. */
export interface Copies {
  nbUnivers: number;
  mesUnivers: { id: number; nom: string }[];
}

/** The names stop at five (E-15). */
export const MAX_NOMS = 5;

export type EtatCopies = { k: 'chargement' } | { k: 'erreur' } | { k: 'ok'; copies: Copies };

/** Reads the copies of an element of a system, at each opening of the window; `relire` tries again. */
export function useCopies(systemeId: string | number, ficheId: number): [EtatCopies, () => void] {
  const [etat, setEtat] = useState<EtatCopies>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setEtat({ k: 'chargement' });
    lire<Copies>(`/api/systemes/${systemeId}/fiches/${ficheId}/copies`).then(
      (copies) => actif && setEtat({ k: 'ok', copies }),
      () => actif && setEtat({ k: 'erreur' }),
    );
    return () => {
      actif = false;
    };
  }, [systemeId, ficheId, essai]);
  return [etat, useCallback(() => setEssai((n) => n + 1), [])];
}

/** « 1 univers l'a personnalisé » / « N univers l'ont personnalisé ». */
export const phraseUnivers = (n: number) => (n === 1 ? '1 univers l’a personnalisé.' : `${n} univers l’ont personnalisé.`);

/** « 1 fiche personnalisée reste dans l'univers » / « N fiches personnalisées restent… » (E-14). */
export const phraseFiches = (n: number) =>
  `${n === 1 ? '1 fiche personnalisée reste' : `${n} fiches personnalisées restent`} dans l’univers, comme ${n === 1 ? 'fiche ordinaire' : 'fiches ordinaires'}. ${n === 1 ? 'Elle ne sera' : 'Elles ne seront'} plus liée${n === 1 ? '' : 's'} à l’élément du système.`;

/** The sentences naming the account's own universes: none when it has a role in none of them. */
export function phrasesNoms(mes: Copies['mesUnivers']): string[] {
  const noms = mes.slice(0, MAX_NOMS).map((u) => `Votre univers « ${u.nom} » garde sa version, qui devient une fiche ordinaire.`);
  if (mes.length > MAX_NOMS) noms.push(`… et ${mes.length - MAX_NOMS} autres de vos univers`);
  return noms;
}

/** The count of copies and the names of the account's universes, as the body of a confirmation (E-15). */
export function FenetreCopies({ copies }: { copies: Copies }): ReactNode {
  if (copies.nbUnivers === 0) return null;
  const noms = phrasesNoms(copies.mesUnivers);
  return (
    <div className="fenetre-copies">
      <p>{phraseUnivers(copies.nbUnivers)}</p>
      {noms.length > 0 && <ul>{noms.map((n) => <li key={n}>{n}</li>)}</ul>}
      <p>{copies.nbUnivers === 1 ? 'Sa copie reste, comme fiche ordinaire.' : 'Leurs copies restent, comme fiches ordinaires.'}</p>
    </div>
  );
}
