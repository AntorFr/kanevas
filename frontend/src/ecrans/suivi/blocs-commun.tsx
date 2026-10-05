import { useEffect, useState, type ReactNode } from 'react';

import { Bouton, Chargement, Panneau } from '../../ui';

/** Loads something asynchronous for an E-3 block; `recharger` re-runs it (« Réessayer »). */
function useBlocCharge<T>(charger: () => Promise<T>, cle: unknown): [
  { etat: 'chargement' } | { etat: 'erreur' } | { etat: 'ok'; valeur: T },
  () => void,
] {
  const [etat, setEtat] = useState<{ etat: 'chargement' } | { etat: 'erreur' } | { etat: 'ok'; valeur: T }>({ etat: 'chargement' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setEtat({ etat: 'chargement' });
    charger().then(
      (valeur) => actif && setEtat({ etat: 'ok', valeur }),
      () => actif && setEtat({ etat: 'erreur' }),
    );
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, essai]);
  return [etat, () => setEssai((n) => n + 1)];
}

/**
 * Shared frame of the three « suivi » blocks of E-3: its own title, its own loading and error
 * states (« Impossible de charger ce bloc. »), so that one failing block never takes the others down.
 */
export function BlocSuivi<T>({
  titre,
  cle,
  charger,
  reserveMj,
  children,
}: {
  titre: string;
  cle: unknown;
  charger: () => Promise<T>;
  reserveMj?: boolean;
  children: (valeur: T) => ReactNode;
}) {
  const [etat, recharger] = useBlocCharge(charger, cle);
  return (
    <Panneau titre={titre} reserveMj={reserveMj}>
      {etat.etat === 'chargement' && <Chargement />}
      {etat.etat === 'erreur' && (
        <div className="etat">
          <p role="alert">Impossible de charger ce bloc.</p>
          <Bouton onClick={recharger}>Réessayer</Bouton>
        </div>
      )}
      {etat.etat === 'ok' && children(etat.valeur)}
    </Panneau>
  );
}
