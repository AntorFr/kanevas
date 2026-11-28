import { Layers } from 'lucide-react';

import { Pastille } from '../../ui';

/** The accessible name of the mark (E-9): the colour and the word never carry it alone. */
export const NOM_MARQUE_PERSONNALISE = 'Fiche personnalisée à partir de l’élément du système';

/** The mark « Personnalisé » of a customised element (B-116): on the sheet, in lists and in search results. */
export function MarquePersonnalise() {
  return (
    <span className="marque-personnalise" role="img" aria-label={NOM_MARQUE_PERSONNALISE} title={NOM_MARQUE_PERSONNALISE}>
      <Pastille sens="accent" icone={Layers}>Personnalisé</Pastille>
    </span>
  );
}
