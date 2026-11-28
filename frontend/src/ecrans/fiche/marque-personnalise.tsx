import { Dices, Layers } from 'lucide-react';

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

/** The pastille of an element of the game system left at the original (B-117): `Dices` and the system's name, cut with « … » (E-8, E-17). */
export function MarqueSysteme({ nom }: { nom: string }) {
  return (
    <span className="marque-systeme" title={nom}>
      <Pastille sens="neutre" icone={Dices}>
        <span className="nom-systeme">{nom}</span>
      </Pastille>
    </span>
  );
}

/** What a row or a card says of where its sheet comes from: the system's pastille, « Personnalisé » for a copy, nothing otherwise. */
export function MarqueOrigine({ fiche }: { fiche: { origine?: 'univers' | 'systeme' | 'surcharge'; systeme?: { nom: string } } }) {
  if (fiche.origine === 'surcharge') return <MarquePersonnalise />;
  if (fiche.origine === 'systeme' && fiche.systeme) return <MarqueSysteme nom={fiche.systeme.nom} />;
  return null;
}

/** The checkbox « Masquer les éléments du système » (a filter kept in the address, never a switch). */
export const LIBELLE_SANS_SYSTEME = 'Masquer les éléments du système';
