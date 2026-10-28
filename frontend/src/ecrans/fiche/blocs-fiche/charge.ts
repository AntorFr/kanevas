import { useEffect, useState } from 'react';

import { lire } from '../../../api';

type Charge<T> = { k: 'chargement' } | { k: 'erreur' } | { k: 'ok'; valeur: T };

/** The sheet mounts blocks by sheet and mode; late reads of an unmounted block are ignored. */
export function useBlocFiche<T>(adresse: string) {
  const [etat, setEtat] = useState<Charge<T>>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setEtat({ k: 'chargement' });
    lire<T>(adresse).then(
      (valeur) => actif && setEtat({ k: 'ok', valeur }),
      () => actif && setEtat({ k: 'erreur' }),
    );
    return () => { actif = false; };
  }, [adresse, essai]);
  return [etat, setEtat, () => setEssai((n) => n + 1)] as const;
}
