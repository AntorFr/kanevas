import { ArrowRight, Map, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import type { Role } from '../../../types';
import { Alerte, Bouton } from '../../../ui';
import { BlocVue, VideBloc } from '../../suivi/blocs-commun';
import { Vignette } from '../../cartes/vignette';
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
    <BlocVue
      titre="Cartes visibles"
      donnee="cartes"
      lien={
        etat.etat === 'ok' ? (
          <Link className="lien-action" to={`/univers/${universId}/cartes`}>
            <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
            Toutes
          </Link>
        ) : undefined
      }
    >
      {etat.etat === 'chargement' && (
        <div className="charge-bloc" role="status">
          <div className="cartes">
            <div className="os-carte">
              <span className="squelette" />
            </div>
          </div>
          <p>Chargement…</p>
        </div>
      )}
      {etat.etat === 'erreur' && (
        <Alerte
          action={
            <Bouton petit icone={RotateCcw} onClick={() => setEssai((n) => n + 1)}>
              Réessayer
            </Bouton>
          }
        >
          Impossible de charger les cartes.
        </Alerte>
      )}
      {etat.etat === 'ok' &&
        (etat.cartes.length === 0 ? (
          <VideBloc>Aucune carte visible des joueurs.</VideBloc>
        ) : (
          <ul className="cartes">
            {etat.cartes.map((c) => (
              <li key={c.id}>
                <Link className="carte-ve" to={adresseCarte(universId, c.id)} title={c.titre}>
                  <Vignette universId={universId} carte={c} classe="apercu" />
                  <span className="lib-carte">
                    <Map size={14} strokeWidth={1.75} aria-hidden="true" />
                    <b>{c.titre}</b>
                    <small>{FORMES[c.forme]}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </BlocVue>
  );
}

export default { id: 'cartes-visibles', roles: ['mj', 'joueur'], rang: 40, composant: CartesVisibles } satisfies Bloc;
