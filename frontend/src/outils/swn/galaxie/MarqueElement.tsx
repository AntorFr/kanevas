import { Building2, CircleDot, DoorOpen, Landmark, Lock, RadioTower, Rocket, Satellite, Skull, type LucideIcon } from 'lucide-react';

import { COULEURS, couleurServeur } from './ecriture';

/** The icons of the server's list (`ICONES_ELEMENT`), by name; a name this screen does not know draws the generic one. */
const ICONES: Record<string, { Icone: LucideIcon; libelle: string }> = {
  vaisseau: { Icone: Rocket, libelle: 'Vaisseau' },
  ville: { Icone: Building2, libelle: 'Ville' },
  station: { Icone: Satellite, libelle: 'Station' },
  base: { Icone: Landmark, libelle: 'Base' },
  autre: { Icone: CircleDot, libelle: 'Autre' },
  epave: { Icone: Skull, libelle: 'Épave' },
  balise: { Icone: RadioTower, libelle: 'Balise' },
  portail: { Icone: DoorOpen, libelle: 'Portail' },
};
export const libelleIcone = (nom: string): string => ICONES[nom]?.libelle ?? nom;
export const libelleCouleur = (nom: string): string => COULEURS.find((c) => c.nom === nom)?.libelle ?? nom;

/** The icon of a kind, drawn in the colour of its ring (`currentColor`). */
export function IconeElement({ icone, taille = 14 }: { icone: string; taille?: number }) {
  const { Icone } = ICONES[icone] ?? ICONES.autre!;
  return <Icone size={taille} strokeWidth={1.75} aria-hidden="true" />;
}

/**
 * The element mark (E-23): the icon of its kind on a 2 px ring, in a colour token of its own (light and dark). An element
 * « Réservé au MJ » has a dashed ring and a small lock — never colour alone. The hit target is 28 px, a native button
 * (focus ring, Enter and Space open the panel). Nothing here animates: an element on a body does not turn.
 */
export function MarqueElement({ cle, x, y, icone, couleur, reserve, choisi, libelle, onChoisir }: {
  cle: string; x: number; y: number; icone: string; couleur: string; reserve: boolean; choisi: boolean; libelle: string; onChoisir: () => void;
}) {
  return (
    <button
      type="button"
      className={`cs-element${reserve ? ' reserve' : ''}${choisi ? ' choisi' : ''}`}
      data-cle={cle}
      data-couleur={couleurServeur(couleur)}
      aria-pressed={choisi}
      aria-label={libelle}
      style={{ left: x, top: y }}
      onClick={onChoisir}
    >
      <IconeElement icone={icone} />
      {reserve && <Lock className="cs-cadenas" size={9} strokeWidth={2.25} aria-hidden="true" />}
    </button>
  );
}
