import { Orbit } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CadreBlocFiche } from './bloc-fiche';
import './blocs-outils.css';
import type { BlocOutil } from './types';

/**
 * E-9 blocks a tool adds to the sheet (AD-liens-3), e.g. « Sur la carte spatiale »: a list of links per block, in the frame
 * of the other sheet blocks (no « MJ seul » header: every reader sees what the server computed for them). They ride with
 * the sheet read, so they have no state of their own, no count and no empty heading. Not « Sur la carte » of the
 * illustrated maps (E-11): the title and the region label tell them apart.
 */
export function BlocsOutils({ blocs }: { blocs: BlocOutil[] }) {
  if (blocs.length === 0) return null;
  return (
    <>
      {blocs.map((bloc) => (
        <CadreBlocFiche key={bloc.cle} titre={bloc.titre} icone={Orbit} chargement={false} erreur={false} recharger={() => undefined}>
          <ul className="lignes-bloc-outil">
            {bloc.lignes.map((l) => (
              <li key={l.adresse + l.texte}>
                <Link className="cible" to={l.adresse}>{l.texte}</Link>
              </li>
            ))}
          </ul>
        </CadreBlocFiche>
      ))}
    </>
  );
}
