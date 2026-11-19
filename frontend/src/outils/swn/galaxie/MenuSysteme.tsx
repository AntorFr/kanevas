import { Anchor, ChevronDown, CircleDashed, Plus } from 'lucide-react';
import { useState } from 'react';

import { useConnexionPerdue } from '../../../api';
import { Menu, type EntreeMenu } from '../../../ui';
import { DialogueRayon, useEdition } from './Edition';

/**
 * The header menu « Système » (E-23), for the GM outside Player mode only: nothing is rendered otherwise.
 * « Ajouter un astre… » and « Ajouter une zone… » are there; they open the forms of the next slice
 * (`onAjouterAstre` / `onAjouterZone`), and stand inert while none is given.
 */
export default function MenuSysteme({ onAjouterAstre, onAjouterZone, onAjouterElement }: { onAjouterAstre?: () => void; onAjouterZone?: () => void; onAjouterElement?: () => void }) {
  const { peutEcrire, interieur, ancrer } = useEdition();
  const perdue = useConnexionPerdue();
  const [rayon, setRayon] = useState(false);
  if (!peutEcrire) return null;
  const entrees: EntreeMenu[] = [
    ...(interieur.etat === 'tire' ? [{ libelle: 'Ancrer ce système', icone: Anchor, onChoisir: () => void ancrer() }] : []),
    { libelle: 'Ajouter un astre…', icone: Plus, impossible: !onAjouterAstre, onChoisir: () => onAjouterAstre?.() },
    { libelle: 'Ajouter une zone…', icone: Plus, impossible: !onAjouterZone, onChoisir: () => onAjouterZone?.() },
    { libelle: 'Ajouter un élément…', icone: Plus, impossible: !onAjouterElement, onChoisir: () => onAjouterElement?.() },
    { separateur: true },
    { libelle: 'Rayon de transition…', icone: CircleDashed, onChoisir: () => setRayon(true) },
  ];
  return (
    <>
      <Menu etiquette="Système" declencheur={<>Système <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" /></>} varianteDeclencheur="mj" aligne="debut" entrees={entrees} desactive={perdue} />
      {rayon && <DialogueRayon onFermer={() => setRayon(false)} />}
    </>
  );
}
