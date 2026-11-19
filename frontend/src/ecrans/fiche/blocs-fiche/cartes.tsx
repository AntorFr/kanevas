import { Lock, Map as IconeCarte } from 'lucide-react';

import { LigneRelation, Pastille } from '../../../ui';
import { adresseCarte, FORMES, type Carte } from '../../cartes/commun';
import { CadreBlocFiche } from '../bloc-fiche';
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
  return (
    <CadreBlocFiche titre="Cartes" icone={IconeCarte} chargement={etat.k === 'chargement'} erreur={etat.k === 'erreur'} recharger={recharger}
      erreurTexte="Impossible de charger les cartes.">
      {etat.k === 'ok' && (
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
      )}
    </CadreBlocFiche>
  );
}

export default { id: 'cartes', types: TYPES, roles: ['mj', 'joueur'], rang: 30, place: 'bas', composant: Cartes } satisfies BlocFiche;
