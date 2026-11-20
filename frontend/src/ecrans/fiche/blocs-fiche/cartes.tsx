import { Lock, Map as IconeCarte } from 'lucide-react';

import { BlocSection as BlocUi, Chargement, ErreurChargement, LigneRelation, Pastille } from '../../../ui';
import { adresseCarte, FORMES, type Carte } from '../../cartes/commun';
import type { BlocFiche, PropsBlocFiche } from '../registre-blocs-fiche';
import { useBlocFiche } from './charge';

/** Every sheet type can carry maps (AD-142): the block lists the ones attached to this sheet that the reader reads. */
const TYPES = [
  'personnage', 'lieu', 'faction', 'famille', 'objet', 'evenement', 'quete', 'creature', 'race', 'vaisseau',
  'savoir', 'recit', 'regle', 'note', 'aventure', 'compte_rendu',
];

/** E-9 block « Cartes »: absent when this reader has none to read, and never a count of hidden ones. */
function Cartes({ universId, fiche, suffixeMode }: PropsBlocFiche) {
  const [etat, , recharger] = useBlocFiche<{ cartes: Carte[] }>(`/api/univers/${universId}/fiches/${fiche.id}/cartes${suffixeMode}`);
  if (etat.k === 'ok' && etat.valeur.cartes.length === 0) return null;
  if (etat.k === 'chargement') return <Chargement texte="Chargement des cartes…" />;
  if (etat.k === 'erreur') return <ErreurChargement texte="Impossible de charger les cartes." onReessayer={recharger} />;
  return (
    <div className="blocs-cartes">
      <BlocUi libelle="Cartes" icone={IconeCarte}>
        <ul className="liste-cartes-fiche">
          {etat.valeur.cartes.map((c) => (
            <li key={c.id}>
              <LigneRelation
                sansFleche
                lien=""
                icone={IconeCarte}
                cible={c.titre}
                type={FORMES[c.forme]}
                vers={adresseCarte(universId, c.id)}
                actions={c.visible === false ? <Pastille sens="mj" icone={Lock}>Cachée aux joueurs</Pastille> : undefined}
              />
            </li>
          ))}
        </ul>
      </BlocUi>
    </div>
  );
}

export default { id: 'cartes', types: TYPES, roles: ['mj', 'joueur'], rang: 30, place: 'bas', composant: Cartes } satisfies BlocFiche;
