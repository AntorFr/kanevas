import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import type { Role } from '../../../types';
import { Bouton, Chargement, Panneau } from '../../../ui';
import { adresseCarte, FORMES, type Carte, type PageCartes } from '../../cartes/commun';
import '../../cartes/cartes.css';
import type { Bloc } from '../registre';

const AFFICHEES = 5;

/** The first five maps visible to players, paging past the GM's hidden ones if need be. */
async function chargerVisibles(universId: number): Promise<Carte[]> {
  const visibles: Carte[] = [];
  let curseur: string | null = null;
  do {
    const q: string = curseur === null ? '' : `?curseur=${encodeURIComponent(curseur)}`;
    const p: PageCartes = await lire<PageCartes>(`/api/univers/${universId}/cartes${q}`);
    // The list gives the GM `visible`; for a player it is absent and every map listed is visible.
    visibles.push(...p.cartes.filter((c) => c.visible !== false));
    curseur = p.suivant;
  } while (visibles.length < AFFICHEES && curseur !== null);
  return visibles.slice(0, AFFICHEES);
}

/** E-3 block « Cartes visibles »: what the table sees, for every role; a player with none gets no block. */
function CartesVisibles({ universId, role }: { universId: number; role: Role }) {
  const [etat, setEtat] = useState<{ etat: 'chargement' } | { etat: 'erreur' } | { etat: 'ok'; cartes: Carte[] }>({
    etat: 'chargement',
  });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setEtat({ etat: 'chargement' });
    chargerVisibles(universId).then(
      (cartes) => actif && setEtat({ etat: 'ok', cartes }),
      () => actif && setEtat({ etat: 'erreur' }),
    );
    return () => {
      actif = false;
    };
  }, [universId, essai]);

  if (etat.etat === 'ok' && etat.cartes.length === 0 && role !== 'mj') return null;
  return (
    <Panneau titre="Cartes visibles">
      {etat.etat === 'chargement' && <Chargement />}
      {etat.etat === 'erreur' && (
        <div className="etat">
          <p role="alert">Impossible de charger les cartes.</p>
          <Bouton onClick={() => setEssai((n) => n + 1)}>Réessayer</Bouton>
        </div>
      )}
      {etat.etat === 'ok' && (
        <>
          {etat.cartes.length === 0 ? (
            <div className="etat">
              <p>Aucune carte visible des joueurs.</p>
            </div>
          ) : (
            <ul className="bloc-cartes">
              {etat.cartes.map((c) => (
                <li key={c.id}>
                  <Link to={adresseCarte(universId, c.id)} title={c.titre}>
                    {c.titre}
                  </Link>
                  <small>{FORMES[c.forme]}</small>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/univers/${universId}/cartes`}>Toutes</Link>
        </>
      )}
    </Panneau>
  );
}

export default { id: 'cartes-visibles', roles: ['mj', 'joueur'], rang: 40, composant: CartesVisibles } satisfies Bloc;
